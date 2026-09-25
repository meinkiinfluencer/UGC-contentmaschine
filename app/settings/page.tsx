import { db } from "@/lib/db";
import { saveAvatar, saveBrand } from "../actions";

export const dynamic = "force-dynamic";

export default async function Settings() {
  const brand = await db.brand.findFirst({ include: { avatars: true } });
  const avatars = brand?.avatars ?? [];
  return (
    <>
      <h1>Marke & Influencer-Avatar</h1>
      <div className="grid2">
        <form className="panel" action={saveBrand}>
          <h2>Branding</h2>
          <input type="hidden" name="id" defaultValue={brand?.id} />
          <label>Markenname</label><input name="name" required defaultValue={brand?.name} />
          <label>Angebot / Beschreibung</label><textarea name="description" required defaultValue={brand?.description} />
          <label>Zielgruppe</label><input name="audience" required defaultValue={brand?.audience} />
          <label>Tonalität</label><input name="tone" required defaultValue={brand?.tone} />
          <label>Standard-CTA</label><input name="cta" required defaultValue={brand?.cta} />
          <label>Basis-Hashtags (kommagetrennt)</label><input name="hashtags" defaultValue={brand?.hashtags} />
          <label>Regeln / Dos & Don'ts</label><textarea name="rules" defaultValue={brand?.rules} />
          <label>Sprache</label><input name="language" defaultValue={brand?.language ?? "de"} />
          <div className="row"><button className="p">Marke speichern</button></div>
        </form>
        <div>
          {[...avatars, null].map((a) => (
            <form className="panel" action={saveAvatar} key={a?.id ?? "new"} style={{ marginBottom: 16 }}>
              <h2>{a ? `Avatar: ${a.name}` : "+ Neuer Avatar"}</h2>
              <input type="hidden" name="id" defaultValue={a?.id} />
              {a?.imageUrl && <img src={a.imageUrl} alt="" style={{ width: 120, borderRadius: 8 }} />}
              <label>Name</label><input name="name" required defaultValue={a?.name} />
              <label>Persona (Charakter, Alter, Story, Sprechstil)</label><textarea name="persona" required defaultValue={a?.persona} />
              <label>Avatar-Bild-URL (öffentlich, 9:16, Gesicht frontal – z.B. aus Higgsfield Soul)</label>
              <input name="imageUrl" required defaultValue={a?.imageUrl} />
              <label>ElevenLabs Voice-ID (feste Stimme)</label><input name="voiceId" required defaultValue={a?.voiceId} />
              <label>Basis-Motion-Prompt (EN)</label>
              <textarea name="motionPrompt" defaultValue={a?.motionPrompt ?? "UGC selfie video, handheld phone camera, natural lighting, person talking directly to camera, authentic, subtle gestures"} />
              <div className="row"><button className="p">Avatar speichern</button></div>
            </form>
          ))}
        </div>
      </div>
    </>
  );
}
