// SCRIPT_REVIEW --approve--> SCRIPT_APPROVED --worker--> VOICING --> RENDERING --> COMPOSING --> VIDEO_REVIEW
// VIDEO_REVIEW --approve--> READY --manuell gepostet--> POSTED      (publishMode=manual, Standard)
// VIDEO_REVIEW --approve--> VIDEO_APPROVED --worker--> PUBLISHING --> SCHEDULED   (publishMode=ayrshare)
// jederzeit: REJECTED | FAILED (3 Auto-Retries)
export const LABELS: Record<string, string> = {
  SCRIPT_REVIEW: "Script prüfen",
  SCRIPT_APPROVED: "In Warteschlange",
  VOICING: "Voiceover + Jobs",
  RENDERING: "Clips rendern",
  COMPOSING: "Schnitt",
  VIDEO_REVIEW: "Video prüfen",
  VIDEO_APPROVED: "Wird geplant",
  PUBLISHING: "Wird geplant",
  SCHEDULED: "Geplant (Auto)",
  READY: "Fertig zum Posten",
  POSTED: "Gepostet",
  FAILED: "Fehler",
  REJECTED: "Abgelehnt",
};

export const BOARD: { title: string; statuses: string[] }[] = [
  { title: "1 · Script-Freigabe", statuses: ["SCRIPT_REVIEW"] },
  { title: "2 · Produktion", statuses: ["SCRIPT_APPROVED", "VOICING", "RENDERING", "COMPOSING"] },
  { title: "3 · Video-Freigabe", statuses: ["VIDEO_REVIEW"] },
  { title: "4 · Fertig zum Posten", statuses: ["READY", "VIDEO_APPROVED", "PUBLISHING"] },
  { title: "5 · Gepostet", statuses: ["POSTED", "SCHEDULED"] },
  { title: "Fehler / Abgelehnt", statuses: ["FAILED", "REJECTED"] },
];

export const label = (s: string) => LABELS[s] ?? s;
