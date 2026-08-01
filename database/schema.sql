-- AgroInsight AI — schema (aligned to Custom_Crops_yield_Historical_Dataset.csv)

CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS crop_data (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    dist_code INTEGER,
    year INTEGER,
    state_code INTEGER,
    state_name TEXT,
    dist_name TEXT,
    crop TEXT,
    area_ha REAL,
    yield_kg_per_ha REAL,
    n_req_kg_per_ha REAL,
    p_req_kg_per_ha REAL,
    k_req_kg_per_ha REAL,
    total_n_kg REAL,
    total_p_kg REAL,
    total_k_kg REAL,
    temperature_c REAL,
    humidity_pct REAL,
    ph REAL,
    rainfall_mm REAL,
    wind_speed_m_s REAL,
    solar_radiation REAL
);

CREATE INDEX IF NOT EXISTS idx_crop_data_crop ON crop_data (crop);
CREATE INDEX IF NOT EXISTS idx_crop_data_state ON crop_data (state_name);
CREATE INDEX IF NOT EXISTS idx_crop_data_year ON crop_data (year);
CREATE INDEX IF NOT EXISTS idx_crop_data_dist ON crop_data (dist_name);

-- Handy view: one row per crop/state/year with averaged climate + yield,
-- used by most dashboard aggregate queries so we're not repeating the same
-- GROUP BY logic in every route.
CREATE VIEW IF NOT EXISTS v_crop_year_state AS
SELECT
    year,
    state_name,
    crop,
    AVG(yield_kg_per_ha) AS avg_yield,
    AVG(rainfall_mm)     AS avg_rainfall,
    AVG(temperature_c)   AS avg_temperature,
    AVG(humidity_pct)    AS avg_humidity,
    AVG(ph)               AS avg_ph,
    SUM(area_ha)          AS total_area
FROM crop_data
GROUP BY year, state_name, crop;
