from __future__ import annotations


def hidden_costs(facts: dict, valuation_value: float) -> dict:
    price = float(facts.get("price") or valuation_value)
    hoa = float(facts.get("hoa_monthly") or 0)
    age = 2026 - int(facts.get("year_built") or 1980)
    loan = price * 0.80
    annual_rate = 0.065
    n = 30 * 12
    m = annual_rate / 12
    monthly_pi = loan * (m * (1 + m) ** n) / ((1 + m) ** n - 1)
    tax_monthly = price * 0.0092 / 12
    insurance_monthly = max(120, price * 0.0038 / 12)
    utilities = 420 + max(0, age - 25) * 1.8
    maintenance = price * (0.010 + min(age, 80) * 0.00008) / 12
    capex_reserve = price * 0.004 / 12
    total = monthly_pi + tax_monthly + insurance_monthly + hoa + utilities + maintenance + capex_reserve
    closing = price * 0.025
    return {
        "monthly_principal_interest": round(monthly_pi),
        "property_tax_monthly": round(tax_monthly),
        "insurance_monthly": round(insurance_monthly),
        "hoa_monthly": round(hoa),
        "utilities_monthly": round(utilities),
        "maintenance_reserve_monthly": round(maintenance),
        "major_capex_reserve_monthly": round(capex_reserve),
        "true_monthly_cost": round(total),
        "buyer_closing_cost_estimate": round(closing),
        "first_year_cash_need_estimate": round(price * 0.20 + closing + total * 12),
        "risk_notes": [
            "Older homes need sewer scope, roof, electrical, plumbing, foundation, drainage, and moisture checks.",
            "Insurance costs can change materially after flood, wildfire/smoke, landslide, or claims-history verification.",
        ],
    }


def investment_model(facts: dict, valuation_value: float, true_monthly_cost: float) -> dict:
    sqft = float(facts.get("sqft") or 1850)
    beds = float(facts.get("beds") or 3)
    city = str(facts.get("city", "Seattle")).lower()
    rent_ppsf = 2.6 if "bellevue" in city else 2.45 if "seattle" in city else 2.25
    rent = max(1800, sqft * rent_ppsf + beds * 180)
    annual_income = rent * 12
    opex = annual_income * 0.34
    noi = annual_income - opex
    cap_rate = noi / valuation_value * 100 if valuation_value else 0
    dscr = noi / max(true_monthly_cost * 12, 1)
    return {
        "estimated_monthly_rent": round(rent),
        "annual_gross_income": round(annual_income),
        "estimated_noi": round(noi),
        "cap_rate_pct": round(cap_rate, 2),
        "dscr_proxy": round(dscr, 2),
        "rental_verdict": "Weak cash-flow" if cap_rate < 4 else "Moderate" if cap_rate < 5.5 else "Strong",
        "notes": [
            "Rental analysis is demo-mode until rental comps, vacancy, management fees, HOA restrictions, and STR legality are connected.",
            "Seattle-area owner-occupant value often exceeds pure rental-investor value due to low cap rates.",
        ],
    }
