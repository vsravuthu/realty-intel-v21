from __future__ import annotations

from app.models import SourceRecord

CRITICAL_SOURCES = [
    "MLS/RESO live listing and sold comps",
    "King County assessor parcel record",
    "Seattle/Bellevue permit history",
    "School boundary assignment",
    "FEMA flood hazard layer",
    "Local hazard layers: liquefaction, landslide, earthquake",
    "Title/lien/HOA documents",
    "Rental comps and vacancy data",
    "Inspection report / seller disclosure",
]

PUBLIC_SOURCE_MAP = {
    "King County Parcel Viewer Open Data": "King County assessor parcel record",
    "Seattle SDCI Building Permits": "Seattle/Bellevue permit history",
    "FEMA NFHL Flood Hazard Zones": "FEMA flood hazard layer",
    "Census Geocoder": "Address geocoding and Census boundary lookup",
    "Census ACS demographics": "Census tract demographics",
    "Seattle Police public crime/911 data": "Seattle public safety context",
    "MLS/RESO connector": "MLS/RESO live listing and sold comps",
}


def _status_for(name: str, live_results: list[dict] | None) -> tuple[str, str, str, str]:
    live_results = live_results or []
    for r in live_results:
        if r.get("name") == name:
            st = r.get("status") or "error"
            if st in {"connected", "no_match"}:
                return "connected", "live", r.get("trust", "high"), r.get("notes") or "Live connector executed."
            if st in {"missing_credentials", "disabled"}:
                return "future_connector", "not connected", r.get("trust", "high"), r.get("notes") or r.get("error") or "Connector requires configuration."
            return "missing", "attempted live", r.get("trust", "high"), r.get("error") or "Connector attempted but did not return usable data."
    return "future_connector", "not attempted", "high", "Connector available but not executed."


def source_audit(live_results: list[dict] | None = None, demo_mode: bool = False) -> list[SourceRecord]:
    records = [
        SourceRecord(name="User listing/ad text", status="connected", freshness="live input", trust="medium", notes="Used for claim extraction only; not authoritative."),
        SourceRecord(name="Manual property facts", status="connected", freshness="live input", trust="medium", notes="Buyer/user supplied values; must be verified against documents."),
        SourceRecord(name="Offline Seattle/Bellevue address fallback", status="connected", freshness="bundled sample", trust="low", notes="Development fallback when network/API geocoding fails."),
    ]

    for name in [
        "Census Geocoder",
        "Census ACS demographics",
        "King County Parcel Viewer Open Data",
        "Seattle SDCI Building Permits",
        "FEMA NFHL Flood Hazard Zones",
        "Seattle Police public crime/911 data",
        "MLS/RESO connector",
    ]:
        status, freshness, trust, notes = _status_for(name, live_results)
        records.append(SourceRecord(name=name, status=status, freshness=freshness, trust=trust if trust in {"low", "medium", "high", "authoritative"} else "high", notes=notes))

    records.extend([
        SourceRecord(name="School boundary assignment", status="future_connector", freshness="not connected", trust="high", notes="Needs GIS school-attendance-boundary data; OSPI has school/district performance data, not enough by itself for assignment."),
        SourceRecord(name="Local hazard layers", status="future_connector", freshness="not connected", trust="high", notes="Connect King County/WA liquefaction, landslide, seismic, wildfire/smoke datasets."),
        SourceRecord(name="Title/lien/HOA documents", status="future_connector", freshness="requires documents", trust="authoritative", notes="Requires buyer-provided docs or paid title/HOA data access."),
        SourceRecord(name="Inspection report / seller disclosure", status="future_connector", freshness="requires upload", trust="authoritative", notes="Requires uploaded PDF/images from buyer/agent."),
    ])
    return records


def missing_critical_sources(live_results: list[dict] | None = None) -> list[str]:
    covered = set()
    for r in live_results or []:
        if r.get("status") in {"connected", "no_match"}:
            critical = PUBLIC_SOURCE_MAP.get(r.get("name"))
            if critical in CRITICAL_SOURCES:
                covered.add(critical)
    return [s for s in CRITICAL_SOURCES if s not in covered]
