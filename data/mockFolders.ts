import type { Folder } from './types';

// Minimal folder set for unauthenticated / demo mode screens.
// When authenticated, folders should come from the API via NotesContext.
export const mockFolders: Folder[] = [
  {
    id: 'all-icloud',
    name: 'All Notes',
    icon: 'folder',
    noteCount: 0,
    color: undefined,
    isSystem: true,
    sortOrder: 0,
    parentId: null,
    depth: 0,
    children: [],
  },
];

