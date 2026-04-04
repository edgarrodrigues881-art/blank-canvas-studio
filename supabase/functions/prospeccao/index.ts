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
    // Auth check
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
    const { data: claimsData, error: claimsError } =
      await supabase.auth.getClaims(token);
    if (claimsError || !claimsData?.claims) {
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

    const APIFY_API_KEY = Deno.env.get("APIFY_API_KEY");
    if (!APIFY_API_KEY) {
      return new Response(
        JSON.stringify({ error: "APIFY_API_KEY não configurada" }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const locationQuery = `${cidade}, ${estado}, Brasil`;
    const limit = Math.min(maxResults || 50, 200);

    console.log(
      `[prospeccao] Buscando "${nicho}" em "${locationQuery}" (max: ${limit})`
    );

    // Use Apify's sync endpoint to run actor and get dataset items directly
    const apifyUrl = `https://api.apify.com/v2/acts/compass~crawler-google-places/run-sync-get-dataset-items?token=${APIFY_API_KEY}&timeout=120`;

    const apifyResponse = await fetch(apifyUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        searchStringsArray: [nicho],
        locationQuery,
        maxCrawledPlacesPerSearch: limit,
        language: "pt-BR",
        deeperCityScrape: false,
        skipClosedPlaces: true,
      }),
    });

    if (!apifyResponse.ok) {
      const errorText = await apifyResponse.text();
      console.error(`[prospeccao] Apify error ${apifyResponse.status}:`, errorText);
      return new Response(
        JSON.stringify({
          error: `Erro na API Apify (${apifyResponse.status})`,
          detail: errorText.slice(0, 500),
        }),
        {
          status: 502,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const rawResults = await apifyResponse.json();

    // Map to clean structure
    const results = (Array.isArray(rawResults) ? rawResults : []).map(
      (item: any) => ({
        nome: item.title || item.name || "",
        endereco: item.address || item.street || "",
        telefone: item.phone || item.phoneUnformatted || "",
        website: item.website || item.url || "",
        avaliacao: item.totalScore || item.rating || null,
        totalAvaliacoes: item.reviewsCount || item.reviews || 0,
        categoria: item.categoryName || item.category || "",
        categorias:
          item.categories || (item.categoryName ? [item.categoryName] : []),
        horario: item.openingHours || item.hours || null,
        latitude: item.location?.lat || null,
        longitude: item.location?.lng || null,
        googleMapsUrl: item.url || item.googleMapsUrl || "",
        placeId: item.placeId || "",
        imagem: item.imageUrl || item.thumbnailUrl || "",
      })
    );

    console.log(`[prospeccao] Encontrados ${results.length} resultados`);

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
