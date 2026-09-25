import { cfg } from "./config";

// Higgsfield REST API (https://api.higgsfield.ai)
// Auth: "Authorization: Key KEY_ID:KEY_SECRET"
// Async: POST <endpoint> -> { request_id } ; GET /requests/{id}/status
// Status: queued | in_progress | completed | failed | nsfw

export type HfStatus = "queued" | "in_progress" | "completed" | "failed" | "nsfw";
export interface HfResponse {
  status: HfStatus;
  request_id: string;
  video?: { url: string };
  images?: { url: string }[];
}

async function hf<T>(path: string, init: RequestInit = {}): Promise<T> {
  if (!cfg.hf.credentials.includes(":")) throw new Error("HF_CREDENTIALS fehlt (Format KEY_ID:KEY_SECRET)");
  const res = await fetch(`${cfg.hf.baseUrl}${path}`, {
    ...init,
    headers: { Authorization: `Key ${cfg.hf.credentials}`, "Content-Type": "application/json", ...(init.headers ?? {}) },
  });
  const text = await res.text();
  if (!res.ok) {
    const hint = res.status === 403 ? " (nicht genug Credits?)" : res.status === 401 ? " (API-Key ungültig)" : "";
    throw new Error(`Higgsfield ${res.status}${hint}: ${text.slice(0, 500)}`);
  }
  return JSON.parse(text) as T;
}

async function submit(endpoint: string, body: object, webhookUrl?: string): Promise<string> {
  let path = endpoint.startsWith("/") ? endpoint : `/${endpoint}`;
  if (webhookUrl) path += `${path.includes("?") ? "&" : "?"}hf_webhook=${encodeURIComponent(webhookUrl)}`;
  const res = await hf<HfResponse>(path, { method: "POST", body: JSON.stringify(body) });
  if (!res.request_id) throw new Error(`Higgsfield: keine request_id (${JSON.stringify(res).slice(0, 300)})`);
  return res.request_id;
}

/** Datei auf Higgsfield-CDN hochladen -> öffentliche URL */
export async function uploadFile(data: ArrayBuffer | Buffer, contentType: string): Promise<string> {
  const { upload_url, public_url } = await hf<{ upload_url: string; public_url: string }>(
    "/files/generate-upload-url",
    { method: "POST", body: JSON.stringify({ content_type: contentType }) },
  );
  const put = await fetch(upload_url, { method: "PUT", body: new Uint8Array(data), headers: { "Content-Type": contentType } });
  if (!put.ok) throw new Error(`Upload fehlgeschlagen: ${put.status}`);
  return public_url;
}

/** Talking-Avatar (Bild + Audio -> lippensynchrones Video), max 15 s */
export function submitSpeak(i: { imageUrl: string; audioUrl: string; prompt: string; duration: 5 | 10 | 15; webhookUrl?: string }) {
  if (cfg.mock) return Promise.resolve(`mock-speak-${crypto.randomUUID()}`);
  return submit(cfg.hf.speakEndpoint, {
    input_image: { type: "image_url", image_url: i.imageUrl },
    input_audio: { type: "audio_url", audio_url: i.audioUrl },
    prompt: i.prompt,
    quality: cfg.hf.quality,
    duration: i.duration,
  }, i.webhookUrl);
}

/** Soul Text-to-Image: Avatar-Kandidaten + B-Roll-Standbilder (9:16) */
export function submitImage(i: { prompt: string; batch?: 1 | 4; referenceUrl?: string }) {
  if (cfg.mock) return Promise.resolve(`mock-image-${crypto.randomUUID()}`);
  return submit(cfg.hf.imageEndpoint, {
    prompt: i.prompt,
    width_and_height: "1152x2048",
    quality: "1080p",
    batch_size: i.batch ?? 1,
    enhance_prompt: true,
    ...(i.referenceUrl ? { image_reference: { type: "image_url", image_url: i.referenceUrl } } : {}),
  });
}

/** DoP Image-to-Video: filmische B-Roll aus Standbild */
export function submitImageToVideo(i: { imageUrl: string; prompt: string; webhookUrl?: string }) {
  if (cfg.mock) return Promise.resolve(`mock-i2v-${crypto.randomUUID()}`);
  return submit(cfg.hf.i2vEndpoint, {
    model: cfg.hf.i2vModel,
    prompt: i.prompt,
    input_images: [{ type: "image_url", image_url: i.imageUrl }],
    enhance_prompt: true,
  }, i.webhookUrl);
}

export async function getStatus(requestId: string): Promise<HfResponse> {
  if (requestId.startsWith("mock-")) {
    const img = "https://picsum.photos/seed/" + requestId.slice(-6) + "/1152/2048";
    return requestId.startsWith("mock-image")
      ? { status: "completed", request_id: requestId, images: [1, 2, 3, 4].map((n) => ({ url: `${img}?${n}` })) }
      : { status: "completed", request_id: requestId, video: { url: `mock://${requestId}` } };
  }
  return hf<HfResponse>(`/requests/${requestId}/status`);
}

/** Kurz blockierend warten (für schnelle Bild-Jobs) */
export async function waitFor(requestId: string, maxMs = 180_000): Promise<HfResponse> {
  const start = Date.now();
  while (Date.now() - start < maxMs) {
    const s = await getStatus(requestId);
    if (s.status === "completed") return s;
    if (s.status === "failed" || s.status === "nsfw") throw new Error(`Higgsfield-Job ${s.status}`);
    await new Promise((r) => setTimeout(r, 4000));
  }
  throw new Error("Higgsfield-Timeout");
}
