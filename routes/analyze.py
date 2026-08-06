"""
AgroInsight AI — Analyze (CSV / Excel upload)

Lets a logged-in user upload their own .csv / .xlsx / .xls file and get an
instant profile of it: shape, per-column stats, missing values, a numeric
correlation matrix, and chart-ready data for a few auto-picked columns.

Deliberately stateless — nothing is written to disk or the database. The
file is read into a pandas DataFrame in memory for the duration of the
request and discarded once the response is sent. That keeps this feature
safe to ship without extra cleanup/retention logic, and matches the rest
of the app's "read-only, live" pattern (routes/api.py never caches either).
"""
import math

import numpy as np
import pandas as pd
from flask import Blueprint, jsonify, render_template, request

from routes.decorators import api_login_required, login_required

analyze_bp = Blueprint("analyze", __name__)

ALLOWED_EXTENSIONS = {"csv", "xlsx", "xls"}
MAX_PREVIEW_ROWS = 15
MAX_CHART_COLUMNS = 6          # numeric columns to auto-chart (histograms)
MAX_CATEGORY_COLUMNS = 4       # low-cardinality text columns to auto-chart
MAX_CATEGORY_UNIQUE = 20       # a text column with more unique values than this isn't "categorical"
HISTOGRAM_BINS = 10


def _ext(filename: str) -> str:
    return filename.rsplit(".", 1)[-1].lower() if "." in filename else ""


def _read_file(file_storage) -> pd.DataFrame:
    ext = _ext(file_storage.filename)
    if ext == "csv":
        return pd.read_csv(file_storage)
    if ext in ("xlsx", "xls"):
        return pd.read_excel(file_storage)
    raise ValueError(f"Unsupported file type: .{ext or '?'}")


def _clean(value):
    """Make a value JSON-safe: numpy scalars -> python, NaN/inf -> None."""
    if isinstance(value, (np.integer,)):
        value = int(value)
    elif isinstance(value, (np.floating,)):
        value = float(value)
    if isinstance(value, float) and (math.isnan(value) or math.isinf(value)):
        return None
    if pd.isna(value):
        return None
    return value


def _column_profile(df: pd.DataFrame, col: str) -> dict:
    series = df[col]
    missing = int(series.isna().sum())
    profile = {
        "name": col,
        "dtype": str(series.dtype),
        "missing_count": missing,
        "missing_pct": round(missing / len(df) * 100, 1) if len(df) else 0,
        "unique_count": int(series.nunique(dropna=True)),
    }

    if pd.api.types.is_numeric_dtype(series):
        desc = series.describe()
        profile.update({
            "kind": "numeric",
            "min": _clean(desc.get("min")),
            "max": _clean(desc.get("max")),
            "mean": _clean(round(desc.get("mean"), 3)) if pd.notna(desc.get("mean")) else None,
            "median": _clean(series.median()),
            "std": _clean(round(desc.get("std"), 3)) if pd.notna(desc.get("std")) else None,
        })
    elif pd.api.types.is_datetime64_any_dtype(series):
        profile.update({
            "kind": "datetime",
            "min": str(series.min()) if series.notna().any() else None,
            "max": str(series.max()) if series.notna().any() else None,
        })
    else:
        top = series.value_counts(dropna=True).head(5)
        profile.update({
            "kind": "categorical",
            "top_values": [{"value": str(k), "count": int(v)} for k, v in top.items()],
        })

    return profile


def _histogram(series: pd.Series, bins: int = HISTOGRAM_BINS) -> dict:
    clean = series.dropna()
    if clean.empty or clean.nunique() < 2:
        return {"labels": [], "counts": []}
    counts, edges = np.histogram(clean, bins=bins)
    labels = [f"{edges[i]:.2g}–{edges[i + 1]:.2g}" for i in range(len(edges) - 1)]
    return {"labels": labels, "counts": [int(c) for c in counts]}


def _correlation_matrix(df: pd.DataFrame, numeric_cols: list) -> dict:
    if len(numeric_cols) < 2:
        return {"columns": [], "matrix": []}
    corr = df[numeric_cols].corr(numeric_only=True).round(2)
    matrix = [[_clean(v) for v in row] for row in corr.values]
    return {"columns": list(corr.columns), "matrix": matrix}


def analyze_dataframe(df: pd.DataFrame, filename: str) -> dict:
    df = df.dropna(axis=1, how="all")  # ignore fully-empty columns (common in messy exports)

    columns = [_column_profile(df, c) for c in df.columns]
    numeric_cols = [c["name"] for c in columns if c["kind"] == "numeric"]
    row_count = len(df) or 1
    categorical_cols = [
        c["name"] for c in columns
        if c["kind"] == "categorical"
        and 2 <= c["unique_count"] <= MAX_CATEGORY_UNIQUE
        # skip ID/name-like columns where almost every value is unique — a bar
        # chart with one bar per row (height 1 each) tells you nothing useful
        and c["unique_count"] / row_count <= 0.8
    ]

    charts = []
    for col in numeric_cols[:MAX_CHART_COLUMNS]:
        hist = _histogram(df[col])
        if hist["labels"]:
            charts.append({"type": "histogram", "column": col, **hist})

    for col in categorical_cols[:MAX_CATEGORY_COLUMNS]:
        vc = df[col].value_counts(dropna=True).head(10)
        charts.append({
            "type": "bar",
            "column": col,
            "labels": [str(k) for k in vc.index],
            "counts": [int(v) for v in vc.values],
        })

    preview_df = df.head(MAX_PREVIEW_ROWS)
    preview_rows = [
        {k: _clean(v) for k, v in row.items()}
        for row in preview_df.to_dict(orient="records")
    ]

    total_cells = df.shape[0] * df.shape[1]
    missing_cells = int(df.isna().sum().sum())

    return {
        "filename": filename,
        "row_count": int(df.shape[0]),
        "column_count": int(df.shape[1]),
        "missing_pct": round(missing_cells / total_cells * 100, 1) if total_cells else 0,
        "numeric_column_count": len(numeric_cols),
        "categorical_column_count": sum(1 for c in columns if c["kind"] == "categorical"),
        "columns": columns,
        "preview_columns": list(preview_df.columns),
        "preview_rows": preview_rows,
        "charts": charts,
        "correlation": _correlation_matrix(df, numeric_cols),
    }


@analyze_bp.route("/analyze")
@login_required
def analyze_home():
    return render_template("analyze.html")


@analyze_bp.route("/api/analyze/upload", methods=["POST"])
@api_login_required
def analyze_upload():
    if "file" not in request.files:
        return jsonify({"error": "No file was uploaded."}), 400

    file = request.files["file"]
    if not file.filename:
        return jsonify({"error": "No file was selected."}), 400

    ext = _ext(file.filename)
    if ext not in ALLOWED_EXTENSIONS:
        return jsonify({"error": "Only .csv, .xlsx and .xls files are supported."}), 400

    try:
        df = _read_file(file)
    except Exception as exc:  # malformed file, wrong delimiter, corrupt workbook, etc.
        return jsonify({"error": f"Couldn't read that file: {exc}"}), 400

    if df.empty:
        return jsonify({"error": "That file doesn't contain any rows."}), 400

    result = analyze_dataframe(df, file.filename)
    return jsonify(result)
