// Cam (spec `Cam - Flux v1`): capture, preview, hardware encoding
// (VideoToolbox, RULES Énergie 3: on iPhone HEVC and H.264 always use the media engine) and the media connection. Opening the Cam
// tab starts the camera paused (ADR-0018); nothing is encoded or sent while
// paused, and the media connection closes 30 s after a pause (Énergie 2).

@preconcurrency import AVFoundation
import Foundation
import UIKit
import VideoToolbox

@MainActor
final class Camera: NSObject, ObservableObject {
    @Published private(set) var isOpen = false
    @Published private(set) var live = false
    @Published private(set) var front = false
    @Published private(set) var lens: UInt32 = 1
    @Published private(set) var size = CGSize.zero
    @Published private(set) var fps: UInt32 = 30
    @Published private(set) var sentMbps: Double = 0
    @Published private(set) var denied = false

    let session = AVCaptureSession()
    weak var link: PCLink?

    private let work = DispatchQueue(label: "hyphn.camera")
    private let output = AVCaptureVideoDataOutput()
    private var control = CamControl()
    private var rotation: AVCaptureDevice.RotationCoordinator?
    private var rotationObs: NSKeyValueObservation?
    private var mediaCloser: Task<Void, Never>?
    private var statsTimer: Timer?
    private let pump = FramePump()

    static let lensFactors: [CGFloat] = [0.5, 1, 2, 5]

    var state: CamState {
        CamState(open: isOpen, live: live, width: UInt32(size.width), height: UInt32(size.height), fps: fps,
                 codec: control.codec, front: front, lens: lens, lensCount: 4)
    }

    // MARK: Open / close (the Cam tab)

    func open() {
        guard !isOpen else { return }
        isOpen = true
        UIApplication.shared.isIdleTimerDisabled = true
        switch AVCaptureDevice.authorizationStatus(for: .video) {
        case .authorized: startSession()
        case .notDetermined:
            AVCaptureDevice.requestAccess(for: .video) { ok in
                DispatchQueue.main.async { ok ? self.startSession() : (self.denied = true) }
            }
        default: denied = true
        }
        report()
    }

    func close() {
        guard isOpen else { return }
        isOpen = false
        setLive(false)
        UIApplication.shared.isIdleTimerDisabled = false
        let s = session
        work.async { s.stopRunning() }
        report()
    }

    /// Called when the app leaves the foreground or the PC is gone.
    func stopStreaming() {
        setLive(false)
        closeMedia()
    }

    private func startSession() {
        denied = false
        configure(front: control.front, lens: control.lens, height: control.height, fps: control.fps)
        let s = session
        work.async { if !s.isRunning { s.startRunning() } }
        // The PC may have asked for the picture before the tab opened.
        setLive(control.live)
        report()
    }

    // MARK: Settings from the PC, and from the buttons here

    func apply(_ c: CamControl) {
        let reconfigure = c.front != control.front || c.height != control.height || c.fps != control.fps
        let relens = c.lens != control.lens
        control = c
        if isOpen, !denied {
            if reconfigure { configure(front: c.front, lens: c.lens, height: c.height, fps: c.fps) }
            else if relens { setZoom(c.lens) }
        }
        pump.configure(codec: c.codec, bitrateKbps: c.bitrateKbps, fps: c.fps, height: c.height)
        setLive(c.live && isOpen)
        report()
    }

    /// « Afficher » / « Pause » on the iPhone.
    func toggleLive() {
        setLive(!live)
        control.live = live
        report()
    }

    func flip() {
        control.front.toggle()
        configure(front: control.front, lens: control.lens, height: control.height, fps: control.fps)
        report()
    }

    func pickLens(_ i: UInt32) {
        control.lens = i
        setZoom(i)
        report()
    }

    /// Quick quality from the iPhone: the PC keeps it and answers CamControl (E4).
    func pickQuality(height: UInt32, fps: UInt32) {
        link?.send(.camQuality(height: height, fps: fps))
    }

    private func report() {
        link?.send(.camState(state))
    }

    // MARK: Live

    private func setLive(_ on: Bool) {
        let on = on && isOpen && !denied
        guard on != live else { return }
        live = on
        if on {
            mediaCloser?.cancel()
            mediaCloser = nil
            if pump.connection == nil { openMedia() }
            pump.start()
            statsTimer = Timer.scheduledTimer(withTimeInterval: 1, repeats: true) { [weak self] _ in
                MainActor.assumeIsolated { self?.sentMbps = self?.pump.takeMbps() ?? 0 }
            }
        } else {
            pump.stop()
            statsTimer?.invalidate()
            statsTimer = nil
            sentMbps = 0
            // Énergie 2: the data socket closes after 30 s without use.
            mediaCloser = Task { [weak self] in
                try? await Task.sleep(for: .seconds(30))
                guard !Task.isCancelled else { return }
                self?.closeMedia()
            }
        }
    }

    private func openMedia() {
        guard let c = link?.openMedia() else { return }
        pump.connection = c
        c.onClose = { [weak self, weak c] _ in
            guard let self, let c, self.pump.connection === c else { return }
            self.pump.connection = nil
            // Lost while live (Wi-Fi hiccup): try again once the session is back.
            if self.live {
                Task { @MainActor [weak self] in
                    try? await Task.sleep(for: .seconds(1))
                    if let self, self.live, self.pump.connection == nil { self.openMedia() }
                }
            }
        }
    }

    private func closeMedia() {
        mediaCloser?.cancel()
        mediaCloser = nil
        pump.connection?.close()
        pump.connection = nil
    }

    // MARK: Capture setup

    private func device(front: Bool) -> AVCaptureDevice? {
        if front {
            return AVCaptureDevice.default(.builtInWideAngleCamera, for: .video, position: .front)
        }
        return AVCaptureDevice.default(.builtInTripleCamera, for: .video, position: .back)
            ?? AVCaptureDevice.default(.builtInDualWideCamera, for: .video, position: .back)
            ?? AVCaptureDevice.default(.builtInDualCamera, for: .video, position: .back)
            ?? AVCaptureDevice.default(.builtInWideAngleCamera, for: .video, position: .back)
    }

    private func configure(front: Bool, lens: UInt32, height: UInt32, fps: UInt32) {
        guard let dev = device(front: front) else { return }
        self.front = front
        session.beginConfiguration()
        session.sessionPreset = .inputPriority
        for i in session.inputs { session.removeInput(i) }
        if let input = try? AVCaptureDeviceInput(device: dev), session.canAddInput(input) {
            session.addInput(input)
        }
        if session.outputs.isEmpty, session.canAddOutput(output) {
            output.alwaysDiscardsLateVideoFrames = true
            output.videoSettings = [kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_420YpCbCr8BiPlanarVideoRange]
            output.setSampleBufferDelegate(pump, queue: pump.queue)
            session.addOutput(output)
        }
        let picked = Self.pickFormat(dev, height: Int(height), fps: Double(fps))
        if (try? dev.lockForConfiguration()) != nil {
            if let f = picked { dev.activeFormat = f }
            let rate = Double(fps)
            let ranges = dev.activeFormat.videoSupportedFrameRateRanges
            let maxRate = ranges.map(\.maxFrameRate).max() ?? 30
            let r = min(rate, maxRate)
            dev.activeVideoMinFrameDuration = CMTime(value: 1, timescale: CMTimeScale(r))
            dev.activeVideoMaxFrameDuration = CMTime(value: 1, timescale: CMTimeScale(r))
            self.fps = UInt32(r)
            dev.unlockForConfiguration()
        }
        session.commitConfiguration()
        setZoom(lens)

        // Keep the picture level with the horizon whatever the phone's angle.
        let coord = AVCaptureDevice.RotationCoordinator(device: dev, previewLayer: nil)
        rotation = coord
        applyRotation(coord.videoRotationAngleForHorizonLevelCapture)
        rotationObs = coord.observe(\.videoRotationAngleForHorizonLevelCapture, options: [.new]) { [weak self] c, _ in
            let angle = c.videoRotationAngleForHorizonLevelCapture
            DispatchQueue.main.async { self?.applyRotation(angle) }
        }
    }

    private func applyRotation(_ angle: CGFloat) {
        if let conn = output.connection(with: .video), conn.isVideoRotationAngleSupported(angle) {
            conn.videoRotationAngle = angle
            conn.isVideoMirrored = front
        }
        let dims = (session.inputs.first as? AVCaptureDeviceInput).map { CMVideoFormatDescriptionGetDimensions($0.device.activeFormat.formatDescription) }
        if let d = dims {
            let portrait = Int(angle) % 180 != 0
            size = portrait ? CGSize(width: Int(d.height), height: Int(d.width)) : CGSize(width: Int(d.width), height: Int(d.height))
        }
    }

    /// Smallest 16:9 format at least `height` lines high that reaches `fps`.
    private static func pickFormat(_ dev: AVCaptureDevice, height: Int, fps: Double) -> AVCaptureDevice.Format? {
        let ok = dev.formats.filter { f in
            let d = CMVideoFormatDescriptionGetDimensions(f.formatDescription)
            let sixteenNine = abs(Double(d.width) / Double(d.height) - 16.0 / 9.0) < 0.01
            let fast = f.videoSupportedFrameRateRanges.contains { $0.maxFrameRate >= fps }
            let sub = CMFormatDescriptionGetMediaSubType(f.formatDescription)
            return sixteenNine && fast && sub == kCVPixelFormatType_420YpCbCr8BiPlanarVideoRange
        }
        let tall = ok.filter { Int(CMVideoFormatDescriptionGetDimensions($0.formatDescription).height) >= height }
        let pool = tall.isEmpty ? ok : tall
        return pool.min { a, b in
            CMVideoFormatDescriptionGetDimensions(a.formatDescription).height < CMVideoFormatDescriptionGetDimensions(b.formatDescription).height
        }
    }

    /// 0,5× / 1× / 2× / 5×. On a multi-camera device, 1× is the wide lens,
    /// found at the first switch-over factor; without an ultra-wide, 0,5× stays 1×.
    private func setZoom(_ i: UInt32) {
        lens = i
        guard let dev = (session.inputs.first as? AVCaptureDeviceInput)?.device else { return }
        let factor = Self.lensFactors[Int(min(i, 3))]
        let hasUltraWide = dev.constituentDevices.contains { $0.deviceType == .builtInUltraWideCamera }
        let base = hasUltraWide ? (dev.virtualDeviceSwitchOverVideoZoomFactors.first.map { CGFloat(truncating: $0) } ?? 2) : 1
        let zoom = max(dev.minAvailableVideoZoomFactor, min(dev.maxAvailableVideoZoomFactor, factor * base))
        if (try? dev.lockForConfiguration()) != nil {
            dev.videoZoomFactor = zoom
            dev.unlockForConfiguration()
        }
    }
}

/// Runs on the capture queue: encodes frames while live and sends them.
/// No buffer: if the network falls behind, frames are dropped until the next keyframe.
final class FramePump: NSObject, AVCaptureVideoDataOutputSampleBufferDelegate {
    let queue = DispatchQueue(label: "hyphn.encode", qos: .userInteractive)
    private let lock = NSLock()
    private var running = false
    private var codec: Codec = .hevc
    private var bitrateKbps: UInt32 = 12_000
    private var fps: UInt32 = 30
    private var encoder: VTCompressionSession?
    private var encodedSize = (0, 0)
    private var encodedCodec: Codec = .unknown
    private var needKey = true
    private var sentBytes = 0
    private var _connection: PinnedConnection?

    var connection: PinnedConnection? {
        get { lock.withLock { _connection } }
        set { lock.withLock { _connection = newValue } }
    }

    func configure(codec: Codec, bitrateKbps: UInt32, fps: UInt32, height: UInt32) {
        queue.async {
            let changed = codec != self.codec
            self.codec = codec == .unknown ? .hevc : codec
            self.bitrateKbps = max(1_000, bitrateKbps)
            self.fps = max(1, fps)
            if changed { self.dropEncoder() } else { self.applyRate() }
        }
    }

    func start() {
        queue.async {
            self.running = true
            self.needKey = true
        }
    }

    func stop() {
        queue.async {
            self.running = false
            self.dropEncoder()
        }
    }

    func takeMbps() -> Double {
        lock.withLock {
            let v = Double(sentBytes) * 8 / 1_000_000
            sentBytes = 0
            return v
        }
    }

    func captureOutput(_ output: AVCaptureOutput, didOutput sampleBuffer: CMSampleBuffer, from connection: AVCaptureConnection) {
        guard running, let pb = CMSampleBufferGetImageBuffer(sampleBuffer), let conn = self.connection else { return }
        let w = CVPixelBufferGetWidth(pb), h = CVPixelBufferGetHeight(pb)
        if encoder == nil || encodedSize != (w, h) || encodedCodec != codec {
            makeEncoder(width: w, height: h)
        }
        guard let enc = encoder else { return }
        // Network behind: drop this frame and ask for a keyframe next.
        if conn.pendingSends > 3 {
            needKey = true
            return
        }
        let pts = CMSampleBufferGetPresentationTimeStamp(sampleBuffer)
        let props: CFDictionary? = needKey ? [kVTEncodeFrameOptionKey_ForceKeyFrame: true] as CFDictionary : nil
        needKey = false
        let codec = self.codec
        VTCompressionSessionEncodeFrame(enc, imageBuffer: pb, presentationTimeStamp: pts, duration: .invalid,
                                        frameProperties: props, infoFlagsOut: nil) { [weak self] status, _, sbuf in
            guard status == noErr, let sbuf, let self else { return }
            self.send(sbuf, codec: codec, width: w, height: h)
        }
    }

    private func makeEncoder(width: Int, height: Int) {
        dropEncoder()
        var s: VTCompressionSession?
        let type = codec == .h264 ? kCMVideoCodecType_H264 : kCMVideoCodecType_HEVC
        let st = VTCompressionSessionCreate(allocator: nil, width: Int32(width), height: Int32(height), codecType: type,
                                            encoderSpecification: nil, imageBufferAttributes: nil, compressedDataAllocator: nil,
                                            outputCallback: nil, refcon: nil, compressionSessionOut: &s)
        guard st == noErr, let s else { return }
        VTSessionSetProperty(s, key: kVTCompressionPropertyKey_RealTime, value: kCFBooleanTrue)
        VTSessionSetProperty(s, key: kVTCompressionPropertyKey_AllowFrameReordering, value: kCFBooleanFalse)
        VTSessionSetProperty(s, key: kVTCompressionPropertyKey_ProfileLevel,
                             value: codec == .h264 ? kVTProfileLevel_H264_High_AutoLevel : kVTProfileLevel_HEVC_Main_AutoLevel)
        // A keyframe every 2 s (E2).
        VTSessionSetProperty(s, key: kVTCompressionPropertyKey_MaxKeyFrameIntervalDuration, value: 2 as CFNumber)
        encoder = s
        encodedSize = (width, height)
        encodedCodec = codec
        applyRate()
        VTCompressionSessionPrepareToEncodeFrames(s)
        needKey = true
    }

    private func applyRate() {
        guard let s = encoder else { return }
        VTSessionSetProperty(s, key: kVTCompressionPropertyKey_AverageBitRate, value: Int(bitrateKbps) * 1000 as CFNumber)
        VTSessionSetProperty(s, key: kVTCompressionPropertyKey_ExpectedFrameRate, value: Int(fps) as CFNumber)
        VTSessionSetProperty(s, key: kVTCompressionPropertyKey_MaxKeyFrameInterval, value: Int(fps) * 2 as CFNumber)
    }

    private func dropEncoder() {
        if let s = encoder {
            VTCompressionSessionInvalidate(s)
        }
        encoder = nil
    }

    /// AVCC (length-prefixed) → Annex-B (start codes), parameter sets before keyframes.
    private func send(_ sbuf: CMSampleBuffer, codec: Codec, width: Int, height: Int) {
        guard let block = CMSampleBufferGetDataBuffer(sbuf), let conn = connection else { return }
        let attachments = CMSampleBufferGetSampleAttachmentsArray(sbuf, createIfNecessary: false) as? [[CFString: Any]]
        let notSync = attachments?.first?[kCMSampleAttachmentKey_NotSync] as? Bool ?? false
        let key = !notSync
        let start: [UInt8] = [0, 0, 0, 1]
        var out = Data()
        if key, let fd = CMSampleBufferGetFormatDescription(sbuf) {
            for ps in Self.parameterSets(fd, codec: codec) {
                out.append(contentsOf: start)
                out.append(ps)
            }
        }
        var length = 0
        var ptr: UnsafeMutablePointer<CChar>?
        guard CMBlockBufferGetDataPointer(block, atOffset: 0, lengthAtOffsetOut: nil, totalLengthOut: &length, dataPointerOut: &ptr) == noErr,
              let ptr else { return }
        let raw = UnsafeRawPointer(ptr)
        var i = 0
        while i + 4 <= length {
            let n = Int(UInt32(bigEndian: raw.loadUnaligned(fromByteOffset: i, as: UInt32.self)))
            i += 4
            guard i + n <= length else { break }
            out.append(contentsOf: start)
            out.append(Data(bytes: raw + i, count: n))
            i += n
        }
        let pts = CMSampleBufferGetPresentationTimeStamp(sbuf)
        let us = Int64(CMTimeGetSeconds(pts) * 1_000_000)
        lock.withLock { sentBytes += out.count }
        conn.send(.videoFrame(VideoFrame(ptsUs: us, keyframe: key, codec: codec, width: UInt32(width), height: UInt32(height), data: out)))
    }

    private static func parameterSets(_ fd: CMFormatDescription, codec: Codec) -> [Data] {
        var count = 0
        var sets: [Data] = []
        var index = 0
        repeat {
            var p: UnsafePointer<UInt8>?
            var size = 0
            let st: OSStatus = codec == .h264
                ? CMVideoFormatDescriptionGetH264ParameterSetAtIndex(fd, parameterSetIndex: index, parameterSetPointerOut: &p,
                                                                     parameterSetSizeOut: &size, parameterSetCountOut: &count, nalUnitHeaderLengthOut: nil)
                : CMVideoFormatDescriptionGetHEVCParameterSetAtIndex(fd, parameterSetIndex: index, parameterSetPointerOut: &p,
                                                                     parameterSetSizeOut: &size, parameterSetCountOut: &count, nalUnitHeaderLengthOut: nil)
            guard st == noErr, let p else { break }
            sets.append(Data(bytes: p, count: size))
            index += 1
        } while index < count
        return sets
    }
}
