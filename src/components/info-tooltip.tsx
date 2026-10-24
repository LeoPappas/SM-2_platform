"use client";

import { useEffect, useId, useRef, useState } from "react";

/**
 * Details shown while the trigger is hovered or focused. A click (or a tap on
 * the phone) keeps them open until the next click, a click outside or Escape.
 */
export function InfoTooltip({ content, children, className = "" }: {
  content: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  const id = useId();
  const root = useRef<HTMLSpanElement>(null);
  const [hovered, setHovered] = useState(false);
  const [pinned, setPinned] = useState(false);
  const open = hovered || pinned;

  useEffect(() => {
    if (!open) return;
    const close = () => { setHovered(false); setPinned(false); };
    const closeOutside = (event: PointerEvent) => { if (!root.current?.contains(event.target as Node)) close(); };
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === "Escape") close(); };
    document.addEventListener("pointerdown", closeOutside);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOutside);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]);

  return (
    <span ref={root} className="relative inline-flex min-w-0 max-w-full" onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)}>
      <button
        type="button"
        aria-describedby={open ? id : undefined}
        aria-expanded={open}
        onFocus={() => setHovered(true)}
        onBlur={() => setHovered(false)}
        onClick={() => {
          if (pinned) setHovered(false);
          setPinned(!pinned);
        }}
        className={`min-w-0 max-w-full cursor-help text-left underline decoration-gray-300 decoration-dotted underline-offset-4 hover:decoration-gray-500 ${className}`}
      >
        {children}
      </button>
      {open && (
        <span role="tooltip" id={id} className="absolute left-0 top-full z-20 mt-1.5 w-max max-w-xs rounded-md bg-gray-900 px-3 py-2 text-xs font-normal leading-5 text-white shadow-lg">
          {content}
        </span>
      )}
    </span>
  );
}
