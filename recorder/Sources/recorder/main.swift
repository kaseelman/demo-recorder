// Records the screen (without the system cursor) plus a timestamped log of
// mouse movement and clicks. The renderer uses both to build the final video.
//
// Output: <out>/raw.mov and <out>/events.json
// Stop with Ctrl-C in the terminal, or the global hotkey ⌃⌥⌘S.

import AppKit
import AVFoundation
import CoreMedia
import Foundation
import QuartzCore
import ScreenCaptureKit

setvbuf(stdout, nil, _IONBF, 0)

// MARK: - Options

struct Options {
    var outDir: URL?
    var fps = 60
    var displayIndex: Int?
    var showCursor = false
    var countdown = 3
    var listDisplays = false
}

func usage() -> Never {
    print("""
    usage: recorder [--out DIR] [--fps 60] [--display N] [--countdown 3] [--show-cursor] [--list-displays]

      --out DIR        output folder (default: ~/Movies/Demo Recorder/recordings/<timestamp>)
      --fps N          capture frame rate (default 60)
      --display N      display index from --list-displays (default: display under the mouse)
      --countdown N    seconds before recording starts (default 3)
      --show-cursor    bake the system cursor into the video (renderer then won't draw its own)
    """)
    exit(1)
}

func parseArgs() -> Options {
    var o = Options()
    var args = CommandLine.arguments.dropFirst().makeIterator()
    while let a = args.next() {
        switch a {
        case "--out": guard let v = args.next() else { usage() }; o.outDir = URL(fileURLWithPath: v)
        case "--fps": guard let v = args.next(), let n = Int(v) else { usage() }; o.fps = n
        case "--display": guard let v = args.next(), let n = Int(v) else { usage() }; o.displayIndex = n
        case "--countdown": guard let v = args.next(), let n = Int(v) else { usage() }; o.countdown = n
        case "--show-cursor": o.showCursor = true
        case "--list-displays": o.listDisplays = true
        default: usage()
        }
    }
    return o
}

let opts = parseArgs()

// MARK: - Event log

final class EventLog {
    private let lock = NSLock()
    private var events: [(host: Double, type: String, x: Double, y: Double, button: Int)] = []
    var origin = CGPoint.zero   // display origin in global points
    var scale: CGFloat = 2       // pixels per point

    func add(_ type: String, _ loc: CGPoint, button: Int = 0) {
        let host = CACurrentMediaTime()
        let x = Double((loc.x - origin.x) * scale)
        let y = Double((loc.y - origin.y) * scale)
        lock.lock(); events.append((host, type, x, y, button)); lock.unlock()
    }

    func json(t0: Double) -> [[String: Any]] {
        lock.lock(); defer { lock.unlock() }
        return events.map { e in
            var d: [String: Any] = [
                "t": (e.host - t0).rounded(toPlaces: 4),
                "type": e.type,
                "x": e.x.rounded(toPlaces: 1),
                "y": e.y.rounded(toPlaces: 1),
            ]
            if e.type == "down" || e.type == "up" { d["button"] = e.button }
            return d
        }
    }
}

extension Double {
    func rounded(toPlaces p: Int) -> Double {
        let m = pow(10, Double(p)); return (self * m).rounded() / m
    }
}

let eventLog = EventLog()
var mouseTap: CFMachPort?
var keyTap: CFMachPort?
var stopRequested = false

func mask(_ types: [CGEventType]) -> CGEventMask {
    types.reduce(CGEventMask(0)) { $0 | (CGEventMask(1) << CGEventMask($1.rawValue)) }
}

let mouseCallback: CGEventTapCallBack = { _, type, event, _ in
    switch type {
    case .tapDisabledByTimeout, .tapDisabledByUserInput:
        if let t = mouseTap { CGEvent.tapEnable(tap: t, enable: true) }
    case .mouseMoved, .leftMouseDragged, .rightMouseDragged, .otherMouseDragged:
        eventLog.add("move", event.location)
    case .leftMouseDown: eventLog.add("down", event.location, button: 0)
    case .rightMouseDown: eventLog.add("down", event.location, button: 1)
    case .otherMouseDown: eventLog.add("down", event.location, button: 2)
    case .leftMouseUp: eventLog.add("up", event.location, button: 0)
    case .rightMouseUp: eventLog.add("up", event.location, button: 1)
    case .otherMouseUp: eventLog.add("up", event.location, button: 2)
    case .scrollWheel: eventLog.add("scroll", event.location)
    default: break
    }
    return Unmanaged.passUnretained(event)
}

// Only used to detect the stop hotkey (⌃⌥⌘S). Keystrokes are never logged.
let keyCallback: CGEventTapCallBack = { _, type, event, _ in
    if type == .tapDisabledByTimeout || type == .tapDisabledByUserInput {
        if let t = keyTap { CGEvent.tapEnable(tap: t, enable: true) }
    } else if type == .keyDown {
        let f = event.flags
        let code = event.getIntegerValueField(.keyboardEventKeycode)
        if code == 1, f.contains(.maskControl), f.contains(.maskAlternate), f.contains(.maskCommand) {
            DispatchQueue.main.async { stopRecording() }
        }
    }
    return Unmanaged.passUnretained(event)
}

func installTaps() {
    let mouseTypes: [CGEventType] = [
        .mouseMoved, .leftMouseDown, .leftMouseUp, .rightMouseDown, .rightMouseUp,
        .otherMouseDown, .otherMouseUp, .leftMouseDragged, .rightMouseDragged,
        .otherMouseDragged, .scrollWheel,
    ]
    mouseTap = CGEvent.tapCreate(tap: .cgSessionEventTap, place: .headInsertEventTap,
                                 options: .listenOnly, eventsOfInterest: mask(mouseTypes),
                                 callback: mouseCallback, userInfo: nil)
    guard let mt = mouseTap else {
        print("✗ Could not listen to mouse events. Grant your terminal app Accessibility / Input Monitoring")
        print("  in System Settings → Privacy & Security, then run again.")
        CGRequestListenEventAccess()
        exit(1)
    }
    CFRunLoopAddSource(CFRunLoopGetMain(), CFMachPortCreateRunLoopSource(nil, mt, 0), .commonModes)
    CGEvent.tapEnable(tap: mt, enable: true)

    keyTap = CGEvent.tapCreate(tap: .cgSessionEventTap, place: .headInsertEventTap,
                               options: .listenOnly, eventsOfInterest: mask([.keyDown]),
                               callback: keyCallback, userInfo: nil)
    if let kt = keyTap {
        CFRunLoopAddSource(CFRunLoopGetMain(), CFMachPortCreateRunLoopSource(nil, kt, 0), .commonModes)
        CGEvent.tapEnable(tap: kt, enable: true)
    }
}

// MARK: - Screen capture

final class Capture: NSObject, SCStreamOutput, SCStreamDelegate {
    let queue = DispatchQueue(label: "capture")
    var stream: SCStream?
    var writer: AVAssetWriter!
    var input: AVAssetWriterInput!
    var t0: Double?          // host time (seconds) of the first frame = video time 0
    var frames = 0
    var dropped = 0
    let widthPx: Int, heightPx: Int

    init(widthPx: Int, heightPx: Int) {
        self.widthPx = widthPx; self.heightPx = heightPx
    }

    func start(display: SCDisplay, url: URL) throws {
        writer = try AVAssetWriter(outputURL: url, fileType: .mov)
        let bitrate = Int(Double(widthPx * heightPx * opts.fps) * 0.15)
        input = AVAssetWriterInput(mediaType: .video, outputSettings: [
            AVVideoCodecKey: AVVideoCodecType.hevc,
            AVVideoWidthKey: widthPx,
            AVVideoHeightKey: heightPx,
            AVVideoCompressionPropertiesKey: [
                AVVideoAverageBitRateKey: bitrate,
                AVVideoExpectedSourceFrameRateKey: opts.fps,
                AVVideoMaxKeyFrameIntervalKey: opts.fps * 2,
            ],
            AVVideoColorPropertiesKey: [
                AVVideoColorPrimariesKey: AVVideoColorPrimaries_ITU_R_709_2,
                AVVideoTransferFunctionKey: AVVideoTransferFunction_ITU_R_709_2,
                AVVideoYCbCrMatrixKey: AVVideoYCbCrMatrix_ITU_R_709_2,
            ],
        ])
        input.expectsMediaDataInRealTime = true
        writer.add(input)
        guard writer.startWriting() else { throw writer.error ?? NSError(domain: "writer", code: 1) }

        let cfg = SCStreamConfiguration()
        cfg.width = widthPx
        cfg.height = heightPx
        cfg.minimumFrameInterval = CMTime(value: 1, timescale: CMTimeScale(opts.fps))
        cfg.showsCursor = opts.showCursor
        cfg.pixelFormat = kCVPixelFormatType_32BGRA
        cfg.colorSpaceName = CGColorSpace.sRGB
        cfg.queueDepth = 8
        cfg.capturesAudio = false

        let filter = SCContentFilter(display: display, excludingWindows: [])
        let s = SCStream(filter: filter, configuration: cfg, delegate: self)
        try s.addStreamOutput(self, type: .screen, sampleHandlerQueue: queue)
        stream = s
        s.startCapture { err in
            if let err { print("✗ Capture failed: \(err.localizedDescription)"); exit(1) }
        }
    }

    func stream(_ stream: SCStream, didOutputSampleBuffer sb: CMSampleBuffer, of type: SCStreamOutputType) {
        guard type == .screen, sb.isValid,
              let atts = CMSampleBufferGetSampleAttachmentsArray(sb, createIfNecessary: false) as? [[SCStreamFrameInfo: Any]],
              let raw = atts.first?[.status] as? Int,
              SCFrameStatus(rawValue: raw) == .complete else { return }

        let pts = CMSampleBufferGetPresentationTimeStamp(sb)
        if t0 == nil {
            writer.startSession(atSourceTime: pts)
            // Frame timestamps use the host clock, same as CACurrentMediaTime().
            // Fall back to "now" if that assumption ever doesn't hold.
            let now = CACurrentMediaTime()
            t0 = abs(now - pts.seconds) < 1.0 ? pts.seconds : now
            print("● Recording… stop with ⌃⌥⌘S (or Ctrl-C here)")
        }
        if input.isReadyForMoreMediaData { input.append(sb); frames += 1 } else { dropped += 1 }
    }

    func stream(_ stream: SCStream, didStopWithError error: Error) {
        print("✗ Stream stopped: \(error.localizedDescription)")
        DispatchQueue.main.async { stopRecording() }
    }

    func finish(completion: @escaping () -> Void) {
        let endHost = CACurrentMediaTime()
        let done = { [self] in
            queue.async { [self] in
                guard t0 != nil else { completion(); return }
                input.markAsFinished()
                // Extend the last frame up to the moment we stopped.
                writer.endSession(atSourceTime: CMTime(seconds: endHost, preferredTimescale: 600))
                writer.finishWriting { completion() }
            }
        }
        if let s = stream { s.stopCapture { _ in done() } } else { done() }
    }
}

var capture: Capture?
var outDir: URL!
var displayMeta: [String: Any] = [:]

func stopRecording() {
    guard !stopRequested else { return }
    stopRequested = true
    print("\n■ Stopping…")
    guard let cap = capture else { exit(0) }
    cap.finish {
        guard let t0 = cap.t0 else { print("✗ No frames captured."); exit(1) }
        let events = eventLog.json(t0: t0)
        let doc: [String: Any] = [
            "version": 1,
            "video": "raw.mov",
            "fps": opts.fps,
            "cursor_in_video": opts.showCursor,
            "display": displayMeta,
            "events": events,
        ]
        do {
            let data = try JSONSerialization.data(withJSONObject: doc, options: [.prettyPrinted, .sortedKeys])
            try data.write(to: outDir.appendingPathComponent("events.json"))
        } catch {
            print("✗ Failed to write events.json: \(error)"); exit(1)
        }
        let dur = CACurrentMediaTime() - t0
        print(String(format: "✓ Saved %@  (%.1fs, %d frames, %d dropped, %d events)",
                     outDir.path, dur, cap.frames, cap.dropped, events.count))
        exit(0)
    }
}

// MARK: - Main

if !CGPreflightScreenCaptureAccess() {
    CGRequestScreenCaptureAccess()
    print("✗ Screen Recording permission needed. Enable it for your terminal app in")
    print("  System Settings → Privacy & Security → Screen Recording, restart the terminal, and run again.")
    exit(1)
}

signal(SIGINT, SIG_IGN)
let sigSource = DispatchSource.makeSignalSource(signal: SIGINT, queue: .main)
sigSource.setEventHandler { stopRecording() }
sigSource.resume()

SCShareableContent.getExcludingDesktopWindows(false, onScreenWindowsOnly: true) { content, error in
    DispatchQueue.main.async {
        guard let content, !content.displays.isEmpty else {
            print("✗ Could not list displays: \(error?.localizedDescription ?? "unknown error")")
            exit(1)
        }
        let displays = content.displays

        if opts.listDisplays {
            for (i, d) in displays.enumerated() {
                let b = CGDisplayBounds(d.displayID)
                print("[\(i)] \(Int(b.width))x\(Int(b.height)) pt at (\(Int(b.minX)), \(Int(b.minY)))\(CGDisplayIsMain(d.displayID) != 0 ? "  (main)" : "")")
            }
            exit(0)
        }

        let display: SCDisplay
        if let i = opts.displayIndex {
            guard displays.indices.contains(i) else { print("✗ No display \(i)"); exit(1) }
            display = displays[i]
        } else {
            let mouse = CGEvent(source: nil)?.location ?? .zero
            display = displays.first { CGDisplayBounds($0.displayID).contains(mouse) } ?? displays[0]
        }

        let bounds = CGDisplayBounds(display.displayID)
        let mode = CGDisplayCopyDisplayMode(display.displayID)
        let widthPx = mode?.pixelWidth ?? Int(bounds.width * 2)
        let heightPx = mode?.pixelHeight ?? Int(bounds.height * 2)
        let scale = CGFloat(widthPx) / bounds.width
        eventLog.origin = bounds.origin
        eventLog.scale = scale
        displayMeta = [
            "width_pt": Double(bounds.width), "height_pt": Double(bounds.height),
            "width_px": widthPx, "height_px": heightPx, "scale": Double(scale),
        ]

        if let o = opts.outDir {
            outDir = o
        } else {
            let f = DateFormatter(); f.dateFormat = "yyyy-MM-dd_HH-mm-ss"
            let data = ProcessInfo.processInfo.environment["DEMOREC_DATA"].map { URL(fileURLWithPath: ($0 as NSString).expandingTildeInPath) }
                ?? FileManager.default.homeDirectoryForCurrentUser.appendingPathComponent("Movies/Demo Recorder")
            outDir = data.appendingPathComponent("recordings").appendingPathComponent(f.string(from: Date()))
        }
        try? FileManager.default.createDirectory(at: outDir, withIntermediateDirectories: true)
        let videoURL = outDir.appendingPathComponent("raw.mov")
        try? FileManager.default.removeItem(at: videoURL)

        installTaps()
        print("Display \(widthPx)x\(heightPx) px (@\(scale)x), \(opts.fps) fps → \(outDir.path)")

        func begin() {
            if let loc = CGEvent(source: nil)?.location { eventLog.add("move", loc) }
            let cap = Capture(widthPx: widthPx, heightPx: heightPx)
            capture = cap
            do { try cap.start(display: display, url: videoURL) } catch {
                print("✗ \(error.localizedDescription)"); exit(1)
            }
        }

        if opts.countdown > 0 {
            var n = opts.countdown
            print("Starting in \(n)…", terminator: "")
            Timer.scheduledTimer(withTimeInterval: 1, repeats: true) { t in
                n -= 1
                if n > 0 { print(" \(n)…", terminator: "") } else { t.invalidate(); print(""); begin() }
            }
        } else {
            begin()
        }
    }
}

CFRunLoopRun()
