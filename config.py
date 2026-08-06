import os

from dotenv import load_dotenv

BASE_DIR = os.path.abspath(os.path.dirname(__file__))

# Loads GROQ_API_KEY (and anything else) from a local .env file if present.
# Safe to call even if .env doesn't exist — just a no-op then.
load_dotenv(os.path.join(BASE_DIR, ".env"))


class Config:
    SECRET_KEY = os.environ.get("SECRET_KEY", "dev-secret-change-me")
    # SQLite for local/dev + college submission simplicity.
    # Swap DATABASE_PATH for a MySQL connection string later if needed.
    DATABASE_PATH = os.path.join(BASE_DIR, "database", "agroinsight.db")
    DEBUG = os.environ.get("FLASK_DEBUG", "1") == "1"

    # Groq API — used by the AI Assistant as a fallback for open-ended
    # questions the rule-based intent matcher (chatbot/query_handler.py)
    # doesn't recognize. If GROQ_API_KEY is unset, the assistant just
    # keeps using its old canned fallback reply — nothing breaks.
    GROQ_API_KEY = os.environ.get("GROQ_API_KEY")
    GROQ_MODEL = os.environ.get("GROQ_MODEL", "llama-3.3-70b-versatile")
