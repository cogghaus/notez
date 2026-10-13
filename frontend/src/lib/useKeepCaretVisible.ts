import { useEffect } from 'react';
import type { Editor } from '@tiptap/react';
import { VIEWPORT_HEIGHT_EVENT } from './viewport';

/**
 * When the visible viewport height changes (on-screen keyboard opening, rotation, fold) while the
 * editor has focus, scroll the caret back into view once layout has applied the new height.
 */
export function useKeepCaretVisible(editor: Editor | null): void {
  useEffect(() => {
    if (!editor) return;

    let frame = 0;
    const onChange = () => {
      if (frame) cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        frame = 0;
        if (editor.isDestroyed || !editor.isFocused) return;
        editor.commands.scrollIntoView();
      });
    };

    window.addEventListener(VIEWPORT_HEIGHT_EVENT, onChange);
    return () => {
      if (frame) cancelAnimationFrame(frame);
      window.removeEventListener(VIEWPORT_HEIGHT_EVENT, onChange);
    };
  }, [editor]);
}
