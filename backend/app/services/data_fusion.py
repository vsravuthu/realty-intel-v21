from __future__ import annotations

import hashlib

from app.models import AnalyzeRequest, ExtractedClaim
from app.services.address_suggest import normalize_address
from app.services.live_connectors import collect_live_data


def _claim_value(claims: list[ExtractedClaim], key: str):
    for c in claims:
        if c.key == key:
            return c.value
    return None


def _hash_float(seed: str, low: float, high: float) -> float:
    h = int(hashlib.sha256(seed.encode()).hexdigest()[:12], 16)
    return low + (h % 10000) / 10000 * (high - low)


def _first_not_none(*vals):
    for v in vals:
        if v is not None and v != "":
            return v
    return None


def build_property_facts(req: AnalyzeRequest, claims: list[ExtractedClaim]) -> dict:
    suggestion = normalize_address(req.address)
    normalized = suggestion.label if suggestion else req.address.strip()
    city = suggestion.city if suggestion else ("Bellevue" if "bellevue" in req.address.lower() else "Redmond" if "redmond" in req.address.lower() else "Seattle" if "seattle" in req.address.lower() else "Seattle Metro")

    live_bundle = collect_live_data(req.address) if req.mode in {"demo", "research", "strict"} else {"facts": {}, "results": [], "connected_names": [], "errors": []}
    live_facts = live_bundle.get("facts") or {}

    # Prefer live authoritative geocode when available; fallback to bundled sample/typed address.
    normalized = _first_not_none(live_facts.get("census_matched_address"), normalized)
    lat = _first_not_none(live_facts.get("lat"), suggestion.lat if suggestion else None)
    lon = _first_not_none(live_facts.get("lon"), suggestion.lon if suggestion else None)

    manual = req.manual.model_dump()
    facts = {
        "address": req.address.strip(),
        "normalized_address": normalized,
        "city": city,
        "lat": lat,
        "lon": lon,
        "price": manual.get("price") or _claim_value(claims, "price"),
        "beds": manual.get("beds") or _claim_value(claims, "beds") or 3,
        "baths": manual.get("baths") or _claim_value(claims, "baths") or 2,
        "sqft": manual.get("sqft") or _claim_value(claims, "sqft") or 1850,
        "lot_sqft": manual.get("lot_sqft") or _claim_value(claims, "lot_sqft") or 5200,
        "year_built": manual.get("year_built") or _claim_value(claims, "year_built") or 1978,
        "hoa_monthly": manual.get("hoa_monthly") if manual.get("hoa_monthly") is not None else (_claim_value(claims, "hoa_monthly") or 0),
        "property_type": manual.get("property_type") or "single_family",
        "data_mode": req.mode,
        "geo_confidence": 0.92 if live_facts.get("census_matched_address") else (suggestion.confidence if suggestion else 0.25),
    }

    # Merge live/public-source facts without overwriting user-entered core facts.
    for k, v in live_facts.items():
        if v is not None and k not in facts:
            facts[k] = v
    facts["live_source_results"] = live_bundle.get("results") or []
    facts["live_connected_sources"] = live_bundle.get("connected_names") or []
    facts["live_connector_errors"] = live_bundle.get("errors") or []

    facts["neighborhood_quality_prior"] = round(_hash_float(str(normalized), 0.55, 0.88), 2)
    # Use ACS/context if live data exists to adjust priors a little.
    income = live_facts.get("median_household_income")
    if isinstance(income, (int, float)) and income > 0:
        facts["neighborhood_quality_prior"] = max(0.48, min(0.92, round(0.50 + min(income, 220000) / 220000 * 0.36, 2)))
    facts["market_heat_prior"] = round(_hash_float(str(normalized) + "market", 0.45, 0.82), 2)
    facts["condition_prior"] = round(_hash_float(str(normalized) + "condition", 0.48, 0.86), 2)

    return facts
