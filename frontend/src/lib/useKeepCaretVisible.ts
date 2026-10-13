import { useEffect, useRef } from 'react';
import type { Editor } from '@tiptap/react';
import type { OnMount } from '@monaco-editor/react';
import { VIEWPORT_HEIGHT_EVENT } from './viewport';

type MonacoEditor = Parameters<OnMount>[0];

/**
 * Runs `callback` one frame after the visible viewport height changes (on-screen keyboard opening,
 * rotation, fold), once layout has applied the new height. Bursts collapse into one call. The
 * latest callback is used without re-subscribing.
 */
export function useAfterViewportHeightChange(callback: () => void): void {
  const callbackRef = useRef(callback);
  useEffect(() => {
    callbackRef.current = callback;
  });

  useEffect(() => {
    let frame = 0;
    const onChange = () => {
      if (frame) cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        frame = 0;
        callbackRef.current();
      });
    };

    window.addEventListener(VIEWPORT_HEIGHT_EVENT, onChange);
    return () => {
      if (frame) cancelAnimationFrame(frame);
      window.removeEventListener(VIEWPORT_HEIGHT_EVENT, onChange);
    };
  }, []);
}

/**
 * When the visible viewport height changes while the Tiptap editor has focus, scroll the caret
 * back into view once layout has applied the new height.
 */
export function useKeepCaretVisible(editor: Editor | null): void {
  useAfterViewportHeightChange(() => {
    if (!editor || editor.isDestroyed || !editor.isFocused) return;
    editor.commands.scrollIntoView();
  });
}

/** Same for the raw (Monaco) editor: it re-lays itself out but does not follow the cursor. */
export function useKeepMonacoCaretVisible(editorRef: { current: MonacoEditor | null }): void {
  useAfterViewportHeightChange(() => {
    const editor = editorRef.current;
    // A disposed editor (raw mode left) has no model.
    if (!editor || !editor.getModel() || !editor.hasTextFocus()) return;
    const position = editor.getPosition();
    if (position) editor.revealPositionInCenterIfOutsideViewport(position);
  });
}
