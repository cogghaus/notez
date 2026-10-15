/**
 * Put a scroller back at `y` once it can actually reach it. A list that was unmounted and comes
 * back (Tasks, Notes after another tab) fills in after its data loads, so a plain assignment would
 * be clamped to 0. Retries on DOM changes for up to `timeoutMs`, and stops as soon as the user
 * touches the list. Returns a cancel function.
 */
export function restoreScroll(el: HTMLElement, y: number, timeoutMs = 2000): () => void {
  const reachable = () => el.scrollHeight - el.clientHeight >= y;
  if (reachable()) {
    el.scrollTop = y;
    return () => {};
  }

  const stop = () => {
    observer.disconnect();
    clearTimeout(timer);
    el.removeEventListener('pointerdown', stop);
    el.removeEventListener('wheel', stop);
    el.removeEventListener('keydown', stop);
  };
  const observer = new MutationObserver(() => {
    if (!reachable()) return;
    el.scrollTop = y;
    stop();
  });
  observer.observe(el, { childList: true, subtree: true });
  const timer = setTimeout(stop, timeoutMs);
  el.addEventListener('pointerdown', stop);
  el.addEventListener('wheel', stop);
  el.addEventListener('keydown', stop); // arrows, PageDown, Space scroll too
  return stop;
}
