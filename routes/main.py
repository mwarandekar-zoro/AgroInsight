from flask import Blueprint, render_template

from database.db import get_db

main_bp = Blueprint("main", __name__)


@main_bp.route("/")
def home():
    db = get_db()

    counts = db.execute(
        """SELECT COUNT(DISTINCT crop) AS crop_count,
                  COUNT(DISTINCT state_name) AS state_count,
                  COUNT(DISTINCT dist_name) AS district_count,
                  MIN(year) AS first_year, MAX(year) AS last_year
           FROM crop_data"""
    ).fetchone()

    top_crop = db.execute(
        """SELECT crop, ROUND(AVG(yield_kg_per_ha), 1) AS avg_yield
           FROM crop_data GROUP BY crop ORDER BY avg_yield DESC LIMIT 1"""
    ).fetchone()

    top_state = db.execute(
        """SELECT state_name, ROUND(AVG(yield_kg_per_ha), 1) AS avg_yield
           FROM crop_data GROUP BY state_name ORDER BY avg_yield DESC LIMIT 1"""
    ).fetchone()

    overall = db.execute(
        """SELECT ROUND(AVG(rainfall_mm)) AS avg_rainfall, ROUND(AVG(ph), 2) AS avg_ph,
                  ROUND(AVG(yield_kg_per_ha), 1) AS avg_yield
           FROM crop_data"""
    ).fetchone()

    top_district = db.execute(
        """SELECT dist_name, state_name, ROUND(AVG(yield_kg_per_ha), 1) AS avg_yield
           FROM crop_data GROUP BY dist_name ORDER BY avg_yield DESC LIMIT 1"""
    ).fetchone()

    if counts and counts["first_year"] is not None:
        stats = {
            "crop_count": counts["crop_count"],
            "state_count": counts["state_count"],
            "district_count": counts["district_count"],
            "years_span": counts["last_year"] - counts["first_year"] + 1,
            "first_year": counts["first_year"],
            "last_year": counts["last_year"],
            "top_crop": top_crop["crop"].capitalize() if top_crop and top_crop["crop"] else "N/A",
            "top_crop_yield": top_crop["avg_yield"] if top_crop else 0,
            "top_state": top_state["state_name"] if top_state and top_state["state_name"] else "N/A",
            "top_state_yield": top_state["avg_yield"] if top_state else 0,
            "top_district": top_district["dist_name"] if top_district and top_district["dist_name"] else "N/A",
            "top_district_state": top_district["state_name"] if top_district and top_district["state_name"] else "N/A",
            "top_district_yield": top_district["avg_yield"] if top_district else 0,
            "avg_rainfall": overall["avg_rainfall"] if overall and overall["avg_rainfall"] is not None else 0,
            "avg_ph": overall["avg_ph"] if overall and overall["avg_ph"] is not None else 0,
            "avg_yield": overall["avg_yield"] if overall and overall["avg_yield"] is not None else 0,
        }
    else:
        stats = {
            "crop_count": 0,
            "state_count": 0,
            "district_count": 0,
            "years_span": 0,
            "first_year": "N/A",
            "last_year": "N/A",
            "top_crop": "N/A",
            "top_crop_yield": 0,
            "top_state": "N/A",
            "top_state_yield": 0,
            "top_district": "N/A",
            "top_district_state": "N/A",
            "top_district_yield": 0,
            "avg_rainfall": 0,
            "avg_ph": 0,
            "avg_yield": 0,
        }

    return render_template("index.html", stats=stats)
