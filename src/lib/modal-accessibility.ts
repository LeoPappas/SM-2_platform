const focusableSelector = "button, a[href], input:not([type='hidden']), select, textarea, [tabindex]";

function focusableElements(panel: HTMLElement) {
  return Array.from(panel.querySelectorAll<HTMLElement>(focusableSelector)).filter(element =>
    element.tabIndex >= 0 && !element.matches(":disabled")
    && !element.closest("[inert], [aria-hidden='true']") && element.getClientRects().length > 0,
  );
}

export function ensureModalFocus(panel: HTMLElement) {
  const focused = document.activeElement;
  if (focused && panel.contains(focused) && !(focused instanceof HTMLElement && focused.matches(":disabled"))) return;
  const elements = focusableElements(panel);
  const preferred = elements.find(element => element.hasAttribute("data-modal-initial-focus"));
  (preferred ?? elements[0] ?? panel).focus({ preventScroll: true });
}

/** Keeps keyboard focus inside the dialog and restores the page focus on close. */
export function activateModalAccessibility(panel: HTMLElement, options: {
  onClose: () => void;
  isBusy: () => boolean;
}) {
  const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  const previousOverflow = document.body.style.overflow;
  document.body.style.overflow = "hidden";
  ensureModalFocus(panel);

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      if (!options.isBusy()) options.onClose();
      return;
    }
    if (event.key !== "Tab") return;
    const elements = focusableElements(panel);
    const first = elements[0] ?? panel;
    const last = elements[elements.length - 1] ?? panel;
    const focused = document.activeElement;
    if (!elements.length || !focused || !elements.includes(focused as HTMLElement)
      || (event.shiftKey && focused === first) || (!event.shiftKey && focused === last)) {
      event.preventDefault();
      (event.shiftKey ? last : first).focus({ preventScroll: true });
    }
  };
  const onFocusIn = () => ensureModalFocus(panel);
  document.addEventListener("keydown", onKeyDown, true);
  document.addEventListener("focusin", onFocusIn);

  return () => {
    document.removeEventListener("keydown", onKeyDown, true);
    document.removeEventListener("focusin", onFocusIn);
    document.body.style.overflow = previousOverflow;
    if (previousFocus?.isConnected) previousFocus.focus({ preventScroll: true });
  };
}
