from flask import Blueprint, render_template

from database.db import get_db

compare_bp = Blueprint("compare", __name__)


@compare_bp.route("/compare")
def compare_home():
    db = get_db()
    crops = [r["crop"] for r in db.execute(
        "SELECT DISTINCT crop FROM crop_data ORDER BY crop"
    ).fetchall()]
    return render_template("compare.html", crops=crops)
