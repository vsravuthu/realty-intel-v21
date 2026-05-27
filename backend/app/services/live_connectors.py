from __future__ import annotations

import os
import re
from dataclasses import dataclass, field
from typing import Any
from urllib.parse import urlencode

import httpx

USER_AGENT = os.getenv(
    "REALTY_INTEL_USER_AGENT",
    "RealtyIntelProV18/1.0 (buyer due diligence research; contact: local-dev@example.com)",
)
TIMEOUT = float(os.getenv("CONNECTOR_TIMEOUT_SECONDS", "5"))
ENABLE_LIVE = os.getenv("ENABLE_LIVE_PUBLIC_DATA", "true").lower() in {"1", "true", "yes", "on"}
ENABLE_NOMINATIM = os.getenv("ENABLE_NOMINATIM", "false").lower() in {"1", "true", "yes", "on"}


@dataclass
class ConnectorResult:
    name: str
    status: str
    records: list[dict[str, Any]] = field(default_factory=list)
    facts: dict[str, Any] = field(default_factory=dict)
    url: str | None = None
    error: str | None = None
    trust: str = "high"
    notes: str = ""


def _client() -> httpx.Client:
    return httpx.Client(
        timeout=TIMEOUT,
        headers={"User-Agent": USER_AGENT, "Accept": "application/json"},
        follow_redirects=True,
    )


def _street_terms(address: str) -> str:
    """Return a compact query useful for Socrata full-text searches."""
    s = re.sub(r"[,#].*", "", address or "").strip()
    s = re.sub(r"\b(Seattle|Bellevue|Redmond|WA|Washington|USA|United States|\d{5})\b", "", s, flags=re.I)
    s = re.sub(r"\s+", " ", s).strip()
    return s[:80] or (address or "")[:80]


def _safe_get_json(url: str, params: dict[str, Any] | None = None) -> tuple[dict[str, Any] | list[Any] | None, str | None, str]:
    full_url = url + (("?" + urlencode(params or {}, doseq=True)) if params else "")
    try:
        with _client() as c:
            r = c.get(url, params=params)
            r.raise_for_status()
            return r.json(), None, str(r.url)
    except Exception as e:
        return None, str(e)[:260], full_url


def census_geocode(address: str) -> ConnectorResult:
    if not ENABLE_LIVE or not address.strip():
        return ConnectorResult(name="Census Geocoder", status="disabled", error="Connector disabled or empty address", trust="authoritative")
    url = "https://geocoding.geo.census.gov/geocoder/geographies/onelineaddress"
    params = {
        "address": address,
        "benchmark": "Public_AR_Current",
        "vintage": "Current_Current",
        "format": "json",
        "layers": "all",
    }
    data, err, full_url = _safe_get_json(url, params)
    if err or not isinstance(data, dict):
        return ConnectorResult(name="Census Geocoder", status="error", url=full_url, error=err, trust="authoritative")
    matches = (((data.get("result") or {}).get("addressMatches")) or [])
    if not matches:
        return ConnectorResult(name="Census Geocoder", status="no_match", url=full_url, trust="authoritative", notes="No Census address match returned.")
    m = matches[0]
    coords = m.get("coordinates") or {}
    geos = m.get("geographies") or {}
    tract = None
    block = None
    county = None
    state = None
    for k, v in geos.items():
        if not v:
            continue
        kl = k.lower()
        first = v[0]
        if "census tracts" in kl or kl == "tracts":
            tract = first
        elif "census blocks" in kl:
            block = first
        elif "counties" in kl:
            county = first
        elif "states" in kl:
            state = first
    facts = {
        "census_matched_address": m.get("matchedAddress"),
        "lat": coords.get("y"),
        "lon": coords.get("x"),
        "census_tract": tract,
        "census_block": block,
        "county": county,
        "state_geo": state,
    }
    return ConnectorResult(name="Census Geocoder", status="connected", records=[m], facts=facts, url=full_url, trust="authoritative", notes="Live U.S. Census geocoding/geography lookup.")


def census_acs_demographics(tract_geo: dict[str, Any] | None) -> ConnectorResult:
    if not ENABLE_LIVE or not tract_geo:
        return ConnectorResult(name="Census ACS demographics", status="disabled", error="No tract geography available", trust="authoritative")
    state = tract_geo.get("STATE") or tract_geo.get("STATEFP")
    county = tract_geo.get("COUNTY") or tract_geo.get("COUNTYFP")
    tract = tract_geo.get("TRACT") or tract_geo.get("TRACTCE")
    if not (state and county and tract):
        geoid = tract_geo.get("GEOID") or tract_geo.get("GEOID_DATA") or tract_geo.get("GEOID20")
        if geoid and len(str(geoid)) >= 11:
            state, county, tract = str(geoid)[:2], str(geoid)[2:5], str(geoid)[5:11]
    if not (state and county and tract):
        return ConnectorResult(name="Census ACS demographics", status="no_match", error="Could not parse state/county/tract", trust="authoritative")
    vars_ = [
        "NAME", "B01003_001E", "B19013_001E", "B25077_001E", "B25064_001E", "B08303_001E",
    ]
    # Try newest likely ACS years first; fall back automatically when a year has not published yet.
    last_err = None
    for year in [2024, 2023, 2022]:
        url = f"https://api.census.gov/data/{year}/acs/acs5"
        params = {"get": ",".join(vars_), "for": f"tract:{tract}", "in": f"state:{state} county:{county}"}
        data, err, full_url = _safe_get_json(url, params)
        if err:
            last_err = err
            continue
        if isinstance(data, list) and len(data) >= 2:
            header, row = data[0], data[1]
            d = dict(zip(header, row))
            def to_num(x):
                try:
                    return float(x)
                except Exception:
                    return None
            facts = {
                "acs_year": year,
                "acs_area_name": d.get("NAME"),
                "population": to_num(d.get("B01003_001E")),
                "median_household_income": to_num(d.get("B19013_001E")),
                "median_home_value": to_num(d.get("B25077_001E")),
                "median_gross_rent": to_num(d.get("B25064_001E")),
                "mean_commute_minutes": to_num(d.get("B08303_001E")),
            }
            return ConnectorResult(name="Census ACS demographics", status="connected", records=[d], facts=facts, url=full_url, trust="authoritative", notes=f"Live ACS {year} tract-level metrics.")
    return ConnectorResult(name="Census ACS demographics", status="error", error=last_err or "No ACS rows returned", trust="authoritative")


def king_county_parcel(address: str) -> ConnectorResult:
    if not ENABLE_LIVE or not address.strip():
        return ConnectorResult(name="King County Parcel Viewer Open Data", status="disabled", trust="authoritative")
    # Socrata full-text query: safer than relying on exact field names.
    url = "https://data.kingcounty.gov/resource/2kfd-2c3u.json"
    q = _street_terms(address)
    params = {"$limit": 5, "$q": q}
    data, err, full_url = _safe_get_json(url, params)
    if err:
        return ConnectorResult(name="King County Parcel Viewer Open Data", status="error", url=full_url, error=err, trust="authoritative")
    rows = data if isinstance(data, list) else []
    facts: dict[str, Any] = {"king_county_parcel_records_found": len(rows)}
    if rows:
        first = rows[0]
        # Field names vary over time; preserve full raw row and map common possibilities.
        for k in ["pin", "parcel", "major", "minor", "apn", "address", "site_address", "taxpayer_name"]:
            if k in first:
                facts[f"parcel_{k}"] = first.get(k)
        for k in first:
            kl = k.lower()
            if any(term in kl for term in ["year", "sqft", "square", "bldg", "land", "appraised", "tax"]):
                facts[f"parcel_{k}"] = first.get(k)
    return ConnectorResult(name="King County Parcel Viewer Open Data", status="connected" if rows else "no_match", records=rows[:5], facts=facts, url=full_url, trust="authoritative", notes="Live King County Socrata search; exact parcel match depends on address normalization.")


def seattle_permits(address: str) -> ConnectorResult:
    if not ENABLE_LIVE or not address.strip():
        return ConnectorResult(name="Seattle SDCI Building Permits", status="disabled", trust="high")
    url = "https://data.seattle.gov/resource/76t5-zqzr.json"
    q = _street_terms(address)
    params = {"$limit": 20, "$q": q}
    data, err, full_url = _safe_get_json(url, params)
    if err:
        return ConnectorResult(name="Seattle SDCI Building Permits", status="error", url=full_url, error=err, trust="high")
    rows = data if isinstance(data, list) else []
    roof = any("roof" in str(r).lower() for r in rows)
    remodel = any(any(term in str(r).lower() for term in ["remodel", "alteration", "renov", "addition", "mechanical", "electrical", "plumbing"]) for r in rows)
    facts = {"permit_records_found": len(rows), "permit_roof_signal": roof, "permit_remodel_signal": remodel}
    return ConnectorResult(name="Seattle SDCI Building Permits", status="connected" if rows else "no_match", records=rows[:20], facts=facts, url=full_url, trust="high", notes="Live Seattle Open Data permit full-text search.")


def fema_flood(lat: float | None, lon: float | None) -> ConnectorResult:
    if not ENABLE_LIVE or lat is None or lon is None:
        return ConnectorResult(name="FEMA NFHL Flood Hazard Zones", status="disabled", error="No coordinates available", trust="high")
    url = "https://hazards.fema.gov/arcgis/rest/services/public/NFHL/MapServer/28/query"
    params = {
        "f": "json",
        "geometry": f"{lon},{lat}",
        "geometryType": "esriGeometryPoint",
        "inSR": 4326,
        "spatialRel": "esriSpatialRelIntersects",
        "outFields": "FLD_ZONE,ZONE_SUBTY,SFHA_TF,STATIC_BFE,V_DATUM",
        "returnGeometry": "false",
    }
    data, err, full_url = _safe_get_json(url, params)
    if err or not isinstance(data, dict):
        return ConnectorResult(name="FEMA NFHL Flood Hazard Zones", status="error", url=full_url, error=err, trust="high")
    features = data.get("features") or []
    rows = [(f.get("attributes") or {}) for f in features]
    facts = {"fema_flood_zones_found": len(rows)}
    if rows:
        facts["fema_flood_zone"] = rows[0].get("FLD_ZONE")
        facts["fema_sfha"] = rows[0].get("SFHA_TF")
        facts["fema_zone_subtype"] = rows[0].get("ZONE_SUBTY")
    else:
        facts["fema_flood_zone"] = "No intersecting NFHL flood hazard zone returned"
    return ConnectorResult(name="FEMA NFHL Flood Hazard Zones", status="connected", records=rows, facts=facts, url=full_url, trust="high", notes="Live FEMA NFHL point-in-polygon query.")


def seattle_crime(address: str) -> ConnectorResult:
    if not ENABLE_LIVE or not address.strip():
        return ConnectorResult(name="Seattle Police public crime/911 data", status="disabled", trust="high")
    # SPD data is public, but address-level matching is not perfect; use full-text query as a conservative signal only.
    url = "https://cos-data.seattle.gov/resource/tazs-3rd5.json"
    q = _street_terms(address)
    params = {"$limit": 25, "$q": q}
    data, err, full_url = _safe_get_json(url, params)
    if err:
        return ConnectorResult(name="Seattle Police public crime/911 data", status="error", url=full_url, error=err, trust="high")
    rows = data if isinstance(data, list) else []
    facts = {"spd_public_records_found_for_address_query": len(rows)}
    return ConnectorResult(name="Seattle Police public crime/911 data", status="connected" if rows else "no_match", records=rows[:25], facts=facts, url=full_url, trust="high", notes="Live SPD Socrata full-text lookup; use as context, not a precise crime score.")


def reso_mls(address: str) -> ConnectorResult:
    base = os.getenv("RESO_API_BASE")
    token = os.getenv("RESO_ACCESS_TOKEN")
    if not base or not token:
        return ConnectorResult(name="MLS/RESO connector", status="missing_credentials", trust="authoritative", notes="Set RESO_API_BASE and RESO_ACCESS_TOKEN after obtaining broker/MLS data rights.")
    try:
        headers = {"Authorization": f"Bearer {token}", "Accept": "application/json", "User-Agent": USER_AGENT}
        # Generic RESO-like query. Providers differ, so this is intentionally configurable.
        params = {"$top": 10, "$filter": f"contains(UnparsedAddress,'{address[:40].replace("'", "") }')"}
        with httpx.Client(timeout=TIMEOUT, headers=headers, follow_redirects=True) as c:
            r = c.get(base.rstrip("/") + "/Property", params=params)
            r.raise_for_status()
            data = r.json()
        rows = data.get("value") if isinstance(data, dict) else data if isinstance(data, list) else []
        facts = {"reso_records_found": len(rows or [])}
        return ConnectorResult(name="MLS/RESO connector", status="connected", records=(rows or [])[:10], facts=facts, url=str(r.url), trust="authoritative", notes="Live RESO provider response. Verify provider-specific schema mapping.")
    except Exception as e:
        return ConnectorResult(name="MLS/RESO connector", status="error", error=str(e)[:260], trust="authoritative")


def collect_live_data(address: str) -> dict[str, Any]:
    results: list[ConnectorResult] = []
    geo = census_geocode(address)
    results.append(geo)
    facts: dict[str, Any] = {}
    facts.update({k: v for k, v in geo.facts.items() if v is not None})

    lat = facts.get("lat")
    lon = facts.get("lon")
    try:
        lat = float(lat) if lat is not None else None
        lon = float(lon) if lon is not None else None
    except Exception:
        lat = lon = None

    tract = facts.get("census_tract")
    for connector in [
        lambda: census_acs_demographics(tract),
        lambda: king_county_parcel(address),
        lambda: seattle_permits(address),
        lambda: fema_flood(lat, lon),
        lambda: seattle_crime(address),
        lambda: reso_mls(address),
    ]:
        res = connector()
        results.append(res)
        facts.update({k: v for k, v in res.facts.items() if v is not None})

    connected = [r.name for r in results if r.status in {"connected", "no_match"}]
    errors = [{"name": r.name, "status": r.status, "error": r.error} for r in results if r.error]
    facts["live_connector_count"] = len(connected)
    facts["live_connector_errors"] = errors
    return {
        "facts": facts,
        "results": [r.__dict__ for r in results],
        "connected_names": connected,
        "errors": errors,
    }
