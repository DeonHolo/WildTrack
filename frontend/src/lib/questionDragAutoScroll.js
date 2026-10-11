// Native dragover events are sparse; keep scrolling and updating the drop cue
// between events, using the question's scroll ancestor rather than its card.
export function createQuestionDragAutoScroll(question, onScroll) {
  const document = question.ownerDocument;
  const window = document.defaultView;
  const pageScroller = document.scrollingElement || document.documentElement;
  let scroller = question.parentElement;
  while (scroller && scroller !== pageScroller) {
    const overflow = window.getComputedStyle(scroller).overflowY;
    if (/^(auto|scroll|overlay)$/.test(overflow) && scroller.scrollHeight > scroller.clientHeight) break;
    scroller = scroller.parentElement;
  }
  scroller ||= pageScroller;
  let point = null;
  let frameId = null;
  let previousTime = null;

  function stop() {
    if (frameId !== null) window.cancelAnimationFrame(frameId);
    frameId = null;
    previousTime = null;
    point = null;
  }

  function velocity() {
    if (!point) return 0;
    const width = document.documentElement.clientWidth || window.innerWidth;
    const height = document.documentElement.clientHeight || window.innerHeight;
    let top = 0;
    let bottom = height;
    let left = 0;
    let right = width;
    if (scroller !== pageScroller) {
      const bounds = scroller.getBoundingClientRect();
      top = Math.max(0, bounds.top + scroller.clientTop);
      bottom = Math.min(height, bounds.top + scroller.clientTop + scroller.clientHeight);
      left = Math.max(0, bounds.left + scroller.clientLeft);
      right = Math.min(width, bounds.left + scroller.clientLeft + scroller.clientWidth);
    }
    if (point.clientX < left || point.clientX > right || point.clientY < top || point.clientY > bottom) return 0;
    const edge = Math.min(80, (bottom - top) / 4);
    if (edge <= 0) return 0;
    if (point.clientY < top + edge && scroller.scrollTop > 0) {
      return -600 * ((top + edge - point.clientY) / edge) ** 2;
    }
    if (point.clientY > bottom - edge && scroller.scrollTop < scroller.scrollHeight - scroller.clientHeight) {
      return 600 * ((point.clientY - bottom + edge) / edge) ** 2;
    }
    return 0;
  }

  function step(time) {
    frameId = null;
    const speed = velocity();
    if (!speed) { stop(); return; }
    const elapsed = previousTime === null ? 16 : Math.min(32, Math.max(0, time - previousTime));
    previousTime = time;
    const before = scroller.scrollTop;
    scroller.scrollTop = Math.max(0, Math.min(scroller.scrollHeight - scroller.clientHeight, before + speed * elapsed / 1000));
    if (scroller.scrollTop === before) { stop(); return; }
    onScroll(point);
    if (velocity()) frameId = window.requestAnimationFrame(step);
    else stop();
  }

  function update(event) {
    if (!Number.isFinite(event.clientX) || !Number.isFinite(event.clientY)) { stop(); return; }
    point = { clientX: event.clientX, clientY: event.clientY };
    if (!velocity()) { stop(); return; }
    if (frameId === null) frameId = window.requestAnimationFrame(step);
  }

  return { update, stop };
}
