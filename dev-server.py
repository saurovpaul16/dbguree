"""
DBGuree dev server — starts the FastAPI backend and serves the Electron
frontend as a plain web app so it can be opened in any browser.

Usage:
    python dev-server.py [--port 8080]

Opens at:  http://localhost:8080
Backend:   http://127.0.0.1:64430   (or $PORT env var)
"""

import argparse
import http.server
import json
import os
import subprocess
import sys
import threading
import time
from pathlib import Path

ROOT = Path(__file__).parent
ELECTRON_DIR = ROOT / "electron"
BACKEND_PORT = int(os.getenv("PORT", 64430))


# ── Backend startup ────────────────────────────────────────────────────────────

def find_python():
    """Return the best available Python interpreter that has our deps."""
    candidates = [
        ROOT / ".venv" / "bin" / "python3",
        ROOT / ".venv-linux" / "bin" / "python3",
        Path("/sessions/laughing-adoring-wozniak/venv/bin/python3"),
    ]
    for p in candidates:
        if p.exists() and os.access(p, os.X_OK):
            return str(p)
    return sys.executable  # fallback: same Python as this script


def start_backend():
    python = find_python()
    script = ROOT / "backend" / "main.py"
    print(f"[dev-server] Starting backend: {python} {script}")
    env = {**os.environ, "PORT": str(BACKEND_PORT), "PYTHONUNBUFFERED": "1"}
    proc = subprocess.Popen(
        [python, str(script)],
        cwd=str(ROOT),
        env=env,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
    )

    # Wait for the ready signal ({"status": "ready", "port": N})
    deadline = time.time() + 30
    ready = False
    for line in proc.stdout:
        line = line.strip()
        if not line:
            continue
        try:
            msg = json.loads(line)
            if msg.get("status") == "ready":
                print(f"[dev-server] Backend ready on port {msg['port']}")
                ready = True
                break
        except json.JSONDecodeError:
            pass
        if time.time() > deadline:
            break

    if not ready:
        print("[dev-server] ERROR: backend did not send ready signal within 30 s", file=sys.stderr)
        proc.terminate()
        sys.exit(1)

    # Forward backend stderr to our stderr so errors are visible
    def _forward_stderr():
        for line in proc.stderr:
            print(f"[backend] {line}", end="", file=sys.stderr)

    threading.Thread(target=_forward_stderr, daemon=True).start()
    return proc


# ── HTTP server for the frontend ───────────────────────────────────────────────

class DevHandler(http.server.SimpleHTTPRequestHandler):
    """Serve Electron frontend files from electron/src/ and electron/dist/."""

    def do_GET(self):
        # Inject window.__DBGUREE_PORT before bundle.js loads
        if self.path in ("/", "/index.html"):
            self.send_response(200)
            self.send_header("Content-Type", "text/html; charset=utf-8")
            self.send_header("Access-Control-Allow-Origin", "*")
            self.end_headers()
            html = (ELECTRON_DIR / "src" / "index.html").read_text()
            # Inject the port script right before </head>
            inject = f'<script>window.__DBGUREE_PORT = {BACKEND_PORT};</script>\n'
            html = html.replace("</head>", inject + "</head>", 1)
            # Rewrite the bundle path (served as /bundle.js)
            html = html.replace("../dist/bundle.js", "/bundle.js")
            self.wfile.write(html.encode())
        else:
            # Remap /bundle.js → electron/dist/bundle.js
            if self.path == "/bundle.js":
                self._serve_file(ELECTRON_DIR / "dist" / "bundle.js", "application/javascript")
            else:
                super().do_GET()

    def _serve_file(self, path: Path, mime: str):
        if not path.exists():
            self.send_error(404, f"Not found: {path.name}")
            return
        data = path.read_bytes()
        self.send_response(200)
        self.send_header("Content-Type", mime)
        self.send_header("Content-Length", str(len(data)))
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()
        self.wfile.write(data)

    def log_message(self, fmt, *args):
        print(f"[http] {fmt % args}")


# ── Entry point ────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description="DBGuree dev server")
    parser.add_argument("--port", type=int, default=8080)
    args = parser.parse_args()

    backend_proc = start_backend()

    server = http.server.HTTPServer(("127.0.0.1", args.port), DevHandler)
    print(f"\n{'='*55}")
    print(f"  DBGuree dev server running")
    print(f"  Open in browser:  http://127.0.0.1:{args.port}")
    print(f"  Backend API:      http://127.0.0.1:{BACKEND_PORT}/docs")
    print(f"{'='*55}\n")

    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\n[dev-server] Shutting down…")
    finally:
        backend_proc.terminate()


if __name__ == "__main__":
    main()
