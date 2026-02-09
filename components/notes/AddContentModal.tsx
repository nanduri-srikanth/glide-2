/**
 * AddContentModal - Modal for adding text and/or audio to an existing note
 */
import React, { useState, useEffect, useRef } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  Modal,
  KeyboardAvoidingView,
  Platform,
  Animated,
  Switch,
  ActivityIndicator,
  ScrollView,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { NotesColors } from '@/constants/theme';
import { useRecording } from '@/hooks/useRecording';
import { useAudioPlayback } from '@/hooks/useAudioPlayback';

interface AddContentModalProps {
  visible: boolean;
  onClose: () => void;
  onSubmit: (options: {
    textInput?: string;
    audioUri?: string;
    resynthesize?: boolean;
  }) => Promise<boolean>;
  isProcessing: boolean;
  processingStatus: string;
  processingProgress: number;
}

// Animated wave bar component
function WaveBar({ delay, isActive }: { delay: number; isActive: boolean }) {
  const height = useRef(new Animated.Value(8)).current;

  useEffect(() => {
    if (isActive) {
      const animation = Animated.loop(
        Animated.sequence([
          Animated.timing(height, {
            toValue: 20 + Math.random() * 12,
            duration: 150 + Math.random() * 100,
            useNativeDriver: false,
          }),
          Animated.timing(height, {
            toValue: 6 + Math.random() * 4,
            duration: 150 + Math.random() * 100,
            useNativeDriver: false,
          }),
        ])
      );

      const timeout = setTimeout(() => animation.start(), delay);
      return () => {
        clearTimeout(timeout);
        animation.stop();
      };
    } else {
      Animated.timing(height, {
        toValue: 8,
        duration: 200,
        useNativeDriver: false,
      }).start();
    }
  }, [isActive, delay]);

  return (
    <Animated.View
      style={[
        styles.waveBar,
        {
          height,
          backgroundColor: isActive ? '#FF3B30' : NotesColors.textSecondary,
        },
      ]}
    />
  );
}

// Mini waveform visualization
function MiniWaveform({ isActive }: { isActive: boolean }) {
  const bars = [0, 30, 60, 90, 120];

  return (
    <View style={styles.waveformContainer}>
      {bars.map((delay, index) => (
        <WaveBar key={index} delay={delay} isActive={isActive} />
      ))}
    </View>
  );
}

export function AddContentModal({
  visible,
  onClose,
  onSubmit,
  isProcessing,
  processingStatus,
  processingProgress,
}: AddContentModalProps) {
  const [textInput, setTextInput] = useState('');
  const [forceResynthesize, setForceResynthesize] = useState(false);
  const textInputRef = useRef<TextInput>(null);
  const insets = useSafeAreaInsets();

  const {
    isRecording,
    isPaused,
    duration,
    startRecording,
    stopRecording,
    pauseRecording,
    resumeRecording,
    resetState,
  } = useRecording();

  const {
    isPlaying,
    togglePlayback,
    reset: resetPlayback,
    loadSound,
  } = useAudioPlayback();

  const [localRecordingUri, setLocalRecordingUri] = useState<string | null>(null);

  // Reset state when modal closes
  useEffect(() => {
    if (!visible) {
      setTextInput('');
      setForceResynthesize(false);
      setLocalRecordingUri(null);
      resetState();
      resetPlayback();
    }
  }, [visible]);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const handleStartRecording = async () => {
    setLocalRecordingUri(null);
    await startRecording();
  };

  const handleStopRecording = async () => {
    const result = await stopRecording();
    if (result) {
      // Prefer localPath (permanent storage) over uri (temp)
      const audioUri = result.localPath || result.uri;
      setLocalRecordingUri(audioUri);
      // Pre-load for playback
      loadSound(audioUri);
    }
  };

  const handleClearRecording = async () => {
    resetState();
    resetPlayback();
    setLocalRecordingUri(null);
  };

  const handleSubmit = async () => {
    const hasText = textInput.trim().length > 0;
    const hasAudio = localRecordingUri !== null;

    if (!hasText && !hasAudio) return;

    const success = await onSubmit({
      textInput: hasText ? textInput.trim() : undefined,
      audioUri: hasAudio ? localRecordingUri : undefined,
      resynthesize: forceResynthesize ? true : undefined,
    });

    if (success) {
      onClose();
    }
  };

  const canSubmit = (textInput.trim().length > 0 || localRecordingUri !== null) && !isRecording;
  const hasRecording = localRecordingUri !== null || duration > 0;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        style={styles.overlay}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <View style={styles.modalContainer}>
          <View style={[styles.modal, { paddingBottom: Math.max(insets.bottom, 20) }]}>
            {/* Header */}
            <View style={styles.header}>
              <TouchableOpacity
                style={styles.closeButton}
                onPress={onClose}
                disabled={isProcessing}
              >
                <Ionicons name="close" size={24} color={NotesColors.textSecondary} />
              </TouchableOpacity>
              <Text style={styles.title}>Add to Note</Text>
              <View style={styles.headerRight}>
                {hasRecording && !isRecording && (
                  <View style={styles.audioBadge}>
                    <Ionicons name="mic" size={12} color={NotesColors.primary} />
                    <Text style={styles.audioBadgeText}>{formatTime(duration)}</Text>
                  </View>
                )}
              </View>
            </View>

            {isProcessing ? (
              /* Processing state */
              <View style={styles.processingContainer}>
                <ActivityIndicator size="large" color={NotesColors.primary} />
                <Text style={styles.processingText}>{processingStatus || 'Processing...'}</Text>
                <View style={styles.progressBar}>
                  <View style={[styles.progressFill, { width: `${processingProgress}%` }]} />
                </View>
              </View>
            ) : (
              <ScrollView
                showsVerticalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
                bounces={false}
              >
                {/* Text input */}
                <View style={styles.textContainer}>
                  <TextInput
                    ref={textInputRef}
                    style={styles.textInput}
                    placeholder="Type your thoughts..."
                    placeholderTextColor={NotesColors.textSecondary}
                    value={textInput}
                    onChangeText={setTextInput}
                    multiline
                    textAlignVertical="top"
                    autoFocus
                  />
                </View>

                {/* Divider */}
                <View style={styles.divider} />

                {/* Audio section */}
                <View style={styles.audioSection}>
                  {isRecording && !isPaused ? (
                    /* Recording in progress - match new note UI */
                    <View style={styles.micContainer}>
                      <View style={styles.recordingControlsContainer}>
                        <TouchableOpacity
                          style={styles.pauseButton}
                          onPress={pauseRecording}
                          activeOpacity={0.7}
                        >
                          <Ionicons name="pause" size={24} color="#FFFFFF" />
                        </TouchableOpacity>
                        <View style={styles.recordingIndicator}>
                          <MiniWaveform isActive={true} />
                        </View>
                        <Text style={styles.timerText}>{formatTime(duration)}</Text>
                        <TouchableOpacity
                          style={styles.stopButton}
                          onPress={handleStopRecording}
                          activeOpacity={0.7}
                        >
                          <View style={styles.stopIconLarge} />
                        </TouchableOpacity>
                      </View>
                    </View>
                  ) : isRecording && isPaused ? (
                    /* Recording paused - match new note UI */
                    <View style={styles.micContainer}>
                      <View style={styles.recordingControlsContainer}>
                        <TouchableOpacity
                          style={styles.resumeButton}
                          onPress={resumeRecording}
                          activeOpacity={0.7}
                        >
                          <Ionicons name="play" size={24} color="#FFFFFF" />
                        </TouchableOpacity>
                        <View style={styles.pausedIndicatorLarge}>
                          <Ionicons name="pause" size={20} color={NotesColors.textSecondary} />
                        </View>
                        <Text style={styles.timerTextPaused}>{formatTime(duration)}</Text>
                        <TouchableOpacity
                          style={styles.doneButton}
                          onPress={handleStopRecording}
                          activeOpacity={0.7}
                        >
                          <Ionicons name="checkmark" size={24} color="#FFFFFF" />
                        </TouchableOpacity>
                      </View>
                    </View>
                  ) : localRecordingUri ? (
                    /* Has recording - match new note UI */
                    <View style={styles.micContainer}>
                      <View style={styles.recordingCompletedContainer}>
                        <TouchableOpacity
                          style={styles.playbackButton}
                          onPress={() => togglePlayback(localRecordingUri)}
                        >
                          <Ionicons
                            name={isPlaying ? 'pause' : 'play'}
                            size={24}
                            color="#FFFFFF"
                          />
                        </TouchableOpacity>
                        <View style={styles.playbackInfoContainer}>
                          <Text style={styles.timerTextComplete}>{formatTime(duration)}</Text>
                        </View>
                        <TouchableOpacity
                          style={styles.reRecordButton}
                          onPress={() => {
                            handleClearRecording();
                            handleStartRecording();
                          }}
                        >
                          <Ionicons name="refresh" size={18} color={NotesColors.textSecondary} />
                        </TouchableOpacity>
                      </View>
                    </View>
                  ) : (
                    /* No recording */
                    <View style={styles.micContainer}>
                      <TouchableOpacity
                        style={styles.micButton}
                        onPress={handleStartRecording}
                        activeOpacity={0.7}
                      >
                        <Ionicons name="mic" size={36} color="#FFFFFF" />
                      </TouchableOpacity>
                    </View>
                  )}
                </View>

                {/* Divider */}
                <View style={styles.divider} />

                {/* Force resynthesize option */}
                <View style={styles.optionRow}>
                  <View style={styles.optionInfo}>
                    <Text style={styles.optionLabel}>Force re-synthesize</Text>
                    <Text style={styles.optionHint}>
                      AI will rewrite the entire note instead of appending
                    </Text>
                  </View>
                  <Switch
                    value={forceResynthesize}
                    onValueChange={setForceResynthesize}
                    trackColor={{ false: NotesColors.card, true: NotesColors.primary }}
                    thumbColor="#fff"
                    disabled={isRecording}
                  />
                </View>

                {/* Action buttons */}
                <View style={styles.actionButtons}>
                  <TouchableOpacity
                    style={styles.cancelButton}
                    onPress={onClose}
                    disabled={isRecording}
                  >
                    <Text style={styles.cancelText}>Cancel</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.submitButton, !canSubmit && styles.submitButtonDisabled]}
                    onPress={handleSubmit}
                    disabled={!canSubmit}
                  >
                    <Text style={[styles.submitText, !canSubmit && styles.submitTextDisabled]}>
                      Add
                    </Text>
                    <Ionicons
                      name="checkmark"
                      size={18}
                      color={canSubmit ? '#fff' : NotesColors.textSecondary}
                    />
                  </TouchableOpacity>
                </View>
              </ScrollView>
            )}
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modalContainer: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  modal: {
    backgroundColor: NotesColors.card,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '90%',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 12,
  },
  closeButton: {
    padding: 4,
    width: 60,
  },
  title: {
    fontSize: 17,
    fontWeight: '600',
    color: NotesColors.textPrimary,
  },
  headerRight: {
    width: 60,
    alignItems: 'flex-end',
  },
  audioBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'NotesColors.aiPanelBackground',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    gap: 4,
  },
  audioBadgeText: {
    fontSize: 12,
    fontWeight: '500',
    color: NotesColors.primary,
    fontVariant: ['tabular-nums'],
  },
  processingContainer: {
    alignItems: 'center',
    paddingVertical: 60,
    paddingHorizontal: 24,
  },
  processingText: {
    fontSize: 16,
    color: NotesColors.textSecondary,
    marginTop: 16,
    marginBottom: 16,
  },
  progressBar: {
    width: '100%',
    height: 4,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 2,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: NotesColors.primary,
  },
  textContainer: {
    paddingHorizontal: 16,
    minHeight: 120,
    maxHeight: 200,
  },
  textInput: {
    fontSize: 16,
    color: NotesColors.textPrimary,
    lineHeight: 24,
    flex: 1,
    paddingVertical: 8,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    marginHorizontal: 16,
    marginVertical: 12,
  },
  audioSection: {
    paddingHorizontal: 16,
  },
  micContainer: {
    alignItems: 'center',
  },
  recordingIndicator: {
    backgroundColor: 'rgba(255, 59, 48, 0.12)',
    borderRadius: 24,
    padding: 10,
  },
  waveformContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
    height: 24,
    width: 36,
  },
  waveBar: {
    width: 4,
    borderRadius: 2,
  },
  timerText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#FF3B30',
    fontVariant: ['tabular-nums'],
    minWidth: 45,
  },
  timerTextPaused: {
    fontSize: 15,
    fontWeight: '500',
    color: NotesColors.textSecondary,
    fontVariant: ['tabular-nums'],
    minWidth: 45,
  },
  timerTextComplete: {
    fontSize: 18,
    fontWeight: '600',
    color: '#4CAF50',
    fontVariant: ['tabular-nums'],
  },
  recordingControlsContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255, 59, 48, 0.1)',
    borderRadius: 32,
    paddingVertical: 12,
    paddingHorizontal: 16,
    gap: 16,
  },
  pauseButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: NotesColors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  resumeButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#4CAF50',
    alignItems: 'center',
    justifyContent: 'center',
  },
  stopButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#FF3B30',
    justifyContent: 'center',
    alignItems: 'center',
  },
  stopIconLarge: {
    width: 18,
    height: 18,
    borderRadius: 3,
    backgroundColor: '#FFFFFF',
  },
  doneButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#4CAF50',
    alignItems: 'center',
    justifyContent: 'center',
  },
  pausedIndicatorLarge: {
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 20,
    padding: 10,
  },
  recordingCompletedContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(76, 175, 80, 0.12)',
    borderRadius: 32,
    paddingVertical: 16,
    paddingHorizontal: 20,
    gap: 16,
    minWidth: 280,
  },
  playbackButton: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#4CAF50',
    alignItems: 'center',
    justifyContent: 'center',
  },
  playbackInfoContainer: {
    flex: 1,
    minWidth: 100,
    alignItems: 'center',
    justifyContent: 'center',
  },
  reRecordButton: {
    padding: 10,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 20,
  },
  micButton: {
    backgroundColor: NotesColors.primary,
    borderRadius: 40,
    width: 80,
    height: 80,
    alignItems: 'center',
    justifyContent: 'center',
  },
  optionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  optionInfo: {
    flex: 1,
    marginRight: 16,
  },
  optionLabel: {
    fontSize: 15,
    color: NotesColors.textPrimary,
  },
  optionHint: {
    fontSize: 12,
    color: NotesColors.textSecondary,
    marginTop: 2,
  },
  actionButtons: {
    flexDirection: 'row',
    gap: 12,
    paddingHorizontal: 16,
    paddingTop: 16,
  },
  cancelButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    alignItems: 'center',
  },
  cancelText: {
    fontSize: 16,
    fontWeight: '600',
    color: NotesColors.textSecondary,
  },
  submitButton: {
    flex: 1,
    flexDirection: 'row',
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: NotesColors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  submitButtonDisabled: {
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
  },
  submitText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
  submitTextDisabled: {
    color: NotesColors.textSecondary,
  },
});

export default AddContentModal;
