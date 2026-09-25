import { db } from "../src/lib/db";

async function main() {
  if (await db.brand.count()) return console.log("Seed übersprungen – Marken existieren");
  const brand = await db.brand.create({
    data: {
      name: "Demo-Marke",
      description: "Beschreibe hier Produkt/Dienstleistung",
      tone: "locker, ehrlich, du-Form, energiegeladen",
      audience: "Selbstständige & KMU in DACH, 25–45",
      cta: "Folg mir für mehr & schreib 'INFO' in die Kommentare",
      hashtags: "ugc,tipps,business",
      niche: "Social Media Marketing für lokale Unternehmen",
      postSlots: "18:00",
    },
  });
  await db.avatar.create({
    data: {
      brandId: brand.id,
      name: "Lena",
      persona: "28, Marketing-Nerd aus Berlin, ehrlich, humorvoll, erklärt komplexe Dinge einfach",
      look: "28 year old german woman, shoulder length brown hair, light freckles, casual beige hoodie",
      imageUrl: "https://example.com/avatar.jpg",
      voiceId: "ELEVENLABS_VOICE_ID",
    },
  });
  console.log("Seed: Demo-Marke + Avatar angelegt → unter /brands anpassen");
}
main().finally(() => db.$disconnect());
