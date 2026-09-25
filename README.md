# UGC Contentmaschine

Idee → Trend-Analyse → Scripts (Branding + fester KI-Influencer) → Voiceover → Higgsfield-Avatar-Video → Freigabe → Auto-Planung auf Instagram, TikTok, Facebook. Alles im Dashboard, Worker läuft im Hintergrund.

## System-Flow

```
[Run: Nische X] ──► Claude + Web Search: virale/trendende Themen, Formate, Hooks, Hashtags
        │
        ▼
Claude (Structured Output): N Scripts im Marken-Ton + Avatar-Persona (5/10/15 s)
        │
        ▼
 ┌─ GATE 1: Script-Freigabe (Dashboard, editierbar)   ← AUTO_APPROVE_SCRIPTS=true überspringt
        │
        ▼
ElevenLabs TTS (feste Voice-ID) ─► Higgsfield CDN-Upload ─► Higgsfield Speak (Avatar-Bild + Audio → Lip-Sync-UGC-Video)
        │                                                      (Webhook oder Polling)
        ▼
 ┌─ GATE 2: Video-Freigabe (Preview, Neu rendern)     ← AUTO_APPROVE_VIDEOS=true überspringt
        │
        ▼
Slot-Planer (POST_SLOTS, Europe/Berlin) ─► Ayrshare API ─► IG Reels · TikTok · FB Reels (geplant)
```

Status: `SCRIPT_REVIEW → SCRIPT_APPROVED → VOICING → RENDERING → VIDEO_REVIEW → VIDEO_APPROVED → PUBLISHING → SCHEDULED` (+ `FAILED` mit 3 Auto-Retries, `REJECTED`).

## Stack

| Baustein | Tool |
|---|---|
| Dashboard + API | Next.js 15 (App Router, Server Actions) |
| DB | Prisma · SQLite (MVP) → Postgres/Supabase: `provider = "postgresql"` |
| Trends + Scripts | Claude API (`web_search`, Structured Outputs) |
| Stimme | ElevenLabs (feste Voice-ID pro Avatar) |
| Video | Higgsfield API `/v1/speak/higgsfield` (Endpoint per `HF_VIDEO_ENDPOINT` tauschbar) |
| Publishing | Ayrshare (1 API für IG/TikTok/FB inkl. Scheduling) |
| Background | `worker/index.ts` (Loop + Cron-Auto-Runs) oder `/api/tick` per externem Cron |

## Setup

```bash
npm install
cp .env.example .env        # Keys eintragen (MOCK_MODE=true = Demo ohne Keys)
npm run db:push && npm run db:seed
npm run dev                 # Dashboard: http://localhost:3000
npm run worker              # Hintergrund-Pipeline (zweites Terminal)
```

1. **/settings** – Marke (Angebot, Zielgruppe, Ton, CTA, Hashtags, Regeln) + Avatar (Persona, Bild-URL, ElevenLabs Voice-ID).
   - Avatar-Bild: in Higgsfield (Soul ID / Soul) konsistenten Influencer generieren, 9:16, Gesicht frontal, öffentliche URL.
2. **/runs** – Nische eingeben → Run starten.
3. **/** – Scripts freigeben/editieren → Videos prüfen → freigeben → wird automatisch geplant.

## Keys

| Variable | Woher |
|---|---|
| `ANTHROPIC_API_KEY` | console.anthropic.com |
| `HF_CREDENTIALS` | open.higgsfield.ai → API Keys, Format `KEY_ID:KEY_SECRET` |
| `ELEVENLABS_API_KEY` | elevenlabs.io → Profile → API Key |
| `AYRSHARE_API_KEY` | app.ayrshare.com (IG/TikTok/FB dort verbinden). `AYRSHARE_PROFILE_KEY` für Kunden-Profile |

## Vollautomatik (0 Klicks)

```env
AUTO_RUN_CRON=0 6 * * 1-5      # werktags 6:00 neuer Run
AUTO_RUN_NICHE=Fitness für Mütter
AUTO_APPROVE_SCRIPTS=true
AUTO_APPROVE_VIDEOS=true
POST_SLOTS=11:30,18:00
```

## Deployment

- **Railway/Render/VPS**: Web-Service `npm run build && npm start` + Worker-Service `npm run worker`, Postgres.
- **Vercel**: nur Web; `/api/tick` per Vercel Cron / n8n / Make alle 1–5 Min aufrufen (`Authorization: Bearer $CRON_SECRET`).
- `PUBLIC_BASE_URL` setzen → Higgsfield meldet fertige Videos per Webhook (`/api/webhooks/higgsfield`).
- `DASHBOARD_PASSWORD` setzen (Basic Auth).

## Grenzen / Next Steps

- Speak-Modell: max. 15 s pro Clip → längere Videos: Script in Segmente splitten + ffmpeg-Concat.
- Higgsfield-Video-URLs ggf. in eigenen Storage (S3/Supabase Storage) kopieren, bevor gepostet wird.
- Untertitel/Branding-Overlay: ffmpeg/Creatomate/Canva-Autofill nach dem Rendering einhängen.
- Performance-Loop: Ayrshare Analytics zurück in DB → beste Hooks in den Script-Prompt einspeisen.
- Multi-Client (Agentur): `Brand` pro Kunde + `AYRSHARE_PROFILE_KEY` pro Marke.
