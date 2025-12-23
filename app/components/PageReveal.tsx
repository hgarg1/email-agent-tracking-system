"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";

export default function PageReveal({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [revealed, setRevealed] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    setRevealed(false);
    setDismissed(false);
    const revealTimer = setTimeout(() => setRevealed(true), 1800);
    const dismissTimer = setTimeout(() => setDismissed(true), 2700);
    return () => {
      clearTimeout(revealTimer);
      clearTimeout(dismissTimer);
    };
  }, [pathname]);

  return (
    <div className={revealed ? "reveal-root revealed" : "reveal-root sealed"}>
      {!dismissed && (
        <div className="reveal-overlay" aria-hidden="true">
          <div className="envelope">
            <div className="envelope-flap" />
            <div className="envelope-body" />
            <div className="envelope-shadow" />
            <div className="seal" />
          </div>
        </div>
      )}
      <div className="reveal-content show">{children}</div>
    </div>
  );
}
