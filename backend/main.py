from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional
from datetime import datetime
import pandas as pd
import numpy as np
import joblib
import xgboost as xgb
import io

app = FastAPI(title="OxyGuessr API", version="1.0.0")

# Izinkan React (localhost:5173) mengakses API ini
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Load Preprocessor & Model XGBoost saat server menyala
artifact = joblib.load("preprocessor_artifact.joblib")
preprocessor = artifact["preprocessor"]
FEATURE_COLS = artifact["features"]

model = xgb.XGBRegressor()
model.load_model("xgb_model.json")


class WaterInput(BaseModel):
    date: str  # Format: YYYY-MM-DD
    salinity: float
    ph: float
    secchi_depth: Optional[float] = None
    water_depth: float
    water_temp: float
    air_temp: Optional[float] = None


def get_status(do_val: float) -> str:
    if do_val >= 6.5:
        return "Optimal"
    elif do_val >= 4.0:
        return "Waspada"
    return "Hipoksia"


@app.get("/")
def health_check():
    return {"status": "online", "model": "XGBoost + KNNImputer", "features": FEATURE_COLS}


@app.post("/predict")
def predict_single(data: WaterInput):
    try:
        dt = datetime.strptime(data.date, "%Y-%m-%d")
    except ValueError:
        raise HTTPException(status_code=400, detail="Format tanggal harus YYYY-MM-DD")

    month_sin = float(np.sin(2 * np.pi * dt.month / 12))
    month_cos = float(np.cos(2 * np.pi * dt.month / 12))

    air_val = np.nan if data.air_temp is None else data.air_temp
    secchi_val = np.nan if data.secchi_depth is None else data.secchi_depth
    temp_diff = (air_val - data.water_temp) if pd.notna(air_val) else np.nan

    row = {
        "Salinity": data.salinity,
        "pH": data.ph,
        "SecchiDepth": secchi_val,
        "WaterDepth": data.water_depth,
        "WaterTemp": data.water_temp,
        "AirTemp": air_val,
        "Year": dt.year,
        "Month_sin": month_sin,
        "Month_cos": month_cos,
        "Temp_Diff": temp_diff,
    }

    input_df = pd.DataFrame([row])[FEATURE_COLS]
    pred_do = float(model.predict(preprocessor.transform(input_df))[0])

    # Hitung kurva sensitivitas WaterTemp (5°C s.d. 35°C) untuk grafik interaktif
    temp_range = np.linspace(5.0, 35.0, 31)
    sim_rows = []
    for t in temp_range:
        t_diff = (air_val - t) if pd.notna(air_val) else np.nan
        sim_rows.append({
            "Salinity": data.salinity,
            "pH": data.ph,
            "SecchiDepth": secchi_val,
            "WaterDepth": data.water_depth,
            "WaterTemp": float(t),
            "AirTemp": air_val,
            "Year": dt.year,
            "Month_sin": month_sin,
            "Month_cos": month_cos,
            "Temp_Diff": t_diff,
        })
    sim_df = pd.DataFrame(sim_rows)[FEATURE_COLS]
    sim_preds = model.predict(preprocessor.transform(sim_df))

    sensitivity = [
        {"temp": round(float(t), 1), "do": round(float(p), 2)}
        for t, p in zip(temp_range, sim_preds)
    ]

    # Konversi NaN ke None agar aman saat dikirim sebagai JSON
    clean_features = {
        k: (None if pd.isna(v) else round(float(v), 4) if isinstance(v, float) else v)
        for k, v in row.items()
    }

    return {
        "predicted_do": round(pred_do, 2),
        "status": get_status(pred_do),
        "engineered_features": clean_features,
        "sensitivity": sensitivity,
    }


@app.post("/predict-batch")
async def predict_batch(file: UploadFile = File(...)):
    contents = await file.read()
    try:
        raw_df = pd.read_csv(io.BytesIO(contents))
    except Exception:
        raise HTTPException(status_code=400, detail="File CSV tidak valid atau rusak.")

    required_cols = {"Date", "Salinity", "pH", "SecchiDepth", "WaterDepth", "WaterTemp", "AirTemp"}
    if not required_cols.issubset(set(raw_df.columns)):
        raise HTTPException(
            status_code=400,
            detail=f"Kolom wajib tidak lengkap. Dibutuhkan: {', '.join(required_cols)}"
        )

    df_proc = raw_df.copy()
    df_proc.loc[df_proc["AirTemp"] < -17, "AirTemp"] = np.nan

    dt_series = pd.to_datetime(df_proc["Date"], errors="coerce")
    df_proc["Year"] = dt_series.dt.year.fillna(2024)
    month_series = dt_series.dt.month.fillna(6)
    df_proc["Month_sin"] = np.sin(2 * np.pi * month_series / 12)
    df_proc["Month_cos"] = np.cos(2 * np.pi * month_series / 12)
    df_proc["Temp_Diff"] = df_proc["AirTemp"] - df_proc["WaterTemp"]

    preds = model.predict(preprocessor.transform(df_proc[FEATURE_COLS]))

    result_df = raw_df.copy()
    result_df["Predicted_DO_mgL"] = np.round(preds, 2)
    result_df["Status_Perairan"] = [get_status(float(p)) for p in preds]

    # Ganti NaN menjadi None untuk response JSON
    records = result_df.replace({np.nan: None}).to_dict(orient="records")

    return {
        "summary": {
            "total": len(result_df),
            "mean_do": round(float(result_df["Predicted_DO_mgL"].mean()), 2),
            "max_do": round(float(result_df["Predicted_DO_mgL"].max()), 2),
            "hypoxia_count": int((result_df["Predicted_DO_mgL"] < 4.0).sum()),
        },
        "results": records,
    }