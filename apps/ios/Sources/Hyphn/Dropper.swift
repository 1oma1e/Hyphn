// Drop (spec `Drop - Photos vers le PC`, ADR-0029): photos, an album, files
// or everything new go to the PC as their original files, one after the
// other, each checked by its SHA-256. The PC says first which Photos items it
// lacks, then each file announces its hash: nothing is sent twice (E6). One
// connection per send; the app stays open (E5). Files are read in 1 MB
// blocks, never whole in memory (E12).

import CryptoKit
import Foundation
import Photos
import UIKit

@MainActor
final class Dropper: ObservableObject {
    enum Source {
        case picks([String])
        case album(PHAssetCollection)
        case files([URL])
        case everythingNew
    }

    enum Phase: Equatable {
        case idle
        case preparing
        /// How much, before Evan says « Envoyer » (ADR-0030).
        case review(items: Int, bytes: Int64)
        /// The PC shows its confirmation; waiting for the answer there.
        case waitingPC
        case sending
        case done(items: Int, bytes: Int64, failed: Int, already: Int)
        case failed(String)
    }

    @Published private(set) var phase: Phase = .idle
    @Published private(set) var items = 0
    @Published private(set) var itemsDone = 0
    @Published private(set) var already = 0
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
    private enum Outcome { case sent, duplicate, skipped, stop(String) }

    /// One thing to send: a Photos item (photo + Live video) or a file.
    private enum Item {
        case asset(PHAsset, [PHAssetResource])
        case file(URL)
    }

    private var conn: PinnedConnection?
    private var inbox: [Event] = []
    private var waiter: CheckedContinuation<Event, Never>?
    private var confirm: CheckedContinuation<Bool, Never>?
    private var peerCancelled = false
    private var timer: Timer?
    private var samples: [Int64] = []
    private var lastBytes: Int64 = 0
    private var scoped: [URL] = []
    private let readQueue = DispatchQueue(label: "hyphn.drop.read")

    private static let chunk = 1 << 20
    /// Bytes allowed to wait in the socket before reading more.
    private static let backlog = 8 << 20
    private static let lostText = "Liaison perdue : relance l’envoi."

    var busy: Bool {
        switch phase {
        case .preparing, .review, .waitingPC, .sending: true
        default: false
        }
    }

    func send(_ source: Source) {
        guard !busy else { return }
        Task { await run(source) }
    }

    /// « Envoyer » on the review (ADR-0030).
    func confirmReview(_ yes: Bool) {
        confirm?.resume(returning: yes)
        confirm = nil
    }

    func cancel() {
        guard busy else { return }
        confirmReview(false)
        conn?.sendAndClose(.dropCancel)
        conn = nil
        finish(.failed("Envoi annulé."))
    }

    /// Hyphn left the foreground: iOS cuts the connection soon anyway (E5).
    func stopForBackground() {
        guard busy else { return }
        confirmReview(false)
        finish(.failed("Envoi arrêté : Hyphn est passé en arrière-plan. Relance-le en gardant Hyphn ouvert."))
    }

    /// Back to « Que veux-tu envoyer ? ».
    func reset() {
        if !busy { phase = .idle }
    }

    /// Photos access, asked after the explanation step (E3).
    static func askPhotos() async -> Bool {
        let s = await PHPhotoLibrary.requestAuthorization(for: .readWrite)
        return s == .authorized || s == .limited
    }

    // MARK: The send

    private func run(_ source: Source) async {
        phase = .preparing
        needsAccess = false
        (items, itemsDone, already, bytes, bytesDone, current, cloud, rate) = (0, 0, 0, 0, 0, "", nil, 0)
        var failed = 0
        var ids: [String] = []
        var files: [URL] = []
        switch source {
        case let .files(urls):
            files = urls
        default:
            guard await Self.askPhotos() else {
                needsAccess = true
                return finish(.failed("Hyphn a besoin de tes photos pour les envoyer."))
            }
            (ids, failed) = Self.identifiers(source)
        }

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

        // E6: the PC says which items it lacks; the others are not even exported.
        var missing = ids
        if !ids.isEmpty {
            c.send(.dropHave(ids))
            guard case let .msg(.dropMissing(m)) = await next() else { return lost() }
            missing = m
        }
        already = ids.count - missing.count
        let found = PHAsset.fetchAssets(withLocalIdentifiers: missing, options: nil)
        var byId: [String: PHAsset] = [:]
        found.enumerateObjects { a, _, _ in byId[a.localIdentifier] = a }
        failed += missing.count - byId.count
        var plan: [Item] = missing.compactMap { byId[$0] }.map { .asset($0, Self.resources(of: $0)) }
        for u in files where u.startAccessingSecurityScopedResource() { scoped.append(u) }
        plan += files.map { .file($0) }
        items = plan.count
        bytes = plan.reduce(0) { $0 + Self.size(of: $1) }

        if plan.isEmpty {
            c.sendAndClose(.dropDone(failed: UInt32(failed), already: UInt32(already)))
            conn = nil
            return finish(.done(items: 0, bytes: 0, failed: failed, already: already))
        }
        // E2: Evan confirms here first, then on the PC.
        phase = .review(items: plan.count, bytes: bytes)
        let yes = await withCheckedContinuation { confirm = $0 }
        guard yes, busy else { return }
        let fileCount = plan.reduce(0) { n, item in
            if case let .asset(_, r) = item { return n + r.count }
            return n + 1
        }
        c.send(.dropPlan(items: UInt32(plan.count), files: UInt32(fileCount), bytes: UInt64(bytes), already: UInt32(already)))
        phase = .waitingPC
        guard case let .msg(.dropAck(ok, reason, _)) = await next() else { return lost() }
        guard ok else { return finish(.failed(reason)) }

        phase = .sending
        UIApplication.shared.isIdleTimerDisabled = true
        startRate()
        for item in plan {
            guard busy else { return }
            var sent = false, dup = 0, bad = false
            let parts: [(PHAssetResource?, URL?)]
            var asset: PHAsset?
            switch item {
            case let .asset(a, res):
                asset = a
                parts = res.map { ($0, nil) }
                bad = res.isEmpty
            case let .file(u):
                parts = [(nil, u)]
            }
            for (k, part) in parts.enumerated() where !bad {
                guard busy else { return }
                let last = k == parts.count - 1
                let outcome: Outcome
                if let r = part.0, let a = asset {
                    outcome = await sendResource(r, of: a, last: last)
                } else if let u = part.1 {
                    outcome = await sendFile(u)
                } else {
                    outcome = .skipped
                }
                switch outcome {
                case .sent: sent = true
                case .duplicate: dup += 1
                case .skipped: bad = true
                case let .stop(why): return finish(.failed(why))
                }
            }
            if bad { failed += 1 } else if sent { itemsDone += 1 } else if dup > 0 { already += 1 }
        }
        guard busy else { return }
        conn?.sendAndClose(.dropDone(failed: UInt32(failed), already: UInt32(already)))
        conn = nil
        finish(.done(items: itemsDone, bytes: bytesDone, failed: failed, already: already))
    }

    /// Photos identifiers for the source, and how many could not be read.
    private static func identifiers(_ source: Source) -> ([String], Int) {
        switch source {
        case let .picks(ids):
            return (ids, 0)
        case let .album(c):
            var ids: [String] = []
            PHAsset.fetchAssets(in: c, options: nil).enumerateObjects { a, _, _ in ids.append(a.localIdentifier) }
            return (ids, 0)
        case .everythingNew:
            let o = PHFetchOptions()
            o.predicate = NSPredicate(format: "mediaType == %d || mediaType == %d", PHAssetMediaType.image.rawValue, PHAssetMediaType.video.rawValue)
            o.sortDescriptors = [NSSortDescriptor(key: "creationDate", ascending: true)]
            var ids: [String] = []
            PHAsset.fetchAssets(with: o).enumerateObjects { a, _, _ in ids.append(a.localIdentifier) }
            return (ids, 0)
        case .files:
            return ([], 0)
        }
    }

    /// One original from Photos: exported (downloaded from iCloud if needed),
    /// hashed, then sent unless the PC already has this content.
    private func sendResource(_ r: PHAssetResource, of asset: PHAsset, last: Bool) async -> Outcome {
        current = r.originalFilename
        let url = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: url) }
        guard await export(r, to: url) else { return .skipped }
        cloud = nil
        let date = asset.creationDate ?? Date()
        return await sendPath(url, name: r.originalFilename, date: date, assetId: asset.localIdentifier, isFile: false, last: last)
    }

    /// A file from the Files app: its own folder on the PC (E9).
    private func sendFile(_ u: URL) async -> Outcome {
        current = u.lastPathComponent
        let date = (try? u.resourceValues(forKeys: [.contentModificationDateKey]).contentModificationDate) ?? Date()
        return await sendPath(u, name: u.lastPathComponent, date: date, assetId: "", isFile: true, last: true)
    }

    private func sendPath(_ url: URL, name: String, date: Date, assetId: String, isFile: Bool, last: Bool) async -> Outcome {
        guard busy else { return .stop(Self.lostText) }
        guard let size = (try? FileManager.default.attributesOfItem(atPath: url.path)[.size] as? NSNumber)?.int64Value,
              let sha = await hash(url) else { return .skipped }
        let day = Calendar.current.dateComponents([.year, .month], from: date)
        let f = DropFile(name: name, size: UInt64(size), takenUnix: Int64(date.timeIntervalSince1970),
                         year: UInt32(day.year ?? 1970), month: UInt32(day.month ?? 1),
                         assetId: assetId, sha256: sha, isFile: isFile, lastOfItem: last)
        for attempt in 0..<2 {
            guard let c = conn else { return .stop(Self.lostText) }
            c.send(.dropFile(f))
            switch await next() {
            case let .msg(.dropAck(ok, reason, duplicate)):
                if duplicate {
                    bytes -= size
                    return .duplicate
                }
                guard ok else { return .stop(reason) }
            case .msg(.dropCancel):
                return .stop("Envoi annulé sur le PC.")
            default:
                return .stop(Self.lostText)
            }
            guard await stream(url, to: c) else {
                return .stop(peerCancelled ? "Envoi annulé sur le PC." : Self.lostText)
            }
            c.send(.dropEnd(sha256: sha, lastOfItem: last))
            switch await next() {
            case let .msg(.dropAck(ok, reason, _)):
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

    /// SHA-256 of a file, read in 1 MB blocks off the main thread.
    private func hash(_ url: URL) async -> Data? {
        let n = Self.chunk
        return await withCheckedContinuation { k in
            readQueue.async {
                guard let h = try? FileHandle(forReadingFrom: url) else { return k.resume(returning: nil) }
                defer { try? h.close() }
                var hasher = SHA256()
                while let d = try? h.read(upToCount: n), !d.isEmpty { hasher.update(data: d) }
                k.resume(returning: Data(hasher.finalize()))
            }
        }
    }

    /// The file in 1 MB blocks. False if the send stopped.
    private func stream(_ url: URL, to c: PinnedConnection) async -> Bool {
        guard let h = try? FileHandle(forReadingFrom: url) else { return false }
        defer { try? h.close() }
        while true {
            // Do not read ahead of the Wi-Fi: memory stays small.
            while c.pendingBytes > Self.backlog {
                try? await Task.sleep(for: .milliseconds(5))
                if !busy || peerCancelled { return false }
            }
            if !busy || peerCancelled { return false }
            let n = Self.chunk
            let data: Data? = await withCheckedContinuation { k in
                readQueue.async { k.resume(returning: try? h.read(upToCount: n)) }
            }
            guard let data, !data.isEmpty else { return true }
            c.send(.dropChunk(data))
            bytesDone += Int64(data.count)
        }
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

    /// E4: the original photo or video, plus the video of a Live Photo.
    static func resources(of a: PHAsset) -> [PHAssetResource] {
        let all = PHAssetResource.assetResources(for: a)
        let main: PHAssetResourceType = a.mediaType == .video ? .video : .photo
        var out = Array(all.filter { $0.type == main }.prefix(1))
        if out.isEmpty, let first = all.first { out = [first] }
        out += all.filter { $0.type == .pairedVideo }.prefix(1)
        return out
    }

    /// Size known before export, for the plan's total only. Photos: read by
    /// key-value coding (not public API, non vérifié on every iOS), 0 when missing.
    private static func size(of item: Item) -> Int64 {
        switch item {
        case let .asset(_, res):
            return res.reduce(0) { $0 + ((($1.value(forKey: "fileSize") as? NSNumber)?.int64Value) ?? 0) }
        case let .file(u):
            return Int64((try? u.resourceValues(forKeys: [.fileSizeKey]).fileSize) ?? 0)
        }
    }

    // MARK: Events from the connection

    private func post(_ e: Event) {
        if case .msg(.dropCancel) = e {
            peerCancelled = true
            confirmReview(false)
        }
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
        guard busy else { return }
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
        for u in scoped { u.stopAccessingSecurityScopedResource() }
        scoped = []
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
