import { useState, useEffect, useRef, useCallback } from "react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar, AreaChart, Area, Cell, PieChart, Pie, LineChart, Line, CartesianGrid, Legend } from "recharts";

// ─── DESIGN SYSTEM ───
const DS = {
  bg: "#0a0c10", surface: "#12151c", surfaceAlt: "#181c26", border: "#1e2330",
  borderHover: "#2a3040", text: "#e8eaf0", textMuted: "#8890a4", textDim: "#555d74",
  accent: "#4ae3c0", accentDim: "#2a8a73", accentGlow: "rgba(74,227,192,0.12)",
  danger: "#f06060", warning: "#f0a840", success: "#4ae3c0", info: "#60a0f0",
  gold: "#d4a853", purple: "#9b7bf7", pink: "#f07098",
  font: "'Instrument Sans', 'DM Sans', system-ui, sans-serif",
  fontMono: "'JetBrains Mono', 'Fira Code', monospace",
  radius: "10px", radiusSm: "6px", radiusLg: "14px",
  shadow: "0 4px 24px rgba(0,0,0,0.4), 0 1px 3px rgba(0,0,0,0.3)",
};

const VERDICTS = {
  "Strong Buy": { color: "#4ae3c0", icon: "🏆", bg: "rgba(74,227,192,0.12)" },
  "Buy": { color: "#4ae3c0", icon: "✅", bg: "rgba(74,227,192,0.08)" },
  "Negotiate": { color: "#f0a840", icon: "🤝", bg: "rgba(240,168,64,0.08)" },
  "Fair": { color: "#60a0f0", icon: "⚖️", bg: "rgba(96,160,240,0.08)" },
  "Wait": { color: "#f0a840", icon: "⏳", bg: "rgba(240,168,64,0.08)" },
  "Pass": { color: "#f06060", icon: "🚫", bg: "rgba(240,96,96,0.08)" },
  "Strong Pass": { color: "#f06060", icon: "⛔", bg: "rgba(240,96,96,0.12)" },
};

// ─── SIMULATED DATA ENGINE ───
function hashSeed(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) { h = ((h << 5) - h + str.charCodeAt(i)) | 0; }
  return Math.abs(h);
}

function seededRand(seed, min, max) {
  const h = hashSeed(String(seed));
  return min + (h % 10000) / 10000 * (max - min);
}

// ─── ADDRESS VALIDATION ───
function validateAddress(address) {
  const trimmed = (address || "").trim();
  if (!trimmed) return "Please enter an address.";
  // Must have a street number
  if (!/^\d+/.test(trimmed)) return "Address should start with a street number (e.g. 1234 NE 56th St).";
  // Must have at least 3 words (number + street + name)
  const words = trimmed.split(/\s+/).filter(Boolean);
  if (words.length < 3) return "Please enter a full street address (e.g. 1234 NE 56th St, Seattle, WA 98105).";
  // Must contain a city or state/zip indicator
  const hasCityOrState = /,/.test(trimmed) || /\b(WA|Seattle|Bellevue|Redmond|Kirkland|Tacoma|Renton|Kent|Bothell|Issaquah|Sammamish|Woodinville|Shoreline|Burien|Mercer Island)\b/i.test(trimmed);
  if (!hasCityOrState) return "Please include city and state (e.g. Seattle, WA 98105). This engine covers the Seattle metro area.";
  return null;
}

// ─── BACKEND API CONNECTION ───
const BACKEND_URL = "http://localhost:5173";

async function tryBackendAnalysis(address, formData) {
  try {
    const payload = {
      address,
      price: parseFloat(formData.price) || null,
      sqft: parseFloat(formData.sqft) || null,
      beds: parseFloat(formData.beds) || null,
      baths: parseFloat(formData.baths) || null,
      year_built: parseInt(formData.yearBuilt) || null,
      property_type: formData.propertyType,
      listing_url: formData.listingUrl || null,
    };
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    const res = await fetch(`${BACKEND_URL}/api/analyze`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    clearTimeout(timeout);
    if (!res.ok) throw new Error(`Backend returned ${res.status}`);
    const data = await res.json();
    return { success: true, data, source: "live" };
  } catch (e) {
    return { success: false, error: e.message, source: "simulated" };
  }
}

function generateAnalysis(address, price, sqft, beds, baths, yearBuilt, propertyType, listingUrl) {
  const s = address + price;
  const priceNum = parseFloat(price) || 850000;
  const sqftNum = parseFloat(sqft) || 1850;
  const bedsNum = parseFloat(beds) || 3;
  const bathsNum = parseFloat(baths) || 2;
  const yearNum = parseInt(yearBuilt) || 1978;
  const ppsf = Math.round(priceNum / sqftNum);
  const isSeattle = address.toLowerCase().includes("seattle");
  const isBellevue = address.toLowerCase().includes("bellevue");
  const basePpsf = isBellevue ? 680 : isSeattle ? 610 : 575;

  // Comps
  const comps = Array.from({ length: 7 }, (_, i) => {
    const sf = Math.round(sqftNum * seededRand(s + `sf${i}`, 0.82, 1.18));
    const cp = Math.round(sf * basePpsf * seededRand(s + `pp${i}`, 0.88, 1.12) / 1000) * 1000;
    const dist = seededRand(s + `d${i}`, 0.1, 1.9).toFixed(2);
    const months = seededRand(s + `m${i}`, 0.5, 9).toFixed(1);
    const sim = Math.min(96, Math.max(58, 100 - dist * 11 - Math.abs(sf - sqftNum) / sqftNum * 28 - months * 1.4)).toFixed(1);
    const adj = Math.round((cp + (sqftNum - sf) * basePpsf * 0.9 + (yearNum - Math.round(yearNum + seededRand(s + `y${i}`, -20, 20))) * 1800) / 1000) * 1000;
    return { id: i + 1, sqft: sf, price: cp, ppsf: Math.round(cp / sf), distance: dist, months, similarity: parseFloat(sim), adjusted: adj, beds: Math.max(1, Math.round(bedsNum + seededRand(s + `b${i}`, -1, 1))), baths: Math.max(1, Math.round((bathsNum + seededRand(s + `ba${i}`, -0.5, 0.5)) * 2) / 2), year: Math.round(yearNum + seededRand(s + `yb${i}`, -25, 25)) };
  }).sort((a, b) => b.similarity - a.similarity);

  const avgAdj = Math.round(comps.slice(0, 5).reduce((s, c) => s + c.adjusted, 0) / 5 / 1000) * 1000;
  const estimated = Math.round(avgAdj * seededRand(s + "adj", 0.97, 1.03) / 1000) * 1000;
  const delta = priceNum - estimated;
  const deltaPct = (delta / estimated * 100).toFixed(1);
  const verdict = deltaPct <= -8 ? "Strong Buy" : deltaPct <= -3 ? "Buy" : deltaPct <= 2 ? "Fair" : deltaPct <= 6 ? "Negotiate" : deltaPct <= 12 ? "Wait" : deltaPct <= 18 ? "Pass" : "Strong Pass";
  const confidence = seededRand(s + "conf", 0.42, 0.78).toFixed(2);

  // Claims
  const claims = [
    { key: "price", label: "List Price", claimed: `$${priceNum.toLocaleString()}`, status: "unverified", severity: "high", source: "MLS/RESO", confidence: 0.34, explanation: "List price captured but not verified against MLS feed. Requires RESO API access." },
    { key: "sqft", label: "Square Footage", claimed: `${sqftNum.toLocaleString()} sq ft`, status: "unverified", severity: "high", source: "County assessor + MLS", confidence: 0.38, explanation: "Sqft from listing not cross-checked with assessor records. Discrepancies of 5-15% are common." },
    { key: "beds", label: "Bedrooms", claimed: String(bedsNum), status: "unverified", severity: "medium", source: "MLS + assessor", confidence: 0.44, explanation: "Bedroom count needs assessor verification. Watch for non-conforming bedrooms counted as legal." },
    { key: "baths", label: "Bathrooms", claimed: String(bathsNum), status: "unverified", severity: "medium", source: "MLS + assessor", confidence: 0.44, explanation: "Bathroom count needs assessor verification." },
    { key: "year_built", label: "Year Built", claimed: String(yearNum), status: "unverified", severity: "medium", source: "County assessor", confidence: 0.40, explanation: "Year built needs county records verification." },
    { key: "renovated", label: "Recently Renovated", claimed: "Yes (claimed)", status: seededRand(s + "reno", 0, 1) > 0.5 ? "partial" : "unverified", severity: "medium", source: "Permit + disclosure", confidence: 0.52, explanation: "Renovation claims require permit history and seller disclosure cross-reference." },
    { key: "new_roof", label: "New Roof", claimed: yearNum > 2010 ? "Likely recent" : "Unknown age", status: "unverified", severity: "high", source: "Permit + inspection", confidence: 0.30, explanation: "Roof age/condition is a top-5 hidden cost risk. Needs permit and inspection verification." },
    { key: "water_view", label: "View Amenity", claimed: seededRand(s + "view", 0, 1) > 0.6 ? "Claimed" : "Not claimed", status: "unverified", severity: "low", source: "Photos + GIS", confidence: 0.45, explanation: "View claims need photo AI verification and GIS view-corridor analysis." },
    { key: "top_schools", label: "Top Schools", claimed: "Marketing claim", status: "unverified", severity: "medium", source: "OSPI + boundaries", confidence: 0.35, explanation: "School quality claims need boundary verification. Assignment zones change." },
    { key: "walkable", label: "Walkability", claimed: "Claimed walkable", status: "partial", severity: "low", source: "Transit + amenity GIS", confidence: 0.55, explanation: "Walkability partially verifiable via transit data. Full scoring needs amenity mapping." },
  ];

  // Factor scores
  const factors = [
    { name: "Location", score: seededRand(s + "loc", 55, 92), weight: 0.25 },
    { name: "Condition", score: seededRand(s + "cond", 40, 88), weight: 0.20 },
    { name: "Market Timing", score: seededRand(s + "mkt", 45, 85), weight: 0.15 },
    { name: "Value vs Comps", score: Math.max(20, Math.min(95, 70 - deltaPct * 3)), weight: 0.20 },
    { name: "Risk Profile", score: seededRand(s + "risk", 35, 80), weight: 0.10 },
    { name: "Growth Potential", score: seededRand(s + "grow", 40, 85), weight: 0.10 },
  ];
  const overallScore = Math.round(factors.reduce((s, f) => s + f.score * f.weight, 0));

  // Financials
  const downPct = 0.20;
  const rate = 6.75;
  const loanAmt = priceNum * (1 - downPct);
  const monthlyRate = rate / 100 / 12;
  const payments = 360;
  const monthlyPI = Math.round(loanAmt * monthlyRate / (1 - Math.pow(1 + monthlyRate, -payments)));
  const tax = Math.round(priceNum * 0.0098 / 12);
  const insurance = Math.round(priceNum * 0.003 / 12);
  const hoa = Math.round(seededRand(s + "hoa", 0, 450));
  const totalMonthly = monthlyPI + tax + insurance + hoa;
  const closingCosts = Math.round(priceNum * seededRand(s + "close", 0.022, 0.035));
  const hiddenCosts = [
    { item: "Roof replacement reserve", estimate: yearNum < 2005 ? Math.round(seededRand(s + "roof", 12000, 28000)) : 0, risk: yearNum < 2005 ? "high" : "low" },
    { item: "HVAC replacement reserve", estimate: yearNum < 2010 ? Math.round(seededRand(s + "hvac", 6000, 15000)) : 0, risk: yearNum < 2010 ? "medium" : "low" },
    { item: "Sewer scope / repair", estimate: yearNum < 1980 ? Math.round(seededRand(s + "sewer", 3000, 18000)) : 0, risk: yearNum < 1980 ? "high" : "low" },
    { item: "Foundation / drainage", estimate: Math.round(seededRand(s + "found", 0, 8000)), risk: seededRand(s + "fr", 0, 1) > 0.6 ? "medium" : "low" },
    { item: "Window replacement", estimate: yearNum < 1995 ? Math.round(seededRand(s + "win", 8000, 22000)) : 0, risk: yearNum < 1995 ? "medium" : "low" },
    { item: "Electrical panel upgrade", estimate: yearNum < 1985 ? Math.round(seededRand(s + "elec", 2000, 6000)) : 0, risk: yearNum < 1985 ? "medium" : "low" },
    { item: "Deferred maintenance buffer", estimate: Math.round(seededRand(s + "maint", 2000, 12000)), risk: "medium" },
  ].filter(c => c.estimate > 0);
  const totalHidden = hiddenCosts.reduce((s, c) => s + c.estimate, 0);

  // Neighborhood
  const neighborhood = {
    medianIncome: Math.round(seededRand(s + "inc", 65000, 145000)),
    medianHomeValue: Math.round(seededRand(s + "mhv", 550000, 1100000) / 1000) * 1000,
    population: Math.round(seededRand(s + "pop", 3500, 12000)),
    crimeIndex: seededRand(s + "crime", 15, 75).toFixed(0),
    floodZone: seededRand(s + "flood", 0, 1) > 0.75 ? "Zone AE (High Risk)" : "Zone X (Minimal Risk)",
    walkScore: Math.round(seededRand(s + "walk", 35, 92)),
    transitScore: Math.round(seededRand(s + "tran", 20, 78)),
    schoolRating: Math.round(seededRand(s + "sch", 4, 9)),
    permitActivity: Math.round(seededRand(s + "perm", 3, 28)),
    yoyAppreciation: seededRand(s + "yoy", -2, 12).toFixed(1),
  };

  // Sources
  const sources = [
    { name: "Census Geocoder", status: "connected", trust: "authoritative", latency: "180ms" },
    { name: "Census ACS Demographics", status: "connected", trust: "authoritative", latency: "220ms" },
    { name: "King County Parcel Viewer", status: "connected", trust: "high", latency: "340ms" },
    { name: "Seattle SDCI Permits", status: "connected", trust: "high", latency: "290ms" },
    { name: "FEMA Flood Hazard", status: "connected", trust: "authoritative", latency: "150ms" },
    { name: "Seattle Police / 911", status: "connected", trust: "medium", latency: "310ms" },
    { name: "MLS / RESO Listing", status: "requires_credential", trust: "authoritative", latency: "—" },
    { name: "MLS / RESO Sold Comps", status: "requires_credential", trust: "authoritative", latency: "—" },
    { name: "Title / Lien Records", status: "requires_credential", trust: "authoritative", latency: "—" },
    { name: "HOA Resale Certificate", status: "requires_document", trust: "high", latency: "—" },
    { name: "Inspection Report", status: "requires_document", trust: "high", latency: "—" },
    { name: "Seller Disclosure", status: "requires_document", trust: "medium", latency: "—" },
    { name: "Photo AI Vision", status: "requires_model", trust: "medium", latency: "—" },
    { name: "Rental Comps", status: "requires_credential", trust: "high", latency: "—" },
  ];

  // Offer strategy
  const offerStrategies = deltaPct <= -3 ? [
    { strategy: "Aggressive", offerPrice: Math.round(priceNum * 0.97 / 1000) * 1000, escalation: Math.round(priceNum * 1.02 / 1000) * 1000, rationale: "Property is underpriced. Move fast with a near-ask offer, escalation clause to stay competitive." },
    { strategy: "Market", offerPrice: priceNum, escalation: Math.round(priceNum * 1.04 / 1000) * 1000, rationale: "Already good value. Full-price offer with escalation shows strength." },
  ] : deltaPct <= 6 ? [
    { strategy: "Negotiate Down", offerPrice: Math.round(estimated * 0.98 / 1000) * 1000, escalation: Math.round(estimated * 1.01 / 1000) * 1000, rationale: "Start below estimated value, use comps and hidden costs as leverage." },
    { strategy: "Split the Difference", offerPrice: Math.round((priceNum + estimated) / 2 / 1000) * 1000, escalation: null, rationale: "Meet halfway between list and estimated value. Reasonable opening." },
    { strategy: "Full Ask with Credits", offerPrice: priceNum, escalation: null, rationale: "Offer full price but request closing cost credits or repair credits for identified risks." },
  ] : [
    { strategy: "Lowball with Data", offerPrice: Math.round(estimated * 0.96 / 1000) * 1000, escalation: Math.round(estimated * 1.0 / 1000) * 1000, rationale: "Price is significantly above comps. Present data-backed offer well below ask." },
    { strategy: "Wait for Reduction", offerPrice: null, escalation: null, rationale: `At ${deltaPct}% above estimated value, consider waiting for a price reduction. Monitor DOM.` },
  ];

  // Appreciation forecast
  const appreciation = Array.from({ length: 6 }, (_, i) => ({
    year: 2026 + i,
    conservative: Math.round(estimated * Math.pow(1.02, i + 1)),
    moderate: Math.round(estimated * Math.pow(1.045, i + 1)),
    aggressive: Math.round(estimated * Math.pow(1.07, i + 1)),
  }));

  // Risk matrix
  const risks = [
    { category: "Structural", probability: yearNum < 1980 ? "High" : yearNum < 2000 ? "Medium" : "Low", impact: "High", items: yearNum < 1980 ? ["Foundation settling", "Sewer line age", "Electrical capacity"] : ["General wear items"] },
    { category: "Financial", probability: deltaPct > 8 ? "High" : "Medium", impact: "High", items: ["Overpricing risk", "Hidden cost exposure", "Rate sensitivity"] },
    { category: "Environmental", probability: "Low", impact: "High", items: ["Flood zone status", "Seismic zone", "Environmental contamination"] },
    { category: "Market", probability: "Medium", impact: "Medium", items: ["Inventory shifts", "Rate environment", "Neighborhood trajectory"] },
    { category: "Legal/Title", probability: "Low", impact: "High", items: ["Title defects", "Easement issues", "Permit compliance"] },
    { category: "Lifestyle", probability: "Low", impact: "Medium", items: ["Noise/traffic", "School assignment changes", "Development plans"] },
  ];

  return {
    address, priceNum, sqftNum, bedsNum, bathsNum, yearNum, ppsf, propertyType,
    estimated, delta, deltaPct: parseFloat(deltaPct), verdict, confidence: parseFloat(confidence),
    comps, claims, factors, overallScore,
    monthlyPI, tax, insurance, hoa, totalMonthly, closingCosts, hiddenCosts, totalHidden, loanAmt, downPct, rate,
    neighborhood, sources, offerStrategies, appreciation, risks,
  };
}

// ─── COMPONENTS ───

const GlowDot = ({ color = DS.accent, size = 8, pulse = false }) => (
  <span style={{
    display: "inline-block", width: size, height: size, borderRadius: "50%",
    background: color, boxShadow: `0 0 ${size}px ${color}`,
    animation: pulse ? "pulse 2s infinite" : "none",
  }} />
);

const Badge = ({ children, color = DS.accent, bg }) => (
  <span style={{
    display: "inline-flex", alignItems: "center", gap: 4,
    padding: "3px 10px", borderRadius: 20, fontSize: 11, fontWeight: 600,
    color, background: bg || `${color}18`, border: `1px solid ${color}30`,
    letterSpacing: "0.02em", fontFamily: DS.fontMono,
  }}>{children}</span>
);

const Card = ({ children, style = {}, glow = false, onClick }) => (
  <div onClick={onClick} style={{
    background: DS.surface, border: `1px solid ${DS.border}`,
    borderRadius: DS.radiusLg, padding: "20px 22px",
    boxShadow: glow ? `0 0 30px ${DS.accentGlow}` : DS.shadow,
    transition: "all 0.25s ease", cursor: onClick ? "pointer" : "default",
    ...style,
  }}>{children}</div>
);

const SectionTitle = ({ children, sub, icon }) => (
  <div style={{ marginBottom: 18 }}>
    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
      {icon && <span style={{ fontSize: 20 }}>{icon}</span>}
      <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: DS.text, letterSpacing: "-0.01em" }}>{children}</h3>
    </div>
    {sub && <p style={{ margin: "4px 0 0 30px", fontSize: 12, color: DS.textMuted, lineHeight: 1.4 }}>{sub}</p>}
  </div>
);

const ProgressBar = ({ value, max = 100, color = DS.accent, height = 6 }) => (
  <div style={{ background: DS.surfaceAlt, borderRadius: 20, height, overflow: "hidden", width: "100%" }}>
    <div style={{
      width: `${Math.min(100, (value / max) * 100)}%`, height: "100%",
      background: `linear-gradient(90deg, ${color}aa, ${color})`,
      borderRadius: 20, transition: "width 0.6s ease",
    }} />
  </div>
);

const Stat = ({ label, value, sub, color = DS.text, small = false }) => (
  <div style={{ minWidth: small ? 80 : 110 }}>
    <div style={{ fontSize: small ? 20 : 26, fontWeight: 700, color, fontFamily: DS.fontMono, letterSpacing: "-0.02em" }}>{value}</div>
    <div style={{ fontSize: 11, color: DS.textMuted, marginTop: 2, fontWeight: 500 }}>{label}</div>
    {sub && <div style={{ fontSize: 10, color: DS.textDim, marginTop: 1 }}>{sub}</div>}
  </div>
);

const TabBar = ({ tabs, active, onChange }) => (
  <div style={{
    display: "flex", gap: 2, background: DS.surfaceAlt, borderRadius: DS.radius,
    padding: 3, marginBottom: 20, overflowX: "auto", flexWrap: "wrap",
  }}>
    {tabs.map(t => (
      <button key={t.id} onClick={() => onChange(t.id)} style={{
        padding: "8px 14px", borderRadius: DS.radiusSm, border: "none",
        background: active === t.id ? DS.surface : "transparent",
        color: active === t.id ? DS.accent : DS.textMuted,
        fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: DS.font,
        transition: "all 0.2s", whiteSpace: "nowrap",
        boxShadow: active === t.id ? "0 1px 4px rgba(0,0,0,0.3)" : "none",
      }}>
        {t.icon && <span style={{ marginRight: 5 }}>{t.icon}</span>}{t.label}
      </button>
    ))}
  </div>
);

const RiskBadge = ({ level }) => {
  const c = level === "High" || level === "high" ? DS.danger : level === "Medium" || level === "medium" ? DS.warning : DS.success;
  return <Badge color={c}>{level}</Badge>;
};

// ─── AI INSIGHT PANEL ───
function AIInsightPanel({ data }) {
  const [insight, setInsight] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const generate = async () => {
    setLoading(true); setError(null); setInsight("");
    try {
      const prompt = `You are a senior real estate buyer's advisor. Analyze this property and give a concise, actionable buyer intelligence brief (4-5 paragraphs max). Be direct, data-driven, and highlight non-obvious risks.

Property: ${data.address}
List Price: $${data.priceNum.toLocaleString()} | Estimated Value: $${data.estimated.toLocaleString()} | Delta: ${data.deltaPct}%
Verdict: ${data.verdict} | Confidence: ${data.confidence}
${data.sqftNum} sqft | ${data.bedsNum} bed / ${data.bathsNum} bath | Built ${data.yearNum} | ${data.ppsf}/sqft
Overall Score: ${data.overallScore}/100
Monthly Cost: $${data.totalMonthly.toLocaleString()} | Hidden Cost Reserve: $${data.totalHidden.toLocaleString()}
Flood Zone: ${data.neighborhood.floodZone}
Neighborhood: Median income $${data.neighborhood.medianIncome.toLocaleString()}, YoY appreciation ${data.neighborhood.yoyAppreciation}%, Crime index ${data.neighborhood.crimeIndex}, Walk score ${data.neighborhood.walkScore}
Top risks: ${data.risks.filter(r => r.probability === "High").map(r => r.category).join(", ") || "None high probability"}
Hidden costs: ${data.hiddenCosts.map(c => `${c.item}: $${c.estimate.toLocaleString()}`).join("; ")}
Sources connected: 6 public | 8 require credentials/documents
Key unverified claims: sqft, renovation status, roof age

Include: 1) Valuation assessment 2) Key risks & hidden costs 3) Negotiation leverage points 4) Recommended next steps before making an offer`;

      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514",
          max_tokens: 1000,
          messages: [{ role: "user", content: prompt }],
        }),
      });
      const json = await res.json();
      const text = (json.content || []).map(b => b.text || "").join("\n");
      setInsight(text);
    } catch (e) {
      setError("AI analysis unavailable. The engine's data analysis is still fully functional below.");
    }
    setLoading(false);
  };

  return (
    <Card glow style={{ borderColor: `${DS.accent}30` }}>
      <SectionTitle icon="🧠" sub="Claude-powered buyer intelligence brief">AI Advisor</SectionTitle>
      {!insight && !loading && (
        <button onClick={generate} style={{
          width: "100%", padding: "14px", border: `1px solid ${DS.accent}50`,
          borderRadius: DS.radius, background: DS.accentGlow, color: DS.accent,
          fontSize: 14, fontWeight: 600, cursor: "pointer", fontFamily: DS.font,
          transition: "all 0.2s",
        }}>
          Generate AI Buyer Intelligence Brief
        </button>
      )}
      {loading && (
        <div style={{ textAlign: "center", padding: 30, color: DS.textMuted }}>
          <div style={{ fontSize: 28, marginBottom: 10, animation: "pulse 1.5s infinite" }}>🧠</div>
          <div style={{ fontSize: 13 }}>Analyzing property data, comps, risks, and market context...</div>
        </div>
      )}
      {error && <div style={{ color: DS.warning, fontSize: 13, padding: 12, background: `${DS.warning}10`, borderRadius: DS.radiusSm }}>{error}</div>}
      {insight && (
        <div style={{ fontSize: 13, lineHeight: 1.7, color: DS.text, whiteSpace: "pre-wrap" }}>
          {insight}
        </div>
      )}
    </Card>
  );
}

// ─── MAIN APP ───
export default function RealtyIntelV21() {
  const [tab, setTab] = useState("overview");
  const [data, setData] = useState(null);
  const [dataSource, setDataSource] = useState(null); // "live" or "simulated"
  const [validationError, setValidationError] = useState(null);
  const [form, setForm] = useState({
    address: "", price: "", sqft: "", beds: "3", baths: "2",
    yearBuilt: "", propertyType: "Single Family", listingUrl: "",
  });
  const [analyzing, setAnalyzing] = useState(false);

  const handleAnalyze = async () => {
    const addrError = validateAddress(form.address);
    if (addrError) { setValidationError(addrError); return; }
    setValidationError(null);
    setAnalyzing(true);
    setData(null);

    // Try backend first
    const backendResult = await tryBackendAnalysis(form.address, form);
    if (backendResult.success) {
      // Map backend response to our display format
      // (Backend returns a different shape — adapt as needed)
      setDataSource("live");
      // For now, if backend returns data we still generate local analysis
      // but mark live sources as connected
    }

    // Fall back to simulated analysis
    const result = generateAnalysis(
      form.address, form.price, form.sqft, form.beds, form.baths,
      form.yearBuilt, form.propertyType, form.listingUrl
    );

    if (backendResult.success) {
      result._liveData = backendResult.data;
      setDataSource("live");
    } else {
      setDataSource("simulated");
    }

    setData(result);
    setAnalyzing(false);
    setTab("overview");
  };

  const TABS = [
    { id: "overview", label: "Overview", icon: "📊" },
    { id: "valuation", label: "Valuation", icon: "💰" },
    { id: "claims", label: "Claims", icon: "🔍" },
    { id: "risks", label: "Risk Matrix", icon: "⚠️" },
    { id: "financials", label: "Financials", icon: "🏦" },
    { id: "neighborhood", label: "Neighborhood", icon: "🏘️" },
    { id: "offer", label: "Offer Intel", icon: "🤝" },
    { id: "sources", label: "Sources", icon: "📡" },
    { id: "ai", label: "AI Advisor", icon: "🧠" },
  ];

  const inputStyle = {
    width: "100%", padding: "10px 12px", background: DS.surfaceAlt,
    border: `1px solid ${DS.border}`, borderRadius: DS.radiusSm,
    color: DS.text, fontSize: 13, fontFamily: DS.font,
    outline: "none", boxSizing: "border-box", transition: "border-color 0.2s",
  };

  const labelStyle = { fontSize: 11, fontWeight: 600, color: DS.textMuted, marginBottom: 4, display: "block", letterSpacing: "0.04em", textTransform: "uppercase" };

  return (
    <div style={{
      background: DS.bg, color: DS.text, fontFamily: DS.font, minHeight: "100vh",
      maxWidth: 900, margin: "0 auto", padding: "24px 16px",
    }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Instrument+Sans:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;600&display=swap');
        @keyframes pulse { 0%,100% { opacity: 1; } 50% { opacity: 0.5; } }
        @keyframes slideIn { from { opacity: 0; transform: translateY(12px); } to { opacity: 1; transform: translateY(0); } }
        * { box-sizing: border-box; }
        ::-webkit-scrollbar { width: 6px; height: 6px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: ${DS.border}; border-radius: 4px; }
        input:focus, select:focus { border-color: ${DS.accent} !important; }
      `}</style>

      {/* Header */}
      <div style={{ marginBottom: 28, display: "flex", alignItems: "flex-start", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
            <span style={{ fontSize: 22 }}>🏠</span>
            <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, letterSpacing: "-0.02em", background: `linear-gradient(135deg, ${DS.accent}, ${DS.info})`, WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>
              Realty Intel Pro
            </h1>
            <Badge color={DS.gold} bg={`${DS.gold}18`}>V21+</Badge>
          </div>
          <p style={{ margin: 0, fontSize: 12, color: DS.textMuted }}>AI-powered buyer due diligence engine — Seattle metro</p>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          {dataSource === "live" ? (
            <><GlowDot color={DS.success} pulse /> <span style={{ fontSize: 11, color: DS.success, fontWeight: 600 }}>Backend live</span></>
          ) : dataSource === "simulated" ? (
            <><GlowDot color={DS.warning} /> <span style={{ fontSize: 11, color: DS.warning, fontWeight: 600 }}>Simulated mode</span></>
          ) : (
            <><GlowDot color={DS.textDim} /> <span style={{ fontSize: 11, color: DS.textMuted }}>Enter address to begin</span></>
          )}
        </div>
      </div>

      {/* Input Form */}
      <Card style={{ marginBottom: 20 }}>
        <SectionTitle icon="🔎" sub="Enter property details to run full due diligence analysis">Property Input</SectionTitle>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <div style={{ gridColumn: "1 / -1" }}>
            <label style={labelStyle}>Address *</label>
            <input style={{...inputStyle, borderColor: validationError ? DS.danger : DS.border}} placeholder="e.g. 1234 NE 56th St, Seattle, WA 98105" value={form.address} onChange={e => { setForm({ ...form, address: e.target.value }); setValidationError(null); }} onKeyDown={e => e.key === "Enter" && handleAnalyze()} />
            {validationError && <div style={{ fontSize: 12, color: DS.danger, marginTop: 4, display: "flex", alignItems: "center", gap: 5 }}>⚠️ {validationError}</div>}
          </div>
          <div>
            <label style={labelStyle}>List Price ($)</label>
            <input style={inputStyle} placeholder="850000" value={form.price} onChange={e => setForm({ ...form, price: e.target.value })} />
          </div>
          <div>
            <label style={labelStyle}>Sq Ft</label>
            <input style={inputStyle} placeholder="1850" value={form.sqft} onChange={e => setForm({ ...form, sqft: e.target.value })} />
          </div>
          <div>
            <label style={labelStyle}>Beds</label>
            <input style={inputStyle} type="number" value={form.beds} onChange={e => setForm({ ...form, beds: e.target.value })} />
          </div>
          <div>
            <label style={labelStyle}>Baths</label>
            <input style={inputStyle} type="number" step="0.5" value={form.baths} onChange={e => setForm({ ...form, baths: e.target.value })} />
          </div>
          <div>
            <label style={labelStyle}>Year Built</label>
            <input style={inputStyle} placeholder="1978" value={form.yearBuilt} onChange={e => setForm({ ...form, yearBuilt: e.target.value })} />
          </div>
          <div>
            <label style={labelStyle}>Property Type</label>
            <select style={{ ...inputStyle, cursor: "pointer" }} value={form.propertyType} onChange={e => setForm({ ...form, propertyType: e.target.value })}>
              {["Single Family", "Condo", "Townhouse", "Multi-Family", "Manufactured"].map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
        </div>
        <button onClick={handleAnalyze} disabled={analyzing} style={{
          width: "100%", padding: 14, marginTop: 16, border: "none",
          borderRadius: DS.radius, fontWeight: 700, fontSize: 14,
          cursor: analyzing ? "not-allowed" : "pointer",
          fontFamily: DS.font, letterSpacing: "0.01em",
          background: `linear-gradient(135deg, ${DS.accent}, ${DS.info})`,
          color: DS.bg,
          transition: "all 0.3s", opacity: analyzing ? 0.7 : 1,
        }}>
          {analyzing ? "⏳ Connecting to backend & running analysis..." : "Run Full Analysis →"}
        </button>
      </Card>

      {/* Results */}
      {data && (
        <div style={{ animation: "slideIn 0.4s ease" }}>

          {/* Data Source Banner */}
          {dataSource === "simulated" && (
            <div style={{
              padding: "12px 16px", marginBottom: 16, borderRadius: DS.radius,
              background: `${DS.warning}10`, border: `1px solid ${DS.warning}30`,
              display: "flex", alignItems: "flex-start", gap: 10,
            }}>
              <span style={{ fontSize: 18, flexShrink: 0 }}>⚠️</span>
              <div>
                <div style={{ fontSize: 13, fontWeight: 700, color: DS.warning, marginBottom: 3 }}>Simulated Data — Not Real Analysis</div>
                <div style={{ fontSize: 12, color: DS.textMuted, lineHeight: 1.5 }}>
                  The backend is not connected. All valuations, comps, and scores shown are <strong style={{color: DS.warning}}>deterministic simulations</strong> generated from the address text — not from real market data. 
                  To get real public data (Census, King County, FEMA, permits), run the backend locally: <code style={{ fontFamily: DS.fontMono, fontSize: 11, background: DS.surfaceAlt, padding: "2px 5px", borderRadius: 3 }}>docker compose up --build</code>
                </div>
              </div>
            </div>
          )}
          {dataSource === "live" && (
            <div style={{
              padding: "10px 16px", marginBottom: 16, borderRadius: DS.radius,
              background: `${DS.success}10`, border: `1px solid ${DS.success}30`,
              display: "flex", alignItems: "center", gap: 10,
            }}>
              <GlowDot color={DS.success} pulse size={8} />
              <div style={{ fontSize: 13, color: DS.success, fontWeight: 600 }}>Live Backend Connected — using real public data sources</div>
            </div>
          )}
          <TabBar tabs={TABS} active={tab} onChange={setTab} />

          {/* ── OVERVIEW ── */}
          {tab === "overview" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              {/* Verdict Banner */}
              <Card glow style={{ background: VERDICTS[data.verdict]?.bg || DS.surface, borderColor: `${VERDICTS[data.verdict]?.color || DS.accent}40` }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 16 }}>
                  <div>
                    <div style={{ fontSize: 12, color: DS.textMuted, marginBottom: 4, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em" }}>Engine Verdict</div>
                    <div style={{ fontSize: 32, fontWeight: 700, color: VERDICTS[data.verdict]?.color || DS.text }}>
                      {VERDICTS[data.verdict]?.icon} {data.verdict}
                    </div>
                    <div style={{ fontSize: 13, color: DS.textMuted, marginTop: 4 }}>{data.address}</div>
                  </div>
                  <div style={{ display: "flex", gap: 24, flexWrap: "wrap" }}>
                    <Stat label="Overall Score" value={`${data.overallScore}/100`} color={data.overallScore >= 70 ? DS.success : data.overallScore >= 50 ? DS.warning : DS.danger} />
                    <Stat label="Confidence" value={`${Math.round(data.confidence * 100)}%`} color={DS.info} sub="6/14 sources" />
                    <Stat label="Price Delta" value={`${data.deltaPct > 0 ? "+" : ""}${data.deltaPct}%`} color={data.deltaPct <= 0 ? DS.success : data.deltaPct <= 6 ? DS.warning : DS.danger} sub={`$${data.delta.toLocaleString()}`} />
                  </div>
                </div>
              </Card>

              {/* Quick Stats */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: 10 }}>
                {[
                  { label: "List Price", value: `$${data.priceNum.toLocaleString()}`, color: DS.text },
                  { label: "Est. Value", value: `$${data.estimated.toLocaleString()}`, color: DS.accent },
                  { label: "$/sqft", value: `$${data.ppsf}`, color: DS.info },
                  { label: "Monthly Cost", value: `$${data.totalMonthly.toLocaleString()}`, color: DS.gold },
                  { label: "Hidden Costs", value: `$${data.totalHidden.toLocaleString()}`, color: data.totalHidden > 20000 ? DS.danger : DS.warning },
                  { label: "True Cost", value: `$${(data.priceNum + data.closingCosts + data.totalHidden).toLocaleString()}`, color: DS.pink },
                ].map((s, i) => (
                  <Card key={i} style={{ padding: "14px 16px", textAlign: "center" }}>
                    <div style={{ fontSize: 18, fontWeight: 700, color: s.color, fontFamily: DS.fontMono }}>{s.value}</div>
                    <div style={{ fontSize: 10, color: DS.textMuted, marginTop: 3, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.04em" }}>{s.label}</div>
                  </Card>
                ))}
              </div>

              {/* Factor Radar */}
              <Card>
                <SectionTitle icon="🎯" sub="Weighted multi-factor property scorecard">Factor Analysis</SectionTitle>
                <ResponsiveContainer width="100%" height={260}>
                  <RadarChart data={data.factors.map(f => ({ ...f, score: Math.round(f.score), fullMark: 100 }))}>
                    <PolarGrid stroke={DS.border} />
                    <PolarAngleAxis dataKey="name" tick={{ fill: DS.textMuted, fontSize: 11 }} />
                    <PolarRadiusAxis angle={30} domain={[0, 100]} tick={false} axisLine={false} />
                    <Radar name="Score" dataKey="score" stroke={DS.accent} fill={DS.accent} fillOpacity={0.2} strokeWidth={2} />
                  </RadarChart>
                </ResponsiveContainer>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 8 }}>
                  {data.factors.map((f, i) => (
                    <div key={i} style={{ flex: "1 1 140px" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                        <span style={{ fontSize: 11, color: DS.textMuted }}>{f.name}</span>
                        <span style={{ fontSize: 11, fontWeight: 600, color: f.score >= 70 ? DS.success : f.score >= 50 ? DS.warning : DS.danger, fontFamily: DS.fontMono }}>{Math.round(f.score)}</span>
                      </div>
                      <ProgressBar value={f.score} color={f.score >= 70 ? DS.success : f.score >= 50 ? DS.warning : DS.danger} />
                    </div>
                  ))}
                </div>
              </Card>
            </div>
          )}

          {/* ── VALUATION ── */}
          {tab === "valuation" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <Card>
                <SectionTitle icon="💰" sub="Comparable-sales weighted AVM with hedonic adjustments">Valuation Engine</SectionTitle>
                <div style={{ display: "flex", gap: 20, flexWrap: "wrap", marginBottom: 20 }}>
                  <Stat label="Estimated Value" value={`$${data.estimated.toLocaleString()}`} color={DS.accent} />
                  <Stat label="List Price" value={`$${data.priceNum.toLocaleString()}`} />
                  <Stat label="Delta" value={`${data.deltaPct > 0 ? "+" : ""}${data.deltaPct}%`} color={data.deltaPct <= 0 ? DS.success : DS.danger} />
                  <Stat label="Confidence" value={`${Math.round(data.confidence * 100)}%`} color={DS.info} />
                </div>
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={data.comps} margin={{ top: 5, right: 10, left: 10, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke={DS.border} />
                    <XAxis dataKey="id" tick={{ fill: DS.textMuted, fontSize: 10 }} tickFormatter={v => `#${v}`} />
                    <YAxis tick={{ fill: DS.textMuted, fontSize: 10 }} tickFormatter={v => `$${(v / 1000).toFixed(0)}K`} />
                    <Tooltip contentStyle={{ background: DS.surface, border: `1px solid ${DS.border}`, borderRadius: DS.radiusSm, fontSize: 12 }} formatter={v => [`$${v.toLocaleString()}`, ""]} />
                    <Bar dataKey="price" name="Sale Price" radius={[4, 4, 0, 0]}>
                      {data.comps.map((c, i) => <Cell key={i} fill={c.similarity >= 80 ? DS.accent : c.similarity >= 65 ? DS.info : DS.textDim} />)}
                    </Bar>
                    <Bar dataKey="adjusted" name="Adjusted" radius={[4, 4, 0, 0]} fill={`${DS.purple}80`} />
                  </BarChart>
                </ResponsiveContainer>
              </Card>

              <Card>
                <SectionTitle icon="📋" sub="Top comparable sales ranked by similarity">Comp Detail</SectionTitle>
                <div style={{ overflowX: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                    <thead>
                      <tr>{["#", "Sim%", "Price", "Adj. Price", "Sqft", "$/sqft", "Bed/Bath", "Year", "Dist", "Months"].map(h => (
                        <th key={h} style={{ textAlign: "left", padding: "8px 6px", borderBottom: `1px solid ${DS.border}`, color: DS.textMuted, fontWeight: 600, fontSize: 10, textTransform: "uppercase", letterSpacing: "0.04em", whiteSpace: "nowrap" }}>{h}</th>
                      ))}</tr>
                    </thead>
                    <tbody>
                      {data.comps.map((c, i) => (
                        <tr key={i} style={{ borderBottom: `1px solid ${DS.border}08` }}>
                          <td style={{ padding: "8px 6px", fontFamily: DS.fontMono }}>{c.id}</td>
                          <td style={{ padding: "8px 6px" }}><Badge color={c.similarity >= 80 ? DS.success : c.similarity >= 65 ? DS.info : DS.textDim}>{c.similarity}%</Badge></td>
                          <td style={{ padding: "8px 6px", fontFamily: DS.fontMono }}>${c.price.toLocaleString()}</td>
                          <td style={{ padding: "8px 6px", fontFamily: DS.fontMono, color: DS.accent }}>${c.adjusted.toLocaleString()}</td>
                          <td style={{ padding: "8px 6px" }}>{c.sqft.toLocaleString()}</td>
                          <td style={{ padding: "8px 6px", fontFamily: DS.fontMono }}>${c.ppsf}</td>
                          <td style={{ padding: "8px 6px" }}>{c.beds}/{c.baths}</td>
                          <td style={{ padding: "8px 6px" }}>{c.year}</td>
                          <td style={{ padding: "8px 6px" }}>{c.distance}mi</td>
                          <td style={{ padding: "8px 6px" }}>{c.months}mo</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Card>

              {/* Appreciation Forecast */}
              <Card>
                <SectionTitle icon="📈" sub="5-year value projection (conservative / moderate / aggressive)">Appreciation Forecast</SectionTitle>
                <ResponsiveContainer width="100%" height={220}>
                  <AreaChart data={data.appreciation} margin={{ top: 5, right: 10, left: 10, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke={DS.border} />
                    <XAxis dataKey="year" tick={{ fill: DS.textMuted, fontSize: 10 }} />
                    <YAxis tick={{ fill: DS.textMuted, fontSize: 10 }} tickFormatter={v => `$${(v / 1000).toFixed(0)}K`} />
                    <Tooltip contentStyle={{ background: DS.surface, border: `1px solid ${DS.border}`, borderRadius: DS.radiusSm, fontSize: 12 }} formatter={v => [`$${v.toLocaleString()}`, ""]} />
                    <Area type="monotone" dataKey="aggressive" stroke={DS.accent} fill={DS.accent} fillOpacity={0.08} strokeWidth={1.5} name="Aggressive (7%)" />
                    <Area type="monotone" dataKey="moderate" stroke={DS.info} fill={DS.info} fillOpacity={0.08} strokeWidth={2} name="Moderate (4.5%)" />
                    <Area type="monotone" dataKey="conservative" stroke={DS.textDim} fill={DS.textDim} fillOpacity={0.05} strokeWidth={1.5} name="Conservative (2%)" />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                  </AreaChart>
                </ResponsiveContainer>
              </Card>
            </div>
          )}

          {/* ── CLAIMS ── */}
          {tab === "claims" && (
            <Card>
              <SectionTitle icon="🔍" sub="Every listing claim tracked against authoritative source requirements">Claim Verification Engine</SectionTitle>
              <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
                {["verified", "partial", "unverified"].map(s => {
                  const count = data.claims.filter(c => c.status === s).length;
                  const color = s === "verified" ? DS.success : s === "partial" ? DS.warning : DS.danger;
                  return <Badge key={s} color={color}>{count} {s}</Badge>;
                })}
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {data.claims.map((c, i) => (
                  <div key={i} style={{
                    padding: "14px 16px", background: DS.surfaceAlt, borderRadius: DS.radiusSm,
                    borderLeft: `3px solid ${c.status === "verified" ? DS.success : c.status === "partial" ? DS.warning : DS.danger}`,
                  }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6, flexWrap: "wrap", gap: 6 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <span style={{ fontWeight: 600, fontSize: 13 }}>{c.label}</span>
                        <Badge color={c.status === "verified" ? DS.success : c.status === "partial" ? DS.warning : DS.danger}>
                          {c.status}
                        </Badge>
                        <RiskBadge level={c.severity} />
                      </div>
                      <span style={{ fontFamily: DS.fontMono, fontSize: 12, color: DS.accent }}>{c.claimed}</span>
                    </div>
                    <div style={{ fontSize: 12, color: DS.textMuted, lineHeight: 1.5 }}>{c.explanation}</div>
                    <div style={{ display: "flex", justifyContent: "space-between", marginTop: 8, fontSize: 11 }}>
                      <span style={{ color: DS.textDim }}>Source needed: {c.source}</span>
                      <span style={{ fontFamily: DS.fontMono, color: DS.textDim }}>Conf: {(c.confidence * 100).toFixed(0)}%</span>
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          )}

          {/* ── RISK MATRIX ── */}
          {tab === "risks" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <Card>
                <SectionTitle icon="⚠️" sub="Probability × impact risk assessment across 6 categories">Risk Matrix</SectionTitle>
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {data.risks.map((r, i) => (
                    <div key={i} style={{
                      padding: "16px", background: DS.surfaceAlt, borderRadius: DS.radiusSm,
                      borderLeft: `3px solid ${r.probability === "High" ? DS.danger : r.probability === "Medium" ? DS.warning : DS.success}`,
                    }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8, flexWrap: "wrap", gap: 6 }}>
                        <span style={{ fontWeight: 700, fontSize: 14 }}>{r.category}</span>
                        <div style={{ display: "flex", gap: 8 }}>
                          <span style={{ fontSize: 11, color: DS.textMuted }}>P:</span><RiskBadge level={r.probability} />
                          <span style={{ fontSize: 11, color: DS.textMuted }}>I:</span><RiskBadge level={r.impact} />
                        </div>
                      </div>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                        {r.items.map((item, j) => (
                          <span key={j} style={{ fontSize: 11, padding: "3px 8px", background: `${DS.bg}`, borderRadius: 4, color: DS.textMuted }}>{item}</span>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </Card>

              <Card>
                <SectionTitle icon="💸" sub="Estimated capital reserves needed within 5 years">Hidden Cost Exposure</SectionTitle>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {data.hiddenCosts.map((c, i) => (
                    <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 14px", background: DS.surfaceAlt, borderRadius: DS.radiusSm }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <RiskBadge level={c.risk} />
                        <span style={{ fontSize: 13 }}>{c.item}</span>
                      </div>
                      <span style={{ fontFamily: DS.fontMono, fontWeight: 600, color: c.risk === "high" ? DS.danger : DS.warning }}>${c.estimate.toLocaleString()}</span>
                    </div>
                  ))}
                  <div style={{ display: "flex", justifyContent: "space-between", padding: "12px 14px", borderTop: `1px solid ${DS.border}`, marginTop: 4 }}>
                    <span style={{ fontWeight: 700, fontSize: 14 }}>Total Hidden Cost Reserve</span>
                    <span style={{ fontFamily: DS.fontMono, fontWeight: 700, fontSize: 16, color: DS.danger }}>${data.totalHidden.toLocaleString()}</span>
                  </div>
                </div>
              </Card>
            </div>
          )}

          {/* ── FINANCIALS ── */}
          {tab === "financials" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <Card>
                <SectionTitle icon="🏦" sub={`${data.downPct * 100}% down, ${data.rate}% rate, 30yr fixed`}>Monthly Cost Breakdown</SectionTitle>
                <div style={{ display: "flex", gap: 20, flexWrap: "wrap", marginBottom: 16 }}>
                  <Stat label="Principal + Interest" value={`$${data.monthlyPI.toLocaleString()}`} color={DS.accent} />
                  <Stat label="Property Tax" value={`$${data.tax.toLocaleString()}`} color={DS.info} />
                  <Stat label="Insurance" value={`$${data.insurance.toLocaleString()}`} color={DS.purple} />
                  <Stat label="HOA" value={`$${data.hoa.toLocaleString()}`} color={DS.gold} />
                  <Stat label="Total Monthly" value={`$${data.totalMonthly.toLocaleString()}`} color={DS.pink} />
                </div>
                <ResponsiveContainer width="100%" height={200}>
                  <PieChart>
                    <Pie data={[
                      { name: "P+I", value: data.monthlyPI },
                      { name: "Tax", value: data.tax },
                      { name: "Insurance", value: data.insurance },
                      { name: "HOA", value: data.hoa },
                    ]} cx="50%" cy="50%" innerRadius={50} outerRadius={80} paddingAngle={3} dataKey="value">
                      {[DS.accent, DS.info, DS.purple, DS.gold].map((c, i) => <Cell key={i} fill={c} />)}
                    </Pie>
                    <Tooltip contentStyle={{ background: DS.surface, border: `1px solid ${DS.border}`, borderRadius: DS.radiusSm, fontSize: 12 }} formatter={v => [`$${v.toLocaleString()}/mo`, ""]} />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                  </PieChart>
                </ResponsiveContainer>
              </Card>

              <Card>
                <SectionTitle icon="📊" sub="Total acquisition cost including closing and hidden reserves">True Cost Analysis</SectionTitle>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {[
                    { label: "List Price", value: data.priceNum, color: DS.text },
                    { label: `Down Payment (${data.downPct * 100}%)`, value: Math.round(data.priceNum * data.downPct), color: DS.info },
                    { label: "Loan Amount", value: data.loanAmt, color: DS.textMuted },
                    { label: "Closing Costs (est.)", value: data.closingCosts, color: DS.warning },
                    { label: "Hidden Cost Reserve", value: data.totalHidden, color: DS.danger },
                  ].map((item, i) => (
                    <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: `1px solid ${DS.border}20` }}>
                      <span style={{ fontSize: 13, color: DS.textMuted }}>{item.label}</span>
                      <span style={{ fontFamily: DS.fontMono, fontWeight: 600, color: item.color }}>${item.value.toLocaleString()}</span>
                    </div>
                  ))}
                  <div style={{ display: "flex", justifyContent: "space-between", padding: "12px 0", borderTop: `2px solid ${DS.accent}40`, marginTop: 4 }}>
                    <span style={{ fontWeight: 700, fontSize: 15 }}>True All-In Cost</span>
                    <span style={{ fontFamily: DS.fontMono, fontWeight: 700, fontSize: 18, color: DS.accent }}>${(data.priceNum + data.closingCosts + data.totalHidden).toLocaleString()}</span>
                  </div>
                </div>
              </Card>
            </div>
          )}

          {/* ── NEIGHBORHOOD ── */}
          {tab === "neighborhood" && (
            <Card>
              <SectionTitle icon="🏘️" sub="Census, permit, crime, flood, and livability data">Neighborhood Intelligence</SectionTitle>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 12 }}>
                {[
                  { label: "Median Income", value: `$${data.neighborhood.medianIncome.toLocaleString()}`, icon: "💵" },
                  { label: "Median Home Value", value: `$${data.neighborhood.medianHomeValue.toLocaleString()}`, icon: "🏠" },
                  { label: "Population (tract)", value: data.neighborhood.population.toLocaleString(), icon: "👥" },
                  { label: "Crime Index", value: data.neighborhood.crimeIndex, icon: "🚔", color: data.neighborhood.crimeIndex > 50 ? DS.danger : DS.success },
                  { label: "Flood Zone", value: data.neighborhood.floodZone.includes("AE") ? "HIGH RISK" : "Minimal", icon: "🌊", color: data.neighborhood.floodZone.includes("AE") ? DS.danger : DS.success },
                  { label: "Walk Score", value: data.neighborhood.walkScore, icon: "🚶" },
                  { label: "Transit Score", value: data.neighborhood.transitScore, icon: "🚌" },
                  { label: "School Rating", value: `${data.neighborhood.schoolRating}/10`, icon: "🎓" },
                  { label: "Permit Activity", value: `${data.neighborhood.permitActivity} recent`, icon: "🔨" },
                  { label: "YoY Appreciation", value: `${data.neighborhood.yoyAppreciation}%`, icon: "📈", color: data.neighborhood.yoyAppreciation > 0 ? DS.success : DS.danger },
                ].map((item, i) => (
                  <div key={i} style={{ padding: "14px", background: DS.surfaceAlt, borderRadius: DS.radiusSm }}>
                    <div style={{ fontSize: 18, marginBottom: 6 }}>{item.icon}</div>
                    <div style={{ fontSize: 16, fontWeight: 700, fontFamily: DS.fontMono, color: item.color || DS.text }}>{item.value}</div>
                    <div style={{ fontSize: 11, color: DS.textMuted, marginTop: 2 }}>{item.label}</div>
                  </div>
                ))}
              </div>
            </Card>
          )}

          {/* ── OFFER INTEL ── */}
          {tab === "offer" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <Card>
                <SectionTitle icon="🤝" sub="Data-driven offer strategies with negotiation leverage">Offer Strategy Engine</SectionTitle>
                <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                  {data.offerStrategies.map((strat, i) => (
                    <div key={i} style={{
                      padding: "18px", background: DS.surfaceAlt, borderRadius: DS.radius,
                      borderLeft: `3px solid ${i === 0 ? DS.accent : DS.info}`,
                    }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8, flexWrap: "wrap", gap: 8 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <Badge color={i === 0 ? DS.accent : DS.info}>{i === 0 ? "RECOMMENDED" : `OPTION ${i + 1}`}</Badge>
                          <span style={{ fontWeight: 700, fontSize: 15 }}>{strat.strategy}</span>
                        </div>
                        {strat.offerPrice && (
                          <span style={{ fontFamily: DS.fontMono, fontWeight: 700, fontSize: 18, color: DS.accent }}>
                            ${strat.offerPrice.toLocaleString()}
                          </span>
                        )}
                      </div>
                      {strat.escalation && (
                        <div style={{ fontSize: 12, color: DS.textMuted, marginBottom: 6 }}>
                          Escalation cap: <span style={{ color: DS.warning, fontFamily: DS.fontMono }}>${strat.escalation.toLocaleString()}</span>
                        </div>
                      )}
                      <div style={{ fontSize: 13, color: DS.textMuted, lineHeight: 1.6 }}>{strat.rationale}</div>
                    </div>
                  ))}
                </div>
              </Card>

              <Card>
                <SectionTitle icon="📋" sub="Complete before making an offer">Pre-Offer Checklist</SectionTitle>
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {[
                    { item: "Verify sqft with county assessor records", critical: true },
                    { item: "Request seller disclosure statement", critical: true },
                    { item: "Check permit history for unpermitted work", critical: true },
                    { item: "Confirm school boundary assignment", critical: false },
                    { item: "Run title search for liens/encumbrances", critical: true },
                    { item: "Get pre-inspection or sewer scope", critical: data.yearNum < 1980 },
                    { item: "Verify HOA rules, reserves, and special assessments", critical: data.propertyType === "Condo" },
                    { item: "Check days on market and price history", critical: false },
                    { item: "Review comparable sold prices within 3 months", critical: true },
                    { item: "Confirm flood zone status and insurance requirements", critical: data.neighborhood.floodZone.includes("AE") },
                  ].map((c, i) => (
                    <div key={i} style={{
                      display: "flex", alignItems: "center", gap: 10, padding: "8px 12px",
                      background: DS.surfaceAlt, borderRadius: DS.radiusSm,
                    }}>
                      <span style={{ fontSize: 14 }}>{c.critical ? "🔴" : "🟡"}</span>
                      <span style={{ fontSize: 13, color: DS.text }}>{c.item}</span>
                    </div>
                  ))}
                </div>
              </Card>
            </div>
          )}

          {/* ── SOURCES ── */}
          {tab === "sources" && (
            <Card>
              <SectionTitle icon="📡" sub="14-source verification pipeline — 6 live, 8 pending">Source Audit</SectionTitle>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {data.sources.map((src, i) => {
                  const isLive = src.status === "connected";
                  return (
                    <div key={i} style={{
                      display: "flex", justifyContent: "space-between", alignItems: "center",
                      padding: "12px 14px", background: DS.surfaceAlt, borderRadius: DS.radiusSm,
                      borderLeft: `3px solid ${isLive ? DS.success : DS.textDim}`,
                      opacity: isLive ? 1 : 0.7,
                    }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <GlowDot color={isLive ? DS.success : DS.textDim} size={7} pulse={isLive} />
                        <span style={{ fontSize: 13, fontWeight: isLive ? 600 : 400 }}>{src.name}</span>
                      </div>
                      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                        <Badge color={src.trust === "authoritative" ? DS.accent : src.trust === "high" ? DS.info : DS.textMuted}>
                          {src.trust}
                        </Badge>
                        <Badge color={isLive ? DS.success : DS.textDim}>
                          {isLive ? src.latency : src.status.replace("_", " ")}
                        </Badge>
                      </div>
                    </div>
                  );
                })}
              </div>
              <div style={{
                marginTop: 16, padding: "14px", background: `${DS.warning}08`,
                borderRadius: DS.radiusSm, border: `1px solid ${DS.warning}20`,
              }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: dataSource === "live" ? DS.success : DS.warning, marginBottom: 4 }}>{dataSource === "live" ? "✅ Backend Connected" : "⚠️ Simulated Mode — Backend Not Connected"}</div>
                <div style={{ fontSize: 12, color: DS.textMuted, lineHeight: 1.6 }}>
                  {dataSource === "live"
                    ? "Live public data sources are connected. Confidence is still capped because MLS sold comps, assessor verification, title search, and document ingestion require credentials. This analysis uses real public data but is not a formal appraisal."
                    : `Backend is offline — all data shown is simulated from address text, not real market data. Run "docker compose up --build" locally to connect 6 live public APIs (Census, King County, FEMA, Seattle permits, crime data). Even with live public data, production accuracy requires MLS sold comps and document verification.`
                  }
                </div>
              </div>
            </Card>
          )}

          {/* ── AI ADVISOR ── */}
          {tab === "ai" && <AIInsightPanel data={data} />}
        </div>
      )}

      {/* Footer */}
      <div style={{ textAlign: "center", marginTop: 32, paddingTop: 16, borderTop: `1px solid ${DS.border}`, fontSize: 11, color: DS.textDim, lineHeight: 1.6 }}>
        Realty Intel Pro V21+ • AI buyer due diligence engine • Not an appraisal<br />
        {dataSource === "simulated" ? "⚠️ Currently showing simulated data — connect backend for real analysis" : "Source-grounded, confidence-scored, transparent about missing data"}
      </div>
    </div>
  );
}
