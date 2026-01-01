"use client";

import { useState, FormEvent } from "react";
import { useTranslations } from "next-intl";
import Turnstile from "@/components/Turnstile";

export default function ContactForm() {
  const t = useTranslations("contactPage");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitStatus, setSubmitStatus] = useState<{
    type: "success" | "error" | null;
    message: string;
  }>({ type: null, message: "" });

  // Turnstile state
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const [turnstileError, setTurnstileError] = useState(false);

  const handleTurnstileVerify = (token: string) => {
    setTurnstileToken(token);
    setTurnstileError(false);
  };

  const handleTurnstileExpire = () => {
    setTurnstileToken(null);
  };

  const handleTurnstileError = () => {
    setTurnstileError(true);
    setTurnstileToken(null);
  };

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    // Verify turnstile token exists
    if (!turnstileToken) {
      setTurnstileError(true);
      return;
    }

    setIsSubmitting(true);
    setSubmitStatus({ type: null, message: "" });

    const formData = new FormData(e.currentTarget);
    const data = {
      name: formData.get("name") as string,
      email: formData.get("email") as string,
      message: formData.get("message") as string,
      turnstileToken,
    };

    try {
      const response = await fetch("/api/contact", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(data),
      });

      const result = await response.json();

      if (response.ok) {
        setSubmitStatus({
          type: "success",
          message: t("successMessage") || "Message sent successfully! We'll get back to you soon.",
        });
        (e.target as HTMLFormElement).reset();
        setTurnstileToken(null);
      } else {
        setSubmitStatus({
          type: "error",
          message: result.error || "Failed to send message. Please try again.",
        });
      }
    } catch {
      setSubmitStatus({
        type: "error",
        message: "Failed to send message. Please try again.",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY || "";

  return (
    <form className="space-y-6" onSubmit={handleSubmit}>
      <div className="space-y-2">
        <label className="text-xs uppercase tracking-[0.3em] text-x-soft">
          {t("fieldName")}
        </label>
        <input
          className="w-full border-b border-x-line/60 bg-transparent pb-3 text-base text-x-text transition focus:border-x-accent focus:outline-none"
          name="name"
          placeholder={t("fieldNamePlaceholder")}
          required
          disabled={isSubmitting}
        />
      </div>
      <div className="space-y-2">
        <label className="text-xs uppercase tracking-[0.3em] text-x-soft">
          {t("fieldEmail")}
        </label>
        <input
          className="w-full border-b border-x-line/60 bg-transparent pb-3 text-base text-x-text transition focus:border-x-accent focus:outline-none"
          name="email"
          type="email"
          placeholder={t("fieldEmailPlaceholder")}
          required
          disabled={isSubmitting}
        />
      </div>
      <div className="space-y-2">
        <label className="text-xs uppercase tracking-[0.3em] text-x-soft">
          {t("fieldMessage")}
        </label>
        <textarea
          className="min-h-[80px] w-full resize-none border-b border-x-line/60 bg-transparent pb-3 text-base text-x-text transition focus:border-x-accent focus:outline-none"
          name="message"
          placeholder={t("fieldMessagePlaceholder")}
          rows={2}
          required
          disabled={isSubmitting}
        />
      </div>

      {submitStatus.type && (
        <div
          className={`rounded-xl border p-4 ${
            submitStatus.type === "success"
              ? "border-x-accent/30 bg-x-accent/5"
              : "border-red-400/30 bg-red-400/5"
          }`}
        >
          <div className="flex items-start gap-3">
            <div
              className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full ${
                submitStatus.type === "success"
                  ? "bg-x-accent/20"
                  : "bg-red-400/20"
              }`}
            >
              {submitStatus.type === "success" ? (
                <svg
                  className="h-3 w-3 text-x-accent"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2.5}
                    d="M5 13l4 4L19 7"
                  />
                </svg>
              ) : (
                <svg
                  className="h-3 w-3 text-red-400"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2.5}
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
              )}
            </div>
            <p
              className={`text-sm ${
                submitStatus.type === "success" ? "text-x-text" : "text-x-text"
              }`}
            >
              {submitStatus.message}
            </p>
          </div>
        </div>
      )}

      <div className="flex flex-col gap-4 pt-2 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-2">
          <label className="text-xs uppercase tracking-[0.3em] text-x-soft">
            {t("captchaLabel")} *
          </label>
          {siteKey ? (
            <Turnstile
              siteKey={siteKey}
              onVerify={handleTurnstileVerify}
              onExpire={handleTurnstileExpire}
              onError={handleTurnstileError}
              theme="dark"
            />
          ) : (
            <div className="rounded-lg border border-x-line bg-x-surface px-4 py-3 text-sm text-x-muted">
              Captcha not configured
            </div>
          )}
          {turnstileError && (
            <p className="text-xs text-red-400">
              {t("captchaError") || "Please complete the verification."}
            </p>
          )}
        </div>
        <button
          className="btn-primary disabled:cursor-not-allowed disabled:opacity-50"
          type="submit"
          disabled={isSubmitting || !turnstileToken}
        >
          {isSubmitting ? t("submitting") || "Sending..." : t("submit")}
        </button>
      </div>
    </form>
  );
}
