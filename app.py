from flask import Flask

from config import Config
from database.db import register_db
from routes.main import main_bp
from routes.auth import auth_bp
from routes.dashboard import dashboard_bp
from routes.api import api_bp
from routes.recommendation import recommendation_bp
from routes.compare import compare_bp
from routes.chatbot import assistant_bp
from routes.reports import reports_bp
from routes.analyze import analyze_bp


def create_app():
    app = Flask(__name__)
    app.config.from_object(Config)

    register_db(app)

    app.register_blueprint(main_bp)
    app.register_blueprint(auth_bp)
    app.register_blueprint(dashboard_bp)
    app.register_blueprint(api_bp)
    app.register_blueprint(recommendation_bp)
    app.register_blueprint(compare_bp)
    app.register_blueprint(assistant_bp)
    app.register_blueprint(reports_bp)
    app.register_blueprint(analyze_bp)

    return app


app = create_app()

if __name__ == "__main__":
    app.run(debug=app.config["DEBUG"], host="0.0.0.0", port=5000)
