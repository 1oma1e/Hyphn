// Design V2 (ADR-0016): pure black (OLED), lemon / cyan / coral accents, the
// « trame » of slow waves. System fonts: Geist ships only as .woff2 in the
// repo, which iOS cannot load.

import SwiftUI

extension Color {
    init(hex: UInt32, alpha: Double = 1) {
        self.init(.sRGB,
                  red: Double((hex >> 16) & 0xFF) / 255,
                  green: Double((hex >> 8) & 0xFF) / 255,
                  blue: Double(hex & 0xFF) / 255,
                  opacity: alpha)
    }
}

enum Ink {
    static let tx = Color(hex: 0xF1F3F6)
    static let tx2 = Color(hex: 0xAEB6C2)
    static let tx3 = Color(hex: 0x8A93A1)
    static let li = Color(hex: 0xB9F25A)
    static let cy = Color(hex: 0x5FD4F4)
    static let co = Color(hex: 0xFF7A66)
    static let am = Color(hex: 0xFFB547)
    static let line = Color.white.opacity(0.10)
    static let line2 = Color.white.opacity(0.18)
    static let card = Color(hex: 0x11151C, alpha: 0.82)
    static let onLi = Color(hex: 0x0B1004)
    static let onCo = Color(hex: 0x1A0603)
}

extension Font {
    static func geist(_ size: CGFloat, _ weight: Font.Weight = .regular) -> Font {
        .system(size: size, weight: weight)
    }

    static func mono(_ size: CGFloat, _ weight: Font.Weight = .medium) -> Font {
        .system(size: size, weight: weight, design: .monospaced)
    }
}

/// The Hyphn mark: dot, glowing dash, dot.
struct Mark: View {
    var scale: CGFloat = 1
    @State private var beat = false

    var body: some View {
        HStack(spacing: -1 * scale) {
            Circle().fill(Ink.tx).frame(width: 9 * scale, height: 9 * scale)
            Capsule().fill(Ink.li)
                .frame(width: 16 * scale, height: 3 * scale)
                .shadow(color: Ink.li, radius: 5)
                .opacity(beat ? 1 : 0.5)
                .scaleEffect(x: beat ? 1 : 0.7, y: 1)
            Circle().fill(Ink.tx).frame(width: 9 * scale, height: 9 * scale)
        }
        .onAppear {
            withAnimation(.easeInOut(duration: 1.2).repeatForever(autoreverses: true)) { beat = true }
        }
        .accessibilityHidden(true)
    }
}

/// Slow luminous waves at the top of the screen. Drawn once; only an offset
/// is animated, which the render server does cheaply.
struct Trame: View {
    var count = 10
    var height: CGFloat = 460
    @State private var shift = false

    var body: some View {
        GeometryReader { geo in
            let w = geo.size.width
            ZStack(alignment: .topLeading) {
                ForEach(0..<count, id: \.self) { i in
                    WaveLine(index: i, count: count)
                        .stroke(Self.color(i), lineWidth: 1.1)
                        .opacity(Self.alpha(i, count))
                        .frame(width: w * 2, height: height)
                        .offset(x: shift ? -w : 0)
                        .animation(.linear(duration: Double(18 + (i * 7) % 17)).repeatForever(autoreverses: false), value: shift)
                }
            }
            .frame(width: w, height: height, alignment: .topLeading)
            .clipped()
        }
        .frame(height: height)
        .mask(LinearGradient(colors: [.black, .black, .clear], startPoint: .top, endPoint: .bottom))
        .allowsHitTesting(false)
        .accessibilityHidden(true)
        .onAppear { shift = true }
    }

    static func color(_ i: Int) -> Color { [Ink.co, Ink.li, Ink.cy][i % 3] }

    static func alpha(_ i: Int, _ n: Int) -> Double {
        let mid = 1 - abs(Double(i) - Double(n - 1) / 2) / (Double(n) / 2)
        return 0.05 + 0.18 * mid
    }
}

/// One wave over two screen widths, so a shift of one width loops seamlessly.
struct WaveLine: Shape {
    let index: Int
    let count: Int

    func path(in r: CGRect) -> Path {
        let half = r.width / 2
        let y = 30 + CGFloat(index) * (r.height * 0.75 / CGFloat(count))
        let a = 14 + 26 * abs(sin(Double(index) * 0.62))
        var p = Path()
        p.move(to: CGPoint(x: 0, y: y))
        for k in 0..<2 {
            let x0 = CGFloat(k) * half
            p.addCurve(to: CGPoint(x: x0 + half, y: y),
                       control1: CGPoint(x: x0 + half * 0.25, y: y - a),
                       control2: CGPoint(x: x0 + half * 0.75, y: y + a))
        }
        return p
    }
}

/// Primary button (lemon by default).
struct PrimaryButtonStyle: ButtonStyle {
    var fill: Color = Ink.li
    var text: Color = Ink.onLi

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.geist(17, .bold))
            .foregroundStyle(text)
            .frame(maxWidth: .infinity, minHeight: 56)
            .background(fill, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
            .scaleEffect(configuration.isPressed ? 0.97 : 1)
            .animation(.spring(duration: 0.2), value: configuration.isPressed)
    }
}

struct GhostButtonStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.geist(15, .semibold))
            .foregroundStyle(Ink.tx)
            .frame(maxWidth: .infinity, minHeight: 52)
            .background(Color.white.opacity(0.05), in: RoundedRectangle(cornerRadius: 16, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: 16, style: .continuous).stroke(Ink.line2))
            .scaleEffect(configuration.isPressed ? 0.97 : 1)
    }
}

/// Small status dot that pings when on.
struct Led: View {
    var on: Bool
    @State private var ping = false

    var body: some View {
        Circle()
            .fill(on ? Ink.li : Ink.tx3)
            .frame(width: 8, height: 8)
            .background(
                Circle().stroke(Ink.li.opacity(on ? (ping ? 0 : 0.55) : 0), lineWidth: 7)
                    .scaleEffect(ping ? 1.8 : 1)
            )
            .onAppear {
                guard on else { return }
                withAnimation(.easeOut(duration: 2).repeatForever(autoreverses: false)) { ping = true }
            }
            .accessibilityHidden(true)
    }
}
