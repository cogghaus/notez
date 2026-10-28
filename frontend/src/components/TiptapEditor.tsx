import { useEditor, EditorContent } from '@tiptap/react';
import { useEffect, useRef, useCallback, useState } from 'react';
import TurndownService from 'turndown';
import { gfm } from 'turndown-plugin-gfm';
import { marked } from 'marked';
import { getBaseExtensions, EDITOR_PROSE_CLASS } from './editorExtensions';
import { ReferencesPanel } from './ReferencesPanel';
import { uploadImage } from '../api/images';
import { ImagePlus } from 'lucide-react';
import { useKeepCaretVisible } from '../lib/useKeepCaretVisible';
import './TiptapEditor.css';

interface TiptapEditorProps {
  content: string;
  onChange: (content: string) => void;
  disabled?: boolean;
  placeholder?: string;
  onNoteNavigate?: (noteId: string) => void;
}

// Initialize turndown service for HTML to Markdown conversion
const turndownService = new TurndownService({
  headingStyle: 'atx',
  codeBlockStyle: 'fenced',
  emDelimiter: '*',
  strongDelimiter: '**',
  bulletListMarker: '-',
});

// Custom rule for task items (MUST come before GFM to take priority)
turndownService.addRule('taskListItems', {
  filter: (node) => {
    // Check for task items by data-type attribute OR by presence of checkbox input
    if (node.nodeName === 'LI') {
      // Check if it has data-type="taskItem"
      if (node.hasAttribute('data-type') && node.getAttribute('data-type') === 'taskItem') {
        return true;
      }
      // Also check if it contains a checkbox input (fallback)
      const hasCheckbox = node.querySelector('input[type="checkbox"]');
      if (hasCheckbox) {
        return true;
      }
    }
    return false;
  },
  replacement: (content, node: any) => {
    // Try to get checked state from data-checked attribute
    let isChecked = node.getAttribute('data-checked') === 'true';

    // Fallback: check for checkbox input element
    const checkbox = node.querySelector('input[type="checkbox"]');
    if (checkbox) {
      isChecked = checkbox.hasAttribute('checked') || checkbox.checked;
    }

    // Clean up the content - remove checkbox elements that might be in the text
    const cleanContent = content
      .replace(/<input[^>]*>/g, '')
      .replace(/<label[^>]*>.*?<\/label>/g, '')
      .trim();

    return `- [${isChecked ? 'x' : ' '}] ${cleanContent}\n`;
  },
});

// Add GFM (GitHub Flavored Markdown) support for task lists
// This comes AFTER our custom rule so our rule takes priority
turndownService.use(gfm);

// Custom rule for wiki-links (preserve [[keyword]] syntax)
turndownService.addRule('wikiLinks', {
  filter: (node) => {
    return node.nodeName === 'SPAN' && node.hasAttribute('data-wiki-link');
  },
  replacement: (_content, node: any) => {
    const keyword = node.getAttribute('data-keyword') || node.textContent || '';
    return `[[${keyword}]]`;
  },
});

// Custom rule for images (including width for resized images)
turndownService.addRule('images', {
  filter: 'img',
  replacement: (_content, node: any) => {
    const src = node.getAttribute('src') || '';
    const alt = node.getAttribute('alt') || '';
    const title = node.getAttribute('title');
    const width = node.getAttribute('width');

    // Build markdown with optional width in title
    // Format: ![alt](src "title|width=300") or ![alt](src "|width=300")
    let titlePart = title || '';
    if (width) {
      titlePart = titlePart ? `${titlePart}|width=${width}` : `|width=${width}`;
    }

    if (titlePart) {
      // Escape double quotes in title to prevent broken markdown
      const escapedTitlePart = titlePart.replace(/"/g, '\\"');
      return `![${alt}](${src} "${escapedTitlePart}")`;
    }
    return `![${alt}](${src})`;
  },
});

// Configure marked to handle task lists and wiki-links
marked.use({
  gfm: true,
  breaks: true,
  extensions: [
    {
      name: 'taskListItem',
      level: 'block',
      start(src: string) {
        return src.match(/^- \[(x| )\]/)?.index;
      },
      tokenizer(src: string) {
        const match = /^- \[(x| )\] (.+?)(?:\n|$)/.exec(src);
        if (match) {
          return {
            type: 'taskListItem',
            raw: match[0],
            checked: match[1] === 'x',
            text: match[2],
          };
        }
      },
      renderer(token: any) {
        return `<li data-type="taskItem" data-checked="${token.checked}"><label><input type="checkbox" ${token.checked ? 'checked' : ''}><span></span></label><div><p>${token.text}</p></div></li>`;
      },
    },
    {
      name: 'wikiLink',
      level: 'inline',
      start(src: string) {
        return src.match(/\[\[/)?.index;
      },
      tokenizer(src: string) {
        const match = /^\[\[([^\]]+)\]\]/.exec(src);
        if (match) {
          return {
            type: 'wikiLink',
            raw: match[0],
            keyword: match[1].trim(),
          };
        }
      },
      renderer(token: any) {
        // Escape HTML entities to prevent XSS
        const escapedKeyword = token.keyword
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;')
          .replace(/"/g, '&quot;')
          .replace(/'/g, '&#39;');
        return `<span data-wiki-link="true" data-keyword="${escapedKeyword}" class="wiki-link">${escapedKeyword}</span>`;
      },
    },
  ],
});

// Convert markdown to HTML for Tiptap
function markdownToHTML(markdown: string): string {
  if (!markdown) return '<p></p>';

  try {
    // Use marked to parse markdown to HTML
    let html = marked.parse(markdown, { async: false }) as string;

    // Post-process images to extract width from title
    // Format: <img ... title="optional title|width=300">
    html = html.replace(/<img([^>]*)\stitle="([^"]*)"([^>]*)>/gi, (_match, before, titleAttr, after) => {
      const widthMatch = titleAttr.match(/\|width=(\d+)/);
      if (widthMatch) {
        const width = widthMatch[1];
        const cleanTitle = titleAttr.replace(/\|width=\d+/, '').trim();
        // Escape HTML entities to prevent XSS via title attribute injection
        const escapedTitle = cleanTitle
          .replace(/&/g, '&amp;')
          .replace(/"/g, '&quot;')
          .replace(/'/g, '&#39;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;');
        const titlePart = escapedTitle ? ` title="${escapedTitle}"` : '';
        return `<img${before}${titlePart} width="${width}"${after}>`;
      }
      // Also escape the original title if no width match
      const escapedTitleAttr = titleAttr
        .replace(/&/g, '&amp;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
      return `<img${before} title="${escapedTitleAttr}"${after}>`;
    });

    // Post-process to handle task lists that marked might not catch
    // Make <p> tags optional as a group to handle all list item variations

    // First handle escaped brackets \[ \] (common when copying markdown)
    html = html.replace(/<li>(?:<p>)?\s*\\\[\s*x\s*\\\]\s*(.*?)(?:<\/p>)?<\/li>/gi, (_match, text) => {
      return `<li data-type="taskItem" data-checked="true"><label><input type="checkbox" checked><span></span></label><div><p>${text.trim()}</p></div></li>`;
    });

    html = html.replace(/<li>(?:<p>)?\s*\\\[\s*\\\]\s*(.*?)(?:<\/p>)?<\/li>/gi, (_match, text) => {
      return `<li data-type="taskItem" data-checked="false"><label><input type="checkbox"><span></span></label><div><p>${text.trim()}</p></div></li>`;
    });

    // Then handle normal brackets [ ]
    html = html.replace(/<li>(?:<p>)?\s*\[\s*x\s*\]\s*(.*?)(?:<\/p>)?<\/li>/gi, (_match, text) => {
      return `<li data-type="taskItem" data-checked="true"><label><input type="checkbox" checked><span></span></label><div><p>${text.trim()}</p></div></li>`;
    });

    html = html.replace(/<li>(?:<p>)?\s*\[\s*\]\s*(.*?)(?:<\/p>)?<\/li>/gi, (_match, text) => {
      return `<li data-type="taskItem" data-checked="false"><label><input type="checkbox"><span></span></label><div><p>${text.trim()}</p></div></li>`;
    });

    // Wrap task list items in ul with task-list class
    html = html.replace(/(<li data-type="taskItem".*?<\/li>\s*)+/gs, (match) => {
      return `<ul data-type="taskList" class="task-list">${match}</ul>`;
    });

    return html;
  } catch (error) {
    // Log error without exposing sensitive content
    if (import.meta.env.DEV) console.error('Error parsing markdown');
    return `<p>${markdown}</p>`;
  }
}

export function TiptapEditor({ content, onChange, disabled = false, placeholder = 'Start writing...', onNoteNavigate }: TiptapEditorProps) {
  // The markdown this editor last sent through onChange. When the content prop is just
  // that value coming back, there is nothing to sync.
  const lastEmittedRef = useRef(content);
  const [isUploading, setIsUploading] = useState(false);
  const [referencesKeyword, setReferencesKeyword] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Handle wiki-link clicks
  const handleWikiLinkClick = useCallback((keyword: string) => {
    setReferencesKeyword(keyword);
  }, []);

  // Handle note navigation from references panel
  const handleNoteClick = useCallback((noteId: string) => {
    if (onNoteNavigate) {
      onNoteNavigate(noteId);
    }
  }, [onNoteNavigate]);

  // Handle image upload
  const handleImageUpload = useCallback(async (file: File): Promise<string | null> => {
    setIsUploading(true);
    try {
      const result = await uploadImage(file);
      return result.url;
    } catch (error) {
      if (import.meta.env.DEV) console.error('Failed to upload image:', error);
      // Could show a toast notification here
      return null;
    } finally {
      setIsUploading(false);
    }
  }, []);

  const editor = useEditor({
    extensions: getBaseExtensions({
      placeholder,
      onImageUpload: handleImageUpload,
      onWikiLinkClick: handleWikiLinkClick,
    }),
    content: markdownToHTML(content),
    editable: !disabled,
    onUpdate: ({ editor }) => {
      // Convert HTML back to markdown
      const html = editor.getHTML();
      const markdown = turndownService.turndown(html);
      lastEmittedRef.current = markdown;
      onChange(markdown);
    },
    editorProps: {
      attributes: {
        class: EDITOR_PROSE_CLASS,
      },
      // Ensure formatting commands work reliably by handling keydown at the editor level
      handleKeyDown: (_view, event) => {
        // Don't prevent default browser behavior for keyboard shortcuts
        // TipTap handles Ctrl+B, Ctrl+I, etc. natively via StarterKit
        // This ensures the event properly reaches TipTap's handlers
        if ((event.ctrlKey || event.metaKey) && ['b', 'i', 'u'].includes(event.key.toLowerCase())) {
          // Let TipTap handle these formatting shortcuts
          return false;
        }
        return false;
      },
    },
  });

  // Update editor content when prop changes (e.g., switching notes)
  useEffect(() => {
    if (editor && content !== undefined) {
      // Our own onChange echoed back: skip the full-document conversion on every keystroke.
      if (content === lastEmittedRef.current) return;

      const html = editor.getHTML();
      const currentMarkdown = turndownService.turndown(html);

      // Normalize both for comparison (trim whitespace, normalize line endings)
      const normalizedCurrent = currentMarkdown.trim().replace(/\r\n/g, '\n');
      const normalizedNew = content.trim().replace(/\r\n/g, '\n');

      // Only update if content actually changed
      if (normalizedCurrent !== normalizedNew) {
        // emitUpdate: false keeps this change from echoing back through onChange. The
        // old 150ms "ignore updates" window also swallowed real keystrokes typed in it.
        editor.commands.setContent(markdownToHTML(content), { emitUpdate: false });
        lastEmittedRef.current = content;
      }
    }
  }, [content, editor]);

  // Update editable state when disabled prop changes
  useEffect(() => {
    if (editor) {
      editor.setEditable(!disabled);
    }
  }, [disabled, editor]);

  // Maximum file size: 10MB
  const MAX_FILE_SIZE = 10 * 1024 * 1024;
  // Allowed MIME types
  const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];

  // Handle file selection from the upload button
  const handleFileSelect = useCallback(
    async (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (file && editor) {
        // Validate file type
        if (!ALLOWED_TYPES.includes(file.type)) {
          if (import.meta.env.DEV) console.error('Invalid file type. Only JPEG, PNG, GIF, and WebP are allowed.');
          return;
        }
        // Validate file size
        if (file.size > MAX_FILE_SIZE) {
          if (import.meta.env.DEV) console.error('File too large. Maximum size is 10MB.');
          return;
        }
        const url = await handleImageUpload(file);
        if (url) {
          editor.chain().focus().setImage({ src: url }).run();
        }
      }
      // Reset input so the same file can be selected again
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    },
    [editor, handleImageUpload]
  );

  // Trigger file input click
  const handleUploadClick = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  useKeepCaretVisible(editor);

  if (!editor) {
    return null;
  }

  return (
    <div className="tiptap-wrapper relative">
      {/* Floating toolbar for image upload */}
      <div className="absolute top-2 right-2 z-20">
        <button
          type="button"
          onClick={handleUploadClick}
          disabled={disabled || isUploading}
          className="p-2 bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg shadow-sm hover:bg-gray-50 dark:hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          title="Upload image"
        >
          <ImagePlus className="w-5 h-5 text-gray-600 dark:text-gray-300" />
        </button>
      </div>

      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/gif,image/webp"
        onChange={handleFileSelect}
        className="hidden"
      />

      <EditorContent editor={editor} className="h-full" />

      {isUploading && (
        <div className="absolute bottom-4 right-4 bg-blue-500 text-white px-3 py-1.5 rounded-md text-sm flex items-center gap-2 shadow-lg">
          <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
          </svg>
          Uploading image...
        </div>
      )}

      {/* References Panel for wiki-link lookups */}
      {referencesKeyword && (
        <ReferencesPanel
          keyword={referencesKeyword}
          onClose={() => setReferencesKeyword(null)}
          onNoteClick={handleNoteClick}
        />
      )}
    </div>
  );
}
