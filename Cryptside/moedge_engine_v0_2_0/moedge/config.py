from __future__ import annotations

from dataclasses import fields
from pathlib import Path
from typing import Any

import yaml

from .engine import EdgeConfig


def load_config(path: str | Path | None) -> EdgeConfig:
    if path is None:
        return EdgeConfig()

    data: dict[str, Any] = yaml.safe_load(Path(path).read_text(encoding="utf-8")) or {}
    valid = {f.name for f in fields(EdgeConfig)}
    filtered = {k: v for k, v in data.items() if k in valid}
    return EdgeConfig(**filtered)
