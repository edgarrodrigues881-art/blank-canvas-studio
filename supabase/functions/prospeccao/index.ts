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

    const location = `${cidade}, ${estado}, Brazil`;
    const limit = Math.min(maxResults || 50, 100); // Serper returns max 100 per request

    console.log(
      `[prospeccao] Buscando "${nicho}" em "${location}" (max: ${limit})`
    );

    // Calculate how many pages we need (Serper returns max 100 per request)
    const requestedTotal = Math.min(maxResults || 50, 5000);
    const pages = Math.ceil(requestedTotal / 100);
    const allResults: any[] = [];

    for (let page = 0; page < pages; page++) {
      const serperResponse = await fetch("https://google.serper.dev/places", {
        method: "POST",
        headers: {
          "X-API-KEY": SERPER_API_KEY,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          q: `${nicho} em ${cidade}`,
          gl: "br",
          hl: "pt-br",
          location,
          num: 100,
          page: page + 1,
        }),
      });

      if (!serperResponse.ok) {
        const errorText = await serperResponse.text();
        console.error(`[prospeccao] Serper error ${serperResponse.status}:`, errorText);
        if (page === 0) {
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
        break; // If subsequent pages fail, return what we have
      }

      const data = await serperResponse.json();
      const places = data.places || [];
      allResults.push(...places);

      console.log(`[prospeccao] Página ${page + 1}: ${places.length} resultados`);

      // If we got fewer results than requested, no more pages
      if (places.length < 100) break;

      // Small delay between pages
      if (page < pages - 1) {
        await new Promise(r => setTimeout(r, 500));
      }
    }

    // Map Serper response to our format
    const results = allResults.slice(0, requestedTotal).map((item: any) => ({
      nome: item.title || "",
      endereco: item.address || "",
      telefone: item.phoneNumber || "",
      website: item.website || "",
      avaliacao: item.rating || null,
      totalAvaliacoes: item.ratingCount || 0,
      categoria: item.category || item.type || "",
      categorias: item.categories || (item.category ? [item.category] : []),
      horario: item.openingHours || null,
      googleMapsUrl: item.placeLink || item.cid ? `https://www.google.com/maps/place/?q=place_id:${item.placeId || ""}` : "",
      placeId: item.placeId || "",
      imagem: item.thumbnailUrl || item.imageUrl || "",
      email: "", // Serper doesn't provide email directly
      instagram: "",
      facebook: "",
      descricao: item.description || "",
      faixaPreco: item.priceRange || item.price || "",
      permanentementeFechado: false,
      latitude: item.latitude || null,
      longitude: item.longitude || null,
    }));

    console.log(`[prospeccao] Total: ${results.length} resultados`);

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
