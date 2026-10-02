import pandas as pd


def make_ann_features_for_forecast(
    df_raw: pd.DataFrame,
    build_features_func,
    feature_ann_cols: list,
    categorical_ann_cols: list,
    dummy_cost_col: str = "transport_expend_per_ton_seamodes"
) -> pd.DataFrame:
    """
    Build ANN features for forward forecast data.

    This function guarantees:
    - Same feature construction logic as training
    - No hidden global dependencies
    - Safe handling of missing columns

    Parameters
    ----------
    df_raw : pd.DataFrame
        Forward baseline/stress dataframe.

    build_features_func : callable
        The original build_features function used in training.

    feature_ann_cols : list
        Numerical ANN feature columns expected by the cost model.

    categorical_ann_cols : list
        Categorical ANN feature columns expected by the cost model.

    dummy_cost_col : str
        Temporary placeholder column required by build_features.

    Returns
    -------
    pd.DataFrame
        Feature-engineered dataframe ready for ANN prediction.
    """

    df = df_raw.copy()

    # Ensure dummy column exists (needed by original build_features logic)
    if dummy_cost_col not in df.columns:
        df[dummy_cost_col] = 1.0

    # Recreate training-time feature logic
    df_feat = build_features_func(
        df,
        col_fbx="fbx_new",
        col_bdi="bdi",
        col_gdp_o="origin_gdp_usd_current",
        col_gdp_d="destination_gdp_usd_current",
        col_dist="cepii_dist",
        col_conn="lsbci",
        col_o="origin_isocode",
        col_d="destination_isocode",
        col_year="year",
        col_prod="product_code",
        verbose=False,
    )

    # Ensure required ANN inputs exist
    required_cols = feature_ann_cols + categorical_ann_cols

    missing = [c for c in required_cols if c not in df_feat.columns]
    if missing:
        raise ValueError(f"Missing ANN feature columns: {missing}")

    # Drop rows where ANN inputs are incomplete
    df_feat = df_feat.dropna(subset=required_cols).copy()

    return df_feat