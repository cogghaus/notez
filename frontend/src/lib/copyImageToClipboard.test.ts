import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { copyImageToClipboard } from './copyImageToClipboard';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeBlob(type = 'image/png'): Blob {
  return new Blob(['fake-image-data'], { type });
}

function mockFetch(blob: Blob, ok = true) {
  return vi.fn().mockResolvedValue({
    ok,
    blob: vi.fn().mockResolvedValue(blob),
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('copyImageToClipboard', () => {
  let originalFetch: typeof globalThis.fetch;
  let originalClipboard: Clipboard;
  let originalClipboardItem: typeof ClipboardItem;
  let clipboardWriteMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
    originalClipboard = navigator.clipboard;
    originalClipboardItem = globalThis.ClipboardItem;

    clipboardWriteMock = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      value: { write: clipboardWriteMock },
      configurable: true,
      writable: true,
    });

    // ClipboardItem must exist for the unsupported check to pass
    globalThis.ClipboardItem = class MockClipboardItem {
      constructor(public data: Record<string, Blob>) {}
    } as unknown as typeof ClipboardItem;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    Object.defineProperty(navigator, 'clipboard', {
      value: originalClipboard,
      configurable: true,
      writable: true,
    });
    globalThis.ClipboardItem = originalClipboardItem;
    vi.restoreAllMocks();
  });

  it('returns ok:true when fetch and clipboard both succeed', async () => {
    globalThis.fetch = mockFetch(makeBlob('image/png'));
    const result = await copyImageToClipboard('https://example.com/img.png');
    expect(result).toEqual({ ok: true });
    expect(clipboardWriteMock).toHaveBeenCalledOnce();
  });

  it('passes correct mime type to ClipboardItem', async () => {
    const blob = makeBlob('image/jpeg');
    globalThis.fetch = mockFetch(blob);

    const items: ClipboardItem[] = [];
    clipboardWriteMock.mockImplementation((i: ClipboardItem[]) => {
      items.push(...i);
      return Promise.resolve();
    });

    await copyImageToClipboard('https://example.com/img.jpg');
    expect(items).toHaveLength(1);
    // The MockClipboardItem stores data on `.data`
    const item = items[0] as unknown as { data: Record<string, Blob> };
    expect(Object.keys(item.data)).toEqual(['image/jpeg']);
    expect(item.data['image/jpeg']).toBe(blob);
  });

  it('returns ok:false reason:unsupported when ClipboardItem is undefined', async () => {
    globalThis.ClipboardItem = undefined as unknown as typeof ClipboardItem;
    globalThis.fetch = mockFetch(makeBlob());

    const result = await copyImageToClipboard('https://example.com/img.png');
    expect(result).toEqual({ ok: false, reason: 'unsupported' });
    expect(clipboardWriteMock).not.toHaveBeenCalled();
  });

  it('returns ok:false reason:unsupported when clipboard.write is missing', async () => {
    Object.defineProperty(navigator, 'clipboard', {
      value: {},
      configurable: true,
      writable: true,
    });
    globalThis.fetch = mockFetch(makeBlob());

    const result = await copyImageToClipboard('https://example.com/img.png');
    expect(result).toEqual({ ok: false, reason: 'unsupported' });
  });

  it('returns ok:false reason:fetch-failed when fetch throws', async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('network error'));
    const result = await copyImageToClipboard('https://example.com/img.png');
    expect(result).toEqual({ ok: false, reason: 'fetch-failed' });
  });

  it('returns ok:false reason:fetch-failed when response is not ok', async () => {
    globalThis.fetch = mockFetch(makeBlob(), false);
    const result = await copyImageToClipboard('https://example.com/img.png');
    expect(result).toEqual({ ok: false, reason: 'fetch-failed' });
  });

  it('returns ok:false reason:clipboard-failed when clipboard.write rejects', async () => {
    globalThis.fetch = mockFetch(makeBlob());
    clipboardWriteMock.mockRejectedValue(new DOMException('Permission denied', 'NotAllowedError'));

    const result = await copyImageToClipboard('https://example.com/img.png');
    expect(result).toEqual({ ok: false, reason: 'clipboard-failed' });
  });

  it('falls back to image/png when blob has no mime type', async () => {
    const emptyTypeBlob = new Blob(['data'], { type: '' });
    globalThis.fetch = mockFetch(emptyTypeBlob);

    const items: ClipboardItem[] = [];
    clipboardWriteMock.mockImplementation((i: ClipboardItem[]) => {
      items.push(...i);
      return Promise.resolve();
    });

    const result = await copyImageToClipboard('https://example.com/img');
    expect(result).toEqual({ ok: true });
    const item = items[0] as unknown as { data: Record<string, Blob> };
    expect(Object.keys(item.data)).toEqual(['image/png']);
  });
});
