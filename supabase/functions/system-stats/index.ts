import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

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
  const { data: claimsData, error: claimsError } = await supabase.auth.getClaims(token);
  if (claimsError || !claimsData?.claims) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    // Total contacts
    const { count: totalContacts } = await supabase
      .from("contacts")
      .select("*", { count: "exact", head: true });

    // Total templates
    const { count: totalTemplates } = await supabase
      .from("templates")
      .select("*", { count: "exact", head: true });

    // Total campaigns
    const { count: totalCampaigns } = await supabase
      .from("campaigns")
      .select("*", { count: "exact", head: true });

    // Campaign stats by status
    const { data: campaigns } = await supabase
      .from("campaigns")
      .select("status, sent_count, failed_count, delivered_count, total_contacts");

    const campaignStats = {
      draft: 0,
      pending: 0,
      processing: 0,
      completed: 0,
      scheduled: 0,
      totalSent: 0,
      totalFailed: 0,
      totalDelivered: 0,
    };

    for (const c of campaigns || []) {
      if (c.status in campaignStats) {
        (campaignStats as any)[c.status]++;
      }
      campaignStats.totalSent += c.sent_count || 0;
      campaignStats.totalFailed += c.failed_count || 0;
      campaignStats.totalDelivered += c.delivered_count || 0;
    }

    // Recent campaigns
    const { data: recentCampaigns } = await supabase
      .from("campaigns")
      .select("id, name, status, total_contacts, sent_count, created_at")
      .order("created_at", { ascending: false })
      .limit(5);

    // Contacts with tags breakdown
    const { data: contactsWithTags } = await supabase
      .from("contacts")
      .select("tags");

    const tagCounts: Record<string, number> = {};
    for (const c of contactsWithTags || []) {
      for (const tag of c.tags || []) {
        tagCounts[tag] = (tagCounts[tag] || 0) + 1;
      }
    }

    return new Response(
      JSON.stringify({
        contacts: { total: totalContacts || 0, tagBreakdown: tagCounts },
        templates: { total: totalTemplates || 0 },
        campaigns: {
          total: totalCampaigns || 0,
          ...campaignStats,
          recent: recentCampaigns || [],
        },
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
