"use client";

import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  closestCenter,
  pointerWithin,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type Announcements,
  type CollisionDetection,
  type DragEndEvent,
  type DragStartEvent,
  type KeyboardCoordinateGetter,
} from "@dnd-kit/core";
import { useState } from "react";

/** What travels with a dragged review. */
export type DraggedReview = { blockId: string; title: string; date?: string | null };
/** What a drop target offers: the day the review moves to. */
export type ReviewDropTarget = { date: string; label: string };

const arrowDirections: Record<string, readonly [number, number]> = {
  ArrowRight: [1, 0],
  ArrowLeft: [-1, 0],
  ArrowDown: [0, 1],
  ArrowUp: [0, -1],
};

/** Arrow keys jump to the nearest day in that direction instead of moving a few pixels. */
export const dayKeyboardCoordinates: KeyboardCoordinateGetter = (event, { context }) => {
  const direction = arrowDirections[event.code];
  const { collisionRect, droppableRects, droppableContainers } = context;
  if (!direction || !collisionRect) return undefined;
  event.preventDefault();
  const fromX = collisionRect.left + collisionRect.width / 2;
  const fromY = collisionRect.top + collisionRect.height / 2;
  let target: { x: number; y: number } | undefined;
  let bestScore = Infinity;
  for (const container of droppableContainers.getEnabled()) {
    const rect = droppableRects.get(container.id);
    if (!rect) continue;
    const dx = rect.left + rect.width / 2 - fromX;
    const dy = rect.top + rect.height / 2 - fromY;
    const along = dx * direction[0] + dy * direction[1];
    if (along <= 1) continue;
    const score = along + 2 * Math.abs(dx * direction[1] + dy * direction[0]);
    if (score < bestScore) {
      bestScore = score;
      // Centre the dragged item on the day so closestCenter picks exactly that day.
      target = {
        x: rect.left + rect.width / 2 - collisionRect.width / 2,
        y: rect.top + rect.height / 2 - collisionRect.height / 2,
      };
    }
  }
  return target;
};

/** The pointer decides while dragging with mouse or touch; the keyboard uses the centred item. */
const reviewCollision: CollisionDetection = args => {
  if (args.pointerCoordinates) return pointerWithin(args);
  return closestCenter(args);
};

const titleOf = (data: unknown) => (data as DraggedReview | undefined)?.title ?? "Revisão";
const labelOf = (data: unknown) => (data as ReviewDropTarget | undefined)?.label ?? "um dia";

const announcements: Announcements = {
  onDragStart: ({ active }) => `Movendo ${titleOf(active.data.current)}.`,
  onDragOver: ({ active, over }) => over
    ? `${titleOf(active.data.current)} sobre ${labelOf(over.data.current)}.`
    : `${titleOf(active.data.current)} fora de um dia disponível.`,
  onDragEnd: ({ active, over }) => over
    ? `${titleOf(active.data.current)} solta em ${labelOf(over.data.current)}.`
    : `${titleOf(active.data.current)} não foi movida.`,
  onDragCancel: ({ active }) => `Movimento de ${titleOf(active.data.current)} cancelado.`,
};

const screenReaderInstructions = {
  draggable: "Para mover uma revisão, pressione Espaço ou Enter, use as setas para escolher o dia e pressione Espaço ou Enter para soltar. Esc cancela.",
};

/**
 * Drag context for reviews. Mouse drags start after a few pixels, touch after a
 * short hold (so the page still scrolls) and the keyboard with Space or Enter.
 * `keyboard={false}` leaves Enter to the item's own click action.
 */
export function ReviewDragContext({
  onMove,
  keyboard = true,
  children,
}: {
  onMove: (review: DraggedReview, target: ReviewDropTarget) => void;
  keyboard?: boolean;
  children: React.ReactNode;
}) {
  const [active, setActive] = useState<DraggedReview | null>(null);
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 4 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 6 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: dayKeyboardCoordinates,
      keyboardCodes: keyboard
        ? { start: ["Space", "Enter"], cancel: ["Escape"], end: ["Space", "Enter"] }
        : { start: [], cancel: ["Escape"], end: [] },
    }),
  );
  const start = (event: DragStartEvent) => setActive((event.active.data.current as DraggedReview) ?? null);
  const end = (event: DragEndEvent) => {
    setActive(null);
    const review = event.active.data.current as DraggedReview | undefined;
    const target = event.over?.data.current as ReviewDropTarget | undefined;
    if (review && target && target.date !== review.date) onMove(review, target);
  };
  return (
    <DndContext
      sensors={sensors}
      collisionDetection={reviewCollision}
      accessibility={{ announcements, screenReaderInstructions }}
      onDragStart={start}
      onDragEnd={end}
      onDragCancel={() => setActive(null)}
    >
      {children}
      <DragOverlay dropAnimation={null}>
        {active && <div className="w-36 truncate rounded-md border border-blue-300 bg-white px-2 py-1 text-xs font-semibold text-gray-800 shadow-lg">{active.title}</div>}
      </DragOverlay>
    </DndContext>
  );
}

/** A focusable element that picks up a review. */
export function ReviewDragHandle({
  id,
  review,
  disabled = false,
  label,
  title,
  className = "",
  onClick,
  children,
}: {
  id: string;
  review: DraggedReview;
  disabled?: boolean;
  label?: string;
  title?: string;
  className?: string;
  onClick?: () => void;
  children: React.ReactNode;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id,
    data: review,
    disabled,
    attributes: { roleDescription: "revisão arrastável" },
  });
  return (
    <button
      type="button"
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      onClick={onClick}
      aria-label={label}
      title={title}
      className={`touch-manipulation ${disabled ? "" : "cursor-grab"} ${isDragging ? "opacity-40" : ""} ${className}`}
    >
      {children}
    </button>
  );
}

/** A day (or any target date) that accepts a dropped review. */
export function useReviewDropTarget(id: string, target: ReviewDropTarget, disabled: boolean) {
  return useDroppable({ id, data: target, disabled });
}
