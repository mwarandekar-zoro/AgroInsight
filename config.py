import os

BASE_DIR = os.path.abspath(os.path.dirname(__file__))


class Config:
    SECRET_KEY = os.environ.get("SECRET_KEY", "dev-secret-change-me")
    # SQLite for local/dev + college submission simplicity.
    # Swap DATABASE_PATH for a MySQL connection string later if needed.
    DATABASE_PATH = os.path.join(BASE_DIR, "database", "agriinsight.db")
    DEBUG = os.environ.get("FLASK_DEBUG", "1") == "1"
