"""
AgroInsight AI — Interactive India Map

A Leaflet choropleth of the 20 states covered by the dataset, colored by
average yield and clickable to jump into the dashboard pre-filtered to
that state. State boundaries ship as a pre-simplified local GeoJSON
(static/data/india_states.geojson) rather than a CDN fetch, so the map
loads instantly and works offline — same reasoning as vendoring Chart.js
locally instead of pulling it from a CDN.
"""
from flask import Blueprint, render_template

from routes.decorators import login_required

india_map_bp = Blueprint("india_map", __name__)


@india_map_bp.route("/india-map")
@login_required
def india_map_home():
    return render_template("india_map.html")
