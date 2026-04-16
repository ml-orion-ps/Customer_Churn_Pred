"""
SHAP Values Calculation Script
Called from Node.js to calculate SHAP explanations for customer churn risk.

Usage:
    python calculate_shap.py <input_json_file> <output_json_file>

Arguments:
    input_json_file: Path to JSON with model params, train data, and score data
    output_json_file: Path where SHAP results will be written
"""

import sys
import os

# Auto-install required packages directly from the script
for pkg in ["scikit-learn", "pandas", "numpy", "lightgbm", "xgboost", "shap", "groq"]:
    os.system(f'"{sys.executable}" -m pip install {pkg}')

import json
import warnings

warnings.filterwarnings('ignore', category=DeprecationWarning)
warnings.filterwarnings('ignore', message='Pyarrow will become a required dependency of pandas*')

import pandas as pd
import numpy as np
from sklearn.linear_model import LogisticRegression
from sklearn.ensemble import RandomForestClassifier
from sklearn.tree import DecisionTreeClassifier
from sklearn.svm import SVC

LIGHTGBM_IMPORT_ERROR = None
try:
    from lightgbm import LGBMClassifier
except Exception as exc:
    LGBMClassifier = None
    LIGHTGBM_IMPORT_ERROR = str(exc)

XGBOOST_IMPORT_ERROR = None
try:
    from xgboost import XGBClassifier
except Exception as exc:
    XGBClassifier = None
    XGBOOST_IMPORT_ERROR = str(exc)
import os

import shap
warnings.filterwarnings('ignore')


def _silent_print(*args, **kwargs):
    return None


# Silence modeling logs to reduce console I/O overhead during training.
print = _silent_print


def ensure_optional_backend_available(algorithm):
    if algorithm == 'LightGBM' and LGBMClassifier is None:
        raise RuntimeError(f'LightGBM backend is unavailable: {LIGHTGBM_IMPORT_ERROR}')
    if algorithm == 'XGBoost' and XGBClassifier is None:
        raise RuntimeError(f'XGBoost backend is unavailable: {XGBOOST_IMPORT_ERROR}')


def is_tree_model(model):
    tree_types = [RandomForestClassifier, DecisionTreeClassifier]
    if LGBMClassifier is not None:
        tree_types.append(LGBMClassifier)
    if XGBClassifier is not None:
        tree_types.append(XGBClassifier)
    return isinstance(model, tuple(tree_types))


def classify_risk_band_from_probability(probability):
    """Map predicted churn probability to fixed risk tiers."""
    try:
        prob = float(probability)
    except (TypeError, ValueError):
        prob = 0.0

    if prob > 0.85:
        return "Very High Risk"
    if prob >= 0.70:
        return "High Risk"
    if prob >= 0.50:
        return "Medium Risk"
    return "Low Risk"


GROQ_SYSTEM = """
You are a senior telecom retention strategist for a broadband / fixed-line service provider.

You are given customer-level churn risk information from a machine learning churn model for Copper DSL customers.
Your task is to generate a single, practical, business-friendly retention recommendation for each customer.

BUSINESS CONTEXT:
- The customer is currently active.
- The model predicts probability of churn in the next 3 months.
- The customer has been assigned a risk band such as High Risk, Medium Risk, or Low Risk.
- The top churn drivers are derived from SHAP and represent the strongest factors increasing churn risk.

YOUR GOAL:
Generate ONE clear recommendation that a retention or service team can understand immediately.

IMPORTANT INTERPRETATION RULES:
1. If drivers indicate service issues, outages, repeated complaints, frustration, low CSAT, or low NPS:
   - prioritize service recovery first
   - recommend proactive service outreach, diagnostics, repair, issue resolution, or service assurance
   - do NOT prioritize discount as the first action unless pricing is also clearly a major issue

2. If drivers indicate pricing, billing, bill shock, price increase, revenue-per-speed mismatch, or poor value perception:
   - recommend plan optimization, pricing review, right-sizing, value communication, renewal discussion, or targeted retention offer

3. If drivers indicate usage drop, disengagement, low activity, or shrinking consumption:
   - recommend re-engagement, digital nudges, plan-fit review, usage education, or proactive check-in

4. If drivers indicate contract-end / commitment-end timing:
   - recommend renewal outreach, loyalty upgrade, or early renewal save offer

5. If multiple driver types are present:
   - prioritize service issues first if they exist
   - then mention pricing/value if relevant
   - then mention engagement or renewal as secondary considerations

6. High Risk customers:
   - require immediate or high-priority intervention
   - recommendation should be stronger and more proactive

7. Medium Risk customers:
   - require proactive but more measured intervention

8. Low Risk customers:
   - do not recommend expensive manual intervention unless drivers strongly justify it
   - monitoring or light-touch digital retention is acceptable

OUTPUT STYLE:
- Return one concise recommendation in plain business English
- Maximum 5 words total
- No extra explanation
- Do not mention SHAP explicitly
- Do not mention machine learning
- Do not output JSON
- Do not output bullet points
- Do not output multiple options
- Return only the recommendation text
""".strip()


def derive_driver_types(top_driver_text):
    if pd.isna(top_driver_text) or str(top_driver_text).strip() == "":
        return ["mixed_other"]

    text = str(top_driver_text).lower()
    driver_types = []

    def has_any(terms):
        return any(term in text for term in terms)

    if has_any(["ticket", "outage", "csat", "nps", "frustration", "repeat_issue", "speed_gap"]):
        driver_types.append("service_issue")
    if has_any(["revenue", "bill", "price", "bill_shock", "price_increase", "late_payment", "collections"]):
        driver_types.append("pricing_value")
    if has_any(["usage", "engagement", "drop", "usage_mom"]):
        driver_types.append("engagement_drop")
    if has_any(["contract", "commitment", "near_contract_end", "months_to_commitment_end"]):
        driver_types.append("contract_renewal")

    return driver_types if driver_types else ["mixed_other"]


def build_rule_based_recommendation(risk_band, driver_types):
    if risk_band == "Low Risk":
        return "Monitor with digital nudges only."

    has_service = "service_issue" in driver_types
    has_pricing = "pricing_value" in driver_types
    has_engagement = "engagement_drop" in driver_types
    has_contract = "contract_renewal" in driver_types

    if has_service and has_pricing:
        return "Fix service then optimize pricing."
    if has_service:
        return "Immediate service recovery outreach."
    if has_pricing and has_contract:
        return "Offer renewal with plan optimization."
    if has_pricing:
        return "Run targeted pricing value review."
    if has_engagement:
        return "Launch proactive re-engagement nudges."
    if has_contract:
        return "Start early renewal outreach now."
    if risk_band in ("Very High Risk", "High Risk"):
        return "Immediate manual retention outreach."
    return "Proactive retention outreach recommended."


def enforce_max_words(text, max_words=5):
    cleaned = str(text or "").replace("\n", " ").replace("\r", " ")
    cleaned = " ".join(cleaned.split())
    if not cleaned:
        return ""

    words = cleaned.split(" ")
    return " ".join(words[:max_words]).strip(' .,:;!-')


def build_hybrid_recommendations(predictions):
    groq_client = None
    groq_api_key = os.environ.get("GROQ_API_KEY", "").strip()
    if groq_api_key:
        try:
            from groq import Groq
            groq_client = Groq(api_key=groq_api_key)
        except Exception as exc:
            sys.stderr.write(f"Groq client unavailable, using rule-based fallback: {exc}\n")
            sys.stderr.flush()

    import time

    for prediction in predictions:
        risk_band = prediction.get("riskBand") or classify_risk_band_from_probability(prediction.get("churnProbability", 0.0))
        prediction["riskBand"] = risk_band
        driver_types = derive_driver_types(prediction.get("top3DriversStr", ""))

        if groq_client and risk_band in ("Very High Risk", "High Risk", "Medium Risk"):
            try:
                payload = {
                    "account_number": prediction.get("accountId"),
                    "predicted_churn_probability_next_3m": prediction.get("churnProbability"),
                    "risk_band": risk_band,
                    "top_3_shap_drivers_str": prediction.get("top3DriversStr", ""),
                    "primary_driver_type": driver_types[0] if driver_types else "mixed_other",
                }
                user_prompt = f"""
You are assisting a telecom retention team.

Customer context:
{json.dumps(payload, ensure_ascii=False, indent=2)}

Task:
Write exactly ONE retention recommendation of MAXIMUM 5 WORDS.

Requirements:
- ≤5 words total.
- Plain business English.
- Implies: [Channel/Action/Reason]
- Prioritize service recovery over pricing.
- No SHAP/AI/models mention.

Return ONLY the recommendation text.
""".strip()

                response = groq_client.chat.completions.create(
                    model="moonshotai/kimi-k2-instruct-0905",
                    temperature=0.2,
                    max_tokens=15,
                    messages=[
                        {"role": "system", "content": GROQ_SYSTEM},
                        {"role": "user", "content": user_prompt},
                    ],
                )
                recommendation = response.choices[0].message.content.strip().strip('"').strip('`').strip()
                prediction["finalRecommendation"] = enforce_max_words(recommendation, max_words=5) or enforce_max_words(
                    build_rule_based_recommendation(risk_band, driver_types),
                    max_words=5,
                )
                prediction["recommendationSource"] = "groq"
                time.sleep(0.3)
                continue
            except Exception as exc:
                sys.stderr.write(f"Groq recommendation failed, using rule-based fallback: {exc}\n")
                sys.stderr.flush()

        prediction["finalRecommendation"] = enforce_max_words(
            build_rule_based_recommendation(risk_band, driver_types),
            max_words=5,
        )
        prediction["recommendationSource"] = "rule_based"

    return predictions


def prepare_data(data, target_col='isChurned'):
    """Convert input data to DataFrame and extract features."""
    df = pd.DataFrame(data)
    
    # Auto-detect numeric features
    numeric_cols = df.select_dtypes(include=[np.number]).columns.tolist()
    
    # Remove target and ID columns
    exclude_cols = [target_col, 'id', 'accountNumber', 'account_number', 'name', 
                    'email', 'phone', 'address', 'city', 'state', 'zipCode']
    feature_cols = [c for c in numeric_cols if c not in exclude_cols]
    
    X = df[feature_cols].fillna(0)
    
    if target_col in df.columns:
        y = df[target_col].astype(int)
    else:
        y = None
    
    return X, y, feature_cols


def build_model(algorithm, params):
    """Reconstruct model from algorithm name and parameters."""
    if algorithm == "Logistic Regression":
        model = LogisticRegression(random_state=42, max_iter=1000, **params)
    elif algorithm == "Random Forest":
        model = RandomForestClassifier(random_state=42, **params)
    elif algorithm == "LightGBM":
        ensure_optional_backend_available(algorithm)
        model = LGBMClassifier(random_state=42, verbose=-1, **params)
    elif algorithm == "XGBoost":
        ensure_optional_backend_available(algorithm)
        model = XGBClassifier(random_state=42, eval_metric='logloss', **params)
    elif algorithm == "Decision Tree":
        model = DecisionTreeClassifier(random_state=42, **params)
    elif algorithm == "Support Vector Machine":
        model = SVC(probability=True, random_state=42, **params)
    else:
        raise ValueError(f"Unknown algorithm: {algorithm}")
    
    return model


def calculate_shap_values(model, X_background, X_explain, feature_cols):
    """Calculate SHAP values for the given model and data."""
    try:
        # Use TreeExplainer for tree models
        if is_tree_model(model):
            explainer = shap.TreeExplainer(model)
            shap_values = explainer.shap_values(X_explain)
            
            # Handle different output formats
            if isinstance(shap_values, list):
                if len(shap_values) == 2:
                    shap_values = shap_values[1]  # Binary classification positive class
                else:
                    shap_values = shap_values[0]
            elif isinstance(shap_values, np.ndarray) and shap_values.ndim == 3:
                shap_values = shap_values[:, :, 1]
        
        # Use LinearExplainer for linear models
        elif isinstance(model, LogisticRegression):
            explainer = shap.LinearExplainer(model, X_background)
            shap_values = explainer.shap_values(X_explain)
        
        else:
            # Fallback to KernelExplainer
            sample_size = min(100, len(X_background))
            explainer = shap.KernelExplainer(
                model.predict_proba, 
                shap.sample(X_background, sample_size)
            )
            shap_values = explainer.shap_values(X_explain)
            if isinstance(shap_values, list):
                shap_values = shap_values[1]
        
        return shap_values
    
    except Exception as e:
        sys.stderr.write(f"SHAP calculation failed, using fallback: {e}\n")
        sys.stderr.flush()
        # Fallback: return zeros
        return np.zeros((len(X_explain), len(feature_cols)))


def get_top_shap_drivers(shap_values_row, feature_values_row, feature_cols, top_n=3):
    """Extract top N SHAP drivers for a single prediction."""
    positive_indices = [idx for idx, shap_val in enumerate(shap_values_row) if float(shap_val) > 0]
    positive_indices.sort(key=lambda idx: float(shap_values_row[idx]), reverse=True)

    drivers = []
    for idx in positive_indices[:top_n]:
        feature = feature_cols[idx]
        value = feature_values_row[idx]
        shap_val = float(shap_values_row[idx])

        drivers.append({
            'feature': feature,
            'value': float(value) if isinstance(value, (int, float, np.number)) else str(value),
            'shapValue': shap_val,
            'impact': 'increases risk'
        })

    return drivers


def main():
    if len(sys.argv) < 3:
        sys.stdout.write(json.dumps({'error': 'Usage: python calculate_shap.py <input_json> <output_json>'}) + "\n")
        sys.stdout.flush()
        sys.exit(1)
    
    input_file = sys.argv[1]
    output_file = sys.argv[2]
    
    try:
        # Load input data
        with open(input_file, 'r') as f:
            input_data = json.load(f)
        
        algorithm = input_data.get('algorithm')
        model_params = input_data.get('modelParams', {})
        train_data = input_data.get('trainData', [])
        score_data = input_data.get('scoreData', [])
        target_col = input_data.get('targetColumn', 'isChurned')
        
        if not train_data or not score_data:
            raise ValueError("Missing training or scoring data")
        
        # Prepare data
        X_train, y_train, feature_cols = prepare_data(train_data, target_col)
        X_score, _, _ = prepare_data(score_data, target_col)
        
        # Ensure same features
        X_score = X_score[feature_cols]
        
        # Build and train model
        model = build_model(algorithm, model_params)
        model.fit(X_train, y_train)
        
        # Predict probabilities
        probs = model.predict_proba(X_score)[:, 1]
        
        # Calculate SHAP values
        shap_values = calculate_shap_values(model, X_train, X_score, feature_cols)
        
        # Extract account IDs
        score_df = pd.DataFrame(score_data)
        if 'accountNumber' in score_df.columns:
            account_ids = score_df['accountNumber'].tolist()
        elif 'account_number' in score_df.columns:
            account_ids = score_df['account_number'].tolist()
        elif 'id' in score_df.columns:
            account_ids = score_df['id'].tolist()
        else:
            account_ids = list(range(len(X_score)))
        
        # Build predictions with SHAP drivers
        predictions = []
        for i in range(len(X_score)):
            prob = float(probs[i])

            # Get top-3 SHAP drivers
            drivers = get_top_shap_drivers(
                shap_values[i],
                X_score.iloc[i].values,
                feature_cols,
                top_n=3
            )

            driver_names = [d['feature'] for d in drivers]
            drivers_str = ", ".join(driver_names) if driver_names else "No strong positive driver"
            drivers_detailed = ", ".join([
                f"{d['feature']} ({d['shapValue']:.4f})"
                for d in drivers
            ]) if drivers else "No strong positive driver"
            
            predictions.append({
                'accountId': str(account_ids[i]),
                'churnProbability': prob,
                'top3Drivers': drivers,
                'top3DriversStr': drivers_str,
                'top3DriversDetailed': drivers_detailed
            })

        predictions.sort(key=lambda prediction: prediction['churnProbability'], reverse=True)
        for prediction in predictions:
            prediction['riskBand'] = classify_risk_band_from_probability(prediction['churnProbability'])

        predictions = build_hybrid_recommendations(predictions)
        
        output_data = {
            'success': True,
            'predictions': predictions
        }
        
        # Write output
        with open(output_file, 'w') as f:
            json.dump(output_data, f, indent=2)
        
        sys.stdout.write(json.dumps({'success': True, 'message': f'SHAP calculated for {len(predictions)} customers'}) + "\n")
        sys.stdout.flush()
    
    except Exception as e:
        error_data = {'success': False, 'error': str(e)}
        try:
            with open(output_file, 'w') as f:
                json.dump(error_data, f, indent=2)
        except:
            pass
        sys.stdout.write(json.dumps(error_data) + "\n")
        sys.stdout.flush()
        sys.exit(1)


if __name__ == '__main__':
    main()
