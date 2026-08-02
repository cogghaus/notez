import { prisma } from '../lib/db.js';
import type { CreateNoteInput, UpdateNoteInput } from '../utils/validation.schemas.js';
import { syncNoteLinks } from './notelink.service.js';
import { checkNoteAccess, isNoteShared } from './share.service.js';
import { NotFoundError } from '../utils/errors.js';

/**
 * Get note by exact title (case-insensitive)
 * Returns the note if the user is the owner
 */
export async function getNoteByTitle(title: string, userId: string) {
  const note = await prisma.note.findFirst({
    where: {
      userId,
      deleted: false,
      title: {
        equals: title,
        mode: 'insensitive',
      },
    },
    include: {
      folder: { select: { id: true, name: true } },
      tags: {
        include: {
          tag: { select: { id: true, name: true } },
        },
      },
    },
  });

  if (!note) {
    throw new NotFoundError('Note not found with that title');
  }

  return {
    ...note,
    tags: note.tags.map((nt: any) => nt.tag),
  };
}

/**
 * Get note by ID
 * Returns the note if the user is the owner OR has a share record
 */
export async function getNoteById(noteId: string, userId: string) {
  // First check access (owner or shared)
  const access = await checkNoteAccess(noteId, userId);

  if (!access.hasAccess) {
    throw new Error('Note not found');
  }

  const note = await prisma.note.findUnique({
    where: { id: noteId },
    include: {
      user: {
        select: { id: true, username: true },
      },
      folder: {
        select: {
          id: true,
          name: true,
        },
      },
      tags: {
        include: {
          tag: {
            select: {
              id: true,
              name: true,
            },
          },
        },
      },
    },
  });

  if (!note) {
    throw new Error('Note not found');
  }

  // Check if note has active shares
  const shared = await isNoteShared(noteId);

  // Transform tags to simpler format
  return {
    ...note,
    tags: note.tags.map((nt: any) => nt.tag),
    permission: access.permission,
    isShared: shared,
    owner: note.user,
  };
}

/**
 * List all notes for a user
 * Supports filtering by folder, tag, and search
 */
export async function listNotes(
  userId: string,
  options?: {
    folderId?: string | null;
    tagId?: string;
    search?: string;
    createdByTokenId?: string;
    agentCreated?: boolean;
    limit?: number;
    offset?: number;
  }
) {
  const { folderId, tagId, search, createdByTokenId, agentCreated, limit = 50, offset = 0 } = options || {};

  // Build where clause
  const where: any = { userId, deleted: false }; // Exclude deleted notes by default

  // Filter by folder (null means unfiled notes)
  if (folderId !== undefined) {
    where.folderId = folderId;
  }

  // Filter by specific agent token
  if (createdByTokenId) {
    where.createdByTokenId = createdByTokenId;
  }

  // Filter by any agent-created content
  if (agentCreated !== undefined) {
    if (agentCreated) {
      where.createdByToken = { isAgent: true };
    } else {
      // Use AND to avoid clobbering other OR clauses (e.g. search)
      if (!where.AND) where.AND = [];
      where.AND.push({
        OR: [
          { createdByTokenId: null },
          { createdByToken: { isAgent: false } },
        ],
      });
    }
  }

  // Filter by tag
  if (tagId) {
    where.tags = {
      some: {
        tagId,
      },
    };
  }

  // Search in title and content
  if (search) {
    if (!where.AND) where.AND = [];
    where.AND.push({
      OR: [
        { title: { contains: search, mode: 'insensitive' } },
        { content: { contains: search, mode: 'insensitive' } },
      ],
    });
  }

  const [notes, total] = await Promise.all([
    prisma.note.findMany({
      where,
      include: {
        folder: {
          select: {
            id: true,
            name: true,
          },
        },
        tags: {
          include: {
            tag: {
              select: {
                id: true,
                name: true,
              },
            },
          },
        },
        shares: {
          select: { id: true },
          take: 1, // Only need to know if any shares exist, not all of them
        },
      },
      orderBy: {
        updatedAt: 'desc',
      },
      take: limit,
      skip: offset,
    }),
    prisma.note.count({ where }),
  ]);

  // Transform tags to simpler format and add isShared flag
  const transformedNotes = notes.map((note: any) => {
    const { shares, ...rest } = note;
    return {
      ...rest,
      tags: note.tags.map((nt: any) => nt.tag),
      isShared: shares.length > 0,
    };
  });

  return {
    notes: transformedNotes,
    total,
    limit,
    offset,
  };
}

/**
 * Create a new note
 */
export async function createNote(userId: string, data: CreateNoteInput, createdByTokenId?: string) {
  return prisma.$transaction(async (tx: any) => {
    // If folderId is provided, verify it belongs to the user
    if (data.folderId) {
      const folder = await tx.folder.findFirst({
        where: {
          id: data.folderId,
          userId,
        },
      });

      if (!folder) {
        throw new Error('Folder not found');
      }
    }

    // Handle tags if provided - use upsert to prevent race conditions
    let tagConnections: any[] = [];
    if (data.tags && data.tags.length > 0) {
      const tagUpserts = data.tags.map((tagName) =>
        tx.tag.upsert({
          where: { userId_name: { userId, name: tagName } },
          update: {},
          create: { name: tagName, userId, createdByTokenId: createdByTokenId || null },
        })
      );

      const tags = await Promise.all(tagUpserts);
      tagConnections = tags.map((tag) => ({
        tag: { connect: { id: tag.id } },
      }));
    }

    // Create note with tags
    const note = await tx.note.create({
      data: {
        title: data.title,
        content: data.content || null,
        userId,
        folderId: data.folderId || null,
        createdByTokenId: createdByTokenId || null,
        tags: {
          create: tagConnections,
        },
      },
      include: {
        folder: {
          select: {
            id: true,
            name: true,
          },
        },
        tags: {
          include: {
            tag: {
              select: {
                id: true,
                name: true,
              },
            },
          },
        },
      },
    });

    // Transform tags to simpler format
    const result = {
      ...note,
      tags: note.tags.map((nt: any) => nt.tag),
    };

    // Sync wiki-links asynchronously (don't block the response)
    syncNoteLinks(note.id, note.content).catch((err) => {
      console.error('Failed to sync note links:', err);
    });

    return result;
  });
}

/**
 * Update a note
 * Allows updates by owner or users with EDIT share permission
 */
export async function updateNote(noteId: string, userId: string, data: UpdateNoteInput, createdByTokenId?: string) {
  return prisma.$transaction(async (tx: any) => {
    // Inline access check using the transaction's tx client to avoid TOCTOU race
    const note = await tx.note.findFirst({
      where: { id: noteId, deleted: false },
      select: { userId: true },
    });
    if (!note) throw new Error('Note not found');

    const isOwner = note.userId === userId;
    let hasEditAccess = isOwner;

    if (!isOwner) {
      const share = await tx.noteShare.findUnique({
        where: { noteId_sharedWithId: { noteId, sharedWithId: userId } },
        select: { permission: true },
      });
      if (!share) throw new Error('Note not found');
      if (share.permission !== 'EDIT') throw new Error('View-only access');
      hasEditAccess = true;
    }

    if (!hasEditAccess) {
      throw new Error('Note not found');
    }

    const existingNote = await tx.note.findUnique({
      where: { id: noteId },
    });

    if (!existingNote) {
      throw new Error('Note not found');
    }

    const effectiveUserId = existingNote.userId; // Always use note owner for tag operations

    // Only owner can change folder
    if (data.folderId !== undefined && data.folderId !== null) {
      if (!isOwner) {
        throw new Error('Only the owner can change the folder');
      }
      const folder = await tx.folder.findFirst({
        where: {
          id: data.folderId,
          userId: effectiveUserId,
        },
      });

      if (!folder) {
        throw new Error('Folder not found');
      }
    }

    // Only owner can change tags
    if (data.tags !== undefined && isOwner) {
      // Remove existing tag associations
      await tx.noteTag.deleteMany({
        where: { noteId },
      });

      // Add new tags using upsert to prevent race conditions
      if (data.tags.length > 0) {
        const tagUpserts = data.tags.map((tagName) =>
          tx.tag.upsert({
            where: { userId_name: { userId: effectiveUserId, name: tagName } },
            update: {},
            create: { name: tagName, userId: effectiveUserId, createdByTokenId: createdByTokenId || null },
          })
        );
        const tags = await Promise.all(tagUpserts);

        // Create note-tag associations
        await tx.noteTag.createMany({
          data: tags.map((tag) => ({
            noteId,
            tagId: tag.id,
          })),
        });
      }
    }

    // Build update data - shared users can only update title and content
    const updateData: any = {};
    if (data.title !== undefined) updateData.title = data.title;
    if (data.content !== undefined) updateData.content = data.content;
    if (isOwner) {
      if (data.folderId !== undefined) updateData.folderId = data.folderId;
    }

    // Update note
    const updatedNote = await tx.note.update({
      where: { id: noteId },
      data: updateData,
      include: {
        folder: {
          select: {
            id: true,
            name: true,
          },
        },
        tags: {
          include: {
            tag: {
              select: {
                id: true,
                name: true,
              },
            },
          },
        },
      },
    });

    // Transform tags to simpler format
    const result = {
      ...updatedNote,
      tags: updatedNote.tags.map((nt: any) => nt.tag),
    };

    // Sync wiki-links if content was updated
    if (data.content !== undefined) {
      syncNoteLinks(updatedNote.id, updatedNote.content).catch((err) => {
        console.error('Failed to sync note links:', err);
      });

      // Push the new content into the Yjs CRDT as well, otherwise the collaborative
      // editor keeps serving its stored state and silently reverts this write the
      // next time the note is opened. Imported lazily so that consumers which only
      // need note CRUD do not pull in the Hocuspocus server.
      import('./collaboration.service.js')
        .then(({ syncNoteContentToYjs }) =>
          syncNoteContentToYjs(updatedNote.id, updatedNote.content || '')
        )
        .catch((err) => {
          console.error('Failed to sync note content to Yjs:', err);
        });
    }

    return result;
  });
}

/**
 * Soft delete a note (move to trash)
 */
export async function deleteNote(noteId: string, userId: string) {
  // Verify note exists and belongs to user
  const note = await prisma.note.findFirst({
    where: {
      id: noteId,
      userId,
    },
  });

  if (!note) {
    throw new Error('Note not found');
  }

  // Soft delete by marking as deleted
  await prisma.note.update({
    where: { id: noteId },
    data: {
      deleted: true,
      deletedAt: new Date(),
    },
  });

  return { success: true };
}

/**
 * List deleted notes (trash)
 */
export async function listDeletedNotes(
  userId: string,
  options?: {
    limit?: number;
    offset?: number;
  }
) {
  const { limit = 50, offset = 0 } = options || {};

  const [notes, total] = await Promise.all([
    prisma.note.findMany({
      where: { userId, deleted: true },
      include: {
        folder: {
          select: {
            id: true,
            name: true,
          },
        },
        tags: {
          include: {
            tag: {
              select: {
                id: true,
                name: true,
              },
            },
          },
        },
      },
      orderBy: {
        deletedAt: 'desc',
      },
      take: limit,
      skip: offset,
    }),
    prisma.note.count({ where: { userId, deleted: true } }),
  ]);

  // Transform tags to simpler format
  const transformedNotes = notes.map((note: any) => ({
    ...note,
    tags: note.tags.map((nt: any) => nt.tag),
  }));

  return {
    notes: transformedNotes,
    total,
    limit,
    offset,
  };
}

/**
 * Restore a note from trash
 */
export async function restoreNote(noteId: string, userId: string) {
  const note = await prisma.note.findFirst({
    where: {
      id: noteId,
      userId,
      deleted: true,
    },
  });

  if (!note) {
    throw new Error('Note not found in trash');
  }

  await prisma.note.update({
    where: { id: noteId },
    data: {
      deleted: false,
      deletedAt: null,
    },
  });

  return { success: true };
}

/**
 * Permanently delete a note
 */
export async function permanentlyDeleteNote(noteId: string, userId: string) {
  const note = await prisma.note.findFirst({
    where: {
      id: noteId,
      userId,
    },
  });

  if (!note) {
    throw new Error('Note not found');
  }

  // Permanently delete note (tags will be cascade deleted via NoteTag relation)
  await prisma.note.delete({
    where: { id: noteId },
  });

  return { success: true };
}

/**
 * Get note statistics for a user
 */
export async function getNoteStats(userId: string) {
  const [totalNotes, unfiledNotes, deletedNotes, foldersWithNotes, sharedByMeCount, sharedWithMeCount] = await prisma.$transaction([
    prisma.note.count({ where: { userId, deleted: false } }),
    prisma.note.count({ where: { userId, folderId: null, deleted: false } }),
    prisma.note.count({ where: { userId, deleted: true } }),
    prisma.folder.findMany({
      where: { userId },
      select: {
        id: true,
        name: true,
        _count: {
          select: {
            notes: {
              where: { deleted: false }
            }
          },
        },
      },
      orderBy: {
        name: 'asc',
      },
    }),
    prisma.note.count({ where: { userId, deleted: false, shares: { some: {} } } }),
    prisma.noteShare.count({ where: { sharedWithId: userId, note: { deleted: false } } }),
  ]);

  return {
    totalNotes,
    unfiledNotes,
    deletedNotes,
    folders: foldersWithNotes,
    sharedByMeCount,
    sharedWithMeCount,
  };
}
