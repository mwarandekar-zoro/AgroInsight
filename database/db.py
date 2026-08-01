import os
import sqlite3
from flask import current_app, g


def get_db():
    if "db" not in g:
        g.db = sqlite3.connect(current_app.config["DATABASE_PATH"])
        g.db.row_factory = sqlite3.Row
        g.db.execute("PRAGMA foreign_keys = ON")
    return g.db


def close_db(e=None):
    db = g.pop("db", None)
    if db is not None:
        db.close()


def init_db(app):
    with app.app_context():
        db = get_db()
        schema_path = app.root_path + "/database/schema.sql"
        with open(schema_path, "r") as f:
            db.executescript(f.read())
        db.commit()


def _autoload_dataset_if_empty(app):
    """
    schema.sql only creates an *empty* crop_data table. Historically the CSV
    only got loaded if someone remembered to separately run
    `python -m ml.data_loader` — forget that step (or delete the .db file
    and just restart the app) and the dashboard silently shows blank
    filters/KPIs/charts with no error anywhere. This makes the load
    automatic on startup whenever the table is empty, so that can't happen.
    """
    with app.app_context():
        db = get_db()
        count = db.execute("SELECT COUNT(*) FROM crop_data").fetchone()[0]
        if count > 0:
            return

        from ml.data_loader import CSV_PATH, SCHEMA_PATH, load_and_clean, load_to_db

        if not os.path.exists(CSV_PATH):
            app.logger.warning(
                "crop_data is empty and no dataset CSV was found at %s — "
                "put the CSV there and restart, or run "
                "`python -m ml.data_loader` manually.", CSV_PATH
            )
            return

        app.logger.info("crop_data table is empty — loading dataset from CSV (first run)...")
        df = load_and_clean(CSV_PATH)
        load_to_db(df, app.config["DATABASE_PATH"], SCHEMA_PATH)
        app.logger.info("Dataset loaded: %s rows.", len(df))


def register_db(app):
    app.teardown_appcontext(close_db)
    with app.app_context():
        init_db(app)
        _autoload_dataset_if_empty(app)
