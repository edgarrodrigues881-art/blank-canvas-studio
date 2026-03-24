import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function normalizePhone(raw: string): string | null {
  const digits = raw.replace(/[^\d]/g, "");
  if (digits.length < 10 || digits.length > 15) return null;
  const phone = digits.startsWith("55") ? digits : `55${digits}`;
  if (phone.length < 12 || phone.length > 13) return null;
  return phone;
}

async function getDeviceCredentials(sb: any, deviceId: string, userId: string, isAdmin: boolean) {
  const q = sb.from("devices").select("id, name, uazapi_base_url, uazapi_token, user_id").eq("id", deviceId);
  if (!isAdmin) q.eq("user_id", userId);
  const { data: device } = await q.single();
  if (!device?.uazapi_base_url || !device?.uazapi_token) return null;
  return device;
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
  const plainPhone = phone.replace(/@.*/, "");

  const strategies = [
    {
      method: "POST",
      url: `${baseUrl}/group/updateParticipants`,
      body: { groupJid: groupId, action: "add", participants: [plainPhone] },
    },
    {
      method: "PUT",
      url: `${baseUrl}/group/updateParticipant?groupJid=${encodeURIComponent(groupId)}`,
      body: { action: "add", participants: [plainPhone] },
    },
    {
      method: "POST",
      url: `${baseUrl}/group/updateParticipants`,
      body: { groupJid: groupId, action: "add", participants: [`${plainPhone}@s.whatsapp.net`] },
    },
    {
      method: "PUT",
      url: `${baseUrl}/group/updateParticipant?groupJid=${encodeURIComponent(groupId)}`,
      body: { action: "add", participants: [`${plainPhone}@s.whatsapp.net`] },
    },
  ];

  let lastError = "";

  for (const strat of strategies) {
    try {
      console.log(`addToGroup trying: ${strat.method} ${strat.url}`);
      const res = await fetch(strat.url, {
        method: strat.method,
        headers,
        body: JSON.stringify(strat.body),
      });

      if (res.status === 405) continue;

      const raw = await res.text();
      let body: any;
      try { body = JSON.parse(raw); } catch { body = { raw }; }

      console.log(`addToGroup response: ${res.status} ${raw.substring(0, 400)}`);

      if (res.status === 404 && (body?.message === "Not Found." || body?.message === "Not Found")) continue;

      if (res.status === 200 || res.status === 201) {
        const errMsg = (body?.error || body?.message || "").toLowerCase();
        if (errMsg.includes("failed") || errMsg.includes("bad-request")) {
          lastError = body?.error || body?.message || raw.substring(0, 200);
          continue;
        }
        return { ok: true, status: res.status, body };
      }

      const rawLower = raw.toLowerCase();
      if (rawLower.includes("already") || rawLower.includes("já") || res.status === 409) {
        return { ok: false, status: 409, error: "already_exists", body };
      }

      if (res.status === 500 && rawLower.includes("failed to update participant")) {
        lastError = body?.error || raw.substring(0, 200);
        continue;
      }

      lastError = typeof body?.error === "string" ? body.error : raw.substring(0, 200);
      continue;
    } catch (e: any) {
      console.error(`addToGroup strategy error:`, e);
      lastError = e.message;
      continue;
    }
  }

  if (lastError.includes("bad-request") || lastError.includes("info query")) {
    return { ok: false, status: 400, error: "Número não encontrado no WhatsApp ou instância não é admin do grupo." };
  }

  return { ok: false, status: 405, error: lastError || "Nenhum endpoint de adição funcionou. Verifique a versão da API." };
}

function translateError(err: string): string {
  const e = (err || "").toLowerCase();
  if (e.includes("whatsapp disconnected") || e.includes("disconnected")) return "WhatsApp desconectado";
  if (e.includes("not admin") || e.includes("not an admin")) return "Instância não é admin do grupo";
  if (e.includes("not found") || e.includes("info query")) return "Número não encontrado no WhatsApp";
  if (e.includes("full") || e.includes("limit")) return "Grupo cheio";
  if (e.includes("blocked") || e.includes("ban")) return "Número bloqueado";
  if (e.includes("rate") || e.includes("429")) return "Limite de requisições atingido";
  if (e.includes("bad-request")) return "Requisição inválida";
  if (e.includes("timeout") || e.includes("timed out")) return "Tempo de resposta excedido";
  if (e.includes("unauthorized") || e.includes("401")) return "Token inválido ou expirado";
  return err;
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
      return new Response(JSON.stringify({ error: "Não autorizado" }), {
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
        return new Response(JSON.stringify({ error: "ID da instância não informado", groups: [], diagnostics: "missing_device_id" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const device = await getDeviceCredentials(sb, deviceId, user.id, isAdmin);
      if (!device) {
        return new Response(JSON.stringify({ error: "Instância não encontrada ou sem credenciais configuradas. Verifique se a instância tem URL base e token da Uazapi.", groups: [], diagnostics: "device_not_found" }), {
          status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      try {
        const allGroups: any[] = [];
        const seenIds = new Set<string>();
        let diagnosticInfo = "";

        // Strategy 1: paginated /group/list
        let paginatedWorked = false;
        for (let page = 0; page < 10; page++) {
          try {
            const res = await fetch(
              `${device.uazapi_base_url}/group/list?GetParticipants=false&page=${page}&count=200`,
              { headers: { token: device.uazapi_token, Accept: "application/json" } }
            );
            if (!res.ok) {
              diagnosticInfo += `group/list page ${page}: HTTP ${res.status}; `;
              break;
            }
            const data = await res.json();
            const arr = Array.isArray(data) ? data : data?.groups || data?.data || [];
            if (!Array.isArray(arr) || arr.length === 0) break;
            paginatedWorked = true;
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
          } catch (e: any) {
            diagnosticInfo += `group/list page ${page} error: ${e.message}; `;
            break;
          }
        }

        // Strategy 2: /group/listAll (fallback)
        if (allGroups.length === 0) {
          try {
            const res2 = await fetch(`${device.uazapi_base_url}/group/listAll`, {
              headers: { token: device.uazapi_token, Accept: "application/json" },
            });
            if (res2.ok) {
              const data2 = await res2.json();
              const arr2 = Array.isArray(data2) ? data2 : data2?.groups || data2?.data || [];
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
            } else {
              diagnosticInfo += `group/listAll: HTTP ${res2.status}; `;
            }
          } catch (e: any) {
            diagnosticInfo += `group/listAll error: ${e.message}; `;
          }
        }

        // Strategy 3: /group/fetchAllGroups (another Uazapi endpoint)
        if (allGroups.length === 0) {
          try {
            const res3 = await fetch(`${device.uazapi_base_url}/group/fetchAllGroups`, {
              method: "POST",
              headers: { token: device.uazapi_token, Accept: "application/json", "Content-Type": "application/json" },
              body: JSON.stringify({}),
            });
            if (res3.ok) {
              const data3 = await res3.json();
              const arr3 = Array.isArray(data3) ? data3 : data3?.groups || data3?.data || [];
              for (const g of arr3) {
                const gid = g.id || g.jid || g.JID || "";
                if (gid && !seenIds.has(gid)) {
                  seenIds.add(gid);
                  allGroups.push({
                    jid: gid,
                    name: g.subject || g.name || g.Subject || g.Name || "Sem nome",
                    participants: 0,
                  });
                }
              }
            } else {
              diagnosticInfo += `group/fetchAllGroups: HTTP ${res3.status}; `;
            }
          } catch (e: any) {
            diagnosticInfo += `group/fetchAllGroups error: ${e.message}; `;
          }
        }

        // Build contextual error message
        let errorMessage = "";
        if (allGroups.length === 0) {
          errorMessage = "Esta instância não retornou grupos disponíveis no momento. ";
          if (diagnosticInfo.includes("401") || diagnosticInfo.includes("403")) {
            errorMessage += "O token da instância pode estar expirado ou inválido. Verifique as credenciais.";
          } else if (diagnosticInfo.includes("timeout") || diagnosticInfo.includes("ECONNREFUSED")) {
            errorMessage += "A instância não respondeu. Verifique se está online e conectada.";
          } else {
            errorMessage += "Tente recarregar a lista, trocar de instância, ou use 'Link do Grupo' / 'JID Manual'.";
          }
        }

        return new Response(JSON.stringify({
          groups: allGroups,
          error: errorMessage || undefined,
          diagnostics: diagnosticInfo || undefined,
          deviceName: device.name,
        }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      } catch (e: any) {
        console.error("list-groups exception:", e);
        return new Response(JSON.stringify({
          error: `Erro ao buscar grupos: ${e.message}. Verifique se a instância está online.`,
          groups: [],
          diagnostics: e.message,
        }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    // ── ACTION: resolve-link ──
    if (action === "resolve-link") {
      const { deviceId, link } = body;
      if (!deviceId || !link) {
        return new Response(JSON.stringify({ error: "Informe a instância e o link do grupo." }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const device = await getDeviceCredentials(sb, deviceId, user.id, isAdmin);
      if (!device) {
        return new Response(JSON.stringify({ error: "Instância não encontrada ou sem credenciais." }), {
          status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const cleanLink = link.trim().replace(/[,;)\]}>'"]+$/, "").split("?")[0];
      const match = cleanLink.match(/chat\.whatsapp\.com\/([A-Za-z0-9_-]+)/);
      const inviteCode = match ? match[1] : cleanLink;

      if (!inviteCode || inviteCode.length < 10) {
        return new Response(JSON.stringify({ error: "Link inválido. Use o formato: https://chat.whatsapp.com/CODIGO" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const headers2 = { token: device.uazapi_token, Accept: "application/json", "Content-Type": "application/json" };

      const strategies = [
        { method: "GET", url: `${device.uazapi_base_url}/group/inviteInfo?inviteCode=${inviteCode}`, body: undefined },
        { method: "POST", url: `${device.uazapi_base_url}/group/join`, body: JSON.stringify({ invitecode: inviteCode }) },
        { method: "POST", url: `${device.uazapi_base_url}/group/join`, body: JSON.stringify({ invitecode: cleanLink }) },
        { method: "PUT", url: `${device.uazapi_base_url}/group/acceptInviteGroup`, body: JSON.stringify({ inviteCode }) },
      ];

      let lastDiagnostic = "";

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

            if (res.status === 500 && (data?.error === "error joining group" || data?.error === "internal server error")) {
              lastDiagnostic = data?.error || "internal error";
              continue;
            }

            const jid = data?.group?.JID || data?.group?.jid || data?.JID || data?.jid || data?.id || data?.groupJid || data?.gid || data?.groupId || data?.data?.JID || data?.data?.jid || "";
            const name = data?.group?.Name || data?.group?.name || data?.group?.Subject || data?.group?.subject || data?.Name || data?.name || data?.Subject || data?.subject || data?.data?.Name || "";

            if (jid) {
              return new Response(JSON.stringify({ jid, name: name || "Grupo", joined: res.status >= 200 && res.status < 300 }), {
                headers: { ...corsHeaders, "Content-Type": "application/json" },
              });
            }

            const msg = (data?.message || data?.msg || raw || "").toLowerCase();
            if (msg.includes("already") || msg.includes("já")) {
              // Instance is already in the group - try to find the group in the list
              return new Response(JSON.stringify({ error: "A instância já é membro deste grupo. Use 'Meus Grupos' para encontrá-lo na lista." }), {
                headers: { ...corsHeaders, "Content-Type": "application/json" },
              });
            }
            lastDiagnostic = raw.substring(0, 100);
          } catch (e: any) {
            console.error(`resolve-link strategy error:`, e);
            lastDiagnostic = e.message;
            continue;
          }
        }

        return new Response(JSON.stringify({
          error: "Não foi possível validar o link do grupo. Confirme se o link está correto e se a instância tem acesso ao grupo. Se o grupo é privado, a instância precisa estar nele.",
        }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      } catch (e: any) {
        console.error("resolve-link error:", e);
        return new Response(JSON.stringify({ error: `Erro interno ao resolver link: ${e.message}` }), {
          status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    // ── ACTION: validate ──
    if (action === "validate") {
      const { contacts: rawContacts } = body;
      if (!Array.isArray(rawContacts) || rawContacts.length === 0) {
        return new Response(JSON.stringify({ error: "Nenhum contato informado" }), {
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
        return new Response(JSON.stringify({ error: "Parâmetros incompletos para verificação de participantes" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const device = await getDeviceCredentials(sb, deviceId, user.id, isAdmin);
      if (!device) {
        return new Response(JSON.stringify({ error: "Instância não encontrada" }), {
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

    // ── ACTION: add-single ──
    if (action === "add-single") {
      const { groupId, deviceId, phone, campaignId, contactId } = body;
      if (!groupId || !deviceId || !phone) {
        return new Response(JSON.stringify({ error: "Parâmetros incompletos", status: "failed" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const device = await getDeviceCredentials(sb, deviceId, user.id, isAdmin);
      if (!device) {
        return new Response(JSON.stringify({ error: "Instância não encontrada", status: "failed" }), {
          status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const result = await addToGroup(device.uazapi_base_url, device.uazapi_token, groupId, phone);

      let status = "failed";
      let errorMsg: string | null = null;

      if (result.ok) {
        status = "completed";
      } else if (result.error === "already_exists" || result.status === 409) {
        status = "already_exists";
      } else {
        errorMsg = translateError(result.error || "Falha na adição");
      }

      // Persist to DB
      if (campaignId && contactId) {
        try {
          await sb.from("mass_inject_contacts").update({
            status,
            error_message: errorMsg,
            device_used: device.name || device.id,
            processed_at: new Date().toISOString(),
          }).eq("id", contactId);

          const field = status === "completed" ? "success_count" : status === "already_exists" ? "already_count" : "fail_count";
          const { data: campaign } = await sb.from("mass_inject_campaigns").select(field).eq("id", campaignId).single();
          if (campaign) {
            await sb.from("mass_inject_campaigns").update({
              [field]: (campaign[field] || 0) + 1,
              updated_at: new Date().toISOString(),
            }).eq("id", campaignId);
          }
        } catch (e) {
          console.error("Erro ao persistir no banco:", e);
        }
      }

      return new Response(JSON.stringify({ status, error: errorMsg }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "Ação desconhecida" }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    console.error("mass-group-inject error:", e);
    return new Response(JSON.stringify({ error: `Erro interno: ${e.message}` }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
