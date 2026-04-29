// Shared status posting helpers used by both status-post and status-schedule-tick

export type StatusType = "text" | "image" | "video" | "audio";

export interface StatusPayload {
  type: StatusType;
  text_content?: string | null;
  media_url?: string | null;
  caption?: string | null;
  background_color?: string | null;
  font?: number | null;
}

function buildAttempts(payload: StatusPayload): { path: string; body: Record<string, unknown> }[] {
  const { type, text_content, media_url, caption, background_color, font } = payload;

  if (type === "text") {
    const text = (text_content || "").trim();
    return [
      { path: "/send/status", body: { type: "text", text, backgroundColor: background_color || "#25D366", font: font ?? 1 } },
      { path: "/message/sendStatus", body: { type: "text", text, backgroundColor: background_color || "#25D366", font: font ?? 1 } },
    ];
  }

  // UAZAPI accepts the caption under different keys depending on the build:
  // some expose `caption`, others use `text`. Send both to maximize compatibility.
  const cap = (caption || "").trim();

  if (type === "image") {
    return [
      { path: "/send/status", body: { type: "image", file: media_url, caption: cap, text: cap } },
      { path: "/send/status", body: { type: "image", media: media_url, caption: cap, text: cap } },
      { path: "/message/sendStatus", body: { type: "image", file: media_url, caption: cap, text: cap } },
    ];
  }

  if (type === "video") {
    return [
      { path: "/send/status", body: { type: "video", file: media_url, caption: cap, text: cap } },
      { path: "/send/status", body: { type: "video", media: media_url, caption: cap, text: cap } },
      { path: "/message/sendStatus", body: { type: "video", file: media_url, caption: cap, text: cap } },
    ];
  }

  return [
    { path: "/send/status", body: { type: "audio", file: media_url } },
    { path: "/send/status", body: { type: "audio", media: media_url } },
    { path: "/message/sendStatus", body: { type: "audio", file: media_url } },
  ];
}

export async function postStatusOnDevice(
  baseUrl: string,
  token: string,
  payload: StatusPayload,
): Promise<{ sent: true; parsed: any } | { sent: false; error: string }> {
  const attempts = buildAttempts(payload);
  let lastErr = "";

  for (const attempt of attempts) {
    try {
      const res = await fetch(`${baseUrl}${attempt.path}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json", token },
        body: JSON.stringify(attempt.body),
      });
      const raw = await res.text();
      let parsed: any = {};
      try { parsed = raw ? JSON.parse(raw) : {}; } catch {}

      const explicitFailure = Boolean(parsed?.error || parsed?.status === "error" || parsed?.code === 404);
      if (res.ok && !explicitFailure) return { sent: true, parsed };

      lastErr = `${res.status} @ ${attempt.path}: ${(typeof parsed?.message === "string" && parsed.message) || (typeof parsed?.error === "string" && parsed.error) || raw.substring(0, 200)}`;
      if (res.status === 401 || res.status === 403) break;
    } catch (e: any) {
      lastErr = `${attempt.path}: ${e?.message || String(e)}`;
    }
  }

  return { sent: false, error: lastErr || "Falha ao publicar status" };
}

export async function publishToDevices(
  admin: any,
  userId: string,
  payload: StatusPayload,
  deviceIds: string[],
  fallbackBaseUrl: string,
  fallbackToken: string,
  scheduleId?: string | null,
) {
  // Insert post record
  const { data: post } = await admin
    .from("status_posts")
    .insert({
      user_id: userId,
      schedule_id: scheduleId || null,
      type: payload.type,
      text_content: payload.text_content || null,
      media_url: payload.media_url || null,
      media_type: payload.type !== "text" ? payload.type : null,
      caption: payload.caption || null,
      background_color: payload.background_color || null,
      font: payload.font ?? null,
      device_ids: deviceIds,
      status: "sending",
    })
    .select()
    .single();

  const { data: devices } = await admin
    .from("devices")
    .select("id, name, number, uazapi_token, uazapi_base_url, status")
    .eq("user_id", userId)
    .in("id", deviceIds);

  const results: any[] = [];
  let success = 0;
  let errors = 0;

  for (const dev of (devices || [])) {
    const baseUrl = String(dev.uazapi_base_url || fallbackBaseUrl || "").replace(/\/+$/, "");
    const token = String(dev.uazapi_token || fallbackToken || "").trim();

    if (!baseUrl || !token) {
      results.push({ device_id: dev.id, name: dev.name, success: false, error: "API não configurada" });
      errors++;
      continue;
    }

    const r = await postStatusOnDevice(baseUrl, token, payload);
    if (r.sent) {
      success++;
      // Try to extract message id from UAZAPI response (varies by build)
      const p = r.parsed || {};
      const messageId =
        p?.messageId || p?.id || p?.key?.id || p?.message?.id ||
        p?.data?.messageId || p?.data?.id || p?.data?.key?.id || null;
      results.push({ device_id: dev.id, name: dev.name, success: true, message_id: messageId });
    } else {
      errors++;
      results.push({ device_id: dev.id, name: dev.name, success: false, error: r.error });
    }
  }

  if (post) {
    const finalStatus = errors === 0 && success > 0 ? "completed" : success === 0 ? "failed" : "completed";
    await admin
      .from("status_posts")
      .update({ status: finalStatus, success_count: success, error_count: errors, results })
      .eq("id", post.id);
  }

  return { post_id: post?.id, success_count: success, error_count: errors, results };
}
