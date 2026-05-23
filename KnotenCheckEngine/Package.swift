// swift-tools-version: 5.9
import PackageDescription

let package = Package(
    name: "KnotenCheckEngine",
    platforms: [
        .iOS(.v17),
        .macOS(.v14)
    ],
    products: [
        .library(name: "KnotenCheckEngine", targets: ["KnotenCheckEngine"])
    ],
    targets: [
        .target(
            name: "KnotenCheckEngine",
            path: "Sources/KnotenCheckEngine"
        ),
        .testTarget(
            name: "KnotenCheckEngineTests",
            dependencies: ["KnotenCheckEngine"],
            path: "Tests/KnotenCheckEngineTests"
        )
    ]
)
