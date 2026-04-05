import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

function buildQueryVariations(nicho: string, cidade: string, estado: string, target: number): string[] {
  const variations = [
    `${nicho} em ${cidade}, ${estado}`,
    `${nicho} ${cidade} ${estado}`,
    `${nicho} perto de ${cidade} ${estado}`,
    `melhor ${nicho} ${cidade} ${estado}`,
    `${nicho} delivery ${cidade} ${estado}`,
    `${nicho} aberto agora ${cidade} ${estado}`,
    `${nicho} centro ${cidade} ${estado}`,
    `${nicho} popular ${cidade} ${estado}`,
    `${nicho} barato ${cidade} ${estado}`,
    `${nicho} novo ${cidade} ${estado}`,
    `${nicho} tradicional ${cidade} ${estado}`,
    `${nicho} recomendado ${cidade} ${estado}`,
    `${nicho} avaliado ${cidade} ${estado}`,
    `${nicho} bom ${cidade} ${estado}`,
    `${nicho} famoso ${cidade} ${estado}`,
    `${nicho} região ${cidade} ${estado}`,
    `${nicho} próximo ${cidade} ${estado}`,
    `${nicho} zona norte ${cidade} ${estado}`,
    `${nicho} zona sul ${cidade} ${estado}`,
    `${nicho} zona leste ${cidade} ${estado}`,
    `${nicho} zona oeste ${cidade} ${estado}`,
  ];
  const queriesNeeded = Math.ceil(target / 12);
  return variations.slice(0, Math.max(queriesNeeded, 1));
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

    const { nicho, estado, cidade, maxResults, forceRefresh } = await req.json();

    if (!nicho || !cidade || !estado) {
      return new Response(
        JSON.stringify({ error: "nicho, estado e cidade são obrigatórios" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // --- CACHE CHECK ---
    if (!forceRefresh) {
      const adminClient = createClient(supabaseUrl, serviceRoleKey);
      const { data: cached } = await adminClient
        .from("prospeccao_cache")
        .select("results, total, created_at")
        .eq("user_id", user.id)
        .ilike("nicho", nicho.trim())
        .ilike("estado", estado.trim())
        .ilike("cidade", cidade.trim())
        .gt("expires_at", new Date().toISOString())
        .maybeSingle();

      if (cached) {
        console.log(`[prospeccao] Cache HIT para "${nicho}" em "${cidade}, ${estado}" (${cached.total} resultados, salvo em ${cached.created_at})`);
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
    const queries = buildQueryVariations(nicho, cidade, estado, requestedTotal);

    console.log(`[prospeccao] Cache MISS - buscando "${nicho}" em "${cidade}, ${estado}" (target: ${requestedTotal}, queries: ${queries.length})`);

    const seenCids = new Set<string>();
    const allResults: any[] = [];

    for (let i = 0; i < queries.length; i++) {
      if (allResults.length >= requestedTotal) break;

      const query = queries[i];
      try {
        const serperResponse = await fetch("https://google.serper.dev/maps", {
          method: "POST",
          headers: { "X-API-KEY": SERPER_API_KEY, "Content-Type": "application/json" },
          body: JSON.stringify({ q: query, gl: "br", hl: "pt-br", num: 20 }),
        });

        if (!serperResponse.ok) {
          const errorText = await serperResponse.text();
          console.error(`[prospeccao] Serper error ${serperResponse.status}:`, errorText);
          if (i === 0) {
            return new Response(
              JSON.stringify({ error: `Erro na API Serper (${serperResponse.status})`, detail: errorText.slice(0, 500) }),
              { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
          }
          continue;
        }

        const data = await serperResponse.json();
        const places = data.places || [];

        for (const place of places) {
          const key = place.cid || place.placeId || `${place.title}_${place.address}`;
          if (!seenCids.has(key)) {
            seenCids.add(key);
            allResults.push(place);
          }
        }
      } catch (err) {
        console.error(`[prospeccao] Error on query "${query}":`, err);
        continue;
      }

      if (i < queries.length - 1) await new Promise(r => setTimeout(r, 200));
    }

    const results = allResults.slice(0, requestedTotal).map(mapPlace);

    // --- SAVE TO CACHE ---
    try {
      const adminClient = createClient(supabaseUrl, serviceRoleKey);
      await adminClient.from("prospeccao_cache").upsert({
        user_id: user.id,
        nicho: nicho.trim().toLowerCase(),
        estado: estado.trim().toLowerCase(),
        cidade: cidade.trim().toLowerCase(),
        results,
        total: results.length,
        created_at: new Date().toISOString(),
        expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      }, { onConflict: "user_id,lower(nicho),lower(estado),lower(cidade)" });
      console.log(`[prospeccao] Cache SAVED: ${results.length} resultados`);
    } catch (cacheErr) {
      console.error("[prospeccao] Cache save error:", cacheErr);
    }

    console.log(`[prospeccao] Total final: ${results.length} resultados únicos`);

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
