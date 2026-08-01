"""
AgriInsight AI — dashboard API

All endpoints accept optional query params: year, crop, state, district.
Omit a param (or pass "all") to not filter on it. Every route queries
crop_data / v_crop_year_state directly — no cached/sample data.
"""
from flask import Blueprint, jsonify, request

from database.db import get_db
from routes.decorators import api_login_required

api_bp = Blueprint("api", __name__, url_prefix="/api")


def _build_where(exclude=()):
    """Read year/crop/state/district from the query string and build a
    parameterized WHERE clause shared by every endpoint below.

    exclude: dimension names to skip even if present in the query string —
    used by charts that rank a dimension (e.g. top states by yield) so
    they stay comparative instead of collapsing to a single bar when that
    same dimension happens to be the active filter."""
    clauses = []
    params = []

    year = request.args.get("year")
    crop = request.args.get("crop")
    state = request.args.get("state")
    district = request.args.get("district")

    if year and year.lower() != "all" and "year" not in exclude:
        clauses.append("year = ?")
        params.append(int(year))
    if crop and crop.lower() != "all" and "crop" not in exclude:
        clauses.append("crop = ?")
        params.append(crop.lower())
    if state and state.lower() != "all" and "state" not in exclude:
        clauses.append("state_name = ?")
        params.append(state)
    if district and district.lower() != "all" and "district" not in exclude:
        clauses.append("dist_name = ?")
        params.append(district)

    where = f"WHERE {' AND '.join(clauses)}" if clauses else ""
    return where, params


@api_bp.route("/districts")
@api_login_required
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
@api_login_required
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
@api_login_required
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
@api_login_required
def top_crops():
    db = get_db()
    where, params = _build_where(exclude=("crop",))
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
@api_login_required
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
@api_login_required
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


@api_bp.route("/charts/area-growth")
@api_login_required
def area_growth():
    """Total area harvested (ha) per year — an area-filled chart, and a
    nice double meaning given the metric itself is 'area harvested'."""
    db = get_db()
    where, params = _build_where()
    rows = db.execute(
        f"""SELECT year, ROUND(SUM(area_ha)) AS total_area
            FROM crop_data {where}
            GROUP BY year ORDER BY year""",
        params,
    ).fetchall()
    return jsonify({
        "labels": [r["year"] for r in rows],
        "data": [r["total_area"] for r in rows],
    })


@api_bp.route("/charts/top-states")
@api_login_required
def top_states():
    """Top 10 states by avg yield — ignores its own state filter so it
    stays a comparative ranking even when a state happens to be selected."""
    db = get_db()
    where, params = _build_where(exclude=("state",))
    rows = db.execute(
        f"""SELECT state_name, ROUND(AVG(yield_kg_per_ha), 1) AS avg_yield
            FROM crop_data {where}
            GROUP BY state_name ORDER BY avg_yield DESC LIMIT 10""",
        params,
    ).fetchall()
    return jsonify({
        "labels": [r["state_name"] for r in rows],
        "data": [r["avg_yield"] for r in rows],
    })


@api_bp.route("/charts/state-yield")
@api_login_required
def state_yield():
    """Every state (not just top 10) by avg yield, sorted descending —
    the geographic 'full picture' companion to top-states."""
    db = get_db()
    where, params = _build_where(exclude=("state",))
    rows = db.execute(
        f"""SELECT state_name, ROUND(AVG(yield_kg_per_ha), 1) AS avg_yield
            FROM crop_data {where}
            GROUP BY state_name ORDER BY avg_yield DESC""",
        params,
    ).fetchall()
    return jsonify({
        "labels": [r["state_name"] for r in rows],
        "data": [r["avg_yield"] for r in rows],
    })


@api_bp.route("/charts/top-districts")
@api_login_required
def top_districts():
    """Top 10 districts by avg yield — ignores its own district filter,
    same reasoning as top-states."""
    db = get_db()
    where, params = _build_where(exclude=("district",))
    rows = db.execute(
        f"""SELECT dist_name, state_name, ROUND(AVG(yield_kg_per_ha), 1) AS avg_yield
            FROM crop_data {where}
            GROUP BY dist_name ORDER BY avg_yield DESC LIMIT 10""",
        params,
    ).fetchall()
    return jsonify({
        "labels": [f"{r['dist_name']} ({r['state_name']})" for r in rows],
        "data": [r["avg_yield"] for r in rows],
    })


@api_bp.route("/charts/temperature-yield")
@api_login_required
def temperature_yield():
    db = get_db()
    where, params = _build_where()
    rows = db.execute(
        f"""SELECT temperature_c, yield_kg_per_ha
            FROM crop_data {where}
            ORDER BY RANDOM() LIMIT 400""",
        params,
    ).fetchall()
    return jsonify({
        "points": [{"x": r["temperature_c"], "y": r["yield_kg_per_ha"]} for r in rows]
    })


@api_bp.route("/charts/humidity-yield")
@api_login_required
def humidity_yield():
    db = get_db()
    where, params = _build_where()
    rows = db.execute(
        f"""SELECT humidity_pct, yield_kg_per_ha
            FROM crop_data {where}
            ORDER BY RANDOM() LIMIT 400""",
        params,
    ).fetchall()
    return jsonify({
        "points": [{"x": r["humidity_pct"], "y": r["yield_kg_per_ha"]} for r in rows]
    })


@api_bp.route("/charts/ph-distribution")
@api_login_required
def ph_distribution():
    """Record counts grouped by soil pH value. Note: pH is one of the
    fixed-per-crop climate fields (see README), so in practice this shows
    a small number of distinct values rather than a smooth distribution —
    which is itself useful to see, not a bug in the chart."""
    db = get_db()
    where, params = _build_where()
    rows = db.execute(
        f"""SELECT ph, COUNT(*) AS n
            FROM crop_data {where}
            GROUP BY ph ORDER BY ph""",
        params,
    ).fetchall()
    return jsonify({
        "labels": [r["ph"] for r in rows],
        "data": [r["n"] for r in rows],
    })


@api_bp.route("/charts/crop-distribution")
@api_login_required
def crop_distribution():
    """Share of total harvested area by crop — ignores its own crop
    filter for the same comparative reason as top-crops."""
    db = get_db()
    where, params = _build_where(exclude=("crop",))
    rows = db.execute(
        f"""SELECT crop, ROUND(SUM(area_ha)) AS total_area
            FROM crop_data {where}
            GROUP BY crop ORDER BY total_area DESC""",
        params,
    ).fetchall()
    return jsonify({
        "labels": [r["crop"].capitalize() for r in rows],
        "data": [r["total_area"] for r in rows],
    })


@api_bp.route("/charts/heatmap")
@api_login_required
def heatmap():
    """State x crop avg-yield matrix, normalized 0-100 within each crop's
    own column so every crop shows visible variation on the same heatmap
    even though absolute yields differ hugely between crops (e.g. rice
    ~1600 kg/ha vs cotton ~260 kg/ha would otherwise make cotton's entire
    row look flat). Ignores state/crop filters — a heatmap only makes
    sense across the full grid."""
    db = get_db()
    where, params = _build_where(exclude=("state", "crop"))

    crops = [r["crop"] for r in db.execute("SELECT DISTINCT crop FROM crop_data ORDER BY crop").fetchall()]
    states = [r["state_name"] for r in db.execute(
        f"""SELECT state_name FROM crop_data {where}
            GROUP BY state_name ORDER BY AVG(yield_kg_per_ha) DESC LIMIT 12""",
        params,
    ).fetchall()]

    rows = db.execute(
        f"""SELECT state_name, crop, ROUND(AVG(yield_kg_per_ha), 1) AS avg_yield
            FROM crop_data {where}
            GROUP BY state_name, crop""",
        params,
    ).fetchall()

    raw = {(r["state_name"], r["crop"]): r["avg_yield"] for r in rows}

    # normalize within each crop column so every crop shows contrast
    col_ranges = {}
    for crop in crops:
        vals = [raw[(s, crop)] for s in states if (s, crop) in raw]
        col_ranges[crop] = (min(vals), max(vals)) if vals else (0, 0)

    matrix = []
    for state in states:
        row_cells = []
        for crop in crops:
            val = raw.get((state, crop))
            lo, hi = col_ranges[crop]
            intensity = round((val - lo) / (hi - lo) * 100, 1) if val is not None and hi > lo else 0
            row_cells.append({"value": val, "intensity": intensity})
        matrix.append(row_cells)

    return jsonify({
        "states": states,
        "crops": [c.capitalize() for c in crops],
        "matrix": matrix,
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
@api_login_required
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
