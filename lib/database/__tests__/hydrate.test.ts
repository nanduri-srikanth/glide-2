const mockNotesService = {
  listNotes: jest.fn(),
  listFolders: jest.fn(),
};

const mockNotesRepository = {
  bulkUpsert: jest.fn(),
  clearForUser: jest.fn(),
};

const mockFoldersRepository = {
  bulkUpsert: jest.fn(),
  clearForUser: jest.fn(),
};

const mockMetadataRepository = {
  get: jest.fn(),
  set: jest.fn(),
  delete: jest.fn(),
};

jest.mock('@/services/notes', () => ({
  notesService: mockNotesService,
}));

jest.mock('../../repositories', () => ({
  notesRepository: mockNotesRepository,
  foldersRepository: mockFoldersRepository,
  metadataRepository: mockMetadataRepository,
}));

describe('hydrateFromServer', () => {
  const { hydrateFromServer } = require('../hydrate');

  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('returns true and sets hydration flag when notes and folders succeed', async () => {
    mockMetadataRepository.get.mockResolvedValueOnce(null).mockResolvedValueOnce(null);
    mockNotesService.listNotes.mockResolvedValue({
      data: { items: [{ id: 'n1' }], total: 1, page: 1, per_page: 1000, pages: 1 },
    });
    mockNotesService.listFolders.mockResolvedValue({
      data: [{ id: 'f1', name: 'Folder', icon: 'folder.fill', color: null, is_system: false, note_count: 0, sort_order: 0, parent_id: null, depth: 0, children: [], created_at: new Date().toISOString() }],
    });

    const result = await hydrateFromServer('user-1');
    expect(result).toBe(true);
    expect(mockNotesRepository.bulkUpsert).toHaveBeenCalled();
    expect(mockFoldersRepository.bulkUpsert).toHaveBeenCalled();
    expect(mockMetadataRepository.set).toHaveBeenCalledWith('hydration_complete', 'true');
  });

  test('returns false when folders fail but notes succeed', async () => {
    mockMetadataRepository.get.mockResolvedValueOnce(null).mockResolvedValueOnce(null);
    mockNotesService.listNotes.mockResolvedValue({
      data: { items: [{ id: 'n1' }], total: 1, page: 1, per_page: 1000, pages: 1 },
    });
    mockNotesService.listFolders.mockResolvedValue({ error: 'failed' });

    const result = await hydrateFromServer('user-1');
    expect(result).toBe(false);
    expect(mockMetadataRepository.set).not.toHaveBeenCalledWith('hydration_complete', 'true');
  });
});
