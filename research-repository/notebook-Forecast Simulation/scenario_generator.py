import json
from pathlib import Path
import sys
from pathlib import Path

sys.path.append(str(Path().resolve()))
from scenario_engine import select_affected_corridors
# ============================================================
# GENERIC CORRIDOR SELECTOR
# ============================================================

def generate_scenario_config(
    scenario_name: str,
    affected_corridors: list,
    transport_shocks: dict,
    affected_product_codes: list,
    apply_demand_to_calorific_proxy: bool = False
):
    """
    Build standardized scenario configuration dictionary.
    """

    return {
        "scenario_name": scenario_name,
        "affected_corridors": affected_corridors,
        "transport_shocks": transport_shocks,
        "affected_product_codes": affected_product_codes,
        "apply_demand_to_calorific_proxy": apply_demand_to_calorific_proxy
    }


# ============================================================
# SAVE CONFIG TO JSON
# ============================================================

def save_scenario_config(config: dict, scenario_folder: str):
    """
    Save scenario config to results/{scenario_folder}/config.json
    """

    out_dir = Path("results") / scenario_folder
    out_dir.mkdir(parents=True, exist_ok=True)

    with open(out_dir / "config.json", "w") as f:
        json.dump(config, f, indent=2)

    print(f"Scenario config saved to {out_dir / 'config.json'}")
EU_ISOCODES = [
    "AUT","BEL","BGR","HRV","CYP","CZE","DNK","EST","FIN","FRA",
    "DEU","GRC","HUN","IRL","ITA","LVA","LTU","LUX","MLT","NLD",
    "POL","PRT","ROU","SVK","SVN","ESP","SWE"
]


def build_eu_ets_scenario(df_baseline):

    def eu_ets_rule(df):
        return (
            df["origin_isocode"].isin(EU_ISOCODES) |
            df["destination_isocode"].isin(EU_ISOCODES)
        )

    affected_corridors = select_affected_corridors(
        df_baseline=df_baseline,
        eligibility_rule=eu_ets_rule,
        product_codes=["1001", "1005"],
        share_threshold=0.85,
        start_year=2025,
        end_year=2030
    )

    return generate_scenario_config(
        scenario_name="EU ETS Maritime Regulation",
        affected_corridors=affected_corridors,
        transport_shocks={
            "connectivity_lsbci": 0.00,
            "freight_proxy_fbx":  0.12,
            "distance_proxy":     0.00,
            "bdi_proxy":          0.00
        },
        affected_product_codes=["1001", "1005"],
        apply_demand_to_calorific_proxy=False
    )