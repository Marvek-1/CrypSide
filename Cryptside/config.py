#!/usr/bin/env python3
import os

# Minimal config for CrypSide API
DATABASE_URL = os.environ.get("DATABASE_URL")
PM2_SCANNER_NAME = os.environ.get("PM2_SCANNER_NAME", "crypside-scanner")
LOGIC_VERSION = os.environ.get("LOGIC_VERSION", "v1.5-quant-alpha")
CONFIG_VERSION = os.environ.get("CONFIG_VERSION", "v1.5-quant-alpha")
CURRENT_LOGIC_VERSION = LOGIC_VERSION
CURRENT_CONFIG_VERSION = CONFIG_VERSION
