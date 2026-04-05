import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

// ========== GEO UTILITIES ==========

interface GeoPoint { lat: number; lng: number; }
interface SearchResult { places: any[]; newUnique: number; }

async function geocodeCity(cidade: string, estado: string): Promise<GeoPoint | null> {
  try {
    const query = encodeURIComponent(`${cidade}, ${estado}, Brazil`);
    const res = await fetch(
      `https://nominatim.openstreetmap.org/search?q=${query}&format=json&limit=1&countrycodes=br`,
      { headers: { "User-Agent": "ProspeccaoBot/1.0" } }
    );
    if (!res.ok) return null;
    const data = await res.json();
    if (data.length === 0) return null;
    return { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) };
  } catch {
    return null;
  }
}

/** Generate ring of points at a given radius from center */
function generateRing(center: GeoPoint, radiusKm: number, pointCount: number): GeoPoint[] {
  const points: GeoPoint[] = [];
  for (let i = 0; i < pointCount; i++) {
    const angle = (2 * Math.PI * i) / pointCount;
    const latOffset = (radiusKm / 111) * Math.cos(angle);
    const lngOffset = (radiusKm / (111 * Math.cos(center.lat * Math.PI / 180))) * Math.sin(angle);
    points.push({ lat: center.lat + latOffset, lng: center.lng + lngOffset });
  }
  return points;
}

/** Subdivide around a hot point — 4 points at half the ring spacing */
function subdivide(point: GeoPoint, subRadiusKm: number): GeoPoint[] {
  return generateRing(point, subRadiusKm, 4);
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

async function serperQuery(
  query: string,
  ll: string,
  apiKey: string,
  seenKeys: Set<string>,
  uniquePlaces: any[]
): Promise<{ raw: number; newUnique: number }> {
  const body: any = { q: query, gl: "br", hl: "pt-br", num: 20 };
  if (ll) body.ll = ll;

  const res = await fetch("https://google.serper.dev/maps", {
    method: "POST",
    headers: { "X-API-KEY": apiKey, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    console.error(`[prospeccao] Serper ${res.status} for "${query}" ${ll}`);
    return { raw: 0, newUnique: 0 };
  }

  const data = await res.json();
  const places = data.places || [];
  let newUnique = 0;

  for (const place of places) {
    const key = place.cid || place.placeId ||
      `${(place.title || "").toLowerCase()}_${(place.address || "").toLowerCase()}`;
    if (!seenKeys.has(key)) {
      seenKeys.add(key);
      uniquePlaces.push(place);
      newUnique++;
    }
  }

  return { raw: places.length, newUnique };
}

/**
 * ADAPTIVE SEARCH STRATEGY:
 * 
 * Phase 1: Center query (1 credit) — check density
 * Phase 2: First ring (4-6 points) — expand outward
 * Phase 3: If high-density points found, subdivide them
 * Phase 4: Second ring (8 points, wider) — only if needed
 * 
 * Stops as soon as target is reached.
 * Skips low-yield areas automatically.
 */
async function adaptiveSearch(
  nichos: string[],
  center: GeoPoint,
  target: number,
  apiKey: string
): Promise<{ places: any[]; creditsUsed: number }> {
  const seenKeys = new Set<string>();
  const uniquePlaces: any[] = [];
  let creditsUsed = 0;
  const primaryNicho = nichos[0];
  const HOT_THRESHOLD = 10; // If a point returns 10+ new leads, it's "hot"
  const COLD_THRESHOLD = 3;  // If < 3 new leads, area is "cold" — don't subdivide

  const done = () => uniquePlaces.length >= target;

  // --- PHASE 1: Center (1 query per niche) ---
  for (const nicho of nichos) {
    if (done()) break;
    const ll = `@${center.lat.toFixed(6)},${center.lng.toFixed(6)},14z`;
    const result = await serperQuery(nicho, ll, apiKey, seenKeys, uniquePlaces);
    creditsUsed++;
    console.log(`[prospeccao] P1 center "${nicho}" → ${result.raw} raw, +${result.newUnique} new (total: ${uniquePlaces.length})`);
  }

  if (done()) return { places: uniquePlaces, creditsUsed };

  // --- PHASE 2: First ring (3km out, 6 points) ---
  const ring1 = generateRing(center, 3, 6);
  const hotPoints: GeoPoint[] = [];

  for (const point of ring1) {
    if (done()) break;
    const ll = `@${point.lat.toFixed(6)},${point.lng.toFixed(6)},14z`;
    const result = await serperQuery(primaryNicho, ll, apiKey, seenKeys, uniquePlaces);
    creditsUsed++;
    console.log(`[prospeccao] P2 ring1 → +${result.newUnique} new (total: ${uniquePlaces.length})`);

    if (result.newUnique >= HOT_THRESHOLD) {
      hotPoints.push(point);
    }
  }

  if (done()) return { places: uniquePlaces, creditsUsed };

  // --- PHASE 2b: Related niches on ring1 (only if we need more) ---
  if (nichos.length > 1 && !done()) {
    for (const nicho of nichos.slice(1)) {
      if (done()) break;
      // Pick 2 best ring1 points (first ones, which are spread out)
      for (const point of ring1.slice(0, 2)) {
        if (done()) break;
        const ll = `@${point.lat.toFixed(6)},${point.lng.toFixed(6)},14z`;
        const result = await serperQuery(nicho, ll, apiKey, seenKeys, uniquePlaces);
        creditsUsed++;
        console.log(`[prospeccao] P2b "${nicho}" → +${result.newUnique} new (total: ${uniquePlaces.length})`);
      }
    }
  }

  if (done()) return { places: uniquePlaces, creditsUsed };

  // --- PHASE 3: Subdivide hot points (1.5km sub-grid) ---
  for (const hotPoint of hotPoints) {
    if (done()) break;
    const subPoints = subdivide(hotPoint, 1.5);
    for (const sp of subPoints) {
      if (done()) break;
      const ll = `@${sp.lat.toFixed(6)},${sp.lng.toFixed(6)},15z`; // tighter zoom
      const result = await serperQuery(primaryNicho, ll, apiKey, seenKeys, uniquePlaces);
      creditsUsed++;
      console.log(`[prospeccao] P3 subdivide → +${result.newUnique} new (total: ${uniquePlaces.length})`);
      // If subdivision yields nothing, skip remaining sub-points for this hot point
      if (result.newUnique < COLD_THRESHOLD) break;
    }
  }

  if (done()) return { places: uniquePlaces, creditsUsed };

  // --- PHASE 4: Second ring (7km out, 8 points) ---
  const ring2 = generateRing(center, 7, 8);
  for (const point of ring2) {
    if (done()) break;
    const ll = `@${point.lat.toFixed(6)},${point.lng.toFixed(6)},13z`;
    const result = await serperQuery(primaryNicho, ll, apiKey, seenKeys, uniquePlaces);
    creditsUsed++;
    console.log(`[prospeccao] P4 ring2 → +${result.newUnique} new (total: ${uniquePlaces.length})`);
    // Skip remaining if area is very cold
    if (result.newUnique === 0) continue;
  }

  if (done()) return { places: uniquePlaces, creditsUsed };

  // --- PHASE 5: Third ring (12km, 10 points) — large cities only ---
  if (target > 100) {
    const ring3 = generateRing(center, 12, 10);
    for (const point of ring3) {
      if (done()) break;
      const ll = `@${point.lat.toFixed(6)},${point.lng.toFixed(6)},12z`;
      const result = await serperQuery(primaryNicho, ll, apiKey, seenKeys, uniquePlaces);
      creditsUsed++;
      console.log(`[prospeccao] P5 ring3 → +${result.newUnique} new (total: ${uniquePlaces.length})`);
      if (result.newUnique === 0) continue;
    }
  }

  return { places: uniquePlaces, creditsUsed };
}

// ========== FALLBACK (no geocoding) ==========

async function textOnlySearch(
  nichos: string[],
  cidade: string,
  estado: string,
  target: number,
  apiKey: string
): Promise<{ places: any[]; creditsUsed: number }> {
  const seenKeys = new Set<string>();
  const uniquePlaces: any[] = [];
  let creditsUsed = 0;

  for (const nicho of nichos) {
    if (uniquePlaces.length >= target) break;
    const result = await serperQuery(`${nicho} ${cidade} ${estado}`, "", apiKey, seenKeys, uniquePlaces);
    creditsUsed++;
  }

  return { places: uniquePlaces, creditsUsed };
}

// ========== MAIN HANDLER ==========

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
        console.log(`[prospeccao] Cache HIT (${cached.total} resultados, 0 créditos)`);
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

    // --- GEOCODE & SEARCH ---
    const center = await geocodeCity(cidadeTrimmed, estadoTrimmed);

    let searchResult: { places: any[]; creditsUsed: number };

    if (center) {
      console.log(`[prospeccao] Geocoded "${cidadeTrimmed}" → ${center.lat.toFixed(4)}, ${center.lng.toFixed(4)}`);
      searchResult = await adaptiveSearch(allNichos, center, requestedTotal, SERPER_API_KEY);
    } else {
      console.log(`[prospeccao] Geocoding falhou, fallback texto`);
      searchResult = await textOnlySearch(allNichos, cidadeTrimmed, estadoTrimmed, requestedTotal, SERPER_API_KEY);
    }

    const results = searchResult.places.slice(0, requestedTotal).map(mapPlace);
    console.log(`[prospeccao] Final: ${results.length} leads | ${searchResult.creditsUsed} créditos | ratio: ${(results.length / Math.max(searchResult.creditsUsed, 1)).toFixed(1)} leads/crédito`);

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
    } catch (cacheErr) {
      console.error("[prospeccao] Cache save error:", cacheErr);
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
