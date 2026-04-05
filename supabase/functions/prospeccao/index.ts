import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

/**
 * Build the MINIMUM number of queries needed.
 * Each Serper Maps call returns ~20 results.
 * Strategy: 1 query per niche, stop when we have enough.
 */
function buildQueries(nicho: string, nichosRelacionados: string[], cidade: string, estado: string, target: number): string[] {
  const allNichos = [nicho, ...nichosRelacionados];
  const queries: string[] = [];
  const seen = new Set<string>();

  // Primary pattern: "{nicho} {cidade} {estado}" — best results
  for (const n of allNichos) {
    const q = `${n} ${cidade} ${estado}`.trim();
    const key = q.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      queries.push(q);
    }
  }

  // If we still need more queries, add zone variations ONLY for the main niche
  if (queries.length * 20 < target) {
    const zones = ["zona norte", "zona sul", "zona leste", "zona oeste", "centro"];
    for (const zone of zones) {
      if (queries.length * 20 >= target) break;
      const q = `${nicho} ${cidade} ${zone}`.trim();
      const key = q.toLowerCase();
      if (!seen.has(key)) {
        seen.add(key);
        queries.push(q);
      }
    }
  }

  // If STILL not enough, add adjective variations
  if (queries.length * 20 < target) {
    const adjectives = ["melhor", "top", "delivery", "aberto agora"];
    for (const adj of adjectives) {
      if (queries.length * 20 >= target) break;
      const q = `${adj} ${nicho} ${cidade}`.trim();
      const key = q.toLowerCase();
      if (!seen.has(key)) {
        seen.add(key);
        queries.push(q);
      }
    }
  }

  return queries;
}

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
 * Fetch results progressively — stop as soon as we have enough unique leads.
 * This avoids wasting credits on queries we don't need.
 */
async function fetchSerperProgressive(queries: string[], apiKey: string, target: number): Promise<{ places: any[], creditsUsed: number }> {
  const seenKeys = new Set<string>();
  const uniquePlaces: any[] = [];
  let creditsUsed = 0;

  for (const query of queries) {
    // Stop early if we already have enough
    if (uniquePlaces.length >= target) break;

    try {
      const res = await fetch("https://google.serper.dev/maps", {
        method: "POST",
        headers: { "X-API-KEY": apiKey, "Content-Type": "application/json" },
        body: JSON.stringify({ q: query, gl: "br", hl: "pt-br", num: 20 }),
      });
      creditsUsed++;

      if (!res.ok) {
        console.error(`[prospeccao] Serper ${res.status} for "${query}"`);
        continue;
      }

      const data = await res.json();
      const places = data.places || [];

      for (const place of places) {
        const key = place.cid || place.placeId || `${place.title}_${place.address}`;
        if (!seenKeys.has(key)) {
          seenKeys.add(key);
          uniquePlaces.push(place);
        }
      }

      console.log(`[prospeccao] Query "${query}" → ${places.length} raw, ${uniquePlaces.length} unique total (target: ${target})`);
    } catch (err) {
      console.error(`[prospeccao] Error for "${query}":`, err);
      creditsUsed++; // still counts
    }
  }

  return { places: uniquePlaces, creditsUsed };
}

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
    const queries = buildQueries(nichoTrimmed, relatedNiches, cidadeTrimmed, estadoTrimmed, requestedTotal);

    console.log(`[prospeccao] Cache MISS - buscando "${nichoTrimmed}" em "${cidadeTrimmed}" (target: ${requestedTotal}, queries disponíveis: ${queries.length})`);

    // Fetch progressively — stops as soon as we have enough
    const { places: uniquePlaces, creditsUsed } = await fetchSerperProgressive(queries, SERPER_API_KEY, requestedTotal);

    const results = uniquePlaces.slice(0, requestedTotal).map(mapPlace);

    console.log(`[prospeccao] Final: ${uniquePlaces.length} únicos → ${results.length} retornados | Créditos usados: ${creditsUsed}`);

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
