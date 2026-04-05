import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

// ---------- GEO UTILITIES ----------

interface GeoPoint { lat: number; lng: number; }

/**
 * Get city center coordinates using Nominatim (free, no API key).
 */
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
  } catch (err) {
    console.error("[prospeccao] Geocoding error:", err);
    return null;
  }
}

/**
 * Generate a grid of search points around a center.
 * radiusKm: how far from center to spread
 * spacing: distance between grid points in km
 */
function generateGrid(center: GeoPoint, radiusKm: number, spacingKm: number): GeoPoint[] {
  const points: GeoPoint[] = [center]; // Always include center
  const latDeg = spacingKm / 111; // 1° lat ≈ 111km
  const lngDeg = spacingKm / (111 * Math.cos(center.lat * Math.PI / 180));
  const steps = Math.ceil(radiusKm / spacingKm);

  for (let i = -steps; i <= steps; i++) {
    for (let j = -steps; j <= steps; j++) {
      if (i === 0 && j === 0) continue; // skip center, already added
      const lat = center.lat + i * latDeg;
      const lng = center.lng + j * lngDeg;
      // Only include points within the radius circle
      const dist = Math.sqrt((i * spacingKm) ** 2 + (j * spacingKm) ** 2);
      if (dist <= radiusKm) {
        points.push({ lat, lng });
      }
    }
  }

  return points;
}

/**
 * Determine grid parameters based on city size (estimated by target leads).
 * Small cities → smaller grid, large cities → wider coverage.
 */
function getGridParams(target: number): { radiusKm: number; spacingKm: number; zoom: number } {
  if (target <= 30) return { radiusKm: 3, spacingKm: 3, zoom: 14 };
  if (target <= 100) return { radiusKm: 6, spacingKm: 4, zoom: 13 };
  if (target <= 300) return { radiusKm: 10, spacingKm: 5, zoom: 12 };
  if (target <= 1000) return { radiusKm: 15, spacingKm: 5, zoom: 12 };
  return { radiusKm: 20, spacingKm: 6, zoom: 11 };
}

// ---------- SERPER LOGIC ----------

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
    email: "",
    instagram: "",
    facebook: "",
    descricao: item.description || "",
    faixaPreco: item.priceLevel || "",
    permanentementeFechado: false,
    latitude: item.latitude || null,
    longitude: item.longitude || null,
  };
}

/**
 * Build search tasks: each niche × each grid point = 1 potential query.
 * We search progressively and stop when target is reached.
 */
interface SearchTask { query: string; ll: string; }

function buildSearchTasks(nichos: string[], gridPoints: GeoPoint[], zoom: number): SearchTask[] {
  const tasks: SearchTask[] = [];
  // Interleave: for each grid point, do all niches — this maximizes geographic spread
  for (const point of gridPoints) {
    const ll = `@${point.lat.toFixed(6)},${point.lng.toFixed(6)},${zoom}z`;
    for (const nicho of nichos) {
      tasks.push({ query: nicho, ll });
    }
  }
  return tasks;
}

/**
 * Fetch results progressively — stop as soon as we have enough unique leads.
 * Each API call = 1 credit.
 */
async function fetchSerperProgressive(
  tasks: SearchTask[],
  apiKey: string,
  target: number
): Promise<{ places: any[]; creditsUsed: number }> {
  const seenKeys = new Set<string>();
  const uniquePlaces: any[] = [];
  let creditsUsed = 0;

  for (const task of tasks) {
    if (uniquePlaces.length >= target) break;

    try {
      const body: any = {
        q: task.query,
        gl: "br",
        hl: "pt-br",
        num: 20,
      };
      if (task.ll) {
        body.ll = task.ll;
      }

      const res = await fetch("https://google.serper.dev/maps", {
        method: "POST",
        headers: { "X-API-KEY": apiKey, "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      creditsUsed++;

      if (!res.ok) {
        console.error(`[prospeccao] Serper ${res.status} for "${task.query}" at ${task.ll}`);
        continue;
      }

      const data = await res.json();
      const places = data.places || [];

      for (const place of places) {
        const key = place.cid || place.placeId || `${(place.title || "").toLowerCase()}_${(place.address || "").toLowerCase()}`;
        if (!seenKeys.has(key)) {
          seenKeys.add(key);
          uniquePlaces.push(place);
        }
      }

      console.log(`[prospeccao] "${task.query}" ${task.ll} → ${places.length} raw, ${uniquePlaces.length} unique (target: ${target})`);
    } catch (err) {
      console.error(`[prospeccao] Error:`, err);
      creditsUsed++;
    }
  }

  return { places: uniquePlaces, creditsUsed };
}

// ---------- MAIN HANDLER ----------

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
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
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
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

    // --- CACHE CHECK ---
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
        console.log(`[prospeccao] Cache HIT "${nichoTrimmed}" em "${cidadeTrimmed}" (${cached.total} resultados, 0 créditos)`);
        return new Response(JSON.stringify({
          results: cached.results,
          total: cached.total,
          fromCache: true,
          cachedAt: cached.created_at,
          creditsUsed: 0,
        }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    // --- SERPER API ---
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

    // --- GEOCODE CITY ---
    const center = await geocodeCity(cidadeTrimmed, estadoTrimmed);
    
    let tasks: SearchTask[];
    
    if (center) {
      const { radiusKm, spacingKm, zoom } = getGridParams(requestedTotal);
      const gridPoints = generateGrid(center, radiusKm, spacingKm);
      tasks = buildSearchTasks(allNichos, gridPoints, zoom);
      console.log(`[prospeccao] Grid: ${gridPoints.length} pontos (raio ${radiusKm}km, espaçamento ${spacingKm}km) × ${allNichos.length} nichos = ${tasks.length} tasks disponíveis`);
    } else {
      // Fallback: text-only queries without coordinates
      console.log(`[prospeccao] Geocoding falhou, usando busca por texto`);
      tasks = allNichos.map(n => ({ query: `${n} ${cidadeTrimmed} ${estadoTrimmed}`, ll: "" }));
    }

    console.log(`[prospeccao] Buscando "${nichoTrimmed}" em "${cidadeTrimmed}" (target: ${requestedTotal})`);

    const { places: uniquePlaces, creditsUsed } = await fetchSerperProgressive(tasks, SERPER_API_KEY, requestedTotal);
    const results = uniquePlaces.slice(0, requestedTotal).map(mapPlace);

    console.log(`[prospeccao] Final: ${uniquePlaces.length} únicos → ${results.length} retornados | Créditos: ${creditsUsed}`);

    // --- SAVE TO CACHE ---
    try {
      const adminClient = createClient(supabaseUrl, serviceRoleKey);
      await adminClient.from("prospeccao_cache").upsert({
        user_id: user.id,
        nicho: nichoTrimmed.toLowerCase(),
        estado: estadoTrimmed.toLowerCase(),
        cidade: cidadeTrimmed.toLowerCase(),
        results,
        total: results.length,
        created_at: new Date().toISOString(),
        expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      }, { onConflict: "user_id,lower(nicho),lower(estado),lower(cidade)" });
      console.log(`[prospeccao] Cache SAVED: ${results.length} resultados`);
    } catch (cacheErr) {
      console.error("[prospeccao] Cache save error:", cacheErr);
    }

    return new Response(JSON.stringify({ results, total: results.length, fromCache: false, creditsUsed }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("[prospeccao] Error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Erro interno" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
