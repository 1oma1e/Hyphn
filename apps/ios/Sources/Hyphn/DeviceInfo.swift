// The iPhone infos sent to the PC (spec `Infos iPhone - Batterie et chaleur`).
// Event-driven only: iOS notifications, never a polling loop (RULES, Énergie 1).

import Foundation
import UIKit

@MainActor
final class DeviceInfo {
    /// Called on the main queue each time something changes.
    var onChange: ((DeviceStatus) -> Void)?
    private var tokens: [NSObjectProtocol] = []

    func start() {
        UIDevice.current.isBatteryMonitoringEnabled = true
        let center = NotificationCenter.default
        let names: [Notification.Name] = [
            UIDevice.batteryLevelDidChangeNotification,
            UIDevice.batteryStateDidChangeNotification,
            ProcessInfo.thermalStateDidChangeNotification,
            .NSProcessInfoPowerStateDidChange,
        ]
        tokens = names.map { name in
            center.addObserver(forName: name, object: nil, queue: .main) { [weak self] _ in
                MainActor.assumeIsolated {
                    guard let self else { return }
                    self.onChange?(self.current(withStorage: false))
                }
            }
        }
    }

    func stop() {
        tokens.forEach(NotificationCenter.default.removeObserver)
        tokens = []
        UIDevice.current.isBatteryMonitoringEnabled = false
    }

    /// Storage has no event: read only when connecting (E2).
    private var lastStorage: (UInt64, UInt64) = (0, 0)

    func current(withStorage: Bool) -> DeviceStatus {
        let d = UIDevice.current
        var s = DeviceStatus()
        s.batteryPercent = d.batteryLevel < 0 ? -1 : Int32((d.batteryLevel * 100).rounded())
        s.charge = switch d.batteryState {
        case .charging: .charging
        case .full: .full
        case .unplugged: .unplugged
        default: .unknown
        }
        s.lowPower = ProcessInfo.processInfo.isLowPowerModeEnabled
        s.thermal = Self.thermal
        if withStorage { lastStorage = Self.storage() }
        (s.storageFree, s.storageTotal) = lastStorage
        s.measuredAtMs = Int64(Date().timeIntervalSince1970 * 1000)
        return s
    }

    nonisolated static var thermal: Thermal {
        switch ProcessInfo.processInfo.thermalState {
        case .nominal: .nominal
        case .fair: .fair
        case .serious: .serious
        case .critical: .critical
        @unknown default: .unknown
        }
    }

    private static func storage() -> (UInt64, UInt64) {
        let url = URL(fileURLWithPath: NSHomeDirectory())
        let keys: Set<URLResourceKey> = [.volumeAvailableCapacityForImportantUsageKey, .volumeTotalCapacityKey]
        guard let v = try? url.resourceValues(forKeys: keys) else { return (0, 0) }
        let free = v.volumeAvailableCapacityForImportantUsage.map { UInt64(max(0, $0)) } ?? 0
        let total = v.volumeTotalCapacity.map { UInt64(max(0, $0)) } ?? 0
        return (free, total)
    }

    /// Hardware id like « iPhone17,2 ».
    nonisolated static var model: String {
        var u = utsname()
        uname(&u)
        return withUnsafeBytes(of: &u.machine) { raw in
            String(decoding: raw.prefix { $0 != 0 }, as: UTF8.self)
        }
    }

    nonisolated static var appVersion: String {
        Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String ?? "0"
    }
}
