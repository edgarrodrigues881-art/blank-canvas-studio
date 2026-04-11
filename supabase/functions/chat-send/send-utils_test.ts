import { assertEquals } from "https://deno.land/std@0.208.0/assert/mod.ts";
import { buildAttempts, extractResponseChatId, getDestination, isResponseTargetMismatch } from "./send-utils.ts";

Deno.test("buildAttempts prioriza chatId exato para mensagem privada", () => {
  const destination = getDestination("5562994192500@s.whatsapp.net");
  const attempts = buildAttempts(undefined, destination, "oi");

  assertEquals(attempts[0].path, "/chat/send-text");
  assertEquals(attempts[0].expectedChatId, "5562994192500@s.whatsapp.net");
  assertEquals(attempts[0].body.chatId, "5562994192500@s.whatsapp.net");
  assertEquals(attempts[2].body.number, "5562994192500@s.whatsapp.net");
});

Deno.test("extractResponseChatId lê chatid retornado pela API", () => {
  assertEquals(
    extractResponseChatId({ chatid: "5562994192500@s.whatsapp.net" }),
    "5562994192500@s.whatsapp.net",
  );
});

Deno.test("isResponseTargetMismatch detecta troca indevida de JID", () => {
  assertEquals(
    isResponseTargetMismatch(
      { chatid: "556294192500@s.whatsapp.net" },
      "5562994192500@s.whatsapp.net",
    ),
    false,
  );
});

Deno.test("isResponseTargetMismatch aceita o chat esperado", () => {
  assertEquals(
    isResponseTargetMismatch(
      { chatid: "5562994192500@s.whatsapp.net" },
      "5562994192500@s.whatsapp.net",
    ),
    false,
  );
});

Deno.test("isResponseTargetMismatch continua bloqueando um destino realmente diferente", () => {
  assertEquals(
    isResponseTargetMismatch(
      { chatid: "5562994192599@s.whatsapp.net" },
      "5562994192500@s.whatsapp.net",
    ),
    true,
  );
});