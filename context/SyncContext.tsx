import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import { AppState, AppStateStatus } from 'react-native';
import { syncEngine, audioUploader, type SyncStatus, type UploadStatus } from '@/lib/sync';
import { useNetwork } from './NetworkContext';
import { useAuth } from './AuthContext';

interface SyncContextType {
  // Sync status
  isSyncing: boolean;
  pendingCount: number;
  failedCount: number;
  lastSyncAt: string | null;
  lastError: string | null;
  // Audio upload status
  isUploadingAudio: boolean;
  pendingAudioUploads: number;
  currentAudioUpload: UploadStatus['currentUpload'];
  // Actions
  syncNow: () => Promise<void>;
  retryFailed: () => Promise<void>;
}

const SyncContext = createContext<SyncContextType | null>(null);

export function SyncProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const { isOnline } = useNetwork();
  const [status, setStatus] = useState<SyncStatus>({
    isSyncing: false,
    pendingCount: 0,
    failedCount: 0,
    lastSyncAt: null,
    lastError: null,
  });
  const [uploadStatus, setUploadStatus] = useState<UploadStatus>({
    isUploading: false,
    pendingCount: 0,
    currentUpload: null,
    lastError: null,
  });
  const appStateRef = useRef<AppStateStatus>(AppState.currentState);

  // Initialize sync engine and audio uploader when user is available
  useEffect(() => {
    if (!user?.id) return;

    syncEngine.initialize(user.id);
    audioUploader.initialize();

    // Subscribe to status changes
    const unsubscribeSyncEngine = syncEngine.subscribe((newStatus) => {
      setStatus(newStatus);
    });

    const unsubscribeAudioUploader = audioUploader.subscribe((newStatus) => {
      setUploadStatus(newStatus);
    });

    // Get initial status
    syncEngine.getStatus().then(setStatus);
    audioUploader.getStatus().then(setUploadStatus);

    return () => {
      unsubscribeSyncEngine();
      unsubscribeAudioUploader();
    };
  }, [user?.id]);

  // Sync when coming online
  useEffect(() => {
    if (isOnline && user?.id) {
      syncEngine.triggerSync();
      // Also process audio upload queue
      audioUploader.processQueue().catch(console.warn);
    }
  }, [isOnline, user?.id]);

  // Sync when app comes to foreground
  useEffect(() => {
    const handleAppStateChange = (nextAppState: AppStateStatus) => {
      if (
        appStateRef.current.match(/inactive|background/) &&
        nextAppState === 'active' &&
        isOnline &&
        user?.id
      ) {
        console.log('[SyncContext] App foregrounded, triggering sync');
        syncEngine.triggerSync();
        audioUploader.processQueue().catch(console.warn);
      }
      appStateRef.current = nextAppState;
    };

    const subscription = AppState.addEventListener('change', handleAppStateChange);
    return () => subscription.remove();
  }, [isOnline, user?.id]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      syncEngine.destroy();
      audioUploader.destroy();
    };
  }, []);

  const syncNow = useCallback(async () => {
    if (!isOnline) {
      console.log('[SyncContext] Cannot sync - offline');
      return;
    }

    await syncEngine.fullSync();
  }, [isOnline]);

  const retryFailed = useCallback(async () => {
    const { syncQueueService } = await import('@/lib/sync');
    const count = await syncQueueService.retryFailed();
    console.log('[SyncContext] Retrying', count, 'failed items');

    if (isOnline) {
      syncEngine.triggerSync();
    }
  }, [isOnline]);

  return (
    <SyncContext.Provider
      value={{
        isSyncing: status.isSyncing,
        pendingCount: status.pendingCount,
        failedCount: status.failedCount,
        lastSyncAt: status.lastSyncAt,
        lastError: status.lastError,
        isUploadingAudio: uploadStatus.isUploading,
        pendingAudioUploads: uploadStatus.pendingCount,
        currentAudioUpload: uploadStatus.currentUpload,
        syncNow,
        retryFailed,
      }}
    >
      {children}
    </SyncContext.Provider>
  );
}

export function useSync(): SyncContextType {
  const context = useContext(SyncContext);
  if (!context) {
    throw new Error('useSync must be used within a SyncProvider');
  }
  return context;
}

export default SyncContext;
