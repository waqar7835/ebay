"use client";

import { useState } from "react";

/** Copy-to-clipboard button for an email address (the address itself stays selectable text). */
export default function CopyEmail({ email }: { email: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      className="copy"
      type="button"
      aria-label={`Copy ${email}`}
      onClick={() =>
        navigator.clipboard
          ?.writeText(email)
          .then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 1600);
          })
          .catch(() => undefined)
      }
    >
      {copied ? "Copied" : "Copy"}
    </button>
  );
}
