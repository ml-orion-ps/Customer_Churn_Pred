import json, pandas as pd, tempfile, subprocess
from pathlib import Path

py = str(Path('.venv/Scripts/python.exe'))
script = 'server/python-ml/train_model.py'
df = pd.read_csv(r"Brightspeed_Synthetic_Churn_KPI_Monthly_AllColumns (1).csv")
sample = df.sample(n=min(1800, len(df)), random_state=7).to_dict(orient='records')
inp = {"data": sample, "targetColumn": "isChurned", "hyperparameters": None}

tmp = Path(tempfile.gettempdir())
inp_path = tmp / 'auto_refit_check_in.json'
out_path = tmp / 'auto_refit_check_out.json'
inp_path.write_text(json.dumps(inp), encoding='utf-8')
res = subprocess.run([py, script, str(inp_path), str(out_path), 'Auto'], capture_output=True, text=True)
print('rc=', res.returncode)
if out_path.exists():
    out = json.loads(out_path.read_text(encoding='utf-8'))
    print('bestModel=', out.get('bestModel'), 'bestAuc=', out.get('bestAuc'))
    m = out.get('metrics', {})
    cv = m.get('cvSummary') or {}
    print('selected_auc=', m.get('auc'), 'selected_lift10=', m.get('liftTop10'), 'cv_bestScore=', cv.get('bestScore'))
    for r in out.get('allResults', []):
        c = r.get('cvSummary') or {}
        print('algo=', r.get('algorithm'), 'auc=', r.get('auc'), 'lift10=', r.get('liftTop10'), 'cv_bestScore=', c.get('bestScore'))
