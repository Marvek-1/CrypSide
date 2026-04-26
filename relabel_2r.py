import pandas as pd
import numpy as np
import logging
from datetime import datetime, timedelta

# Configure logging
logging.basicConfig(level=logging.INFO, format='%(message)s')
logger = logging.getLogger()

TRADES_CSV = 'trades.csv'
OHLC_CSV = 'ohlc_15m.csv'
OUTPUT_CSV = 'trades_relabeled.csv'

# Load data
try:
    trades = pd.read_csv(TRADES_CSV)
except Exception as e:
    logger.error(f'Could not read {TRADES_CSV}: {e}')
    exit(1)
try:
    ohlc = pd.read_csv(OHLC_CSV)
except Exception as e:
    logger.error(f'Could not read {OHLC_CSV}: {e}')
    exit(1)

# Ensure timestamp is datetime
if not np.issubdtype(ohlc['timestamp'].dtype, np.datetime64):
    ohlc['timestamp'] = pd.to_datetime(ohlc['timestamp'])
if not np.issubdtype(trades['entry_time'].dtype, np.datetime64):
    trades['entry_time'] = pd.to_datetime(trades['entry_time'])

results = []
timeout_count = 0
sl_count = 0
tp_count = 0
skipped_atr = 0
skipped_candles = 0

for idx, trade in trades.iterrows():
    entry_price = trade['entry_price']
    entry_atr = trade['entry_atr']
    entry_time = trade['entry_time']
    side = trade['side']
    pair = trade['pair']

    if pd.isnull(entry_atr) or entry_atr == 0:
        logger.warning(f'Skipping trade {trade.get("id", idx)}: entry_atr is zero or null')
        skipped_atr += 1
        continue

    # Filter candles for this pair and after entry_time
    candles = ohlc[(ohlc['pair'] == pair) & (ohlc['timestamp'] >= entry_time)].sort_values('timestamp').head(96)
    if candles.empty:
        logger.warning(f'Skipping trade {trade.get("id", idx)}: no candles found for pair/time')
        skipped_candles += 1
        continue

    # Set SL/TP
    if side.upper() == 'LONG':
        sl = entry_price - entry_atr
        tp = entry_price + 2 * entry_atr
    elif side.upper() == 'SHORT':
        sl = entry_price + entry_atr
        tp = entry_price - 2 * entry_atr
    else:
        logger.warning(f'Skipping trade {trade.get("id", idx)}: unknown side {side}')
        continue

    outcome_type = 'TIMEOUT'
    win_2R = None
    candles_to_resolution = 96
    for i, (_, candle) in enumerate(candles.iterrows(), 1):
        # SL and TP checked on same candle — low hits SL first by convention
        if side.upper() == 'LONG':
            if candle['low'] <= sl:
                outcome_type = 'SL'
                win_2R = 0
                candles_to_resolution = i
                sl_count += 1
                break
            if candle['high'] >= tp:
                outcome_type = 'TP'
                win_2R = 1
                candles_to_resolution = i
                tp_count += 1
                break
        else:  # SHORT
            if candle['high'] >= sl:
                outcome_type = 'SL'
                win_2R = 0
                candles_to_resolution = i
                sl_count += 1
                break
            if candle['low'] <= tp:
                outcome_type = 'TP'
                win_2R = 1
                candles_to_resolution = i
                tp_count += 1
                break
    if outcome_type == 'TIMEOUT':
        timeout_count += 1
        continue  # Exclude TIMEOUT from output

    row = trade.to_dict()
    row['win_2R'] = win_2R
    row['outcome_type'] = outcome_type
    row['candles_to_resolution'] = candles_to_resolution
    results.append(row)

# Write output
output_df = pd.DataFrame(results)
output_df.to_csv(OUTPUT_CSV, index=False)

# Print summary
N = len(trades)
X = tp_count
Y = sl_count
Z = timeout_count
output_rows = len(output_df)
logger.info(f'Total trades input: {N}')
logger.info(f'TP hits:    {X} ({X/N*100:.1f}%)')
logger.info(f'SL hits:    {Y} ({Y/N*100:.1f}%)')
logger.info(f'TIMEOUTs:   {Z} ({Z/N*100:.1f}%)')
if Z/N > 0.25:
    logger.warning('TIMEOUTs > 25% — flag for Flame review')
logger.info(f'Output rows: {output_rows}')
logger.info(f'Skipped (ATR): {skipped_atr}, Skipped (candles): {skipped_candles}')
