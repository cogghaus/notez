import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock prisma
vi.mock('../lib/db.js', () => ({
  prisma: {
    noteYjsState: {
      findUnique: vi.fn(),
      upsert: vi.fn(),
    },
    note: {
      findFirst: vi.fn(),
      updateMany: vi.fn(),
    },
  },
}));

// Mock tiptap-server
vi.mock('../lib/tiptap-server.js', () => ({
  markdownToYDoc: vi.fn(),
  yDocToMarkdown: vi.fn(),
  applyMarkdownToYDoc: vi.fn(),
}));

// Mock jwt utils (used by onAuthenticate)
vi.mock('../utils/jwt.utils.js', () => ({
  verifyAccessToken: vi.fn(),
}));

// Mock share service (used by onAuthenticate)
vi.mock('./share.service.js', () => ({
  checkNoteAccess: vi.fn(),
}));

import { prisma } from '../lib/db.js';
import { markdownToYDoc, yDocToMarkdown, applyMarkdownToYDoc } from '../lib/tiptap-server.js';
import {
  fetchDocument,
  storeDocument,
  syncNoteContentToYjs,
  hocuspocusServer,
} from './collaboration.service.js';
import * as Y from 'yjs';

describe('collaboration.service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  describe('fetchDocument', () => {
    it('returns existing Yjs state from database', async () => {
      const mockState = Buffer.from([1, 2, 3]);
      (prisma.noteYjsState.findUnique as any).mockResolvedValue({ state: mockState });

      const result = await fetchDocument({ documentName: 'note-1' } as any);

      expect(result).toEqual(mockState);
      expect(prisma.noteYjsState.findUnique).toHaveBeenCalledWith({
        where: { noteId: 'note-1' },
      });
    });

    it('converts markdown to Yjs doc on first collaboration', async () => {
      (prisma.noteYjsState.findUnique as any).mockResolvedValue(null);
      (prisma.note.findFirst as any).mockResolvedValue({ content: '# Hello' });

      // Create a real Y.Doc for the mock to return
      const doc = new Y.Doc();
      (markdownToYDoc as any).mockReturnValue(doc);
      (prisma.noteYjsState.upsert as any).mockResolvedValue({});

      const result = await fetchDocument({ documentName: 'note-1' } as any);

      expect(result).toBeInstanceOf(Uint8Array);
      expect(markdownToYDoc).toHaveBeenCalledWith('# Hello');
      expect(prisma.noteYjsState.upsert).toHaveBeenCalled();
    });

    it('returns null when note does not exist', async () => {
      (prisma.noteYjsState.findUnique as any).mockResolvedValue(null);
      (prisma.note.findFirst as any).mockResolvedValue(null);

      const result = await fetchDocument({ documentName: 'note-1' } as any);

      expect(result).toBeNull();
    });

    it('returns null on database error (no crash)', async () => {
      (prisma.noteYjsState.findUnique as any).mockRejectedValue(new Error('DB connection lost'));

      const result = await fetchDocument({ documentName: 'note-1' } as any);

      expect(result).toBeNull();
      expect(console.error).toHaveBeenCalledWith(
        expect.stringContaining('Failed to fetch Yjs state'),
        expect.any(Error),
      );
    });
  });

  describe('storeDocument', () => {
    it('saves Yjs state and syncs markdown', async () => {
      (prisma.noteYjsState.upsert as any).mockResolvedValue({});
      (yDocToMarkdown as any).mockReturnValue('# Hello');
      (prisma.note.updateMany as any).mockResolvedValue({ count: 1 });

      const doc = new Y.Doc();
      const state = Y.encodeStateAsUpdate(doc);

      await storeDocument({ documentName: 'note-1', state } as any);

      expect(prisma.noteYjsState.upsert).toHaveBeenCalled();
      expect(prisma.note.updateMany).toHaveBeenCalledWith({
        where: { id: 'note-1', deleted: false },
        data: { content: '# Hello' },
      });
    });

    it('swallows database error on upsert (no crash)', async () => {
      (prisma.noteYjsState.upsert as any).mockRejectedValue(new Error('DB write failed'));

      const doc = new Y.Doc();
      const state = Y.encodeStateAsUpdate(doc);

      // Should not throw
      await expect(storeDocument({ documentName: 'note-1', state } as any)).resolves.toBeUndefined();

      expect(console.error).toHaveBeenCalledWith(
        expect.stringContaining('Failed to store Yjs state'),
        expect.any(Error),
      );
    });

    it('swallows markdown sync error without affecting state save', async () => {
      (prisma.noteYjsState.upsert as any).mockResolvedValue({});
      (yDocToMarkdown as any).mockImplementation(() => { throw new Error('Parse error'); });

      const doc = new Y.Doc();
      const state = Y.encodeStateAsUpdate(doc);

      await expect(storeDocument({ documentName: 'note-1', state } as any)).resolves.toBeUndefined();

      // State was saved successfully
      expect(prisma.noteYjsState.upsert).toHaveBeenCalled();
      // Markdown sync failed but was caught
      expect(console.error).toHaveBeenCalledWith(
        expect.stringContaining('Failed to sync Yjs state to markdown'),
        expect.any(Error),
      );
    });
  });

  // Writes that bypass the editor (REST API, MCP tools) must be pushed into the
  // CRDT, otherwise fetchDocument keeps serving the stored state and storeDocument
  // reverts them on the next collaborative open.
  describe('syncNoteContentToYjs', () => {
    it('skips notes that have no CRDT state yet', async () => {
      // No state row: fetchDocument will convert from notes.content on first
      // open, so there is nothing stale to correct.
      (prisma.noteYjsState.findUnique as any).mockResolvedValue(null);
      const openSpy = vi.spyOn(hocuspocusServer, 'openDirectConnection');

      await syncNoteContentToYjs('note-1', '# hello');

      expect(openSpy).not.toHaveBeenCalled();
      expect(applyMarkdownToYDoc).not.toHaveBeenCalled();
    });

    it('applies the new content to the document when CRDT state exists', async () => {
      (prisma.noteYjsState.findUnique as any).mockResolvedValue({ noteId: 'note-1' });

      const doc = new Y.Doc();
      const disconnect = vi.fn().mockResolvedValue(undefined);
      const transact = vi.fn(async (cb: any) => { cb(doc); });
      vi.spyOn(hocuspocusServer, 'openDirectConnection').mockResolvedValue({
        transact,
        disconnect,
      } as any);

      await syncNoteContentToYjs('note-1', '# hello');

      expect(transact).toHaveBeenCalled();
      expect(applyMarkdownToYDoc).toHaveBeenCalledWith(doc, '# hello');
      expect(disconnect).toHaveBeenCalled();
    });

    it('disconnects even when the transaction throws', async () => {
      (prisma.noteYjsState.findUnique as any).mockResolvedValue({ noteId: 'note-1' });

      const disconnect = vi.fn().mockResolvedValue(undefined);
      const transact = vi.fn().mockRejectedValue(new Error('transact failed'));
      vi.spyOn(hocuspocusServer, 'openDirectConnection').mockResolvedValue({
        transact,
        disconnect,
      } as any);

      await syncNoteContentToYjs('note-1', '# hello');

      expect(disconnect).toHaveBeenCalled();
    });

    it('swallows errors so a sync failure cannot fail the committed write', async () => {
      (prisma.noteYjsState.findUnique as any).mockRejectedValue(new Error('DB down'));

      await expect(syncNoteContentToYjs('note-1', 'x')).resolves.toBeUndefined();
      expect(console.error).toHaveBeenCalledWith(
        expect.stringContaining('Failed to sync content into Yjs doc'),
        expect.any(Error),
      );
    });
  });
});
