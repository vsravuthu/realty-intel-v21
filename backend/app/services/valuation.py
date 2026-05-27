from __future__ import annotations

import hashlib
import math
import statistics

from app.models import ComparableSale, ValuationResult


def _h(seed: str, low: float, high: float) -> float:
    v = int(hashlib.sha256(seed.encode()).hexdigest()[:12], 16) % 10000
    return low + v / 10000 * (high - low)


def _base_ppsf(city: str) -> float:
    c = city.lower()
    if "bellevue" in c:
        return 680
    if "redmond" in c:
        return 625
    if "seattle" in c:
        return 610
    return 575


def generate_comps(facts: dict) -> list[ComparableSale]:
    seed = facts.get("normalized_address") or facts.get("address") or "seattle"
    sqft = float(facts.get("sqft") or 1850)
    beds = float(facts.get("beds") or 3)
    baths = float(facts.get("baths") or 2)
    year = int(facts.get("year_built") or 1978)
    ppsf = _base_ppsf(str(facts.get("city", "Seattle")))

    comps: list[ComparableSale] = []
    for i in range(1, 8):
        size_factor = _h(seed + f"size{i}", 0.86, 1.14)
        comp_sqft = max(700, round(sqft * size_factor))
        comp_beds = max(1, round(beds + _h(seed + f"beds{i}", -1, 1)))
        comp_baths = max(1, round((baths + _h(seed + f"baths{i}", -0.8, 0.8)) * 2) / 2)
        comp_year = max(1900, min(2025, round(year + _h(seed + f"year{i}", -22, 22))))
        distance = round(_h(seed + f"dist{i}", 0.12, 1.85), 2)
        months = round(_h(seed + f"months{i}", 0.4, 8.5), 1)
        market_factor = 1 + _h(seed + f"market{i}", -0.07, 0.08)
        comp_ppsf = ppsf * market_factor * (1 + (2025 - comp_year) * -0.0015)
        sale_price = round(comp_sqft * comp_ppsf / 1000) * 1000
        similarity = max(55, min(96, 100 - distance * 12 - abs(comp_sqft - sqft) / max(sqft, 1) * 30 - months * 1.5))
        age_adjust = (year - comp_year) * 1800
        size_adjust = (sqft - comp_sqft) * ppsf * 0.92
        time_adjust = months * 0.003 * sale_price
        adjusted = round((sale_price + age_adjust + size_adjust + time_adjust) / 1000) * 1000
        comps.append(ComparableSale(
            address=f"Comparable #{i} near {facts.get('city', 'Seattle')}",
            sale_price=float(sale_price),
            sqft=float(comp_sqft), beds=float(comp_beds), baths=float(comp_baths), year_built=int(comp_year),
            distance_miles=distance, sold_months_ago=months, similarity=round(similarity, 1),
            adjusted_price=float(adjusted), price_per_sqft=round(sale_price / comp_sqft, 2),
        ))
    comps.sort(key=lambda c: c.similarity, reverse=True)
    return comps


def valuate(facts: dict, data_quality: float = 0.45) -> ValuationResult:
    comps = generate_comps(facts)
    weights = [max(0.05, c.similarity / 100) * math.exp(-0.08 * c.sold_months_ago) for c in comps]
    values = [c.adjusted_price for c in comps]
    weighted = sum(v * w for v, w in zip(values, weights)) / sum(weights)

    condition = float(facts.get("condition_prior") or 0.65)
    market_heat = float(facts.get("market_heat_prior") or 0.60)
    quality = float(facts.get("neighborhood_quality_prior") or 0.65)
    condition_adj = 1 + (condition - 0.65) * 0.14
    market_adj = 1 + (market_heat - 0.60) * 0.08
    loc_adj = 1 + (quality - 0.65) * 0.10
    estimated = round(weighted * condition_adj * market_adj * loc_adj / 1000) * 1000

    spread = statistics.pstdev(values) if len(values) > 1 else estimated * 0.10
    uncertainty_pct = max(0.055, min(0.18, 0.15 - data_quality * 0.08 + spread / max(estimated, 1) * 0.25))
    low = round(estimated * (1 - uncertainty_pct) / 1000) * 1000
    high = round(estimated * (1 + uncertainty_pct) / 1000) * 1000

    list_price = facts.get("price")
    price_delta = None
    price_delta_pct = None
    verdict = "Fair"
    if list_price:
        price_delta = float(list_price) - estimated
        price_delta_pct = price_delta / estimated * 100
        if price_delta_pct <= -8:
            verdict = "Buy"
        elif price_delta_pct <= -3:
            verdict = "Negotiate"
        elif price_delta_pct <= 4:
            verdict = "Fair"
        elif price_delta_pct <= 10:
            verdict = "Wait"
        elif price_delta_pct <= 18:
            verdict = "Pass"
        else:
            verdict = "Strong Pass"

    confidence_score = round(min(0.92, max(0.25, data_quality * 0.55 + (sum(c.similarity for c in comps[:5]) / 500) * 0.45)), 2)
    confidence = "High" if confidence_score >= 0.78 else "Medium" if confidence_score >= 0.55 else "Low"
    explanation = "Hybrid AVM demo: weighted comparable-sales engine with time, size, age, condition, location, and market-heat adjustments. Production accuracy requires licensed sold comps and assessor verification."
    return ValuationResult(
        estimated_value=float(estimated), low=float(low), high=float(high), price_delta=price_delta,
        price_delta_pct=round(price_delta_pct, 2) if price_delta_pct is not None else None,
        verdict=verdict, confidence=confidence, confidence_score=confidence_score,
        model_stack=["Comparable-sales similarity", "Hedonic adjustment scaffold", "Geospatial/time decay", "Uncertainty interval", "Confidence calibration"],
        comps=comps, explanation=explanation,
    )
