// Screens once paired (design V2, ADR-0016): tab bar Accueil, Cam, Drop,
// Réglages. Everything fine-grained is set on the PC; the iPhone stays minimal.

@preconcurrency import AVFoundation
import PhotosUI
import SwiftUI
import UIKit

enum AppTab: Hashable {
    case home, cam, drop, settings
}

struct RootView: View {
    @EnvironmentObject var link: PCLink
    @EnvironmentObject var camera: Camera
    @State private var scanning = false
    @State private var tab: AppTab = .home
    @State private var arrived = false

    var body: some View {
        ZStack {
            Color.black.ignoresSafeArea()
            if case let .linked(name) = link.pairStep {
                LinkedView(pcName: name)
                    .transition(.opacity)
                    .onDisappear {
                        scanning = false
                        tab = .home
                        arrived = true
                    }
            } else if scanning {
                ScanView(scanning: $scanning).transition(.move(edge: .trailing))
            } else if link.pc == nil {
                WelcomeView(scanning: $scanning).transition(.opacity)
            } else {
                TabShell(tab: $tab, arrived: $arrived, scanning: $scanning)
                    .transition(.move(edge: .trailing).combined(with: .opacity))
            }
        }
        .animation(.spring(duration: 0.6), value: link.pc)
        .animation(.spring(duration: 0.5), value: scanning)
        .onChange(of: link.wantsCam) { _, want in
            if want { tab = .cam; link.wantsCam = false }
        }
        // Plugged on the welcome screen (cable E5): the code shows on the scan screen.
        .onChange(of: link.pairStep) { _, step in
            if case .connecting(host: PCLink.cableHost, _) = step, link.pc == nil { scanning = true }
        }
        .onChange(of: link.pc) { _, pc in
            if pc == nil { tab = .home; camera.close() }
        }
    }
}

struct TabShell: View {
    @EnvironmentObject var link: PCLink
    @EnvironmentObject var camera: Camera
    @Environment(\.scenePhase) private var phase
    @Binding var tab: AppTab
    @Binding var arrived: Bool
    @Binding var scanning: Bool

    var body: some View {
        ZStack(alignment: .bottom) {
            Group {
                switch tab {
                case .home: HomeView(tab: $tab, arrived: $arrived)
                case .cam: CamView(tab: $tab)
                case .drop: DropView()
                case .settings: SettingsView(scanning: $scanning)
                }
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            if tab != .cam {
                TabBar(tab: $tab).padding(.horizontal, 16).padding(.bottom, 8)
            }
        }
        .onChange(of: tab) { _, t in
            // ADR-0018: opening Cam starts the camera, paused.
            if t == .cam { camera.open() } else { camera.close() }
        }
        .onAppear { if tab == .cam { camera.open() } }
        // Back from the background on the Cam tab: iOS closed the camera, open it again.
        .onChange(of: phase) { _, p in
            if p == .active, tab == .cam { camera.open() }
        }
    }
}

struct TabBar: View {
    @Binding var tab: AppTab

    var body: some View {
        HStack {
            item(.home, "house", L("Home", "Accueil"))
            item(.cam, "video", "Cam")
            item(.drop, "arrow.up.arrow.down", "Drop")
            item(.settings, "slider.horizontal.3", L("Settings", "Réglages"))
        }
        .padding(8)
        .frame(height: 68)
        .background(Color(hex: 0x161A21, alpha: 0.76), in: RoundedRectangle(cornerRadius: 26, style: .continuous))
        .background(.ultraThinMaterial, in: RoundedRectangle(cornerRadius: 26, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 26, style: .continuous).stroke(Ink.line))
        .shadow(color: .black.opacity(0.6), radius: 25, y: 20)
    }

    private func item(_ t: AppTab, _ symbol: String, _ label: String) -> some View {
        let on = tab == t
        return Button {
            withAnimation(.spring(duration: 0.45)) { tab = t }
        } label: {
            HStack(spacing: 8) {
                Image(systemName: symbol).font(.system(size: 19, weight: .medium))
                if on { Text(label).font(.geist(14, .semibold)) }
            }
            .foregroundStyle(on ? Color.black : Ink.tx2)
            .padding(.horizontal, 14)
            .frame(minWidth: 52, minHeight: 52)
            .background(on ? Ink.tx : .clear, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
        }
        .frame(maxWidth: on ? .infinity : nil)
        .accessibilityLabel(label)
    }
}

// MARK: - Accueil

struct HomeView: View {
    @EnvironmentObject var link: PCLink
    @Binding var tab: AppTab
    @Binding var arrived: Bool
    @State private var toast = false

    private var online: Bool { link.phase == .online }

    var body: some View {
        ZStack(alignment: .top) {
            Trame(count: 12, height: 520)
            VStack(spacing: 14) {
                HStack {
                    HStack(spacing: 10) { Mark(); Text("hyphn").font(.geist(20, .semibold)) }
                    Spacer()
                    HStack(spacing: 8) {
                        Led(on: online)
                        Text(online ? "\(link.pcName) · \(link.viaCable ? L("cable", "câble") : "Wi-Fi")" : link.phase == .searching ? L("\(link.pcName) · searching…", "\(link.pcName) · recherche…") : L("\(link.pcName) · offline", "\(link.pcName) · hors ligne"))
                            .font(.geist(13))
                    }
                    .padding(.horizontal, 12).frame(height: 36)
                    .background(Color(hex: 0x14181F, alpha: 0.7), in: Capsule())
                    .overlay(Capsule().stroke(Ink.line))
                }
                .padding(.horizontal, 4)
                .padding(.top, 6)

                camCard
                dropCard
                Spacer()
            }
            .padding(.horizontal, 16)
            .padding(.bottom, 90)

            if toast {
                Label(L("Paired with \(link.pcName)", "Lié à \(link.pcName)"), systemImage: "checkmark.circle.fill")
                    .font(.geist(14, .semibold))
                    .padding(.horizontal, 16).frame(height: 44)
                    .background(Color(hex: 0x141A12, alpha: 0.9), in: Capsule())
                    .overlay(Capsule().stroke(Ink.li.opacity(0.4)))
                    .padding(.top, 60)
                    .transition(.move(edge: .top).combined(with: .opacity))
            }
        }
        .onAppear {
            guard arrived else { return }
            arrived = false
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.8) { withAnimation(.spring) { toast = true } }
            DispatchQueue.main.asyncAfter(deadline: .now() + 4.5) { withAnimation { toast = false } }
        }
    }

    private var camCard: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack {
                HStack(spacing: 8) {
                    Led(on: online)
                    Text(online ? L("Ready", "Prête") : link.phase == .searching ? L("Looking for the PC…", "Recherche du PC…") : L("PC not found", "PC introuvable"))
                }
                .font(.geist(12, .semibold))
                .foregroundStyle(online ? Color(hex: 0xD7F7A6) : Ink.tx3)
                .padding(.horizontal, 11).frame(height: 30)
                .background(online ? Ink.li.opacity(0.10) : Color.white.opacity(0.05), in: Capsule())
                .overlay(Capsule().stroke(online ? Ink.li.opacity(0.3) : Ink.line))
                Spacer()
                HStack(spacing: 6) {
                    Image(systemName: "iphone").frame(width: 30, height: 30).background(Color.white.opacity(0.06), in: RoundedRectangle(cornerRadius: 10))
                    DashLine().frame(width: 46, height: 10)
                    Image(systemName: "desktopcomputer").foregroundStyle(Ink.co).frame(width: 30, height: 30).background(Color.white.opacity(0.06), in: RoundedRectangle(cornerRadius: 10))
                }
                .font(.system(size: 14))
                .foregroundStyle(Ink.tx2)
            }
            Spacer()
            Text("Cam").font(.geist(68, .semibold)).tracking(-4)
            Text(LocalizedStringKey(L("Your iPhone becomes the webcam for **\(link.pcName)**.", "Ton iPhone devient la webcam de **\(link.pcName)**.")))
                .font(.geist(16)).foregroundStyle(Ink.tx2).padding(.top, 6)
            HStack(spacing: 6) {
                chip("\(link.camControl.height >= 2160 ? "4K" : "\(link.camControl.height)p") · \(link.camControl.fps) \(L("fps", "i/s"))", mono: true)
                chip(L("Starts paused", "Démarre en pause"), mono: false)
            }
            .padding(.vertical, 16)
            if case let .offline(msg) = link.phase {
                if !msg.isEmpty { Text(msg).font(.geist(13)).foregroundStyle(Ink.am).padding(.bottom, 10) }
                Button { link.reconnectNow() } label: { Label(L("Reconnect", "Reconnecter"), systemImage: "arrow.clockwise") }
                    .buttonStyle(GhostButtonStyle())
            } else {
                Button { withAnimation(.spring(duration: 0.45)) { tab = .cam } } label: {
                    HStack {
                        Text(L("Start the camera", "Lancer la caméra"))
                        Spacer()
                        Image(systemName: "arrow.right")
                            .font(.system(size: 18, weight: .bold))
                            .foregroundStyle(Ink.co)
                            .frame(width: 46, height: 46)
                            .background(Ink.onCo, in: RoundedRectangle(cornerRadius: 15))
                    }
                    .font(.geist(17, .bold))
                    .foregroundStyle(Ink.onCo)
                    .padding(.leading, 22).padding(.trailing, 8)
                    .frame(height: 62)
                    .background(Ink.co, in: RoundedRectangle(cornerRadius: 20, style: .continuous))
                }
                .disabled(!online)
                .opacity(online ? 1 : 0.5)
            }
        }
        .padding(22)
        .frame(height: 376)
        .background(
            ZStack {
                Color(hex: 0x0C0E13)
                RadialGradient(colors: [Ink.co.opacity(online ? 0.45 : 0.1), .clear], center: .topTrailing, startRadius: 0, endRadius: 260)
                RadialGradient(colors: [Ink.am.opacity(0.16), .clear], center: .bottomLeading, startRadius: 0, endRadius: 220)
            }
        )
        .clipShape(RoundedRectangle(cornerRadius: 32, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 32, style: .continuous).stroke(online ? Ink.co.opacity(0.26) : Ink.line))
        .shadow(color: .black.opacity(0.6), radius: 40, y: 30)
    }

    private var dropCard: some View {
        Button { withAnimation(.spring(duration: 0.45)) { tab = .drop } } label: {
            HStack(spacing: 14) {
                ZStack {
                    RoundedRectangle(cornerRadius: 10).fill(LinearGradient(colors: [Color(hex: 0x8E7CFF), Color(hex: 0x4A3BB5)], startPoint: .topLeading, endPoint: .bottomTrailing)).frame(width: 40, height: 40).rotationEffect(.degrees(-12)).offset(x: -9, y: 6)
                    RoundedRectangle(cornerRadius: 10).fill(LinearGradient(colors: [Ink.cy, Color(hex: 0x2D6CDF)], startPoint: .topLeading, endPoint: .bottomTrailing)).frame(width: 40, height: 40).rotationEffect(.degrees(-2))
                    RoundedRectangle(cornerRadius: 10).fill(LinearGradient(colors: [Ink.am, Ink.co], startPoint: .topLeading, endPoint: .bottomTrailing)).frame(width: 40, height: 40).rotationEffect(.degrees(9)).offset(x: 9, y: -6)
                }
                .frame(width: 58, height: 58)
                VStack(alignment: .leading, spacing: 2) {
                    Text("Drop").font(.geist(17, .semibold))
                    Text(L("Coming soon", "Bientôt")).font(.geist(13)).foregroundStyle(Ink.tx2)
                }
                Spacer()
            }
            .padding(16)
            .background(Color(hex: 0x11151C, alpha: 0.78), in: RoundedRectangle(cornerRadius: 24, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: 24, style: .continuous).stroke(Ink.line))
        }
        .foregroundStyle(Ink.tx)
    }

    private func chip(_ t: String, mono: Bool) -> some View {
        Text(t)
            .font(mono ? .mono(12) : .geist(12))
            .foregroundStyle(Ink.tx2)
            .padding(.horizontal, 11).frame(height: 30)
            .background(Color.white.opacity(0.06), in: RoundedRectangle(cornerRadius: 10))
            .overlay(RoundedRectangle(cornerRadius: 10).stroke(Ink.line))
    }
}

struct DashLine: View {
    @State private var phase: CGFloat = 0

    var body: some View {
        Path { p in p.move(to: CGPoint(x: 2, y: 5)); p.addLine(to: CGPoint(x: 44, y: 5)) }
            .stroke(Ink.co, style: StrokeStyle(lineWidth: 2, dash: [3, 5], dashPhase: phase))
            .onAppear { withAnimation(.linear(duration: 1).repeatForever(autoreverses: false)) { phase = -8 } }
    }
}

// MARK: - Cam

struct CamView: View {
    @EnvironmentObject var link: PCLink
    @EnvironmentObject var camera: Camera
    @Binding var tab: AppTab
    @AppStorage("autoBlack") private var autoBlack = true
    @State private var black = false
    @State private var sheet = false
    @State private var savedBrightness: CGFloat = 0.5
    @State private var idle: Task<Void, Never>?

    var body: some View {
        ZStack {
            Color.black.ignoresSafeArea()
            CameraPreview(session: camera.session).ignoresSafeArea()

            if !camera.live {
                VStack(spacing: 10) {
                    Spacer()
                    Text(L("Paused", "En pause")).font(.geist(30, .semibold)).tracking(-1)
                    Spacer().frame(height: 260)
                }
                .frame(maxWidth: .infinity, maxHeight: .infinity)
                .background(Color.black.opacity(0.45))
                .allowsHitTesting(false)
            }
            if camera.denied {
                Problem(title: L("Camera denied", "Caméra refusée"), text: L("Allow the camera in Settings › Hyphn to use Cam.", "Autorise la caméra dans Settings › Hyphn pour utiliser Cam."), settings: true)
                    .padding(20)
                    .background(Ink.card, in: RoundedRectangle(cornerRadius: 28))
                    .padding(16)
            }

            VStack {
                topBar
                Spacer()
                notices
                lensRow
                controls
            }
            .padding(.horizontal, 16)
            .padding(.bottom, 12)

            if black { blackScreen }
        }
        .contentShape(Rectangle())
        .simultaneousGesture(TapGesture().onEnded { armIdle() })
        .sheet(isPresented: $sheet) { QualitySheet().presentationDetents([.height(320)]).presentationBackground(Ink.card) }
        .onAppear { savedBrightness = UIScreen.main.brightness; armIdle() }
        .onDisappear { idle?.cancel(); wake() }
    }

    private var topBar: some View {
        HStack {
            Button { withAnimation(.spring(duration: 0.45)) { tab = .home } } label: {
                Image(systemName: "xmark").frame(width: 44, height: 44).background(.ultraThinMaterial, in: Circle())
            }
            .accessibilityLabel(L("Close Cam", "Fermer Cam"))
            Spacer()
            HStack(spacing: 8) {
                if camera.live {
                    Circle().fill(Ink.co).frame(width: 8, height: 8)
                    Text(L("LIVE", "ENVOI")).font(.geist(12, .bold))
                } else {
                    Image(systemName: "pause.fill").font(.system(size: 11))
                    Text(L("PAUSED", "PAUSE")).font(.geist(12, .bold))
                }
                Text(String(format: "%.1f Mb/s", camera.sentMbps)).font(.mono(12))
            }
            .foregroundStyle(camera.live ? Color(hex: 0xFFB3A6) : Ink.tx)
            .padding(.horizontal, 12).frame(height: 36)
            .background(.ultraThinMaterial, in: Capsule())
            Spacer()
            Button { sheet = true } label: {
                Text(qualityText).font(.mono(13, .semibold))
                    .padding(.horizontal, 12).frame(height: 44).background(.ultraThinMaterial, in: Capsule())
            }
            .accessibilityLabel(L("Choose the quality", "Choisir la qualité"))
        }
        .foregroundStyle(Ink.tx)
    }

    private var qualityText: String {
        let h = link.camControl.height
        return "\(h >= 2160 ? "4K" : "\(h)p")\(link.camControl.fps)"
    }

    @ViewBuilder private var notices: some View {
        switch DeviceInfo.thermal {
        case .serious: notice(L("Hot: 30 fps", "Chaud : 30 images/s"))
        case .critical: notice(L("Very hot: 1080p30", "Très chaud : 1080p30"))
        default: EmptyView()
        }
        if link.phase != .online { notice(L("Reconnecting…", "Reconnexion…")) }
    }

    private func notice(_ t: String) -> some View {
        Text(t).font(.geist(13, .semibold)).foregroundStyle(Ink.am)
            .padding(.horizontal, 14).frame(height: 34)
            .background(.ultraThinMaterial, in: Capsule())
            .padding(.bottom, 10)
    }

    private var lensRow: some View {
        HStack(spacing: 10) {
            ForEach(0..<4, id: \.self) { i in
                let on = camera.lens == UInt32(i) && !camera.front
                Button { camera.pickLens(UInt32(i)) } label: {
                    Text([L("0.5", "0,5"), "1×", "2", "5"][i])
                        .font(.mono(on ? 14 : 12, .semibold))
                        .foregroundStyle(on ? Ink.am : Ink.tx)
                        .frame(width: on ? 46 : 38, height: on ? 46 : 38)
                        .background(Color.black.opacity(0.45), in: Circle())
                        .overlay(Circle().stroke(on ? Ink.am.opacity(0.6) : Ink.line))
                }
                .disabled(camera.front)
                .accessibilityLabel(L("Lens \(["0.5×", "1×", "2×", "5×"][i])", "Objectif \(["0,5×", "1×", "2×", "5×"][i])"))
            }
        }
        .padding(.bottom, 18)
        .opacity(camera.front ? 0.35 : 1)
    }

    private var controls: some View {
        HStack(alignment: .top) {
            sideButton("arrow.triangle.2.circlepath", label: camera.front ? L("Front", "Avant") : L("Back", "Arrière")) { camera.flip() }
            Spacer()
            VStack(spacing: 8) {
                Button { camera.toggleLive() } label: {
                    ZStack {
                        Circle().stroke(camera.live ? Ink.co : Ink.tx, lineWidth: 3).frame(width: 84, height: 84)
                        Circle().fill(camera.live ? Ink.tx : Ink.co).frame(width: 68, height: 68)
                        Image(systemName: camera.live ? "pause.fill" : "play.fill")
                            .font(.system(size: 24, weight: .bold))
                            .foregroundStyle(camera.live ? Color.black : Ink.onCo)
                    }
                }
                .disabled(link.phase != .online || camera.denied)
                .accessibilityLabel(camera.live ? "Pause" : L("Show", "Afficher"))
                Text(camera.live ? "Pause" : L("Show", "Afficher")).font(.geist(12, .semibold))
            }
            Spacer()
            sideButton("moon.fill", label: L("Black screen", "Écran noir")) { sleep() }
        }
        .foregroundStyle(Ink.tx)
        .padding(.horizontal, 20)
    }

    private func sideButton(_ symbol: String, label: String, action: @escaping () -> Void) -> some View {
        VStack(spacing: 8) {
            Button(action: action) {
                Image(systemName: symbol).font(.system(size: 20)).frame(width: 56, height: 56).background(.ultraThinMaterial, in: Circle())
            }
            .accessibilityLabel(label)
            Text(label).font(.geist(12)).foregroundStyle(Ink.tx2)
        }
    }

    private var blackScreen: some View {
        Color.black.ignoresSafeArea()
            .overlay {
                VStack(spacing: 10) {
                    Circle().fill(camera.live ? Ink.co : Ink.tx3).frame(width: 8, height: 8)
                    Text(camera.live ? L("LIVE", "EN DIRECT") : L("PAUSED", "EN PAUSE")).font(.geist(13, .semibold)).foregroundStyle(Color(hex: 0x4F5560))
                    Text(L("Double-tap to wake", "Touche deux fois pour rallumer")).font(.geist(12)).foregroundStyle(Color(hex: 0x3A3F48))
                }
            }
            .onTapGesture(count: 2) { wake(); armIdle() }
            .accessibilityLabel(L("Double-tap to turn the screen back on", "Toucher deux fois pour rallumer l’écran"))
    }

    /// E6: black screen by hand, or after 30 s without a touch (setting on by default).
    private func sleep() {
        guard !black else { return }
        savedBrightness = UIScreen.main.brightness
        black = true
        UIScreen.main.brightness = 0
    }

    private func wake() {
        guard black else { return }
        black = false
        UIScreen.main.brightness = savedBrightness
    }

    private func armIdle() {
        idle?.cancel()
        guard autoBlack else { return }
        idle = Task { @MainActor in
            try? await Task.sleep(for: .seconds(30))
            guard !Task.isCancelled else { return }
            sleep()
        }
    }
}

struct CameraPreview: UIViewRepresentable {
    let session: AVCaptureSession

    func makeUIView(context: Context) -> PreviewView {
        let v = PreviewView()
        v.previewLayer.session = session
        v.previewLayer.videoGravity = .resizeAspectFill
        return v
    }

    func updateUIView(_ v: PreviewView, context: Context) {}
}

struct QualitySheet: View {
    @EnvironmentObject var link: PCLink
    @EnvironmentObject var camera: Camera
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        VStack(spacing: 18) {
            Text(L("Stream quality", "Qualité envoyée")).font(.geist(20, .semibold))
            segment(L("Quality", "Qualité"), [(2160, "4K"), (1080, "1080p"), (720, "720p")], current: link.camControl.height) {
                camera.pickQuality(height: $0, fps: link.camControl.fps)
            }
            segment(L("Frames per second", "Images par seconde"), [(24, "24"), (30, "30"), (60, "60")], current: link.camControl.fps) {
                camera.pickQuality(height: link.camControl.height, fps: $0)
            }
            Button("OK") { dismiss() }.buttonStyle(PrimaryButtonStyle(fill: Ink.tx, text: .black))
        }
        .padding(22)
        .foregroundStyle(Ink.tx)
    }

    private func segment(_ title: String, _ items: [(UInt32, String)], current: UInt32, pick: @escaping (UInt32) -> Void) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(title).font(.geist(13)).foregroundStyle(Ink.tx2)
            HStack(spacing: 4) {
                ForEach(items.indices, id: \.self) { i in
                    let v = items[i].0
                    Button { pick(v) } label: {
                        Text(items[i].1).font(.geist(14, .semibold))
                            .foregroundStyle(v == current ? Color.black : Ink.tx)
                            .frame(maxWidth: .infinity, minHeight: 40)
                            .background(v == current ? Ink.tx : .clear, in: RoundedRectangle(cornerRadius: 10))
                    }
                }
            }
            .padding(4)
            .background(Color.white.opacity(0.06), in: RoundedRectangle(cornerRadius: 14))
        }
    }
}

// MARK: - Drop (spec `Drop - Photos vers le PC`, ADR-0029)

struct DropView: View {
    @EnvironmentObject var link: PCLink
    @EnvironmentObject var dropper: Dropper
    @State private var picked: [PhotosPickerItem] = []
    @State private var showPicker = false
    @State private var showAlbums = false
    @State private var showFiles = false
    /// First time: why Hyphn needs the photos, before iOS asks (E3).
    @State private var explain: (() -> Void)?
    @State private var shown = false

    private var online: Bool { link.phase == .online }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 18) {
                VStack(alignment: .leading, spacing: 6) {
                    Text("Drop").font(.geist(34, .semibold)).tracking(-1.2)
                    Text(L("To \(link.pcName)", "Vers \(link.pcName)")).font(.geist(15)).foregroundStyle(Ink.tx2)
                }
                .padding(.top, 8)
                content
                    .id(stage)
                    .transition(.asymmetric(insertion: .move(edge: .trailing).combined(with: .opacity),
                                            removal: .move(edge: .leading).combined(with: .opacity)))
            }
            .padding(.horizontal, 18)
            .padding(.bottom, 110)
        }
        .scrollIndicators(.hidden)
        .animation(.spring(duration: 0.5), value: stage)
        .photosPicker(isPresented: $showPicker, selection: $picked, matching: .any(of: [.images, .videos]),
                      preferredItemEncoding: .current, photoLibrary: .shared())
        .fileImporter(isPresented: $showFiles, allowedContentTypes: [.item], allowsMultipleSelection: true) { r in
            if case let .success(urls) = r, !urls.isEmpty { start(.files(urls)) }
        }
        .sheet(isPresented: $showAlbums) {
            AlbumList { album in
                showAlbums = false
                start(.album(album))
            }
            .presentationDetents([.medium, .large])
        }
        .onChange(of: picked) { _, items in
            guard !items.isEmpty else { return }
            let ids = items.compactMap(\.itemIdentifier)
            picked = []
            start(.picks(ids))
        }
        .onAppear { shown = true }
    }

    /// Which screen, for the slide between steps.
    private var stage: String {
        if explain != nil { return "explain" }
        switch dropper.phase {
        case .idle: return "choose"
        case .preparing: return "preparing"
        case .alreadySent: return "alreadySent"
        case .review: return "review"
        case .waitingPC: return "waitingPC"
        case .sending: return "sending"
        case .done: return "done"
        case .failed: return "failed"
        }
    }

    private func start(_ s: Dropper.Source) {
        dropper.send(s)
    }

    /// Runs `then` once Photos access is there; the first time, through the
    /// explanation step.
    private func withPhotos(_ then: @escaping () -> Void) {
        if PHPhotoLibrary.authorizationStatus(for: .readWrite) == .notDetermined {
            explain = then
        } else {
            then()
        }
    }

    @ViewBuilder private var content: some View {
        if let next = explain {
            card {
                VStack(alignment: .leading, spacing: 14) {
                    icon("lock.shield", Ink.cy)
                    Text(L("Hyphn needs your photos", "Hyphn a besoin de tes photos")).font(.geist(22, .semibold)).tracking(-0.6)
                    Text(L("Only to send the ones you choose to your PC, directly and encrypted. Nothing goes anywhere else.", "Seulement pour envoyer celles que tu choisis à ton PC, directement et chiffrées. Rien ne part ailleurs."))
                        .font(.geist(14)).foregroundStyle(Ink.tx2)
                    Text(L("iOS will ask for access: choose “Allow Full Access” so you can send anything.", "iOS va te demander l’accès : choisis « Allow Full Access » pour tout pouvoir envoyer."))
                        .font(.geist(13)).foregroundStyle(Ink.tx3)
                    Button(L("Continue", "Continuer")) {
                        Task {
                            _ = await Dropper.askPhotos()
                            explain = nil
                            next()
                        }
                    }
                    .buttonStyle(PrimaryButtonStyle(fill: Ink.cy, text: .black))
                    Button(L("Not Now", "Plus tard")) { explain = nil }.buttonStyle(GhostButtonStyle())
                }
            }
        } else {
            switch dropper.phase {
            case .idle: choose
            case .preparing:
                card {
                    HStack(spacing: 14) {
                        ProgressView().tint(Ink.cy)
                        VStack(alignment: .leading, spacing: 3) {
                            Text(L("Getting the send ready…", "Je prépare l’envoi…")).font(.geist(17, .semibold))
                            Text(L("Asking the PC what it already has.", "Je demande au PC ce qu’il a déjà.")).font(.geist(13)).foregroundStyle(Ink.tx2)
                        }
                    }
                }
            case let .alreadySent(already, total):
                card {
                    VStack(alignment: .leading, spacing: 12) {
                        icon("arrow.triangle.2.circlepath", Ink.am)
                        Text(already == total ? L("Already sent", "Déjà envoyé\(total > 1 ? "s" : "")") : L("\(already) already sent", "\(already) déjà envoyé\(already > 1 ? "s" : "")"))
                            .font(.geist(26, .semibold)).tracking(-0.8)
                        Text(already == total
                             ? L(total > 1 ? "These \(total) items are already on \(link.pcName)." : "This item is already on \(link.pcName).",
                                 "\(total > 1 ? "Ces \(total) éléments sont" : "Cet élément est") déjà arrivé\(total > 1 ? "s" : "") sur \(link.pcName).")
                             : L("Of the \(total) you chose, \(already) are already on \(link.pcName).",
                                 "Sur les \(total) choisis, \(already) sont déjà arrivés sur \(link.pcName)."))
                            .font(.geist(15)).foregroundStyle(Ink.tx2)
                        Text(L("If you deleted them from the PC, send them again. The ones still there won't be copied twice.", "Si tu les as supprimés du PC, renvoie-les. Ceux encore présents ne seront pas copiés deux fois."))
                            .font(.geist(13)).foregroundStyle(Ink.tx3)
                        if already < total {
                            Button(L("Send the \(total - already) new one\(total - already > 1 ? "s" : "")", "Envoyer les \(total - already) nouveau\(total - already > 1 ? "x" : "")")) { dropper.answerAlready(false) }
                                .buttonStyle(PrimaryButtonStyle(fill: Ink.cy, text: .black)).padding(.top, 4)
                            Button(L("Send All Again", "Tout renvoyer")) { dropper.answerAlready(true) }.buttonStyle(GhostButtonStyle())
                        } else {
                            Button(L("Send Them Again", "Les renvoyer")) { dropper.answerAlready(true) }
                                .buttonStyle(PrimaryButtonStyle(fill: Ink.cy, text: .black)).padding(.top, 4)
                        }
                        Button(L("Cancel", "Annuler")) { dropper.cancel() }
                            .font(.geist(15, .medium)).foregroundStyle(Ink.tx2)
                            .frame(maxWidth: .infinity).padding(.top, 2)
                    }
                }
            case let .review(items, bytes):
                card {
                    VStack(alignment: .leading, spacing: 12) {
                        Text(L("PREVIEW", "APERÇU")).font(.geist(12, .bold)).tracking(1.5).foregroundStyle(Ink.cy)
                        Text(L("Send \(items) item\(items > 1 ? "s" : "")?", "Envoyer \(items) élément\(items > 1 ? "s" : "") ?")).font(.geist(26, .semibold)).tracking(-0.8)
                        PreviewGrid(previews: dropper.previews, total: items)
                        Text(Self.kinds(dropper) + " · \(Self.size(bytes)) \(L("to", "vers")) \(link.pcName)")
                            .font(.geist(14)).foregroundStyle(Ink.tx2)
                        if dropper.already > 0 {
                            Text(L("\(dropper.already) already on the PC: not sent again.", "\(dropper.already) déjà sur le PC : pas renvoyé\(dropper.already > 1 ? "s" : "")."))
                                .font(.geist(13)).foregroundStyle(Ink.li)
                        }
                        Text(L("Your PC will then ask you to confirm.", "Ton PC te demandera ensuite de confirmer.")).font(.geist(13)).foregroundStyle(Ink.tx3)
                        Button(L("Send", "Envoyer")) { dropper.confirmReview(true) }
                            .buttonStyle(PrimaryButtonStyle(fill: Ink.cy, text: .black)).padding(.top, 4)
                        Button(L("Cancel", "Annuler")) { dropper.cancel() }.buttonStyle(GhostButtonStyle())
                    }
                }
            case .waitingPC:
                card {
                    VStack(alignment: .leading, spacing: 14) {
                        WaitingPC()
                        Text(L("Confirm on your PC", "Confirme sur ton PC")).font(.geist(24, .semibold)).tracking(-0.7)
                        Text(L("\(link.pcName) shows a window to accept the send. The first time, it also asks where to save the photos.", "\(link.pcName) affiche une fenêtre pour accepter l’envoi. La première fois, il te demande aussi où ranger les photos."))
                            .font(.geist(14)).foregroundStyle(Ink.tx2)
                        Button(L("Cancel", "Annuler")) { dropper.cancel() }.buttonStyle(GhostButtonStyle()).padding(.top, 4)
                    }
                }
            case .sending: card { sending }
            case let .done(items, bytes, failed, already):
                card {
                    VStack(alignment: .leading, spacing: 12) {
                        Image(systemName: "checkmark").font(.system(size: 22, weight: .bold)).foregroundStyle(Ink.onLi)
                            .frame(width: 56, height: 56).background(Ink.li, in: Circle())
                            .shadow(color: Ink.li.opacity(0.5), radius: 14)
                            .scaleEffect(shown ? 1 : 0.3)
                        Text(items > 0 ? L("\(items) item\(items > 1 ? "s" : "") on the PC", "\(items) élément\(items > 1 ? "s" : "") sur le PC") : L("Everything is already on the PC", "Tout est déjà sur le PC"))
                            .font(.geist(24, .semibold)).tracking(-0.7)
                        Text([items > 0 ? L("\(Self.size(bytes)) · checked one by one", "\(Self.size(bytes)) · vérifiés un par un") : nil,
                              already > 0 ? L("\(already) already there", "\(already) déjà dessus") : nil].compactMap { $0 }.joined(separator: " · "))
                            .font(.geist(14)).foregroundStyle(Ink.tx2)
                        if failed > 0 {
                            Text(L("\(failed) not sent (not found, or couldn't be downloaded from iCloud).", "\(failed) non envoyé\(failed > 1 ? "s" : "") (introuvable, ou impossible à télécharger depuis iCloud)."))
                                .font(.geist(13)).foregroundStyle(Ink.am)
                        }
                        Button(L("Send Something Else", "Envoyer autre chose")) { dropper.reset() }.buttonStyle(GhostButtonStyle()).padding(.top, 4)
                    }
                }
            case let .failed(message):
                card {
                    VStack(spacing: 14) {
                        Problem(title: L("Send stopped", "Envoi arrêté"), text: message, settings: dropper.needsAccess)
                        Button("OK") { dropper.reset() }.buttonStyle(GhostButtonStyle())
                    }
                }
            }
        }
    }

    /// « Que veux-tu envoyer ? » (E1): one big card for photos, two beside
    /// it for an album and files, coming in one after the other.
    private var choose: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text(L("What do you want to send?", "Que veux-tu envoyer ?")).font(.geist(22, .semibold)).tracking(-0.6).padding(.top, 4)
            Button { withPhotos { showPicker = true } } label: {
                ChoiceCard(symbol: "photo.on.rectangle.angled", color: Ink.cy, title: L("Photos and videos", "Photos et vidéos"),
                           text: L("Pick them from your library, in original quality.", "Choisis-les dans ta photothèque, en qualité d’origine."), big: true)
            }
            .buttonStyle(PressStyle())
            .modifier(Arrive(shown: shown, index: 0, online: online))
            HStack(spacing: 12) {
                Button { withPhotos { showAlbums = true } } label: {
                    ChoiceCard(symbol: "rectangle.stack.fill", color: Ink.li, title: L("An album", "Un album"), text: L("The whole album at once.", "Tout l’album d’un coup."), big: false)
                }
                .buttonStyle(PressStyle())
                .modifier(Arrive(shown: shown, index: 1, online: online))
                Button { showFiles = true } label: {
                    ChoiceCard(symbol: "folder.fill", color: Ink.am, title: L("Files", "Des fichiers"), text: L("From the Files app.", "Depuis l’app Fichiers."), big: false)
                }
                .buttonStyle(PressStyle())
                .modifier(Arrive(shown: shown, index: 2, online: online))
            }
            .disabled(!online)
            if !online {
                Text(L("PC offline: open Hyphn on the PC.", "PC hors ligne : ouvre Hyphn sur le PC.")).font(.geist(13)).foregroundStyle(Ink.am)
            } else {
                Text(L("In original quality, checked one by one. Nothing is sent twice.", "En qualité d’origine, vérifié un par un. Rien n’est envoyé deux fois."))
                    .font(.geist(13)).foregroundStyle(Ink.tx3).padding(.top, 2)
            }
        }
    }

    /// E10: no percentage here (the PC knows what really arrived): the
    /// photos flying to the PC, and the file going now.
    private var sending: some View {
        let d = dropper
        return VStack(alignment: .leading, spacing: 14) {
            SendingFlow()
            Text(L("Sending", "Envoi en cours")).font(.geist(26, .semibold)).tracking(-0.8)
            Text(L("Follow the progress on \(link.pcName).", "Suis la progression sur \(link.pcName).")).font(.geist(14)).foregroundStyle(Ink.tx2)
            HStack(spacing: 10) {
                Image(systemName: "doc").font(.system(size: 13)).foregroundStyle(Ink.cy)
                Text(d.current.isEmpty ? L("Getting ready…", "Préparation…") : d.current).font(.geist(14)).lineLimit(1).truncationMode(.middle)
                    .contentTransition(.opacity).animation(.easeOut, value: d.current)
            }
            .padding(.horizontal, 12).frame(height: 38)
            .background(Color.white.opacity(0.05), in: Capsule())
            if let c = d.cloud {
                Text(L("Downloading from iCloud… \(Int(c * 100))%", "Téléchargement iCloud… \(Int(c * 100)) %")).font(.geist(13)).foregroundStyle(Ink.am)
            }
            Text(L("Keep Hyphn open while sending.", "Garde Hyphn ouvert pendant l’envoi.")).font(.geist(13)).foregroundStyle(Ink.tx3)
            Button(L("Cancel", "Annuler")) { d.cancel() }.buttonStyle(GhostButtonStyle()).padding(.top, 2)
        }
    }

    private func card<C: View>(@ViewBuilder _ c: () -> C) -> some View {
        c()
            .padding(20)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(Ink.card, in: RoundedRectangle(cornerRadius: 28, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: 28, style: .continuous).stroke(Ink.line))
    }

    private func icon(_ name: String, _ color: Color) -> some View {
        Image(systemName: name)
            .font(.system(size: 22)).foregroundStyle(color)
            .frame(width: 52, height: 52)
            .background(color.opacity(0.12), in: RoundedRectangle(cornerRadius: 17, style: .continuous))
    }

    /// « 32 photos · 14 vidéos · 2 fichiers ».
    static func kinds(_ d: Dropper) -> String {
        let parts: [(Int, String)] = [(d.photos, "photo"), (d.videos, L("video", "vidéo")), (d.docs, L("file", "fichier"))]
        return parts.filter { $0.0 > 0 }.map { "\($0.0) \($0.1)\($0.0 > 1 ? "s" : "")" }.joined(separator: " · ")
    }

    static func size(_ b: Int64) -> String {
        ByteCountFormatter.string(fromByteCount: b, countStyle: .file)
    }
}

/// Réglages › « Journal de la liaison »: the last link events, to see what
/// happened when the PC and the iPhone lost each other.
struct LinkJournal: View {
    @EnvironmentObject var link: PCLink
    @State private var open = false

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            Button { withAnimation(.spring(duration: 0.4)) { open.toggle() } } label: {
                HStack {
                    Text(L("Link log", "Journal de la liaison")).font(.geist(15))
                    Spacer()
                    Image(systemName: open ? "chevron.up" : "chevron.down").foregroundStyle(Ink.tx3)
                }
                .padding(14)
            }
            .foregroundStyle(Ink.tx)
            if open {
                VStack(alignment: .leading, spacing: 6) {
                    if link.journal.isEmpty {
                        Text(L("Nothing yet.", "Rien pour l’instant.")).font(.geist(13)).foregroundStyle(Ink.tx3)
                    }
                    ForEach(Array(link.journal.enumerated()), id: \.offset) { _, line in
                        Text(line).font(.mono(12)).foregroundStyle(Ink.tx2).textSelection(.enabled)
                    }
                }
                .padding([.horizontal, .bottom], 14)
            }
        }
        .background(Ink.card, in: RoundedRectangle(cornerRadius: 20, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 20, style: .continuous).stroke(Ink.line))
        .padding(.top, 12)
    }
}

/// One choice of « Que veux-tu envoyer ? »: a glowing icon, a title, a line.
struct ChoiceCard: View {
    let symbol: String
    let color: Color
    let title: String
    let text: String
    let big: Bool

    var body: some View {
        VStack(alignment: .leading, spacing: big ? 14 : 10) {
            HStack {
                Image(systemName: symbol)
                    .font(.system(size: big ? 26 : 21, weight: .medium)).foregroundStyle(color)
                    .frame(width: big ? 58 : 46, height: big ? 58 : 46)
                    .background(color.opacity(0.14), in: RoundedRectangle(cornerRadius: big ? 18 : 15, style: .continuous))
                    .shadow(color: color.opacity(0.35), radius: 14)
                Spacer()
                Image(systemName: "arrow.up.right").font(.system(size: 13, weight: .bold)).foregroundStyle(Ink.tx3)
            }
            Spacer(minLength: 0)
            Text(title).font(.geist(big ? 22 : 17, .semibold)).tracking(-0.5).foregroundStyle(Ink.tx)
            Text(text).font(.geist(13)).foregroundStyle(Ink.tx2).multilineTextAlignment(.leading)
                .fixedSize(horizontal: false, vertical: true)
        }
        .padding(big ? 20 : 16)
        .frame(maxWidth: .infinity, minHeight: big ? 190 : 160, alignment: .topLeading)
        .background(
            LinearGradient(colors: [color.opacity(big ? 0.16 : 0.1), Color.clear], startPoint: .topLeading, endPoint: .bottomTrailing),
            in: RoundedRectangle(cornerRadius: 26, style: .continuous))
        .background(Ink.card, in: RoundedRectangle(cornerRadius: 26, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 26, style: .continuous).stroke(color.opacity(0.28)))
    }
}

/// The choice cards come in one after the other.
struct Arrive: ViewModifier {
    let shown: Bool
    let index: Int
    let online: Bool

    func body(content: Content) -> some View {
        content
            .opacity(shown ? (online ? 1 : 0.45) : 0)
            .offset(y: shown ? 0 : 20)
            .scaleEffect(shown ? 1 : 0.96)
            .animation(.spring(duration: 0.6).delay(Double(index) * 0.08), value: shown)
    }
}

/// While sending: photos leave the iPhone and fly to the PC, one after the other.
struct SendingFlow: View {
    @State private var go = false
    private let colors: [Color] = [Ink.cy, Ink.li, Ink.co, Ink.am]

    var body: some View {
        HStack(spacing: 0) {
            end("iphone", Ink.tx)
            ZStack {
                Capsule().fill(Color.white.opacity(0.08)).frame(height: 3)
                GeometryReader { g in
                    ForEach(0..<4, id: \.self) { i in
                        RoundedRectangle(cornerRadius: 5, style: .continuous)
                            .fill(colors[i])
                            .frame(width: 18, height: 18)
                            .shadow(color: colors[i].opacity(0.7), radius: 8)
                            .offset(x: go ? g.size.width - 18 : 0, y: g.size.height / 2 - 9)
                            .opacity(go ? 0 : 1)
                            .scaleEffect(go ? 0.6 : 1)
                            .animation(.easeIn(duration: 1.6).repeatForever(autoreverses: false).delay(Double(i) * 0.4), value: go)
                    }
                }
            }
            .frame(height: 40)
            .padding(.horizontal, 8)
            end("desktopcomputer", Ink.cy)
        }
        .onAppear { go = true }
        .accessibilityHidden(true)
    }

    private func end(_ symbol: String, _ color: Color) -> some View {
        Image(systemName: symbol)
            .font(.system(size: 22)).foregroundStyle(color)
            .frame(width: 52, height: 52)
            .background(color.opacity(0.1), in: RoundedRectangle(cornerRadius: 16, style: .continuous))
    }
}

/// The first thumbnails of a send, the last tile counting the rest; they come
/// in one after the other.
struct PreviewGrid: View {
    let previews: [Dropper.Preview]
    let total: Int
    @State private var shown = false

    var body: some View {
        let cols = Array(repeating: GridItem(.flexible(), spacing: 6), count: 4)
        let room = total > previews.count ? previews.count - 1 : previews.count
        LazyVGrid(columns: cols, spacing: 6) {
            ForEach(Array(previews.prefix(max(room, 0)).enumerated()), id: \.element.id) { i, p in
                tile(p)
                    .opacity(shown ? 1 : 0)
                    .scaleEffect(shown ? 1 : 0.85)
                    .animation(.spring(duration: 0.45).delay(Double(i) * 0.04), value: shown)
            }
            if total > room, room >= 0 {
                RoundedRectangle(cornerRadius: 12, style: .continuous).fill(Color.white.opacity(0.06))
                    .aspectRatio(1, contentMode: .fit)
                    .overlay(Text("+\(total - room)").font(.mono(17, .semibold)).foregroundStyle(Ink.tx))
                    .opacity(shown ? 1 : 0)
                    .animation(.spring(duration: 0.45).delay(Double(room) * 0.04), value: shown)
            }
        }
        .onAppear { shown = true }
    }

    @ViewBuilder private func tile(_ p: Dropper.Preview) -> some View {
        Color.white.opacity(0.06)
            .aspectRatio(1, contentMode: .fit)
            .overlay {
                if let img = p.image {
                    Image(uiImage: img).resizable().scaledToFill()
                } else {
                    VStack(spacing: 4) {
                        Image(systemName: "doc").font(.system(size: 20)).foregroundStyle(Ink.am)
                        Text(p.name ?? "").font(.geist(9)).lineLimit(2).multilineTextAlignment(.center).foregroundStyle(Ink.tx2)
                    }
                    .padding(4)
                }
            }
            .overlay(alignment: .bottomTrailing) {
                if p.isVideo {
                    Image(systemName: "play.fill").font(.system(size: 10)).foregroundStyle(.white)
                        .padding(5).background(.black.opacity(0.5), in: Circle()).padding(4)
                }
            }
            .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
    }
}

/// The PC glowing, with waves around it, while it waits for the answer there.
struct WaitingPC: View {
    @State private var on = false

    var body: some View {
        ZStack {
            ForEach(0..<3, id: \.self) { i in
                Circle().stroke(Ink.cy.opacity(0.5), lineWidth: 1.5)
                    .frame(width: 60, height: 60)
                    .scaleEffect(on ? 1.9 : 0.8)
                    .opacity(on ? 0 : 0.9)
                    .animation(.easeOut(duration: 2.4).repeatForever(autoreverses: false).delay(Double(i) * 0.8), value: on)
            }
            Image(systemName: "desktopcomputer")
                .font(.system(size: 26)).foregroundStyle(Ink.cy)
                .frame(width: 60, height: 60)
                .background(Ink.cy.opacity(0.12), in: RoundedRectangle(cornerRadius: 19, style: .continuous))
                .shadow(color: Ink.cy.opacity(0.5), radius: 14)
        }
        .frame(width: 110, height: 90, alignment: .leading)
        .onAppear { on = true }
        .accessibilityHidden(true)
    }
}

/// A row that sinks a little under the finger.
struct PressStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .scaleEffect(configuration.isPressed ? 0.97 : 1)
            .animation(.spring(duration: 0.2), value: configuration.isPressed)
    }
}

/// « Un album »: the albums with their number of items (E3).
struct AlbumList: View {
    let pick: (PHAssetCollection) -> Void
    @State private var albums: [(PHAssetCollection, Int)] = []

    var body: some View {
        NavigationStack {
            List(albums, id: \.0.localIdentifier) { a, n in
                Button { pick(a) } label: {
                    HStack {
                        Text(a.localizedTitle ?? "Album").font(.geist(16)).foregroundStyle(Ink.tx)
                        Spacer()
                        Text("\(n)").font(.mono(14)).foregroundStyle(Ink.tx2)
                    }
                }
            }
            .navigationTitle(L("An album", "Un album"))
            .navigationBarTitleDisplayMode(.inline)
        }
        .task { albums = Self.load() }
    }

    /// Favorites, videos, selfies… then Evan's own albums; empty ones left out.
    static func load() -> [(PHAssetCollection, Int)] {
        var out: [(PHAssetCollection, Int)] = []
        let add = { (c: PHAssetCollection) in
            let n = PHAsset.fetchAssets(in: c, options: nil).count
            if n > 0 { out.append((c, n)) }
        }
        let smart: [PHAssetCollectionSubtype] = [.smartAlbumFavorites, .smartAlbumVideos, .smartAlbumSelfPortraits,
                                                 .smartAlbumLivePhotos, .smartAlbumScreenshots, .smartAlbumPanoramas]
        for s in smart {
            PHAssetCollection.fetchAssetCollections(with: .smartAlbum, subtype: s, options: nil).enumerateObjects { c, _, _ in add(c) }
        }
        PHAssetCollection.fetchAssetCollections(with: .album, subtype: .albumRegular, options: nil).enumerateObjects { c, _, _ in add(c) }
        return out
    }
}

// MARK: - Réglages

struct SettingsView: View {
    @EnvironmentObject var link: PCLink
    @Binding var scanning: Bool
    @AppStorage("autoBlack") private var autoBlack = true
    @State private var asking = false
    @State private var heat = false

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 8) {
                Text(L("Settings", "Réglages")).font(.geist(34, .semibold)).tracking(-1.5).padding(.top, 10).padding(.bottom, 10)

                section(L("Linked computer", "Ordinateur relié"))
                group {
                    HStack {
                        Image(systemName: "desktopcomputer").foregroundStyle(Ink.li)
                            .frame(width: 34, height: 34).background(Ink.li.opacity(0.1), in: RoundedRectangle(cornerRadius: 10))
                        VStack(alignment: .leading, spacing: 2) {
                            Text(link.pcName).font(.geist(16, .medium))
                            if let pc = link.pc {
                                Text("\(link.viaCable ? L("Cable", "Câble") : "Wi-Fi") · \(L("paired on", "relié le")) \(pc.pairedAt.formatted(.dateTime.day().month(.twoDigits)))")
                                    .font(.geist(12)).foregroundStyle(Ink.tx3)
                            }
                        }
                        Spacer()
                        Button(L("Forget", "Oublier")) { withAnimation { asking = true } }
                            .font(.geist(14, .semibold)).foregroundStyle(Ink.co)
                    }
                    .padding(14)
                    if asking {
                        VStack(alignment: .leading, spacing: 10) {
                            Text(L("\(link.pcName) will be forgotten. You'll need to scan a new QR code to pair it again.", "\(link.pcName) sera oublié. Il faudra scanner un nouveau QR pour le relier.")).font(.geist(14))
                            HStack {
                                Button(L("Cancel", "Annuler")) { withAnimation { asking = false } }.buttonStyle(GhostButtonStyle())
                                Button(L("Forget", "Oublier")) { link.forget() }.buttonStyle(PrimaryButtonStyle(fill: Ink.co, text: Ink.onCo))
                            }
                        }
                        .padding(14)
                        .background(Ink.co.opacity(0.08))
                    }
                    Divider().overlay(Ink.line)
                    Button { link.reconnectNow() } label: {
                        Label(L("Reconnect", "Reconnecter"), systemImage: "arrow.clockwise").font(.geist(15, .medium)).foregroundStyle(Ink.tx)
                            .frame(maxWidth: .infinity, alignment: .leading).padding(14)
                    }
                    Divider().overlay(Ink.line)
                    Button { scanning = true } label: {
                        Text(L("+ Pair another PC", "+ Relier un autre PC")).font(.geist(15, .medium)).foregroundStyle(Ink.li)
                            .frame(maxWidth: .infinity, alignment: .leading).padding(14)
                    }
                }

                section("Cam")
                group {
                    Toggle(isOn: $autoBlack) {
                        VStack(alignment: .leading, spacing: 2) {
                            Text(L("Auto black screen", "Écran noir automatique")).font(.geist(15))
                            Text(L("After 30 s without a touch", "Après 30 s sans toucher")).font(.geist(12)).foregroundStyle(Ink.tx3)
                        }
                    }
                    .tint(Ink.li)
                    .padding(14)
                }

                section(L("Help", "Aide"))
                group {
                    Button { withAnimation { heat.toggle() } } label: {
                        HStack {
                            Text(L("iPhone getting hot: what to do", "L’iPhone chauffe : que faire")).font(.geist(15))
                            Spacer()
                            Image(systemName: heat ? "chevron.up" : "chevron.down").foregroundStyle(Ink.tx3)
                        }
                        .padding(14)
                    }
                    .foregroundStyle(Ink.tx)
                    if heat {
                        Text(L("Take off the case, put the iPhone on an open stand, and charge it by cable rather than MagSafe. Hyphn lowers the quality on its own if it gets too hot.", "Retire la coque, pose l’iPhone sur un support aéré, charge-le par câble plutôt qu’en MagSafe. Hyphn baisse tout seul la qualité s’il chauffe trop."))
                            .font(.geist(14)).foregroundStyle(Ink.tx2).padding([.horizontal, .bottom], 14)
                    }
                }

                LinkJournal()

                Text("Hyphn \(DeviceInfo.appVersion) · \(L("protocol", "protocole")) v\(protocolVersion)")
                    .font(.mono(12)).foregroundStyle(Ink.tx3)
                    .frame(maxWidth: .infinity).padding(.top, 18)
            }
            .padding(.horizontal, 18)
            .padding(.bottom, 110)
        }
        .foregroundStyle(Ink.tx)
    }

    private func section(_ t: String) -> some View {
        Text(t.uppercased()).font(.geist(12, .semibold)).tracking(1.5).foregroundStyle(Ink.tx3).padding(.top, 14).padding(.leading, 4)
    }

    private func group<C: View>(@ViewBuilder _ content: () -> C) -> some View {
        VStack(spacing: 0, content: content)
            .background(Color(hex: 0x11151C), in: RoundedRectangle(cornerRadius: 20, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: 20, style: .continuous).stroke(Ink.line))
            .clipShape(RoundedRectangle(cornerRadius: 20, style: .continuous))
    }
}
