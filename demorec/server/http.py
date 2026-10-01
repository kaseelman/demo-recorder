"""HTTP layer: routes requests to api.py, serves the editor's static files and videos."""
import json
import re
import socket
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, unquote, urlparse

from ..paths import BACKGROUNDS, EDITOR, UPLOADS
from . import api, jobs
from .media import ensure_proxy, get_recording

MIME = {".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".webp": "image/webp",
        ".mp4": "video/mp4", ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8",
        ".js": "text/javascript; charset=utf-8", ".svg": "image/svg+xml"}


def _inside(base, rel):
    p = (base / unquote(rel)).resolve()
    return p if base.resolve() in p.parents and p.is_file() else None


class Handler(BaseHTTPRequestHandler):
    def log_message(self, *a):
        pass

    # ------------------------------------------------------------------ responses
    def send_json(self, obj, code=200):
        body = json.dumps(obj).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def send_file(self, path):
        """Static file with HTTP Range support (needed for video seeking)."""
        ctype = MIME.get(path.suffix.lower(), "application/octet-stream")
        size = path.stat().st_size
        start, end = 0, size - 1
        rng = self.headers.get("Range")
        if rng and (m := re.match(r"bytes=(\d*)-(\d*)", rng)):
            if m[1]:
                start = int(m[1])
                end = min(int(m[2]), end) if m[2] else end
            elif m[2]:
                start = size - int(m[2])
            self.send_response(206)
            self.send_header("Content-Range", f"bytes {start}-{end}/{size}")
        else:
            self.send_response(200)
        self.send_header("Content-Type", ctype)
        self.send_header("Accept-Ranges", "bytes")
        self.send_header("Content-Length", str(end - start + 1))
        self.send_header("Cache-Control", "no-cache")
        self.end_headers()
        with open(path, "rb") as f:
            f.seek(start)
            left = end - start + 1
            try:
                while left > 0 and (chunk := f.read(min(left, 1 << 20))):
                    self.wfile.write(chunk)
                    left -= len(chunk)
            except (BrokenPipeError, ConnectionResetError):
                pass

    def _guard(self, fn):
        try:
            return fn()
        except (FileNotFoundError, KeyError) as e:
            return self.send_json({"error": str(e)}, 404)
        except ValueError as e:
            return self.send_json({"error": str(e)}, 400)
        except Exception as e:  # surface problems in the UI instead of a blank page
            return self.send_json({"error": f"{type(e).__name__}: {e}"}, 500)

    # ------------------------------------------------------------------ routes
    def do_GET(self):
        u = urlparse(self.path)
        q = {k: v[0] for k, v in parse_qs(u.query).items()}

        def route():
            if u.path == "/":
                return self.send_file(EDITOR / "index.html")
            if u.path.startswith("/editor/") and (p := _inside(EDITOR, u.path[len("/editor/"):])):
                return self.send_file(p)
            if u.path.startswith("/bg/uploads/") and (p := _inside(UPLOADS, u.path[len("/bg/uploads/"):])):
                return self.send_file(p)
            if u.path.startswith("/bg/") and (p := _inside(BACKGROUNDS, u.path[4:])):
                return self.send_file(p)
            if u.path == "/video":
                return self.send_file(ensure_proxy(get_recording(q["recording"])))
            if u.path == "/api/state":
                return self.send_json(api.project_state(q["project"]))
            if u.path == "/api/recording":
                return self.send_json(api.add_recording(q["project"], q["name"], float(q.get("smoothing", 0.1))))
            if u.path == "/api/render":
                return self.send_json(jobs.current())
            self.send_error(404)
        self._guard(route)

    def do_POST(self):
        # A custom header forces a CORS preflight, so other websites can't post to this server.
        if self.headers.get("X-Editor") != "1":
            return self.send_error(403)
        u = urlparse(self.path)
        raw = self.rfile.read(int(self.headers.get("Content-Length", 0)))

        def route():
            if u.path == "/api/upload":
                return self.send_json(api.upload_background(unquote(self.headers.get("X-Filename", "image.jpg")), raw))
            data = json.loads(raw or b"{}")
            if u.path == "/api/projects/new":
                return self.send_json(api.new_project(data.get("recording")))
            pid = data["project_id"]
            if u.path == "/api/save":
                return self.send_json(api.save(pid, data["project"], data.get("cursor_changed", False)))
            if u.path == "/api/render":
                return self.send_json(api.render(pid, bool(data.get("preview"))))
            if u.path in ("/api/open", "/api/reveal"):
                return self.send_json(api.open_output(pid, data.get("kind"), u.path == "/api/reveal"))
            self.send_error(404)
        self._guard(route)


def free_port(start=8765):
    for port in range(start, start + 50):
        with socket.socket() as s:
            if s.connect_ex(("127.0.0.1", port)) != 0:
                return port
    raise RuntimeError("no free port")


def serve(port=None):
    port = port or free_port()
    return ThreadingHTTPServer(("127.0.0.1", port), Handler), port
