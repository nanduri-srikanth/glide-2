import type { QueueItem } from '../SyncQueue';

jest.useFakeTimers();

const mockNotesService = {
  createNote: jest.fn(),
  updateNote: jest.fn(),
  deleteNote: jest.fn(),
  listNotes: jest.fn(),
  listAllNotes: jest.fn(),
  listFolders: jest.fn(),
  getNote: jest.fn(),
};

const mockNotesRepository = {
  upsertFromServer: jest.fn(),
  markSynced: jest.fn(),
};

const mockFoldersRepository = {
  markSynced: jest.fn(),
};

const mockSyncQueueService = {
  resetProcessing: jest.fn(),
  dequeue: jest.fn(),
  markComplete: jest.fn(),
  markFailed: jest.fn(),
  getPendingCount: jest.fn(),
  getFailedCount: jest.fn(),
};

jest.mock('@/services/notes', () => ({
  notesService: mockNotesService,
}));

jest.mock('../../repositories', () => ({
  notesRepository: mockNotesRepository,
  foldersRepository: mockFoldersRepository,
}));

jest.mock('../SyncQueue', () => ({
  syncQueueService: mockSyncQueueService,
}));

describe('SyncEngine', () => {
  const { syncEngine } = require('../SyncEngine');

  afterEach(() => {
    syncEngine.destroy();
    jest.clearAllMocks();
  });

  test('processQueue syncs create note and marks complete', async () => {
    const item: QueueItem = {
      id: 1,
      entity_type: 'note',
      entity_id: 'note-1',
      operation: 'create',
      payload: { title: 'Title', transcript: 'Body' },
      created_at: new Date().toISOString(),
      retry_count: 0,
      last_error: null,
      status: 'pending',
    };

    mockSyncQueueService.dequeue.mockResolvedValue([item]);
    mockNotesService.createNote.mockResolvedValue({ data: { id: 'note-1' } });

    await syncEngine.initialize('user-1');
    await syncEngine.processQueue();

    expect(mockNotesService.createNote).toHaveBeenCalledWith(
      expect.objectContaining({
        client_id: 'note-1',
        title: 'Title',
        transcript: 'Body',
      })
    );
    expect(mockSyncQueueService.markComplete).toHaveBeenCalledWith(1);
    expect(mockNotesRepository.markSynced).toHaveBeenCalledWith('note-1');
    expect(mockSyncQueueService.markFailed).not.toHaveBeenCalled();
  });

  test('processQueue marks failed on error', async () => {
    const item: QueueItem = {
      id: 2,
      entity_type: 'note',
      entity_id: 'note-2',
      operation: 'update',
      payload: { title: 'New Title' },
      created_at: new Date().toISOString(),
      retry_count: 0,
      last_error: null,
      status: 'pending',
    };

    mockSyncQueueService.dequeue.mockResolvedValue([item]);
    mockNotesService.updateNote.mockResolvedValue({ error: 'Update failed' });

    await syncEngine.initialize('user-1');
    await syncEngine.processQueue();

    expect(mockSyncQueueService.markFailed).toHaveBeenCalledWith(2, 'Update failed');
    expect(mockSyncQueueService.markComplete).not.toHaveBeenCalled();
  });
});
