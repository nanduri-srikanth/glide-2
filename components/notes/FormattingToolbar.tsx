/**
 * FormattingToolbar - Keyboard accessory toolbar with formatting options and inline mic
 */
import React, { useEffect, useRef } from 'react';
import {
  StyleSheet,
  View,
  ScrollView,
  TouchableOpacity,
  Animated,
  TextInput,
  Text,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { NotesColors } from '@/constants/theme';
import { useRecording } from '@/hooks/useRecording';

interface FormattingToolbarProps {
  inputRef: React.RefObject<TextInput | null>;
  onFormat: (format: FormatType, value?: string) => void;
  onRecordingComplete: (audioUri: string, duration: number) => void;
  activeFormats?: Set<FormatType>;
}

export type FormatType =
  | 'bold'
  | 'italic'
  | 'underline'
  | 'bullet'
  | 'number'
  | 'header'
  | 'table'
  | 'attachment'
  | 'link'
  | 'indent-left'
  | 'indent-right';

export function FormattingToolbar({
  inputRef,
  onFormat,
  onRecordingComplete,
  activeFormats = new Set(),
}: FormattingToolbarProps) {
  const {
    isRecording,
    duration,
    startRecording,
    stopRecording,
  } = useRecording();

  const waveformAnims = useRef(
    Array.from({ length: 5 }, () => new Animated.Value(0.3))
  ).current;
  const animationRef = useRef<Animated.CompositeAnimation | null>(null);

  // Animate waveform bars when recording with random heights
  useEffect(() => {
    if (isRecording) {
      const animateWaveform = () => {
        const animations = waveformAnims.map((anim, index) => {
          const randomHeight = 0.3 + Math.random() * 0.7;
          return Animated.sequence([
            Animated.timing(anim, {
              toValue: randomHeight,
              duration: 150 + Math.random() * 100,
              useNativeDriver: false,
            }),
            Animated.timing(anim, {
              toValue: 0.2 + Math.random() * 0.3,
              duration: 150 + Math.random() * 100,
              useNativeDriver: false,
            }),
          ]);
        });

        animationRef.current = Animated.loop(
          Animated.stagger(50, animations)
        );
        animationRef.current.start();
      };

      animateWaveform();
    } else {
      // Stop and reset animations
      if (animationRef.current) {
        animationRef.current.stop();
      }
      waveformAnims.forEach((anim) => {
        Animated.timing(anim, {
          toValue: 0.3,
          duration: 200,
          useNativeDriver: false,
        }).start();
      });
    }

    return () => {
      if (animationRef.current) {
        animationRef.current.stop();
      }
    };
  }, [isRecording]);

  const handleMicPress = async () => {
    if (isRecording) {
      const result = await stopRecording();
      if (result) {
        // Prefer localPath (permanent storage) over uri (temp)
        onRecordingComplete(result.localPath || result.uri, duration);
      }
    } else {
      await startRecording();
    }
  };

  // Format duration as M:SS
  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const handleFormatPress = (format: FormatType) => {
    onFormat(format);
    // Keep focus on the input
    inputRef.current?.focus();
  };

  const isActive = (format: FormatType) => activeFormats.has(format);

  const renderFormatButton = (
    format: FormatType,
    content: React.ReactNode,
    key?: string
  ) => {
    const active = isActive(format);
    return (
      <TouchableOpacity
        key={key || format}
        style={[styles.formatButton, active && styles.formatButtonActive]}
        onPress={() => handleFormatPress(format)}
        activeOpacity={0.6}
      >
        {content}
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.container}>
      {/* Formatting buttons - scrollable */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="always"
      >
        {/* Bold */}
        {renderFormatButton(
          'bold',
          <Text style={[styles.textIcon, styles.boldText, isActive('bold') && styles.textIconActive]}>B</Text>
        )}

        {/* Italic */}
        {renderFormatButton(
          'italic',
          <Text style={[styles.textIcon, styles.italicText, isActive('italic') && styles.textIconActive]}>I</Text>
        )}

        {/* Underline */}
        {renderFormatButton(
          'underline',
          <View style={styles.underlineIcon}>
            <Text style={[styles.textIcon, isActive('underline') && styles.textIconActive]}>U</Text>
            <View style={[styles.underlineLine, isActive('underline') && styles.underlineLineActive]} />
          </View>
        )}

        {/* Bullet List */}
        {renderFormatButton(
          'bullet',
          <Ionicons name="list" size={20} color={isActive('bullet') ? NotesColors.primary : NotesColors.textPrimary} />
        )}

        {/* Numbered List */}
        {renderFormatButton(
          'number',
          <View style={styles.numberedListIcon}>
            <Text style={[styles.numberText, isActive('number') && styles.textIconActive]}>1.</Text>
          </View>
        )}

        {/* Header */}
        {renderFormatButton(
          'header',
          <Text style={[styles.textIcon, styles.headerText, isActive('header') && styles.textIconActive]}>H</Text>
        )}

        {/* Table */}
        {renderFormatButton(
          'table',
          <Ionicons name="grid-outline" size={18} color={isActive('table') ? NotesColors.primary : NotesColors.textPrimary} />
        )}

        {/* Attachment */}
        {renderFormatButton(
          'attachment',
          <Ionicons name="attach" size={20} color={isActive('attachment') ? NotesColors.primary : NotesColors.textPrimary} />
        )}

        {/* Link */}
        {renderFormatButton(
          'link',
          <Ionicons name="link" size={20} color={isActive('link') ? NotesColors.primary : NotesColors.textPrimary} />
        )}

        {/* Indent Left */}
        {renderFormatButton(
          'indent-left',
          <Ionicons name="chevron-back" size={20} color={NotesColors.textPrimary} />
        )}

        {/* Indent Right */}
        {renderFormatButton(
          'indent-right',
          <Ionicons name="chevron-forward" size={20} color={NotesColors.textPrimary} />
        )}
      </ScrollView>

      {/* Divider */}
      <View style={styles.divider} />

      {/* Mic button / Waveform */}
      <TouchableOpacity
        style={[styles.micButton, isRecording && styles.micButtonRecording]}
        onPress={handleMicPress}
        activeOpacity={0.7}
      >
        {isRecording ? (
          <View style={styles.recordingContainer}>
            <View style={styles.waveformContainer}>
              {waveformAnims.map((anim, index) => (
                <Animated.View
                  key={index}
                  style={[
                    styles.waveformBar,
                    {
                      height: anim.interpolate({
                        inputRange: [0, 1],
                        outputRange: [6, 20],
                      }),
                    },
                  ]}
                />
              ))}
            </View>
            <Text style={styles.recordingTime}>{formatDuration(duration)}</Text>
          </View>
        ) : (
          <Ionicons name="mic" size={22} color={NotesColors.primary} />
        )}
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: NotesColors.card,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(0, 0, 0, 0.1)',
    paddingVertical: 8,
    paddingHorizontal: 4,
  },
  scrollContent: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 4,
    gap: 2,
  },
  formatButton: {
    width: 40,
    height: 36,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 6,
  },
  formatButtonActive: {
    backgroundColor: 'rgba(139, 133, 208, 0.2)',
  },
  textIcon: {
    fontSize: 18,
    fontWeight: '500',
    color: NotesColors.textPrimary,
  },
  textIconActive: {
    color: NotesColors.primary,
  },
  boldText: {
    fontWeight: '700',
  },
  italicText: {
    fontStyle: 'italic',
  },
  underlineIcon: {
    alignItems: 'center',
  },
  underlineLine: {
    width: 12,
    height: 1.5,
    backgroundColor: NotesColors.textPrimary,
    marginTop: -2,
  },
  underlineLineActive: {
    backgroundColor: NotesColors.primary,
  },
  numberedListIcon: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  numberText: {
    fontSize: 14,
    fontWeight: '600',
    color: NotesColors.textPrimary,
  },
  headerText: {
    fontSize: 20,
    fontWeight: '700',
  },
  divider: {
    width: 1,
    height: 24,
    backgroundColor: 'rgba(0, 0, 0, 0.15)',
    marginHorizontal: 8,
  },
  micButton: {
    minWidth: 44,
    height: 36,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 8,
    backgroundColor: 'rgba(139, 133, 208, 0.15)',
    marginRight: 4,
    paddingHorizontal: 8,
  },
  micButtonRecording: {
    backgroundColor: 'rgba(255, 59, 48, 0.15)',
    minWidth: 80,
  },
  recordingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  waveformContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
  waveformBar: {
    width: 3,
    backgroundColor: '#FF3B30',
    borderRadius: 2,
  },
  recordingTime: {
    fontSize: 12,
    fontWeight: '600',
    color: '#FF3B30',
    fontVariant: ['tabular-nums'],
  },
});

export default FormattingToolbar;
