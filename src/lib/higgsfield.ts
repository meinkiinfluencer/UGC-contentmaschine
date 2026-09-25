import { cfg } from "./config";

// Higgsfield REST API (https://api.higgsfield.ai)
// Auth: "Authorization: Key KEY_ID:KEY_SECRET"
// Async: POST <endpoint> -> { request_id, status_url } ; GET /requests/{id}/status
// Status: queued | in_progress | completed | failed | nsfw

export type HfStatus = "queued" | "in_progress" | "completed" | "failed" | "nsfw";
export interface HfResponse {
  status: HfStatus;
  request_id: string;
  status_url?: string;
  video?: { url: string };
  images?: { url: string }[];
  error?: string;
}

async function hf<T>(path: string, init: RequestInit = {}): Promise<T> {
  if (!cfg.hf.credentials.includes(":")) throw new Error("HF_CREDENTIALS fehlt (Format KEY_ID:KEY_SECRET)");
  const res = await fetch(`${cfg.hf.baseUrl}${path}`, {
    ...init,
    headers: {
      Authorization: `Key ${cfg.hf.credentials}`,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });
  const text = await res.text();
  if (!res.ok) {
    const hint = res.status === 403 ? " (nicht genug Credits?)" : res.status === 401 ? " (API-Key ungültig)" : "";
    throw new Error(`Higgsfield ${res.status}${hint}: ${text.slice(0, 500)}`);
  }
  return JSON.parse(text) as T;
}

/** Datei auf Higgsfield-CDN hochladen -> öffentliche URL */
export async function uploadFile(data: ArrayBuffer, contentType: string): Promise<string> {
  if (cfg.mock) return "https://example.com/mock-audio.mp3";
  const { upload_url, public_url } = await hf<{ upload_url: string; public_url: string }>(
    "/files/generate-upload-url",
    { method: "POST", body: JSON.stringify({ content_type: contentType }) },
  );
  const put = await fetch(upload_url, { method: "PUT", body: data, headers: { "Content-Type": contentType } });
  if (!put.ok) throw new Error(`Upload fehlgeschlagen: ${put.status}`);
  return public_url;
}

/** Talking-Avatar-Video (Bild + Audio -> lippensynchrones UGC-Video) starten */
export async function submitSpeakVideo(input: {
  imageUrl: string;
  audioUrl: string;
  prompt: string;
  duration: 5 | 10 | 15;
  webhookUrl?: string;
}): Promise<string> {
  if (cfg.mock) return `mock-${Date.now()}`;
  let path = cfg.hf.endpoint.startsWith("/") ? cfg.hf.endpoint : `/${cfg.hf.endpoint}`;
  if (input.webhookUrl) path += `${path.includes("?") ? "&" : "?"}hf_webhook=${encodeURIComponent(input.webhookUrl)}`;
  const res = await hf<HfResponse>(path, {
    method: "POST",
    body: JSON.stringify({
      input_image: { type: "image_url", image_url: input.imageUrl },
      input_audio: { type: "audio_url", audio_url: input.audioUrl },
      prompt: input.prompt,
      quality: cfg.hf.quality,
      duration: input.duration,
    }),
  });
  if (!res.request_id) throw new Error(`Higgsfield: keine request_id (${JSON.stringify(res).slice(0, 300)})`);
  return res.request_id;
}

export async function getStatus(requestId: string): Promise<HfResponse> {
  if (cfg.mock) {
    return {
      status: "completed",
      request_id: requestId,
      video: { url: "https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4" },
    };
  }
  return hf<HfResponse>(`/requests/${requestId}/status`);
}
