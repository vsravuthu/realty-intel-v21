from __future__ import annotations

from app.models import FactorScore, ValuationResult, VerifiedClaim


def build_report(address: str, overall: float, valuation: ValuationResult, claims: list[VerifiedClaim], factors: list[FactorScore], hidden: dict, missing: list[str]) -> str:
    conflicts = [c for c in claims if c.status == "conflict"]
    unverified = [c for c in claims if c.status in {"unverified", "missing_source"}]
    top_factors = sorted(factors, key=lambda f: f.weight, reverse=True)[:5]
    lines = [
        f"# Realty Intel Pro V18 Report — {address}",
        "",
        f"**Overall score:** {overall}/100",
        f"**Verdict:** {valuation.verdict}",
        f"**Estimated fair value:** ${valuation.estimated_value:,.0f} (${valuation.low:,.0f}–${valuation.high:,.0f})",
        f"**Model confidence:** {valuation.confidence} ({valuation.confidence_score})",
    ]
    if valuation.price_delta_pct is not None:
        lines.append(f"**List price vs fair value:** {valuation.price_delta_pct:+.1f}%")
    lines += ["", "## Claim Verification", f"- Conflicts found: {len(conflicts)}", f"- Unverified/missing-source claims: {len(unverified)}"]
    for c in conflicts[:5]:
        lines.append(f"- CONFLICT: {c.label}: claimed {c.claimed_value}, available fact {c.verified_value}. {c.explanation}")
    lines += ["", "## Highest-Weight Factor Scores"]
    for f in top_factors:
        lines.append(f"- {f.label}: {f.score}/100 — {f.summary}")
    lines += ["", "## Hidden Costs", f"- True monthly cost estimate: ${hidden.get('true_monthly_cost', 0):,.0f}", f"- First-year cash need estimate: ${hidden.get('first_year_cash_need_estimate', 0):,.0f}"]
    lines += ["", "## Missing Critical Sources"]
    for m in missing[:8]:
        lines.append(f"- {m}")
    lines += ["", "## Buyer Next Actions", "- Verify parcel facts with county assessor.", "- Pull permit history and seller disclosure.", "- Order inspection with sewer scope where applicable.", "- Compare against MLS sold comps before writing offer."]
    return "\n".join(lines)
