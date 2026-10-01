// Records the screen or one window (without the system cursor) plus a timestamped log of
// mouse movement and clicks. The renderer and editor use both to build the final video.
//
// Output: <out>/raw.mov and <out>/events.json
// Stop with the menu bar timer, the global hotkey ⌃⌥⌘S, or Ctrl-C / SIGTERM.

import AppKit
import ScreenCaptureKit

setvbuf(stdout, nil, _IONBF, 0)
let opts = parseArgs()
let app = NSApplication.shared
app.setActivationPolicy(.accessory)  // no Dock icon; menu bar item only

var capture: Capture?
var statusItem: RecordingStatusItem?
var outDir: URL!
var displayMeta: [String: Any] = [:]
var stopRequested = false
var started = false
var signalSources: [DispatchSourceSignal] = []

func fail(_ message: String) -> Never {
    print("✗ \(message)")
    status("error \(message)")
    exit(1)
}

func stopRecording() {
    guard !stopRequested else { return }
    stopRequested = true
    statusItem?.remove()
    guard let cap = capture, started else { status("cancelled"); exit(0) }
    print("\n■ Stopping…")
    status("saving")
    cap.finish {
        guard let t0 = cap.t0 else { fail("No frames captured.") }
        let events = eventLog.json(t0: t0)
        let doc: [String: Any] = ["version": 1, "video": "raw.mov", "fps": opts.fps, "cursor_in_video": opts.showCursor,
                                  "display": displayMeta, "events": events]
        do {
            let data = try JSONSerialization.data(withJSONObject: doc, options: [.prettyPrinted, .sortedKeys])
            try data.write(to: outDir.appendingPathComponent("events.json"))
        } catch { fail("Failed to write events.json: \(error)") }
        print(String(format: "✓ Saved %@  (%.1fs, %d frames, %d dropped, %d events)",
                     outDir.path, CACurrentMediaTime() - t0, cap.frames, cap.dropped, events.count))
        status("saved \(outDir.path)")
        exit(0)
    }
}

/// What to capture: a display or a window, its size in pixels, and where it sits on screen.
struct Target {
    let filter: SCContentFilter
    let originPt: CGPoint
    let sizePt: CGSize
    let scale: CGFloat
    let displayID: CGDirectDisplayID
}

func even(_ v: CGFloat) -> Int { max(2, Int((v / 2).rounded()) * 2) }

func resolveTarget(_ content: SCShareableContent) -> Target {
    // Leave our own countdown overlay and menu bar timer out of the recording.
    let me = content.applications.filter { $0.processID == getpid() }

    if let wid = opts.windowID {
        guard let w = content.windows.first(where: { $0.windowID == wid }) else { fail("That window is no longer open.") }
        let center = CGPoint(x: w.frame.midX, y: w.frame.midY)
        var did = CGMainDisplayID(), n: UInt32 = 0
        CGGetDisplaysWithPoint(center, 1, &did, &n)
        return Target(filter: SCContentFilter(desktopIndependentWindow: w), originPt: w.frame.origin,
                      sizePt: w.frame.size, scale: displayScale(at: center), displayID: did)
    }
    let displays = content.displays
    let display: SCDisplay
    if let i = opts.displayIndex {
        guard displays.indices.contains(i) else { fail("No display \(i)") }
        display = displays[i]
    } else {
        let mouse = CGEvent(source: nil)?.location ?? .zero
        display = displays.first { CGDisplayBounds($0.displayID).contains(mouse) } ?? displays[0]
    }
    let b = CGDisplayBounds(display.displayID)
    let scale = CGFloat(CGDisplayCopyDisplayMode(display.displayID)?.pixelWidth ?? Int(b.width * 2)) / b.width
    return Target(filter: SCContentFilter(display: display, excludingApplications: me, exceptingWindows: []),
                  originPt: b.origin, sizePt: b.size, scale: scale, displayID: display.displayID)
}

func beginRecording(_ target: Target) {
    let widthPx = even(target.sizePt.width * target.scale), heightPx = even(target.sizePt.height * target.scale)
    eventLog.origin = target.originPt
    eventLog.scale = target.scale
    displayMeta = ["width_pt": Double(target.sizePt.width), "height_pt": Double(target.sizePt.height),
                   "width_px": widthPx, "height_px": heightPx, "scale": Double(target.scale)]
    outDir = opts.outDir ?? defaultOutputDir()
    try? FileManager.default.createDirectory(at: outDir, withIntermediateDirectories: true)
    let videoURL = outDir.appendingPathComponent("raw.mov")
    try? FileManager.default.removeItem(at: videoURL)

    installEventTaps()
    print("Recording \(widthPx)x\(heightPx) px (@\(target.scale)x), \(opts.fps) fps → \(outDir.path)")

    let cap = Capture(widthPx: widthPx, heightPx: heightPx, fps: opts.fps, showCursor: opts.showCursor)
    cap.onFirstFrame = {
        started = true
        print("● Recording… stop with the menu bar timer, ⌃⌥⌘S or Ctrl-C")
        status("recording")
    }
    cap.onError = { err in
        if started { stopRecording() } else { fail("Capture failed: \(err.localizedDescription)") }
    }
    capture = cap
    if let loc = CGEvent(source: nil)?.location { eventLog.add("move", loc) }
    do { try cap.start(filter: target.filter, url: videoURL) } catch { fail(error.localizedDescription) }
    statusItem = RecordingStatusItem(onStop: stopRecording)
}

func runCountdown(on displayID: CGDirectDisplayID, then go: @escaping () -> Void) {
    guard opts.countdown > 0 else { go(); return }
    let overlay = CountdownOverlay(on: screen(for: displayID))
    var n = opts.countdown
    status("countdown \(n)")
    overlay.show(n)
    Timer.scheduledTimer(withTimeInterval: 1, repeats: true) { t in
        n -= 1
        if stopRequested { t.invalidate(); overlay.close(); return }
        if n > 0 { overlay.show(n); status("countdown \(n)") } else {
            t.invalidate()
            overlay.close()
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.15) { go() }  // let the overlay fade out first
        }
    }
}

// MARK: - Main

if !CGPreflightScreenCaptureAccess() {
    CGRequestScreenCaptureAccess()
    print("  Enable Screen Recording for your terminal app in System Settings → Privacy & Security,")
    print("  restart the terminal, and run again.")
    fail("Screen Recording permission needed")
}

for sig in [SIGINT, SIGTERM] {
    signal(sig, SIG_IGN)
    let src = DispatchSource.makeSignalSource(signal: sig, queue: .main)
    src.setEventHandler { stopRecording() }
    src.resume()
    signalSources.append(src)
}
onStopHotkey = stopRecording

if opts.listJSON {
    listSourcesAsJSON(thumbsDir: opts.thumbsDir)
} else {
    SCShareableContent.getExcludingDesktopWindows(false, onScreenWindowsOnly: true) { content, error in
        DispatchQueue.main.async {
            guard let content, !content.displays.isEmpty else { fail("Could not list displays: \(error?.localizedDescription ?? "unknown error")") }
            if opts.listDisplays {
                for (i, d) in content.displays.enumerated() {
                    let b = CGDisplayBounds(d.displayID)
                    print("[\(i)] \(Int(b.width))x\(Int(b.height)) pt at (\(Int(b.minX)), \(Int(b.minY)))\(CGDisplayIsMain(d.displayID) != 0 ? "  (main)" : "")")
                }
                exit(0)
            }
            let target = resolveTarget(content)
            runCountdown(on: target.displayID) { if !stopRequested { beginRecording(target) } }
        }
    }
}

app.run()
