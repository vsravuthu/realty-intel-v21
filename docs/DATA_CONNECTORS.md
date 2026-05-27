# Data Connectors Needed for Production Accuracy

## Required for high-accuracy valuation
- MLS/IDX/RESO live listings and closed sales
- County assessor parcels
- Tax assessment and property history
- Permit history
- Sale concessions and DOM
- Listing photos and disclosures

## Required for risk/due diligence
- FEMA flood hazard layers
- Local earthquake/liquefaction/landslide GIS layers
- Wildfire/smoke/climate risk data
- Crime/public safety datasets
- Noise/environmental contamination sources
- Title/lien/HOA resale certificate data

## Required for buyer fit
- School boundary assignment
- School performance and enrollment data
- Transit schedules, GTFS, commute-time APIs
- Walkability and amenity POIs
- Zoning, ADU/DADU, overlay, and redevelopment constraints

## Architecture
Each connector should produce a normalized SourceRecord with:
- source name
- retrieval timestamp
- trust rating
- parsed facts
- raw evidence URL/document ID
- confidence score
