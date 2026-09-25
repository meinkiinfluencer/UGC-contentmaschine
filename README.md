# UGC Contentmaschine

## Ausbaustufen

| Stufe | Umfang | Status |
|---|---|---|
| **1 · Video-Maschine** | Trends → Scripts → Avatar/B-Roll → fertiges Reel → **Download + Caption, manuell posten** | ✅ Standard (`Veröffentlichung = Manuell`) |
| 2 · Auto-Posting | Freigegebene Reels automatisch einplanen (Ayrshare, später günstigere API) | eingebaut, pro Marke zuschaltbar |
| 3 · Performance-Loop | Views/Watchtime zurück ins System → bessere Hooks | geplant |

Stufe 1 braucht nur: **Claude + Higgsfield + ElevenLabs** (kein Posting-Tool).

Multi-Marken-System: Pro Kunde **täglich automatisch virale UGC-Reels (30–60 s)** – von Trend-Analyse über Storytelling-Script, KI-Influencer-Avatar, B-Roll, Schnitt mit Untertiteln bis zur Planung auf Instagram, TikTok, Facebook.

## System-Flow

```
                ┌──────────── Worker (alle 20 s) ────────────┐
Autopilot ──► pro Marke: Pipeline < postsPerDay × Vorlauf?  → neuer Run
                                                             │
Run ─► Apify (optional): echte virale TikTok/IG-Posts zu Nischen-Hashtags
    ─► Claude + Websuche: Trends, Formate, Hooks, Retention-Tricks
    ─► Claude: count+2 Reel-Scripts (Marke, Persona, Formate, keine Wiederholung) → Top-N nach Viral-Score
        │
   [Gate 1: Script-Freigabe]  (auto möglich)
        │
   pro Segment:  ElevenLabs (feste Stimme + Wort-Timings)
     🎤 avatar → Higgsfield Speak (Avatar-Bild + Audio → Lip-Sync, ≤15 s)
     🎬 broll  → Higgsfield Soul (Szene, Avatar als Referenz) → DoP Image-to-Video
        │
   ffmpeg: 9:16-Schnitt · Voiceover · Untertitel (Wort-Highlight) · Text-Overlays · Musik
        │
   [Gate 2: Video-Freigabe]  (auto möglich)
        │
   Stufe 1: „Fertig zum Posten“ – Termin-Vorschlag (Posting-Zeiten der Marke), ⬇ Reel, 📋 Caption,
            selbst posten → „✓ Gepostet“ → Autopilot füllt Vorlauf nach
   Stufe 2: Ayrshare (Profil pro Kunde) ─► IG · TikTok · FB automatisch
```

**Länger als 15 s:** Ein Reel besteht aus 4–8 Segmenten. Avatar-Segmente (≤ 15 s, Speak-Limit) wechseln mit B-Roll-Segmenten; ffmpeg schneidet alles zu einem Reel. Zu lange Avatar-Texte werden automatisch an Satzgrenzen geteilt.

**Formate:** storytelling · problem_solution · tips_list · myth_vs_fact · pov · testimonial · behind_the_scenes · hot_take · reaction (pro Marke wählbar).

## Dashboard

| Seite | Funktion |
|---|---|
| `/` | Kanban aller Marken: Script-Freigabe → Produktion → Video-Freigabe → Fertig zum Posten (Download, Caption, ✓ Gepostet) → Gepostet |
| `/brands` | Kunden anlegen: Branding, Nische, Content-Säulen, Formate, Reel-Länge, Autopilot, Posts/Tag, Posting-Zeiten, Ayrshare-Profil |
| `/brands/[id]` | **Avatar-Studio**: Aussehen beschreiben → 4 Higgsfield-Soul-Kandidaten → auswählen · Stimme aus ElevenLabs-Liste · Kalkulation |
| `/content/[id]` | Segment-Editor (Avatar/B-Roll, Text, Visual, Overlay), Caption, Termin, Verlauf |
| `/runs` | Manuelle Runs (Aktionen/Themen), Trend-Analyse einsehen |
| `/costs` | Kosten pro Marke / Anbieter / Reel (Monat) |

## Kosten (Schätzung, Stand 09/2026)

**Variabel pro Reel (40 s, `HF_QUALITY=mid`):**

| Posten | ca. |
|---|---|
| Higgsfield Speak (2–3 Avatar-Szenen, ~22 s) | 2,50–4,00 $ |
| Higgsfield Soul + DoP (4 B-Roll-Clips) | 1,50–3,50 $ |
| ElevenLabs Voiceover | 0,10–0,20 $ |
| Claude Research + Scripts (anteilig) | 0,15–0,40 $ |
| **Summe** | **≈ 4–8 $ / Reel** → 1 Reel/Tag ≈ **120–240 $ / Monat / Marke** |

`HF_QUALITY=high` ≈ 2–4× teurer bei Speak. Günstiger: weniger Avatar-Sekunden, mehr B-Roll.

**Fix pro Monat (ca., Preise der Anbieter prüfen):** Ayrshare (1 Profil ab ~149 $, Business für mehrere Kunden deutlich mehr) · ElevenLabs Creator 22 $ / Pro 99 $ · Higgsfield-Plan/Credits nach Verbrauch · Apify optional ~0–49 $ · Hosting (Railway/Render/VPS) 10–25 $.

Die App trackt echte Claude-Kosten (Token-Usage) und schätzt Higgsfield/ElevenLabs über Preis-Variablen (`PRICE_*` in `.env`) → nach den ersten Reels mit dem Higgsfield-Credit-Verbrauch abgleichen.

**Agentur-Rechnung:** 30 Reels/Monat ≈ 150–300 $ Tool-Kosten pro Kunde → Verkaufspreis z.B. 990–1.990 €/Monat.

## Setup

```bash
npm install
cp .env.example .env        # Keys eintragen (MOCK_MODE=true = Demo ohne Keys, Schnitt läuft echt)
npm run db:push && npm run db:seed
npm run dev                 # Dashboard: http://localhost:3000
npm run worker              # Hintergrund: Autopilot + Pipeline
```

1. `/brands` → Marke anlegen (Nische, Formate, Posting-Zeiten, Ayrshare Profile-Key).
2. Avatar: Aussehen + Persona → „4 Avatar-Bilder generieren“ → Bild anklicken → Stimme wählen.
3. ⚡ Autopilot an → ab jetzt hält der Worker `Posts/Tag × Vorlauf` Reels in der Pipeline. Freigaben im Board – oder Auto-Freigabe aktivieren = 0 Klicks.

## Keys

| Variable | Woher |
|---|---|
| `ANTHROPIC_API_KEY` | console.anthropic.com |
| `HF_CREDENTIALS` | open.higgsfield.ai → API Keys, `KEY_ID:KEY_SECRET` |
| `ELEVENLABS_API_KEY` | elevenlabs.io → API Keys |
| `AYRSHARE_API_KEY` | app.ayrshare.com (Profile-Key pro Kunde im Dashboard) |
| `APIFY_TOKEN` (optional) | apify.com – echte virale Daten |

## Deployment (dauerhaft im Hintergrund)

- **Docker/Railway/Render**: ein Image, zwei Services: Web (`CMD` default) + Worker (`npm run worker`), gemeinsames Volume `/data`, Postgres (`provider = "postgresql"`).
- `PUBLIC_BASE_URL` setzen → Higgsfield-Webhooks + fertige Reels werden direkt von der App an Ayrshare ausgeliefert (`/api/media/...`). Ohne: Upload aufs Higgsfield-CDN.
- `DASHBOARD_PASSWORD` setzen (Basic Auth).
- Serverless (Vercel) nur mit externem Worker – Schnitt braucht ffmpeg + Dateisystem.

## Next Steps

- Performance-Loop: Ayrshare-Analytics (Views, Watchtime) zurück in DB → Top-Hooks/Formate in den Script-Prompt.
- Higgsfield Soul ID (trainierter Charakter) für 100 % konsistente B-Roll mit dem Avatar.
- ElevenLabs Voice Design direkt im Avatar-Studio.
- Kunden-Login mit Freigabe-Link pro Marke.
