import json
import pandas as pd
import subprocess
import tempfile
from pathlib import Path

df = pd.read_csv(r"Brightspeed_Synthetic_Churn_KPI_Monthly_AllColumns (1).csv")
sample = df.sample(n=min(400, len(df)), random_state=11).to_dict(orient='records')
inp = {"data": sample, "targetColumn": "isChurned", "hyperparameters": None}

tmp = Path(tempfile.gettempdir())
inp_path = tmp / "ml_orion_inp_auto_small.json"
out_path = tmp / "ml_orion_out_auto_small.json"
inp_path.write_text(json.dumps(inp), encoding="utf-8")
cmd = [str(Path('.venv/Scripts/python.exe')), 'server/python-ml/train_model.py', str(inp_path), str(out_path), 'Auto']
res = subprocess.run(cmd, capture_output=True, text=True)
print('returncode=', res.returncode)
print('stderr_first=', '\n'.join(res.stderr.splitlines()[:8]))
if out_path.exists():
    out = json.loads(out_path.read_text(encoding='utf-8'))
    print('bestModel=', out.get('bestModel'))
    print('bestAuc=', out.get('bestAuc'))
    print('allResults=', len(out.get('allResults', [])))
