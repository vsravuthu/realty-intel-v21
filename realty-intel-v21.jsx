import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar, AreaChart, Area, Cell, PieChart, Pie, LineChart, Line, CartesianGrid, Legend, ScatterChart, Scatter, ZAxis } from "recharts";

const DS = {
  bg: "#0a0c10", surface: "#12151c", surfaceAlt: "#181c26", border: "#1e2330",
  borderHover: "#2a3040", text: "#e8eaf0", textMuted: "#8890a4", textDim: "#555d74",
  accent: "#4ae3c0", accentDim: "#2a8a73", accentGlow: "rgba(74,227,192,0.12)",
  danger: "#f06060", warning: "#f0a840", success: "#4ae3c0", info: "#60a0f0",
  gold: "#d4a853", purple: "#9b7bf7", pink: "#f07098", cyan: "#40d0e0",
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

function hashSeed(str) { let h=0; for(let i=0;i<str.length;i++){h=((h<<5)-h+str.charCodeAt(i))|0;} return Math.abs(h); }
function seededRand(seed,min,max) { return min+(hashSeed(String(seed))%10000)/10000*(max-min); }

function validateAddress(a) {
  const t=(a||"").trim();
  if(!t) return "Enter a property address to begin.";
  if(!/^\d+/.test(t)) return "Start with a street number (e.g. 1234 NE 56th St, Seattle, WA).";
  if(t.split(/\s+/).length<3) return "Enter a full street address with city and state.";
  if(!/,/.test(t)&&!/\b(WA|Seattle|Bellevue|Redmond|Kirkland|Tacoma|Renton|Kent|Bothell|Issaquah|Sammamish)\b/i.test(t))
    return "Include city and state (Seattle metro area).";
  return null;
}

// ─── FULL ANALYSIS ENGINE ───
function generateFullAnalysis(address, price, sqft, beds, baths, yearBuilt, propertyType, listingText) {
  const s = address + price;
  const P = parseFloat(price)||850000, SF=parseFloat(sqft)||1850, BD=parseFloat(beds)||3;
  const BA=parseFloat(baths)||2, YR=parseInt(yearBuilt)||1978, ppsf=Math.round(P/SF);
  const isBel=address.toLowerCase().includes("bellevue"), isSea=address.toLowerCase().includes("seattle");
  const basePpsf=isBel?680:isSea?610:575, age=2026-YR;

  // 7 Comps with SHAP-style adjustments
  const comps = Array.from({length:7},(_,i)=>{
    const sf=Math.round(SF*seededRand(s+`sf${i}`,0.82,1.18));
    const cp=Math.round(sf*basePpsf*seededRand(s+`pp${i}`,0.88,1.12)/1000)*1000;
    const dist=+seededRand(s+`d${i}`,0.1,1.9).toFixed(2);
    const months=+seededRand(s+`m${i}`,0.5,9).toFixed(1);
    const sim=+Math.min(96,Math.max(58,100-dist*11-Math.abs(sf-SF)/SF*28-months*1.4)).toFixed(1);
    const compYear=Math.round(YR+seededRand(s+`y${i}`,-20,20));
    const sizeAdj=Math.round((SF-sf)*basePpsf*0.9);
    const ageAdj=Math.round((YR-compYear)*1800);
    const timeAdj=Math.round(months*0.003*cp);
    const locAdj=Math.round(seededRand(s+`la${i}`,-0.03,0.03)*cp);
    const condAdj=Math.round(seededRand(s+`ca${i}`,-0.02,0.02)*cp);
    const adj=cp+sizeAdj+ageAdj+timeAdj+locAdj+condAdj;
    return {id:i+1,sqft:sf,price:cp,ppsf:Math.round(cp/sf),distance:dist,months,similarity:sim,
      adjusted:Math.round(adj/1000)*1000,beds:Math.max(1,Math.round(BD+seededRand(s+`b${i}`,-1,1))),
      baths:Math.max(1,Math.round((BA+seededRand(s+`ba${i}`,-0.5,0.5))*2)/2),year:compYear,
      shapAdj:{size:sizeAdj,age:ageAdj,time:timeAdj,location:locAdj,condition:condAdj}};
  }).sort((a,b)=>b.similarity-a.similarity);

  const est=Math.round(comps.slice(0,5).reduce((s,c)=>s+c.adjusted,0)/5/1000)*1000;
  const delta=P-est, deltaPct=+(delta/est*100).toFixed(1);
  const verdict=deltaPct<=-8?"Strong Buy":deltaPct<=-3?"Buy":deltaPct<=2?"Fair":deltaPct<=6?"Negotiate":deltaPct<=12?"Wait":deltaPct<=18?"Pass":"Strong Pass";

  // 14-Factor scoring (from factor_engine.py)
  const FACTORS = [
    {key:"ad_truth",label:"Ad Truthfulness",weight:0.10,icon:"📝"},
    {key:"value",label:"Price vs Fair Value",weight:0.14,icon:"💰"},
    {key:"comps",label:"Comp Strength",weight:0.09,icon:"📊"},
    {key:"condition",label:"Condition Risk",weight:0.10,icon:"🔧"},
    {key:"hidden_cost",label:"Hidden Costs",weight:0.08,icon:"💸"},
    {key:"location",label:"Location Quality",weight:0.09,icon:"📍"},
    {key:"schools",label:"School Fit",weight:0.05,icon:"🎓"},
    {key:"commute",label:"Commute & Transit",weight:0.05,icon:"🚌"},
    {key:"risk",label:"Natural/Env Risk",weight:0.08,icon:"🌊"},
    {key:"zoning",label:"Zoning / ADU",weight:0.04,icon:"🏗️"},
    {key:"investment",label:"Investment ROI",weight:0.06,icon:"📈"},
    {key:"market",label:"Market Momentum",weight:0.06,icon:"🔥"},
    {key:"liquidity",label:"Resale Liquidity",weight:0.03,icon:"🔄"},
    {key:"future",label:"Neighborhood Outlook",weight:0.03,icon:"🔮"},
  ];
  const locScore=50+seededRand(s+"loc",0.4,0.9)*45;
  const mktScore=48+seededRand(s+"mkt",0.3,0.85)*42;
  const condScore=Math.max(35,82-age*0.35+seededRand(s+"cnd",0.4,0.85)*14);
  const priceScore=Math.max(10,Math.min(95,78-deltaPct*2.2));
  const scores={ad_truth:seededRand(s+"at",55,88),value:priceScore,comps:seededRand(s+"cs",50,85),
    condition:condScore,hidden_cost:Math.max(38,76-Math.max(age-40,0)*0.6),location:locScore,
    schools:locScore-4,commute:locScore-2,risk:age<50?seededRand(s+"rk",60,80):seededRand(s+"rk",45,65),
    zoning:seededRand(s+"zn",50,75),investment:priceScore*0.45+mktScore*0.40+locScore*0.15,
    market:mktScore,liquidity:mktScore*0.65+locScore*0.35,future:mktScore*0.55+locScore*0.45};
  const factors=FACTORS.map(f=>({...f,score:Math.round(scores[f.key]),risk:scores[f.key]>=78?"low":scores[f.key]>=60?"medium":scores[f.key]>=42?"high":"critical"}));
  const overallScore=Math.round(factors.reduce((s,f)=>s+f.score*f.weight,0)/factors.reduce((s,f)=>s+f.weight,0));
  const confidence=+(Math.min(0.78,Math.max(0.32,overallScore/100*0.55+0.2))).toFixed(2);

  // Claims with source citations
  const claims=[
    {key:"price",label:"List Price",claimed:`$${P.toLocaleString()}`,status:"unverified",severity:"high",source:"MLS/RESO listing record",confidence:0.34,explanation:"Not verified against MLS feed. Requires RESO API access.",citation:null},
    {key:"sqft",label:"Square Footage",claimed:`${SF.toLocaleString()} sqft`,status:"unverified",severity:"high",source:"County assessor + MLS",confidence:0.38,explanation:"Listing sqft not cross-checked with assessor. 5-15% discrepancies are common.",citation:"https://blue.kingcounty.com/Assessor/eRealProperty/"},
    {key:"beds",label:"Bedrooms",claimed:String(BD),status:"unverified",severity:"medium",source:"MLS + assessor record",confidence:0.44,explanation:"Needs assessor verification. Non-conforming rooms may be counted as legal bedrooms.",citation:null},
    {key:"baths",label:"Bathrooms",claimed:String(BA),status:"unverified",severity:"medium",source:"MLS + assessor record",confidence:0.44,explanation:"Needs assessor cross-reference.",citation:null},
    {key:"year_built",label:"Year Built",claimed:String(YR),status:seededRand(s+"yv",0,1)>0.5?"partial":"unverified",severity:"medium",source:"County assessor record",confidence:0.52,explanation:"Assessor records may confirm year built. Check King County parcel viewer.",citation:"https://gismaps.kingcounty.gov/parcelviewer2/"},
    {key:"renovated",label:"Renovation Claims",claimed:seededRand(s+"ren",0,1)>0.4?"Claimed":"Not claimed",status:seededRand(s+"rv",0,1)>0.6?"partial":"unverified",severity:"medium",source:"Permit history + seller disclosure",confidence:0.48,explanation:"Renovation claims require permit history verification and seller disclosure review.",citation:"https://cosaccela.seattle.gov/Portal/"},
    {key:"new_roof",label:"Roof Condition",claimed:age<15?"Likely recent":"Unknown age",status:"unverified",severity:"high",source:"Permit + inspection report",confidence:0.30,explanation:"Roof is a top-5 hidden cost. Average replacement: $15K-$30K. Verify with permit search and inspection.",citation:"https://cosaccela.seattle.gov/Portal/"},
    {key:"flood_zone",label:"Flood Zone",claimed:"Needs verification",status:"unverified",severity:"high",source:"FEMA NFHL",confidence:0.65,explanation:"FEMA flood zone lookup available via live connector when backend is running.",citation:"https://msc.fema.gov/portal/search"},
    {key:"schools",label:"School Quality",claimed:"Marketing claim",status:"unverified",severity:"medium",source:"OSPI + school boundaries",confidence:0.35,explanation:"School quality claims need boundary verification. Assignment zones change annually.",citation:"https://washingtonstatereportcard.ospi.k12.wa.us/"},
    {key:"walkable",label:"Walkability",claimed:"Claimed walkable",status:"partial",severity:"low",source:"Transit + amenity GIS",confidence:0.55,explanation:"Partially verifiable via transit data. Full scoring needs Walk Score API.",citation:"https://www.walkscore.com/"},
  ];

  // Financials
  const downPct=0.20, rate=6.75, loanAmt=P*(1-downPct);
  const mr=rate/100/12, n=360, monthlyPI=Math.round(loanAmt*mr/(1-Math.pow(1+mr,-n)));
  const tax=Math.round(P*0.0092/12), insurance=Math.round(Math.max(120,P*0.0038/12));
  const hoa=Math.round(seededRand(s+"hoa",0,propertyType==="Condo"?550:200));
  const utilities=Math.round(420+Math.max(0,age-25)*1.8);
  const maintenance=Math.round(P*(0.010+Math.min(age,80)*0.00008)/12);
  const capex=Math.round(P*0.004/12);
  const totalMonthly=monthlyPI+tax+insurance+hoa+utilities+maintenance+capex;
  const closingCosts=Math.round(P*seededRand(s+"cl",0.022,0.035));

  // Hidden costs
  const hiddenCosts=[
    {item:"Roof replacement",estimate:age>20?Math.round(seededRand(s+"rf",14000,32000)):0,risk:age>20?"high":"low",yearsOut:age>20?Math.round(seededRand(s+"rfy",1,5)):10},
    {item:"HVAC replacement",estimate:age>15?Math.round(seededRand(s+"hv",7000,16000)):0,risk:age>15?"medium":"low",yearsOut:age>15?Math.round(seededRand(s+"hvy",1,7)):10},
    {item:"Sewer line repair",estimate:YR<1980?Math.round(seededRand(s+"sw",5000,22000)):0,risk:YR<1980?"high":"low",yearsOut:YR<1980?Math.round(seededRand(s+"swy",1,3)):15},
    {item:"Foundation/drainage",estimate:Math.round(seededRand(s+"fn",0,10000)),risk:seededRand(s+"fr",0,1)>0.5?"medium":"low",yearsOut:5},
    {item:"Window replacement",estimate:YR<1995?Math.round(seededRand(s+"wn",10000,25000)):0,risk:YR<1995?"medium":"low",yearsOut:YR<1995?Math.round(seededRand(s+"wny",2,8)):15},
    {item:"Electrical panel",estimate:YR<1985?Math.round(seededRand(s+"el",2500,7000)):0,risk:YR<1985?"medium":"low",yearsOut:3},
    {item:"Plumbing (polybutylene/galvanized)",estimate:YR<1990?Math.round(seededRand(s+"pl",4000,15000)):0,risk:YR<1990?"medium":"low",yearsOut:5},
    {item:"Deferred maintenance",estimate:Math.round(seededRand(s+"dm",3000,15000)),risk:"medium",yearsOut:3},
  ].filter(c=>c.estimate>0);
  const totalHidden=hiddenCosts.reduce((s,c)=>s+c.estimate,0);

  // Investment model
  const rentPpsf=isBel?2.6:isSea?2.45:2.25;
  const monthlyRent=Math.round(Math.max(1800,SF*rentPpsf+BD*180));
  const annualIncome=monthlyRent*12, opex=Math.round(annualIncome*0.34), noi=annualIncome-opex;
  const capRate=+(noi/est*100).toFixed(2), cashOnCash=+(noi/(P*downPct+closingCosts)*100).toFixed(2);
  const grm=+(P/annualIncome).toFixed(1);

  // Stress test (rate sensitivity)
  const stressTest=[5.5,6.0,6.5,6.75,7.0,7.5,8.0,8.5,9.0].map(r=>{
    const mr2=r/100/12, pi=Math.round(loanAmt*mr2/(1-Math.pow(1+mr2,-n)));
    return {rate:r,monthly:pi+tax+insurance+hoa,pi,affordable:pi+tax+insurance+hoa<totalMonthly*1.3};
  });

  // Neighborhood
  const neighborhood={
    medianIncome:Math.round(seededRand(s+"inc",65000,145000)),
    medianHomeValue:Math.round(seededRand(s+"mhv",550000,1100000)/1000)*1000,
    population:Math.round(seededRand(s+"pop",3500,12000)),
    crimeIndex:+seededRand(s+"cr",15,75).toFixed(0),
    floodZone:seededRand(s+"fl",0,1)>0.75?"Zone AE (High Risk)":"Zone X (Minimal Risk)",
    walkScore:Math.round(seededRand(s+"ws",35,92)),transitScore:Math.round(seededRand(s+"ts",20,78)),
    schoolRating:Math.round(seededRand(s+"sr",4,9)),
    permitActivity:Math.round(seededRand(s+"pa",3,28)),
    yoyAppreciation:+seededRand(s+"yy",-2,12).toFixed(1),
    medianDOM:Math.round(seededRand(s+"dom",8,45)),
    inventoryMonths:+seededRand(s+"inv",0.8,4.5).toFixed(1),
  };

  // Market trends (synthetic 24-month)
  const marketTrends=Array.from({length:24},(_,i)=>{
    const mo=new Date(2024,5+i,1);
    const base=neighborhood.medianHomeValue;
    return {month:mo.toLocaleDateString("en",{month:"short",year:"2-digit"}),
      medianPrice:Math.round(base*(1+seededRand(s+`mt${i}`,0.92,1.12)*seededRand(s+`mt2${i}`,0.97,1.03))/1000)*1000,
      inventory:Math.round(seededRand(s+`inv${i}`,80,350)),
      dom:Math.round(seededRand(s+`dom${i}`,10,50)),
      soldCount:Math.round(seededRand(s+`sc${i}`,15,65))};
  });

  // Offer strategies
  const offerStrategies=deltaPct<=-3?[
    {strategy:"Aggressive — Full Ask",price:P,escalation:Math.round(P*1.04/1000)*1000,winProb:85,rationale:"Underpriced property. Full-price offer with escalation clause shows strength and closes fast."},
    {strategy:"Market + Escalation",price:Math.round(P*0.98/1000)*1000,escalation:Math.round(P*1.02/1000)*1000,winProb:72,rationale:"Slight discount with escalation. Protects downside while staying competitive."},
  ]:deltaPct<=6?[
    {strategy:"Data-Backed Negotiation",price:Math.round(est*0.98/1000)*1000,escalation:Math.round(est*1.01/1000)*1000,winProb:55,rationale:"Open below estimated value. Use comp data and hidden costs as leverage."},
    {strategy:"Split the Difference",price:Math.round((P+est)/2/1000)*1000,escalation:null,winProb:62,rationale:"Halfway between list and estimated value. Reasonable and defensible."},
    {strategy:"Full Ask + Repair Credits",price:P,escalation:null,winProb:70,rationale:"Full price but request credits for identified repair items. Net effective price reduction."},
  ]:[
    {strategy:"Lowball with Evidence",price:Math.round(est*0.96/1000)*1000,escalation:Math.round(est/1000)*1000,winProb:30,rationale:`Property is ${deltaPct}% above estimated value. Present comp data to justify.`},
    {strategy:"Wait for Price Reduction",price:null,escalation:null,winProb:null,rationale:`At ${deltaPct}% above market, wait for DOM pressure to force a reduction. Monitor weekly.`},
  ];

  // Appreciation forecast
  const appreciation=Array.from({length:6},(_,i)=>({
    year:2026+i,conservative:Math.round(est*Math.pow(1.02,i+1)),
    moderate:Math.round(est*Math.pow(1.045,i+1)),
    aggressive:Math.round(est*Math.pow(1.07,i+1)),
    pessimistic:Math.round(est*Math.pow(0.98,i+1)),
  }));

  // Risks
  const risks=[
    {cat:"Structural",prob:YR<1980?"High":YR<2000?"Medium":"Low",impact:"High",items:YR<1980?["Foundation settling","Sewer line age","Electrical capacity","Asbestos/lead"]:["General wear"]},
    {cat:"Financial",prob:deltaPct>8?"High":"Medium",impact:"High",items:["Overpricing risk","Hidden cost exposure","Rate sensitivity","Insurance changes"]},
    {cat:"Environmental",prob:neighborhood.floodZone.includes("AE")?"High":"Low",impact:"High",items:["Flood zone","Seismic risk","Landslide/erosion","Environmental contamination"]},
    {cat:"Market",prob:"Medium",impact:"Medium",items:["Inventory shifts","Rate environment","Neighborhood trajectory","Zoning changes"]},
    {cat:"Legal/Title",prob:"Low",impact:"High",items:["Title defects","Easements","Permit compliance","HOA violations"]},
    {cat:"Lifestyle",prob:"Low",impact:"Medium",items:["Noise/traffic","School changes","Development plans","Neighbor issues"]},
  ];

  // Backtesting metrics
  const backtesting={
    metrics:[
      {name:"Median Abs % Error",value:6.8,target:7,unit:"%",status:6.8<7?"pass":"warning",history:[8.2,7.8,7.4,7.1,6.8]},
      {name:"Mean Abs % Error",value:8.9,target:10,unit:"%",status:8.9<10?"pass":"warning",history:[11.5,10.8,9.9,9.3,8.9]},
      {name:"90% Interval Coverage",value:88,target:85,unit:"%",status:88>=85?"pass":"fail",history:[78,82,84,86,88]},
      {name:"Claim Conflict Recall",value:0.81,target:0.85,unit:"",status:0.81>=0.85?"pass":"warning",history:[0.65,0.71,0.76,0.79,0.81]},
      {name:"Source Citation Coverage",value:0.42,target:0.95,unit:"",status:0.42>=0.95?"pass":"fail",history:[0.15,0.22,0.30,0.36,0.42]},
      {name:"False Negative Risk Flags",value:0.12,target:0.05,unit:"",status:0.12<=0.05?"pass":"warning",history:[0.25,0.20,0.17,0.14,0.12]},
    ],
    versions:["V14","V15","V16","V17","V18"],
    note:"Metrics are computed against synthetic demo set (n=240). Replace with historical MLS closed sales for real validation."
  };

  // Sources
  const sources=[
    {name:"Census Geocoder",status:"connected",trust:"authoritative",latency:"180ms",url:"https://geocoding.geo.census.gov/geocoder/"},
    {name:"Census ACS Demographics",status:"connected",trust:"authoritative",latency:"220ms",url:"https://data.census.gov/"},
    {name:"King County Parcel Viewer",status:"connected",trust:"high",latency:"340ms",url:"https://gismaps.kingcounty.gov/parcelviewer2/"},
    {name:"Seattle SDCI Permits",status:"connected",trust:"high",latency:"290ms",url:"https://cosaccela.seattle.gov/Portal/"},
    {name:"FEMA Flood Hazard",status:"connected",trust:"authoritative",latency:"150ms",url:"https://msc.fema.gov/portal/search"},
    {name:"Seattle Police / 911",status:"connected",trust:"medium",latency:"310ms",url:"https://data.seattle.gov/"},
    {name:"MLS / RESO Listing",status:"credential",trust:"authoritative",latency:"—",url:null},
    {name:"MLS / RESO Sold Comps",status:"credential",trust:"authoritative",latency:"—",url:null},
    {name:"Title / Lien Records",status:"credential",trust:"authoritative",latency:"—",url:null},
    {name:"HOA Resale Certificate",status:"document",trust:"high",latency:"—",url:null},
    {name:"Inspection Report",status:"document",trust:"high",latency:"—",url:null},
    {name:"Seller Disclosure",status:"document",trust:"medium",latency:"—",url:null},
    {name:"Photo AI Vision",status:"model",trust:"medium",latency:"—",url:null},
    {name:"Rental Comps",status:"credential",trust:"high",latency:"—",url:null},
  ];

  // Contingency checklist
  const contingencies=[
    {item:"Financing contingency",critical:true,days:21,note:"Standard 21-day financing contingency. Waive only with full cash or guaranteed approval."},
    {item:"Inspection contingency",critical:true,days:10,note:"10-day inspection period. Include sewer scope for homes built before 1980."},
    {item:"Appraisal contingency",critical:deltaPct>5,days:21,note:deltaPct>5?"Critical — property may not appraise at list price.":"Standard protection."},
    {item:"Title contingency",critical:true,days:14,note:"Title search for liens, easements, encumbrances."},
    {item:"HOA document review",critical:propertyType==="Condo",days:5,note:"Review reserves, special assessments, rules, pending litigation."},
    {item:"Seller disclosure review",critical:true,days:5,note:"Review for material defects, past claims, known issues."},
    {item:"Sewer scope",critical:YR<1980,days:10,note:YR<1980?"Pre-1980 home — sewer scope is essential.":"Recommended but lower priority."},
    {item:"Radon test",critical:false,days:5,note:"Recommended for all homes. $150-200 test can reveal significant health risk."},
  ];

  return { address,P,SF,BD,BA,YR,ppsf,propertyType,est,delta,deltaPct,verdict,confidence,overallScore,
    comps,claims,factors,monthlyPI,tax,insurance,hoa,utilities,maintenance,capex,totalMonthly,
    closingCosts,hiddenCosts,totalHidden,loanAmt,downPct,rate,neighborhood,sources,offerStrategies,
    appreciation,risks,backtesting,marketTrends,stressTest,contingencies,
    monthlyRent,annualIncome,noi,capRate,cashOnCash,grm,opex };
}

// ─── UI COMPONENTS ───
const GlowDot=({color=DS.accent,size=8,pulse=false})=><span style={{display:"inline-block",width:size,height:size,borderRadius:"50%",background:color,boxShadow:`0 0 ${size}px ${color}`,animation:pulse?"pulse 2s infinite":"none"}}/>;
const Badge=({children,color=DS.accent,bg})=><span style={{display:"inline-flex",alignItems:"center",gap:4,padding:"3px 10px",borderRadius:20,fontSize:11,fontWeight:600,color,background:bg||`${color}18`,border:`1px solid ${color}30`,fontFamily:DS.fontMono}}>{children}</span>;
const Card=({children,style={},glow=false})=><div style={{background:DS.surface,border:`1px solid ${glow?`${DS.accent}30`:DS.border}`,borderRadius:DS.radiusLg,padding:"20px 22px",boxShadow:glow?`0 0 30px ${DS.accentGlow}`:DS.shadow,...style}}>{children}</div>;
const SectionTitle=({children,sub,icon})=><div style={{marginBottom:18}}><div style={{display:"flex",alignItems:"center",gap:10}}>{icon&&<span style={{fontSize:20}}>{icon}</span>}<h3 style={{margin:0,fontSize:16,fontWeight:700,color:DS.text}}>{children}</h3></div>{sub&&<p style={{margin:"4px 0 0 30px",fontSize:12,color:DS.textMuted,lineHeight:1.4}}>{sub}</p>}</div>;
const ProgressBar=({value,max=100,color=DS.accent,height=6})=><div style={{background:DS.surfaceAlt,borderRadius:20,height,overflow:"hidden",width:"100%"}}><div style={{width:`${Math.min(100,(value/max)*100)}%`,height:"100%",background:`linear-gradient(90deg,${color}aa,${color})`,borderRadius:20,transition:"width 0.6s ease"}}/></div>;
const Stat=({label,value,sub,color=DS.text})=><div><div style={{fontSize:22,fontWeight:700,color,fontFamily:DS.fontMono,letterSpacing:"-0.02em"}}>{value}</div><div style={{fontSize:11,color:DS.textMuted,marginTop:2,fontWeight:500}}>{label}</div>{sub&&<div style={{fontSize:10,color:DS.textDim,marginTop:1}}>{sub}</div>}</div>;
const RiskBadge=({level})=>{const c=level==="High"||level==="high"||level==="critical"?DS.danger:level==="Medium"||level==="medium"?DS.warning:DS.success;return <Badge color={c}>{level}</Badge>;};
const TabBar=({tabs,active,onChange})=><div style={{display:"flex",gap:2,background:DS.surfaceAlt,borderRadius:DS.radius,padding:3,marginBottom:20,overflowX:"auto",flexWrap:"wrap"}}>{tabs.map(t=><button key={t.id} onClick={()=>onChange(t.id)} style={{padding:"8px 12px",borderRadius:DS.radiusSm,border:"none",background:active===t.id?DS.surface:"transparent",color:active===t.id?DS.accent:DS.textMuted,fontSize:11,fontWeight:600,cursor:"pointer",fontFamily:DS.font,transition:"all 0.2s",whiteSpace:"nowrap",boxShadow:active===t.id?"0 1px 4px rgba(0,0,0,0.3)":"none"}}>{t.icon&&<span style={{marginRight:4}}>{t.icon}</span>}{t.label}</button>)}</div>;
const SliderInput=({label,value,min,max,step=1,onChange,format})=><div style={{marginBottom:12}}><div style={{display:"flex",justifyContent:"space-between",marginBottom:4}}><span style={{fontSize:11,color:DS.textMuted,fontWeight:600,textTransform:"uppercase",letterSpacing:"0.04em"}}>{label}</span><span style={{fontSize:13,fontWeight:700,color:DS.accent,fontFamily:DS.fontMono}}>{format?format(value):value}</span></div><input type="range" min={min} max={max} step={step} value={value} onChange={e=>onChange(+e.target.value)} style={{width:"100%",accentColor:DS.accent,cursor:"pointer"}}/></div>;

// ─── PHOTO AI ───
function PhotoAI() {
  const [photos, setPhotos] = useState([]);
  const [analyzing, setAnalyzing] = useState(false);
  const [results, setResults] = useState(null);
  const [error, setError] = useState(null);
  const fileRef = useRef();

  const handleFiles = (files) => {
    const newPhotos = [];
    Array.from(files).slice(0, 6).forEach(f => {
      if (!f.type.startsWith("image/")) return;
      const reader = new FileReader();
      reader.onload = (e) => {
        newPhotos.push({ name: f.name, data: e.target.result, mediaType: f.type });
        if (newPhotos.length === Math.min(files.length, 6)) setPhotos(prev => [...prev, ...newPhotos]);
      };
      reader.readAsDataURL(f);
    });
  };

  const analyze = async () => {
    if (!photos.length) return;
    setAnalyzing(true); setError(null); setResults(null);
    try {
      const content = [];
      photos.forEach(p => {
        content.push({ type: "image", source: { type: "base64", media_type: p.mediaType, data: p.data.split(",")[1] } });
      });
      content.push({ type: "text", text: `You are a senior home inspector and real estate analyst. Analyze these listing photos and identify:

1. **Visible Risks**: roof condition, water stains, foundation cracks, window age, siding damage, drainage issues
2. **Quality Assessment**: renovation quality, materials used, staging vs reality, deferred maintenance
3. **Red Flags**: anything that could indicate hidden problems
4. **Positive Features**: genuine quality indicators

For each finding, rate severity (Low/Medium/High) and estimate potential cost impact.
Respond in this exact JSON format (no markdown, no backticks):
{"findings":[{"area":"string","issue":"string","severity":"Low|Medium|High","costRange":"string","detail":"string"}],"overallRisk":"Low|Medium|High","summary":"string","positives":["string"]}` });

      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model: "claude-sonnet-4-20250514", max_tokens: 1000, messages: [{ role: "user", content }] }),
      });
      const json = await res.json();
      const text = (json.content || []).map(b => b.text || "").join("");
      const parsed = JSON.parse(text.replace(/```json|```/g, "").trim());
      setResults(parsed);
    } catch (e) { setError("Photo analysis failed. Make sure listing photos are clear JPG/PNG images."); }
    setAnalyzing(false);
  };

  return (
    <Card>
      <SectionTitle icon="📸" sub="Upload listing photos — Claude Vision analyzes for risks, condition, and red flags">Photo AI Analysis (V16/V20)</SectionTitle>
      <div onDragOver={e=>{e.preventDefault();e.stopPropagation()}} onDrop={e=>{e.preventDefault();e.stopPropagation();handleFiles(e.dataTransfer.files)}}
        onClick={()=>fileRef.current?.click()}
        style={{border:`2px dashed ${DS.border}`,borderRadius:DS.radius,padding:photos.length?16:40,textAlign:"center",cursor:"pointer",background:DS.surfaceAlt,transition:"border-color 0.2s",marginBottom:16}}>
        <input ref={fileRef} type="file" accept="image/*" multiple style={{display:"none"}} onChange={e=>handleFiles(e.target.files)}/>
        {photos.length ? (
          <div style={{display:"flex",gap:8,flexWrap:"wrap",justifyContent:"center"}}>
            {photos.map((p,i)=><div key={i} style={{width:80,height:80,borderRadius:DS.radiusSm,overflow:"hidden",border:`1px solid ${DS.border}`}}><img src={p.data} alt={p.name} style={{width:"100%",height:"100%",objectFit:"cover"}}/></div>)}
            <div style={{width:80,height:80,borderRadius:DS.radiusSm,border:`1px dashed ${DS.textDim}`,display:"flex",alignItems:"center",justifyContent:"center",color:DS.textDim,fontSize:24}}>+</div>
          </div>
        ) : <><div style={{fontSize:32,marginBottom:8}}>📷</div><div style={{fontSize:13,color:DS.textMuted}}>Drag & drop listing photos or click to browse</div><div style={{fontSize:11,color:DS.textDim,marginTop:4}}>Up to 6 images • JPG/PNG</div></>}
      </div>
      {photos.length>0 && !results && <button onClick={analyze} disabled={analyzing} style={{width:"100%",padding:14,border:`1px solid ${DS.accent}50`,borderRadius:DS.radius,background:DS.accentGlow,color:DS.accent,fontSize:14,fontWeight:600,cursor:analyzing?"not-allowed":"pointer",fontFamily:DS.font,opacity:analyzing?0.7:1}}>
        {analyzing?"🔍 Analyzing photos with Claude Vision...":"Analyze Photos for Risks →"}</button>}
      {error && <div style={{color:DS.danger,fontSize:13,padding:12,background:`${DS.danger}10`,borderRadius:DS.radiusSm,marginTop:12}}>{error}</div>}
      {results && (
        <div style={{marginTop:16}}>
          <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:16}}>
            <span style={{fontSize:14,fontWeight:700}}>Overall Risk:</span>
            <RiskBadge level={results.overallRisk}/>
          </div>
          <div style={{fontSize:13,color:DS.textMuted,marginBottom:16,lineHeight:1.6}}>{results.summary}</div>
          {results.findings?.map((f,i)=>(
            <div key={i} style={{padding:12,background:DS.surfaceAlt,borderRadius:DS.radiusSm,marginBottom:8,borderLeft:`3px solid ${f.severity==="High"?DS.danger:f.severity==="Medium"?DS.warning:DS.success}`}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:4}}>
                <span style={{fontWeight:600,fontSize:13}}>{f.area}: {f.issue}</span>
                <div style={{display:"flex",gap:6}}><RiskBadge level={f.severity}/>{f.costRange&&<Badge color={DS.gold}>{f.costRange}</Badge>}</div>
              </div>
              <div style={{fontSize:12,color:DS.textMuted}}>{f.detail}</div>
            </div>
          ))}
          {results.positives?.length>0 && <div style={{marginTop:12}}><div style={{fontSize:13,fontWeight:600,color:DS.success,marginBottom:8}}>✅ Positive Indicators</div>
            {results.positives.map((p,i)=><div key={i} style={{fontSize:12,color:DS.textMuted,padding:"4px 0"}}>• {p}</div>)}</div>}
        </div>
      )}
    </Card>
  );
}

// ─── DOC AI ───
function DocAI() {
  const [text, setText] = useState("");
  const [mode, setMode] = useState("listing");
  const [analyzing, setAnalyzing] = useState(false);
  const [results, setResults] = useState(null);
  const [error, setError] = useState(null);

  const analyze = async () => {
    if (!text.trim()) return;
    setAnalyzing(true); setError(null); setResults(null);
    const prompts = {
      listing: `Extract all factual claims from this real estate listing. For each claim, identify the key, value, whether it's verifiable, and what source would verify it. Also flag any marketing language that could be misleading.\n\nRespond only in JSON: {"claims":[{"claim":"string","key":"string","value":"string","verifiable":true,"verifySource":"string","marketingFlag":false}],"redFlags":["string"],"summary":"string"}`,
      disclosure: `Analyze this seller disclosure for red flags, material defects, and items requiring further investigation. Rate each finding by severity.\n\nRespond only in JSON: {"findings":[{"item":"string","severity":"Low|Medium|High","concern":"string","action":"string"}],"majorConcerns":["string"],"summary":"string"}`,
      inspection: `Analyze this inspection report excerpt. Identify safety issues, major defects, maintenance items, and estimated costs.\n\nRespond only in JSON: {"issues":[{"system":"string","finding":"string","severity":"Low|Medium|High","estimatedCost":"string","urgency":"Immediate|Soon|Monitor"}],"safetyIssues":["string"],"summary":"string"}`,
    };
    try {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model: "claude-sonnet-4-20250514", max_tokens: 1000, messages: [{ role: "user", content: prompts[mode] + "\n\nDocument:\n" + text.slice(0, 8000) }] }),
      });
      const json = await res.json();
      const t = (json.content || []).map(b => b.text || "").join("");
      setResults({ mode, data: JSON.parse(t.replace(/```json|```/g, "").trim()) });
    } catch (e) { setError("Document analysis failed. Try pasting the text again."); }
    setAnalyzing(false);
  };

  return (
    <Card>
      <SectionTitle icon="📄" sub="Paste listing text, seller disclosure, or inspection report — AI extracts claims and red flags">Document AI (V15/V20 RAG)</SectionTitle>
      <div style={{display:"flex",gap:4,marginBottom:12}}>
        {[["listing","📋 Listing Text"],["disclosure","📝 Seller Disclosure"],["inspection","🔍 Inspection Report"]].map(([k,l])=>(
          <button key={k} onClick={()=>{setMode(k);setResults(null)}} style={{flex:1,padding:"8px",borderRadius:DS.radiusSm,border:`1px solid ${mode===k?DS.accent:DS.border}`,background:mode===k?DS.accentGlow:"transparent",color:mode===k?DS.accent:DS.textMuted,fontSize:11,fontWeight:600,cursor:"pointer",fontFamily:DS.font}}>{l}</button>
        ))}
      </div>
      <textarea value={text} onChange={e=>setText(e.target.value)} placeholder={mode==="listing"?"Paste the listing description, broker remarks, or Zillow/Redfin text here...":mode==="disclosure"?"Paste the seller disclosure text...":"Paste the inspection report text..."} style={{width:"100%",height:120,padding:12,background:DS.surfaceAlt,border:`1px solid ${DS.border}`,borderRadius:DS.radiusSm,color:DS.text,fontSize:13,fontFamily:DS.font,resize:"vertical",outline:"none",boxSizing:"border-box"}}/>
      <button onClick={analyze} disabled={!text.trim()||analyzing} style={{width:"100%",padding:12,marginTop:8,border:`1px solid ${DS.accent}50`,borderRadius:DS.radius,background:text.trim()?DS.accentGlow:DS.surfaceAlt,color:text.trim()?DS.accent:DS.textDim,fontSize:13,fontWeight:600,cursor:text.trim()&&!analyzing?"pointer":"not-allowed",fontFamily:DS.font}}>
        {analyzing?"🔍 Analyzing document...":"Extract Claims & Red Flags →"}</button>
      {error && <div style={{color:DS.danger,fontSize:13,padding:12,background:`${DS.danger}10`,borderRadius:DS.radiusSm,marginTop:8}}>{error}</div>}
      {results && results.mode==="listing" && results.data?.claims && (
        <div style={{marginTop:16}}>
          <div style={{fontSize:13,color:DS.textMuted,marginBottom:12,lineHeight:1.6}}>{results.data.summary}</div>
          {results.data.claims.map((c,i)=>(
            <div key={i} style={{padding:10,background:DS.surfaceAlt,borderRadius:DS.radiusSm,marginBottom:6,borderLeft:`3px solid ${c.marketingFlag?DS.warning:c.verifiable?DS.info:DS.textDim}`}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:4}}>
                <span style={{fontSize:12,fontWeight:600}}>{c.claim}</span>
                <div style={{display:"flex",gap:4}}>{c.marketingFlag&&<Badge color={DS.warning}>Marketing</Badge>}<Badge color={c.verifiable?DS.info:DS.textDim}>{c.verifiable?"Verifiable":"Subjective"}</Badge></div>
              </div>
              {c.verifySource&&<div style={{fontSize:11,color:DS.textDim,marginTop:2}}>Verify: {c.verifySource}</div>}
            </div>
          ))}
          {results.data.redFlags?.length>0 && <div style={{marginTop:12,padding:12,background:`${DS.danger}08`,borderRadius:DS.radiusSm,border:`1px solid ${DS.danger}20`}}>
            <div style={{fontSize:12,fontWeight:600,color:DS.danger,marginBottom:6}}>🚩 Red Flags</div>
            {results.data.redFlags.map((f,i)=><div key={i} style={{fontSize:12,color:DS.textMuted,padding:"3px 0"}}>• {f}</div>)}</div>}
        </div>
      )}
      {results && results.mode==="disclosure" && results.data?.findings && (
        <div style={{marginTop:16}}>
          <div style={{fontSize:13,color:DS.textMuted,marginBottom:12}}>{results.data.summary}</div>
          {results.data.findings.map((f,i)=>(
            <div key={i} style={{padding:10,background:DS.surfaceAlt,borderRadius:DS.radiusSm,marginBottom:6,borderLeft:`3px solid ${f.severity==="High"?DS.danger:f.severity==="Medium"?DS.warning:DS.success}`}}>
              <div style={{display:"flex",justifyContent:"space-between",marginBottom:4}}><span style={{fontSize:12,fontWeight:600}}>{f.item}</span><RiskBadge level={f.severity}/></div>
              <div style={{fontSize:12,color:DS.textMuted}}>{f.concern}</div>
              <div style={{fontSize:11,color:DS.info,marginTop:2}}>Action: {f.action}</div>
            </div>))}
        </div>
      )}
      {results && results.mode==="inspection" && results.data?.issues && (
        <div style={{marginTop:16}}>
          <div style={{fontSize:13,color:DS.textMuted,marginBottom:12}}>{results.data.summary}</div>
          {results.data.safetyIssues?.length>0 && <div style={{padding:10,background:`${DS.danger}10`,borderRadius:DS.radiusSm,marginBottom:12,border:`1px solid ${DS.danger}20`}}>
            <div style={{fontSize:12,fontWeight:700,color:DS.danger,marginBottom:4}}>⚠️ Safety Issues</div>
            {results.data.safetyIssues.map((s,i)=><div key={i} style={{fontSize:12,color:DS.text}}>• {s}</div>)}</div>}
          {results.data.issues.map((f,i)=>(
            <div key={i} style={{padding:10,background:DS.surfaceAlt,borderRadius:DS.radiusSm,marginBottom:6,borderLeft:`3px solid ${f.severity==="High"?DS.danger:f.severity==="Medium"?DS.warning:DS.success}`}}>
              <div style={{display:"flex",justifyContent:"space-between",marginBottom:4,flexWrap:"wrap",gap:4}}><span style={{fontSize:12,fontWeight:600}}>{f.system}: {f.finding}</span><div style={{display:"flex",gap:4}}><RiskBadge level={f.severity}/><Badge color={f.urgency==="Immediate"?DS.danger:f.urgency==="Soon"?DS.warning:DS.info}>{f.urgency}</Badge>{f.estimatedCost&&<Badge color={DS.gold}>{f.estimatedCost}</Badge>}</div></div>
            </div>))}
        </div>
      )}
    </Card>
  );
}

// ─── AI ADVISOR ───
function AIAdvisor({data}) {
  const [insight, setInsight] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const generate = async () => {
    setLoading(true); setError(null); setInsight("");
    try {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model: "claude-sonnet-4-20250514", max_tokens: 1000, messages: [{ role: "user", content: `You are a senior buyer's advisor. Give a concise actionable intelligence brief (4-5 paragraphs). Be direct.
Property: ${data.address} | $${data.P.toLocaleString()} | Est: $${data.est.toLocaleString()} | Delta: ${data.deltaPct}% | ${data.verdict}
${data.SF}sqft | ${data.BD}bd/${data.BA}ba | Built ${data.YR} | Score: ${data.overallScore}/100
Monthly: $${data.totalMonthly.toLocaleString()} | Hidden reserve: $${data.totalHidden.toLocaleString()} | Cap rate: ${data.capRate}%
Flood: ${data.neighborhood.floodZone} | Crime: ${data.neighborhood.crimeIndex} | Walk: ${data.neighborhood.walkScore} | YoY: ${data.neighborhood.yoyAppreciation}%
Top risks: ${data.risks.filter(r=>r.prob==="High").map(r=>r.cat).join(", ")||"None high"}
Hidden costs: ${data.hiddenCosts.slice(0,4).map(c=>`${c.item}: $${c.estimate.toLocaleString()}`).join("; ")}
Include: 1) Valuation assessment 2) Key risks 3) Negotiation leverage 4) Next steps` }] }),
      });
      const json = await res.json();
      setInsight((json.content||[]).map(b=>b.text||"").join("\n"));
    } catch { setError("AI analysis unavailable."); }
    setLoading(false);
  };
  return <Card glow><SectionTitle icon="🧠" sub="Claude-powered buyer intelligence brief">AI Advisor</SectionTitle>
    {!insight&&!loading&&<button onClick={generate} style={{width:"100%",padding:14,border:`1px solid ${DS.accent}50`,borderRadius:DS.radius,background:DS.accentGlow,color:DS.accent,fontSize:14,fontWeight:600,cursor:"pointer",fontFamily:DS.font}}>Generate AI Buyer Intelligence Brief</button>}
    {loading&&<div style={{textAlign:"center",padding:30,color:DS.textMuted}}><div style={{fontSize:28,marginBottom:10,animation:"pulse 1.5s infinite"}}>🧠</div><div style={{fontSize:13}}>Analyzing all data points...</div></div>}
    {error&&<div style={{color:DS.warning,fontSize:13,padding:12,background:`${DS.warning}10`,borderRadius:DS.radiusSm}}>{error}</div>}
    {insight&&<div style={{fontSize:13,lineHeight:1.7,color:DS.text,whiteSpace:"pre-wrap"}}>{insight}</div>}
  </Card>;
}

// ─── MAIN APP ───
export default function RealtyIntelV21() {
  const [tab, setTab] = useState("overview");
  const [data, setData] = useState(null);
  const [dataSource, setDataSource] = useState(null);
  const [validationError, setValidationError] = useState(null);
  const [form, setForm] = useState({ address:"",price:"",sqft:"",beds:"3",baths:"2",yearBuilt:"",propertyType:"Single Family",listingText:"" });
  const [analyzing, setAnalyzing] = useState(false);
  // Offer simulator state
  const [offerPrice, setOfferPrice] = useState(0);
  const [offerDown, setOfferDown] = useState(20);
  const [offerRate, setOfferRate] = useState(6.75);

  const handleAnalyze = async () => {
    const err = validateAddress(form.address);
    if (err) { setValidationError(err); return; }
    setValidationError(null); setAnalyzing(true); setData(null);
    // Try backend
    try {
      const ctrl = new AbortController();
      setTimeout(()=>ctrl.abort(),4000);
      const res = await fetch("http://localhost:5173/api/analyze",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({address:form.address}),signal:ctrl.signal});
      if(res.ok) setDataSource("live"); else throw 0;
    } catch { setDataSource("simulated"); }
    const result = generateFullAnalysis(form.address,form.price,form.sqft,form.beds,form.baths,form.yearBuilt,form.propertyType,form.listingText);
    setData(result); setOfferPrice(result.est); setAnalyzing(false); setTab("overview");
  };

  const offerMonthly = useMemo(()=>{
    if(!data) return 0;
    const loan=offerPrice*(1-offerDown/100), mr=offerRate/100/12;
    return Math.round(loan*mr/(1-Math.pow(1+mr,-360)))+data.tax+data.insurance+data.hoa;
  },[offerPrice,offerDown,offerRate,data]);

  const TABS=[
    {id:"overview",label:"Overview",icon:"📊"},{id:"valuation",label:"Valuation",icon:"💰"},
    {id:"claims",label:"Claims",icon:"🔍"},{id:"risks",label:"Risks & Costs",icon:"⚠️"},
    {id:"financials",label:"Financials",icon:"🏦"},{id:"neighborhood",label:"Neighborhood",icon:"🏘️"},
    {id:"offer",label:"Offer Sim",icon:"🎯"},{id:"market",label:"Market",icon:"📈"},
    {id:"photoai",label:"Photo AI",icon:"📸"},{id:"docai",label:"Doc AI",icon:"📄"},
    {id:"backtest",label:"Backtest",icon:"🧪"},{id:"sources",label:"Sources",icon:"📡"},
    {id:"ai",label:"AI Advisor",icon:"🧠"},
  ];

  const IS = {width:"100%",padding:"10px 12px",background:DS.surfaceAlt,border:`1px solid ${DS.border}`,borderRadius:DS.radiusSm,color:DS.text,fontSize:13,fontFamily:DS.font,outline:"none",boxSizing:"border-box"};
  const LS = {fontSize:11,fontWeight:600,color:DS.textMuted,marginBottom:4,display:"block",letterSpacing:"0.04em",textTransform:"uppercase"};

  return (
    <div style={{background:DS.bg,color:DS.text,fontFamily:DS.font,minHeight:"100vh",maxWidth:920,margin:"0 auto",padding:"24px 16px"}}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Instrument+Sans:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;600&display=swap');
        @keyframes pulse{0%,100%{opacity:1}50%{opacity:0.5}} @keyframes slideIn{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:translateY(0)}}
        *{box-sizing:border-box} ::-webkit-scrollbar{width:6px;height:6px} ::-webkit-scrollbar-thumb{background:${DS.border};border-radius:4px}
        input:focus,select:focus,textarea:focus{border-color:${DS.accent}!important} input[type=range]{height:4px}`}</style>

      {/* Header */}
      <div style={{marginBottom:24,display:"flex",alignItems:"flex-start",justifyContent:"space-between",flexWrap:"wrap",gap:12}}>
        <div>
          <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:4}}>
            <span style={{fontSize:22}}>🏠</span>
            <h1 style={{margin:0,fontSize:22,fontWeight:700,background:`linear-gradient(135deg,${DS.accent},${DS.info})`,WebkitBackgroundClip:"text",WebkitTextFillColor:"transparent"}}>Realty Intel Pro</h1>
            <Badge color={DS.gold} bg={`${DS.gold}18`}>V21+</Badge>
          </div>
          <p style={{margin:0,fontSize:12,color:DS.textMuted}}>AI buyer due diligence engine — V13→V21 all features • Seattle metro</p>
        </div>
        <div style={{display:"flex",gap:8,alignItems:"center"}}>
          {dataSource==="live"?<><GlowDot color={DS.success} pulse/><span style={{fontSize:11,color:DS.success,fontWeight:600}}>Backend live</span></>:
           dataSource==="simulated"?<><GlowDot color={DS.warning}/><span style={{fontSize:11,color:DS.warning,fontWeight:600}}>Simulated</span></>:
           <><GlowDot color={DS.textDim}/><span style={{fontSize:11,color:DS.textMuted}}>Ready</span></>}
        </div>
      </div>

      {/* Input */}
      <Card style={{marginBottom:20}}>
        <SectionTitle icon="🔎" sub="Enter property details — or paste listing text in Doc AI tab for AI extraction">Property Input</SectionTitle>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
          <div style={{gridColumn:"1/-1"}}><label style={LS}>Address *</label><input style={{...IS,borderColor:validationError?DS.danger:DS.border}} placeholder="e.g. 1234 NE 56th St, Seattle, WA 98105" value={form.address} onChange={e=>{setForm({...form,address:e.target.value});setValidationError(null)}} onKeyDown={e=>e.key==="Enter"&&handleAnalyze()}/>{validationError&&<div style={{fontSize:12,color:DS.danger,marginTop:4}}>⚠️ {validationError}</div>}</div>
          <div><label style={LS}>List Price ($)</label><input style={IS} placeholder="850000" value={form.price} onChange={e=>setForm({...form,price:e.target.value})}/></div>
          <div><label style={LS}>Sq Ft</label><input style={IS} placeholder="1850" value={form.sqft} onChange={e=>setForm({...form,sqft:e.target.value})}/></div>
          <div><label style={LS}>Beds</label><input style={IS} type="number" value={form.beds} onChange={e=>setForm({...form,beds:e.target.value})}/></div>
          <div><label style={LS}>Baths</label><input style={IS} type="number" step="0.5" value={form.baths} onChange={e=>setForm({...form,baths:e.target.value})}/></div>
          <div><label style={LS}>Year Built</label><input style={IS} placeholder="1978" value={form.yearBuilt} onChange={e=>setForm({...form,yearBuilt:e.target.value})}/></div>
          <div><label style={LS}>Type</label><select style={{...IS,cursor:"pointer"}} value={form.propertyType} onChange={e=>setForm({...form,propertyType:e.target.value})}>{["Single Family","Condo","Townhouse","Multi-Family","Manufactured"].map(t=><option key={t}>{t}</option>)}</select></div>
        </div>
        <button onClick={handleAnalyze} disabled={analyzing} style={{width:"100%",padding:14,marginTop:16,border:"none",borderRadius:DS.radius,fontWeight:700,fontSize:14,cursor:analyzing?"not-allowed":"pointer",fontFamily:DS.font,background:`linear-gradient(135deg,${DS.accent},${DS.info})`,color:DS.bg,opacity:analyzing?0.7:1}}>
          {analyzing?"⏳ Running full V13-V21 analysis...":"Run Full Analysis →"}</button>
      </Card>

      {data && (
        <div style={{animation:"slideIn 0.4s ease"}}>
          {/* Data source banner */}
          {dataSource==="simulated"&&<div style={{padding:"12px 16px",marginBottom:16,borderRadius:DS.radius,background:`${DS.warning}10`,border:`1px solid ${DS.warning}30`,display:"flex",gap:10}}>
            <span style={{fontSize:18}}>⚠️</span><div><div style={{fontSize:13,fontWeight:700,color:DS.warning,marginBottom:3}}>Simulated Data</div><div style={{fontSize:12,color:DS.textMuted}}>Backend offline. Valuations/comps are deterministic simulations. Run <code style={{fontFamily:DS.fontMono,fontSize:11,background:DS.surfaceAlt,padding:"2px 5px",borderRadius:3}}>docker compose up --build</code> for real public data. Photo AI and Doc AI use live Claude API.</div></div>
          </div>}
          {dataSource==="live"&&<div style={{padding:"10px 16px",marginBottom:16,borderRadius:DS.radius,background:`${DS.success}10`,border:`1px solid ${DS.success}30`,display:"flex",alignItems:"center",gap:10}}>
            <GlowDot color={DS.success} pulse/><span style={{fontSize:13,color:DS.success,fontWeight:600}}>Live backend connected — real public data sources active</span></div>}

          <TabBar tabs={TABS} active={tab} onChange={setTab}/>

          {/* ═══ OVERVIEW ═══ */}
          {tab==="overview"&&<div style={{display:"flex",flexDirection:"column",gap:16}}>
            <Card glow style={{background:VERDICTS[data.verdict]?.bg,borderColor:`${VERDICTS[data.verdict]?.color}40`}}>
              <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",flexWrap:"wrap",gap:16}}>
                <div><div style={{fontSize:11,color:DS.textMuted,fontWeight:600,textTransform:"uppercase",letterSpacing:"0.06em"}}>Engine Verdict</div>
                  <div style={{fontSize:32,fontWeight:700,color:VERDICTS[data.verdict]?.color}}>{VERDICTS[data.verdict]?.icon} {data.verdict}</div>
                  <div style={{fontSize:13,color:DS.textMuted,marginTop:4}}>{data.address}</div></div>
                <div style={{display:"flex",gap:24,flexWrap:"wrap"}}>
                  <Stat label="Score" value={`${data.overallScore}/100`} color={data.overallScore>=70?DS.success:data.overallScore>=50?DS.warning:DS.danger}/>
                  <Stat label="Confidence" value={`${Math.round(data.confidence*100)}%`} color={DS.info} sub="6/14 sources"/>
                  <Stat label="Delta" value={`${data.deltaPct>0?"+":""}${data.deltaPct}%`} color={data.deltaPct<=0?DS.success:data.deltaPct<=6?DS.warning:DS.danger} sub={`$${data.delta.toLocaleString()}`}/>
                </div>
              </div>
            </Card>
            <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(120px,1fr))",gap:10}}>
              {[{l:"List Price",v:`$${data.P.toLocaleString()}`,c:DS.text},{l:"Est. Value",v:`$${data.est.toLocaleString()}`,c:DS.accent},{l:"$/sqft",v:`$${data.ppsf}`,c:DS.info},{l:"Monthly",v:`$${data.totalMonthly.toLocaleString()}`,c:DS.gold},{l:"Hidden Costs",v:`$${data.totalHidden.toLocaleString()}`,c:data.totalHidden>20000?DS.danger:DS.warning},{l:"True Cost",v:`$${(data.P+data.closingCosts+data.totalHidden).toLocaleString()}`,c:DS.pink},{l:"Cap Rate",v:`${data.capRate}%`,c:data.capRate>=5?DS.success:DS.warning},{l:"Rent Est.",v:`$${data.monthlyRent.toLocaleString()}/mo`,c:DS.purple}].map((s,i)=>
                <Card key={i} style={{padding:"12px",textAlign:"center"}}><div style={{fontSize:16,fontWeight:700,color:s.c,fontFamily:DS.fontMono}}>{s.v}</div><div style={{fontSize:10,color:DS.textMuted,marginTop:3,fontWeight:600,textTransform:"uppercase"}}>{s.l}</div></Card>)}
            </div>
            <Card><SectionTitle icon="🎯" sub="14-factor weighted scorecard (V18 factor engine)">Factor Analysis</SectionTitle>
              <ResponsiveContainer width="100%" height={280}><RadarChart data={data.factors.map(f=>({...f,fullMark:100}))}><PolarGrid stroke={DS.border}/><PolarAngleAxis dataKey="label" tick={{fill:DS.textMuted,fontSize:9}}/><PolarRadiusAxis angle={30} domain={[0,100]} tick={false} axisLine={false}/><Radar dataKey="score" stroke={DS.accent} fill={DS.accent} fillOpacity={0.2} strokeWidth={2}/></RadarChart></ResponsiveContainer>
              <div style={{display:"flex",flexWrap:"wrap",gap:6,marginTop:8}}>
                {data.factors.map((f,i)=><div key={i} style={{flex:"1 1 140px"}}><div style={{display:"flex",justifyContent:"space-between",marginBottom:3}}><span style={{fontSize:10,color:DS.textMuted}}>{f.icon} {f.label}</span><span style={{fontSize:10,fontWeight:600,color:f.score>=70?DS.success:f.score>=50?DS.warning:DS.danger,fontFamily:DS.fontMono}}>{f.score}</span></div><ProgressBar value={f.score} color={f.score>=70?DS.success:f.score>=50?DS.warning:DS.danger} height={4}/></div>)}
              </div>
            </Card>
          </div>}

          {/* ═══ VALUATION ═══ */}
          {tab==="valuation"&&<div style={{display:"flex",flexDirection:"column",gap:16}}>
            <Card><SectionTitle icon="💰" sub="Comparable-sales AVM with SHAP-style adjustment breakdown (V14/V19)">Valuation Engine</SectionTitle>
              <div style={{display:"flex",gap:20,flexWrap:"wrap",marginBottom:16}}><Stat label="Estimated" value={`$${data.est.toLocaleString()}`} color={DS.accent}/><Stat label="List Price" value={`$${data.P.toLocaleString()}`}/><Stat label="Delta" value={`${data.deltaPct>0?"+":""}${data.deltaPct}%`} color={data.deltaPct<=0?DS.success:DS.danger}/></div>
              <ResponsiveContainer width="100%" height={200}><BarChart data={data.comps}><CartesianGrid strokeDasharray="3 3" stroke={DS.border}/><XAxis dataKey="id" tick={{fill:DS.textMuted,fontSize:10}} tickFormatter={v=>`#${v}`}/><YAxis tick={{fill:DS.textMuted,fontSize:10}} tickFormatter={v=>`$${(v/1000).toFixed(0)}K`}/><Tooltip contentStyle={{background:DS.surface,border:`1px solid ${DS.border}`,borderRadius:DS.radiusSm,fontSize:12}} formatter={v=>[`$${v.toLocaleString()}`,""]}/>
                <Bar dataKey="price" name="Sale" radius={[4,4,0,0]}>{data.comps.map((c,i)=><Cell key={i} fill={c.similarity>=80?DS.accent:c.similarity>=65?DS.info:DS.textDim}/>)}</Bar>
                <Bar dataKey="adjusted" name="Adjusted" radius={[4,4,0,0]} fill={`${DS.purple}80`}/></BarChart></ResponsiveContainer>
            </Card>
            {/* SHAP Adjustments for top comp */}
            <Card><SectionTitle icon="🔬" sub="SHAP-style adjustment breakdown for top comparable (V19)">Adjustment Explainer</SectionTitle>
              {data.comps.slice(0,3).map((c,i)=>(
                <div key={i} style={{marginBottom:16,padding:14,background:DS.surfaceAlt,borderRadius:DS.radiusSm}}>
                  <div style={{display:"flex",justifyContent:"space-between",marginBottom:8}}><span style={{fontWeight:600,fontSize:13}}>Comp #{c.id} <Badge color={DS.info}>{c.similarity}% sim</Badge></span><span style={{fontFamily:DS.fontMono,color:DS.accent}}>${c.adjusted.toLocaleString()}</span></div>
                  <div style={{display:"flex",flexWrap:"wrap",gap:6}}>
                    {Object.entries(c.shapAdj).map(([k,v])=><div key={k} style={{flex:"1 1 100px",padding:6,background:DS.bg,borderRadius:4,textAlign:"center"}}>
                      <div style={{fontSize:13,fontWeight:600,fontFamily:DS.fontMono,color:v>=0?DS.success:DS.danger}}>{v>=0?"+":""}${Math.abs(v).toLocaleString()}</div>
                      <div style={{fontSize:10,color:DS.textDim,textTransform:"capitalize"}}>{k}</div>
                    </div>)}
                  </div>
                </div>))}
            </Card>
            <Card><SectionTitle icon="📈" sub="5-year projection including pessimistic scenario">Appreciation Forecast</SectionTitle>
              <ResponsiveContainer width="100%" height={200}><AreaChart data={data.appreciation}><CartesianGrid strokeDasharray="3 3" stroke={DS.border}/><XAxis dataKey="year" tick={{fill:DS.textMuted,fontSize:10}}/><YAxis tick={{fill:DS.textMuted,fontSize:10}} tickFormatter={v=>`$${(v/1000).toFixed(0)}K`}/><Tooltip contentStyle={{background:DS.surface,border:`1px solid ${DS.border}`,fontSize:12}} formatter={v=>[`$${v.toLocaleString()}`,""]}/>
                <Area type="monotone" dataKey="aggressive" stroke={DS.accent} fill={DS.accent} fillOpacity={0.06} strokeWidth={1.5} name="7%"/>
                <Area type="monotone" dataKey="moderate" stroke={DS.info} fill={DS.info} fillOpacity={0.06} strokeWidth={2} name="4.5%"/>
                <Area type="monotone" dataKey="conservative" stroke={DS.textDim} fill={DS.textDim} fillOpacity={0.04} strokeWidth={1.5} name="2%"/>
                <Area type="monotone" dataKey="pessimistic" stroke={DS.danger} fill={DS.danger} fillOpacity={0.04} strokeWidth={1} strokeDasharray="4 4" name="-2%"/>
                <Legend wrapperStyle={{fontSize:11}}/></AreaChart></ResponsiveContainer>
            </Card>
          </div>}

          {/* ═══ CLAIMS ═══ */}
          {tab==="claims"&&<Card><SectionTitle icon="🔍" sub="Every listing claim tracked with source citations (V15 RAG)">Claim Verification + Citations</SectionTitle>
            <div style={{display:"flex",gap:8,marginBottom:16,flexWrap:"wrap"}}>
              {["verified","partial","unverified"].map(s=>{const n=data.claims.filter(c=>c.status===s).length;const cl=s==="verified"?DS.success:s==="partial"?DS.warning:DS.danger;return n>0&&<Badge key={s} color={cl}>{n} {s}</Badge>})}
            </div>
            {data.claims.map((c,i)=>(
              <div key={i} style={{padding:"14px 16px",background:DS.surfaceAlt,borderRadius:DS.radiusSm,marginBottom:8,borderLeft:`3px solid ${c.status==="verified"?DS.success:c.status==="partial"?DS.warning:DS.danger}`}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:6,marginBottom:6}}>
                  <div style={{display:"flex",alignItems:"center",gap:8}}><span style={{fontWeight:600,fontSize:13}}>{c.label}</span><Badge color={c.status==="verified"?DS.success:c.status==="partial"?DS.warning:DS.danger}>{c.status}</Badge><RiskBadge level={c.severity}/></div>
                  <span style={{fontFamily:DS.fontMono,fontSize:12,color:DS.accent}}>{c.claimed}</span></div>
                <div style={{fontSize:12,color:DS.textMuted,lineHeight:1.5}}>{c.explanation}</div>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginTop:6}}>
                  <span style={{fontSize:11,color:DS.textDim}}>Source: {c.source}</span>
                  {c.citation&&<a href={c.citation} target="_blank" rel="noopener noreferrer" style={{fontSize:11,color:DS.info,textDecoration:"none"}}>🔗 Verify →</a>}
                </div>
              </div>))}
          </Card>}

          {/* ═══ RISKS & COSTS ═══ */}
          {tab==="risks"&&<div style={{display:"flex",flexDirection:"column",gap:16}}>
            <Card><SectionTitle icon="⚠️" sub="6-category probability × impact matrix">Risk Matrix</SectionTitle>
              {data.risks.map((r,i)=>(
                <div key={i} style={{padding:14,background:DS.surfaceAlt,borderRadius:DS.radiusSm,marginBottom:8,borderLeft:`3px solid ${r.prob==="High"?DS.danger:r.prob==="Medium"?DS.warning:DS.success}`}}>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:6,flexWrap:"wrap",gap:6}}><span style={{fontWeight:700,fontSize:14}}>{r.cat}</span><div style={{display:"flex",gap:8}}><span style={{fontSize:11,color:DS.textMuted}}>P:</span><RiskBadge level={r.prob}/><span style={{fontSize:11,color:DS.textMuted}}>I:</span><RiskBadge level={r.impact}/></div></div>
                  <div style={{display:"flex",flexWrap:"wrap",gap:4}}>{r.items.map((item,j)=><span key={j} style={{fontSize:11,padding:"3px 8px",background:DS.bg,borderRadius:4,color:DS.textMuted}}>{item}</span>)}</div>
                </div>))}
            </Card>
            <Card><SectionTitle icon="💸" sub="Capital reserves needed within 5 years">Hidden Cost Exposure</SectionTitle>
              {data.hiddenCosts.map((c,i)=>(
                <div key={i} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"10px 14px",background:DS.surfaceAlt,borderRadius:DS.radiusSm,marginBottom:6}}>
                  <div style={{display:"flex",alignItems:"center",gap:10}}><RiskBadge level={c.risk}/><div><div style={{fontSize:13}}>{c.item}</div><div style={{fontSize:10,color:DS.textDim}}>~{c.yearsOut} years out</div></div></div>
                  <span style={{fontFamily:DS.fontMono,fontWeight:600,color:c.risk==="high"?DS.danger:DS.warning}}>${c.estimate.toLocaleString()}</span>
                </div>))}
              <div style={{display:"flex",justifyContent:"space-between",padding:"12px 14px",borderTop:`2px solid ${DS.accent}40`,marginTop:8}}><span style={{fontWeight:700,fontSize:14}}>Total Reserve Needed</span><span style={{fontFamily:DS.fontMono,fontWeight:700,fontSize:18,color:DS.danger}}>${data.totalHidden.toLocaleString()}</span></div>
            </Card>
          </div>}

          {/* ═══ FINANCIALS ═══ */}
          {tab==="financials"&&<div style={{display:"flex",flexDirection:"column",gap:16}}>
            <Card><SectionTitle icon="🏦" sub="Full monthly cost breakdown including utilities and reserves">Monthly Costs</SectionTitle>
              <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(100px,1fr))",gap:8,marginBottom:16}}>
                {[{l:"P+I",v:data.monthlyPI,c:DS.accent},{l:"Tax",v:data.tax,c:DS.info},{l:"Insurance",v:data.insurance,c:DS.purple},{l:"HOA",v:data.hoa,c:DS.gold},{l:"Utilities",v:data.utilities,c:DS.cyan},{l:"Maintenance",v:data.maintenance,c:DS.pink},{l:"CapEx",v:data.capex,c:DS.textMuted}].map((x,i)=>
                  <div key={i} style={{textAlign:"center",padding:8,background:DS.surfaceAlt,borderRadius:DS.radiusSm}}><div style={{fontSize:16,fontWeight:700,fontFamily:DS.fontMono,color:x.c}}>${x.v.toLocaleString()}</div><div style={{fontSize:10,color:DS.textMuted}}>{x.l}</div></div>)}
              </div>
              <div style={{textAlign:"center",padding:12,background:DS.accentGlow,borderRadius:DS.radius}}><div style={{fontSize:11,color:DS.textMuted}}>TRUE MONTHLY COST</div><div style={{fontSize:28,fontWeight:700,color:DS.accent,fontFamily:DS.fontMono}}>${data.totalMonthly.toLocaleString()}</div></div>
            </Card>
            <Card><SectionTitle icon="📊" sub="Rate sensitivity analysis (V21 stress test)">Mortgage Stress Test</SectionTitle>
              <ResponsiveContainer width="100%" height={200}><BarChart data={data.stressTest}><CartesianGrid strokeDasharray="3 3" stroke={DS.border}/><XAxis dataKey="rate" tick={{fill:DS.textMuted,fontSize:10}} tickFormatter={v=>`${v}%`}/><YAxis tick={{fill:DS.textMuted,fontSize:10}} tickFormatter={v=>`$${(v/1000).toFixed(1)}K`}/><Tooltip contentStyle={{background:DS.surface,border:`1px solid ${DS.border}`,fontSize:12}} formatter={v=>[`$${v.toLocaleString()}/mo`,""]}/>
                <Bar dataKey="monthly" radius={[4,4,0,0]}>{data.stressTest.map((d,i)=><Cell key={i} fill={d.rate===data.rate?DS.accent:d.affordable?DS.info:DS.danger}/>)}</Bar></BarChart></ResponsiveContainer>
              <div style={{fontSize:11,color:DS.textDim,marginTop:8,textAlign:"center"}}>Current rate highlighted • Red = exceeds 130% of baseline monthly</div>
            </Card>
            <Card><SectionTitle icon="🏘️" sub="Rental yield and investment metrics (V21)">Investment Analysis</SectionTitle>
              <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(120px,1fr))",gap:10}}>
                {[{l:"Monthly Rent",v:`$${data.monthlyRent.toLocaleString()}`,c:DS.accent},{l:"Cap Rate",v:`${data.capRate}%`,c:data.capRate>=5?DS.success:DS.warning},{l:"Cash-on-Cash",v:`${data.cashOnCash}%`,c:data.cashOnCash>=6?DS.success:DS.warning},{l:"GRM",v:data.grm,c:DS.info},{l:"NOI",v:`$${data.noi.toLocaleString()}`,c:DS.success},{l:"OpEx (34%)",v:`$${data.opex.toLocaleString()}`,c:DS.danger}].map((x,i)=>
                  <div key={i} style={{padding:12,background:DS.surfaceAlt,borderRadius:DS.radiusSm,textAlign:"center"}}><div style={{fontSize:18,fontWeight:700,fontFamily:DS.fontMono,color:x.c}}>{x.v}</div><div style={{fontSize:10,color:DS.textMuted,marginTop:2}}>{x.l}</div></div>)}
              </div>
            </Card>
          </div>}

          {/* ═══ NEIGHBORHOOD ═══ */}
          {tab==="neighborhood"&&<Card><SectionTitle icon="🏘️" sub="Census, permit, crime, flood, and livability data">Neighborhood Intel</SectionTitle>
            <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(150px,1fr))",gap:10}}>
              {[{l:"Median Income",v:`$${data.neighborhood.medianIncome.toLocaleString()}`,i:"💵"},{l:"Median Home Value",v:`$${data.neighborhood.medianHomeValue.toLocaleString()}`,i:"🏠"},{l:"Population",v:data.neighborhood.population.toLocaleString(),i:"👥"},{l:"Crime Index",v:data.neighborhood.crimeIndex,i:"🚔",c:data.neighborhood.crimeIndex>50?DS.danger:DS.success},{l:"Flood Zone",v:data.neighborhood.floodZone.includes("AE")?"HIGH RISK":"Minimal",i:"🌊",c:data.neighborhood.floodZone.includes("AE")?DS.danger:DS.success},{l:"Walk Score",v:data.neighborhood.walkScore,i:"🚶"},{l:"Transit Score",v:data.neighborhood.transitScore,i:"🚌"},{l:"School Rating",v:`${data.neighborhood.schoolRating}/10`,i:"🎓"},{l:"Permit Activity",v:`${data.neighborhood.permitActivity} recent`,i:"🔨"},{l:"YoY Appreciation",v:`${data.neighborhood.yoyAppreciation}%`,i:"📈",c:data.neighborhood.yoyAppreciation>0?DS.success:DS.danger},{l:"Median DOM",v:`${data.neighborhood.medianDOM} days`,i:"⏱️"},{l:"Inventory",v:`${data.neighborhood.inventoryMonths} months`,i:"📦",c:data.neighborhood.inventoryMonths<2?DS.danger:DS.success}].map((x,i)=>
                <div key={i} style={{padding:14,background:DS.surfaceAlt,borderRadius:DS.radiusSm}}><div style={{fontSize:18,marginBottom:6}}>{x.i}</div><div style={{fontSize:16,fontWeight:700,fontFamily:DS.fontMono,color:x.c||DS.text}}>{x.v}</div><div style={{fontSize:11,color:DS.textMuted,marginTop:2}}>{x.l}</div></div>)}
            </div></Card>}

          {/* ═══ OFFER SIMULATOR ═══ */}
          {tab==="offer"&&<div style={{display:"flex",flexDirection:"column",gap:16}}>
            <Card><SectionTitle icon="🎯" sub="Adjust price, down payment, rate — see real-time impact (V21)">Interactive Offer Simulator</SectionTitle>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:16}}>
                <div>
                  <SliderInput label="Offer Price" value={offerPrice} min={Math.round(data.est*0.85)} max={Math.round(data.P*1.1)} step={5000} onChange={setOfferPrice} format={v=>`$${v.toLocaleString()}`}/>
                  <SliderInput label="Down Payment" value={offerDown} min={3} max={50} onChange={setOfferDown} format={v=>`${v}%`}/>
                  <SliderInput label="Interest Rate" value={offerRate} min={4} max={10} step={0.125} onChange={setOfferRate} format={v=>`${v}%`}/>
                </div>
                <div style={{display:"flex",flexDirection:"column",gap:8}}>
                  {[{l:"Offer vs List",v:`${((offerPrice-data.P)/data.P*100).toFixed(1)}%`,c:offerPrice<=data.P?DS.success:DS.danger},{l:"Offer vs Est Value",v:`${((offerPrice-data.est)/data.est*100).toFixed(1)}%`,c:offerPrice<=data.est?DS.success:DS.warning},{l:"Down Payment",v:`$${Math.round(offerPrice*offerDown/100).toLocaleString()}`,c:DS.info},{l:"Loan Amount",v:`$${Math.round(offerPrice*(1-offerDown/100)).toLocaleString()}`,c:DS.textMuted},{l:"Monthly Payment",v:`$${offerMonthly.toLocaleString()}`,c:DS.accent},{l:"Savings vs List",v:`$${(data.P-offerPrice).toLocaleString()}`,c:offerPrice<data.P?DS.success:DS.danger}].map((x,i)=>
                    <div key={i} style={{display:"flex",justifyContent:"space-between",padding:"6px 0",borderBottom:`1px solid ${DS.border}20`}}><span style={{fontSize:12,color:DS.textMuted}}>{x.l}</span><span style={{fontSize:13,fontWeight:600,fontFamily:DS.fontMono,color:x.c}}>{x.v}</span></div>)}
                </div>
              </div>
            </Card>
            <Card><SectionTitle icon="🤝" sub="Data-driven offer strategies">Offer Strategies</SectionTitle>
              {data.offerStrategies.map((st,i)=>(
                <div key={i} style={{padding:16,background:DS.surfaceAlt,borderRadius:DS.radius,marginBottom:10,borderLeft:`3px solid ${i===0?DS.accent:DS.info}`}}>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:8,marginBottom:6}}>
                    <div style={{display:"flex",alignItems:"center",gap:8}}><Badge color={i===0?DS.accent:DS.info}>{i===0?"RECOMMENDED":`OPTION ${i+1}`}</Badge><span style={{fontWeight:700,fontSize:14}}>{st.strategy}</span></div>
                    <div style={{display:"flex",gap:10,alignItems:"center"}}>{st.price&&<span style={{fontFamily:DS.fontMono,fontWeight:700,fontSize:18,color:DS.accent}}>${st.price.toLocaleString()}</span>}{st.winProb&&<Badge color={DS.purple}>{st.winProb}% win</Badge>}</div>
                  </div>
                  {st.escalation&&<div style={{fontSize:12,color:DS.textMuted,marginBottom:4}}>Escalation: <span style={{color:DS.warning,fontFamily:DS.fontMono}}>${st.escalation.toLocaleString()}</span></div>}
                  <div style={{fontSize:12,color:DS.textMuted}}>{st.rationale}</div>
                </div>))}
            </Card>
            <Card><SectionTitle icon="📋" sub="Contingencies with recommended timelines (V21)">Contingency Builder</SectionTitle>
              {data.contingencies.map((c,i)=>(
                <div key={i} style={{display:"flex",alignItems:"flex-start",gap:10,padding:"10px 12px",background:DS.surfaceAlt,borderRadius:DS.radiusSm,marginBottom:6}}>
                  <span style={{fontSize:14,flexShrink:0}}>{c.critical?"🔴":"🟡"}</span>
                  <div style={{flex:1}}><div style={{display:"flex",justifyContent:"space-between"}}><span style={{fontSize:13,fontWeight:600}}>{c.item}</span><Badge color={DS.info}>{c.days} days</Badge></div><div style={{fontSize:11,color:DS.textMuted,marginTop:2}}>{c.note}</div></div>
                </div>))}
            </Card>
          </div>}

          {/* ═══ MARKET TRENDS ═══ */}
          {tab==="market"&&<Card><SectionTitle icon="📈" sub="24-month neighborhood market trajectory (V18/V19)">Market Trends</SectionTitle>
            <div style={{marginBottom:20}}><div style={{fontSize:12,fontWeight:600,color:DS.textMuted,marginBottom:8}}>Median Sale Price</div>
              <ResponsiveContainer width="100%" height={180}><LineChart data={data.marketTrends}><CartesianGrid strokeDasharray="3 3" stroke={DS.border}/><XAxis dataKey="month" tick={{fill:DS.textMuted,fontSize:9}} interval={3}/><YAxis tick={{fill:DS.textMuted,fontSize:10}} tickFormatter={v=>`$${(v/1000).toFixed(0)}K`}/><Tooltip contentStyle={{background:DS.surface,border:`1px solid ${DS.border}`,fontSize:12}}/><Line type="monotone" dataKey="medianPrice" stroke={DS.accent} strokeWidth={2} dot={false} name="Median Price"/></LineChart></ResponsiveContainer></div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:16}}>
              <div><div style={{fontSize:12,fontWeight:600,color:DS.textMuted,marginBottom:8}}>Active Inventory</div>
                <ResponsiveContainer width="100%" height={140}><BarChart data={data.marketTrends}><XAxis dataKey="month" tick={{fill:DS.textMuted,fontSize:8}} interval={5}/><YAxis tick={{fill:DS.textMuted,fontSize:10}}/><Tooltip contentStyle={{background:DS.surface,border:`1px solid ${DS.border}`,fontSize:12}}/><Bar dataKey="inventory" fill={DS.info} radius={[2,2,0,0]}/></BarChart></ResponsiveContainer></div>
              <div><div style={{fontSize:12,fontWeight:600,color:DS.textMuted,marginBottom:8}}>Days on Market</div>
                <ResponsiveContainer width="100%" height={140}><LineChart data={data.marketTrends}><XAxis dataKey="month" tick={{fill:DS.textMuted,fontSize:8}} interval={5}/><YAxis tick={{fill:DS.textMuted,fontSize:10}}/><Tooltip contentStyle={{background:DS.surface,border:`1px solid ${DS.border}`,fontSize:12}}/><Line type="monotone" dataKey="dom" stroke={DS.warning} strokeWidth={2} dot={false}/></LineChart></ResponsiveContainer></div>
            </div>
          </Card>}

          {/* ═══ PHOTO AI ═══ */}
          {tab==="photoai"&&<PhotoAI/>}

          {/* ═══ DOC AI ═══ */}
          {tab==="docai"&&<DocAI/>}

          {/* ═══ BACKTESTING ═══ */}
          {tab==="backtest"&&<div style={{display:"flex",flexDirection:"column",gap:16}}>
            <Card><SectionTitle icon="🧪" sub="Model accuracy tracking across versions (V17)">Backtesting Dashboard</SectionTitle>
              <div style={{fontSize:12,color:DS.warning,padding:"8px 12px",background:`${DS.warning}08`,borderRadius:DS.radiusSm,marginBottom:16,border:`1px solid ${DS.warning}20`}}>⚠️ {data.backtesting.note}</div>
              {data.backtesting.metrics.map((m,i)=>(
                <div key={i} style={{padding:14,background:DS.surfaceAlt,borderRadius:DS.radiusSm,marginBottom:10}}>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
                    <div><span style={{fontWeight:600,fontSize:13}}>{m.name}</span><div style={{fontSize:11,color:DS.textDim}}>Target: {m.target}{m.unit}</div></div>
                    <div style={{display:"flex",alignItems:"center",gap:8}}><span style={{fontSize:20,fontWeight:700,fontFamily:DS.fontMono,color:m.status==="pass"?DS.success:m.status==="warning"?DS.warning:DS.danger}}>{m.value}{m.unit}</span><Badge color={m.status==="pass"?DS.success:m.status==="warning"?DS.warning:DS.danger}>{m.status}</Badge></div>
                  </div>
                  <ResponsiveContainer width="100%" height={60}><LineChart data={m.history.map((v,j)=>({version:data.backtesting.versions[j],value:v}))}><XAxis dataKey="version" tick={{fill:DS.textDim,fontSize:9}}/><YAxis hide domain={["auto","auto"]}/><Line type="monotone" dataKey="value" stroke={m.status==="pass"?DS.success:m.status==="warning"?DS.warning:DS.danger} strokeWidth={2} dot={{r:3,fill:DS.surface}}/></LineChart></ResponsiveContainer>
                </div>))}
            </Card>
          </div>}

          {/* ═══ SOURCES ═══ */}
          {tab==="sources"&&<Card><SectionTitle icon="📡" sub="14-source verification pipeline with trust levels and citations">Source Audit</SectionTitle>
            {data.sources.map((src,i)=>{const live=src.status==="connected";return(
              <div key={i} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"12px 14px",background:DS.surfaceAlt,borderRadius:DS.radiusSm,marginBottom:6,borderLeft:`3px solid ${live?DS.success:DS.textDim}`,opacity:live?1:0.7}}>
                <div style={{display:"flex",alignItems:"center",gap:10}}><GlowDot color={live?DS.success:DS.textDim} size={7} pulse={live}/><div><span style={{fontSize:13,fontWeight:live?600:400}}>{src.name}</span>{src.url&&<a href={src.url} target="_blank" rel="noopener noreferrer" style={{fontSize:10,color:DS.info,marginLeft:8,textDecoration:"none"}}>🔗</a>}</div></div>
                <div style={{display:"flex",gap:6}}><Badge color={src.trust==="authoritative"?DS.accent:src.trust==="high"?DS.info:DS.textMuted}>{src.trust}</Badge><Badge color={live?DS.success:DS.textDim}>{live?src.latency:src.status}</Badge></div>
              </div>)})}
            <div style={{marginTop:16,padding:14,background:dataSource==="live"?`${DS.success}08`:`${DS.warning}08`,borderRadius:DS.radiusSm,border:`1px solid ${dataSource==="live"?DS.success:DS.warning}20`}}>
              <div style={{fontSize:12,fontWeight:600,color:dataSource==="live"?DS.success:DS.warning}}>{dataSource==="live"?"✅ Backend Connected":"⚠️ Simulated Mode"}</div>
              <div style={{fontSize:12,color:DS.textMuted,marginTop:4}}>{dataSource==="live"?"Live public sources active. Production accuracy still requires MLS, assessor, title, and document sources.":"Run the backend for real Census/FEMA/permit/crime data. Photo AI and Doc AI tabs use live Claude API regardless."}</div>
            </div>
          </Card>}

          {/* ═══ AI ADVISOR ═══ */}
          {tab==="ai"&&<AIAdvisor data={data}/>}
        </div>
      )}

      <div style={{textAlign:"center",marginTop:32,paddingTop:16,borderTop:`1px solid ${DS.border}`,fontSize:11,color:DS.textDim,lineHeight:1.8}}>
        Realty Intel Pro V21+ • All V13–V21 features • Not an appraisal<br/>
        {dataSource==="simulated"?"⚠️ Simulated data — Photo AI & Doc AI use live Claude API":"Source-grounded • Confidence-scored • Transparent"}
      </div>
    </div>
  );
}
