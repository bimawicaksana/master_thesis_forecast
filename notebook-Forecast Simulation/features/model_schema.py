# ============================================================
# MODEL INPUT SCHEMA (Single Source of Truth)
# ============================================================

# ----- COST ANN MODEL -----

COST_NUMERIC_FEATURES = [
    "ln_gdp_o",
    "ln_gdp_d",
    "ln_dist",
    "conn_ij",
    "ln_bdi",
    "ln_fbx",
    "ln_dist_x_bulk",
    "conn_x_bulk",
    "ln_bdi_x_bulk",
    "bulk_share"
]

COST_CATEGORICAL_FEATURES = [
    "origin_isocode",
    "destination_isocode",
    "product_code"
]


# ----- TRADE ANN MODEL -----

TRADE_NUMERIC_FEATURES = [
    "Log_Origin_GDP",
    "Log_Destination_GDP",
    "cepii_contig",
    "cepii_comlang_ethno",
    "cepii_wto_o",
    "cepii_wto_d",
    "cepii_fta_wto",
    "Log_cost_per_ton_seamodes",
    "lsbci",
    "Log_origin_production_qty",
    "Log_destination_production_qty",
    "Log_Origin_Daily_Calorific_Food",
    "Log_Destination_Daily_Calorific_Food"
]

TRADE_CATEGORICAL_FEATURES = [
    "country_pair_id",
    "product_code"
]