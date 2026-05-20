export type CopyImageResult =
  | { ok: true }
  | { ok: false; reason: 'unsupported' | 'fetch-failed' | 'clipboard-failed' };

/**
 * Fetch an image by URL and write it to the clipboard as a ClipboardItem.
 * Requires HTTPS and a user-gesture context.
 */
export async function copyImageToClipboard(src: string): Promise<CopyImageResult> {
  if (
    typeof navigator === 'undefined' ||
    !navigator.clipboard ||
    typeof navigator.clipboard.write !== 'function' ||
    typeof ClipboardItem === 'undefined'
  ) {
    return { ok: false, reason: 'unsupported' };
  }

  let blob: Blob;
  try {
    const response = await fetch(src, { credentials: 'same-origin' });
    if (!response.ok) return { ok: false, reason: 'fetch-failed' };
    blob = await response.blob();
  } catch {
    return { ok: false, reason: 'fetch-failed' };
  }

  const mimeType = blob.type || 'image/png';

  try {
    await navigator.clipboard.write([new ClipboardItem({ [mimeType]: blob })]);
    return { ok: true };
  } catch {
    return { ok: false, reason: 'clipboard-failed' };
  }
}
