"""Command line entry points:  python -m demorec.cli render|edit ...  (wrapped by ./render and ./edit)."""
import argparse
import sys
import webbrowser
from pathlib import Path

from .config import load_config
from .paths import BACKGROUNDS, CONFIG, RECORDINGS


def render_main(argv):
    from .export import render_project
    from .project import load_project, project_from_recording

    ap = argparse.ArgumentParser(prog="render", description="Render a recording or an editor project to mp4.")
    ap.add_argument("path", type=Path, help="a recording folder (raw.mov + events.json) or a project folder (project.json)")
    ap.add_argument("-o", "--out", type=Path, help="output file (default: final.mp4 / preview.mp4 in that folder)")
    ap.add_argument("-c", "--config", type=Path, default=CONFIG)
    ap.add_argument("--preview", action="store_true", help="fast half-resolution draft without motion blur")
    ap.add_argument("--trim-start", type=float, help="recordings only: seconds to cut from the start")
    ap.add_argument("--trim-end", type=float, help="recordings only: seconds to cut from the end")
    ap.add_argument("--auto", action="store_true", help="recordings only: ignore zooms.json, use automatic zooms")
    ap.add_argument("--max-zoom", type=float, help="override zoom.max_zoom (automatic zooms)")
    ap.add_argument("--no-blur", action="store_true", help="disable motion blur")
    args = ap.parse_args(argv)

    cfg = load_config(args.config)
    if args.max_zoom:
        cfg["zoom"]["max_zoom"] = args.max_zoom
    if (args.path / "project.json").exists():
        project = load_project(args.path)
    else:
        project = project_from_recording(args.path, cfg, not args.auto, args.trim_start, args.trim_end)
    if args.no_blur:
        project["motion_blur"] = 0
    out = args.out or args.path / ("preview.mp4" if args.preview else "final.mp4")
    render_project(project, cfg, out, args.preview)


def edit_main(argv):
    from .project import create_project, list_projects
    from .recording import list_recordings, load_recording
    from .server.http import serve

    ap = argparse.ArgumentParser(prog="edit", description="Open the browser editor.")
    ap.add_argument("path", nargs="?", type=Path, help="a recording or project folder (default: latest project)")
    ap.add_argument("--no-open", action="store_true", help="don't open the browser")
    ap.add_argument("--port", type=int, help="port (default: first free from 8765)")
    args = ap.parse_args(argv)

    if not (BACKGROUNDS / "presets").exists():
        print("Generating background presets…")
        from .backgrounds import main as make_backgrounds
        make_backgrounds()

    def project_for(rec_path):
        rec_path = rec_path.resolve()
        name = rec_path.name if rec_path.parent == RECORDINGS.resolve() else str(rec_path)
        return create_project((name, load_recording(rec_path, 0.25)), load_config())

    if args.path and (args.path / "project.json").exists():
        pid = args.path.resolve().name
    elif args.path and (args.path / "events.json").exists():
        pid = project_for(args.path)
    elif projects := list_projects():
        pid = projects[0]["id"]
    elif names := list_recordings():
        pid = project_for(RECORDINGS / names[0])
    else:
        sys.exit("No recordings yet. Run ./record first.")

    server, port = serve(args.port)
    url = f"http://127.0.0.1:{port}/?project={pid}"
    print(f"Editor running at {url}  (Ctrl-C to stop)")
    if not args.no_open:
        webbrowser.open(url)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print()


def main():
    commands = {"render": render_main, "edit": edit_main}
    if len(sys.argv) < 2 or sys.argv[1] not in commands:
        sys.exit("usage: python -m demorec.cli {render,edit} ...")
    commands[sys.argv[1]](sys.argv[2:])


if __name__ == "__main__":
    main()
