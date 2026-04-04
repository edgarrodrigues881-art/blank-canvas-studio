import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

// Generate query variations to get more unique results from Serper
function buildQueryVariations(nicho: string, cidade: string, estado: string, target: number): string[] {
  const base = `${nicho} ${cidade} ${estado}`;
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

  // Each query returns ~20 results, estimate how many queries we need
  const queriesNeeded = Math.ceil(target / 12); // ~12 unique per query after dedup
  return variations.slice(0, Math.max(queriesNeeded, 1));
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

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);
    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { nicho, estado, cidade, maxResults } = await req.json();

    if (!nicho || !cidade || !estado) {
      return new Response(
        JSON.stringify({ error: "nicho, estado e cidade são obrigatórios" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const SERPER_API_KEY = Deno.env.get("SERPER_API_KEY");
    if (!SERPER_API_KEY) {
      return new Response(
        JSON.stringify({ error: "SERPER_API_KEY não configurada" }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const requestedTotal = Math.min(maxResults || 50, 5000);
    const queries = buildQueryVariations(nicho, cidade, estado, requestedTotal);

    console.log(
      `[prospeccao] Buscando "${nicho}" em "${cidade}, ${estado}" (target: ${requestedTotal}, queries: ${queries.length})`
    );

    const seenCids = new Set<string>();
    const allResults: any[] = [];

    for (let i = 0; i < queries.length; i++) {
      if (allResults.length >= requestedTotal) break;

      const query = queries[i];
      try {
        const serperResponse = await fetch("https://google.serper.dev/maps", {
          method: "POST",
          headers: {
            "X-API-KEY": SERPER_API_KEY,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            q: query,
            gl: "br",
            hl: "pt-br",
            num: 20,
          }),
        });

        if (!serperResponse.ok) {
          const errorText = await serperResponse.text();
          console.error(`[prospeccao] Serper error ${serperResponse.status} for query "${query}":`, errorText);
          if (i === 0) {
            return new Response(
              JSON.stringify({
                error: `Erro na API Serper (${serperResponse.status})`,
                detail: errorText.slice(0, 500),
              }),
              {
                status: 502,
                headers: { ...corsHeaders, "Content-Type": "application/json" },
              }
            );
          }
          continue;
        }

        const data = await serperResponse.json();
        const places = data.places || [];
        let newCount = 0;

        for (const place of places) {
          const key = place.cid || place.placeId || `${place.title}_${place.address}`;
          if (!seenCids.has(key)) {
            seenCids.add(key);
            allResults.push(place);
            newCount++;
          }
        }

        console.log(`[prospeccao] Query ${i + 1}/${queries.length}: "${query}" → ${places.length} resultados, ${newCount} novos (total: ${allResults.length})`);
      } catch (err) {
        console.error(`[prospeccao] Error on query "${query}":`, err);
        continue;
      }

      // Small delay between requests
      if (i < queries.length - 1) {
        await new Promise(r => setTimeout(r, 200));
      }
    }

    // Map Serper /maps response to our format
    const results = allResults.slice(0, requestedTotal).map((item: any) => ({
      nome: item.title || "",
      endereco: item.address || "",
      telefone: item.phoneNumber || "",
      website: item.website || "",
      avaliacao: item.rating || null,
      totalAvaliacoes: item.ratingCount || 0,
      categoria: item.type || item.category || "",
      categorias: item.types || (item.type ? [item.type] : []),
      horario: item.openingHours || null,
      googleMapsUrl: item.cid
        ? `https://www.google.com/maps?cid=${item.cid}`
        : "",
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
    }));

    console.log(`[prospeccao] Total final: ${results.length} resultados únicos`);

    return new Response(JSON.stringify({ results, total: results.length }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("[prospeccao] Error:", error);
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : "Erro interno",
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
