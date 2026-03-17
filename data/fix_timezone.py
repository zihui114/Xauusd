"""
把現有 CSV 的時間全部 +2 小時（UTC -> EET）
"""
import pandas as pd
from datetime import timedelta

FILE = "archive/XAU_1m_data.csv"

df = pd.read_csv(FILE, sep=';')
df['Date'] = pd.to_datetime(df['Date'], format='%Y.%m.%d %H:%M') + timedelta(hours=2)
df['Date'] = df['Date'].dt.strftime('%Y.%m.%d %H:%M')
df.to_csv(FILE, sep=';', index=False)

print(f"完成！時間已全部 +2 小時，共 {len(df)} 筆")
