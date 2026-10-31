// swift-tools-version: 6.0

import PackageDescription

let package = Package(
    name: "Hyphn",
    platforms: [
        .iOS(.v17),
        .macOS(.v14),
    ],
    products: [
        // An xtool project should contain exactly one library product,
        // representing the main app.
        .library(
            name: "Hyphn",
            targets: ["Hyphn"]
        ),
    ],
    dependencies: [
        // Self-signed X.509 certificate for the iPhone identity (spec `Core - Appairage QR`, E1).
        .package(url: "https://github.com/apple/swift-certificates.git", from: "1.5.0"),
        .package(url: "https://github.com/apple/swift-asn1.git", from: "1.3.0"),
    ],
    targets: [
        .target(
            name: "Hyphn",
            dependencies: [
                .product(name: "X509", package: "swift-certificates"),
                .product(name: "SwiftASN1", package: "swift-asn1"),
            ]
        ),
    ],
    // Swift 5 mode: AVFoundation and VideoToolbox callbacks are not Sendable-clean yet.
    swiftLanguageModes: [.v5]
)
