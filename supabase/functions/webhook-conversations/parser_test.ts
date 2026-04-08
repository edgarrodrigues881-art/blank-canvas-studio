import { assertEquals, assertExists } from "https://deno.land/std@0.208.0/assert/mod.ts";
import { extractConversationEvent, isApiSentMessage, normalizeRemoteJid } from "./parser.ts";

Deno.test("normalizeRemoteJid appends suffix to bare number", () => {
  assertEquals(normalizeRemoteJid("5511999999999"), "5511999999999@s.whatsapp.net");
});

Deno.test("normalizeRemoteJid keeps existing @", () => {
  assertEquals(normalizeRemoteJid("5511999999999@s.whatsapp.net"), "5511999999999@s.whatsapp.net");
});

Deno.test("isApiSentMessage detects wasSentByApi", () => {
  assertEquals(isApiSentMessage({ wasSentByApi: true }), true);
  assertEquals(isApiSentMessage({}), false);
});

Deno.test("extractConversationEvent parses simple text", () => {
  const result = extractConversationEvent({
    event: "messages",
    key: { remoteJid: "5511999999999@s.whatsapp.net", fromMe: false, id: "MSG123" },
    message: { conversation: "Hello world" },
    pushName: "Test",
  });
  assertExists(result);
  assertEquals(result.content, "Hello world");
  assertEquals(result.mediaType, null);
});

Deno.test("extractConversationEvent parses UAZAPI-GO image", () => {
  const result = extractConversationEvent({
    EventType: "messages",
    chat: { name: "Test" },
    message: {
      chatid: "556294192500@s.whatsapp.net",
      content: { URL: "https://mmg.whatsapp.net/image.enc", mimetype: "image/jpeg", mediaKey: "abc==" },
      fromMe: false, mediaType: "image", messageid: "IMG1", sender_pn: "556294192500@s.whatsapp.net",
    },
  });
  assertExists(result);
  assertEquals(result.mediaType, "image");
  assertEquals(result.mediaKey, "abc==");
});

Deno.test("extractConversationEvent parses UAZAPI-GO audio", () => {
  const result = extractConversationEvent({
    EventType: "messages",
    chat: { name: "Test" },
    message: {
      chatid: "5511999999999@s.whatsapp.net",
      content: { URL: "https://mmg.whatsapp.net/audio.enc", mimetype: "audio/ogg; codecs=opus", seconds: 15, mediaKey: "key==" },
      fromMe: false, mediaType: "ptt", messageid: "AUD1", sender_pn: "5511999999999@s.whatsapp.net",
    },
  });
  assertExists(result);
  assertEquals(result.mediaType, "audio");
  assertEquals(result.audioDuration, 15);
  assertEquals(result.mimeType, "audio/ogg; codecs=opus");
});

Deno.test("extractConversationEvent parses quoted replies from UAZAPI payload", () => {
  const result = extractConversationEvent({
    EventType: "messages",
    chat: { name: "Eu" },
    message: {
      chatid: "556294192500@s.whatsapp.net",
      content: {
        text: "Oi",
        contextInfo: {
          stanzaID: "3EB07F57DA0FBBDE762F05",
          participant: "30619509768229@lid",
          quotedMessage: { conversation: "oi" },
        },
      },
      fromMe: false,
      messageid: "A51C42BDE7EBBB2DD529BE182658CDE6",
      quoted: "3EB07F57DA0FBBDE762F05",
      sender_pn: "556294192500@s.whatsapp.net",
      type: "text",
    },
  });

  assertExists(result);
  assertEquals(result.quotedMessageId, "3EB07F57DA0FBBDE762F05");
  assertEquals(result.quotedContent, "oi");
});

Deno.test("extractConversationEvent parses UAZAPI button click payload", () => {
  const result = extractConversationEvent({
    EventType: "messages",
    chat: { name: "Dg Contingência" },
    message: {
      buttonOrListid: "btn-1775684318768",
      chatid: "556294192500@s.whatsapp.net",
      content: {
        selectedID: "btn-1775684318768",
        selectedDisplayText: "Ver Ferramenta",
      },
      fromMe: false,
      messageType: "TemplateButtonReplyMessage",
      messageid: "3EB0F18EB7886C93836A40",
      senderName: "Dg Contingência",
      sender_pn: "556294192500@s.whatsapp.net",
      vote: "Ver Ferramenta",
    },
  });

  assertExists(result);
  assertEquals(result.content, "Ver Ferramenta");
  assertEquals(result.buttonResponseId, "btn-1775684318768");
});

Deno.test("extractConversationEvent skips groups", () => {
  const result = extractConversationEvent({
    event: "messages",
    key: { remoteJid: "123@g.us", fromMe: false, id: "X" },
    message: { conversation: "hi" },
  });
  assertEquals(result, null);
});
