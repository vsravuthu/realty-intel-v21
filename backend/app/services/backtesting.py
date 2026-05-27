from __future__ import annotations

from app.models import BacktestMetric, BacktestResponse


def backtest_summary() -> BacktestResponse:
    return BacktestResponse(
        dataset="Synthetic Seattle V18 demo set; replace with historical MLS/assessor closed sales for real validation",
        sample_size=240,
        metrics=[
            BacktestMetric(name="Median Absolute Percentage Error", value="6.8% demo", target="< 7% after real MLS training", status="warning"),
            BacktestMetric(name="Mean Absolute Percentage Error", value="8.9% demo", target="< 10% after real MLS training", status="warning"),
            BacktestMetric(name="90% Interval Coverage", value="88% demo", target="85%–95% calibrated", status="pass"),
            BacktestMetric(name="Claim Conflict Recall", value="0.81 demo", target="> 0.85 with documents", status="warning"),
            BacktestMetric(name="Source Citation Coverage", value="0.42 demo", target="> 0.95 production", status="fail"),
        ],
        notes=[
            "Current metrics are placeholders for the dashboard contract, not evidence of production accuracy.",
            "Real validation requires historical sale price, list price, DOM, concessions, property facts, photos, permits, and assessor data.",
            "Use walk-forward validation by neighborhood and sale month to prevent leakage.",
        ],
    )
