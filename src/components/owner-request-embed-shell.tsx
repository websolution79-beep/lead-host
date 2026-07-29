"use client";

import { useEffect, useRef, type ReactNode } from "react";

const RESIZE_MESSAGE_TYPE = "leadhost-embed-resize";
const HEIGHT_BUFFER_PX = 2;

export function OwnerRequestEmbedShell({ children }: { children: ReactNode }) {
  const rootRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const root = rootRef.current;

    if (!root) return;

    let animationFrameId = 0;
    let lastHeight = 0;
    let isActive = true;

    const postHeight = () => {
      window.cancelAnimationFrame(animationFrameId);
      animationFrameId = window.requestAnimationFrame(() => {
        if (!isActive) return;

        const height =
          Math.ceil(Math.max(root.scrollHeight, root.getBoundingClientRect().height)) +
          HEIGHT_BUFFER_PX;

        if (!Number.isFinite(height) || height <= 0 || height === lastHeight) return;

        lastHeight = height;

        if (window.parent !== window) {
          window.parent.postMessage(
            {
              type: RESIZE_MESSAGE_TYPE,
              height,
            },
            "*",
          );
        }
      });
    };

    const resizeObserver = new ResizeObserver(postHeight);
    const mutationObserver = new MutationObserver(postHeight);

    resizeObserver.observe(root);
    mutationObserver.observe(root, {
      attributes: true,
      childList: true,
      characterData: true,
      subtree: true,
    });

    window.addEventListener("load", postHeight);
    window.addEventListener("resize", postHeight);
    void document.fonts?.ready.then(postHeight);
    postHeight();

    return () => {
      isActive = false;
      window.cancelAnimationFrame(animationFrameId);
      window.removeEventListener("load", postHeight);
      window.removeEventListener("resize", postHeight);
      resizeObserver.disconnect();
      mutationObserver.disconnect();
    };
  }, []);

  return (
    <main
      ref={rootRef}
      data-leadhost-embed-root
      className="w-full overflow-visible bg-white"
    >
      {children}
    </main>
  );
}
