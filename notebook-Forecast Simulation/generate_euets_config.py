import json
from pathlib import Path
import pandas as pd

# ============================================================
# PARAMETERS
# ============================================================

EU_ISOCODES = [
    "AUT","BEL","BGR","HRV","CYP","CZE","DNK","EST","FIN","FRA",
    "DEU","GRC","HUN","IRL","ITA","LVA","LTU","LUX","MLT","NLD",
    "POL","PRT","ROU","SVK","SVN","ESP","SWE"
]

PRODUCT_CODES = ["1001", "1005"]
SHARE_THRESHOLD = 0.85
START_YEAR = 2025
END_YEAR = 2030

OUTPUT_PATH = Path("configs/eu_ets.json")


# ============================================================
# SELECT AFFECTED CORRIDORS
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
    df = df_baseline.copy()
    df = df[(df["year"] >= start_year) & (df["year"] <= end_year)]
    df = df[eligibility_rule(df)]
    df = df[df["product_code"].isin(product_codes)]

    if df.empty:
        raise ValueError("No corridors match eligibility rule.")

    corr = (
        df.groupby(["origin_isocode", "destination_isocode"], as_index=False)
          .agg(baseline_tons=("tons_seamode_pred", "sum"))
          .sort_values("baseline_tons", ascending=False)
    )

    corr["share"] = corr["baseline_tons"] / corr["baseline_tons"].sum()
    corr["cum_share"] = corr["share"].cumsum()

    selected = corr[corr["cum_share"] <= share_threshold]

    if selected.shape[0] < min_corridors:
        selected = corr.head(min_corridors)

    return [
        [o, d]  # Convert to JSON-safe list
        for o, d in zip(selected["origin_isocode"], selected["destination_isocode"])
    ]


# ============================================================
# EU ETS RULE
# ============================================================

def eu_ets_rule(df):
    return (
        df["origin_isocode"].isin(EU_ISOCODES) |
        df["destination_isocode"].isin(EU_ISOCODES)
    )


# ============================================================
# BUILD SCENARIO CONFIG
# ============================================================

def build_eu_ets_config(df_baseline: pd.DataFrame):

    affected_corridors = select_affected_corridors(
        df_baseline=df_baseline,
        eligibility_rule=eu_ets_rule,
        product_codes=PRODUCT_CODES,
        share_threshold=SHARE_THRESHOLD,
        start_year=START_YEAR,
        end_year=END_YEAR
    )

    scenario_config = {
        "scenario_name": "EU ETS Maritime Regulation",

        "affected_corridors": affected_corridors,

        "affected_product_codes": PRODUCT_CODES,

        "transport_shocks": {
            "freight_proxy_fbx": 0.12,  # ETS cost pass-through
            "connectivity_lsbci": 0.00,
            "distance_proxy": 0.00,
            "bdi_proxy": 0.00
        },

        "country_shocks": {
            "production_by_origin_country": {},
            "demand_by_destination_country": {}
        },

        "apply_demand_to_calorific_proxy": False
    }

    return scenario_config


# ============================================================
# SAVE FUNCTION
# ============================================================

def save_config(config: dict, path: Path):
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "w") as f:
        json.dump(config, f, indent=2)
    print(f"✅ EU ETS config saved to: {path}")


# ============================================================
# MAIN EXECUTION
# ============================================================

def generate_eu_ets_json(df_baseline: pd.DataFrame):
    config = build_eu_ets_config(df_baseline)
    save_config(config, OUTPUT_PATH)