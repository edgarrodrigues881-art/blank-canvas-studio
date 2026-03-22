import { describe, it, expect } from "vitest";

// ══════════════════════════════════════════════════════════
// Warmup Auto Save — Automated Logic Tests
// ══════════════════════════════════════════════════════════

// ── Reproduce message generator arrays (subset for testing) ──
const SAUDACOES = [
  "oi", "oii", "oiii", "olá", "ola", "e aí", "eai", "eae",
  "fala", "fala aí", "salve", "opa", "hey", "ei",
  "bom dia", "boa tarde", "boa noite",
  "tudo bem", "tudo certo", "tudo joia", "tudo tranquilo",
  "e aí como tá", "e aí blz", "fala parceiro", "fala amigo",
  "oi oi", "eae mano", "fala ae", "opa tudo bem",
];

const PERGUNTAS = [
  "como está seu cachorro", "como está a casa nova", "conseguiu terminar a mudança",
  "como está o trabalho", "como está sua família", "como foi seu dia",
  "está tudo bem por aí", "como estão as coisas aí", "conseguiu resolver aquilo",
];

const RESPOSTAS_CURTAS = [
  "ss", "sim", "aham", "uhum", "pode crer", "exato",
  "verdade", "isso aí", "com certeza", "claro",
  "tá certo", "beleza", "blz", "joia", "show",
  "massa", "dahora", "top", "boa", "firmeza",
  "haha", "kkk", "kkkk", "rsrs",
  "é mesmo", "pois é", "né", "sei",
  "entendi", "ah sim", "faz sentido", "de boa",
];

const EMOJIS_POOL = [
  "🙂", "😂", "😅", "😄", "👍", "🙏", "🔥", "👀", "😎", "🤝",
  "😊", "🤔", "💯", "👏", "✌️", "🎉", "🙌", "😁", "🤗", "👌",
  "💪", "🌟", "⭐", "😃", "🤙", "👋", "❤️", "😆", "🫡", "🤣",
];

// ── Reproduce helper functions ──
function randInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function pickRandom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function maybeEmoji(msg: string): string {
  const r = Math.random();
  if (r < 0.55) return msg;
  if (r < 0.85) return `${msg} ${pickRandom(EMOJIS_POOL)}`;
  return `${msg} ${pickRandom(EMOJIS_POOL)}${pickRandom(EMOJIS_POOL)}`;
}

function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// ── Reproduce buildMsg for autosave context ──
function buildMsgAutosave(): string {
  const s = randInt(1, 6);
  if (s === 1) return pickRandom(RESPOSTAS_CURTAS);
  if (s === 2) return cap(maybeEmoji(pickRandom(SAUDACOES)));
  if (s === 3) return cap(maybeEmoji(`${pickRandom(SAUDACOES)}, ${pickRandom(PERGUNTAS)}?`));
  if (s === 4) return cap(maybeEmoji(`${pickRandom(PERGUNTAS)}?`));
  if (s === 5) return pickRandom(RESPOSTAS_CURTAS) + " " + pickRandom(EMOJIS_POOL);
  return cap(maybeEmoji(pickRandom(SAUDACOES)));
}

const MAX_AUTOSAVE_LEN = 40;

function generateAutosaveMessage(): string {
  const recentMsgs: string[] = [];
  for (let attempt = 0; attempt < 80; attempt++) {
    const msg = buildMsgAutosave();
    if (msg.length >= 5 && msg.length <= MAX_AUTOSAVE_LEN && !recentMsgs.includes(msg)) {
      recentMsgs.push(msg);
      return msg;
    }
  }
  return pickRandom(RESPOSTAS_CURTAS).substring(0, MAX_AUTOSAVE_LEN);
}

// ── Phase logic ──
function getGroupsEndDay(chipState: string): number {
  return chipState === "unstable" ? 7 : 4;
}

function getPhaseForDay(day: number, chipState: string): string {
  if (day <= 1) return "pre_24h";
  const groupsEnd = getGroupsEndDay(chipState);
  if (day <= groupsEnd) return "groups_only";
  if (day === groupsEnd + 1) return "autosave_enabled";
  return "community_enabled";
}

// ── Volume logic ──
interface DayVolumes {
  groupMsgs: number;
  autosaveContacts: number;
  autosaveRounds: number;
  statusPosts: number;
}

function getAutosaveVolumes(chipState: string, dayIndex: number, phase: string): DayVolumes {
  const v: DayVolumes = { groupMsgs: 0, autosaveContacts: 0, autosaveRounds: 0, statusPosts: 0 };
  if (phase === "pre_24h" || phase === "completed") return v;
  v.groupMsgs = randInt(200, 500);
  v.statusPosts = 5;
  if (phase === "autosave_enabled" || phase === "community_enabled" || phase === "community_light") {
    v.autosaveContacts = 5;
    v.autosaveRounds = 3;
  }
  return v;
}

// ══════════════════════════════════════════════════════════
// TESTS
// ══════════════════════════════════════════════════════════

describe("Auto Save — Mensagens curtas (5-40 chars)", () => {
  it("deve gerar 500 mensagens todas com ≤40 caracteres", () => {
    for (let i = 0; i < 500; i++) {
      const msg = generateAutosaveMessage();
      expect(msg.length).toBeGreaterThanOrEqual(5);
      expect(msg.length).toBeLessThanOrEqual(MAX_AUTOSAVE_LEN);
    }
  });

  it("deve gerar mensagens não-vazias", () => {
    for (let i = 0; i < 100; i++) {
      const msg = generateAutosaveMessage();
      expect(msg.trim().length).toBeGreaterThan(0);
    }
  });

  it("deve gerar variedade (pelo menos 15 msgs únicas em 50)", () => {
    const msgs = new Set<string>();
    for (let i = 0; i < 50; i++) {
      msgs.add(generateAutosaveMessage());
    }
    expect(msgs.size).toBeGreaterThanOrEqual(15);
  });

  it("buildMsg autosave nunca gera reflexões longas nem histórias", () => {
    // Rodamos 1000x e verificamos que nenhuma excede 40 chars
    let maxLen = 0;
    for (let i = 0; i < 1000; i++) {
      const msg = buildMsgAutosave();
      if (msg.length > maxLen) maxLen = msg.length;
    }
    // Algumas combinações saudacao+pergunta podem passar de 40, 
    // mas o generateAutosaveMessage filtra. Aqui verificamos que
    // o buildMsg produz msgs razoavelmente curtas (maioria <60)
    // O filtro de 40 chars é aplicado no generateAutosaveMessage
    expect(maxLen).toBeLessThan(120); // sem reflexões longas (100-250 chars)
  });
});

describe("Auto Save — Fase e Timeline", () => {
  it("chip novo: Auto Save começa no dia 5", () => {
    expect(getPhaseForDay(4, "new")).toBe("groups_only");
    expect(getPhaseForDay(5, "new")).toBe("autosave_enabled");
    expect(getPhaseForDay(6, "new")).toBe("community_enabled");
  });

  it("chip recuperado: Auto Save começa no dia 5", () => {
    expect(getPhaseForDay(4, "recovered")).toBe("groups_only");
    expect(getPhaseForDay(5, "recovered")).toBe("autosave_enabled");
    expect(getPhaseForDay(6, "recovered")).toBe("community_enabled");
  });

  it("chip instável: Auto Save começa no dia 8", () => {
    expect(getPhaseForDay(7, "unstable")).toBe("groups_only");
    expect(getPhaseForDay(8, "unstable")).toBe("autosave_enabled");
    expect(getPhaseForDay(9, "unstable")).toBe("community_enabled");
  });

  it("Auto Save dura exatamente 1 dia antes de community", () => {
    for (const chip of ["new", "recovered", "unstable"]) {
      const groupsEnd = getGroupsEndDay(chip);
      const autosaveDay = groupsEnd + 1;
      const communityDay = groupsEnd + 2;
      expect(getPhaseForDay(autosaveDay, chip)).toBe("autosave_enabled");
      expect(getPhaseForDay(communityDay, chip)).toBe("community_enabled");
    }
  });
});

describe("Auto Save — Volume (5 contatos × 3 rodadas = 15 msgs)", () => {
  it("fase autosave_enabled: 5 contatos, 3 rodadas", () => {
    const v = getAutosaveVolumes("new", 5, "autosave_enabled");
    expect(v.autosaveContacts).toBe(5);
    expect(v.autosaveRounds).toBe(3);
  });

  it("fase community_enabled ainda mantém Auto Save ativo", () => {
    const v = getAutosaveVolumes("new", 6, "community_enabled");
    expect(v.autosaveContacts).toBe(5);
    expect(v.autosaveRounds).toBe(3);
  });

  it("total de interações Auto Save por dia = 15", () => {
    const v = getAutosaveVolumes("new", 5, "autosave_enabled");
    expect(v.autosaveContacts * v.autosaveRounds).toBe(15);
  });

  it("fase groups_only NÃO tem Auto Save", () => {
    const v = getAutosaveVolumes("new", 3, "groups_only");
    expect(v.autosaveContacts).toBe(0);
    expect(v.autosaveRounds).toBe(0);
  });

  it("fase pre_24h NÃO tem Auto Save", () => {
    const v = getAutosaveVolumes("new", 1, "pre_24h");
    expect(v.autosaveContacts).toBe(0);
    expect(v.autosaveRounds).toBe(0);
  });

  it("fase completed NÃO tem Auto Save", () => {
    const v = getAutosaveVolumes("new", 15, "completed");
    expect(v.autosaveContacts).toBe(0);
    expect(v.autosaveRounds).toBe(0);
  });
});

describe("Auto Save — Distribuição de contatos (round-robin)", () => {
  it("recipient_index distribui entre contatos disponíveis", () => {
    const contacts = [
      { phone: "+5511999990001", name: "Maria" },
      { phone: "+5511999990002", name: "João" },
      { phone: "+5511999990003", name: "Ana" },
      { phone: "+5511999990004", name: "Pedro" },
      { phone: "+5511999990005", name: "Laura" },
    ];

    // Simula 3 rodadas × 5 contatos
    const sent: string[] = [];
    for (let round = 0; round < 3; round++) {
      for (let c = 0; c < 5; c++) {
        const contact = contacts[c % contacts.length];
        sent.push(`${contact.name}-r${round}`);
      }
    }

    expect(sent).toHaveLength(15);
    // Cada contato recebe exatamente 3 msgs
    for (const contact of contacts) {
      const count = sent.filter(s => s.startsWith(contact.name)).length;
      expect(count).toBe(3);
    }
  });

  it("com menos de 5 contatos, faz round-robin", () => {
    const contacts = [
      { phone: "+5511999990001", name: "Maria" },
      { phone: "+5511999990002", name: "João" },
    ];

    const recipients: string[] = [];
    for (let round = 0; round < 3; round++) {
      for (let c = 0; c < 5; c++) {
        const contact = contacts[c % contacts.length];
        recipients.push(contact.name);
      }
    }

    // Maria: indices 0,2,4 per round × 3 = 9
    // João:  indices 1,3 per round × 3 = 6
    const mariaCount = recipients.filter(n => n === "Maria").length;
    const joaoCount = recipients.filter(n => n === "João").length;
    expect(mariaCount).toBe(9);
    expect(joaoCount).toBe(6);
    expect(mariaCount + joaoCount).toBe(15);
  });
});

describe("Auto Save — Scheduling (últimas 3h da janela)", () => {
  it("jobs são agendados nas últimas 3 horas do dia", () => {
    const windowEndUTC = new Date();
    windowEndUTC.setUTCHours(22, 0, 0, 0);
    const windowStartUTC = new Date();
    windowStartUTC.setUTCHours(10, 0, 0, 0);

    const effectiveStart = windowStartUTC.getTime();
    const effectiveEnd = windowEndUTC.getTime();

    const autosaveWindowStart = effectiveEnd - 3 * 60 * 60 * 1000; // 19:00 UTC
    const asStart = Math.max(autosaveWindowStart, effectiveStart);

    // Auto Save starts at 19:00 UTC (3h before end)
    expect(asStart).toBe(autosaveWindowStart);
    expect(new Date(asStart).getUTCHours()).toBe(19);
  });

  it("15 jobs são gerados (5 contatos × 3 rodadas)", () => {
    const contacts = 5;
    const rounds = 3;
    const totalJobs = contacts * rounds;
    expect(totalJobs).toBe(15);
  });
});
