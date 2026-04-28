from __future__ import annotations


def volatility_class(volatility: float, *, low_cutoff: float = 0.015, high_cutoff: float = 0.035) -> str:
    if volatility >= high_cutoff:
        return "high"
    if volatility <= low_cutoff:
        return "low"
    return "medium"


def volume_state(volume_surge: float, *, expanding: float = 1.20, contracting: float = 0.80) -> str:
    if volume_surge >= expanding:
        return "expanding"
    if volume_surge <= contracting:
        return "contracting"
    return "neutral"


def momentum_direction(momentum: float, *, flat_band: float = 0.005) -> str:
    if momentum > flat_band:
        return "positive"
    if momentum < -flat_band:
        return "negative"
    return "flat"


def build_trade_dna(*, regime: str, volatility: float, volume_surge: float, momentum: float) -> dict[str, str]:
    return {
        "regime": regime,
        "volatility_class": volatility_class(volatility),
        "volume_state": volume_state(volume_surge),
        "momentum_direction": momentum_direction(momentum),
    }
