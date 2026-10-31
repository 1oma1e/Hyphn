import SwiftUI

@main
struct HyphnApp: App {
    @StateObject private var link = PCLink()
    @StateObject private var camera = Camera()
    @Environment(\.scenePhase) private var scenePhase

    var body: some Scene {
        WindowGroup {
            RootView()
                .environmentObject(link)
                .environmentObject(camera)
                .preferredColorScheme(.dark)
                .onAppear {
                    camera.link = link
                    link.camera = camera
                }
                .onChange(of: scenePhase) { _, phase in
                    // ADR-0023: the link stays while another app is in front.
                    switch phase {
                    case .active: link.enterForeground()
                    case .background:
                        camera.close(byUser: false)
                        link.enterBackground()
                    default: break
                    }
                }
        }
    }
}
