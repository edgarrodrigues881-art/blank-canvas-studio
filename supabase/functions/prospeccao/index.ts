import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

// ========== GEO ==========

interface GeoPoint { lat: number; lng: number; }

async function geocodeCity(cidade: string, estado: string): Promise<GeoPoint | null> {
  try {
    const q = encodeURIComponent(`${cidade}, ${estado}, Brazil`);
    const res = await fetch(
      `https://nominatim.openstreetmap.org/search?q=${q}&format=json&limit=1&countrycodes=br`,
      { headers: { "User-Agent": "ProspeccaoBot/1.0" } }
    );
    if (!res.ok) return null;
    const data = await res.json();
    return data.length ? { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) } : null;
  } catch { return null; }
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
  center: GeoPoint,
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
  const HOT = 10;

  const done = () => places.length >= target;
  const log = (phase: string, added: number) =>
    console.log(`[prospeccao] ${phase} → +${added} new (total: ${places.length}/${target}) [${credits} credits]`);

  // === P1: Center — all niches ===
  for (const n of nichos) {
    if (done()) break;
    const ll = `@${center.lat.toFixed(6)},${center.lng.toFixed(6)},14z`;
    const added = await query(n, ll, apiKey, seen, places);
    credits++;
    log(`P1 center "${n}"`, added);
  }
  if (done()) return { places, creditsUsed: credits };

  // === P2: Ring 1 (3km, 6 pts) — primary niche ===
  const ring1 = generateRing(center, 3, 6);
  const hotPts: GeoPoint[] = [];
  for (const pt of ring1) {
    if (done()) break;
    const ll = `@${pt.lat.toFixed(6)},${pt.lng.toFixed(6)},14z`;
    const added = await query(primary, ll, apiKey, seen, places);
    credits++;
    log("P2 ring1", added);
    if (added >= HOT) hotPts.push(pt);
  }
  if (done()) return { places, creditsUsed: credits };

  // === P3: Bairros — text-based search (no coordinates, different results!) ===
  if (bairros.length > 0) {
    // Sort bairros: try up to 10, stop if cold streak
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

  // === P4: Subdivide hot points (1.5km) ===
  for (const hp of hotPts) {
    if (done()) break;
    for (const sp of subdivide(hp, 1.5)) {
      if (done()) break;
      const ll = `@${sp.lat.toFixed(6)},${sp.lng.toFixed(6)},15z`;
      const added = await query(primary, ll, apiKey, seen, places);
      credits++;
      log("P4 subdivide", added);
      if (added < 2) break;
    }
  }
  if (done()) return { places, creditsUsed: credits };

  // === P5: Expanded terms on best points ===
  const expanded = expandNicho(primary);
  if (expanded.length > 0) {
    // Use center + first 2 ring1 points with expanded terms
    const bestPts = [center, ...ring1.slice(0, 2)];
    for (const term of expanded.slice(0, 3)) {
      if (done()) break;
      for (const pt of bestPts) {
        if (done()) break;
        const ll = `@${pt.lat.toFixed(6)},${pt.lng.toFixed(6)},13z`;
        const added = await query(term, ll, apiKey, seen, places);
        credits++;
        log(`P5 expand "${term}"`, added);
        if (added < 2) break; // this term isn't yielding results here
      }
    }
  }
  if (done()) return { places, creditsUsed: credits };

  // === P6: Ring 2 (7km, 8 pts) ===
  const ring2 = generateRing(center, 7, 8);
  for (const pt of ring2) {
    if (done()) break;
    const ll = `@${pt.lat.toFixed(6)},${pt.lng.toFixed(6)},13z`;
    const added = await query(primary, ll, apiKey, seen, places);
    credits++;
    log("P6 ring2", added);
  }
  if (done()) return { places, creditsUsed: credits };

  // === P7: Ring 3 (12km, 10 pts) — only for large targets ===
  if (target > 100) {
    const ring3 = generateRing(center, 12, 10);
    for (const pt of ring3) {
      if (done()) break;
      const ll = `@${pt.lat.toFixed(6)},${pt.lng.toFixed(6)},12z`;
      const added = await query(primary, ll, apiKey, seen, places);
      credits++;
      log("P7 ring3", added);
      if (added === 0) continue;
    }
  }

  // === P8: Bairros with related niches (if still short) ===
  if (!done() && bairros.length > 0 && nichos.length > 1) {
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
    const [center, bairros] = await Promise.all([
      geocodeCity(cidadeTrimmed, estadoTrimmed),
      fetchBairros(cidadeTrimmed, estadoTrimmed),
    ]);

    console.log(`[prospeccao] "${nichoTrimmed}" em "${cidadeTrimmed}" | target: ${requestedTotal} | bairros: ${bairros.length} | nichos: ${allNichos.length}`);

    let searchResult: { places: any[]; creditsUsed: number };

    if (center) {
      searchResult = await adaptiveSearch(allNichos, center, requestedTotal, cidadeTrimmed, estadoTrimmed, bairros, SERPER_API_KEY);
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
