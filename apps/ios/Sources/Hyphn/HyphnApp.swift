import SwiftUI

@main
struct HyphnApp: App {
    @StateObject private var link = PCLink()
    @StateObject private var camera = Camera()
    @StateObject private var dropper = Dropper()
    @Environment(\.scenePhase) private var scenePhase

    var body: some Scene {
        WindowGroup {
            RootView()
                .environmentObject(link)
                .environmentObject(camera)
                .environmentObject(dropper)
                .preferredColorScheme(.dark)
                .onAppear {
                    camera.link = link
                    link.camera = camera
                    dropper.link = link
                }
                .onChange(of: scenePhase) { _, phase in
                    // ADR-0023: the link stays while another app is in front.
                    switch phase {
                    case .active: link.enterForeground()
                    case .background:
                        camera.close(byUser: false)
                        dropper.stopForBackground()
                        link.enterBackground()
                    default: break
                    }
                }
        }
    }
}
