import { useQuery } from '@tanstack/react-query';
import { foldersApi, tagsApi } from './api';

const VIRTUAL_LABELS: Record<string, string> = {
  shared: 'Shared with me',
  'my-shares': 'My shares',
  unfiled: 'Unfiled',
  trash: 'Trash',
  'service-accounts': 'Service accounts',
};

/** Query key prefix: invalidate it after a rename so the next pick shows the new name. */
export const FILTER_LABEL_QUERY_KEY = ['mobile-shell'] as const;

export interface NotesFilterLabel {
  label: string;
  kind: 'all' | 'folder' | 'tag';
  /** Name of the selected real folder (not a view, not a tag), for the Tasks title. */
  folderName: string | null;
}

/**
 * Name of the current notes filter for the mobile top bar title ("All notes", a view, a folder or a
 * tag). Folder and tag names come from the same endpoints the sidebar uses. The queries are keyed on
 * the list, not on the selection, so changing the folder never refetches; they only run when the
 * mobile shell is on and a real folder or tag is selected.
 */
export function useNotesFilterLabel(folderId: string | null, tagId: string | null, enabled: boolean): NotesFilterLabel {
  const realFolder = folderId !== null && !Object.hasOwn(VIRTUAL_LABELS, folderId);

  const { data: folders } = useQuery({
    queryKey: [...FILTER_LABEL_QUERY_KEY, 'folders'],
    queryFn: async () => (await foldersApi.list()).data.folders as Array<{ id: string; name: string }>,
    enabled: enabled && realFolder,
  });
  const { data: tags } = useQuery({
    queryKey: [...FILTER_LABEL_QUERY_KEY, 'tags'],
    queryFn: async () => (await tagsApi.list()).data.tags as Array<{ id: string; name: string }>,
    enabled: enabled && tagId !== null,
  });

  const folderName = realFolder ? (folders?.find((f) => f.id === folderId)?.name ?? 'Folder') : null;

  if (tagId !== null) {
    return { kind: 'tag', label: tags?.find((t) => t.id === tagId)?.name ?? 'Tag', folderName };
  }
  if (folderId === null) return { kind: 'all', label: 'All notes', folderName };
  if (!realFolder) return { kind: 'folder', label: VIRTUAL_LABELS[folderId], folderName };
  return { kind: 'folder', label: folderName ?? 'Folder', folderName };
}
