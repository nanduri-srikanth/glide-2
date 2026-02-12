import React, { useState, useRef, useEffect } from 'react';
import { StyleSheet, SafeAreaView, Alert, View, Text, ActivityIndicator, Animated } from 'react-native';
import { useRouter, useLocalSearchParams, useNavigation } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { NotesColors } from '@/constants/theme';
import { RecordingOverlay, RecordingDestination } from '@/components/notes/RecordingOverlay';
import { FolderSelectionSheet } from '@/components/notes/FolderSelectionSheet';
import { NoteSelectionSheet } from '@/components/notes/NoteSelectionSheet';
import { useRecording } from '@/hooks/useRecording';
import { useAuth } from '@/context/AuthContext';
import { useNetwork } from '@/context/NetworkContext';
import { useNotes } from '@/context/NotesContext';
import { notesService } from '@/services/notes';
import { voiceService } from '@/services/voice';
import { notesRepository } from '@/lib/repositories';
import { audioUploader } from '@/lib/sync';
import { getQueryClient, queryKeys } from '@/lib/queryClient';
import { isDatabaseInitialized } from '@/lib/database';

type FlowMode = 'idle' | 'quick' | 'add-to-note' | 'into-folder';

export default function RecordingScreen() {
  const router = useRouter();
  const navigation = useNavigation();
  const { folderId, autoStart } = useLocalSearchParams<{ folderId?: string; autoStart?: string }>();
  const { isAuthenticated, user } = useAuth();
  const { isOnline } = useNetwork();

  // Safe navigation back - handles both modal and stack navigation
  const safeGoBack = () => {
    if (navigation.canGoBack()) {
      navigation.goBack();
    } else {
      router.replace('/(tabs)');
    }
  };
  const hasAutoStarted = useRef(false);
  const { fetchFolders } = useNotes();
  const queryClient = getQueryClient();
  const {
    isRecording,
    isPaused,
    duration,
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
    resetState,
  } = useRecording();

  // Flow state
  const [flowMode, setFlowMode] = useState<FlowMode>('idle');
  const [destination, setDestination] = useState<RecordingDestination | null>(null);
  const [targetNote, setTargetNote] = useState<{ id: string; title: string } | null>(null);
  const [targetFolder, setTargetFolder] = useState<{ id: string; name: string } | null>(null);

  // Sheet visibility
  const [showNoteSheet, setShowNoteSheet] = useState(false);
  const [showFolderSheetDirect, setShowFolderSheetDirect] = useState(false); // For "Into..." flow

  // Processing state
  const [showProcessing, setShowProcessing] = useState(false);
  const [userNotes, setUserNotes] = useState('');
  const [pendingAudioUri, setPendingAudioUri] = useState<string | null>(null);
  const [pendingNotes, setPendingNotes] = useState('');
  const [sheetProcessing, setSheetProcessing] = useState(false);
  const [sheetProcessingStatus, setSheetProcessingStatus] = useState('');
  const [showSuccess, setShowSuccess] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');

  // Animation values for success screen
  const successScale = useRef(new Animated.Value(0)).current;
  const successOpacity = useRef(new Animated.Value(0)).current;

  // Auto-start recording if opened via deep link (glide://record)
  useEffect(() => {
    if (autoStart === 'true' && !hasAutoStarted.current && !isRecording) {
      hasAutoStarted.current = true;
      // Small delay to ensure component is fully mounted
      const timer = setTimeout(() => {
        startRecording();
      }, 300);
      return () => clearTimeout(timer);
    }
  }, [autoStart, isRecording, startRecording]);

  // Success animation and navigation
  const showSuccessAndNavigateBack = (message: string) => {
    // Clear all processing states first
    setShowProcessing(false);
    setSheetProcessing(false);
    setShowFolderSheetDirect(false);
    setShowNoteSheet(false);

    // Reset animation values
    successScale.setValue(0);
    successOpacity.setValue(0);

    // Then show success
    setSuccessMessage(message);
    setShowSuccess(true);

    // Animate in
    Animated.parallel([
      Animated.spring(successScale, {
        toValue: 1,
        useNativeDriver: true,
        tension: 50,
        friction: 7,
      }),
      Animated.timing(successOpacity, {
        toValue: 1,
        duration: 200,
        useNativeDriver: true,
      }),
    ]).start();

    // Navigate back after delay
    setTimeout(() => {
      Animated.parallel([
        Animated.timing(successScale, {
          toValue: 0.8,
          duration: 150,
          useNativeDriver: true,
        }),
        Animated.timing(successOpacity, {
          toValue: 0,
          duration: 150,
          useNativeDriver: true,
        }),
      ]).start(() => {
        resetState();
        safeGoBack();
      });
    }, 1200);
  };

  const refreshNotesAfterSynthesis = async (noteId?: string) => {
    // Update local SQLite from server for immediate UI consistency
    if (noteId && isDatabaseInitialized() && user?.id) {
      const { data } = await notesService.getNote(noteId);
      if (data) {
        await notesRepository.upsertFromServer(data, user.id);
      }
    }

    // Invalidate queries to refresh list + counts (and detail, if applicable)
    queryClient.invalidateQueries({ queryKey: queryKeys.notes.lists() });
    if (noteId) {
      queryClient.invalidateQueries({ queryKey: queryKeys.notes.detail(noteId) });
    }
    queryClient.invalidateQueries({ queryKey: queryKeys.folders.all });
  };

  const createOfflinePendingNote = async (
    textToUse: string | null,
    audioToUse: string | null,
    targetFolderId?: string
  ): Promise<boolean> => {
    if (!isDatabaseInitialized() || !user?.id) return false;

    const now = Date.now();
    const id = `local-${now}`;
    const title = textToUse?.trim().split('\n')[0]?.slice(0, 80) || 'New Note';

    await notesRepository.create({
      id,
      user_id: user.id,
      title,
      transcript: textToUse || '',
      folder_id: targetFolderId || null,
      local_audio_path: audioToUse || undefined,
    });

    if (audioToUse) {
      await audioUploader.queueUpload(id, audioToUse);
    }

    queryClient.invalidateQueries({ queryKey: queryKeys.notes.lists() });
    queryClient.invalidateQueries({ queryKey: queryKeys.folders.all });
    return true;
  };

  const handleStartRecording = async () => {
    await startRecording();
  };

  const handlePauseRecording = async () => {
    await pauseRecording();
  };

  const handleResumeRecording = async () => {
    await resumeRecording();
  };

  // Just stop recording, don't process yet
  const handleStopRecording = async (): Promise<string | null> => {
    const result = await stopRecording();

    if (!result) {
      Alert.alert('Error', 'Failed to save recording');
      return null;
    }

    // Save the local path for later processing (prefer permanent storage)
    const audioPath = result.localPath || result.uri;
    setPendingAudioUri(audioPath);
    return audioPath;
  };

  // Handle "Add to..." button - open note selection sheet
  const handleAddToNote = (notes?: string, audioUri?: string | null) => {
    if (!isAuthenticated) {
      Alert.alert('Sign In Required', 'Please sign in to add content to notes.');
      return;
    }
    // Store the current input for later processing
    if (notes) setPendingNotes(notes);
    if (audioUri) setPendingAudioUri(audioUri);
    setShowNoteSheet(true);
  };

  // Handle note selected from sheet
  const handleNoteSelected = (noteId: string, noteTitle: string) => {
    setTargetNote({ id: noteId, title: noteTitle });
    setDestination({ type: 'note', name: noteTitle, id: noteId });
    setFlowMode('add-to-note');
    setShowNoteSheet(false);
  };

  // Handle "Into..." button - open folder selection sheet directly
  const handleIntoFolder = (notes?: string, audioUri?: string | null) => {
    if (!isAuthenticated) {
      Alert.alert('Sign In Required', 'Please sign in to save notes.');
      return;
    }
    // Store the current input for later processing
    if (notes) setPendingNotes(notes);
    if (audioUri) setPendingAudioUri(audioUri);
    setShowFolderSheetDirect(true);
  };

  // Handle folder selected from "Into..." flow
  const handleFolderSelectedDirect = async (selectedFolderId: string, folderName?: string) => {
    // Get folder name from context if not provided
    const name = folderName || 'Folder';
    setTargetFolder({ id: selectedFolderId, name });
    setDestination({ type: 'folder', name, id: selectedFolderId });
    setFlowMode('into-folder');
    setShowFolderSheetDirect(false);
  };

  // Process with AI - called when user taps Process button
  const handleProcess = async (notes: string, audioUri?: string | null) => {
    setUserNotes(notes);
    const finalAudioUri = audioUri || pendingAudioUri;

    if (!isAuthenticated) {
      Alert.alert(
        'Sign In Required',
        'Please sign in to process notes with AI.',
        [{ text: 'OK', onPress: () => safeGoBack() }]
      );
      return;
    }

    // Route based on flow mode
    if (flowMode === 'add-to-note' && targetNote) {
      // Process to existing note
      await processToExistingNote(notes, finalAudioUri);
    } else if (flowMode === 'into-folder' && targetFolder) {
      // Process directly to target folder
      await processNoteWithFolder(targetFolder.id, false, notes, finalAudioUri);
    } else if (folderId) {
      // Coming from a specific folder context
      setShowProcessing(true);

      if (!isOnline) {
        const created = await createOfflinePendingNote(notes, finalAudioUri || null, folderId);
        if (created) {
          showSuccessAndNavigateBack('Saved offline (pending sync)');
          return;
        }
        setShowProcessing(false);
        Alert.alert('Offline', 'Unable to save locally. Please try again when online.');
        return;
      }

      const { data, error: apiError } = await voiceService.synthesizeNote(
        {
          textInput: notes || undefined,
          audioUri: finalAudioUri || undefined,
          folderId: folderId,
        },
        (progress, status) => {
          // Update processing status if needed
        }
      );

      if (data) {
        // Success - show animation and go back
        await refreshNotesAfterSynthesis(data.note_id);
        fetchFolders();
        showSuccessAndNavigateBack('Note saved');
      } else {
        // Error occurred
        setShowProcessing(false);
        Alert.alert('Processing Failed', apiError || 'Unknown error', [
          { text: 'Try Again' },
          { text: 'Discard', style: 'destructive', onPress: () => safeGoBack() },
        ]);
      }
    } else {
      // Quick capture flow - auto-save with AI sorting (no folder selection modal)
      // Process directly - backend will auto-sort when no folderId is provided
      await processNoteWithFolder(undefined, true, notes, finalAudioUri);
    }
  };

  // Process to an existing note (add content)
  // Default behavior: transcribe audio and append to note (no AI re-synthesis)
  // User can explicitly choose to combine/summarize later from the note detail view
  const processToExistingNote = async (notes: string, audioUri?: string | null) => {
    if (!targetNote) return;

    setShowProcessing(true);

    try {
      const { data, error: apiError } = await voiceService.addToNote(
        targetNote.id,
        {
          textInput: notes || undefined,
          audioUri: audioUri || undefined,
          resynthesize: false,  // Just append, don't re-synthesize
          autoDecide: false,    // Don't let AI decide - user controls this
        },
        (progress, status) => {
          // Could update status here
        }
      );

      if (data) {
        // Update local state/cache so note detail reflects the append immediately.
        await refreshNotesAfterSynthesis(data.note_id);
        fetchFolders();
        showSuccessAndNavigateBack(`Added to "${targetNote.title}"`);
      } else {
        setShowProcessing(false);
        Alert.alert('Error', apiError || 'Failed to add content to note', [
          { text: 'Try Again' },
          { text: 'Cancel', style: 'cancel' },
        ]);
      }
    } catch (err) {
      setShowProcessing(false);
      Alert.alert('Error', 'Failed to add content to note');
    }
  };

  const handleAutoSort = async () => {
    setSheetProcessingStatus('AI is analyzing your note...');
    await processNoteWithFolder(undefined, true);
  };

  const handleCreateFolder = () => {
    Alert.prompt(
      'New Folder',
      'Enter a name for this folder',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Create & Save',
          onPress: async (name: string | undefined) => {
            if (name?.trim()) {
              setSheetProcessing(true);
              setSheetProcessingStatus('Creating folder...');

              try {
                const { data: folder, error: folderError } = await notesService.createFolder({
                  name: name.trim(),
                  icon: 'folder',
                });

                if (folderError) {
                  Alert.alert('Error', folderError);
                  setSheetProcessing(false);
                  return;
                }

                if (folder) {
                  // Now save the note to the new folder
                  await processNoteWithFolder(folder.id);
                }
              } catch (err) {
                Alert.alert('Error', 'Failed to create folder.');
                setSheetProcessing(false);
              }
            }
          },
        },
      ],
      'plain-text',
      '',
      'default'
    );
  };

  const processNoteWithFolder = async (
    selectedFolderId?: string,
    autoSort: boolean = false,
    notesText?: string,
    audioUri?: string | null
  ) => {
    setSheetProcessing(true);
    setShowProcessing(true);
    setSheetProcessingStatus(autoSort ? 'AI is analyzing your note...' : 'Processing...');

    // Use passed values directly, fall back to state
    const textToUse = notesText ?? pendingNotes;
    const audioToUse = audioUri ?? pendingAudioUri;

    try {
      if (!isOnline) {
        const created = await createOfflinePendingNote(textToUse, audioToUse || null, selectedFolderId);
        if (created) {
          showSuccessAndNavigateBack('Saved offline (pending sync)');
          return;
        }
        setSheetProcessing(false);
        setShowProcessing(false);
        Alert.alert('Offline', 'Unable to save locally. Please try again when online.');
        return;
      }

      // Use the new synthesis endpoint for both audio+text and text-only
      const { data, error: apiError } = await voiceService.synthesizeNote(
        {
          textInput: textToUse || undefined,
          audioUri: audioToUse || undefined,
          folderId: autoSort ? undefined : selectedFolderId,
        },
        (progress, status) => setSheetProcessingStatus(status)
      );

      if (apiError) {
        Alert.alert('Error', apiError);
        setSheetProcessing(false);
        return;
      }

      // Success - show animation and go back
      await refreshNotesAfterSynthesis(data?.note_id);
      fetchFolders();
      const folderName = data?.folder_name;
      const successMsg = folderName ? `Saved to ${folderName}` : 'Note saved';
      showSuccessAndNavigateBack(successMsg);
    } catch (err) {
      Alert.alert('Error', 'Failed to process note.');
      setSheetProcessing(false);
    }
  };

  const handleCancel = () => {
    if (isRecording) {
      Alert.alert(
        'Discard Recording?',
        'Are you sure you want to discard this recording?',
        [
          { text: 'Keep Recording', style: 'cancel' },
          {
            text: 'Discard',
            style: 'destructive',
            onPress: async () => {
              await cancelRecording();
              safeGoBack();
            },
          },
        ]
      );
    } else if (showProcessing || isProcessing) {
      Alert.alert(
        'Cancel Processing?',
        'The recording is being processed. Are you sure you want to cancel?',
        [
          { text: 'Continue', style: 'cancel' },
          {
            text: 'Cancel',
            style: 'destructive',
            onPress: () => {
              resetState();
              safeGoBack();
            },
          },
        ]
      );
    } else {
      safeGoBack();
    }
  };

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    if (mins > 0) {
      return `${mins}m ${secs}s`;
    }
    return `${secs}s`;
  };

  // Success screen with animation
  if (showSuccess) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.successContainer}>
          <Animated.View
            style={[
              styles.successCircle,
              {
                opacity: successOpacity,
                transform: [{ scale: successScale }],
              },
            ]}
          >
            <Ionicons name="checkmark" size={48} color="#FFFFFF" />
          </Animated.View>
          <Animated.Text
            style={[
              styles.successText,
              { opacity: successOpacity },
            ]}
          >
            {successMessage}
          </Animated.Text>
        </View>
      </SafeAreaView>
    );
  }

  if (showProcessing || isProcessing) {
    const hasAudio = duration > 0;
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.processingContainer}>
          <ActivityIndicator size="large" color={NotesColors.primary} />
          <Text style={styles.processingTitle}>
            {flowMode === 'add-to-note' ? 'Adding to Note' : hasAudio ? 'Processing Recording' : 'Saving Note'}
          </Text>
          <Text style={styles.processingStatus}>
            {processingStatus || (hasAudio ? 'Uploading audio...' : 'Creating note...')}
          </Text>
          {processingProgress > 0 && (
            <View style={styles.progressContainer}>
              <View style={[styles.progressBar, { width: `${processingProgress}%` }]} />
            </View>
          )}
          <Text style={styles.processingHint}>
            {flowMode === 'add-to-note'
              ? 'Adding your content to the existing note...'
              : hasAudio
              ? 'This may take a moment while we transcribe and analyze your voice memo.'
              : 'Saving your note...'}
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <RecordingOverlay
        isRecording={isRecording}
        isPaused={isPaused}
        duration={duration}
        recordingUri={pendingAudioUri}
        destination={destination}
        onStartRecording={handleStartRecording}
        onStopRecording={handleStopRecording}
        onPauseRecording={handlePauseRecording}
        onResumeRecording={handleResumeRecording}
        onCancel={handleCancel}
        onProcess={handleProcess}
        onAddToNote={handleAddToNote}
        onIntoFolder={handleIntoFolder}
      />

      {/* Note Selection Sheet (for "Add to..." flow) */}
      <NoteSelectionSheet
        visible={showNoteSheet}
        onSelectNote={handleNoteSelected}
        onClose={() => setShowNoteSheet(false)}
      />

      {/* Folder Selection Sheet (for "Into..." flow - direct folder selection) */}
      <FolderSelectionSheet
        visible={showFolderSheetDirect}
        onSelectFolder={(folderId) => handleFolderSelectedDirect(folderId)}
        onAutoSort={() => {
          // For "Into..." flow, auto-sort just closes and uses auto-sort
          setShowFolderSheetDirect(false);
          // Don't set destination, let it go through normal flow
        }}
        onCreateFolder={handleCreateFolder}
        onClose={() => setShowFolderSheetDirect(false)}
        isProcessing={sheetProcessing}
        processingStatus={sheetProcessingStatus}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: NotesColors.background,
  },
  successContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  successCircle: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: '#34C759',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 24,
    shadowColor: '#34C759',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 8,
  },
  successText: {
    fontSize: 20,
    fontWeight: '600',
    color: NotesColors.textPrimary,
  },
  processingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  processingTitle: {
    fontSize: 24,
    fontWeight: '600',
    color: NotesColors.textPrimary,
    marginTop: 24,
    marginBottom: 8,
  },
  processingStatus: {
    fontSize: 16,
    color: NotesColors.primary,
    marginBottom: 24,
  },
  progressContainer: {
    width: '100%',
    height: 4,
    backgroundColor: NotesColors.card,
    borderRadius: 2,
    marginBottom: 24,
    overflow: 'hidden',
  },
  progressBar: {
    height: '100%',
    backgroundColor: NotesColors.primary,
    borderRadius: 2,
  },
  processingHint: {
    fontSize: 14,
    color: NotesColors.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
  },
});
