/** A point relative to the top-left corner of the scroll container's visible area. */
export interface ViewportPoint {
  readonly x: number;
  readonly y: number;
}

export interface GestureHandlers {
  /** Zoom by a relative factor, keeping the content under `point` in place. */
  readonly zoom: (factor: number, point: ViewportPoint) => void;
  /** Whether a mouse/pen drag should pan the document (pan tool). */
  readonly panEnabled: () => boolean;
  /** Whether a document is shown, so zoom gestures apply. */
  readonly active: () => boolean;
}

/**
 * Zoom and pan gestures on the scroll container, outside Angular templates so that
 * high-frequency events never trigger change detection by themselves:
 * - Ctrl + wheel, and trackpad pinch (reported by browsers as Ctrl + wheel);
 * - two-finger pinch on touch screens (one finger keeps native scrolling);
 * - mouse/pen drag with the pan tool.
 * Zoom steps are batched per animation frame.
 * @returns a function removing every listener
 */
export function attachGestures(host: HTMLElement, handlers: GestureHandlers): () => void {
  let pendingFactor = 1;
  let pendingPoint: ViewportPoint = { x: 0, y: 0 };
  let frame = 0;

  const scheduleZoom = (factor: number, point: ViewportPoint) => {
    pendingFactor *= factor;
    pendingPoint = point;
    if (!frame) {
      frame = requestAnimationFrame(() => {
        frame = 0;
        const total = pendingFactor;
        pendingFactor = 1;
        if (Math.abs(total - 1) > 0.0001) {
          handlers.zoom(total, pendingPoint);
        }
      });
    }
  };

  const toViewport = (clientX: number, clientY: number): ViewportPoint => {
    const rect = host.getBoundingClientRect();
    return { x: clientX - rect.left - host.clientLeft, y: clientY - rect.top - host.clientTop };
  };

  // ---- Ctrl + wheel / trackpad pinch -----------------------------------------------------
  const onWheel = (event: WheelEvent) => {
    if (!event.ctrlKey || !handlers.active()) {
      return;
    }
    event.preventDefault(); // no browser page zoom
    // Lines (Firefox mouse wheels) are ~20x larger than pixels.
    const delta = event.deltaMode === WheelEvent.DOM_DELTA_LINE ? event.deltaY * 20 : event.deltaY;
    scheduleZoom(Math.exp(-delta * 0.002), toViewport(event.clientX, event.clientY));
  };

  // ---- Two-finger pinch ---------------------------------------------------------------------
  let pinchDistance = 0;
  const distance = (touches: TouchList) =>
    Math.hypot(touches[0].clientX - touches[1].clientX, touches[0].clientY - touches[1].clientY);

  const onTouchStart = (event: TouchEvent) => {
    pinchDistance = event.touches.length === 2 && handlers.active() ? distance(event.touches) : 0;
  };
  const onTouchMove = (event: TouchEvent) => {
    if (event.touches.length !== 2 || pinchDistance <= 0) {
      return;
    }
    event.preventDefault(); // no native page zoom
    const current = distance(event.touches);
    const [a, b] = [event.touches[0], event.touches[1]];
    scheduleZoom(
      current / pinchDistance,
      toViewport((a.clientX + b.clientX) / 2, (a.clientY + b.clientY) / 2),
    );
    pinchDistance = current;
  };
  const onTouchEnd = (event: TouchEvent) => {
    if (event.touches.length < 2) {
      pinchDistance = 0;
    }
  };

  // ---- Pan tool -----------------------------------------------------------------------------
  let drag: { pointerId: number; x: number; y: number } | null = null;

  const onPointerDown = (event: PointerEvent) => {
    if (event.pointerType === 'touch' || event.button !== 0 || !handlers.panEnabled()) {
      return;
    }
    event.preventDefault(); // no text selection while dragging
    host.setPointerCapture(event.pointerId);
    host.classList.add('panning');
    drag = { pointerId: event.pointerId, x: event.clientX, y: event.clientY };
  };
  const onPointerMove = (event: PointerEvent) => {
    if (drag?.pointerId !== event.pointerId) {
      return;
    }
    host.scrollBy({
      left: drag.x - event.clientX,
      top: drag.y - event.clientY,
      behavior: 'instant',
    });
    drag = { ...drag, x: event.clientX, y: event.clientY };
  };
  const onPointerEnd = (event: PointerEvent) => {
    if (drag?.pointerId === event.pointerId) {
      drag = null;
      host.classList.remove('panning');
    }
  };

  const listeners: [string, EventListener, AddEventListenerOptions][] = [
    ['wheel', onWheel as EventListener, { passive: false }],
    ['touchstart', onTouchStart as EventListener, { passive: true }],
    ['touchmove', onTouchMove as EventListener, { passive: false }],
    ['touchend', onTouchEnd as EventListener, { passive: true }],
    ['touchcancel', onTouchEnd as EventListener, { passive: true }],
    ['pointerdown', onPointerDown as EventListener, {}],
    ['pointermove', onPointerMove as EventListener, {}],
    ['pointerup', onPointerEnd as EventListener, {}],
    ['pointercancel', onPointerEnd as EventListener, {}],
  ];
  for (const [type, listener, options] of listeners) {
    host.addEventListener(type, listener, options);
  }
  return () => {
    cancelAnimationFrame(frame);
    for (const [type, listener, options] of listeners) {
      host.removeEventListener(type, listener, options);
    }
  };
}
