"""
AgroInsight AI — weather widget (topbar)

Live current-weather snippet for the topbar 🌤 icon. Uses Open-Meteo
(free, no API key, no signup) rather than fabricating a number — same
"real data only" principle the rest of the app follows.

Fixed to New Delhi since this is an India-focused agriculture dataset with
no per-user location on file. If the request fails for any reason
(no internet, Open-Meteo down, etc.) this returns a clean error instead of
a fake reading — the frontend shows an honest "unavailable" state, the
same pattern already used for the empty-state notification bell.
"""
import json
import urllib.error
import urllib.request

from flask import Blueprint, jsonify

from routes.decorators import api_login_required

weather_bp = Blueprint("weather", __name__)

LOCATION = {"name": "New Delhi", "lat": 28.6139, "lon": 77.2090}

WEATHER_CODES = {
    0: ("Clear sky", "☀️"), 1: ("Mainly clear", "🌤"), 2: ("Partly cloudy", "⛅"), 3: ("Overcast", "☁️"),
    45: ("Fog", "🌫"), 48: ("Fog", "🌫"),
    51: ("Light drizzle", "🌦"), 53: ("Drizzle", "🌦"), 55: ("Dense drizzle", "🌦"),
    56: ("Freezing drizzle", "🌦"), 57: ("Freezing drizzle", "🌦"),
    61: ("Light rain", "🌧"), 63: ("Rain", "🌧"), 65: ("Heavy rain", "🌧"),
    66: ("Freezing rain", "🌧"), 67: ("Freezing rain", "🌧"),
    71: ("Light snow", "🌨"), 73: ("Snow", "🌨"), 75: ("Heavy snow", "🌨"), 77: ("Snow grains", "🌨"),
    80: ("Rain showers", "🌦"), 81: ("Rain showers", "🌦"), 82: ("Violent showers", "⛈"),
    85: ("Snow showers", "🌨"), 86: ("Snow showers", "🌨"),
    95: ("Thunderstorm", "⛈"), 96: ("Thunderstorm, hail", "⛈"), 99: ("Thunderstorm, hail", "⛈"),
}


@weather_bp.route("/api/weather")
@api_login_required
def weather():
    url = (
        "https://api.open-meteo.com/v1/forecast"
        f"?latitude={LOCATION['lat']}&longitude={LOCATION['lon']}&current_weather=true"
    )
    try:
        with urllib.request.urlopen(url, timeout=4) as resp:
            current = json.loads(resp.read())["current_weather"]
    except (urllib.error.URLError, TimeoutError, KeyError, ValueError):
        return jsonify({"error": "Weather is unavailable right now."}), 503

    label, icon = WEATHER_CODES.get(current.get("weathercode"), ("—", "🌡"))
    return jsonify({
        "location": LOCATION["name"],
        "temperature_c": current.get("temperature"),
        "wind_kmh": current.get("windspeed"),
        "condition": label,
        "icon": icon,
    })
