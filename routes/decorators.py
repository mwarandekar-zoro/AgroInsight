"""
AgriInsight AI — auth decorators

Split into two because a redirect makes sense for a page request but not
for a fetch() call from JS — an API 401 lets the frontend handle it
(e.g. show a message) instead of navigating the whole page away mid-fetch.
"""
from functools import wraps

from flask import flash, jsonify, redirect, request, session, url_for


def login_required(view):
    @wraps(view)
    def wrapped(*args, **kwargs):
        if "user_id" not in session:
            flash("Please log in to continue.")
            return redirect(url_for("auth.login", next=request.path))
        return view(*args, **kwargs)
    return wrapped


def api_login_required(view):
    @wraps(view)
    def wrapped(*args, **kwargs):
        if "user_id" not in session:
            return jsonify({"error": "Please log in to continue."}), 401
        return view(*args, **kwargs)
    return wrapped
