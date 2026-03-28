export interface CarouselCardButton {
  id: number;
  type: "reply" | "url" | "phone";
  text: string;
  value: string;
}

export interface CarouselCard {
  id: string;
  position: number;
  text: string;
  mediaUrl: string;
  mediaType: string | null;
  mediaFileName: string;
  buttons: CarouselCardButton[];
}

export const MAX_CAROUSEL_CARDS = 4;

export function createEmptyCard(position: number): CarouselCard {
  return {
    id: `card-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    position,
    text: "",
    mediaUrl: "",
    mediaType: null,
    mediaFileName: "",
    buttons: [],
  };
}

export function detectMediaType(url: string): string | null {
  const clean = (url || "").toLowerCase().split("?")[0];
  if (!clean) return null;
  if (/(mp4|mov|avi|mkv|webm|3gp)$/.test(clean)) return "video";
  if (/(mp3|wav|ogg|m4a|opus|aac|mpeg)$/.test(clean)) return "audio";
  if (/(pdf|doc|docx|xls|xlsx|ppt|pptx|zip|rar|csv|txt)$/.test(clean)) return "document";
  return "image";
}

export function validateCarouselCards(cards: CarouselCard[]): string[] {
  const errors: string[] = [];
  if (cards.length === 0) {
    errors.push("Adicione pelo menos 1 card ao carrossel.");
    return errors;
  }
  if (cards.length > MAX_CAROUSEL_CARDS) {
    errors.push(`Máximo de ${MAX_CAROUSEL_CARDS} cards por carrossel.`);
  }
  cards.forEach((card, i) => {
    if (!card.text.trim() && !card.mediaUrl) {
      errors.push(`Card ${i + 1}: precisa ter texto ou mídia.`);
    }
    if (card.buttons.length > 3) {
      errors.push(`Card ${i + 1}: máximo de 3 botões por card.`);
    }
    card.buttons.forEach((btn, j) => {
      if (!btn.text.trim()) {
        errors.push(`Card ${i + 1}, Botão ${j + 1}: texto obrigatório.`);
      }
    });
  });
  return errors;
}

export function serializeCarouselCards(cards: CarouselCard[]): object[] {
  return cards.map((card, i) => ({
    id: card.id,
    position: i,
    text: card.text,
    mediaUrl: card.mediaUrl,
    mediaType: card.mediaType,
    buttons: card.buttons.map(b => ({
      type: b.type,
      text: b.text,
      value: b.value,
    })),
  }));
}
