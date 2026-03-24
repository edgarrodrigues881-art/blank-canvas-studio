import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface ContactResult {
  phone: string;
  status: "pending" | "validating" | "ready" | "already_exists" | "invalid" | "failed" | "completed";
  error?: string;
}

interface ProgressState {
  queued: number;
  ok: number;
  fail: number;
  already: number;
  activeThreads: number;
  results: ContactResult[];
  done: boolean;
  durationSec: number;
  totalAttempts: number;
}

function normalizePhone(raw: string): string | null {
  // Strip everything except digits
  const digits = raw.replace(/[^\d]/g, "");
  // Must be at least 10 digits (DDD + number) and max 15
  if (digits.length < 10 || digits.length > 15) return null;
  // If it doesn't start with 55, prepend it
  const phone = digits.startsWith("55") ? digits : `55${digits}`;
  // Final validation: 55 + DDD(2) + number(8-9) = 12-13 digits
  if (phone.length < 12 || phone.length > 13) return null;
  return phone;
}

async function getGroupParticipants(
  baseUrl: string,
  token: string,
  groupId: string,
): Promise<Set<string>> {
  const participants = new Set<string>();
  try {
    const res = await fetch(`${baseUrl}/group/participants?groupJid=${groupId}`, {
      headers: { token, Accept: "application/json" },
    });
    if (res.ok) {
      const data = await res.json();
      // Uazapi returns participants array with number field
      const list = Array.isArray(data) ? data : data?.participants || data?.data || [];
      for (const p of list) {
        const num = (p.number || p.id || p.jid || "").replace(/@.*/, "").replace(/[^\d]/g, "");
        if (num) participants.add(num);
      }
    }
  } catch (e) {
    console.error("Error fetching participants:", e);
  }
  return participants;
}

async function addToGroup(
  baseUrl: string,
  token: string,
  groupId: string,
  phone: string,
): Promise<{ ok: boolean; status: number; error?: string; body?: any }> {
  try {
    const res = await fetch(`${baseUrl}/group/addParticipant`, {
      method: "POST",
      headers: {
        token,
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ groupJid: groupId, number: phone }),
    });
    const raw = await res.text();
    let body: any;
    try { body = JSON.parse(raw); } catch { body = { raw }; }
    
    if (res.status === 200 || res.status === 201) {
      return { ok: true, status: res.status, body };
    }
    
    // Check for "already in group" patterns
    const rawLower = raw.toLowerCase();
    if (rawLower.includes("already") || rawLower.includes("já") || res.status === 409) {
      return { ok: false, status: 409, error: "already_exists", body };
    }
    
    return { ok: false, status: res.status, error: raw.substring(0, 200), body };
  } catch (e: any) {
    return { ok: false, status: 0, error: e.message || "network_error" };
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const sb = createClient(supabaseUrl, serviceKey);

    // Auth check
    const authHeader = req.headers.get("authorization") || "";
    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await sb.auth.getUser(token);
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Check if admin — if not, user can still use but scoped to own devices
    const { data: roleData } = await sb.from("user_roles").select("role").eq("user_id", user.id).eq("role", "admin").maybeSingle();
    const isAdmin = !!roleData;

    const body = await req.json();
    const { action } = body;

    // ── ACTION: validate ──
    // Normalizes, deduplicates, validates contacts. Returns preview before processing.
    if (action === "validate") {
      const { contacts: rawContacts } = body;
      if (!Array.isArray(rawContacts) || rawContacts.length === 0) {
        return new Response(JSON.stringify({ error: "No contacts provided" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const seen = new Set<string>();
      const valid: string[] = [];
      const invalid: string[] = [];
      const duplicates: string[] = [];

      for (const raw of rawContacts) {
        const normalized = normalizePhone(String(raw));
        if (!normalized) {
          invalid.push(String(raw));
          continue;
        }
        if (seen.has(normalized)) {
          duplicates.push(String(raw));
          continue;
        }
        seen.add(normalized);
        valid.push(normalized);
      }

      return new Response(JSON.stringify({
        total: rawContacts.length,
        valid,
        invalid,
        duplicates,
        validCount: valid.length,
        invalidCount: invalid.length,
        duplicateCount: duplicates.length,
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── ACTION: check-participants ──
    // Checks which contacts already exist in the group
    if (action === "check-participants") {
      const { groupId, deviceId, contacts } = body;
      if (!groupId || !deviceId || !Array.isArray(contacts)) {
        return new Response(JSON.stringify({ error: "Missing groupId, deviceId, or contacts" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Get device credentials — scope to user's own devices if not admin
      const deviceQuery = sb.from("devices").select("uazapi_base_url, uazapi_token, user_id").eq("id", deviceId);
      if (!isAdmin) deviceQuery.eq("user_id", user.id);
      const { data: device } = await deviceQuery.single();
      if (!device?.uazapi_base_url || !device?.uazapi_token) {
        return new Response(JSON.stringify({ error: "Device not found or missing credentials" }), {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const participants = await getGroupParticipants(device.uazapi_base_url, device.uazapi_token, groupId);
      
      const ready: string[] = [];
      const alreadyExists: string[] = [];

      for (const phone of contacts) {
        if (participants.has(phone)) {
          alreadyExists.push(phone);
        } else {
          ready.push(phone);
        }
      }

      return new Response(JSON.stringify({
        ready,
        alreadyExists,
        readyCount: ready.length,
        alreadyExistsCount: alreadyExists.length,
        totalParticipants: participants.size,
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── ACTION: process ──
    // Actually adds contacts to the group with concurrent workers
    if (action === "process") {
      const { groupId, deviceId, contacts, concurrency = 3 } = body;
      if (!groupId || !deviceId || !Array.isArray(contacts) || contacts.length === 0) {
        return new Response(JSON.stringify({ error: "Missing required fields" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { data: device } = await sb.from("devices").select("uazapi_base_url, uazapi_token").eq("id", deviceId).single();
      if (!device?.uazapi_base_url || !device?.uazapi_token) {
        return new Response(JSON.stringify({ error: "Device not found" }), {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const baseUrl = device.uazapi_base_url;
      const apiToken = device.uazapi_token;

      // Build queue
      const queue = [...contacts];
      const results: ContactResult[] = [];
      let ok = 0;
      let fail = 0;
      let already = 0;
      let totalAttempts = 0;
      const startTime = Date.now();
      const maxConcurrency = Math.min(concurrency, 5);

      // Worker function
      async function worker() {
        while (queue.length > 0) {
          const phone = queue.shift();
          if (!phone) break;

          totalAttempts++;
          const result = await addToGroup(baseUrl, apiToken, groupId, phone);

          if (result.ok) {
            ok++;
            results.push({ phone, status: "completed" });
          } else if (result.error === "already_exists" || result.status === 409) {
            already++;
            results.push({ phone, status: "already_exists" });
          } else if (result.status === 429) {
            // Rate limited — put back in queue and wait
            queue.push(phone);
            const waitTime = 60; // seconds
            console.log(`Rate limited, waiting ${waitTime}s before retry for ${phone}`);
            await new Promise(r => setTimeout(r, waitTime * 1000));
          } else {
            fail++;
            const errorMsg = typeof result.error === "string" 
              ? result.error.substring(0, 100) 
              : "Falha desconhecida";
            results.push({ phone, status: "failed", error: errorMsg });
          }

          // Small delay between requests to avoid hammering the API
          await new Promise(r => setTimeout(r, 1500 + Math.random() * 1000));
        }
      }

      // Run workers concurrently
      const workers = Array.from({ length: maxConcurrency }, () => worker());
      await Promise.all(workers);

      const durationSec = Math.round((Date.now() - startTime) / 1000);

      return new Response(JSON.stringify({
        ok,
        fail,
        already,
        total: contacts.length,
        durationSec,
        totalAttempts,
        results,
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "Unknown action" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    console.error("mass-group-inject error:", e);
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
