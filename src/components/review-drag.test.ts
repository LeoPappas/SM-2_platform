import { describe, expect, it, vi } from "vitest";
import { dayKeyboardCoordinates } from "./review-drag";

// Three days in a row and a "next week" target below them; each 100x80.
const rects = new Map([
  ["mon", { left: 0, top: 0, width: 100, height: 80 }],
  ["tue", { left: 100, top: 0, width: 100, height: 80 }],
  ["wed", { left: 200, top: 0, width: 100, height: 80 }],
  ["next", { left: 0, top: 120, width: 300, height: 40 }],
]);

function move(code: string, from: { left: number; top: number }) {
  const event = { code, preventDefault: vi.fn() } as unknown as KeyboardEvent;
  const collisionRect = { ...from, width: 40, height: 20, right: from.left + 40, bottom: from.top + 20 };
  const context = {
    collisionRect,
    droppableRects: rects,
    droppableContainers: { getEnabled: () => [...rects.keys()].map(id => ({ id })) },
  };
  return dayKeyboardCoordinates(event, { context, active: "x", currentCoordinates: { x: from.left, y: from.top } } as never);
}

describe("keyboard movement between days", () => {
  it("jumps to the neighbouring day, centred on it", () => {
    // Centred on Monday: (50, 40) minus half of the 40x20 item.
    expect(move("ArrowRight", { left: 30, top: 30 })).toEqual({ x: 130, y: 30 });
    expect(move("ArrowLeft", { left: 130, top: 30 })).toEqual({ x: 30, y: 30 });
  });

  it("reaches the next-week target below the days", () => {
    expect(move("ArrowDown", { left: 130, top: 30 })).toEqual({ x: 130, y: 130 });
  });

  it("stays put when there is no day in that direction", () => {
    expect(move("ArrowLeft", { left: 30, top: 30 })).toBeUndefined();
    expect(move("KeyA", { left: 30, top: 30 })).toBeUndefined();
  });
});
