#!/usr/bin/env python3
from __future__ import annotations

import argparse
import os
import pathlib
import platform
import shutil
import subprocess
import sys
import tempfile


ROOT = pathlib.Path(__file__).resolve().parent
SRC_DIR = ROOT / "src"
BUILD_DIR = ROOT / "build"
MANAGED_DIR = SRC_DIR / "web" / "managed"
TOOLS_DIR = SRC_DIR / "tools"
sys.path.insert(0, str(TOOLS_DIR))
from runner import resolve_kinal


def is_windows() -> bool:
    return os.name == "nt"


def output_executable() -> pathlib.Path:
    return BUILD_DIR / ("Website.exe" if is_windows() else "Website")


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
    compiler = resolve_kinal(None)
    if not compiler:
        raise SystemExit("Set KINAL_PATH to the Kinal compiler executable.")
    source = pathlib.Path(os.environ.get("KINAL_SOURCE_ROOT", ROOT.parent / "Kinal")).resolve()
    version = pathlib.Path("IO.Web/2.0.0")
    if not (source / "libs/std" / version / "package.knpkg.json").is_file():
        raise SystemExit("Set KINAL_SOURCE_ROOT to a Kinal checkout containing IO.Web 2.0.0.")
    with tempfile.TemporaryDirectory(prefix="kinal-site-stdlib-") as staging:
        std = pathlib.Path(staging)
        package = std / version
        shutil.copytree(source / "libs/std" / version, package,
                        ignore=shutil.ignore_patterns("lib", "native"))
        subprocess.run([sys.executable, source / "infra/scripts/x/native_http.py",
                        "--std", std, "--package", "IO.Web"], check=True)
        (package / "lib").mkdir()
        subprocess.run([compiler, "pkg", "build", "--manifest", package / "package.knpkg.json",
                        "-o", package / "lib/IO.Web.klib"], check=True)
        build = [compiler, "build", "--project", ROOT / "kinal.knproj", "--stdpkg-root", std]
        if sys.platform.startswith("linux"):
            arch = {"x86_64": "linux-x64", "aarch64": "linux-arm64"}[platform.machine()]
            runtime = pathlib.Path(compiler).resolve().parent / "runtime" / arch
            obj = std / "site.o"
            subprocess.run([*build, "--emit", "obj", "-o", obj], cwd=ROOT, check=True)
            subprocess.run([os.environ.get("CC", "cc"), "-no-pie", "-o", output, obj,
                            runtime / "kn_runtime.o", runtime / "kn_math.o",
                            package / "native" / arch / "kn_web_native.o",
                            "-pthread", "-ldl", "-lm"], check=True)
        else:
            subprocess.run([*build, "-o", output], cwd=ROOT, check=True)
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
