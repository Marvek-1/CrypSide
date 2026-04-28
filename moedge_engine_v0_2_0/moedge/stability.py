from __future__ import annotations

from statistics import pstdev
from typing import Sequence


def stability_factor(scores: Sequence[float], *, window: int = 5, min_factor: float = 0.70, max_factor: float = 1.0) -> float:
    """Return a bounded score stability multiplier.

    Uses rolling population std of the last `window` scores. Stable score streams remain
    near 1.0; erratic streams are penalized down to `min_factor`.
    """
    recent = [float(s) for s in scores[-window:] if s is not None]
    if len(recent) < 2:
        return max_factor

    std = pstdev(recent)
    # A 30-point std or worse receives the full penalty.
    penalty = min(std / 30.0, 1.0) * (max_factor - min_factor)
    return round(max(min_factor, max_factor - penalty), 4)
