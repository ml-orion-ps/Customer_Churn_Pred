"""
`ML Model Training Script - Enterprise Grade
Called from Node.js Express server to train models using Python ML libraries.
Implements methodologies from Copper_Churn_v3.ipynb notebook.

Usage:
    python train_model.py <input_json_file> <output_json_file> [algorithm]

Arguments:
    input_json_file: Path to JSON file with training data
    output_json_file: Path where results will be written
    algorithm: "Auto", "Random Forest", "LightGBM", or "XGBoost"

Methodologies Implemented:
- ChurnPreprocessedEstimator wrapper (train-only preprocessing)
- Winsorization (5th/95th percentile clipping)
- VarianceThreshold filtering
- Custom business scorers (lift_top10, recall_top10)
- Expanding walk-forward CV (if snapshot_month present)
- Pretest/OOS splits (if snapshot_month present)
"""

import sys
import os
import json
import warnings

# Auto-install required packages if missing
for pkg in ["scikit-learn", "pandas", "numpy", "lightgbm", "xgboost", "shap", "groq"]:
    try:
        __import__(pkg.replace("-", "_") if pkg != "scikit-learn" else "sklearn")
    except ImportError:
        os.system(f'"{sys.executable}" -m pip install {pkg}')

warnings.filterwarnings('ignore', category=DeprecationWarning)
warnings.filterwarnings('ignore', message='Pyarrow will become a required dependency of pandas*')

# Fix Windows encoding issues
if sys.platform == 'win32':
    import io
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
    sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8', errors='replace')
import pandas as pd
import numpy as np
from sklearn.base import BaseEstimator, ClassifierMixin
from sklearn.model_selection import GridSearchCV, train_test_split
from sklearn.preprocessing import StandardScaler
from sklearn.feature_selection import VarianceThreshold
from sklearn.ensemble import RandomForestClassifier
from sklearn.tree import DecisionTreeClassifier
from sklearn.svm import SVC
from sklearn.metrics import (
    roc_auc_score, precision_score, recall_score, f1_score, 
    accuracy_score, confusion_matrix, make_scorer
)

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

warnings.filterwarnings('ignore')


def _silent_print(*args, **kwargs):
    return None


# Silence modeling logs to reduce console I/O overhead during training.
print = _silent_print


MODEL_FAMILY_DISPLAY_NAMES = {
    'rf': 'Random Forest',
    'lightgbm': 'LightGBM',
    'xgboost': 'XGBoost',
    #'decision_tree': 'Decision Tree',
    #'support_vector_machine': 'Support Vector Machine',
}


def get_model_family_availability(model_family):
    if model_family == 'rf':
        return True, None
    if model_family == 'lightgbm':
        return LGBMClassifier is not None, LIGHTGBM_IMPORT_ERROR
    if model_family == 'xgboost':
        return XGBClassifier is not None, XGBOOST_IMPORT_ERROR
    if model_family == 'decision_tree':
        return True, None
    if model_family == 'support_vector_machine':
        return True, None
    return False, f'Unknown model family: {model_family}'


def ensure_model_family_available(model_family):
    is_available, detail = get_model_family_availability(model_family)
    if is_available:
        return

    display_name = MODEL_FAMILY_DISPLAY_NAMES.get(model_family, model_family)
    raise RuntimeError(
        f'{display_name} is not available in this runtime environment. {detail}'
    )


def get_available_auto_model_families():
    families = []
    for model_family in ['rf', 'lightgbm', 'xgboost', 'decision_tree', 'support_vector_machine']:
        is_available, _detail = get_model_family_availability(model_family)
        if is_available:
            families.append(model_family)
    return families


def classify_risk_band_from_probability(probability):
    """Map predicted churn probability to fixed risk tiers."""
    try:
        prob = float(probability)
    except (TypeError, ValueError):
        prob = 0.0

    if prob > 0.85:
        return 'Very High Risk'
    if prob >= 0.70:
        return 'High Risk'
    if prob >= 0.50:
        return 'Medium Risk'
    return 'Low Risk'



# Global constants from notebook
CLASSIFICATION_THRESHOLD = 0.03
MIN_TRAIN_SNAPSHOT_COUNT = 5
N_OOS_MONTHS = 2
COPPER_VALUE = "Copper_DSL"
FEATURE_HISTORY_MONTHS = 12
LABEL_HORIZON_MONTHS = 3
MIN_TENURE_MONTHS = 6
TARGET_COL = "churn_flag_3m"


# ==============================================================================
# SERIALIZATION HELPERS  â€” fixes NaN/Inf breaking JSON output
# ==============================================================================

def safe_float(v):
    """Convert value to JSON-safe float. NaN / Inf â†’ None."""
    if v is None:
        return None
    try:
        f = float(v)
        if np.isnan(f) or np.isinf(f):
            return None
        return round(f, 6)
    except (TypeError, ValueError):
        return None


def safe_serialize(obj):
    """Recursively replace NaN/Inf with None and numpy types with Python natives."""
    if isinstance(obj, bool):
        return obj
    if isinstance(obj, dict):
        return {k: safe_serialize(v) for k, v in obj.items()}
    if isinstance(obj, list):
        return [safe_serialize(v) for v in obj]
    if isinstance(obj, (np.floating, float)):
        return safe_float(float(obj))
    if isinstance(obj, (np.integer, int)):
        return int(obj)
    if isinstance(obj, np.ndarray):
        return obj.tolist()
    return obj


# ==============================================================================
# PREPROCESSING PIPELINE FUNCTIONS (from Copper_Churn_v3.ipynb)
# ==============================================================================

def fit_winsor_bounds(X_train, lower_q=0.05, upper_q=0.95):
    """Fit winsorization bounds on training data only."""
    bounds = {}
    for col in X_train.columns:
        lower = X_train[col].quantile(lower_q)
        upper = X_train[col].quantile(upper_q)
        bounds[col] = (lower, upper)
    return bounds


def apply_winsor_bounds(X, bounds):
    """Apply winsorization bounds fitted from training data."""
    X = X.copy()
    for col, (lower, upper) in bounds.items():
        if col in X.columns:
            X[col] = X[col].clip(lower=lower, upper=upper)
    return X


def remove_high_vif_features(X, threshold=10):
    """Remove features with high VIF (multicollinearity) iteratively."""
    try:
        from statsmodels.stats.outliers_influence import variance_inflation_factor
    except ImportError:
        _silent_print("[VIF] statsmodels not installed; skipping VIF filtering.")
        return X

    X = X.copy()

    # Remove constant columns
    nunique = X.nunique()
    constant_cols = nunique[nunique <= 1].index.tolist()
    if constant_cols:
        _silent_print(f"[VIF] Removing {len(constant_cols)} constant columns")
        X = X.drop(columns=constant_cols)

    X = X.replace([np.inf, -np.inf], np.nan).fillna(0)

    # Iteratively remove highest VIF features
    while X.shape[1] > 1:
        vif_df = pd.DataFrame()
        vif_df["feature"] = X.columns
        vif_df["VIF"] = [
            variance_inflation_factor(X.values, i)
            for i in range(X.shape[1])
        ]

        max_vif = vif_df["VIF"].max()

        if pd.isna(max_vif):
            break

        if max_vif > threshold:
            drop_feature = vif_df.sort_values("VIF", ascending=False)["feature"].iloc[0]
            _silent_print(f"[VIF] Dropping {drop_feature} due to high VIF: {max_vif:.2f}")
            X = X.drop(columns=[drop_feature])
        else:
            break

    return X


def fit_preprocessing_pipeline(
    X_train,
    use_scaling=False,
    use_vif=False,
    vif_threshold=10,
    winsorize=True,
    lower_q=0.05,
    upper_q=0.95,
    variance_threshold=0.00
):
    """
    Fit preprocessing pipeline on TRAINING data only (prevents data leakage).
    Returns processed training data and artifacts for applying to validation/test.
    """
    artifacts = {}

    X_train_proc = X_train.copy()
    # pandas 3.x: drop datetime/object columns before fillna(0) to avoid
    # "Cannot cast DatetimeArray to dtype float64" error.
    X_train_proc = X_train_proc.select_dtypes(include=[np.number, bool])
    X_train_proc = X_train_proc.replace([np.inf, -np.inf], np.nan).fillna(0)

    artifacts["raw_train_columns"] = X_train_proc.columns.tolist()

    # Step 1: Winsorization (clip outliers to 5th/95th percentiles)
    if winsorize:
        winsor_bounds = fit_winsor_bounds(X_train_proc, lower_q=lower_q, upper_q=upper_q)
        X_train_proc = apply_winsor_bounds(X_train_proc, winsor_bounds)
        artifacts["winsor_bounds"] = winsor_bounds
        _silent_print(f"[Preprocessing] Applied winsorization (q={lower_q}/{upper_q})")
    else:
        artifacts["winsor_bounds"] = None

    # Step 2: Variance threshold filtering
    vt = VarianceThreshold(threshold=variance_threshold)
    X_train_proc = pd.DataFrame(
        vt.fit_transform(X_train_proc),
        columns=X_train_proc.columns[vt.get_support()],
        index=X_train_proc.index
    )
    artifacts["variance_selector"] = vt
    artifacts["post_variance_columns"] = X_train_proc.columns.tolist()
    _silent_print(f"[Preprocessing] Variance threshold: {len(X_train_proc.columns)} features retained")

    # Step 3: Optional VIF screening
    if use_vif:
        X_train_proc = remove_high_vif_features(X_train_proc, threshold=vif_threshold)

    artifacts["final_columns"] = X_train_proc.columns.tolist()
    _silent_print(f"[Preprocessing] Final feature count: {len(X_train_proc.columns)}")

    # Step 4: Optional scaling
    scaler = None
    if use_scaling:
        scaler = StandardScaler()
        X_train_model = scaler.fit_transform(X_train_proc)
        _silent_print(f"[Preprocessing] Applied StandardScaler")
    else:
        X_train_model = X_train_proc

    artifacts["scaler"] = scaler

    return X_train_proc, X_train_model, artifacts


def apply_preprocessing_pipeline(X, artifacts, use_scaling=False):
    """Apply preprocessing artifacts fitted from training data to new data."""
    X_proc = X.copy()
    # pandas 3.x: drop datetime/object/non-numeric columns before fillna(0)
    X_proc = X_proc.select_dtypes(include=[np.number, bool])
    X_proc = X_proc.replace([np.inf, -np.inf], np.nan).fillna(0)

    # Apply winsorization from training
    if artifacts["winsor_bounds"] is not None:
        X_proc = apply_winsor_bounds(X_proc, artifacts["winsor_bounds"])

    # Align columns to training
    X_proc = X_proc.reindex(columns=artifacts["raw_train_columns"], fill_value=0)

    # Apply variance threshold from training
    vt = artifacts["variance_selector"]
    X_proc = pd.DataFrame(
        vt.transform(X_proc),
        columns=artifacts["post_variance_columns"],
        index=X_proc.index
    )

    # Align to final columns (after VIF)
    X_proc = X_proc.reindex(columns=artifacts["final_columns"], fill_value=0)

    # Apply scaling from training
    if use_scaling and artifacts["scaler"] is not None:
        X_model = artifacts["scaler"].transform(X_proc)
    else:
        X_model = X_proc

    return X_proc, X_model


# ==============================================================================
# CUSTOM SCORER FUNCTIONS (Business-First Metrics)
# ==============================================================================

def recall_at_top_percent(scored_df, prob_col, target_col, top_pct=0.10):
    """Calculate recall, precision, and lift at top N% of scores."""
    tmp = scored_df[[prob_col, target_col]].copy()
    tmp = tmp.sort_values(prob_col, ascending=False).reset_index(drop=True)

    n_total = len(tmp)
    n_top = max(1, int(np.ceil(n_total * top_pct)))

    top_slice = tmp.head(n_top)

    total_churners = tmp[target_col].sum()
    captured_churners = top_slice[target_col].sum()

    recall_top = captured_churners / total_churners if total_churners > 0 else np.nan
    precision_top = top_slice[target_col].mean() if len(top_slice) > 0 else np.nan
    baseline_rate = tmp[target_col].mean() if len(tmp) > 0 else np.nan
    lift_top = precision_top / baseline_rate if baseline_rate > 0 else np.nan

    return {
        "recall_at_top_pct": recall_top,
        "precision_at_top_pct": precision_top,
        "lift_at_top_pct": lift_top
    }


def scorer_auc(estimator, X, y):
    try:
        proba = estimator.predict_proba(X)
        prob = proba[:, 1] if proba.shape[1] > 1 else proba[:, 0]
        return roc_auc_score(y, prob) if pd.Series(y).nunique() > 1 else 0.0
    except Exception:
        return 0.0


def scorer_lift_top10(estimator, X, y):
    try:
        proba = estimator.predict_proba(X)
        prob = proba[:, 1] if proba.shape[1] > 1 else proba[:, 0]
        tmp = pd.DataFrame({"prob": prob, "y": y})
        result = recall_at_top_percent(tmp, "prob", "y", 0.10)["lift_at_top_pct"]
        return result if not np.isnan(result) else 0.0
    except Exception:
        return 0.0


def scorer_recall_top10(estimator, X, y):
    try:
        proba = estimator.predict_proba(X)
        prob = proba[:, 1] if proba.shape[1] > 1 else proba[:, 0]
        tmp = pd.DataFrame({"prob": prob, "y": y})
        result = recall_at_top_percent(tmp, "prob", "y", 0.10)["recall_at_top_pct"]
        return result if not np.isnan(result) else 0.0
    except Exception:
        return 0.0


def scorer_precision_top10(estimator, X, y):
    try:
        proba = estimator.predict_proba(X)
        prob = proba[:, 1] if proba.shape[1] > 1 else proba[:, 0]
        tmp = pd.DataFrame({"prob": prob, "y": y})
        result = recall_at_top_percent(tmp, "prob", "y", 0.10)["precision_at_top_pct"]
        return result if not np.isnan(result) else 0.0
    except Exception:
        return 0.0


# ==============================================================================
# EXPANDING WINDOW CV (for temporal data with snapshot_month)
# ==============================================================================

def build_expanding_folds(month_list, min_train_months=5, n_oos_months=2):
    """
    Build expanding walk-forward folds from snapshot months.
    Returns: (cv_folds, pretest_months, oos_months)
    """
    month_list = sorted(month_list)

    if len(month_list) < (min_train_months + 1 + n_oos_months):
        raise ValueError(
            f"Not enough snapshot months. Need {min_train_months + 1 + n_oos_months}, "
            f"have {len(month_list)}"
        )

    # Reserve last N months for OOS (out-of-sample) testing
    pretest_months = month_list[:-n_oos_months]
    oos_months = month_list[-n_oos_months:]

    # Build expanding folds
    folds = []
    for i in range(min_train_months, len(pretest_months)):
        train_months = pretest_months[:i]
        val_month = pretest_months[i]

        folds.append({
            "train_months": train_months,
            "val_months": [val_month]
        })

    _silent_print(f"[Expanding CV] Built {len(folds)} folds from {len(month_list)} months")
    _silent_print(f"[Expanding CV] Pretest: {len(pretest_months)} months, OOS: {len(oos_months)} months")

    return folds, pretest_months, oos_months


# ==============================================================================
# CHURN PREPROCESSED ESTIMATOR (matches Copper_Churn_v3.ipynb)
# ==============================================================================

class ChurnPreprocessedEstimator(BaseEstimator, ClassifierMixin):
    """
    Sklearn-compatible estimator wrapping preprocessing + model.
    All preprocessing is fitted ONLY on train fold to prevent data leakage.
    Full parameter set matches Copper_Churn_v3.ipynb notebook.
    """

    def __init__(
        self,
        model_family="rf",
        # Preprocessing
        winsorize=True, lower_q=0.05, upper_q=0.95,
        variance_threshold=0.00, use_vif=False, vif_threshold=10,
        # Random Forest (notebook-aligned)
        rf_n_estimators=200, rf_max_depth=6, rf_min_samples_leaf=10,
        rf_class_weight="balanced", rf_max_features="sqrt",
        # LightGBM (notebook-aligned)
        lgbm_n_estimators=200, lgbm_learning_rate=0.05, lgbm_num_leaves=31,
        lgbm_min_child_samples=20, lgbm_subsample=0.8, lgbm_colsample_bytree=0.8,
        lgbm_class_weight="balanced",
        # XGBoost (notebook-aligned)
        xgb_n_estimators=200, xgb_learning_rate=0.05, xgb_max_depth=4,
        xgb_min_child_weight=1, xgb_subsample=0.8, xgb_colsample_bytree=0.8,
        xgb_scale_pos_weight=20,
        # Decision Tree
        dt_max_depth=6, dt_min_samples_leaf=10,
        # Support Vector Machine
        svm_C=1.0, svm_kernel='rbf',
    ):
        self.model_family = model_family
        self.winsorize = winsorize
        self.lower_q = lower_q
        self.upper_q = upper_q
        self.variance_threshold = variance_threshold
        self.use_vif = use_vif
        self.vif_threshold = vif_threshold
        self.rf_n_estimators = rf_n_estimators
        self.rf_max_depth = rf_max_depth
        self.rf_min_samples_leaf = rf_min_samples_leaf
        self.rf_class_weight = rf_class_weight
        self.rf_max_features = rf_max_features
        self.lgbm_n_estimators = lgbm_n_estimators
        self.lgbm_learning_rate = lgbm_learning_rate
        self.lgbm_num_leaves = lgbm_num_leaves
        self.lgbm_min_child_samples = lgbm_min_child_samples
        self.lgbm_subsample = lgbm_subsample
        self.lgbm_colsample_bytree = lgbm_colsample_bytree
        self.lgbm_class_weight = lgbm_class_weight
        self.xgb_n_estimators = xgb_n_estimators
        self.xgb_learning_rate = xgb_learning_rate
        self.xgb_max_depth = xgb_max_depth
        self.xgb_min_child_weight = xgb_min_child_weight
        self.xgb_subsample = xgb_subsample
        self.xgb_colsample_bytree = xgb_colsample_bytree
        self.xgb_scale_pos_weight = xgb_scale_pos_weight
        self.dt_max_depth = dt_max_depth
        self.dt_min_samples_leaf = dt_min_samples_leaf
        self.svm_C = svm_C
        self.svm_kernel = svm_kernel

    def _build_model(self):
        if self.model_family == "rf":
            return RandomForestClassifier(
                n_estimators=self.rf_n_estimators, max_depth=self.rf_max_depth,
                min_samples_leaf=self.rf_min_samples_leaf,
                class_weight=self.rf_class_weight, max_features=self.rf_max_features,
                random_state=42, n_jobs=1,
            ), False
        elif self.model_family == "lightgbm":
            ensure_model_family_available('lightgbm')
            return LGBMClassifier(
                n_estimators=self.lgbm_n_estimators, learning_rate=self.lgbm_learning_rate,
                num_leaves=self.lgbm_num_leaves, min_child_samples=self.lgbm_min_child_samples,
                subsample=self.lgbm_subsample, colsample_bytree=self.lgbm_colsample_bytree,
                class_weight=self.lgbm_class_weight, random_state=42, verbose=-1, n_jobs=1,
            ), False
        elif self.model_family == "xgboost":
            ensure_model_family_available('xgboost')
            return XGBClassifier(
                n_estimators=self.xgb_n_estimators, learning_rate=self.xgb_learning_rate,
                max_depth=self.xgb_max_depth, min_child_weight=self.xgb_min_child_weight,
                subsample=self.xgb_subsample, colsample_bytree=self.xgb_colsample_bytree,
                scale_pos_weight=self.xgb_scale_pos_weight,
                eval_metric="logloss", random_state=42, n_jobs=1,
            ), False
        elif self.model_family == "decision_tree":
            return DecisionTreeClassifier(
                max_depth=self.dt_max_depth,
                min_samples_leaf=self.dt_min_samples_leaf,
                class_weight='balanced', random_state=42,
            ), False
        elif self.model_family == "support_vector_machine":
            return SVC(
                C=self.svm_C, kernel=self.svm_kernel,
                probability=True, class_weight='balanced', random_state=42,
            ), True
        else:
            raise ValueError(f"Unknown model family: {self.model_family}")

    def fit(self, X, y):
        X = X.copy()
        model, scale_flag = self._build_model()
        use_vif_flag = False
        X_proc, X_model, artifacts = fit_preprocessing_pipeline(
            X_train=X, use_scaling=scale_flag, use_vif=use_vif_flag,
            vif_threshold=self.vif_threshold, winsorize=self.winsorize,
            lower_q=self.lower_q, upper_q=self.upper_q,
            variance_threshold=self.variance_threshold,
        )
        model.fit(X_model, y)
        self.model_ = model
        self.scale_flag_ = scale_flag
        self.artifacts_ = artifacts
        self.feature_names_ = artifacts["final_columns"]
        return self

    def predict_proba(self, X):
        X = X.copy()
        _, X_model = apply_preprocessing_pipeline(X, artifacts=self.artifacts_, use_scaling=self.scale_flag_)
        proba = self.model_.predict_proba(X_model)
        if proba.shape[1] == 1:
            s = proba[:, 0]
            return np.column_stack([1 - s, s])
        return proba

    def predict(self, X):
        proba = self.predict_proba(X)
        prob = proba[:, 1] if proba.shape[1] > 1 else proba[:, 0]
        return (prob >= CLASSIFICATION_THRESHOLD).astype(int)


# ==============================================================================
# NOTEBOOK FEATURE ENGINEERING (from Copper_Churn_v3.ipynb)
# ==============================================================================

def is_brightspeed_dataset(df):
    """Detect if this looks like the Brightspeed Copper Churn dataset."""
    required = {'snapshot_month', 'account_number', 'lifecycle_stage', 'service_type',
                'activation_date', 'bill_amount', 'trouble_ticket_volume', 'nps_score'}
    return required.issubset(set(df.columns))


def engineer_notebook_features(df, scoring_mode=False):
    """Replicate notebook Steps 6.1-6.10 feature engineering.

    Parameters
    ----------
    scoring_mode : bool
        When True, skip derivation of churn_flag_3m (the forward-looking target
        label).  Use this for production / point-in-time scoring where future
        churn outcomes are not yet known and must not be computed from the upload.
    """
    from sklearn.preprocessing import LabelEncoder
    _silent_print("[Feature Engineering] Running notebook pipeline...")

    df["snapshot_month"] = pd.to_datetime(df["snapshot_month"], errors="coerce")
    df["activation_date"] = pd.to_datetime(df["activation_date"], errors="coerce")
    df["commitment_end_date"] = pd.to_datetime(df["commitment_end_date"], errors="coerce")
    df = df.dropna(subset=["snapshot_month"]).copy()

    # Filter to Copper DSL
    if "service_type" in df.columns:
        df = df[df["service_type"] == COPPER_VALUE].copy()
        _silent_print(f"[Filter] Copper DSL only: {df.shape}")
    df = df.sort_values(["account_number", "snapshot_month"]).reset_index(drop=True)

    # Create lifecycle_stage_lower
    df["lifecycle_stage_lower"] = df["lifecycle_stage"].astype(str).str.lower()

    # Churn event month
    churn_month_map = (
        df.loc[df["lifecycle_stage_lower"] == "disconnected"]
          .groupby("account_number")["snapshot_month"]
          .min()
    )
    # pandas 3.x: .map(datetime_series) fails when the series is empty (tries to cast
    # DatetimeArray → float64 for NaN fill). Using .to_dict() + pd.to_datetime avoids
    # that dtype issue and ensures the result is always a proper datetime column (NaT
    # for accounts with no recorded churn month).
    df["churn_event_month"] = pd.to_datetime(
        df["account_number"].map(churn_month_map.to_dict()), errors="coerce"
    )

    # Months to churn
    df["months_to_churn"] = np.where(
        df["churn_event_month"].notna(),
        ((df["churn_event_month"].dt.year - df["snapshot_month"].dt.year) * 12
         + (df["churn_event_month"].dt.month - df["snapshot_month"].dt.month)),
        np.nan,
    )

    # 3-month forward churn target — only derive when training; skip in prod scoring
    if not scoring_mode:
        df[TARGET_COL] = np.where(
            (df["months_to_churn"] >= 1) & (df["months_to_churn"] <= LABEL_HORIZON_MONTHS), 1, 0
        )
        _silent_print(f"[Target] Distribution:\n{df[TARGET_COL].value_counts()}")
    else:
        _silent_print("[Target] Skipping churn_flag_3m derivation (scoring_mode=True)")

    # 6.1 Structural / lifecycle
    df["tenure_months"] = ((df["snapshot_month"] - df["activation_date"]).dt.days / 30).clip(lower=0)
    df["months_to_commitment_end"] = ((df["commitment_end_date"] - df["snapshot_month"]).dt.days / 30)
    df["months_to_commitment_end"] = df["months_to_commitment_end"].fillna(-999)
    df["near_contract_end_flag"] = np.where(
        (df["months_to_commitment_end"] >= 0) & (df["months_to_commitment_end"] <= 3), 1, 0
    )
    df["competitive_pressure"] = df["fiber_available_at_premises"] + df["competitor_broadband_available_by_address"]

    # 6.2 History coverage
    df["history_available_months"] = (df.groupby("account_number").cumcount() + 1).clip(upper=FEATURE_HISTORY_MONTHS)
    df["history_coverage_ratio_12m"] = (df["history_available_months"] / FEATURE_HISTORY_MONTHS).clip(upper=1.0)
    df["new_customer_flag"] = np.where(df["tenure_months"] < 12, 1, 0)

    # 6.3 Snapshot-level derived
    df["prev_bill"] = df.groupby("account_number")["bill_amount"].shift(1)
    df["bill_shock_flag"] = np.where(df["bill_amount"] > 1.2 * df["prev_bill"], 1, 0)
    df["bill_shock_flag"] = df["bill_shock_flag"].fillna(0)
    df["throughput_to_speed_ratio"] = (df["avg_delivered_throughput_mbps"] / df["subscribed_speed_mbps"]).replace([np.inf, -np.inf], 0).fillna(0)
    df["speed_gap_ratio"] = ((df["subscribed_speed_mbps"] - df["avg_delivered_throughput_mbps"]) / df["subscribed_speed_mbps"]).replace([np.inf, -np.inf], 0).fillna(0).clip(lower=0)
    df["revenue_per_speed"] = (df["mrc_data"] / df["subscribed_speed_mbps"]).replace([np.inf, -np.inf], 0).fillna(0)
    df["outage_severity"] = (df["network_outage_events"] * (df["network_outage_duration_minutes"] / 60)).fillna(0)

    # 6.4 Rolling 3m
    df["tickets_last_3m_sum"] = df.groupby("account_number")["trouble_ticket_volume"].rolling(3, min_periods=1).sum().reset_index(level=0, drop=True)
    df["outages_last_3m_sum"] = df.groupby("account_number")["network_outage_events"].rolling(3, min_periods=1).sum().reset_index(level=0, drop=True)
    df["bill_volatility_3m_std"] = df.groupby("account_number")["bill_amount"].rolling(3, min_periods=1).std().reset_index(level=0, drop=True).fillna(0)
    df["nps_3m_min"] = df.groupby("account_number")["nps_score"].rolling(3, min_periods=1).min().reset_index(level=0, drop=True)
    df["csat_3m_min"] = df.groupby("account_number")["csat_score"].rolling(3, min_periods=1).min().reset_index(level=0, drop=True)
    df["usage_3m_avg"] = df.groupby("account_number")["data_consumption_gb"].rolling(3, min_periods=1).mean().reset_index(level=0, drop=True)
    df["tickets_3m_avg"] = df.groupby("account_number")["trouble_ticket_volume"].rolling(3, min_periods=1).mean().reset_index(level=0, drop=True)

    # 6.5 Rolling 6m
    df["tickets_last_6m_sum"] = df.groupby("account_number")["trouble_ticket_volume"].rolling(6, min_periods=1).sum().reset_index(level=0, drop=True)
    df["outages_last_6m_sum"] = df.groupby("account_number")["network_outage_events"].rolling(6, min_periods=1).sum().reset_index(level=0, drop=True)
    df["bill_volatility_6m_std"] = df.groupby("account_number")["bill_amount"].rolling(6, min_periods=1).std().reset_index(level=0, drop=True).fillna(0)
    df["nps_6m_min"] = df.groupby("account_number")["nps_score"].rolling(6, min_periods=1).min().reset_index(level=0, drop=True)
    df["csat_6m_min"] = df.groupby("account_number")["csat_score"].rolling(6, min_periods=1).min().reset_index(level=0, drop=True)
    df["usage_6m_avg"] = df.groupby("account_number")["data_consumption_gb"].rolling(6, min_periods=1).mean().reset_index(level=0, drop=True)

    # 6.6 Rolling 12m
    df["tickets_last_12m_sum"] = df.groupby("account_number")["trouble_ticket_volume"].rolling(12, min_periods=1).sum().reset_index(level=0, drop=True)
    df["outages_last_12m_sum"] = df.groupby("account_number")["network_outage_events"].rolling(12, min_periods=1).sum().reset_index(level=0, drop=True)
    df["bill_volatility_12m_std"] = df.groupby("account_number")["bill_amount"].rolling(12, min_periods=1).std().reset_index(level=0, drop=True).fillna(0)
    df["nps_12m_min"] = df.groupby("account_number")["nps_score"].rolling(12, min_periods=1).min().reset_index(level=0, drop=True)
    df["csat_12m_min"] = df.groupby("account_number")["csat_score"].rolling(12, min_periods=1).min().reset_index(level=0, drop=True)
    df["usage_12m_avg"] = df.groupby("account_number")["data_consumption_gb"].rolling(12, min_periods=1).mean().reset_index(level=0, drop=True)
    df["bill_shock_last_12m_sum"] = df.groupby("account_number")["bill_shock_flag"].rolling(12, min_periods=1).sum().reset_index(level=0, drop=True)
    df["outage_severity_last_12m_sum"] = df.groupby("account_number")["outage_severity"].rolling(12, min_periods=1).sum().reset_index(level=0, drop=True)

    # 6.7 Trend / acceleration
    df["usage_mom_pct_change"] = df.groupby("account_number")["data_consumption_gb"].pct_change().replace([np.inf, -np.inf], 0).fillna(0)
    df["usage_drop_ratio_3m_vs_12m"] = ((df["usage_3m_avg"] - df["usage_12m_avg"]) / df["usage_12m_avg"].replace(0, np.nan)).replace([np.inf, -np.inf], 0).fillna(0)
    df["ticket_acceleration_3m_vs_12m"] = df["tickets_3m_avg"] - (df["tickets_last_12m_sum"] / 12.0)
    df["outage_acceleration_3m_vs_12m"] = (df["outages_last_3m_sum"] / 3.0) - (df["outages_last_12m_sum"] / 12.0)
    df["bill_volatility_acceleration_3m_vs_12m"] = df["bill_volatility_3m_std"] - df["bill_volatility_12m_std"]
    df["ticket_per_month"] = (df["trouble_ticket_volume"] / df["tenure_months"].replace(0, np.nan)).replace([np.inf, -np.inf], 0).fillna(0)

    # 6.8 Exposure-normalized
    df["ticket_per_active_month_12m"] = (df["tickets_last_12m_sum"] / df["history_available_months"].replace(0, np.nan)).replace([np.inf, -np.inf], 0).fillna(0)

    # 6.9 Tenure bucket
    df["tenure_bucket"] = pd.cut(
        df["tenure_months"], bins=[0, 6, 18, 36, 48, np.inf],
        labels=["new_customer", "early_growth", "established", "long_term", "very_long_term"],
        include_lowest=True,
    )
    le = LabelEncoder()
    df["tenure_bucket_encoded"] = le.fit_transform(df["tenure_bucket"].astype(str))

    # 6.10 Frustration / spike
    df["ticket_spike_ratio"] = (df["tickets_last_3m_sum"] / df["tickets_last_6m_sum"].replace(0, np.nan)).replace([np.inf, -np.inf], np.nan).fillna(0)
    df["outage_trend_ratio"] = (df["outages_last_3m_sum"] / df["outages_last_6m_sum"].replace(0, np.nan)).replace([np.inf, -np.inf], np.nan).fillna(0)
    df["usage_last_3m"] = df.groupby("account_number")["data_consumption_gb"].rolling(3, min_periods=1).mean().reset_index(level=0, drop=True)
    df["usage_last_6m"] = df.groupby("account_number")["data_consumption_gb"].rolling(6, min_periods=1).mean().reset_index(level=0, drop=True)
    df["usage_drop_ratio"] = (df["usage_last_3m"] / df["usage_last_6m"].replace(0, np.nan)).replace([np.inf, -np.inf], np.nan).fillna(1)
    df["fiber_speed_risk"] = df["fiber_available_at_premises"] * df["speed_gap_ratio"]
    df["service_frustration_index"] = df["ticket_spike_ratio"] + df["outage_trend_ratio"] + df["speed_gap_ratio"]
    df["frustration_acceleration"] = (df["service_frustration_index"] - df.groupby("account_number")["service_frustration_index"].shift(3)).fillna(0)

    _silent_print(f"[Feature Engineering] Complete! {len(df.columns)} columns")
    return df


def get_notebook_feature_columns():
    """Exact feature list from the notebook."""
    return [
        "fiber_available_at_premises", "competitor_broadband_available_by_address", "competitive_pressure",
        "tenure_months", "tenure_bucket_encoded", "new_customer_flag",
        "history_available_months", "history_coverage_ratio_12m",
        "months_to_commitment_end", "near_contract_end_flag",
        "network_outage_events", "trouble_ticket_volume", "repeat_issue_flag",
        "promo_expiration_flag", "price_increase_flag", "late_payment_flag",
        "collections_activity_flag", "bill_shock_flag", "speed_gap_ratio",
        "revenue_per_speed", "outage_severity",
        "tickets_last_3m_sum", "outages_last_3m_sum", "bill_volatility_3m_std",
        "nps_3m_min", "csat_3m_min",
        "tickets_last_6m_sum", "outages_last_6m_sum", "bill_volatility_6m_std",
        "nps_6m_min", "csat_6m_min",
        "tickets_last_12m_sum", "outages_last_12m_sum", "bill_volatility_12m_std",
        "nps_12m_min", "csat_12m_min", "bill_shock_last_12m_sum", "outage_severity_last_12m_sum",
        "usage_mom_pct_change", "usage_drop_ratio_3m_vs_12m",
        "ticket_acceleration_3m_vs_12m", "outage_acceleration_3m_vs_12m",
        "bill_volatility_acceleration_3m_vs_12m",
        "ticket_per_active_month_12m",
        "ticket_spike_ratio", "outage_trend_ratio", "usage_drop_ratio",
        "fiber_speed_risk", "service_frustration_index",
        "usage_3m_avg", "usage_6m_avg", "usage_12m_avg", "tickets_3m_avg",
        "frustration_acceleration", "ticket_per_month",
    ]


def build_notebook_modeling_base(df, feature_cols):
    """Build strict modeling base matching notebook Step 8."""
    all_months = sorted(pd.to_datetime(df["snapshot_month"].dropna().unique()))
    all_months = [pd.Timestamp(m) for m in all_months]

    if len(all_months) < (FEATURE_HISTORY_MONTHS + LABEL_HORIZON_MONTHS):
        _silent_print(f"[Modeling Base] Not enough months ({len(all_months)}), skipping strict filtering")
        return df, all_months

    first_full = all_months[FEATURE_HISTORY_MONTHS - 1]
    last_labelable = all_months[-(LABEL_HORIZON_MONTHS + 1)]

    model_df = df[
        (df["lifecycle_stage_lower"] == "active") &
        (df["tenure_months"] >= MIN_TENURE_MONTHS) &
        (df["snapshot_month"] >= first_full) &
        (df["snapshot_month"] <= last_labelable)
    ].copy()
    model_df = model_df.sort_values(["snapshot_month", "account_number"]).reset_index(drop=True)

    eligible_months = sorted(model_df["snapshot_month"].unique())
    eligible_months = [pd.Timestamp(m) for m in eligible_months]

    _silent_print(f"[Modeling Base] {model_df.shape[0]} rows, {len(eligible_months)} eligible months")
    _silent_print(f"[Modeling Base] Target: {model_df[TARGET_COL].value_counts().to_dict()}")
    return model_df, eligible_months


# ==============================================================================
# DATA PREPARATION
# ==============================================================================

def resolve_target_col(df, target_col):
    """Resolve target column name handling camelCase/snake_case variants."""
    if target_col in df.columns:
        return target_col
    import re
    snake = re.sub(r'(?<!^)(?=[A-Z])', '_', target_col).lower()
    if snake in df.columns:
        return snake
    for alias in [
        'is_churned', 'isChurned', 'churn', 'churned', 'target', 'label',
        'churn_flag_3m', 'service_deactivation_event'
    ]:
        if alias in df.columns:
            return alias
    return target_col


def derive_target_from_business_fields(df):
    """
    Derive churn label when explicit target column is missing.
    Priority follows notebook-style logic where available.
    Returns: (target_series, target_name)
    """
    # Notebook-style: churn in next 1-3 months from snapshot using churn_event_month.
    snap_col = None
    if 'snapshot_month' in df.columns:
        snap_col = 'snapshot_month'
    elif 'snapshotMonth' in df.columns:
        snap_col = 'snapshotMonth'

    if snap_col and 'churn_event_month' in df.columns:
        snap = pd.to_datetime(df[snap_col], errors='coerce')
        churn_m = pd.to_datetime(df['churn_event_month'], errors='coerce')
        months_to_churn = np.where(
            churn_m.notna() & snap.notna(),
            ((churn_m.dt.year - snap.dt.year) * 12 + (churn_m.dt.month - snap.dt.month)),
            np.nan,
        )
        y = ((months_to_churn >= 1) & (months_to_churn <= 3)).astype(int)
        if int(np.sum(y)) > 0:
            return pd.Series(y, index=df.index), 'churn_flag_3m_derived'

    # Direct deactivation flag fallback.
    if 'service_deactivation_event' in df.columns:
        raw = df['service_deactivation_event']
        if raw.dtype == object:
            y = raw.map(lambda v: 1 if str(v).lower() in ('1', 'true', 'yes') else 0).astype(int)
        else:
            y = raw.fillna(0).astype(int)
        if int(y.sum()) > 0:
            return pd.Series(y, index=df.index), 'service_deactivation_event'

    # Lifecycle fallback.
    if 'lifecycle_stage' in df.columns:
        stage = df['lifecycle_stage'].astype(str).str.lower()
        y = stage.isin(['disconnected', 'churned', 'deactivated', 'inactive']).astype(int)
        if int(y.sum()) > 0:
            return pd.Series(y, index=df.index), 'lifecycle_stage_derived'

    # Final fallback: churn_event_month non-null means churn happened at some point.
    if 'churn_event_month' in df.columns:
        y = pd.to_datetime(df['churn_event_month'], errors='coerce').notna().astype(int)
        return pd.Series(y, index=df.index), 'churn_event_month_derived'

    # No derivation possible.
    return pd.Series([0] * len(df), index=df.index), '__derived_target__'


def prepare_data(data, target_col='isChurned', custom_feature_names=None):
    """Convert input data to DataFrame and extract features/target.
    When Brightspeed-style columns are detected, runs the full notebook
    feature engineering + data filtering pipeline for parity."""
    df = pd.DataFrame(data)

    # --- Brightspeed notebook pipeline ---
    if is_brightspeed_dataset(df):
        _silent_print("[prepare_data] Brightspeed dataset detected -> running notebook pipeline")
        df = engineer_notebook_features(df)
        feature_cols = get_notebook_feature_columns()
        if custom_feature_names:
            feature_cols = feature_cols + [c for c in custom_feature_names if c not in feature_cols]
        # Only keep features that exist
        feature_cols = [c for c in feature_cols if c in df.columns]
        model_df, eligible_months = build_notebook_modeling_base(df, feature_cols)
        X = model_df[feature_cols].fillna(0)
        y = model_df[TARGET_COL].astype(int)
        target_col = TARGET_COL
        snapshot_col = 'snapshot_month'
        # Return model_df as df (for CV splitting) and full engineered df for latest-month scoring
        return X, y, feature_cols, model_df, True, snapshot_col, target_col, df

    # --- Generic fallback path ---
    target_col = resolve_target_col(df, target_col)
    numeric_cols = df.select_dtypes(include=[np.number]).columns.tolist()
    exclude_cols = [target_col, 'id', 'accountNumber', 'account_number', 'customer_id', 'name',
                    'email', 'phone', 'address', 'city', 'state', 'zipCode', 'snapshot_month', 'snapshotMonth']
    feature_cols = [c for c in numeric_cols if c not in exclude_cols]
    X = df[feature_cols].fillna(0)
    if target_col in df.columns:
        raw = df[target_col]
        if raw.dtype == object:
            y = raw.map(lambda v: 1 if str(v).lower() in ('1', 'true', 'yes') else 0).astype(int)
        else:
            y = raw.fillna(0).astype(int)
    else:
        y, derived_name = derive_target_from_business_fields(df)
        target_col = derived_name
        df[target_col] = y.astype(int)
        _silent_print(f"[Training] Derived target column '{target_col}' from business fields", file=sys.stderr)
    has_snapshot_month = 'snapshot_month' in df.columns or 'snapshotMonth' in df.columns
    snapshot_col = 'snapshot_month' if 'snapshot_month' in df.columns else ('snapshotMonth' if 'snapshotMonth' in df.columns else None)
    return X, y, feature_cols, df, has_snapshot_month, snapshot_col, target_col, df


# ==============================================================================
# HYPERPARAMETER HELPERS
# ==============================================================================

def map_custom_hyperparams(model_family, params):
    """Map unprefixed user hyperparams to ChurnPreprocessedEstimator prefixed names."""
    def coerce_param_value(v):
        if not isinstance(v, str):
            return v
        t = v.strip()
        if t.lower() in ('none', 'null'):
            return None
        if t.lower() == 'true':
            return True
        if t.lower() == 'false':
            return False
        try:
            if t.isdigit() or (t.startswith('-') and t[1:].isdigit()):
                return int(t)
            return float(t)
        except Exception:
            return v

    if not params:
        return {}
    prefix_maps = {
        'rf': {
            'n_estimators': 'rf_n_estimators', 'max_depth': 'rf_max_depth',
            'min_samples_leaf': 'rf_min_samples_leaf', 'class_weight': 'rf_class_weight',
            'max_features': 'rf_max_features',
        },
        'lightgbm': {
            'n_estimators': 'lgbm_n_estimators', 'learning_rate': 'lgbm_learning_rate',
            'num_leaves': 'lgbm_num_leaves', 'min_child_samples': 'lgbm_min_child_samples',
            'subsample': 'lgbm_subsample', 'colsample_bytree': 'lgbm_colsample_bytree',
            'class_weight': 'lgbm_class_weight',
        },
        'xgboost': {
            'n_estimators': 'xgb_n_estimators', 'learning_rate': 'xgb_learning_rate',
            'max_depth': 'xgb_max_depth', 'min_child_weight': 'xgb_min_child_weight',
            'subsample': 'xgb_subsample', 'colsample_bytree': 'xgb_colsample_bytree',
            'scale_pos_weight': 'xgb_scale_pos_weight',
        },
        'decision_tree': {
            'max_depth': 'dt_max_depth',
            'min_samples_leaf': 'dt_min_samples_leaf',
        },
        'support_vector_machine': {
            'C': 'svm_C',
            'kernel': 'svm_kernel',
        },
    }
    pmap = prefix_maps.get(model_family, {})
    valid_keys = set(ChurnPreprocessedEstimator().get_params().keys())
    result = {}
    for k, v in params.items():
        new_k = pmap.get(k, k)
        if new_k in valid_keys:
            result[new_k] = coerce_param_value(v)
    return result


def get_auto_param_grid(model_family, stage='refine'):
    """Per-family grid for Auto hyperparameter tuning with coarse/refine stages."""
    if stage not in ('coarse', 'refine'):
        raise ValueError(f"Unknown tuning stage: {stage}")

    if model_family == "rf":
        if stage == 'coarse':
            return {
                'model_family': ['rf'],
                'rf_n_estimators': [150],
                'rf_max_depth': [6],
                'rf_min_samples_leaf': [10],
                'rf_class_weight': ['balanced'],
                'rf_max_features': ['sqrt'],
            }
        return {
            'model_family': ['rf'],
            'rf_n_estimators': [200, 300],
            'rf_max_depth': [6, 8, None],
            'rf_min_samples_leaf': [5, 10],
            'rf_class_weight': ['balanced'],
            'rf_max_features': ['sqrt'],
        }
    elif model_family == "lightgbm":
        if stage == 'coarse':
            return {
                'model_family': ['lightgbm'],
                'lgbm_n_estimators': [150],
                'lgbm_learning_rate': [0.05],
                'lgbm_num_leaves': [31],
                'lgbm_min_child_samples': [20],
                'lgbm_subsample': [0.8],
                'lgbm_colsample_bytree': [0.8],
                'lgbm_class_weight': ['balanced'],
            }
        return {
            'model_family': ['lightgbm'],
            'lgbm_n_estimators': [200, 300],
            'lgbm_learning_rate': [0.03, 0.05],
            'lgbm_num_leaves': [31, 63],
            'lgbm_min_child_samples': [20, 50],
            'lgbm_subsample': [0.8, 1.0],
            'lgbm_colsample_bytree': [0.8, 1.0],
            'lgbm_class_weight': ['balanced'],
        }
    elif model_family == "xgboost":
        if stage == 'coarse':
            return {
                'model_family': ['xgboost'],
                'xgb_n_estimators': [150],
                'xgb_learning_rate': [0.05],
                'xgb_max_depth': [4],
                'xgb_min_child_weight': [1],
                'xgb_subsample': [0.8],
                'xgb_colsample_bytree': [0.8],
                'xgb_scale_pos_weight': [10],
            }
        return {
            'model_family': ['xgboost'],
            'xgb_n_estimators': [200, 300],
            'xgb_learning_rate': [0.03, 0.05],
            'xgb_max_depth': [4, 6],
            'xgb_min_child_weight': [1, 5],
            'xgb_subsample': [0.8, 1.0],
            'xgb_colsample_bytree': [0.8, 1.0],
            'xgb_scale_pos_weight': [10, 20],
        }
    elif model_family == "decision_tree":
        if stage == 'coarse':
            return {
                'model_family': ['decision_tree'],
                'dt_max_depth': [6],
                'dt_min_samples_leaf': [10],
            }
        return {
            'model_family': ['decision_tree'],
            'dt_max_depth': [4, 6, 8, None],
            'dt_min_samples_leaf': [5, 10, 20],
        }
    elif model_family == "support_vector_machine":
        if stage == 'coarse':
            return {
                'model_family': ['support_vector_machine'],
                'svm_C': [1.0],
                'svm_kernel': ['rbf'],
            }
        return {
            'model_family': ['support_vector_machine'],
            'svm_C': [0.1, 1.0, 10.0],
            'svm_kernel': ['rbf', 'linear'],
        }
    else:
        raise ValueError(f"Unknown model family: {model_family}")


def extract_cv_summary(grid_search, n_folds):
    """Extract per-fold CV stats from GridSearchCV for the best estimator."""
    best_idx = grid_search.best_index_
    cv_res = grid_search.cv_results_

    def fold_scores(metric):
        out = []
        for i in range(n_folds):
            key = f'split{i}_test_{metric}'
            arr = cv_res.get(key)
            out.append(safe_float(arr[best_idx]) if arr is not None and best_idx < len(arr) else None)
        return out

    # Build top-5 candidates summary
    n_candidates = len(cv_res.get('params', []))
    ranks = cv_res.get('rank_test_lift_top10', list(range(n_candidates)))
    top5_idx = sorted(range(n_candidates), key=lambda i: (ranks[i] if i < len(ranks) else 9999))[:5]
    top_candidates = []
    for i in top5_idx:
        top_candidates.append({
            'rank': int(ranks[i]) if i < len(ranks) else i + 1,
            'params': {k: str(v) for k, v in cv_res['params'][i].items()},
            'meanAUC': safe_float(cv_res['mean_test_auc'][i]),
            'meanLift10': safe_float(cv_res['mean_test_lift_top10'][i]),
            'meanRecall10': safe_float(cv_res['mean_test_recall_top10'][i]),
        })

    return {
        'nFolds': n_folds,
        'nCandidates': n_candidates,
        'bestScore': safe_float(grid_search.best_score_),
        'bestParams': {k: str(v) for k, v in grid_search.best_params_.items()},
        'foldAUC': fold_scores('auc'),
        'meanAUC': safe_float(cv_res['mean_test_auc'][best_idx]),
        'stdAUC': safe_float(cv_res['std_test_auc'][best_idx]),
        'foldLift10': fold_scores('lift_top10'),
        'meanLift10': safe_float(cv_res['mean_test_lift_top10'][best_idx]),
        'foldRecall10': fold_scores('recall_top10'),
        'meanRecall10': safe_float(cv_res['mean_test_recall_top10'][best_idx]),
        'topCandidates': top_candidates,
    }


def compute_test_metrics(algorithm, best_model, best_params, X_test, y_test,
                         train_size, test_size, cv_summary=None,
                         X_train=None, y_train=None):
    """Evaluate fitted model and return JSON-safe train+test metrics."""

    def eval_split(X_eval, y_eval):
        y_prob_full = best_model.predict_proba(X_eval)
        y_prob = y_prob_full[:, 1] if y_prob_full.shape[1] > 1 else y_prob_full[:, 0]

        # Keep a fixed manual threshold to match notebook behavior.
        optimal_threshold = float(CLASSIFICATION_THRESHOLD)

        y_pred = (y_prob >= optimal_threshold).astype(int)

        out = {
            'accuracy': safe_float(accuracy_score(y_eval, y_pred)),
            'precision': safe_float(precision_score(y_eval, y_pred, zero_division=0)),
            'recall': safe_float(recall_score(y_eval, y_pred, zero_division=0)),
            'f1Score': safe_float(f1_score(y_eval, y_pred, zero_division=0)),
            'auc': safe_float(roc_auc_score(y_eval, y_prob) if len(np.unique(y_eval)) > 1 else 0.0),
            'optimalThreshold': safe_float(optimal_threshold),
        }
        tmp_df = pd.DataFrame({'prob': y_prob, 'y': y_eval})
        for pct, key in [(0.10, '10'), (0.20, '20')]:
            m = recall_at_top_percent(tmp_df, 'prob', 'y', pct)
            out[f'liftTop{key}'] = safe_float(m['lift_at_top_pct'])
            out[f'recallTop{key}'] = safe_float(m['recall_at_top_pct'])
            out[f'precisionTop{key}'] = safe_float(m['precision_at_top_pct'])
        return out, y_pred

    test_out, y_pred_test = eval_split(X_test, y_test)

    metrics = {
        'algorithm': algorithm,
        'accuracy': test_out['accuracy'],
        'precision': test_out['precision'],
        'recall': test_out['recall'],
        'f1Score': test_out['f1Score'],
        'auc': test_out['auc'],
        'optimalThreshold': test_out.get('optimalThreshold'),
        'liftTop10': test_out['liftTop10'],
        'recallTop10': test_out['recallTop10'],
        'precisionTop10': test_out['precisionTop10'],
        'liftTop20': test_out['liftTop20'],
        'recallTop20': test_out['recallTop20'],
        'precisionTop20': test_out['precisionTop20'],
        'bestParams': {k: str(v) for k, v in (best_params or {}).items()},
        'trainSize': int(train_size),
        'testSize': int(test_size),
    }

    if X_train is not None and y_train is not None:
        train_out, _ = eval_split(X_train, y_train)
        metrics['trainMetrics'] = train_out

    # Feature importance
    final_features = best_model.feature_names_
    underlying_model = best_model.model_
    if hasattr(underlying_model, 'feature_importances_'):
        fi = underlying_model.feature_importances_
    elif hasattr(underlying_model, 'coef_'):
        fi = np.abs(underlying_model.coef_[0])
    else:
        fi = np.zeros(len(final_features))

    metrics['featureImportance'] = sorted(
        [{'name': final_features[i], 'importance': safe_float(fi[i]) or 0.0}
         for i in range(min(len(final_features), len(fi)))],
        key=lambda x: x['importance'], reverse=True
    )

    cm = confusion_matrix(y_test, y_pred_test)
    if cm.shape == (2, 2):
        metrics['confusionMatrix'] = {
            'tn': int(cm[0, 0]), 'fp': int(cm[0, 1]),
            'fn': int(cm[1, 0]), 'tp': int(cm[1, 1])
        }
    else:
        metrics['confusionMatrix'] = {'tn': 0, 'fp': 0, 'fn': 0, 'tp': 0}

    if cv_summary is not None:
        metrics['cvSummary'] = cv_summary

    auc_val = metrics['auc'] or 0
    lift_val = metrics['liftTop10'] or 0
    _silent_print(f"[Training] Complete! AUC: {auc_val:.4f}, Lift@10%: {lift_val:.2f}x")
    return metrics




# ==============================================================================
# PRODUCTION DATA SCORING (run trained model on a different prod dataset)
# ==============================================================================

def score_prod_data(best_model, df_prod_full, feature_cols, snapshot_col='snapshot_month', label_col=None):
    """
    Score production data using the already-trained best_model.
    Applies the same latest-active-snapshot filtering as score_latest_active_customers.
    Additionally computes AUC / Accuracy / Recall / F1 if labels are available.
    Returns: (predictions_list, metrics_dict)
    """
    shap_mod = None
    try:
        import shap as shap_mod
    except ImportError:
        sys.stderr.write("[score_prod_data] shap not installed; using zero-SHAP fallback\n")

    predictions = []
    eval_metrics = {}

    try:
        if df_prod_full is None or len(df_prod_full) == 0:
            return [], {}

        df_sc = df_prod_full.copy()

        # ── filter to latest snapshot + active + min tenure (same as scoring) ──
        if snapshot_col and snapshot_col in df_sc.columns:
            df_sc[snapshot_col] = pd.to_datetime(df_sc[snapshot_col], errors='coerce')
            latest_month = df_sc[snapshot_col].dropna().max()
            if not pd.isna(latest_month):
                if 'lifecycle_stage_lower' not in df_sc.columns and 'lifecycle_stage' in df_sc.columns:
                    df_sc['lifecycle_stage_lower'] = df_sc['lifecycle_stage'].astype(str).str.lower()
                mask = df_sc[snapshot_col] == latest_month
                if 'lifecycle_stage_lower' in df_sc.columns:
                    mask = mask & (df_sc['lifecycle_stage_lower'] == 'active')
                if 'tenure_months' in df_sc.columns:
                    mask = mask & (df_sc['tenure_months'] >= MIN_TENURE_MONTHS)
                df_sc = df_sc[mask].copy().reset_index(drop=True)

        if df_sc.empty:
            sys.stderr.write("[score_prod_data] No rows pass latest-active filter for prod data\n")
            return [], {}

        avail_cols = [c for c in feature_cols if c in df_sc.columns]
        # pandas 3.x: keep only numeric-compatible columns to avoid DatetimeArray cast errors
        avail_cols = [c for c in avail_cols
                      if pd.api.types.is_numeric_dtype(df_sc[c])
                      or pd.api.types.is_bool_dtype(df_sc[c])]
        if not avail_cols:
            sys.stderr.write("[score_prod_data] No feature columns found in prod data\n")
            return [], {}

        X_prod = df_sc[avail_cols].fillna(0)

        # Score with trained model (preprocessing artifacts applied internally)
        probs = best_model.predict_proba(X_prod)[:, 1]

        # SHAP explanations
        X_prod_proc, _ = apply_preprocessing_pipeline(
            X_prod, artifacts=best_model.artifacts_, use_scaling=best_model.scale_flag_
        )
        training_columns = best_model.feature_names_
        underlying_model = best_model.model_

        if shap_mod is not None:
            try:
                explainer = shap_mod.TreeExplainer(underlying_model)
                shap_raw = explainer.shap_values(X_prod_proc)
                if isinstance(shap_raw, list):
                    shap_matrix = shap_raw[1] if len(shap_raw) == 2 else shap_raw[0]
                elif isinstance(shap_raw, np.ndarray) and shap_raw.ndim == 3:
                    shap_matrix = shap_raw[:, :, 1]
                else:
                    shap_matrix = shap_raw
            except Exception as shap_err:
                sys.stderr.write(f"[score_prod_data] SHAP error: {shap_err}; using zero SHAP\n")
                shap_matrix = np.zeros((len(X_prod_proc), len(training_columns)))
        else:
            shap_matrix = np.zeros((len(X_prod_proc), len(training_columns)))

        account_col = 'account_number' if 'account_number' in df_sc.columns else None
        proc_cols = list(X_prod_proc.columns)

        # Build raw predictions list (pre-sort — needed to align with original probs array)
        raw_preds = []
        for i in range(len(df_sc)):
            raw_acct = df_sc.iloc[i][account_col] if account_col else i
            try:
                acct = str(int(float(str(raw_acct))))
            except (ValueError, TypeError):
                acct = str(raw_acct).strip()

            prob = float(probs[i])
            sv = shap_matrix[i] if i < len(shap_matrix) else np.zeros(len(training_columns))
            shap_series = pd.Series(sv, index=training_columns)
            positive_shap = shap_series[shap_series > 0].sort_values(ascending=False)

            top_drivers, top_names = [], []
            for feat, shap_val in positive_shap.head(3).items():
                feat_val = float(X_prod_proc.iloc[i][feat]) if feat in proc_cols else 0.0
                top_drivers.append({'feature': feat, 'value': feat_val,
                                    'shapValue': float(shap_val), 'impact': 'increases risk'})
                top_names.append(feat)

            if not top_names:
                top_names = ['No strong positive driver']

            raw_preds.append({
                'account_number': acct,
                'churn_probability': prob,
                'top3Drivers': top_drivers,
                'top3DriversStr': ', '.join(top_names),
                '_row_idx': i,   # keep to align with df_sc rows for metrics
            })

        # Sort descending → assign probability-based risk bands
        raw_preds.sort(key=lambda r: r['churn_probability'], reverse=True)
        for pred in raw_preds:
            pred['riskBand'] = classify_risk_band_from_probability(pred['churn_probability'])

        # Remove internal helper key
        predictions = [{k: v for k, v in p.items() if k != '_row_idx'} for p in raw_preds]

        # ── Evaluation metrics vs prod labels ──
        # Intentionally exclude 'churn_flag_3m' / TARGET_COL / 'churn_flag_3m_derived':
        # those are derived from the upload itself during training FE and must NOT be
        # treated as externally-verified labels for production evaluation.
        resolved_label_col = None
        for try_col in [label_col, 'is_churned', 'ischurned', 'isChurned']:
            if try_col and try_col in df_sc.columns:
                resolved_label_col = try_col
                break

        if resolved_label_col:
            raw_labels = df_sc[resolved_label_col]
            if raw_labels.dtype == object:
                y_true_arr = raw_labels.map(lambda v: 1 if str(v).lower() in ('1', 'true', 'yes') else 0).astype(int).values
            else:
                y_true_arr = raw_labels.fillna(0).astype(int).values

            # Use probs array (same order as df_sc rows)
            y_prob_arr = probs.copy()

            # Build aligned pairs (drop rows whose account wasn't in predictions — shouldn't happen)
            acct_set = {p['account_number'] for p in predictions}
            acct_list = []
            for i in range(len(df_sc)):
                raw_acct = df_sc.iloc[i][account_col] if account_col else i
                try:
                    acct = str(int(float(str(raw_acct))))
                except:
                    acct = str(raw_acct).strip()
                acct_list.append(acct)

            valid_mask = np.array([a in acct_set for a in acct_list])
            y_true_valid = y_true_arr[valid_mask]
            y_prob_valid = y_prob_arr[valid_mask]

            if len(y_true_valid) >= 5:
                y_pred_valid = (y_prob_valid >= CLASSIFICATION_THRESHOLD).astype(int)
                n_pos = int(y_true_valid.sum())
                n_neg = len(y_true_valid) - n_pos

                auc_val = None
                if n_pos > 0 and n_neg > 0:
                    try:
                        auc_val = safe_float(roc_auc_score(y_true_valid, y_prob_valid))
                    except Exception:
                        pass

                eval_metrics = {
                    'auc': auc_val,
                    'accuracy': safe_float(accuracy_score(y_true_valid, y_pred_valid)),
                    'recall': safe_float(recall_score(y_true_valid, y_pred_valid, zero_division=0)),
                    'precision': safe_float(precision_score(y_true_valid, y_pred_valid, zero_division=0)),
                    'f1Score': safe_float(f1_score(y_true_valid, y_pred_valid, zero_division=0)),
                    'nEvaluated': len(y_true_valid),
                    'positiveCount': n_pos,
                    'negativeCount': n_neg,
                    'labelColumn': resolved_label_col,
                }
                sys.stderr.write(
                    f"[score_prod_data] Metrics: AUC={eval_metrics.get('auc')}, "
                    f"Acc={eval_metrics.get('accuracy')}, Recall={eval_metrics.get('recall')}, "
                    f"n={len(y_true_valid)}\n"
                )

    except Exception as e:
        import traceback
        sys.stderr.write(f"[score_prod_data] Error: {e}\n{traceback.format_exc()}\n")

    return predictions, eval_metrics


def main_score_prod(input_data, output_file, algorithm):
    """
    mode=score_prod: Re-train on trainData with stored hyperparameters, then
    score prodData, return predictions + full evaluation metrics vs prod labels.
    """
    train_data = input_data.get('trainData', [])
    prod_data = input_data.get('prodData', [])
    target_col = input_data.get('targetColumn', 'isChurned')
    custom_hyperparams = input_data.get('hyperparameters', None)
    custom_feature_names = input_data.get('customFeatureNames', [])

    if not train_data:
        raise ValueError("trainData is required for score_prod mode")
    if not prod_data:
        raise ValueError("prodData is required for score_prod mode")

    # ── 1. Prepare training data + fit model ──
    X, y, feature_cols, df, has_snapshot_month, snapshot_col, resolved_target_col, df_full = prepare_data(
        train_data, target_col, custom_feature_names
    )

    if len(X) == 0:
        raise ValueError("No valid features in training data")

    n_classes = int(pd.Series(y).nunique())
    if n_classes < 2:
        raise ValueError(
            f"Training target has single class only ({int(y.sum())}/{len(y)} positives). "
            "Cannot fit a meaningful model."
        )

    # Determine model family from algorithm string
    algo_lower = (algorithm or '').lower()
    if 'xgboost' in algo_lower or 'xgb' in algo_lower:
        model_family = 'xgboost'
    elif 'lightgbm' in algo_lower or 'lgbm' in algo_lower:
        model_family = 'lightgbm'
    else:
        model_family = 'rf'

    ensure_model_family_available(model_family)

    # Map stored hyperparameters → ChurnPreprocessedEstimator prefixed params
    mapped_params = map_custom_hyperparams(model_family, custom_hyperparams or {})
    estimator_params = {k: v for k, v in {'model_family': model_family, **mapped_params}.items()
                        if k in ChurnPreprocessedEstimator().get_params().keys()}

    sys.stderr.write(
        f"[score_prod] Fitting {model_family} on {len(X)} training rows "
        f"with params: {estimator_params}\n"
    )

    best_model = ChurnPreprocessedEstimator(**estimator_params)
    best_model.fit(X, y)

    # ── 2. Prepare prod data with same feature engineering ──
    # Use scoring_mode=True so churn_flag_3m is NOT derived from the upload.
    # Full history is still used for rolling/lag features; only the target is skipped.
    df_prod = pd.DataFrame(prod_data)
    if is_brightspeed_dataset(df_prod):
        df_prod = engineer_notebook_features(df_prod, scoring_mode=True)
        sys.stderr.write(f"[score_prod] Brightspeed FE applied to prod data (scoring_mode): {df_prod.shape}\n")

    # ── 3. Score prod data + compute metrics ──
    effective_snapshot_col = snapshot_col or 'snapshot_month'
    predictions, prod_metrics = score_prod_data(
        best_model, df_prod, feature_cols,
        snapshot_col=effective_snapshot_col,
        label_col=resolved_target_col,
    )

    sys.stderr.write(f"[score_prod] {len(predictions)} predictions generated\n")

    output_data = safe_serialize({
        'success': True,
        'algorithm': algorithm,
        'nPredicted': len(predictions),
        'predictions': predictions,
        'metrics': prod_metrics,
    })

    with open(output_file, 'w') as f:
        json.dump(output_data, f, indent=2)

    auc_str = f', AUC={prod_metrics["auc"]:.4f}' if prod_metrics.get('auc') else ''
    sys.stdout.write(json.dumps({
        'success': True,
        'message': f'Prod scoring complete: {len(predictions)} predictions{auc_str}',
    }) + "\n")
    sys.stdout.flush()


# ==============================================================================
# LATEST ACTIVE CUSTOMER SCORING (mirrors notebook Step 23)
# ==============================================================================

def score_latest_active_customers(best_model, df_full, feature_cols, snapshot_col='snapshot_month'):
    """
    Score active customers in the latest snapshot month using the already-trained best_model.
    Mirrors notebook Step 23: active + min tenure, latest month, positive-SHAP top-3 drivers.
    Returns a list of dicts ready to include in JSON output.
    """
    shap_mod = None
    try:
        import shap as shap_mod
    except ImportError:
        sys.stderr.write("[score_latest_active] shap not installed; continuing with zero-SHAP fallback\n")

    try:
        if df_full is None or snapshot_col not in df_full.columns:
            return []

        df_sc = df_full.copy()
        df_sc[snapshot_col] = pd.to_datetime(df_sc[snapshot_col], errors='coerce')
        latest_month = df_sc[snapshot_col].dropna().max()
        if pd.isna(latest_month):
            return []

        if 'lifecycle_stage_lower' not in df_sc.columns and 'lifecycle_stage' in df_sc.columns:
            df_sc['lifecycle_stage_lower'] = df_sc['lifecycle_stage'].astype(str).str.lower()

        tenure_col = 'tenure_months'
        if tenure_col not in df_sc.columns:
            return []

        mask = df_sc[snapshot_col] == latest_month
        if 'lifecycle_stage_lower' in df_sc.columns:
            mask = mask & (df_sc['lifecycle_stage_lower'] == 'active')
        mask = mask & (df_sc[tenure_col] >= MIN_TENURE_MONTHS)

        latest_df = df_sc[mask].copy().reset_index(drop=True)
        if latest_df.empty:
            return []

        avail_cols = [c for c in feature_cols if c in latest_df.columns]
        # pandas 3.x: keep only numeric-compatible columns
        avail_cols = [c for c in avail_cols
                      if pd.api.types.is_numeric_dtype(latest_df[c])
                      or pd.api.types.is_bool_dtype(latest_df[c])]
        if not avail_cols:
            return []

        X_latest = latest_df[avail_cols].fillna(0)

        # Score with the SAME trained model (its stored preprocessing is applied internally)
        probs = best_model.predict_proba(X_latest)[:, 1]

        # Compute SHAP using stored preprocessing artifacts (no leakage)
        X_latest_proc, _ = apply_preprocessing_pipeline(
            X_latest, artifacts=best_model.artifacts_, use_scaling=best_model.scale_flag_
        )
        training_columns = best_model.feature_names_
        underlying_model = best_model.model_

        if shap_mod is not None:
            try:
                explainer = shap_mod.TreeExplainer(underlying_model)
                shap_raw = explainer.shap_values(X_latest_proc)
                if isinstance(shap_raw, list):
                    shap_matrix = shap_raw[1] if len(shap_raw) == 2 else shap_raw[0]
                elif isinstance(shap_raw, np.ndarray) and shap_raw.ndim == 3:
                    shap_matrix = shap_raw[:, :, 1]
                else:
                    shap_matrix = shap_raw
            except Exception as shap_err:
                sys.stderr.write(f"[score_latest_active] SHAP error: {shap_err}; using zero SHAP\n")
                shap_matrix = np.zeros((len(X_latest_proc), len(training_columns)))
        else:
            shap_matrix = np.zeros((len(X_latest_proc), len(training_columns)))

        account_col = 'account_number' if 'account_number' in latest_df.columns else None
        proc_cols = list(X_latest_proc.columns)

        results = []
        for i in range(len(latest_df)):
            # Normalize account number: prevent '1001.0' vs '1001' mismatch after JSON round-trip
            raw_acct = latest_df.iloc[i][account_col] if account_col else i
            try:
                acct = str(int(float(str(raw_acct))))
            except (ValueError, TypeError):
                acct = str(raw_acct).strip()

            prob = float(probs[i])

            sv = shap_matrix[i] if i < len(shap_matrix) else np.zeros(len(training_columns))
            shap_series = pd.Series(sv, index=training_columns)
            positive_shap = shap_series[shap_series > 0].sort_values(ascending=False)

            top_drivers, top_names, top_detailed = [], [], []
            for feat, shap_val in positive_shap.head(3).items():
                feat_val = float(X_latest_proc.iloc[i][feat]) if feat in proc_cols else 0.0
                top_drivers.append({
                    'feature': feat, 'value': feat_val,
                    'shapValue': float(shap_val), 'impact': 'increases risk'
                })
                top_names.append(feat)
                top_detailed.append(f"{feat} ({float(shap_val):.4f})")

            if not top_names:
                top_names = ['No strong positive driver']
                top_detailed = ['No strong positive driver']

            results.append({
                'account_number': acct,
                'churn_probability': prob,
                'top3Drivers': top_drivers,
                'top3DriversStr': ', '.join(top_names),
                'top3DriversDetailed': ', '.join(top_detailed),
            })

        # ---------------------------------------------------------------
        # SCORE-RANK-BASED RISK BANDS + HYBRID GROQ/RULE RECOMMENDATIONS
        # Matches the notebook logic: bands are assigned by descending churn-probability rank.
        # ---------------------------------------------------------------
        results.sort(key=lambda r: r['churn_probability'], reverse=True)
        n_results = len(results)

        def _derive_driver_types(top_str):
            t = str(top_str).lower()
            types = []
            if any(k in t for k in ['ticket', 'outage', 'csat', 'nps', 'frustration', 'repeat_issue', 'speed_gap']):
                types.append('service_issue')
            if any(k in t for k in ['revenue', 'bill', 'price', 'bill_shock', 'price_increase', 'late_payment', 'collections']):
                types.append('pricing_value')
            if any(k in t for k in ['usage', 'engagement', 'drop', 'usage_mom']):
                types.append('engagement_drop')
            if any(k in t for k in ['contract', 'commitment', 'near_contract_end', 'months_to_commitment_end']):
                types.append('contract_renewal')
            return types if types else ['mixed_other']

        def _rule_based_rec(risk_band, driver_types):
            if risk_band == 'Low Risk':
                return 'Monitor with digital nudges only.'
            has_service   = 'service_issue'    in driver_types
            has_pricing   = 'pricing_value'    in driver_types
            has_engagement= 'engagement_drop'  in driver_types
            has_contract  = 'contract_renewal' in driver_types
            if has_service and has_pricing:
                return 'Fix service then optimize pricing.'
            if has_service:
                return 'Immediate service recovery outreach.'
            if has_pricing and has_contract:
                return 'Offer renewal with plan optimization.'
            if has_pricing:
                return 'Run targeted pricing value review.'
            if has_engagement:
                return 'Launch proactive re-engagement nudges.'
            if has_contract:
                return 'Start early renewal outreach now.'
            return ('Immediate manual retention outreach.'
                    if risk_band in ('Very High Risk', 'High Risk')
                    else 'Proactive retention outreach recommended.')

        def _enforce_max_words(text, max_words=5):
            cleaned = str(text or '').replace('\n', ' ').replace('\r', ' ')
            cleaned = ' '.join(cleaned.split())
            if not cleaned:
                return ''
            words = cleaned.split(' ')
            clipped = ' '.join(words[:max_words]).strip(' .,:;!-')
            return clipped

        # Try Groq LLM for Very High / High / Medium (notebook Step 24 hybrid logic)
        groq_client = None
        groq_api_key = os.environ.get('GROQ_API_KEY', '').strip()
        if groq_api_key:
            try:
                import groq as _groq_mod
                groq_client = _groq_mod.Groq(api_key=groq_api_key)
            except Exception:
                pass

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

        import time as _time
        for r in results:
            risk_band = classify_risk_band_from_probability(r['churn_probability'])
            r['riskBand'] = risk_band

            driver_types = _derive_driver_types(r.get('top3DriversStr', ''))

            if groq_client and risk_band in ('Very High Risk', 'High Risk', 'Medium Risk'):
                try:
                    payload = {
                        'account_number': r['account_number'],
                        'predicted_churn_probability_next_3m': r['churn_probability'],
                        'risk_band': risk_band,
                        'top_3_shap_drivers_str': r.get('top3DriversStr', ''),
                        'primary_driver_type': driver_types[0] if driver_types else 'mixed_other',
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
                    resp = groq_client.chat.completions.create(
                        model='moonshotai/kimi-k2-instruct-0905',
                        temperature=0.2,
                        max_tokens=15,
                        messages=[
                            {'role': 'system', 'content': GROQ_SYSTEM},
                            {'role': 'user', 'content': user_prompt},
                        ]
                    )
                    rec = resp.choices[0].message.content.strip().strip('"').strip('`').strip()
                    rec = _enforce_max_words(rec, max_words=5)
                    if not rec:
                        rec = _rule_based_rec(risk_band, driver_types)
                    r['finalRecommendation'] = rec
                    _time.sleep(0.3)
                except Exception as _ge:
                    r['finalRecommendation'] = _enforce_max_words(_rule_based_rec(risk_band, driver_types), max_words=5)
            else:
                r['finalRecommendation'] = _enforce_max_words(_rule_based_rec(risk_band, driver_types), max_words=5)

        groq_used   = groq_client is not None
        llm_count   = sum(1 for r in results if r.get('riskBand') in ('Very High Risk', 'High Risk', 'Medium Risk'))
        _silent_print(f"[score_latest_active] Scored {len(results)} customers for month {latest_month}, Groq={'yes' if groq_used else 'no (rule-based fallback)'}, LLM-eligible={llm_count}")
        return results

    except Exception as e:
        sys.stderr.write(f"[score_latest_active_customers] Error: {e}\n")
        sys.stderr.flush()
        return []

# ==============================================================================
# MAIN TRAINING FUNCTION
# ==============================================================================

def train_single_model(algorithm, X, y, feature_cols, custom_params=None, df=None,
                       has_snapshot_month=False, snapshot_col=None, target_col='isChurned',
                       use_grid_search=True):
    """
    Train a single model.
    - custom_params provided + use_grid_search=False  â†’ direct training with given hyperparams.
    - otherwise                                        â†’ GridSearchCV with CV summary output.
    """
    algo_to_family = {
        'Random Forest': 'rf',
        'LightGBM': 'lightgbm',
        'XGBoost': 'xgboost',
        'Decision Tree': 'decision_tree',
        'Support Vector Machine': 'support_vector_machine',
    }
    model_family = algo_to_family.get(algorithm)
    if model_family is None:
        raise ValueError(
            f"Algorithm '{algorithm}' is not supported. "
            "Supported algorithms: Random Forest, LightGBM, XGBoost, Decision Tree, Support Vector Machine, Auto"
        )

    _silent_print(f"\n[Training] Algorithm: {algorithm} (family: {model_family})")
    _silent_print(f"[Training] Features: {len(feature_cols)}, Samples: {len(X)}, Churners: {int(y.sum())}")

    # ==== CASE A: Custom hyperparams â€” single-candidate GridSearchCV for parity ====
    if custom_params and not use_grid_search:
        _silent_print(f"[Training] Custom hyperparams provided â€” running single-candidate GridSearchCV")
        mapped = map_custom_hyperparams(model_family, custom_params)
        _silent_print(f"[Training] Mapped params: {mapped}")

        # Use temporal expanding-window split when snapshot_month is available
        if has_snapshot_month and df is not None and snapshot_col:
            _silent_print(f"[Training] Using temporal split on {snapshot_col} for custom hyperparams")
            df_snap = df.copy()
            df_snap[snapshot_col] = pd.to_datetime(df_snap[snapshot_col], errors='coerce')
            df_snap = df_snap.dropna(subset=[snapshot_col]).copy()

            valid_idx = df_snap.index.tolist()
            X_valid = X.loc[valid_idx].copy()
            y_series = y if isinstance(y, pd.Series) else pd.Series(y, index=X.index)
            y_valid = y_series.loc[valid_idx].copy()

            sorted_months = sorted(df_snap[snapshot_col].dropna().unique())
            if len(sorted_months) >= (MIN_TRAIN_SNAPSHOT_COUNT + 1 + N_OOS_MONTHS):
                cv_folds, pretest_months, oos_months = build_expanding_folds(
                    sorted_months,
                    min_train_months=MIN_TRAIN_SNAPSHOT_COUNT,
                    n_oos_months=N_OOS_MONTHS,
                )
                pretest_mask = df_snap[snapshot_col].isin(pretest_months)
                oos_mask = df_snap[snapshot_col].isin(oos_months)

                X_train = X_valid.loc[pretest_mask.values].reset_index(drop=True)
                y_train = y_valid.loc[pretest_mask.values].reset_index(drop=True)
                X_test = X_valid.loc[oos_mask.values].reset_index(drop=True)
                y_test = y_valid.loc[oos_mask.values].reset_index(drop=True)

                df_train = df_snap.loc[pretest_mask.values].copy().reset_index(drop=True)

                _silent_print(f"[Training] OOS split: pretest_months={len(pretest_months)}, oos_months={len(oos_months)}, "
                      f"pretest_rows={len(X_train)}, oos_rows={len(X_test)}")
            else:
                X_train, X_test, y_train, y_test = train_test_split(
                    X, y, test_size=0.2, random_state=42,
                    stratify=y if len(np.unique(y)) > 1 else None
                )
                df_train = None
                cv_folds = None
                _silent_print("[Training] Not enough snapshot months for OOS split, fallback to train_test_split")
        else:
            X_train, X_test, y_train, y_test = train_test_split(
                X, y, test_size=0.2, random_state=42,
                stratify=y if len(np.unique(y)) > 1 else None
            )
            df_train = None

        # Build CV splits on train partition
        cv_splits = []
        if df_train is not None and cv_folds is not None:
            for fold in cv_folds:
                tr = df_train.index[df_train[snapshot_col].isin(fold['train_months'])].tolist()
                va = df_train.index[df_train[snapshot_col].isin(fold['val_months'])].tolist()
                if tr and va:
                    cv_splits.append((tr, va))

        if len(cv_splits) == 0:
            _silent_print("[Training] Custom params expanding CV unavailable. Falling back to CV=3")
            cv_splits = 3
        else:
            _silent_print(f"[Training] Custom params CV: {len(cv_splits)} expanding folds")

        scoring = {
            'auc': scorer_auc,
            'lift_top10': scorer_lift_top10,
            'recall_top10': scorer_recall_top10,
        }
        single_param_grid = {k: [v] for k, v in mapped.items()}
        n_folds = len(cv_splits) if isinstance(cv_splits, list) else int(cv_splits)

        grid_search = GridSearchCV(
            estimator=ChurnPreprocessedEstimator(model_family=model_family),
            param_grid=single_param_grid,
            scoring=scoring,
            refit='lift_top10',
            cv=cv_splits,
            n_jobs=1,
            verbose=0,
            error_score=0.0,
            return_train_score=False,
        )
        grid_search.fit(X_train, y_train)

        best_model = grid_search.best_estimator_
        best_params = grid_search.best_params_
        cv_summary = extract_cv_summary(grid_search, n_folds)

        metrics = compute_test_metrics(algorithm, best_model, best_params, X_test, y_test,
                                          len(X_train), len(X_test), cv_summary=cv_summary,
                                          X_train=X_train, y_train=y_train)
        return metrics, best_model

    # ==== CASE B: GridSearchCV (Auto or specific model without custom params) ====
    param_grid = get_auto_param_grid(model_family)
    scoring = {
        'auc': scorer_auc,
        'lift_top10': scorer_lift_top10,
        'recall_top10': scorer_recall_top10,
    }

    cv_splits = None
    X_train = X_test = y_train = y_test = None
    train_size = test_size = 0

    # Try expanding window CV if snapshot_month present
    # Notebook-style: pretest months for tuning, final OOS months untouched for evaluation.
    if has_snapshot_month and df is not None and snapshot_col:
        _silent_print(f"[Training] Detected {snapshot_col} -> Using expanding walk-forward CV with OOS holdout")
        try:
            df_snap = df.copy()
            df_snap[snapshot_col] = pd.to_datetime(df_snap[snapshot_col], errors='coerce')
            df_snap = df_snap.dropna(subset=[snapshot_col]).copy()

            # Align X/y to rows that have valid snapshot month.
            valid_idx = df_snap.index.tolist()
            X_valid = X.loc[valid_idx].copy()
            y_series = y if isinstance(y, pd.Series) else pd.Series(y, index=X.index)
            y_valid = y_series.loc[valid_idx].copy()

            sorted_months = sorted(df_snap[snapshot_col].dropna().unique())
            cv_folds, pretest_months, oos_months = build_expanding_folds(
                sorted_months,
                min_train_months=MIN_TRAIN_SNAPSHOT_COUNT,
                n_oos_months=N_OOS_MONTHS,
            )

            pretest_mask = df_snap[snapshot_col].isin(pretest_months)
            oos_mask = df_snap[snapshot_col].isin(oos_months)

            X_train = X_valid.loc[pretest_mask.values].reset_index(drop=True)
            y_train = y_valid.loc[pretest_mask.values].reset_index(drop=True)
            X_test = X_valid.loc[oos_mask.values].reset_index(drop=True)
            y_test = y_valid.loc[oos_mask.values].reset_index(drop=True)

            df_train = df_snap.loc[pretest_mask.values].copy().reset_index(drop=True)

            cv_splits = []
            for fold in cv_folds:
                tr = df_train.index[df_train[snapshot_col].isin(fold['train_months'])].tolist()
                va = df_train.index[df_train[snapshot_col].isin(fold['val_months'])].tolist()
                if tr and va:
                    cv_splits.append((tr, va))

            if len(cv_splits) == 0:
                _silent_print("[Warning] No valid expanding folds on train split. Falling back to train_test_split CV=3.")
                cv_splits = None
            else:
                _silent_print(f"[Training] Using {len(cv_splits)} expanding CV folds (pretest-only)")

            _silent_print(f"[Training] OOS split: pretest_months={len(pretest_months)}, oos_months={len(oos_months)}, "
                  f"pretest_rows={len(X_train)}, oos_rows={len(X_test)}")

            train_size, test_size = len(X_train), len(X_test)
        except Exception as e:
            _silent_print(f"[Warning] Expanding CV failed: {e}. Falling back to train_test_split.")
            cv_splits = None

    # Fall back to train_test_split
    if cv_splits is None:
        _silent_print(f"[Training] Using train_test_split (80/20)")
        X_train, X_test, y_train, y_test = train_test_split(
            X, y, test_size=0.2, random_state=42,
            stratify=y if len(np.unique(y)) > 1 else None
        )
        cv_splits = 3
        train_size, test_size = len(X_train), len(X_test)

    n_folds = len(cv_splits) if isinstance(cv_splits, list) else int(cv_splits)

    grid_search = GridSearchCV(
        estimator=ChurnPreprocessedEstimator(model_family=model_family),
        param_grid=param_grid,
        scoring=scoring,
        refit='lift_top10',
        cv=cv_splits,
        n_jobs=1,
        verbose=0,
        error_score=0.0,
        return_train_score=False,
    )
    grid_search.fit(X_train, y_train)

    best_model = grid_search.best_estimator_
    best_params = grid_search.best_params_
    cv_summary = extract_cv_summary(grid_search, n_folds)

    metrics = compute_test_metrics(algorithm, best_model, best_params, X_test, y_test,
                                  train_size, test_size, cv_summary=cv_summary,
                                  X_train=X_train, y_train=y_train)
    return metrics, best_model


# ==============================================================================
# UNIFIED AUTO GRIDSEARCHCV (notebook-aligned)
# ==============================================================================

def train_auto_unified(X, y, feature_cols, df=None, has_snapshot_month=False,
                       snapshot_col=None, target_col='isChurned'):
    """Two-stage Auto: coarse family search, then refined search on winning family."""
    available_families = get_available_auto_model_families()
    if not available_families:
        raise RuntimeError('No supported Python model families are available in this runtime environment.')

    coarse_combined_grid = [
        get_auto_param_grid(model_family, stage='coarse')
        for model_family in available_families
    ]
    coarse_total_combos = sum(
        np.prod([len(v) for v in g.values()]) for g in coarse_combined_grid
    )
    _silent_print(f"\n[Auto-Unified] Coarse param_grid: {coarse_total_combos} total candidates")

    scoring = {
        'auc': scorer_auc,
        'lift_top10': scorer_lift_top10,
        'recall_top10': scorer_recall_top10,
    }

    cv_splits = None
    X_train = X_test = y_train = y_test = None

    if has_snapshot_month and df is not None and snapshot_col:
        try:
            df_snap = df.copy()
            df_snap[snapshot_col] = pd.to_datetime(df_snap[snapshot_col], errors='coerce')
            df_snap = df_snap.dropna(subset=[snapshot_col]).copy()

            valid_idx = df_snap.index.tolist()
            X_valid = X.loc[valid_idx].copy()
            y_series = y if isinstance(y, pd.Series) else pd.Series(y, index=X.index)
            y_valid = y_series.loc[valid_idx].copy()

            sorted_months = sorted(df_snap[snapshot_col].dropna().unique())
            cv_folds, pretest_months, oos_months = build_expanding_folds(
                sorted_months,
                min_train_months=MIN_TRAIN_SNAPSHOT_COUNT,
                n_oos_months=N_OOS_MONTHS,
            )

            pretest_mask = df_snap[snapshot_col].isin(pretest_months)
            oos_mask = df_snap[snapshot_col].isin(oos_months)

            X_train = X_valid.loc[pretest_mask.values].reset_index(drop=True)
            y_train = y_valid.loc[pretest_mask.values].reset_index(drop=True)
            X_test = X_valid.loc[oos_mask.values].reset_index(drop=True)
            y_test = y_valid.loc[oos_mask.values].reset_index(drop=True)

            df_train = df_snap.loc[pretest_mask.values].copy().reset_index(drop=True)

            cv_splits = []
            for fold in cv_folds:
                tr = df_train.index[df_train[snapshot_col].isin(fold['train_months'])].tolist()
                va = df_train.index[df_train[snapshot_col].isin(fold['val_months'])].tolist()
                if tr and va:
                    cv_splits.append((tr, va))

            if len(cv_splits) == 0:
                cv_splits = None
            else:
                _silent_print(f"[Auto-Unified] {len(cv_splits)} expanding CV folds, "
                      f"pretest={len(X_train)}, oos={len(X_test)}")
        except Exception as e:
            _silent_print(f"[Auto-Unified] Expanding CV failed: {e}. Fallback to train_test_split.")
            cv_splits = None

    if cv_splits is None:
        X_train, X_test, y_train, y_test = train_test_split(
            X, y, test_size=0.2, random_state=42,
            stratify=y if len(np.unique(y)) > 1 else None
        )
        cv_splits = 3

    n_folds = len(cv_splits) if isinstance(cv_splits, list) else int(cv_splits)

    coarse_search = GridSearchCV(
        estimator=ChurnPreprocessedEstimator(),
        param_grid=coarse_combined_grid,
        scoring=scoring,
        refit='lift_top10',
        cv=cv_splits,
        n_jobs=1,
        verbose=0,
        error_score=0.0,
        return_train_score=False,
    )
    coarse_search.fit(X_train, y_train)

    coarse_best_family = coarse_search.best_params_.get('model_family', available_families[0])
    refine_grid = get_auto_param_grid(coarse_best_family, stage='refine')
    refine_total_combos = int(np.prod([len(v) for v in refine_grid.values()]))
    _silent_print(f"[Auto-Unified] Coarse winner: {coarse_best_family}; refine candidates: {refine_total_combos}")

    refine_search = GridSearchCV(
        estimator=ChurnPreprocessedEstimator(model_family=coarse_best_family),
        param_grid=refine_grid,
        scoring=scoring,
        refit='lift_top10',
        cv=cv_splits,
        n_jobs=1,
        verbose=0,
        error_score=0.0,
        return_train_score=False,
    )
    refine_search.fit(X_train, y_train)

    best_model = refine_search.best_estimator_
    best_params = refine_search.best_params_
    best_family = best_params.get('model_family', coarse_best_family)
    family_to_algo = {'rf': 'Random Forest', 'lightgbm': 'LightGBM', 'xgboost': 'XGBoost'}
    best_algo = family_to_algo.get(best_family, best_family)

    cv_summary = extract_cv_summary(refine_search, n_folds)
    _silent_print(f"[Auto-Unified] Winner: {best_algo}, bestScore(lift_top10)={cv_summary.get('bestScore', 0):.4f}")

    metrics = compute_test_metrics(best_algo, best_model, best_params, X_test, y_test,
                                    len(X_train), len(X_test), cv_summary=cv_summary,
                                    X_train=X_train, y_train=y_train)

    # Build per-family results from coarse-stage CV for non-winning families.
    all_results = [metrics]
    coarse_results_df = pd.DataFrame(coarse_search.cv_results_)
    
    for family, algo_name in family_to_algo.items():
        if family == best_family:
            continue
        mask = coarse_results_df['param_model_family'] == family
        if mask.any():
            family_rows = coarse_results_df.loc[mask]
            best_idx = family_rows['rank_test_lift_top10'].idxmin()
            row = family_rows.loc[best_idx]
            family_result = {
                'algorithm': algo_name,
                'auc': safe_float(row.get('mean_test_auc', 0)),
                'liftTop10': safe_float(row.get('mean_test_lift_top10', 0)),
                'recallTop10': safe_float(row.get('mean_test_recall_top10', 0)),
                'cvSummary': {
                    'bestScore': safe_float(row.get('mean_test_lift_top10', 0)),
                    'bestParams': {k: str(v) for k, v in row.get('params', {}).items()},
                },
            }
            all_results.append(family_result)

    return best_algo, metrics, all_results, best_model


# ==============================================================================
# MAIN ENTRY POINT
# ==============================================================================

def main():
    if len(sys.argv) < 3:
        sys.stdout.write(json.dumps({'error': 'Usage: python train_model.py <input_json> <output_json> [algorithm]'}) + "\n")
        sys.stdout.flush()
        sys.exit(1)

    input_file = sys.argv[1]
    output_file = sys.argv[2]
    algorithm = sys.argv[3] if len(sys.argv) > 3 else "Auto"

    try:
        with open(input_file, 'r') as f:
            input_data = json.load(f)

        # ── Score-production mode: re-train on trainData, score prodData ──
        if input_data.get('mode') == 'score_prod':
            main_score_prod(input_data, output_file, algorithm)
            return

        data = input_data.get('data', [])
        target_col = input_data.get('targetColumn', 'isChurned')
        custom_hyperparams = input_data.get('hyperparameters', None)
        custom_feature_names = input_data.get('customFeatureNames', [])

        if not data:
            raise ValueError("No training data provided")

        X, y, feature_cols, df, has_snapshot_month, snapshot_col, target_col, df_full = prepare_data(
            data,
            target_col,
            custom_feature_names,
        )
        _silent_print(f"[Training] Resolved target='{target_col}', Churners={int(y.sum())}/{len(y)}", file=sys.stderr)

        if len(X) == 0:
            raise ValueError("No valid features found in data")

        n_classes = int(pd.Series(y).nunique())
        if n_classes < 2:
            raise ValueError(
                f"Target column '{target_col}' has a single class only. "
                f"Positive count={int(y.sum())}, total={len(y)}. "
                "Please provide data containing both churned and non-churned examples."
            )

        supported_algorithms = {"Auto", "Random Forest", "LightGBM", "XGBoost", "Decision Tree", "Support Vector Machine"}
        if algorithm not in supported_algorithms:
            raise ValueError(
                f"Algorithm '{algorithm}' is not supported. "
                "Supported algorithms: Auto, Random Forest, LightGBM, XGBoost, Decision Tree, Support Vector Machine"
            )

        if algorithm == 'LightGBM':
            ensure_model_family_available('lightgbm')
        elif algorithm == 'XGBoost':
            ensure_model_family_available('xgboost')

        if algorithm == "Auto":
            # Unified GridSearchCV across RF, LightGBM, XGBoost (notebook-aligned)
            best_algo, best_metrics, all_results, best_model = train_auto_unified(
                X, y, feature_cols, df=df,
                has_snapshot_month=has_snapshot_month, snapshot_col=snapshot_col,
                target_col=target_col,
            )
            output_data = {
                'success': True,
                'bestModel': best_algo,
                'bestAuc': best_metrics['auc'],
                'metrics': best_metrics,
                'allResults': all_results,
            }

        else:
            # Specific model: use custom hyperparams directly if provided, else grid-search
            use_grid = not bool(custom_hyperparams)
            metrics, best_model = train_single_model(
                algorithm, X, y, feature_cols, custom_params=custom_hyperparams, df=df,
                has_snapshot_month=has_snapshot_month, snapshot_col=snapshot_col,
                target_col=target_col, use_grid_search=use_grid,
            )
            output_data = {
                'success': True,
                'bestModel': algorithm,
                'bestAuc': metrics.get('auc'),
                'metrics': metrics,
                'allResults': [metrics],
            }

        # Score latest active customers using the trained best_model (no re-training)
        if best_model is not None and has_snapshot_month:
            try:
                latest_preds = score_latest_active_customers(
                    best_model, df_full, feature_cols, snapshot_col
                )
                if latest_preds:
                    output_data['latestActivePredictions'] = latest_preds
            except Exception as score_err:
                sys.stderr.write(f'[main] scoring latest active customers failed: {score_err}\n')

        # Safe-serialize before writing (converts NaN/Inf to null)
        output_data = safe_serialize(output_data)

        with open(output_file, 'w') as f:
            json.dump(output_data, f, indent=2)

        sys.stdout.write(json.dumps({
            'success': True,
            'message': f'Training complete. Best model: {output_data["bestModel"]} (AUC: {output_data["bestAuc"]})'
        }) + "\n")
        sys.stdout.flush()

    except Exception as e:
        import traceback
        sys.stderr.write(f"[Error] {e}\n{traceback.format_exc()}\n")
        sys.stderr.flush()
        error_data = {'success': False, 'error': str(e)}
        try:
            with open(output_file, 'w') as f:
                json.dump(error_data, f)
        except Exception:
            pass
        sys.stdout.write(json.dumps(error_data) + "\n")
        sys.stdout.flush()
        sys.exit(1)


if __name__ == '__main__':
    main()


