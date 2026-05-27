from __future__ import annotations


def photo_risk_stub(enabled: bool = False) -> dict:
    if not enabled:
        return {
            "status": "not_run",
            "summary": "Photo-risk module is ready for integration but no images were provided.",
            "future_checks": [
                "roof age/visible wear",
                "water intrusion/staining",
                "foundation cracks",
                "window age",
                "kitchen/bath renovation quality",
                "staging vs actual usable space",
                "deferred maintenance clues",
            ],
        }
    return {
        "status": "scaffold_only",
        "summary": "Image pipeline scaffold enabled. Connect CLIP/SAM/vision model + listing-photo ingestion for production.",
        "risk_flags": [],
        "confidence": "Low until images are uploaded and inspected.",
    }
