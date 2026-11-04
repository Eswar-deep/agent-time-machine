"""Trusted subprocess boundaries around QuickJS WebAssembly.

The Python/Node coordinators are trusted. Candidate JavaScript is data passed to
QuickJS, never a Node script, subprocess command, Python import, or host eval.
"""
import hashlib
import json
import os
import shutil
import subprocess
import sys
import time
from functools import lru_cache
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
LAUNCHER = ROOT / "scripts" / "coding_sandbox.mjs"
PACKAGE_VERSION = "0.32.0"
DEFAULT_LIMITS = {"memory_bytes": 16 * 1024 * 1024, "guest_timeout_ms": 250,
                  "output_chars": 16 * 1024, "process_timeout_seconds": 12}


class SandboxUnavailable(RuntimeError):
    pass


def clean_environment() -> dict:
    # No MODEL_API_KEY, NODE_OPTIONS, Python startup injection, or credentials.
    names = ("SYSTEMROOT", "WINDIR", "PATH", "PATHEXT", "TEMP", "TMP")
    return {**{name: value for name, value in os.environ.items() if name.upper() in names},
            "PYTHONIOENCODING": "utf-8", "PYTHONUTF8": "1", "TZ": "UTC"}


@lru_cache(maxsize=1)
def runtime_signature() -> dict:
    package = ROOT / "node_modules" / "quickjs-emscripten" / "package.json"
    node = shutil.which("node")
    if not node or not package.is_file() or not LAUNCHER.is_file():
        raise SandboxUnavailable("Coding sandbox unavailable. Install the locked npm dependencies with npm ci; native execution is not a fallback.")
    metadata = json.loads(package.read_text(encoding="utf-8"))
    if metadata["version"] != PACKAGE_VERSION:
        raise SandboxUnavailable("QuickJS runtime version differs from the pinned version. Run npm ci.")
    artifacts = sorted((ROOT / "node_modules" / "@jitl").rglob("*.wasm"))
    if not artifacts:
        raise SandboxUnavailable("QuickJS WebAssembly artifacts are missing. Run npm ci.")
    wasm = {path.relative_to(ROOT / "node_modules").as_posix(): hashlib.sha256(path.read_bytes()).hexdigest()
            for path in artifacts}
    version = subprocess.run([node, "--version"], capture_output=True, text=True,
                             timeout=5, env=clean_environment(), check=True).stdout.strip()
    return {"name": "quickjs-emscripten", "version": PACKAGE_VERSION, "node_version": version,
            "wasm_hashes": wasm, "launcher_sha256": hashlib.sha256(LAUNCHER.read_bytes()).hexdigest(),
            "capabilities": {"host_filesystem": False, "network": False, "process": False,
                             "host_environment": False, "host_callbacks": False}}


def _failure(command: list, message: str, elapsed: float, timed_out=False) -> dict:
    return {"kind": "command", "command": command, "exit_code": None,
            "stdout": "", "stderr": message, "timed_out": timed_out,
            "completed": False, "error": message, "duration_ms": round(elapsed * 1000, 2)}


def run_guest(files: dict, operation: str = "visible", cases=None, execution_config=None) -> dict:
    signature = runtime_signature()
    config = {**DEFAULT_LIMITS, **(execution_config or {})}
    if operation not in ("visible", "probe"):
        raise ValueError("Unsupported sandbox operation.")
    limits = {name: config[name] for name in ("memory_bytes", "guest_timeout_ms", "output_chars")}
    if (type(config["process_timeout_seconds"]) is not int
            or not 1 <= config["process_timeout_seconds"] <= 15):
        raise ValueError("Invalid coding subprocess time allowance.")
    request = json.dumps({"operation": operation, "files": files, "cases": cases or [],
                          "limits": limits}, ensure_ascii=False, allow_nan=False)
    if len(request.encode("utf-8")) > 512 * 1024:
        raise ValueError("Coding sandbox request exceeds 512 KiB.")
    command = ["node", "scripts/coding_sandbox.mjs", "--operation", operation]
    started = time.perf_counter()
    try:
        process = subprocess.run([shutil.which("node"), str(LAUNCHER), "--operation", operation],
                                 input=request, capture_output=True, text=True, encoding="utf-8",
                                 errors="replace", cwd=ROOT, env=clean_environment(),
                                 timeout=config["process_timeout_seconds"])
    except subprocess.TimeoutExpired:
        return _failure(command, "Sandbox process exceeded its hard wall-clock allowance and was terminated.",
                        time.perf_counter() - started, timed_out=True)
    if len(process.stdout.encode("utf-8")) > 512 * 1024:
        return _failure(command, "Sandbox output exceeded the bounded response size.", time.perf_counter() - started)
    try:
        result = json.loads(process.stdout)
        if not isinstance(result, dict):
            raise ValueError("Non-object response")
    except (ValueError, TypeError):
        return _failure(command, "Sandbox returned an invalid response. " + process.stderr[-4000:],
                        time.perf_counter() - started)
    result.update({"kind": "command", "command": command, "runtime": signature,
                   "duration_ms": round((time.perf_counter() - started) * 1000, 2),
                   "launcher_exit_code": process.returncode})
    result["stderr"] = (result.get("stderr", "") + process.stderr)[-16384:]
    result.setdefault("completed", process.returncode in (0, 1) and not result.get("timed_out") and not result.get("error"))
    return result


def protected_verification(files: dict, execution_config: dict) -> dict:
    """Run frozen host assertions in a trusted, separate coordinator process."""
    command = ["python", "-m", "backend.coding_verify"]
    started = time.perf_counter()
    request = json.dumps({"files": files, "execution_config": execution_config}, ensure_ascii=False, allow_nan=False)
    try:
        process = subprocess.run([sys.executable, "-m", "backend.coding_verify"],
                                 input=request, capture_output=True, text=True, encoding="utf-8",
                                 errors="replace", cwd=ROOT, env=clean_environment(), timeout=18)
    except subprocess.TimeoutExpired:
        return {"completed": False, "checks": [], "tamper_detected": False,
                "requirements_hash": "", "protected_evaluator_hash": "", "suite_version": "date-parser-v1",
                "error": "Protected verification exceeded its hard allowance.",
                "command": _failure(command, "Protected verifier timed out and was terminated.",
                                    time.perf_counter() - started, timed_out=True)}
    try:
        result = json.loads(process.stdout)
        if not isinstance(result, dict):
            raise ValueError()
    except (ValueError, TypeError):
        return {"completed": False, "checks": [], "tamper_detected": False,
                "requirements_hash": "", "protected_evaluator_hash": "", "suite_version": "date-parser-v1",
                "error": "Protected verifier returned invalid output.",
                "command": _failure(command, process.stderr[-4000:], time.perf_counter() - started)}
    result["command"] = {"kind": "command", "command": command, "exit_code": process.returncode,
                         "stdout": result.get("report", ""), "raw_stdout": process.stdout,
                         "stderr": process.stderr[-16384:], "timed_out": False,
                         "duration_ms": round((time.perf_counter() - started) * 1000, 2)}
    result["completed"] = bool(result.get("completed")) and process.returncode in (0, 1)
    return result

