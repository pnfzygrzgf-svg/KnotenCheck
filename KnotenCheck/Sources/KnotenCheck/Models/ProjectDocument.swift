import Foundation
import SwiftData
import KnotenCheckEngine

@Model
final class NodeModel {
    var name: String
    var createdAt: Date
    var armCount: Int = 0          // 3 = T-Knoten, 4 = Kreuzung
    var lastLOS: String? = nil     // letztes berechnetes LOS-Kürzel ("A"–"F")
    var nodeData: Data?
    var configData: Data?

    init(name: String) {
        self.name = name
        self.createdAt = Date()
    }

    func loadConfiguration() -> IntersectionConfiguration? {
        guard let data = configData else { return nil }
        return try? JSONDecoder().decode(IntersectionConfiguration.self, from: data)
    }

    func save(configuration: IntersectionConfiguration) {
        configData = try? JSONEncoder().encode(configuration)
        nodeData   = try? JSONEncoder().encode(configuration.toIntersectionNode())
        armCount   = configuration.armCount
        name       = configuration.name.isEmpty ? name : configuration.name
    }

    func loadNode() -> IntersectionNode? {
        guard let data = nodeData else { return nil }
        return try? JSONDecoder().decode(IntersectionNode.self, from: data)
    }

    func save(node: IntersectionNode) {
        nodeData = try? JSONEncoder().encode(node)
    }
}
