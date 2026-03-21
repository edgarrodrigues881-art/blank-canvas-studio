// ══════════════════════════════════════════════════════════
// Gerador Combinatório de Mensagens Naturais para Aquecimento
// Produz milhões de variações únicas combinando blocos de texto
// Min 30 chars, Max 180 chars para mensagens de grupo
// ══════════════════════════════════════════════════════════

// ── BLOCOS DE SAUDAÇÃO ──
const SAUDACOES = [
  "oi", "oii", "oiii", "olá", "ola", "e aí", "eai", "eae",
  "fala", "fala aí", "salve", "opa", "hey", "ei",
  "bom dia", "boa tarde", "boa noite",
  "tudo bem", "tudo certo", "tudo joia", "tudo tranquilo",
  "e aí como tá", "e aí blz", "fala parceiro", "fala amigo",
  "oi oi", "eae mano", "fala ae", "opa tudo bem",
  "bom dia pessoal", "boa tarde galera", "boa noite a todos",
  "fala galera", "e aí pessoal", "oi gente",
];

// ── PERGUNTAS NATURAIS ──
const PERGUNTAS = [
  "como está seu cachorro, ele já melhorou daquela vez",
  "como está a casa nova, já conseguiu organizar tudo",
  "conseguiu terminar a mudança ou ainda falta muita coisa",
  "como está o trabalho, tá dando pra lidar com tudo",
  "como está sua família, tá todo mundo bem",
  "como foi seu dia hoje, muito corrido",
  "está tudo bem por aí ou tá meio turbulento",
  "como estão as coisas aí na sua cidade",
  "conseguiu resolver aquilo que você tava tentando",
  "como está o tempo aí, aqui tá muito quente",
  "ainda mora no mesmo lugar ou já mudou",
  "está tudo tranquilo por aí ou tá corrido",
  "o cachorro já melhorou daquela história",
  "a casa nova ficou boa mesmo, já adaptou",
  "o dia foi corrido hoje ou deu pra descansar",
  "como tá o projeto que você falou outro dia",
  "já resolveu aquele problema que tava te incomodando",
  "como tá a saúde, tá cuidando direitinho",
  "como foi a semana toda pra você",
  "como tá o pessoal aí do seu lado",
  "já conseguiu aquilo que você tava precisando",
  "como anda o serviço, tá com muita demanda",
  "resolveu aquela questão que tava pendente",
  "como está o carro, arrumou aquele barulho",
  "como tá a reforma, já terminaram tudo",
  "o que aprontou hoje, conta aí",
  "como foi o final de semana, curtiu bastante",
  "já voltou de viagem ou ainda tá por lá",
  "como tá o clima aí na sua região",
  "ainda tá naquela empresa ou mudou já",
  "como anda o treino, tá evoluindo bastante",
  "como tá o estudo, tá conseguindo acompanhar",
  "já fez a prova que você tava preocupado",
  "como foi a entrevista, passou ou ainda tá esperando",
  "como está o bairro novo, gostou de lá",
  "como tá a internet aí, a minha tá horrível",
  "já arrumou a moto que tava com problema",
  "como foi o almoço hoje, comeu onde",
  "como tá a dieta, tá conseguindo manter",
  "já comprou aquilo que você tava querendo",
  "como está o filho, crescendo rápido né",
  "a obra já terminou ou ainda falta muito",
  "como ficou a festa, deu muita gente",
  "como foi a reunião, saiu algo bom",
  "o médico falou o quê sobre aquele exame",
  "já trocou de celular ou ainda tá com aquele",
  "como tá a academia, tá indo com frequência",
  "como foi o passeio que você planejou",
  "já assistiu aquele filme que eu indiquei",
  "como tá o novo emprego, se adaptou bem",
];

// ── COMENTÁRIOS NATURAIS (mais longos) ──
const COMENTARIOS = [
  "hoje o dia foi bem corrido, mal tive tempo de almoçar direito",
  "aqui está bem tranquilo hoje, aproveitei pra resolver umas pendências",
  "estou resolvendo umas coisas no trabalho que estavam acumuladas",
  "hoje trabalhei bastante mas pelo menos rendeu bem",
  "estou organizando tudo aqui em casa, tava uma bagunça",
  "aqui está tudo certo graças a Deus, sem reclamar",
  "hoje foi puxado demais, mal vi o dia passar",
  "estou vendo umas coisas aqui que precisam de atenção",
  "tô meio ocupado hoje mas dei uma parada agora",
  "aqui tá de boa, finalmente deu uma calmaria",
  "dia longo hoje mas produtivo, não posso reclamar",
  "finalmente deu uma folga depois de uma semana intensa",
  "tô correndo atrás das coisas que ficaram pra trás",
  "hoje rendeu bastante, consegui adiantar muita coisa",
  "tô resolvendo umas pendências que estavam me incomodando",
  "aqui tá tudo na paz, sem stress e sem correria",
  "dia cheio hoje mas tá indo tudo bem no geral",
  "tô focado aqui no trabalho, tentando terminar tudo hoje",
  "hoje foi tranquilo comparado com ontem que foi caótico",
  "semana puxada essa, mas já estou quase chegando no final",
  "tô organizando umas ideias pra um projeto novo que tenho",
  "hoje foi produtivo demais, consegui fazer tudo que planejei",
  "tô de olho em umas oportunidades que apareceram agora",
  "por aqui tudo certo, sem novidades por enquanto",
  "mandando ver no trabalho pra compensar os dias perdidos",
  "hoje foi correria pura mas no final deu tudo certo",
  "tô no corre mas tá suave, nada que não dê conta",
  "dia movimentado hoje, resolvi várias coisas pendentes",
  "por aqui tá tranquilo, aproveitando o dia calmo",
  "tô planejando uns negócios novos pra começar em breve",
  "acabei de resolver uma parada que tava me tirando o sono",
  "tô pensando em mudar umas coisas na rotina pra ficar melhor",
  "hoje consegui dar conta de tudo que estava planejado",
  "aqui tá tudo nos conformes, sem nenhum problema",
  "dia produtivo, foquei bastante e vi resultado",
];

// ── COMPLEMENTOS OPCIONAIS ──
const COMPLEMENTOS = [
  "faz tempo que não falamos sobre isso né",
  "lembrei disso agora do nada enquanto trabalhava",
  "estava pensando nisso mais cedo e resolvi perguntar",
  "vi algo parecido hoje e lembrei de você",
  "estava lembrando disso e quis saber como ficou",
  "me veio na cabeça agora e pensei em perguntar",
  "pensei nisso mais cedo quando tava no trânsito",
  "lembrei de vc e resolvi mandar mensagem",
  "tava pensando aqui sobre essa questão",
  "me falaram disso outro dia e fiquei curioso",
  "vi vc online e lembrei de perguntar isso",
  "alguém comentou sobre isso e eu quis saber mais",
  "pensei nisso ontem antes de dormir",
  "me lembrou uma coisa que queria te falar",
  "queria saber mais sobre como ficou aquilo",
  "fiquei curioso pra saber como tá tudo",
  "me disseram sobre isso e resolvi confirmar contigo",
  "tava com isso na cabeça o dia todo",
  "lembrei na hora e não quis deixar passar",
  "queria te perguntar uma coisa que tava pensando",
];

// ── EMOJIS ──
const EMOJIS = [
  "🙂", "😂", "😅", "😄", "👍", "🙏", "🔥", "👀", "😎", "🤝",
  "😊", "🤔", "💯", "👏", "✌️", "🎉", "🙌", "😁", "🤗", "👌",
  "💪", "🌟", "⭐", "😃", "🤙", "👋", "❤️", "😆", "🫡", "🤣",
];

// ── NÚMEROS OPCIONAIS ──
const FRASES_NUMERO = [
  "faz {n} dias que pensei nisso e resolvi falar",
  "já tem uns {n} dias que não conversamos sobre isso",
  "isso aconteceu lá em {a} e até hoje lembro",
  "faz uns {n} dias que não tenho notícias",
  "já tem uns {n} anos que isso aconteceu né",
  "faz {n} semanas que estou pensando nisso",
  "uns {n} meses atrás a gente falou sobre isso",
  "a gente se viu uns {n} dias atrás e esqueci de falar",
  "faz {n} dias já que aquilo aconteceu",
  "lá pra {n} horas atrás eu tava pensando exatamente nisso",
];

// ── RESPOSTAS CURTAS (para comunidade) ──
const RESPOSTAS_CURTAS = [
  "ss", "sim", "aham", "uhum", "pode crer", "exato",
  "verdade", "isso aí", "com certeza", "claro",
  "tá certo", "beleza", "blz", "joia", "show",
  "massa", "dahora", "top", "boa", "firmeza",
  "haha", "kkk", "kkkk", "rsrs",
  "é mesmo", "pois é", "né", "sei",
  "entendi", "ah sim", "faz sentido", "de boa",
];

// ── FRASES DE GRUPO (mais longas e naturais) ──
const FRASES_GRUPO = [
  "concordo totalmente com isso, muito bom mesmo",
  "muito bom isso aí, valeu por compartilhar com a gente",
  "ótimo ponto, realmente faz muito sentido quando para pra pensar",
  "valeu por compartilhar, vou guardar essa informação aqui",
  "obrigado pela dica, sempre aprendo algo novo aqui nesse grupo",
  "interessante demais esse conteúdo, parabéns por trazer",
  "vou aplicar isso no meu dia a dia com certeza",
  "sensacional, esse tipo de conteúdo faz a diferença",
  "mandou bem demais, continue trazendo coisas assim",
  "parabéns pelo conteúdo, tá ficando cada vez melhor",
  "curti muito esse ponto de vista, concordo bastante",
  "tô acompanhando tudo daqui, muito bom mesmo",
  "alguém mais concorda com isso? achei muito pertinente",
  "boa semana a todos do grupo, bora pra cima 💪",
  "continue postando esse tipo de coisa, agrega demais",
  "excelente informação, vou guardar pra consultar depois",
  "salvei aqui pra ler com calma mais tarde",
  "bom demais, esse grupo é muito bom pra trocar ideia",
  "tamo junto nessa, o grupo aqui é sensacional",
  "quem mais tá acompanhando? esse conteúdo tá top demais",
  "esse tipo de conversa que faz o grupo valer a pena",
  "caramba, não tinha pensado por esse ângulo, boa mesmo",
  "muito obrigado por trazer isso, estava precisando",
  "é isso aí, quando a gente troca ideia sempre sai coisa boa",
  "perfeito, era exatamente isso que eu estava procurando",
  "show de bola, vou implementar isso aqui no meu dia",
  "que conteúdo bom, faz tempo que não via algo assim",
  "concordo com tudo que foi falado, especialmente essa parte",
  "isso aí é verdade, a gente precisa prestar mais atenção nisso",
  "boa reflexão, vou pensar mais sobre isso durante a semana",
];

// ── REFLEXÕES LONGAS (novas, para atingir 100-180 chars) ──
const REFLEXOES = [
  "engraçado como a vida muda né, um tempo atrás eu pensava diferente sobre muita coisa e hoje vejo tudo com outros olhos",
  "esses dias eu tava refletindo sobre como o tempo passa rápido, parece que foi ontem que a gente tava naquela situação",
  "sabe o que eu percebi, quando a gente para pra pensar com calma as coisas ficam muito mais claras e simples de resolver",
  "to achando que preciso mudar umas coisas na minha rotina porque do jeito que tá não tá funcionando muito bem não",
  "ontem eu tava conversando com um amigo e ele me falou uma coisa que fez muito sentido, vou compartilhar com vocês",
  "vocês já pararam pra pensar como é importante ter pessoas boas ao redor da gente, faz toda diferença no dia a dia",
  "eu tava lendo umas coisas sobre produtividade e achei interessante como pequenas mudanças podem ter um impacto grande",
  "acho que a gente subestima o poder de uma boa conversa, às vezes um papo simples muda completamente o nosso dia",
  "essa semana foi de muito aprendizado pra mim, consegui entender coisas que antes não faziam sentido nenhum",
  "o importante é continuar evoluindo e aprendendo, não importa o ritmo, o que importa é não parar nunca",
  "eu costumo dizer que cada dia é uma chance nova de fazer diferente e melhor do que fizemos ontem",
  "vocês não imaginam como é bom quando a gente consegue resolver uma pendência que tava tirando nosso sono",
  "tava pensando aqui que a gente precisa valorizar mais os momentos simples porque são eles que fazem a diferença",
  "hoje eu acordei com uma energia diferente, sabe quando parece que o dia vai ser bom de verdade",
  "acho muito importante a gente trocar experiências assim, sempre aprendo algo novo com o pessoal daqui",
];

// ── HISTÓRIAS CURTAS (para atingir 80-150 chars) ──
const HISTORIAS = [
  "hoje aconteceu uma coisa engraçada no trabalho, meu colega confundiu o relatório e mandou pro cliente errado",
  "ontem eu fui no mercado e esqueci a lista inteira, tive que voltar duas vezes pra pegar tudo",
  "essa semana eu comecei um projeto novo que tá me animando bastante, vamos ver no que dá",
  "meu vizinho tá fazendo obra e o barulho tá demais, mas fazer o que né, vai ficar bom depois",
  "fui correr hoje de manhã e encontrei um amigo que não via há anos, foi muito bom rever ele",
  "tentei cozinhar uma receita nova ontem e deu tudo errado, mas pelo menos foi divertido",
  "hoje eu finalmente resolvi aquele problema que tava me incomodando há semanas, que alívio",
  "meu cachorro fez a maior bagunça hoje em casa, mas não dá pra ficar bravo com aquela cara",
  "essa semana consegui organizar meu escritório todo, agora tá bem mais produtivo trabalhar",
  "ontem assisti um documentário muito bom, recomendo demais pra quem gosta de aprender coisas novas",
];

// ── Helpers ──
function randInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function pickRandom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export type MessageContext = "group" | "private" | "autosave" | "community";

// Tracking para evitar repetição recente
const recentMessages: string[] = [];
const MAX_RECENT = 200;

function isRecent(msg: string): boolean {
  return recentMessages.includes(msg);
}

function trackMessage(msg: string): void {
  recentMessages.push(msg);
  if (recentMessages.length > MAX_RECENT) {
    recentMessages.shift();
  }
}

/**
 * Gera uma mensagem natural combinatória (30-180 caracteres)
 */
export function generateNaturalMessage(context: MessageContext = "group"): string {
  const minLen = context === "community" ? 5 : 30;
  const maxLen = context === "community" ? 60 : 180;

  let attempts = 0;
  while (attempts < 80) {
    attempts++;
    const msg = buildMessage(context);
    if (msg.length >= minLen && msg.length <= maxLen && !isRecent(msg)) {
      trackMessage(msg);
      return msg;
    }
  }

  // Fallback: combine blocks to reach minimum
  const fallback = context === "community"
    ? pickRandom(RESPOSTAS_CURTAS)
    : `${pickRandom(SAUDACOES)}, ${pickRandom(COMENTARIOS)}`;

  const trimmed = fallback.substring(0, maxLen);
  trackMessage(trimmed);
  return trimmed;
}

function buildMessage(context: MessageContext): string {
  const strategy = randInt(1, 14);

  // Strategy 1-3: Saudação + Pergunta (naturalmente 40-80 chars)
  if (strategy <= 3) {
    const saudacao = pickRandom(SAUDACOES);
    const pergunta = pickRandom(PERGUNTAS);
    let msg = `${saudacao}, ${pergunta}?`;
    msg = maybeAddEmoji(msg);
    return capitalize(msg);
  }

  // Strategy 4-5: Pergunta sozinha (30-70 chars)
  if (strategy <= 5) {
    let msg = `${pickRandom(PERGUNTAS)}?`;
    msg = maybeAddEmoji(msg);
    return capitalize(msg);
  }

  // Strategy 6-7: Comentário + complemento (60-140 chars)
  if (strategy <= 7) {
    let msg = pickRandom(COMENTARIOS);
    if (Math.random() < 0.5) {
      msg += `. ${capitalize(pickRandom(COMPLEMENTOS))}`;
    }
    msg = maybeAddEmoji(msg);
    return capitalize(msg);
  }

  // Strategy 8: Saudação + comentário (50-100 chars)
  if (strategy === 8) {
    const saudacao = pickRandom(SAUDACOES);
    const comentario = pickRandom(COMENTARIOS);
    let msg = `${saudacao}, ${comentario}`;
    msg = maybeAddEmoji(msg);
    return capitalize(msg);
  }

  // Strategy 9: Frase com número (40-80 chars)
  if (strategy === 9) {
    const frase = pickRandom(FRASES_NUMERO);
    const n = randInt(2, 15);
    const a = randInt(2019, 2025);
    let msg = frase.replace("{n}", String(n)).replace("{a}", String(a));
    msg = maybeAddEmoji(msg);
    return capitalize(msg);
  }

  // Strategy 10-11: Frases de grupo longas (40-80 chars)
  if (strategy <= 11) {
    if (context === "group") {
      let msg = pickRandom(FRASES_GRUPO);
      msg = maybeAddEmoji(msg);
      return capitalize(msg);
    }
    if (context === "community") {
      if (Math.random() < 0.4) return pickRandom(RESPOSTAS_CURTAS);
      let msg = pickRandom(PERGUNTAS) + "?";
      msg = maybeAddEmoji(msg);
      return capitalize(msg);
    }
  }

  // Strategy 12: Reflexão longa (100-180 chars)
  if (strategy === 12) {
    let msg = pickRandom(REFLEXOES);
    msg = maybeAddEmoji(msg);
    return capitalize(msg);
  }

  // Strategy 13: História curta (80-150 chars)
  if (strategy === 13) {
    let msg = pickRandom(HISTORIAS);
    msg = maybeAddEmoji(msg);
    return capitalize(msg);
  }

  // Strategy 14: Comentário + pergunta (60-120 chars)
  if (strategy === 14) {
    const comentario = pickRandom(COMENTARIOS);
    const pergunta = pickRandom(PERGUNTAS);
    let msg = `${comentario}. ${capitalize(pergunta)}?`;
    msg = maybeAddEmoji(msg);
    return capitalize(msg);
  }

  // Default: saudação + comentário
  let msg = `${pickRandom(SAUDACOES)}, ${pickRandom(COMENTARIOS)}`;
  msg = maybeAddEmoji(msg);
  return capitalize(msg);
}

function maybeAddEmoji(msg: string): string {
  const chance = Math.random();
  if (chance < 0.55) return msg; // 55% sem emoji
  if (chance < 0.85) return `${msg} ${pickRandom(EMOJIS)}`; // 30% 1 emoji
  return `${msg} ${pickRandom(EMOJIS)}${pickRandom(EMOJIS)}`; // 15% 2 emojis
}

/**
 * Gera N mensagens únicas de uma vez
 */
export function generateBatch(count: number, context: MessageContext = "group"): string[] {
  const messages: string[] = [];
  for (let i = 0; i < count; i++) {
    messages.push(generateNaturalMessage(context));
  }
  return messages;
}

/**
 * Calcula o número estimado de combinações possíveis
 */
export function estimateCombinations(): number {
  const saudacoes = SAUDACOES.length;
  const perguntas = PERGUNTAS.length;
  const comentarios = COMENTARIOS.length;
  const complementos = COMPLEMENTOS.length;
  const emojis = EMOJIS.length;
  const emojiVariations = 1 + emojis + (emojis * emojis);
  const numeros = FRASES_NUMERO.length * 14;
  const reflexoes = REFLEXOES.length;
  const historias = HISTORIAS.length;

  const total =
    (saudacoes * perguntas * emojiVariations) +
    (perguntas * emojiVariations) +
    (comentarios * (1 + complementos) * emojiVariations) +
    (saudacoes * comentarios * emojiVariations) +
    (numeros * emojiVariations) +
    (FRASES_GRUPO.length * emojiVariations) +
    (reflexoes * emojiVariations) +
    (historias * emojiVariations) +
    (comentarios * perguntas * emojiVariations) +
    (RESPOSTAS_CURTAS.length);

  return total;
}

// Export block arrays for inspection
export const MESSAGE_BLOCKS = {
  saudacoes: SAUDACOES,
  perguntas: PERGUNTAS,
  comentarios: COMENTARIOS,
  complementos: COMPLEMENTOS,
  emojis: EMOJIS,
  frasesNumero: FRASES_NUMERO,
  respostasCurtas: RESPOSTAS_CURTAS,
  frasesGrupo: FRASES_GRUPO,
  reflexoes: REFLEXOES,
  historias: HISTORIAS,
};
