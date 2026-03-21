import { describe, expect, it } from "vitest";
import {
  normalizeComposerMessage,
  serializeTemplateMedia,
  validateNormalizedComposerMessage,
} from "@/lib/campaign-message";

describe("campaign message normalization", () => {
  it("gera a mesma estrutura para template importado e manual", () => {
    const media = serializeTemplateMedia("https://example.com/banner.webp", "banner.webp");
    const buttons = [{ type: "url", text: "Saiba mais", value: "https://example.com" }];

    const manual = normalizeComposerMessage({
      content: "Minha copy principal",
      media_url: "https://example.com/banner.webp",
      buttons,
      source: "manual",
    });

    const imported = normalizeComposerMessage({
      content: "Minha copy principal",
      media_url: media ?? null,
      buttons,
      source: "template_import",
      templateId: "tpl-1",
    });

    expect(imported.primaryText).toBe(manual.primaryText);
    expect(imported.mediaUrl).toBe(manual.mediaUrl);
    expect(imported.buttons).toEqual(manual.buttons);
    expect(validateNormalizedComposerMessage(imported)).toEqual([]);
  });

  it("bloqueia botão sem copy e não aceita fallback silencioso", () => {
    const normalized = normalizeComposerMessage({
      content: "",
      media_url: "https://example.com/banner.webp",
      buttons: [{ type: "reply", text: "Comprar", value: "btn_1" }],
      source: "template_import",
    });

    expect(validateNormalizedComposerMessage(normalized)).toContain(
      "Mensagens com botão exigem copy/texto principal. O sistema não aplica mais 'Escolha uma opção' automaticamente.",
    );
  });
});
