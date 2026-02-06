/**
 * useLiveActivity Hook - Manage Dynamic Island recording indicator
 * Uses Software Mansion's expo-live-activity
 */

import { useState, useRef, useCallback, useEffect } from 'react';
import { Platform } from 'react-native';

// Dynamic import to handle cases where module isn't available
let LiveActivityModule: typeof import('expo-live-activity') | null = null;

try {
  LiveActivityModule = require('expo-live-activity');
} catch (e) {
  console.log('expo-live-activity not available');
}

interface RecordingActivityState {
  isActive: boolean;
  activityId: string | null;
}

export function useLiveActivity() {
  const [state, setState] = useState<RecordingActivityState>({
    isActive: false,
    activityId: null,
  });

  const startTimeRef = useRef<number | null>(null);
  const updateIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Check if Live Activities are supported (iOS 16.2+ on physical device)
  const isSupported = Platform.OS === 'ios' && LiveActivityModule !== null;

  // Clean up on unmount
  useEffect(() => {
    return () => {
      if (updateIntervalRef.current) {
        clearInterval(updateIntervalRef.current);
      }
    };
  }, []);

  /**
   * Start the recording Live Activity
   */
  const startRecordingActivity = useCallback(async () => {
    if (!isSupported || !LiveActivityModule) {
      console.log('Live Activities not supported - skipping');
      return null;
    }

    try {
      startTimeRef.current = Date.now();

      // The timer shows elapsed time from startDate
      // expo-live-activity expects 'date' in progressBar for timer display
      const activityState = {
        title: 'Recording',
        subtitle: '0:00',
        progressBar: {
          date: startTimeRef.current,
        },
      };

      const config = {
        backgroundColor: '#1C1C1E',
        titleColor: '#FFFFFF',
        subtitleColor: '#8E8E93',
        deepLinkUrl: 'glide://recording',
        timerType: 'digital' as const,
        padding: { horizontal: 16, top: 12, bottom: 12 },
      };

      const activityId = LiveActivityModule.startActivity(activityState, config);

      if (!activityId) {
        console.log('Failed to start Live Activity - no activity ID returned');
        return null;
      }

      setState({
        isActive: true,
        activityId,
      });

      // Update the subtitle with elapsed time every second
      updateIntervalRef.current = setInterval(() => {
        if (startTimeRef.current && activityId && LiveActivityModule) {
          const elapsed = Math.floor((Date.now() - startTimeRef.current) / 1000);
          const minutes = Math.floor(elapsed / 60);
          const seconds = elapsed % 60;
          const timeString = `${minutes}:${seconds.toString().padStart(2, '0')}`;

          try {
            LiveActivityModule.updateActivity(activityId, {
              title: 'Recording',
              subtitle: timeString,
              progressBar: {
                date: startTimeRef.current,
              },
            });
          } catch (e) {
            // Ignore update errors
          }
        }
      }, 1000);

      return activityId;
    } catch (error) {
      console.log('Failed to start Live Activity:', error);
      return null;
    }
  }, [isSupported]);

  /**
   * Update the Live Activity (e.g., when paused)
   */
  const updateRecordingActivity = useCallback(async (isPaused: boolean, duration: number) => {
    if (!isSupported || !state.activityId || !LiveActivityModule) return;

    try {
      const minutes = Math.floor(duration / 60);
      const seconds = duration % 60;
      const timeString = `${minutes}:${seconds.toString().padStart(2, '0')}`;

      if (isPaused) {
        // Stop the interval when paused
        if (updateIntervalRef.current) {
          clearInterval(updateIntervalRef.current);
          updateIntervalRef.current = null;
        }

        LiveActivityModule.updateActivity(state.activityId, {
          title: 'Paused',
          subtitle: timeString,
          progressBar: {
            progress: 0.5,
          },
        });
      } else {
        // Resume the timer
        startTimeRef.current = Date.now() - (duration * 1000);

        LiveActivityModule.updateActivity(state.activityId, {
          title: 'Recording',
          subtitle: timeString,
          progressBar: {
            date: startTimeRef.current,
          },
        });

        // Restart the update interval
        if (!updateIntervalRef.current) {
          updateIntervalRef.current = setInterval(() => {
            if (startTimeRef.current && state.activityId && LiveActivityModule) {
              const elapsed = Math.floor((Date.now() - startTimeRef.current) / 1000);
              const mins = Math.floor(elapsed / 60);
              const secs = elapsed % 60;
              const time = `${mins}:${secs.toString().padStart(2, '0')}`;

              try {
                LiveActivityModule.updateActivity(state.activityId, {
                  title: 'Recording',
                  subtitle: time,
                  progressBar: {
                    date: startTimeRef.current,
                  },
                });
              } catch (e) {
                // Ignore update errors
              }
            }
          }, 1000);
        }
      }
    } catch (error) {
      console.log('Failed to update Live Activity:', error);
    }
  }, [isSupported, state.activityId]);

  /**
   * Stop the recording Live Activity
   */
  const stopRecordingActivity = useCallback(async (finalDuration?: number) => {
    if (!isSupported || !state.activityId || !LiveActivityModule) return;

    try {
      // Clear the update interval
      if (updateIntervalRef.current) {
        clearInterval(updateIntervalRef.current);
        updateIntervalRef.current = null;
      }

      // Show final state briefly before ending
      if (finalDuration !== undefined) {
        const minutes = Math.floor(finalDuration / 60);
        const seconds = finalDuration % 60;
        const timeString = `${minutes}:${seconds.toString().padStart(2, '0')}`;

        LiveActivityModule.stopActivity(state.activityId, {
          title: 'Saved',
          subtitle: timeString,
          progressBar: {
            progress: 1,
          },
        });
      } else {
        LiveActivityModule.stopActivity(state.activityId, {
          title: 'Recording ended',
          subtitle: '',
          progressBar: {
            progress: 1,
          },
        });
      }

      setState({
        isActive: false,
        activityId: null,
      });
      startTimeRef.current = null;
    } catch (error) {
      console.log('Failed to stop Live Activity:', error);
    }
  }, [isSupported, state.activityId]);

  /**
   * Cancel the Live Activity without showing completion
   */
  const cancelRecordingActivity = useCallback(async () => {
    if (!isSupported || !state.activityId || !LiveActivityModule) return;

    try {
      if (updateIntervalRef.current) {
        clearInterval(updateIntervalRef.current);
        updateIntervalRef.current = null;
      }

      LiveActivityModule.stopActivity(state.activityId, {
        title: 'Cancelled',
        subtitle: '',
        progressBar: {
          progress: 0,
        },
      });

      setState({
        isActive: false,
        activityId: null,
      });
      startTimeRef.current = null;
    } catch (error) {
      console.log('Failed to cancel Live Activity:', error);
    }
  }, [isSupported, state.activityId]);

  return {
    isSupported,
    isActive: state.isActive,
    activityId: state.activityId,
    startRecordingActivity,
    updateRecordingActivity,
    stopRecordingActivity,
    cancelRecordingActivity,
  };
}

export default useLiveActivity;
