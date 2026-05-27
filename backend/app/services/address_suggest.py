from __future__ import annotations

from rapidfuzz import fuzz

from app.models import AddressSuggestion

OFFLINE_ADDRESSES = [
    ("3951 170th Ave SE, Bellevue, WA 98008", "Bellevue", 47.5760, -122.1125),
    ("1420 Terry Ave, Seattle, WA 98101", "Seattle", 47.6125, -122.3269),
    ("2100 Westlake Ave, Seattle, WA 98121", "Seattle", 47.6176, -122.3380),
    ("3200 NW 85th St, Seattle, WA 98117", "Seattle", 47.6905, -122.3986),
    ("4502 Fremont Ave N, Seattle, WA 98103", "Seattle", 47.6617, -122.3500),
    ("1800 Alki Ave SW, Seattle, WA 98116", "Seattle", 47.5868, -122.4009),
    ("6500 Ravenna Ave NE, Seattle, WA 98115", "Seattle", 47.6758, -122.3038),
    ("900 University St, Seattle, WA 98101", "Seattle", 47.6093, -122.3270),
    ("3400 California Ave SW, Seattle, WA 98116", "Seattle", 47.5733, -122.3868),
    ("1000 Denny Way, Seattle, WA 98109", "Seattle", 47.6185, -122.3360),
    ("811 5th Ave, Seattle, WA 98104", "Seattle", 47.6052, -122.3306),
    ("15600 NE 8th St, Bellevue, WA 98008", "Bellevue", 47.6173, -122.1314),
    ("7500 166th Ave NE, Redmond, WA 98052", "Redmond", 47.6710, -122.1190),
]


def suggest_addresses(query: str, limit: int = 8) -> list[AddressSuggestion]:
    q = (query or "").strip().lower()
    if not q:
        return []

    ranked: list[tuple[float, tuple[str, str, float, float]]] = []
    for item in OFFLINE_ADDRESSES:
        label = item[0]
        score = max(
            fuzz.partial_ratio(q, label.lower()),
            fuzz.token_set_ratio(q, label.lower()),
        )
        if q.replace(" ", "") in label.lower().replace(" ", ""):
            score = max(score, 95)
        if score >= 35:
            ranked.append((score, item))

    ranked.sort(key=lambda x: x[0], reverse=True)
    return [
        AddressSuggestion(
            label=label,
            city=city,
            lat=lat,
            lon=lon,
            confidence=round(min(score / 100, 0.98), 2),
            source="offline_seattle_fallback",
        )
        for score, (label, city, lat, lon) in ranked[:limit]
    ]


def normalize_address(address: str) -> AddressSuggestion | None:
    suggestions = suggest_addresses(address, limit=1)
    return suggestions[0] if suggestions else None
