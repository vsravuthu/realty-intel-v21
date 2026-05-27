from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def test_health():
    res = client.get('/api/health')
    assert res.status_code == 200
    assert res.json()['status'] == 'ok'


def test_suggest_bellevue():
    res = client.get('/api/suggest?q=3951%20170')
    assert res.status_code == 200
    data = res.json()
    assert data['suggestions']
    assert '3951 170th' in data['suggestions'][0]['label']


def test_analyze_end_to_end():
    payload = {
        'address': '3951 170th Ave SE, Bellevue, WA 98008',
        'listing_text': 'Rare renovated 3 bed 2 bath Bellevue home, 1,850 sqft, built in 1928, no HOA, water views, near transit, top schools, ADU potential, new roof, great rental potential, priced to sell at $1,150,000.',
        'manual': {'price': 1150000, 'beds': 3, 'baths': 2, 'sqft': 1850, 'year_built': 1928, 'hoa_monthly': 0},
        'mode': 'demo'
    }
    res = client.post('/api/analyze', json=payload)
    assert res.status_code == 200
    data = res.json()
    assert data['version'] == 'V18'
    assert data['valuation']['estimated_value'] > 0
    assert len(data['verified_claims']) >= 8
    assert len(data['factor_scores']) >= 12
    assert data['missing_critical_sources']
