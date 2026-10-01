// Timestamped mouse events (and the stop hotkey) via listen-only event taps.
import AppKit
import QuartzCore

final class EventLog {
    private let lock = NSLock()
    private var events: [(host: Double, type: String, x: Double, y: Double, button: Int)] = []
    var origin = CGPoint.zero   // top-left of the captured area in global points
    var scale: CGFloat = 2       // pixels per point

    func add(_ type: String, _ loc: CGPoint, button: Int = 0) {
        let host = CACurrentMediaTime()
        let x = Double((loc.x - origin.x) * scale)
        let y = Double((loc.y - origin.y) * scale)
        lock.lock(); events.append((host, type, x, y, button)); lock.unlock()
    }

    /// Events with times relative to `t0` (the first video frame), ready for events.json.
    func json(t0: Double) -> [[String: Any]] {
        lock.lock(); defer { lock.unlock() }
        return events.map { e in
            var d: [String: Any] = ["t": (e.host - t0).rounded(toPlaces: 4), "type": e.type,
                                    "x": e.x.rounded(toPlaces: 1), "y": e.y.rounded(toPlaces: 1)]
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
private var mouseTap: CFMachPort?
private var keyTap: CFMachPort?
var onStopHotkey: () -> Void = {}

private func mask(_ types: [CGEventType]) -> CGEventMask {
    types.reduce(CGEventMask(0)) { $0 | (CGEventMask(1) << CGEventMask($1.rawValue)) }
}

private let mouseCallback: CGEventTapCallBack = { _, type, event, _ in
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
private let keyCallback: CGEventTapCallBack = { _, type, event, _ in
    if type == .tapDisabledByTimeout || type == .tapDisabledByUserInput {
        if let t = keyTap { CGEvent.tapEnable(tap: t, enable: true) }
    } else if type == .keyDown {
        let f = event.flags
        if event.getIntegerValueField(.keyboardEventKeycode) == 1,
           f.contains(.maskControl), f.contains(.maskAlternate), f.contains(.maskCommand) {
            DispatchQueue.main.async { onStopHotkey() }
        }
    }
    return Unmanaged.passUnretained(event)
}

func installEventTaps() {
    let mouseTypes: [CGEventType] = [
        .mouseMoved, .leftMouseDown, .leftMouseUp, .rightMouseDown, .rightMouseUp,
        .otherMouseDown, .otherMouseUp, .leftMouseDragged, .rightMouseDragged,
        .otherMouseDragged, .scrollWheel,
    ]
    mouseTap = CGEvent.tapCreate(tap: .cgSessionEventTap, place: .headInsertEventTap, options: .listenOnly,
                                 eventsOfInterest: mask(mouseTypes), callback: mouseCallback, userInfo: nil)
    guard let mt = mouseTap else {
        print("✗ Could not listen to mouse events. Grant your terminal app Accessibility / Input Monitoring")
        print("  in System Settings → Privacy & Security, then run again.")
        status("error Mouse access not allowed: grant Accessibility / Input Monitoring to your terminal app")
        CGRequestListenEventAccess()
        exit(1)
    }
    CFRunLoopAddSource(CFRunLoopGetMain(), CFMachPortCreateRunLoopSource(nil, mt, 0), .commonModes)
    CGEvent.tapEnable(tap: mt, enable: true)

    keyTap = CGEvent.tapCreate(tap: .cgSessionEventTap, place: .headInsertEventTap, options: .listenOnly,
                               eventsOfInterest: mask([.keyDown]), callback: keyCallback, userInfo: nil)
    if let kt = keyTap {
        CFRunLoopAddSource(CFRunLoopGetMain(), CFMachPortCreateRunLoopSource(nil, kt, 0), .commonModes)
        CGEvent.tapEnable(tap: kt, enable: true)
    }
}
