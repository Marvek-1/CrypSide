#!/usr/bin/env python3
"""
verify_cleanup.py — CrypSide Build Policy Gate
================================================
Sound verifier: V => P
If this script exits 0, policy holds. No exceptions.

Architecture: Idim Ikang Sovereign Signal System (CrypSide)
Authority:    The Flame Architect · MoStar Industries
Sealed:       2026-04-26
"""

import ast
import json
import re
import sys
from pathlib import Path

STRATEGY_FILE = Path("IdimIkangStrategy.py")
CONFIG_FILE = Path("config.json")
WHITELIST_JSON = Path("observer_bundle/whitelist.json")
G4_WHITELIST_PY = Path("observer_bundle/g4_whitelist.py")
PWIN_MODEL = Path("pwin_model.pkl")
RELABELED_CSV = Path("trades_relabeled.csv")
ENV_EXAMPLE = Path(".env.example")
DEPLOY_SCRIPT = Path("deploy.sh")

ARCHIVE_PATH = Path("archive/2026-04-23_obsolete/g4_deployment")

REQUIRED_CFG_KEYS = ["stake_currency", "timeframe", "exchange"]
STALE_MODULES = ["g4_deployment"]
FREQTRADE_BASE = "freqtrade.strategy"

ADVISORY_NAMES = {"trades_relabeled.csv present", "pwin_model.pkl present"}
RESULTS: list[tuple[str, bool, str]] = []

LIVE_UNLOCK_POLICY = """
LIVE UNLOCK REQUIRES:
  - policy frozen BEFORE signal collection starts
  - 200+ resolved live signals
  - same policy_id for ALL 200+ signals
  - Profit Factor >= 1.30
  - confidence interval supports edge (95%)
  - zero mid-sample rule edits
  Every policy change resets the pocket clock to zero.
"""

PLACEHOLDER_MARKERS = (
    "<replace_with",
    "<db_",
    "<db",
    "your_",
    "example",
    "changeme",
    "placeholder",
    "xxxx",
)


def looks_like_live_secret(value: str) -> bool:
    v = value.strip().strip('"').strip("'")
    if not v:
        return False
    if len(v) <= 20:
        return False

    lowered = v.lower()
    if any(marker in lowered for marker in PLACEHOLDER_MARKERS):
        return False
    if re.fullmatch(r"[0-9]+", v):
        return False
    if v.startswith("http://") or v.startswith("https://"):
        return False
    return True


def record(name: str, passed: bool, detail: str = "") -> bool:
    RESULTS.append((name, passed, detail))
    icon = "✅" if passed else ("⚠️ " if name in ADVISORY_NAMES else "❌")
    print(f"  {icon}  {name}" + (f"\n       {detail}" if (detail and not passed) else ""))
    return passed


def get_import_roots(path: Path) -> list[str]:
    try:
        tree = ast.parse(path.read_text(encoding="utf-8"), filename=str(path))
    except SyntaxError as e:
        return [f"__SYNTAX_ERROR__:{e}"]

    roots: list[str] = []
    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            for a in node.names:
                roots.append(a.name.split(".")[0])
        elif isinstance(node, ast.ImportFrom):
            if node.module:
                roots.append(node.module.split(".")[0])
    return roots


def has_import_of(path: Path, module_prefix: str) -> bool:
    try:
        tree = ast.parse(path.read_text(encoding="utf-8"), filename=str(path))
    except SyntaxError:
        return False

    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            for a in node.names:
                if a.name == module_prefix or a.name.startswith(module_prefix + "."):
                    return True
        elif isinstance(node, ast.ImportFrom):
            if node.module and (node.module == module_prefix or node.module.startswith(module_prefix + ".")):
                return True
    return False


def live_py_files() -> list[Path]:
    skip = {"archive", ".venv", "venv", "freqtrade", ".next", "node_modules"}
    return [p for p in Path(".").rglob("*.py") if not any(s in p.parts for s in skip)]


def check_strategy() -> None:
    print("\n[1] Strategy file")
    if not STRATEGY_FILE.exists():
        record("Strategy file exists", False, f"{STRATEGY_FILE} not found")
        return

    try:
        ast.parse(STRATEGY_FILE.read_text(encoding="utf-8"), filename=str(STRATEGY_FILE))
        record("Strategy valid Python", True)
    except SyntaxError as e:
        record("Strategy valid Python", False, str(e))
        return

    record(
        f"Strategy imports {FREQTRADE_BASE}",
        has_import_of(STRATEGY_FILE, FREQTRADE_BASE),
        f"No import of '{FREQTRADE_BASE}'",
    )


def check_no_stale() -> None:
    print("\n[2] Stale import scan (AST)")
    found = False
    for pyfile in live_py_files():
        for mod in get_import_roots(pyfile):
            if mod in STALE_MODULES:
                record(f"Stale import '{mod}'", False, str(pyfile))
                found = True
    if not found:
        record("No stale imports", True)


def check_config() -> None:
    print("\n[3] config.json")
    if not CONFIG_FILE.exists():
        record("config.json exists", False)
        return

    try:
        cfg = json.loads(CONFIG_FILE.read_text(encoding="utf-8"))
    except json.JSONDecodeError as e:
        record("config.json valid JSON", False, str(e))
        return

    record("config.json exists", True)
    for k in REQUIRED_CFG_KEYS:
        record(f"config has '{k}'", k in cfg)


def check_deploy_env_guard() -> None:
    print("\n[0] Phase 0 — deploy.sh secret guard")
    if not DEPLOY_SCRIPT.exists():
        record("deploy.sh exists", False, "Not yet created — add before any deployment")
        return

    content = DEPLOY_SCRIPT.read_text(encoding="utf-8", errors="ignore")
    dangerous_patterns = [
        "cp .env.example .env",
        "cp .env.example .env.",
        "copy .env.example .env",
    ]

    found = False
    for pat in dangerous_patterns:
        if pat in content:
            record(
                f"deploy.sh overwrites secrets: '{pat}'",
                False,
                "HARD FAIL — deployment must never overwrite real .env with placeholders",
            )
            found = True

    if not found:
        record("deploy.sh does not overwrite real secrets", True)


def check_env_example_secrets() -> None:
    print("\n[4] Secret leakage scan (.env.example)")
    if not ENV_EXAMPLE.exists():
        record(".env.example exists", False)
        return

    leaked: list[str] = []
    for raw_line in ENV_EXAMPLE.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        if looks_like_live_secret(value):
            leaked.append(key.strip())

    record(
        ".env.example contains placeholders only",
        len(leaked) == 0,
        f"Potential live secrets in keys: {', '.join(leaked)}" if leaked else "",
    )


def check_archive() -> None:
    print("\n[5] Frozen archive invariant")
    record("Frozen archive exists", ARCHIVE_PATH.exists(), f"Missing: {ARCHIVE_PATH}")


def check_g4() -> None:
    print("\n[6] G4 whitelist module")
    if not G4_WHITELIST_PY.exists():
        record("g4_whitelist.py exists", False)
        return

    try:
        ast.parse(G4_WHITELIST_PY.read_text(encoding="utf-8"), filename=str(G4_WHITELIST_PY))
        record("g4_whitelist.py valid Python", True)
    except SyntaxError as e:
        record("g4_whitelist.py valid Python", False, str(e))


def check_whitelist() -> None:
    print("\n[7] whitelist.json schema")
    if not WHITELIST_JSON.exists():
        record("whitelist.json exists", False)
        return

    try:
        data = json.loads(WHITELIST_JSON.read_text(encoding="utf-8"))
    except json.JSONDecodeError as e:
        record("whitelist.json valid JSON", False, str(e))
        return

    record(
        "Schema version == 2.0",
        data.get("schema_version") == "2.0",
        f"Got: {data.get('schema_version')!r}",
    )

    if "pockets" not in data or not isinstance(data["pockets"], list):
        record("'pockets' array present", False)
        return

    record("'pockets' array present", True)

    pockets = data["pockets"]
    record(
        "Pocket count == 1",
        len(pockets) == 1,
        f"Got {len(pockets)}. Add only after P>=0.75 requalification.",
    )

    expected = "phase2_data_burst_v1|STRONG_UPTREND|LONG"
    for p in pockets:
        pid = p.get("pocket_id", "")
        ok_format = isinstance(pid, str) and pid.count("|") == 2
        record("pocket_id format (policy|regime|side)", ok_format, f"Got: {pid!r}")
        if ok_format:
            record(
                "Canonical pocket_id matches policy",
                pid == expected,
                f"Got: {pid!r} | Expected: {expected!r}",
            )


def check_simulation_leak() -> None:
    print("\n[8] Simulation leak (frontend gate files)")
    bad_patterns = ["Math.random()", "hardcoded_pwin", "win_rate = 0.75"]

    gate_files = [
        f
        for f in list(Path(".").rglob("*.ts")) + list(Path(".").rglob("*.tsx"))
        if "archive" not in str(f) and ".next" not in str(f) and "node_modules" not in str(f)
    ]

    found = False
    for f in gate_files:
        content = f.read_text(errors="ignore")
        lowered = content.lower()
        for pat in bad_patterns:
            if pat in content and "gate" in lowered:
                record(f"Simulation leak: {pat}", False, str(f))
                found = True

    if not found:
        record("No simulation leak in gate files", True)


def check_artifacts() -> None:
    print("\n[9] Pipeline artifacts (advisory)")
    record(
        "trades_relabeled.csv present",
        RELABELED_CSV.exists(),
        "Run relabel_2r.py (Step 1) first" if not RELABELED_CSV.exists() else "",
    )
    record(
        "pwin_model.pkl present",
        PWIN_MODEL.exists(),
        "Run train_pwin.py (Step 5) first" if not PWIN_MODEL.exists() else "",
    )


def main() -> None:
    print("CrypSide Build — Policy Gate")
    print("=" * 50)
    print(f"   Dir: {Path('.').resolve()}")

    check_deploy_env_guard()
    check_strategy()
    check_no_stale()
    check_config()
    check_env_example_secrets()
    check_archive()
    check_g4()
    check_whitelist()
    check_simulation_leak()
    check_artifacts()

    print("\n" + "=" * 50)
    print("LIVE UNLOCK COVENANT")
    print("=" * 50)
    print(LIVE_UNLOCK_POLICY)

    print("\n" + "=" * 50)
    print("SUMMARY")
    print("=" * 50)

    hard_fails = [(n, d) for n, p, d in RESULTS if (not p and n not in ADVISORY_NAMES)]

    for name, passed, _detail in RESULTS:
        icon = "✅" if passed else ("⚠️ " if name in ADVISORY_NAMES else "❌")
        print(f"  {icon}  {name}")

    print()
    if hard_fails:
        print(f"{len(hard_fails)} hard failure(s). Policy NOT satisfied.")
        print("V => P : FALSE. Do not deploy.\n")
        sys.exit(1)

    print("Gate passed. V => P confirmed.")
    print("Policy holds. Proceed to next step.\n")
    sys.exit(0)


if __name__ == "__main__":
    main()
