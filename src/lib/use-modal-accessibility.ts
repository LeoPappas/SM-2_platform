"use client";

import { useEffect, useRef } from "react";
import { activateModalAccessibility, ensureModalFocus } from "./modal-accessibility";

export function useModalAccessibility(onClose: () => void, busy: boolean) {
  const panelRef = useRef<HTMLDivElement>(null);
  const options = useRef({ onClose, busy });
  useEffect(() => { options.current = { onClose, busy }; });
  useEffect(() => {
    if (!panelRef.current) return;
    return activateModalAccessibility(panelRef.current, {
      onClose: () => options.current.onClose(),
      isBusy: () => options.current.busy,
    });
  }, []);
  useEffect(() => { if (panelRef.current) ensureModalFocus(panelRef.current); });
  return panelRef;
}
