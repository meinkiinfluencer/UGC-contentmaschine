import { db } from "../src/lib/db";

async function main() {
  if (await db.brand.count()) return console.log("Seed übersprungen – Marke existiert");
  const brand = await db.brand.create({
    data: {
      name: "Meine Marke",
      description: "Beschreibe hier Produkt/Dienstleistung",
      tone: "locker, ehrlich, du-Form, energiegeladen",
      audience: "Selbstständige & KMU in DACH, 25–45",
      cta: "Folg mir für mehr & schreib 'INFO' in die Kommentare",
      hashtags: "ugc,tipps,business",
      rules: "Keine Preisangaben, keine Konkurrenz nennen",
    },
  });
  await db.avatar.create({
    data: {
      name: "Lena",
      persona: "28, Marketing-Nerd aus Berlin, ehrlich, humorvoll, erklärt komplexe Dinge einfach",
      imageUrl: "https://example.com/avatar.jpg",
      voiceId: "ELEVENLABS_VOICE_ID",
      brandId: brand.id,
    },
  });
  console.log("Seed: Marke + Avatar angelegt → in /settings anpassen");
}
main().finally(() => db.$disconnect());
