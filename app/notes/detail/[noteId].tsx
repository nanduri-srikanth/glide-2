import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TextInput,
  SafeAreaView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Keyboard,
  Modal,
  Pressable,
  Animated,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useLocalSearchParams, useRouter, Stack } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { NotesColors } from '@/constants/theme';
import { getNoteById, formatDuration } from '@/data/mockNotes';
import { FloatingActionBar, ActionCounts } from '@/components/notes/FloatingActionBar';
import { EditableActionsPanel } from '@/components/notes/EditableActionsPanel';
import {
  CalendarAction,
  EmailAction,
  ReminderAction,
  NextStepAction,
  EditableAction,
  NoteActions,
} from '@/data/types';
import { useNoteDetail } from '@/hooks/useNoteDetail';
import { useRecording } from '@/hooks/useRecording';
import { useActionDrafts } from '@/hooks/useActionDrafts';
import { useAuth } from '@/context/AuthContext';
import { useNetwork } from '@/context/NetworkContext';
import { Note } from '@/data/types';
import { useNavigation, usePreventRemove } from '@react-navigation/native';
import { generateTitleFromContent, isUserSetTitle } from '@/utils/textUtils';
import { AddContentModal } from '@/components/notes/AddContentModal';
import { MarkdownContent } from '@/components/notes/MarkdownContent';
import { InputHistoryEntry } from '@/services/voice';
import { GlideRichTextEditor, GlideRichTextEditorHandle } from '@/components/notes/GlideRichTextEditor';
import { useRichEditorEnabled } from '@/hooks/useRichEditorEnabled';
import { richContentRepository, noteVersionsRepository } from '@/lib/repositories';
import { DiffReviewModal } from '@/components/notes/DiffReviewModal';
import { historyService, type SynthesizeResponse } from '@/services/history';


// Convert mock note actions to server action format for the useActionDrafts hook
function convertMockActionsToServerFormat(actions: NoteActions | undefined) {
  if (!actions) return undefined;

  const serverActions: Array<{
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
  }> = [];

  // Convert calendar actions
  actions.calendar.forEach(cal => {
    serverActions.push({
      id: cal.id,
      action_type: 'calendar',
      title: cal.title,
      status: cal.status === 'confirmed' ? 'executed' : 'pending',
      scheduled_date: cal.date && cal.time ? `${cal.date}T${cal.time}:00` : cal.date || null,
      location: cal.location || null,
      attendees: cal.attendees || null,
    });
  });

  // Convert email actions
  actions.email.forEach(email => {
    serverActions.push({
      id: email.id,
      action_type: 'email',
      title: email.subject,
      status: email.status === 'sent' ? 'executed' : 'pending',
      email_to: email.to || null,
      email_subject: email.subject || null,
      email_body: email.body || email.preview || null,
    });
  });

  // Convert reminder actions
  actions.reminders.forEach(rem => {
    serverActions.push({
      id: rem.id,
      action_type: 'reminder',
      title: rem.title,
      status: rem.status === 'completed' ? 'executed' : 'pending',
      scheduled_date: rem.dueDate && rem.dueTime ? `${rem.dueDate}T${rem.dueTime}:00` : rem.dueDate || null,
      priority: rem.priority || null,
    });
  });

  // Convert next steps (strings to objects)
  actions.nextSteps.forEach((step, index) => {
    serverActions.push({
      id: `nextstep-${index}`,
      action_type: 'next_step',
      title: typeof step === 'string' ? step : (step as any).title,
      status: 'pending',
    });
  });

  return serverActions;
}

export default function NoteDetailScreen() {
  const { noteId } = useLocalSearchParams<{ noteId: string }>();
  const router = useRouter();
  const { isAuthenticated } = useAuth();
  const {
    note: apiNote,
    rawNote,
    isLoading,
    error,
    deleteNote,
    updateNote,
    refresh,
    executeAction,
    appendAudio,
    addContent,
    deleteInput,
    inputHistory,
    lastDecision,
    isAppending,
    appendProgress,
    appendStatus,
  } = useNoteDetail(noteId);
  const { isOnline } = useNetwork();

  const navigation = useNavigation();

  // Get mock note for fallback
  const mockNote = getNoteById(noteId || '');

  // Use API note if available, otherwise fall back to mock data
  const note: Note | null = apiNote || mockNote || null;

  // Convert mock actions to server format for the hook when API isn't available
  const serverActionsForHook = useMemo(() => {
    if (rawNote?.actions) {
      return rawNote.actions;
    }
    // Fall back to mock note actions converted to server format
    return convertMockActionsToServerFormat(mockNote?.actions);
  }, [rawNote?.actions, mockNote?.actions]);

  // Use the action drafts hook for dirty tracking and persistence
  const {
    calendarActions: editableCalendarActions,
    emailActions: editableEmailActions,
    reminderActions: editableReminderActions,
    nextStepActions: editableNextStepActions,
    hasUnsavedChanges: hasUnsavedActionChanges,
    hasDraftToRecover,
    draftTimestamp,
    isInitialized: actionsInitialized,
    updateAction: handleUpdateAction,
    deleteAction: handleDeleteAction,
    addAction: handleAddAction,
    recoverDraft,
    discardDraft,
    saveToServer: saveActionsToServer,
    discardChanges: discardActionChanges,
  } = useActionDrafts({
    noteId,
    serverActions: serverActionsForHook,
  });

  const [isDeleting, setIsDeleting] = useState(false);
  const [showAddContentModal, setShowAddContentModal] = useState(false);
  const [isActionsExpanded, setIsActionsExpanded] = useState(false); // Start collapsed
  const [isInputsExpanded, setIsInputsExpanded] = useState(false); // Input history collapsed by default
  const [showExitConfirmModal, setShowExitConfirmModal] = useState(false);
  const [showDraftRecoveryModal, setShowDraftRecoveryModal] = useState(false);
  const [pendingNavigationAction, setPendingNavigationAction] = useState<(() => void) | null>(null);
  const [showOptionsMenu, setShowOptionsMenu] = useState(false);
  const [showDiffReview, setShowDiffReview] = useState(false);
  const [isSynthesizing, setIsSynthesizing] = useState(false);
  const [synthDiff, setSynthDiff] = useState<SynthesizeResponse['diff'] | null>(null);
  const [synthResult, setSynthResult] = useState<SynthesizeResponse | null>(null);

  // Edit mode state
  const [isEditing, setIsEditing] = useState(false);
  const [editedTitle, setEditedTitle] = useState('');
  const [editedTranscript, setEditedTranscript] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const titleInputRef = useRef<TextInput>(null);
  const transcriptInputRef = useRef<TextInput>(null);
  const richEditorRef = useRef<GlideRichTextEditorHandle>(null);
  const scrollY = useRef(new Animated.Value(0)).current;
  const scrollViewRef = useRef<any>(null);
  const [scrollViewHeight, setScrollViewHeight] = useState(0);
  const [editorTopY, setEditorTopY] = useState(0);
  const [richEditorHeight, setRichEditorHeight] = useState(300);
  const lastScrollTimeRef = useRef(0);
  const lastSelectionRef = useRef(0);

  // Rich editor state
  const richEditorEnabled = useRichEditorEnabled();
  const [richRtfBase64, setRichRtfBase64] = useState<string | undefined>(undefined);
  const [richEditorKey, setRichEditorKey] = useState(0);

  // Title auto-generation tracking
  const [userEditedTitle, setUserEditedTitle] = useState(false);
  // Track if either input is focused
  const [isTitleFocused, setIsTitleFocused] = useState(false);
  const [isTranscriptFocused, setIsTranscriptFocused] = useState(false);
  const [isKeyboardVisible, setIsKeyboardVisible] = useState(false);
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const [tagsExpanded, setTagsExpanded] = useState(false);
  const [newTagText, setNewTagText] = useState('');
  const originalTitleRef = useRef<string>(''); // For reverting if user clears title

  // Keyboard visibility tracking
  useEffect(() => {
    const showSubscription = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow',
      (e) => {
        setIsKeyboardVisible(true);
        setKeyboardHeight(e.endCoordinates.height);
      }
    );
    const hideSubscription = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide',
      () => {
        setIsKeyboardVisible(false);
        setKeyboardHeight(0);
      }
    );

    return () => {
      showSubscription.remove();
      hideSubscription.remove();
    };
  }, []);

  // Animated header interpolations (derived values - not hooks)
  const headerOpacity = scrollY.interpolate({
    inputRange: [0, 80, 120],
    outputRange: [1, 0.5, 0],
    extrapolate: 'clamp',
  });
  const titleScale = scrollY.interpolate({
    inputRange: [0, 120],
    outputRange: [1, 0.75],
    extrapolate: 'clamp',
  });
  const titleTranslateY = scrollY.interpolate({
    inputRange: [0, 120],
    outputRange: [0, -20],
    extrapolate: 'clamp',
  });
  // Nav bar title fades IN as main title fades out
  const navTitleOpacity = scrollY.interpolate({
    inputRange: [60, 120],
    outputRange: [0, 1],
    extrapolate: 'clamp',
  });

  // Initialize edit fields when note loads or changes
  useEffect(() => {
    if (note && !isEditing) {
      setEditedTitle(note.title);
      setEditedTranscript(note.transcript);
      originalTitleRef.current = note.title;
      // Check if the existing title appears to be user-set
      setUserEditedTitle(isUserSetTitle(note.title));
    }
  }, [note?.title, note?.transcript, isEditing]);

  // Load persisted RTF content when note opens (rich editor only)
  useEffect(() => {
    if (!richEditorEnabled || !noteId) return;
    let cancelled = false;
    richContentRepository.get(noteId).then((row) => {
      if (cancelled) return;
      if (row) {
        setRichRtfBase64(row.rtf_base64);
      }
    }).catch(console.warn);
    return () => { cancelled = true; };
  }, [richEditorEnabled, noteId]);

  // Debounced auto-save function
  const debouncedSave = useCallback(async (title: string, transcript: string) => {
    if (!isAuthenticated || !note) return;

    setIsSaving(true);
    const success = await updateNote({ title, transcript });
    setIsSaving(false);

    if (success) {
      setHasUnsavedChanges(false);
    } else {
      Alert.alert('Save Failed', 'Unable to save changes. Please try again.');
    }
  }, [isAuthenticated, note, updateNote]);

  // Handle text changes with debounce
  const handleTitleChange = useCallback((text: string) => {
    setEditedTitle(text);
    setHasUnsavedChanges(true);

    // Mark as user-edited if they typed something meaningful
    if (text.trim().length > 0) {
      setUserEditedTitle(true);
      originalTitleRef.current = text; // Update the "original" to the new user-set title
    }

    // Clear existing timeout
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }

    // If user cleared the title, revert to original or auto-generate
    let titleToSave = text;
    if (text.trim().length === 0 && editedTranscript.trim().length > 0) {
      // Auto-generate from transcript
      const generatedTitle = generateTitleFromContent(editedTranscript);
      if (generatedTitle) {
        setEditedTitle(generatedTitle);
        titleToSave = generatedTitle;
        setUserEditedTitle(false); // Reset since it's now auto-generated
      }
    }

    // Set new timeout for auto-save (1.5 seconds)
    saveTimeoutRef.current = setTimeout(() => {
      debouncedSave(titleToSave, editedTranscript);
    }, 1500);
  }, [editedTranscript, debouncedSave]);

  const handleTranscriptChange = useCallback((text: string) => {
    setEditedTranscript(text);
    setHasUnsavedChanges(true);

    // Clear existing timeout
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }

    // Auto-generate title if user hasn't manually set one
    let titleToSave = editedTitle;
    if (!userEditedTitle && text.trim().length > 0) {
      const generatedTitle = generateTitleFromContent(text);
      if (generatedTitle && generatedTitle !== editedTitle) {
        setEditedTitle(generatedTitle);
        titleToSave = generatedTitle;
      }
    }

    // Set new timeout for auto-save (1.5 seconds)
    saveTimeoutRef.current = setTimeout(() => {
      debouncedSave(titleToSave, text);
    }, 1500);
  }, [editedTitle, userEditedTitle, debouncedSave]);

  // Auto-scroll so caret sits at ~25% down the visible viewport
  // Throttled with comfort band to reduce jitter during continuous typing
  const handleSelectionChange = useCallback((e: {
    selectionStart: number;
    selectionEnd: number;
    caretY: number;
    caretHeight: number;
  }) => {
    if (!isEditing) return;
    if (keyboardHeight === 0) return; // No keyboard visible, no scrolling needed

    const caretContentY = editorTopY + e.caretY;

    const visibleHeight = scrollViewHeight - keyboardHeight;
    if (visibleHeight <= 0) return;

    // Determine if this is a small move (typing) vs a jump (tap, focus)
    const selectionDelta = Math.abs(e.selectionEnd - lastSelectionRef.current);
    lastSelectionRef.current = e.selectionEnd;
    const isTyping = selectionDelta <= 2;

    // Throttle: skip if less than 100ms since last scroll
    const now = Date.now();
    if (isTyping && now - lastScrollTimeRef.current < 100) return;

    // Target: place caret at 25% down the visible area
    const targetCaretScreenY = visibleHeight * 0.25;
    const targetScrollY = Math.max(0, caretContentY - targetCaretScreenY);

    if (isTyping) {
      // For typing, scroll instantly (no animation) to avoid jitter, rely on throttle
      lastScrollTimeRef.current = now;
      // @ts-ignore - Animated.ScrollView has scrollTo via getNode or direct
      scrollViewRef.current?.scrollTo({ y: targetScrollY, animated: false });
    } else {
      // Jump (tap, initial focus): smooth scroll
      lastScrollTimeRef.current = now;
      // @ts-ignore - Animated.ScrollView has scrollTo via getNode or direct
      scrollViewRef.current?.scrollTo({ y: targetScrollY, animated: true });
    }
  }, [isEditing, keyboardHeight, scrollViewHeight, editorTopY]);

  const handleContentSizeChange = useCallback((e: { height: number }) => {
    const next = Math.max(300, Math.ceil(e.height));
    setRichEditorHeight(prev => (prev === next ? prev : next));
  }, []);

  // Enter edit mode
  const handleEdit = useCallback(() => {
    if (!isAuthenticated) {
      Alert.alert('Sign In Required', 'Please sign in to edit notes.');
      return;
    }
    setIsEditing(true);
    setTagsExpanded(false);
    if (richEditorEnabled) {
      // Small delay to let editable prop propagate before focusing
      setTimeout(() => richEditorRef.current?.focus(), 50);
    } else {
      setTimeout(() => transcriptInputRef.current?.focus(), 100);
    }
  }, [isAuthenticated, richEditorEnabled]);

  // Handle tap-to-edit from native GlideRichTextEditor (replaces Pressable overlay)
  const handleEditTap = useCallback((e: { tapOffset: number; tapY: number }) => {
    if (isEditing) return;
    handleEdit();
  }, [isEditing, handleEdit]);

  // Exit edit mode (can be called manually or on blur)
  const handleDoneEditing = useCallback(async () => {
    setTagsExpanded(false);
    // Clear any pending save
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }

    // Request RTF snapshot (persisted via onRichSnapshot callback)
    if (richEditorEnabled) {
      richEditorRef.current?.requestRtfSnapshot();
    }

    // Save if there are unsaved changes
    if (hasUnsavedChanges) {
      setIsSaving(true);
      await updateNote({ title: editedTitle, transcript: editedTranscript });
      setIsSaving(false);
      setHasUnsavedChanges(false);
    }

    Keyboard.dismiss();
    setIsEditing(false);
  }, [hasUnsavedChanges, editedTitle, editedTranscript, updateNote, richEditorEnabled]);

  // Handle blur - exit edit mode if neither field is focused
  const handleTitleBlur = useCallback(() => {
    setIsTitleFocused(false);
    // Native rich editor doesn't report focus/blur into JS; avoid auto-exiting edit mode.
    if (richEditorEnabled) return;
    // Small delay to allow focus to transfer to transcript field
    setTimeout(() => {
      if (!isTranscriptFocused) {
        handleDoneEditing();
      }
    }, 100);
  }, [isTranscriptFocused, handleDoneEditing, richEditorEnabled]);

  const handleTranscriptBlur = useCallback(() => {
    setIsTranscriptFocused(false);
    // Small delay to allow focus to transfer to title field
    setTimeout(() => {
      if (!isTitleFocused) {
        handleDoneEditing();
      }
    }, 100);
  }, [isTitleFocused, handleDoneEditing]);

  // Rich editor: persist RTF snapshot when received from native side
  const handleRichSnapshot = useCallback((rtfBase64: string) => {
    if (!noteId) return;
    richContentRepository.save(noteId, rtfBase64, editedTranscript).catch(console.warn);
  }, [noteId, editedTranscript]);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, []);

  // Show draft recovery modal when there's a draft to recover
  useEffect(() => {
    if (hasDraftToRecover && actionsInitialized) {
      setShowDraftRecoveryModal(true);
    }
  }, [hasDraftToRecover, actionsInitialized]);

  // Navigation guard for unsaved changes using usePreventRemove
  usePreventRemove(hasUnsavedActionChanges, ({ data }) => {
    // Store the navigation action to execute if user confirms
    setPendingNavigationAction(() => () => navigation.dispatch(data.action));
    setShowExitConfirmModal(true);
  });

  // Format duration as MM:SS
  const formatInputDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  // Format timestamp for input history
  const formatInputTime = useCallback((timestamp: string) => {
    const date = new Date(timestamp);
    return date.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  }, []);

  // Handle add content button press
  const handleAddContentPress = useCallback(() => {
    if (!isAuthenticated) {
      Alert.alert('Sign In Required', 'Please sign in to add content.');
      return;
    }
    setShowAddContentModal(true);
  }, [isAuthenticated]);

  // Handle formatting from toolbar
  const handleFormat = useCallback((format: FormatType, value?: string) => {
    // Get current selection/cursor position from the transcript input
    // For now, we'll insert markdown syntax at cursor or wrap selection
    // This is a simplified implementation - full rich text would need more work

    const formatMap: Record<FormatType, { prefix: string; suffix: string }> = {
      'bold': { prefix: '**', suffix: '**' },
      'italic': { prefix: '_', suffix: '_' },
      'underline': { prefix: '<u>', suffix: '</u>' },
      'bullet': { prefix: '\n- ', suffix: '' },
      'number': { prefix: '\n1. ', suffix: '' },
      'header': { prefix: '\n## ', suffix: '' },
      'table': { prefix: '\n| Column 1 | Column 2 |\n|----------|----------|\n| Cell 1   | Cell 2   |', suffix: '' },
      'attachment': { prefix: '[Attachment](', suffix: ')' },
      'link': { prefix: '[', suffix: '](url)' },
      'indent-left': { prefix: '', suffix: '' }, // Handle separately
      'indent-right': { prefix: '  ', suffix: '' },
    };

    const formatting = formatMap[format];
    if (formatting) {
      // Insert at cursor position
      setEditedTranscript(prev => prev + formatting.prefix + formatting.suffix);
      setHasUnsavedChanges(true);
    }
  }, []);

  // Handle recording complete from toolbar
  const handleToolbarRecordingComplete = useCallback(async (audioUri: string, duration: number) => {
    if (!isAuthenticated) {
      Alert.alert('Sign In Required', 'Please sign in to add recordings.');
      return;
    }

    // Add the audio content to the note
    const success = await addContent({ audioUri });
    if (success) {
      Alert.alert('Success', 'Recording added to note.');
    } else {
      Alert.alert('Error', 'Failed to add recording. Please try again.');
    }
  }, [isAuthenticated, addContent]);

  // Handle add content modal submit
  const handleAddContentSubmit = useCallback(async (options: {
    textInput?: string;
    audioUri?: string;
    resynthesize?: boolean;
  }): Promise<boolean> => {
    const success = await addContent(options);
    if (success) {
      // Reset dirty tracking since content was saved to server
      discardActionChanges();
      // Show what decision was made
      if (lastDecision) {
        const decisionType = lastDecision.update_type === 'resynthesize' ? 're-synthesized' : 'added to';
        Alert.alert('Success', `Content has been ${decisionType} your note.`);
      }
    }
    return success;
  }, [addContent, lastDecision, discardActionChanges]);

  // Handle delete input
  const handleDeleteInput = useCallback((index: number, entry: InputHistoryEntry) => {
    if (!isAuthenticated) {
      Alert.alert('Sign In Required', 'Please sign in to delete inputs.');
      return;
    }

    const inputType = entry.type === 'audio' ? 'audio recording' : 'text note';
    const isLastInput = inputHistory.length === 1;

    if (isLastInput) {
      Alert.alert(
        'Cannot Delete',
        'This is the only input. Delete the entire note instead.',
        [{ text: 'OK' }]
      );
      return;
    }

    Alert.alert(
      'Delete Input',
      `Are you sure you want to delete this ${inputType}? The note will be re-synthesized from the remaining inputs.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            const success = await deleteInput(index);
            if (!success) {
              Alert.alert('Error', 'Failed to delete input. Please try again.');
            }
          },
        },
      ]
    );
  }, [isAuthenticated, inputHistory.length, deleteInput]);

  // Handle exit confirmation modal actions
  const handleConfirmExit = useCallback(() => {
    setShowExitConfirmModal(false);
    discardActionChanges();
    if (pendingNavigationAction) {
      pendingNavigationAction();
      setPendingNavigationAction(null);
    }
  }, [discardActionChanges, pendingNavigationAction]);

  const handleSaveAndExit = useCallback(async () => {
    const success = await saveActionsToServer();
    if (success) {
      setShowExitConfirmModal(false);
      if (pendingNavigationAction) {
        pendingNavigationAction();
        setPendingNavigationAction(null);
      }
    } else {
      Alert.alert('Save Failed', 'Unable to save changes. Please try again.');
    }
  }, [saveActionsToServer, pendingNavigationAction]);

  const handleCancelExit = useCallback(() => {
    setShowExitConfirmModal(false);
    setPendingNavigationAction(null);
  }, []);

  // Handle draft recovery modal actions
  const handleRecoverDraft = useCallback(() => {
    recoverDraft();
    setShowDraftRecoveryModal(false);
  }, [recoverDraft]);

  const handleDiscardDraft = useCallback(async () => {
    await discardDraft();
    setShowDraftRecoveryModal(false);
  }, [discardDraft]);

  // Format draft timestamp for display
  const formatDraftTime = useCallback((timestamp: string | null) => {
    if (!timestamp) return '';
    const date = new Date(timestamp);
    return date.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  }, []);

  const handleAcceptSynth = useCallback(async () => {
    setShowDiffReview(false);
    if (!synthResult || !noteId) return;

    try {
      const version = synthResult.version;
      const success = await updateNote({
        title: version.title ?? undefined,
        transcript: version.body_plain ?? undefined,
      });

      if (success) {
        // Create a version snapshot locally
        try {
          await noteVersionsRepository.create({
            note_id: noteId,
            kind: 'synth',
            actor: 'ai',
            title: version.title || null,
            body_plain: version.body_plain || null,
            summary_plain: version.summary_plain || null,
          });
          await noteVersionsRepository.prune(noteId);
        } catch (err) {
          console.warn('[NoteDetail] Failed to create version after accept synth:', err);
        }

        await refresh();
        Alert.alert('Success', 'Note has been re-synthesized.');
      }
    } catch (err) {
      console.warn('[NoteDetail] Failed to apply synth result:', err);
      Alert.alert('Error', 'Failed to apply changes. Please try again.');
    } finally {
      setSynthResult(null);
      setSynthDiff(null);
    }
  }, [synthResult, noteId, updateNote, refresh]);

  const handleDiscardSynth = useCallback(() => {
    setShowDiffReview(false);
    setSynthDiff(null);
    setSynthResult(null);
  }, []);

  const MAX_TAGS = 10;

  const handleAddTag = useCallback(() => {
    const tag = newTagText.trim().replace(/^#/, '').replace(/\s+/g, '-');
    if (!tag || !note) return;
    if (note.tags.length >= MAX_TAGS) {
      Alert.alert('Limit Reached', `You can have up to ${MAX_TAGS} tags.`);
      return;
    }
    if (note.tags.includes(tag)) {
      setNewTagText('');
      return;
    }
    const updated = [...note.tags, tag];
    updateNote({ tags: updated });
    setNewTagText('');
  }, [newTagText, note, updateNote]);

  const handleRemoveTag = useCallback((tagToRemove: string) => {
    if (!note) return;
    const updated = note.tags.filter(t => t !== tagToRemove);
    updateNote({ tags: updated });
  }, [note, updateNote]);

  if (isLoading) {
    return (
      <SafeAreaView style={styles.container}>
        <Stack.Screen options={{ title: '' }} />
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={NotesColors.primary} />
        </View>
      </SafeAreaView>
    );
  }

  if (!note) {
    return (
      <SafeAreaView style={styles.container}>
        <Stack.Screen options={{ title: 'Note Not Found' }} />
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>{error || 'Note not found'}</Text>
        </View>
      </SafeAreaView>
    );
  }

  const formatFullDate = (timestamp: string) => {
    const date = new Date(timestamp);
    return date.toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  };

  const handleExecuteAction = async (actionId: string, service: 'google' | 'apple') => {
    const result = await executeAction(actionId, service);
    if (result) {
      Alert.alert('Success', result.message || 'Action executed successfully');
    }
  };

  const handleShare = () => {
    // In a real app, this would open share sheet
    console.log('Share note');
  };

  // Handle re-synthesize - call API, then show diff review modal
  const handleResynthesize = () => {
    if (!isAuthenticated) {
      Alert.alert('Sign In Required', 'Please sign in to use AI features.');
      return;
    }

    // Open the diff review modal and kick off synthesis in the background
    setShowDiffReview(true);
    setIsSynthesizing(true);
    setSynthDiff(null);

    historyService.synthesize(noteId).then(({ data, error }) => {
      setIsSynthesizing(false);
      if (error || !data) {
        Alert.alert('Error', error || 'Failed to re-synthesize. Please try again.');
        setShowDiffReview(false);
        return;
      }
      setSynthResult(data);
      setSynthDiff(data.diff);
    });
  };



  const handleDelete = () => {
    Alert.alert(
      'Delete Note',
      'Are you sure you want to delete this note? This action cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            setIsDeleting(true);
            const success = await deleteNote();
            setIsDeleting(false);
            if (success) {
              router.back();
            } else {
              Alert.alert('Error', 'Failed to delete note');
            }
          },
        },
      ]
    );
  };

  // Calculate action counts for the floating bar (excluding deleted)
  const actionCounts: ActionCounts = {
    calendar: editableCalendarActions.filter(a => !a.isDeleted).length,
    email: editableEmailActions.filter(a => !a.isDeleted).length,
    reminders: editableReminderActions.filter(a => !a.isDeleted).length,
  };

  return (
    <SafeAreaView style={styles.container}>
      <Stack.Screen
        options={{
          title: '',
          headerTransparent: false,
          headerStyle: { backgroundColor: NotesColors.background },
          headerTitle: () => (
            <Animated.Text
              style={[styles.navBarTitle, { opacity: navTitleOpacity }]}
              numberOfLines={1}
              ellipsizeMode="tail"
            >
              {note.title.length > 25 ? note.title.substring(0, 25) + '...' : note.title}
            </Animated.Text>
          ),
          headerLeft: () => (
            <TouchableOpacity
              onPress={async () => {
                if (isEditing) {
                  await handleDoneEditing();
                }
                if (router.canDismiss()) {
                  router.dismiss();
                } else if (router.canGoBack()) {
                  router.back();
                } else {
                  router.navigate('/');
                }
              }}
              style={styles.headerBackButton}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel="Back"
            >
              <Ionicons name="chevron-back" size={26} color={NotesColors.primary} />
            </TouchableOpacity>
          ),
          headerRight: () => (
            <TouchableOpacity onPress={() => setShowOptionsMenu(true)} style={styles.headerButton}>
              <Ionicons name="ellipsis-vertical" size={24} color={NotesColors.primary} />
            </TouchableOpacity>
          ),
        }}
      />

      {/* Saving Indicator */}
      {isSaving && (
        <View style={styles.savingIndicator}>
          <ActivityIndicator size="small" color={NotesColors.primary} />
          <Text style={styles.savingText}>Saving...</Text>
        </View>
      )}

      {/* Unsaved Actions Indicator */}
      {hasUnsavedActionChanges && !isSaving && (
        <View style={styles.unsavedIndicator}>
          <Ionicons name="ellipse" size={8} color={NotesColors.primary} />
          <Text style={styles.unsavedText}>Unsaved changes</Text>
        </View>
      )}

      {/* Offline Sync Indicator */}
      {!isOnline && rawNote?.sync_status === 'pending' && !rawNote?.ai_processed && (
        <View style={styles.offlineSyncIndicator}>
          <Ionicons name="cloud-offline-outline" size={14} color={NotesColors.textSecondary} />
          <Text style={styles.offlineSyncText}>Waiting for connection to sync</Text>
        </View>
      )}

      <Animated.ScrollView
        ref={scrollViewRef}
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        onScroll={Animated.event(
          [{ nativeEvent: { contentOffset: { y: scrollY } } }],
          { useNativeDriver: false }
        )}
        scrollEventThrottle={16}
        onLayout={(e: any) => setScrollViewHeight(e.nativeEvent.layout.height)}
      >
        {/* Header with animated collapsing */}
        <View style={styles.header}>
          {isEditing ? (
            <TextInput
              ref={titleInputRef}
              style={styles.titleInput}
              value={editedTitle}
              onChangeText={handleTitleChange}
              onFocus={() => setIsTitleFocused(true)}
              onBlur={handleTitleBlur}
              placeholder="Note title"
              placeholderTextColor={NotesColors.textSecondary}
              multiline
              blurOnSubmit
              returnKeyType="done"
            />
          ) : (
            <Animated.View style={{
              transform: [
                { scale: titleScale },
                { translateY: titleTranslateY }
              ],
              transformOrigin: 'left top',
            }}>
              <TouchableOpacity onPress={handleEdit} activeOpacity={0.7}>
                <Text style={styles.title}>{note.title}</Text>
              </TouchableOpacity>
            </Animated.View>
          )}
          <Animated.View style={[styles.metadata, { opacity: headerOpacity }]}>
            <View style={styles.metaItem}>
              <Ionicons name="time-outline" size={14} color={NotesColors.textSecondary} />
              <Text style={styles.metaText}>{formatFullDate(note.timestamp)}</Text>
            </View>
            <View style={styles.metaItem}>
              <Ionicons name="mic-outline" size={14} color={NotesColors.textSecondary} />
              <Text style={styles.metaText}>{formatDuration(note.duration)} recording</Text>
            </View>
          </Animated.View>

          {/* Tags — show up to 2 collapsed, all + editing when expanded */}
          {(note.tags.length > 0 || tagsExpanded) && (
            <Animated.View style={[styles.tagsContainer, { opacity: headerOpacity }]}>
              {(tagsExpanded ? note.tags : note.tags.slice(0, 2)).map((tag, index) => (
                <View key={index} style={[styles.tag, tagsExpanded && styles.tagExpanded]}>
                  <Text style={styles.tagText}>#{tag}</Text>
                  {tagsExpanded && (
                    <TouchableOpacity
                      onPress={() => handleRemoveTag(tag)}
                      hitSlop={{ top: 8, bottom: 8, left: 4, right: 8 }}
                    >
                      <Ionicons name="close-circle" size={14} color={NotesColors.textSecondary} />
                    </TouchableOpacity>
                  )}
                </View>
              ))}
              {!tagsExpanded && note.tags.length > 2 && (
                <TouchableOpacity activeOpacity={0.6} onPress={() => setTagsExpanded(true)}>
                  <Text style={styles.tagsOverflowText}>+{note.tags.length - 2} more</Text>
                </TouchableOpacity>
              )}
              {!tagsExpanded && note.tags.length <= 2 && note.tags.length > 0 && (
                <TouchableOpacity activeOpacity={0.6} onPress={() => setTagsExpanded(true)}>
                  <Ionicons name="add-circle-outline" size={18} color={NotesColors.textSecondary} />
                </TouchableOpacity>
              )}
              {tagsExpanded && note.tags.length < MAX_TAGS && (
                <View style={styles.tagInputWrapper}>
                  <TextInput
                    style={styles.tagInput}
                    placeholder="add tag"
                    placeholderTextColor={NotesColors.textSecondary}
                    value={newTagText}
                    onChangeText={setNewTagText}
                    onSubmitEditing={handleAddTag}
                    returnKeyType="done"
                    autoCapitalize="none"
                    autoCorrect={false}
                    maxLength={30}
                  />
                </View>
              )}
              {tagsExpanded && (
                <TouchableOpacity activeOpacity={0.6} onPress={() => { setTagsExpanded(false); setNewTagText(''); }}>
                  <Text style={styles.tagsOverflowText}>show less</Text>
                </TouchableOpacity>
              )}
            </Animated.View>
          )}
        </View>

        {/* Floating Action Bar - Collapsible actions panel */}
        <FloatingActionBar
          counts={actionCounts}
          isExpanded={isActionsExpanded}
          onToggleExpand={() => setIsActionsExpanded(!isActionsExpanded)}
        >
          <EditableActionsPanel
            calendarActions={editableCalendarActions}
            emailActions={editableEmailActions}
            reminderActions={editableReminderActions}
            onUpdateAction={handleUpdateAction}
            onDeleteAction={handleDeleteAction}
            onAddAction={handleAddAction}
            onExecuteAction={isAuthenticated ? handleExecuteAction : undefined}
          />
        </FloatingActionBar>

        {/* Input History Section - Collapsible */}
        {inputHistory.length > 0 && (
          <View style={styles.inputHistorySection}>
            <TouchableOpacity
              style={styles.inputHistoryHeader}
              onPress={() => setIsInputsExpanded(!isInputsExpanded)}
              activeOpacity={0.7}
            >
              <View style={styles.inputHistoryHeaderLeft}>
                <Ionicons name="layers-outline" size={16} color={NotesColors.textSecondary} />
                <Text style={styles.inputHistoryTitle}>
                  Inputs ({inputHistory.length})
                </Text>
              </View>
              <Ionicons
                name={isInputsExpanded ? 'chevron-up' : 'chevron-down'}
                size={18}
                color={NotesColors.textSecondary}
              />
            </TouchableOpacity>

            {isInputsExpanded && (
              <View style={styles.inputHistoryList}>
                {inputHistory.map((entry, index) => (
                  <View key={index} style={styles.inputHistoryItem}>
                    <View style={styles.inputHistoryItemLeft}>
                      <View style={[
                        styles.inputTypeIcon,
                        entry.type === 'audio' ? styles.inputTypeIconAudio : styles.inputTypeIconText
                      ]}>
                        <Ionicons
                          name={entry.type === 'audio' ? 'mic' : 'document-text'}
                          size={12}
                          color={entry.type === 'audio' ? '#FF3B30' : NotesColors.primary}
                        />
                      </View>
                      <View style={styles.inputHistoryItemInfo}>
                        <Text style={styles.inputHistoryItemType}>
                          {entry.type === 'audio'
                            ? `Audio (${formatInputDuration(entry.duration || 0)})`
                            : 'Text note'
                          }
                        </Text>
                        <Text style={styles.inputHistoryItemTime}>
                          {formatInputTime(entry.timestamp)}
                        </Text>
                        {entry.type === 'text' && (
                          <Text style={styles.inputHistoryItemPreview} numberOfLines={1}>
                            {entry.content.substring(0, 50)}{entry.content.length > 50 ? '...' : ''}
                          </Text>
                        )}
                      </View>
                    </View>
                    <TouchableOpacity
                      style={styles.inputDeleteButton}
                      onPress={() => handleDeleteInput(index, entry)}
                      disabled={isAppending}
                    >
                      <Ionicons name="trash-outline" size={16} color={NotesColors.textSecondary} />
                    </TouchableOpacity>
                  </View>
                ))}
              </View>
            )}
          </View>
        )}

        {/* Transcript - flows naturally below tags/actions */}
        {richEditorEnabled ? (
          // UNIFIED: always render native UITextView, toggle editability
          <View
            style={styles.richEditorContainer}
            onLayout={(e: any) => setEditorTopY(e.nativeEvent.layout.y)}
          >
            <GlideRichTextEditor
              ref={richEditorRef}
              rtfBase64={richRtfBase64}
              initialPlaintext={richRtfBase64 ? undefined : editedTranscript}
              editable={isEditing}
              scrollEnabled={false}
              selectable={true}
              autoFocus={false}
              onChangeText={handleTranscriptChange}
              onRichSnapshot={handleRichSnapshot}
              onSelectionChange={handleSelectionChange}
              onContentSizeChange={handleContentSizeChange}
              placeholder="Start typing..."
              style={[styles.richEditor, { height: richEditorHeight }]}
              {...({ onEditTap: handleEditTap } as any)}
            />
          </View>
        ) : (
          // Non-rich-editor path (Android, or feature disabled)
          isEditing ? (
            <TextInput
              ref={transcriptInputRef}
              style={styles.transcriptText}
              value={editedTranscript}
              onChangeText={handleTranscriptChange}
              onFocus={() => setIsTranscriptFocused(true)}
              onBlur={handleTranscriptBlur}
              placeholder="Start typing..."
              placeholderTextColor={NotesColors.textSecondary}
              multiline
              textAlignVertical="top"
            />
          ) : (
            <TouchableOpacity onPress={handleEdit} activeOpacity={0.7}>
              <MarkdownContent content={note.transcript} />
            </TouchableOpacity>
          )
        )}
      </Animated.ScrollView>


      {/* Floating Mic Button - hidden when keyboard is visible */}
      {!isKeyboardVisible && (
        <TouchableOpacity
          style={styles.floatingAddButton}
          onPress={handleAddContentPress}
          disabled={isAppending}
          activeOpacity={0.8}
        >
          {isAppending ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <Ionicons name="mic" size={26} color="#fff" />
          )}
        </TouchableOpacity>
      )}

      {/* Options Menu Modal */}
      <Modal
        visible={showOptionsMenu}
        transparent
        animationType="fade"
        onRequestClose={() => setShowOptionsMenu(false)}
      >
        <Pressable
          style={styles.optionsOverlay}
          onPress={() => setShowOptionsMenu(false)}
        >
          <View style={styles.optionsMenu}>
            <TouchableOpacity
              style={styles.optionsMenuItem}
              onPress={() => {
                setShowOptionsMenu(false);
                handleShare();
              }}
            >
              <Ionicons name="share-outline" size={20} color={NotesColors.primary} />
              <Text style={styles.optionsMenuText}>Share</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.optionsMenuItem}
              onPress={() => {
                setShowOptionsMenu(false);
                router.push(`/notes/detail/transcript/${noteId}`);
              }}
            >
              <Ionicons name="document-text-outline" size={20} color={NotesColors.primary} />
              <Text style={styles.optionsMenuText}>Full Transcript</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.optionsMenuItem}
              onPress={() => {
                setShowOptionsMenu(false);
                router.push(`/notes/detail/history/${noteId}`);
              }}
            >
              <Ionicons name="time-outline" size={20} color={NotesColors.primary} />
              <Text style={styles.optionsMenuText}>Version History</Text>
            </TouchableOpacity>
            {inputHistory.length > 0 && (
              <TouchableOpacity
                style={styles.optionsMenuItem}
                onPress={() => {
                  setShowOptionsMenu(false);
                  handleResynthesize();
                }}
              >
                <Ionicons name="sparkles-outline" size={20} color={NotesColors.primary} />
                <Text style={styles.optionsMenuText}>Re-synthesize with AI</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity
              style={[styles.optionsMenuItem, styles.optionsMenuItemDestructive]}
              onPress={() => {
                setShowOptionsMenu(false);
                handleDelete();
              }}
            >
              <Ionicons name="trash-outline" size={20} color="#FF3B30" />
              <Text style={[styles.optionsMenuText, styles.optionsMenuTextDestructive]}>Delete Note</Text>
            </TouchableOpacity>
          </View>
        </Pressable>
      </Modal>

      {/* Diff Review Modal for Re-synthesize */}
      <DiffReviewModal
        visible={showDiffReview}
        onAccept={handleAcceptSynth}
        onDiscard={handleDiscardSynth}
        diff={synthDiff}
        isLoading={isSynthesizing}
      />

      {/* Add Content Modal */}
      <AddContentModal
        visible={showAddContentModal}
        onClose={() => setShowAddContentModal(false)}
        onSubmit={handleAddContentSubmit}
        isProcessing={isAppending}
        processingStatus={appendStatus}
        processingProgress={appendProgress}
      />

      {/* Exit Confirmation Modal */}
      <Modal
        visible={showExitConfirmModal}
        transparent
        animationType="fade"
        onRequestClose={handleCancelExit}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.confirmModal}>
            <Text style={styles.confirmModalTitle}>Unsaved Changes</Text>
            <Text style={styles.confirmModalText}>
              You have unsaved changes to your actions. What would you like to do?
            </Text>
            <View style={styles.confirmModalButtons}>
              <TouchableOpacity
                style={[styles.confirmButton, styles.discardButton]}
                onPress={handleConfirmExit}
              >
                <Text style={styles.discardButtonText}>Discard</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.confirmButton, styles.saveButton]}
                onPress={handleSaveAndExit}
              >
                <Text style={styles.saveButtonText}>Save & Exit</Text>
              </TouchableOpacity>
            </View>
            <TouchableOpacity
              style={styles.cancelExitButton}
              onPress={handleCancelExit}
            >
              <Text style={styles.cancelExitButtonText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Draft Recovery Modal */}
      <Modal
        visible={showDraftRecoveryModal}
        transparent
        animationType="fade"
        onRequestClose={handleDiscardDraft}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.confirmModal}>
            <Ionicons name="document-text-outline" size={40} color={NotesColors.primary} style={styles.recoveryIcon} />
            <Text style={styles.confirmModalTitle}>Recover Draft?</Text>
            <Text style={styles.confirmModalText}>
              You have unsaved changes from {formatDraftTime(draftTimestamp)}. Would you like to recover them?
            </Text>
            <View style={styles.confirmModalButtons}>
              <TouchableOpacity
                style={[styles.confirmButton, styles.discardButton]}
                onPress={handleDiscardDraft}
              >
                <Text style={styles.discardButtonText}>Discard</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.confirmButton, styles.saveButton]}
                onPress={handleRecoverDraft}
              >
                <Text style={styles.saveButtonText}>Recover</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: NotesColors.background,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  errorText: {
    fontSize: 17,
    color: NotesColors.textSecondary,
  },
  headerButton: {
    padding: 8,
  },
  headerBackButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: NotesColors.card,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: NotesColors.border,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 2,
  },
  navBarTitle: {
    fontSize: 17,
    fontWeight: '600',
    color: NotesColors.textPrimary,
    maxWidth: 180,
    textAlign: 'center',
  },
  headerRightContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  savingIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 8,
    backgroundColor: 'rgba(98, 69, 135, 0.1)',
  },
  savingText: {
    fontSize: 14,
    color: NotesColors.textSecondary,
  },
  unsavedIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 6,
    backgroundColor: 'rgba(98, 69, 135, 0.08)',
  },
  unsavedText: {
    fontSize: 12,
    color: NotesColors.textSecondary,
  },
  offlineSyncIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 6,
    backgroundColor: 'rgba(0, 0, 0, 0.04)',
  },
  offlineSyncText: {
    fontSize: 12,
    color: NotesColors.textSecondary,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 100,
  },
  header: {
    marginBottom: 24,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: NotesColors.textPrimary,
    marginBottom: 12,
  },
  titleInput: {
    fontSize: 28,
    fontWeight: '700',
    color: NotesColors.textPrimary,
    marginBottom: 12,
    padding: 0,
    minHeight: 40,
  },
  metadata: {
    gap: 8,
  },
  metaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  metaText: {
    fontSize: 14,
    color: NotesColors.textSecondary,
  },
  tagsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 12,
  },
  tag: {
    backgroundColor: 'rgba(98, 69, 135, 0.2)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  tagText: {
    fontSize: 13,
    color: NotesColors.primary,
    fontWeight: '500',
  },
  tagExpanded: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  tagInputWrapper: {
    backgroundColor: 'rgba(98, 69, 135, 0.08)',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: NotesColors.border,
    borderStyle: 'dashed',
    paddingHorizontal: 10,
    paddingVertical: 2,
  },
  tagInput: {
    fontSize: 13,
    color: NotesColors.textPrimary,
    minWidth: 60,
    padding: 0,
    height: 22,
  },
  tagsOverflowText: {
    fontSize: 13,
    color: NotesColors.textSecondary,
    fontWeight: '500',
    paddingVertical: 4,
  },
  transcriptText: {
    fontSize: 16,
    lineHeight: 26,
    color: NotesColors.textPrimary,
    marginTop: 8,
    minHeight: 100,
  },
  richEditor: {
    minHeight: 300,
    marginTop: 8,
  },
  richEditorContainer: {
    position: 'relative',
    minHeight: 200,
  },
  // Input History styles
  inputHistorySection: {
    backgroundColor: NotesColors.card,
    borderRadius: 12,
    marginBottom: 16,
    overflow: 'hidden',
  },
  inputHistoryHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  inputHistoryHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  inputHistoryTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: NotesColors.textSecondary,
  },
  inputHistoryList: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(255, 255, 255, 0.1)',
  },
  inputHistoryItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(255, 255, 255, 0.05)',
  },
  inputHistoryItemLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    gap: 10,
  },
  inputTypeIcon: {
    width: 28,
    height: 28,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
  },
  inputTypeIconAudio: {
    backgroundColor: 'rgba(255, 59, 48, 0.15)',
  },
  inputTypeIconText: {
    backgroundColor: 'rgba(98, 69, 135, 0.2)',
  },
  inputHistoryItemInfo: {
    flex: 1,
  },
  inputHistoryItemType: {
    fontSize: 14,
    fontWeight: '500',
    color: NotesColors.textPrimary,
  },
  inputHistoryItemTime: {
    fontSize: 12,
    color: NotesColors.textSecondary,
    marginTop: 1,
  },
  inputHistoryItemPreview: {
    fontSize: 12,
    color: NotesColors.textSecondary,
    marginTop: 2,
    fontStyle: 'italic',
  },
  inputDeleteButton: {
    padding: 8,
    marginLeft: 8,
  },
  // Floating Add Button
  floatingAddButton: {
    position: 'absolute',
    bottom: 24,
    right: 20,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: NotesColors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  // Options Menu styles
  optionsOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-start',
    alignItems: 'flex-end',
    paddingTop: 100,
    paddingRight: 16,
  },
  optionsMenu: {
    backgroundColor: NotesColors.card,
    borderRadius: 12,
    paddingVertical: 8,
    minWidth: 200,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  optionsMenuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 12,
  },
  optionsMenuItemDestructive: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(255, 255, 255, 0.1)',
  },
  optionsMenuText: {
    fontSize: 16,
    color: NotesColors.textPrimary,
  },
  optionsMenuTextDestructive: {
    color: '#FF3B30',
  },
  // Recording Modal styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
  },
  recordingModal: {
    width: '100%',
    backgroundColor: NotesColors.card,
    borderRadius: 20,
    padding: 24,
    alignItems: 'center',
  },
  recordingModalTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: NotesColors.textPrimary,
    marginBottom: 24,
  },
  recordingTime: {
    fontSize: 48,
    fontWeight: '200',
    color: NotesColors.textPrimary,
    fontVariant: ['tabular-nums'],
    marginBottom: 24,
  },
  waveformContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: 50,
    gap: 4,
    marginBottom: 32,
  },
  waveformBar: {
    width: 4,
    backgroundColor: NotesColors.primary,
    borderRadius: 2,
  },
  recordingButtons: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 32,
  },
  cancelButton: {
    paddingHorizontal: 24,
    paddingVertical: 12,
  },
  cancelButtonText: {
    fontSize: 17,
    color: NotesColors.textSecondary,
  },
  stopButton: {
    alignItems: 'center',
    gap: 8,
  },
  stopButtonInner: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#FF3B30',
    justifyContent: 'center',
    alignItems: 'center',
  },
  stopButtonText: {
    fontSize: 14,
    color: NotesColors.textSecondary,
  },
  processingContainer: {
    alignItems: 'center',
    paddingVertical: 32,
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
  recordingErrorText: {
    fontSize: 14,
    color: '#FF3B30',
    marginTop: 16,
  },
  // Exit Confirmation and Draft Recovery Modal styles
  confirmModal: {
    width: '100%',
    backgroundColor: NotesColors.card,
    borderRadius: 20,
    padding: 24,
    alignItems: 'center',
  },
  confirmModalTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: NotesColors.textPrimary,
    marginBottom: 12,
  },
  confirmModalText: {
    fontSize: 15,
    color: NotesColors.textSecondary,
    textAlign: 'center',
    marginBottom: 24,
    lineHeight: 22,
  },
  confirmModalButtons: {
    flexDirection: 'row',
    gap: 12,
    width: '100%',
  },
  confirmButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: 'center',
  },
  discardButton: {
    backgroundColor: 'rgba(255, 59, 48, 0.15)',
  },
  discardButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FF3B30',
  },
  saveButton: {
    backgroundColor: NotesColors.primary,
  },
  saveButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
  cancelExitButton: {
    marginTop: 16,
    paddingVertical: 10,
  },
  cancelExitButtonText: {
    fontSize: 16,
    color: NotesColors.textSecondary,
  },
  recoveryIcon: {
    marginBottom: 12,
  },
});
