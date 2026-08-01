from flask import Blueprint, render_template, request, jsonify

from database.db import get_db
from ml.predictor import predict

recommendation_bp = Blueprint("recommendation", __name__)

FIELD_MAP = {
    "nitrogen": "n_req_kg_per_ha",
    "phosphorus": "p_req_kg_per_ha",
    "potassium": "k_req_kg_per_ha",
    "temperature": "temperature_c",
    "humidity": "humidity_pct",
    "ph": "ph",
    "rainfall": "rainfall_mm",
}


@recommendation_bp.route("/recommendation")
def recommendation_home():
    return render_template("recommendation.html")


@recommendation_bp.route("/api/recommend", methods=["POST"])
def recommend():
    payload = request.get_json(silent=True) or {}

    try:
        input_dict = {
            model_key: float(payload[form_key])
            for form_key, model_key in FIELD_MAP.items()
        }
    except (KeyError, ValueError, TypeError):
        return jsonify({"error": "Please fill every field with a valid number."}), 400

    try:
        result = predict(input_dict)
    except FileNotFoundError as e:
        return jsonify({"error": str(e)}), 503

    db = get_db()
    best_state = db.execute(
        """SELECT state_name, ROUND(AVG(yield_kg_per_ha), 1) AS avg_yield
           FROM crop_data WHERE crop = ?
           GROUP BY state_name ORDER BY avg_yield DESC LIMIT 1""",
        (result["crop"],),
    ).fetchone()
    best_district = db.execute(
        """SELECT dist_name, ROUND(AVG(yield_kg_per_ha), 1) AS avg_yield
           FROM crop_data WHERE crop = ?
           GROUP BY dist_name ORDER BY avg_yield DESC LIMIT 1""",
        (result["crop"],),
    ).fetchone()

    result["best_state"] = best_state["state_name"] if best_state else None
    result["best_district"] = best_district["dist_name"] if best_district else None

    return jsonify(result)
