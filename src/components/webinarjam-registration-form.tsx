"use client";

import { useEffect, useRef, useState } from "react";

const WEBINAR_HASH = "4o8ymvh5";
const WEBINAR_FORM_SRC =
  "https://event.webinarjam.com/register/4o8ymvh5/embed-form?formButtonText=Iscriviti%20Gratis&formAccentColor=%2329b6f6&formAccentOpacity=0.95&formBgColor=%23ffffff&formBgOpacity=1";

export function WebinarJamRegistrationForm() {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const [loadFailed, setLoadFailed] = useState(false);

  useEffect(() => {
    const wrapper = wrapperRef.current;
    if (!wrapper) return;

    wrapper.replaceChildren();
    setLoadFailed(false);

    const script = document.createElement("script");
    script.src = WEBINAR_FORM_SRC;
    script.async = true;
    script.onerror = () => setLoadFailed(true);
    wrapper.appendChild(script);

    return () => {
      wrapper.replaceChildren();
    };
  }, []);

  return (
    <div className="mt-5">
      <div
        className="wj-embed-wrapper min-h-52 w-full overflow-hidden [&_iframe]:max-w-full"
        data-webinar-hash={WEBINAR_HASH}
        ref={wrapperRef}
      />
      {loadFailed ? (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-700" role="alert">
          Non siamo riusciti a caricare il modulo. Aggiorna la pagina e riprova.
        </div>
      ) : null}
    </div>
  );
}
