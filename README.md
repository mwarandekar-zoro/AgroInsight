# AgroInsight AI 🌾

**Smart Agriculture Analytics & Recommendation Platform**

AgroInsight AI is a comprehensive web-based platform designed to provide data-driven agricultural insights. Built with **Flask, SQLite, and Chart.js**, it features real-time data visualization, machine learning-based crop recommendations, and an intelligent AI assistant to query historical crop data.

## 🚀 Features

- **Interactive Dashboard:** 14 live Chart.js visualizations covering yield analysis, weather impacts, soil/crop metrics, and geographic distributions. Fully reactive filters immediately update all 6 KPIs and 14 graphs.
- **Interactive India Map:** A Leaflet-based choropleth showing state-level yield distributions. Click any state to drill down into the dashboard filtered to that state.
- **Dynamic AI Insights:** Real-time summary metrics generated dynamically based on active filter selections.
- **ML Crop Recommendation:** Built-in Random Forest models that recommend the most suitable crop and predict expected yield based on soil N/P/K, temperature, humidity, pH, and rainfall.
- **AI Assistant:** A dedicated AI chatbot capable of answering queries directly from the agricultural database.
- **Crop Comparison:** Side-by-side comparative analysis of different crops, highlighting climate requirements and yield trends.
- **Application Settings:** Preferences panel to customize yield display units (kg/ha, t/ha, q/ha), temperature display (°C, °F), themes, auto-refresh, and notification alerts.
- **Advanced Reporting:** Export filtered data instantly to PDF summaries, Excel, or CSV formats.
- **User Authentication:** Secure session-based authentication with Werkzeug password hashing.
- **Responsive UI:** Modern responsive design with light/dark theme preference persistence.

## 🛠️ Tech Stack

- **Backend:** Python, Flask, SQLite
- **Frontend:** HTML, Vanilla CSS, JavaScript, Chart.js, Leaflet (locally bundled for offline functionality)
- **Machine Learning:** scikit-learn, pandas

## ⚙️ Setup and Installation

### 1. Install Dependencies
Ensure you have Python installed, then run:
```bash
pip install -r requirements.txt
```

### 2. Dataset Preparation
The application requires a dataset file located exactly at:
```
dataset/crop_dataset.csv
```
*Note: The SQLite database (`database/agroinsight.db`) is automatically created and populated from this CSV file on the first run. No manual database setup is required.*

### 3. Train the ML Models
Before using the recommendation features, generate the prediction models by running:
```bash
python -m ml.train_model
```
This will train the Random Forest classifiers and output `models/crop_model.pkl`.

### 4. Run the Application
Start the Flask development server:
```bash
python app.py
```
Visit `http://localhost:5000` in your browser.

## 📊 Project Structure
- `routes/` - Flask API and page routes
- `ml/` - Machine learning pipelines and dataset loaders
- `chatbot/` - Logic for the AI Assistant query parsing and database lookups
- `database/` - Database initialization and schemas
- `static/` - CSS, client-side JS, and bundled libraries like Chart.js
- `templates/` - HTML template files
