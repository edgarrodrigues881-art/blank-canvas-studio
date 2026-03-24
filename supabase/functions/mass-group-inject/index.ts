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
  deviceUsed?: string;
}

function normalizePhone(raw: string): string | null {
  const digits = raw.replace(/[^\d]/g, "");
  if (digits.length < 10 || digits.length > 15) return null;
  const phone = digits.startsWith("55") ? digits : `55${digits}`;
  if (phone.length < 12 || phone.length > 13) return null;
  return phone;
}

async function getDeviceCredentials(sb: any, deviceId: string, userId: string, isAdmin: boolean) {
  const deviceQuery = sb.from("devices").select("id, name, uazapi_base_url, uazapi_token, user_id").eq("id", deviceId);
  if (!isAdmin) deviceQuery.eq("user_id", userId);
  const { data: device } = await deviceQuery.single();
  if (!device?.uazapi_base_url || !device?.uazapi_token) return null;
  return device;
}

async function getMultipleDeviceCredentials(sb: any, deviceIds: string[], userId: string, isAdmin: boolean) {
  const devices: any[] = [];
  for (const deviceId of deviceIds) {
    const device = await getDeviceCredentials(sb, deviceId, userId, isAdmin);
    if (device) devices.push(device);
  }
  return devices;
}

async function getGroupParticipants(baseUrl: string, token: string, groupId: string): Promise<Set<string>> {
  const participants = new Set<string>();
  try {
    const res = await fetch(`${baseUrl}/group/participants?groupJid=${groupId}`, {
      headers: { token, Accept: "application/json" },
    });
    if (res.ok) {
      const data = await res.json();
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
  const headers = { token, Accept: "application/json", "Content-Type": "application/json" };
  const phoneJid = phone.includes("@") ? phone : `${phone}@s.whatsapp.net`;

  // Uazapi v2 documented endpoint: PUT /group/updateParticipant?groupJid=XXX
  const strategies = [
    // Strategy 1: PUT /group/updateParticipant (documented v2 endpoint)
    {
      method: "PUT",
      url: `${baseUrl}/group/updateParticipant?groupJid=${encodeURIComponent(groupId)}`,
      body: { action: "add", participants: [phoneJid] },
    },
    // Strategy 2: POST /group/updateParticipants (alternative plural)
    {
      method: "POST",
      url: `${baseUrl}/group/updateParticipants`,
      body: { groupJid: groupId, action: "add", participants: [phoneJid] },
    },
    // Strategy 3: PUT /group/updateParticipants
    {
      method: "PUT",
      url: `${baseUrl}/group/updateParticipants`,
      body: { groupJid: groupId, action: "add", participants: [phoneJid] },
    },
    // Strategy 4: POST /group/addParticipant with number
    {
      method: "POST",
      url: `${baseUrl}/group/addParticipant`,
      body: { groupJid: groupId, number: phone },
    },
    // Strategy 5: PUT /group/addParticipant with participants array
    {
      method: "PUT",
      url: `${baseUrl}/group/addParticipant`,
      body: { groupJid: groupId, participants: [phoneJid] },
    },
  ];

  for (const strat of strategies) {
    try {
      console.log(`addToGroup trying: ${strat.method} ${strat.url}`);
      const res = await fetch(strat.url, {
        method: strat.method,
        headers,
        body: JSON.stringify(strat.body),
      });

      // 405 = wrong method, try next
      if (res.status === 405) continue;

      const raw = await res.text();
      let body: any;
      try { body = JSON.parse(raw); } catch { body = { raw }; }

      console.log(`addToGroup response: ${res.status} ${raw.substring(0, 300)}`);

      // 404 on endpoint itself means wrong endpoint, try next
      if (res.status === 404 && (body?.message === "Not Found." || body?.message === "Not Found")) continue;

      if (res.status === 200 || res.status === 201) {
        return { ok: true, status: res.status, body };
      }

      const rawLower = raw.toLowerCase();
      if (rawLower.includes("already") || rawLower.includes("já") || res.status === 409) {
        return { ok: false, status: 409, error: "already_exists", body };
      }

      // If we got a real response (not 405/404), return it even if error
      return { ok: false, status: res.status, error: raw.substring(0, 200), body };
    } catch (e: any) {
      console.error(`addToGroup strategy error:`, e);
      continue;
    }
  }

  return { ok: false, status: 405, error: "Nenhum endpoint de adição funcionou. Verifique a versão da API." };
}

function randomBetween(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const sb = createClient(supabaseUrl, serviceKey);

    const authHeader = req.headers.get("authorization") || "";
    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await sb.auth.getUser(token);
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: roleData } = await sb.from("user_roles").select("role").eq("user_id", user.id).eq("role", "admin").maybeSingle();
    const isAdmin = !!roleData;

    const body = await req.json();
    const { action } = body;

    // ── ACTION: list-groups ──
    if (action === "list-groups") {
      const { deviceId } = body;
      if (!deviceId) {
        return new Response(JSON.stringify({ error: "Missing deviceId" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const device = await getDeviceCredentials(sb, deviceId, user.id, isAdmin);
      if (!device) {
        return new Response(JSON.stringify({ error: "Device not found or missing credentials" }), {
          status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      try {
        const allGroups: any[] = [];
        const seenIds = new Set<string>();

        for (let page = 0; page < 10; page++) {
          const res = await fetch(
            `${device.uazapi_base_url}/group/list?GetParticipants=false&page=${page}&count=200`,
            { headers: { token: device.uazapi_token, Accept: "application/json" } }
          );
          if (!res.ok) break;
          const data = await res.json();
          const arr = Array.isArray(data) ? data : data?.groups || data?.data || [];
          if (!Array.isArray(arr) || arr.length === 0) break;
          for (const g of arr) {
            const gid = g.id || g.jid || g.JID || "";
            if (gid && !seenIds.has(gid)) {
              seenIds.add(gid);
              allGroups.push({
                jid: gid,
                name: g.subject || g.name || g.Subject || g.Name || g.groupName || "Sem nome",
                participants: g.ParticipantCount || g.participants?.length || g.Participants?.length || g.size || 0,
              });
            }
          }
          if (arr.length < 200) break;
        }

        if (allGroups.length === 0) {
          const res2 = await fetch(`${device.uazapi_base_url}/group/listAll`, {
            headers: { token: device.uazapi_token, Accept: "application/json" },
          });
          if (res2.ok) {
            const data2 = await res2.json();
            const arr2 = Array.isArray(data2) ? data2 : data2?.groups || [];
            for (const g of arr2) {
              const gid = g.id || g.jid || g.JID || "";
              if (gid && !seenIds.has(gid)) {
                seenIds.add(gid);
                allGroups.push({
                  jid: gid,
                  name: g.subject || g.name || g.Subject || g.Name || "Sem nome",
                  participants: g.ParticipantCount || g.participants?.length || g.Participants?.length || g.size || 0,
                });
              }
            }
          }
        }

        return new Response(JSON.stringify({ groups: allGroups }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      } catch (e: any) {
        console.error("list-groups exception:", e);
        return new Response(JSON.stringify({ error: e.message, groups: [] }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    // ── ACTION: resolve-link ──
    if (action === "resolve-link") {
      const { deviceId, link } = body;
      if (!deviceId || !link) {
        return new Response(JSON.stringify({ error: "Missing deviceId or link" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const device = await getDeviceCredentials(sb, deviceId, user.id, isAdmin);
      if (!device) {
        return new Response(JSON.stringify({ error: "Device not found" }), {
          status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const cleanLink = link.trim().replace(/[,;)\]}>'"]+$/, "").split("?")[0];
      const match = cleanLink.match(/chat\.whatsapp\.com\/([A-Za-z0-9_-]+)/);
      const inviteCode = match ? match[1] : cleanLink;

      const headers2 = { token: device.uazapi_token, Accept: "application/json", "Content-Type": "application/json" };

      const strategies = [
        { method: "POST", url: `${device.uazapi_base_url}/group/join`, body: JSON.stringify({ invitecode: inviteCode }) },
        { method: "POST", url: `${device.uazapi_base_url}/group/join`, body: JSON.stringify({ invitecode: cleanLink }) },
        { method: "PUT", url: `${device.uazapi_base_url}/group/acceptInviteGroup`, body: JSON.stringify({ inviteCode }) },
        { method: "GET", url: `${device.uazapi_base_url}/group/inviteInfo?inviteCode=${inviteCode}`, body: undefined },
      ];

      try {
        for (const strat of strategies) {
          try {
            const res = await fetch(strat.url, {
              method: strat.method,
              headers: strat.body ? headers2 : { token: device.uazapi_token, Accept: "application/json" },
              ...(strat.body ? { body: strat.body } : {}),
            });
            if (res.status === 405) continue;
            const raw = await res.text();
            let data: any;
            try { data = JSON.parse(raw); } catch { data = { raw }; }
            console.log(`resolve-link ${strat.method} ${strat.url}: ${res.status} ${raw.substring(0, 300)}`);

            if (res.status === 500 && (data?.error === "error joining group" || data?.error === "internal server error")) continue;

            const jid = data?.group?.JID || data?.group?.jid || data?.JID || data?.jid || data?.id || data?.groupJid || data?.gid || data?.groupId || data?.data?.JID || data?.data?.jid || "";
            const name = data?.group?.Name || data?.group?.name || data?.group?.Subject || data?.Name || data?.name || data?.Subject || data?.subject || data?.data?.Name || "";

            if (jid) {
              return new Response(JSON.stringify({ jid, name: name || "Grupo", joined: res.status >= 200 && res.status < 300 }), {
                headers: { ...corsHeaders, "Content-Type": "application/json" },
              });
            }

            const msg = (data?.message || data?.msg || raw || "").toLowerCase();
            if (msg.includes("already") || msg.includes("já")) {
              return new Response(JSON.stringify({ error: "Instância já é membro deste grupo. Use 'Meus Grupos' para encontrá-lo." }), {
                headers: { ...corsHeaders, "Content-Type": "application/json" },
              });
            }
          } catch (e) {
            console.error(`resolve-link strategy error:`, e);
            continue;
          }
        }

        return new Response(JSON.stringify({ error: "Não foi possível resolver o link. Verifique se é válido ou se a instância tem acesso." }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      } catch (e: any) {
        console.error("resolve-link error:", e);
        return new Response(JSON.stringify({ error: e.message }), {
          status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    // ── ACTION: validate ──
    if (action === "validate") {
      const { contacts: rawContacts } = body;
      if (!Array.isArray(rawContacts) || rawContacts.length === 0) {
        return new Response(JSON.stringify({ error: "No contacts provided" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const seen = new Set<string>();
      const valid: string[] = [];
      const invalid: string[] = [];
      const duplicates: string[] = [];

      for (const raw of rawContacts) {
        const normalized = normalizePhone(String(raw));
        if (!normalized) { invalid.push(String(raw)); continue; }
        if (seen.has(normalized)) { duplicates.push(String(raw)); continue; }
        seen.add(normalized);
        valid.push(normalized);
      }

      return new Response(JSON.stringify({
        total: rawContacts.length, valid, invalid, duplicates,
        validCount: valid.length, invalidCount: invalid.length, duplicateCount: duplicates.length,
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ── ACTION: check-participants ──
    if (action === "check-participants") {
      const { groupId, deviceId, contacts } = body;
      if (!groupId || !deviceId || !Array.isArray(contacts)) {
        return new Response(JSON.stringify({ error: "Missing groupId, deviceId, or contacts" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const device = await getDeviceCredentials(sb, deviceId, user.id, isAdmin);
      if (!device) {
        return new Response(JSON.stringify({ error: "Device not found or missing credentials" }), {
          status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const participants = await getGroupParticipants(device.uazapi_base_url, device.uazapi_token, groupId);
      const ready: string[] = [];
      const alreadyExists: string[] = [];

      for (const phone of contacts) {
        if (participants.has(phone)) { alreadyExists.push(phone); } else { ready.push(phone); }
      }

      return new Response(JSON.stringify({
        ready, alreadyExists,
        readyCount: ready.length, alreadyExistsCount: alreadyExists.length, totalParticipants: participants.size,
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ── ACTION: process (multi-instance with delays & rotation) ──
    if (action === "process") {
      const {
        groupId,
        deviceIds: rawDeviceIds,
        deviceId: singleDeviceId,
        contacts,
        concurrency = 1,
        minDelay = 3,
        maxDelay = 8,
        pauseAfter = 0,
        pauseDuration = 30,
        rotateAfter = 0,
      } = body;

      const deviceIdList: string[] = Array.isArray(rawDeviceIds) && rawDeviceIds.length > 0
        ? rawDeviceIds
        : singleDeviceId ? [singleDeviceId] : [];

      if (!groupId || deviceIdList.length === 0 || !Array.isArray(contacts) || contacts.length === 0) {
        return new Response(JSON.stringify({ error: "Missing required fields" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const devices = await getMultipleDeviceCredentials(sb, deviceIdList, user.id, isAdmin);
      if (devices.length === 0) {
        return new Response(JSON.stringify({ error: "No valid devices found" }), {
          status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const queue = [...contacts];
      const results: ContactResult[] = [];
      let ok = 0, fail = 0, already = 0, totalAttempts = 0;
      const startTime = Date.now();
      let currentDeviceIndex = 0;
      let addedWithCurrentDevice = 0;

      function getNextDevice() {
        const device = devices[currentDeviceIndex % devices.length];
        return device;
      }

      function maybeRotateDevice() {
        if (rotateAfter > 0 && addedWithCurrentDevice >= rotateAfter) {
          currentDeviceIndex++;
          addedWithCurrentDevice = 0;
          console.log(`Rotated to device index ${currentDeviceIndex % devices.length}`);
        }
      }

      let processedSincePause = 0;

      while (queue.length > 0) {
        const phone = queue.shift();
        if (!phone) break;
        totalAttempts++;

        const device = getNextDevice();
        const result = await addToGroup(device.uazapi_base_url, device.uazapi_token, groupId, phone);

        if (result.ok) {
          ok++;
          addedWithCurrentDevice++;
          processedSincePause++;
          results.push({ phone, status: "completed", deviceUsed: device.name || device.id });
          maybeRotateDevice();
        } else if (result.error === "already_exists" || result.status === 409) {
          already++;
          processedSincePause++;
          results.push({ phone, status: "already_exists", deviceUsed: device.name || device.id });
        } else if (result.status === 429) {
          queue.push(phone);
          const retryWait = 60;
          console.log(`Rate limited, waiting ${retryWait}s`);
          await new Promise(r => setTimeout(r, retryWait * 1000));
        } else {
          fail++;
          processedSincePause++;
          results.push({ phone, status: "failed", error: typeof result.error === "string" ? result.error.substring(0, 150) : "Falha", deviceUsed: device.name || device.id });
        }

        // Random delay between contacts
        const delay = randomBetween(minDelay, maxDelay);
        await new Promise(r => setTimeout(r, delay * 1000));

        // Pause after X contacts
        if (pauseAfter > 0 && processedSincePause >= pauseAfter && queue.length > 0) {
          console.log(`Pausing for ${pauseDuration}s after ${processedSincePause} contacts`);
          await new Promise(r => setTimeout(r, pauseDuration * 1000));
          processedSincePause = 0;
        }
      }

      const durationSec = Math.round((Date.now() - startTime) / 1000);

      return new Response(JSON.stringify({ ok, fail, already, total: contacts.length, durationSec, totalAttempts, results }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "Unknown action" }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    console.error("mass-group-inject error:", e);
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
