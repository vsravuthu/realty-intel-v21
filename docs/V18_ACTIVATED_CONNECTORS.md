# Realty Intel Pro V18 — Activated Connector Layer

V18 activates real public-data connectors by default while keeping the app safe and runnable without paid credentials.

## Public connectors activated without keys

These run through the backend when `ENABLE_LIVE_PUBLIC_DATA=true`:

1. **U.S. Census Geocoder** — normalizes U.S. addresses and returns latitude/longitude plus Census geography.
2. **Census ACS demographics** — tract-level population, income, median home value, rent, and commute metrics.
3. **King County Parcel Viewer Open Data** — Socrata full-text parcel search for King County property context.
4. **Seattle SDCI Building Permits** — Socrata full-text permit search to look for roof/remodel/alteration signals.
5. **FEMA NFHL Flood Hazard Zones** — live ArcGIS point query for FEMA flood hazard zones.
6. **Seattle Police public crime/911 data** — Socrata full-text lookup for public-safety context.

All connector calls use short timeouts and fail gracefully. If a source is down, the analysis still runs and the Source Audit explains what failed.

## Connectors that require credentials or documents

These cannot be truly activated by code alone:

- MLS/RESO sold comps and live listing records — requires broker/MLS authorization and data rights.
- Title/lien/HOA records — requires paid title/HOA document access or user-uploaded documents.
- Inspection report and seller disclosure — requires user-uploaded PDF/image documents.
- Paid rental comps — requires a licensed provider or a legally obtained rental dataset.
- Production photo AI — requires listing-photo upload plus a vision model/API.

## Environment variables

```env
ENABLE_LIVE_PUBLIC_DATA=true
CONNECTOR_TIMEOUT_SECONDS=5
REALTY_INTEL_USER_AGENT=RealtyIntelProV18/1.0 your-email@example.com
RESO_API_BASE=
RESO_ACCESS_TOKEN=
```

## API endpoints

- `GET /api/connectors` — shows activated and credential-required connectors.
- `POST /api/analyze` — runs the full analysis and includes `property_facts.live_source_results` and `source_audit`.
- `GET /api/backtest` — shows demo backtesting metrics; replace with real closed-sales CSV/warehouse for production validation.

## Accuracy note

V18 is more source-grounded than V17 because it attempts live public lookups. It is still not a formal appraisal and should not be represented as 100% accurate. Production-grade accuracy requires licensed sold comps, verified assessor mappings, MLS status, concessions, document ingestion, and historical backtesting.
