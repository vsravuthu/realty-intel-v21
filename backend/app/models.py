from __future__ import annotations

from typing import Any, Literal
from pydantic import BaseModel, Field


ClaimStatus = Literal["verified", "conflict", "unverified", "missing_source", "not_applicable"]
VerdictLabel = Literal[
    "Strong Buy", "Buy", "Fair", "Wait", "Negotiate", "Pass", "Strong Pass"
]


class ManualFacts(BaseModel):
    price: float | None = None
    beds: float | None = None
    baths: float | None = None
    sqft: float | None = None
    lot_sqft: float | None = None
    year_built: int | None = None
    hoa_monthly: float | None = None
    property_type: str | None = None


class AnalyzeRequest(BaseModel):
    address: str = Field(default="", description="Full or partial address")
    listing_url: str | None = None
    listing_text: str | None = None
    manual: ManualFacts = Field(default_factory=ManualFacts)
    buyer_profile: dict[str, Any] = Field(default_factory=dict)
    include_photo_risk: bool = False
    mode: Literal["demo", "strict", "research"] = "demo"


class AddressSuggestion(BaseModel):
    label: str
    city: str
    state: str = "WA"
    lat: float | None = None
    lon: float | None = None
    confidence: float = 0.6
    source: str = "offline_fallback"


class ExtractedClaim(BaseModel):
    key: str
    label: str
    value: Any
    unit: str | None = None
    evidence_text: str | None = None
    confidence: float = 0.5


class VerifiedClaim(BaseModel):
    key: str
    label: str
    claimed_value: Any
    verified_value: Any | None = None
    status: ClaimStatus
    severity: Literal["low", "medium", "high", "critical"] = "low"
    explanation: str
    source: str | None = None
    confidence: float = 0.5


class ComparableSale(BaseModel):
    address: str
    sale_price: float
    sqft: float
    beds: float
    baths: float
    year_built: int
    distance_miles: float
    sold_months_ago: float
    similarity: float
    adjusted_price: float
    price_per_sqft: float


class ValuationResult(BaseModel):
    estimated_value: float
    low: float
    high: float
    price_delta: float | None
    price_delta_pct: float | None
    verdict: VerdictLabel
    confidence: Literal["Low", "Medium", "High"]
    confidence_score: float
    model_stack: list[str]
    comps: list[ComparableSale]
    explanation: str


class FactorScore(BaseModel):
    key: str
    label: str
    score: float
    weight: float
    risk_level: Literal["low", "medium", "high", "critical"]
    summary: str
    evidence: list[str] = Field(default_factory=list)
    missing_sources: list[str] = Field(default_factory=list)


class SourceRecord(BaseModel):
    name: str
    status: Literal["connected", "mocked", "missing", "future_connector"]
    freshness: str
    trust: Literal["low", "medium", "high", "authoritative"]
    notes: str


class AnalysisResponse(BaseModel):
    version: str = "V18"
    address: str
    normalized_address: str | None = None
    executive_verdict: VerdictLabel
    overall_score: float
    data_confidence: Literal["Low", "Medium", "High"]
    property_facts: dict[str, Any]
    extracted_claims: list[ExtractedClaim]
    verified_claims: list[VerifiedClaim]
    valuation: ValuationResult
    factor_scores: list[FactorScore]
    hidden_costs: dict[str, Any]
    investment: dict[str, Any]
    photo_risk: dict[str, Any]
    source_audit: list[SourceRecord]
    missing_critical_sources: list[str]
    buyer_actions: list[str]
    report_markdown: str


class BacktestMetric(BaseModel):
    name: str
    value: float | str
    target: str
    status: Literal["pass", "warning", "fail"]


class BacktestResponse(BaseModel):
    dataset: str
    sample_size: int
    metrics: list[BacktestMetric]
    notes: list[str]
