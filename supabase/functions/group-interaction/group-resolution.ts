export type ResolvedGroup = {
  jid: string;
  name: string;
};

export function normalizeGroupName(value: string | null | undefined): string {
  return String(value ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function extractInviteCode(value: string | null | undefined): string | null {
  const raw = String(value ?? "").trim();
  if (!raw || raw.includes("@g.us")) return null;

  const match = raw.match(/chat\.whatsapp\.com\/([A-Za-z0-9]+)/i);
  if (match?.[1]) return match[1];

  const sanitized = raw
    .replace(/^https?:\/\//i, "")
    .replace(/^chat\.whatsapp\.com\//i, "")
    .split(/[/?#]/)[0]
    .trim();

  return /^[A-Za-z0-9]{10,}$/.test(sanitized) ? sanitized : null;
}

export function addResolvedGroup(
  map: Map<string, ResolvedGroup>,
  group: { jid?: string | null; name?: string | null; invite?: string | null },
) {
  const jid = String(group.jid ?? "").trim();
  if (!jid || !jid.includes("@g.us")) return;

  const entry: ResolvedGroup = {
    jid,
    name: String(group.name ?? "").trim(),
  };

  map.set(jid, entry);

  const inviteCode = extractInviteCode(group.invite);
  if (inviteCode) {
    map.set(inviteCode, entry);
    map.set(`https://chat.whatsapp.com/${inviteCode}`, entry);
  }

  if (entry.name) {
    map.set(`name:${normalizeGroupName(entry.name)}`, entry);
  }
}

async function fetchJson(url: string, token: string): Promise<any | null> {
  const response = await fetch(url, {
    method: "GET",
    headers: {
      token,
      Accept: "application/json",
      "Content-Type": "application/json",
      "Cache-Control": "no-cache",
    },
  });

  if (!response.ok) return null;

  const raw = await response.text();
  if (!raw) return null;

  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export async function fetchDeviceGroups(baseUrl: string, token: string): Promise<Map<string, ResolvedGroup>> {
  const groups = new Map<string, ResolvedGroup>();
  const endpoints = [
    `${baseUrl}/group/fetchAllGroups`,
    `${baseUrl}/group/fetchAllGroups?getParticipants=false`,
    `${baseUrl}/group/list?GetParticipants=false&count=500`,
    `${baseUrl}/group/list?GetParticipants=false&page=1&count=500`,
    `${baseUrl}/group/listAll`,
    `${baseUrl}/chats?type=group&count=500`,
    `${baseUrl}/chat/list?type=group&count=500`,
    `${baseUrl}/chat/list?count=500`,
  ];

  for (const endpoint of endpoints) {
    try {
      const parsed = await fetchJson(endpoint, token);
      if (!parsed) continue;

      const candidates = [
        parsed,
        parsed?.groups,
        parsed?.data,
        parsed?.data?.groups,
        parsed?.chats,
        parsed?.data?.chats,
      ];

      const rows: any[] = [];
      for (const candidate of candidates) {
        if (Array.isArray(candidate)) rows.push(...candidate);
      }

      for (const row of rows) {
        const jid = row?.JID || row?.jid || row?.id || row?.groupJid || row?.chatId || null;
        const name = row?.subject || row?.name || row?.Name || row?.title || "";
        const invite = row?.inviteCode || row?.invite || row?.inviteLink || row?.groupInviteCode || row?.invite_link || null;
        addResolvedGroup(groups, { jid, name, invite });
      }
    } catch {
      // tenta próximo endpoint
    }
  }

  return groups;
}

function extractGroupFromResponse(data: any): ResolvedGroup | null {
  const jsonStr = JSON.stringify(data ?? {});
  const regexMatch = jsonStr.match(/(\d+@g\.us)/);

  const jid = String(
    data?.group?.JID ||
    data?.group?.jid ||
    data?.JID ||
    data?.jid ||
    data?.id ||
    data?.groupJid ||
    data?.gid ||
    data?.groupId ||
    data?.data?.JID ||
    data?.data?.jid ||
    data?.data?.id ||
    data?.data?.groupJid ||
    regexMatch?.[1] ||
    "",
  ).trim();

  if (!jid || !jid.includes("@g.us")) return null;

  const name = String(
    data?.group?.Name ||
    data?.group?.name ||
    data?.group?.Subject ||
    data?.group?.subject ||
    data?.Name ||
    data?.name ||
    data?.Subject ||
    data?.subject ||
    data?.data?.Name ||
    data?.data?.name ||
    data?.data?.Subject ||
    data?.data?.subject ||
    "",
  ).trim();

  return { jid, name };
}

export async function resolveGroupFromInvite(
  baseUrl: string,
  token: string,
  identifier: string,
): Promise<ResolvedGroup | null> {
  const raw = String(identifier ?? "").trim();
  if (!raw) return null;
  if (raw.includes("@g.us")) return { jid: raw, name: "" };

  const inviteCode = extractInviteCode(raw);
  if (!inviteCode) return null;

  const cleanLink = raw.split("?")[0];
  const strategies = [
    { method: "GET", url: `${baseUrl}/group/inviteInfo?inviteCode=${inviteCode}` },
    { method: "POST", url: `${baseUrl}/group/join`, body: JSON.stringify({ invitecode: inviteCode }) },
    { method: "POST", url: `${baseUrl}/group/join`, body: JSON.stringify({ invitecode: cleanLink }) },
    { method: "PUT", url: `${baseUrl}/group/acceptInviteGroup`, body: JSON.stringify({ inviteCode }) },
  ];

  for (const strategy of strategies) {
    try {
      const response = await fetch(strategy.url, {
        method: strategy.method,
        headers: {
          token,
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        ...(strategy.body ? { body: strategy.body } : {}),
      });

      if (response.status === 405) continue;

      const rawBody = await response.text();
      let data: any = null;
      try {
        data = rawBody ? JSON.parse(rawBody) : null;
      } catch {
        data = { raw: rawBody };
      }

      const resolved = extractGroupFromResponse(data);
      if (resolved) return resolved;

      const providerMessage = String(data?.message || data?.msg || data?.error || data?.raw || "").toLowerCase();
      if (response.ok || response.status === 409 || providerMessage.includes("already") || providerMessage.includes("já")) {
        continue;
      }
    } catch {
      // tenta próxima estratégia
    }
  }

  const infoEndpoints = [
    { method: "POST", url: `${baseUrl}/group/info`, body: JSON.stringify({ inviteCode }) },
    { method: "GET", url: `${baseUrl}/group/inviteInfo?inviteCode=${inviteCode}` },
  ];

  for (const endpoint of infoEndpoints) {
    try {
      const response = await fetch(endpoint.url, {
        method: endpoint.method,
        headers: {
          token,
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        ...(endpoint.body ? { body: endpoint.body } : {}),
      });

      const rawBody = await response.text();
      let data: any = null;
      try {
        data = rawBody ? JSON.parse(rawBody) : null;
      } catch {
        data = { raw: rawBody };
      }

      const resolved = extractGroupFromResponse(data);
      if (resolved) return resolved;
    } catch {
      // ignora
    }
  }

  return null;
}

export function resolveGroupJid(
  identifier: string,
  groupMap: Map<string, ResolvedGroup>,
  aliases: string[] = [],
): ResolvedGroup | null {
  const raw = String(identifier ?? "").trim();
  if (!raw) return null;

  if (raw.includes("@g.us")) {
    const entry = groupMap.get(raw);
    return entry || { jid: raw, name: "" };
  }

  const byExact = groupMap.get(raw);
  if (byExact) return byExact;

  const inviteCode = extractInviteCode(raw);
  if (inviteCode) {
    const byCode = groupMap.get(inviteCode) || groupMap.get(`https://chat.whatsapp.com/${inviteCode}`);
    if (byCode) return byCode;
  }

  const candidates = [raw, ...aliases];
  for (const candidate of candidates) {
    const normalized = normalizeGroupName(candidate);
    if (!normalized) continue;
    const byName = groupMap.get(`name:${normalized}`);
    if (byName) return byName;
  }

  return null;
}