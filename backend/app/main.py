from __future__ import annotations

from fastapi import FastAPI, Query
from fastapi.middleware.cors import CORSMiddleware

from app.models import AnalyzeRequest, AnalysisResponse
from app.services.address_suggest import normalize_address, suggest_addresses
from app.services.ad_parser import parse_listing_text
from app.services.backtesting import backtest_summary
from app.services.claim_verifier import verify_claims
from app.services.data_fusion import build_property_facts
from app.services.factor_engine import FACTOR_REGISTRY, overall_score, score_factors
from app.services.financials import hidden_costs, investment_model
from app.services.report import build_report
from app.services.source_registry import missing_critical_sources, source_audit
from app.services.valuation import valuate
from app.services.vision import photo_risk_stub

app = FastAPI(
    title="Realty Intel Pro V18",
    version="18.0.0",
    description="Source-grounded real-estate due diligence and overpricing analysis engine.",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/api/health")
def health():
    return {
        "status": "ok",
        "version": "V18",
        "message": "Realty Intel Pro V18 backend is running",
        "ports": "Only frontend 5173 should be exposed via Nginx proxy",
    }


@app.get("/api/suggest")
def suggest(q: str = Query(..., min_length=1), limit: int = 8):
    return {"query": q, "suggestions": [s.model_dump() for s in suggest_addresses(q, limit=limit)]}



@app.get("/api/connectors")
def connectors():
    return {
        "live_public_data_default": True,
        "activated_without_keys": [
            "Census Geocoder",
            "Census ACS demographics",
            "King County Parcel Viewer Open Data",
            "Seattle SDCI Building Permits",
            "FEMA NFHL Flood Hazard Zones",
            "Seattle Police public crime/911 data",
        ],
        "requires_credentials_or_documents": [
            "MLS/RESO sold comps",
            "Title/lien/HOA documents",
            "Inspection report/seller disclosure",
            "Paid rental comps",
            "Computer-vision model API for listing photos",
        ],
        "env_vars": [
            "ENABLE_LIVE_PUBLIC_DATA=true",
            "REALTY_INTEL_USER_AGENT=your-app-contact",
            "RESO_API_BASE=provided-by-MLS",
            "RESO_ACCESS_TOKEN=provided-by-MLS",
        ],
    }

@app.get("/api/factors")
def factors():
    return {"factors": [{"key": k, "label": l, "weight": w} for k, l, w in FACTOR_REGISTRY]}


@app.get("/api/backtest")
def backtest():
    return backtest_summary()


@app.post("/api/extract-claims")
def extract_claims(req: AnalyzeRequest):
    claims = parse_listing_text(req.listing_text, req.manual)
    return {"claims": [c.model_dump() for c in claims], "count": len(claims)}


@app.post("/api/analyze", response_model=AnalysisResponse)
def analyze(req: AnalyzeRequest):
    claims = parse_listing_text(req.listing_text, req.manual)
    facts = build_property_facts(req, claims)
    normalized = normalize_address(req.address)
    live_bonus = min(0.22, 0.035 * len(facts.get("live_connected_sources", [])))
    data_quality = 0.42 + min(0.18, len(claims) * 0.015) + (facts.get("geo_confidence", 0.2) * 0.18) + live_bonus
    valuation = valuate(facts, data_quality=data_quality)
    verified_claims = verify_claims(claims, facts, strict=req.mode == "strict")
    factors = score_factors(facts, verified_claims, valuation)
    overall = overall_score(factors)
    hidden = hidden_costs(facts, valuation.estimated_value)
    investment = investment_model(facts, valuation.estimated_value, hidden["true_monthly_cost"])
    photo_risk = photo_risk_stub(req.include_photo_risk)
    missing = missing_critical_sources(facts.get("live_source_results", []))

    if overall >= 78 and valuation.verdict in {"Buy", "Strong Buy", "Fair"}:
        executive = "Buy"
    elif overall >= 66 and valuation.verdict in {"Fair", "Negotiate"}:
        executive = "Negotiate"
    elif overall >= 55:
        executive = valuation.verdict if valuation.verdict in {"Wait", "Pass", "Strong Pass"} else "Wait"
    else:
        executive = "Pass"

    data_confidence = "High" if valuation.confidence_score > 0.78 and not missing else "Medium" if valuation.confidence_score > 0.58 else "Low"
    if missing:
        data_confidence = "Low" if req.mode == "strict" else data_confidence

    buyer_actions = [
        "Verify advertised sqft, bed/bath, lot size, year built, and taxes with county assessor records.",
        "Pull MLS sold comps and compare concessions, DOM, condition, and micro-location before writing offer.",
        "Verify renovation, roof, HVAC, plumbing, and electrical claims with permits and seller disclosure.",
        "Order a full inspection; for older Seattle-area homes, include sewer scope and drainage/moisture review.",
        "Confirm school boundary, HOA restrictions, insurance quotes, zoning/ADU options, and hazard layers.",
    ]

    report = build_report(
        facts.get("normalized_address") or req.address,
        overall,
        valuation,
        verified_claims,
        factors,
        hidden,
        missing,
    )

    return AnalysisResponse(
        address=req.address,
        normalized_address=normalized.label if normalized else facts.get("normalized_address"),
        executive_verdict=executive,
        overall_score=overall,
        data_confidence=data_confidence,
        property_facts=facts,
        extracted_claims=claims,
        verified_claims=verified_claims,
        valuation=valuation,
        factor_scores=factors,
        hidden_costs=hidden,
        investment=investment,
        photo_risk=photo_risk,
        source_audit=source_audit(facts.get("live_source_results", [])),
        missing_critical_sources=missing,
        buyer_actions=buyer_actions,
        report_markdown=report,
    )
