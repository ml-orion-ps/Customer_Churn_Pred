# -*- coding: utf-8 -*-
"""
COMPLETE CHURN PREDICTION PIPELINE
Replicated from Copper_Churn_v3.ipynb

BUSINESS / MODELING DESIGN
---------------------------------------------------------
1. Filter to Copper DSL only
2. Define churn target as: churn in next 1 to 3 months = 1, otherwise = 0
3. Use strict 12-month feature history discipline
4. Use only ACTIVE customers at snapshot for modeling
5. Apply minimum tenure rule
6. Keep rolling 3m / 6m / 12m features
7. Use expanding walk-forward validation on snapshot months
8. Keep final untouched OOS months
9. Run GridSearchCV using custom time-based expanding folds
10. Train final best model on all pre-OOS snapshots
11. Business ranking metrics: decile table, recall @ top 10%, lift @ top 10%

PREPROCESSING
---------------------------------------------------------
Learned on TRAIN only and applied to validation / OOS:
- Winsorization (5th/95th percentile clipping)
- Variance threshold filtering
- Optional VIF filtering (logistic only)
- Scaling (logistic only)
"""

import sys
import os

# Fix Windows encoding issues
if sys.platform == 'win32':
    import io
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
    sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8', errors='replace')

import json
import numpy as np
import pandas as pd

from sklearn.base import BaseEstimator, ClassifierMixin
from sklearn.preprocessing import StandardScaler, LabelEncoder
from sklearn.linear_model import LogisticRegression
from sklearn.ensemble import RandomForestClassifier
from sklearn.metrics import (
    roc_auc_score, recall_score, precision_score, f1_score, accuracy_score
)
from sklearn.feature_selection import VarianceThreshold
from sklearn.model_selection import GridSearchCV, ParameterGrid

from lightgbm import LGBMClassifier
from xgboost import XGBClassifier
import warnings
warnings.filterwarnings('ignore')


def _silent_print(*args, **kwargs):
    return None


# Silence modeling logs to reduce console I/O overhead during training.
print = _silent_print


# =========================================================
# STEP 0: CONFIGURATION
# =========================================================
COPPER_VALUE = "Copper_DSL"
FEATURE_HISTORY_MONTHS = 12
LABEL_HORIZON_MONTHS = 3
MIN_TENURE_MONTHS = 6
MIN_TRAIN_SNAPSHOT_COUNT = 5
N_OOS_MONTHS = 2
TARGET_COL = "churn_flag_3m"
CLASSIFICATION_THRESHOLD = 0.03


# =========================================================
# STEP 1: DATA LOADING FUNCTION
# =========================================================
def load_data(filepath):
    """Load data from CSV or Excel"""
    if filepath.endswith('.csv'):
        df = pd.read_csv(filepath)
    elif filepath.endswith('.xlsx') or filepath.endswith('.xls'):
        df = pd.read_excel(filepath)
    else:
        raise ValueError(f"Unsupported file format: {filepath}")
    
    # Convert date columns
    df["snapshot_month"] = pd.to_datetime(df["snapshot_month"], errors="coerce")
    df["activation_date"] = pd.to_datetime(df["activation_date"], errors="coerce")
    df["commitment_end_date"] = pd.to_datetime(df["commitment_end_date"], errors="coerce")
    
    df = df.dropna(subset=["snapshot_month"]).copy()
    _silent_print(f"[Data Load] Raw dataset shape: {df.shape}")
    
    return df


# =========================================================
# STEP 2: FILTER AND CREATE TARGET
# =========================================================
def create_churn_target(df):
    """Filter to Copper DSL and create 3-month churn target"""
    # Filter to Copper DSL only
    df = df[df["service_type"] == COPPER_VALUE].copy()
    df = df.sort_values(["account_number", "snapshot_month"]).reset_index(drop=True)
    _silent_print(f"[Filter] Copper DSL only: {df.shape}")
    
    # Create churn event month
    df["lifecycle_stage_lower"] = df["lifecycle_stage"].astype(str).str.lower()
    
    churn_month_map = (
        df.loc[df["lifecycle_stage_lower"] == "disconnected"]
          .groupby("account_number")["snapshot_month"]
          .min()
    )
    df["churn_event_month"] = df["account_number"].map(churn_month_map)
    
    # Calculate months to churn
    df["months_to_churn"] = np.where(
        df["churn_event_month"].notna(),
        (
            (df["churn_event_month"].dt.year - df["snapshot_month"].dt.year) * 12
            + (df["churn_event_month"].dt.month - df["snapshot_month"].dt.month)
        ),
        np.nan
    )
    
    # Create 3-month future churn label
    df[TARGET_COL] = np.where(
        (df["months_to_churn"] >= 1) & (df["months_to_churn"] <= LABEL_HORIZON_MONTHS),
        1,
        0
    )
    
    _silent_print(f"\n[Target] Distribution:\n{df[TARGET_COL].value_counts()}")
    
    return df


# =========================================================
# STEP 3: FEATURE ENGINEERING
# =========================================================
def engineer_features(df):
    """Complete feature engineering pipeline from notebook"""
    
    _silent_print("\n[Feature Engineering] Starting...")
    
    # --- 3.1 Structural / lifecycle features ---
    df["tenure_months"] = (
        (df["snapshot_month"] - df["activation_date"]).dt.days / 30
    ).clip(lower=0)
    
    df["months_to_commitment_end"] = (
        (df["commitment_end_date"] - df["snapshot_month"]).dt.days / 30
    )
    df["months_to_commitment_end"] = df["months_to_commitment_end"].fillna(-999)
    
    df["near_contract_end_flag"] = np.where(
        (df["months_to_commitment_end"] >= 0) &
        (df["months_to_commitment_end"] <= 3),
        1, 0
    )
    
    df["competitive_pressure"] = (
        df["fiber_available_at_premises"] +
        df["competitor_broadband_available_by_address"]
    )
    
    # --- 3.2 History coverage features ---
    df["history_available_months"] = (
        df.groupby("account_number").cumcount() + 1
    ).clip(upper=FEATURE_HISTORY_MONTHS)
    
    df["history_coverage_ratio_12m"] = (
        df["history_available_months"] / FEATURE_HISTORY_MONTHS
    ).clip(upper=1.0)
    
    df["new_customer_flag"] = np.where(df["tenure_months"] < 12, 1, 0)
    
    # --- 3.3 Current snapshot-level derived features ---
    df["prev_bill"] = df.groupby("account_number")["bill_amount"].shift(1)
    
    df["bill_shock_flag"] = np.where(
        df["bill_amount"] > 1.2 * df["prev_bill"],
        1, 0
    )
    df["bill_shock_flag"] = df["bill_shock_flag"].fillna(0)
    
    df["throughput_to_speed_ratio"] = (
        df["avg_delivered_throughput_mbps"] / df["subscribed_speed_mbps"]
    ).replace([np.inf, -np.inf], 0).fillna(0)
    
    df["speed_gap_ratio"] = (
        (df["subscribed_speed_mbps"] - df["avg_delivered_throughput_mbps"]) /
        df["subscribed_speed_mbps"]
    ).replace([np.inf, -np.inf], 0).fillna(0).clip(lower=0)
    
    df["revenue_per_speed"] = (
        df["mrc_data"] / df["subscribed_speed_mbps"]
    ).replace([np.inf, -np.inf], 0).fillna(0)
    
    df["outage_severity"] = (
        df["network_outage_events"] * (df["network_outage_duration_minutes"] / 60)
    ).fillna(0)
    
    # --- 3.4 Rolling 3-month features ---
    df["tickets_last_3m_sum"] = (
        df.groupby("account_number")["trouble_ticket_volume"]
          .rolling(3, min_periods=1)
          .sum()
          .reset_index(level=0, drop=True)
    )
    
    df["outages_last_3m_sum"] = (
        df.groupby("account_number")["network_outage_events"]
          .rolling(3, min_periods=1)
          .sum()
          .reset_index(level=0, drop=True)
    )
    
    df["bill_volatility_3m_std"] = (
        df.groupby("account_number")["bill_amount"]
          .rolling(3, min_periods=1)
          .std()
          .reset_index(level=0, drop=True)
    ).fillna(0)
    
    df["nps_3m_min"] = (
        df.groupby("account_number")["nps_score"]
          .rolling(3, min_periods=1)
          .min()
          .reset_index(level=0, drop=True)
    )
    
    df["csat_3m_min"] = (
        df.groupby("account_number")["csat_score"]
          .rolling(3, min_periods=1)
          .min()
          .reset_index(level=0, drop=True)
    )
    
    df["usage_3m_avg"] = (
        df.groupby("account_number")["data_consumption_gb"]
          .rolling(3, min_periods=1)
          .mean()
          .reset_index(level=0, drop=True)
    )
    
    df["tickets_3m_avg"] = (
        df.groupby("account_number")["trouble_ticket_volume"]
          .rolling(3, min_periods=1)
          .mean()
          .reset_index(level=0, drop=True)
    )
    
    # --- 3.5 Rolling 6-month features ---
    df["tickets_last_6m_sum"] = (
        df.groupby("account_number")["trouble_ticket_volume"]
          .rolling(6, min_periods=1)
          .sum()
          .reset_index(level=0, drop=True)
    )
    
    df["outages_last_6m_sum"] = (
        df.groupby("account_number")["network_outage_events"]
          .rolling(6, min_periods=1)
          .sum()
          .reset_index(level=0, drop=True)
    )
    
    df["bill_volatility_6m_std"] = (
        df.groupby("account_number")["bill_amount"]
          .rolling(6, min_periods=1)
          .std()
          .reset_index(level=0, drop=True)
    ).fillna(0)
    
    df["nps_6m_min"] = (
        df.groupby("account_number")["nps_score"]
          .rolling(6, min_periods=1)
          .min()
          .reset_index(level=0, drop=True)
    )
    
    df["csat_6m_min"] = (
        df.groupby("account_number")["csat_score"]
          .rolling(6, min_periods=1)
          .min()
          .reset_index(level=0, drop=True)
    )
    
    df["usage_6m_avg"] = (
        df.groupby("account_number")["data_consumption_gb"]
          .rolling(6, min_periods=1)
          .mean()
          .reset_index(level=0, drop=True)
    )
    
    # --- 3.6 Rolling 12-month features ---
    df["tickets_last_12m_sum"] = (
        df.groupby("account_number")["trouble_ticket_volume"]
          .rolling(12, min_periods=1)
          .sum()
          .reset_index(level=0, drop=True)
    )
    
    df["outages_last_12m_sum"] = (
        df.groupby("account_number")["network_outage_events"]
          .rolling(12, min_periods=1)
          .sum()
          .reset_index(level=0, drop=True)
    )
    
    df["bill_volatility_12m_std"] = (
        df.groupby("account_number")["bill_amount"]
          .rolling(12, min_periods=1)
          .std()
          .reset_index(level=0, drop=True)
    ).fillna(0)
    
    df["nps_12m_min"] = (
        df.groupby("account_number")["nps_score"]
          .rolling(12, min_periods=1)
          .min()
          .reset_index(level=0, drop=True)
    )
    
    df["csat_12m_min"] = (
        df.groupby("account_number")["csat_score"]
          .rolling(12, min_periods=1)
          .min()
          .reset_index(level=0, drop=True)
    )
    
    df["usage_12m_avg"] = (
        df.groupby("account_number")["data_consumption_gb"]
          .rolling(12, min_periods=1)
          .mean()
          .reset_index(level=0, drop=True)
    )
    
    df["bill_shock_last_12m_sum"] = (
        df.groupby("account_number")["bill_shock_flag"]
          .rolling(12, min_periods=1)
          .sum()
          .reset_index(level=0, drop=True)
    )
    
    df["outage_severity_last_12m_sum"] = (
        df.groupby("account_number")["outage_severity"]
          .rolling(12, min_periods=1)
          .sum()
          .reset_index(level=0, drop=True)
    )
    
    # --- 3.7 Trend / acceleration features ---
    df["usage_mom_pct_change"] = (
        df.groupby("account_number")["data_consumption_gb"]
          .pct_change()
          .replace([np.inf, -np.inf], 0)
          .fillna(0)
    )
    
    df["usage_drop_ratio_3m_vs_12m"] = (
        (df["usage_3m_avg"] - df["usage_12m_avg"]) /
        df["usage_12m_avg"].replace(0, np.nan)
    ).replace([np.inf, -np.inf], 0).fillna(0)
    
    df["ticket_acceleration_3m_vs_12m"] = (
        df["tickets_3m_avg"] - (df["tickets_last_12m_sum"] / 12.0)
    )
    
    df["outage_acceleration_3m_vs_12m"] = (
        (df["outages_last_3m_sum"] / 3.0) - (df["outages_last_12m_sum"] / 12.0)
    )
    
    df["bill_volatility_acceleration_3m_vs_12m"] = (
        df["bill_volatility_3m_std"] - df["bill_volatility_12m_std"]
    )
    
    df["ticket_per_month"] = (
        df["trouble_ticket_volume"] / df["tenure_months"].replace(0, np.nan)
    ).replace([np.inf, -np.inf], 0).fillna(0)
    
    # --- 3.8 Exposure-normalized recent history feature ---
    df["ticket_per_active_month_12m"] = (
        df["tickets_last_12m_sum"] / df["history_available_months"].replace(0, np.nan)
    ).replace([np.inf, -np.inf], 0).fillna(0)
    
    # --- 3.9 Tenure bucket ---
    df["tenure_bucket"] = pd.cut(
        df["tenure_months"],
        bins=[0, 6, 18, 36, 48, np.inf],
        labels=["new_customer", "early_growth", "established", "long_term", "very_long_term"],
        include_lowest=True
    )
    
    le = LabelEncoder()
    df["tenure_bucket_encoded"] = le.fit_transform(df["tenure_bucket"].astype(str))
    
    # --- 3.10 Additional frustration / spike features ---
    df["ticket_spike_ratio"] = (
        df["tickets_last_3m_sum"] /
        df["tickets_last_6m_sum"].replace(0, np.nan)
    ).replace([np.inf, -np.inf], np.nan).fillna(0)
    
    df["outage_trend_ratio"] = (
        df["outages_last_3m_sum"] /
        df["outages_last_6m_sum"].replace(0, np.nan)
    ).replace([np.inf, -np.inf], np.nan).fillna(0)
    
    df["usage_last_3m"] = (
        df.groupby("account_number")["data_consumption_gb"]
          .rolling(3, min_periods=1)
          .mean()
          .reset_index(level=0, drop=True)
    )
    
    df["usage_last_6m"] = (
        df.groupby("account_number")["data_consumption_gb"]
          .rolling(6, min_periods=1)
          .mean()
          .reset_index(level=0, drop=True)
    )
    
    df["usage_drop_ratio"] = (
        df["usage_last_3m"] /
        df["usage_last_6m"].replace(0, np.nan)
    ).replace([np.inf, -np.inf], np.nan).fillna(1)
    
    df["fiber_speed_risk"] = (
        df["fiber_available_at_premises"] *
        df["speed_gap_ratio"]
    )
    
    df["service_frustration_index"] = (
        df["ticket_spike_ratio"] +
        df["outage_trend_ratio"] +
        df["speed_gap_ratio"]
    )
    
    df["frustration_acceleration"] = (
        df["service_frustration_index"] -
        df.groupby("account_number")["service_frustration_index"].shift(3)
    ).fillna(0)
    
    _silent_print(f"[Feature Engineering] Complete! Total columns: {len(df.columns)}")
    
    return df


# =========================================================
# STEP 4: DEFINE FEATURE LIST (Exact order from Copper_Churn_v3.ipynb)
# =========================================================
def get_feature_columns():
    """Return list of engineered features for modeling - ordered as per notebook"""
    return [
        # Competitive/Environmental Features
        "fiber_available_at_premises",
        "competitor_broadband_available_by_address",
        "competitive_pressure",
        
        # Tenure & Customer Lifecycle Features
        "tenure_months",
        "tenure_bucket_encoded",
        "new_customer_flag",
        "history_available_months",
        "history_coverage_ratio_12m",
        
        # Contract Features
        "months_to_commitment_end",
        "near_contract_end_flag",
        
        # Current Snapshot Service Quality & Billing Features
        "network_outage_events",
        "trouble_ticket_volume",
        "repeat_issue_flag",
        "promo_expiration_flag",
        "price_increase_flag",
        "late_payment_flag",
        "collections_activity_flag",
        "bill_shock_flag",
        # "throughput_to_speed_ratio",  # Commented out in notebook
        "speed_gap_ratio",
        "revenue_per_speed",
        "outage_severity",
        
        # Rolling 3-Month Features
        "tickets_last_3m_sum",
        "outages_last_3m_sum",
        "bill_volatility_3m_std",
        "nps_3m_min",
        "csat_3m_min",
        
        # Rolling 6-Month Features
        "tickets_last_6m_sum",
        "outages_last_6m_sum",
        "bill_volatility_6m_std",
        "nps_6m_min",
        "csat_6m_min",
        
        # Rolling 12-Month Features
        "tickets_last_12m_sum",
        "outages_last_12m_sum",
        "bill_volatility_12m_std",
        "nps_12m_min",
        "csat_12m_min",
        "bill_shock_last_12m_sum",
        "outage_severity_last_12m_sum",
        
        # Trend & Acceleration Features
        "usage_mom_pct_change",
        "usage_drop_ratio_3m_vs_12m",
        "ticket_acceleration_3m_vs_12m",
        "outage_acceleration_3m_vs_12m",
        "bill_volatility_acceleration_3m_vs_12m",
        
        # Normalized Historical Features
        "ticket_per_active_month_12m",
        
        # Frustration & Risk Indices
        "ticket_spike_ratio",
        "outage_trend_ratio",
        "usage_drop_ratio",
        "fiber_speed_risk",
        "service_frustration_index",
        "usage_3m_avg",
        "usage_6m_avg",
        "usage_12m_avg",
        "tickets_3m_avg",
        "frustration_acceleration",
        "ticket_per_month"
    ]


# =========================================================
# STEP 5: BUILD STRICT MODELING BASE
# =========================================================
def build_modeling_base(df, feature_cols):
    """Build strict modeling base with temporal discipline"""
    
    all_months_full = sorted(pd.to_datetime(df["snapshot_month"].dropna().unique()))
    all_months_full = [pd.Timestamp(m) for m in all_months_full]
    
    if len(all_months_full) < (FEATURE_HISTORY_MONTHS + LABEL_HORIZON_MONTHS):
        raise ValueError(
            f"Not enough monthly history. Need {FEATURE_HISTORY_MONTHS + LABEL_HORIZON_MONTHS}, "
            f"have {len(all_months_full)}"
        )
    
    first_full_history_snapshot = all_months_full[FEATURE_HISTORY_MONTHS - 1]
    last_labelable_snapshot = all_months_full[-(LABEL_HORIZON_MONTHS + 1)]
    
    _silent_print(f"\n[Modeling Base] First full-history snapshot: {first_full_history_snapshot.date()}")
    _silent_print(f"[Modeling Base] Last labelable snapshot: {last_labelable_snapshot.date()}")
    
    model_df = df[
        (df["lifecycle_stage_lower"] == "active") &
        (df["tenure_months"] >= MIN_TENURE_MONTHS) &
        (df["snapshot_month"] >= first_full_history_snapshot) &
        (df["snapshot_month"] <= last_labelable_snapshot)
    ].copy()
    
    model_df = model_df.sort_values(["snapshot_month", "account_number"]).reset_index(drop=True)
    
    eligible_snapshot_months = sorted(model_df["snapshot_month"].unique())
    eligible_snapshot_months = [pd.Timestamp(m) for m in eligible_snapshot_months]
    
    _silent_print(f"[Modeling Base] Eligible snapshot months: {len(eligible_snapshot_months)}")
    _silent_print(f"[Modeling Base] Shape: {model_df.shape}")
    _silent_print(f"\n[Modeling Base] Target distribution:\n{model_df[TARGET_COL].value_counts()}")
    
    return model_df, eligible_snapshot_months


# =========================================================
# STEP 6: BUILD EXPANDING WALK-FORWARD FOLDS
# =========================================================
def build_expanding_folds(month_list, min_train_months=5, n_oos_months=2):
    """Build expanding walk-forward folds from snapshot months"""
    
    month_list = sorted(month_list)
    
    if len(month_list) < (min_train_months + 1 + n_oos_months):
        raise ValueError(
            f"Not enough eligible snapshot months for CV + OOS. "
            f"Need {min_train_months + 1 + n_oos_months}, have {len(month_list)}"
        )
    
    pretest_months = month_list[:-n_oos_months]
    oos_months = month_list[-n_oos_months:]
    
    folds = []
    for i in range(min_train_months, len(pretest_months)):
        train_months = pretest_months[:i]
        val_month = pretest_months[i]
        
        folds.append({
            "train_months": train_months,
            "val_months": [val_month]
        })
    
    _silent_print(f"\n[CV Folds] Built {len(folds)} expanding walk-forward folds")
    for i, fold in enumerate(folds[:3], 1):  # Show first 3
        _silent_print(
            f"  Fold {i}: Train {fold['train_months'][0].date()} -> {fold['train_months'][-1].date()} "
            f"| Val {fold['val_months'][0].date()}"
        )
    if len(folds) > 3:
        _silent_print(f"  ... ({len(folds) - 3} more folds)")
    
    _silent_print(f"\n[CV Folds] Pretest: {pretest_months[0].date()} -> {pretest_months[-1].date()}")
    _silent_print(f"[CV Folds] OOS: {oos_months[0].date()} -> {oos_months[-1].date()}")
    
    return folds, pretest_months, oos_months


# =========================================================
# STEP 7: PREPROCESSING HELPERS
# =========================================================
def fit_winsor_bounds(X_train, lower_q=0.05, upper_q=0.95):
    """Fit winsorization bounds on training data only"""
    bounds = {}
    for col in X_train.columns:
        lower = X_train[col].quantile(lower_q)
        upper = X_train[col].quantile(upper_q)
        bounds[col] = (lower, upper)
    return bounds


def apply_winsor_bounds(X, bounds):
    """Apply winsorization bounds fitted from training data"""
    X = X.copy()
    for col, (lower, upper) in bounds.items():
        if col in X.columns:
            X[col] = X[col].clip(lower=lower, upper=upper)
    return X


def remove_high_vif_features(X, threshold=10):
    """Remove features with high VIF (multicollinearity) iteratively"""
    try:
        from statsmodels.stats.outliers_influence import variance_inflation_factor
    except ImportError:
        _silent_print("[VIF] statsmodels not installed; skipping VIF filtering")
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
            _silent_print(f"[VIF] Dropping {drop_feature} (VIF={max_vif:.2f})")
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
    X_train_proc = X_train_proc.replace([np.inf, -np.inf], np.nan).fillna(0)
    
    artifacts["raw_train_columns"] = X_train_proc.columns.tolist()
    
    # Step 1: Winsorization
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
    
    # Step 3: VIF screening (logistic regression only)
    if use_vif:
        X_train_proc = remove_high_vif_features(X_train_proc, threshold=vif_threshold)
    
    artifacts["final_columns"] = X_train_proc.columns.tolist()
    _silent_print(f"[Preprocessing] Final feature count: {len(X_train_proc.columns)}")
    
    # Step 4: Scaling (logistic regression only)
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
    """Apply preprocessing artifacts fitted from training data to new data"""
    X_proc = X.copy()
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


# =========================================================
# STEP 8: CUSTOM ESTIMATOR FOR GRIDSEARCHCV
# =========================================================
class ChurnPreprocessedEstimator(BaseEstimator, ClassifierMixin):
    """
    Scikit-learn compatible estimator that wraps preprocessing + model.
    Ensures preprocessing is fitted ONLY on training fold, preventing data leakage.
    """
    
    def __init__(
        self,
        model_family="logistic",
        
        # Preprocessing params
        winsorize=True,
        lower_q=0.05,
        upper_q=0.95,
        variance_threshold=0.00,
        use_vif=False,
        vif_threshold=10,
        
        # Logistic params
        C=1.0,
        logistic_class_weight="balanced",
        penalty="l2",
        
        # Random Forest params
        rf_n_estimators=200,
        rf_max_depth=6,
        rf_min_samples_leaf=10,
        rf_class_weight="balanced",
        rf_max_features="sqrt",
        
        # LightGBM params
        lgbm_n_estimators=200,
        lgbm_learning_rate=0.05,
        lgbm_num_leaves=31,
        lgbm_min_child_samples=20,
        lgbm_subsample=0.8,
        lgbm_colsample_bytree=0.8,
        lgbm_class_weight="balanced",
        
        # XGBoost params
        xgb_n_estimators=200,
        xgb_learning_rate=0.05,
        xgb_max_depth=4,
        xgb_min_child_weight=1,
        xgb_subsample=0.8,
        xgb_colsample_bytree=0.8,
        xgb_scale_pos_weight=20
    ):
        self.model_family = model_family
        
        self.winsorize = winsorize
        self.lower_q = lower_q
        self.upper_q = upper_q
        self.variance_threshold = variance_threshold
        self.use_vif = use_vif
        self.vif_threshold = vif_threshold
        
        self.C = C
        self.logistic_class_weight = logistic_class_weight
        self.penalty = penalty
        
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
    
    def _build_model(self):
        """Build model based on model_family and return (model, scale_flag)"""
        if self.model_family == "logistic":
            model = LogisticRegression(
                max_iter=1000,
                C=self.C,
                class_weight=self.logistic_class_weight,
                penalty=self.penalty,
                random_state=42
            )
            scale_flag = True
            
        elif self.model_family == "rf":
            model = RandomForestClassifier(
                n_estimators=self.rf_n_estimators,
                max_depth=self.rf_max_depth,
                min_samples_leaf=self.rf_min_samples_leaf,
                class_weight=self.rf_class_weight,
                max_features=self.rf_max_features,
                random_state=42,
                n_jobs=-1
            )
            scale_flag = False
            
        elif self.model_family == "lightgbm":
            model = LGBMClassifier(
                n_estimators=self.lgbm_n_estimators,
                learning_rate=self.lgbm_learning_rate,
                num_leaves=self.lgbm_num_leaves,
                min_child_samples=self.lgbm_min_child_samples,
                subsample=self.lgbm_subsample,
                colsample_bytree=self.lgbm_colsample_bytree,
                class_weight=self.lgbm_class_weight,
                random_state=42,
                verbose=-1,
                n_jobs=-1
            )
            scale_flag = False
            
        elif self.model_family == "xgboost":
            model = XGBClassifier(
                n_estimators=self.xgb_n_estimators,
                learning_rate=self.xgb_learning_rate,
                max_depth=self.xgb_max_depth,
                min_child_weight=self.xgb_min_child_weight,
                subsample=self.xgb_subsample,
                colsample_bytree=self.xgb_colsample_bytree,
                scale_pos_weight=self.xgb_scale_pos_weight,
                eval_metric="logloss",
                random_state=42,
                n_jobs=-1
            )
            scale_flag = False
            
        else:
            raise ValueError(f"Unknown model family: {self.model_family}")
        
        return model, scale_flag
    
    def fit(self, X, y):
        """Fit preprocessing + model on training data only"""
        X = X.copy()
        
        model, scale_flag = self._build_model()
        
        # VIF only for logistic regression
        use_vif_flag = (self.model_family == "logistic") and self.use_vif
        
        # Fit preprocessing pipeline ONLY on this training fold
        X_proc, X_model, artifacts = fit_preprocessing_pipeline(
            X_train=X,
            use_scaling=scale_flag,
            use_vif=use_vif_flag,
            vif_threshold=self.vif_threshold,
            winsorize=self.winsorize,
            lower_q=self.lower_q,
            upper_q=self.upper_q,
            variance_threshold=self.variance_threshold
        )
        
        # Fit model on preprocessed data
        model.fit(X_model, y)
        
        # Store artifacts for prediction
        self.model_ = model
        self.scale_flag_ = scale_flag
        self.artifacts_ = artifacts
        self.feature_names_ = artifacts["final_columns"]
        
        return self
    
    def predict_proba(self, X):
        """Apply train-fitted preprocessing, then predict probabilities"""
        X = X.copy()
        _, X_model = apply_preprocessing_pipeline(
            X,
            artifacts=self.artifacts_,
            use_scaling=self.scale_flag_
        )
        proba = self.model_.predict_proba(X_model)
        
        # Handle single-class case
        if proba.shape[1] == 1:
            single_class_proba = proba[:, 0]
            return np.column_stack([1 - single_class_proba, single_class_proba])
        return proba
    
    def predict(self, X):
        """Apply train-fitted preprocessing, then predict classes"""
        proba = self.predict_proba(X)
        # Safe access to positive class probability
        if proba.shape[1] > 1:
            prob = proba[:, 1]
        else:
            prob = proba[:, 0]
        pred = (prob >= CLASSIFICATION_THRESHOLD).astype(int)
        return pred


# =========================================================
# STEP 9: BUSINESS RANKING HELPERS
# =========================================================
def build_decile_table(scored_df, prob_col, target_col, n_bins=10):
    """Build decile table for business ranking analysis"""
    tmp = scored_df[[prob_col, target_col]].copy()
    tmp = tmp.sort_values(prob_col, ascending=False).reset_index(drop=True)
    
    tmp["rank"] = np.arange(1, len(tmp) + 1)
    tmp["decile"] = pd.qcut(
        tmp["rank"],
        q=n_bins,
        labels=[f"D{i}" for i in range(1, n_bins + 1)]
    )
    
    overall_churn_rate = tmp[target_col].mean()
    
    decile_tbl = (
        tmp.groupby("decile", observed=False)
           .agg(
               customers=(target_col, "count"),
               actual_churners=(target_col, "sum"),
               avg_predicted_prob=(prob_col, "mean")
           )
           .reset_index()
    )
    
    decile_tbl["churn_rate"] = decile_tbl["actual_churners"] / decile_tbl["customers"]
    decile_tbl["overall_churn_rate"] = overall_churn_rate
    decile_tbl["lift"] = np.where(
        overall_churn_rate > 0,
        decile_tbl["churn_rate"] / overall_churn_rate,
        np.nan
    )
    
    decile_tbl["cum_customers"] = decile_tbl["customers"].cumsum()
    decile_tbl["cum_churners"] = decile_tbl["actual_churners"].cumsum()
    
    total_churners = decile_tbl["actual_churners"].sum()
    decile_tbl["cum_recall"] = np.where(
        total_churners > 0,
        decile_tbl["cum_churners"] / total_churners,
        np.nan
    )
    
    return decile_tbl


def recall_at_top_percent(scored_df, prob_col, target_col, top_pct=0.10):
    """Calculate recall, precision, and lift at top N% of scores"""
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
        "top_pct": top_pct,
        "recall_at_top_pct": recall_top,
        "precision_at_top_pct": precision_top,
        "baseline_churn_rate": baseline_rate,
        "lift_at_top_pct": lift_top
    }


# =========================================================
# STEP 10: CUSTOM SCORERS FOR GRIDSEARCHCV
# =========================================================
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


def scorer_recall_top20(estimator, X, y):
    try:
        proba = estimator.predict_proba(X)
        prob = proba[:, 1] if proba.shape[1] > 1 else proba[:, 0]
        tmp = pd.DataFrame({"prob": prob, "y": y})
        result = recall_at_top_percent(tmp, "prob", "y", 0.20)["recall_at_top_pct"]
        return result if not np.isnan(result) else 0.0
    except Exception:
        return 0.0


def scorer_precision_top20(estimator, X, y):
    try:
        proba = estimator.predict_proba(X)
        prob = proba[:, 1] if proba.shape[1] > 1 else proba[:, 0]
        tmp = pd.DataFrame({"prob": prob, "y": y})
        result = recall_at_top_percent(tmp, "prob", "y", 0.20)["precision_at_top_pct"]
        return result if not np.isnan(result) else 0.0
    except Exception:
        return 0.0


def scorer_lift_top20(estimator, X, y):
    try:
        proba = estimator.predict_proba(X)
        prob = proba[:, 1] if proba.shape[1] > 1 else proba[:, 0]
        tmp = pd.DataFrame({"prob": prob, "y": y})
        result = recall_at_top_percent(tmp, "prob", "y", 0.20)["lift_at_top_pct"]
        return result if not np.isnan(result) else 0.0
    except Exception:
        return 0.0


scoring_dict = {
    "auc": scorer_auc,
    "lift_top10": scorer_lift_top10,
    "recall_top10": scorer_recall_top10,
    "precision_top10": scorer_precision_top10,
    "recall_top20": scorer_recall_top20,
    "precision_top20": scorer_precision_top20,
    "lift_top20": scorer_lift_top20
}


# =========================================================
# STEP 11: PARAMETER GRID FOR EACH MODEL FAMILY
# =========================================================
def get_param_grid():
    """Return parameter grid for GridSearchCV"""
    return [
        # Random Forest
        {
            "model_family": ["rf"],
            "rf_n_estimators": [200, 300],
            "rf_max_depth": [6, 8, None],
            "rf_min_samples_leaf": [5, 10],
            "rf_class_weight": ["balanced"],
            "rf_max_features": ["sqrt"]
        },
        
        # LightGBM
        {
            "model_family": ["lightgbm"],
            "lgbm_n_estimators": [200, 300],
            "lgbm_learning_rate": [0.03, 0.05],
            "lgbm_num_leaves": [31, 63],
            "lgbm_min_child_samples": [20, 50],
            "lgbm_subsample": [0.8, 1.0],
            "lgbm_colsample_bytree": [0.8, 1.0],
            "lgbm_class_weight": ["balanced"]
        },
        
        # XGBoost
        {
            "model_family": ["xgboost"],
            "xgb_n_estimators": [200, 300],
            "xgb_learning_rate": [0.03, 0.05],
            "xgb_max_depth": [4, 6],
            "xgb_min_child_weight": [1, 5],
            "xgb_subsample": [0.8, 1.0],
            "xgb_colsample_bytree": [0.8, 1.0],
            "xgb_scale_pos_weight": [10, 20]
        }
    ]


# =========================================================
# STEP 12: MAIN TRAINING PIPELINE
# =========================================================
def main():
    """Main training pipeline"""
    
    if len(sys.argv) < 2:
        _silent_print("Usage: python churn_pipeline_complete.py <data_file>")
        _silent_print("Example: python churn_pipeline_complete.py data.csv")
        sys.exit(1)
    
    input_file = sys.argv[1]
    
    _silent_print("=" * 80)
    _silent_print("COMPLETE CHURN PREDICTION PIPELINE")
    _silent_print("=" * 80)
    
    # Step 1: Load data
    df = load_data(input_file)
    
    # Step 2: Create target
    df = create_churn_target(df)
    
    # Step 3: Engineer features
    df = engineer_features(df)
    
    # Step 4: Get feature list
    feature_cols = get_feature_columns()
    _silent_print(f"\n[Features] Using {len(feature_cols)} engineered features")
    
    # Step 5: Build modeling base
    model_df, eligible_snapshot_months = build_modeling_base(df, feature_cols)
    
    # Step 6: Build expanding CV folds
    cv_folds, pretest_months, oos_months = build_expanding_folds(
        eligible_snapshot_months,
        min_train_months=MIN_TRAIN_SNAPSHOT_COUNT,
        n_oos_months=N_OOS_MONTHS
    )
    
    # Step 7: Prepare pretest/OOS datasets
    pretest_df = model_df[model_df["snapshot_month"].isin(pretest_months)].copy()
    oos_df = model_df[model_df["snapshot_month"].isin(oos_months)].copy()
    
    X_pretest = pretest_df[feature_cols].copy()
    y_pretest = pretest_df[TARGET_COL].copy()
    X_oos = oos_df[feature_cols].copy()
    y_oos = oos_df[TARGET_COL].copy()
    
    _silent_print(f"\n[Data Split] Pretest: {pretest_df.shape}, OOS: {oos_df.shape}")
    
    # Step 8: Convert folds to row indices
    grid_cv_splits = []
    for fold in cv_folds:
        train_idx = pretest_df.index[pretest_df["snapshot_month"].isin(fold["train_months"])].to_numpy()
        val_idx = pretest_df.index[pretest_df["snapshot_month"].isin(fold["val_months"])].to_numpy()
        grid_cv_splits.append((train_idx, val_idx))
    
    _silent_print(f"[GridSearchCV] Using {len(grid_cv_splits)} custom time-based folds")
    
    # Step 9: Setup GridSearchCV
    base_estimator = ChurnPreprocessedEstimator(
        winsorize=True,
        lower_q=0.05,
        upper_q=0.95,
        variance_threshold=0.00,
        use_vif=False,
        vif_threshold=10
    )
    
    param_grid = get_param_grid()
    total_combinations = sum(len(list(ParameterGrid(g))) for g in param_grid)
    _silent_print(f"[GridSearchCV] Total hyperparameter combinations: {total_combinations}")
    
    grid_search = GridSearchCV(
        estimator=base_estimator,
        param_grid=param_grid,
        scoring=scoring_dict,
        refit="lift_top10",  # Optimize for business metric
        cv=grid_cv_splits,
        n_jobs=1,
        verbose=2,
        return_train_score=False,
        error_score=0.0
    )
    
    # Step 10: Run GridSearchCV
    _silent_print("\n" + "=" * 80)
    _silent_print("STARTING GRIDSEARCHCV")
    _silent_print("=" * 80)
    
    grid_search.fit(X_pretest, y_pretest)
    
    _silent_print("\n[GridSearchCV] Best params:")
    _silent_print(json.dumps(grid_search.best_params_, indent=2, default=str))
    _silent_print(f"\n[GridSearchCV] Best lift_top10 score: {grid_search.best_score_:.4f}")
    
    # Step 11: OOS Evaluation
    final_model = grid_search.best_estimator_
    
    oos_prob = final_model.predict_proba(X_oos)[:, 1]
    oos_pred = (oos_prob >= CLASSIFICATION_THRESHOLD).astype(int)
    
    oos_auc = roc_auc_score(y_oos, oos_prob) if y_oos.nunique() > 1 else np.nan
    oos_recall = recall_score(y_oos, oos_pred, zero_division=0)
    oos_precision = precision_score(y_oos, oos_pred, zero_division=0)
    oos_f1 = f1_score(y_oos, oos_pred, zero_division=0)
    
    _silent_print("\n" + "=" * 80)
    _silent_print("OOS PERFORMANCE")
    _silent_print("=" * 80)
    _silent_print(f"OOS AUC:       {oos_auc:.4f}")
    _silent_print(f"OOS Recall:    {oos_recall:.4f}")
    _silent_print(f"OOS Precision: {oos_precision:.4f}")
    _silent_print(f"OOS F1:        {oos_f1:.4f}")
    
    # Step 12: OOS Business Metrics
    oos_eval_df = pd.DataFrame({
        "prob": oos_prob,
        "y": y_oos
    })
    
    top10_metrics = recall_at_top_percent(oos_eval_df, "prob", "y", 0.10)
    top20_metrics = recall_at_top_percent(oos_eval_df, "prob", "y", 0.20)
    
    _silent_print("\n" + "=" * 80)
    _silent_print("OOS BUSINESS METRICS")
    _silent_print("=" * 80)
    _silent_print(f"Recall @ Top 10%:    {top10_metrics['recall_at_top_pct']:.4f}")
    _silent_print(f"Precision @ Top 10%: {top10_metrics['precision_at_top_pct']:.4f}")
    _silent_print(f"Lift @ Top 10%:      {top10_metrics['lift_at_top_pct']:.2f}x")
    _silent_print()
    _silent_print(f"Recall @ Top 20%:    {top20_metrics['recall_at_top_pct']:.4f}")
    _silent_print(f"Precision @ Top 20%: {top20_metrics['precision_at_top_pct']:.4f}")
    _silent_print(f"Lift @ Top 20%:      {top20_metrics['lift_at_top_pct']:.2f}x")
    
    # Step 13: OOS Decile Table
    decile_table = build_decile_table(oos_eval_df, "prob", "y", n_bins=10)
    _silent_print("\n" + "=" * 80)
    _silent_print("OOS DECILE TABLE")
    _silent_print("=" * 80)
    _silent_print(decile_table.to_string(index=False))
    
    # Step 14: Feature Importance (aligned with notebook feature list)
    underlying_model = final_model.model_
    training_columns = final_model.feature_names_
    
    _silent_print("\n" + "=" * 80)
    _silent_print("FEATURE IMPORTANCE ANALYSIS")
    _silent_print("=" * 80)
    _silent_print(f"Model Family: {final_model.model_family}")
    _silent_print(f"Features used in final model: {len(training_columns)}")
    
    if final_model.model_family in ["rf", "lightgbm", "xgboost"]:
        # Tree-based models: feature importances
        feature_importance_df = pd.DataFrame({
            "feature": training_columns,
            "importance": underlying_model.feature_importances_
        })
        
        # Sort by importance (descending)
        feature_importance_df = feature_importance_df.sort_values("importance", ascending=False)
        feature_importance_df["importance_pct"] = (
            100 * feature_importance_df["importance"] / feature_importance_df["importance"].sum()
        )
        
        _silent_print(f"\n{'='*80}")
        _silent_print("TOP 25 MOST IMPORTANT FEATURES")
        _silent_print(f"{'='*80}")
        _silent_print(f"{'Rank':<6} {'Feature':<50} {'Importance':<12} {'% Total':<10}")
        _silent_print("-" * 80)
        
        for idx, (i, row) in enumerate(feature_importance_df.head(25).iterrows(), 1):
            _silent_print(f"{idx:<6} {row['feature']:<50} {row['importance']:<12.6f} {row['importance_pct']:<10.2f}%")
        
        # Show cumulative importance
        cumsum = feature_importance_df['importance_pct'].cumsum()
        top_10_cumsum = cumsum.iloc[9] if len(cumsum) >= 10 else cumsum.iloc[-1]
        top_25_cumsum = cumsum.iloc[24] if len(cumsum) >= 25 else cumsum.iloc[-1]
        
        _silent_print(f"\n{'='*80}")
        _silent_print("CUMULATIVE IMPORTANCE")
        _silent_print(f"{'='*80}")
        _silent_print(f"Top 10 features explain: {top_10_cumsum:.2f}% of total importance")
        _silent_print(f"Top 25 features explain: {top_25_cumsum:.2f}% of total importance")
        
        # Save to CSV for further analysis
        output_file = "feature_importance.csv"
        feature_importance_df.to_csv(output_file, index=False)
        _silent_print(f"\nFull feature importance saved to: {output_file}")
        
    elif final_model.model_family == "logistic":
        # Logistic Regression: coefficients
        coef_df = pd.DataFrame({
            "feature": training_columns,
            "coefficient": underlying_model.coef_[0],
            "abs_coefficient": np.abs(underlying_model.coef_[0])
        })
        
        # Sort by absolute coefficient (descending)
        coef_df = coef_df.sort_values("abs_coefficient", ascending=False)
        
        _silent_print(f"\n{'='*80}")
        _silent_print("TOP 25 MOST INFLUENTIAL FEATURES (by absolute coefficient)")
        _silent_print(f"{'='*80}")
        _silent_print(f"{'Rank':<6} {'Feature':<50} {'Coefficient':<15} {'Direction':<10}")
        _silent_print("-" * 80)
        
        for idx, (i, row) in enumerate(coef_df.head(25).iterrows(), 1):
            direction = "â†‘ Increase" if row['coefficient'] > 0 else "â†“ Decrease"
            _silent_print(f"{idx:<6} {row['feature']:<50} {row['coefficient']:<15.6f} {direction:<10}")
        
        _silent_print(f"\n{'='*80}")
        _silent_print("TOP 10 POSITIVE COEFFICIENTS (increase churn risk)")
        _silent_print(f"{'='*80}")
        top_positive = coef_df[coef_df['coefficient'] > 0].head(10)
        for idx, (i, row) in enumerate(top_positive.iterrows(), 1):
            _silent_print(f"{idx:<6} {row['feature']:<50} {row['coefficient']:<15.6f}")
        
        _silent_print(f"\n{'='*80}")
        _silent_print("TOP 10 NEGATIVE COEFFICIENTS (decrease churn risk)")
        _silent_print(f"{'='*80}")
        top_negative = coef_df[coef_df['coefficient'] < 0].head(10)
        for idx, (i, row) in enumerate(top_negative.iterrows(), 1):
            _silent_print(f"{idx:<6} {row['feature']:<50} {row['coefficient']:<15.6f}")
        
        # Save to CSV
        output_file = "feature_coefficients.csv"
        coef_df.to_csv(output_file, index=False)
        _silent_print(f"\nFull coefficients saved to: {output_file}")
    
    _silent_print("\n" + "=" * 80)
    _silent_print("PIPELINE COMPLETE")
    _silent_print("=" * 80)


if __name__ == '__main__':
    main()

