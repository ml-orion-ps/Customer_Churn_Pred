import json
import pandas as pd
import subprocess
import tempfile
from pathlib import Path

py = str(Path('.venv/Scripts/python.exe'))
script = 'server/python-ml/train_model.py'
df = pd.read_csv(r"Brightspeed_Synthetic_Churn_KPI_Monthly_AllColumns (1).csv")
sample = df.sample(n=min(900, len(df)), random_state=19).to_dict(orient='records')

def run(algo, hyper=None):
    tmp = Path(tempfile.gettempdir())
    inp_path = tmp / f"ml_orion_inp_{algo.replace(' ','_')}.json"
    out_path = tmp / f"ml_orion_out_{algo.replace(' ','_')}.json"
    inp = {"data": sample, "targetColumn": "isChurned", "hyperparameters": hyper}
    inp_path.write_text(json.dumps(inp), encoding='utf-8')
    res = subprocess.run([py, script, str(inp_path), str(out_path), algo], capture_output=True, text=True)
    out = json.loads(out_path.read_text(encoding='utf-8')) if out_path.exists() else {}
    m = out.get('metrics', {})
    print('\n==', algo, '==')
    print('rc=', res.returncode)
    print('best=', out.get('bestModel'), 'auc=', m.get('auc'), 'acc=', m.get('accuracy'), 'f1=', m.get('f1Score'))
    print('trainMetrics?', bool(m.get('trainMetrics')), 'cvSummary?', bool(m.get('cvSummary')))
    print('stderr_head=', '\\n'.join(res.stderr.splitlines()[:4]))

run('Random Forest', {"n_estimators": 200, "max_depth": 8, "min_samples_leaf": 10, "class_weight": "balanced"})
run('Auto', None)
