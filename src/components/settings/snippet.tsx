'use client';

import { useState } from 'react';

export function CodeBlock({ code, label }: { code: string; label: string }) {
  const [copied, setCopied] = useState(false);

  return (
    <div className="overflow-hidden rounded-xl border border-line bg-ink">
      <div className="flex items-center justify-between border-b border-cream/10 px-4 py-2">
        <p className="text-micro font-semibold uppercase tracking-[0.09em] text-cream/50">{label}</p>
        <button
          type="button"
          className="rounded-full px-3 py-1 text-xs font-semibold text-cream/70 transition-colors hover:bg-cream/10 hover:text-cream"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(code);
              setCopied(true);
              setTimeout(() => setCopied(false), 2000);
            } catch {
              setCopied(false);
            }
          }}
        >
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      <pre className="overflow-x-auto px-4 py-4 text-xs leading-relaxed text-cream/90">
        <code>{code}</code>
      </pre>
    </div>
  );
}
