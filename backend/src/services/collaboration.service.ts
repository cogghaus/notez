/**
 * Collaboration service using Hocuspocus (Yjs WebSocket server).
 * Handles authentication, document loading/storing, and awareness.
 */
import { Hocuspocus } from '@hocuspocus/server';
import { Database } from '@hocuspocus/extension-database';
import type { fetchPayload, storePayload, onAuthenticatePayload, onConnectPayload } from '@hocuspocus/server';
import * as Y from 'yjs';
import { prisma } from '../lib/db.js';
import { verifyAccessToken } from '../utils/jwt.utils.js';
import { checkNoteAccess } from './share.service.js';
import { markdownToYDoc, yDocToMarkdown, applyMarkdownToYDoc } from '../lib/tiptap-server.js';

// Assign a consistent color to each user based on their userId
const CURSOR_COLORS = [
  '#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4',
  '#FFEAA7', '#DDA0DD', '#98D8C8', '#F7DC6F',
  '#BB8FCE', '#85C1E9', '#F1948A', '#82E0AA',
];

function getUserColor(userId: string): string {
  let hash = 0;
  for (let i = 0; i < userId.length; i++) {
    hash = ((hash << 5) - hash + userId.charCodeAt(i)) | 0;
  }
  return CURSOR_COLORS[Math.abs(hash) % CURSOR_COLORS.length];
}

/** Fetch Yjs document state from database (used by Database extension). */
export async function fetchDocument({ documentName }: fetchPayload): Promise<Uint8Array | null> {
  const noteId = documentName;

  try {
    // Try to load existing Yjs state from database
    const yjsState = await prisma.noteYjsState.findUnique({
      where: { noteId },
    });

    if (yjsState) {
      return yjsState.state;
    }

    // First-time collaboration: convert markdown content to Yjs doc
    // Only load non-deleted notes
    const note = await prisma.note.findFirst({
      where: { id: noteId, deleted: false },
      select: { content: true },
    });

    if (!note) {
      return null;
    }

    // Convert markdown to Yjs document and return its state
    const doc = markdownToYDoc(note.content || '');
    const state = Y.encodeStateAsUpdate(doc);

    // Save initial state so we don't reconvert next time
    await prisma.noteYjsState.upsert({
      where: { noteId },
      update: { state: Buffer.from(state) },
      create: { noteId, state: Buffer.from(state) },
    });

    return state;
  } catch (err) {
    console.error(`[collab] Failed to fetch Yjs state for note ${noteId}:`, err);
    // Return null so Hocuspocus creates an empty doc instead of crashing
    return null;
  }
}

/** Store Yjs document state to database (used by Database extension). */
export async function storeDocument({ documentName, state }: storePayload): Promise<void> {
  const noteId = documentName;

  try {
    // Save Yjs binary state
    await prisma.noteYjsState.upsert({
      where: { noteId },
      update: { state: Buffer.from(state) },
      create: { noteId, state: Buffer.from(state) },
    });

    // Also convert Yjs state back to markdown and update the note
    // This keeps the REST API / search in sync
    // Only update non-deleted notes to avoid resurrecting soft-deleted content
    try {
      const doc = new Y.Doc();
      Y.applyUpdate(doc, state);
      const markdown = yDocToMarkdown(doc);

      await prisma.note.updateMany({
        where: { id: noteId, deleted: false },
        data: { content: markdown },
      });
    } catch (err) {
      console.error(`[collab] Failed to sync Yjs state to markdown for note ${noteId}:`, err);
    }
  } catch (err) {
    // Log and swallow — don't crash the WebSocket server
    console.error(`[collab] Failed to store Yjs state for note ${noteId}:`, err);
  }
}

// @ts-ignore -- Hocuspocus types incompatible with strict mode
export const hocuspocusServer = new Hocuspocus({
  name: 'notez-collaboration',
  timeout: 30000,
  debounce: 2000,
  maxDebounce: 10000,

  extensions: [
    new Database({
      fetch: fetchDocument,
      store: storeDocument,
    }),
  ],

  async onAuthenticate({ token, documentName }: onAuthenticatePayload) {
    if (!token) {
      throw new Error('Authentication required');
    }

    // Verify JWT
    let payload;
    try {
      payload = verifyAccessToken(token);
    } catch {
      throw new Error('Invalid or expired token');
    }

    const noteId = documentName;
    const userId = payload.userId;

    // Check access
    const access = await checkNoteAccess(noteId, userId);
    if (!access.hasAccess) {
      throw new Error('Access denied');
    }

    // Return user context for awareness
    return {
      user: {
        id: userId,
        name: payload.username,
        color: getUserColor(userId),
      },
      readOnly: access.permission === 'VIEW',
    };
  },

  async onConnect({ connectionConfig, context }: onConnectPayload) {
    // The connection context has the user info from onAuthenticate
    if (context?.readOnly) {
      // @ts-ignore -- Hocuspocus types incompatible with strict mode
      connectionConfig.readOnly = true;
    }
  },
});

/**
 * Push an out-of-band content change (REST API, MCP tools) into the Yjs document.
 *
 * Note content is persisted twice: as CRDT state in note_yjs_state and as mirrored
 * markdown in notes.content. fetchDocument prefers the CRDT state whenever the row
 * exists and never reconciles it against notes.content, and storeDocument then
 * writes its markdown back over notes.content. Without this call, any write that
 * bypasses the editor was silently reverted the next time the note was opened
 * collaboratively — which is exactly what MCP-driven edits do.
 *
 * openDirectConnection covers both cases: if the document is live, Hocuspocus
 * applies the update to the in-memory doc and broadcasts it to connected clients;
 * if it is not, Hocuspocus loads it, applies the change, and persists via
 * storeDocument. Documents with no CRDT state yet are skipped — fetchDocument
 * converts from notes.content on first open, so there is nothing stale to correct.
 *
 * Best-effort by design: the caller has already committed to the database, so a
 * failure here is logged rather than propagated.
 */
export async function syncNoteContentToYjs(noteId: string, markdown: string): Promise<void> {
  try {
    const existing = await prisma.noteYjsState.findUnique({
      where: { noteId },
      select: { noteId: true },
    });
    if (!existing) {
      return;
    }

    const connection = await hocuspocusServer.openDirectConnection(noteId);
    try {
      await connection.transact((doc) => {
        applyMarkdownToYDoc(doc, markdown);
      });
    } finally {
      await connection.disconnect();
    }
  } catch (err) {
    console.error(`[collab] Failed to sync content into Yjs doc for note ${noteId}:`, err);
  }
}
