import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

// Build many diverse queries to maximize unique results
function buildAllQueries(nicho: string, nichosRelacionados: string[], cidade: string, estado: string, target: number): string[] {
  const allNichos = [nicho, ...nichosRelacionados];

  // Many different query patterns to get diverse results from Google Maps
  const patterns: ((n: string, c: string, e: string) => string)[] = [
    (n, c, e) => `${n} ${c} ${e}`,
    (n, c) => `${n} em ${c}`,
    (n, c) => `${n} ${c}`,
    (n, c) => `${n} perto ${c}`,
    (n, c) => `melhor ${n} ${c}`,
    (n, c) => `${n} delivery ${c}`,
    (n, c) => `${n} centro ${c}`,
    (n, c) => `${n} ${c} centro`,
    (n, c) => `${n} popular ${c}`,
    (n, c) => `${n} barato ${c}`,
    (n, c) => `${n} famoso ${c}`,
    (n, c) => `${n} tradicional ${c}`,
    (n, c) => `${n} novo ${c}`,
    (n, c) => `${n} recomendado ${c}`,
    (n, c) => `${n} aberto agora ${c}`,
    (n, c) => `${n} bom ${c}`,
    (n, c) => `${n} perto de mim ${c}`,
    (n, c) => `${n} ${c} zona norte`,
    (n, c) => `${n} ${c} zona sul`,
    (n, c) => `${n} ${c} zona leste`,
    (n, c) => `${n} ${c} zona oeste`,
    (n, c) => `${n} ${c} região central`,
    (n, c) => `top ${n} ${c}`,
    (n, c) => `lista ${n} ${c}`,
    (n, c) => `${n} mais avaliado ${c}`,
    (n, c) => `${n} proximos ${c}`,
    (n, c, e) => `${n} ${e}`,
    (n, c) => `onde encontrar ${n} ${c}`,
    (n, c) => `${n} aberto ${c}`,
    (n, c) => `${n} com telefone ${c}`,
    (n, c) => `${n} ${c} bairro`,
    (n, c) => `${n} whatsapp ${c}`,
    (n, c) => `${n} atacado ${c}`,
    (n, c) => `${n} varejo ${c}`,
    (n, c) => `${n} loja ${c}`,
    (n, c) => `${n} serviço ${c}`,
    (n, c) => `${n} profissional ${c}`,
  ];

  const queries: string[] = [];
  const seen = new Set<string>();

  for (const n of allNichos) {
    for (const pattern of patterns) {
      const q = pattern(n, cidade, estado).trim();
      const key = q.toLowerCase();
      if (!seen.has(key)) {
        seen.add(key);
        queries.push(q);
      }
    }
  }

  // Calculate how many queries we need: each returns ~20 results, after dedup maybe 40%
  // So we need roughly target / 8 queries
  const queriesNeeded = Math.ceil(target / 8);
  return queries.slice(0, Math.max(queriesNeeded, 5));
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

// Fire multiple Serper requests in parallel for speed
async function fetchSerperBatch(queries: string[], apiKey: string): Promise<any[]> {
  const BATCH_SIZE = 5;
  const allPlaces: any[] = [];

  for (let i = 0; i < queries.length; i += BATCH_SIZE) {
    const batch = queries.slice(i, i + BATCH_SIZE);
    const promises = batch.map(async (query) => {
      try {
        const res = await fetch("https://google.serper.dev/maps", {
          method: "POST",
          headers: { "X-API-KEY": apiKey, "Content-Type": "application/json" },
          body: JSON.stringify({ q: query, gl: "br", hl: "pt-br", num: 40 }),
        });
        if (!res.ok) {
          console.error(`[prospeccao] Serper ${res.status} for "${query}"`);
          return [];
        }
        const data = await res.json();
        return data.places || [];
      } catch (err) {
        console.error(`[prospeccao] Error for "${query}":`, err);
        return [];
      }
    });

    const results = await Promise.all(promises);
    for (const places of results) {
      allPlaces.push(...places);
    }

    // Small delay between batches to avoid rate limits
    if (i + BATCH_SIZE < queries.length) {
      await new Promise(r => setTimeout(r, 120));
    }
  }

  return allPlaces;
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
        console.log(`[prospeccao] Cache HIT "${nichoTrimmed}" em "${cidadeTrimmed}" (${cached.total} resultados)`);
        return new Response(JSON.stringify({
          results: cached.results,
          total: cached.total,
          fromCache: true,
          cachedAt: cached.created_at,
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
    const queries = buildAllQueries(nichoTrimmed, relatedNiches, cidadeTrimmed, estadoTrimmed, requestedTotal);

    console.log(`[prospeccao] Cache MISS - buscando "${nichoTrimmed}" em "${cidadeTrimmed}" (target: ${requestedTotal}, queries: ${queries.length})`);

    // Fetch all queries in parallel batches for speed
    const allPlaces = await fetchSerperBatch(queries, SERPER_API_KEY);

    // Deduplicate by multiple keys
    const seenKeys = new Set<string>();
    const uniquePlaces: any[] = [];
    for (const place of allPlaces) {
      const key = place.cid || place.placeId || `${place.title}_${place.address}`;
      if (!seenKeys.has(key)) {
        seenKeys.add(key);
        uniquePlaces.push(place);
      }
    }

    const results = uniquePlaces.slice(0, requestedTotal).map(mapPlace);

    console.log(`[prospeccao] Total: ${allPlaces.length} brutos → ${uniquePlaces.length} únicos → ${results.length} retornados (queries: ${queries.length})`);

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

    return new Response(JSON.stringify({ results, total: results.length, fromCache: false }), {
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
