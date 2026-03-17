"""
過濾掉 CSV 中的週六/週日資料（Twelve Data 中東市場資料）
"""
import pandas as pd

FILE = "archive/XAU_1m_data.csv"

df = pd.read_csv(FILE, sep=';')
df['Date'] = pd.to_datetime(df['Date'], format='%Y.%m.%d %H:%M')

before = len(df)
# weekday(): 0=週一 ... 4=週五 5=週六 6=週日
df = df[df['Date'].dt.weekday < 5]
after = len(df)

df['Date'] = df['Date'].dt.strftime('%Y.%m.%d %H:%M')
df.to_csv(FILE, sep=';', index=False)

print(f"完成！移除 {before - after} 筆週末資料，剩餘 {after} 筆")
