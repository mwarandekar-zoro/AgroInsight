"""
AgriInsight AI — dashboard API

All endpoints accept optional query params: year, crop, state, district.
Omit a param (or pass "all") to not filter on it. Every route queries
crop_data / v_crop_year_state directly — no cached/sample data.
"""
from flask import Blueprint, jsonify, request

from database.db import get_db

api_bp = Blueprint("api", __name__, url_prefix="/api")


def _build_where():
    """Read year/crop/state/district from the query string and build a
    parameterized WHERE clause shared by every endpoint below."""
    clauses = []
    params = []

    year = request.args.get("year")
    crop = request.args.get("crop")
    state = request.args.get("state")
    district = request.args.get("district")

    if year and year.lower() != "all":
        clauses.append("year = ?")
        params.append(int(year))
    if crop and crop.lower() != "all":
        clauses.append("crop = ?")
        params.append(crop.lower())
    if state and state.lower() != "all":
        clauses.append("state_name = ?")
        params.append(state)
    if district and district.lower() != "all":
        clauses.append("dist_name = ?")
        params.append(district)

    where = f"WHERE {' AND '.join(clauses)}" if clauses else ""
    return where, params


@api_bp.route("/districts")
def districts():
    """District list, optionally narrowed to a single state — powers the
    cascading state -> district filter in the dashboard."""
    db = get_db()
    state = request.args.get("state")
    if state and state.lower() != "all":
        rows = db.execute(
            "SELECT DISTINCT dist_name FROM crop_data WHERE state_name = ? ORDER BY dist_name",
            (state,),
        ).fetchall()
    else:
        rows = db.execute(
            "SELECT DISTINCT dist_name FROM crop_data ORDER BY dist_name"
        ).fetchall()
    return jsonify([r["dist_name"] for r in rows])


@api_bp.route("/kpis")
def kpis():
    db = get_db()
    where, params = _build_where()

    row = db.execute(
        f"""SELECT
                ROUND(AVG(yield_kg_per_ha), 1)     AS avg_yield,
                COUNT(DISTINCT state_name)          AS state_count,
                ROUND(AVG(rainfall_mm))             AS avg_rainfall,
                ROUND(AVG(ph), 2)                   AS avg_ph,
                COUNT(*)                            AS record_count
            FROM crop_data {where}""",
        params,
    ).fetchone()

    # Trend: compare avg yield of the most recent year in the filtered set
    # against the prior year, so the little ▲/▼ badges reflect real data.
    year_rows = db.execute(
        f"""SELECT year, AVG(yield_kg_per_ha) AS avg_yield
            FROM crop_data {where}
            GROUP BY year ORDER BY year DESC LIMIT 2""",
        params,
    ).fetchall()

    yield_delta_pct = None
    if len(year_rows) == 2 and year_rows[1]["avg_yield"]:
        yield_delta_pct = round(
            (year_rows[0]["avg_yield"] - year_rows[1]["avg_yield"])
            / year_rows[1]["avg_yield"] * 100, 1
        )

    return jsonify({
        "avg_yield": row["avg_yield"],
        "state_count": row["state_count"],
        "avg_rainfall": row["avg_rainfall"],
        "avg_ph": row["avg_ph"],
        "record_count": row["record_count"],
        "yield_delta_pct": yield_delta_pct,
    })


@api_bp.route("/charts/yield-trend")
def yield_trend():
    db = get_db()
    where, params = _build_where()
    rows = db.execute(
        f"""SELECT year, ROUND(AVG(yield_kg_per_ha), 1) AS avg_yield
            FROM crop_data {where}
            GROUP BY year ORDER BY year""",
        params,
    ).fetchall()
    return jsonify({
        "labels": [r["year"] for r in rows],
        "data": [r["avg_yield"] for r in rows],
    })


@api_bp.route("/charts/top-crops")
def top_crops():
    db = get_db()
    where, params = _build_where()
    rows = db.execute(
        f"""SELECT crop, ROUND(AVG(yield_kg_per_ha), 1) AS avg_yield
            FROM crop_data {where}
            GROUP BY crop ORDER BY avg_yield DESC""",
        params,
    ).fetchall()
    return jsonify({
        "labels": [r["crop"].capitalize() for r in rows],
        "data": [r["avg_yield"] for r in rows],
    })


@api_bp.route("/charts/rainfall-yield")
def rainfall_yield():
    """Scatter of rainfall vs yield. Sampled down if the filtered set is
    large, so the chart stays responsive instead of plotting 50k points."""
    db = get_db()
    where, params = _build_where()
    rows = db.execute(
        f"""SELECT rainfall_mm, yield_kg_per_ha
            FROM crop_data {where}
            ORDER BY RANDOM() LIMIT 400""",
        params,
    ).fetchall()
    return jsonify({
        "points": [{"x": r["rainfall_mm"], "y": r["yield_kg_per_ha"]} for r in rows]
    })


@api_bp.route("/charts/npk")
def npk():
    """Soil/climate radar. Each field is min-max normalized to 0-100 against
    the *whole* dataset's range so the radar is a meaningful relative
    profile even when filters are applied."""
    db = get_db()
    where, params = _build_where()

    bounds = db.execute(
        """SELECT
               MIN(n_req_kg_per_ha) n_min, MAX(n_req_kg_per_ha) n_max,
               MIN(p_req_kg_per_ha) p_min, MAX(p_req_kg_per_ha) p_max,
               MIN(k_req_kg_per_ha) k_min, MAX(k_req_kg_per_ha) k_max,
               MIN(ph) ph_min, MAX(ph) ph_max,
               MIN(humidity_pct) h_min, MAX(humidity_pct) h_max
           FROM crop_data"""
    ).fetchone()

    row = db.execute(
        f"""SELECT
                AVG(n_req_kg_per_ha) AS n, AVG(p_req_kg_per_ha) AS p,
                AVG(k_req_kg_per_ha) AS k, AVG(ph) AS ph, AVG(humidity_pct) AS h
            FROM crop_data {where}""",
        params,
    ).fetchone()

    def norm(val, lo, hi):
        if val is None or hi == lo:
            return 0
        return round((val - lo) / (hi - lo) * 100, 1)

    return jsonify({
        "labels": ["Nitrogen", "Phosphorus", "Potassium", "pH", "Humidity"],
        "data": [
            norm(row["n"], bounds["n_min"], bounds["n_max"]),
            norm(row["p"], bounds["p_min"], bounds["p_max"]),
            norm(row["k"], bounds["k_min"], bounds["k_max"]),
            norm(row["ph"], bounds["ph_min"], bounds["ph_max"]),
            norm(row["h"], bounds["h_min"], bounds["h_max"]),
        ],
    })


def _crop_summary(db, crop: str) -> dict:
    """All the numbers the Compare page needs for a single crop."""
    stats = db.execute(
        """SELECT
               ROUND(AVG(yield_kg_per_ha), 1)   AS avg_yield,
               ROUND(AVG(temperature_c), 1)     AS avg_temperature,
               ROUND(AVG(humidity_pct), 1)      AS avg_humidity,
               ROUND(AVG(rainfall_mm))          AS avg_rainfall,
               ROUND(AVG(ph), 2)                AS avg_ph,
               ROUND(AVG(n_req_kg_per_ha), 2)   AS avg_n,
               ROUND(AVG(p_req_kg_per_ha), 2)   AS avg_p,
               ROUND(AVG(k_req_kg_per_ha), 2)   AS avg_k,
               COUNT(*)                          AS record_count
           FROM crop_data WHERE crop = ?""",
        (crop,),
    ).fetchone()

    top_states = db.execute(
        """SELECT state_name, ROUND(AVG(yield_kg_per_ha), 1) AS avg_yield
           FROM crop_data WHERE crop = ?
           GROUP BY state_name ORDER BY avg_yield DESC LIMIT 3""",
        (crop,),
    ).fetchall()

    top_districts = db.execute(
        """SELECT dist_name, ROUND(AVG(yield_kg_per_ha), 1) AS avg_yield
           FROM crop_data WHERE crop = ?
           GROUP BY dist_name ORDER BY avg_yield DESC LIMIT 3""",
        (crop,),
    ).fetchall()

    yield_trend = db.execute(
        """SELECT year, ROUND(AVG(yield_kg_per_ha), 1) AS avg_yield
           FROM crop_data WHERE crop = ?
           GROUP BY year ORDER BY year""",
        (crop,),
    ).fetchall()

    return {
        "crop": crop,
        "crop_label": crop.capitalize(),
        **dict(stats),
        "top_states": [dict(r) for r in top_states],
        "top_districts": [dict(r) for r in top_districts],
        "yield_trend": {
            "labels": [r["year"] for r in yield_trend],
            "data": [r["avg_yield"] for r in yield_trend],
        },
    }


@api_bp.route("/compare")
def compare():
    db = get_db()
    valid_crops = {r["crop"] for r in db.execute("SELECT DISTINCT crop FROM crop_data").fetchall()}

    crop_a = (request.args.get("crop_a") or "").lower()
    crop_b = (request.args.get("crop_b") or "").lower()

    if crop_a not in valid_crops or crop_b not in valid_crops:
        return jsonify({"error": f"crop_a and crop_b must both be one of: {sorted(valid_crops)}"}), 400

    return jsonify({
        "crop_a": _crop_summary(db, crop_a),
        "crop_b": _crop_summary(db, crop_b),
    })
