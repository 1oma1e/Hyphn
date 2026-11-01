// One TCP + TLS 1.3 connection to the PC, with this iPhone's certificate and
// the PC pinned by fingerprint (spec `Core - Appairage QR`, E4), carrying
// length-prefixed messages (Wire.swift). By cable (Cable.swift) the PC opens
// the connection and the iPhone is the TLS server; everything else is the same.

import CryptoKit
import Foundation
import Network
import Security

final class PinnedConnection {
    enum Failure: Error, Equatable {
        /// The PC certificate is not the expected one.
        case wrongFingerprint
        /// iOS refused the local network (Settings › Hyphn › Local Network).
        case localNetworkDenied
        case network(String)
        case closed
    }

    let queue: DispatchQueue
    /// nil for a cable connection the PC has not opened yet (`attach`).
    private var nw: NWConnection?
    /// Came through the USB cable (ADR-0031).
    let viaCable: Bool
    private var started = false
    /// By cable the PC fingerprint is read after the handshake (the listener
    /// pins it, but serves every connection with one verify block).
    private var handshakePeer: Data?
    /// Set by the TLS verify block, which runs before the connection object exists.
    private final class PinState {
        var failed = false
        var peer: Data?
    }
    private let pinState: PinState
    private var pinFailed: Bool { pinState.failed }
    /// Full SHA-256 of the PC certificate, known once the handshake passed
    /// (the QR only carries its first half).
    var peerFingerprint: Data? { pinState.peer ?? handshakePeer }
    private var finished = false

    /// All callbacks run on the main queue.
    var onReady: (() -> Void)?
    var onMessage: ((Msg) -> Void)?
    var onClose: ((Failure?) -> Void)?

    /// Messages and bytes waiting to leave; the camera encoder adapts to them.
    private(set) var pendingSends = 0
    private let pendingLock = NSLock()
    private var _pendingBytes = 0
    var pendingBytes: Int { pendingLock.withLock { _pendingBytes } }

    /// `serviceClass`: `.interactiveVideo` for the Cam stream, so the Wi-Fi
    /// (WMM) gives its packets priority over background traffic.
    init(to endpoint: NWEndpoint, pinned: Data, identity: DeviceIdentity, serviceClass: NWParameters.ServiceClass = .responsiveData) {
        let tls = NWProtocolTLS.Options()
        let sec = tls.securityProtocolOptions
        sec_protocol_options_set_min_tls_protocol_version(sec, .TLSv13)
        if let local = sec_identity_create(identity.identity) {
            sec_protocol_options_set_local_identity(sec, local)
        }
        let pin = PinState()
        let queue = DispatchQueue(label: "hyphn.net")
        sec_protocol_options_set_verify_block(sec, { _, trust, complete in
            let leaf = PinnedConnection.leafFingerprint(trust)
            // `pinned` is the QR start (12 bytes, ADR-0028) or the full fingerprint kept after pairing.
            let ok = pinned.count >= 12 && leaf.map { $0.prefix(pinned.count) == pinned } == true
            if ok { pin.peer = leaf } else { pin.failed = true }
            complete(ok)
        }, queue)
        self.pinState = pin
        self.queue = queue
        self.viaCable = false
        self.nw = NWConnection(to: endpoint, using: Self.parameters(tls, serviceClass: serviceClass))
    }

    /// A cable connection: the listener's one now (the session), or later
    /// when the PC answers `CableOpen` (Cam, Drop, spec `Core - Liaison par cable` E7).
    init(cable accepted: NWConnection?) {
        self.pinState = PinState()
        self.queue = DispatchQueue(label: "hyphn.net.cable")
        self.viaCable = true
        self.nw = accepted
    }

    /// Still waiting for the PC to open it through the cable.
    var waiting: Bool { nw == nil && !finished }

    /// The connection the PC opened for this request.
    func attach(_ c: NWConnection) {
        guard nw == nil, !finished else { c.cancel(); return }
        nw = c
        if started { begin() }
    }

    /// The PC did not open it in time.
    func giveUpWaiting() {
        if nw == nil { finish(.network("Câble : le PC n’a pas ouvert la connexion.")) }
    }

    convenience init(host: String, port: UInt16, pinned: Data, identity: DeviceIdentity, serviceClass: NWParameters.ServiceClass = .responsiveData) {
        let ep = NWEndpoint.hostPort(host: NWEndpoint.Host(host), port: NWEndpoint.Port(rawValue: port) ?? 47800)
        self.init(to: ep, pinned: pinned, identity: identity, serviceClass: serviceClass)
    }

    private static func parameters(_ tls: NWProtocolTLS.Options, serviceClass: NWParameters.ServiceClass) -> NWParameters {
        let tcp = NWProtocolTCP.Options()
        tcp.noDelay = true
        // A lost Wi-Fi is seen by TCP keepalive, not by app messages (spec `Core - Reconnexion`, E6).
        tcp.enableKeepalive = true
        tcp.keepaliveIdle = 10
        tcp.keepaliveInterval = 5
        tcp.keepaliveCount = 3
        tcp.connectionTimeout = 8
        let p = NWParameters(tls: tls, tcp: tcp)
        p.serviceClass = serviceClass
        // Never over cellular or a VPN: the PC is on this Wi-Fi.
        p.prohibitExpensivePaths = true
        return p
    }

    static func leafFingerprint(_ trust: sec_trust_t) -> Data? {
        let t = sec_trust_copy_ref(trust).takeRetainedValue()
        guard let chain = SecTrustCopyCertificateChain(t) as? [SecCertificate], let leaf = chain.first else { return nil }
        let der = SecCertificateCopyData(leaf) as Data
        return Data(SHA256.hash(data: der))
    }

    /// Address and port of the PC once connected.
    var remote: (String, UInt16)? {
        // By cable the other end is 127.0.0.1: not an address of the PC.
        guard !viaCable, case let .hostPort(host, port) = nw?.currentPath?.remoteEndpoint else { return nil }
        var text: String
        switch host {
        case let .ipv4(a): text = "\(a)"
        case let .ipv6(a): text = "\(a)"
        case let .name(n, _): text = n
        @unknown default: return nil
        }
        // Drop an interface suffix such as « %en0 ».
        if let i = text.firstIndex(of: "%") { text = String(text[..<i]) }
        return (text, port.rawValue)
    }

    func start() {
        started = true
        if nw != nil { begin() }
    }

    private func begin() {
        guard let nw else { return }
        nw.stateUpdateHandler = { [weak self] state in
            guard let self else { return }
            switch state {
            case .ready:
                if self.viaCable, let c = self.nw { self.handshakePeer = Self.peerOf(c) }
                DispatchQueue.main.async { self.onReady?() }
                self.readLength()
            case let .waiting(err):
                if case .localNetworkDenied = self.nw?.currentPath?.unsatisfiedReason {
                    self.finish(.localNetworkDenied)
                } else if self.pinFailed {
                    self.finish(.wrongFingerprint)
                } else if case .tls = err {
                    self.finish(.network(err.localizedDescription))
                } else {
                    // Waiting (e.g. right after « Allow » on the Local Network
                    // prompt): iOS retries slowly on its own, so retry after 1 s.
                    self.queue.asyncAfter(deadline: .now() + 1) { [weak self] in
                        guard let self, !self.finished, case .waiting? = self.nw?.state else { return }
                        self.nw?.restart()
                    }
                }
            case let .failed(err):
                self.finish(self.pinFailed ? .wrongFingerprint : .network(err.localizedDescription))
            case .cancelled:
                self.finish(nil)
            default:
                break
            }
        }
        nw.start(queue: queue)
    }

    /// SHA-256 of the certificate the PC showed in this connection's handshake.
    private static func peerOf(_ nw: NWConnection) -> Data? {
        guard let meta = nw.metadata(definition: NWProtocolTLS.definition) as? NWProtocolTLS.Metadata else { return nil }
        final class Leaf { var der: Data? }
        let leaf = Leaf()
        _ = sec_protocol_metadata_access_peer_certificate_chain(meta.securityProtocolMetadata) { cert in
            if leaf.der == nil { leaf.der = SecCertificateCopyData(sec_certificate_copy_ref(cert).takeRetainedValue()) as Data }
        }
        return leaf.der.map { Data(SHA256.hash(data: $0)) }
    }

    func send(_ m: Msg) {
        // A cable request not opened yet: only video frames can come this
        // early, and the PC asks for a keyframe anyway.
        guard let nw else { return }
        let data = m.framed()
        let n = data.count
        pendingLock.withLock { _pendingBytes += n }
        queue.async {
            self.pendingSends += 1
            nw.send(content: data, completion: .contentProcessed { [weak self] err in
                guard let self else { return }
                self.pendingSends -= 1
                self.pendingLock.withLock { self._pendingBytes -= n }
                if let err { self.finish(.network(err.localizedDescription)) }
            })
        }
    }

    /// Sends, then closes once everything left (used for « Oublier »).
    func sendAndClose(_ m: Msg) {
        guard let nw else { return close() }
        nw.send(content: m.framed(), contentContext: .finalMessage, isComplete: true, completion: .contentProcessed { [weak self] _ in
            self?.close()
        })
    }

    func close() {
        if let nw { nw.cancel() } else { finish(nil) }
    }

    private func finish(_ failure: Failure?) {
        guard !finished else { return }
        finished = true
        nw?.cancel()
        DispatchQueue.main.async {
            self.onClose?(failure)
            // Break the cycles made by callbacks that capture this connection.
            self.onReady = nil
            self.onMessage = nil
            self.onClose = nil
        }
    }

    private func readLength() {
        nw?.receive(minimumIncompleteLength: 4, maximumLength: 4) { [weak self] data, _, done, err in
            guard let self else { return }
            guard let data, data.count == 4, err == nil else {
                self.finish(err.map { .network($0.localizedDescription) } ?? (done ? .closed : .closed))
                return
            }
            let n = Int(data.withUnsafeBytes { $0.loadUnaligned(as: UInt32.self) }.bigEndian)
            guard n <= 16 * 1024 * 1024 else { self.finish(.network("message too big")); return }
            if n == 0 {
                self.deliver(Data())
                self.readLength()
            } else {
                self.readBody(n)
            }
        }
    }

    private func readBody(_ n: Int) {
        nw?.receive(minimumIncompleteLength: n, maximumLength: n) { [weak self] data, _, _, err in
            guard let self else { return }
            guard let data, data.count == n, err == nil else {
                self.finish(err.map { .network($0.localizedDescription) } ?? .closed)
                return
            }
            self.deliver(data)
            self.readLength()
        }
    }

    private func deliver(_ body: Data) {
        guard let m = try? Msg.decode(body) else { return }
        DispatchQueue.main.async { self.onMessage?(m) }
    }
}
