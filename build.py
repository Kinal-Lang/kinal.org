#!/usr/bin/env python3
from __future__ import annotations

import argparse
import os
import pathlib
import shutil
import subprocess
import sys


ROOT = pathlib.Path(__file__).resolve().parent
SRC_DIR = ROOT / "src"
BUILD_DIR = ROOT / "build"
ENTRY_FILE = SRC_DIR / "Main.kn"
MANAGED_DIR = SRC_DIR / "web" / "managed"
TOOLS_DIR = SRC_DIR / "tools"
RUNNER = TOOLS_DIR / "runner.py"


def is_windows() -> bool:
    return os.name == "nt"


def output_executable() -> pathlib.Path:
    return BUILD_DIR / ("Website.exe" if is_windows() else "Website")


def cache_source_files() -> list[pathlib.Path]:
    return sorted(
        [path for path in SRC_DIR.glob("*.kn") if path.resolve() != ENTRY_FILE.resolve()],
        key=lambda path: path.name.lower(),
    )


def copy_tree(src: pathlib.Path, dst: pathlib.Path) -> None:
    if dst.exists():
        shutil.rmtree(dst)
    shutil.copytree(src, dst)


def minify_with_npx(source: pathlib.Path, output: pathlib.Path, *args: str) -> None:
    npx = shutil.which("npx")
    if not npx:
        shutil.copy2(source, output)
        return

    proc = subprocess.run([npx, *args], cwd=str(ROOT))
    if proc.returncode != 0:
        raise SystemExit(f"Failed to process {source.name} with npx.")


def minify_static_assets(source_root: pathlib.Path, built_root: pathlib.Path) -> None:
    for source_js in source_root.rglob("*.js"):
        relative = source_js.relative_to(source_root)
        built_js = built_root / relative
        minify_with_npx(source_js, built_js, "terser", str(source_js), "--compress", "--mangle", "--output", str(built_js))

    for source_css in source_root.rglob("*.css"):
        relative = source_css.relative_to(source_root)
        built_css = built_root / relative
        minify_with_npx(source_css, built_css, "csso-cli", str(source_css), "--output", str(built_css))


def prepare_assets() -> None:
    BUILD_DIR.mkdir(parents=True, exist_ok=True)
    for name in ("managed", "tools", "temp"):
        target = BUILD_DIR / name
        if target.exists():
            if target.is_dir():
                shutil.rmtree(target)
            else:
                target.unlink()

    copy_tree(MANAGED_DIR, BUILD_DIR / "managed")
    copy_tree(TOOLS_DIR, BUILD_DIR / "tools")
    (BUILD_DIR / "temp").mkdir(parents=True, exist_ok=True)
    minify_static_assets(MANAGED_DIR / "static", BUILD_DIR / "managed" / "static")


def compile_project() -> pathlib.Path:
    output = output_executable()
    compile_log = BUILD_DIR / "compile.txt"
    cache_sources = cache_source_files()
    cmd = [
        sys.executable,
        str(RUNNER),
        "compile",
        "--source",
        str(ENTRY_FILE),
        "--output",
        str(output),
        "--log",
        str(compile_log),
    ]
    for source in cache_sources:
        cmd.extend(["--cache-source", str(source)])
    proc = subprocess.run(
        cmd,
        cwd=str(ROOT),
    )
    if proc.returncode != 0:
        if compile_log.exists():
            sys.stderr.write(compile_log.read_text(encoding="utf-8", errors="replace"))
        raise SystemExit(proc.returncode)
    return output


def run_project(exe: pathlib.Path, host: str) -> int:
    if not is_windows():
        exe.chmod(exe.stat().st_mode | 0o111)
    proc = subprocess.run([str(exe), host], cwd=str(BUILD_DIR))
    return proc.returncode


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--run", action="store_true")
    parser.add_argument("--host", default="0.0.0.0")
    args = parser.parse_args()

    prepare_assets()
    exe = compile_project()
    print(f"Built {exe}")
    print(f"Assets copied to {BUILD_DIR}")

    if args.run:
        return run_project(exe, args.host)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
