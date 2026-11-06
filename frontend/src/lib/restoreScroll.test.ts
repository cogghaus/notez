import { describe, it, expect, vi, afterEach } from 'vitest';
import { restoreScroll } from './restoreScroll';

/** jsdom has no layout: give the element a controllable scrollable height. */
function scroller(initial: { scrollHeight: number; clientHeight: number }) {
  const el = document.createElement('div');
  const dims = { ...initial };
  Object.defineProperty(el, 'scrollHeight', { get: () => dims.scrollHeight });
  Object.defineProperty(el, 'clientHeight', { get: () => dims.clientHeight });
  document.body.appendChild(el);
  return { el, dims };
}

afterEach(() => {
  vi.useRealTimers();
  document.body.innerHTML = '';
});

describe('restoreScroll', () => {
  it('sets the position at once when the content is tall enough', () => {
    const { el } = scroller({ scrollHeight: 2000, clientHeight: 500 });
    restoreScroll(el, 800);
    expect(el.scrollTop).toBe(800);
  });

  it('waits for content that arrives later (a list that is still loading)', async () => {
    const { el, dims } = scroller({ scrollHeight: 500, clientHeight: 500 });
    restoreScroll(el, 800);
    expect(el.scrollTop).toBe(0);
    dims.scrollHeight = 2000;
    el.appendChild(document.createElement('p'));
    await Promise.resolve();
    await new Promise((r) => setTimeout(r, 0));
    expect(el.scrollTop).toBe(800);
  });

  it.each([['pointerdown'], ['keydown'], ['wheel']])('stops waiting once the user acts (%s)', async (type) => {
    const { el, dims } = scroller({ scrollHeight: 500, clientHeight: 500 });
    restoreScroll(el, 800);
    el.dispatchEvent(new Event(type, { bubbles: true }));
    dims.scrollHeight = 2000;
    el.appendChild(document.createElement('p'));
    await new Promise((r) => setTimeout(r, 0));
    expect(el.scrollTop).toBe(0);
  });

  it('gives up after the timeout and can be cancelled', () => {
    vi.useFakeTimers();
    const { el, dims } = scroller({ scrollHeight: 500, clientHeight: 500 });
    const cancel = restoreScroll(el, 800, 1000);
    vi.advanceTimersByTime(1500);
    dims.scrollHeight = 2000;
    el.appendChild(document.createElement('p'));
    expect(el.scrollTop).toBe(0);
    cancel();
  });
});
