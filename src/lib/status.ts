// Content-Statusmaschine
// SCRIPT_REVIEW --approve--> SCRIPT_APPROVED --worker--> VOICING --> RENDERING --> VIDEO_REVIEW
// VIDEO_REVIEW --approve--> VIDEO_APPROVED --worker--> PUBLISHING --> SCHEDULED
// jederzeit: REJECTED | FAILED (retry -> letzter sinnvoller Schritt)
export const STAGES = [
  { key: "SCRIPT_REVIEW", label: "Script prüfen", gate: true },
  { key: "SCRIPT_APPROVED", label: "In Produktion", gate: false },
  { key: "VOICING", label: "Voiceover", gate: false },
  { key: "RENDERING", label: "Video rendert", gate: false },
  { key: "VIDEO_REVIEW", label: "Video prüfen", gate: true },
  { key: "VIDEO_APPROVED", label: "Wird geplant", gate: false },
  { key: "PUBLISHING", label: "Wird geplant", gate: false },
  { key: "SCHEDULED", label: "Geplant", gate: false },
  { key: "FAILED", label: "Fehler", gate: false },
  { key: "REJECTED", label: "Abgelehnt", gate: false },
] as const;

export type Status = (typeof STAGES)[number]["key"];

export const BOARD: { title: string; statuses: Status[] }[] = [
  { title: "1 · Script-Freigabe", statuses: ["SCRIPT_REVIEW"] },
  { title: "2 · Produktion", statuses: ["SCRIPT_APPROVED", "VOICING", "RENDERING"] },
  { title: "3 · Video-Freigabe", statuses: ["VIDEO_REVIEW"] },
  { title: "4 · Geplant", statuses: ["VIDEO_APPROVED", "PUBLISHING", "SCHEDULED"] },
  { title: "Fehler / Abgelehnt", statuses: ["FAILED", "REJECTED"] },
];

export const label = (s: string) => STAGES.find((x) => x.key === s)?.label ?? s;
