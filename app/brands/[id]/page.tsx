import { db } from "@/lib/db";
import { FORMATS } from "@/lib/llm";
import { listVoices } from "@/lib/tts";
import { estimateReel } from "@/lib/costs";
import { generateAvatar, pickAvatarImage, saveAvatar, saveBrand } from "../../actions";

export const dynamic = "force-dynamic";

const PLATFORMS = ["instagram", "tiktok", "facebook"];

export default async function BrandPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const brand = id === "new" ? null : await db.brand.findUnique({ where: { id }, include: { avatars: true } });
  const voices = await listVoices();
  const formats = (brand?.formats ?? Object.keys(FORMATS).join(",")).split(",");
  const platforms = (brand?.platforms ?? PLATFORMS.join(",")).split(",");
  const secs = brand?.targetSeconds ?? 40;
  const est = estimateReel({ avatarSec: Math.min(secs * 0.55, 30), brollClips: Math.round((secs * 0.45) / 4.5), chars: secs * 2.5 * 6.5 });
  const perMonth = est.total * (brand?.postsPerDay ?? 1) * 30;

  return (
    <>
      <h1>{brand ? brand.name : "Neue Marke"}</h1>
      <div className="grid2">
        <form className="panel" action={saveBrand}>
          <input type="hidden" name="id" defaultValue={brand?.id} />
          <h2>Branding</h2>
          <label>Markenname</label><input name="name" required defaultValue={brand?.name} />
          <label>Angebot / Beschreibung</label><textarea name="description" required defaultValue={brand?.description} />
          <label>Zielgruppe</label><input name="audience" required defaultValue={brand?.audience} />
          <label>Tonalität</label><input name="tone" required defaultValue={brand?.tone ?? "locker, ehrlich, du-Form"} />
          <label>Standard-CTA</label><input name="cta" required defaultValue={brand?.cta} />
          <label>Basis-Hashtags (kommagetrennt)</label><input name="hashtags" defaultValue={brand?.hashtags} />
          <label>Regeln / Dos & Don'ts</label><textarea name="rules" defaultValue={brand?.rules} />
          <label>Sprache</label><input name="language" defaultValue={brand?.language ?? "de"} />

          <h2 style={{ marginTop: 20 }}>Content-Strategie</h2>
          <label>Nische (für Trend-Research & Autopilot)</label><input name="niche" defaultValue={brand?.niche} placeholder="z.B. Zahnarztpraxis München, Angstpatienten" />
          <label>Ziel</label><input name="goal" defaultValue={brand?.goal} placeholder="z.B. Termine über Link in Bio" />
          <label>Content-Säulen (eine pro Zeile)</label><textarea name="pillars" defaultValue={brand?.pillars} placeholder={"Aufklärung\nBehind the Scenes\nKundenstories"} />
          <label>Formate</label>
          <div className="row">{Object.keys(FORMATS).map((f) => (
            <label key={f} className="chk"><input type="checkbox" name="formats" value={f} defaultChecked={formats.includes(f)} />{f}</label>
          ))}</div>
          <label>Ziel-Länge Reel (Sekunden)</label><input name="targetSeconds" type="number" min={15} max={90} defaultValue={secs} />

          <h2 style={{ marginTop: 20 }}>Autopilot & Posting-Plan</h2>
          <div className="row">
            <label className="chk"><input type="checkbox" name="active" defaultChecked={brand?.active ?? true} />Aktiv</label>
            <label className="chk"><input type="checkbox" name="autopilot" defaultChecked={brand?.autopilot} />⚡ Autopilot (Ideen → Posts automatisch)</label>
            <label className="chk"><input type="checkbox" name="autoApproveScripts" defaultChecked={brand?.autoApproveScripts} />Scripts auto-freigeben</label>
            <label className="chk"><input type="checkbox" name="autoApproveVideos" defaultChecked={brand?.autoApproveVideos} />Videos auto-freigeben</label>
          </div>
          <div className="grid2">
            <div><label>Posts pro Tag</label><input name="postsPerDay" type="number" min={1} max={5} defaultValue={brand?.postsPerDay ?? 1} /></div>
            <div><label>Vorlauf (Tage Content im Voraus)</label><input name="bufferDays" type="number" min={1} max={14} defaultValue={brand?.bufferDays ?? 3} /></div>
            <div><label>Posting-Zeiten (HH:MM, kommagetrennt)</label><input name="postSlots" defaultValue={brand?.postSlots ?? "18:00"} /></div>
            <div><label>Zeitzone</label><input name="timezone" defaultValue={brand?.timezone ?? "Europe/Berlin"} /></div>
          </div>
          <label>Plattformen</label>
          <div className="row">{PLATFORMS.map((p) => (
            <label key={p} className="chk"><input type="checkbox" name="platforms" value={p} defaultChecked={platforms.includes(p)} />{p}</label>
          ))}</div>
          <label>Veröffentlichung</label>
          <select name="publishMode" defaultValue={brand?.publishMode ?? "manual"}>
            <option value="manual">Manuell – Reel herunterladen & selbst posten (Stufe 1)</option>
            <option value="ayrshare">Automatisch via Ayrshare (Stufe 2)</option>
          </select>
          <label>Ayrshare Profile-Key (nur Stufe 2)</label><input name="ayrshareProfileKey" defaultValue={brand?.ayrshareProfileKey} />
          <div className="row"><button className="p">Marke speichern</button></div>
        </form>

        <div>
          {brand && (
            <div className="panel" style={{ marginBottom: 16 }}>
              <h2>Kalkulation (Schätzung, {secs} s Reel)</h2>
              <table><tbody>
                <tr><td>Higgsfield Speak (Avatar-Szenen)</td><td>${est.speak.toFixed(2)}</td></tr>
                <tr><td>Higgsfield Soul + DoP (B-Roll)</td><td>${est.broll.toFixed(2)}</td></tr>
                <tr><td>ElevenLabs Voiceover</td><td>${est.voice.toFixed(2)}</td></tr>
                <tr><td>Claude Research + Script</td><td>${est.llm.toFixed(2)}</td></tr>
                <tr><td><b>pro Reel</b></td><td><b>${est.total.toFixed(2)}</b></td></tr>
                <tr><td><b>pro Monat ({brand.postsPerDay}/Tag)</b></td><td><b>${perMonth.toFixed(0)}</b> + Fixkosten</td></tr>
              </tbody></table>
            </div>
          )}
          {brand && [...brand.avatars, null].map((a) => {
            const cands = a ? (JSON.parse(a.candidates) as string[]) : [];
            return (
              <div className="panel" key={a?.id ?? "new"} style={{ marginBottom: 16 }}>
                <form action={saveAvatar}>
                  <h2>{a ? `🎭 ${a.name}` : "+ Neuer UGC-Avatar"}</h2>
                  <input type="hidden" name="id" defaultValue={a?.id} />
                  <input type="hidden" name="brandId" defaultValue={brand.id} />
                  {a?.imageUrl && <img src={a.imageUrl} alt="" style={{ width: 140, borderRadius: 8 }} />}
                  <label>Name</label><input name="name" required defaultValue={a?.name} />
                  <label>Persona (Alter, Beruf, Story, Sprechstil)</label><textarea name="persona" required defaultValue={a?.persona} />
                  <label>Aussehen (für Avatar-Generierung, EN oder DE)</label>
                  <textarea name="look" defaultValue={a?.look} placeholder="28 year old woman, long brown hair, freckles, casual beige hoodie, gold earrings" />
                  <label>Avatar-Bild-URL (oder unten generieren & auswählen)</label><input name="imageUrl" defaultValue={a?.imageUrl} />
                  <label>Stimme (ElevenLabs)</label>
                  {voices.length ? (
                    <select name="voiceId" defaultValue={a?.voiceId}>
                      <option value="">– wählen –</option>
                      {voices.map((v) => <option key={v.id} value={v.id}>{v.name} ({v.labels})</option>)}
                    </select>
                  ) : <input name="voiceId" defaultValue={a?.voiceId} placeholder="Voice-ID (ELEVENLABS_API_KEY setzen für Auswahlliste)" />}
                  <label>Basis-Motion-Prompt (EN)</label>
                  <textarea name="motionPrompt" defaultValue={a?.motionPrompt ?? "UGC selfie video, handheld phone camera, natural lighting, person talking directly to camera, authentic, subtle gestures"} />
                  <div className="row">
                    <label className="chk"><input type="checkbox" name="generate" defaultChecked={!a} />4 Avatar-Bilder mit Higgsfield Soul generieren</label>
                    <button className="p">Avatar speichern</button>
                  </div>
                </form>
                {a && (
                  <>
                    <div className="row">
                      <form action={generateAvatar.bind(null, a.id)}><button disabled={!!a.genRequestId}>{a.genRequestId ? "⏳ generiert…" : "↻ 4 neue Varianten"}</button></form>
                    </div>
                    {cands.length > 0 && (
                      <div className="cands">
                        {cands.map((u) => (
                          <form key={u} action={pickAvatarImage.bind(null, a.id, u)}>
                            <button style={{ padding: 0, border: 0, background: "none" }} title="Als Avatar verwenden">
                              <img src={u} alt="" className={u === a.imageUrl ? "sel" : ""} />
                            </button>
                          </form>
                        ))}
                      </div>
                    )}
                  </>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
}
