export type ResolvedGroup = {
  jid: string;
  name: string;
};

export function normalizeGroupName(value: string | null | undefined): string {
  return String(value ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9#]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function extractInviteCode(value: string | null | undefined): string | null {
  const raw = String(value ?? "").trim();
  if (!raw || raw.includes("@g.us")) return null;

  const match = raw.match(/chat\.whatsapp\.com\/([A-Za-z0-9_-]+)/i);
  if (match?.[1]) return match[1];

  const sanitized = raw
    .replace(/^https?:\/\//i, "")
    .replace(/^chat\.whatsapp\.com\//i, "")
    .split(/[/?#\s]/)[0]
    .trim();

  return /^[A-Za-z0-9_-]{10,}$/.test(sanitized) ? sanitized : null;
}

function addResolvedGroup(
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
        const jid = row?.JID || row?.jid || row?.id || row?.groupJid || row?.chatId || row?.group?.JID || row?.group?.jid || row?.data?.jid || row?.data?.id || null;
        const name = row?.subject || row?.name || row?.Name || row?.title || row?.group?.subject || row?.group?.name || row?.data?.subject || row?.data?.name || "";
        const invite = row?.inviteCode || row?.invite || row?.inviteLink || row?.groupInviteCode || row?.invite_link || row?.group?.inviteCode || row?.group?.invite || row?.data?.inviteCode || row?.data?.inviteLink || null;
        addResolvedGroup(groups, { jid, name, invite });
      }
    } catch {
      // tenta próximo endpoint
    }
  }

  return groups;
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

  const normalizedAliases = Array.from(new Set([raw, ...aliases]
    .map((value) => normalizeGroupName(value))
    .filter(Boolean)));

  for (const alias of normalizedAliases) {
    const byName = groupMap.get(`name:${alias}`);
    if (byName) return byName;
  }

  if (normalizedAliases.length === 0) return null;

  const seen = new Set<string>();
  for (const entry of groupMap.values()) {
    if (!entry?.jid || seen.has(entry.jid)) continue;
    seen.add(entry.jid);

    const normalizedEntryName = normalizeGroupName(entry.name);
    if (!normalizedEntryName) continue;

    if (normalizedAliases.some((alias) => normalizedEntryName.includes(alias) || alias.includes(normalizedEntryName))) {
      return entry;
    }
  }

  return null;
}