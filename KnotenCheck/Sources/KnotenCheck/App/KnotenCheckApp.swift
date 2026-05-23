import SwiftUI
import SwiftData

@main
struct KnotenCheckApp: App {
    var body: some Scene {
        WindowGroup {
            ContentView()
                .modelContainer(for: [NodeModel.self])
        }
    }
}
