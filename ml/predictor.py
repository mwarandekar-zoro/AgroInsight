"""
AgriInsight AI — recommendation inference

Loads models/crop_model.pkl once (lazily, cached in-process) and exposes
predict(input_dict) -> full recommendation payload. No database access
here on purpose — this module is pure ML, DB lookups (best state/district)
live in routes/recommendation.py.
"""
import os

import joblib
import pandas as pd

BASE_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
MODEL_PATH = os.path.join(BASE_DIR, "models", "crop_model.pkl")

_bundle = None

# feature_key -> (display label, relative tolerance for a "match" checkmark)
EXPLAIN_SPEC = {
    "rainfall_mm": ("Rainfall", 0.15),
    "temperature_c": ("Temperature", 0.15),
    "humidity_pct": ("Humidity", 0.15),
    "ph": ("Soil pH", 0.08),
    "n_req_kg_per_ha": ("Nitrogen requirement", 0.5),
    "p_req_kg_per_ha": ("Phosphorus requirement", 0.5),
    "k_req_kg_per_ha": ("Potassium requirement", 0.5),
}


def _load():
    global _bundle
    if _bundle is None:
        if not os.path.exists(MODEL_PATH):
            raise FileNotFoundError(
                "No trained model found. Run `python -m ml.train_model` first."
            )
        _bundle = joblib.load(MODEL_PATH)
    return _bundle


def _build_explanation(input_dict, crop, profiles):
    profile = profiles[crop]
    checks = []
    for feat, (label, tol) in EXPLAIN_SPEC.items():
        mean = profile[feat]["mean"]
        val = input_dict[feat]
        matched = abs(val - mean) / mean <= tol if mean else False
        checks.append({
            "label": label,
            "matched": bool(matched),
            "detail": f"You entered {val:g}, typical for {crop.capitalize()} is {mean:.2f}",
        })
    return checks


def predict(input_dict: dict) -> dict:
    """input_dict must have exactly the keys in ml.train_model.FEATURES:
    n_req_kg_per_ha, p_req_kg_per_ha, k_req_kg_per_ha, temperature_c,
    humidity_pct, ph, rainfall_mm."""
    bundle = _load()
    clf = bundle["classifier"]
    reg = bundle["regressor"]
    le = bundle["label_encoder"]
    features = bundle["features"]
    profiles = bundle["crop_profiles"]

    row = [input_dict[f] for f in features]
    X = pd.DataFrame([row], columns=features)

    proba = clf.predict_proba(X)[0]
    pred_encoded = int(proba.argmax())
    crop = le.inverse_transform([pred_encoded])[0]
    confidence = round(float(proba[pred_encoded]) * 100, 1)

    X_reg = pd.DataFrame([row + [pred_encoded]], columns=features + ["crop_encoded"])
    expected_yield = round(float(reg.predict(X_reg)[0]), 1)

    all_probabilities = {
        le.inverse_transform([i])[0].capitalize(): round(float(p) * 100, 1)
        for i, p in enumerate(proba)
    }

    return {
        "crop": crop,
        "crop_label": crop.capitalize(),
        "confidence": confidence,
        "expected_yield": expected_yield,
        "explanation": _build_explanation(input_dict, crop, profiles),
        "all_probabilities": all_probabilities,
        "model_accuracy": bundle["metrics"]["accuracy"],
    }
