// Approve and send AI-detected scheduled dispatch
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(supabaseUrl, serviceKey);

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Unauthorized" }, 401);
    const userClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData } = await userClient.auth.getUser();
    if (!userData?.user) return json({ error: "Unauthorized" }, 401);
    const userId = userData.user.id;

    const { dispatch_id, action } = await req.json();
    if (!dispatch_id || !action) return json({ error: "dispatch_id and action required" }, 400);

    const { data: dispatch } = await admin
      .from("ai_scheduled_dispatches")
      .select("*")
      .eq("id", dispatch_id)
      .eq("user_id", userId)
      .single();

    if (!dispatch) return json({ error: "Dispatch not found" }, 404);
    if (dispatch.status !== "pending") return json({ error: "Already processed" }, 400);

    if (action === "reject") {
      await admin.from("ai_scheduled_dispatches").update({ status: "rejected" }).eq("id", dispatch_id);
      return json({ ok: true, status: "rejected" });
    }

    if (action !== "approve") return json({ error: "invalid action" }, 400);

    // Approve: schedule the message in scheduled_messages
    const scheduledFor = new Date(dispatch.scheduled_for);
    const isPast = scheduledFor.getTime() <= Date.now();

    if (isPast) {
      // Send immediately by inserting into scheduled_messages with current time
      await admin.from("scheduled_messages").insert({
        user_id: userId,
        contact_name: dispatch.contact_name || dispatch.contact_phone,
        contact_phone: dispatch.contact_phone,
        message_content: dispatch.message_content,
        scheduled_at: new Date().toISOString(),
        device_id: dispatch.device_id,
        status: "pending",
        lead_id: dispatch.contact_id,
      });
    } else {
      await admin.from("scheduled_messages").insert({
        user_id: userId,
        contact_name: dispatch.contact_name || dispatch.contact_phone,
        contact_phone: dispatch.contact_phone,
        message_content: dispatch.message_content,
        scheduled_at: dispatch.scheduled_for,
        device_id: dispatch.device_id,
        status: "pending",
        lead_id: dispatch.contact_id,
      });
    }

    await admin.from("ai_scheduled_dispatches").update({
      status: "approved",
      approved_at: new Date().toISOString(),
    }).eq("id", dispatch_id);

    return json({ ok: true, status: "approved" });
  } catch (err: any) {
    console.error("ai-dispatch-approve error:", err);
    return json({ error: err.message || "Internal error" }, 500);
  }
});
