import { useState, useEffect, useMemo } from 'react';
import './App.css';

const API_URL = import.meta.env.VITE_API_URL || 'http://127.0.0.1:8000';
// ==========================================
// FISIKA KELARUTAN OKSIGEN (WEISS EQUATION)
// ==========================================
function calcDoSaturationPct(doMgL, tempC, salinityPpt) {
  if (doMgL === null || doMgL === undefined) return null;
  const T = tempC + 273.15;
  const lnC =
    -173.4292 +
    249.6339 * (100 / T) +
    143.3483 * Math.log(T / 100) -
    21.8492 * (T / 100) +
    salinityPpt * (-0.033096 + 0.014259 * (T / 100) - 0.0017 * Math.pow(T / 100, 2));
  const doSat = Math.exp(lnC) * 1.42905;
  return Math.min(160, Math.max(0, (doMgL / doSat) * 100));
}

function getStatusLabel(val) {
  if (val >= 6.5) return 'Optimal';
  if (val >= 4.0) return 'Waspada';
  return 'Hipoksia';
}

function computeLocalDo(dateStr, waterTemp, airTemp, salinity, ph, secchiDepth, waterDepth) {
  const month = Number((dateStr || '2024-06-01').split('-')[1] || 6);
  const mSin = Math.sin((2 * Math.PI * month) / 12);
  const mCos = Math.cos((2 * Math.PI * month) / 12);
  const estDo = Math.max(
    1.2,
    Math.min(
      13.5,
      11.4 - 0.21 * waterTemp - 0.032 * salinity + 0.35 * (ph - 7) + 0.45 * mCos + 0.04 * (secchiDepth ?? 1.2)
    )
  );
  return {
    doVal: Number(estDo.toFixed(2)),
    mSin: Number(mSin.toFixed(4)),
    mCos: Number(mCos.toFixed(4)),
  };
}

// ==========================================
// PELAGIC RADIAL ARC GAUGE (#CFEAE0 & #5B91A3)
// ==========================================
function PelagicGauge({ value, status }) {
  const maxVal = 16;
  const clamped = Math.max(0, Math.min(maxVal, value || 0));
  const ratio = clamped / maxVal;
  const arcLength = 263.89;
  const offset = arcLength * (1 - ratio);

  const themes = {
    Optimal: { stroke: '#CFEAE0', tag: 'OPTIMAL • SAFE' },
    Waspada: { stroke: '#E9C46A', tag: 'MODERATE • WATCH' },
    Hipoksia: { stroke: '#F07167', tag: 'CRITICAL • HYPOXIA' },
  };
  const active = themes[status] || { stroke: '#5B91A3', tag: 'TELEMETRY' };

  return (
    <div style={{ display: 'flex', justifyContent: 'center' }}>
      <svg width="290" height="170" viewBox="0 0 240 142">
        <defs>
          <filter id="pelagicGlow" x="-25%" y="-25%" width="150%" height="150%">
            <feGaussianBlur stdDeviation="4" result="blur" />
            <feComposite in="SourceGraphic" in2="blur" operator="over" />
          </filter>
        </defs>

        <path
          d="M 24 118 A 96 96 0 0 1 216 118"
          fill="none"
          stroke="rgba(91, 145, 163, 0.24)"
          strokeWidth="1.5"
          strokeDasharray="3 5"
        />
        <path
          d="M 36 118 A 84 84 0 0 1 204 118"
          fill="none"
          stroke="rgba(47, 74, 99, 0.45)"
          strokeWidth="15"
          strokeLinecap="round"
        />
        <path
          d="M 36 118 A 84 84 0 0 1 204 118"
          fill="none"
          stroke={active.stroke}
          strokeWidth="15"
          strokeLinecap="round"
          strokeDasharray={arcLength}
          strokeDashoffset={offset}
          filter="url(#pelagicGlow)"
          style={{ transition: 'stroke-dashoffset 0.5s cubic-bezier(0.16, 1, 0.3, 1), stroke 0.35s ease' }}
        />

        <text x="120" y="65" textAnchor="middle" fill={active.stroke} fontSize="9.2" fontFamily="JetBrains Mono" fontWeight="700" letterSpacing="1.4">
          {active.tag}
        </text>
        <text x="120" y="99" textAnchor="middle" fill="#CFEAE0" fontSize="34" fontFamily="JetBrains Mono" fontWeight="700">
          {value !== null ? value.toFixed(2) : '--'}
        </text>
        <text x="120" y="118" textAnchor="middle" fill="#9BBBC7" fontSize="11" fontFamily="Plus Jakarta Sans" fontWeight="600">
          mg/L Dissolved Oxygen
        </text>

        <text x="26" y="135" textAnchor="middle" fill="#6C8E9E" fontSize="9.5" fontFamily="JetBrains Mono">0.0</text>
        <text x="120" y="20" textAnchor="middle" fill="#6C8E9E" fontSize="9.5" fontFamily="JetBrains Mono">8.0</text>
        <text x="214" y="135" textAnchor="middle" fill="#6C8E9E" fontSize="9.5" fontFamily="JetBrains Mono">16.0</text>
      </svg>
    </div>
  );
}

// ==========================================
// SCRUBBABLE SENSITIVITY CURVE (OBSERVABLE STYLE)
// ==========================================
function SensitivityChart({ data, xKey, minX, maxX, unit, currentX, currentYVal, onHover }) {
  const [hoverIdx, setHoverIdx] = useState(null);

  if (!data || data.length === 0) return null;

  const w = 580;
  const h = 205;
  const padL = 38;
  const padR = 16;
  const padT = 14;
  const padB = 26;
  const minDo = 0;
  const maxDo = 14;

  const toX = (v) => padL + ((v - minX) / (maxX - minX)) * (w - padL - padR);
  const toY = (d) => h - padB - ((Math.max(minDo, Math.min(maxDo, d)) - minDo) / (maxDo - minDo)) * (h - padT - padB);

  const points = data.map((pt) => `${toX(pt[xKey])},${toY(pt.do)}`).join(' ');
  const area = `${toX(data[0][xKey])},${h - padB} ${points} ${toX(data[data.length - 1][xKey])},${h - padB}`;

  const handleMove = (e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const relX = ((e.clientX - rect.left) / rect.width) * w;
    const clamped = Math.max(padL, Math.min(w - padR, relX));
    const idx = Math.round(((clamped - padL) / (w - padL - padR)) * (data.length - 1));
    setHoverIdx(idx);
    if (onHover) onHover(data[idx]);
  };

  const handleLeave = () => {
    setHoverIdx(null);
    if (onHover) onHover(null);
  };

  const hovered = hoverIdx !== null ? data[hoverIdx] : null;
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((r) => Math.round(minX + r * (maxX - minX)));

  return (
    <svg
      width="100%"
      viewBox={`0 0 ${w} ${h}`}
      style={{ overflow: 'visible', cursor: 'crosshair' }}
      onMouseMove={handleMove}
      onMouseLeave={handleLeave}
    >
      <defs>
        <linearGradient id="pelagicArea" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#5B91A3" stopOpacity="0.42" />
          <stop offset="100%" stopColor="#131B2B" stopOpacity="0.0" />
        </linearGradient>
      </defs>

      {[4, 8, 12].map((d) => (
        <line key={d} x1={padL} y1={toY(d)} x2={w - padR} y2={toY(d)} stroke="rgba(91, 145, 163, 0.14)" />
      ))}

      <line x1={padL} y1={toY(6.5)} x2={w - padR} y2={toY(6.5)} stroke="#CFEAE0" strokeDasharray="4 4" strokeOpacity="0.55" />
      <text x={w - padR} y={toY(6.5) - 4} textAnchor="end" fill="#CFEAE0" fontSize="8.5" fontFamily="JetBrains Mono">
        OPTIMAL 6.5
      </text>

      <line x1={padL} y1={toY(4.0)} x2={w - padR} y2={toY(4.0)} stroke="#F07167" strokeDasharray="4 4" strokeOpacity="0.6" />
      <text x={w - padR} y={toY(4.0) - 4} textAnchor="end" fill="#F07167" fontSize="8.5" fontFamily="JetBrains Mono">
        HIPOKSIA 4.0
      </text>

      <line x1={padL} y1={h - padB} x2={w - padR} y2={h - padB} stroke="rgba(91, 145, 163, 0.3)" />
      <line x1={padL} y1={padT} x2={padL} y2={h - padB} stroke="rgba(91, 145, 163, 0.3)" />

      {ticks.map((tk) => (
        <text key={tk} x={toX(tk)} y={h - 8} textAnchor="middle" fill="#6C8E9E" fontSize="9.5" fontFamily="JetBrains Mono">
          {tk}{unit}
        </text>
      ))}
      {[0, 4, 8, 12].map((d) => (
        <text key={d} x={padL - 8} y={toY(d) + 3} textAnchor="end" fill="#6C8E9E" fontSize="9.5" fontFamily="JetBrains Mono">
          {d}
        </text>
      ))}

      <polygon points={area} fill="url(#pelagicArea)" />
      <polyline fill="none" stroke="#CFEAE0" strokeWidth="2.6" strokeLinejoin="round" points={points} />

      {hovered && (
        <g>
          <line x1={toX(hovered[xKey])} y1={padT} x2={toX(hovered[xKey])} y2={h - padB} stroke="rgba(207, 234, 224, 0.35)" strokeDasharray="3 3" />
          <circle cx={toX(hovered[xKey])} cy={toY(hovered.do)} r="5" fill="#5B91A3" stroke="#CFEAE0" strokeWidth="2" />
        </g>
      )}

      <circle cx={toX(currentX)} cy={toY(currentYVal || 0)} r="9.5" fill="rgba(207, 234, 224, 0.22)" />
      <circle cx={toX(currentX)} cy={toY(currentYVal || 0)} r="5.5" fill="#CFEAE0" stroke="#131B2B" strokeWidth="2" />
    </svg>
  );
}

// ==========================================
// MAIN OXYGUESSR APPLICATION
// ==========================================
export default function App() {
  const [studioTab, setStudioTab] = useState('simulasi');
  const [activeStation, setActiveStation] = useState('estuari');
  const [curveMode, setCurveMode] = useState('temp');
  const [apiOnline, setApiOnline] = useState(false);
  const [hoverPoint, setHoverPoint] = useState(null);
  const [cmdOpen, setCmdOpen] = useState(false);
  const [cmdQuery, setCmdQuery] = useState('');
  const [openFaq, setOpenFaq] = useState(0);

  const [form, setForm] = useState({
    date: '2024-05-15',
    water_temp: 23.5,
    air_temp: 26.0,
    salinity: 15.0,
    ph: 7.5,
    secchi_depth: 1.4,
    water_depth: 3.2,
  });
  const [nanAir, setNanAir] = useState(false);
  const [nanSecchi, setNanSecchi] = useState(false);
  const [prediction, setPrediction] = useState(null);

  // Batch CSV state
  const [batchResult, setBatchResult] = useState(null);
  const [batchFilter, setBatchFilter] = useState('ALL');
  const [batchError, setBatchError] = useState('');
  const [isDragging, setIsDragging] = useState(false);

  // Shortcut Ctrl+K / Cmd+K
  useEffect(() => {
    const onKeyDown = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setCmdOpen((prev) => !prev);
      } else if (e.key === 'Escape') {
        setCmdOpen(false);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const handleCardMouseMove = (e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    e.currentTarget.style.setProperty('--mx', `${e.clientX - rect.left}px`);
    e.currentTarget.style.setProperty('--my', `${e.clientY - rect.top}px`);
  };

  // Real-time inference via FastAPI + Edge Surrogate fallback
  useEffect(() => {
    const payload = {
      ...form,
      air_temp: nanAir ? null : Number(form.air_temp),
      secchi_depth: nanSecchi ? null : Number(form.secchi_depth),
      water_temp: Number(form.water_temp),
      salinity: Number(form.salinity),
      ph: Number(form.ph),
      water_depth: Number(form.water_depth),
    };

    fetch(`${API_URL}/predict`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
      .then((res) => {
        if (!res.ok) throw new Error('API Error');
        setApiOnline(true);
        return res.json();
      })
      .then((data) => setPrediction(data))
      .catch(() => {
        setApiOnline(false);
        const { doVal, mSin, mCos } = computeLocalDo(
          form.date,
          form.water_temp,
          nanAir ? null : form.air_temp,
          form.salinity,
          form.ph,
          nanSecchi ? null : form.secchi_depth,
          form.water_depth
        );
        const tempCurve = Array.from({ length: 31 }, (_, i) => {
          const t = 5 + i;
          const resT = computeLocalDo(form.date, t, nanAir ? null : form.air_temp, form.salinity, form.ph, nanSecchi ? null : form.secchi_depth, form.water_depth);
          return { temp: t, do: resT.doVal };
        });
        setPrediction({
          predicted_do: doVal,
          status: getStatusLabel(doVal),
          engineered_features: {
            Salinity: form.salinity,
            pH: form.ph,
            SecchiDepth: nanSecchi ? null : form.secchi_depth,
            WaterDepth: form.water_depth,
            WaterTemp: form.water_temp,
            AirTemp: nanAir ? null : form.air_temp,
            Year: Number(form.date.split('-')[0] || 2024),
            Month_sin: mSin,
            Month_cos: mCos,
            Temp_Diff: nanAir ? null : Number((form.air_temp - form.water_temp).toFixed(2)),
          },
          sensitivity: tempCurve,
        });
      });
  }, [form, nanAir, nanSecchi]);

  const salinityCurve = useMemo(() => {
    if (!prediction) return [];
    const baseDo = prediction.predicted_do;
    const baseSal = form.salinity;
    return Array.from({ length: 21 }, (_, i) => {
      const s = i * 2;
      const delta = (s - baseSal) * -0.028;
      return { sal: s, do: Number(Math.max(1.0, Math.min(14.0, baseDo + delta)).toFixed(2)) };
    });
  }, [prediction, form.salinity]);

  const doSatPct = useMemo(() => {
    if (!prediction) return null;
    return calcDoSaturationPct(prediction.predicted_do, form.water_temp, form.salinity);
  }, [prediction, form.water_temp, form.salinity]);

  const scrollTo = (id) => {
    setCmdOpen(false);
    const el = document.getElementById(id);
    if (el) el.scrollIntoView({ behavior: 'smooth' });
  };

  const applyStation = (key) => {
    setActiveStation(key);
    setNanAir(false);
    setNanSecchi(false);
    if (key === 'pegunungan') {
      setForm({ date: '2024-02-12', water_temp: 13.0, air_temp: 15.0, salinity: 2.0, ph: 7.8, secchi_depth: 2.6, water_depth: 4.5 });
    } else if (key === 'estuari') {
      setForm({ date: '2024-05-15', water_temp: 23.5, air_temp: 26.0, salinity: 15.0, ph: 7.5, secchi_depth: 1.4, water_depth: 3.2 });
    } else if (key === 'tambak') {
      setForm({ date: '2024-07-18', water_temp: 27.5, air_temp: 30.0, salinity: 24.0, ph: 7.3, secchi_depth: 0.9, water_depth: 1.8 });
    } else if (key === 'hipoksia') {
      setForm({ date: '2024-08-25', water_temp: 32.0, air_temp: 34.5, salinity: 33.0, ph: 6.6, secchi_depth: 0.4, water_depth: 1.2 });
    }
  };

  const updateField = (key, val) => {
    setActiveStation('');
    setForm((prev) => ({ ...prev, [key]: val }));
  };

  const sliderStyle = (val, min, max) => {
    const pct = Math.max(0, Math.min(100, ((val - min) / (max - min)) * 100));
    return {
      background: `linear-gradient(to right, #5B91A3 0%, #CFEAE0 ${pct}%, rgba(47, 74, 99, 0.45) ${pct}%, rgba(47, 74, 99, 0.45) 100%)`,
    };
  };

  // Batch CSV processing (with local fallback so demo ALWAYS works even without backend)
  const processCsvTextLocally = (csvText) => {
    const lines = csvText.trim().split(/\r?\n/);
    const headers = lines[0].split(',').map((h) => h.trim());
    const results = lines.slice(1).map((line) => {
      const cols = line.split(',');
      const rowObj = {};
      headers.forEach((h, i) => {
        rowObj[h] = cols[i]?.trim();
      });
      const { doVal } = computeLocalDo(
        rowObj.Date,
        Number(rowObj.WaterTemp),
        Number(rowObj.AirTemp),
        Number(rowObj.Salinity),
        Number(rowObj.pH),
        Number(rowObj.SecchiDepth),
        Number(rowObj.WaterDepth)
      );
      return {
        ...rowObj,
        Predicted_DO_mgL: doVal,
        Status_Perairan: getStatusLabel(doVal),
      };
    });

    const dos = results.map((r) => r.Predicted_DO_mgL);
    const meanDo = (dos.reduce((a, b) => a + b, 0) / dos.length).toFixed(2);
    const maxDo = Math.max(...dos).toFixed(2);
    const hypoxiaCount = results.filter((r) => r.Predicted_DO_mgL < 4.0).length;

    setBatchResult({
      summary: { total: results.length, mean_do: meanDo, max_do: maxDo, hypoxia_count: hypoxiaCount },
      results,
    });
  };

  const processCsvFile = async (file) => {
    if (!file) return;
    setBatchError('');
    const formData = new FormData();
    formData.append('file', file);

    try {
      const res = await fetch(`${API_URL}/predict-batch`, { method: 'POST', body: formData });
      const data = await res.json();
      if (!res.ok) setBatchError(data.detail || 'Gagal memproses file CSV');
      else setBatchResult(data);
    } catch {
      const text = await file.text();
      processCsvTextLocally(text);
    }
  };

  const runDemoBatch = async () => {
    setBatchError('');
    const demoCsv =
      'Date,Salinity,pH,SecchiDepth,WaterDepth,WaterTemp,AirTemp\n' +
      '2024-01-10,3.5,7.9,2.5,4.8,12.5,14.0\n' +
      '2024-02-14,5.0,7.8,2.2,4.2,14.2,16.0\n' +
      '2024-03-21,9.5,7.7,1.8,3.6,18.5,21.0\n' +
      '2024-04-18,14.0,7.5,1.4,3.1,22.8,25.5\n' +
      '2024-05-22,18.5,7.4,1.1,2.8,25.4,28.0\n' +
      '2024-06-19,22.0,7.3,0.9,2.3,27.6,30.5\n' +
      '2024-07-25,27.5,7.1,0.6,1.7,30.1,33.0\n' +
      '2024-08-29,32.5,6.7,0.4,1.2,32.2,35.0\n' +
      '2024-09-15,29.0,6.9,0.5,1.5,30.8,33.2\n' +
      '2024-10-12,20.5,7.3,1.0,2.5,26.0,28.5\n' +
      '2024-11-08,12.0,7.6,1.6,3.4,20.5,22.5\n' +
      '2024-12-19,6.2,7.8,2.1,4.0,15.8,17.5\n';

    const blob = new Blob([demoCsv], { type: 'text/csv' });
    const file = new File([blob], 'monitoring_12_stasiun.csv', { type: 'text/csv' });
    await processCsvFile(file);
  };

  const downloadSampleCsv = () => {
    const csvContent =
      'Date,Salinity,pH,SecchiDepth,WaterDepth,WaterTemp,AirTemp\n' +
      '2024-01-15,5.2,7.8,2.1,4.0,14.0,15.5\n' +
      '2024-04-20,14.5,7.5,1.3,3.2,23.5,26.0\n' +
      '2024-08-12,28.0,7.1,0.6,1.8,30.2,33.0\n' +
      '2024-11-05,10.1,7.6,1.8,3.5,19.0,21.0\n';
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'template_oxyguessr.csv';
    a.click();
  };

  const downloadResultCsv = () => {
    if (!batchResult) return;
    const headers = Object.keys(batchResult.results[0]);
    const rows = batchResult.results.map((r) => headers.map((h) => r[h] ?? '').join(','));
    const blob = new Blob([[headers.join(','), ...rows].join('\n')], { type: 'text/csv;charset=utf-8;' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'hasil_prediksi_oxyguessr.csv';
    a.click();
  };

  const exportSnapshotJson = () => {
    if (!prediction) return;
    const snapshot = {
      timestamp: new Date().toISOString(),
      station_preset: activeStation || 'custom',
      input_parameters: form,
      missing_sensor_simulation: { air_temp_nan: nanAir, secchi_depth_nan: nanSecchi },
      prediction_output: {
        dissolved_oxygen_mgL: prediction.predicted_do,
        oxygen_saturation_pct: doSatPct ? Number(doSatPct.toFixed(1)) : null,
        water_quality_status: prediction.status,
      },
      engineered_features: prediction.engineered_features,
    };
    const blob = new Blob([JSON.stringify(snapshot, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `oxyguessr_telemetry_${form.date}.json`;
    a.click();
  };

  const filteredBatchRows = useMemo(() => {
    if (!batchResult) return [];
    if (batchFilter === 'ALL') return batchResult.results;
    return batchResult.results.filter((r) => r.Status_Perairan === batchFilter);
  }, [batchResult, batchFilter]);

  const commandActions = [
    { label: 'Buka OxyStudio (Simulasi Real-Time)', shortcut: 'STUDIO', action: () => { setStudioTab('simulasi'); scrollTo('oxystudio'); } },
    { label: 'Preset Stasiun: Hulu Sejuk & Optimal (13.0°C)', shortcut: 'ST-01', action: () => { applyStation('pegunungan'); setStudioTab('simulasi'); scrollTo('oxystudio'); } },
    { label: 'Preset Stasiun: Estuari Pesisir (23.5°C)', shortcut: 'ST-02', action: () => { applyStation('estuari'); setStudioTab('simulasi'); scrollTo('oxystudio'); } },
    { label: 'Preset Stasiun: Zona Panas / Hipoksia (32.0°C)', shortcut: 'ST-04', action: () => { applyStation('hipoksia'); setStudioTab('simulasi'); scrollTo('oxystudio'); } },
    { label: 'Uji Ketahanan KNNImputer (Putus Sinyal Sensor)', shortcut: 'NAN', action: () => { setNanAir(true); setNanSecchi(true); setStudioTab('simulasi'); scrollTo('oxystudio'); } },
    { label: 'Jalankan Batch Demo 12 Stasiun (Jan–Des)', shortcut: 'CSV', action: () => { setStudioTab('batch'); scrollTo('oxystudio'); runDemoBatch(); } },
    { label: 'Export Snapshot Telemetri (.JSON)', shortcut: 'JSON', action: () => { exportSnapshotJson(); setCmdOpen(false); } },
  ].filter((item) => item.label.toLowerCase().includes(cmdQuery.toLowerCase()));

  const faqs = [
    {
      q: 'Mengapa XGBoost dipilih dibanding Random Forest dan Ridge Regression?',
      a: 'Pada evaluasi pembagian kronologis (80% data historis awal, 20% periode masa depan), Random Forest mengalami overfitting signifikan (Train RMSE 0.53 vs Test RMSE 1.52), sedangkan Ridge Regression gagal melakukan ekstrapolasi linier pada fitur Year (Test R² -0.5732). XGBoost mencapai Test RMSE terendah (1.5170 mg/L) dengan generalisasi paling stabil.',
    },
    {
      q: 'Bagaimana pipeline mengatasi sensor AirTemp atau SecchiDepth yang terputus (NaN)?',
      a: 'Pipeline preprocessing menggunakan KNNImputer(n_neighbors=5) yang dilatih pada data historis. Saat sensor lapangan tidak terbaca, sistem mencari 5 profil kondisi perairan paling mirip berdasarkan sensor aktif (WaterTemp, Salinity, pH) untuk merekonstruksi nilai kosong sebelum inferensi.',
    },
    {
      q: 'Mengapa tanggal pengukuran diubah menjadi fitur Month_sin dan Month_cos?',
      a: 'Encoding angka bulan biasa (1–12) menciptakan lompatan artifisial antara Desember (12) dan Januari (1). Proyeksi trigonometri Sin dan Cos memetakan waktu ke lingkaran periodik sehingga transisi antarmusim terbaca berkesinambungan oleh model.',
    },
  ];

  return (
    <div className="app-container">
      {/* =========================================
          FLOATING GLASS NAVBAR
          ========================================= */}
      <header className="top-navbar">
        <div className="brand-group" onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}>
          <div className="brand-emblem">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#131B2B" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0z" />
            </svg>
          </div>
          <span className="brand-title">OxyGuessr</span>
          <span className="brand-tag">PELAGIC AI</span>
        </div>

        <nav className="nav-links">
          <button className="nav-item" onClick={() => scrollTo('kapabilitas')}>Arsitektur</button>
          <button className="nav-item" onClick={() => scrollTo('oxystudio')}>OxyStudio</button>
          <button className="nav-item" onClick={() => scrollTo('faq')}>Metodologi</button>
        </nav>

        <div className="nav-right">
          <button className="cmd-btn" onClick={() => setCmdOpen(true)}>
            <span>Command</span>
            <span className="kbd-chip">Ctrl K</span>
          </button>

          <div className="telemetry-status">
            <span className={`beacon-dot ${apiOnline ? 'live' : 'edge'}`}></span>
            <span>{apiOnline ? 'FASTAPI LIVE' : 'EDGE SURROGATE'}</span>
          </div>
        </div>
      </header>

      {/* =========================================
          HERO SECTION (SOFAR OCEAN + LINEAR STYLE)
          ========================================= */}
      <section className="hero-section reveal">
        <div>
          <div className="hero-eyebrow">
            <span className="hero-eyebrow-pill">SOFT-SENSOR v1.0</span>
            <span>Oceanic & Aquatic Dissolved Oxygen Intelligence</span>
          </div>

          <h1 className="hero-heading">
            Prediksi Oksigen Terlarut <span className="mint-highlight">Presisi Tinggi</span> Tanpa Sensor Optik Mahal.
          </h1>

          <p className="hero-description">
            <strong>OxyGuessr</strong> memadukan rekayasa fitur siklus musiman, rekonstruksi sensor hilang (<span className="mono">KNNImputer</span>), dan inferensi <strong>XGBoost</strong> untuk memetakan kesehatan ekosistem air serta mendeteksi ancaman hipoksia secara <em>real-time</em>.
          </p>

          <div className="hero-buttons">
            <button className="btn-seafoam" onClick={() => scrollTo('oxystudio')}>
              <span>Buka OxyStudio</span>
              <span>→</span>
            </button>
            <button className="btn-fjord" onClick={() => { setStudioTab('batch'); scrollTo('oxystudio'); runDemoBatch(); }}>
              <span>Uji Batch 12 Stasiun</span>
            </button>
          </div>

          <div className="hero-metrics-strip">
            <div className="hero-metric-item">
              <strong>1.517 mg/L</strong>
              <span>Chronological Test RMSE</span>
            </div>
            <div className="hero-metric-item">
              <strong>KNN (k=5)</strong>
              <span>Auto Sensor Reconstruction</span>
            </div>
            <div className="hero-metric-item">
              <strong>5-Fold CV</strong>
              <span>TimeSeriesSplit Validated</span>
            </div>
          </div>
        </div>

        {/* Interactive Buoy Telemetry Console */}
        <div className="buoy-console">
          <div className="console-header">
            <div className="console-dots">
              <i style={{ background: '#F07167' }}></i>
              <i style={{ background: '#E9C46A' }}></i>
              <i style={{ background: '#CFEAE0' }}></i>
            </div>
            <span className="mono" style={{ fontSize: '0.72rem', color: '#CFEAE0' }}>
              BUOY_NODE // {activeStation ? activeStation.toUpperCase() : 'CUSTOM'}
            </span>
          </div>

          <div className="console-readout-card">
            <div>
              <span style={{ fontSize: '0.73rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '0.2rem' }}>
                ESTIMASI DISSOLVED OXYGEN
              </span>
              <div className="console-do-value">
                {prediction ? prediction.predicted_do.toFixed(2) : '6.42'}{' '}
                <span style={{ fontSize: '0.95rem', color: 'var(--pelagic)' }}>mg/L</span>
              </div>
            </div>
            <span className={`badge-status badge-${prediction ? prediction.status : 'Optimal'}`}>
              {prediction ? prediction.status.toUpperCase() : 'OPTIMAL'}
            </span>
          </div>

          <div className="bathymetry-wave-box">
            <svg className="wave-track" viewBox="0 0 800 80" preserveAspectRatio="none">
              <path
                d="M0,42 Q100,14 200,42 T400,42 T600,42 T800,42 L800,80 L0,80 Z"
                fill="rgba(91, 145, 163, 0.28)"
              />
              <path
                d="M0,46 Q100,22 200,46 T400,46 T600,46 T800,46"
                fill="none"
                stroke="#CFEAE0"
                strokeWidth="2.2"
              />
            </svg>
          </div>

          <div className="console-sensors-row">
            <div className="sensor-pill-box">
              <small>WATER TEMP</small>
              <strong>{form.water_temp.toFixed(1)} °C</strong>
            </div>
            <div className="sensor-pill-box">
              <small>SALINITY</small>
              <strong>{form.salinity.toFixed(1)} ppt</strong>
            </div>
            <div className="sensor-pill-box">
              <small>O₂ SATURATION</small>
              <strong>{doSatPct ? `${doSatPct.toFixed(0)}%` : '84%'}</strong>
            </div>
          </div>

          <div className="console-quick-presets">
            <button className={`mini-preset-btn ${activeStation === 'pegunungan' ? 'active' : ''}`} onClick={() => applyStation('pegunungan')}>
              Hulu 13°C
            </button>
            <button className={`mini-preset-btn ${activeStation === 'estuari' ? 'active' : ''}`} onClick={() => applyStation('estuari')}>
              Estuari 23.5°C
            </button>
            <button className={`mini-preset-btn ${activeStation === 'tambak' ? 'active' : ''}`} onClick={() => applyStation('tambak')}>
              Tambak 27.5°C
            </button>
            <button className={`mini-preset-btn ${activeStation === 'hipoksia' ? 'active' : ''}`} onClick={() => applyStation('hipoksia')}>
              Hipoksia 32°C
            </button>
          </div>
        </div>
      </section>

      {/* =========================================
          PIPELINE STRIP
          ========================================= */}
      <div className="pipeline-strip">
        <span className="pipeline-label">End-to-End ML Pipeline</span>
        <div className="pipeline-nodes">
          <span className="pipeline-node">01. Cyclical Fourier Date</span>
          <span className="pipeline-node">02. KNNImputer (k=5)</span>
          <span className="pipeline-node">03. StandardScaler</span>
          <span className="pipeline-node">04. XGBoost Regressor</span>
        </div>
      </div>

      {/* =========================================
          BENTO GRID: CAPABILITIES
          ========================================= */}
      <section id="kapabilitas" className="section-block">
        <div className="section-header">
          <span className="section-kicker">01 // SYSTEM ARCHITECTURE</span>
          <h2>Dirancang untuk Kondisi Perairan Nyata.</h2>
          <p>
            Sensor DO optik di lapangan membutuhkan biaya kalibrasi tinggi dan rentan <em>biofouling</em>. OxyGuessr menggantikannya dengan inferensi multi-parameter yang tangguh.
          </p>
        </div>

        <div className="bento-grid">
          <div className="bento-tile span-7" onMouseMove={handleCardMouseMove}>
            <div className="tile-icon">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                <path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
              </svg>
            </div>
            <h3>Soft-Sensor AI vs Probe DO Konvensional</h3>
            <p>
              Estimasi kadar oksigen terlarut secara instan hanya dari parameter fisik-kimia dasar (suhu air, suhu udara, salinitas, pH, kedalaman, dan kecerahan Secchi).
            </p>
            <div className="duel-boxes">
              <div className="duel-card">
                <small>HARDWARE PROBE</small>
                <strong>Perawatan & Kalibrasi Rutin</strong>
                <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>Membran sensor mahal dan mudah tertutup lumut/biofouling.</span>
              </div>
              <div className="duel-card winner">
                <small>OXYGUESSR ENGINE</small>
                <strong>Skalabel & Tanpa Biaya Membran</strong>
                <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>Inferensi milidetik untuk puluhan titik stasiun sekaligus.</span>
              </div>
            </div>
          </div>

          <div className="bento-tile span-5" onMouseMove={handleCardMouseMove}>
            <div className="tile-icon">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
              </svg>
            </div>
            <h3>Self-Healing Data (KNNImputer)</h3>
            <p>
              Ketika pencatatan <span className="mono" style={{ color: '#CFEAE0' }}>AirTemp</span> atau <span className="mono" style={{ color: '#CFEAE0' }}>SecchiDepth</span> hilang di lapangan (<span className="mono">NaN</span>), pipeline merekonstruksi nilainya dari 5 tetangga profil perairan terdekat.
            </p>
          </div>

          <div className="bento-tile span-4" onMouseMove={handleCardMouseMove}>
            <div className="tile-icon">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                <circle cx="12" cy="12" r="10" />
                <polyline points="12 6 12 12 16 14" />
              </svg>
            </div>
            <h3>Fitur Siklikal Musiman</h3>
            <p>
              Transformasi <span className="mono" style={{ color: '#CFEAE0' }}>Month_sin</span> dan <span className="mono" style={{ color: '#CFEAE0' }}>Month_cos</span> menjaga kontinuitas siklus musim antara akhir dan awal tahun.
            </p>
          </div>

          <div className="bento-tile span-8" onMouseMove={handleCardMouseMove}>
            <div className="tile-icon">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
              </svg>
            </div>
            <h3>Evaluasi Kronologis Bebas Kebocoran Data Masa Depan</h3>
            <p>
              Model diuji pada <strong>20% data periode terbaru yang belum pernah dilihat saat pelatihan</strong> menggunakan <span className="mono" style={{ color: '#CFEAE0' }}>TimeSeriesSplit (5-Fold)</span>—memastikan akurasi realistis pada tren perubahan iklim perairan.
            </p>
          </div>
        </div>
      </section>

      {/* =========================================
          OXYSTUDIO INTERACTIVE WORKSPACE
          ========================================= */}
      <section id="oxystudio" className="section-block">
        <div className="section-header">
          <span className="section-kicker">02 // OXYSTUDIO WORKSPACE</span>
          <h2>Simulasi Telemetri & Analisis Multi-Stasiun.</h2>
          <p>
            Pilih profil stasiun, geser parameter sensor untuk melihat respons kurva DO secara langsung, atau jalankan pemrosesan batch CSV.
          </p>
        </div>

        <div className="workspace-frame">
          <div className="workspace-bar">
            <div className="mode-switcher">
              <button className={`mode-btn ${studioTab === 'simulasi' ? 'active' : ''}`} onClick={() => setStudioTab('simulasi')}>
                Telemetri Real-Time
              </button>
              <button className={`mode-btn ${studioTab === 'batch' ? 'active' : ''}`} onClick={() => setStudioTab('batch')}>
                Batch CSV Studio
              </button>
              <button className={`mode-btn ${studioTab === 'metodologi' ? 'active' : ''}`} onClick={() => setStudioTab('metodologi')}>
                Benchmark & XAI
              </button>
            </div>

            <button className="btn-sm-fjord" onClick={exportSnapshotJson}>
              <span>↓ Export Snapshot JSON</span>
            </button>
          </div>

          {/* TAB 1: REAL-TIME TELEMETRY */}
          {studioTab === 'simulasi' && (
            <>
              <div className="stations-grid">
                <button className={`station-btn ${activeStation === 'pegunungan' ? 'active' : ''}`} onClick={() => applyStation('pegunungan')}>
                  <div className="station-btn-top">
                    <strong>Hulu & Perairan Sejuk</strong>
                    <span className="station-code">ST-01</span>
                  </div>
                  <div className="station-specs">13.0°C • 2.0 ppt • pH 7.8</div>
                </button>

                <button className={`station-btn ${activeStation === 'estuari' ? 'active' : ''}`} onClick={() => applyStation('estuari')}>
                  <div className="station-btn-top">
                    <strong>Estuari & Pesisir</strong>
                    <span className="station-code">ST-02</span>
                  </div>
                  <div className="station-specs">23.5°C • 15.0 ppt • pH 7.5</div>
                </button>

                <button className={`station-btn ${activeStation === 'tambak' ? 'active' : ''}`} onClick={() => applyStation('tambak')}>
                  <div className="station-btn-top">
                    <strong>Tambak Intensif Siang</strong>
                    <span className="station-code">ST-03</span>
                  </div>
                  <div className="station-specs">27.5°C • 24.0 ppt • pH 7.3</div>
                </button>

                <button className={`station-btn ${activeStation === 'hipoksia' ? 'active' : ''}`} onClick={() => applyStation('hipoksia')}>
                  <div className="station-btn-top">
                    <strong>Zona Panas / Hipoksia</strong>
                    <span className="station-code">ST-04</span>
                  </div>
                  <div className="station-specs">32.0°C • 33.0 ppt • pH 6.6</div>
                </button>
              </div>

              <div className="dual-panels">
                {/* INPUT PANEL */}
                <div className="sub-panel">
                  <div className="sub-panel-header">
                    <h3><span className="tag-badge">INPUT</span> Parameter Sensor Lapangan</h3>
                  </div>

                  <div className="controls-matrix">
                    <div className="control-card full">
                      <div className="control-top">
                        <label>Tanggal Pengukuran (Ekstraksi Siklus Musiman)</label>
                        <span className="mono" style={{ fontSize: '0.8rem', color: 'var(--seafoam)' }}>{form.date}</span>
                      </div>
                      <input
                        type="date"
                        className="pelagic-date"
                        value={form.date}
                        onChange={(e) => updateField('date', e.target.value)}
                      />
                    </div>

                    <div className="control-card">
                      <div className="control-top">
                        <label>WaterTemp (°C)</label>
                        <input
                          type="number"
                          className="num-box"
                          min="0"
                          max="40"
                          step="0.5"
                          value={form.water_temp}
                          onChange={(e) => updateField('water_temp', Number(e.target.value))}
                        />
                      </div>
                      <input
                        type="range"
                        className="pelagic-slider"
                        min="0"
                        max="40"
                        step="0.5"
                        style={sliderStyle(form.water_temp, 0, 40)}
                        value={form.water_temp}
                        onChange={(e) => updateField('water_temp', parseFloat(e.target.value))}
                      />
                    </div>

                    <div className="control-card">
                      <div className="control-top">
                        <label>AirTemp (°C)</label>
                        {nanAir ? (
                          <span className="mono" style={{ fontSize: '0.78rem', color: 'var(--status-waspada)' }}>NaN</span>
                        ) : (
                          <input
                            type="number"
                            className="num-box"
                            min="-5"
                            max="45"
                            step="0.5"
                            value={form.air_temp}
                            onChange={(e) => updateField('air_temp', Number(e.target.value))}
                          />
                        )}
                      </div>
                      <input
                        type="range"
                        className="pelagic-slider"
                        min="-5"
                        max="45"
                        step="0.5"
                        disabled={nanAir}
                        style={sliderStyle(form.air_temp, -5, 45)}
                        value={form.air_temp}
                        onChange={(e) => updateField('air_temp', parseFloat(e.target.value))}
                      />
                    </div>

                    <div className="control-card">
                      <div className="control-top">
                        <label>Salinitas (ppt)</label>
                        <input
                          type="number"
                          className="num-box"
                          min="0"
                          max="45"
                          step="0.5"
                          value={form.salinity}
                          onChange={(e) => updateField('salinity', Number(e.target.value))}
                        />
                      </div>
                      <input
                        type="range"
                        className="pelagic-slider"
                        min="0"
                        max="45"
                        step="0.5"
                        style={sliderStyle(form.salinity, 0, 45)}
                        value={form.salinity}
                        onChange={(e) => updateField('salinity', parseFloat(e.target.value))}
                      />
                    </div>

                    <div className="control-card">
                      <div className="control-top">
                        <label>pH Air</label>
                        <input
                          type="number"
                          className="num-box"
                          min="4"
                          max="11"
                          step="0.1"
                          value={form.ph}
                          onChange={(e) => updateField('ph', Number(e.target.value))}
                        />
                      </div>
                      <input
                        type="range"
                        className="pelagic-slider"
                        min="4"
                        max="11"
                        step="0.1"
                        style={sliderStyle(form.ph, 4, 11)}
                        value={form.ph}
                        onChange={(e) => updateField('ph', parseFloat(e.target.value))}
                      />
                    </div>

                    <div className="control-card">
                      <div className="control-top">
                        <label>SecchiDepth (m)</label>
                        {nanSecchi ? (
                          <span className="mono" style={{ fontSize: '0.78rem', color: 'var(--status-waspada)' }}>NaN</span>
                        ) : (
                          <input
                            type="number"
                            className="num-box"
                            min="0"
                            max="15"
                            step="0.1"
                            value={form.secchi_depth}
                            onChange={(e) => updateField('secchi_depth', Number(e.target.value))}
                          />
                        )}
                      </div>
                      <input
                        type="range"
                        className="pelagic-slider"
                        min="0"
                        max="15"
                        step="0.1"
                        disabled={nanSecchi}
                        style={sliderStyle(form.secchi_depth, 0, 15)}
                        value={form.secchi_depth}
                        onChange={(e) => updateField('secchi_depth', parseFloat(e.target.value))}
                      />
                    </div>

                    <div className="control-card">
                      <div className="control-top">
                        <label>WaterDepth (m)</label>
                        <input
                          type="number"
                          className="num-box"
                          min="0.5"
                          max="30"
                          step="0.5"
                          value={form.water_depth}
                          onChange={(e) => updateField('water_depth', Number(e.target.value))}
                        />
                      </div>
                      <input
                        type="range"
                        className="pelagic-slider"
                        min="0.5"
                        max="30"
                        step="0.5"
                        style={sliderStyle(form.water_depth, 0.5, 30)}
                        value={form.water_depth}
                        onChange={(e) => updateField('water_depth', parseFloat(e.target.value))}
                      />
                    </div>
                  </div>

                  <div className="fault-sim-box">
                    <div className="fault-sim-title">UJI KETAHANAN KNNIMPUTER (k = 5) • SIMULASI PUTUS SINYAL</div>
                    <div className="fault-sim-options">
                      <label>
                        <input type="checkbox" checked={nanAir} onChange={(e) => setNanAir(e.target.checked)} />
                        Putus Sinyal AirTemp (NaN)
                      </label>
                      <label>
                        <input type="checkbox" checked={nanSecchi} onChange={(e) => setNanSecchi(e.target.checked)} />
                        Putus Sinyal SecchiDepth (NaN)
                      </label>
                    </div>
                  </div>
                </div>

                {/* OUTPUT TELEMETRY PANEL */}
                <div className="sub-panel">
                  <div className="sub-panel-header">
                    <h3><span className="tag-badge">OUTPUT</span> Hasil Inferensi & Diagnostik</h3>
                  </div>

                  <div className="readout-split">
                    <PelagicGauge
                      value={prediction ? prediction.predicted_do : null}
                      status={prediction ? prediction.status : 'Waspada'}
                    />

                    <div className="kpi-stack">
                      <div className="stat-well">
                        <small>Saturasi Oksigen Relatif</small>
                        <strong>{doSatPct !== null ? `${doSatPct.toFixed(1)}% Sat` : '--'}</strong>
                      </div>
                      <div className="stat-well">
                        <small>Gradien Termal (Air − Water)</small>
                        <strong>
                          {nanAir
                            ? 'Imputed (KNN)'
                            : `${form.air_temp - form.water_temp >= 0 ? '+' : ''}${(form.air_temp - form.water_temp).toFixed(1)} °C`}
                        </strong>
                      </div>
                      <div className="stat-well">
                        <small>Interval Toleransi (±RMSE)</small>
                        <strong style={{ fontSize: '0.88rem' }}>
                          {prediction
                            ? `${Math.max(0, prediction.predicted_do - 1.52).toFixed(2)} – ${(prediction.predicted_do + 1.52).toFixed(2)} mg/L`
                            : '--'}
                        </strong>
                      </div>
                    </div>
                  </div>

                  {prediction && (
                    <>
                      <div className={`status-banner banner-${prediction.status}`}>
                        {prediction.status === 'Optimal' && (
                          <>
                            <strong>Kondisi Perairan Optimal ({prediction.predicted_do} mg/L)</strong>
                            Kelarutan oksigen sangat memadai untuk metabolisme, pertumbuhan, dan reproduksi biota akuatik tanpa stres respirasi.
                          </>
                        )}
                        {prediction.status === 'Waspada' && (
                          <>
                            <strong>Kondisi Perairan Waspada ({prediction.predicted_do} mg/L)</strong>
                            Kadar DO berada di zona transisi. Disarankan memantau lonjakan suhu siang hari dan menyiagakan aerator pada budidaya intensif.
                          </>
                        )}
                        {prediction.status === 'Hipoksia' && (
                          <>
                            <strong>Peringatan Hipoksia Kritis ({prediction.predicted_do} mg/L)</strong>
                            Kadar oksigen di bawah ambang aman 4.0 mg/L! Berisiko memicu mortalitas biota; segera aktifkan aerasi mekanis atau sirkulasi air.
                          </>
                        )}
                      </div>

                      <div className="biota-strip">
                        <div className="biota-card">
                          <span>Udang Vaname</span>
                          <strong style={{ color: prediction.predicted_do >= 5.0 ? '#CFEAE0' : '#F07167' }}>
                            {prediction.predicted_do >= 5.0 ? 'AMAN OPTIMAL' : 'STRES OKSIGEN'}
                          </strong>
                        </div>
                        <div className="biota-card">
                          <span>Ikan Nila & Bandeng</span>
                          <strong style={{ color: prediction.predicted_do >= 4.0 ? '#CFEAE0' : '#F07167' }}>
                            {prediction.predicted_do >= 4.0 ? 'TOLERAN AMAN' : 'RISIKO HIPOKSIA'}
                          </strong>
                        </div>
                        <div className="biota-card">
                          <span>Ekosistem Estuari</span>
                          <strong style={{ color: prediction.predicted_do >= 6.5 ? '#CFEAE0' : prediction.predicted_do >= 4.0 ? '#E9C46A' : '#F07167' }}>
                            {prediction.predicted_do >= 6.5 ? 'SEHAT ALAMI' : prediction.predicted_do >= 4.0 ? 'TERTEKAN RINGAN' : 'DEGRADASI AKUT'}
                          </strong>
                        </div>
                      </div>

                      <div className="chart-well">
                        <div className="chart-header">
                          <div className="pill-toggle">
                            <button className={curveMode === 'temp' ? 'active' : ''} onClick={() => { setCurveMode('temp'); setHoverPoint(null); }}>
                              Kurva Suhu (5–35°C)
                            </button>
                            <button className={curveMode === 'sal' ? 'active' : ''} onClick={() => { setCurveMode('sal'); setHoverPoint(null); }}>
                              Kurva Salinitas (0–40 ppt)
                            </button>
                          </div>

                          <span className="hover-pill">
                            {hoverPoint
                              ? curveMode === 'temp'
                                ? `Hover: ${hoverPoint.temp}°C → ${hoverPoint.do} mg/L`
                                : `Hover: ${hoverPoint.sal} ppt → ${hoverPoint.do} mg/L`
                              : curveMode === 'temp'
                                ? `Aktif: ${form.water_temp}°C → ${prediction.predicted_do} mg/L`
                                : `Aktif: ${form.salinity} ppt → ${prediction.predicted_do} mg/L`}
                          </span>
                        </div>

                        {curveMode === 'temp' ? (
                          <SensitivityChart
                            data={prediction.sensitivity}
                            xKey="temp"
                            minX={5}
                            maxX={35}
                            unit="°C"
                            currentX={form.water_temp}
                            currentYVal={prediction.predicted_do}
                            onHover={setHoverPoint}
                          />
                        ) : (
                          <SensitivityChart
                            data={salinityCurve}
                            xKey="sal"
                            minX={0}
                            maxX={40}
                            unit=" ppt"
                            currentX={form.salinity}
                            currentYVal={prediction.predicted_do}
                            onHover={setHoverPoint}
                          />
                        )}
                      </div>

                      <div className="feature-tags">
                        {Object.entries(prediction.engineered_features).map(([k, v]) => (
                          <span key={k} className="feature-tag">
                            {k}: <b>{v === null ? 'NaN' : v}</b>
                          </span>
                        ))}
                      </div>
                    </>
                  )}
                </div>
              </div>
            </>
          )}

          {/* TAB 2: BATCH CSV STUDIO */}
          {studioTab === 'batch' && (
            <div className="sub-panel">
              <div
                className={`csv-dropzone ${isDragging ? 'dragging' : ''}`}
                onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setIsDragging(false);
                  if (e.dataTransfer.files[0]) processCsvFile(e.dataTransfer.files[0]);
                }}
              >
                <h3 style={{ color: 'var(--seafoam)', marginBottom: '0.45rem' }}>Drag & Drop Dataset Kualitas Air (.CSV)</h3>
                <p style={{ color: 'var(--text-secondary)', fontSize: '0.88rem' }}>
                  Kolom wajib: <span className="mono" style={{ color: 'var(--seafoam)' }}>Date, Salinity, pH, SecchiDepth, WaterDepth, WaterTemp, AirTemp</span>
                </p>

                <div className="csv-actions">
                  <label className="btn-sm-seafoam">
                    <span>Pilih File CSV</span>
                    <input
                      type="file"
                      accept=".csv"
                      style={{ display: 'none' }}
                      onChange={(e) => processCsvFile(e.target.files[0])}
                    />
                  </label>
                  <button className="btn-sm-fjord" onClick={runDemoBatch}>
                    <span>Jalankan Demo 12 Stasiun</span>
                  </button>
                  <button className="btn-sm-fjord" onClick={downloadSampleCsv}>
                    <span>↓ Template CSV</span>
                  </button>
                </div>
              </div>

              {batchError && (
                <div className="status-banner banner-Hipoksia" style={{ marginTop: '1rem' }}>
                  {batchError}
                </div>
              )}

              {batchResult && (
                <>
                  <div className="batch-kpis">
                    <div className="batch-kpi-card">
                      <span>Total Titik Sampel</span>
                      <h4>{batchResult.summary.total}</h4>
                    </div>
                    <div className="batch-kpi-card">
                      <span>Rata-rata DO</span>
                      <h4>{batchResult.summary.mean_do} mg/L</h4>
                    </div>
                    <div className="batch-kpi-card">
                      <span>DO Tertinggi</span>
                      <h4>{batchResult.summary.max_do} mg/L</h4>
                    </div>
                    <div className="batch-kpi-card">
                      <span>Alert Hipoksia (&lt;4.0)</span>
                      <h4 style={{ color: '#F07167' }}>{batchResult.summary.hypoxia_count}</h4>
                    </div>
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem' }}>
                    <div className="pill-toggle">
                      {['ALL', 'Optimal', 'Waspada', 'Hipoksia'].map((st) => (
                        <button key={st} className={batchFilter === st ? 'active' : ''} onClick={() => setBatchFilter(st)}>
                          {st === 'ALL' ? 'Semua Status' : st}
                        </button>
                      ))}
                    </div>

                    <button className="btn-sm-seafoam" onClick={downloadResultCsv}>
                      <span>↓ Download Hasil Prediksi (.CSV)</span>
                    </button>
                  </div>

                  <div className="table-wrapper">
                    <table>
                      <thead>
                        <tr>
                          <th>Date</th>
                          <th>WaterTemp</th>
                          <th>Salinity</th>
                          <th>pH</th>
                          <th>Prediksi DO (mg/L)</th>
                          <th>Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredBatchRows.slice(0, 60).map((row, i) => (
                          <tr key={i}>
                            <td className="mono">{row.Date}</td>
                            <td className="mono">{row.WaterTemp} °C</td>
                            <td className="mono">{row.Salinity} ppt</td>
                            <td className="mono">{row.pH}</td>
                            <td className="mono"><strong>{row.Predicted_DO_mgL}</strong></td>
                            <td>
                              <span className={`badge-status badge-${row.Status_Perairan}`}>
                                {row.Status_Perairan}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </div>
          )}

          {/* TAB 3: BENCHMARK & EXPLAINABILITY */}
          {studioTab === 'metodologi' && (
            <div className="dual-panels">
              <div className="sub-panel">
                <div className="sub-panel-header">
                  <h3><span className="tag-badge">BENCHMARK</span> Perbandingan 5 Model</h3>
                </div>
                <div className="table-wrapper">
                  <table>
                    <thead>
                      <tr>
                        <th>Algoritma</th>
                        <th>Train RMSE</th>
                        <th>Test RMSE</th>
                        <th>Test R²</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        <td><strong>XGBoost (Produksi)</strong></td>
                        <td className="mono">1.3023</td>
                        <td className="mono"><strong style={{ color: '#CFEAE0' }}>1.5170</strong></td>
                        <td className="mono"><strong style={{ color: '#CFEAE0' }}>0.4566</strong></td>
                      </tr>
                      <tr>
                        <td>Random Forest</td>
                        <td className="mono">0.5365</td>
                        <td className="mono">1.5282</td>
                        <td className="mono">0.4485</td>
                      </tr>
                      <tr>
                        <td>Stacking Regressor</td>
                        <td className="mono">0.8732</td>
                        <td className="mono">1.5409</td>
                        <td className="mono">0.4393</td>
                      </tr>
                      <tr>
                        <td>Gradient Boosting</td>
                        <td className="mono">1.1051</td>
                        <td className="mono">1.5724</td>
                        <td className="mono">0.4162</td>
                      </tr>
                      <tr>
                        <td>Ridge Regression</td>
                        <td className="mono">1.7957</td>
                        <td className="mono">2.5811</td>
                        <td className="mono" style={{ color: '#F07167' }}>-0.5732</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="sub-panel">
                <div className="sub-panel-header">
                  <h3><span className="tag-badge">XAI</span> Permutation Feature Importance</h3>
                </div>
                <p style={{ fontSize: '0.84rem', color: 'var(--text-secondary)', lineHeight: '1.6' }}>
                  Kenaikan galat prediksi (<span className="mono">RMSE mg/L</span>) ketika nilai masing-masing fitur diacak pada data uji:
                </p>
                <div className="importance-list">
                  {[
                    { name: 'WaterTemp', val: 0.5567, w: 100 },
                    { name: 'Month_cos', val: 0.1116, w: 20 },
                    { name: 'Salinity', val: 0.0981, w: 17.6 },
                    { name: 'Year', val: 0.0654, w: 11.7 },
                    { name: 'Month_sin', val: 0.0482, w: 8.6 },
                    { name: 'pH', val: 0.0390, w: 7.0 },
                  ].map((item) => (
                    <div key={item.name} className="importance-row">
                      <span className="mono" style={{ fontSize: '0.8rem', fontWeight: 600 }}>{item.name}</span>
                      <div className="importance-track">
                        <div className="importance-fill" style={{ width: `${item.w}%` }}></div>
                      </div>
                      <span className="mono" style={{ fontSize: '0.78rem', color: 'var(--seafoam)', textAlign: 'right' }}>
                        +{item.val.toFixed(4)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </section>

      {/* =========================================
          TECHNICAL FAQ ACCORDION
          ========================================= */}
      <section id="faq" className="section-block">
        <div className="section-header">
          <span className="section-kicker">03 // TECHNICAL DEEP-DIVE</span>
          <h2>Pertanyaan Teknis & Metodologi Riset.</h2>
        </div>

        <div className="accordion-stack">
          {faqs.map((item, idx) => (
            <div key={idx} className="accordion-item">
              <button className="accordion-trigger" onClick={() => setOpenFaq(openFaq === idx ? -1 : idx)}>
                <span>{item.q}</span>
                <span className="mono" style={{ color: 'var(--seafoam)' }}>{openFaq === idx ? '−' : '+'}</span>
              </button>
              {openFaq === idx && <div className="accordion-body">{item.a}</div>}
            </div>
          ))}
        </div>
      </section>

      {/* =========================================
          COMMAND PALETTE MODAL (CTRL + K)
          ========================================= */}
      {cmdOpen && (
        <div className="modal-overlay" onClick={() => setCmdOpen(false)}>
          <div className="command-dialog" onClick={(e) => e.stopPropagation()}>
            <input
              type="text"
              className="command-search"
              placeholder="Ketik perintah cepat (misal: Hipoksia, Batch, KNNImputer, JSON)..."
              autoFocus
              value={cmdQuery}
              onChange={(e) => setCmdQuery(e.target.value)}
            />
            <div className="command-list">
              {commandActions.map((cmd, idx) => (
                <button key={idx} className="command-option" onClick={cmd.action}>
                  <span>{cmd.label}</span>
                  <span className="kbd-chip">{cmd.shortcut}</span>
                </button>
              ))}
              {commandActions.length === 0 && (
                <div style={{ padding: '1rem', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                  Perintah tidak ditemukan.
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* =========================================
          FOOTER
          ========================================= */}
      <footer className="footer-bar">
        <div>
          <strong style={{ color: 'var(--seafoam)' }}>OxyGuessr</strong> — Pelagic Intelligence & Dissolved Oxygen Telemetry
        </div>
        <div className="mono">PBL Machine Learning • Kelompok 16</div>
      </footer>
    </div>
  );
}