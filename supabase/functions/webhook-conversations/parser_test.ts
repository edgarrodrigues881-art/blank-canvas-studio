import { assertEquals, assertExists } from "jsr:@std/assert";
import { extractConversationEvent, isApiSentMessage, normalizeRemoteJid } from "./parser.ts";

Deno.test("normalizeRemoteJid monta jid privado a partir do telefone", () => {
  assertEquals(normalizeRemoteJid("+55 (11) 99876-5432"), "5511998765432@s.whatsapp.net");
  assertEquals(normalizeRemoteJid("5511998765432@s.whatsapp.net"), "5511998765432@s.whatsapp.net");
});

Deno.test("extractConversationEvent lê payload nativo da UAZAPI com phoneNumber", () => {
  const result = extractConversationEvent({
    EventType: "messages",
    chat: {
      phoneNumber: "+55 (11) 99876-5432",
      lead_name: "Maria",
      imagePreview: "https://example.com/avatar.jpg",
    },
    text: "Olá, tudo bem?",
    messageId: "uaz-123",
    timestamp: 1712345678,
  });

  assertExists(result);
  assertEquals(result.remoteJid, "5511998765432@s.whatsapp.net");
  assertEquals(result.phone, "5511998765432");
  assertEquals(result.name, "Maria");
  assertEquals(result.content, "Olá, tudo bem?");
  assertEquals(result.fromMe, false);
  assertEquals(result.waId, "uaz-123");
  assertEquals(result.mediaType, null);
  assertEquals(result.avatarUrl, "https://example.com/avatar.jpg");
});

Deno.test("extractConversationEvent lê payload estilo Baileys", () => {
  const result = extractConversationEvent({
    event: "messages.upsert",
    data: {
      key: {
        remoteJid: "5511912345678@s.whatsapp.net",
        fromMe: true,
        id: "msg-456",
      },
      message: {
        extendedTextMessage: {
          text: "Mensagem enviada",
        },
      },
      messageTimestamp: 1712345678,
    },
  });

  assertExists(result);
  assertEquals(result.remoteJid, "5511912345678@s.whatsapp.net");
  assertEquals(result.phone, "5511912345678");
  assertEquals(result.fromMe, true);
  assertEquals(result.content, "Mensagem enviada");
  assertEquals(result.waId, "msg-456");
});

Deno.test("extractConversationEvent ignora grupos", () => {
  const result = extractConversationEvent({
    event: "messages.upsert",
    data: {
      key: {
        remoteJid: "12345@g.us",
      },
    },
  });

  assertEquals(result, null);
});

Deno.test("isApiSentMessage detecta mensagens enviadas pela API", () => {
  assertEquals(isApiSentMessage({ wasSentByApi: true }), true);
  assertEquals(isApiSentMessage({ message: { wasSentByApi: true } }), true);
  assertEquals(isApiSentMessage({ text: "oi" }), false);
});

Deno.test("extractConversationEvent lê mídia aninhada em message.message", () => {
  // Baileys-style double-nested
  const result = extractConversationEvent({
    event: "messages.upsert",
    data: {
      key: {
        remoteJid: "5511912345678@s.whatsapp.net",
        fromMe: false,
        id: "img-789",
      },
      message: {
        message: {
          imageMessage: {
            url: "https://example.com/foto.jpg",
            caption: "Foto recebida",
          },
        },
      },
      messageTimestamp: 1712345678,
    },
  });

  assertExists(result);
  assertEquals(result.mediaType, "image");
  assertEquals(result.mediaUrl, "https://example.com/foto.jpg");
  assertEquals(result.content, "Foto recebida");
});

Deno.test("extractConversationEvent lê payload UAZAPI-GO com content.URL e mimetype", () => {
  const result = extractConversationEvent({
    BaseUrl: "https://example.uazapi.com",
    EventType: "messages",
    chat: {
      name: "Reuu",
    },
    message: {
      chatid: "556294192500@s.whatsapp.net",
      content: {
        URL: "https://mmg.whatsapp.net/v/t62.7118-24/image.enc",
        mimetype: "image/jpeg",
        fileLength: 65967,
      },
      fromMe: false,
      id: "uazapi-img-001",
    },
    timestamp: 1712345678,
  });

  assertExists(result);
  assertEquals(result.mediaType, "image");
  assertEquals(result.mediaUrl, "https://mmg.whatsapp.net/v/t62.7118-24/image.enc");
  assertEquals(result.phone, "556294192500");
  assertEquals(result.fromMe, false);
});

Deno.test("extractConversationEvent lê payload UAZAPI-GO áudio PTT", () => {
  const result = extractConversationEvent({
    EventType: "messages",
    chat: { name: "João" },
    message: {
      chatid: "5511999999999@s.whatsapp.net",
      content: {
        URL: "https://mmg.whatsapp.net/audio.enc",
        mimetype: "audio/ogg; codecs=opus",
        seconds: 15,
      },
      fromMe: false,
      id: "uazapi-audio-001",
    },
    timestamp: 1712345678,
  });

  assertExists(result);
  assertEquals(result.mediaType, "audio");
  assertEquals(result.mediaUrl, "https://mmg.whatsapp.net/audio.enc");
  assertEquals(result.audioDuration, 15);
});