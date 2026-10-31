// iPhone identity (spec `Core - Appairage QR`, E1): a P-256 key and a
// self-signed certificate made once, kept in the Keychain for good. The
// fingerprint is the SHA-256 of the DER certificate, like on the PC.
// Also keeps the paired PC (E7) in the Keychain.

import CryptoKit
import Foundation
import Security
import SwiftASN1
import X509

enum IdentityError: Error {
    case keychain(OSStatus)
    case key(String)
}

final class DeviceIdentity {
    static let shared: DeviceIdentity? = try? DeviceIdentity.loadOrCreate()

    private static let tag = Data("io.github.1oma1e.hyphn.identity".utf8)
    private static let certAccount = "identity-cert"

    let identity: SecIdentity
    let certDER: Data
    let fingerprint: Data

    private init(identity: SecIdentity, certDER: Data) {
        self.identity = identity
        self.certDER = certDER
        self.fingerprint = Data(SHA256.hash(data: certDER))
    }

    static func loadOrCreate() throws -> DeviceIdentity {
        if let der = Keychain.read(certAccount), let id = findIdentity(certDER: der) {
            return DeviceIdentity(identity: id, certDER: der)
        }
        let der = try create()
        guard let id = findIdentity(certDER: der) else { throw IdentityError.keychain(errSecItemNotFound) }
        return DeviceIdentity(identity: id, certDER: der)
    }

    /// The Keychain builds the identity from a key and a certificate that match.
    private static func findIdentity(certDER: Data) -> SecIdentity? {
        let query: [String: Any] = [
            kSecClass as String: kSecClassIdentity,
            kSecReturnRef as String: true,
            kSecMatchLimit as String: kSecMatchLimitAll,
        ]
        var out: CFTypeRef?
        guard SecItemCopyMatching(query as CFDictionary, &out) == errSecSuccess, let list = out as? [SecIdentity] else {
            return nil
        }
        for id in list {
            var cert: SecCertificate?
            if SecIdentityCopyCertificate(id, &cert) == errSecSuccess, let cert,
               SecCertificateCopyData(cert) as Data == certDER {
                return id
            }
        }
        return nil
    }

    private static func create() throws -> Data {
        let key = P256.Signing.PrivateKey()
        let name = try DistinguishedName { CommonName("Hyphn iPhone") }
        let now = Date()
        let cert = try Certificate(
            version: .v3,
            serialNumber: Certificate.SerialNumber(),
            publicKey: Certificate.PublicKey(key.publicKey),
            notValidBefore: now.addingTimeInterval(-86_400),
            notValidAfter: now.addingTimeInterval(100 * 365 * 86_400),
            issuer: name,
            subject: name,
            signatureAlgorithm: .ecdsaWithSHA256,
            extensions: try Certificate.Extensions {
                Critical(BasicConstraints.notCertificateAuthority)
                SubjectAlternativeNames([.dnsName("hyphn.local")])
            },
            issuerPrivateKey: Certificate.PrivateKey(key)
        )
        var serializer = DER.Serializer()
        try serializer.serialize(cert)
        let der = Data(serializer.serializedBytes)

        let attrs: [String: Any] = [
            kSecAttrKeyType as String: kSecAttrKeyTypeECSECPrimeRandom,
            kSecAttrKeyClass as String: kSecAttrKeyClassPrivate,
            kSecAttrKeySizeInBits as String: 256,
        ]
        var err: Unmanaged<CFError>?
        guard let secKey = SecKeyCreateWithData(key.x963Representation as CFData, attrs as CFDictionary, &err) else {
            throw IdentityError.key(err?.takeRetainedValue().localizedDescription ?? "key")
        }
        guard let secCert = SecCertificateCreateWithData(nil, der as CFData) else { throw IdentityError.key("certificate") }

        SecItemDelete([kSecClass as String: kSecClassKey, kSecAttrApplicationTag as String: tag] as CFDictionary)
        var st = SecItemAdd([
            kSecClass as String: kSecClassKey,
            kSecValueRef as String: secKey,
            kSecAttrApplicationTag as String: tag,
            kSecAttrAccessible as String: kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly,
        ] as CFDictionary, nil)
        guard st == errSecSuccess || st == errSecDuplicateItem else { throw IdentityError.keychain(st) }
        st = SecItemAdd([
            kSecClass as String: kSecClassCertificate,
            kSecValueRef as String: secCert,
            kSecAttrLabel as String: "Hyphn iPhone",
            kSecAttrAccessible as String: kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly,
        ] as CFDictionary, nil)
        guard st == errSecSuccess || st == errSecDuplicateItem else { throw IdentityError.keychain(st) }
        Keychain.write(certAccount, der)
        return der
    }
}

/// Small generic-password store, readable only on this iPhone.
enum Keychain {
    private static let service = "io.github.1oma1e.hyphn"

    static func read(_ account: String) -> Data? {
        let q: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account,
            kSecReturnData as String: true,
        ]
        var out: CFTypeRef?
        return SecItemCopyMatching(q as CFDictionary, &out) == errSecSuccess ? out as? Data : nil
    }

    static func write(_ account: String, _ data: Data) {
        delete(account)
        SecItemAdd([
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account,
            kSecValueData as String: data,
            kSecAttrAccessible as String: kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly,
        ] as CFDictionary, nil)
    }

    static func delete(_ account: String) {
        SecItemDelete([
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account,
        ] as CFDictionary)
    }
}

/// The PC this iPhone is linked to (E7): kept until « Oublier » (E10).
struct PairedPC: Codable, Equatable {
    var name: String
    var fingerprint: Data
    var host: String
    var port: UInt16
    var pairedAt: Date

    private static let account = "paired-pc"

    static func load() -> PairedPC? {
        Keychain.read(account).flatMap { try? JSONDecoder().decode(PairedPC.self, from: $0) }
    }

    func save() {
        if let d = try? JSONEncoder().encode(self) { Keychain.write(Self.account, d) }
    }

    static func forget() {
        Keychain.delete(account)
    }

    /// Bonjour name announced by this PC: « Hyphn- » + 8 hex of the fingerprint.
    var serviceName: String {
        "Hyphn-" + fingerprint.prefix(4).map { String(format: "%02x", $0) }.joined()
    }
}

/// What the QR carries (E2), same format as `PairOffer` on the PC.
struct PairOffer {
    let host: String
    let port: UInt16
    let pcFingerprint: Data
    let token: Data

    enum Problem: Error {
        case notHyphn, malformed, wrongVersion

        var message: String {
            switch self {
            case .notHyphn: "Ce QR code ne vient pas de Hyphn."
            case .malformed: "Ce QR code est abîmé."
            case .wrongVersion: "Versions différentes : mets à jour Hyphn sur le PC et l’iPhone."
            }
        }
    }

    static func parse(_ text: String) throws -> PairOffer {
        let prefix = "hyphn://pair?"
        guard text.hasPrefix(prefix) else { throw Problem.notHyphn }
        var v: String?, h: String?, p: UInt16?, fp: Data?, t: Data?
        for pair in text.dropFirst(prefix.count).split(separator: "&") {
            let kv = pair.split(separator: "=", maxSplits: 1).map(String.init)
            guard kv.count == 2 else { throw Problem.malformed }
            switch kv[0] {
            case "v": v = kv[1]
            case "h": h = kv[1]
            case "p": p = UInt16(kv[1])
            case "fp": fp = base64URL(kv[1])
            case "t": t = base64URL(kv[1])
            default: break
            }
        }
        guard let v else { throw Problem.malformed }
        guard v == String(protocolVersion) else { throw Problem.wrongVersion }
        guard let h, let p, let fp, fp.count == 32, let t, t.count == 16 else { throw Problem.malformed }
        return PairOffer(host: h, port: p, pcFingerprint: fp, token: t)
    }

    private static func base64URL(_ s: String) -> Data? {
        var b = s.replacingOccurrences(of: "-", with: "+").replacingOccurrences(of: "_", with: "/")
        while b.count % 4 != 0 { b += "=" }
        return Data(base64Encoded: b)
    }
}

/// 4 digits from both fingerprints, the same on both sides (E6). Same rule as
/// `pairing_code` on the PC: SHA-256("hyphn-pair-code" + smaller + bigger).
func pairingCode(_ a: Data, _ b: Data) -> String {
    let (first, second) = a.lexicographicallyPrecedes(b) || a == b ? (a, b) : (b, a)
    var h = SHA256()
    h.update(data: Data("hyphn-pair-code".utf8))
    h.update(data: first)
    h.update(data: second)
    let d = Array(h.finalize())
    let n = (UInt32(d[0]) << 24 | UInt32(d[1]) << 16 | UInt32(d[2]) << 8 | UInt32(d[3])) % 10_000
    return String(format: "%04d", n)
}
