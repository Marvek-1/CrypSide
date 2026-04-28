from __future__ import annotations

from typing import Optional


def bucket_flip_count(n: int) -> str:
    if n == 0:
        return "0"
    if n == 1:
        return "1"
    return "2PLUS"


def magnitude_bucket(velocity: int) -> str:
    if velocity == 0:
        return "ZERO"
    if velocity <= 3:
        return "LOW"
    if velocity <= 7:
        return "MED"
    if velocity <= 12:
        return "HIGH"
    return "EXTREME"


def map_equivalence_class(delta1: int, velocity: int, delta2: int | None = None) -> dict:
    mag = magnitude_bucket(velocity)

    semantic_bucket = (
        bool(delta1 & 0x000F),  # regime
        bool(delta1 & 0x00F0),  # family
        bool(delta1 & 0x0F00),  # intent
        bool(delta1 & 0xF000),  # context
    )

    regime_flips = bin(delta1 & 0x000F).count("1")
    family_flips = bin(delta1 & 0x00F0).count("1")
    intent_flips = bin(delta1 & 0x0F00).count("1")
    context_flips = bin(delta1 & 0xF000).count("1")

    raw_counts = (
        regime_flips,
        family_flips,
        intent_flips,
        context_flips,
    )

    bucketed_counts = tuple(bucket_flip_count(x) for x in raw_counts)

    if velocity == 0:
        dominant_layer = "none"
    else:
        layer_names = ["regime", "family", "intent", "context"]
        dominant_layer = layer_names[raw_counts.index(max(raw_counts))]

    eq_class = (
        mag,
        semantic_bucket,
        bucketed_counts,
        dominant_layer,
    )

    return {
        # model feature
        "eq_class": eq_class,

        # audit/store only
        "magnitude_bucket": mag,
        "semantic_bucket": semantic_bucket,
        "layer_flip_counts_raw": raw_counts,
        "layer_flip_buckets": bucketed_counts,
        "dominant_layer": dominant_layer,
        "delta1_mask": delta1,
        "delta2_mask": delta2,
    }


def _hamming_16(mask: int) -> int:
    return (mask & 0xFFFF).bit_count()


def build_transition_equivalence(
    odu_state_t: int,
    odu_state_t_minus_1: int,
    odu_state_t_minus_2: Optional[int] = None,
) -> dict:
    state_t = odu_state_t & 0xFFFF
    state_t_minus_1 = odu_state_t_minus_1 & 0xFFFF

    delta1_mask = (state_t ^ state_t_minus_1) & 0xFFFF
    velocity = _hamming_16(delta1_mask)

    delta2_mask: int | None = None
    acceleration: int | None = None

    if odu_state_t_minus_2 is not None:
        state_t_minus_2 = odu_state_t_minus_2 & 0xFFFF
        delta2_mask = (state_t_minus_1 ^ state_t_minus_2) & 0xFFFF
        acceleration = velocity - _hamming_16(delta2_mask)

    mapped = map_equivalence_class(delta1_mask, velocity, delta2_mask)

    return {
        "delta1_mask": delta1_mask,
        "delta2_mask": delta2_mask,
        "velocity": velocity,
        "acceleration": acceleration,
        "magnitude_bucket": mapped["magnitude_bucket"],
        "semantic_bucket": mapped["semantic_bucket"],
        "layer_flip_counts_raw": mapped["layer_flip_counts_raw"],
        "layer_flip_buckets": mapped["layer_flip_buckets"],
        "dominant_layer": mapped["dominant_layer"],
        "eq_class": mapped["eq_class"],
    }
