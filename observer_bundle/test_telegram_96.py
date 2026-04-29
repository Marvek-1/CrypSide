#!/usr/bin/env python3
import json
import os
import sys
from datetime import datetime, timezone

sys.path.append(os.getcwd())

import scanner


def _contains_style(value):
    if isinstance(value, dict):
        if "style" in value:
            return True
        return any(_contains_style(child) for child in value.values())
    if isinstance(value, list):
        return any(_contains_style(child) for child in value)
    return False


def _assert(cond: bool, message: str):
    if not cond:
        print(f"\n[ERROR] {message}")
        sys.exit(1)


def test_telegram_markup_latest():
    print("--- Testing Telegram Sovereign Alert (latest format) ---")

    mock_sig = {
        "signal_id": "test-uuid-latest",
        "pair": "SOLUSDT",
        "side": "LONG",
        "entry": 145.50,
        "stop_loss": 142.10,
        "tp1": 148.00,
        "tp2": 155.00,
        "score": 85,
        "regime": "STRONG_UPTREND",
        "logic_version": "v1.5-quant-alpha",
        "config_version": "v1.5-quant-alpha",
        "ts": datetime.now(timezone.utc),
        "vwap_delta": 0.015,
        "signal_family": "trend",
        "scan_profile": "institutional",
        "btc_regime": "RISK_ON",
        "reason_trace": {
            "recent_squeeze_fire": True,
            "volume_ratio": 1.45,
            "derivatives_bonus": 30,
        },
    }

    html_payload, markup = scanner.format_sovereign_alert(mock_sig)

    print("\n[HTML PAYLOAD]")
    print(html_payload)

    print("\n[MARKUP DICTIONARY]")
    print(json.dumps(markup, indent=2))

    _assert("inline_keyboard" in markup, "Missing inline_keyboard key")
    _assert(isinstance(markup["inline_keyboard"], list), "inline_keyboard must be a list")
    _assert(len(markup["inline_keyboard"]) >= 1, "inline_keyboard cannot be empty")

    if _contains_style(markup):
        print("\n[ERROR] Unsupported Telegram button style fields found in markup.")
        print("[HINT] Current scanner contract is plain inline keyboard (text/url), no style attributes.")
        sys.exit(1)

    first_button = markup["inline_keyboard"][0][0]
    _assert("text" in first_button and "url" in first_button, "Primary button must include text and url")

    _assert("IDIM-IKANG SOVEREIGN SIGNAL" in html_payload, "Missing expected sovereign alert header in HTML")
    _assert("GATES:" in html_payload, "Missing gate summary in HTML payload")

    print("\n[VERIFICATION] Markup is Telegram-compatible and matches latest scanner format.")


if __name__ == "__main__":
    test_telegram_markup_latest()
