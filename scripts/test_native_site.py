"""Exercise the staged site on loopback before uploading a production bundle."""
import contextlib
import http.client
import os
from pathlib import Path
import shutil
import socket
import subprocess
import tempfile
import time
from urllib.parse import urlencode

ROOT = Path(__file__).resolve().parents[1]
BUILD = ROOT / "build"
PORT = 18081

def request(method, path, body=None):
    conn = http.client.HTTPConnection("127.0.0.1", PORT, timeout=20)
    try:
        conn.request(method, path, body, {"Content-Type": "text/plain; charset=utf-8"})
        reply = conn.getresponse()
        return reply.status, reply.getheader("Content-Type", ""), reply.read()
    finally:
        conn.close()

def check(stage):
    binary = stage / ("Website.exe" if os.name == "nt" else "Website")
    with socket.socket() as probe:
        probe.bind(("127.0.0.1", PORT))
    with subprocess.Popen([binary, "127.0.0.1"], cwd=stage) as site:
        try:
            for _ in range(200):
                if site.poll() is not None:
                    raise RuntimeError(f"Website exited during startup ({site.returncode})")
                with contextlib.suppress(ConnectionError):
                    if request("GET", "/robots.txt")[0] == 200:
                        break
                time.sleep(0.1)
            for path in ("/", "/zh-CN", "/docs", "/zh-CN/docs"):
                status, kind, page = request("GET", path)
                assert status == 200 and "text/html" in kind and b"Kinal" in page, path
            status, kind, css = request("GET", "/static/site.css")
            assert status == 200 and "text/css" in kind and len(css) > 512
            assert request("HEAD", "/static/site.css")[2] == b""
            assert request("GET", "/no-such-site-page")[0] == 404
            assert request("POST", "/api/run", b" " * 4097)[0] == 413
            source = (stage / "managed/static/content/hero.kn").read_bytes()
            source += f"\n// smoke {time.time_ns()}".encode()
            status, _, job = request("POST", "/api/run", source)
            assert status == 202 and job.strip(), (status, job)
            path = "/api/run/status?" + urlencode({"id": job.decode().strip()})
            deadline = time.monotonic() + 120
            while time.monotonic() < deadline:
                status, _, data = request("GET", path)
                if status != 202:
                    assert status == 200 and data.decode().splitlines() == ["completed", "Hello, World!"], (status, data)
                    print("Native site passed pages, static assets, body limit and Playground checks.")
                    return
                time.sleep(0.5)
            raise TimeoutError("Playground job did not complete")
        finally:
            site.terminate()
            try:
                site.wait(timeout=10)
            except subprocess.TimeoutExpired:
                site.kill()

if __name__ == "__main__":
    with tempfile.TemporaryDirectory(prefix="kinal-site-check-") as tmp:
        stage = Path(tmp) / "site"
        stage.mkdir()
        for name in ("managed", "tools"):
            shutil.copytree(BUILD / name, stage / name)
        binary = "Website.exe" if os.name == "nt" else "Website"
        shutil.copy2(BUILD / binary, stage / binary)
        (stage / "temp").mkdir()
        check(stage)
