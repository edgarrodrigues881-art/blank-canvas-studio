import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user: authUser }, error: authErr } = await supabase.auth.getUser();
    if (authErr || !authUser) return json({ error: "Unauthorized" }, 401);
    const userId = authUser.id;

    const serviceClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const body = req.method === "POST" ? await req.json().catch(() => ({})) : {};
    const action = body.action || new URL(req.url).searchParams.get("action") || "";

    // Helper: get device credentials
    async function getDeviceCredentials(deviceId: string) {
      const { data: device } = await serviceClient
        .from("devices")
        .select("uazapi_token, uazapi_base_url, name, number")
        .eq("id", deviceId)
        .eq("user_id", userId)
        .single();
      if (!device) throw new Error("Dispositivo não encontrado");
      const baseUrl = (device.uazapi_base_url || "").replace(/\/+$/, "");
      const token = device.uazapi_token || "";
      if (!baseUrl || !token) throw new Error("Credenciais do dispositivo não configuradas");
      return { baseUrl, token, device };
    }

    // Helper: uazapi request with fallback
    async function uazapiRequest(baseUrl: string, apiToken: string, path: string, method = "GET", reqBody?: unknown) {
      const headers: Record<string, string> = { token: apiToken, Accept: "application/json" };
      if (reqBody) headers["Content-Type"] = "application/json";
      const opts: RequestInit = { method, headers };
      if (reqBody) opts.body = JSON.stringify(reqBody);
      let res = await fetch(`${baseUrl}${path}`, opts);
      if (res.status === 405 && method === "POST") {
        res = await fetch(`${baseUrl}${path}`, { method: "GET", headers: { token: apiToken, Accept: "application/json" } });
      }
      return res;
    }

    // ─── ACTION: qr (generate QR for the configured device) ───
    if (action === "qr") {
      const deviceId = body.instanceId || body.deviceId;
      if (!deviceId) return json({ error: "instanceId obrigatório" }, 400);
      const { baseUrl, token: apiToken } = await getDeviceCredentials(deviceId);

      const res = await uazapiRequest(baseUrl, apiToken, "/instance/qrcode", "GET");
      const data = await res.json();
      let qr = data.qrcode || data.base64 || data.data || data.qr || null;

      // Ensure proper data URL format
      if (qr && typeof qr === "string" && !qr.startsWith("data:")) {
        qr = `data:image/png;base64,${qr}`;
      }

      // Upsert config with pairing status
      await serviceClient.from("report_wa_configs").upsert({
        user_id: userId,
        device_id: deviceId,
        connection_status: "pairing",
      }, { onConflict: "user_id" });

      return json({ qrCodeDataUrl: qr });
    }

    // ─── ACTION: disconnect ───
    if (action === "disconnect") {
      const deviceId = body.instanceId || body.deviceId;
      const { data: config } = await serviceClient
        .from("report_wa_configs")
        .select("device_id")
        .eq("user_id", userId)
        .single();
      const targetId = deviceId || config?.device_id;
      if (!targetId) return json({ error: "Nenhum dispositivo vinculado" }, 400);

      try {
        const { baseUrl, token: apiToken } = await getDeviceCredentials(targetId);
        await uazapiRequest(baseUrl, apiToken, "/instance/logout", "POST", {});
      } catch (_e) { /* best effort */ }

      await serviceClient.from("report_wa_configs").update({
        connection_status: "disconnected",
        connected_phone: null,
      }).eq("user_id", userId);

      await serviceClient.from("report_wa_logs").insert({
        user_id: userId,
        level: "INFO",
        message: "Dispositivo de relatório desconectado",
      });

      return json({ success: true });
    }

    // ─── ACTION: connect (alias for selecting device without QR) ───
    if (action === "connect") {
      const deviceId = body.deviceId || body.instanceId;
      if (!deviceId) return json({ error: "deviceId obrigatório" }, 400);

      await serviceClient.from("report_wa_configs").upsert({
        user_id: userId,
        device_id: deviceId,
        connection_status: "disconnected",
      }, { onConflict: "user_id" });

      return json({ success: true });
    }

    // ─── ACTION: status ───
    if (action === "status") {
      const { data: config } = await serviceClient
        .from("report_wa_configs")
        .select("device_id, connection_status, connected_phone, group_id, group_name, frequency, toggle_campaigns, toggle_warmup, toggle_instances, alert_disconnect, alert_campaign_end, alert_high_failures")
        .eq("user_id", userId)
        .single();

      if (!config?.device_id) {
        return json({ status: "disconnected", connectedPhone: null, config: null });
      }

      // Check actual device status
      try {
        const { baseUrl, token: apiToken, device } = await getDeviceCredentials(config.device_id);
        const res = await uazapiRequest(baseUrl, apiToken, "/instance/status", "GET");
        const data = await res.json();
        const inst = data.instance || data || {};
        const state = inst.status || data.state;
        const isConnected = state === "connected" || state === "authenticated";
        const phone = inst.owner || inst.phone || data.phone || device.number || "";

        let formattedPhone = "";
        if (phone) {
          const raw = String(phone).replace(/\D/g, "");
          if (raw.startsWith("55") && raw.length === 13) {
            formattedPhone = `+${raw.slice(0, 2)} ${raw.slice(2, 4)} ${raw.slice(4, 9)}-${raw.slice(9)}`;
          } else if (raw.startsWith("55") && raw.length === 12) {
            formattedPhone = `+${raw.slice(0, 2)} ${raw.slice(2, 4)} ${raw.slice(4, 8)}-${raw.slice(8)}`;
          } else if (raw.startsWith("55") && raw.length >= 10) {
            formattedPhone = `+${raw.slice(0, 2)} ${raw.slice(2, 4)} ${raw.slice(4, raw.length - 4)}-${raw.slice(raw.length - 4)}`;
          } else if (raw) {
            formattedPhone = `+${raw}`;
          }
        }

        let newStatus: string;
        if (isConnected) {
          newStatus = "connected";
        } else if (config.connection_status === "pairing") {
          newStatus = "pairing";
        } else {
          newStatus = "disconnected";
        }

        await serviceClient.from("report_wa_configs").update({
          connection_status: newStatus,
          connected_phone: isConnected ? (formattedPhone || config.connected_phone) : config.connected_phone,
        }).eq("user_id", userId);

        return json({
          status: newStatus,
          connectedPhone: isConnected ? (formattedPhone || config.connected_phone) : config.connected_phone,
          config,
        });
      } catch (_e) {
        return json({
          status: config.connection_status || "disconnected",
          connectedPhone: config.connected_phone,
          config,
        });
      }
    }

    // ─── ACTION: sync-groups (force refresh then list) ───
    if (action === "sync-groups") {
      const { data: config } = await serviceClient
        .from("report_wa_configs")
        .select("device_id")
        .eq("user_id", userId)
        .single();
      if (!config?.device_id) return json({ error: "Nenhum dispositivo vinculado" }, 400);

      const { baseUrl, token: apiToken } = await getDeviceCredentials(config.device_id);

      // Try to force a chat sync/refresh
      const refreshEndpoints = [
        { path: "/chat/getChats", method: "GET" },
        { path: "/chat/sync", method: "POST" },
        { path: "/instance/restart", method: "POST" },
      ];
      let refreshedGroups: any[] = [];
      for (const ep of refreshEndpoints) {
        try {
          const res = await uazapiRequest(baseUrl, apiToken, ep.path, ep.method, ep.method === "POST" ? {} : undefined);
          const data = await res.json();
          console.log(`[sync-groups] ${ep.method} ${ep.path} status=${res.status} items=${Array.isArray(data) ? data.length : "?"}`);
          // If getChats returns data, extract groups directly
          if (Array.isArray(data)) {
            refreshedGroups = data.filter((c: any) => {
              const jid = c.JID || c.jid || c.id || c.chatId || "";
              return jid.endsWith("@g.us") || c.isGroup === true || c.IsGroup === true;
            });
            if (refreshedGroups.length > 0) break;
          }
        } catch (err) {
          console.log(`[sync-groups] ${ep.path} error:`, err);
        }
      }

      // Now also try /group/list for comparison
      try {
        const res = await uazapiRequest(baseUrl, apiToken, "/group/list", "GET");
        const data = await res.json();
        const listGroups = Array.isArray(data?.groups) ? data.groups : Array.isArray(data) ? data : [];
        console.log(`[sync-groups] /group/list returned ${listGroups.length} groups, getChats returned ${refreshedGroups.length}`);
        // Use whichever returned more groups
        if (listGroups.length > refreshedGroups.length) {
          refreshedGroups = listGroups;
        }
      } catch (_e) { /* fallback */ }

      // Map to normalized format
      const mapped = refreshedGroups.map((g: any) => {
        const jid = g.JID || g.jid || g.id || g.groupId || g.chatId || "";
        const name = g.Subject || g.subject || g.Name || g.name || g.groupName || g.pushname || `Grupo ${jid.split("@")[0]?.slice(-6) || "?"}`;
        const size = g.size || (g.Participants || g.participants || []).length || null;
        return { id: jid, name, participantsCount: size };
      }).filter((g: any) => g.id);

      return json({ groups: mapped, synced: true });
    }

    // ─── ACTION: groups ───
    if (action === "groups") {
      // Use instanceId from request body (the device the user currently has selected)
      let deviceId = body.instanceId || body.deviceId || "";
      if (!deviceId) {
        // Fallback to config
        const { data: config } = await serviceClient
          .from("report_wa_configs")
          .select("device_id")
          .eq("user_id", userId)
          .single();
        deviceId = config?.device_id;
      }
      if (!deviceId) return json({ error: "Nenhum dispositivo vinculado" }, 400);

      const { baseUrl, token: apiToken, device } = await getDeviceCredentials(deviceId);
      const deviceName = device?.name || deviceId;
      console.log(`[groups] Loading groups for device="${deviceName}" id=${deviceId} baseUrl=${baseUrl}`);

      // Force sync/refresh before fetching groups to avoid stale cache
      const syncEndpoints = [
        "/chat/syncContacts",
        "/instance/restart",
        "/chat/sync",
      ];
      for (const syncPath of syncEndpoints) {
        try {
          const syncRes = await uazapiRequest(baseUrl, apiToken, syncPath, "POST", {});
          console.log(`[groups] sync ${syncPath} status=${syncRes.status}`);
          if (syncRes.ok) {
            // Wait a moment for sync to take effect
            await new Promise(r => setTimeout(r, 2000));
            break;
          }
        } catch (e: any) {
          console.log(`[groups] sync ${syncPath} skipped:`, e);
        }
      }

      // Try multiple endpoints
      let groups: any[] = [];

      function extractGroups(data: any): any[] {
        let items: any[] = [];
        if (Array.isArray(data)) items = data;
        else if (data && typeof data === "object") {
          for (const key of ["groups", "data", "chats", "result"]) {
            if (Array.isArray(data[key])) { items = data[key]; break; }
          }
        }
        // Filter to only group chats (JID ends with @g.us)
        return items.filter((g) => {
          const jid = g.JID || g.jid || g.id || g.groupId || g.chatId || "";
          return jid.endsWith("@g.us") || g.isGroup === true || g.IsGroup === true;
        });
      }

      // Try multiple endpoints with logging — always fresh from UAZAPI, never from DB
      const endpoints = [
        { path: "/group/list", method: "GET", body: undefined },
        { path: "/chat/getChats", method: "GET", body: undefined },
        { path: "/group/fetchAllGroups", method: "GET", body: undefined },
        { path: "/chat/list", method: "GET", body: undefined },
        { path: "/chat/listGroups", method: "POST", body: {} },
        { path: "/chat/findChats", method: "POST", body: { group: true } },
      ];

      let rawResponse: any = null;
      let usedEndpoint = "";

      for (const ep of endpoints) {
        if (groups.length > 0) break;
        try {
          const res = await uazapiRequest(baseUrl, apiToken, ep.path, ep.method, ep.body);
          const data = await res.json();
          console.log(`[groups] ${ep.method} ${ep.path} status=${res.status}`, JSON.stringify(data).slice(0, 500));
          const extracted = extractGroups(data);
          if (extracted.length > 0) {
            groups = extracted;
            usedEndpoint = ep.path;
          } else if (!rawResponse) {
            rawResponse = data;
          }
        } catch (err) {
          console.log(`[groups] ${ep.path} error:`, err);
        }
      }

      if (groups.length === 0) {
        console.log("[groups] No groups found. Raw response:", JSON.stringify(rawResponse).slice(0, 1000));
      }

      // Fetch metadata for groups that have no name (UaZapi V2 returns Name="" in list)
      const enrichedGroups: any[] = [];
      for (const g of groups) {
        const jid = g.JID || g.jid || g.id || g.groupId || g.chatId || "";
        let groupName = g.Subject || g.subject || g.Name || g.name || g.groupName || "";
        const participants = g.Participants || g.participants || [];
        const size = g.size || participants.length || null;
        
        // If name is empty, try multiple endpoints to get group info
        if (!groupName && jid) {
          // Try POST /group/inviteInfo or /group/info with body
          const infoEndpoints = [
            { path: `/group/info`, method: "POST", body: { groupJid: jid } },
            { path: `/group/info?groupJid=${encodeURIComponent(jid)}`, method: "GET", body: undefined },
            { path: `/chat/info`, method: "POST", body: { chatId: jid } },
          ];
          for (const ep of infoEndpoints) {
            if (groupName) break;
            try {
              const infoRes = await uazapiRequest(baseUrl, apiToken, ep.path, ep.method, ep.body);
              const infoData = await infoRes.json();
              console.log(`[groups] info ${ep.method} ${ep.path} =>`, JSON.stringify(infoData).slice(0, 400));
              // Deeply search for name in response
              const info = infoData.group || infoData.data || infoData || {};
              groupName = info.Subject || info.subject || info.Name || info.name || 
                         info.groupName || info.GroupName || info.pushname || 
                         info.notify || info.displayName || "";
              // Also check nested GroupInfo
              if (!groupName && info.GroupInfo) {
                groupName = info.GroupInfo.Subject || info.GroupInfo.Name || "";
              }
              if (!groupName && info.GroupName?.Name) {
                groupName = info.GroupName.Name;
              }
            } catch (_e) { /* try next */ }
          }
        }
        
        enrichedGroups.push({
          id: jid,
          name: groupName || `Grupo ${jid.split("@")[0]?.slice(-6) || "?"}`,
          participantsCount: size,
        });
      }

      const mapped = enrichedGroups.filter((g) => g.id);
      console.log(`[groups] Final result: ${mapped.length} groups for device="${deviceName}" endpoint=${usedEndpoint}`);

      return json({ 
        groups: mapped, 
        debug: {
          deviceName,
          deviceId,
          baseUrl,
          usedEndpoint,
          totalReturned: mapped.length,
        }
      });
    }

    // ─── ACTION: config (save) ───
    if (action === "config") {
      const { instanceId, groupId, groupName, frequency, toggleCampaigns, toggleWarmup, toggleInstances, alertDisconnect, alertCampaignEnd, alertHighFailures, reportType, perTypeGroup } = body;

      const upsertData: Record<string, unknown> = {
        user_id: userId,
        frequency: frequency || "1h",
        toggle_campaigns: toggleCampaigns ?? true,
        toggle_warmup: toggleWarmup ?? true,
        toggle_instances: toggleInstances ?? true,
        alert_disconnect: alertDisconnect ?? true,
        alert_campaign_end: alertCampaignEnd ?? true,
        alert_high_failures: alertHighFailures ?? false,
      };
      if (instanceId) upsertData.device_id = instanceId;

      // Save group_id
      if (groupId) {
        upsertData.group_id = groupId;
        upsertData.group_name = groupName;
      }
      // Also accept perTypeGroup as unified group
      if (perTypeGroup && perTypeGroup.id) {
        upsertData.group_id = perTypeGroup.id;
        upsertData.group_name = perTypeGroup.name || null;
      }

      await serviceClient.from("report_wa_configs").upsert(upsertData, { onConflict: "user_id" });

      await serviceClient.from("report_wa_logs").insert({
        user_id: userId,
        level: "INFO",
        message: `Configuração salva.${reportType ? ` Tipo: ${reportType}, Grupo: ${perTypeGroup?.name || "N/A"}` : ` Grupo: ${groupName || "N/A"}`}`,
      });

      return json({ success: true });
    }

    // ─── ACTION: test ───
    if (action === "test") {
      const { data: config } = await serviceClient
        .from("report_wa_configs")
        .select("id, user_id, device_id, toggle_campaigns, toggle_warmup, toggle_instances, alert_disconnect, alert_campaign_end, alert_high_failures, group_id, group_name, frequency, connected_phone, connection_status")
        .eq("user_id", userId)
        .single();

      if (!config?.device_id) {
        return json({ error: "Configure o dispositivo primeiro" }, 400);
      }

      const { baseUrl, token: apiToken } = await getDeviceCredentials(config.device_id);

      const reportType = body.reportType || "general";
      const targetGroupId = body.groupId || config.group_id;
      const targetGroupName = body.groupName || config.group_name || "N/A";

      if (!targetGroupId) {
        return json({ error: "Selecione um grupo para este tipo de relatório" }, 400);
      }

      let message = "";

      if (reportType === "warmup") {
        message = `🔥 AQUECIMENTO 24H ATIVADO\n\nStatus: ✅ Ciclo iniciado com sucesso\n\n👥 Grupo vinculado:\n${targetGroupName}\n\n⏱ Envio automático:\nA cada 24 horas\n\n📊 O relatório será enviado após a conclusão completa do ciclo.\n\nMonitoramento ativo.`;
      } else if (reportType === "campaigns") {
        message = `📣 MONITORAMENTO DE CAMPANHAS ATIVADO\n\nStatus: ✅ Alertas de campanha ativos\n\n👥 Grupo vinculado:\n${targetGroupName}\n\n📊 Eventos monitorados:\n• Início de campanha\n• Finalização de campanha\n• Resultado consolidado\n\nRelatórios serão enviados automaticamente ao concluir cada campanha.`;
      } else if (reportType === "connection") {
        message = `🔌 ALERTAS DE CONEXÃO ATIVADOS\n\nStatus: ✅ Monitoramento em tempo real ativo\n\n👥 Grupo vinculado:\n${targetGroupName}\n\n🚨 Eventos monitorados:\n• Desconexão detectada\n• Reconexão registrada\n• Falhas críticas\n\nNotificações enviadas instantaneamente.`;
      } else {
        message = `📡 MONITORAMENTO ATIVADO\n\nStatus: ✅ Conectado com sucesso\n\n👥 Grupo de destino:\n${targetGroupName}\n\n⏱ Ciclo de relatório:\n${config.frequency === "24h" ? "24 horas (automático)" : config.frequency}\n\n📊 Módulos ativos:\n${config.toggle_warmup ? "• Aquecimento\n" : ""}${config.toggle_campaigns ? "• Campanhas\n" : ""}${config.toggle_instances ? "• Status de Instâncias\n" : ""}\nSistema pronto para envio de relatórios.`;
      }

      try {
        const sendAttempts = [
          { path: "/send/text", body: { number: targetGroupId, text: message } },
          { path: "/message/sendText", body: { chatId: targetGroupId, text: message } },
          { path: "/message/sendText", body: { to: targetGroupId, text: message } },
        ];
        let sendSuccess = false;
        let sendData: any = null;
        
        for (const attempt of sendAttempts) {
          if (sendSuccess) break;
          try {
            const res = await uazapiRequest(baseUrl, apiToken, attempt.path, "POST", attempt.body);
            sendData = await res.json();
            console.log(`[test] ${attempt.path} response:`, JSON.stringify(sendData).slice(0, 300));
            if (res.status >= 200 && res.status < 300 && !sendData.error && sendData.code !== 404) {
              sendSuccess = true;
            }
          } catch (_e) { /* try next */ }
        }
        
        if (!sendSuccess) {
          throw new Error(sendData?.message || sendData?.error?.message || "Nenhum endpoint de envio funcionou");
        }

        const typeLabel = reportType === "warmup" ? "Aquecimento" : reportType === "campaigns" ? "Campanhas" : reportType === "connection" ? "Conexão" : "Geral";
        await serviceClient.from("report_wa_logs").insert({
          user_id: userId,
          level: "INFO",
          message: `${typeLabel}: Mensagem de ativação enviada para "${targetGroupName}"`,
        });

        return json({ success: true, response: sendData });
      } catch (err: unknown) {
        const errMsg = err instanceof Error ? err.message : "Erro desconhecido";
        await serviceClient.from("report_wa_logs").insert({
          user_id: userId,
          level: "ERROR",
          message: `Falha ao enviar teste: ${errMsg}`,
        });
        return json({ error: errMsg }, 500);
      }
    }

    // ─── ACTION: events (fetch recent event logs) ───
    if (action === "events") {
      const { data: logs } = await serviceClient
        .from("report_wa_logs")
        .select("id, created_at, level, message")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(50);

      // Group events that occurred in the same minute
      const events: { id: string; ts: string; type: string; level: string; text: string }[] = [];
      const minuteGroups = new Map<string, { ids: string[]; ts: string; level: string; texts: string[] }>();

      for (const log of (logs || [])) {
        const minuteKey = log.created_at.slice(0, 16); // YYYY-MM-DDTHH:MM
        const existing = minuteGroups.get(`${minuteKey}-${log.level}`);
        if (existing) {
          existing.ids.push(log.id);
          existing.texts.push(log.message);
        } else {
          minuteGroups.set(`${minuteKey}-${log.level}`, {
            ids: [log.id],
            ts: log.created_at,
            level: log.level,
            texts: [log.message],
          });
        }
      }

      for (const [key, group] of minuteGroups) {
        const type = group.level === "ERROR" ? "error" : group.level === "WARN" ? "warning" : "info";
        events.push({
          id: group.ids[0],
          ts: group.ts,
          type,
          level: group.level,
          text: group.texts.length > 1
            ? `${group.texts[0]} (+${group.texts.length - 1} eventos)`
            : group.texts[0],
        });
      }

      // Sort by ts descending
      events.sort((a, b) => b.ts.localeCompare(a.ts));

      return json({ events: events.slice(0, 50) });
    }

    // ─── ACTION: clear-events (delete all event logs for user) ───
    if (action === "clear-events") {
      await serviceClient
        .from("report_wa_logs")
        .delete()
        .eq("user_id", userId);

      return json({ success: true });
    }

    // ─── ACTION: logs (kept for backward compat) ───
    if (action === "logs") {
      const { data: logs } = await serviceClient
        .from("report_wa_logs")
        .select("id, user_id, level, message, created_at")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(50);

      return json({ logs: logs || [] });
    }

    // ─── ACTION: check-events (detect and send automatic events to group) ───
    if (action === "check-events") {
      const { data: config } = await serviceClient
        .from("report_wa_configs")
        .select("id, user_id, device_id, toggle_campaigns, toggle_warmup, toggle_instances, alert_disconnect, alert_campaign_end, alert_high_failures, group_id, group_name, frequency, connected_phone, connection_status")
        .eq("user_id", userId)
        .single();

      if (!config?.device_id) {
        return json({ skipped: true, reason: "No device configured" });
      }

      if (!config.group_id) {
        return json({ skipped: true, reason: "No group configured" });
      }

      const { baseUrl, token: apiToken } = await getDeviceCredentials(config.device_id);

      const nowBRT = new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit" });
      const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();

      async function sendToTargetGroup(groupId: string, message: string): Promise<boolean> {
        if (!groupId) return false;
        const sendAttempts = [
          { path: "/send/text", body: { number: groupId, text: message } },
          { path: "/message/sendText", body: { chatId: groupId, text: message } },
          { path: "/message/sendText", body: { to: groupId, text: message } },
        ];
        for (const attempt of sendAttempts) {
          try {
            const res = await uazapiRequest(baseUrl, apiToken, attempt.path, "POST", attempt.body);
            const data = await res.json();
            if (res.status >= 200 && res.status < 300 && !data.error && data.code !== 404) return true;
          } catch (_e) { /* try next */ }
        }
        return false;
      }

      async function wasRecentlySent(pattern: string, minutesAgo = 5): Promise<boolean> {
        const since = new Date(Date.now() - minutesAgo * 60 * 1000).toISOString();
        const { data } = await serviceClient
          .from("report_wa_logs").select("id").eq("user_id", userId)
          .ilike("message", pattern).gte("created_at", since).limit(1);
        return !!(data && data.length > 0);
      }

      let sentCount = 0;

      // ═══ CONNECTION ALERTS → group_id ═══
      if (config.alert_disconnect) {
        const gid = config.group_id;
        if (gid) {
          const { data: allDevices } = await serviceClient
            .from("devices").select("id, name, number, status, login_type")
            .eq("user_id", userId).neq("login_type", "report_wa");

          for (const dev of (allDevices || [])) {
            if (["Disconnected", "disconnected"].includes(dev.status)) {
              if (!(await wasRecentlySent(`%${dev.name}%desconect%alerta%`))) {
                const msg = `⚠️ ALERTA DE CONEXÃO\n\n🖥 Instância: ${dev.name}\n📞 Número: ${dev.number || "N/A"}\n\n❌ Status: Desconectado\n⏱ Horário: ${nowBRT}\n\nA instância perdeu a conexão com o WhatsApp.\n\nPara voltar a funcionar, é necessário reconectar.`;
                if (await sendToTargetGroup(gid, msg)) sentCount++;
                await serviceClient.from("report_wa_logs").insert({ user_id: userId, level: "WARN", message: `Instância "${dev.name}" desconectada — alerta enviado` });
              }
            }
            if (dev.status === "Ready") {
              if (!(await wasRecentlySent(`%${dev.name}%conectada%alerta%`))) {
                const msg = `✅ INSTÂNCIA CONECTADA\n\n🔹 Instância: ${dev.name}\n📱 Chip: ${dev.profile_name || dev.name}\n📞 Número: ${dev.number || "N/A"}\n\n🟢 Status: Online\n⏱ Conectado às: ${nowBRT}`;
                if (await sendToTargetGroup(gid, msg)) sentCount++;
                await serviceClient.from("report_wa_logs").insert({ user_id: userId, level: "INFO", message: `Instância "${dev.name}" conectada — alerta enviado` });
              }
            }
          }
        }
      }

      // ═══ CAMPAIGN ALERTS → group_id ═══
      if (config.toggle_campaigns && config.group_id) {
          // Started
          const { data: startedCampaigns } = await serviceClient
            .from("campaigns").select("id, name, total_contacts, started_at")
            .eq("user_id", userId).eq("status", "sending").gte("started_at", fiveMinAgo);
          for (const camp of (startedCampaigns || [])) {
            if (!(await wasRecentlySent(`%campanha%${camp.name}%iniciada%`))) {
              const msg = `📣 CAMPANHA INICIADA\n\nCampanha: ${camp.name}\n\n👥 Total de contatos: ${camp.total_contacts || 0}\n\n⏱ Início: ${nowBRT}\n\nO envio de mensagens foi iniciado.`;
              if (await sendToTargetGroup(config.group_id, msg)) sentCount++;
              await serviceClient.from("report_wa_logs").insert({ user_id: userId, level: "INFO", message: `Campanha "${camp.name}" iniciada — alerta enviado` });
            }
          }

          // Paused
          const { data: pausedCampaigns } = await serviceClient
            .from("campaigns").select("id, name, sent_count, total_contacts")
            .eq("user_id", userId).eq("status", "paused").gte("updated_at", fiveMinAgo);
          for (const camp of (pausedCampaigns || [])) {
            if (!(await wasRecentlySent(`%campanha%${camp.name}%pausada%`))) {
              const msg = `⏸ CAMPANHA PAUSADA\n\nCampanha: ${camp.name}\n\n📊 Progresso:\n✅ Enviadas: ${camp.sent_count || 0}/${camp.total_contacts || 0}\n\n⏱ Horário: ${nowBRT}\n\nA campanha foi pausada pelo operador.`;
              if (await sendToTargetGroup(config.group_id, msg)) sentCount++;
              await serviceClient.from("report_wa_logs").insert({ user_id: userId, level: "INFO", message: `Campanha "${camp.name}" pausada — alerta enviado` });
            }
          }

          // Completed/failed/canceled
          const { data: finishedCampaigns } = await serviceClient
            .from("campaigns").select("id, name, status, sent_count, delivered_count, failed_count, total_contacts, started_at, completed_at")
            .eq("user_id", userId).in("status", ["completed", "failed", "canceled"]).gte("updated_at", fiveMinAgo);
          for (const camp of (finishedCampaigns || [])) {
            const statusLabel = camp.status === "completed" ? "FINALIZADA" : camp.status === "canceled" ? "CANCELADA" : "ERRO";
            if (!(await wasRecentlySent(`%campanha%${camp.name}%${statusLabel.toLowerCase()}%`))) {
              const pending = Math.max(0, (camp.total_contacts || 0) - (camp.sent_count || 0) - (camp.failed_count || 0));
              let duration = "";
              if (camp.started_at && camp.completed_at) {
                const diffMs = new Date(camp.completed_at).getTime() - new Date(camp.started_at).getTime();
                const mins = Math.floor(diffMs / 60000);
                const secs = Math.floor((diffMs % 60000) / 1000);
                duration = mins > 0 ? `${mins}min ${secs}s` : `${secs}s`;
              }
              const icon = camp.status === "completed" ? "📣" : camp.status === "canceled" ? "🚫" : "❌";
              const statusFinal = camp.status === "completed" ? "Concluída" : camp.status === "canceled" ? "Cancelada" : "Erro";
              const msg = `${icon} CAMPANHA ${statusLabel}\n\nCampanha: ${camp.name}\n\n📊 Resultado da campanha\n\n👥 Total de contatos: ${camp.total_contacts || 0}\n\n✅ Mensagens enviadas: ${camp.sent_count || 0}\n📬 Mensagens entregues: ${camp.delivered_count || 0}\n\n❌ Falhas registradas: ${camp.failed_count || 0}\n⏳ Pendentes: ${pending}\n\n⏱ Tempo total de execução:\n${duration || "N/A"}\n\nStatus da campanha: ${statusFinal}`;
              if (await sendToTargetGroup(config.group_id, msg)) sentCount++;
              await serviceClient.from("report_wa_logs").insert({ user_id: userId, level: "INFO", message: `Campanha "${camp.name}" ${statusLabel.toLowerCase()} — alerta enviado` });
            }
          }

          // High failure rate
          if (config.alert_high_failures) {
            const { data: activeCampaigns } = await serviceClient
              .from("campaigns").select("id, name, sent_count, failed_count")
              .eq("user_id", userId).eq("status", "sending");
            for (const camp of (activeCampaigns || [])) {
              const total = (camp.sent_count || 0) + (camp.failed_count || 0);
              if (total >= 10 && (camp.failed_count || 0) / total > 0.3) {
                if (!(await wasRecentlySent(`%${camp.name}%falhas detectadas%`, 15))) {
                  const rate = Math.round(((camp.failed_count || 0) / total) * 100);
                  const msg = `🚨 FALHAS DETECTADAS\n\nCampanha: ${camp.name}\n\n⚠️ Taxa de falha: ${rate}%\n❌ Falhas: ${camp.failed_count || 0}/${total}\n\n⏱ Horário: ${nowBRT}\n\nA taxa de falha está acima de 30%. Considere pausar a campanha para investigação.`;
                  if (await sendToTargetGroup(config.group_id, msg)) sentCount++;
                  await serviceClient.from("report_wa_logs").insert({ user_id: userId, level: "WARN", message: `Campanha "${camp.name}" falhas detectadas (${rate}%) — alerta enviado` });
                }
              }
            }
      }

      // ═══ WARMUP ALERTS → group_id ═══
      if (config.toggle_warmup && config.group_id) {
          const { data: activeCycles } = await serviceClient
            .from("warmup_cycles").select("id, device_id, day_index, days_total, phase, started_at")
            .eq("user_id", userId).eq("is_running", true);

          for (const cycle of (activeCycles || [])) {
            if (await wasRecentlySent(`%aquecimento%${cycle.device_id.substring(0, 8)}%`, 60 * 23)) continue;

            const { data: dev } = await serviceClient.from("devices").select("name, number, status").eq("id", cycle.device_id).maybeSingle();
            if (!dev) continue;

            const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
            const { data: warmupLogs } = await serviceClient
              .from("warmup_logs").select("id, status")
              .eq("user_id", userId).eq("device_id", cycle.device_id).gte("created_at", oneDayAgo);
            if (!warmupLogs || warmupLogs.length === 0) continue;

            const sentMsgs = warmupLogs.filter(l => l.status === "sent").length;
            const failed = warmupLogs.filter(l => l.status !== "sent").length;
            const received = warmupLogs.length - sentMsgs;
            const msg = `🔥 RELATÓRIO DE AQUECIMENTO (24H)\n\nInstância: ${dev.name}\nNúmero: ${dev.number || "N/A"}\n\n📊 Atividades registradas\n\n📨 Mensagens enviadas: ${sentMsgs}\n\n📩 Mensagens recebidas: ${received}\n\n👥 Interações em grupos: ${warmupLogs.length}\n\n⏱ Última atividade registrada:\n${new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}\n\n🔎 Status atual da instância: ${dev.status === "Ready" ? "🟢 Online" : "🔴 Offline"}\n\nRelatório gerado automaticamente após o ciclo de aquecimento de 24h.`;
            if (await sendToTargetGroup(config.group_id, msg)) sentCount++;
            await serviceClient.from("report_wa_logs").insert({ user_id: userId, level: "INFO", message: `Resumo aquecimento ${cycle.device_id.substring(0, 8)} enviado: ${sentMsgs} ok, ${failed} falhas` });
          }
        }
      }

      return json({ success: true, eventsSent: sentCount });
    }

    return json({ error: "Ação não reconhecida" }, 400);
  } catch (error: unknown) {
    console.error("report-wa error:", error);
    const msg = error instanceof Error ? error.message : "Unknown error";
    return json({ error: msg }, 500);
  }
});
