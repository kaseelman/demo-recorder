// The little bit of native UI while recording: a countdown overlay and a menu bar timer
// you click to stop. Both belong to this app, which is excluded from the capture.
import AppKit

final class CountdownOverlay {
    private let panel: NSPanel
    private let label = NSTextField(labelWithString: "")

    init(on screen: NSScreen?) {
        let size = NSSize(width: 180, height: 180)
        let frame = screen?.frame ?? NSScreen.main!.frame
        panel = NSPanel(contentRect: NSRect(x: frame.midX - size.width / 2, y: frame.midY - size.height / 2,
                                            width: size.width, height: size.height),
                        styleMask: [.borderless, .nonactivatingPanel], backing: .buffered, defer: false)
        panel.level = .screenSaver
        panel.isOpaque = false
        panel.backgroundColor = .clear
        panel.ignoresMouseEvents = true
        panel.collectionBehavior = [.canJoinAllSpaces, .fullScreenAuxiliary]

        let blur = NSVisualEffectView(frame: NSRect(origin: .zero, size: size))
        blur.material = .hudWindow
        blur.state = .active
        blur.wantsLayer = true
        blur.layer?.cornerRadius = 48
        blur.layer?.masksToBounds = true
        label.font = .systemFont(ofSize: 96, weight: .bold)
        label.textColor = .white
        label.alignment = .center
        label.frame = NSRect(x: 0, y: 30, width: size.width, height: 120)
        blur.addSubview(label)
        panel.contentView = blur
    }

    func show(_ n: Int) {
        label.stringValue = "\(n)"
        panel.orderFrontRegardless()
    }

    func close() { panel.orderOut(nil) }
}

final class RecordingStatusItem: NSObject {
    private let item = NSStatusBar.system.statusItem(withLength: NSStatusItem.variableLength)
    private var timer: Timer?
    private let started = Date()
    private let onStop: () -> Void

    init(onStop: @escaping () -> Void) {
        self.onStop = onStop
        super.init()
        let menu = NSMenu()
        let stop = NSMenuItem(title: "Stop Recording", action: #selector(stopClicked), keyEquivalent: "s")
        stop.keyEquivalentModifierMask = [.control, .option, .command]
        stop.target = self
        menu.addItem(stop)
        item.menu = menu
        tick()
        timer = Timer.scheduledTimer(withTimeInterval: 0.5, repeats: true) { [weak self] _ in self?.tick() }
    }

    private func tick() {
        let s = Int(Date().timeIntervalSince(started))
        let title = NSMutableAttributedString(string: "● ", attributes: [.foregroundColor: NSColor.systemRed])
        title.append(NSAttributedString(string: String(format: "%d:%02d", s / 60, s % 60),
                                        attributes: [.font: NSFont.monospacedDigitSystemFont(ofSize: 13, weight: .medium)]))
        item.button?.attributedTitle = title
    }

    @objc private func stopClicked() { onStop() }

    func remove() {
        timer?.invalidate()
        NSStatusBar.system.removeStatusItem(item)
    }
}

func screen(for displayID: CGDirectDisplayID) -> NSScreen? {
    NSScreen.screens.first { ($0.deviceDescription[NSDeviceDescriptionKey("NSScreenNumber")] as? NSNumber)?.uint32Value == displayID }
}
