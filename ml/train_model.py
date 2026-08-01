"""
AgroInsight AI — model training

Trains two models off crop_data:
  1. RandomForestClassifier  -> predicts crop from N/P/K + climate
  2. RandomForestRegressor   -> predicts yield_kg_per_ha given
                                 N/P/K + climate + the (encoded) crop

Both, plus a label encoder and per-crop feature profiles (used for the
"why this crop" explanation), are bundled into models/crop_model.pkl.

NOTE on this dataset: climate columns (temperature_c, humidity_pct, ph,
rainfall_mm) are a *fixed* profile per crop — every rice row is pH 6.5 /
25C / 80% / 1200mm, no variation. Only N/P/K requirement vary meaningfully
row to row. Practically this means the classifier will score very close to
100% accuracy — it's not overfitting, the dataset genuinely has near-zero
climate variance within a crop. It also means a real-world input that
doesn't closely match one of the 4 fixed climate fingerprints will still
get a confident prediction (nearest match) rather than a low-confidence
one — worth keeping in mind when reading the confidence score.

Usage:
    python -m ml.train_model
"""
import os
import sqlite3

import joblib
import pandas as pd
from sklearn.ensemble import RandomForestClassifier, RandomForestRegressor
from sklearn.metrics import accuracy_score, mean_absolute_error
from sklearn.model_selection import train_test_split
from sklearn.preprocessing import LabelEncoder

BASE_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
DB_PATH = os.path.join(BASE_DIR, "database", "agroinsight.db")
MODEL_PATH = os.path.join(BASE_DIR, "models", "crop_model.pkl")

FEATURES = [
    "n_req_kg_per_ha",
    "p_req_kg_per_ha",
    "k_req_kg_per_ha",
    "temperature_c",
    "humidity_pct",
    "ph",
    "rainfall_mm",
]


def load_data() -> pd.DataFrame:
    conn = sqlite3.connect(DB_PATH)
    df = pd.read_sql(f"SELECT crop, yield_kg_per_ha, {', '.join(FEATURES)} FROM crop_data", conn)
    conn.close()
    return df


def build_crop_profiles(df: pd.DataFrame) -> dict:
    """Per-crop mean/std for every feature — used at prediction time to
    explain *why* a crop was recommended (which inputs matched)."""
    profiles = {}
    for crop, group in df.groupby("crop"):
        profiles[crop] = {
            feat: {"mean": float(group[feat].mean()), "std": float(group[feat].std() or 0)}
            for feat in FEATURES
        }
    return profiles


def train():
    df = load_data()
    print(f"Training on {len(df):,} rows across crops: {sorted(df.crop.unique())}")

    label_encoder = LabelEncoder()
    y_crop = label_encoder.fit_transform(df["crop"])

    # ---- Classifier: features -> crop ----
    X = df[FEATURES]
    X_train, X_test, y_train, y_test = train_test_split(
        X, y_crop, test_size=0.2, random_state=42, stratify=y_crop
    )
    clf = RandomForestClassifier(
        n_estimators=200, max_depth=12, random_state=42, class_weight="balanced"
    )
    clf.fit(X_train, y_train)
    acc = accuracy_score(y_test, clf.predict(X_test))
    print(f"Classifier accuracy: {acc:.4f}")

    # ---- Regressor: features + crop -> yield ----
    X_reg = df[FEATURES].copy()
    X_reg["crop_encoded"] = y_crop
    y_yield = df["yield_kg_per_ha"]
    Xr_train, Xr_test, yr_train, yr_test = train_test_split(
        X_reg, y_yield, test_size=0.2, random_state=42
    )
    reg = RandomForestRegressor(
        n_estimators=100, max_depth=10, min_samples_leaf=5, random_state=42
    )
    reg.fit(Xr_train, yr_train)
    mae = mean_absolute_error(yr_test, reg.predict(Xr_test))
    print(f"Regressor MAE: {mae:.1f} kg/ha (mean yield is {y_yield.mean():.1f})")

    bundle = {
        "classifier": clf,
        "regressor": reg,
        "label_encoder": label_encoder,
        "features": FEATURES,
        "crop_profiles": build_crop_profiles(df),
        "metrics": {"accuracy": round(float(acc), 4), "yield_mae": round(float(mae), 1)},
    }

    os.makedirs(os.path.dirname(MODEL_PATH), exist_ok=True)
    joblib.dump(bundle, MODEL_PATH)
    print(f"Saved model bundle -> {MODEL_PATH}")


if __name__ == "__main__":
    train()
