/**
 * Server-side TipTap utilities for converting between markdown, HTML, and Yjs documents.
 * Mirrors the frontend's TipTap extension configuration (minus browser-only extensions).
 */
import { generateHTML, generateJSON } from '@tiptap/html';
import StarterKit from '@tiptap/starter-kit';
import CodeBlock from '@tiptap/extension-code-block';
import TaskList from '@tiptap/extension-task-list';
import TaskItem from '@tiptap/extension-task-item';
import Link from '@tiptap/extension-link';
import Typography from '@tiptap/extension-typography';
import { marked } from 'marked';
import TurndownService from 'turndown';
import * as Y from 'yjs';

// Server-side extensions (same as frontend minus Placeholder, ImageUpload, WikiLink).
// CodeBlock must be registered explicitly because StarterKit.configure({ codeBlock: false })
// is used on the frontend — the server needs to mirror that schema.
const extensions = [
  StarterKit.configure({
    // history is left enabled server-side (one-time conversion, no undo needed).
    // codeBlock disabled so we register the extension explicitly below,
    // keeping the server schema in sync with the frontend.
    codeBlock: false,
  }),
  CodeBlock,
  TaskList,
  TaskItem.configure({
    nested: true,
  }),
  Link.configure({
    openOnClick: false,
  }),
  Typography,
];

// Configure marked (same as frontend)
marked.use({
  gfm: true,
  breaks: true,
});

// Configure turndown (mirrors frontend TiptapEditor.tsx — omits React-specific
// rules such as codeBlockWrapper which only apply to browser-rendered DOM)
const turndownService = new TurndownService({
  headingStyle: 'atx',
  codeBlockStyle: 'fenced',
  emDelimiter: '*',
  strongDelimiter: '**',
  bulletListMarker: '-',
});

// Custom rule for task items
turndownService.addRule('taskListItems', {
  filter: (node) => {
    if (node.nodeName === 'LI') {
      if (node.hasAttribute('data-type') && node.getAttribute('data-type') === 'taskItem') {
        return true;
      }
      const hasCheckbox = node.querySelector('input[type="checkbox"]');
      if (hasCheckbox) {
        return true;
      }
    }
    return false;
  },
  replacement: (content, node: any) => {
    let isChecked = node.getAttribute('data-checked') === 'true';
    const checkbox = node.querySelector('input[type="checkbox"]');
    if (checkbox) {
      isChecked = checkbox.hasAttribute('checked') || checkbox.checked;
    }
    const cleanContent = content
      .replace(/<input[^>]*>/g, '')
      .replace(/<label[^>]*>.*?<\/label>/g, '')
      .trim();
    return `- [${isChecked ? 'x' : ' '}] ${cleanContent}\n`;
  },
});

/**
 * Replace the contents of an existing Y.Doc with the given markdown.
 *
 * Applied in a single Yjs transaction so collaborators observe one atomic
 * change rather than a delete followed by a rebuild.
 *
 * Note this replaces rather than merges: the CRDT cannot meaningfully rebase an
 * out-of-band full-document rewrite against concurrent edits, so last-write-wins
 * is the intended semantic.
 */
export function applyMarkdownToYDoc(doc: Y.Doc, markdown: string): void {
  const xmlFragment = doc.getXmlFragment('default');

  doc.transact(() => {
    if (xmlFragment.length > 0) {
      xmlFragment.delete(0, xmlFragment.length);
    }

    if (!markdown || !markdown.trim()) {
      // Empty document still needs one paragraph for TipTap to mount into
      xmlFragment.insert(0, [new Y.XmlElement('paragraph')]);
      return;
    }

    // Convert markdown -> HTML -> ProseMirror JSON -> Yjs XML fragment
    const html = marked.parse(markdown) as string;
    const json = generateJSON(html, extensions);
    prosemirrorJsonToYXml(json, xmlFragment);
  });
}

/**
 * Convert markdown content to a Yjs Y.Doc with TipTap-compatible XML fragment
 */
export function markdownToYDoc(markdown: string): Y.Doc {
  const doc = new Y.Doc();
  applyMarkdownToYDoc(doc, markdown);
  return doc;
}

/**
 * Convert a Yjs Y.Doc back to markdown
 */
export function yDocToMarkdown(doc: Y.Doc): string {
  const xmlFragment = doc.getXmlFragment('default');

  if (xmlFragment.length === 0) {
    return '';
  }

  // Convert Yjs XML fragment to ProseMirror JSON
  const json = yXmlToProsemirrorJson(xmlFragment);

  // Convert ProseMirror JSON -> HTML -> Markdown
  const html = generateHTML(json, extensions);
  const markdown = turndownService.turndown(html);

  return markdown;
}

/**
 * Convert ProseMirror JSON document to Yjs XML elements
 */
function prosemirrorJsonToYXml(json: any, xmlFragment: Y.XmlFragment) {
  if (!json || !json.content) return;

  for (const node of json.content) {
    const element = prosemirrorNodeToYXml(node);
    if (element) {
      xmlFragment.insert(xmlFragment.length, [element]);
    }
  }
}

function prosemirrorNodeToYXml(node: any): Y.XmlElement | Y.XmlText | null {
  if (!node) return null;

  if (node.type === 'text') {
    const text = new Y.XmlText();
    const attrs: any = {};
    if (node.marks) {
      for (const mark of node.marks) {
        attrs[mark.type] = mark.attrs || {};
      }
    }
    text.insert(0, node.text || '', Object.keys(attrs).length > 0 ? attrs : undefined);
    return text;
  }

  const element = new Y.XmlElement(node.type);

  // Set attributes
  if (node.attrs) {
    for (const [key, value] of Object.entries(node.attrs)) {
      if (value !== null && value !== undefined) {
        element.setAttribute(key, value as string);
      }
    }
  }

  // Add children
  if (node.content) {
    for (const child of node.content) {
      const childElement = prosemirrorNodeToYXml(child);
      if (childElement) {
        element.insert(element.length, [childElement]);
      }
    }
  }

  return element;
}

/**
 * Convert Yjs XML fragment to ProseMirror JSON
 */
function yXmlToProsemirrorJson(xmlFragment: Y.XmlFragment): any {
  const content: any[] = [];

  for (let i = 0; i < xmlFragment.length; i++) {
    const child = xmlFragment.get(i);
    const node = yXmlNodeToProsemirror(child);
    if (node) {
      content.push(node);
    }
  }

  return {
    type: 'doc',
    content: content.length > 0 ? content : [{ type: 'paragraph' }],
  };
}

function yXmlNodeToProsemirror(node: any): any {
  if (node instanceof Y.XmlText) {
    const text = node.toString();
    if (!text) return null;

    const result: any = { type: 'text', text };

    // Convert Yjs formatting attributes to ProseMirror marks
    const attrs = node.getAttributes();
    if (Object.keys(attrs).length > 0) {
      result.marks = Object.entries(attrs).map(([type, markAttrs]) => ({
        type,
        attrs: markAttrs && typeof markAttrs === 'object' && Object.keys(markAttrs as object).length > 0
          ? markAttrs
          : undefined,
      }));
    }

    return result;
  }

  if (node instanceof Y.XmlElement) {
    const result: any = {
      type: node.nodeName,
    };

    // Convert attributes
    const attrs = node.getAttributes();
    if (Object.keys(attrs).length > 0) {
      result.attrs = attrs;
    }

    // Convert children
    if (node.length > 0) {
      const content: any[] = [];
      for (let i = 0; i < node.length; i++) {
        const child = node.get(i);
        const childNode = yXmlNodeToProsemirror(child);
        if (childNode) {
          content.push(childNode);
        }
      }
      if (content.length > 0) {
        result.content = content;
      }
    }

    return result;
  }

  return null;
}
