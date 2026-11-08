/**
 * Tests for frontend/src/components/editorExtensions.ts
 *
 * Tests the getBaseExtensions() function which is the single source of truth
 * for all TipTap editor extensions used by both editor components.
 *
 * We mock TipTap extension imports to avoid needing a full DOM/ProseMirror
 * environment — we only care about which extensions are included and
 * how the collaborative flag changes the set.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mocks — must be declared before the module under test is imported
// ---------------------------------------------------------------------------

// Mock the custom extensions that have complex dependencies
vi.mock('./TiptapImageExtension', () => ({
  ImageUploadExtension: {
    name: 'image',
    configure: vi.fn().mockImplementation((opts: unknown) => ({
      name: 'image',
      _configuredWith: opts,
    })),
  },
}));

vi.mock('./WikiLinkExtension', () => ({
  WikiLink: {
    name: 'wikiLink',
    configure: vi.fn().mockImplementation((opts: unknown) => ({
      name: 'wikiLink',
      _configuredWith: opts,
    })),
  },
}));

vi.mock('./CodeBlockExtension', () => ({
  CodeBlockExtension: {
    name: 'codeBlock',
  },
}));

// Mock StarterKit — it's complex; we only need to verify it's configured
vi.mock('@tiptap/starter-kit', () => ({
  default: {
    name: 'starterKit',
    configure: vi.fn().mockImplementation((opts: unknown) => ({
      name: 'starterKit',
      _configuredWith: opts,
    })),
  },
}));

// Mock simple TipTap extensions
vi.mock('@tiptap/extension-task-list', () => ({
  default: {
    name: 'taskList',
    configure: vi.fn().mockImplementation((opts: unknown) => ({
      name: 'taskList',
      _configuredWith: opts,
    })),
  },
}));

vi.mock('@tiptap/extension-task-item', () => ({
  default: {
    name: 'taskItem',
    configure: vi.fn().mockImplementation((opts: unknown) => ({
      name: 'taskItem',
      _configuredWith: opts,
    })),
  },
}));

vi.mock('@tiptap/extension-link', () => ({
  default: {
    name: 'link',
    configure: vi.fn().mockImplementation((opts: unknown) => ({
      name: 'link',
      _configuredWith: opts,
    })),
  },
}));

vi.mock('@tiptap/extension-placeholder', () => ({
  default: {
    name: 'placeholder',
    configure: vi.fn().mockImplementation((opts: unknown) => ({
      name: 'placeholder',
      _configuredWith: opts,
    })),
  },
}));

vi.mock('@tiptap/extension-typography', () => ({
  default: {
    name: 'typography',
  },
}));

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('getBaseExtensions', () => {
  // Common options used across tests
  const baseOptions = {
    onImageUpload: vi.fn().mockResolvedValue(null),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns an array of extensions', async () => {
    const { getBaseExtensions } = await import('./editorExtensions');
    const extensions = getBaseExtensions(baseOptions);
    expect(Array.isArray(extensions)).toBe(true);
    expect(extensions.length).toBeGreaterThan(0);
  });

  it('includes all expected base extensions', async () => {
    const { getBaseExtensions } = await import('./editorExtensions');
    const extensions = getBaseExtensions(baseOptions);

    const names = extensions.map((e) => (e as { name?: string }).name).filter(Boolean);

    expect(names).toContain('starterKit');
    expect(names).toContain('taskList');
    expect(names).toContain('taskItem');
    expect(names).toContain('link');
    expect(names).toContain('placeholder');
    expect(names).toContain('typography');
    expect(names).toContain('image');
    expect(names).toContain('wikiLink');
    expect(names).toContain('codeBlock');
  });

  it('has exactly 9 extensions', async () => {
    const { getBaseExtensions } = await import('./editorExtensions');
    const extensions = getBaseExtensions(baseOptions);
    // StarterKit, TaskList, TaskItem, Link, Placeholder, Typography,
    // ImageUploadExtension, WikiLink, CodeBlockExtension = 9
    expect(extensions).toHaveLength(9);
  });

  it('configures StarterKit to disable its built-in Link extension', async () => {
    const StarterKit = (await import('@tiptap/starter-kit')).default;
    const { getBaseExtensions } = await import('./editorExtensions');

    getBaseExtensions(baseOptions);

    expect(StarterKit.configure).toHaveBeenCalledWith(
      expect.objectContaining({ link: false })
    );
  });

  it('configures StarterKit to disable its built-in codeBlock extension', async () => {
    const StarterKit = (await import('@tiptap/starter-kit')).default;
    const { getBaseExtensions } = await import('./editorExtensions');

    getBaseExtensions(baseOptions);

    expect(StarterKit.configure).toHaveBeenCalledWith(
      expect.objectContaining({ codeBlock: false })
    );
  });

  it('configures StarterKit with heading levels 1-6', async () => {
    const StarterKit = (await import('@tiptap/starter-kit')).default;
    const { getBaseExtensions } = await import('./editorExtensions');

    getBaseExtensions(baseOptions);

    expect(StarterKit.configure).toHaveBeenCalledWith(
      expect.objectContaining({
        heading: { levels: [1, 2, 3, 4, 5, 6] },
      })
    );
  });

  it('uses the provided placeholder string', async () => {
    const Placeholder = (await import('@tiptap/extension-placeholder')).default;
    const { getBaseExtensions } = await import('./editorExtensions');

    getBaseExtensions({ ...baseOptions, placeholder: 'Write something amazing...' });

    expect(Placeholder.configure).toHaveBeenCalledWith(
      expect.objectContaining({ placeholder: 'Write something amazing...' })
    );
  });

  it('uses default placeholder when none provided', async () => {
    const Placeholder = (await import('@tiptap/extension-placeholder')).default;
    const { getBaseExtensions } = await import('./editorExtensions');

    getBaseExtensions(baseOptions);

    expect(Placeholder.configure).toHaveBeenCalledWith(
      expect.objectContaining({ placeholder: 'Start writing...' })
    );
  });

  describe('collaborative mode', () => {
    it('disables StarterKit undoRedo when collaborative=true', async () => {
      const StarterKit = (await import('@tiptap/starter-kit')).default;
      const { getBaseExtensions } = await import('./editorExtensions');

      getBaseExtensions({ ...baseOptions, collaborative: true });

      expect(StarterKit.configure).toHaveBeenCalledWith(
        expect.objectContaining({ undoRedo: false })
      );
    });

    it('does NOT disable StarterKit undoRedo when collaborative=false', async () => {
      const StarterKit = (await import('@tiptap/starter-kit')).default;
      const { getBaseExtensions } = await import('./editorExtensions');

      getBaseExtensions({ ...baseOptions, collaborative: false });

      // undoRedo should not be in the call args (not set)
      const callArgs = (StarterKit.configure as ReturnType<typeof vi.fn>).mock.calls[0][0] as Record<string, unknown>;
      expect(callArgs.undoRedo).toBeUndefined();
    });

    it('does NOT disable StarterKit undoRedo when collaborative is not specified', async () => {
      const StarterKit = (await import('@tiptap/starter-kit')).default;
      const { getBaseExtensions } = await import('./editorExtensions');

      getBaseExtensions(baseOptions);

      const callArgs = (StarterKit.configure as ReturnType<typeof vi.fn>).mock.calls[0][0] as Record<string, unknown>;
      expect(callArgs.undoRedo).toBeUndefined();
    });

    it('returns same number of extensions in collaborative mode', async () => {
      const { getBaseExtensions } = await import('./editorExtensions');
      const nonCollab = getBaseExtensions({ ...baseOptions, collaborative: false });
      const collab = getBaseExtensions({ ...baseOptions, collaborative: true });
      // getBaseExtensions returns the same extensions in both modes;
      // Collaboration-specific extensions are added separately by the editor component
      expect(collab).toHaveLength(nonCollab.length);
    });
  });

  describe('EDITOR_PROSE_CLASS', () => {
    it('is a non-empty string', async () => {
      const { EDITOR_PROSE_CLASS } = await import('./editorExtensions');
      expect(typeof EDITOR_PROSE_CLASS).toBe('string');
      expect(EDITOR_PROSE_CLASS.length).toBeGreaterThan(0);
    });

    it('contains tiptap-editor class', async () => {
      const { EDITOR_PROSE_CLASS } = await import('./editorExtensions');
      expect(EDITOR_PROSE_CLASS).toContain('tiptap-editor');
    });

    it('contains prose class for typography styling', async () => {
      const { EDITOR_PROSE_CLASS } = await import('./editorExtensions');
      expect(EDITOR_PROSE_CLASS).toContain('prose');
    });
  });

  describe('EDITOR_ATTRIBUTES', () => {
    // TipTap 3.33+ sets role="textbox" on the editor element; a textbox needs a name (axe).
    it('names the editor textbox and keeps the prose class', async () => {
      const { EDITOR_ATTRIBUTES, EDITOR_PROSE_CLASS } = await import('./editorExtensions');
      expect(EDITOR_ATTRIBUTES).toEqual({
        class: EDITOR_PROSE_CLASS,
        'aria-label': 'Note content',
        'aria-multiline': 'true',
      });
    });
  });
});
