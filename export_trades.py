import os
import psycopg2
import pandas as pd
from dotenv import load_dotenv

load_dotenv()
DATABASE_URL = os.environ["DATABASE_URL"]

# Query all trades from the signals table
query = """
    SELECT signal_id AS id, entry AS entry_price, ts AS entry_time, side, pair
    FROM signals
    ORDER BY ts ASC
"""

def main():
    with psycopg2.connect(DATABASE_URL) as conn:
        df = pd.read_sql(query, conn)
    # Ensure correct types
    df['entry_time'] = pd.to_datetime(df['entry_time'])
    df.to_csv('trades.csv', index=False)
    print(f"Exported {len(df)} trades to trades.csv")

if __name__ == "__main__":
    main()
