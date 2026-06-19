import os
import psycopg2
from dotenv import load_dotenv

load_dotenv()
conn = psycopg2.connect(os.environ['DATABASE_URL'])
cur = conn.cursor()

cur.execute("SELECT COUNT(*) FROM paper_orders")
total = cur.fetchone()[0]

cur.execute("SELECT COUNT(*) FROM paper_orders WHERE regime_version = 'v2_adx_ema_rsi'")
v2 = cur.fetchone()[0]

cur.execute("SELECT COUNT(*) FROM paper_orders WHERE regime_version = 'v2_adx_ema_rsi' AND outcome IN ('WIN','LOSS','EXPIRED')")
resolved = cur.fetchone()[0]

cur.execute("SELECT COUNT(*) FROM paper_orders WHERE regime_version = 'v2_adx_ema_rsi' AND outcome IN ('WIN','LOSS','EXPIRED') AND confidence_gate_eligible = true")
eligible = cur.fetchone()[0]

print(f"Total paper orders: {total}")
print(f"v2_adx_ema_rsi orders: {v2}")
print(f"Resolved v2 orders: {resolved}")
print(f"Eligible resolved v2 orders: {eligible}")
