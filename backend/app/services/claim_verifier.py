from __future__ import annotations

from app.models import ExtractedClaim, VerifiedClaim

AUTHORITATIVE_KEYS = {
    "price": "MLS/RESO listing record",
    "beds": "MLS + assessor record",
    "baths": "MLS + assessor record",
    "sqft": "County assessor + MLS",
    "lot_sqft": "County parcel record",
    "year_built": "County assessor record",
    "hoa_monthly": "HOA resale certificate / MLS",
    "renovated": "Permit history + seller disclosure",
    "new_roof": "Permit history + inspection",
    "water_view": "Listing photos + GIS/view corridor",
    "top_schools": "School boundary assignment + OSPI scores",
    "near_transit": "Transit GTFS/API + geospatial distance",
    "walkable": "Amenities/sidewalk/transit geospatial data",
    "rental_potential": "Rental comps + zoning + HOA/STR rules",
    "adu_potential": "Zoning + lot + permit constraints",
    "new_hvac": "Permit/seller disclosure/inspection",
}

NUMERIC_FACT_KEYS = {"price", "beds", "baths", "sqft", "lot_sqft", "year_built", "hoa_monthly"}


def _manual_lookup(facts: dict, key: str):
    if key.startswith("manual_"):
        return facts.get(key.replace("manual_", ""))
    return facts.get(key)


def _connected(facts: dict, name_contains: str) -> bool:
    for name in facts.get("live_connected_sources", []) or []:
        if name_contains.lower() in str(name).lower():
            return True
    return False


def _verified_value_available(facts: dict, key: str) -> bool:
    # Do not count user/manual/listing facts as authoritative. Only future exact mappings from live sources should set verified_<key>.
    return facts.get(f"verified_{key}") is not None


def verify_claims(claims: list[ExtractedClaim], facts: dict, strict: bool = False) -> list[VerifiedClaim]:
    verified: list[VerifiedClaim] = []
    for claim in claims:
        base_key = claim.key.replace("manual_", "")
        src = AUTHORITATIVE_KEYS.get(base_key)
        known_value = _manual_lookup(facts, base_key)

        if claim.key.startswith("manual_"):
            verified.append(VerifiedClaim(
                key=claim.key,
                label=claim.label,
                claimed_value=claim.value,
                verified_value=known_value,
                status="unverified",
                severity="low",
                explanation="Manual value is captured for valuation but is not authoritative until verified against MLS/assessor/document records.",
                source="Manual input",
                confidence=0.50,
            ))
            continue

        if base_key in NUMERIC_FACT_KEYS:
            if _verified_value_available(facts, base_key):
                authoritative = facts.get(f"verified_{base_key}")
                try:
                    claimed = float(claim.value)
                    known = float(authoritative)
                    tolerance = 0.02 if base_key == "price" else 0.08
                    diff = abs(claimed - known) / max(abs(known), 1)
                    if diff <= tolerance:
                        status, severity, conf = "verified", "low", 0.88
                        explanation = f"Claim matches authoritative {src} within tolerance."
                    else:
                        status, severity, conf = "conflict", "high" if base_key in {"price", "sqft", "hoa_monthly"} else "medium", 0.82
                        explanation = f"Claim conflicts with authoritative value ({authoritative}). Verify before relying on the listing."
                    known_value = authoritative
                except Exception:
                    status, severity, conf = "unverified", "medium", 0.45
                    explanation = f"Claim needs normalization against {src}."
            else:
                status = "unverified"
                severity = "high" if base_key in {"price", "sqft", "hoa_monthly"} else "medium"
                conf = 0.44 if _connected(facts, "Parcel") or _connected(facts, "MLS") else 0.34
                explanation = f"Captured for analysis, but not independently verified. Needs {src}."
            verified.append(VerifiedClaim(
                key=claim.key, label=claim.label, claimed_value=claim.value, verified_value=known_value,
                status=status, severity=severity, explanation=explanation, source=src, confidence=conf
            ))
            continue

        # Public permit connector can partially verify some marketing claims.
        if base_key == "new_roof" and facts.get("permit_roof_signal"):
            verified.append(VerifiedClaim(
                key=claim.key, label=claim.label, claimed_value=claim.value, verified_value="roof-related permit signal found",
                status="verified", severity="low", explanation="Seattle permit search found a roof-related signal. Confirm exact permit scope/final status.",
                source="Seattle SDCI Building Permits", confidence=0.72,
            ))
            continue
        if base_key == "renovated" and facts.get("permit_remodel_signal"):
            verified.append(VerifiedClaim(
                key=claim.key, label=claim.label, claimed_value=claim.value, verified_value="remodel/alteration permit signal found",
                status="verified", severity="low", explanation="Seattle permit search found a remodel/alteration signal. Confirm permit details and final inspection.",
                source="Seattle SDCI Building Permits", confidence=0.70,
            ))
            continue

        verified.append(VerifiedClaim(
            key=claim.key,
            label=claim.label,
            claimed_value=claim.value,
            verified_value=None,
            status="unverified",
            severity="medium" if base_key in {"renovated", "new_roof", "top_schools", "rental_potential"} else "low",
            explanation=f"Marketing/quality claim detected. Needs verification through {src or 'relevant source documents'}. Do not treat as fact yet.",
            source=src,
            confidence=0.42,
        ))
    return verified
