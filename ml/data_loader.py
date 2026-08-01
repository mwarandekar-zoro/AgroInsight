"""
AgriInsight AI — dataset loader

Reads dataset/crop_dataset.csv, cleans it, and loads it into the crop_data
table. Safe to re-run: it clears crop_data first so you never end up with
duplicate rows from running it twice.

Usage:
    python -m ml.data_loader
"""
import os
import sqlite3
import sys

import pandas as pd

BASE_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
CSV_PATH = os.path.join(BASE_DIR, "dataset", "crop_dataset.csv")
DB_PATH = os.path.join(BASE_DIR, "database", "agriinsight.db")
SCHEMA_PATH = os.path.join(BASE_DIR, "database", "schema.sql")

COLUMN_MAP = {
    "Dist Code": "dist_code",
    "Year": "year",
    "State Code": "state_code",
    "State Name": "state_name",
    "Dist Name": "dist_name",
    "Crop": "crop",
    "Area_ha": "area_ha",
    "Yield_kg_per_ha": "yield_kg_per_ha",
    "N_req_kg_per_ha": "n_req_kg_per_ha",
    "P_req_kg_per_ha": "p_req_kg_per_ha",
    "K_req_kg_per_ha": "k_req_kg_per_ha",
    "Total_N_kg": "total_n_kg",
    "Total_P_kg": "total_p_kg",
    "Total_K_kg": "total_k_kg",
    "Temperature_C": "temperature_c",
    "Humidity_%": "humidity_pct",
    "pH": "ph",
    "Rainfall_mm": "rainfall_mm",
    "Wind_Speed_m_s": "wind_speed_m_s",
    "Solar_Radiation_MJ_m2_day": "solar_radiation",
}


def load_and_clean(csv_path: str) -> pd.DataFrame:
    df = pd.read_csv(csv_path)
    df = df.rename(columns=COLUMN_MAP)

    before = len(df)

    # Basic hygiene: strip whitespace/case-normalize text fields, drop
    # impossible values, drop exact duplicate rows.
    df["crop"] = df["crop"].str.strip().str.lower()
    df["state_name"] = df["state_name"].str.strip()
    df["dist_name"] = df["dist_name"].str.strip()

    df = df[df["yield_kg_per_ha"] > 0]
    df = df[df["area_ha"] > 0]
    df = df[(df["ph"] >= 0) & (df["ph"] <= 14)]
    df = df.drop_duplicates()

    after = len(df)
    print(f"Loaded {before:,} rows -> {after:,} after cleaning ({before - after:,} dropped)")

    return df[list(COLUMN_MAP.values())]


def load_to_db(df: pd.DataFrame, db_path: str, schema_path: str):
    conn = sqlite3.connect(db_path)
    with open(schema_path, "r") as f:
        conn.executescript(f.read())

    conn.execute("DELETE FROM crop_data")
    df.to_sql("crop_data", conn, if_exists="append", index=False)
    conn.commit()

    count = conn.execute("SELECT COUNT(*) FROM crop_data").fetchone()[0]
    print(f"crop_data now has {count:,} rows")
    conn.close()


def main():
    if not os.path.exists(CSV_PATH):
        print(f"Dataset not found at {CSV_PATH}")
        sys.exit(1)

    df = load_and_clean(CSV_PATH)
    load_to_db(df, DB_PATH, SCHEMA_PATH)
    print("Done.")


if __name__ == "__main__":
    main()
