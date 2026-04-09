#!/usr/bin/env python3
from __future__ import annotations

import argparse
import ctypes
import contextlib
import hashlib
import os
import pathlib
import shutil
import signal
import subprocess
import sys
import time
import tempfile
from typing import Optional


def is_windows() -> bool:
    return os.name == "nt"


def host_kinal_name() -> str:
    return "kinal.exe" if is_windows() else "kinal"


def resolve_candidate_path(raw: str) -> pathlib.Path:
    path = pathlib.Path(raw).expanduser()
    if path.is_dir():
        path = path / host_kinal_name()
    return path


def resolve_kinal(explicit: Optional[str]) -> Optional[str]:
    if explicit:
        candidate = resolve_candidate_path(explicit)
        if candidate.exists():
            return str(candidate)

    for env_name in ("KINAL_PATH", "KINAL", "KINAL_HOME"):
        raw = os.environ.get(env_name, "").strip()
        if not raw:
            continue
        candidate = resolve_candidate_path(raw)
        if candidate.exists():
            return str(candidate)

    for tool_name in (host_kinal_name(), "kinal"):
        found = shutil.which(tool_name)
        if found:
            return found

    cwd = pathlib.Path.cwd()
    scanned = find_kinal_in_ancestors(cwd)
    if scanned:
        return scanned

    return None


def resolve_stdpkg_root(compiler_path: str) -> Optional[str]:
    compiler = pathlib.Path(compiler_path).resolve()
    candidates = [compiler.parent / "stdpkg"]

    current = compiler.parent
    for _ in range(5):
        candidates.append(current / "stdpkg")
        if current.parent == current:
            break
        current = current.parent

    seen: set[str] = set()
    for candidate in candidates:
        key = str(candidate)
        if key in seen:
            continue
        seen.add(key)
        if candidate.is_dir():
            return str(candidate)

    return None


def find_kinal_in_ancestors(start: pathlib.Path) -> Optional[str]:
    exe_name = host_kinal_name()
    anchors: list[pathlib.Path] = []
    current = start.resolve()
    for _ in range(5):
        anchors.append(current)
        if current.parent == current:
            break
        current = current.parent

    suffixes = [
        pathlib.Path("release") / "Kinal-win-x64" / exe_name,
        pathlib.Path("release") / "Kinal-linux-x64" / exe_name,
        pathlib.Path("release") / "Kinal-win-x64.next" / exe_name,
        pathlib.Path("release") / "Kinal-linux-x64.next" / exe_name,
    ]

    names = {"Kinal-Lang", "Flexia-Meta", "build-kinal", "Kinal"}
    for anchor in anchors:
        direct = [anchor]
        try:
            direct.extend(child for child in anchor.iterdir() if child.is_dir() and child.name in names)
        except OSError:
            pass

        for base in direct:
            for suffix in suffixes:
                candidate = (base / suffix).resolve()
                if candidate.exists():
                    return str(candidate)
                try:
                    for nested in base.iterdir():
                        if not nested.is_dir():
                            continue
                        nested_candidate = (nested / suffix).resolve()
                        if nested_candidate.exists():
                            return str(nested_candidate)
                except OSError:
                    pass

    return None


def write_text(path: str, content: str) -> None:
    pathlib.Path(path).parent.mkdir(parents=True, exist_ok=True)
    pathlib.Path(path).write_text(content, encoding="utf-8")


def read_text(path: str) -> str:
    return pathlib.Path(path).read_text(encoding="utf-8", errors="replace")


def write_text_if_present(src: pathlib.Path, dst: pathlib.Path) -> None:
    if not src.exists():
        return
    dst.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(src, dst)


def compile_slot_count() -> int:
    raw = os.environ.get("KINAL_COMPILE_SLOTS", "").strip()
    if raw.isdigit():
        return max(1, int(raw))
    cpus = os.cpu_count() or 2
    return max(2, min(4, cpus))


def job_slot_count() -> int:
    raw = os.environ.get("KINAL_JOB_SLOTS", "").strip()
    if raw.isdigit():
        return max(1, int(raw))
    cpus = os.cpu_count() or 4
    return max(4, min(8, cpus * 2))


def clean_stale_lock_dir(lock_dir: pathlib.Path, stale_seconds: int) -> None:
    try:
        stat = lock_dir.stat()
    except FileNotFoundError:
        return
    if stale_seconds > 0 and time.time() - stat.st_mtime > stale_seconds:
        shutil.rmtree(lock_dir, ignore_errors=True)


@contextlib.contextmanager
def directory_lock(lock_dir: pathlib.Path, stale_seconds: int = 1800):
    lock_dir.parent.mkdir(parents=True, exist_ok=True)
    while True:
        clean_stale_lock_dir(lock_dir, stale_seconds)
        try:
            os.mkdir(lock_dir)
            break
        except FileExistsError:
            time.sleep(0.05)
    try:
        (lock_dir / "owner.txt").write_text(f"{os.getpid()}\n{time.time()}\n", encoding="utf-8")
        yield
    finally:
        shutil.rmtree(lock_dir, ignore_errors=True)


@contextlib.contextmanager
def compile_slot_lock(slots_root: pathlib.Path, slots: int):
    claim: Optional[pathlib.Path] = None
    slots_root.mkdir(parents=True, exist_ok=True)
    slots = max(1, slots)
    while claim is None:
        for index in range(slots):
            slot_dir = slots_root / f"slot-{index}"
            clean_stale_lock_dir(slot_dir, 1800)
            try:
                os.mkdir(slot_dir)
                claim = slot_dir
                break
            except FileExistsError:
                continue
        if claim is None:
            time.sleep(0.05)
    try:
        (claim / "owner.txt").write_text(f"{os.getpid()}\n{time.time()}\n", encoding="utf-8")
        yield
    finally:
        shutil.rmtree(claim, ignore_errors=True)


def cache_key_for_source(source_paths: list[pathlib.Path], compiler: str, stdpkg_root: Optional[str]) -> str:
    compiler_path = pathlib.Path(compiler).resolve()
    digest = hashlib.sha256()
    for source_path in source_paths:
        digest.update(source_path.read_bytes())
        digest.update(str(source_path).encode("utf-8", "replace"))
    digest.update(str(compiler_path).encode("utf-8", "replace"))
    try:
        compiler_stat = compiler_path.stat()
        digest.update(str(compiler_stat.st_mtime_ns).encode("utf-8"))
        digest.update(str(compiler_stat.st_size).encode("utf-8"))
    except OSError:
        pass
    if stdpkg_root:
        stdpkg_path = pathlib.Path(stdpkg_root).resolve()
        digest.update(str(stdpkg_path).encode("utf-8", "replace"))
        try:
            stdpkg_stat = stdpkg_path.stat()
            digest.update(str(stdpkg_stat.st_mtime_ns).encode("utf-8"))
        except OSError:
            pass
    digest.update(b"runner-cache-v2")
    digest.update(b"windows" if is_windows() else b"linux")
    return digest.hexdigest()


@contextlib.contextmanager
def compile_lock(lock_path: pathlib.Path):
    lock_path.parent.mkdir(parents=True, exist_ok=True)
    handle = lock_path.open("a+b")
    try:
        if is_windows():
            import msvcrt

            while True:
                try:
                    msvcrt.locking(handle.fileno(), msvcrt.LK_LOCK, 1)
                    break
                except OSError:
                    time.sleep(0.05)
        else:
            import fcntl

            fcntl.flock(handle.fileno(), fcntl.LOCK_EX)
        yield
    finally:
        try:
            if is_windows():
                import msvcrt

                handle.seek(0)
                msvcrt.locking(handle.fileno(), msvcrt.LK_UNLCK, 1)
            else:
                import fcntl

                fcntl.flock(handle.fileno(), fcntl.LOCK_UN)
        finally:
            handle.close()


def quote_program_arg(arg: str) -> str:
    if not arg:
        return '""'
    if not any(ch in arg for ch in ' \t"'):
        return arg
    escaped = arg.replace("\\", "\\\\").replace('"', '\\"')
    return f'"{escaped}"'


def compiler_env(project_root: pathlib.Path) -> dict[str, str]:
    env = os.environ.copy()
    temp_root = (project_root / "temp").resolve()
    home_root = temp_root / "home"
    zig_root = temp_root / "zig-cache"
    xdg_cache = temp_root / "xdg-cache"

    for path in (temp_root, home_root, zig_root / "global", zig_root / "local", xdg_cache):
        path.mkdir(parents=True, exist_ok=True)

    env["HOME"] = str(home_root)
    env["XDG_CACHE_HOME"] = str(xdg_cache)
    env["ZIG_GLOBAL_CACHE_DIR"] = str((zig_root / "global").resolve())
    env["ZIG_LOCAL_CACHE_DIR"] = str((zig_root / "local").resolve())
    return env


def compiler_bundle_root(compiler: str) -> pathlib.Path:
    return pathlib.Path(compiler).resolve().parent


def compiler_runtime_dir(compiler: str) -> pathlib.Path:
    return compiler_bundle_root(compiler) / "runtime" / "linux-x64"


def compiler_ioweb_native_dir(compiler: str) -> pathlib.Path:
    return compiler_bundle_root(compiler) / "stdpkg" / "IO.Web" / "1.0.0" / "native" / "linux-x64"


def copy_tree_contents(src_dir: pathlib.Path, dst_dir: pathlib.Path) -> None:
    for entry in src_dir.iterdir():
        target = dst_dir / entry.name
        if entry.is_dir():
            shutil.copytree(entry, target)
        else:
            shutil.copy2(entry, target)


def compile_source(args: argparse.Namespace) -> int:
    compiler = resolve_kinal(args.kinal)
    if not compiler:
        write_text(args.log, "Unable to locate kinal compiler. Set KINAL_PATH/KINAL/KINAL_HOME or add kinal to PATH.\n")
        return 1

    project_root = pathlib.Path(__file__).resolve().parents[2]
    cmd = [compiler, "build"]
    stdpkg_root = resolve_stdpkg_root(compiler)
    source_path = pathlib.Path(args.source).resolve()
    extra_source_paths = [pathlib.Path(path).resolve() for path in getattr(args, "extra_source", [])]
    all_source_paths = [source_path, *extra_source_paths]
    cache_only_source_paths = [pathlib.Path(path).resolve() for path in getattr(args, "cache_source", [])]
    cache_source_paths = [*all_source_paths, *cache_only_source_paths]
    if stdpkg_root:
        cmd.extend(["--stdpkg-root", stdpkg_root])
    env = compiler_env(project_root)
    output_path = pathlib.Path(args.output).resolve()
    log_path = pathlib.Path(args.log).resolve()
    cache_root = project_root / "temp" / "compile-cache"
    cache_key = cache_key_for_source(cache_source_paths, compiler, stdpkg_root)
    cache_dir = cache_root / cache_key
    cache_artifact = cache_dir / ("artifact.exe" if is_windows() else "artifact")
    cache_log = cache_dir / "compile.txt"
    build_lock_dir = project_root / "temp" / "compile-build-locks" / cache_key
    slot_root = project_root / "temp" / "compile-slots"

    def restore_from_cache() -> bool:
        if not cache_artifact.exists():
            return False
        output_path.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(cache_artifact, output_path)
        if not is_windows():
            output_path.chmod(output_path.stat().st_mode | 0o111)
        if cache_log.exists():
            write_text_if_present(cache_log, log_path)
        else:
            write_text(str(log_path), "cache hit\n")
        return True

    def persist_cache() -> None:
        if not output_path.exists():
            return
        cache_dir.mkdir(parents=True, exist_ok=True)
        shutil.copy2(output_path, cache_artifact)
        if not is_windows():
            cache_artifact.chmod(cache_artifact.stat().st_mode | 0o111)
        write_text_if_present(log_path, cache_log)

    def compile_windows_or_direct(compile_cwd: pathlib.Path, work_source_paths: list[pathlib.Path], work_output_path: pathlib.Path, temp_work_dir: Optional[pathlib.Path]) -> int:
        local_cmd = list(cmd)
        for path in work_source_paths:
            local_cmd.append(str(path))
        local_cmd.extend(["-o", str(work_output_path)])
        proc = subprocess.run(
            local_cmd,
            cwd=str(compile_cwd),
            env=env,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
            encoding="utf-8",
            errors="replace",
        )
        write_text(str(log_path), proc.stdout or "")
        if proc.returncode == 0 and temp_work_dir is not None and work_output_path.exists():
            output_path.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(work_output_path, output_path)
        return proc.returncode

    def compile_linux_via_object_then_cc(compile_cwd: pathlib.Path, work_source_path: pathlib.Path, work_output_path: pathlib.Path, temp_work_dir: Optional[pathlib.Path]) -> int:
        object_path = work_output_path.with_suffix(".o")
        local_compile_cmd = list(cmd)
        local_compile_cmd.extend(["--emit", "obj", str(work_source_path), "-o", str(object_path)])
        compile_proc = subprocess.run(
            local_compile_cmd,
            cwd=str(compile_cwd),
            env=env,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
            encoding="utf-8",
            errors="replace",
        )
        log_parts: list[str] = []
        if compile_proc.stdout:
            log_parts.append(compile_proc.stdout)
        if compile_proc.returncode != 0:
            write_text(str(log_path), "".join(log_parts))
            return compile_proc.returncode

        runtime_dir = compiler_runtime_dir(compiler)
        runtime_obj = runtime_dir / "kn_runtime.o"
        math_obj = runtime_dir / "kn_math.o"
        ioweb_native_dir = compiler_ioweb_native_dir(compiler)
        civet_obj = ioweb_native_dir / "CivetWeb.o"
        web_obj = ioweb_native_dir / "kn_web_civet.o"
        link_cmd = [
            "cc",
            "-no-pie",
            "-o",
            str(work_output_path),
            str(object_path),
            str(runtime_obj),
            str(math_obj),
        ]
        if civet_obj.exists() and web_obj.exists():
            link_cmd.extend([str(civet_obj), str(web_obj), "-pthread"])
        link_cmd.extend([
            "-ldl",
            "-lm",
        ])
        link_proc = subprocess.run(
            link_cmd,
            cwd=str(compile_cwd),
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
            encoding="utf-8",
            errors="replace",
        )
        if link_proc.stdout:
            log_parts.append(link_proc.stdout)
        write_text(str(log_path), "".join(log_parts))
        if link_proc.returncode == 0 and temp_work_dir is not None and work_output_path.exists():
            output_path.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(work_output_path, output_path)
        return link_proc.returncode

    if restore_from_cache():
        return 0

    builder = False
    build_lock_dir.parent.mkdir(parents=True, exist_ok=True)
    while True:
        if restore_from_cache():
            return 0
        clean_stale_lock_dir(build_lock_dir, 1800)
        try:
            os.mkdir(build_lock_dir)
            (build_lock_dir / "owner.txt").write_text(f"{os.getpid()}\n{time.time()}\n", encoding="utf-8")
            builder = True
            break
        except FileExistsError:
            time.sleep(0.05)

    temp_work_dir: Optional[pathlib.Path] = None
    compile_cwd = source_path.parent
    work_source_paths = list(all_source_paths)
    work_output_path = output_path

    if not is_windows() and not extra_source_paths:
        temp_work_dir = pathlib.Path(tempfile.mkdtemp(prefix="kinaljob-"))
        copy_tree_contents(source_path.parent, temp_work_dir)
        work_source_paths = [temp_work_dir / source_path.name]
        work_output_path = temp_work_dir / output_path.name
        compile_cwd = temp_work_dir

    try:
        with compile_slot_lock(slot_root, compile_slot_count()):
            if is_windows() or extra_source_paths:
                compile_rc = compile_windows_or_direct(compile_cwd, work_source_paths, work_output_path, temp_work_dir)
            else:
                compile_rc = compile_linux_via_object_then_cc(compile_cwd, work_source_paths[0], work_output_path, temp_work_dir)
        if compile_rc == 0:
            persist_cache()
        return compile_rc
    finally:
        if builder:
            shutil.rmtree(build_lock_dir, ignore_errors=True)
        if temp_work_dir is not None:
            shutil.rmtree(temp_work_dir, ignore_errors=True)


def kill_process_tree(pid: int) -> None:
    if is_windows():
        subprocess.run(
            ["taskkill", "/PID", str(pid), "/T", "/F"],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            check=False,
        )
        return

    try:
        os.killpg(pid, signal.SIGKILL)
    except ProcessLookupError:
        return
    except Exception:
        try:
            os.kill(pid, signal.SIGKILL)
        except Exception:
            pass


def read_rss_bytes(pid: int) -> Optional[int]:
    if is_windows():
        return read_windows_rss(pid)
    status_path = pathlib.Path(f"/proc/{pid}/status")
    try:
        text = status_path.read_text(encoding="utf-8", errors="replace")
    except OSError:
        return None

    for line in text.splitlines():
        if not line.startswith("VmRSS:"):
            continue
        parts = line.split()
        if len(parts) >= 2 and parts[1].isdigit():
            return int(parts[1]) * 1024
    return None


def read_windows_rss(pid: int) -> Optional[int]:
    PROCESS_QUERY_LIMITED_INFORMATION = 0x1000
    PROCESS_VM_READ = 0x0010

    class PROCESS_MEMORY_COUNTERS(ctypes.Structure):
        _fields_ = [
            ("cb", ctypes.c_ulong),
            ("PageFaultCount", ctypes.c_ulong),
            ("PeakWorkingSetSize", ctypes.c_size_t),
            ("WorkingSetSize", ctypes.c_size_t),
            ("QuotaPeakPagedPoolUsage", ctypes.c_size_t),
            ("QuotaPagedPoolUsage", ctypes.c_size_t),
            ("QuotaPeakNonPagedPoolUsage", ctypes.c_size_t),
            ("QuotaNonPagedPoolUsage", ctypes.c_size_t),
            ("PagefileUsage", ctypes.c_size_t),
            ("PeakPagefileUsage", ctypes.c_size_t),
        ]

    kernel32 = ctypes.WinDLL("kernel32", use_last_error=True)
    psapi = ctypes.WinDLL("psapi", use_last_error=True)
    open_process = kernel32.OpenProcess
    open_process.argtypes = [ctypes.c_ulong, ctypes.c_int, ctypes.c_ulong]
    open_process.restype = ctypes.c_void_p
    close_handle = kernel32.CloseHandle
    close_handle.argtypes = [ctypes.c_void_p]
    close_handle.restype = ctypes.c_int
    get_memory_info = psapi.GetProcessMemoryInfo
    get_memory_info.argtypes = [ctypes.c_void_p, ctypes.POINTER(PROCESS_MEMORY_COUNTERS), ctypes.c_ulong]
    get_memory_info.restype = ctypes.c_int

    handle = open_process(PROCESS_QUERY_LIMITED_INFORMATION | PROCESS_VM_READ, 0, pid)
    if not handle:
        return None
    try:
        counters = PROCESS_MEMORY_COUNTERS()
        counters.cb = ctypes.sizeof(PROCESS_MEMORY_COUNTERS)
        if not get_memory_info(handle, ctypes.byref(counters), counters.cb):
            return None
        return int(counters.WorkingSetSize)
    finally:
        close_handle(handle)


def run_program(args: argparse.Namespace) -> int:
    exe_path = pathlib.Path(args.exe)
    stdout_path = pathlib.Path(f"{args.result}.stdout")
    stderr_path = pathlib.Path(args.error)
    result_path = pathlib.Path(args.result)
    pid_path = pathlib.Path(args.pid)

    for path in (result_path, stdout_path, stderr_path, pid_path):
        try:
            path.unlink()
        except FileNotFoundError:
            pass

    stdout_path.parent.mkdir(parents=True, exist_ok=True)
    stderr_path.parent.mkdir(parents=True, exist_ok=True)
    result_path.parent.mkdir(parents=True, exist_ok=True)
    pid_path.parent.mkdir(parents=True, exist_ok=True)

    creationflags = getattr(subprocess, "CREATE_NO_WINDOW", 0) if is_windows() else 0
    preexec_fn = os.setsid if not is_windows() else None

    with stdout_path.open("wb") as stdout_file, stderr_path.open("wb") as stderr_file:
        proc = subprocess.Popen(
            [str(exe_path)],
            stdout=stdout_file,
            stderr=stderr_file,
            stdin=subprocess.DEVNULL,
            creationflags=creationflags,
            preexec_fn=preexec_fn,
        )

    pid_path.write_text(str(proc.pid), encoding="utf-8")

    start = time.monotonic()
    status_message = ""

    while proc.poll() is None:
        time.sleep(0.05)

        rss = read_rss_bytes(proc.pid)
        if rss is not None and args.memory_limit_bytes > 0 and rss > args.memory_limit_bytes:
            kill_process_tree(proc.pid)
            status_message = "[Process killed: memory limit exceeded]"
            break

        if args.timeout_ms > 0 and (time.monotonic() - start) * 1000 > args.timeout_ms:
            kill_process_tree(proc.pid)
            status_message = "[Timeout: exceeded 5 seconds]"
            break

    try:
        proc.wait(timeout=1)
    except Exception:
        pass

    stdout = read_text(str(stdout_path)) if stdout_path.exists() else ""
    stderr = read_text(str(stderr_path)) if stderr_path.exists() else ""

    parts: list[str] = []
    if stdout:
        parts.append(stdout)
    if status_message:
        parts.append(status_message)
    if stderr:
        parts.append(f"[stderr]\n{stderr}")

    final_text = "\n".join(part.rstrip("\r\n") for part in parts if part != "")
    if final_text:
        final_text += "\n"

    encoded = final_text.encode("utf-8")
    if len(encoded) > args.max_output_bytes:
        encoded = encoded[: args.max_output_bytes]
        final_text = encoded.decode("utf-8", errors="ignore").rstrip("\r\n") + "\n..."

    write_text(str(result_path), final_text)

    for path in (stdout_path, stderr_path):
        try:
            path.unlink()
        except FileNotFoundError:
            pass

    return 0


def run_job(args: argparse.Namespace) -> int:
    project_root = pathlib.Path(__file__).resolve().parents[2]
    job_slots_root = project_root / "temp" / "job-slots"
    with compile_slot_lock(job_slots_root, job_slot_count()):
        write_text(args.status, "compiling")
        compile_args = argparse.Namespace(
            kinal=args.kinal,
            source=args.source,
            output=args.output,
            log=args.log,
        )
        compile_rc = compile_source(compile_args)
        if compile_rc != 0 or not pathlib.Path(args.output).exists():
            message = read_text(args.log) if pathlib.Path(args.log).exists() else "Compilation failed.\n"
            write_text(args.result, message)
            write_text(args.status, "rejected")
            return 0

        write_text(args.status, "running")
        run_args = argparse.Namespace(
            exe=args.output,
            result=args.result,
            error=args.error,
            pid=args.pid,
            timeout_ms=args.timeout_ms,
            memory_limit_bytes=args.memory_limit_bytes,
            max_output_bytes=args.max_output_bytes,
        )

        try:
            run_program(run_args)
            write_text(args.status, "completed")
        except Exception as exc:
            write_text(args.result, f"{type(exc).__name__}: {exc}\n")
            write_text(args.status, "failed")
    return 0


def spawn_job(args: argparse.Namespace) -> int:
    child_cmd = [
        sys.executable,
        str(pathlib.Path(__file__).resolve()),
        "job",
        "--source",
        args.source,
        "--output",
        args.output,
        "--log",
        args.log,
        "--result",
        args.result,
        "--error",
        args.error,
        "--pid",
        args.pid,
        "--status",
        args.status,
        "--timeout-ms",
        str(args.timeout_ms),
        "--memory-limit-bytes",
        str(args.memory_limit_bytes),
        "--max-output-bytes",
        str(args.max_output_bytes),
    ]
    if args.kinal:
        child_cmd.extend(["--kinal", args.kinal])

    popen_kwargs: dict = {
        "stdin": subprocess.DEVNULL,
        "stdout": subprocess.DEVNULL,
        "stderr": subprocess.DEVNULL,
        "close_fds": True,
    }

    if is_windows():
        creationflags = 0
        creationflags |= getattr(subprocess, "DETACHED_PROCESS", 0)
        creationflags |= getattr(subprocess, "CREATE_NEW_PROCESS_GROUP", 0)
        creationflags |= getattr(subprocess, "CREATE_NO_WINDOW", 0)
        popen_kwargs["creationflags"] = creationflags
    else:
        popen_kwargs["start_new_session"] = True

    subprocess.Popen(child_cmd, **popen_kwargs)
    return 0


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser()
    sub = parser.add_subparsers(dest="cmd", required=True)

    compile_parser = sub.add_parser("compile")
    compile_parser.add_argument("--kinal")
    compile_parser.add_argument("--source", required=True)
    compile_parser.add_argument("--extra-source", action="append", default=[])
    compile_parser.add_argument("--cache-source", action="append", default=[])
    compile_parser.add_argument("--output", required=True)
    compile_parser.add_argument("--log", required=True)
    compile_parser.set_defaults(func=compile_source)

    run_parser = sub.add_parser("run")
    run_parser.add_argument("--exe", required=True)
    run_parser.add_argument("--result", required=True)
    run_parser.add_argument("--error", required=True)
    run_parser.add_argument("--pid", required=True)
    run_parser.add_argument("--timeout-ms", type=int, default=5000)
    run_parser.add_argument("--memory-limit-bytes", type=int, default=8 * 1024 * 1024)
    run_parser.add_argument("--max-output-bytes", type=int, default=4096)
    run_parser.set_defaults(func=run_program)

    job_parser = sub.add_parser("job")
    job_parser.add_argument("--kinal")
    job_parser.add_argument("--source", required=True)
    job_parser.add_argument("--output", required=True)
    job_parser.add_argument("--log", required=True)
    job_parser.add_argument("--result", required=True)
    job_parser.add_argument("--error", required=True)
    job_parser.add_argument("--pid", required=True)
    job_parser.add_argument("--status", required=True)
    job_parser.add_argument("--timeout-ms", type=int, default=5000)
    job_parser.add_argument("--memory-limit-bytes", type=int, default=8 * 1024 * 1024)
    job_parser.add_argument("--max-output-bytes", type=int, default=4096)
    job_parser.set_defaults(func=run_job)

    spawn_parser = sub.add_parser("spawn-job")
    spawn_parser.add_argument("--kinal")
    spawn_parser.add_argument("--source", required=True)
    spawn_parser.add_argument("--output", required=True)
    spawn_parser.add_argument("--log", required=True)
    spawn_parser.add_argument("--result", required=True)
    spawn_parser.add_argument("--error", required=True)
    spawn_parser.add_argument("--pid", required=True)
    spawn_parser.add_argument("--status", required=True)
    spawn_parser.add_argument("--timeout-ms", type=int, default=5000)
    spawn_parser.add_argument("--memory-limit-bytes", type=int, default=8 * 1024 * 1024)
    spawn_parser.add_argument("--max-output-bytes", type=int, default=4096)
    spawn_parser.set_defaults(func=spawn_job)

    return parser


def main() -> int:
    parser = build_parser()
    args = parser.parse_args()
    return args.func(args)


if __name__ == "__main__":
    raise SystemExit(main())
