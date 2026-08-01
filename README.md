# AgriInsight AI

Smart Agriculture Analytics & Recommendation Platform — Flask + SQLite + Chart.js.

## Run it

```bash
pip install -r requirements.txt
python app.py
```

Visit `http://localhost:5000`.

The SQLite database (`database/agriinsight.db`) is created automatically on
first run from `database/schema.sql` — nothing to set up manually.

## What's working right now

- **Landing page** (`/`) — hero with an animated SVG "growth curve" signature
  visual, feature grid, insights ticker. Dark theme per the design spec
  (`#0B1220` bg, `#22C55E` primary, `#3B82F6` accent).
- **Register / Login** (`/register`, `/login`) — real accounts, hashed
  passwords (Werkzeug), session-based auth. Successful login redirects to
  `/dashboard`.
- **Dashboard shell** (`/dashboard`) — sidebar, topbar, filter bar, 4 KPI
  cards, and 4 live Chart.js charts (yield trend, top crops, rainfall vs
  yield, soil NPK radar). Charts currently run on **sample data** — see
  next steps.

## Dataset

`dataset/crop_dataset.csv` — 50,765 rows, 1966–2017, 20 states, 311
districts, **4 crops: rice, maize, chickpea, cotton**. Columns: yield,
area, N/P/K requirement, temperature, humidity, pH, rainfall, wind speed,
solar radiation.

Load it into SQLite (safe to re-run — clears and reloads `crop_data` each
time):

```bash
python -m ml.data_loader
```

This runs automatically once `database/agriinsight.db` exists and has the
`crop_data` table populated — if you delete the `.db` file, re-run the
loader before starting the app, since `register_db()` only creates empty
tables, it doesn't load data.

A `v_crop_year_state` SQL view is also created for fast aggregate queries
(avg yield/rainfall/temp/humidity/pH by year+state+crop) — most dashboard
and analytics routes should query this instead of `crop_data` directly.

## API (routes/api.py)

All endpoints are read-only, filter-aware (`?year=&crop=&state=&district=`,
omit or `all` to skip), and query `crop_data` live — nothing is cached or
hardcoded:

- `GET /api/kpis` — avg yield, states in view, avg rainfall, avg pH, and a
  real year-over-year yield trend %
- `GET /api/charts/yield-trend` — avg yield by year
- `GET /api/charts/top-crops` — avg yield by crop (ignores the crop filter
  on itself, so the bar chart stays comparative)
- `GET /api/charts/rainfall-yield` — up to 400 randomly sampled points
  (rainfall vs yield) so the scatter stays responsive
- `GET /api/charts/npk` — N/P/K + pH + humidity, min-max normalized 0–100
  against the whole dataset
- `GET /api/districts?state=` — cascading district list for the filter bar

**Worth knowing for Phase 3 (ML):** each crop in this dataset has a
*fixed* environmental profile — e.g. cotton is always pH 6.0 / 28°C /
65% humidity / 700mm rainfall, rice is always pH 6.5 / 25°C / 80% / 1200mm.
There's no per-record variation in climate by crop. That's fine for the
dashboard, but it means a recommendation model trained on these exact
columns will likely just memorize "these 4 climate fingerprints → these 4
crops" rather than learning a nuanced boundary — worth designing around
when we get to Phase 3.

## ML Recommendation (ml/, routes/recommendation.py)

Train the model (writes `models/crop_model.pkl`):

```bash
python -m ml.train_model
```

- **Classifier** (RandomForest) — N/P/K + temperature + humidity + pH +
  rainfall → crop (rice / maize / chickpea / cotton)
- **Regressor** (RandomForest) — same features + predicted crop → expected
  yield (kg/ha)
- **Explanation** — per-crop feature means (from training data) are stored
  alongside the models so `/api/recommend` can show which of your inputs
  matched the crop's typical profile (✔) and which didn't
- Page: `/recommendation`. API: `POST /api/recommend`.

**Important limitation to know about, not a bug:** this dataset gives each
crop a *fixed* climate fingerprint (e.g. rice is always pH 6.5/25°C/80%/
1200mm — zero variation). So the classifier trains to ~100% accuracy and
confidently snaps to the *nearest* of the 4 fingerprints even for
in-between inputs — e.g. plausible "average field" values landed on Maize
at 100% confidence in testing. That's the model correctly reflecting what
the data actually contains, not overfitting. If you want smoother,
more-realistic confidence scores later, the fix is adding controlled noise
to climate features during training (or getting a dataset with real
climate variance per crop) — flagging it here rather than silently
"fixing" it, since changing the data changes what's true to explain.

## Compare (routes/compare.py)

Page: `/compare`. API: `GET /api/compare?crop_a=&crop_b=`.

Picks any 2 of the 4 crops and compares, all live-queried:

- Avg yield, temperature, humidity, rainfall, pH, N/P/K requirement
  (yield is the only metric with a "winner" highlight — the rest are just
  differences, not better/worse)
- Dual-line yield trend across all 52 years
- Dual-dataset radar reusing the same 0–100 normalization as the
  dashboard's NPK chart
- Top 3 states and top 3 districts by avg yield, for each crop

The API rejects unknown crop names with a 400; picking the same crop twice
is blocked client-side before the request is even made.

## Next steps (not built yet)

1. ~~**Dataset** → load into `crop_data`~~ ✅ done.
2. ~~**Live dashboard API + real filters**~~ ✅ done.
3. ~~**ML recommendation**~~ ✅ done.
4. ~~**Compare page**~~ ✅ done — see above.
5. **AI Assistant** (`chatbot/`) — natural-language query handling that can
   both answer and drive dashboard filters.
6. **Reports** — PDF/Excel/CSV export via `routes/reports.py`.
7. **Auth hardening** — add `login_required` to dashboard / recommendation
   / compare routes once the rest of the app depends on a logged-in
   session.
8. **Light theme** — the topbar toggle button exists but only flips a CSS
   class right now; light-theme tokens still need to be written.
9. **Landing page copy** — currently says "28+ crops"; should say 4
   (rice, maize, chickpea, cotton) to match the real dataset.
10. **More dashboard charts** — spec calls for 12–15; we have 4 live ones.

## Structure

Matches the original spec layout: `routes/`, `templates/`, `static/`,
`database/`, `ml/`, `chatbot/`, `models/`, `dataset/` are all present as
placeholders for the pieces above.
