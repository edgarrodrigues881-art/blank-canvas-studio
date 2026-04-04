import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

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
    const query = `${nicho} em ${cidade}, ${estado}`;

    console.log(
      `[prospeccao] Buscando "${query}" (max: ${requestedTotal})`
    );

    // Serper /maps returns ~20 results per page, paginate to get more
    const perPage = 20;
    const pages = Math.ceil(requestedTotal / perPage);
    const allResults: any[] = [];
    const seenCids = new Set<string>();

    for (let page = 1; page <= pages; page++) {
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
          num: perPage,
          page,
        }),
      });

      if (!serperResponse.ok) {
        const errorText = await serperResponse.text();
        console.error(`[prospeccao] Serper error ${serperResponse.status}:`, errorText);
        if (page === 1) {
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
        break;
      }

      const data = await serperResponse.json();
      const places = data.places || [];

      // Deduplicate by cid
      for (const place of places) {
        const key = place.cid || place.placeId || place.title;
        if (!seenCids.has(key)) {
          seenCids.add(key);
          allResults.push(place);
        }
      }

      console.log(`[prospeccao] Página ${page}: ${places.length} resultados (total acumulado: ${allResults.length})`);

      // Stop if no more results or we have enough
      if (places.length < perPage || allResults.length >= requestedTotal) break;

      // Small delay between pages to avoid rate limiting
      if (page < pages) {
        await new Promise(r => setTimeout(r, 300));
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

    console.log(`[prospeccao] Total final: ${results.length} resultados`);

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
