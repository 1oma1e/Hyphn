// Screens once paired (design V2, ADR-0016): tab bar Accueil, Cam, Drop,
// Réglages. Everything fine-grained is set on the PC; the iPhone stays minimal.

@preconcurrency import AVFoundation
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
            item(.home, "house", "Accueil")
            item(.cam, "video", "Cam")
            item(.drop, "arrow.up.arrow.down", "Drop")
            item(.settings, "slider.horizontal.3", "Réglages")
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
                        Text(online ? "\(link.pcName) · Wi-Fi" : link.phase == .searching ? "\(link.pcName) · recherche…" : "\(link.pcName) · hors ligne")
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
                Label("Lié à \(link.pcName)", systemImage: "checkmark.circle.fill")
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
                    Text(online ? "Prête" : link.phase == .searching ? "Recherche du PC…" : "PC introuvable")
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
            Text("Ton iPhone devient la webcam de **\(link.pcName)**.")
                .font(.geist(16)).foregroundStyle(Ink.tx2).padding(.top, 6)
            HStack(spacing: 6) {
                chip("\(link.camControl.height >= 2160 ? "4K" : "\(link.camControl.height)p") · \(link.camControl.fps) i/s", mono: true)
                chip("Démarre en pause", mono: false)
            }
            .padding(.vertical, 16)
            if case let .offline(msg) = link.phase {
                if !msg.isEmpty { Text(msg).font(.geist(13)).foregroundStyle(Ink.am).padding(.bottom, 10) }
                Button { link.reconnectNow() } label: { Label("Reconnecter", systemImage: "arrow.clockwise") }
                    .buttonStyle(GhostButtonStyle())
            } else {
                Button { withAnimation(.spring(duration: 0.45)) { tab = .cam } } label: {
                    HStack {
                        Text("Lancer la caméra")
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
                    Text("Bientôt").font(.geist(13)).foregroundStyle(Ink.tx2)
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
                    Text("En pause").font(.geist(30, .semibold)).tracking(-1)
                    Spacer().frame(height: 260)
                }
                .frame(maxWidth: .infinity, maxHeight: .infinity)
                .background(Color.black.opacity(0.45))
                .allowsHitTesting(false)
            }
            if camera.denied {
                Problem(title: "Caméra refusée", text: "Autorise la caméra dans Settings › Hyphn pour utiliser Cam.", settings: true)
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
            .accessibilityLabel("Fermer Cam")
            Spacer()
            HStack(spacing: 8) {
                if camera.live {
                    Circle().fill(Ink.co).frame(width: 8, height: 8)
                    Text("ENVOI").font(.geist(12, .bold))
                } else {
                    Image(systemName: "pause.fill").font(.system(size: 11))
                    Text("PAUSE").font(.geist(12, .bold))
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
            .accessibilityLabel("Choisir la qualité")
        }
        .foregroundStyle(Ink.tx)
    }

    private var qualityText: String {
        let h = link.camControl.height
        return "\(h >= 2160 ? "4K" : "\(h)p")\(link.camControl.fps)"
    }

    @ViewBuilder private var notices: some View {
        switch DeviceInfo.thermal {
        case .serious: notice("Chaud : 30 images/s")
        case .critical: notice("Très chaud : 1080p30")
        default: EmptyView()
        }
        if link.phase != .online { notice("Reconnexion…") }
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
                    Text(["0,5", "1×", "2", "5"][i])
                        .font(.mono(on ? 14 : 12, .semibold))
                        .foregroundStyle(on ? Ink.am : Ink.tx)
                        .frame(width: on ? 46 : 38, height: on ? 46 : 38)
                        .background(Color.black.opacity(0.45), in: Circle())
                        .overlay(Circle().stroke(on ? Ink.am.opacity(0.6) : Ink.line))
                }
                .disabled(camera.front)
                .accessibilityLabel("Objectif \(["0,5×", "1×", "2×", "5×"][i])")
            }
        }
        .padding(.bottom, 18)
        .opacity(camera.front ? 0.35 : 1)
    }

    private var controls: some View {
        HStack(alignment: .top) {
            sideButton("arrow.triangle.2.circlepath", label: camera.front ? "Avant" : "Arrière") { camera.flip() }
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
                .accessibilityLabel(camera.live ? "Pause" : "Afficher")
                Text(camera.live ? "Pause" : "Afficher").font(.geist(12, .semibold))
            }
            Spacer()
            sideButton("moon.fill", label: "Écran noir") { sleep() }
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
                    Text(camera.live ? "EN DIRECT" : "EN PAUSE").font(.geist(13, .semibold)).foregroundStyle(Color(hex: 0x4F5560))
                    Text("Touche deux fois pour rallumer").font(.geist(12)).foregroundStyle(Color(hex: 0x3A3F48))
                }
            }
            .onTapGesture(count: 2) { wake(); armIdle() }
            .accessibilityLabel("Toucher deux fois pour rallumer l’écran")
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
            Text("Qualité envoyée").font(.geist(20, .semibold))
            segment("Qualité", [(2160, "4K"), (1080, "1080p"), (720, "720p")], current: link.camControl.height) {
                camera.pickQuality(height: $0, fps: link.camControl.fps)
            }
            segment("Images par seconde", [(24, "24"), (30, "30"), (60, "60")], current: link.camControl.fps) {
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

// MARK: - Drop (empty for now, ADR-0020)

struct DropView: View {
    var body: some View {
        VStack(spacing: 14) {
            Image(systemName: "arrow.up.arrow.down").font(.system(size: 30)).foregroundStyle(Ink.cy)
                .frame(width: 72, height: 72).background(Ink.cy.opacity(0.1), in: RoundedRectangle(cornerRadius: 22))
            Text("Drop arrive bientôt").font(.geist(26, .semibold)).tracking(-1)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .padding(.bottom, 90)
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
                Text("Réglages").font(.geist(34, .semibold)).tracking(-1.5).padding(.top, 10).padding(.bottom, 10)

                section("Ordinateur relié")
                group {
                    HStack {
                        Image(systemName: "desktopcomputer").foregroundStyle(Ink.li)
                            .frame(width: 34, height: 34).background(Ink.li.opacity(0.1), in: RoundedRectangle(cornerRadius: 10))
                        VStack(alignment: .leading, spacing: 2) {
                            Text(link.pcName).font(.geist(16, .medium))
                            if let pc = link.pc {
                                Text("Wi-Fi · relié le \(pc.pairedAt.formatted(.dateTime.day().month(.twoDigits)))")
                                    .font(.geist(12)).foregroundStyle(Ink.tx3)
                            }
                        }
                        Spacer()
                        Button("Oublier") { withAnimation { asking = true } }
                            .font(.geist(14, .semibold)).foregroundStyle(Ink.co)
                    }
                    .padding(14)
                    if asking {
                        VStack(alignment: .leading, spacing: 10) {
                            Text("\(link.pcName) sera oublié. Il faudra scanner un nouveau QR pour le relier.").font(.geist(14))
                            HStack {
                                Button("Annuler") { withAnimation { asking = false } }.buttonStyle(GhostButtonStyle())
                                Button("Oublier") { link.forget() }.buttonStyle(PrimaryButtonStyle(fill: Ink.co, text: Ink.onCo))
                            }
                        }
                        .padding(14)
                        .background(Ink.co.opacity(0.08))
                    }
                    Divider().overlay(Ink.line)
                    Button { link.reconnectNow() } label: {
                        Label("Reconnecter", systemImage: "arrow.clockwise").font(.geist(15, .medium)).foregroundStyle(Ink.tx)
                            .frame(maxWidth: .infinity, alignment: .leading).padding(14)
                    }
                    Divider().overlay(Ink.line)
                    Button { scanning = true } label: {
                        Text("+ Relier un autre PC").font(.geist(15, .medium)).foregroundStyle(Ink.li)
                            .frame(maxWidth: .infinity, alignment: .leading).padding(14)
                    }
                }

                section("Cam")
                group {
                    Toggle(isOn: $autoBlack) {
                        VStack(alignment: .leading, spacing: 2) {
                            Text("Écran noir automatique").font(.geist(15))
                            Text("Après 30 s sans toucher").font(.geist(12)).foregroundStyle(Ink.tx3)
                        }
                    }
                    .tint(Ink.li)
                    .padding(14)
                }

                section("Aide")
                group {
                    Button { withAnimation { heat.toggle() } } label: {
                        HStack {
                            Text("L’iPhone chauffe : que faire").font(.geist(15))
                            Spacer()
                            Image(systemName: heat ? "chevron.up" : "chevron.down").foregroundStyle(Ink.tx3)
                        }
                        .padding(14)
                    }
                    .foregroundStyle(Ink.tx)
                    if heat {
                        Text("Retire la coque, pose l’iPhone sur un support aéré, charge-le par câble plutôt qu’en MagSafe. Hyphn baisse tout seul la qualité s’il chauffe trop.")
                            .font(.geist(14)).foregroundStyle(Ink.tx2).padding([.horizontal, .bottom], 14)
                    }
                }

                Text("Hyphn \(DeviceInfo.appVersion) · protocole v\(protocolVersion)")
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
