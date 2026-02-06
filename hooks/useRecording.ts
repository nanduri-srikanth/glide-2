/**
 * useRecording Hook - Audio recording with expo-av
 * Includes Live Activity support for Dynamic Island
 * Supports offline-first audio persistence
 */

import { useState, useRef, useCallback, useEffect } from 'react';
import { Audio } from 'expo-av';
import { voiceService, VoiceProcessingResponse, SynthesisResponse } from '@/services/voice';
import { audioStorage } from '@/services/audioStorage';
import { useLiveActivity } from './useLiveActivity';

interface RecordingState {
  isRecording: boolean;
  isPaused: boolean;
  duration: number;
  uri: string | null;
  localPath: string | null; // Permanent local storage path
}

export function useRecording() {
  const [state, setState] = useState<RecordingState>({
    isRecording: false,
    isPaused: false,
    duration: 0,
    uri: null,
    localPath: null,
  });
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingProgress, setProcessingProgress] = useState(0);
  const [processingStatus, setProcessingStatus] = useState('');
  const [error, setError] = useState<string | null>(null);

  const recordingRef = useRef<Audio.Recording | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Live Activity for Dynamic Island
  const {
    startRecordingActivity,
    updateRecordingActivity,
    stopRecordingActivity,
    cancelRecordingActivity,
  } = useLiveActivity();

  useEffect(() => {
    requestPermissions();
    return () => cleanup();
  }, []);

  const requestPermissions = async () => {
    try {
      const { granted } = await Audio.requestPermissionsAsync();
      if (!granted) setError('Microphone permission is required');
    } catch (err) {
      setError('Failed to request permissions');
    }
  };

  const cleanup = () => {
    if (timerRef.current) clearInterval(timerRef.current);
    if (recordingRef.current) recordingRef.current.stopAndUnloadAsync().catch(() => {});
  };

  const startRecording = useCallback(async () => {
    try {
      setError(null);
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
        staysActiveInBackground: true,  // Continue recording when app is backgrounded
      });
      const { recording } = await Audio.Recording.createAsync(Audio.RecordingOptionsPresets.HIGH_QUALITY);
      recordingRef.current = recording;

      setState(prev => ({ ...prev, isRecording: true, isPaused: false, duration: 0 }));
      timerRef.current = setInterval(() => {
        setState(prev => ({ ...prev, duration: prev.duration + 1 }));
      }, 1000);

      // Start Live Activity for Dynamic Island
      await startRecordingActivity();
    } catch (err) {
      setError('Failed to start recording');
    }
  }, [startRecordingActivity]);

  const stopRecording = useCallback(async (noteId?: string): Promise<{ uri: string; localPath: string } | null> => {
    try {
      if (!recordingRef.current) return null;
      if (timerRef.current) clearInterval(timerRef.current);

      const finalDuration = state.duration;
      await recordingRef.current.stopAndUnloadAsync();
      const uri = recordingRef.current.getURI();
      await Audio.setAudioModeAsync({ allowsRecordingIOS: false });

      if (!uri) {
        recordingRef.current = null;
        setError('No recording URI');
        return null;
      }

      // Generate a temp note ID if not provided (for permanent storage)
      const id = noteId || `temp_${Date.now()}`;

      // Save to permanent storage
      let localPath: string | null = null;
      try {
        localPath = await audioStorage.saveAudioPermanently(uri, id);
        console.log('[useRecording] Audio saved permanently:', localPath);
      } catch (err) {
        console.warn('[useRecording] Failed to save audio permanently, using temp URI:', err);
        localPath = uri; // Fall back to temp URI
      }

      recordingRef.current = null;
      setState(prev => ({ ...prev, isRecording: false, isPaused: false, uri, localPath }));

      // Stop Live Activity with final duration
      await stopRecordingActivity(finalDuration);

      return { uri, localPath };
    } catch (err) {
      setError('Failed to stop recording');
      return null;
    }
  }, [state.duration, stopRecordingActivity]);

  const pauseRecording = useCallback(async () => {
    try {
      if (!recordingRef.current) return;
      await recordingRef.current.pauseAsync();
      if (timerRef.current) clearInterval(timerRef.current);
      setState(prev => ({ ...prev, isPaused: true }));

      // Update Live Activity to show paused state
      await updateRecordingActivity(true, state.duration);
    } catch (err) {
      setError('Failed to pause recording');
    }
  }, [state.duration, updateRecordingActivity]);

  const resumeRecording = useCallback(async () => {
    try {
      if (!recordingRef.current) return;
      await recordingRef.current.startAsync();
      timerRef.current = setInterval(() => {
        setState(prev => ({ ...prev, duration: prev.duration + 1 }));
      }, 1000);
      setState(prev => ({ ...prev, isPaused: false }));

      // Update Live Activity to show recording state
      await updateRecordingActivity(false, state.duration);
    } catch (err) {
      setError('Failed to resume recording');
    }
  }, [state.duration, updateRecordingActivity]);

  const cancelRecording = useCallback(async () => {
    // Clean up any saved audio file
    if (state.localPath && state.localPath !== state.uri) {
      try {
        await audioStorage.deleteAudio(state.localPath);
      } catch (err) {
        console.warn('[useRecording] Failed to delete local audio:', err);
      }
    }

    cleanup();
    setState({ isRecording: false, isPaused: false, duration: 0, uri: null, localPath: null });

    // Cancel Live Activity
    await cancelRecordingActivity();
  }, [cancelRecordingActivity, state.localPath, state.uri]);

  const processRecording = useCallback(async (folderId?: string, userNotes?: string): Promise<VoiceProcessingResponse | null> => {
    // Prefer localPath (permanent storage) over uri (temp)
    const audioPath = state.localPath || state.uri;
    if (!audioPath) {
      setError('No recording to process');
      return null;
    }

    setIsProcessing(true);
    setError(null);

    try {
      const { data, error: apiError } = await voiceService.processVoiceMemo(
        audioPath,
        folderId,
        (progress, status) => {
          setProcessingProgress(progress);
          setProcessingStatus(status);
        },
        userNotes
      );

      if (apiError) {
        setError(apiError);
        return null;
      }
      return data || null;
    } catch (err) {
      setError('Failed to process recording');
      return null;
    } finally {
      setIsProcessing(false);
      setProcessingProgress(0);
      setProcessingStatus('');
    }
  }, [state.localPath, state.uri]);

  /**
   * Synthesize a note from the current recording and/or text input.
   * Uses the new synthesis endpoint that merges text + audio into a cohesive narrative.
   */
  const synthesizeNote = useCallback(async (
    textInput?: string,
    folderId?: string
  ): Promise<SynthesisResponse | null> => {
    // Prefer localPath (permanent storage) over uri (temp)
    const audioPath = state.localPath || state.uri;

    // At least one of recording or text must be provided
    if (!audioPath && !textInput?.trim()) {
      setError('Please provide text or record audio');
      return null;
    }

    setIsProcessing(true);
    setError(null);

    try {
      const { data, error: apiError } = await voiceService.synthesizeNote(
        {
          textInput: textInput?.trim() || undefined,
          audioUri: audioPath || undefined,
          folderId,
        },
        (progress, status) => {
          setProcessingProgress(progress);
          setProcessingStatus(status);
        }
      );

      if (apiError) {
        setError(apiError);
        return null;
      }
      return data || null;
    } catch (err) {
      setError('Failed to synthesize note');
      return null;
    } finally {
      setIsProcessing(false);
      setProcessingProgress(0);
      setProcessingStatus('');
    }
  }, [state.localPath, state.uri]);

  const resetState = useCallback(async (deleteLocalAudio: boolean = false) => {
    // Optionally clean up saved audio file
    if (deleteLocalAudio && state.localPath && state.localPath !== state.uri) {
      try {
        await audioStorage.deleteAudio(state.localPath);
      } catch (err) {
        console.warn('[useRecording] Failed to delete local audio:', err);
      }
    }

    cleanup();
    setState({ isRecording: false, isPaused: false, duration: 0, uri: null, localPath: null });
    setError(null);
    setIsProcessing(false);

    // Cancel any active Live Activity
    await cancelRecordingActivity();
  }, [cancelRecordingActivity, state.localPath, state.uri]);

  return {
    isRecording: state.isRecording,
    isPaused: state.isPaused,
    duration: state.duration,
    recordingUri: state.uri,
    localAudioPath: state.localPath,
    isProcessing,
    processingProgress,
    processingStatus,
    error,
    startRecording,
    stopRecording,
    pauseRecording,
    resumeRecording,
    cancelRecording,
    processRecording,
    synthesizeNote,
    resetState,
  };
}

export default useRecording;
