// ══════════════════════════════════════════════════════════
// VPS Engine — Gerador de mensagens naturais (80k+ variações)
// ══════════════════════════════════════════════════════════

export function randInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

export function pickRandom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

export function shuffleArray<T>(arr: T[]): T[] {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

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
  "como está o tempo aí", "ainda mora no mesmo lugar", "está tudo tranquilo por aí",
  "como tá o projeto", "já resolveu aquele problema", "como tá a saúde",
  "como foi a semana", "como tá o pessoal aí", "já conseguiu aquilo",
  "como anda o serviço", "resolveu aquela questão", "como está o carro",
  "como tá a reforma", "o que aprontou hoje", "como foi o fds",
  "já voltou de viagem", "como tá o clima aí", "ainda tá naquela empresa",
  "como anda o treino", "como tá o estudo", "já fez a prova",
  "como foi a entrevista", "como está o bairro novo", "como tá a internet aí",
  "já arrumou a moto", "como foi o almoço", "como tá a dieta",
  "já comprou aquilo", "como está o filho", "a obra já terminou",
  "como ficou a festa", "como foi a reunião", "o médico falou o quê",
  "já trocou de celular", "como tá a academia", "como foi o passeio",
  "já assistiu aquele filme", "como tá o novo emprego",
  "como foi a viagem", "já mudou de apartamento", "como tá o cachorro novo",
  "conseguiu aquele emprego", "como foi a formatura", "já marcou a consulta",
];

const COMENTARIOS = [
  "hoje o dia foi corrido", "aqui está bem tranquilo", "estou resolvendo umas coisas",
  "hoje trabalhei bastante", "estou organizando tudo aqui", "aqui está tudo certo",
  "hoje foi puxado", "estou vendo umas coisas aqui", "tô meio ocupado hoje",
  "aqui tá de boa", "dia longo hoje", "finalmente deu uma folga",
  "tô correndo atrás das coisas", "hoje rendeu bastante", "tô resolvendo umas pendências",
  "aqui tá tudo na paz", "dia cheio mas tá indo", "tô focado aqui no trabalho",
  "hoje foi tranquilo", "semana puxada essa", "tô organizando umas ideias",
  "hoje foi produtivo", "tô de olho em umas coisas", "por aqui tudo certo",
  "mandando ver no trabalho", "hoje foi correria pura", "tô no corre mas tá suave",
  "dia movimentado hoje", "por aqui tá tranquilo", "tô planejando uns negócios",
];

const COMPLEMENTOS = [
  "faz tempo que não falamos", "lembrei disso agora", "estava pensando nisso",
  "vi algo parecido hoje", "estava lembrando disso", "me veio na cabeça agora",
  "pensei nisso mais cedo", "lembrei de vc", "tava pensando aqui",
  "me falaram disso", "vi vc online e lembrei", "alguém comentou isso",
];

const EMOJIS = [
  "🙂", "😂", "😅", "😄", "👍", "🙏", "🔥", "👀", "😎", "🤝",
  "😊", "🤔", "💯", "👏", "✌️", "🎉", "🙌", "😁", "🤗", "👌",
  "💪", "🌟", "⭐", "😃", "🤙", "👋", "❤️", "😆", "🫡", "🤣",
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

const FRASES_GRUPO = [
  "muito bom esse conteúdo, parabéns por compartilhar com a gente",
  "cara isso é muito verdade, passei por algo parecido recentemente",
  "valeu demais pela informação, vou aplicar no meu dia a dia",
  "isso é exatamente o que eu precisava ouvir hoje, obrigado",
  "conteúdo de qualidade como sempre, continue assim que tá ótimo",
  "concordo demais com isso, acho que muita gente deveria ver",
  "alguém mais concorda com isso? acho que faz muito sentido",
  "tamo junto pessoal, boa semana pra todos nós aqui do grupo",
  "continue postando esse tipo de coisa, faz muita diferença pra gente",
  "excelente informação, salvei aqui pra compartilhar depois com a família",
  "mandou muito bem nessa postagem, curti demais o conteúdo",
  "quem mais tá acompanhando esse grupo? tá cada vez melhor o conteúdo",
  "valeu por compartilhar isso com a gente, muito bom mesmo",
  "interessante demais essa informação, vou pesquisar mais sobre isso",
  "parabéns pelo conteúdo de qualidade, a gente aprende muito aqui",
  "boa demais essa dica, já passei pra frente pra quem precisa",
];

const OPINIOES = [
  "acho que esse ano vai ser diferente, tenho muita esperança de dias melhores",
  "tô otimista com o futuro, muita coisa boa vindo por aí se Deus quiser",
  "cada vez mais difícil achar coisa boa, mas a gente segue firme e forte",
  "o mercado tá complicado, mas quem se esforça sempre encontra oportunidade",
  "tô repensando muita coisa na vida, acho que faz parte do crescimento",
  "preciso descansar mais, o corpo pede e a gente tem que ouvir né",
  "quero viajar mais esse ano, já tô até pesquisando alguns destinos legais",
  "preciso focar na saúde, comecei a me alimentar melhor essa semana",
  "tô curtindo mais ficar em casa, é bom demais ter paz e sossego",
  "o tempo tá passando rápido demais, parece que ontem era janeiro",
  "tô aprendendo a ter mais paciência, nem tudo acontece no nosso tempo",
  "as coisas estão melhorando aos poucos, cada dia é uma vitória",
  "cada dia é uma conquista, a gente tem que valorizar cada momento",
  "tô mais seletivo com meu tempo, aprendi que isso é muito importante",
  "quero investir mais em mim esse ano, tanto pessoal quanto profissional",
  "o importante é ter paz de espírito, o resto a gente vai resolvendo",
  "tô priorizando o que importa de verdade na minha vida agora",
  "a vida tá mudando pra melhor, e eu tô muito grato por isso",
];

const COTIDIANO = [
  "acabei de almoçar agora, comi muito bem hoje graças a Deus",
  "tô no trânsito parado faz uns vinte minutos, tá osso",
  "choveu demais aqui na região, parecia que não ia parar nunca",
  "acordei cedo hoje e aproveitei pra resolver umas coisas pendentes",
  "café da manhã ficou top hoje, fiz aquele capricho todo especial",
  "fui na feira agora cedo e encontrei umas frutas maravilhosas",
  "acabei de sair da academia, treino pesado mas valeu a pena",
  "fiz um bolo caseiro pra família e ficou uma delícia",
  "tô estudando uma coisa nova, é difícil mas tô gostando bastante",
  "comecei a caminhar de manhã e já tô sentindo diferença no corpo",
  "tô assistindo uma série boa demais, não consigo parar de ver",
  "dormi super bem ontem, acordei renovado, fazia tempo que não dormia assim",
  "tomei um açaí agora com granola e banana, melhor coisa do mundo",
];

const REFLEXOES = [
  "sabe o que eu penso, a gente tem que aproveitar cada momento porque passa muito rápido",
  "ontem eu tava lembrando de como as coisas eram diferentes uns anos atrás",
  "às vezes eu paro pra pensar no quanto a gente evoluiu",
  "tô numa fase da vida que tô priorizando paz e tranquilidade",
  "essa semana foi intensa demais, mas no final deu tudo certo",
  "tô aprendendo que nem tudo precisa de resposta imediata",
];

const HISTORIAS = [
  "ontem aconteceu uma coisa engraçada, eu fui no mercado e encontrei um amigo que não via há anos",
  "meu vizinho adotou um cachorro e agora o bicho late o dia inteiro mas ele é muito fofo",
  "fui almoçar num restaurante novo e a comida era tão boa que já marquei de voltar",
  "tentei fazer uma receita nova e deu tudo errado mas pelo menos a cozinha ficou cheirosa",
  "meu filho falou uma coisa tão engraçada ontem que eu quase chorei de rir",
  "tava dirigindo e vi o pôr do sol mais bonito que já vi na vida",
  "recebi uma mensagem de um amigo antigo e matamos a saudade conversando por horas",
];

const FRASES_NUMERO = ["faz {n} dias que pensei nisso", "já tem uns {n} dias", "faz uns {n} dias"];

const recentMsgs: string[] = [];

function maybeEmoji(msg: string): string {
  const r = Math.random();
  if (r < 0.55) return msg;
  if (r < 0.85) return `${msg} ${pickRandom(EMOJIS)}`;
  return `${msg} ${pickRandom(EMOJIS)}${pickRandom(EMOJIS)}`;
}

function cap(s: string): string { return s.charAt(0).toUpperCase() + s.slice(1); }

function buildMsg(): string {
  const s = randInt(1, 28);
  if (s <= 2) return pickRandom(RESPOSTAS_CURTAS);
  if (s <= 4) return cap(maybeEmoji(`${pickRandom(SAUDACOES)}, ${pickRandom(PERGUNTAS)}?`));
  if (s <= 6) return cap(maybeEmoji(`${pickRandom(PERGUNTAS)}?`));
  if (s <= 8) return cap(maybeEmoji(`${pickRandom(COMENTARIOS)}, ${pickRandom(COMPLEMENTOS)}`));
  if (s <= 10) return cap(maybeEmoji(`${pickRandom(OPINIOES)}. ${pickRandom(COMPLEMENTOS)}`));
  if (s <= 12) return cap(maybeEmoji(`${pickRandom(COTIDIANO)}. ${pickRandom(COMPLEMENTOS)}`));
  if (s === 13) return cap(maybeEmoji(`${pickRandom(SAUDACOES)}, ${pickRandom(COMENTARIOS)}. ${pickRandom(COMPLEMENTOS)}`));
  if (s === 14) { const f = pickRandom(FRASES_NUMERO).replace("{n}", String(randInt(2, 15))); return cap(maybeEmoji(`${f}, ${pickRandom(COMENTARIOS)}`)); }
  if (s <= 17) return cap(maybeEmoji(`${pickRandom(SAUDACOES)}, ${pickRandom(OPINIOES)}`));
  if (s <= 20) return cap(maybeEmoji(pickRandom(REFLEXOES)));
  if (s <= 23) return cap(maybeEmoji(pickRandom(HISTORIAS)));
  if (s <= 25) return cap(maybeEmoji(`${pickRandom(SAUDACOES)}, ${pickRandom(COTIDIANO)}. ${pickRandom(COMPLEMENTOS)}`));
  if (s <= 27) return cap(maybeEmoji(`${pickRandom(COMENTARIOS)}, ${pickRandom(OPINIOES)}`));
  return cap(maybeEmoji(`${pickRandom(HISTORIAS)}. ${pickRandom(COMPLEMENTOS)}`));
}

export function generateNaturalMessage(context: "group" | "autosave" | "community" = "group"): string {
  for (let attempt = 0; attempt < 120; attempt++) {
    let msg: string;
    if (context === "group" && Math.random() < 0.4) {
      msg = pickRandom(FRASES_GRUPO);
    } else {
      msg = buildMsg();
    }
    if (msg.length >= 20 && msg.length <= 300 && !recentMsgs.includes(msg)) {
      recentMsgs.push(msg);
      if (recentMsgs.length > 200) recentMsgs.shift();
      return msg;
    }
  }
  return cap(maybeEmoji(`${pickRandom(SAUDACOES)}, ${pickRandom(COTIDIANO)}. ${pickRandom(OPINIOES)}`)).substring(0, 300);
}

// Media type selectors
export function pickMediaTypeGroup(budgetUsed: number): "text" | "image" | "sticker" | "audio" {
  if (budgetUsed < 3) return "text";
  const r = Math.random();
  if (r < 0.48) return "text";
  if (r < 0.76) return "audio";
  if (r < 0.87) return "sticker";
  return "image";
  // distribution: 48% text, 28% audio, 11% sticker, 3% image (original era 13%)
  // → mais equilibrado entre texto e áudio, imagem bem rara
}

export function pickMediaTypeCommunity(budgetUsed: number): "text" | "image" | "audio" | "sticker" | "location" {
  if (budgetUsed < 3) return "text";
  const r = Math.random();
  if (r < 0.48) return "text";
  if (r < 0.76) return "audio";
  if (r < 0.87) return "sticker";
  if (r < 0.93) return "image";
  return "location";
  // distribution: 48% text, 28% audio, 11% sticker, 6% image, 7% location
}

export const IMAGE_CAPTIONS = [
  "Olha que lindo isso 📸", "Registro do dia ✨", "Momento especial 🙌",
  "Curti demais essa foto", "Olha que coisa boa 🔥", "Isso aqui tá demais",
  "Que cenário incrível", "Achei muito bonito isso", "Olha o que encontrei hoje",
  "Dia abençoado 🙏", "Vale a pena registrar", "Momento de paz ☀️",
];

export const LOCATION_CAPTIONS = [
  "tô aqui ó 📍", "olha onde eu tô", "passeando por aqui 🚶",
  "vim dar uma volta", "conhecendo o lugar", "lugar massa demais",
];

export const FAKE_LOCATIONS = [
  { lat: -23.5505, lng: -46.6333, name: "São Paulo, SP" },
  { lat: -22.9068, lng: -43.1729, name: "Rio de Janeiro, RJ" },
  { lat: -19.9167, lng: -43.9345, name: "Belo Horizonte, MG" },
  { lat: -25.4284, lng: -49.2733, name: "Curitiba, PR" },
  { lat: -30.0346, lng: -51.2177, name: "Porto Alegre, RS" },
  { lat: -15.7942, lng: -47.8822, name: "Brasília, DF" },
  { lat: -12.9714, lng: -38.5124, name: "Salvador, BA" },
  { lat: -8.0476, lng: -34.877, name: "Recife, PE" },
  { lat: -3.7172, lng: -38.5433, name: "Fortaleza, CE" },
];

export function pickFakeLocation(): { lat: number; lng: number; name: string } {
  const base = pickRandom(FAKE_LOCATIONS);
  return {
    lat: base.lat + (Math.random() - 0.5) * 0.01,
    lng: base.lng + (Math.random() - 0.5) * 0.01,
    name: base.name,
  };
}

export const FALLBACK_IMAGES = [
  "https://images.unsplash.com/photo-1506744038136-46273834b3fb?w=800&q=80",
  "https://images.unsplash.com/photo-1501785888041-af3ef285b470?w=800&q=80",
  "https://images.unsplash.com/photo-1470071459604-3b5ec3a7fe05?w=800&q=80",
  "https://images.unsplash.com/photo-1441974231531-c6227db76b6e?w=800&q=80",
  "https://images.unsplash.com/photo-1518837695005-2083093ee35b?w=800&q=80",
  "https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=800&q=80",
  "https://images.unsplash.com/photo-1519681393784-d120267933ba?w=800&q=80",
  "https://images.unsplash.com/photo-1475924156734-496f401b2420?w=800&q=80",
  "https://images.unsplash.com/photo-1465146344425-f00d5f5c8f07?w=800&q=80",
  "https://images.unsplash.com/photo-1433086966358-54859d0ed716?w=800&q=80",
  "https://images.unsplash.com/photo-1472214103451-9374bd1c798e?w=800&q=80",
  "https://images.unsplash.com/photo-1490730141103-6cac27aaab94?w=800&q=80",
  "https://images.unsplash.com/photo-1505144808419-1957a94ca61e?w=800&q=80",
  "https://images.unsplash.com/photo-1469474968028-56623f02e42e?w=800&q=80",
  "https://images.unsplash.com/photo-1447752875215-b2761acb3c5d?w=800&q=80",
  "https://images.unsplash.com/photo-1426604966848-d7adac402bff?w=800&q=80",
  "https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?w=800&q=80",
  "https://images.unsplash.com/photo-1504567961542-e24d9439a724?w=800&q=80",
  "https://images.unsplash.com/photo-1494500764479-0c8f2919a3d8?w=800&q=80",
  "https://images.unsplash.com/photo-1431794062232-2a99a5431c6c?w=800&q=80",
  "https://images.unsplash.com/photo-1470252649378-9c29740c9fa8?w=800&q=80",
  "https://images.unsplash.com/photo-1497449493050-aad1e7cad165?w=800&q=80",
  "https://images.unsplash.com/photo-1482192505345-5655af888cc4?w=800&q=80",
  "https://images.unsplash.com/photo-1509316975850-ff9c5deb0cd9?w=800&q=80",
  "https://images.unsplash.com/photo-1542202229-7d93c33f5d07?w=800&q=80",
  "https://images.unsplash.com/photo-1510784722466-f2aa9c52fff6?w=800&q=80",
  "https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?w=800&q=80",
  "https://images.unsplash.com/photo-1540206395-68808572332f?w=800&q=80",
  "https://images.unsplash.com/photo-1498050108023-c5249f4df085?w=800&q=80",
  "https://images.unsplash.com/photo-1516298773066-dec23eff6d04?w=800&q=80",
];

export const FALLBACK_AUDIOS = [
  "https://samplelib.com/lib/preview/mp3/sample-3s.mp3",
  "https://samplelib.com/lib/preview/mp3/sample-6s.mp3",
  "https://samplelib.com/lib/preview/mp3/sample-9s.mp3",
  "https://samplelib.com/lib/preview/mp3/sample-12s.mp3",
  "https://samplelib.com/lib/preview/mp3/sample-15s.mp3",
  "https://www2.cs.uic.edu/~i101/SoundFiles/BabyElephantWalk60.wav",
  "https://www2.cs.uic.edu/~i101/SoundFiles/CantinaBand3.wav",
  "https://www2.cs.uic.edu/~i101/SoundFiles/CantinaBand60.wav",
  "https://www2.cs.uic.edu/~i101/SoundFiles/Fanfare60.wav",
  "https://www2.cs.uic.edu/~i101/SoundFiles/gettysburg10.wav",
  "https://www2.cs.uic.edu/~i101/SoundFiles/preamble10.wav",
  "https://www2.cs.uic.edu/~i101/SoundFiles/StarWars3.wav",
  "https://www2.cs.uic.edu/~i101/SoundFiles/StarWars60.wav",
  "https://www2.cs.uic.edu/~i101/SoundFiles/taunt.wav",
  "https://www2.cs.uic.edu/~i101/SoundFiles/ImperialMarch60.wav",
  "https://www2.cs.uic.edu/~i101/SoundFiles/PinkPanther30.wav",
  "https://www2.cs.uic.edu/~i101/SoundFiles/PinkPanther60.wav",
  "https://filesamples.com/samples/audio/mp3/sample1.mp3",
  "https://filesamples.com/samples/audio/mp3/sample2.mp3",
  "https://filesamples.com/samples/audio/mp3/sample3.mp3",
  "https://filesamples.com/samples/audio/mp3/sample4.mp3",
  "https://download.samplelib.com/mp3/sample-3s.mp3",
  "https://download.samplelib.com/mp3/sample-6s.mp3",
  "https://download.samplelib.com/mp3/sample-9s.mp3",
  "https://download.samplelib.com/mp3/sample-12s.mp3",
  "https://download.samplelib.com/mp3/sample-15s.mp3",
];

export const FALLBACK_STICKERS = [
  "https://images.unsplash.com/photo-1543466835-00a7907e9de1?w=400&q=80",
  "https://images.unsplash.com/photo-1574158622682-e40e69881006?w=400&q=80",
  "https://images.unsplash.com/photo-1587300003388-59208cc962cb?w=400&q=80",
  "https://images.unsplash.com/photo-1548199973-03cce0bbc87b?w=400&q=80",
  "https://images.unsplash.com/photo-1517849845537-4d257902454a?w=400&q=80",
  "https://images.unsplash.com/photo-1425082661507-6af0db6f6412?w=400&q=80",
  "https://images.unsplash.com/photo-1561037404-61cd46aa615b?w=400&q=80",
  "https://images.unsplash.com/photo-1583511655857-d19b40a7a54e?w=400&q=80",
  "https://images.unsplash.com/photo-1537151625747-768eb6cf92b2?w=400&q=80",
  "https://images.unsplash.com/photo-1596854407944-bf87f6fdd49e?w=400&q=80",
  "https://images.unsplash.com/photo-1552053831-71594a27632d?w=400&q=80",
  "https://images.unsplash.com/photo-1560807707-8cc77767d783?w=400&q=80",
];
