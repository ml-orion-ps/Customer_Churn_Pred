import json
import tempfile
import subprocess
from pathlib import Path

import pandas as pd

py = str(Path('.venv/Scripts/python.exe'))
script = 'server/python-ml/train_model.py'
df = pd.read_csv(r"Brightspeed_Synthetic_Churn_KPI_Monthly_AllColumns (1).csv")
sample = df.sample(n=min(450, len(df)), random_state=42).to_dict(orient='records')

inp = {"data": sample, "targetColumn": "isChurned", "hyperparameters": None}
tmp = Path(tempfile.gettempdir())
inp_path = tmp / 'ml_auto_check_in.json'
out_path = tmp / 'ml_auto_check_out.json'
inp_path.write_text(json.dumps(inp), encoding='utf-8')

res = subprocess.run([py, script, str(inp_path), str(out_path), 'Auto'], capture_output=True, text=True)
print(f'rc={res.returncode}')

if out_path.exists():
    payload = json.loads(out_path.read_text(encoding='utf-8'))
    print(f"success={payload.get('success')}")
    print(f"bestModel={payload.get('bestModel')}")
    all_results = payload.get('allResults') or []
    print(f'allResults_len={len(all_results)}')
    for r in all_results:
        cv = r.get('cvSummary') or {}
        print(
            f"{r.get('algorithm')}: nCandidates={cv.get('nCandidates')} "
            f"bestScore={cv.get('bestScore')} hasBestParams={bool(r.get('bestParams'))}"
        )
else:
    print('No output file created')
    print((res.stderr or '')[:1000])
