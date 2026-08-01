from flask import Blueprint, render_template, request, jsonify

from database.db import get_db
from chatbot.chatbot import handle_message, EXAMPLE_PROMPTS
from routes.decorators import login_required, api_login_required

assistant_bp = Blueprint("assistant", __name__)


@assistant_bp.route("/assistant")
@login_required
def assistant_home():
    return render_template("assistant.html", examples=EXAMPLE_PROMPTS)


@assistant_bp.route("/api/chat", methods=["POST"])
@api_login_required
def chat():
    payload = request.get_json(silent=True) or {}
    message = (payload.get("message") or "").strip()

    if not message:
        return jsonify({"error": "Message is empty."}), 400
    if len(message) > 300:
        return jsonify({"error": "Keep it under 300 characters."}), 400

    db = get_db()
    result = handle_message(db, message)
    return jsonify(result)
