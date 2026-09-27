import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { activateModalAccessibility, ensureModalFocus } from "./modal-accessibility";

type TestDocument = {
  activeElement: TestElement | null;
  body: { style: { overflow: string } };
  addEventListener: ReturnType<typeof vi.fn>;
  removeEventListener: ReturnType<typeof vi.fn>;
};
let testDocument: TestDocument;
let listeners: Map<string, Set<(event: unknown) => void>>;

class TestElement {
  tabIndex = 0;
  disabled = false;
  visible = true;
  hiddenParent = false;
  preferred = false;
  isConnected = true;
  children: TestElement[] = [];
  focus = vi.fn(() => { testDocument.activeElement = this; });
  contains(element: unknown) { return element === this || this.children.includes(element as TestElement); }
  querySelectorAll() { return this.children; }
  matches() { return this.disabled; }
  closest() { return this.hiddenParent ? this : null; }
  getClientRects() { return this.visible ? [{}] : []; }
  hasAttribute() { return this.preferred; }
}

function fixture() {
  const trigger = new TestElement();
  const panel = new TestElement();
  panel.tabIndex = -1;
  const first = new TestElement();
  const last = new TestElement();
  panel.children = [first, last];
  testDocument.activeElement = trigger;
  return { trigger, panel, first, last, element: panel as unknown as HTMLElement };
}

function dispatchKey(key: string, shiftKey = false) {
  const event = { key, shiftKey, preventDefault: vi.fn(), stopPropagation: vi.fn() };
  for (const listener of listeners.get("keydown") ?? []) listener(event);
  return event;
}

beforeEach(() => {
  listeners = new Map();
  testDocument = {
    activeElement: null,
    body: { style: { overflow: "auto" } },
    addEventListener: vi.fn((type: string, listener: (event: unknown) => void) => {
      if (!listeners.has(type)) listeners.set(type, new Set());
      listeners.get(type)!.add(listener);
    }),
    removeEventListener: vi.fn((type: string, listener: (event: unknown) => void) => {
      listeners.get(type)?.delete(listener);
    }),
  };
  vi.stubGlobal("document", testDocument);
  vi.stubGlobal("HTMLElement", TestElement);
});
afterEach(() => { vi.unstubAllGlobals(); });

describe("modal keyboard access", () => {
  it("focuses the requested field and restores the trigger and page scrolling on close", () => {
    const { trigger, element, last } = fixture();
    last.preferred = true;
    const dispose = activateModalAccessibility(element, { onClose: vi.fn(), isBusy: () => false });
    expect(testDocument.activeElement).toBe(last);
    expect(testDocument.body.style.overflow).toBe("hidden");
    dispose();
    expect(testDocument.activeElement).toBe(trigger);
    expect(testDocument.body.style.overflow).toBe("auto");
    expect(listeners.get("keydown")?.size).toBe(0);
    expect(listeners.get("focusin")?.size).toBe(0);
  });

  it("wraps Tab in both directions and catches focus outside the modal", () => {
    const { element, first, last, trigger } = fixture();
    activateModalAccessibility(element, { onClose: vi.fn(), isBusy: () => false });
    expect(dispatchKey("Tab", true).preventDefault).toHaveBeenCalled();
    expect(testDocument.activeElement).toBe(last);
    expect(dispatchKey("Tab").preventDefault).toHaveBeenCalled();
    expect(testDocument.activeElement).toBe(first);
    testDocument.activeElement = trigger;
    expect(dispatchKey("Tab").preventDefault).toHaveBeenCalled();
    expect(testDocument.activeElement).toBe(first);
    expect(dispatchKey("Tab").preventDefault).not.toHaveBeenCalled();
  });

  it("blocks Escape during persistence and uses the current busy state afterward", () => {
    const { element } = fixture();
    const onClose = vi.fn();
    let busy = true;
    activateModalAccessibility(element, { onClose, isBusy: () => busy });
    const event = dispatchKey("Escape");
    expect(event.preventDefault).toHaveBeenCalled();
    expect(event.stopPropagation).toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
    busy = false;
    dispatchKey("Escape");
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("ignores disabled or hidden controls and holds focus on the panel if all controls are disabled", () => {
    const { panel, element, first, last } = fixture();
    first.disabled = true;
    ensureModalFocus(element);
    expect(testDocument.activeElement).toBe(last);
    last.visible = false;
    testDocument.activeElement = null;
    ensureModalFocus(element);
    expect(testDocument.activeElement).toBe(panel);
    activateModalAccessibility(element, { onClose: vi.fn(), isBusy: () => true });
    expect(dispatchKey("Tab").preventDefault).toHaveBeenCalled();
    expect(testDocument.activeElement).toBe(panel);
  });

  it("returns programmatic outside focus to the modal and leaves removed triggers alone", () => {
    const { element, trigger, first } = fixture();
    const dispose = activateModalAccessibility(element, { onClose: vi.fn(), isBusy: () => false });
    testDocument.activeElement = trigger;
    for (const listener of listeners.get("focusin") ?? []) listener({});
    expect(testDocument.activeElement).toBe(first);
    trigger.isConnected = false;
    dispose();
    expect(trigger.focus).not.toHaveBeenCalled();
  });
});
