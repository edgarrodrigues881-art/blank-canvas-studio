// Sugestões e correções de português estilo teclado de celular.
// Tudo client-side, sem dependências externas.

// Correções de erros comuns (chave em minúsculo, sem acento na chave -> resultado correto)
const CORRECTIONS: Record<string, string> = {
  "vc": "você",
  "vcs": "vocês",
  "voce": "você",
  "voces": "vocês",
  "naum": "não",
  "nao": "não",
  "tbm": "também",
  "tambem": "também",
  "tb": "também",
  "pq": "porque",
  "porq": "porque",
  "porquê": "porque",
  "obg": "obrigado",
  "obgda": "obrigada",
  "obrigado": "obrigado",
  "blz": "beleza",
  "vlw": "valeu",
  "flw": "falou",
  "hj": "hoje",
  "amnh": "amanhã",
  "amanha": "amanhã",
  "sb": "sábado",
  "sabado": "sábado",
  "dms": "demais",
  "msm": "mesmo",
  "mto": "muito",
  "mt": "muito",
  "mta": "muita",
  "mts": "muitos",
  "td": "tudo",
  "tdo": "todo",
  "tds": "todos",
  "qlqr": "qualquer",
  "qnd": "quando",
  "qndo": "quando",
  "qto": "quanto",
  "qta": "quanta",
  "cmg": "comigo",
  "ctg": "contigo",
  "agr": "agora",
  "dpois": "depois",
  "depois": "depois",
  "entao": "então",
  "ate": "até",
  "ja": "já",
  "eh": "é",
  "soh": "só",
  "so": "só",
  "neh": "né",
  "ne": "né",
  "ola": "olá",
  "esta": "está",
  "estao": "estão",
  "tava": "estava",
  "ta": "tá",
  "to": "tô",
  "tô": "tô",
  "n": "não",
  "q": "que",
  "tlg": "ta ligado",
  "kd": "cadê",
  "cade": "cadê",
  "fds": "fim de semana",
  "bj": "beijo",
  "bjs": "beijos",
  "abs": "abraços",
  "att": "atenciosamente",
  "fc": "favor confirmar",
  "info": "informação",
  "infos": "informações",
  "msg": "mensagem",
  "msgs": "mensagens",
  "num": "número",
  "n°": "número",
  "qq": "qualquer",
  "tmj": "tamo junto",
  "smp": "sempre",
  "pfvr": "por favor",
  "pf": "por favor",
  "pfv": "por favor",
  "favor": "por favor",
};

// Vocabulário base para autocompletar
const VOCAB = [
  "olá", "oi", "tudo bem", "bom dia", "boa tarde", "boa noite", "tchau", "até logo", "até mais",
  "obrigado", "obrigada", "por favor", "desculpa", "desculpe", "desculpas", "perdão", "agradeço", "gentileza",
  "pessoa", "pessoal", "pessoas", "pessoalmente",
  "produto", "produtos", "preço", "preços", "promoção", "promoções", "pagamento", "pagamentos",
  "pagar", "parcelado", "parcelas", "pix", "boleto", "cartão", "crédito", "débito", "desconto",
  "pedido", "pedidos", "pendente", "pendência", "proposta", "orçamento", "estoque",
  "entrega", "entregue", "entregar", "endereço", "envio", "enviar", "enviado", "enviei", "frete", "rastreio",
  "informação", "informações", "interessado", "interessada", "interesse",
  "atendimento", "atender", "atendente", "ajudar", "ajuda", "ajudo",
  "aguardo", "aguardando", "anexo", "anexei", "anexado",
  "mensagem", "mensagens", "momento", "minuto", "minutos", "ligar", "ligação", "chamada",
  "número", "necessário", "necessita", "necessidade", "necessidades",
  "cliente", "clientes", "contato", "contatos", "confirmar", "confirmado", "confirmação", "cadastro", "cadastrar",
  "valor", "valores", "vendas", "vender", "vendido", "verifico", "verificar", "verificando", "verificado",
  "disponível", "disponibilidade", "data", "dia", "dias", "dúvida", "dúvidas",
  "empresa", "equipe", "encaminhar", "encaminhei", "encaminhado",
  "ficar", "ficou", "ficaria", "favor", "fazer", "feito", "fechar", "fechado", "finalizar",
  "gostaria", "garantia", "ganhou", "gostei",
  "horário", "hora", "horas",
  "amanhã", "agora", "ainda", "antes", "depois", "hoje", "ontem", "logo", "rápido", "rapidinho",
  "qualquer", "quando", "quanto", "quantidade", "questão", "qual", "quem",
  "retorno", "retornar", "responder", "resposta", "recebido", "recebi", "recebemos",
  "solicitação", "solicitar", "segue", "semana", "seguinte", "sempre", "saber", "sim",
  "tudo", "também", "talvez", "tarde", "tipo", "tem", "tenho", "tente", "teste", "testar", "testando", "testado",
  "trabalho", "trabalhar", "trabalhando",
  "entender", "entendeu", "entendi", "entendo", "entende", "entendemos", "entendido", "entendida",
  "você", "vocês", "vamos", "verdade", "vai",
  "perfeito", "perfeita", "ótimo", "ótima", "excelente", "incrível", "maravilhoso", "maravilhosa",
  "claro", "combinado", "certo", "certeza", "correto", "certinho",
  "não", "nada", "nenhum", "nenhuma", "nunca",
  "loja", "site", "link", "whatsapp", "instagram", "facebook",
  "muito obrigado", "muito obrigada", "fico no aguardo",
  "qualquer dúvida estou à disposição",
  "posso te ajudar", "como posso ajudar",
  "vou verificar e te retorno", "já te retorno",
  "estou à disposição", "fico à disposição",
];

// Frases curtas sugeridas conforme contexto inicial
const PHRASE_BY_PREFIX: Record<string, string[]> = {
  "ola": ["Olá! Tudo bem?", "Olá, como posso te ajudar?"],
  "oi": ["Oi! Tudo bem?", "Oi, como vai?"],
  "bom": ["Bom dia! Tudo bem?", "Bom dia, como posso te ajudar?"],
  "boa": ["Boa tarde! Tudo bem?", "Boa noite! Tudo bem?"],
  "obg": ["Obrigado pelo contato!", "Obrigado, fico no aguardo."],
  "obr": ["Obrigado pelo contato!", "Obrigado, qualquer dúvida estou à disposição."],
  "des": ["Desculpa a demora!", "Desculpe, pode me confirmar?"],
  "qua": ["Qualquer dúvida estou à disposição.", "Quando podemos conversar?"],
  "vou": ["Vou verificar e já te retorno.", "Vou te enviar agora."],
  "ja": ["Já te retorno!", "Já estou verificando."],
  "pos": ["Posso te ajudar?", "Posso te enviar mais informações?"],
  "fic": ["Fico no aguardo!", "Fico à disposição."],
  "agr": ["Agradeço o contato!", "Agora mesmo te envio."],
  "per": ["Perfeito!", "Perfeito, vamos seguir."],
  "cla": ["Claro!", "Claro, sem problemas."],
};

function stripDiacritics(s: string): string {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

export interface Suggestion {
  /** texto que substitui a última palavra */
  insert: string;
  /** rótulo mostrado no chip */
  label: string;
  /** "correction" muda visual */
  kind: "correction" | "completion" | "phrase";
}

/**
 * Retorna até 3 sugestões para a palavra/contexto atual.
 * Considera apenas a última "palavra" sendo digitada (após o último espaço).
 */
export function getSuggestions(text: string): { suggestions: Suggestion[]; lastWord: string } {
  const match = text.match(/(\S+)$/);
  const lastWord = match ? match[1] : "";
  if (!lastWord || lastWord.length < 2) return { suggestions: [], lastWord: "" };

  const lower = lastWord.toLowerCase();
  const norm = stripDiacritics(lower);
  const out: Suggestion[] = [];
  const seen = new Set<string>();

  const push = (s: Suggestion) => {
    if (seen.has(s.insert.toLowerCase())) return;
    seen.add(s.insert.toLowerCase());
    out.push(s);
  };

  // 1) Correção exata (alta prioridade)
  const corr = CORRECTIONS[lower] ?? CORRECTIONS[norm];
  if (corr && corr.toLowerCase() !== lower) {
    push({ insert: corr, label: corr, kind: "correction" });
  }

  // 2) Frases prontas pelo prefixo
  const phrases = PHRASE_BY_PREFIX[norm] ?? PHRASE_BY_PREFIX[norm.slice(0, 3)];
  if (phrases && text.trim() === lastWord) {
    for (const p of phrases) push({ insert: p, label: p, kind: "phrase" });
  }

  // 3) Autocompletar do vocabulário (startsWith por prefixo normalizado)
  for (const w of VOCAB) {
    if (out.length >= 4) break;
    const wn = stripDiacritics(w.toLowerCase());
    if (wn.startsWith(norm) && wn !== norm) {
      push({ insert: w, label: w, kind: "completion" });
    }
  }

  return { suggestions: out.slice(0, 3), lastWord };
}

/** Substitui a última palavra do texto pela sugestão e adiciona um espaço. */
export function applySuggestion(text: string, suggestion: Suggestion): string {
  // Se for frase pronta e o texto é só a palavra atual, substitui tudo
  if (suggestion.kind === "phrase") {
    return suggestion.insert + " ";
  }
  return text.replace(/(\S+)$/, suggestion.insert) + " ";
}
