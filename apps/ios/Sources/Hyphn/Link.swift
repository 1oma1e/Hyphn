// The iPhone end of the link (specs `Core - Appairage QR`, `Core - Reconnexion`).
// - Pairing: QR → TLS pinned on the QR fingerprint → PairRequest → code →
//   « Oui, relier » → PairDone → the same connection becomes the session.
// - Reconnection, app in the foreground only: last IP/port and Bonjour at the
//   same time, the first that answers wins; closed in the background (RULES, Énergie 2).

import Foundation
import Network
import SwiftUI
import UIKit

@MainActor
final class PCLink: ObservableObject {
    enum Phase: Equatable {
        case unpaired
        case searching
        case online
        case offline(String)
    }

    enum PairStep: Equatable {
        case idle
        /// QR read; `secured` once the TLS tunnel to the PC is up.
        case connecting(host: String, secured: Bool)
        case code(code: String, pcName: String)
        case confirming
        case linked(pcName: String)
        case failed(String)
    }

    @Published private(set) var pc: PairedPC? = PairedPC.load()
    @Published private(set) var phase: Phase = .unpaired
    @Published var pairStep: PairStep = .idle
    /// Message shown once on the welcome screen (e.g. forgotten by the PC).
    @Published var notice: String?
    /// Latest camera settings from the PC.
    @Published private(set) var camControl = CamControl()
    /// The PC asked for the picture while another tab was open.
    @Published var wantsCam = false

    let identity = DeviceIdentity.shared
    let info = DeviceInfo()
    weak var camera: Camera?

    private var session: PinnedConnection?
    private var attempts: [PinnedConnection] = []
    private var pairing: (conn: PinnedConnection, offer: PairOffer)?
    private var browser: NWBrowser?
    private var giveUp: Task<Void, Never>?
    private var pairTimeout: Task<Void, Never>?
    private var prime: NWBrowser?
    private var foreground = false

    init() {
        phase = pc == nil ? .unpaired : .searching
        info.onChange = { [weak self] s in self?.send(.deviceStatus(s)) }
    }

    var pcName: String { pc?.name ?? "PC" }

    // MARK: Foreground / background

    func enterForeground() {
        foreground = true
        info.start()
        if pc != nil { reconnect() }
    }

    func enterBackground() {
        foreground = false
        info.stop()
        stopSearch()
        session?.close()
        session = nil
        cancelPairing()
        camera?.stopStreaming()
        if pc != nil { phase = .offline("") }
    }

    // MARK: Pairing

    /// Opens the scan screen: browsing Bonjour makes iOS ask for the Local
    /// Network now, while Evan aims the camera, not after the scan.
    func primeLocalNetwork() {
        guard prime == nil else { return }
        let b = NWBrowser(for: .bonjour(type: "_hyphn._tcp", domain: nil), using: NWParameters())
        b.start(queue: .main)
        prime = b
    }

    func stopPriming() {
        prime?.cancel()
        prime = nil
    }

    func scanned(_ text: String) {
        guard case .idle = pairStep else { return }
        let offer: PairOffer
        do {
            offer = try PairOffer.parse(text)
        } catch let p as PairOffer.Problem {
            pairStep = .failed(p.message)
            return
        } catch {
            return
        }
        guard let identity else {
            pairStep = .failed("Hyphn n’a pas pu créer son certificat sur cet iPhone.")
            return
        }
        pairStep = .connecting(host: offer.host, secured: false)
        let c = PinnedConnection(host: offer.host, port: offer.port, pinned: offer.fingerprintPrefix, identity: identity)
        pairing = (c, offer)
        c.onReady = { [weak self] in
            if case .connecting = self?.pairStep { self?.pairStep = .connecting(host: offer.host, secured: true) }
            c.send(.pairRequest(token: offer.token, deviceName: UIDevice.current.name, model: DeviceInfo.model, appVersion: DeviceInfo.appVersion))
        }
        c.onMessage = { [weak self] m in self?.onPairMessage(m, c, offer) }
        c.onClose = { [weak self] failure in
            guard let self, self.pairing?.conn === c else { return }
            self.pairing = nil
            switch self.pairStep {
            case .linked: break
            default:
                self.pairStep = .failed(Self.text(for: failure, pairing: true))
            }
        }
        c.start()
        // Never « Connexion au PC… » for long: no code within 10 s → a clear message.
        pairTimeout?.cancel()
        pairTimeout = Task { [weak self] in
            try? await Task.sleep(for: .seconds(10))
            guard !Task.isCancelled, let self, self.pairing?.conn === c, case .connecting = self.pairStep else { return }
            self.pairing = nil
            c.close()
            self.pairStep = .failed("Le PC ne répond pas. Vérifie que Hyphn est ouvert sur le PC et que les deux sont sur le même Wi-Fi.")
        }
    }

    private func onPairMessage(_ m: Msg, _ c: PinnedConnection, _ offer: PairOffer) {
        switch m {
        case let .pairPending(pcName):
            pairTimeout?.cancel()
            guard let identity, let pcFingerprint = c.peerFingerprint else { return }
            pairStep = .code(code: pairingCode(pcFingerprint, identity.fingerprint), pcName: pcName)
        case .pairDone:
            guard case let .code(_, name) = pairStepBeforeConfirm ?? pairStep, let pcFingerprint = c.peerFingerprint else { return }
            stopPriming()
            let paired = PairedPC(name: name, fingerprint: pcFingerprint, host: offer.host, port: offer.port, pairedAt: Date())
            paired.save()
            pc = paired
            pairing = nil
            pairStep = .linked(pcName: name)
            adopt(c)
        case let .refused(_, message):
            pairing = nil
            c.close()
            pairStep = .failed(message.isEmpty ? "Le PC a refusé." : message)
        default:
            break
        }
    }

    private var pairStepBeforeConfirm: PairStep?

    /// « Oui, relier » or « Non » (E6: the only place where the pairing is validated).
    func answer(_ accept: Bool) {
        guard let p = pairing, case .code = pairStep else { return }
        if accept {
            p.conn.send(.pairConfirm(accept: true))
            pairStepBeforeConfirm = pairStep
            pairStep = .confirming
        } else {
            pairing = nil
            p.conn.sendAndClose(.pairConfirm(accept: false))
            pairStep = .idle
        }
    }

    func cancelPairing() {
        pairTimeout?.cancel()
        pairing?.conn.close()
        pairing = nil
        pairStepBeforeConfirm = nil
        if case .linked = pairStep { return }
        pairStep = .idle
    }

    /// End of the « liés » animation.
    func finishPairing() {
        pairStepBeforeConfirm = nil
        pairStep = .idle
    }

    // MARK: Reconnection

    func reconnect() {
        guard foreground, let pc, let identity, session == nil else { return }
        stopSearch()
        phase = .searching
        // E3: the last known address...
        tryConnect(PinnedConnection(host: pc.host, port: pc.port, pinned: pc.fingerprint, identity: identity))
        // ...and Bonjour at the same time (E2).
        let b = NWBrowser(for: .bonjour(type: "_hyphn._tcp", domain: nil), using: NWParameters())
        b.browseResultsChangedHandler = { [weak self] results, _ in
            DispatchQueue.main.async { self?.found(results) }
        }
        b.start(queue: .main)
        browser = b
        // E7: nothing in 10 s → offline, no retry loop.
        giveUp = Task { [weak self] in
            try? await Task.sleep(for: .seconds(10))
            guard !Task.isCancelled, let self, self.session == nil else { return }
            self.stopSearch()
            self.phase = .offline("PC introuvable. Vérifie que Hyphn est ouvert sur le PC et que les deux sont sur le même Wi-Fi.")
        }
    }

    private func found(_ results: Set<NWBrowser.Result>) {
        guard session == nil, let pc, let identity else { return }
        for r in results {
            if case let .service(name, _, _, _) = r.endpoint, name == pc.serviceName {
                tryConnect(PinnedConnection(to: r.endpoint, pinned: pc.fingerprint, identity: identity))
            }
        }
    }

    private func tryConnect(_ c: PinnedConnection) {
        attempts.append(c)
        c.onReady = { [weak self] in
            guard let self else { return }
            guard self.session == nil else { c.close(); return }
            c.send(.hello(deviceName: UIDevice.current.name, model: DeviceInfo.model, appVersion: DeviceInfo.appVersion))
        }
        c.onMessage = { [weak self] m in
            guard let self else { return }
            switch m {
            case .welcome:
                guard self.session == nil else { c.close(); return }
                self.adopt(c)
            case let .refused(reason, message):
                c.close()
                if reason == .unknownDevice {
                    // The PC forgot this iPhone (E10): forget it too.
                    self.forgetLocally(notice: message)
                } else {
                    self.phase = .offline(message)
                }
            default:
                self.handle(m)
            }
        }
        c.onClose = { [weak self] failure in
            guard let self else { return }
            self.attempts.removeAll { $0 === c }
            if failure == .wrongFingerprint, self.session == nil {
                // Spec `Core - Reconnexion`, E4: never accept silently.
                self.stopSearch()
                self.phase = .offline("Ce PC a changé : relie-le à nouveau avec un QR.")
            }
        }
        c.start()
    }

    private func stopSearch() {
        browser?.cancel()
        browser = nil
        giveUp?.cancel()
        giveUp = nil
        for a in attempts where a !== session { a.close() }
        attempts.removeAll { $0 !== session }
    }

    /// This connection is now the control session.
    private func adopt(_ c: PinnedConnection) {
        // « Relier un autre PC »: the new PC replaces the old one.
        if let old = session, old !== c { old.close() }
        session = c
        if !attempts.contains(where: { $0 === c }) { attempts.append(c) }
        c.onMessage = { [weak self] m in self?.handle(m) }
        c.onClose = { [weak self] _ in self?.sessionClosed(c) }
        stopSearch()
        phase = .online
        // E5: keep the address that answered (Bonjour may have found a new one).
        if let (host, port) = c.remote { rememberAddress(host: host, port: port) }
        send(.deviceStatus(info.current(withStorage: true)))
        if let camera { send(.camState(camera.state)) }
    }

    private func sessionClosed(_ c: PinnedConnection) {
        attempts.removeAll { $0 === c }
        guard session === c else { return }
        session = nil
        camera?.stopStreaming()
        if foreground, pc != nil {
            phase = .offline("Connexion perdue.")
            reconnect()
        }
    }

    private func handle(_ m: Msg) {
        switch m {
        case let .ping(id):
            send(.pong(id: id))
        case let .camControl(c):
            camControl = c
            if c.live, camera?.isOpen != true { wantsCam = true }
            camera?.apply(c)
        case .keyRequest:
            camera?.requestKey()
        case .forget:
            session?.close()
            forgetLocally(notice: "\(pcName) a oublié cet iPhone.")
        default:
            break
        }
    }

    func send(_ m: Msg) {
        session?.send(m)
    }

    // MARK: Forget

    /// « Oublier » on the iPhone (E10): tell the PC, then forget it here.
    func forget() {
        if let s = session { s.sendAndClose(.forget) }
        forgetLocally(notice: nil)
    }

    private func forgetLocally(notice: String?) {
        stopSearch()
        session = nil
        camera?.stopStreaming()
        PairedPC.forget()
        pc = nil
        phase = .unpaired
        self.notice = notice
    }

    // MARK: Media

    /// A second connection for the video (spec `Cam - Flux v1`, E3).
    func openMedia() -> PinnedConnection? {
        guard let pc, let identity, session != nil else { return nil }
        let c = PinnedConnection(host: pc.host, port: pc.port, pinned: pc.fingerprint, identity: identity, serviceClass: .interactiveVideo)
        c.onReady = { c.send(.videoHello) }
        c.start()
        return c
    }

    /// Where the session actually connected (the Bonjour address can differ from the QR one).
    private func rememberAddress(host: String, port: UInt16) {
        guard var p = pc, p.host != host || p.port != port else { return }
        p.host = host
        p.port = port
        p.save()
        pc = p
    }

    // MARK: Texts

    static func text(for failure: PinnedConnection.Failure?, pairing: Bool) -> String {
        switch failure {
        case .wrongFingerprint: return "PC introuvable ou faux QR."
        case .localNetworkDenied: return "Autorise le réseau local dans Settings › Hyphn › Local Network, sinon le PC reste invisible."
        case .network, .none, .closed:
            return pairing
                ? "PC trouvé mais injoignable. Vérifie que les deux sont sur le même Wi-Fi."
                : "Connexion perdue."
        }
    }
}

