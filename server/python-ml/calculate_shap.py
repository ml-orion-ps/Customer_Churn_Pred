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
import json
import pandas as pd
import numpy as np
from sklearn.linear_model import LogisticRegression
from sklearn.ensemble import RandomForestClassifier
from lightgbm import LGBMClassifier
from xgboost import XGBClassifier
import shap
import warnings
warnings.filterwarnings('ignore')


def _silent_print(*args, **kwargs):
    return None


# Silence modeling logs to reduce console I/O overhead during training.
print = _silent_print


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
        model = LGBMClassifier(random_state=42, verbose=-1, **params)
    elif algorithm == "XGBoost":
        model = XGBClassifier(random_state=42, eval_metric='logloss', **params)
    else:
        raise ValueError(f"Unknown algorithm: {algorithm}")
    
    return model


def calculate_shap_values(model, X_background, X_explain, feature_cols):
    """Calculate SHAP values for the given model and data."""
    try:
        # Use TreeExplainer for tree models
        if isinstance(model, (RandomForestClassifier, LGBMClassifier, XGBClassifier)):
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
    # Get indices sorted by absolute SHAP value
    abs_shap = np.abs(shap_values_row)
    top_indices = np.argsort(abs_shap)[::-1][:top_n]
    
    drivers = []
    for idx in top_indices:
        feature = feature_cols[idx]
        value = feature_values_row[idx]
        shap_val = float(shap_values_row[idx])
        impact = "increases risk" if shap_val > 0 else "decreases risk"
        
        drivers.append({
            'feature': feature,
            'value': float(value) if isinstance(value, (int, float, np.number)) else str(value),
            'shapValue': shap_val,
            'impact': impact
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
            risk_band = classify_risk_band_from_probability(prob)
            
            # Get top-3 SHAP drivers
            drivers = get_top_shap_drivers(
                shap_values[i],
                X_score.iloc[i].values,
                feature_cols,
                top_n=3
            )
            
            # Format drivers as strings
            drivers_str = "; ".join([
                f"{d['feature']}={d['value']:.2f} ({d['impact']})"
                if isinstance(d['value'], (int, float))
                else f"{d['feature']}={d['value']} ({d['impact']})"
                for d in drivers
            ])
            
            drivers_detailed = " | ".join([
                f"{d['feature']}: {d['value']:.2f} (SHAP: {d['shapValue']:+.3f})"
                if isinstance(d['value'], (int, float))
                else f"{d['feature']}: {d['value']} (SHAP: {d['shapValue']:+.3f})"
                for d in drivers
            ])
            
            predictions.append({
                'accountId': str(account_ids[i]),
                'churnProbability': prob,
                'riskBand': risk_band,
                'top3Drivers': drivers,
                'top3DriversStr': drivers_str,
                'top3DriversDetailed': drivers_detailed
            })
        
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
