import { useQuery } from '@tanstack/react-query';
import { foldersApi, tagsApi } from './api';

const VIRTUAL_LABELS: Record<string, string> = {
  shared: 'Shared with me',
  'my-shares': 'My shares',
  unfiled: 'Unfiled',
  trash: 'Trash',
  'service-accounts': 'Service accounts',
};

export interface NotesFilterLabel {
  label: string;
  kind: 'all' | 'folder' | 'tag';
}

/**
 * Name of the current notes filter for the mobile top bar title ("All notes", a view, a folder or a
 * tag). Folder and tag names come from the same endpoints the sidebar uses, fetched only when a real
 * folder or tag is selected (keyed by the selection, so a rename shows up on the next pick).
 */
export function useNotesFilterLabel(folderId: string | null, tagId: string | null): NotesFilterLabel {
  const realFolder = folderId !== null && !Object.hasOwn(VIRTUAL_LABELS, folderId);

  const { data: folders } = useQuery({
    queryKey: ['mobile-shell', 'folders', folderId],
    queryFn: async () => (await foldersApi.list()).data.folders as Array<{ id: string; name: string }>,
    enabled: realFolder,
  });
  const { data: tags } = useQuery({
    queryKey: ['mobile-shell', 'tags', tagId],
    queryFn: async () => (await tagsApi.list()).data.tags as Array<{ id: string; name: string }>,
    enabled: tagId !== null,
  });

  if (tagId !== null) {
    return { kind: 'tag', label: tags?.find((t) => t.id === tagId)?.name ?? 'Tag' };
  }
  if (folderId === null) return { kind: 'all', label: 'All notes' };
  if (Object.hasOwn(VIRTUAL_LABELS, folderId)) return { kind: 'folder', label: VIRTUAL_LABELS[folderId] };
  return { kind: 'folder', label: folders?.find((f) => f.id === folderId)?.name ?? 'Folder' };
}
