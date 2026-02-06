/**
 * useActionDrafts Hook
 * Manages local action state with dirty tracking, auto-save to AsyncStorage,
 * and crash recovery.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  CalendarAction,
  EmailAction,
  ReminderAction,
  NextStepAction,
  EditableAction,
} from '@/data/types';

// In-memory storage (used as fallback or when AsyncStorage is unavailable)
const memoryStorage: Record<string, string> = {};

// Simple storage wrapper - uses only in-memory for Expo Go compatibility
// TODO: Switch to expo-secure-store or build a dev client for AsyncStorage support
const storage = {
  async getItem(key: string): Promise<string | null> {
    return memoryStorage[key] || null;
  },
  async setItem(key: string, value: string): Promise<void> {
    memoryStorage[key] = value;
  },
  async removeItem(key: string): Promise<void> {
    delete memoryStorage[key];
  },
};

const DRAFT_KEY_PREFIX = 'draft_actions_';

interface ActionDraftData {
  noteId: string;
  calendarActions: CalendarAction[];
  emailActions: EmailAction[];
  reminderActions: ReminderAction[];
  nextStepActions: NextStepAction[];
  timestamp: string;
  serverActionsHash: string;
}

interface ServerAction {
  id: string;
  action_type: string;
  title: string;
  status: string;
  scheduled_date?: string | null;
  location?: string | null;
  attendees?: string[] | null;
  email_to?: string | null;
  email_subject?: string | null;
  email_body?: string | null;
  priority?: string | null;
}

interface UseActionDraftsProps {
  noteId: string | undefined;
  serverActions: ServerAction[] | undefined;
}

interface UseActionDraftsReturn {
  // State
  calendarActions: CalendarAction[];
  emailActions: EmailAction[];
  reminderActions: ReminderAction[];
  nextStepActions: NextStepAction[];
  hasUnsavedChanges: boolean;
  hasDraftToRecover: boolean;
  draftTimestamp: string | null;
  isInitialized: boolean;

  // Actions
  updateAction: (action: EditableAction) => void;
  deleteAction: (actionId: string) => void;
  addAction: (type: 'calendar' | 'email' | 'reminder' | 'nextStep') => void;

  // Recovery
  recoverDraft: () => void;
  discardDraft: () => Promise<void>;

  // Save
  saveToServer: () => Promise<boolean>;
  discardChanges: () => void;
}

// Generate a hash of server actions for comparison
function hashServerActions(actions: ServerAction[] | undefined): string {
  if (!actions) return '';
  return JSON.stringify(actions.map(a => ({ id: a.id, status: a.status })));
}

// Convert server actions to editable format
function convertServerActions(serverActions: ServerAction[] | undefined) {
  if (!serverActions) {
    return {
      calendar: [] as CalendarAction[],
      email: [] as EmailAction[],
      reminders: [] as ReminderAction[],
      nextSteps: [] as NextStepAction[],
    };
  }

  const mapCalendarStatus = (status: string): 'created' | 'pending' | 'confirmed' => {
    if (status === 'executed' || status === 'created') return 'confirmed';
    return 'pending';
  };

  const mapReminderStatus = (status: string): 'pending' | 'completed' => {
    if (status === 'executed') return 'completed';
    return 'pending';
  };

  return {
    calendar: serverActions
      .filter(a => a.action_type === 'calendar')
      .map(a => ({
        id: a.id,
        source: 'ai' as const,
        title: a.title,
        date: a.scheduled_date ? a.scheduled_date.split('T')[0] : '',
        time: a.scheduled_date
          ? new Date(a.scheduled_date).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
          : undefined,
        location: a.location ?? undefined,
        attendees: a.attendees ?? [],
        status: mapCalendarStatus(a.status),
      })),
    email: serverActions
      .filter(a => a.action_type === 'email')
      .map(a => ({
        id: a.id,
        source: 'ai' as const,
        to: a.email_to ?? '',
        subject: a.email_subject ?? a.title,
        body: a.email_body ?? '',
        preview: a.email_body ? a.email_body.slice(0, 100) : '',
        status: (a.status === 'executed' ? 'sent' : 'draft') as 'draft' | 'sent' | 'scheduled',
      })),
    reminders: serverActions
      .filter(a => a.action_type === 'reminder')
      .map(a => ({
        id: a.id,
        source: 'ai' as const,
        title: a.title,
        dueDate: a.scheduled_date ? a.scheduled_date.split('T')[0] : '',
        dueTime: a.scheduled_date
          ? new Date(a.scheduled_date).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
          : undefined,
        priority: (a.priority ?? 'medium') as 'low' | 'medium' | 'high',
        status: mapReminderStatus(a.status),
      })),
    nextSteps: serverActions
      .filter(a => a.action_type === 'next_step')
      .map(a => ({
        id: a.id,
        source: 'ai' as const,
        title: a.title,
        status: mapReminderStatus(a.status),
      })),
  };
}

export function useActionDrafts({
  noteId,
  serverActions,
}: UseActionDraftsProps): UseActionDraftsReturn {
  // Current editable state
  const [calendarActions, setCalendarActions] = useState<CalendarAction[]>([]);
  const [emailActions, setEmailActions] = useState<EmailAction[]>([]);
  const [reminderActions, setReminderActions] = useState<ReminderAction[]>([]);
  const [nextStepActions, setNextStepActions] = useState<NextStepAction[]>([]);

  // Tracking state
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [hasDraftToRecover, setHasDraftToRecover] = useState(false);
  const [draftTimestamp, setDraftTimestamp] = useState<string | null>(null);
  const [isInitialized, setIsInitialized] = useState(false);

  // Store original server state for comparison
  const serverActionsHashRef = useRef<string>('');
  const pendingDraftRef = useRef<ActionDraftData | null>(null);

  // Auto-save debounce timer
  const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Get storage key for this note
  const getStorageKey = useCallback(() => {
    return noteId ? `${DRAFT_KEY_PREFIX}${noteId}` : null;
  }, [noteId]);

  // Save draft to AsyncStorage
  const saveDraftToStorage = useCallback(async () => {
    const key = getStorageKey();
    if (!key || !noteId) return;

    const draftData: ActionDraftData = {
      noteId,
      calendarActions,
      emailActions,
      reminderActions,
      nextStepActions,
      timestamp: new Date().toISOString(),
      serverActionsHash: serverActionsHashRef.current,
    };

    try {
      await storage.setItem(key, JSON.stringify(draftData));
    } catch (error) {
      console.error('Failed to save draft:', error);
    }
  }, [noteId, calendarActions, emailActions, reminderActions, nextStepActions, getStorageKey]);

  // Load draft from AsyncStorage
  const loadDraftFromStorage = useCallback(async (): Promise<ActionDraftData | null> => {
    const key = getStorageKey();
    if (!key) return null;

    try {
      const data = await storage.getItem(key);
      if (data) {
        return JSON.parse(data) as ActionDraftData;
      }
    } catch (error) {
      console.error('Failed to load draft:', error);
    }
    return null;
  }, [getStorageKey]);

  // Delete draft from AsyncStorage
  const deleteDraftFromStorage = useCallback(async () => {
    const key = getStorageKey();
    if (!key) return;

    try {
      await storage.removeItem(key);
    } catch (error) {
      console.error('Failed to delete draft:', error);
    }
  }, [getStorageKey]);

  // Check for existing draft on mount
  useEffect(() => {
    if (!noteId) return;

    const checkForDraft = async () => {
      const draft = await loadDraftFromStorage();
      if (draft && draft.noteId === noteId) {
        // Check if draft is for the same server state
        const currentHash = hashServerActions(serverActions);
        if (draft.serverActionsHash === currentHash || !currentHash) {
          // Draft is valid - offer recovery
          pendingDraftRef.current = draft;
          setHasDraftToRecover(true);
          setDraftTimestamp(draft.timestamp);
        } else {
          // Server state changed - discard old draft
          await deleteDraftFromStorage();
        }
      }
    };

    checkForDraft();
  }, [noteId, loadDraftFromStorage, deleteDraftFromStorage, serverActions]);

  // Initialize from server actions when they load
  useEffect(() => {
    if (!serverActions || isInitialized || hasDraftToRecover) return;

    const converted = convertServerActions(serverActions);
    setCalendarActions(converted.calendar);
    setEmailActions(converted.email);
    setReminderActions(converted.reminders);
    setNextStepActions(converted.nextSteps);
    serverActionsHashRef.current = hashServerActions(serverActions);
    setIsInitialized(true);
  }, [serverActions, isInitialized, hasDraftToRecover]);

  // Auto-save to AsyncStorage when changes are made
  useEffect(() => {
    if (!hasUnsavedChanges || !isInitialized) return;

    // Debounce auto-save
    if (autoSaveTimerRef.current) {
      clearTimeout(autoSaveTimerRef.current);
    }

    autoSaveTimerRef.current = setTimeout(() => {
      saveDraftToStorage();
    }, 1000);

    return () => {
      if (autoSaveTimerRef.current) {
        clearTimeout(autoSaveTimerRef.current);
      }
    };
  }, [hasUnsavedChanges, isInitialized, saveDraftToStorage, calendarActions, emailActions, reminderActions, nextStepActions]);

  // Recover draft
  const recoverDraft = useCallback(() => {
    const draft = pendingDraftRef.current;
    if (!draft) return;

    setCalendarActions(draft.calendarActions);
    setEmailActions(draft.emailActions);
    setReminderActions(draft.reminderActions);
    setNextStepActions(draft.nextStepActions);
    setHasUnsavedChanges(true);
    setHasDraftToRecover(false);
    setDraftTimestamp(null);
    pendingDraftRef.current = null;
    setIsInitialized(true);
  }, []);

  // Discard draft and load server state
  const discardDraft = useCallback(async () => {
    await deleteDraftFromStorage();
    pendingDraftRef.current = null;
    setHasDraftToRecover(false);
    setDraftTimestamp(null);

    // Load from server
    const converted = convertServerActions(serverActions);
    setCalendarActions(converted.calendar);
    setEmailActions(converted.email);
    setReminderActions(converted.reminders);
    setNextStepActions(converted.nextSteps);
    setHasUnsavedChanges(false);
    setIsInitialized(true);
  }, [deleteDraftFromStorage, serverActions]);

  // Discard changes (revert to server state without deleting draft)
  const discardChanges = useCallback(() => {
    const converted = convertServerActions(serverActions);
    setCalendarActions(converted.calendar);
    setEmailActions(converted.email);
    setReminderActions(converted.reminders);
    setNextStepActions(converted.nextSteps);
    setHasUnsavedChanges(false);
    deleteDraftFromStorage();
  }, [serverActions, deleteDraftFromStorage]);

  // Update action
  const updateAction = useCallback((updatedAction: EditableAction) => {
    const markModified = { ...updatedAction, isModified: true };

    if ('date' in updatedAction && 'attendees' in updatedAction) {
      setCalendarActions(prev =>
        prev.map(a => a.id === updatedAction.id ? markModified as CalendarAction : a)
      );
    } else if ('to' in updatedAction && 'subject' in updatedAction) {
      setEmailActions(prev =>
        prev.map(a => a.id === updatedAction.id ? markModified as EmailAction : a)
      );
    } else if ('dueDate' in updatedAction && 'priority' in updatedAction) {
      setReminderActions(prev =>
        prev.map(a => a.id === updatedAction.id ? markModified as ReminderAction : a)
      );
    } else {
      setNextStepActions(prev =>
        prev.map(a => a.id === updatedAction.id ? markModified as NextStepAction : a)
      );
    }

    setHasUnsavedChanges(true);
  }, []);

  // Delete action
  const deleteAction = useCallback((actionId: string) => {
    const markDeleted = (a: EditableAction) =>
      a.id === actionId ? { ...a, isDeleted: true } : a;

    setCalendarActions(prev => prev.map(a => markDeleted(a) as CalendarAction));
    setEmailActions(prev => prev.map(a => markDeleted(a) as EmailAction));
    setReminderActions(prev => prev.map(a => markDeleted(a) as ReminderAction));
    setNextStepActions(prev => prev.map(a => markDeleted(a) as NextStepAction));

    setHasUnsavedChanges(true);
  }, []);

  // Add action
  const addAction = useCallback((type: 'calendar' | 'email' | 'reminder' | 'nextStep') => {
    const newId = `new-${Date.now()}`;
    const baseAction = { id: newId, source: 'user' as const, isNew: true };

    switch (type) {
      case 'calendar':
        setCalendarActions(prev => [...prev, {
          ...baseAction,
          title: '',
          date: new Date().toISOString().split('T')[0],
          status: 'pending' as const,
          attendees: [],
        }]);
        break;
      case 'email':
        setEmailActions(prev => [...prev, {
          ...baseAction,
          to: '',
          subject: '',
          body: '',
          status: 'draft' as const,
        }]);
        break;
      case 'reminder':
        setReminderActions(prev => [...prev, {
          ...baseAction,
          title: '',
          dueDate: new Date().toISOString().split('T')[0],
          priority: 'medium' as const,
          status: 'pending' as const,
        }]);
        break;
      case 'nextStep':
        setNextStepActions(prev => [...prev, {
          ...baseAction,
          title: '',
          status: 'pending' as const,
        }]);
        break;
    }

    setHasUnsavedChanges(true);
  }, []);

  // Save to server (placeholder - would need actual API call)
  const saveToServer = useCallback(async (): Promise<boolean> => {
    // TODO: Implement actual API call to save actions
    // For now, just clear the draft and unsaved state
    await deleteDraftFromStorage();
    setHasUnsavedChanges(false);
    return true;
  }, [deleteDraftFromStorage]);

  return {
    calendarActions,
    emailActions,
    reminderActions,
    nextStepActions,
    hasUnsavedChanges,
    hasDraftToRecover,
    draftTimestamp,
    isInitialized,
    updateAction,
    deleteAction,
    addAction,
    recoverDraft,
    discardDraft,
    saveToServer,
    discardChanges,
  };
}

export default useActionDrafts;
