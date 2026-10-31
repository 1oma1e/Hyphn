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
                    // Spec `Core - Reconnexion`, E2 and E6: network only in the foreground.
                    switch phase {
                    case .active: link.enterForeground()
                    case .background:
                        camera.close()
                        link.enterBackground()
                    default: break
                    }
                }
        }
    }
}
