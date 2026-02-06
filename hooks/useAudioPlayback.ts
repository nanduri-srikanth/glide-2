/**
 * useAudioPlayback Hook - Audio playback with expo-av
 * Allows previewing recorded audio before processing
 */

import { useState, useRef, useCallback, useEffect } from 'react';
import { Audio, AVPlaybackStatus } from 'expo-av';

interface PlaybackState {
  isPlaying: boolean;
  isLoaded: boolean;
  position: number; // Current position in ms
  duration: number; // Total duration in ms
  isBuffering: boolean;
}

export function useAudioPlayback() {
  const [state, setState] = useState<PlaybackState>({
    isPlaying: false,
    isLoaded: false,
    position: 0,
    duration: 0,
    isBuffering: false,
  });
  const [error, setError] = useState<string | null>(null);

  const soundRef = useRef<Audio.Sound | null>(null);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      unloadSound();
    };
  }, []);

  const unloadSound = async () => {
    if (soundRef.current) {
      try {
        await soundRef.current.unloadAsync();
      } catch (err) {
        console.warn('[useAudioPlayback] Error unloading sound:', err);
      }
      soundRef.current = null;
      setState({
        isPlaying: false,
        isLoaded: false,
        position: 0,
        duration: 0,
        isBuffering: false,
      });
    }
  };

  const onPlaybackStatusUpdate = (status: AVPlaybackStatus) => {
    if (!status.isLoaded) {
      // Handle error state
      if ('error' in status && status.error) {
        setError(`Playback error: ${status.error}`);
      }
      return;
    }

    setState(prev => ({
      ...prev,
      isPlaying: status.isPlaying,
      isLoaded: true,
      position: status.positionMillis,
      duration: status.durationMillis || prev.duration,
      isBuffering: status.isBuffering,
    }));

    // Auto-reset when playback finishes
    if (status.didJustFinish) {
      setState(prev => ({
        ...prev,
        isPlaying: false,
        position: 0,
      }));
    }
  };

  const loadSound = useCallback(async (uri: string): Promise<boolean> => {
    try {
      setError(null);

      // Unload any existing sound
      await unloadSound();

      // Configure audio mode for playback
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: false,
        playsInSilentModeIOS: true,
        staysActiveInBackground: false,
        shouldDuckAndroid: true,
      });

      // Load the sound
      const { sound, status } = await Audio.Sound.createAsync(
        { uri },
        { shouldPlay: false },
        onPlaybackStatusUpdate
      );

      soundRef.current = sound;

      if (status.isLoaded) {
        setState(prev => ({
          ...prev,
          isLoaded: true,
          duration: status.durationMillis || 0,
        }));
        return true;
      }

      return false;
    } catch (err) {
      console.error('[useAudioPlayback] Error loading sound:', err);
      setError('Failed to load audio');
      return false;
    }
  }, []);

  const play = useCallback(async (uri?: string) => {
    try {
      setError(null);

      // If URI provided, load it first
      if (uri && !state.isLoaded) {
        const loaded = await loadSound(uri);
        if (!loaded) return;
      }

      if (!soundRef.current) {
        setError('No audio loaded');
        return;
      }

      // If at end, replay from start
      if (state.position >= state.duration - 100) {
        await soundRef.current.setPositionAsync(0);
      }

      await soundRef.current.playAsync();
    } catch (err) {
      console.error('[useAudioPlayback] Error playing:', err);
      setError('Failed to play audio');
    }
  }, [state.isLoaded, state.position, state.duration, loadSound]);

  const pause = useCallback(async () => {
    try {
      if (soundRef.current) {
        await soundRef.current.pauseAsync();
      }
    } catch (err) {
      console.error('[useAudioPlayback] Error pausing:', err);
    }
  }, []);

  const stop = useCallback(async () => {
    try {
      if (soundRef.current) {
        await soundRef.current.stopAsync();
        await soundRef.current.setPositionAsync(0);
        setState(prev => ({
          ...prev,
          isPlaying: false,
          position: 0,
        }));
      }
    } catch (err) {
      console.error('[useAudioPlayback] Error stopping:', err);
    }
  }, []);

  const seekTo = useCallback(async (positionMs: number) => {
    try {
      if (soundRef.current) {
        await soundRef.current.setPositionAsync(positionMs);
      }
    } catch (err) {
      console.error('[useAudioPlayback] Error seeking:', err);
    }
  }, []);

  const togglePlayback = useCallback(async (uri?: string) => {
    if (state.isPlaying) {
      await pause();
    } else {
      await play(uri);
    }
  }, [state.isPlaying, pause, play]);

  // Reset everything
  const reset = useCallback(async () => {
    await unloadSound();
    setError(null);
  }, []);

  return {
    // State
    isPlaying: state.isPlaying,
    isLoaded: state.isLoaded,
    position: state.position,
    duration: state.duration,
    isBuffering: state.isBuffering,
    error,
    // Progress (0-1)
    progress: state.duration > 0 ? state.position / state.duration : 0,
    // Actions
    loadSound,
    play,
    pause,
    stop,
    seekTo,
    togglePlayback,
    reset,
    unloadSound,
  };
}

export default useAudioPlayback;
