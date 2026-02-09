/**
 * useNoteDetail Hook
 *
 * Fetches and manages a single note using TanStack Query for SWR caching.
 */

import { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import * as Crypto from 'expo-crypto';
import { useQueryClient } from '@tanstack/react-query';
import { useNoteDetailQuery, useUpdateNoteMutation, useDeleteNoteMutation, queryKeys } from '@/hooks/queries';
import { notesService, NoteDetailResponse } from '@/services/notes';
import { actionsService, ActionExecuteResponse } from '@/services/actions';
import { voiceService, InputHistoryEntry, UpdateDecision } from '@/services/voice';
import { Note } from '@/data/types';
import { useNotes } from '@/context/NotesContext';
import { noteInputsRepository, noteVersionsRepository } from '@/lib/repositories';
import type { NoteInputInsert } from '@/lib/database/schema';

/**
 * Convert raw_inputs from a SynthesisResponse into NoteInputInsert rows.
 */
function rawInputsToInserts(noteId: string, rawInputs: InputHistoryEntry[]): NoteInputInsert[] {
  return rawInputs.map((entry) => ({
    id: Crypto.randomUUID(),
    note_id: noteId,
    created_at: entry.timestamp,
    type: entry.type,
    source: 'user' as const,
    text_plain: entry.content || null,
    audio_url: entry.audio_key || null,
    meta: entry.duration != null ? JSON.stringify({ duration: entry.duration }) : null,
    sync_status: 'synced' as const,
  }));
}

export function useNoteDetail(noteId: string | undefined) {
  const queryClient = useQueryClient();
  const { getCachedNote, clearCachedNote } = useNotes();

  // Append audio state
  const [isAppending, setIsAppending] = useState(false);
  const [appendProgress, setAppendProgress] = useState(0);
  const [appendStatus, setAppendStatus] = useState('');
  const [lastDecision, setLastDecision] = useState<UpdateDecision | null>(null);

  // Use TanStack Query for note fetching
  const {
    data: rawNote,
    isLoading,
    error: queryError,
    refetch,
  } = useNoteDetailQuery(noteId);

  // Check cache first for instant display (for newly created notes)
  const cachedNote = noteId ? getCachedNote(noteId) : null;
  const displayNote = cachedNote || rawNote || null;

  // Clear cache once we have fresh data from API
  if (rawNote && cachedNote && noteId) {
    clearCachedNote(noteId);
  }

  const error = queryError ? (queryError as Error).message : null;

  // Mutations
  const updateNoteMutation = useUpdateNoteMutation();
  const deleteNoteMutation = useDeleteNoteMutation();

  const refresh = useCallback(async () => {
    await refetch();
  }, [refetch]);

  const updateNote = useCallback(async (data: { title?: string; transcript?: string; tags?: string[] }): Promise<boolean> => {
    if (!noteId) return false;
    try {
      await updateNoteMutation.mutateAsync({ noteId, data });
      return true;
    } catch {
      return false;
    }
  }, [noteId, updateNoteMutation]);

  const deleteNote = useCallback(async (): Promise<boolean> => {
    if (!noteId) return false;
    try {
      await deleteNoteMutation.mutateAsync({ noteId });
      return true;
    } catch {
      return false;
    }
  }, [noteId, deleteNoteMutation]);

  const executeAction = useCallback(async (actionId: string, service: 'google' | 'apple'): Promise<ActionExecuteResponse | null> => {
    const { data, error: apiError } = await actionsService.executeAction(actionId, service);
    if (apiError) {
      return null;
    }
    await refresh();
    return data || null;
  }, [refresh]);

  const completeAction = useCallback(async (actionId: string): Promise<boolean> => {
    const { data, error: apiError } = await actionsService.completeAction(actionId);
    if (apiError) {
      return false;
    }
    await refresh();
    return !!data;
  }, [refresh]);

  const appendAudio = useCallback(async (audioUri: string): Promise<boolean> => {
    if (!noteId) return false;

    setIsAppending(true);
    setAppendProgress(0);
    setAppendStatus('Starting...');

    const { data, error: apiError } = await voiceService.appendToNote(
      noteId,
      audioUri,
      (progress, status) => {
        setAppendProgress(progress);
        setAppendStatus(status);
      }
    );

    setIsAppending(false);
    setAppendProgress(0);
    setAppendStatus('');

    if (apiError) {
      return false;
    }

    // Refresh note to get updated data
    await refresh();
    return true;
  }, [noteId, refresh]);

  /**
   * Add content to an existing note (text and/or audio).
   * Default behavior: transcribe and append (no AI re-synthesis).
   * User can explicitly set resynthesize=true to combine/summarize.
   */
  const addContent = useCallback(async (options: {
    textInput?: string;
    audioUri?: string;
    resynthesize?: boolean;
  }): Promise<boolean> => {
    if (!noteId) return false;

    setIsAppending(true);
    setAppendProgress(0);
    setAppendStatus('Starting...');
    setLastDecision(null);

    const { data, error: apiError } = await voiceService.addToNote(
      noteId,
      {
        ...options,
        autoDecide: false,  // Don't let AI auto-decide - user controls resynthesize explicitly
      },
      (progress, status) => {
        setAppendProgress(progress);
        setAppendStatus(status);
      }
    );

    setIsAppending(false);
    setAppendProgress(0);
    setAppendStatus('');

    if (apiError) {
      return false;
    }

    // Track the decision made by smart synthesis
    if (data?.decision) {
      setLastDecision(data.decision);
    }

    // Directly sync note_inputs from the API response's raw_inputs
    if (data?.raw_inputs?.length) {
      try {
        await noteInputsRepository.replaceAllForNote(noteId, rawInputsToInserts(noteId, data.raw_inputs));
      } catch (err) {
        console.warn('[useNoteDetail] Failed to sync note_inputs from addContent:', err);
      }
    }

    // Create a version snapshot after content addition
    try {
      await noteVersionsRepository.create({
        note_id: noteId,
        kind: data?.decision?.update_type === 'resynthesize' ? 'synth' : 'manual',
        actor: 'user',
        title: data?.title || null,
        body_plain: data?.narrative || null,
        summary_plain: data?.summary || null,
      });
      await noteVersionsRepository.prune(noteId);
    } catch (err) {
      console.warn('[useNoteDetail] Failed to create version after addContent:', err);
    }

    // Refresh note to get updated data
    await refresh();
    return true;
  }, [noteId, refresh]);

  /**
   * Delete an input from the note's input history.
   * Triggers re-synthesis from remaining inputs.
   */
  const deleteInput = useCallback(async (inputIndex: number): Promise<boolean> => {
    if (!noteId) return false;

    setIsAppending(true);
    setAppendProgress(0);
    setAppendStatus('Deleting input...');

    const { data, error: apiError } = await voiceService.deleteInput(
      noteId,
      inputIndex,
      (progress, status) => {
        setAppendProgress(progress);
        setAppendStatus(status);
      }
    );

    setIsAppending(false);
    setAppendProgress(0);
    setAppendStatus('');

    if (apiError) {
      return false;
    }

    // Sync note_inputs from the response's raw_inputs
    if (data?.raw_inputs?.length) {
      try {
        await noteInputsRepository.replaceAllForNote(noteId, rawInputsToInserts(noteId, data.raw_inputs));
      } catch (err) {
        console.warn('[useNoteDetail] Failed to sync note_inputs from deleteInput:', err);
      }
    }

    // Refresh note to get updated data
    await refresh();
    return true;
  }, [noteId, refresh]);

  /**
   * Re-synthesize the note from its input history.
   * Useful after user edits when they want AI to regenerate the narrative.
   */
  const resynthesizeNote = useCallback(async (): Promise<boolean> => {
    if (!noteId) return false;

    setIsAppending(true);
    setAppendProgress(0);
    setAppendStatus('Re-synthesizing...');

    const { data, error: apiError } = await voiceService.resynthesizeNote(
      noteId,
      (progress, status) => {
        setAppendProgress(progress);
        setAppendStatus(status);
      }
    );

    setIsAppending(false);
    setAppendProgress(0);
    setAppendStatus('');

    if (apiError) {
      return false;
    }

    // Directly sync note_inputs from the response's raw_inputs
    if (data?.raw_inputs?.length) {
      try {
        await noteInputsRepository.replaceAllForNote(noteId, rawInputsToInserts(noteId, data.raw_inputs));
      } catch (err) {
        console.warn('[useNoteDetail] Failed to sync note_inputs from resynthesize:', err);
      }
    }

    // Create a version snapshot after re-synthesis
    try {
      await noteVersionsRepository.create({
        note_id: noteId,
        kind: 'synth',
        actor: 'ai',
        title: data?.title || null,
        body_plain: data?.narrative || null,
        summary_plain: data?.summary || null,
      });
      await noteVersionsRepository.prune(noteId);
    } catch (err) {
      console.warn('[useNoteDetail] Failed to create version after resynthesize:', err);
    }

    // Refresh note to get updated data
    await refresh();
    return true;
  }, [noteId, refresh]);

  const note: Note | null = displayNote ? notesService.convertToNote(displayNote) : null;

  // Parse input history from AI metadata
  const inputHistory = useMemo((): InputHistoryEntry[] => {
    const history = displayNote?.ai_metadata?.input_history;
    if (!history || !Array.isArray(history)) return [];
    return history.map((entry: any) => ({
      type: entry.type as 'text' | 'audio',
      content: entry.content || '',
      timestamp: entry.timestamp || new Date().toISOString(),
      duration: entry.duration,
      audio_key: entry.audio_key,
    }));
  }, [displayNote?.ai_metadata?.input_history]);

  // Fallback sync: keep note_inputs in sync with ai_metadata.input_history
  // for cases where the note is loaded from cache/server without a fresh API call.
  // Uses a serialized snapshot to detect real changes (not just count).
  const lastSyncedSnapshotRef = useRef<string>('');
  useEffect(() => {
    if (!noteId || inputHistory.length === 0) return;

    const snapshot = JSON.stringify(inputHistory);
    if (lastSyncedSnapshotRef.current === snapshot) return;
    lastSyncedSnapshotRef.current = snapshot;

    (async () => {
      try {
        await noteInputsRepository.replaceAllForNote(
          noteId,
          rawInputsToInserts(noteId, inputHistory)
        );
      } catch (err) {
        console.warn('[useNoteDetail] Failed to sync note_inputs from ai_metadata:', err);
      }
    })();
  }, [noteId, inputHistory]);

  return {
    note,
    rawNote: displayNote,
    isLoading,
    error,
    refresh,
    updateNote,
    deleteNote,
    executeAction,
    completeAction,
    appendAudio,
    addContent,
    deleteInput,
    resynthesizeNote,
    inputHistory,
    lastDecision,
    isAppending,
    appendProgress,
    appendStatus,
  };
}

export default useNoteDetail;
