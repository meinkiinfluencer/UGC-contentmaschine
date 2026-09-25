"use client";
import { useState } from "react";

export default function CopyButton({ text, label = "📋 Kopieren" }: { text: string; label?: string }) {
  const [ok, setOk] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        await navigator.clipboard.writeText(text);
        setOk(true);
        setTimeout(() => setOk(false), 1500);
      }}
    >
      {ok ? "✓ Kopiert" : label}
    </button>
  );
}
