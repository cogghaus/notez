/**
 * Shared TipTap extension configuration.
 * Single source of truth for all editor extensions — used by both
 * TiptapEditor (non-collaborative) and CollaborativeTiptapEditor.
 *
 * This eliminates config divergence between the two editors.
 * Any extension added, removed, or reconfigured here applies to both.
 *
 * Note: StarterKit is configured with `codeBlock: false` to prevent the
 * built-in CodeBlock from registering. CodeBlockExtension (which adds the
 * copy button node view) is registered explicitly instead.
 */
import StarterKit from '@tiptap/starter-kit';
import TaskList from '@tiptap/extension-task-list';
import TaskItem from '@tiptap/extension-task-item';
import Link from '@tiptap/extension-link';
import Placeholder from '@tiptap/extension-placeholder';
import Typography from '@tiptap/extension-typography';
import type { Extensions } from '@tiptap/react';
import { ImageUploadExtension } from './TiptapImageExtension';
import { WikiLink } from './WikiLinkExtension';
import { CodeBlockExtension } from './CodeBlockExtension';

interface BaseExtensionOptions {
  placeholder?: string;
  onImageUpload: (file: File) => Promise<string | null>;
  onImageError?: (error: Error) => void;
  onWikiLinkClick?: (keyword: string) => void;
  /** When true, disables StarterKit's built-in undoRedo (Collaboration has its own). */
  collaborative?: boolean;
}

/**
 * Returns the base TipTap extensions shared by all editor modes.
 * Collaboration-specific extensions (Collaboration, CollaborationCursor)
 * are added separately by CollaborativeTiptapEditor.
 */
export function getBaseExtensions({
  placeholder = 'Start writing...',
  onImageUpload,
  onImageError,
  onWikiLinkClick,
  collaborative = false,
}: BaseExtensionOptions): Extensions {
  return [
    StarterKit.configure({
      heading: { levels: [1, 2, 3, 4, 5, 6] },
      // StarterKit v3 includes Link by default — disable to avoid duplicate
      // with our explicit Link extension below.
      link: false,
      // Disable built-in codeBlock — replaced by CodeBlockExtension which
      // adds a React node view with a copy button.
      codeBlock: false,
      // In collaborative mode, Collaboration extension provides its own
      // undo/redo via yUndoPlugin. Disable StarterKit's to prevent conflicts.
      ...(collaborative ? { undoRedo: false } : {}),
    }),
    TaskList.configure({
      HTMLAttributes: { class: 'task-list' },
    }),
    TaskItem.configure({
      nested: true,
      HTMLAttributes: { class: 'task-item' },
    }),
    Link.configure({
      openOnClick: false,
      protocols: ['http', 'https', 'mailto'],
      HTMLAttributes: {
        class: 'tiptap-link',
        rel: 'noopener noreferrer',
      },
    }),
    Placeholder.configure({ placeholder }),
    Typography,
    ImageUploadExtension.configure({
      onUpload: onImageUpload,
      onError: onImageError ?? ((error: Error) => {
        if (import.meta.env.DEV) console.error('Image upload error:', error);
      }),
    }),
    WikiLink.configure({
      onWikiLinkClick: onWikiLinkClick ?? (() => {}),
    }),
    CodeBlockExtension,
  ];
}

/** Editor prose class — shared between both editor components */
export const EDITOR_PROSE_CLASS =
  'tiptap-editor prose prose-sm dark:prose-invert max-w-none min-h-full px-4 py-3';

/**
 * Attributes for the editor element, shared between both editor components.
 * TipTap 3.33+ gives the element role="textbox", and a textbox needs an accessible name
 * (axe aria-input-field-name), so the label lives here with the class.
 */
export const EDITOR_ATTRIBUTES = {
  class: EDITOR_PROSE_CLASS,
  'aria-label': 'Note content',
  'aria-multiline': 'true',
};
