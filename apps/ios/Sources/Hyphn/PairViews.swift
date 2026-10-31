// First pairing (spec `Core - Appairage QR`), V2 screens « Bienvenue » and
// « Scan »: read the PC's QR, show the code, « Oui, relier » here only (E6),
// then the « liés » animation, played at the same moment as on the PC (E8).

@preconcurrency import AVFoundation
import SwiftUI
import UIKit

struct WelcomeView: View {
    @EnvironmentObject var link: PCLink
    @Binding var scanning: Bool
    @State private var slide = 0
    private let timer = Timer.publish(every: 4, on: .main, in: .common).autoconnect()

    private let slides: [(String, Color, String, String)] = [
        ("Bienvenue", Ink.li, "Ton iPhone et ton PC, reliés.", "Un QR code, une seule fois. Ensuite ils se retrouvent tout seuls, sans compte et sans cloud."),
        ("Cam", Ink.co, "Ta meilleure webcam, c’est ton iPhone.", "Jusqu’en 4K pour Discord, Teams ou OBS. Le PC voit aussi ta batterie et la chaleur."),
        ("Drop", Ink.cy, "Tes photos, rangées toutes seules.", "Par année et par mois, vérifiées une par une. Bientôt."),
    ]

    var body: some View {
        let s = slides[slide]
        ZStack {
            Color.black.ignoresSafeArea()
            RadialGradient(colors: [s.1.opacity(0.18), .clear], center: .init(x: 0.5, y: 0.3), startRadius: 0, endRadius: 300)
                .ignoresSafeArea()
                .animation(.easeInOut(duration: 1), value: slide)
            VStack(alignment: .leading, spacing: 0) {
                HStack(spacing: 10) {
                    Mark(scale: 0.9)
                    Text("hyphn").font(.geist(18, .semibold))
                }
                .frame(maxWidth: .infinity)
                .padding(.top, 12)

                LinkHero(accent: s.1)
                    .frame(height: 200)
                    .padding(.top, 40)

                Spacer(minLength: 20)

                VStack(alignment: .leading, spacing: 12) {
                    HStack(spacing: 8) {
                        Circle().fill(s.1).frame(width: 7, height: 7)
                        Text(s.0.uppercased()).font(.geist(12, .bold)).tracking(2).foregroundStyle(s.1)
                    }
                    Text(s.2).font(.geist(36, .semibold)).tracking(-1.5).foregroundStyle(Ink.tx)
                    Text(s.3).font(.geist(15)).foregroundStyle(Ink.tx2).lineSpacing(3)
                }
                .id(slide)
                .transition(.asymmetric(insertion: .opacity.combined(with: .offset(y: 20)), removal: .opacity))

                HStack(spacing: 6) {
                    ForEach(0..<3, id: \.self) { i in
                        Capsule().fill(i <= slide ? Ink.tx : Color.white.opacity(0.14)).frame(height: 4)
                            .onTapGesture { withAnimation { slide = i } }
                    }
                }
                .padding(.vertical, 26)

                if let notice = link.notice {
                    Text(notice).font(.geist(14)).foregroundStyle(Ink.am).padding(.bottom, 12)
                }

                Button {
                    link.notice = nil
                    scanning = true
                } label: {
                    HStack { Text("Scanner le QR du PC"); Image(systemName: "arrow.right") }
                }
                .buttonStyle(PrimaryButtonStyle(fill: Ink.tx, text: .black))

                HStack(spacing: 16) {
                    ForEach(["Sans compte", "Sans cloud", "Chiffré"], id: \.self) { t in
                        Label(t, systemImage: "checkmark").font(.geist(12)).foregroundStyle(Ink.tx3)
                    }
                }
                .frame(maxWidth: .infinity)
                .padding(.top, 16)
            }
            .padding(.horizontal, 26)
            .padding(.bottom, 20)
        }
        .onReceive(timer) { _ in withAnimation(.spring(duration: 0.7)) { slide = (slide + 1) % 3 } }
    }
}

/// iPhone and PC drawn in lines, joined by a glowing wire.
struct LinkHero: View {
    var accent: Color
    @State private var drawn = false

    var body: some View {
        ZStack {
            HStack {
                RoundedRectangle(cornerRadius: 17).stroke(Ink.tx, lineWidth: 2).frame(width: 78, height: 150)
                Spacer()
                VStack(spacing: 4) {
                    RoundedRectangle(cornerRadius: 9).stroke(Ink.tx, lineWidth: 2).frame(width: 140, height: 94)
                    Capsule().stroke(Ink.tx, lineWidth: 2).frame(width: 168, height: 12)
                }
            }
            .padding(.horizontal, 6)
            Path { p in
                p.move(to: CGPoint(x: 90, y: 100))
                p.addCurve(to: CGPoint(x: 190, y: 80), control1: CGPoint(x: 130, y: 40), control2: CGPoint(x: 150, y: 140))
            }
            .trim(from: 0, to: drawn ? 1 : 0)
            .stroke(accent, style: StrokeStyle(lineWidth: 2.5, lineCap: .round))
            .shadow(color: accent, radius: 6)
            .animation(.easeInOut(duration: 1.2).delay(0.4), value: drawn)
        }
        .onAppear { drawn = true }
        .accessibilityElement()
        .accessibilityLabel("Un iPhone et un PC reliés par un fil lumineux")
    }
}

// MARK: - Scan

struct ScanView: View {
    @EnvironmentObject var link: PCLink
    @Binding var scanning: Bool
    @State private var torch = false
    @State private var cameraDenied = AVCaptureDevice.authorizationStatus(for: .video) == .denied

    var body: some View {
        ZStack {
            Color.black.ignoresSafeArea()
            if !cameraDenied {
                QRScanner(torch: torch, denied: $cameraDenied) { text in link.scanned(text) }
                    .ignoresSafeArea()
            }
            Viewfinder().offset(y: -80)

            VStack {
                HStack {
                    Button {
                        link.cancelPairing()
                        scanning = false
                    } label: {
                        Label("Retour", systemImage: "chevron.left").font(.geist(14, .medium))
                            .padding(.horizontal, 14).frame(height: 44)
                            .background(.ultraThinMaterial, in: RoundedRectangle(cornerRadius: 14))
                    }
                    Spacer()
                    Button { torch.toggle() } label: {
                        Image(systemName: torch ? "flashlight.on.fill" : "flashlight.off.fill")
                            .frame(width: 44, height: 44)
                            .background(torch ? AnyShapeStyle(Ink.tx) : AnyShapeStyle(.ultraThinMaterial), in: RoundedRectangle(cornerRadius: 14))
                            .foregroundStyle(torch ? Color.black : Ink.tx)
                    }
                    .accessibilityLabel("Lampe")
                }
                .foregroundStyle(Ink.tx)
                .padding(.horizontal, 16)
                Spacer()
                panel
                    .padding(20)
                    .background(Ink.card, in: RoundedRectangle(cornerRadius: 28, style: .continuous))
                    .overlay(RoundedRectangle(cornerRadius: 28, style: .continuous).stroke(Ink.line))
                    .padding(.horizontal, 14)
                    .padding(.bottom, 20)
                    .animation(.spring(duration: 0.45), value: link.pairStep)
            }
        }
    }

    @ViewBuilder private var panel: some View {
        if cameraDenied {
            Problem(title: "Caméra refusée", text: "Hyphn a besoin de la caméra pour lire le QR, et seulement pour ça.", settings: true)
        } else {
            switch link.pairStep {
            case .idle:
                VStack(alignment: .leading, spacing: 8) {
                    Text("Vise le QR code du PC").font(.geist(20, .semibold))
                    Text("Sur le PC : Hyphn › Relier un iPhone. La lecture est automatique.")
                        .font(.geist(14)).foregroundStyle(Ink.tx2)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
            case .connecting:
                HStack(spacing: 12) {
                    ProgressView().tint(Ink.li)
                    Text("Connexion au PC…").font(.geist(17, .semibold))
                }
                .frame(maxWidth: .infinity, alignment: .leading)
            case let .code(code, pcName):
                CodeSheet(code: code, pcName: pcName)
            case .confirming:
                HStack(spacing: 12) {
                    ProgressView().tint(Ink.li)
                    Text("Liaison…").font(.geist(17, .semibold))
                }
                .frame(maxWidth: .infinity, alignment: .leading)
            case let .failed(message):
                VStack(spacing: 14) {
                    Problem(title: "Pas relié", text: message, settings: message.contains("Settings"))
                    Button("Réessayer") { link.pairStep = .idle }.buttonStyle(GhostButtonStyle())
                }
            case .linked:
                EmptyView()
            }
        }
    }
}

struct CodeSheet: View {
    @EnvironmentObject var link: PCLink
    let code: String
    let pcName: String
    @State private var shown = false

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            Text("\(pcName) trouvé".uppercased()).font(.geist(12, .semibold)).tracking(1.5).foregroundStyle(Ink.tx3)
            Text("Le même code s’affiche sur ton PC ?").font(.geist(20, .semibold))
            HStack(spacing: 10) {
                ForEach(Array(code.enumerated()), id: \.offset) { pair in
                    let i = pair.offset
                    Text(String(pair.element))
                        .font(.mono(42, .semibold))
                        .foregroundStyle(Ink.li)
                        .frame(width: 62, height: 80)
                        .background(Ink.li.opacity(0.07), in: RoundedRectangle(cornerRadius: 18))
                        .overlay(RoundedRectangle(cornerRadius: 18).stroke(Ink.li.opacity(0.45)))
                        .shadow(color: Ink.li.opacity(0.45), radius: 10)
                        .opacity(shown ? 1 : 0)
                        .offset(y: shown ? 0 : 14)
                        .animation(.spring(duration: 0.5).delay(Double(i) * 0.12), value: shown)
                }
            }
            .frame(maxWidth: .infinity)
            .accessibilityElement()
            .accessibilityLabel("Code \(code.map(String.init).joined(separator: " "))")
            Text("S’il est différent, refuse : quelqu’un a peut-être affiché un faux QR.")
                .font(.geist(14)).foregroundStyle(Ink.tx2)
            HStack(spacing: 10) {
                Button("Non") { link.answer(false) }.buttonStyle(GhostButtonStyle()).frame(width: 100)
                Button("Oui, relier") { link.answer(true) }.buttonStyle(PrimaryButtonStyle())
            }
        }
        .onAppear { shown = true }
    }
}

struct Problem: View {
    let title: String
    let text: String
    var settings = false

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(alignment: .top, spacing: 12) {
                Image(systemName: "exclamationmark.circle").font(.system(size: 22)).foregroundStyle(Ink.am)
                VStack(alignment: .leading, spacing: 4) {
                    Text(title).font(.geist(20, .semibold))
                    Text(text).font(.geist(14)).foregroundStyle(Ink.tx2)
                }
            }
            if settings {
                Button("Ouvrir Settings") {
                    if let u = URL(string: UIApplication.openSettingsURLString) { UIApplication.shared.open(u) }
                }
                .buttonStyle(PrimaryButtonStyle())
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}

struct Viewfinder: View {
    @State private var sweep = false
    @State private var breathe = false

    var body: some View {
        ZStack {
            ForEach(0..<4, id: \.self) { i in
                Corner().stroke(Ink.li, style: StrokeStyle(lineWidth: 4, lineCap: .round))
                    .frame(width: 52, height: 52)
                    .rotationEffect(.degrees(Double(i) * 90))
                    .offset(x: i == 0 || i == 3 ? -89 : 89, y: i < 2 ? -89 : 89)
                    .shadow(color: Ink.li.opacity(0.6), radius: 8)
            }
            Capsule().fill(Ink.li).frame(width: 200, height: 2)
                .shadow(color: Ink.li, radius: 8)
                .offset(y: sweep ? 95 : -95)
        }
        .frame(width: 230, height: 230)
        .scaleEffect(breathe ? 0.96 : 1)
        .onAppear {
            withAnimation(.easeInOut(duration: 2).repeatForever(autoreverses: true)) { sweep = true }
            withAnimation(.easeInOut(duration: 1.2).repeatForever(autoreverses: true)) { breathe = true }
        }
        .allowsHitTesting(false)
        .accessibilityHidden(true)
    }
}

/// Top-left corner of the viewfinder; rotated for the other three.
struct Corner: Shape {
    func path(in r: CGRect) -> Path {
        var p = Path()
        p.move(to: CGPoint(x: 0, y: r.height))
        p.addLine(to: CGPoint(x: 0, y: 22))
        p.addQuadCurve(to: CGPoint(x: 22, y: 0), control: .zero)
        p.addLine(to: CGPoint(x: r.width, y: 0))
        return p
    }
}

/// The real scanner: AVCaptureMetadataOutput for QR codes only.
struct QRScanner: UIViewRepresentable {
    var torch: Bool
    @Binding var denied: Bool
    var onCode: (String) -> Void

    func makeCoordinator() -> Coordinator { Coordinator(onCode: onCode) }

    func makeUIView(context: Context) -> PreviewView {
        let v = PreviewView()
        let c = context.coordinator
        v.previewLayer.session = c.session
        v.previewLayer.videoGravity = .resizeAspectFill
        switch AVCaptureDevice.authorizationStatus(for: .video) {
        case .authorized: c.start()
        case .notDetermined:
            AVCaptureDevice.requestAccess(for: .video) { ok in
                DispatchQueue.main.async { ok ? c.start() : (denied = true) }
            }
        default: DispatchQueue.main.async { denied = true }
        }
        return v
    }

    func updateUIView(_ v: PreviewView, context: Context) {
        context.coordinator.onCode = onCode
        context.coordinator.setTorch(torch)
    }

    static func dismantleUIView(_ v: PreviewView, coordinator: Coordinator) {
        coordinator.stop()
    }

    final class Coordinator: NSObject, AVCaptureMetadataOutputObjectsDelegate {
        let session = AVCaptureSession()
        var onCode: (String) -> Void
        private let queue = DispatchQueue(label: "hyphn.qr")
        private var last = ""

        init(onCode: @escaping (String) -> Void) {
            self.onCode = onCode
        }

        func start() {
            guard let dev = AVCaptureDevice.default(.builtInWideAngleCamera, for: .video, position: .back),
                  let input = try? AVCaptureDeviceInput(device: dev) else { return }
            session.beginConfiguration()
            if session.canAddInput(input) { session.addInput(input) }
            let out = AVCaptureMetadataOutput()
            if session.canAddOutput(out) {
                session.addOutput(out)
                out.setMetadataObjectsDelegate(self, queue: .main)
                out.metadataObjectTypes = [.qr]
            }
            session.commitConfiguration()
            let s = session
            queue.async { s.startRunning() }
        }

        func stop() {
            let s = session
            queue.async { s.stopRunning() }
        }

        func setTorch(_ on: Bool) {
            guard let dev = (session.inputs.first as? AVCaptureDeviceInput)?.device, dev.hasTorch,
                  (try? dev.lockForConfiguration()) != nil else { return }
            dev.torchMode = on ? .on : .off
            dev.unlockForConfiguration()
        }

        func metadataOutput(_ output: AVCaptureMetadataOutput, didOutput objects: [AVMetadataObject], from connection: AVCaptureConnection) {
            guard let code = objects.compactMap({ ($0 as? AVMetadataMachineReadableCodeObject)?.stringValue }).first,
                  code != last else { return }
            last = code
            UINotificationFeedbackGenerator().notificationOccurred(.success)
            onCode(code)
            // The same QR can be read again after a refusal (« Réessayer »).
            DispatchQueue.main.asyncAfter(deadline: .now() + 3) { [weak self] in self?.last = "" }
        }
    }
}

final class PreviewView: UIView {
    override class var layerClass: AnyClass { AVCaptureVideoPreviewLayer.self }
    var previewLayer: AVCaptureVideoPreviewLayer { layer as! AVCaptureVideoPreviewLayer }
}

// MARK: - « Liés »

struct LinkedView: View {
    @EnvironmentObject var link: PCLink
    let pcName: String
    @State private var stage = 0
    @State private var progress = false
    @State private var leaving = false

    var body: some View {
        ZStack {
            Color.black.ignoresSafeArea()
            VStack(spacing: 24) {
                ZStack {
                    Capsule()
                        .fill(LinearGradient(colors: [Ink.cy, Ink.li], startPoint: .leading, endPoint: .trailing))
                        .frame(width: 130, height: 4)
                        .shadow(color: Ink.li.opacity(0.7), radius: 9)
                        .scaleEffect(x: stage >= 2 ? 1 : 0, y: 1, anchor: .leading)
                    HStack {
                        DeviceTile(symbol: "iphone", color: Ink.tx).offset(x: stage >= 1 ? 0 : -90).opacity(stage >= 1 ? 1 : 0)
                        Spacer()
                        DeviceTile(symbol: "desktopcomputer", color: Ink.li).offset(x: stage >= 1 ? 0 : 90).opacity(stage >= 1 ? 1 : 0)
                    }
                    .frame(width: 310)
                    Circle().stroke(Ink.li, lineWidth: 2)
                        .frame(width: 10, height: 10)
                        .scaleEffect(stage >= 3 ? 34 : 1)
                        .opacity(stage >= 3 ? 0 : 0.9)
                        .animation(.easeOut(duration: 1.4), value: stage)
                    Image(systemName: "lock.fill")
                        .font(.system(size: 18, weight: .semibold))
                        .foregroundStyle(Ink.onLi)
                        .frame(width: 44, height: 44)
                        .background(Ink.li, in: Circle())
                        .shadow(color: Ink.li.opacity(0.6), radius: 17)
                        .scaleEffect(stage >= 3 ? 1 : 0)
                }
                .frame(height: 120)

                Text("Lié à \(pcName)")
                    .font(.geist(32, .semibold)).tracking(-1.5)
                    .opacity(stage >= 4 ? 1 : 0)
                    .offset(y: stage >= 4 ? 0 : 16)

                VStack(spacing: 10) {
                    ForEach(Array(["Relié pour de bon", "Chiffré de bout en bout", "Se reconnecte tout seul"].enumerated()), id: \.offset) { pair in
                        let i = pair.offset
                        Label(pair.element, systemImage: "checkmark")
                            .font(.geist(14))
                            .padding(.horizontal, 16).frame(height: 40)
                            .background(Ink.li.opacity(0.07), in: Capsule())
                            .overlay(Capsule().stroke(Ink.li.opacity(0.35)))
                            .opacity(stage >= 5 + i ? 1 : 0)
                            .offset(y: stage >= 5 + i ? 0 : 16)
                    }
                }

                Button { leave() } label: {
                    Text("Aller à l’accueil")
                        .overlay(alignment: .bottomLeading) {
                            GeometryReader { g in
                                Capsule().fill(Ink.li).frame(width: progress ? g.size.width : 0, height: 3)
                                    .frame(maxHeight: .infinity, alignment: .bottom)
                            }
                        }
                }
                .buttonStyle(GhostButtonStyle())
                .opacity(stage >= 2 ? 1 : 0)
            }
            .padding(.horizontal, 26)
            .offset(x: leaving ? -280 : 0)
            .opacity(leaving ? 0 : 1)
        }
        .onAppear(perform: play)
    }

    private func play() {
        UINotificationFeedbackGenerator().notificationOccurred(.success)
        // Same timing as the PC animation (E8).
        let steps: [(Double, Int)] = [(0.0, 1), (0.9, 2), (1.5, 3), (1.7, 4), (2.1, 5), (2.3, 6), (2.5, 7)]
        for (t, s) in steps {
            DispatchQueue.main.asyncAfter(deadline: .now() + t) {
                withAnimation(.spring(duration: 0.7)) { stage = max(stage, s) }
            }
        }
        withAnimation(.linear(duration: 8)) { progress = true }
        DispatchQueue.main.asyncAfter(deadline: .now() + 8) { leave() }
    }

    private func leave() {
        guard !leaving else { return }
        withAnimation(.easeIn(duration: 0.6)) { leaving = true }
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.65) { link.finishPairing() }
    }
}

struct DeviceTile: View {
    let symbol: String
    let color: Color

    var body: some View {
        Image(systemName: symbol)
            .font(.system(size: 34, weight: .light))
            .foregroundStyle(color)
            .frame(width: 84, height: 84)
            .background(Color(hex: 0x11161D), in: RoundedRectangle(cornerRadius: 26, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: 26, style: .continuous).stroke(Ink.line2))
    }
}
