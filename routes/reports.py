"""
AgriInsight AI — reports

CSV/Excel exports give the raw filtered rows (people who want the data
want the data). The PDF export is a formatted summary instead of a raw
dump — nobody wants a 50,000-row PDF — built with reportlab Platypus.
"""
import io
from datetime import datetime

import pandas as pd
from flask import Blueprint, Response, render_template, request, send_file
from reportlab.lib import colors
from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import getSampleStyleSheet
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

from database.db import get_db
from routes.api import _build_where
from routes.decorators import login_required

reports_bp = Blueprint("reports", __name__)

EXPORT_COLUMNS = [
    "year", "state_name", "dist_name", "crop", "area_ha", "yield_kg_per_ha",
    "n_req_kg_per_ha", "p_req_kg_per_ha", "k_req_kg_per_ha",
    "temperature_c", "humidity_pct", "ph", "rainfall_mm",
]

COLUMN_LABELS = {
    "year": "Year", "state_name": "State", "dist_name": "District", "crop": "Crop",
    "area_ha": "Area (ha)", "yield_kg_per_ha": "Yield (kg/ha)",
    "n_req_kg_per_ha": "N req (kg/ha)", "p_req_kg_per_ha": "P req (kg/ha)",
    "k_req_kg_per_ha": "K req (kg/ha)", "temperature_c": "Temp (C)",
    "humidity_pct": "Humidity (%)", "ph": "pH", "rainfall_mm": "Rainfall (mm)",
}


def _filtered_df(db) -> pd.DataFrame:
    where, params = _build_where()
    query = f"SELECT {', '.join(EXPORT_COLUMNS)} FROM crop_data {where} ORDER BY year, state_name, dist_name"
    rows = db.execute(query, params).fetchall()
    return pd.DataFrame([dict(r) for r in rows], columns=EXPORT_COLUMNS)


def _filter_summary_text() -> str:
    parts = []
    for key, label in [("year", "Year"), ("crop", "Crop"), ("state", "State"), ("district", "District")]:
        val = request.args.get(key)
        if val and val.lower() != "all":
            parts.append(f"{label}: {val}")
    return " · ".join(parts) if parts else "All data (no filters applied)"


@reports_bp.route("/reports")
@login_required
def reports_home():
    db = get_db()
    years = [r["year"] for r in db.execute("SELECT DISTINCT year FROM crop_data ORDER BY year DESC").fetchall()]
    crops = [r["crop"] for r in db.execute("SELECT DISTINCT crop FROM crop_data ORDER BY crop").fetchall()]
    states = [r["state_name"] for r in db.execute("SELECT DISTINCT state_name FROM crop_data ORDER BY state_name").fetchall()]
    return render_template("reports.html", years=years, crops=crops, states=states)


@reports_bp.route("/reports/export/csv")
@login_required
def export_csv():
    df = _filtered_df(get_db())
    buffer = io.StringIO()
    df.to_csv(buffer, index=False, header=[COLUMN_LABELS[c] for c in EXPORT_COLUMNS])
    filename = f"agriinsight_export_{datetime.now().strftime('%Y%m%d')}.csv"
    return Response(
        buffer.getvalue(),
        mimetype="text/csv",
        headers={"Content-Disposition": f"attachment; filename={filename}"},
    )


@reports_bp.route("/reports/export/excel")
@login_required
def export_excel():
    df = _filtered_df(get_db())
    df.columns = [COLUMN_LABELS[c] for c in EXPORT_COLUMNS]
    buffer = io.BytesIO()
    with pd.ExcelWriter(buffer, engine="openpyxl") as writer:
        df.to_excel(writer, index=False, sheet_name="Crop Data")
        # auto-width columns roughly, openpyxl doesn't do this by default
        sheet = writer.sheets["Crop Data"]
        for i, col in enumerate(df.columns, start=1):
            width = max(12, min(30, int(df[col].astype(str).str.len().max() or 10) + 2))
            sheet.column_dimensions[chr(64 + i) if i <= 26 else "A"].width = width
    buffer.seek(0)
    filename = f"agriinsight_export_{datetime.now().strftime('%Y%m%d')}.xlsx"
    return send_file(
        buffer,
        mimetype="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        as_attachment=True,
        download_name=filename,
    )


@reports_bp.route("/reports/export/pdf")
@login_required
def export_pdf():
    db = get_db()
    where, params = _build_where()

    kpi_row = db.execute(
        f"""SELECT ROUND(AVG(yield_kg_per_ha), 1) AS avg_yield,
                   COUNT(DISTINCT state_name) AS state_count,
                   ROUND(AVG(rainfall_mm)) AS avg_rainfall,
                   ROUND(AVG(ph), 2) AS avg_ph,
                   COUNT(*) AS record_count
            FROM crop_data {where}""",
        params,
    ).fetchone()

    top_crops = db.execute(
        f"""SELECT crop, ROUND(AVG(yield_kg_per_ha), 1) AS avg_yield
            FROM crop_data {where} GROUP BY crop ORDER BY avg_yield DESC""",
        params,
    ).fetchall()

    top_states = db.execute(
        f"""SELECT state_name, ROUND(AVG(yield_kg_per_ha), 1) AS avg_yield
            FROM crop_data {where} GROUP BY state_name ORDER BY avg_yield DESC LIMIT 5""",
        params,
    ).fetchall()

    buffer = io.BytesIO()
    doc = SimpleDocTemplate(buffer, pagesize=letter, topMargin=54, bottomMargin=54)
    styles = getSampleStyleSheet()
    story = []

    story.append(Paragraph("AgriInsight AI — Crop Report", styles["Title"]))
    story.append(Paragraph(
        f"Generated {datetime.now().strftime('%d %b %Y, %H:%M')} &nbsp;·&nbsp; Filters: {_filter_summary_text()}",
        styles["Normal"],
    ))
    story.append(Spacer(1, 18))

    story.append(Paragraph("Summary", styles["Heading2"]))
    kpi_table = Table([
        ["Records", "Avg yield (kg/ha)", "States in view", "Avg rainfall (mm)", "Avg pH"],
        [kpi_row["record_count"], kpi_row["avg_yield"], kpi_row["state_count"],
         kpi_row["avg_rainfall"], kpi_row["avg_ph"]],
    ], hAlign="LEFT")
    kpi_table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#111827")),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("FONTSIZE", (0, 0), (-1, -1), 9),
        ("GRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#D1D5DB")),
        ("ALIGN", (0, 0), (-1, -1), "CENTER"),
        ("TOPPADDING", (0, 0), (-1, -1), 6),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
    ]))
    story.append(kpi_table)
    story.append(Spacer(1, 20))

    if top_crops:
        story.append(Paragraph("Average yield by crop", styles["Heading2"]))
        rows = [["Crop", "Avg yield (kg/ha)"]] + [[r["crop"].capitalize(), r["avg_yield"]] for r in top_crops]
        t = Table(rows, hAlign="LEFT")
        t.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#22C55E")),
            ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
            ("FONTSIZE", (0, 0), (-1, -1), 9),
            ("GRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#D1D5DB")),
            ("TOPPADDING", (0, 0), (-1, -1), 5),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
        ]))
        story.append(t)
        story.append(Spacer(1, 20))

    if top_states:
        story.append(Paragraph("Top 5 states by yield", styles["Heading2"]))
        rows = [["State", "Avg yield (kg/ha)"]] + [[r["state_name"], r["avg_yield"]] for r in top_states]
        t = Table(rows, hAlign="LEFT")
        t.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#3B82F6")),
            ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
            ("FONTSIZE", (0, 0), (-1, -1), 9),
            ("GRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#D1D5DB")),
            ("TOPPADDING", (0, 0), (-1, -1), 5),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
        ]))
        story.append(t)

    doc.build(story)
    buffer.seek(0)
    filename = f"agriinsight_report_{datetime.now().strftime('%Y%m%d')}.pdf"
    return send_file(buffer, mimetype="application/pdf", as_attachment=True, download_name=filename)
