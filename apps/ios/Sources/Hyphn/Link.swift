// The iPhone end of the link (specs `Core - Appairage QR`, `Core - Reconnexion`).
// - Pairing: QR → TLS pinned on the QR fingerprint → PairRequest → code →
//   « Oui, relier » → PairDone → the same connection becomes the session.
// - Reconnection, app in the foreground only: last IP/port and Bonjour at the
//   same time, the first that answers wins; closed in the background (RULES, Énergie 2).
// - Cable (spec `Core - Liaison par cable`): the PC opens connections to
//   Cable.swift through usbmux; a cable session replaces the Wi-Fi one and
//   stops the Wi-Fi search; unplugged, the Wi-Fi reconnection starts at once.

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
    /// The last link events, newest first, shown in Réglages: to find the
    /// cuts Evan sees when a device goes to sleep.
    @Published private(set) var journal: [String] = []
    /// The session runs through the USB cable (E9).
    @Published private(set) var viaCable = false

    func log(_ what: String) {
        let f = DateFormatter()
        f.dateFormat = "HH:mm:ss"
        journal.insert("\(f.string(from: Date()))  \(what)", at: 0)
        if journal.count > 40 { journal.removeLast() }
    }

    let identity = DeviceIdentity.shared
    let info = DeviceInfo()
    weak var camera: Camera?

    private var session: PinnedConnection?
    private var attempts: [PinnedConnection] = []
    /// The QR offer, or nil when pairing by cable (no address known yet).
    private var pairing: (conn: PinnedConnection, offer: PairOffer?)?
    private let cable = CableListener()
    /// Cam and Drop connections asked to the PC by cable, oldest first (E7).
    private var cableWaiters: [PinnedConnection] = []
    private var browser: NWBrowser?
    private var giveUp: Task<Void, Never>?
    private var retry: Task<Void, Never>?
    private var backgroundTask: UIBackgroundTaskIdentifier = .invalid
    private var pairTimeout: Task<Void, Never>?
    private var prime: NWBrowser?
    private var foreground = false
    /// Last message from the PC on the session (it sends a Ping every 5 s).
    private var lastHeard = Date()
    private var watchdog: Task<Void, Never>?

    init() {
        phase = pc == nil ? .unpaired : .searching
        info.onChange = { [weak self] s in self?.send(.deviceStatus(s)) }
        cable.pinned = pc?.fingerprint
        cable.onConnection = { [weak self] c in self?.cableArrived(c) }
        cable.onLog = { [weak self] what in self?.log(what) }
    }

    var pcName: String { pc?.name ?? "PC" }

    // MARK: Foreground / background

    func enterForeground() {
        foreground = true
        endBackgroundTask()
        info.start()
        if let identity { cable.start(identity: identity) }
        log("Hyphn au premier plan")
        if session != nil {
            // The PC pings every 5 s: quiet for longer, the link died while
            // away (sleep, Wi-Fi): start again now, not after the watchdog.
            if Date().timeIntervalSince(lastHeard) > 7 {
                log("Liaison muette au retour : reconnexion")
                reconnectNow()
                return
            }
            // Still linked (short trip to another app): just refresh the status.
            send(.deviceStatus(info.current(withStorage: true)))
        } else if pc != nil {
            reconnect()
        }
    }

    /// Another app in front: the link stays (ADR-0023). iOS stops the camera,
    /// so the PC shows the waiting screen; iOS lets us run ~30 s, then the
    /// link closes cleanly before the app is suspended.
    func enterBackground() {
        foreground = false
        log("Hyphn en arrière-plan")
        info.stop()
        stopSearch()
        retry?.cancel()
        cancelPairing()
        camera?.stopStreaming()
        guard session != nil else {
            cable.stop()
            if pc != nil { phase = .offline("") }
            return
        }
        backgroundTask = UIApplication.shared.beginBackgroundTask(withName: "hyphn-link") { [weak self] in
            Task { @MainActor in self?.backgroundExpired() }
        }
    }

    private func backgroundExpired() {
        if !foreground {
            log("Arrière-plan trop long : liaison fermée")
            session?.close()
            session = nil
            viaCable = false
            cable.stop()
            if pc != nil { phase = .offline("") }
        }
        endBackgroundTask()
    }

    private func endBackgroundTask() {
        if backgroundTask != .invalid {
            UIApplication.shared.endBackgroundTask(backgroundTask)
            backgroundTask = .invalid
        }
    }

    /// « Reconnecter »: everything from scratch, at once.
    func reconnectNow() {
        retry?.cancel()
        let old = session
        session = nil
        viaCable = false
        old?.close()
        camera?.stopStreaming()
        stopSearch()
        reconnect()
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
        watchPairing(c, offer: offer)
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

    private func watchPairing(_ c: PinnedConnection, offer: PairOffer?) {
        c.onMessage = { [weak self] m in self?.onPairMessage(m, c, offer) }
        c.onClose = { [weak self] failure in
            guard let self, self.pairing?.conn === c else { return }
            self.pairing = nil
            switch self.pairStep {
            case .linked: break
            default:
                // Unplugged before the code (cable): back to the scan, quietly.
                if c.viaCable, case .connecting = self.pairStep {
                    self.pairStep = .idle
                } else {
                    self.pairStep = .failed(Self.text(for: failure, pairing: true))
                }
            }
        }
    }

    private func onPairMessage(_ m: Msg, _ c: PinnedConnection, _ offer: PairOffer?) {
        switch m {
        case let .pairPending(pcName):
            pairTimeout?.cancel()
            guard let identity, let pcFingerprint = c.peerFingerprint else { return }
            pairStep = .code(code: pairingCode(pcFingerprint, identity.fingerprint), pcName: pcName)
        case .pairDone:
            guard case let .code(_, name) = pairStepBeforeConfirm ?? pairStep, let pcFingerprint = c.peerFingerprint else { return }
            stopPriming()
            // By cable the PC address is learnt from its first Wi-Fi session.
            let paired = PairedPC(name: name, fingerprint: pcFingerprint, host: offer?.host ?? "", port: offer?.port ?? 47800, pairedAt: Date())
            paired.save()
            pc = paired
            cable.pinned = pcFingerprint
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
        retry?.cancel()
        stopSearch()
        phase = .searching
        log("Recherche du PC…")
        // E3: the last known address (none yet after a pairing by cable)...
        if !pc.host.isEmpty {
            tryConnect(PinnedConnection(host: pc.host, port: pc.port, pinned: pc.fingerprint, identity: identity))
        }
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
            self.log("PC introuvable en 10 s, nouvel essai dans 5 s")
            self.phase = .offline("PC introuvable. Vérifie que Hyphn est ouvert sur le PC et que les deux sont sur le même Wi-Fi.")
            self.scheduleRetry()
        }
    }

    /// While the app is open, try again every 5 s (ADR-0023): the PC may
    /// just have restarted or the Wi-Fi come back.
    private func scheduleRetry() {
        retry?.cancel()
        retry = Task { [weak self] in
            try? await Task.sleep(for: .seconds(5))
            guard !Task.isCancelled, let self, self.foreground, self.session == nil, self.pc != nil else { return }
            self.reconnect()
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
            guard self.canTake(c) else { c.close(); return }
            c.send(.hello(deviceName: UIDevice.current.name, model: DeviceInfo.model, appVersion: DeviceInfo.appVersion))
        }
        c.onMessage = { [weak self] m in
            guard let self else { return }
            switch m {
            case .welcome:
                guard self.canTake(c) else { c.close(); return }
                self.adopt(c)
            case let .refused(reason, message):
                c.close()
                if reason == .unknownDevice {
                    // The PC forgot this iPhone (E10): forget it too.
                    self.forgetLocally(notice: message)
                } else if self.session == nil {
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

    /// A new connection may become the session: none yet, or a cable one
    /// replacing the Wi-Fi (spec `Core - Liaison par cable`, E6).
    private func canTake(_ c: PinnedConnection) -> Bool {
        guard let s = session else { return true }
        return c.viaCable && !s.viaCable
    }

    // MARK: Cable

    /// The PC opened a connection through the cable.
    private func cableArrived(_ nw: NWConnection) {
        // A Cam or Drop request waits for it (E7).
        if let i = cableWaiters.firstIndex(where: { $0.waiting }) {
            cableWaiters.remove(at: i).attach(nw)
            return
        }
        cableWaiters.removeAll { !$0.waiting }
        if session?.viaCable == true || !foreground {
            nw.cancel()
            return
        }
        let c = PinnedConnection(cable: nw)
        if pc != nil {
            log("Câble : PC trouvé")
            tryConnect(c)
            return
        }
        // Not paired (E5): the cable replaces the QR, the code and « Oui »
        // stay. From the welcome or the scan screen: RootView opens the scan
        // screen, where the code is shown.
        guard pairing == nil, case .idle = pairStep else {
            log("Câble : PC refusé (appairage déjà en cours)")
            nw.cancel()
            return
        }
        log("Câble : PC trouvé, appairage")
        pairing = (c, nil)
        pairStep = .connecting(host: Self.cableHost, secured: false)
        c.onReady = { [weak self] in
            if case .connecting = self?.pairStep { self?.pairStep = .connecting(host: Self.cableHost, secured: true) }
            c.send(.pairRequest(token: Data(), deviceName: UIDevice.current.name, model: DeviceInfo.model, appVersion: DeviceInfo.appVersion))
        }
        watchPairing(c, offer: nil)
        c.start()
    }

    /// Shown instead of an address while pairing by cable.
    static let cableHost = "câble USB"

    /// Cam or Drop by cable: asks the PC for a connection, given to this one
    /// when it comes; none in 5 s → failed like a refused Wi-Fi connection.
    private func cableRequest() -> PinnedConnection {
        let c = PinnedConnection(cable: nil)
        cableWaiters.append(c)
        send(.cableOpen)
        Task { [weak self] in
            try? await Task.sleep(for: .seconds(5))
            guard let self, c.waiting else { return }
            self.cableWaiters.removeAll { $0 === c }
            c.giveUpWaiting()
        }
        return c
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
        // « Relier un autre PC »: the new PC replaces the old one. A cable
        // session replaces the Wi-Fi one: the video moves to the cable too.
        let movesToCable = c.viaCable && session.map { !$0.viaCable } == true
        if let old = session, old !== c { old.close() }
        session = c
        if movesToCable { camera?.reopenMedia() }
        if !attempts.contains(where: { $0 === c }) { attempts.append(c) }
        c.onMessage = { [weak self] m in self?.handle(m) }
        c.onClose = { [weak self] failure in self?.sessionClosed(c, failure) }
        log(c.viaCable ? "Relié à \(pcName) par câble" : "Relié à \(pcName) en Wi-Fi")
        watch(c)
        stopSearch()
        phase = .online
        viaCable = c.viaCable
        // E5: keep the address that answered (Bonjour may have found a new one).
        if let (host, port) = c.remote { rememberAddress(host: host, port: port) }
        send(.deviceStatus(info.current(withStorage: true)))
        if let camera { send(.camState(camera.state)) }
    }

    /// A PC that quits or loses the Wi-Fi without closing the socket leaves a
    /// dead session that only a write would reveal: no Ping for 15 s → closed,
    /// so the reconnection starts at once instead of a minute later.
    private func watch(_ c: PinnedConnection) {
        lastHeard = Date()
        watchdog?.cancel()
        watchdog = Task { [weak self] in
            while !Task.isCancelled {
                try? await Task.sleep(for: .seconds(5))
                guard let self, self.session === c else { return }
                if Date().timeIntervalSince(self.lastHeard) > 15 {
                    self.log("Rien reçu du PC depuis 15 s : liaison fermée")
                    c.close()
                    return
                }
            }
        }
    }

    private func sessionClosed(_ c: PinnedConnection, _ failure: PinnedConnection.Failure? = nil) {
        attempts.removeAll { $0 === c }
        guard session === c else { return }
        switch failure {
        case let .network(e): log("Liaison coupée (\(e))")
        case .closed: log("Liaison fermée par le PC")
        default: log("Liaison fermée")
        }
        session = nil
        viaCable = false
        if c.viaCable { log("Câble débranché : retour au Wi-Fi") }
        camera?.stopStreaming()
        if foreground, pc != nil {
            phase = .offline("Connexion perdue.")
            reconnect()
        }
    }

    private func handle(_ m: Msg) {
        lastHeard = Date()
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
        retry?.cancel()
        stopSearch()
        session = nil
        viaCable = false
        camera?.stopStreaming()
        PairedPC.forget()
        pc = nil
        cable.pinned = nil
        phase = .unpaired
        self.notice = notice
    }

    // MARK: Media

    /// A second connection for the video (spec `Cam - Flux v1`, E3).
    func openMedia() -> PinnedConnection? {
        guard let pc, let identity, let s = session else { return nil }
        let c = s.viaCable
            ? cableRequest()
            : PinnedConnection(host: pc.host, port: pc.port, pinned: pc.fingerprint, identity: identity, serviceClass: .interactiveVideo)
        c.onReady = { c.send(.videoHello) }
        c.start()
        return c
    }

    /// A Drop connection (spec `Drop - Photos vers le PC`, E3): same pinned
    /// TLS as the session, opened for one send and closed after it. Not
    /// started: the caller sets its callbacks first.
    func openDrop() -> PinnedConnection? {
        guard let pc, let identity, let s = session else { return nil }
        if s.viaCable { return cableRequest() }
        return PinnedConnection(host: pc.host, port: pc.port, pinned: pc.fingerprint, identity: identity, serviceClass: .bestEffort)
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
        case .wrongFingerprint: return "Ce QR ne vient pas de ce PC. Scanne celui affiché par Hyphn sur ton PC."
        case .localNetworkDenied: return "Autorise le réseau local dans Settings › Hyphn › Local Network, sinon le PC reste invisible."
        case .network, .none, .closed:
            return pairing
                ? "Je n’arrive pas à joindre ton PC. Vérifie que l’iPhone et le PC sont sur le même Wi-Fi."
                : "Connexion perdue."
        }
    }
}

