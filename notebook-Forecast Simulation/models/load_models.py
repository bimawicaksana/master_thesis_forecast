def load_cost_ann_model(model_path="models/ann_model_pipeline.pkl"):
    return joblib.load(model_path)


def load_trade_ann_model(model_path="models/trade_ann_log_model.pkl"):
    with open(model_path, "rb") as f:
        return joblib.load(f)