import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

// ========== GEO ==========

interface GeoPoint { lat: number; lng: number; }
interface CityGeo {
  center: GeoPoint;
  radiusKm: number;
}

async function geocodeCity(cidade: string, estado: string): Promise<CityGeo | null> {
  try {
    const q = encodeURIComponent(`${cidade}, ${estado}, Brazil`);
    const res = await fetch(
      `https://nominatim.openstreetmap.org/search?q=${q}&format=json&limit=1&countrycodes=br`,
      { headers: { "User-Agent": "ProspeccaoBot/1.0" } }
    );
    if (!res.ok) return null;
    const data = await res.json();
    if (!data.length) return null;

    const item = data[0];
    const center: GeoPoint = { lat: parseFloat(item.lat), lng: parseFloat(item.lon) };

    let radiusKm = 8;
    if (item.boundingbox) {
      const [south, north, west, east] = item.boundingbox.map(Number);
      const latSpan = (north - south) * 111;
      const lngSpan = (east - west) * 111 * Math.cos(center.lat * Math.PI / 180);
      radiusKm = Math.max(latSpan, lngSpan) / 2;
      radiusKm = Math.min(Math.max(radiusKm, 3), 30);
    }

    console.log(`[prospeccao] City "${cidade}": center ${center.lat.toFixed(4)},${center.lng.toFixed(4)} | radius ~${radiusKm.toFixed(1)}km`);
    return { center, radiusKm };
  } catch { return null; }
}

function isWithinCity(point: GeoPoint, center: GeoPoint, maxRadiusKm: number): boolean {
  const dLat = (point.lat - center.lat) * 111;
  const dLng = (point.lng - center.lng) * 111 * Math.cos(center.lat * Math.PI / 180);
  return Math.sqrt(dLat * dLat + dLng * dLng) <= maxRadiusKm;
}

function generateRing(center: GeoPoint, radiusKm: number, count: number): GeoPoint[] {
  const pts: GeoPoint[] = [];
  for (let i = 0; i < count; i++) {
    const a = (2 * Math.PI * i) / count;
    pts.push({
      lat: center.lat + (radiusKm / 111) * Math.cos(a),
      lng: center.lng + (radiusKm / (111 * Math.cos(center.lat * Math.PI / 180))) * Math.sin(a),
    });
  }
  return pts;
}

// ========== TERM EXPANSION ==========

const NICHE_SYNONYMS: Record<string, string[]> = {
  pizzaria: ["restaurante pizza", "delivery pizza", "pizzaria artesanal"],
  restaurante: ["lanchonete", "self service", "buffet", "comida"],
  hamburgueria: ["burger", "lanchonete hamburguer", "fast food"],
  lanchonete: ["hamburgueria", "fast food", "salgaderia"],
  padaria: ["confeitaria", "panificadora", "café da manhã"],
  academia: ["crossfit", "musculação", "personal trainer"],
  salao: ["cabeleireiro", "barbearia", "studio de beleza"],
  barbearia: ["salao masculino", "barber shop"],
  petshop: ["veterinário", "banho e tosa", "pet shop"],
  dentista: ["odontologia", "clínica dental", "consultório dentário"],
  advogado: ["escritório advocacia", "consultoria jurídica"],
  contabilidade: ["contador", "escritório contábil"],
  imobiliaria: ["corretor de imóveis", "imóveis"],
  farmacia: ["drogaria", "farmácia popular"],
  mecanica: ["oficina mecânica", "auto center", "funilaria"],
  clinica: ["consultório", "clínica médica", "centro médico"],
  escola: ["colégio", "curso", "educação"],
  hotel: ["pousada", "hostel", "hospedagem"],
  mercado: ["supermercado", "mercearia", "minimercado"],
  loja: ["comércio", "magazine"],
};

function expandNicho(nicho: string): string[] {
  const key = nicho.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  for (const [k, synonyms] of Object.entries(NICHE_SYNONYMS)) {
    if (key.includes(k) || k.includes(key)) return synonyms;
  }
  return [];
}

// ========== BAIRROS ==========

async function fetchBairros(cidade: string, estado: string): Promise<string[]> {
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(`${cidade}, ${estado}, Brazil`)}&format=json&limit=1&countrycodes=br`,
      { headers: { "User-Agent": "ProspeccaoBot/1.0" } }
    );
    if (!res.ok) return [];
    const data = await res.json();
    if (!data.length) return [];
    
    const { lat, lon } = data[0];
    const nbRes = await fetch(
      `https://nominatim.openstreetmap.org/search?q=bairro+${encodeURIComponent(cidade)}&format=json&limit=20&countrycodes=br&bounded=1&viewbox=${parseFloat(lon)-0.15},${parseFloat(lat)+0.15},${parseFloat(lon)+0.15},${parseFloat(lat)-0.15}`,
      { headers: { "User-Agent": "ProspeccaoBot/1.0" } }
    );
    if (!nbRes.ok) return [];
    const nbData = await nbRes.json();
    
    const bairros: string[] = [];
    const seen = new Set<string>();
    for (const item of nbData) {
      const name = (item.display_name || "").split(",")[0].trim();
      const lower = name.toLowerCase();
      if (name && !seen.has(lower) && !lower.includes(cidade.toLowerCase()) && name.length > 2) {
        seen.add(lower);
        bairros.push(name);
      }
    }
    return bairros.slice(0, 15);
  } catch { return []; }
}

// ========== SERPER ==========

function mapPlace(item: any) {
  return {
    nome: item.title || "",
    endereco: item.address || "",
    telefone: item.phoneNumber || "",
    website: item.website || "",
    avaliacao: item.rating || null,
    totalAvaliacoes: item.ratingCount || 0,
    categoria: item.type || item.category || "",
    categorias: item.types || (item.type ? [item.type] : []),
    horario: item.openingHours || null,
    googleMapsUrl: item.cid ? `https://www.google.com/maps?cid=${item.cid}` : "",
    placeId: item.placeId || "",
    imagem: item.thumbnailUrl || "",
    email: "", instagram: "", facebook: "",
    descricao: item.description || "",
    faixaPreco: item.priceLevel || "",
    permanentementeFechado: false,
    latitude: item.latitude || null,
    longitude: item.longitude || null,
  };
}

async function query(
  q: string, ll: string, apiKey: string,
  seen: Set<string>, places: any[]
): Promise<number> {
  const body: any = { q, gl: "br", hl: "pt-br", num: 20 };
  if (ll) body.ll = ll;

  try {
    const res = await fetch("https://google.serper.dev/maps", {
      method: "POST",
      headers: { "X-API-KEY": apiKey, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) return 0;
    const data = await res.json();
    let added = 0;
    for (const p of (data.places || [])) {
      const key = p.cid || p.placeId || `${(p.title||"").toLowerCase()}_${(p.address||"").toLowerCase()}`;
      if (!seen.has(key)) { seen.add(key); places.push(p); added++; }
    }
    return added;
  } catch { return 0; }
}

// ========== LOG COLLECTOR ==========

interface LogEntry {
  phase: string;
  query_term: string;
  location_info: string;
  leads_added: number;
  leads_total: number;
  credits_spent: number;
  score: number | null;
  tier: string | null;
}

class LogCollector {
  entries: LogEntry[] = [];
  
  add(phase: string, term: string, location: string, added: number, total: number, credits: number, score?: number, tier?: string) {
    this.entries.push({
      phase, query_term: term, location_info: location,
      leads_added: added, leads_total: total, credits_spent: credits,
      score: score ?? null, tier: tier ?? null,
    });
  }
}

// ========== HOT POINT SCORING ==========

interface PointScore {
  pt: GeoPoint;
  totalLeads: number;
  newLeads: number;
  queries: number;
  duplicates: number;
  score: number;
  tier: "hot" | "warm" | "cold";
}

function calcScore(s: Pick<PointScore, "totalLeads" | "newLeads" | "queries" | "duplicates">): number {
  const density = s.queries > 0 ? (s.newLeads / s.queries) : 0;
  const freshness = s.totalLeads > 0 ? (s.newLeads / s.totalLeads) : 0;
  const volume = Math.min(s.newLeads / 5, 4);
  const roiPenalty = s.queries > 2 && density < 1 ? -10 : 0;
  return Math.round((density * 4) + (freshness * 30) + (volume * 5) + roiPenalty);
}

function classifyPoint(score: number): "hot" | "warm" | "cold" {
  if (score >= 30) return "hot";
  if (score >= 12) return "warm";
  return "cold";
}

function budgetForTier(tier: "hot" | "warm" | "cold"): number {
  if (tier === "hot") return 6;
  if (tier === "warm") return 2;
  return 0;
}

// ========== ADAPTIVE SEARCH ==========

async function deepDrill(
  pt: GeoPoint, primary: string, apiKey: string,
  seen: Set<string>, places: any[], target: number,
  center: GeoPoint, radiusKm: number,
  maxCredits: number, logs: LogCollector
): Promise<{ added: number; spent: number }> {
  let totalAdded = 0;
  let spent = 0;
  const done = () => places.length >= target;
  const saturated = (a: number) => a < 2;
  const ll = (p: GeoPoint, z: number) => `@${p.lat.toFixed(6)},${p.lng.toFixed(6)},${z}z`;

  for (const zoom of [15, 16]) {
    if (done() || spent >= maxCredits) break;
    const added = await query(primary, ll(pt, zoom), apiKey, seen, places);
    spent++;
    totalAdded += added;
    logs.add("deep-drill-zoom", primary, ll(pt, zoom), added, places.length, 1);
    if (saturated(added)) break;
  }

  if (!done() && spent < maxCredits) {
    const microPts = generateRing(pt, 0.8, 4).filter(p => isWithinCity(p, center, radiusKm * 1.1));
    for (const mp of microPts) {
      if (done() || spent >= maxCredits) break;
      const added = await query(primary, ll(mp, 15), apiKey, seen, places);
      spent++;
      totalAdded += added;
      logs.add("deep-drill-micro", primary, ll(mp, 15), added, places.length, 1);
      if (saturated(added)) break;
    }
  }

  return { added: totalAdded, spent };
}

async function searchAndScore(
  pt: GeoPoint, primary: string, zoom: number, apiKey: string,
  seen: Set<string>, places: any[], target: number,
  center: GeoPoint, radiusKm: number, phase: string,
  logs: LogCollector
): Promise<{ score: PointScore; credits: number }> {
  const llStr = `@${pt.lat.toFixed(6)},${pt.lng.toFixed(6)},${zoom}z`;
  const added = await query(primary, llStr, apiKey, seen, places);
  let credits = 1;

  const ps: PointScore = {
    pt, totalLeads: added, newLeads: added, queries: 1, duplicates: 0, score: 0, tier: "cold",
  };
  ps.score = calcScore(ps);
  ps.tier = classifyPoint(ps.score);

  logs.add(phase, primary, llStr, added, places.length, 1, ps.score, ps.tier);
  console.log(`[prospeccao] ${phase} → +${added} | score=${ps.score} tier=${ps.tier} [${credits}cr]`);

  const drillBudget = budgetForTier(ps.tier);
  if (drillBudget > 0 && places.length < target) {
    const drill = await deepDrill(pt, primary, apiKey, seen, places, target, center, radiusKm, drillBudget, logs);
    credits += drill.spent;
    ps.newLeads += drill.added;
    ps.queries += drill.spent;
    ps.score = calcScore(ps);
    ps.tier = classifyPoint(ps.score);
  }

  return { score: ps, credits };
}

async function adaptiveSearch(
  nichos: string[], cityGeo: CityGeo, target: number,
  cidade: string, estado: string, bairros: string[], apiKey: string,
  logs: LogCollector, creditBudget: number = Infinity
): Promise<{ places: any[]; creditsUsed: number }> {
  const seen = new Set<string>();
  const places: any[] = [];
  let credits = 0;
  const primary = nichos[0];
  const related = nichos.slice(1);
  const { center, radiusKm } = cityGeo;

  const ring1Dist = Math.min(radiusKm * 0.3, 5);
  const ring2Dist = Math.min(radiusKm * 0.6, 12);
  const ring3Dist = Math.min(radiusKm * 0.9, 20);
  const ring1Pts = radiusKm < 5 ? 4 : 6;
  const ring2Pts = radiusKm < 8 ? 6 : 8;
  const ring3Pts = radiusKm < 10 ? 8 : 10;
  const zoomCenter = radiusKm < 5 ? 15 : radiusKm < 12 ? 14 : 13;
  const zoomRing1 = radiusKm < 8 ? 14 : 13;
  const zoomOuter = radiusKm < 12 ? 13 : 12;

  const done = () => places.length >= target;
  const budgetExceeded = () => Math.ceil(credits * 2.5) >= creditBudget;
  const progress = () => places.length / target;
  const filterInCity = (pts: GeoPoint[]) => pts.filter(p => isWithinCity(p, center, radiusKm * 1.1));
  const allScores: PointScore[] = [];

  // P1: Center
  const p1 = await searchAndScore(center, primary, zoomCenter, apiKey, seen, places, target, center, radiusKm, "P1-center", logs);
  credits += p1.credits;
  allScores.push(p1.score);
  if (done() || budgetExceeded()) return { places, creditsUsed: credits };

  // P2: Ring 1
  const ring1 = filterInCity(generateRing(center, ring1Dist, ring1Pts));
  for (const pt of ring1) {
    if (done() || budgetExceeded()) break;
    const r = await searchAndScore(pt, primary, zoomRing1, apiKey, seen, places, target, center, radiusKm, "P2-ring1", logs);
    credits += r.credits;
    allScores.push(r.score);
  }
  if (done() || budgetExceeded()) return { places, creditsUsed: credits };

  // P3: Bairros
  if (bairros.length > 0) {
    let coldStreak = 0;
    for (const bairro of bairros.slice(0, 10)) {
      if (done() || coldStreak >= 3 || budgetExceeded()) break;
      const added = await query(`${primary} ${bairro} ${cidade}`, "", apiKey, seen, places);
      credits++;
      logs.add("P3-bairro", primary, bairro, added, places.length, 1);
      coldStreak = added < 2 ? coldStreak + 1 : 0;
    }
  }
  if (done() || budgetExceeded()) return { places, creditsUsed: credits };

  // P4: Ring 2
  const ring2 = filterInCity(generateRing(center, ring2Dist, ring2Pts));
  let ring2ColdStreak = 0;
  for (const pt of ring2) {
    if (done() || ring2ColdStreak >= 3 || budgetExceeded()) break;
    const r = await searchAndScore(pt, primary, zoomOuter, apiKey, seen, places, target, center, radiusKm, "P4-ring2", logs);
    credits += r.credits;
    allScores.push(r.score);
    ring2ColdStreak = r.score.tier === "cold" ? ring2ColdStreak + 1 : 0;
  }
  if (done() || budgetExceeded()) return { places, creditsUsed: credits };

  // P5: Ring 3 (large cities)
  if (target > 50 && radiusKm > 6 && ring2ColdStreak < 3) {
    const ring3 = filterInCity(generateRing(center, ring3Dist, ring3Pts));
    let ring3ColdStreak = 0;
    for (const pt of ring3) {
      if (done() || ring3ColdStreak >= 2 || budgetExceeded()) break;
      const llStr = `@${pt.lat.toFixed(6)},${pt.lng.toFixed(6)},${zoomOuter}z`;
      const added = await query(primary, llStr, apiKey, seen, places);
      credits++;
      logs.add("P5-ring3", primary, llStr, added, places.length, 1);
      ring3ColdStreak = added < 2 ? ring3ColdStreak + 1 : 0;
    }
  }
  if (done() || budgetExceeded()) return { places, creditsUsed: credits };

  // Scoring summary
  const hotCount = allScores.filter(s => s.tier === "hot").length;
  const warmCount = allScores.filter(s => s.tier === "warm").length;
  const coldCount = allScores.filter(s => s.tier === "cold").length;

  // P6: Term expansion
  if (progress() >= 0.8 || related.length === 0) {
    const expanded = expandNicho(primary);
    if (expanded.length > 0 && !done() && !budgetExceeded()) {
      for (const term of expanded.slice(0, 2)) {
        if (done() || budgetExceeded()) break;
        const llStr = `@${center.lat.toFixed(6)},${center.lng.toFixed(6)},${zoomCenter}z`;
        const added = await query(term, llStr, apiKey, seen, places);
        credits++;
        logs.add("P6-expand", term, llStr, added, places.length, 1);
        if (added < 2) continue;
        for (const pt of ring1.slice(0, 2)) {
          if (done() || budgetExceeded()) break;
          const ll2 = `@${pt.lat.toFixed(6)},${pt.lng.toFixed(6)},${zoomRing1}z`;
          const a = await query(term, ll2, apiKey, seen, places);
          credits++;
          logs.add("P6-expand-ring", term, ll2, a, places.length, 1);
          if (a < 2) break;
        }
      }
    }
    return { places, creditsUsed: credits };
  }

  // P7: Related niches at best points
  const expanded = expandNicho(primary);
  const allRelated = [...related, ...expanded];
  const seenTerms = new Set([primary.toLowerCase()]);
  const uniqueRelated = allRelated.filter(t => {
    const low = t.toLowerCase();
    if (seenTerms.has(low)) return false;
    seenTerms.add(low);
    return true;
  });

  const bestPoints = allScores
    .filter(s => s.tier !== "cold")
    .sort((a, b) => b.score - a.score)
    .slice(0, 5)
    .map(s => s.pt);

  for (const relNicho of uniqueRelated) {
    if (done() || budgetExceeded()) break;
    const llStr = `@${center.lat.toFixed(6)},${center.lng.toFixed(6)},${zoomCenter}z`;
    const centerAdded = await query(relNicho, llStr, apiKey, seen, places);
    credits++;
    logs.add("P7-related-center", relNicho, llStr, centerAdded, places.length, 1);
    if (centerAdded < 2) continue;

    for (const pt of bestPoints.slice(0, 3)) {
      if (done() || budgetExceeded()) break;
      const ll2 = `@${pt.lat.toFixed(6)},${pt.lng.toFixed(6)},${zoomRing1}z`;
      const added = await query(relNicho, ll2, apiKey, seen, places);
      credits++;
      logs.add("P7-related-best", relNicho, ll2, added, places.length, 1);
      if (added < 2) break;
    }

    if (done() || budgetExceeded()) break;
    if (bairros.length > 0 && progress() < 0.7) {
      for (const bairro of bairros.slice(0, 3)) {
        if (done() || budgetExceeded()) break;
        const added = await query(`${relNicho} ${bairro} ${cidade}`, "", apiKey, seen, places);
        credits++;
        logs.add("P7-related-bairro", relNicho, bairro, added, places.length, 1);
        if (added < 1) break;
      }
    }
  }

  return { places, creditsUsed: credits };
}

// ========== MAIN ==========

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);
    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { nicho, nichosRelacionados, estado, cidade, maxResults, forceRefresh, customCenter, customRadiusKm } = await req.json();

    if (!nicho || !cidade || !estado) {
      return new Response(
        JSON.stringify({ error: "nicho, estado e cidade são obrigatórios" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const nichoTrimmed = nicho.trim();
    const estadoTrimmed = estado.trim();
    const cidadeTrimmed = cidade.trim();

    // --- CACHE ---
    if (!forceRefresh) {
      const adminClient = createClient(supabaseUrl, serviceRoleKey);
      const { data: cached } = await adminClient
        .from("prospeccao_cache")
        .select("results, total, created_at")
        .eq("user_id", user.id)
        .ilike("nicho", nichoTrimmed)
        .ilike("estado", estadoTrimmed)
        .ilike("cidade", cidadeTrimmed)
        .gt("expires_at", new Date().toISOString())
        .maybeSingle();

      if (cached) {
        return new Response(JSON.stringify({
          results: cached.results, total: cached.total,
          fromCache: true, cachedAt: cached.created_at, creditsUsed: 0,
        }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
    }

    // --- CREDIT / FREE PULL CHECK ---
    const adminClient2 = createClient(supabaseUrl, serviceRoleKey);
    const { data: creditRow } = await adminClient2
      .from("prospeccao_credits")
      .select("balance, free_pulls_remaining")
      .eq("user_id", user.id)
      .maybeSingle();

    const currentBalance = creditRow?.balance ?? 0;
    const freePulls = creditRow?.free_pulls_remaining ?? 0;
    const isFreePull = freePulls > 0 && currentBalance < Math.ceil(1 * 2.5);
    const freeMaxResults = 20;

    if (!isFreePull) {
      // Paid mode — check credits
      const estimatedMinCost = Math.ceil(1 * 2.5);
      if (currentBalance < estimatedMinCost) {
        return new Response(
          JSON.stringify({ error: "Créditos insuficientes e sem puxadas grátis", balance: currentBalance, freePulls: 0 }),
          { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    const SERPER_API_KEY = Deno.env.get("SERPER_API_KEY");
    if (!SERPER_API_KEY) {
      return new Response(
        JSON.stringify({ error: "SERPER_API_KEY não configurada" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const requestedTotal = Math.min(maxResults || 50, 5000);
    const relatedNiches = Array.isArray(nichosRelacionados) ? nichosRelacionados.filter(Boolean) : [];
    const allNichos = [nichoTrimmed, ...relatedNiches];
    const startTime = Date.now();

    // Create campaign
    const now = new Date();
    const dateStr = `${String(now.getDate()).padStart(2,'0')}/${String(now.getMonth()+1).padStart(2,'0')}`;
    const campaignName = `${nichoTrimmed} - ${cidadeTrimmed} - ${dateStr}`;

    const { data: campaign, error: campErr } = await supabase
      .from("prospeccao_campaigns")
      .insert({
        user_id: user.id,
        name: campaignName,
        nicho: nichoTrimmed,
        nichos_relacionados: relatedNiches,
        estado: estadoTrimmed,
        cidade: cidadeTrimmed,
        max_results: requestedTotal,
        status: "running",
        started_at: now.toISOString(),
      })
      .select("id")
      .single();

    if (campErr) {
      console.error("[prospeccao] Campaign create error:", campErr);
    }
    const campaignId = campaign?.id;

    // Use custom center from map if provided, otherwise geocode
    let cityGeoPromise: Promise<CityGeo | null>;
    if (customCenter && typeof customCenter.lat === "number" && typeof customCenter.lng === "number") {
      const userRadius = typeof customRadiusKm === "number" ? Math.min(Math.max(customRadiusKm, 2), 50) : 12;
      console.log(`[prospeccao] Using custom center: ${customCenter.lat.toFixed(4)},${customCenter.lng.toFixed(4)} | radius: ${userRadius}km`);
      cityGeoPromise = Promise.resolve({ center: { lat: customCenter.lat, lng: customCenter.lng }, radiusKm: userRadius });
    } else {
      cityGeoPromise = geocodeCity(cidadeTrimmed, estadoTrimmed);
    }

    const [cityGeo, bairros] = await Promise.all([
      cityGeoPromise,
      fetchBairros(cidadeTrimmed, estadoTrimmed),
    ]);

    console.log(`[prospeccao] "${nichoTrimmed}" em "${cidadeTrimmed}" | target: ${requestedTotal} | bairros: ${bairros.length} | campaign: ${campaignId}`);

    const logs = new LogCollector();
    let searchResult: { places: any[]; creditsUsed: number };

    if (cityGeo) {
      searchResult = await adaptiveSearch(allNichos, cityGeo, requestedTotal, cidadeTrimmed, estadoTrimmed, bairros, SERPER_API_KEY, logs, currentBalance);
    } else {
      const seen = new Set<string>();
      const places: any[] = [];
      let credits = 0;
      for (const n of allNichos) {
        if (places.length >= requestedTotal) break;
        const added = await query(`${n} ${cidadeTrimmed} ${estadoTrimmed}`, "", SERPER_API_KEY, seen, places);
        credits++;
        logs.add("fallback-text", n, `${cidadeTrimmed} ${estadoTrimmed}`, added, places.length, 1);
      }
      searchResult = { places, creditsUsed: credits };
    }

    // Post-filter: remove results outside the search area when coordinates are available
    let filteredPlaces = searchResult.places;
    if (cityGeo) {
      filteredPlaces = filteredPlaces.filter(p => {
        if (p.latitude && p.longitude) {
          return isWithinCity({ lat: p.latitude, lng: p.longitude }, cityGeo.center, cityGeo.radiusKm * 1.15);
        }
        return true; // keep places without coords
      });
    }

    const results = filteredPlaces.slice(0, requestedTotal).map(mapPlace);
    const executionMs = Date.now() - startTime;
    const ratio = (results.length / Math.max(searchResult.creditsUsed, 1)).toFixed(1);
    console.log(`[prospeccao] DONE: ${results.length} leads | ${searchResult.creditsUsed} cr | ${ratio} l/cr | ${executionMs}ms`);

    // --- DEBIT CREDITS (2.5x multiplier, ceil) ---
    const rawCost = searchResult.creditsUsed;
    const finalCost = Math.ceil(rawCost * 2.5);
    let newBalance = currentBalance;

    if (finalCost > 0) {
      const debitAdmin = createClient(supabaseUrl, serviceRoleKey);
      const { data: debitResult } = await debitAdmin.rpc("debit_prospeccao_credits", {
        p_user_id: user.id,
        p_amount: finalCost,
        p_description: `Prospecção: ${nichoTrimmed} em ${cidadeTrimmed}/${estadoTrimmed} — ${results.length} leads`,
        p_campaign_id: campaignId || null,
      });
      if (debitResult?.success === false) {
        console.warn(`[prospeccao] Debit failed: ${debitResult.error}`);
      } else {
        newBalance = debitResult?.balance ?? (currentBalance - finalCost);
      }
    }

    console.log(`[prospeccao] DONE: ${results.length} leads | API: ${rawCost} cr | Cobrado: ${finalCost} cr | Saldo: ${newBalance}`);

    // Save campaign results + logs
    if (campaignId) {
      try {
        // Update campaign
        await supabase.from("prospeccao_campaigns").update({
          status: "completed",
          total_leads: results.length,
          credits_used: searchResult.creditsUsed,
          execution_time_ms: executionMs,
          city_radius_km: cityGeo?.radiusKm ?? null,
          completed_at: new Date().toISOString(),
        }).eq("id", campaignId);

        // Save logs in batches
        if (logs.entries.length > 0) {
          const logRows = logs.entries.map(e => ({
            campaign_id: campaignId,
            phase: e.phase,
            query_term: e.query_term,
            location_info: e.location_info,
            leads_added: e.leads_added,
            leads_total: e.leads_total,
            credits_spent: e.credits_spent,
            score: e.score,
            tier: e.tier,
          }));
          // Insert in chunks of 50
          for (let i = 0; i < logRows.length; i += 50) {
            await supabase.from("prospeccao_campaign_logs").insert(logRows.slice(i, i + 50));
          }
        }

        // Save leads in batches
        if (results.length > 0) {
          const leadRows = results.map(r => ({
            campaign_id: campaignId,
            nome: r.nome,
            endereco: r.endereco,
            telefone: r.telefone,
            website: r.website,
            avaliacao: r.avaliacao,
            total_avaliacoes: r.totalAvaliacoes,
            categoria: r.categoria,
            google_maps_url: r.googleMapsUrl,
            place_id: r.placeId,
            latitude: r.latitude,
            longitude: r.longitude,
            email: r.email || null,
            instagram: r.instagram || null,
            facebook: r.facebook || null,
            descricao: r.descricao || null,
            faixa_preco: r.faixaPreco || null,
          }));
          for (let i = 0; i < leadRows.length; i += 100) {
            await supabase.from("prospeccao_campaign_leads").insert(leadRows.slice(i, i + 100));
          }
        }
      } catch (e) {
        console.error("[prospeccao] Campaign save error:", e);
      }
    }

    // --- CACHE SAVE ---
    try {
      const adminClient = createClient(supabaseUrl, serviceRoleKey);
      await adminClient.from("prospeccao_cache").upsert({
        user_id: user.id,
        nicho: nichoTrimmed.toLowerCase(),
        estado: estadoTrimmed.toLowerCase(),
        cidade: cidadeTrimmed.toLowerCase(),
        results, total: results.length,
        created_at: new Date().toISOString(),
        expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      }, { onConflict: "user_id,lower(nicho),lower(estado),lower(cidade)" });
    } catch (e) {
      console.error("[prospeccao] Cache save error:", e);
    }

    return new Response(JSON.stringify({
      results, total: results.length, fromCache: false,
      creditsUsed: finalCost,
      apiCreditsUsed: rawCost,
      balance: newBalance,
      campaignId,
      executionTimeMs: executionMs,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (error) {
    console.error("[prospeccao] Error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Erro interno" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
