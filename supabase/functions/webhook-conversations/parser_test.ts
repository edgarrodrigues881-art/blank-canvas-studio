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

Deno.test("extractConversationEvent skips groups", () => {
  const result = extractConversationEvent({
    event: "messages",
    key: { remoteJid: "123@g.us", fromMe: false, id: "X" },
    message: { conversation: "hi" },
  });
  assertEquals(result, null);
});
