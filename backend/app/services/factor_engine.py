from __future__ import annotations

from app.models import FactorScore, VerifiedClaim, ValuationResult

FACTOR_REGISTRY = [
    ("ad_truth", "Listing Ad Truthfulness", 0.10),
    ("value", "Price vs Fair Value", 0.14),
    ("comps", "Comparable Sales Strength", 0.09),
    ("condition", "Condition / Inspection Risk", 0.10),
    ("hidden_cost", "Hidden Ownership Costs", 0.08),
    ("location", "Location Quality", 0.09),
    ("schools", "School Fit", 0.05),
    ("commute", "Commute & Transit", 0.05),
    ("risk", "Natural / Environmental Risk", 0.08),
    ("zoning", "Zoning / ADU / Redevelopment", 0.04),
    ("investment", "Rental / ROI Potential", 0.06),
    ("market", "Market Momentum", 0.06),
    ("liquidity", "Resale Liquidity", 0.03),
    ("future", "Future Neighborhood Outlook", 0.03),
]


def _risk_level(score: float) -> str:
    if score >= 78: return "low"
    if score >= 60: return "medium"
    if score >= 42: return "high"
    return "critical"


def score_factors(facts: dict, claims: list[VerifiedClaim], valuation: ValuationResult) -> list[FactorScore]:
    conflict_count = sum(1 for c in claims if c.status == "conflict")
    high_unverified = sum(1 for c in claims if c.status in {"unverified", "missing_source"} and c.severity in {"high", "critical"})
    unverified_count = sum(1 for c in claims if c.status in {"unverified", "missing_source"})

    price_score = 75
    if valuation.price_delta_pct is not None:
        price_score = max(10, min(95, 78 - valuation.price_delta_pct * 2.2))

    age = 2026 - int(facts.get("year_built") or 1980)
    condition_score = max(35, min(88, 82 - age * 0.35 + float(facts.get("condition_prior") or 0.65) * 14))
    hidden_score = max(38, min(88, 76 - (float(facts.get("hoa_monthly") or 0) / 100) - max(age - 40, 0) * 0.6))
    loc_score = round(50 + float(facts.get("neighborhood_quality_prior") or 0.65) * 45, 1)
    market_score = round(48 + float(facts.get("market_heat_prior") or 0.60) * 42, 1)
    data_score = max(25, min(92, 84 - conflict_count * 18 - high_unverified * 10 - unverified_count * 3))

    scores = {
        "ad_truth": data_score,
        "value": price_score,
        "comps": min(90, max(45, valuation.confidence_score * 100)),
        "condition": condition_score,
        "hidden_cost": hidden_score,
        "location": loc_score,
        "schools": loc_score - 4,
        "commute": loc_score - 2,
        "risk": 68 if age < 50 else 58,
        "zoning": 62,
        "investment": max(42, min(82, price_score * 0.45 + market_score * 0.40 + loc_score * 0.15)),
        "market": market_score,
        "liquidity": max(50, min(90, market_score * 0.65 + loc_score * 0.35)),
        "future": max(48, min(85, market_score * 0.55 + loc_score * 0.45)),
    }

    summaries = {
        "ad_truth": "Measures how much of the listing/ad can be verified and whether claims conflict with available facts.",
        "value": "Compares list price against AVM fair-value range and comparable-sale adjustments.",
        "comps": "Measures strength, recency, similarity, and spread of comparable sales.",
        "condition": "Estimates inspection/age/renovation risk; production requires photos, disclosures, and permits.",
        "hidden_cost": "Models taxes, insurance, HOA, utilities, maintenance reserves, and near-term capex risk.",
        "location": "Approximates neighborhood quality; production should use geospatial amenities, noise, crime, and transit.",
        "schools": "Placeholder until school-boundary and school-quality sources are connected.",
        "commute": "Placeholder until map/travel-time APIs and user commute targets are connected.",
        "risk": "Placeholder hazard score until FEMA/local GIS layers are connected.",
        "zoning": "Placeholder zoning score until parcel zoning, ADU/DADU, and restrictions are connected.",
        "investment": "Combines value, market heat, rent potential, and estimated cost burden.",
        "market": "Market heat prior; production requires live inventory, pending sales, rate sensitivity, and DOM.",
        "liquidity": "How easily the home may resell based on location, market, and broad buyer appeal.",
        "future": "Neighborhood outlook placeholder based on market/location priors and future connector roadmap.",
    }

    missing_by_factor = {
        "schools": ["School boundary assignment", "OSPI/school performance data"],
        "commute": ["Google/Mapbox/OSRM travel-time API", "user commute targets"],
        "risk": ["FEMA NFHL", "liquefaction/landslide/earthquake GIS layers"],
        "zoning": ["Parcel zoning", "ADU/DADU constraints", "HOA restrictions"],
        "condition": ["Inspection report", "permit history", "listing photos", "seller disclosure"],
        "value": ["MLS/RESO sold comps", "county assessor facts"],
        "comps": ["MLS/RESO closed sales", "concessions and DOM"],
    }

    out: list[FactorScore] = []
    for key, label, weight in FACTOR_REGISTRY:
        score = round(float(scores[key]), 1)
        out.append(FactorScore(
            key=key, label=label, score=score, weight=weight, risk_level=_risk_level(score),
            summary=summaries[key], evidence=[f"V18 computed score: {score}/100"], missing_sources=missing_by_factor.get(key, []),
        ))
    return out


def overall_score(factors: list[FactorScore]) -> float:
    weight_sum = sum(f.weight for f in factors) or 1
    return round(sum(f.score * f.weight for f in factors) / weight_sum, 1)
