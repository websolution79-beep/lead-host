"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Clock3 } from "lucide-react";

export function PrimeCountdown({
  expiresAt,
  compact = false,
}: {
  expiresAt: string;
  compact?: boolean;
}) {
  const router = useRouter();
  const targetTime = useMemo(() => new Date(expiresAt).getTime(), [expiresAt]);
  const [remainingMs, setRemainingMs] = useState(() =>
    Math.max(0, targetTime - Date.now()),
  );

  useEffect(() => {
    let refreshed = false;
    const update = () => {
      const remaining = Math.max(0, targetTime - Date.now());
      setRemainingMs(remaining);

      if (remaining === 0 && !refreshed) {
        refreshed = true;
        router.refresh();
      }
    };
    const intervalId = window.setInterval(update, 1000);
    update();

    return () => window.clearInterval(intervalId);
  }, [router, targetTime]);

  const totalSeconds = Math.floor(remainingMs / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const value = [hours, minutes, seconds]
    .map((part) => String(part).padStart(2, "0"))
    .join(":");

  if (compact) {
    return (
      <span className="inline-flex items-center gap-1.5 font-mono text-sm font-bold text-amber-800">
        <Clock3 size={15} aria-hidden="true" />
        {value}
      </span>
    );
  }

  return (
    <div className="rounded-xl border border-amber-300 bg-amber-50 p-4">
      <p className="flex items-center gap-2 text-sm font-semibold text-amber-900">
        <Clock3 size={18} aria-hidden="true" />
        Accesso esclusivo ancora per
      </p>
      <p className="mt-2 font-mono text-3xl font-bold text-amber-950" aria-live="polite">
        {value}
      </p>
    </div>
  );
}
