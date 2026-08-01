from flask import Blueprint, render_template

from database.db import get_db

dashboard_bp = Blueprint("dashboard", __name__)


@dashboard_bp.route("/dashboard")
def dashboard_home():
    # NOTE: no login_required yet — wire this up once auth flow is finalized
    # so the dashboard can still be previewed standalone during development.
    db = get_db()
    years = [r["year"] for r in db.execute(
        "SELECT DISTINCT year FROM crop_data ORDER BY year DESC"
    ).fetchall()]
    crops = [r["crop"] for r in db.execute(
        "SELECT DISTINCT crop FROM crop_data ORDER BY crop"
    ).fetchall()]
    states = [r["state_name"] for r in db.execute(
        "SELECT DISTINCT state_name FROM crop_data ORDER BY state_name"
    ).fetchall()]

    return render_template(
        "dashboard.html", years=years, crops=crops, states=states
    )
