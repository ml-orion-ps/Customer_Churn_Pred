import json, pandas as pd, tempfile, subprocess
from pathlib import Path

py = str(Path('.venv/Scripts/python.exe'))
script = 'server/python-ml/train_model.py'
df = pd.read_csv(r"Brightspeed_Synthetic_Churn_KPI_Monthly_AllColumns (1).csv")
sample = df.sample(n=min(1500, len(df)), random_state=42).to_dict(orient='records')

tmp = Path(tempfile.gettempdir())
inp = {"data": sample, "targetColumn": "isChurned", "hyperparameters": None}
inp_path = tmp / 'ml_smoke_xgb_in.json'
out_path = tmp / 'ml_smoke_xgb_out.json'
inp_path.write_text(json.dumps(inp), encoding='utf-8')
res = subprocess.run([py, script, str(inp_path), str(out_path), 'XGBoost'], capture_output=True, text=True)
if out_path.exists():
    payload = json.loads(out_path.read_text(encoding='utf-8'))
    m = payload.get('metrics', {})
    print(f'XGBoost: acc={m.get("accuracy")} f1={m.get("f1Score")} auc={m.get("auc")} thr={m.get("optimalThreshold")} prec={m.get("precision")} rec={m.get("recall")}')
else:
    print(f'FAILED rc={res.returncode}')
    print(res.stderr[-500:])
