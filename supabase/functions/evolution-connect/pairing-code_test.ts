import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { extractPairingCode } from "../_shared/pairing-code.ts";

Deno.test("extractPairingCode returns documented pairingCode instead of generic code", () => {
  const payload = {
    pairingCode: "ABCD-EFGH",
    code: "2@y8eK+bjtEjUWy9/FOM123456789",
    base64: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAA",
  };

  assertEquals(extractPairingCode(payload), "ABCDEFGH");
});

Deno.test("extractPairingCode ignores raw QR code payloads without pairing context", () => {
  const payload = {
    code: "ROFD220144195EF8",
    qrcode: {
      code: "2@v1j2k3l4m5n6o7p8q9r0s1t2u3v4w5x6y7z8a9b0",
    },
  };

  assertEquals(extractPairingCode(payload), null);
});

Deno.test("extractPairingCode reads pairing code from provider message text", () => {
  const payload = {
    message: "Pairing code generated successfully: WZYE-H1YY",
  };

  assertEquals(extractPairingCode(payload), "WZYEH1YY");
});

Deno.test("extractPairingCode ignores phone number echoed back by the provider", () => {
  const payload = {
    pairingCode: "+55 11 99999-9999",
  };

  assertEquals(extractPairingCode(payload, "5511999999999"), null);
});