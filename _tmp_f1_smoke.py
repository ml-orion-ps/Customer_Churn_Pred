import json, pandas as pd, tempfile, subprocess
from pathlib import Path

py = str(Path('.venv/Scripts/python.exe'))
script = 'server/python-ml/train_model.py'
df = pd.read_csv(r"Brightspeed_Synthetic_Churn_KPI_Monthly_AllColumns (1).csv")
sample = df.sample(n=min(2000, len(df)), random_state=42).to_dict(orient='records')

tmp = Path(tempfile.gettempdir())
for algo in ['LightGBM', 'XGBoost', 'Random Forest']:
    inp = {"data": sample, "targetColumn": "isChurned", "hyperparameters": None}
    inp_path = tmp / f'ml_smoke_{algo.replace(" ","_")}_in.json'
    out_path = tmp / f'ml_smoke_{algo.replace(" ","_")}_out.json'
    inp_path.write_text(json.dumps(inp), encoding='utf-8')
    res = subprocess.run([py, script, str(inp_path), str(out_path), algo], capture_output=True, text=True)
    if out_path.exists():
        payload = json.loads(out_path.read_text(encoding='utf-8'))
        m = payload.get('metrics', {})
        thr = m.get('optimalThreshold', '?')
        print(f'{algo}: acc={m.get("accuracy")} f1={m.get("f1Score")} auc={m.get("auc")} thr={thr} prec={m.get("precision")} rec={m.get("recall")}')
        tm = m.get('trainMetrics', {})
        print(f'  train: acc={tm.get("accuracy")} f1={tm.get("f1Score")} auc={tm.get("auc")}')
    else:
        print(f'{algo}: FAILED rc={res.returncode}')
        print(res.stderr[:500])
