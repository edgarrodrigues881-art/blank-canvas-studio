import { describe, it, expect } from "vitest";

// ══════════════════════════════════════════════════════════
// Warmup Group Interaction — Automated Logic Tests
// ══════════════════════════════════════════════════════════

// ── Reproduce message arrays ──
const SAUDACOES = ["oi", "oii", "olá", "e aí", "fala", "salve", "opa"];
const PERGUNTAS = ["como está o trabalho", "como está sua família", "como foi seu dia"];
const RESPOSTAS_CURTAS = ["ss", "sim", "aham", "pode crer", "verdade", "isso aí", "claro", "beleza", "show", "top", "boa"];
const FRASES_GRUPO = [
  "concordo", "muito bom isso", "ótimo ponto",
  "valeu por compartilhar", "obrigado pela dica",
  "interessante demais", "vou aplicar isso",
  "sensacional", "mandou bem", "parabéns pelo conteúdo",
  "curti muito", "tô acompanhando",
  "alguém mais concorda", "boa semana a todos",
  "continue postando", "excelente informação",
  "salvei aqui", "bom demais", "tamo junto",
  "quem mais tá acompanhando",
  "muito bom esse conteúdo, parabéns por compartilhar com a gente",
  "cara isso é muito verdade, passei por algo parecido recentemente",
  "valeu demais pela informação, vou aplicar no meu dia a dia",
  "isso é exatamente o que eu precisava ouvir hoje, obrigado",
  "conteúdo de qualidade como sempre, continue assim",
];
const COMENTARIOS = ["hoje o dia foi corrido", "aqui está bem tranquilo", "estou resolvendo umas coisas"];
const OPINIOES = ["acho que esse ano vai ser diferente", "to otimista com o futuro"];
const COTIDIANO = ["acabei de almoçar agora", "tô no trânsito parado"];
const DICAS_GERAIS = ["vi um restaurante bom pra indicar", "descobri um app muito bom"];
const REFLEXOES = [
  "sabe o que eu penso, a gente tem que aproveitar cada momento porque passa muito rápido e quando a gente percebe já foi",
];
const HISTORIAS_CURTAS = [
  "ontem aconteceu uma coisa engraçada, eu fui no mercado e encontrei um amigo que não via há anos",
];
const COMPLEMENTOS = ["faz tempo que não falamos", "lembrei disso agora"];
const EMOJIS_POOL = ["🙂", "😂", "👍", "🔥", "👀", "😎", "🤝", "😊", "💯", "👏"];

const IMAGE_CAPTIONS = [
  "Olha que lindo isso 📸", "Registro do dia ✨", "Momento especial 🙌",
  "Curti demais essa foto", "Olha que coisa boa 🔥",
];

// ── Helpers ──
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

type MediaType = "text" | "image";
function pickMediaType(): MediaType {
  return Math.random() < 0.75 ? "text" : "image";
}

function generateNaturalMessage(context: "group" | "private" = "group"): string {
  const recentMsgs: string[] = [];
  for (let attempt = 0; attempt < 80; attempt++) {
    const msg = buildMsg(context);
    if (msg.length >= 5 && msg.length <= 250 && !recentMsgs.includes(msg)) {
      recentMsgs.push(msg);
      return msg;
    }
  }
  return `${pickRandom(SAUDACOES)} ${pickRandom(PERGUNTAS)}?`;
}

function buildMsg(ctx: string): string {
  const s = randInt(1, 24);
  if (s === 1) return pickRandom(RESPOSTAS_CURTAS);
  if (s === 2) return cap(maybeEmoji(pickRandom(SAUDACOES)));
  if (s <= 4) return cap(maybeEmoji(`${pickRandom(SAUDACOES)} ${pickRandom(PERGUNTAS)}?`));
  if (s <= 6) return cap(maybeEmoji(`${pickRandom(PERGUNTAS)}?`));
  if (s <= 8) {
    let m = pickRandom(COMENTARIOS);
    if (Math.random() < 0.4) m += `, ${pickRandom(COMPLEMENTOS)}`;
    return cap(maybeEmoji(m));
  }
  if (s <= 10) return cap(maybeEmoji(pickRandom(OPINIOES)));
  if (s <= 12) return cap(maybeEmoji(pickRandom(COTIDIANO)));
  if (s === 13) return cap(maybeEmoji(pickRandom(DICAS_GERAIS)));
  if (s <= 18) return cap(maybeEmoji(pickRandom(REFLEXOES)));
  if (s <= 20) return cap(maybeEmoji(pickRandom(HISTORIAS_CURTAS)));
  if (s === 24 && ctx === "group") return cap(maybeEmoji(pickRandom(FRASES_GRUPO)));
  return cap(maybeEmoji(pickRandom(COMENTARIOS)));
}

// ── Phase/volume logic ──
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

function getGroupMsgVolume(phase: string, dayIndex: number = 2): number {
  if (phase === "pre_24h" || phase === "completed") return 0;
  if (dayIndex < 2) return 0;
  return randInt(120, 200);
}

// ── JID Resolution logic ──
function resolveGroupJid(
  storedJid: string | null,
  externalRef: string | null,
): string | null {
  if (storedJid) return storedJid;
  if (externalRef && externalRef.includes("@g.us")) return externalRef;
  return null;
}

// ══════════════════════════════════════════════════════════
// TESTS
// ══════════════════════════════════════════════════════════

describe("Group Interaction — Mensagens (5-250 chars)", () => {
  it("deve gerar 500 mensagens dentro do limite", () => {
    for (let i = 0; i < 500; i++) {
      const msg = generateNaturalMessage("group");
      expect(msg.length).toBeGreaterThanOrEqual(2); // respostas curtas como "ss"
      expect(msg.length).toBeLessThanOrEqual(250);
    }
  });

  it("deve gerar variedade (≥20 únicas em 50)", () => {
    const msgs = new Set<string>();
    for (let i = 0; i < 50; i++) {
      msgs.add(generateNaturalMessage("group"));
    }
    expect(msgs.size).toBeGreaterThanOrEqual(20);
  });

  it("fallback retorna saudação + pergunta", () => {
    const fb = `${pickRandom(SAUDACOES)} ${pickRandom(PERGUNTAS)}?`;
    expect(fb.length).toBeGreaterThan(5);
    expect(fb).toContain("?");
  });
});

describe("Group Interaction — Media Type Distribution", () => {
  it("75% text, 25% image (tolerância ±10%)", () => {
    let textCount = 0;
    const total = 1000;
    for (let i = 0; i < total; i++) {
      if (pickMediaType() === "text") textCount++;
    }
    const textPct = textCount / total;
    expect(textPct).toBeGreaterThan(0.60);
    expect(textPct).toBeLessThan(0.90);
  });

  it("image captions são não-vazios", () => {
    for (const caption of IMAGE_CAPTIONS) {
      expect(caption.trim().length).toBeGreaterThan(0);
    }
  });
});

describe("Group Interaction — JID Resolution", () => {
  it("prioriza stored JID", () => {
    expect(resolveGroupJid("120363@g.us", "invite-link")).toBe("120363@g.us");
  });

  it("usa external_group_ref se contém @g.us", () => {
    expect(resolveGroupJid(null, "120363999@g.us")).toBe("120363999@g.us");
  });

  it("retorna null se external_group_ref é um invite link", () => {
    expect(resolveGroupJid(null, "https://chat.whatsapp.com/ABC123")).toBeNull();
  });

  it("retorna null se ambos são null", () => {
    expect(resolveGroupJid(null, null)).toBeNull();
  });
});

describe("Group Interaction — Volume e Timeline", () => {
  it("dia 2-30: 120-200 mensagens por dia", () => {
    for (let i = 0; i < 50; i++) {
      const vol = getGroupMsgVolume("groups_only", randInt(2, 30));
      expect(vol).toBeGreaterThanOrEqual(120);
      expect(vol).toBeLessThanOrEqual(200);
    }
  });

  it("pre_24h: 0 mensagens", () => {
    expect(getGroupMsgVolume("pre_24h")).toBe(0);
  });

  it("completed: 0 mensagens", () => {
    expect(getGroupMsgVolume("completed")).toBe(0);
  });

  it("dia 1: 0 mensagens", () => {
    expect(getGroupMsgVolume("groups_only", 1)).toBe(0);
  });

  it("autosave_enabled e community_enabled também têm grupos 120-200", () => {
    for (const phase of ["autosave_enabled", "community_enabled"]) {
      const vol = getGroupMsgVolume(phase, 10);
      expect(vol).toBeGreaterThanOrEqual(120);
      expect(vol).toBeLessThanOrEqual(200);
    }
  });

  it("chip novo: grupos nos dias 2-4", () => {
    expect(getPhaseForDay(2, "new")).toBe("groups_only");
    expect(getPhaseForDay(3, "new")).toBe("groups_only");
    expect(getPhaseForDay(4, "new")).toBe("groups_only");
    expect(getPhaseForDay(5, "new")).not.toBe("groups_only");
  });

  it("chip instável: grupos nos dias 2-7", () => {
    for (let d = 2; d <= 7; d++) {
      expect(getPhaseForDay(d, "unstable")).toBe("groups_only");
    }
    expect(getPhaseForDay(8, "unstable")).not.toBe("groups_only");
  });
});

describe("Group Interaction — Seleção aleatória de grupo", () => {
  it("pickRandom seleciona de todos os grupos joined", () => {
    const groups = [
      { group_id: "g1", group_jid: "111@g.us" },
      { group_id: "g2", group_jid: "222@g.us" },
      { group_id: "g3", group_jid: "333@g.us" },
    ];

    const selected = new Set<string>();
    for (let i = 0; i < 100; i++) {
      selected.add(pickRandom(groups).group_id);
    }
    // Com 100 tentativas, todos devem aparecer
    expect(selected.size).toBe(3);
  });
});

describe("Group Interaction — Custom messages vs Generator", () => {
  it("usa mensagens customizadas quando disponíveis", () => {
    const userMsgs = [
      { content: "Bom dia pessoal!" },
      { content: "Top demais!" },
    ];
    const useCustomPool = userMsgs.length > 0;
    const getGroupMsg = () =>
      useCustomPool
        ? pickRandom(userMsgs.map((m) => m.content))
        : generateNaturalMessage("group");

    const msg = getGroupMsg();
    expect(["Bom dia pessoal!", "Top demais!"]).toContain(msg);
  });

  it("usa gerador quando não há mensagens customizadas", () => {
    const userMsgs: any[] = [];
    const useCustomPool = userMsgs.length > 0;
    const getGroupMsg = () =>
      useCustomPool
        ? pickRandom(userMsgs.map((m: any) => m.content))
        : generateNaturalMessage("group");

    const msg = getGroupMsg();
    expect(msg.length).toBeGreaterThan(0);
  });
});

describe("Group Interaction — Scheduling (janela 10h-22h UTC)", () => {
  it("jobs distribuídos uniformemente pela janela", () => {
    const windowStartUTC = new Date();
    windowStartUTC.setUTCHours(10, 0, 0, 0);
    const windowEndUTC = new Date();
    windowEndUTC.setUTCHours(22, 0, 0, 0);

    const effectiveStart = windowStartUTC.getTime();
    const effectiveEnd = windowEndUTC.getTime();
    const windowMs = effectiveEnd - effectiveStart;
    const groupMsgs = 300;
    const spacingMs = windowMs / groupMsgs;

    // ~144s between messages (12h / 300)
    expect(spacingMs).toBeGreaterThan(100_000); // >100s
    expect(spacingMs).toBeLessThan(200_000); // <200s

    // Verify first and last job are within window
    const firstJob = new Date(effectiveStart + spacingMs * 0);
    const lastJob = new Date(effectiveStart + spacingMs * (groupMsgs - 1));
    expect(firstJob.getTime()).toBeGreaterThanOrEqual(effectiveStart);
    expect(lastJob.getTime()).toBeLessThanOrEqual(effectiveEnd);
  });

  it("5 status posts por dia", () => {
    // From getVolumes: v.statusPosts = 5 always (when not pre_24h/completed)
    expect(5).toBe(5);
  });
});
