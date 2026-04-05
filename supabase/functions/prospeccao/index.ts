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
  radiusKm: number; // estimated city radius from bounding box
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

    // Calculate city radius from bounding box if available
    let radiusKm = 8; // default
    if (item.boundingbox) {
      const [south, north, west, east] = item.boundingbox.map(Number);
      const latSpan = (north - south) * 111; // km
      const lngSpan = (east - west) * 111 * Math.cos(center.lat * Math.PI / 180);
      radiusKm = Math.max(latSpan, lngSpan) / 2;
      // Clamp: min 3km (vila), max 30km (metrópole)
      radiusKm = Math.min(Math.max(radiusKm, 3), 30);
    }

    console.log(`[prospeccao] City "${cidade}": center ${center.lat.toFixed(4)},${center.lng.toFixed(4)} | radius ~${radiusKm.toFixed(1)}km`);
    return { center, radiusKm };
  } catch { return null; }
}

/** Check if a point is within city radius (prevents searching outside the city) */
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

function subdivide(p: GeoPoint, r: number): GeoPoint[] {
  return generateRing(p, r, 4);
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
    if (key.includes(k) || k.includes(key)) {
      return synonyms;
    }
  }
  return [];
}

// ========== BAIRROS ==========

async function fetchBairros(cidade: string, estado: string): Promise<string[]> {
  try {
    const q = encodeURIComponent(`bairros de ${cidade} ${estado}`);
    // Use Nominatim to find neighborhoods
    const res = await fetch(
      `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(`${cidade}, ${estado}, Brazil`)}&format=json&limit=1&countrycodes=br`,
      { headers: { "User-Agent": "ProspeccaoBot/1.0" } }
    );
    if (!res.ok) return [];
    const data = await res.json();
    if (!data.length) return [];
    
    const { lat, lon } = data[0];
    // Search for suburbs/neighborhoods around the city
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
  } catch {
    return [];
  }
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

// ========== ADAPTIVE SEARCH ==========

async function adaptiveSearch(
  nichos: string[],
  cityGeo: CityGeo,
  target: number,
  cidade: string,
  estado: string,
  bairros: string[],
  apiKey: string
): Promise<{ places: any[]; creditsUsed: number }> {
  const seen = new Set<string>();
  const places: any[] = [];
  let credits = 0;
  const primary = nichos[0];
  const { center, radiusKm } = cityGeo;
  const HOT = 10;

  // Dynamic ring distances based on city radius
  const ring1Dist = Math.min(radiusKm * 0.3, 5);   // ~30% of radius
  const ring2Dist = Math.min(radiusKm * 0.6, 12);   // ~60% of radius
  const ring3Dist = Math.min(radiusKm * 0.9, 20);   // ~90% of radius
  const ring1Pts = radiusKm < 5 ? 4 : 6;
  const ring2Pts = radiusKm < 8 ? 6 : 8;
  const ring3Pts = radiusKm < 10 ? 8 : 10;
  // Zoom: tighter for small cities, wider for large
  const zoomCenter = radiusKm < 5 ? 15 : radiusKm < 12 ? 14 : 13;
  const zoomRing1 = radiusKm < 8 ? 14 : 13;
  const zoomOuter = radiusKm < 12 ? 13 : 12;

  console.log(`[prospeccao] Adaptive rings: R1=${ring1Dist.toFixed(1)}km(${ring1Pts}pts) R2=${ring2Dist.toFixed(1)}km(${ring2Pts}pts) R3=${ring3Dist.toFixed(1)}km(${ring3Pts}pts) | cityRadius=${radiusKm.toFixed(1)}km`);

  const done = () => places.length >= target;
  const log = (phase: string, added: number) =>
    console.log(`[prospeccao] ${phase} → +${added} new (total: ${places.length}/${target}) [${credits} cr]`);

  const filterInCity = (pts: GeoPoint[]) => pts.filter(p => isWithinCity(p, center, radiusKm * 1.1));

  // === P1: Center — all niches ===
  for (const n of nichos) {
    if (done()) break;
    const ll = `@${center.lat.toFixed(6)},${center.lng.toFixed(6)},${zoomCenter}z`;
    const added = await query(n, ll, apiKey, seen, places);
    credits++;
    log(`P1 center "${n}"`, added);
  }
  if (done()) return { places, creditsUsed: credits };

  // === P2: Ring 1 — primary niche ===
  const ring1 = filterInCity(generateRing(center, ring1Dist, ring1Pts));
  const hotPts: GeoPoint[] = [];
  for (const pt of ring1) {
    if (done()) break;
    const ll = `@${pt.lat.toFixed(6)},${pt.lng.toFixed(6)},${zoomRing1}z`;
    const added = await query(primary, ll, apiKey, seen, places);
    credits++;
    log("P2 ring1", added);
    if (added >= HOT) hotPts.push(pt);
  }
  if (done()) return { places, creditsUsed: credits };

  // === P3: Bairros — text search ===
  if (bairros.length > 0) {
    let coldStreak = 0;
    for (const bairro of bairros.slice(0, 10)) {
      if (done() || coldStreak >= 3) break;
      const added = await query(`${primary} ${bairro} ${cidade}`, "", apiKey, seen, places);
      credits++;
      log(`P3 bairro "${bairro}"`, added);
      coldStreak = added < 2 ? coldStreak + 1 : 0;
    }
  }
  if (done()) return { places, creditsUsed: credits };

  // === P4: Subdivide hot points ===
  const subRadius = Math.max(ring1Dist * 0.4, 1);
  for (const hp of hotPts) {
    if (done()) break;
    for (const sp of filterInCity(subdivide(hp, subRadius))) {
      if (done()) break;
      const ll = `@${sp.lat.toFixed(6)},${sp.lng.toFixed(6)},${zoomCenter}z`;
      const added = await query(primary, ll, apiKey, seen, places);
      credits++;
      log("P4 subdivide", added);
      if (added < 2) break;
    }
  }
  if (done()) return { places, creditsUsed: credits };

  // === P5: Expanded terms ===
  const expanded = expandNicho(primary);
  if (expanded.length > 0) {
    const bestPts = [center, ...ring1.slice(0, 2)];
    for (const term of expanded.slice(0, 3)) {
      if (done()) break;
      for (const pt of bestPts) {
        if (done()) break;
        const ll = `@${pt.lat.toFixed(6)},${pt.lng.toFixed(6)},${zoomOuter}z`;
        const added = await query(term, ll, apiKey, seen, places);
        credits++;
        log(`P5 expand "${term}"`, added);
        if (added < 2) break;
      }
    }
  }
  if (done()) return { places, creditsUsed: credits };

  // === P6: Ring 2 ===
  const ring2 = filterInCity(generateRing(center, ring2Dist, ring2Pts));
  for (const pt of ring2) {
    if (done()) break;
    const ll = `@${pt.lat.toFixed(6)},${pt.lng.toFixed(6)},${zoomOuter}z`;
    const added = await query(primary, ll, apiKey, seen, places);
    credits++;
    log("P6 ring2", added);
  }
  if (done()) return { places, creditsUsed: credits };

  // === P7: Ring 3 — only if city is large enough and target demands it ===
  if (target > 50 && radiusKm > 6) {
    const ring3 = filterInCity(generateRing(center, ring3Dist, ring3Pts));
    for (const pt of ring3) {
      if (done()) break;
      const ll = `@${pt.lat.toFixed(6)},${pt.lng.toFixed(6)},${zoomOuter}z`;
      const added = await query(primary, ll, apiKey, seen, places);
      credits++;
      log("P7 ring3", added);
    }
  }
  if (done()) return { places, creditsUsed: credits };

  // === P8: Bairros + related niches ===
  if (bairros.length > 0 && nichos.length > 1) {
    for (const n of nichos.slice(1)) {
      if (done()) break;
      for (const bairro of bairros.slice(0, 5)) {
        if (done()) break;
        const added = await query(`${n} ${bairro} ${cidade}`, "", apiKey, seen, places);
        credits++;
        log(`P8 "${n}" bairro "${bairro}"`, added);
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

    const { nicho, nichosRelacionados, estado, cidade, maxResults, forceRefresh } = await req.json();

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

    // Geocode + fetch bairros in parallel
    const [cityGeo, bairros] = await Promise.all([
      geocodeCity(cidadeTrimmed, estadoTrimmed),
      fetchBairros(cidadeTrimmed, estadoTrimmed),
    ]);

    console.log(`[prospeccao] "${nichoTrimmed}" em "${cidadeTrimmed}" | target: ${requestedTotal} | bairros: ${bairros.length} | nichos: ${allNichos.length} | cityRadius: ${cityGeo?.radiusKm.toFixed(1) || "?"} km`);

    let searchResult: { places: any[]; creditsUsed: number };

    if (cityGeo) {
      searchResult = await adaptiveSearch(allNichos, cityGeo, requestedTotal, cidadeTrimmed, estadoTrimmed, bairros, SERPER_API_KEY);
    } else {
      // Fallback text-only
      const seen = new Set<string>();
      const places: any[] = [];
      let credits = 0;
      for (const n of allNichos) {
        if (places.length >= requestedTotal) break;
        await query(`${n} ${cidadeTrimmed} ${estadoTrimmed}`, "", SERPER_API_KEY, seen, places);
        credits++;
      }
      searchResult = { places, creditsUsed: credits };
    }

    const results = searchResult.places.slice(0, requestedTotal).map(mapPlace);
    const ratio = (results.length / Math.max(searchResult.creditsUsed, 1)).toFixed(1);
    console.log(`[prospeccao] DONE: ${results.length} leads | ${searchResult.creditsUsed} créditos | ${ratio} leads/crédito`);

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
      creditsUsed: searchResult.creditsUsed,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (error) {
    console.error("[prospeccao] Error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Erro interno" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
