// Lists what can be recorded (displays and windows) as JSON, with small thumbnails.
import AppKit
import ScreenCaptureKit

/// Windows worth offering: normal app windows of a reasonable size, not our own.
func recordableWindows(_ content: SCShareableContent) -> [SCWindow] {
    content.windows.filter { w in
        guard let app = w.owningApplication, app.processID != getpid() else { return false }
        return w.isOnScreen && w.windowLayer == 0 && w.frame.width >= 240 && w.frame.height >= 160
            && !["com.apple.dock", "com.apple.WindowManager", "com.apple.controlcenter"].contains(app.bundleIdentifier)
    }
}

/// Pixels per point for the display under a point.
func displayScale(at point: CGPoint) -> CGFloat {
    var id = CGMainDisplayID(), count: UInt32 = 0
    CGGetDisplaysWithPoint(point, 1, &id, &count)
    let mode = CGDisplayCopyDisplayMode(id)
    return CGFloat(mode?.pixelWidth ?? 2) / CGDisplayBounds(id).width
}

private func saveThumbnail(filter: SCContentFilter, size: CGSize, to url: URL, done: @escaping (Bool) -> Void) {
    let cfg = SCStreamConfiguration()
    let w = 480.0, h = max(1, (w * size.height / size.width).rounded())
    cfg.width = Int(w); cfg.height = Int(h)
    cfg.showsCursor = false
    SCScreenshotManager.captureImage(contentFilter: filter, configuration: cfg) { image, _ in
        guard let image, let data = NSBitmapImageRep(cgImage: image).representation(using: .jpeg, properties: [.compressionFactor: 0.75]) else {
            done(false); return
        }
        done((try? data.write(to: url)) != nil)
    }
}

func listSourcesAsJSON(thumbsDir: URL?) {
    SCShareableContent.getExcludingDesktopWindows(true, onScreenWindowsOnly: true) { content, error in
        guard let content else {
            print(#"{"error": "Screen Recording permission is needed"}"#)
            exit(1)
        }
        if let d = thumbsDir { try? FileManager.default.createDirectory(at: d, withIntermediateDirectories: true) }
        let group = DispatchGroup()
        let lock = NSLock()
        var displays: [[String: Any]] = [], windows: [[String: Any]] = []

        for (i, d) in content.displays.enumerated() {
            let b = CGDisplayBounds(d.displayID)
            var item: [String: Any] = ["index": i, "id": d.displayID, "width": Int(b.width), "height": Int(b.height),
                                       "main": CGDisplayIsMain(d.displayID) != 0]
            if let dir = thumbsDir {
                let name = "display-\(d.displayID).jpg"
                group.enter()
                saveThumbnail(filter: SCContentFilter(display: d, excludingWindows: []), size: b.size, to: dir.appendingPathComponent(name)) { ok in
                    if ok { item["thumb"] = name }
                    lock.lock(); displays.append(item); lock.unlock(); group.leave()
                }
            } else { displays.append(item) }
        }
        for w in recordableWindows(content) {
            var item: [String: Any] = ["id": w.windowID, "app": w.owningApplication?.applicationName ?? "",
                                       "title": w.title ?? "", "width": Int(w.frame.width), "height": Int(w.frame.height)]
            if let dir = thumbsDir {
                let name = "window-\(w.windowID).jpg"
                group.enter()
                saveThumbnail(filter: SCContentFilter(desktopIndependentWindow: w), size: w.frame.size, to: dir.appendingPathComponent(name)) { ok in
                    if ok { item["thumb"] = name }
                    lock.lock(); windows.append(item); lock.unlock(); group.leave()
                }
            } else { windows.append(item) }
        }
        group.notify(queue: .main) {
            let doc: [String: Any] = ["displays": displays.sorted { ($0["index"] as! Int) < ($1["index"] as! Int) },
                                      "windows": windows]
            let data = try! JSONSerialization.data(withJSONObject: doc, options: [.sortedKeys])
            print(String(data: data, encoding: .utf8)!)
            exit(0)
        }
    }
}
