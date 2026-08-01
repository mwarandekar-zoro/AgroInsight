"""
AgroInsight AI — chatbot response builders

Every function here queries crop_data directly and returns
(reply_text, redirect_url | None). Nothing is invented — if the data
doesn't answer the question, we say so instead of guessing.
"""


def best_crop_for_state(db, state: str):
    rows = db.execute(
        """SELECT crop, ROUND(AVG(yield_kg_per_ha), 1) AS avg_yield
           FROM crop_data WHERE state_name = ?
           GROUP BY crop ORDER BY avg_yield DESC""",
        (state,),
    ).fetchall()

    if not rows:
        return f"I don't have data for {state}.", None

    top = rows[0]
    others = ", ".join(f"{r['crop'].capitalize()} ({r['avg_yield']} kg/ha)" for r in rows[1:])
    reply = f"For {state}, {top['crop'].capitalize()} has the highest average yield at {top['avg_yield']} kg/ha."
    if others:
        reply += f" Other crops grown there: {others}."
    return reply, f"/dashboard?state={state}"


def compare_crops(db, crop_a: str, crop_b: str):
    def avg_yield(crop):
        row = db.execute(
            "SELECT ROUND(AVG(yield_kg_per_ha), 1) AS y FROM crop_data WHERE crop = ?", (crop,)
        ).fetchone()
        return row["y"]

    ya, yb = avg_yield(crop_a), avg_yield(crop_b)
    if ya is None or yb is None:
        return "I don't have data for one of those crops.", None

    winner = crop_a if ya > yb else crop_b
    reply = (
        f"{crop_a.capitalize()} averages {ya} kg/ha vs {crop_b.capitalize()}'s {yb} kg/ha — "
        f"{winner.capitalize()} yields higher on average. Opening the Compare page for the full breakdown."
    )
    return reply, f"/compare?crop_a={crop_a}&crop_b={crop_b}"


def top_states_for_crop(db, crop: str):
    rows = db.execute(
        """SELECT state_name, ROUND(AVG(yield_kg_per_ha), 1) AS avg_yield
           FROM crop_data WHERE crop = ?
           GROUP BY state_name ORDER BY avg_yield DESC LIMIT 3""",
        (crop,),
    ).fetchall()

    if not rows:
        return f"I don't have data for {crop}.", None

    listing = "; ".join(f"{r['state_name']} ({r['avg_yield']} kg/ha)" for r in rows)
    reply = f"Top states for {crop.capitalize()}: {listing}."
    return reply, f"/dashboard?crop={crop}"


def yield_stats(db, crop: str, state: str = None):
    where = "WHERE crop = ?"
    params = [crop]
    if state:
        where += " AND state_name = ?"
        params.append(state)

    row = db.execute(
        f"""SELECT ROUND(AVG(yield_kg_per_ha), 1) AS y, ROUND(AVG(rainfall_mm)) AS r,
                   ROUND(AVG(temperature_c), 1) AS t
            FROM crop_data {where}""",
        params,
    ).fetchone()

    if row["y"] is None:
        loc = f" in {state}" if state else ""
        return f"I don't have data for {crop}{loc}.", None

    loc = f" in {state}" if state else ""
    reply = (
        f"{crop.capitalize()}{loc} averages {row['y']} kg/ha, "
        f"grown around {row['t']}°C with ~{row['r']}mm rainfall."
    )
    redirect = f"/dashboard?crop={crop}" + (f"&state={state}" if state else "")
    return reply, redirect


def show_crop_data(db, crop: str, state: str = None):
    loc = f" filtered to {state}" if state else ""
    reply = f"Opening the dashboard filtered to {crop.capitalize()}{loc}."
    redirect = f"/dashboard?crop={crop}" + (f"&state={state}" if state else "")
    return reply, redirect
