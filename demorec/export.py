"""Export: composite every clip onto the background and encode the final mp4."""
import math
import subprocess
import sys
import time
from pathlib import Path

import numpy as np

from . import compose as C
from .clip import ClipRenderer, camera_matrix
from .layout import clip_layout, is_plain, project_canvas
from .project import cursor_settings, timeline, with_defaults
from .recording import load_recording, resolve_recording


def encoder_cmd(oc, w, h, fps, out_path):
    enc = oc["encoder"]
    quality = ["-crf", str(oc["crf"]), "-preset", "slow"] if enc.startswith("libx26") else ["-b:v", oc["bitrate"]]
    tag = ["-tag:v", "hvc1"] if "hevc" in enc or "265" in enc else []
    return ["ffmpeg", "-v", "error", "-y",
            "-f", "rawvideo", "-pix_fmt", "bgr24", "-s", f"{w}x{h}", "-r", str(fps), "-i", "-",
            "-vf", "scale=out_color_matrix=bt709:out_range=tv,format=yuv420p",
            "-c:v", enc, *quality, *tag,
            "-colorspace", "bt709", "-color_primaries", "bt709", "-color_trc", "bt709", "-color_range", "tv",
            "-movflags", "+faststart", str(out_path)]


class Progress:
    """Prints 'rendering k/n' lines; the editor parses these for its progress bar."""

    def __init__(self, total):
        self.total, self.started = total, time.time()

    def tick(self, k):
        if k % 30:
            return
        el = time.time() - self.started
        rate = (k + 1) / el if el > 0 else 0
        eta = (self.total - k - 1) / rate if rate > 0 else 0
        print(f"\r  rendering {k + 1}/{self.total}  {rate:5.1f} fps  eta {eta:4.0f}s ", end="", flush=True)

    def done(self, out_path, frames):
        print(f"\r✓ {out_path}  ({frames} frames in {time.time() - self.started:.0f}s)" + " " * 20)


def blend_cameras(a, b, e):
    """Camera halfway through a transition: zoom blends in log space."""
    return (math.exp(math.log(a[0]) * (1 - e) + math.log(b[0]) * e), a[1] * (1 - e) + b[1] * e, a[2] * (1 - e) + b[2] * e)


def render_project(project, cfg, out_path, preview=False):
    project = with_defaults(project)
    clips = project["clips"]
    if not clips:
        sys.exit("Project has no clips.")
    fps = cfg["output"]["fps"]
    recs = [load_recording(resolve_recording(c["recording"]), 0.5 if preview else 1.0) for c in clips]
    ow, oh = project_canvas(project, recs[0], project["output"]["width"] * (0.5 if preview else 1.0))
    layouts = [clip_layout(project, ow, oh, r.W, r.H, c) for r, c in zip(recs, clips)]

    if is_plain(project):
        bg, supersample = np.zeros((oh, ow, 3), np.uint8), None
    else:
        bg = C.make_background(project["background"], ow, oh)
        n = 2 if ow <= 1920 else 1  # sharp background/frame when zoomed in
        supersample = (C.make_background(project["background"], ow * n, oh * n), n) if n > 1 else None
    cards = [C.Card(project, bg, L, supersample) for L in layouts]
    starts, lengths, trans, total = timeline(project, [r.duration for r in recs], fps)
    cursor_cfg = cursor_settings(project, cfg)

    print(f"{len(clips)} clip(s) → {ow}x{oh} @ {fps}fps, {total / fps:.1f}s")
    for i, c in enumerate(clips):
        tr = f"  ← {trans[i][0]} {trans[i][1] / fps:.1f}s" if i and trans[i][0] != "cut" else ""
        print(f"  [{i + 1}] {Path(c['recording']).name}  {starts[i] / fps:.1f}s–{(starts[i] + lengths[i]) / fps:.1f}s{tr}")

    renderers = [None] * len(clips)
    enc = subprocess.Popen(encoder_cmd(cfg["output"], ow, oh, fps, out_path), stdin=subprocess.PIPE)
    progress = Progress(total)
    k = 0
    for k in range(total):
        active = [i for i in range(len(clips)) if starts[i] <= k < starts[i] + lengths[i]]
        for i in active:
            if renderers[i] is None:  # clips start decoding only when they first appear
                renderers[i] = ClipRenderer(recs[i], clips[i], cfg, cursor_cfg, layouts[i], fps,
                                            preview, project["motion_blur"])
                for line in renderers[i].describe():
                    print(f"\r      clip {i + 1}: {line}" + " " * 20)
            renderers[i].advance()
        if len(active) == 1:
            i = active[0]
            out = renderers[i].render_steady(cards[i])
        else:
            a, b = active[0], active[1]
            kind, d = trans[b]
            p = (k - starts[b] + 0.5) / d
            cam = blend_cameras(renderers[a].camera(), renderers[b].camera(), C.ease_in_out(p))
            out = C.transition_frame(bg, kind, p, cards[a], renderers[a].render_flat(),
                                     cards[b], renderers[b].render_flat(), camera_matrix(*cam, ow, oh))
        enc.stdin.write(np.ascontiguousarray(out).tobytes())
        progress.tick(k)

    for r in renderers:
        if r:
            r.close()
    enc.stdin.close()
    enc.wait()
    progress.done(out_path, k + 1)
