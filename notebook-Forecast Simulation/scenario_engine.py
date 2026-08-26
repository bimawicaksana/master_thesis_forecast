# ============================================================
# scenario_engine.py
# Forward Baseline + Scenario Stress Simulation Engine
# ============================================================

"""
This module implements the forward-looking simulation engine
used in Chapter 5 of the thesis.

The engine performs:

1. Baseline structural projection (2025–2030)
2. Scenario-based stress injection
3. Transport cost prediction (ANN)
4. Trade volume prediction (ANN)
5. Baseline vs Stress comparison

No execution occurs automatically.
This file only defines reusable functions.
"""

# ============================================================
# IMPORTS
# ============================================================

import json
import numpy as np
import pandas as pd
from datetime import datetime


# ============================================================
# GLOBAL CONFIGURATION
# ============================================================

BASE_YEAR = 2024
FUTURE_YEARS = list(range(2025, 2031))

baseline_config = {
    "gdp_growth": 0.016,
    "population_growth": 0.013,
    "production_growth": 0.00,
    "calorific_growth": 0.00,
    "lsbci_growth": 0.00,
    "bdi_growth": 0.00,
    "fbx_growth": 0.00
}


# ============================================================
# COLUMN TAXONOMY
# ============================================================

ID_COLS = ["year", "origin_isocode", "destination_isocode", "product_code"]

LABEL_COLS = ["origin_label", "destination_label", "product_label"]

STRUCTURAL_COLS = [
    "origin_gdp_usd_current",
    "destination_gdp_usd_current",
    "origin_population_total",
    "destination_population_total",
    "cepii_dist",
    "cepii_contig",
    "cepii_comlang_ethno",
    "cepii_wto_o",
    "cepii_wto_d",
    "cepii_fta_wto",
    "origin_production_qty",
    "destination_production_qty",
    "Origin_Daily_Calorific_Food",
    "Destination_Daily_Calorific_Food",
    "lsbci",
]

COST_EXOGENOUS_COLS = [
    "fbx_new",
    "bdi",
]

BASE_FEATURE_COLS = (
    ID_COLS + LABEL_COLS + STRUCTURAL_COLS + COST_EXOGENOUS_COLS
)

ALLOW_MISSING_LABELS = True


# ============================================================
# SAFE LOG
# ============================================================

def _safe_log(x, eps=1e-9):
    x = np.asarray(x, dtype=float)
    x = np.where(x <= eps, eps, x)
    return np.log(x)


# ============================================================
# SCHEMA VALIDATION
# ============================================================

def validate_input_schema(df: pd.DataFrame):
    required = ID_COLS + STRUCTURAL_COLS + COST_EXOGENOUS_COLS
    if not ALLOW_MISSING_LABELS:
        required += LABEL_COLS

    missing = sorted(set(required) - set(df.columns))
    if missing:
        raise ValueError(f"Missing required columns: {missing}")

    if not df.columns.is_unique:
        dupes = df.columns[df.columns.duplicated()].tolist()
        raise ValueError(f"Duplicate column labels: {dupes}")

# ============================================================
# CORRIDOR SELECTION ENGINE
# ============================================================

def select_affected_corridors(
    df_baseline: pd.DataFrame,
    eligibility_rule,
    product_codes,
    share_threshold=0.85,
    start_year=2025,
    end_year=2030,
    min_corridors=1
):
    """
    Dynamically select affected corridors based on baseline trade volumes.

    Parameters
    ----------
    df_baseline : pd.DataFrame
        Baseline prediction output (must contain 'tons_seamode_pred').

    eligibility_rule : callable
        Function that takes df and returns boolean mask.

    product_codes : list
        HS codes to restrict corridor selection.

    share_threshold : float
        Cumulative share threshold for selecting top corridors.

    start_year, end_year : int
        Time window for baseline aggregation.

    min_corridors : int
        Ensure at least this many corridors selected.

    Returns
    -------
    List of (origin, destination) tuples.
    """

    df = df_baseline.copy()

    # Restrict to time horizon
    df = df[(df["year"] >= start_year) & (df["year"] <= end_year)]

    # Apply eligibility rule
    df = df[eligibility_rule(df)]

    # Restrict to products
    if product_codes:
        df = df[df["product_code"].isin(product_codes)]

    if df.empty:
        raise ValueError("No corridors match eligibility rule.")

    # Aggregate baseline predicted tons
    corr = (
        df.groupby(["origin_isocode", "destination_isocode"], as_index=False)
          .agg(baseline_tons=("tons_seamode_pred", "sum"))
          .sort_values("baseline_tons", ascending=False)
    )

    # Compute shares
    corr["share"] = corr["baseline_tons"] / corr["baseline_tons"].sum()
    corr["cum_share"] = corr["share"].cumsum()

    # Select corridors up to threshold
    selected = corr[corr["cum_share"] <= share_threshold]

    if selected.shape[0] < min_corridors:
        selected = corr.head(min_corridors)

    return list(
        zip(selected["origin_isocode"], selected["destination_isocode"])
    )

# ============================================================
# BASELINE FEATURE CONSTRUCTION
# ============================================================

def build_future_features(
    df_fwd_forecast_gapyear: pd.DataFrame,
    base_year: int,
    future_years: list,
    baseline_config: dict
) -> pd.DataFrame:

    validate_input_schema(df_fwd_forecast_gapyear)

    df_base = df_fwd_forecast_gapyear[
        df_fwd_forecast_gapyear["year"] == base_year
    ].copy()

    keep_cols = [c for c in BASE_FEATURE_COLS if c in df_base.columns]
    df_base = df_base[keep_cols].copy()

    df_future = pd.concat(
        [df_base.assign(year=y, timeframe="future") for y in future_years],
        ignore_index=True
    )

    year_offset = (df_future["year"] - base_year).astype(int).values

    growth_map = {
        "origin_gdp_usd_current": baseline_config["gdp_growth"],
        "destination_gdp_usd_current": baseline_config["gdp_growth"],
        "origin_population_total": baseline_config["population_growth"],
        "destination_population_total": baseline_config["population_growth"],
        "origin_production_qty": baseline_config["production_growth"],
        "destination_production_qty": baseline_config["production_growth"],
        "Origin_Daily_Calorific_Food": baseline_config["calorific_growth"],
        "Destination_Daily_Calorific_Food": baseline_config["calorific_growth"],
        "lsbci": baseline_config["lsbci_growth"],
        "bdi": baseline_config["bdi_growth"],
        "fbx_new": baseline_config["fbx_growth"],
    }

    for col, rate in growth_map.items():
        if col in df_future.columns:
            base_vals = pd.to_numeric(df_future[col], errors="coerce").fillna(0.0).values
            df_future[col] = base_vals * np.power((1.0 + rate), year_offset)

    return df_future


# ============================================================
# STRESS APPLICATION
# ============================================================

def apply_combined_system_stress(
    df_future: pd.DataFrame,
    scenario_config: dict
) -> pd.DataFrame:

    df = df_future.copy()

    corridors = set(map(tuple, scenario_config["affected_corridors"]))
    products = scenario_config.get("affected_product_codes", [])

    corr_mask = pd.Series(
        list(zip(df["origin_isocode"], df["destination_isocode"])),
        index=df.index
    ).isin(corridors)

    prod_mask = (
        df["product_code"].isin(products)
        if products else pd.Series(True, index=df.index)
    )

    ts = scenario_config.get("transport_shocks", {})

    if ts.get("freight_proxy_fbx"):
        df.loc[corr_mask, "fbx_new"] *= (1 + ts["freight_proxy_fbx"])

    if ts.get("bdi_proxy"):
        df.loc[corr_mask, "bdi"] *= (1 + ts["bdi_proxy"])

    if ts.get("distance_proxy"):
        df.loc[corr_mask, "cepii_dist"] *= (1 + ts["distance_proxy"])

    if ts.get("connectivity_lsbci"):
        df.loc[corr_mask, "lsbci"] *= (1 + ts["connectivity_lsbci"])

    cs = scenario_config.get("country_shocks", {})

    for iso, shock in cs.get("production_by_origin_country", {}).items():
        m = (df["origin_isocode"] == iso) & prod_mask
        df.loc[m, "origin_production_qty"] = np.maximum(
            df.loc[m, "origin_production_qty"] * (1 + shock),
            1e-6
        )

    for iso, shock in cs.get("demand_by_destination_country", {}).items():
        m = (df["destination_isocode"] == iso) & prod_mask

        if scenario_config.get("apply_demand_to_calorific_proxy", False):
            df.loc[m, "Destination_Daily_Calorific_Food"] = np.maximum(
                df.loc[m, "Destination_Daily_Calorific_Food"] * (1 + shock),
                1e-6
            )
        else:
            df.loc[m, "destination_production_qty"] = np.maximum(
                df.loc[m, "destination_production_qty"] * (1 + shock),
                1e-6
            )

    return df


# ============================================================
# TRANSPORT COST PREDICTION
# ============================================================

def predict_transport_cost(
    df_future,
    make_ann_features_for_forecast,
    loaded_model_cost_ann,
    feature_ann_cols,
    categorical_ann_cols
):

    df = df_future.copy()

    df_ann = make_ann_features_for_forecast(df)

    X = df_ann[feature_ann_cols + categorical_ann_cols]
    ln_cost = loaded_model_cost_ann.predict(X)

    df_ann["transport_cost_per_ton_pred"] = np.exp(ln_cost)

    key_cols = ["origin_isocode", "destination_isocode", "product_code", "year"]

    df_out = df.merge(
        df_ann[key_cols + ["transport_cost_per_ton_pred"]],
        on=key_cols,
        how="left"
    )

    df_out["transport_cost_per_ton_pred"] = df_out[
        "transport_cost_per_ton_pred"
    ].fillna(0.0)

    return df_out


# ============================================================
# TRADE VOLUME PREDICTION
# ============================================================

def predict_trade_volume(
    df_with_cost,
    numerical_features,
    trade_categorical_features,
    trade_ann_pipeline
):

    df = df_with_cost.copy()

    df["year"] = df["year"].astype(int)
    df["country_pair_id"] = (
        df["origin_isocode"].astype(str) + "_" +
        df["destination_isocode"].astype(str)
    )

    df["Log_cost_per_ton_seamodes"] = _safe_log(df["transport_cost_per_ton_pred"])
    df["Log_origin_production_qty"] = _safe_log(df["origin_production_qty"])
    df["Log_destination_production_qty"] = _safe_log(df["destination_production_qty"])
    df["Log_Origin_GDP"] = _safe_log(df["origin_gdp_usd_current"])
    df["Log_Destination_GDP"] = _safe_log(df["destination_gdp_usd_current"])
    df["Log_Origin_Daily_Calorific_Food"] = _safe_log(df["Origin_Daily_Calorific_Food"])
    df["Log_Destination_Daily_Calorific_Food"] = _safe_log(df["Destination_Daily_Calorific_Food"])

    X = df[numerical_features + trade_categorical_features].copy()
    X.replace([np.inf, -np.inf], np.nan, inplace=True)
    X = X.fillna(0.0)

    df["log_tons_seamode_pred"] = trade_ann_pipeline.predict(X)
    df["tons_seamode_pred"] = np.exp(df["log_tons_seamode_pred"])

    return df


# ============================================================
# MASTER RUN FUNCTION
# ============================================================

def run_baseline_and_scenario(
    df_fwd_forecast_gapyear,
    scenario_config,
    make_ann_features_for_forecast,
    loaded_model_cost_ann,
    feature_ann_cols,
    categorical_ann_cols,
    numerical_features,
    trade_categorical_features,
    trade_ann_pipeline,
    baseline_config,
    base_year,
    future_years,
    output_dir="."
):

    ts = datetime.now().strftime("%Y%m%d_%H%M%S")
    scen = scenario_config["scenario_name"].replace(" ", "_")

    df_future_base = build_future_features(
        df_fwd_forecast_gapyear,
        base_year,
        future_years,
        baseline_config
    )

    df_base_cost = predict_transport_cost(
        df_future_base,
        make_ann_features_for_forecast,
        loaded_model_cost_ann,
        feature_ann_cols,
        categorical_ann_cols
    )

    df_base_full = predict_trade_volume(
        df_base_cost,
        numerical_features,
        trade_categorical_features,
        trade_ann_pipeline
    )

    df_stress_input = apply_combined_system_stress(
        df_future_base,
        scenario_config
    )

    df_stress_cost = predict_transport_cost(
        df_stress_input,
        make_ann_features_for_forecast,
        loaded_model_cost_ann,
        feature_ann_cols,
        categorical_ann_cols
    )

    df_stress_full = predict_trade_volume(
        df_stress_cost,
        numerical_features,
        trade_categorical_features,
        trade_ann_pipeline
    )

    key_cols = ["origin_isocode", "destination_isocode", "product_code", "year"]

    df_cmp = df_base_full[key_cols + [
        "transport_cost_per_ton_pred",
        "tons_seamode_pred"
    ]].merge(
        df_stress_full[key_cols + [
            "transport_cost_per_ton_pred",
            "tons_seamode_pred"
        ]],
        on=key_cols,
        suffixes=("_baseline", "_stress"),
        how="inner"
    )

    df_cmp["pct_cost_change"] = (
        df_cmp["transport_cost_per_ton_pred_stress"] /
        df_cmp["transport_cost_per_ton_pred_baseline"] - 1
    ) * 100

    df_cmp["pct_trade_change"] = (
        df_cmp["tons_seamode_pred_stress"] /
        df_cmp["tons_seamode_pred_baseline"] - 1
    ) * 100


    return {
        "df_baseline": df_base_full,
        "df_stress": df_stress_full,
        "df_compare": df_cmp,
        "config": {
            "baseline_config": baseline_config,
            "scenario_config": scenario_config
        }
    }
