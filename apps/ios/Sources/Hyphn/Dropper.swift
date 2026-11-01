// Drop v1 (spec `Drop - Photos vers le PC`): the photos and videos chosen in
// the picker go to the PC as their original files, one after the other, each
// checked by its SHA-256 (E2, E5). One connection per send; the app stays open
// (E3). Files are read in 1 MB blocks, never whole in memory (E10).

import CryptoKit
import Foundation
import Photos
import UIKit

@MainActor
final class Dropper: ObservableObject {
    enum Phase: Equatable {
        case idle
        case preparing
        case sending
        case done(items: Int, bytes: Int64, failed: Int)
        case failed(String)
    }

    @Published private(set) var phase: Phase = .idle
    @Published private(set) var items = 0
    @Published private(set) var itemsDone = 0
    @Published private(set) var bytes: Int64 = 0
    @Published private(set) var bytesDone: Int64 = 0
    /// Name of the file going now.
    @Published private(set) var current = ""
    /// iCloud download of the current original, 0...1; nil when it is on the iPhone.
    @Published private(set) var cloud: Double?
    /// Bytes a second, averaged over the last 5 s.
    @Published private(set) var rate: Double = 0
    /// Photos access refused: the view offers Settings.
    @Published private(set) var needsAccess = false

    weak var link: PCLink?

    private enum Event { case ready, msg(Msg), closed }
    private enum Outcome { case sent, skipped, stop(String) }

    private var conn: PinnedConnection?
    private var inbox: [Event] = []
    private var waiter: CheckedContinuation<Event, Never>?
    private var peerCancelled = false
    private var timer: Timer?
    private var samples: [Int64] = []
    private var lastBytes: Int64 = 0
    private let readQueue = DispatchQueue(label: "hyphn.drop.read")

    private static let chunk = 1 << 20
    /// Bytes allowed to wait in the socket before reading more.
    private static let backlog = 8 << 20
    private static let lostText = "Liaison perdue : relance l’envoi."

    var sending: Bool { phase == .preparing || phase == .sending }

    /// `ids`: local identifiers from the picker, in its order.
    func send(_ ids: [String]) {
        guard !sending, !ids.isEmpty else { return }
        Task { await run(ids) }
    }

    func cancel() {
        guard sending else { return }
        conn?.sendAndClose(.dropCancel)
        conn = nil
        finish(.failed("Envoi annulé."))
    }

    /// Hyphn left the foreground: iOS cuts the connection soon anyway (E3).
    func stopForBackground() {
        guard sending else { return }
        finish(.failed("Envoi arrêté : Hyphn est passé en arrière-plan. Relance-le en gardant Hyphn ouvert."))
    }

    /// Back to « Choisir dans Photos ».
    func reset() {
        if !sending { phase = .idle }
    }

    // MARK: The send

    private func run(_ ids: [String]) async {
        phase = .preparing
        needsAccess = false
        (items, itemsDone, bytes, bytesDone, current, cloud, rate) = (ids.count, 0, 0, 0, "", nil, 0)
        // E1: access asked now, when Evan has chosen.
        let status = await PHPhotoLibrary.requestAuthorization(for: .readWrite)
        guard status == .authorized || status == .limited else {
            needsAccess = true
            return finish(.failed("Hyphn a besoin de tes photos pour les envoyer."))
        }
        let found = PHAsset.fetchAssets(withLocalIdentifiers: ids, options: nil)
        var byId: [String: PHAsset] = [:]
        found.enumerateObjects { a, _, _ in byId[a.localIdentifier] = a }
        let plan = ids.compactMap { byId[$0] }.map { ($0, Self.resources(of: $0)) }
        // Limited access: the ones Hyphn cannot see are not sent.
        var failed = ids.count - plan.count
        items = plan.count
        bytes = plan.reduce(0) { sum, p in sum + p.1.reduce(0) { $0 + Self.size(of: $1) } }
        let files = plan.reduce(0) { $0 + $1.1.count }

        guard let c = link?.openDrop() else { return finish(.failed("Le PC n’est pas joignable : ouvre Hyphn sur le PC.")) }
        conn = c
        c.onReady = { [weak self] in
            c.send(.dropHello)
            self?.post(.ready)
        }
        c.onMessage = { [weak self] m in self?.post(.msg(m)) }
        c.onClose = { [weak self] _ in self?.post(.closed) }
        c.start()
        guard case .ready = await next() else { return lost() }
        c.send(.dropPlan(items: UInt32(plan.count), files: UInt32(files), bytes: UInt64(bytes)))
        guard case let .msg(.dropAck(ok, reason)) = await next() else { return lost() }
        guard ok else { return finish(.failed(reason)) }

        phase = .sending
        UIApplication.shared.isIdleTimerDisabled = true
        startRate()
        for (asset, res) in plan {
            var itemOk = !res.isEmpty
            for (k, r) in res.enumerated() where itemOk {
                guard sending else { return }
                switch await sendResource(r, of: asset, last: k == res.count - 1) {
                case .sent: break
                case .skipped: itemOk = false
                case let .stop(why): return finish(.failed(why))
                }
            }
            if itemOk { itemsDone += 1 } else { failed += 1 }
        }
        guard sending else { return }
        conn?.sendAndClose(.dropDone(failed: UInt32(failed)))
        conn = nil
        finish(.done(items: itemsDone, bytes: bytesDone, failed: failed))
    }

    /// One original file: exported from Photos (downloaded from iCloud if
    /// needed), streamed, checked by the PC; sent once more if the hash differs.
    private func sendResource(_ r: PHAssetResource, of asset: PHAsset, last: Bool) async -> Outcome {
        current = r.originalFilename
        let url = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: url) }
        guard await export(r, to: url) else { return .skipped }
        cloud = nil
        guard sending else { return .stop(Self.lostText) }
        guard let size = (try? FileManager.default.attributesOfItem(atPath: url.path)[.size] as? NSNumber)?.int64Value else { return .skipped }
        let date = asset.creationDate ?? Date()
        let day = Calendar.current.dateComponents([.year, .month], from: date)
        for attempt in 0..<2 {
            guard let c = conn else { return .stop(Self.lostText) }
            c.send(.dropFile(name: r.originalFilename, size: UInt64(size), takenUnix: Int64(date.timeIntervalSince1970),
                             year: UInt32(day.year ?? 1970), month: UInt32(day.month ?? 1)))
            guard let sha = await stream(url, to: c) else {
                return .stop(peerCancelled ? "Envoi annulé sur le PC." : Self.lostText)
            }
            c.send(.dropEnd(sha256: sha, lastOfItem: last))
            switch await next() {
            case let .msg(.dropAck(ok, reason)):
                if ok { return .sent }
                bytesDone -= size
                // A wrong hash is sent once more; anything else stops the send.
                guard reason.contains("empreinte") else { return .stop(reason) }
                if attempt == 1 { return .skipped }
            case .msg(.dropCancel):
                return .stop("Envoi annulé sur le PC.")
            default:
                return .stop(Self.lostText)
            }
        }
        return .skipped
    }

    /// The file in 1 MB blocks, hashed as it goes. nil if the send stopped.
    private func stream(_ url: URL, to c: PinnedConnection) async -> Data? {
        guard let h = try? FileHandle(forReadingFrom: url) else { return nil }
        defer { try? h.close() }
        var hasher = SHA256()
        while true {
            // Do not read ahead of the Wi-Fi: memory stays small.
            while c.pendingBytes > Self.backlog {
                try? await Task.sleep(for: .milliseconds(5))
                if !sending || peerCancelled { return nil }
            }
            if !sending || peerCancelled { return nil }
            let n = Self.chunk
            let data: Data? = await withCheckedContinuation { k in
                readQueue.async { k.resume(returning: try? h.read(upToCount: n)) }
            }
            guard let data, !data.isEmpty else { break }
            hasher.update(data: data)
            c.send(.dropChunk(data))
            bytesDone += Int64(data.count)
        }
        return Data(hasher.finalize())
    }

    private func export(_ r: PHAssetResource, to url: URL) async -> Bool {
        let o = PHAssetResourceRequestOptions()
        o.isNetworkAccessAllowed = true
        // Called only while the original comes down from iCloud.
        o.progressHandler = { [weak self] p in
            DispatchQueue.main.async { self?.cloud = p < 1 ? p : nil }
        }
        return await withCheckedContinuation { k in
            PHAssetResourceManager.default().writeData(for: r, toFile: url, options: o) { err in
                k.resume(returning: err == nil)
            }
        }
    }

    /// E2: the original photo or video, plus the video of a Live Photo.
    static func resources(of a: PHAsset) -> [PHAssetResource] {
        let all = PHAssetResource.assetResources(for: a)
        let main: PHAssetResourceType = a.mediaType == .video ? .video : .photo
        var out = Array(all.filter { $0.type == main }.prefix(1))
        if out.isEmpty, let first = all.first { out = [first] }
        out += all.filter { $0.type == .pairedVideo }.prefix(1)
        return out
    }

    /// Size known before export, for the plan's total only. Read by key-value
    /// coding: not public API, non vérifié on every iOS; 0 when missing.
    static func size(of r: PHAssetResource) -> Int64 {
        (r.value(forKey: "fileSize") as? NSNumber)?.int64Value ?? 0
    }

    // MARK: Events from the connection

    private func post(_ e: Event) {
        if case .msg(.dropCancel) = e { peerCancelled = true }
        if let w = waiter {
            waiter = nil
            w.resume(returning: e)
        } else {
            inbox.append(e)
        }
    }

    private func next() async -> Event {
        if !inbox.isEmpty { return inbox.removeFirst() }
        return await withCheckedContinuation { waiter = $0 }
    }

    private func lost() {
        finish(.failed(peerCancelled ? "Envoi annulé sur le PC." : Self.lostText))
    }

    private func finish(_ p: Phase) {
        guard sending else { return }
        phase = p
        timer?.invalidate()
        timer = nil
        rate = 0
        current = ""
        cloud = nil
        UIApplication.shared.isIdleTimerDisabled = false
        conn?.close()
        conn = nil
        inbox = []
        peerCancelled = false
        if let w = waiter {
            waiter = nil
            w.resume(returning: .closed)
        }
    }

    private func startRate() {
        samples = []
        lastBytes = bytesDone
        timer = Timer.scheduledTimer(withTimeInterval: 1, repeats: true) { [weak self] _ in
            MainActor.assumeIsolated {
                guard let self else { return }
                self.samples.append(self.bytesDone - self.lastBytes)
                self.lastBytes = self.bytesDone
                if self.samples.count > 5 { self.samples.removeFirst() }
                self.rate = Double(self.samples.reduce(0, +)) / Double(self.samples.count)
            }
        }
    }
}
