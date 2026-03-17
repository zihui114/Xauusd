"""
從 Twelve Data 拉取 XAUUSD 1m 資料，存成與現有 CSV 相同格式。
用法：python fetch_xauusd.py
"""

import requests
import csv
import time
from datetime import datetime, timedelta

API_KEY = "829391068a874d1f942299abba74c508"
SYMBOL = "XAU/USD"
INTERVAL = "1min"
OUTPUT_FILE = "archive/XAU_1m_data.csv"

START_DATE = datetime(2025, 1, 1)
END_DATE = datetime.now()


def fetch_chunk(start_dt, end_dt):
    """拉取一段時間的資料，最多 5000 根，遇限速自動等待重試"""
    url = "https://api.twelvedata.com/time_series"
    params = {
        "symbol": SYMBOL,
        "interval": INTERVAL,
        "start_date": start_dt.strftime("%Y-%m-%d %H:%M:%S"),
        "end_date": end_dt.strftime("%Y-%m-%d %H:%M:%S"),
        "outputsize": 5000,
        "apikey": API_KEY,
        "order": "ASC",
        "timezone": "Asia/Taipei",
    }
    while True:
        resp = requests.get(url, params=params, timeout=30)
        data = resp.json()

        if data.get("status") == "error":
            msg = data.get("message", "")
            if "out of API credits" in msg:
                print(f"  限速，等待 60 秒...", flush=True)
                time.sleep(60)
                continue
            print(f"  API 錯誤: {msg}")
            return []

        return data.get("values", [])


def convert_row(v):
    """把 Twelve Data 格式轉成 CSV 格式（已是台灣時間，直接存）"""
    dt = datetime.strptime(v["datetime"], "%Y-%m-%d %H:%M:%S")
    date_str = dt.strftime("%Y.%m.%d %H:%M")
    return [
        date_str,
        v["open"],
        v["high"],
        v["low"],
        v["close"],
        v.get("volume", "0"),
    ]


def main():
    all_rows = []
    current = START_DATE

    # 每次拉 5 天（1m 資料約 7200 根，安全範圍內）
    chunk_days = 5

    print(f"開始下載 {START_DATE.date()} ~ {END_DATE.date()} 的 XAUUSD 1m 資料...")

    while current < END_DATE:
        next_dt = min(current + timedelta(days=chunk_days), END_DATE)
        print(f"  拉取 {current.date()} ~ {next_dt.date()}...", end=" ", flush=True)

        rows = fetch_chunk(current, next_dt)
        print(f"{len(rows)} 根")
        all_rows.extend(rows)

        current = next_dt
        time.sleep(3)

    if not all_rows:
        print("沒有拿到資料，請確認 API Key 是否正確")
        return

    # 去重 + 排序
    seen = set()
    unique_rows = []
    for v in all_rows:
        if v["datetime"] not in seen:
            seen.add(v["datetime"])
            unique_rows.append(v)
    unique_rows.sort(key=lambda v: v["datetime"])

    # 寫入 CSV
    with open(OUTPUT_FILE, "w", newline="") as f:
        writer = csv.writer(f, delimiter=";")
        writer.writerow(["Date", "Open", "High", "Low", "Close", "Volume"])
        for v in unique_rows:
            writer.writerow(convert_row(v))

    print(f"\n完成！共 {len(unique_rows)} 根 K 線，已存到 {OUTPUT_FILE}")


if __name__ == "__main__":
    main()
