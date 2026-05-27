const $ = (id) => document.getElementById(id);
const money = (n) => n == null ? "—" : new Intl.NumberFormat("en-US", {style:"currency", currency:"USD", maximumFractionDigits:0}).format(n);
const num = (id) => { const v = $(id).value; return v === "" ? null : Number(v); };
const htmlEscape = (s) => String(s ?? "").replace(/[&<>"]/g, ch => ({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;"}[ch]));

async function health(){
  try{ const r = await fetch('/api/health'); const d = await r.json(); $('healthDot').style.background = '#22c55e'; $('healthText').textContent = d.message; }
  catch(e){ $('healthDot').style.background = '#ef4444'; $('healthText').textContent = 'Backend not reachable'; }
}

let suggestTimer;
$('address').addEventListener('input', () => {
  clearTimeout(suggestTimer);
  const q = $('address').value.trim();
  $('suggestions').innerHTML = '';
  if(q.length < 3) return;
  suggestTimer = setTimeout(async () => {
    try{
      const r = await fetch('/api/suggest?q=' + encodeURIComponent(q));
      const d = await r.json();
      $('lookupStatus').textContent = d.suggestions.length ? 'Address suggestions loaded.' : 'No local suggestion. Full analysis still works.';
      $('suggestions').innerHTML = d.suggestions.map(s => `<div class="suggestion" data-label="${htmlEscape(s.label)}">${htmlEscape(s.label)} <span class="muted">(${Math.round(s.confidence*100)}%)</span></div>`).join('');
    } catch(e){ $('lookupStatus').textContent = 'Address lookup failed. Type full address or continue manually.'; }
  }, 250);
});

$('suggestions').addEventListener('click', (e)=>{
  const row = e.target.closest('.suggestion');
  if(!row) return;
  $('address').value = row.dataset.label;
  $('suggestions').innerHTML = '';
  $('lookupStatus').textContent = 'Selected verified local fallback address.';
});

$('sampleBtn').onclick = () => {
  $('address').value = '3951 170th Ave SE, Bellevue, WA 98008';
  $('listingUrl').value = 'sample://broker-listing';
  $('listingText').value = 'Rare renovated 3 bed 2 bath Bellevue home, 1,850 sqft, built in 1928, no HOA, water views, near transit, top schools, ADU potential, new roof, great rental potential, priced to sell at $1,150,000.';
  $('price').value = 1150000; $('beds').value = 3; $('baths').value = 2; $('sqft').value = 1850; $('yearBuilt').value = 1928; $('hoa').value = 0;
};

function payload(){
  return {
    address: $('address').value,
    listing_url: $('listingUrl').value || null,
    listing_text: $('listingText').value || null,
    manual: { price: num('price'), beds: num('beds'), baths: num('baths'), sqft: num('sqft'), year_built: num('yearBuilt'), hoa_monthly: num('hoa') },
    include_photo_risk: false,
    mode: 'demo'
  };
}

$('extractBtn').onclick = async () => {
  $('loading').classList.remove('hidden');
  try{
    const r = await fetch('/api/extract-claims', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(payload()) });
    const d = await r.json();
    alert(`Extracted ${d.count} claims. Run full analysis for verification.`);
  }catch(e){ alert('Claim extraction failed: ' + e.message); }
  finally{ $('loading').classList.add('hidden'); }
};

$('runBtn').onclick = async () => {
  $('loading').classList.remove('hidden');
  $('results').classList.add('hidden');
  try{
    const r = await fetch('/api/analyze', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(payload()) });
    if(!r.ok) throw new Error(await r.text());
    const d = await r.json();
    render(d);
    await renderBacktest();
    $('results').classList.remove('hidden');
    $('results').scrollIntoView({behavior:'smooth'});
  }catch(e){ alert('Analysis failed: ' + e.message); }
  finally{ $('loading').classList.add('hidden'); }
};

function render(d){
  $('verdict').textContent = d.executive_verdict;
  $('score').textContent = `${d.overall_score}/100`;
  $('confidence').textContent = `Data confidence: ${d.data_confidence}`;
  $('fairValue').textContent = money(d.valuation.estimated_value);
  $('range').textContent = `${money(d.valuation.low)} – ${money(d.valuation.high)} • ${d.valuation.confidence} model confidence`;
  $('valuationText').innerHTML = `<strong>${htmlEscape(d.valuation.verdict)}</strong> • List price delta: ${d.valuation.price_delta_pct == null ? 'unknown' : d.valuation.price_delta_pct + '%'}<br>${htmlEscape(d.valuation.explanation)}`;
  $('comps').innerHTML = d.valuation.comps.slice(0,5).map(c => `<div class="card"><strong>${htmlEscape(c.address)}</strong><span>Sale: ${money(c.sale_price)} • Adj: ${money(c.adjusted_price)}<br>${c.sqft} sqft • ${c.beds}bd/${c.baths}ba • ${c.distance_miles} mi • ${c.similarity}% match</span></div>`).join('');
  $('claims').innerHTML = d.verified_claims.length ? d.verified_claims.map(c => `<div class="row"><strong>${htmlEscape(c.label)}</strong><span>${htmlEscape(c.claimed_value)}</span><span>${htmlEscape(c.verified_value ?? '—')}</span><span class="badge ${c.status}">${htmlEscape(c.status)}</span><span>${htmlEscape(c.explanation)}</span></div>`).join('') : '<p class="muted">No claims extracted. Paste listing text for stronger analysis.</p>';
  $('factors').innerHTML = d.factor_scores.map(f => `<div class="factor"><strong>${htmlEscape(f.label)}</strong><div class="meter"><div class="bar" style="width:${f.score}%"></div></div><div><b>${f.score}/100</b> <span class="status-${f.risk_level}">${f.risk_level}</span></div><p>${htmlEscape(f.summary)}</p>${f.missing_sources.length ? `<small class="muted">Missing: ${htmlEscape(f.missing_sources.join(', '))}</small>` : ''}</div>`).join('');
  $('costs').innerHTML = Object.entries(d.hidden_costs).filter(([k,v]) => typeof v !== 'object').map(([k,v]) => `<div class="mini"><span>${htmlEscape(k.replaceAll('_',' '))}</span><strong>${typeof v === 'number' ? money(v) : htmlEscape(v)}</strong></div>`).join('');
  $('investment').innerHTML = Object.entries(d.investment).filter(([k,v]) => typeof v !== 'object').map(([k,v]) => `<div class="mini"><span>${htmlEscape(k.replaceAll('_',' '))}</span><strong>${typeof v === 'number' && k.includes('rent') || k.includes('income') || k.includes('noi') ? money(v) : htmlEscape(v)}</strong></div>`).join('');
  $('sources').innerHTML = d.source_audit.map(s => `<div class="card"><strong>${htmlEscape(s.name)}</strong><span>Status: ${htmlEscape(s.status)} • Trust: ${htmlEscape(s.trust)}<br>${htmlEscape(s.notes)}</span></div>`).join('');
  $('missing').innerHTML = d.missing_critical_sources.map(x => `<li>${htmlEscape(x)}</li>`).join('');
  $('actionsList').innerHTML = d.buyer_actions.map(x => `<li>${htmlEscape(x)}</li>`).join('');
  $('report').textContent = d.report_markdown;
}

async function renderBacktest(){
  try{
    const r = await fetch('/api/backtest'); const d = await r.json();
    $('backtest').innerHTML = d.metrics.map(m => `<div class="card"><strong>${htmlEscape(m.name)}</strong><span>Value: ${htmlEscape(m.value)}<br>Target: ${htmlEscape(m.target)}<br>Status: ${htmlEscape(m.status)}</span></div>`).join('') + `<p class="muted">${htmlEscape(d.notes.join(' '))}</p>`;
  }catch(e){ $('backtest').innerHTML = '<p class="muted">Backtest endpoint unavailable.</p>'; }
}

health();
$('sampleBtn').click();
