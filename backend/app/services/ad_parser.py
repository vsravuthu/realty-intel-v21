from __future__ import annotations

import re
from typing import Any

from app.models import ExtractedClaim, ManualFacts

_PRICE_PATTERNS = [
    re.compile(r"(?:listed|asking|priced|price|at)\s*(?:for|at)?\s*\$?([0-9][0-9,]{4,})(?:k|K)?"),
    re.compile(r"\$\s*([0-9][0-9,]{4,})(?:k|K)?"),
]


def _num(value: str) -> float | None:
    try:
        return float(value.replace(",", ""))
    except Exception:
        return None


def _add(claims: list[ExtractedClaim], key: str, label: str, value: Any, unit: str | None, evidence: str, confidence: float = 0.78) -> None:
    if value is None:
        return
    if any(c.key == key and c.value == value for c in claims):
        return
    claims.append(ExtractedClaim(key=key, label=label, value=value, unit=unit, evidence_text=evidence.strip()[:240], confidence=confidence))


def parse_listing_text(text: str | None, manual: ManualFacts | None = None) -> list[ExtractedClaim]:
    manual = manual or ManualFacts()
    claims: list[ExtractedClaim] = []
    t = text or ""
    low = t.lower()

    for pat in _PRICE_PATTERNS:
        m = pat.search(t)
        if m:
            price = _num(m.group(1))
            if price and "k" in m.group(0).lower() and price < 10000:
                price *= 1000
            _add(claims, "price", "Advertised price", price, "USD", m.group(0), 0.82)
            break

    beds = re.search(r"(\d+(?:\.\d+)?)\s*(?:bed|beds|bd|bedroom|bedrooms)\b", low)
    if beds:
        _add(claims, "beds", "Bedrooms", _num(beds.group(1)), "count", beds.group(0), 0.88)

    baths = re.search(r"(\d+(?:\.\d+)?)\s*(?:bath|baths|ba|bathroom|bathrooms)\b", low)
    if baths:
        _add(claims, "baths", "Bathrooms", _num(baths.group(1)), "count", baths.group(0), 0.88)

    sqft = re.search(r"([0-9][0-9,]{2,5})\s*(?:sq\.?\s*ft|sqft|square feet|sf)\b", low)
    if sqft:
        _add(claims, "sqft", "Advertised living area", _num(sqft.group(1)), "sqft", sqft.group(0), 0.84)

    lot = re.search(r"([0-9][0-9,]{2,6})\s*(?:lot|lot sqft|lot sq ft|sqft lot|square foot lot)", low)
    if lot:
        _add(claims, "lot_sqft", "Advertised lot size", _num(lot.group(1)), "sqft", lot.group(0), 0.68)

    year = re.search(r"(?:built in|year built|built)\s*(19\d{2}|20\d{2})", low)
    if year:
        _add(claims, "year_built", "Year built", int(year.group(1)), "year", year.group(0), 0.86)

    hoa_zero = re.search(r"(?:no hoa|zero hoa|hoa\s*\$?0|no monthly dues)", low)
    if hoa_zero:
        _add(claims, "hoa_monthly", "HOA monthly dues", 0, "USD/month", hoa_zero.group(0), 0.82)
    else:
        hoa = re.search(r"hoa\s*(?:dues|fee|monthly)?\s*\$?([0-9,]+)", low)
        if hoa:
            _add(claims, "hoa_monthly", "HOA monthly dues", _num(hoa.group(1)), "USD/month", hoa.group(0), 0.74)

    keyword_claims = {
        "renovated": ["renovated", "fully updated", "updated throughout", "remodeled", "newly updated"],
        "new_roof": ["new roof", "roof replaced", "recent roof"],
        "water_view": ["water view", "lake view", "sound view", "views of lake", "views of sound"],
        "top_schools": ["top schools", "highly rated schools", "award winning schools", "great schools"],
        "near_transit": ["near transit", "steps to light rail", "close to light rail", "near bus", "commuter dream"],
        "walkable": ["walkable", "walk score", "steps to shops", "near restaurants"],
        "rental_potential": ["rental potential", "great rental", "investment opportunity", "airbnb", "short term rental"],
        "motivated_seller": ["motivated seller", "priced to sell", "won't last", "rare gem", "must see"],
        "adu_potential": ["adu", "dadu", "mother-in-law", "mil suite", "basement apartment"],
        "new_hvac": ["new hvac", "new furnace", "new heat pump", "central ac"],
        "sewer_scope_needed": ["older sewer", "sewer", "side sewer"],
    }
    for key, phrases in keyword_claims.items():
        for phrase in phrases:
            if phrase in low:
                _add(claims, key, key.replace("_", " ").title(), True, None, phrase, 0.72)
                break

    manual_fields = manual.model_dump()
    for k, v in manual_fields.items():
        if v is not None and v != "":
            _add(claims, f"manual_{k}", f"Manual {k.replace('_', ' ')}", v, None, "manual input", 0.9)

    return claims
