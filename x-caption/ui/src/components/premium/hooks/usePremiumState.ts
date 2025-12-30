import { useCallback, useEffect, useRef, useState } from "react";
import { callApiMethod } from "../../../lib/pywebview";
import { useAppDispatch, useAppSelector } from "../../../hooks";
import {
  setShowPremiumModal as setShowPremiumModalAction,
  setShowPremiumStatusModal as setShowPremiumStatusModalAction
} from "../../ui/uiSlice";

function getLocalMachineId(): string | null {
  return null;
}

export function usePremiumState(params: {
  notify: (message: string, type?: "info" | "success" | "error") => void;
  isOnline: boolean;
}) {
  const { notify, isOnline } = params;
  const dispatch = useAppDispatch();
  const showPremiumModal = useAppSelector((state) => state.app.showPremiumModal);
  const showPremiumStatusModal = useAppSelector((state) => state.app.showPremiumStatusModal);
  const setShowPremiumModal = useCallback(
    (value: boolean) => {
      dispatch(setShowPremiumModalAction(value));
    },
    [dispatch]
  );
  const setShowPremiumStatusModal = useCallback(
    (value: boolean) => {
      dispatch(setShowPremiumStatusModalAction(value));
    },
    [dispatch]
  );
  const [isPremium, setIsPremium] = useState(false);
  const [premiumStatusLoading, setPremiumStatusLoading] = useState(true);
  const [premiumKeySubmitting, setPremiumKeySubmitting] = useState(false);
  const [premiumDetails, setPremiumDetails] = useState<{
    machineId: string | null;
    activatedAt: string | null;
  } | null>(null);
  const [premiumWebviewStatus, setPremiumWebviewStatus] = useState<"idle" | "loading" | "ready" | "error">(
    "idle"
  );
  const [premiumWebviewError, setPremiumWebviewError] = useState<string | null>(null);
  const [machineId, setMachineId] = useState<string | null>(null);
  const [machineIdLoading, setMachineIdLoading] = useState(false);
  const [machineIdCopied, setMachineIdCopied] = useState(false);
  const [premiumKey, setPremiumKey] = useState("");
  const [premiumIframeKey, setPremiumIframeKey] = useState(0);
  const machineIdCopyTimerRef = useRef<number | null>(null);
  const premiumWebviewRef = useRef<HTMLIFrameElement | null>(null);

  const fetchMachineId = useCallback(async () => {
    const win = typeof window !== "undefined" ? (window as any) : null;
    const api = win?.pywebview?.api;
    if (api) {
      const result = await Promise.resolve(callApiMethod(api, ["get_machine_id", "getMachineId"]));
      if (result && result.success !== false) {
        const id = result.id ?? result.machine_id ?? result.machineId;
        if (typeof id === "string" && id.trim()) {
          return id.trim();
        }
      }
    }
    return getLocalMachineId();
  }, []);

  const refreshPremiumStatus = useCallback(async () => {
    const win = typeof window !== "undefined" ? (window as any) : null;
    const api = win?.pywebview?.api;
    if (!api) {
      setIsPremium(false);
      setPremiumDetails(null);
      setPremiumStatusLoading(false);
      return;
    }
    setPremiumStatusLoading(true);
    try {
      const result = await Promise.resolve(callApiMethod(api, ["get_premium_status", "getPremiumStatus"]));
      if (result && result.success !== false && typeof result.premium === "boolean") {
        setIsPremium(result.premium);
        const license = result.license;
        const machineFromResult =
          typeof result.machine_id === "string" && result.machine_id.trim() ? result.machine_id : null;
        if (machineFromResult) {
          setMachineId(machineFromResult);
        }
        setPremiumDetails({
          machineId:
            (typeof license?.machine_id === "string" && license.machine_id.trim()
              ? license.machine_id
              : machineFromResult) ?? null,
          activatedAt: typeof license?.activated_at === "string" ? license.activated_at : null
        });
      } else {
        setIsPremium(false);
        setPremiumDetails(null);
      }
    } catch {
      setIsPremium(false);
      setPremiumDetails(null);
    } finally {
      setPremiumStatusLoading(false);
    }
  }, []);

  useEffect(() => {
    let active = true;
    const run = () => {
      if (!active) return;
      void refreshPremiumStatus();
    };
    run();
    window.addEventListener("pywebviewready", run as EventListener);
    return () => {
      active = false;
      window.removeEventListener("pywebviewready", run as EventListener);
    };
  }, [refreshPremiumStatus]);

  const handleOpenPremiumModal = useCallback(() => {
    if (isPremium) {
      if (!premiumDetails) {
        void refreshPremiumStatus();
      }
      setShowPremiumStatusModal(true);
      return;
    }
    setShowPremiumModal(true);
  }, [isPremium, premiumDetails, refreshPremiumStatus, setShowPremiumModal, setShowPremiumStatusModal]);

  useEffect(() => {
    if (!showPremiumModal) return undefined;
    let active = true;
    setMachineIdLoading(true);
    setMachineIdCopied(false);
    fetchMachineId()
      .then((id) => {
        if (!active) return;
        setMachineId(id);
      })
      .catch(() => {
        if (!active) return;
        setMachineId(getLocalMachineId());
      })
      .finally(() => {
        if (!active) return;
        setMachineIdLoading(false);
      });
    return () => {
      active = false;
    };
  }, [fetchMachineId, showPremiumModal]);

  useEffect(() => {
    if (!showPremiumStatusModal) return undefined;
    if (!machineId && premiumDetails?.machineId) {
      setMachineId(premiumDetails.machineId);
      setMachineIdLoading(false);
      return undefined;
    }
    if (machineId) return undefined;
    let active = true;
    setMachineIdLoading(true);
    setMachineIdCopied(false);
    fetchMachineId()
      .then((id) => {
        if (!active) return;
        setMachineId(id);
      })
      .catch(() => {
        if (!active) return;
        setMachineId(getLocalMachineId());
      })
      .finally(() => {
        if (!active) return;
        setMachineIdLoading(false);
      });
    return () => {
      active = false;
    };
  }, [fetchMachineId, machineId, premiumDetails, showPremiumStatusModal]);

  useEffect(() => {
    if (!showPremiumModal) {
      setPremiumWebviewStatus("idle");
      setPremiumWebviewError(null);
      return;
    }
    setPremiumWebviewStatus("loading");
    setPremiumWebviewError(null);
  }, [showPremiumModal]);

  useEffect(() => {
    if (!showPremiumModal) return;
    if (!isOnline) {
      setPremiumWebviewStatus("error");
      setPremiumWebviewError("You're offline. Connect to the internet to load Premium.");
    }
  }, [isOnline, showPremiumModal]);

  const handlePremiumWebviewLoad = useCallback(() => {
    const iframe = premiumWebviewRef.current;
    if (iframe) {
      try {
        const bodyText = iframe.contentDocument?.body?.innerText?.trim() ?? "";
        if (
          bodyText.includes("Unable to load the premium content.") ||
          bodyText.includes("Missing url") ||
          bodyText.includes("Invalid url") ||
          bodyText.includes("public base URL")
        ) {
          const firstLine = bodyText.split("\n").find((line) => line.trim())?.trim() ?? bodyText;
          const preview = firstLine.length > 160 ? `${firstLine.slice(0, 160)}…` : firstLine;
          setPremiumWebviewStatus("error");
          setPremiumWebviewError(preview);
          return;
        }
      } catch {
        // Ignore cross-origin or access errors.
      }
    }
    setPremiumWebviewStatus("ready");
  }, []);

  const handlePremiumWebviewError = useCallback(() => {
    setPremiumWebviewStatus("error");
    setPremiumWebviewError("Failed to load webview content.");
  }, []);

  const handlePremiumRetry = useCallback(() => {
    if (!showPremiumModal) return;
    setPremiumWebviewStatus("loading");
    setPremiumWebviewError(null);
    setPremiumIframeKey((prev) => prev + 1);
  }, [showPremiumModal]);

  const handleCopyMachineId = useCallback(async () => {
    if (!machineId || machineIdLoading) return;
    const text = machineId;
    let copied = false;
    try {
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
        copied = true;
      }
    } catch {
      copied = false;
    }
    if (!copied) {
      try {
        const input = document.createElement("textarea");
        input.value = text;
        input.setAttribute("readonly", "true");
        input.style.position = "fixed";
        input.style.opacity = "0";
        document.body.appendChild(input);
        input.select();
        copied = document.execCommand("copy");
        document.body.removeChild(input);
      } catch {
        copied = false;
      }
    }
    if (copied) {
      setMachineIdCopied(true);
      if (machineIdCopyTimerRef.current) {
        window.clearTimeout(machineIdCopyTimerRef.current);
      }
      machineIdCopyTimerRef.current = window.setTimeout(() => {
        setMachineIdCopied(false);
      }, 1600);
    }
  }, [machineId, machineIdLoading]);

  const handleConfirmPremiumKey = useCallback(async () => {
    if (premiumKeySubmitting || isPremium) return;
    const key = premiumKey.trim();
    if (!key) return;
    const win = typeof window !== "undefined" ? (window as any) : null;
    const api = win?.pywebview?.api;
    if (!api) {
      notify("Premium activation is only available in the desktop app.", "error");
      return;
    }
    setPremiumKeySubmitting(true);
    try {
      const result = await Promise.resolve(callApiMethod(api, ["set_premium_key", "setPremiumKey"], key));
      if (result && result.success !== false && result.premium === true) {
        setIsPremium(true);
        const license = result.license;
        setPremiumDetails({
          machineId:
            (typeof license?.machine_id === "string" && license.machine_id.trim()
              ? license.machine_id
              : machineId) ?? null,
          activatedAt: typeof license?.activated_at === "string" ? license.activated_at : null
        });
        setPremiumKey("");
        setShowPremiumModal(false);
        setShowPremiumStatusModal(true);
        notify("Premium activated for this machine.", "success");
        void refreshPremiumStatus();
        return;
      }
      const errorMap: Record<string, string> = {
        crypto_unavailable: "Premium verification is unavailable on this build.",
        public_key_missing: "Premium verification is not configured for this app build.",
        machine_id_missing: "Unable to read machine code.",
        invalid_signature: "Invalid premium key.",
        invalid_key_format: "Invalid premium key."
      };
      const rawError = typeof result?.error === "string" ? result.error.trim() : "";
      const message = rawError ? errorMap[rawError] ?? rawError : "Invalid premium key.";
      notify(message, "error");
    } catch {
      notify("Failed to verify premium key.", "error");
    } finally {
      setPremiumKeySubmitting(false);
    }
  }, [premiumKeySubmitting, isPremium, premiumKey, notify, refreshPremiumStatus, machineId]);

  useEffect(() => {
    return () => {
      if (machineIdCopyTimerRef.current) {
        window.clearTimeout(machineIdCopyTimerRef.current);
        machineIdCopyTimerRef.current = null;
      }
    };
  }, []);

  return {
    showPremiumModal,
    setShowPremiumModal,
    showPremiumStatusModal,
    setShowPremiumStatusModal,
    isPremium,
    premiumStatusLoading,
    premiumDetails,
    premiumWebviewStatus,
    premiumWebviewError,
    machineId,
    machineIdLoading,
    machineIdCopied,
    premiumKey,
    setPremiumKey,
    premiumKeySubmitting,
    premiumIframeKey,
    premiumWebviewRef,
    fetchMachineId,
    refreshPremiumStatus,
    handleOpenPremiumModal,
    handlePremiumWebviewLoad,
    handlePremiumWebviewError,
    handlePremiumRetry,
    handleCopyMachineId,
    handleConfirmPremiumKey
  };
}
