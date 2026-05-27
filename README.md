# 🏠 Realty Intel Pro V21+

**AI-powered buyer due diligence engine for Seattle-area real estate.**

V21+ is a comprehensive property analysis platform that extracts listing claims, estimates fair value, flags overpricing, calculates hidden costs, assesses risk across 6 categories, generates offer strategies, and produces AI-powered buyer intelligence briefs.

## Features

| Module | Description |
|--------|-------------|
| **📊 Overview** | Verdict banner, overall score, price delta, weighted factor radar chart |
| **💰 Valuation** | 7-comp weighted AVM with hedonic adjustments, 5-year appreciation forecast |
| **🔍 Claims** | 10-point claim verification engine with authoritative source tracking |
| **⚠️ Risk Matrix** | 6-category probability × impact assessment + hidden cost exposure |
| **🏦 Financials** | Monthly cost breakdown, true all-in acquisition cost analysis |
| **🏘️ Neighborhood** | Census demographics, crime, flood zones, walkability, schools, permits |
| **🤝 Offer Intel** | Data-driven offer strategies with escalation caps + pre-offer checklist |
| **📡 Sources** | 14-source audit pipeline (6 live public + 8 credential-gated) |
| **🧠 AI Advisor** | Claude-powered buyer intelligence brief synthesizing all analysis |

## Live Data Connectors (V18+)

Public connectors activated by default:
- U.S. Census Geocoder
- Census ACS Demographics
- King County Parcel Viewer (Socrata)
- Seattle SDCI Building Permits (Socrata)
- FEMA NFHL Flood Hazard Zones (ArcGIS)
- Seattle Police public crime/911 data (Socrata)

## Architecture

```
backend/
  app/
    services/
      ad_parser.py          # Listing claim extraction
      address_suggest.py    # Address normalization
      backtesting.py        # Validation metrics framework
      claim_verifier.py     # Multi-source claim verification
      data_fusion.py        # Cross-source data fusion
      factor_engine.py      # Weighted multi-factor scoring
      financials.py         # Cost and mortgage calculations
      live_connectors.py    # 6 public API connectors
      report.py             # Report generation
      source_registry.py    # Source trust + audit tracking
      valuation.py          # Comparable-sales AVM engine
      vision.py             # Photo AI scaffold
    main.py                 # FastAPI application
    models.py               # Pydantic data models
frontend/
  index.html / app.js       # Original V18 frontend
realty-intel-v21.jsx         # V21+ React interactive dashboard
```

## Run

### Docker (backend + original frontend)
```bash
docker compose up --build
```

### V21+ Dashboard
The `realty-intel-v21.jsx` is a self-contained React component. Run it with any React environment or paste into Claude Artifacts.

## Configuration

```env
ENABLE_LIVE_PUBLIC_DATA=true
CONNECTOR_TIMEOUT_SECONDS=5
REALTY_INTEL_USER_AGENT=RealtyIntelProV21/1.0 your-email@example.com
RESO_API_BASE=        # MLS/RESO access (requires broker authorization)
RESO_ACCESS_TOKEN=    # MLS/RESO token
```

## Roadmap

- **V19**: XGBoost/LightGBM real AVM with SHAP explanations
- **V20**: Listing photo AI + seller disclosure OCR/RAG
- **V21**: Offer price simulator + negotiation strategy engine ✅
- **V22**: Agent-ready PDF reports + portfolio tracking

## Important

This is a due diligence tool, not an appraisal. V21+ is source-grounded, confidence-scored, and transparent about missing data. Production-grade accuracy requires licensed MLS sold comps, verified assessor mappings, and historical backtesting.

## License

MIT
