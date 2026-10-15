"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";
import { X } from "lucide-react";

// A confirmation may open above the editor; unlock only after both close.
let openDialogs = 0;
let originalOverflow = "";

export function SystemeIntegrationDialog({ title, children, onClose, busy = false, wide = false }: {
  title: string; children: ReactNode; onClose: () => void; busy?: boolean; wide?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    const dialog = ref.current;
    dialog?.showModal();
    if (openDialogs === 0) originalOverflow = document.documentElement.style.overflow;
    openDialogs += 1;
    document.documentElement.style.overflow = "hidden";
    return () => {
      dialog?.close();
      openDialogs -= 1;
      if (openDialogs === 0) document.documentElement.style.overflow = originalOverflow;
    };
  }, []);
  return <dialog ref={ref} aria-labelledby={titleId} onCancel={(event) => { event.preventDefault(); if (!busy) onClose(); }}
    className={`fixed inset-0 m-auto max-h-[92dvh] w-[calc(100%-1rem)] min-w-0 overflow-hidden rounded-lg border border-slate-200 bg-white p-0 text-ink shadow-2xl backdrop:bg-ink/40 ${wide ? "max-w-4xl" : "max-w-lg"}`}>
    <div className="flex max-h-[calc(92dvh-2px)] min-w-0 flex-col">
      <header className="flex shrink-0 items-center justify-between gap-3 border-b border-slate-200 px-4 py-4 sm:px-6">
        <h2 id={titleId} className="min-w-0 break-words text-lg font-semibold">{title}</h2>
        <button type="button" aria-label="Chiudi finestra" title="Chiudi" disabled={busy} onClick={onClose}
          className="flex size-11 shrink-0 items-center justify-center rounded-lg border border-slate-200 text-muted hover:text-ink disabled:opacity-50"><X size={19} /></button>
      </header>
      <div className="min-h-0 min-w-0 overflow-y-auto overscroll-contain px-4 sm:px-6">{children}</div>
    </div>
  </dialog>;
}
