"use client";

import { useEffect, useRef, useCallback } from "react";

declare global {
  interface Window {
    turnstile: {
      render: (
        container: HTMLElement,
        options: {
          sitekey: string;
          callback: (token: string) => void;
          "expired-callback"?: () => void;
          "error-callback"?: () => void;
          theme?: "light" | "dark" | "auto";
          size?: "normal" | "compact";
        }
      ) => string;
      reset: (widgetId: string) => void;
      remove: (widgetId: string) => void;
    };
    onTurnstileLoad?: () => void;
  }
}

interface TurnstileProps {
  siteKey: string;
  onVerify: (token: string) => void;
  onExpire?: () => void;
  onError?: () => void;
  theme?: "light" | "dark" | "auto";
  size?: "normal" | "compact";
  className?: string;
}

export default function Turnstile({
  siteKey,
  onVerify,
  onExpire,
  onError,
  theme = "dark",
  size = "normal",
  className = "",
}: TurnstileProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const widgetIdRef = useRef<string | null>(null);
  const isRenderedRef = useRef(false);

  const renderWidget = useCallback(() => {
    if (
      !containerRef.current ||
      !window.turnstile ||
      isRenderedRef.current
    ) {
      return;
    }

    isRenderedRef.current = true;
    widgetIdRef.current = window.turnstile.render(containerRef.current, {
      sitekey: siteKey,
      callback: onVerify,
      "expired-callback": onExpire,
      "error-callback": onError,
      theme,
      size,
    });
  }, [siteKey, onVerify, onExpire, onError, theme, size]);

  useEffect(() => {
    // Check if script is already loaded
    const existingScript = document.querySelector(
      'script[src*="turnstile"]'
    );

    if (existingScript) {
      // Script exists, check if turnstile is ready
      if (window.turnstile) {
        renderWidget();
      } else {
        // Wait for it to load
        window.onTurnstileLoad = renderWidget;
      }
      return;
    }

    // Load the Turnstile script
    const script = document.createElement("script");
    script.src =
      "https://challenges.cloudflare.com/turnstile/v0/api.js?onload=onTurnstileLoad";
    script.async = true;
    script.defer = true;

    window.onTurnstileLoad = renderWidget;

    document.head.appendChild(script);

    return () => {
      if (widgetIdRef.current && window.turnstile) {
        window.turnstile.remove(widgetIdRef.current);
      }
      isRenderedRef.current = false;
    };
  }, [renderWidget]);

  return <div ref={containerRef} className={className} />;
}

export function resetTurnstile(widgetId: string) {
  if (window.turnstile && widgetId) {
    window.turnstile.reset(widgetId);
  }
}
