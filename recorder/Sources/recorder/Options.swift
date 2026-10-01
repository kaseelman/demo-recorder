// Command line options.
import Foundation

struct Options {
    var outDir: URL?
    var fps = 60
    var displayIndex: Int?
    var windowID: UInt32?
    var showCursor = false
    var countdown = 3
    var listDisplays = false
    var listJSON = false
    var thumbsDir: URL?
}

func usage() -> Never {
    print("""
    usage: recorder [--out DIR] [--fps 60] [--display N | --window ID] [--countdown 3] [--show-cursor]
           recorder --list-displays
           recorder --list-json [--thumbs DIR]

      --out DIR        output folder (default: ~/Movies/Demo Recorder/recordings/<timestamp>)
      --fps N          capture frame rate (default 60)
      --display N      display index from --list-displays (default: display under the mouse)
      --window ID      record a single window (ids from --list-json)
      --countdown N    seconds before recording starts (default 3)
      --show-cursor    bake the system cursor into the video (renderer then won't draw its own)
      --list-json      print displays and windows as JSON (used by the editor), with
                       thumbnails written to --thumbs DIR
    """)
    exit(1)
}

func parseArgs() -> Options {
    var o = Options()
    var args = CommandLine.arguments.dropFirst().makeIterator()
    while let a = args.next() {
        switch a {
        case "--out": guard let v = args.next() else { usage() }; o.outDir = URL(fileURLWithPath: (v as NSString).expandingTildeInPath)
        case "--fps": guard let v = args.next(), let n = Int(v) else { usage() }; o.fps = n
        case "--display": guard let v = args.next(), let n = Int(v) else { usage() }; o.displayIndex = n
        case "--window": guard let v = args.next(), let n = UInt32(v) else { usage() }; o.windowID = n
        case "--countdown": guard let v = args.next(), let n = Int(v) else { usage() }; o.countdown = n
        case "--show-cursor": o.showCursor = true
        case "--list-displays": o.listDisplays = true
        case "--list-json": o.listJSON = true
        case "--thumbs": guard let v = args.next() else { usage() }; o.thumbsDir = URL(fileURLWithPath: v)
        default: usage()
        }
    }
    return o
}

/// Machine-readable progress for the editor ("STATUS recording", "STATUS saved <path>", …).
func status(_ s: String) { print("STATUS \(s)") }

func defaultOutputDir() -> URL {
    let data = ProcessInfo.processInfo.environment["DEMOREC_DATA"].map { URL(fileURLWithPath: ($0 as NSString).expandingTildeInPath) }
        ?? FileManager.default.homeDirectoryForCurrentUser.appendingPathComponent("Movies/Demo Recorder")
    let f = DateFormatter()
    f.dateFormat = "yyyy-MM-dd_HH-mm-ss"
    return data.appendingPathComponent("recordings").appendingPathComponent(f.string(from: Date()))
}
