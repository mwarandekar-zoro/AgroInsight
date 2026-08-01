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

## AI Assistant (chatbot/, routes/chatbot.py)

Page: `/assistant`. API: `POST /api/chat`.

Rule-based on purpose — every reply is a real query against `crop_data`,
so there's no hallucination risk, and it's free/instant (no external API
calls). Supports:

- "best crop for &lt;state&gt;" — ranks all crops grown in that state by yield
- "compare &lt;crop&gt; and &lt;crop&gt;" — quick yield comparison + link to `/compare`
  pre-filled with both crops
- "top states for &lt;crop&gt;" — top 3 states by yield for that crop
- "show &lt;crop&gt; data" — link to `/dashboard` pre-filtered
- "yield of &lt;crop&gt; in &lt;state&gt;" — yield + climate stats
- greetings / help / fallback with example prompts

The redirect links it gives out actually work: `static/js/charts.js` and
`static/js/compare.js` both read `?crop=&state=&year=&district=` /
`?crop_a=&crop_b=` from the URL on page load and pre-set the filters
before the first data fetch.

**Seam for upgrading to a real LLM later**, if you want more open-ended
Q&A than the fixed intents above: `chatbot/query_handler.py` is where
intent detection happens — swap it for an Anthropic API call, but keep
`chatbot/insights.py`'s DB-lookup functions as the only source of facts
the model is allowed to state, so it can't invent numbers that aren't in
the dataset.

## Reports (routes/reports.py)

Page: `/reports`. Exports: `GET /reports/export/{csv,excel,pdf}`, all
accepting the same `?year=&crop=&state=&district=` filters as the
dashboard API.

- **CSV / Excel** — full filtered row-level data (people exporting data
  want the data, not a summary). Verified both round-trip cleanly through
  pandas.
- **PDF** — a formatted summary report instead of a raw dump (a 50k-row
  PDF helps no one): KPI table, avg yield by crop, top 5 states by yield.
  Built with reportlab Platypus.

The Reports page has its own filter bar (reusing `/api/kpis` and
`/api/districts`) with a live preview, and the three export buttons'
`href`s update to match the current filters before you click.

## Auth gating (routes/decorators.py)

Every page except the landing page, login, and register now requires a
session — `/dashboard`, `/recommendation`, `/compare`, `/assistant`,
`/reports`, and every `/api/*` and `/reports/export/*` endpoint.

Two decorators, because a page and a fetch() call need different
failure behavior:

- `@login_required` — for HTML pages. Redirects to `/login?next=<path>`,
  flashes "Please log in to continue.", and after a successful login you
  land back on the page you actually wanted (verified: `/login?next=/compare`
  → login → lands on `/compare`, not the dashboard default).
- `@api_login_required` — for JSON endpoints. Returns `401
  {"error": "..."}` instead of redirecting, since redirecting mid-fetch()
  just breaks the frontend silently.

`next=` is validated to be a relative in-app path only (no `netloc` /
`scheme`) so it can't be used as an open redirect.

Sidebar footer and topbar avatar on every gated page now show the real
logged-in user's name/initial instead of the "Demo User" placeholder, and
the landing page navbar swaps Log in/Get started for Dashboard/Log out
when a session exists.

## Light theme

Toggle button (🌙/☀️) lives in every navbar/topbar now, including the
landing page. Implementation notes:

- `html.light-theme` in `style.css` overrides the same CSS variables the
  dark theme defines in `:root` — every component built on `var(--bg)`,
  `var(--card)`, `var(--text)` etc. themes automatically, no per-component
  light-mode CSS needed.
- Text-facing accent colors (`--primary`, `--accent`, `--warning`,
  `--danger`) are a shade darker in light mode than in dark mode, since
  the dark-theme values don't clear AA contrast against a white
  background when used as text/icon color (button backgrounds are
  unaffected — they're not text-on-bg).
- Preference is saved to `localStorage` and applied via an inline script
  in `<head>` (before `style.css` even loads) so there's no flash of the
  wrong theme on navigation.
- Clicking the toggle **reloads the page** rather than toggling the class
  in place. Reason: Chart.js reads CSS variable colors once, at chart
  creation time, via `getComputedStyle` — toggling live would leave any
  charts on the page stuck in the old theme's colors until the next
  reload anyway. A full reload keeps everything, charts included,
  consistently themed with no extra event-wiring.

## Dashboard charts (13 total, up from 4)

Grouped into 4 sections on `/dashboard`, matching the original spec's chart
categories:

**Yield Analysis** — year-wise yield trend (line), area harvested growth
(area chart — literally an "area" chart of harvested area, felt too fitting
not to do), top crops by yield (bar), top 10 states by yield (horizontal bar)

**Weather Analysis** — rainfall vs yield, temperature vs yield, humidity vs
yield (all scatter, 400-point sampled), soil pH distribution (bar — note:
only 2 distinct pH values exist in this dataset, see the fixed-climate-
profile limitation noted earlier; that's real, not a bug)

**Soil & Crop Analysis** — NPK & climate radar, crop distribution by
harvested area (doughnut)

**Geographic Analysis** — state-wise yield, all 20 states (horizontal bar),
top 10 districts by yield (horizontal bar), and a state × crop yield
heatmap built with a plain HTML/CSS grid rather than a Chart.js plugin —
each crop's column is normalized to its own min/max range so every crop
shows visible contrast even though absolute yields differ hugely (rice
~1600 kg/ha vs cotton ~260 kg/ha would otherwise make cotton's whole row
look flat against a shared scale).

**Pattern used throughout:** any chart that *ranks* a dimension (top
states, top crops, top districts, crop distribution) ignores its own
filter server-side now — `_build_where(exclude=(...))` in `routes/api.py`
— so e.g. picking a state in the filter bar doesn't collapse "top states"
down to one bar. This was previously only handled client-side for
top-crops; it's now consistent and enforced server-side for every ranking
chart, including if the API is called directly.

## Landing page — real numbers, not placeholders

`routes/main.py` now queries `crop_data` on every load for hero stats,
the yield-growth panel, and the insights ticker — nothing on the landing
page is hardcoded anymore. What changed:

- Hero stats: "28+ crops" / "640 districts" / "96.2% model confidence"
  (all fabricated, and 640 districts was never even close — real count is
  311) → **4 crops tracked, 311 districts covered, 52 years of data**
- Yield-growth panel: fake "+18.6% season Δ" and "3.4 t/ha" (wrong unit —
  everything else in the app is kg/ha) → real overall avg yield in
  kg/ha, real top crop, real avg rainfall
- Insights ticker: **Sugarcane** and **Soybean** as top/trending crops —
  neither exists in this dataset at all (real crops are rice, maize,
  chickpea, cotton) → replaced with live-queried highest-yield crop,
  best state, best district, avg rainfall, avg pH, and the real
  1966–2017 date range
- "Today's insight" / "Latest agriculture insights" framing implied a
  live daily feed for what's actually a static historical batch dataset
  → reworded to "Dataset insights" / "What the numbers show"

Verified end to end: none of the old fabricated strings (`28+`, `640`,
`96.2%`, `Sugarcane`, `Soybean`, `Season Δ`, `3.4 t/ha`) appear anywhere
in the rendered page anymore, and the real values match what Phase 1's
data pipeline reported (4 crops, 311 districts, Maize highest-yield crop
at 1606 kg/ha, Andhra Pradesh top state).

## All 10 phases complete

1. ✅ Dataset pipeline
2. ✅ Live dashboard API + real filters
3. ✅ ML recommendation engine
4. ✅ Compare page
5. ✅ AI Assistant
6. ✅ Reports (PDF/Excel/CSV)
7. ✅ Auth gating
8. ✅ Light theme
9. ✅ 13 live dashboard charts
10. ✅ Landing page copy — see above

**What's genuinely still open, if you want to keep extending it:**
Reports/dashboard could use pagination for very large unfiltered CSV
exports; the AI Assistant is rule-based (see the chatbot section above for
the seam to plug in a real LLM later); and the recommendation model's
100% accuracy is a known, documented artifact of this dataset's fixed
per-crop climate profiles, not a modeling bug — worth being ready to
explain in a defense/demo.

## Structure

Matches the original spec layout: `routes/`, `templates/`, `static/`,
`database/`, `ml/`, `chatbot/`, `models/`, `dataset/` are all present as
placeholders for the pieces above.
