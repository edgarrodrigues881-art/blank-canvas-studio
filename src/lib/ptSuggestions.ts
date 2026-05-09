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

// Vocabulário base para autocompletar (atendimento + verbos comuns conjugados)
const VOCAB = [
  // Saudações e cortesia
  "olá", "oi", "tudo bem", "tudo certo", "bom dia", "boa tarde", "boa noite", "tchau", "até logo", "até mais", "até amanhã",
  "obrigado", "obrigada", "muito obrigado", "muito obrigada", "por favor", "por gentileza",
  "desculpa", "desculpe", "desculpas", "perdão", "agradeço", "agradecemos", "agradecido", "agradecida", "gentileza",
  // Pessoas/produtos/comercial
  "pessoa", "pessoal", "pessoas", "pessoalmente",
  "produto", "produtos", "preço", "preços", "promoção", "promoções", "pagamento", "pagamentos",
  "pagar", "pago", "paguei", "parcelado", "parcelar", "parcelas", "pix", "boleto", "cartão", "crédito", "débito", "desconto", "descontos",
  "pedido", "pedidos", "pendente", "pendência", "proposta", "propostas", "orçamento", "orçamentos", "estoque",
  "entrega", "entregue", "entregar", "entregamos", "endereço", "envio", "enviar", "enviado", "enviei", "enviamos", "frete", "rastreio", "rastreamento",
  "informação", "informações", "interessado", "interessada", "interesse",
  // Atendimento
  "atendimento", "atender", "atendente", "atendi", "atendendo",
  "ajudar", "ajuda", "ajudo", "ajudei", "ajudando", "ajudamos",
  "aguardo", "aguardando", "aguarde", "aguardar", "anexo", "anexei", "anexado", "anexar",
  "mensagem", "mensagens", "momento", "momentinho", "minuto", "minutos", "ligar", "ligação", "chamada", "ligo", "ligamos",
  "número", "necessário", "necessária", "necessita", "necessidade", "necessidades",
  "cliente", "clientes", "contato", "contatos", "confirmar", "confirmado", "confirmada", "confirmação", "confirme", "confirma",
  "cadastro", "cadastrar", "cadastrado", "cadastrada",
  "valor", "valores", "vendas", "vender", "vendido", "vendida",
  "verifico", "verificar", "verificando", "verificado", "verifiquei", "vou verificar",
  "disponível", "disponíveis", "disponibilidade", "disposição", "à disposição",
  "data", "dia", "dias", "dúvida", "dúvidas",
  "empresa", "equipe", "encaminhar", "encaminhei", "encaminhado", "encaminhamos",
  // Verbos de uso comum (conjugações principais)
  "conseguir", "consegui", "conseguiu", "conseguimos", "conseguiram", "conseguindo", "consigo", "conseguirei", "conseguiria",
  "preciso", "precisa", "precisamos", "precisar", "precisei", "precisaria", "precisava",
  "poder", "posso", "pode", "podem", "podemos", "podia", "poderia", "poderiam", "poderá", "podendo",
  "querer", "quero", "queria", "quer", "queremos", "querem", "queriam", "querendo",
  "saber", "sei", "sabe", "sabemos", "sabendo", "souber",
  "fazer", "faço", "faz", "fazemos", "fazendo", "fiz", "fizemos", "feito", "feita",
  "ter", "tenho", "tem", "temos", "tinha", "tive", "tivemos", "tendo", "teria",
  "ir", "vou", "vai", "vamos", "vão", "indo", "irei", "iremos",
  "vir", "venho", "vem", "vimos", "vindo", "virá", "virei",
  "ver", "vejo", "vê", "vemos", "vendo", "vi", "vimos",
  "dar", "dou", "dá", "damos", "dando", "dei", "deu", "demos",
  "ficar", "fico", "fica", "ficamos", "ficou", "ficaria", "ficaram", "ficando",
  "ligar", "ligo", "liga", "ligamos", "liguei", "ligando",
  "chegar", "chego", "chega", "chegamos", "cheguei", "chegou", "chegando",
  "começar", "começo", "começa", "começamos", "comecei", "começou", "começando",
  "terminar", "termino", "termina", "terminei", "terminou", "terminado",
  "finalizar", "finalizo", "finaliza", "finalizei", "finalizou", "finalizado", "finalizada",
  "responder", "respondo", "responde", "respondi", "respondeu", "respondendo", "responda",
  "receber", "recebo", "recebe", "recebemos", "recebi", "recebeu", "recebido", "recebida",
  "mandar", "mando", "manda", "mandamos", "mandei", "mandou", "mandando", "mandado",
  "tentar", "tento", "tenta", "tentamos", "tentei", "tentou", "tentando",
  "esperar", "espero", "espera", "esperamos", "esperei", "esperando",
  "trabalhar", "trabalho", "trabalha", "trabalhamos", "trabalhei", "trabalhando",
  "entender", "entendo", "entende", "entendemos", "entendi", "entendeu", "entendido", "entendida", "entendendo",
  "explicar", "explico", "explica", "expliquei", "explicou", "explicando",
  "marcar", "marco", "marca", "marcamos", "marquei", "marcou", "marcado", "marcando",
  "agendar", "agendo", "agenda", "agendamos", "agendei", "agendou", "agendado",
  "comprar", "compro", "compra", "compramos", "comprei", "comprou", "comprado",
  "instalar", "instalo", "instala", "instalei", "instalou", "instalado",
  "voltar", "volto", "volta", "voltamos", "voltei", "voltou", "voltando",
  "passar", "passo", "passa", "passamos", "passei", "passou", "passando", "passado",
  "checar", "checo", "checa", "checamos", "checando",
  "abrir", "abro", "abre", "abrimos", "abri", "abriu", "abrindo", "aberto", "aberta",
  "fechar", "fecho", "fecha", "fechamos", "fechei", "fechou", "fechado", "fechada", "fechando",
  // Adjetivos / advérbios comuns
  "ficar", "ficou", "ficaria", "favor", "fechar", "fechado",
  "gostaria", "gostei", "garantia", "ganhou", "ganhei",
  "horário", "hora", "horas",
  "amanhã", "agora", "agorinha", "ainda", "antes", "depois", "hoje", "ontem", "logo", "rápido", "rapidinho",
  "qualquer", "quando", "quanto", "quanta", "quantos", "quantas", "quantidade", "questão", "qual", "quais", "quem",
  "retorno", "retornar", "retorno em breve", "responder", "resposta",
  "solicitação", "solicitar", "solicitado", "segue", "semana", "seguinte", "sempre", "saber", "sim",
  "tudo", "também", "talvez", "tarde", "tipo", "tem", "tenho", "tente", "teste", "testar", "testando", "testado",
  "trabalho", "trabalhar", "trabalhando",
  "você", "vocês", "vamos", "verdade", "vai", "vão",
  "perfeito", "perfeita", "ótimo", "ótima", "excelente", "incrível", "maravilhoso", "maravilhosa", "show", "tranquilo", "tranquila",
  "claro", "combinado", "certo", "certa", "certeza", "correto", "correta", "certinho", "certinha",
  "não", "nada", "nenhum", "nenhuma", "nunca", "ninguém",
  "loja", "site", "link", "whatsapp", "instagram", "facebook",
  // Frases prontas
  "muito obrigado", "muito obrigada", "fico no aguardo",
  "qualquer dúvida estou à disposição",
  "qualquer dúvida estou à disposição, conte comigo",
  "estou à disposição", "fico à disposição", "estamos à disposição",
  "posso te ajudar", "como posso te ajudar", "como posso ajudar",
  "vou verificar e te retorno", "já te retorno", "já vou verificar",
  "não estou à disposição no momento", "não consigo agora", "não consegui",
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
  // Colapsa letras repetidas 3+ vezes para 1 (voceaaaaa -> vocea, oiiiiii -> oi)
  const collapsed = norm.replace(/(.)\1{2,}/g, "$1");
  // Versão sem letras duplicadas no final (oii -> oi)
  const collapsedAll = norm.replace(/(.)\1+/g, "$1");

  const out: Suggestion[] = [];
  const seen = new Set<string>();

  const push = (s: Suggestion) => {
    if (seen.has(s.insert.toLowerCase())) return;
    seen.add(s.insert.toLowerCase());
    out.push(s);
  };

  // 1) Correção exata
  const corr =
    CORRECTIONS[lower] ??
    CORRECTIONS[norm] ??
    CORRECTIONS[collapsed] ??
    CORRECTIONS[collapsedAll];
  if (corr && corr.toLowerCase() !== lower) {
    push({ insert: corr, label: corr, kind: "correction" });
  }

  // 1b) Correção fuzzy: se a forma "colapsada" bate exatamente com uma palavra do vocab
  if (collapsed !== norm || collapsedAll !== norm) {
    for (const w of VOCAB) {
      const wn = stripDiacritics(w.toLowerCase());
      if ((wn === collapsed || wn === collapsedAll) && wn !== norm) {
        push({ insert: w, label: w, kind: "correction" });
        break;
      }
    }
  }

  // 2) Frases prontas pelo prefixo
  const phrases = PHRASE_BY_PREFIX[norm] ?? PHRASE_BY_PREFIX[norm.slice(0, 3)];
  if (phrases && text.trim() === lastWord) {
    for (const p of phrases) push({ insert: p, label: p, kind: "phrase" });
  }

  // 3) Autocompletar do vocabulário (startsWith por prefixo normalizado ou colapsado)
  for (const w of VOCAB) {
    if (out.length >= 5) break;
    const wn = stripDiacritics(w.toLowerCase());
    if (wn === norm) continue;
    if (wn.startsWith(norm) || wn.startsWith(collapsed) || wn.startsWith(collapsedAll)) {
      push({ insert: w, label: w, kind: "completion" });
    }
  }

  return { suggestions: out.slice(0, 5), lastWord };
}

/** Substitui a última palavra do texto pela sugestão e adiciona um espaço. */
export function applySuggestion(text: string, suggestion: Suggestion): string {
  // Se for frase pronta e o texto é só a palavra atual, substitui tudo
  if (suggestion.kind === "phrase") {
    return suggestion.insert + " ";
  }
  return text.replace(/(\S+)$/, suggestion.insert) + " ";
}
