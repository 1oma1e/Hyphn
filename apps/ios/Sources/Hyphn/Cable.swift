// The USB cable (spec `Core - Liaison par cable`, ADR-0031). The PC reaches
// this port through Apple's usbmux. It listens on 127.0.0.1 only: nothing is
// open on the Wi-Fi and iOS asks for no Local Network access. The PC opens
// every connection, so here the iPhone is the TLS server; certificates and
// pinning are the same as on the Wi-Fi.

import Foundation
import Network
import Security

final class CableListener {
    static let port: UInt16 = 47801

    /// Who may connect: the paired PC, or any PC while not paired (pairing by
    /// cable, E5, still confirmed by the code and « Oui » on this iPhone).
    /// Read by the TLS verify block on the listener's queue.
    private final class Pin {
        private let lock = NSLock()
        private var value: Data?
        var fingerprint: Data? {
            get { lock.withLock { value } }
            set { lock.withLock { value = newValue } }
        }
    }

    private let pin = Pin()
    private var listener: NWListener?
    private let queue = DispatchQueue(label: "hyphn.cable")
    /// A connection from the PC, before its TLS handshake. Main queue.
    var onConnection: ((NWConnection) -> Void)?

    var pinned: Data? {
        get { pin.fingerprint }
        set { pin.fingerprint = newValue }
    }

    func start(identity: DeviceIdentity) {
        guard listener == nil else { return }
        let tls = NWProtocolTLS.Options()
        let sec = tls.securityProtocolOptions
        sec_protocol_options_set_min_tls_protocol_version(sec, .TLSv13)
        if let local = sec_identity_create(identity.identity) {
            sec_protocol_options_set_local_identity(sec, local)
        }
        // The PC must show its certificate, as the iPhone does on the Wi-Fi.
        sec_protocol_options_set_peer_authentication_required(sec, true)
        let pin = self.pin
        sec_protocol_options_set_verify_block(sec, { _, trust, complete in
            guard let leaf = PinnedConnection.leafFingerprint(trust) else { complete(false); return }
            complete(pin.fingerprint.map { $0 == leaf } ?? true)
        }, queue)
        let tcp = NWProtocolTCP.Options()
        tcp.noDelay = true
        let p = NWParameters(tls: tls, tcp: tcp)
        p.requiredInterfaceType = .loopback
        p.allowLocalEndpointReuse = true
        guard let port = NWEndpoint.Port(rawValue: Self.port), let l = try? NWListener(using: p, on: port) else { return }
        l.newConnectionHandler = { [weak self] c in
            DispatchQueue.main.async {
                if let take = self?.onConnection { take(c) } else { c.cancel() }
            }
        }
        l.stateUpdateHandler = { [weak self, weak l] state in
            guard case .failed = state else { return }
            DispatchQueue.main.async {
                guard let self, self.listener === l else { return }
                self.listener?.cancel()
                self.listener = nil
            }
        }
        l.start(queue: queue)
        listener = l
    }

    func stop() {
        listener?.cancel()
        listener = nil
    }
}
