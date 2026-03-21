import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
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

    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userId = user.id;
    const url = new URL(req.url);
    const action = url.searchParams.get("action") || "list_chats";
    const deviceId = url.searchParams.get("device_id");
    const chatId = url.searchParams.get("chat_id");

    const serviceClient = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    // No device selected - return device list
    if (!deviceId) {
      const { data: devices } = await serviceClient
        .from("devices")
        .select("id, name, number, status, uazapi_token, uazapi_base_url, profile_picture")
        .eq("user_id", userId);

      return new Response(
        JSON.stringify({
          devices: (devices || []).map((d: any) => ({
            id: d.id,
            name: d.name,
            number: d.number,
            status: d.status,
            profile_picture: d.profile_picture,
            has_token: !!(d.uazapi_token && d.uazapi_base_url),
          })),
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get device config
    const { data: device } = await serviceClient
      .from("devices")
      .select("uazapi_token, uazapi_base_url, number")
      .eq("id", deviceId)
      .eq("user_id", userId)
      .single();

    const apiToken = device?.uazapi_token;
    const apiBaseUrl = (device?.uazapi_base_url || "").replace(/\/+$/, "");

    if (!apiToken || !apiBaseUrl) {
      return new Response(JSON.stringify({ error: "Dispositivo não configurado" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const apiHeaders = {
      "token": apiToken,
      "Accept": "application/json",
      "Content-Type": "application/json",
    };

    if (action === "list_chats") {
      const forceRefresh = url.searchParams.get("refresh") === "true";
      const allGroups: any[] = [];
      const seenJids = new Set<string>();
      let primaryFetchSucceeded = false;
      let fallbackFetchSucceeded = false;
      const deviceDigits = String(device?.number || "").replace(/\D/g, "");

      const fetchSafe = async (endpoint: string, retries = 2, method = "GET", body?: any): Promise<any> => {
        for (let attempt = 0; attempt <= retries; attempt++) {
          try {
            const opts: RequestInit = { method, headers: apiHeaders };
            if (body && method === "POST") opts.body = JSON.stringify(body);
            const res = await fetch(endpoint, opts);
            if (!res.ok) {
              const respBody = await res.text().catch(() => "");
              console.log(`[${res.status}] ${endpoint}: ${respBody.substring(0, 150)}`);
              // If "No session", wait longer and retry
              if (respBody.includes("No session") && attempt < retries) {
                console.log(`[RETRY] No session detected, waiting 3s...`);
                await new Promise(r => setTimeout(r, 3000));
                continue;
              }
              if (attempt < retries) { await new Promise(r => setTimeout(r, 800 * (attempt + 1))); continue; }
              return null;
            }
            return await res.json();
          } catch (e) {
            console.error(`Fetch fail ${attempt} ${endpoint}:`, e);
            if (attempt < retries) await new Promise(r => setTimeout(r, 800 * (attempt + 1)));
          }
        }
        return null;
      };

      const normalizeDigits = (value: string) => value.replace(/\D/g, "");

      const matchesDeviceNumber = (value?: string | null): boolean => {
        if (!value || !deviceDigits) return false;
        const candidate = normalizeDigits(String(value));
        if (!candidate) return false;

        const minLen = 10;
        const a = candidate.length > minLen ? candidate.slice(-minLen) : candidate;
        const b = deviceDigits.length > minLen ? deviceDigits.slice(-minLen) : deviceDigits;
        return a === b;
      };

      const addGroups = (items: any[]) => {
        for (const g of items) {
          const jid = g.JID || g.jid || g.id || g.groupJid || g.chatId || "";
          if (jid && !seenJids.has(jid)) {
            seenJids.add(jid);
            allGroups.push(g);
          }
        }
      };

      const groupHasDeviceAsParticipant = (group: any): boolean => {
        if (!deviceDigits) return true;

        const candidates: string[] = [];

        const participants = group?.Participants || group?.participants || [];
        if (Array.isArray(participants)) {
          for (const p of participants) {
            if (typeof p === "string") {
              candidates.push(p);
              continue;
            }
            candidates.push(
              p?.JID || "",
              p?.jid || "",
              p?.id || "",
              p?.PN || "",
              p?.phone || "",
              p?.number || "",
            );
          }
        }

        candidates.push(
          group?.OwnerPN || "",
          group?.ownerPN || "",
          group?.OwnerJID || "",
          group?.ownerJid || "",
        );

        const normalizedCandidates = candidates
          .map((value) => normalizeDigits(String(value || "")))
          .filter(Boolean);

        // Se não há dados verificáveis de participante/owner, não bloquear o grupo
        const hasVerifiableParticipantData = normalizedCandidates.some((digits) => digits.length >= 8);
        if (!hasVerifiableParticipantData) {
          return true;
        }

        return normalizedCandidates.some((value) => matchesDeviceNumber(value));
      };

      // ─── S-1: Wake up session before listing (always) ───
      {
        const statusRes = await fetchSafe(`${apiBaseUrl}/instance/status`, 1);
        const st = statusRes?.instance?.status || statusRes?.status || "";
        console.log(`[S-1] Instance status: ${st}`);
        if (st !== "connected" && st !== "authenticated") {
          // Try to reconnect session
          const reconnectEps = [
            { ep: "/instance/reconnect", method: "GET" },
            { ep: "/instance/reconnect", method: "POST" },
            { ep: "/instance/connect", method: "GET" },
            { ep: "/instance/connect", method: "POST" },
          ];
          for (const { ep, method: m } of reconnectEps) {
            try {
              const r = await fetch(`${apiBaseUrl}${ep}`, { method: m, headers: apiHeaders });
              console.log(`[S-1] ${m} ${ep}: ${r.status}`);
              if (r.ok) { await new Promise(r => setTimeout(r, 3000)); break; }
            } catch {}
          }
        }
      }

      // ─── S0: Restart/resync instance to force WA group refresh (only on forceRefresh) ───
      if (forceRefresh) {
        console.log("[S0] Forcing instance resync...");
        const restartAttempts = [
          { ep: "/instance/restart", method: "GET" },
          { ep: "/instance/restart", method: "POST" },
          { ep: "/instance/refresh", method: "GET" },
          { ep: "/instance/refresh", method: "POST" },
          { ep: "/instance/reboot", method: "GET" },
          { ep: "/group/sync", method: "GET" },
          { ep: "/group/sync", method: "POST" },
        ];
        let restarted = false;
        for (const { ep, method } of restartAttempts) {
          try {
            const res = await fetch(`${apiBaseUrl}${ep}`, { method, headers: apiHeaders });
            const txt = await res.text().catch(() => "");
            console.log(`[S0] ${method} ${ep}: ${res.status} ${txt.substring(0, 100)}`);
            if (res.ok) {
              restarted = true;
              break;
            }
          } catch (e) {
            console.log(`[S0] ${ep} failed: ${e.message}`);
          }
        }
        if (restarted) {
          await new Promise(r => setTimeout(r, 4000));
        }
      }

      // ─── S1: /group/list paginated (main UaZapi endpoint) ───
      const fetchGroupListPaginated = async (tag: string) => {
        for (let page = 0; page < 10; page++) {
          try {
            const rawRes = await fetch(`${apiBaseUrl}/group/list?GetParticipants=true&page=${page}&count=200`, { headers: apiHeaders });
            const rawText = await rawRes.text();
            if (page === 0) {
              console.log(`[${tag}-RAW][${deviceId}] Status: ${rawRes.status}, Body (500 chars): ${rawText.substring(0, 500)}`);
            }
            if (!rawRes.ok) break;

            primaryFetchSucceeded = true;

            const data = JSON.parse(rawText);
            const arr = Array.isArray(data.groups || data) ? (data.groups || data) : [];
            if (arr.length === 0) break;

            if (page === 0 && arr.length > 0) {
              console.log(`[${tag}-STRUCT][${deviceId}] Keys: ${Object.keys(arr[0]).join(",")}`);
            }

            const prev = seenJids.size;
            addGroups(arr);
            console.log(`[${tag}][${deviceId}] page ${page}: ${arr.length} ret, ${seenJids.size - prev} new`);
            if (seenJids.size - prev === 0) break;
          } catch (e) {
            console.log(`[${tag}][${deviceId}] page ${page} error: ${e.message}`);
            break;
          }
        }
      };

      await fetchGroupListPaginated("S1");

      // UaZapi pode oscilar entre 4 e 9 grupos no mesmo minuto; faz retries e mantém união por JID
      if (forceRefresh && allGroups.length < 8) {
        for (let attempt = 1; attempt <= 2 && allGroups.length < 8; attempt++) {
          await new Promise((r) => setTimeout(r, 900));
          await fetchGroupListPaginated(`S1R${attempt}`);
        }
      }

      // Fallbacks only if primary endpoint failed (avoid mixing stale historical sources)
      if (!primaryFetchSucceeded) {
        // ─── S1b: /group/list with count ───
        const dataS1b = await fetchSafe(`${apiBaseUrl}/group/list?GetParticipants=true&count=500`, 1);
        if (dataS1b) {
          fallbackFetchSucceeded = true;
          const arr = Array.isArray(dataS1b.groups || dataS1b.data || dataS1b) ? (dataS1b.groups || dataS1b.data || dataS1b) : [];
          const prev = seenJids.size;
          addGroups(arr);
          console.log(`[S1b] alt group/list: ${arr.length} ret, ${seenJids.size - prev} new`);
        }

        // ─── S1c: /chats with filter (UaZapi V2 alternative) ───
        const dataS1c = await fetchSafe(`${apiBaseUrl}/chats?type=group&count=500`, 1);
        if (dataS1c) {
          fallbackFetchSucceeded = true;
          const arr = Array.isArray(dataS1c.chats || dataS1c.data || dataS1c) ? (dataS1c.chats || dataS1c.data || dataS1c) : [];
          const groupArr = arr.filter((c: any) => {
            const id = c.JID || c.jid || c.id || c.chatId || "";
            return id.includes("@g.us");
          });
          const prev = seenJids.size;
          addGroups(groupArr);
          console.log(`[S1c] /chats?type=group: ${arr.length} total, ${groupArr.length} groups, ${seenJids.size - prev} new`);
        }

        // ─── S2: /group/fetchAllGroups ───
        if (forceRefresh) {
          const dataS2 = await fetchSafe(`${apiBaseUrl}/group/fetchAllGroups`, 1);
          if (dataS2) {
            fallbackFetchSucceeded = true;
            const arr = Array.isArray(dataS2.groups || dataS2) ? (dataS2.groups || dataS2) : [];
            const prev = seenJids.size;
            addGroups(arr);
            console.log(`[S2] fetchAllGroups: ${arr.length} ret, ${seenJids.size - prev} new`);
          }
        }

        // ─── S3: /group/listAll ───
        const dataS3 = await fetchSafe(`${apiBaseUrl}/group/listAll`, 1);
        if (dataS3) {
          fallbackFetchSucceeded = true;
          const arr = Array.isArray(dataS3.groups || dataS3) ? (dataS3.groups || dataS3) : [];
          const prev = seenJids.size;
          addGroups(arr);
          console.log(`[S3] listAll: ${arr.length} ret, ${seenJids.size - prev} new`);
        }

        // ─── S4: /chat/list filtering @g.us ───
        const dataS4 = await fetchSafe(`${apiBaseUrl}/chat/list?count=500`, 1);
        if (dataS4) {
          fallbackFetchSucceeded = true;
          const chats = Array.isArray(dataS4.chats || dataS4.data || dataS4) ? (dataS4.chats || dataS4.data || dataS4) : [];
          const groups = chats.filter((c: any) => {
            const id = c.JID || c.jid || c.id || c.chatId || "";
            return id.includes("@g.us");
          });
          const prev = seenJids.size;
          addGroups(groups);
          console.log(`[S4] chat/list: ${chats.length} chats, ${groups.length} groups, ${seenJids.size - prev} new`);
        }

        // ─── S5: /group/list huge count ───
        if (forceRefresh) {
          const dataS5 = await fetchSafe(`${apiBaseUrl}/group/list?GetParticipants=true&count=9999`, 1);
          if (dataS5) {
            fallbackFetchSucceeded = true;
            const arr = Array.isArray(dataS5.groups || dataS5) ? (dataS5.groups || dataS5) : [];
            const prev = seenJids.size;
            addGroups(arr);
            console.log(`[S5] big count: ${arr.length} ret, ${seenJids.size - prev} new`);
          }
        }

        // ─── S6: /group/participating ───
        if (forceRefresh) {
          const dataS6 = await fetchSafe(`${apiBaseUrl}/group/participating`, 1);
          if (dataS6) {
            fallbackFetchSucceeded = true;
            const arr = Array.isArray(dataS6.groups || dataS6.data || dataS6) ? (dataS6.groups || dataS6.data || dataS6) : [];
            const prev = seenJids.size;
            addGroups(arr);
            console.log(`[S6] participating: ${arr.length} ret, ${seenJids.size - prev} new`);
          }
        }
      }

      console.log(`[${deviceId}] Total unique groups (raw): ${allGroups.length}`);

      const authoritativeGroups = allGroups.filter((g) => groupHasDeviceAsParticipant(g));
      if (authoritativeGroups.length !== allGroups.length) {
        console.log(`[${deviceId}] Filtered by participant ownership: ${authoritativeGroups.length}/${allGroups.length}`);
      }

      // Map to standardized format
      let chats = authoritativeGroups.map((g: any) => ({
        id: g.JID || g.jid || g.id || g.groupJid || "",
        name: g.Name || g.name || g.Subject || g.subject || g.groupName || "",
        participants: g.ParticipantCount || g.Participants?.length || g.participants?.length || g.participantsCount || g.size || undefined,
        isGroup: true,
      }));

      // ─── Enrich groups without names via /group/info ───
      const nameless = chats.filter(c => !c.name && c.id);
      if (nameless.length > 0 && nameless.length <= 20) {
        console.log(`[ENRICH] Fetching names for ${nameless.length} unnamed groups...`);
        const enrichResults = await Promise.allSettled(
          nameless.map(async (g) => {
            try {
              const infoRes = await fetch(`${apiBaseUrl}/group/info`, {
                method: "POST",
                headers: apiHeaders,
                body: JSON.stringify({ groupJid: g.id }),
              });
              if (infoRes.ok) {
                const info = await infoRes.json();
                const gData = info.group || info.data || info || {};
                const resolvedName = gData.Name || gData.name || gData.Subject || gData.subject || "";
                if (resolvedName) {
                  console.log(`[ENRICH] ${g.id} → "${resolvedName}"`);
                  return { id: g.id, name: resolvedName };
                }
              }
            } catch {}
            return { id: g.id, name: "" };
          })
        );
        const nameMap = new Map<string, string>();
        for (const r of enrichResults) {
          if (r.status === "fulfilled" && r.value.name) {
            nameMap.set(r.value.id, r.value.name);
          }
        }
        chats = chats.map(c => ({
          ...c,
          name: c.name || nameMap.get(c.id) || c.id || "Grupo sem nome",
        }));
      } else {
        chats = chats.map(c => ({ ...c, name: c.name || c.id || "Grupo sem nome" }));
      }

      const syncOk = primaryFetchSucceeded || fallbackFetchSucceeded;
      return new Response(JSON.stringify({ chats, sync_ok: syncOk }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ─── list_all_groups: Fetch groups from ALL connected devices ───
    if (action === "list_all_groups") {
      const { data: allDevices } = await serviceClient
        .from("devices")
        .select("id, name, number, status, uazapi_token, uazapi_base_url")
        .eq("user_id", userId)
        .in("status", ["Ready", "Connected", "connected", "authenticated"]);

      const seenJids = new Set<string>();
      const allGroups: any[] = [];

      for (const dev of (allDevices || [])) {
        if (!dev.uazapi_token || !dev.uazapi_base_url) continue;
        const devBaseUrl = (dev.uazapi_base_url || "").replace(/\/+$/, "");
        const devHeaders = { token: dev.uazapi_token, Accept: "application/json", "Content-Type": "application/json" };

        try {
          // Simple paginated fetch per device
          for (let page = 0; page < 5; page++) {
            const res = await fetch(`${devBaseUrl}/group/list?GetParticipants=false&page=${page}&count=200`, { headers: devHeaders });
            if (!res.ok) break;
            const data = await res.json();
            const arr = Array.isArray(data.groups || data) ? (data.groups || data) : [];
            if (arr.length === 0) break;
            let newCount = 0;
            for (const g of arr) {
              const jid = g.JID || g.jid || g.id || g.groupJid || g.chatId || "";
              if (jid && !seenJids.has(jid)) {
                seenJids.add(jid);
                allGroups.push(g);
                newCount++;
              }
            }
            console.log(`[ALL] Device ${dev.name} page ${page}: ${arr.length} ret, ${newCount} new`);
            if (newCount === 0) break;
          }
        } catch (e) {
          console.log(`[ALL] Device ${dev.name} failed: ${e.message}`);
        }
      }

      console.log(`[ALL] Total unique groups from all devices: ${allGroups.length}`);

      let chatsAll = allGroups.map((g: any) => ({
        id: g.JID || g.jid || g.id || g.groupJid || "",
        name: g.Name || g.name || g.Subject || g.subject || g.groupName || "",
        participants: g.ParticipantCount || g.Participants?.length || g.participants?.length || g.participantsCount || g.size || undefined,
        isGroup: true,
      }));

      // Enrich unnamed groups - pick first connected device for info calls
      const namelessAll = chatsAll.filter(c => !c.name && c.id);
      const firstDev = (allDevices || []).find(d => d.uazapi_token && d.uazapi_base_url);
      if (namelessAll.length > 0 && namelessAll.length <= 20 && firstDev) {
        const devBase = (firstDev.uazapi_base_url || "").replace(/\/+$/, "");
        const devHdrs = { token: firstDev.uazapi_token, Accept: "application/json", "Content-Type": "application/json" };
        const results = await Promise.allSettled(
          namelessAll.map(async (g) => {
            try {
              const r = await fetch(`${devBase}/group/info`, { method: "POST", headers: devHdrs, body: JSON.stringify({ groupJid: g.id }) });
              if (r.ok) {
                const info = await r.json();
                const gd = info.group || info.data || info || {};
                return { id: g.id, name: gd.Name || gd.name || gd.Subject || gd.subject || "" };
              }
            } catch {}
            return { id: g.id, name: "" };
          })
        );
        const nm = new Map<string, string>();
        for (const r of results) { if (r.status === "fulfilled" && r.value.name) nm.set(r.value.id, r.value.name); }
        chatsAll = chatsAll.map(c => ({ ...c, name: c.name || nm.get(c.id) || c.id || "Grupo sem nome" }));
      } else {
        chatsAll = chatsAll.map(c => ({ ...c, name: c.name || c.id || "Grupo sem nome" }));
      }

      return new Response(JSON.stringify({ chats: chatsAll }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "get_messages" && chatId) {
      const count = url.searchParams.get("count") || "50";
      const res = await fetch(`${apiBaseUrl}/chat/messages?chatId=${encodeURIComponent(chatId)}&count=${count}`, {
        method: "GET",
        headers: apiHeaders,
      });
      const data = await res.json();
      return new Response(JSON.stringify({ messages: data.messages || data || [] }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "send_message" && req.method === "POST") {
      const body = await req.json();
      const to = body.to || "";
      const isGroup = to.includes("@g.us");
      const number = isGroup ? to : to.replace(/\D/g, "");
      const message = body.message;
      const res = await fetch(`${apiBaseUrl}/send/text`, {
        method: "POST",
        headers: apiHeaders,
        body: JSON.stringify({ number, text: message }),
      });
      const data = await res.json();
      return new Response(JSON.stringify(data), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "send_media" && req.method === "POST") {
      const body = await req.json();
      const res = await fetch(`${apiBaseUrl}/send/media`, {
        method: "POST",
        headers: apiHeaders,
        body: JSON.stringify({
          number: body.to?.replace(/\D/g, ""),
          media: body.media_url,
          type: body.media_type || "image",
          caption: body.caption || undefined,
        }),
      });
      const data = await res.json();
      return new Response(JSON.stringify(data), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ─── resolve_invite: Join group via invite link and return JID ───
    if (action === "resolve_invite") {
      const inviteCode = url.searchParams.get("invite_code") || "";
      if (!inviteCode) {
        return new Response(JSON.stringify({ error: "invite_code required" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      console.log(`[resolve_invite] Trying to join/resolve invite code: ${inviteCode}`);

      // Try joining the group - this also works if already a member
      const endpoints = [
        { method: "POST", url: `${apiBaseUrl}/group/join`, body: JSON.stringify({ invitecode: inviteCode }) },
        { method: "POST", url: `${apiBaseUrl}/group/join`, body: JSON.stringify({ invitecode: `https://chat.whatsapp.com/${inviteCode}` }) },
      ];

      for (const ep of endpoints) {
        try {
          const res = await fetch(ep.url, {
            method: ep.method,
            headers: apiHeaders,
            body: ep.body,
          });
          const raw = await res.text();
          console.log(`[resolve_invite] ${ep.method} ${ep.url}: ${res.status} ${raw.substring(0, 500)}`);
          
          if (res.status === 405) continue;

          let data: any;
          try { data = JSON.parse(raw); } catch { data = { raw }; }

          // Extract JID from response (UAZAPI returns { group: { JID: "..." } })
          const jid = data?.group?.JID || data?.group?.jid || data?.JID || data?.jid || data?.groupId || data?.group_id || data?.data?.JID || data?.data?.jid || "";
          const name = data?.group?.Name || data?.group?.name || data?.group?.Subject || data?.Name || data?.name || data?.Subject || data?.subject || data?.data?.Name || "";

          if (jid && jid.includes("@g.us")) {
            console.log(`[resolve_invite] Success! JID: ${jid}, Name: ${name}`);
            return new Response(JSON.stringify({ jid, name, status: "ok" }), {
              headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
          }

          // If the response is 2xx but no JID, check if it's "already member" and try to find JID in groups list
          if (res.ok || res.status === 409) {
            console.log(`[resolve_invite] Joined but no JID in response. Searching groups list...`);
            // Fetch groups to find the newly joined one
            const groupsRes = await fetch(`${apiBaseUrl}/group/list?GetParticipants=false&page=0&count=200`, { headers: apiHeaders });
            if (groupsRes.ok) {
              const groupsRaw = await groupsRes.text();
              let groupsData: any;
              try { groupsData = JSON.parse(groupsRaw); } catch { groupsData = {}; }
              const groups = Array.isArray(groupsData.groups || groupsData) ? (groupsData.groups || groupsData) : [];
              
              // Return the most recently joined group (last in list) or try to match
              if (groups.length > 0) {
                const lastGroup = groups[groups.length - 1];
                const foundJid = lastGroup.JID || lastGroup.jid || "";
                const foundName = lastGroup.Name || lastGroup.name || "";
                if (foundJid) {
                  console.log(`[resolve_invite] Found via groups list: ${foundJid} (${foundName})`);
                  return new Response(JSON.stringify({ jid: foundJid, name: foundName, status: "ok" }), {
                    headers: { ...corsHeaders, "Content-Type": "application/json" },
                  });
                }
              }
            }
          }

          // Return error info
          const msg = data?.message || data?.msg || raw.substring(0, 200);
          return new Response(JSON.stringify({ error: msg, status: "error" }), {
            status: res.status >= 400 ? res.status : 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        } catch (err) {
          console.error(`[resolve_invite] Error:`, err);
          continue;
        }
      }

      return new Response(JSON.stringify({ error: "Não foi possível resolver o link do grupo" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "Invalid action" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("Chat API error:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
