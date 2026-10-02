import numpy as np
import pandas as pd
def _zscore(s):
    return (s - s.mean()) / s.std(ddof=0)

def _safe_log(x, eps=1e-9):
    return np.log(np.clip(x, eps, None))


def build_features(
    df: pd.DataFrame,
    *,
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
    col_tons = 'tons_seamode',
    hs4_bulk_list=("1001","1002","1003","1004","1005","1006","1007","1008","1009"),
    verbose=True
):
    """
    Build model-ready features for the ANN seamode transport cost model.
    Produces:
      - log features
      - interactions
      - bulk_share probability
      - connectivity z-scores
      - minimal cleaned dataframe for ANN input
    """

    df = df.copy()

    # --------------------------------------------------
    # 0) Pair ID
    # --------------------------------------------------
    if col_o in df.columns and col_d in df.columns:
        df["pair_id"] = df[col_o].astype(str) + "|" + df[col_d].astype(str)
    else:
        raise ValueError("Missing origin/destination isocode columns")

    # --------------------------------------------------
    # 2) Log transformations
    # --------------------------------------------------
    for src, dst in [
        (col_gdp_o, "ln_gdp_o"),
        (col_gdp_d, "ln_gdp_d"),
        (col_dist, "ln_dist"),
        (col_bdi, "ln_bdi"),
        (col_fbx,"ln_fbx")
    ]:
        df[dst] = _safe_log(df[src].astype(float))


    # --------------------------------------------------
    # 3) Connectivity (z-score)
    # --------------------------------------------------
    df["conn_ij"] = _zscore(df[col_conn].astype(float))
    df["comp_ij"] = df["conn_ij"]

    # --------------------------------------------------
    # 4) Bulk-share probabilistic transformation
    # --------------------------------------------------
    df["bulk_potential"] = df[col_prod].astype(str).isin(hs4_bulk_list).astype(int)

    a, b = 6.0, 10.0  # log thresholds

    if col_tons not in df.columns:
        df["bulk_share"] = df["bulk_potential"].astype(float)
    else:
        vol = df[col_tons].fillna(0).astype(float)
        logv = np.log1p(vol)
        s = (logv - a) / (b - a)
        df["bulk_share"] = df["bulk_potential"] * s.clip(0, 1)

    # --------------------------------------------------
    # 5) Interactions
    # --------------------------------------------------
    df["ln_dist_x_bulk"] = df["ln_dist"] * df["bulk_share"]
    df["conn_x_bulk"]    = df["conn_ij"] * df["bulk_share"]
    df["ln_bdi_x_bulk"]  = df["ln_bdi"] * df["bulk_share"]

    # --------------------------------------------------
    # 6) Final cleaned dataframe
    # --------------------------------------------------
    keep_cols = [
        col_o, col_d, "pair_id", col_year, col_prod,
        "ln_dist", "conn_ij", "comp_ij",
        "ln_gdp_o", "ln_gdp_d",
        "ln_fbx", "ln_bdi", "ln_bdi_x_bulk",
        "bulk_share", "ln_dist_x_bulk", "conn_x_bulk"
    ]

    df_model = df[keep_cols].dropna().copy()

    # --------------------------------------------------
    # 7) Optional diagnostics
    # --------------------------------------------------
    if verbose and "bulk_share" in df_model.columns:
        mean_bulk = df_model["bulk_share"].mean()
        print(f"\n📊 Bulk-share Diagnostics:")
        print(f"  • Mean bulk_share: {mean_bulk:.3f}")
        print(f"  • Rows kept: {len(df_model):,}")

    return df_model