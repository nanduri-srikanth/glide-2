import React, { useCallback, useMemo, useRef, useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { NativeModules, Platform, SafeAreaView, ScrollView, StyleSheet, Text, TouchableOpacity, UIManager, View } from 'react-native';
import { GlideRichTextEditor, GlideRichTextEditorHandle } from '@/components/notes/GlideRichTextEditor';
import { richContentRepository } from '@/lib/repositories';
import { NotesColors } from '@/constants/theme';

const TEST_NOTE_ID = '__debug_rich_editor_test__';

export default function RichEditorDebugScreen() {
  const editorRef = useRef<GlideRichTextEditorHandle>(null);
  const [text, setText] = useState('');
  const [loadedRtfBase64, setLoadedRtfBase64] = useState<string | null>(null);
  const [rtfSnapshot, setRtfSnapshot] = useState<string | null>(null);
  const [status, setStatus] = useState<string>('');
  const [editorKey, setEditorKey] = useState(0);
  const router = useRouter();

  const handleBack = () => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/(tabs)');
    }
  };

  const debugInfo = useMemo(() => {
    if (Platform.OS !== 'ios') return null;
    const cfg = UIManager.getViewManagerConfig('GlideRichTextView');
    const mod = (NativeModules as any).GlideRichTextView ?? (NativeModules as any).GlideRichTextViewManager;
    return {
      hasViewConfig: !!cfg,
      commands: cfg?.Commands ? Object.keys(cfg.Commands).sort() : [],
      nativeModuleKeys: mod ? Object.keys(mod).sort() : [],
    };
  }, []);

  // Event-based snapshot callback (fires when requestRtfSnapshot completes on native side)
  const handleRtfSnapshot = useCallback((rtfBase64: string) => {
    setRtfSnapshot(rtfBase64);
    setStatus(`Snapshot captured via event (${rtfBase64.length} chars)`);
  }, []);

  if (Platform.OS !== 'ios') {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.container}>
          <View style={styles.headerTopRow}>
            <TouchableOpacity
              style={styles.backButton}
              onPress={handleBack}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel="Back"
            >
              <Ionicons name="chevron-back" size={26} color={NotesColors.primary} />
            </TouchableOpacity>
          </View>
        <Text style={styles.title}>Rich Editor Debug</Text>
        <Text>iOS only.</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.container}>
        <View style={styles.headerTopRow}>
          <TouchableOpacity
            style={styles.backButton}
            onPress={handleBack}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel="Back"
          >
            <Ionicons name="chevron-back" size={26} color={NotesColors.primary} />
          </TouchableOpacity>
          <Text style={styles.title}>Rich Editor Debug</Text>
        </View>

        <ScrollView contentContainerStyle={styles.scrollContent}>
          {debugInfo && (
            <Text style={styles.diag}>
              {`hasViewConfig=${String(debugInfo.hasViewConfig)} commands=${debugInfo.commands.join(',')} nativeModuleKeys=${debugInfo.nativeModuleKeys.join(',')}`}
            </Text>
          )}

          <Text style={styles.hint}>
            Formatting toolbar is native (inputAccessoryView) for correct selection behavior.
          </Text>

          {/* RTF Round-Trip Controls */}
          <Text style={styles.sectionLabel}>RTF Snapshot (event-based)</Text>
          <View style={styles.buttonRow}>
            <TouchableOpacity
              style={styles.button}
              onPress={() => {
                const handle = editorRef.current;
                if (!handle) {
                  setStatus('Editor ref is null — component may not have mounted.');
                  return;
                }
                if (typeof handle.requestRtfSnapshot !== 'function') {
                  setStatus(`requestRtfSnapshot missing. Handle keys: ${Object.keys(handle).join(', ')}`);
                  return;
                }
                handle.requestRtfSnapshot();
              }}
            >
              <Text style={styles.buttonText}>Save RTF</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.button}
              onPress={() => {
                if (!rtfSnapshot) {
                  setStatus('No snapshot to load. Tap "Save RTF" first.');
                  return;
                }
                setLoadedRtfBase64(rtfSnapshot);
                setEditorKey((k) => k + 1);
                setStatus('RTF loaded back into editor.');
              }}
            >
              <Text style={styles.buttonText}>Load RTF</Text>
            </TouchableOpacity>
          </View>

          {/* Persistence Controls */}
          <Text style={styles.sectionLabel}>SQLite Persistence</Text>
          <View style={styles.buttonRow}>
            <TouchableOpacity
              style={styles.button}
              onPress={async () => {
                if (!rtfSnapshot) {
                  setStatus('No snapshot to persist. Tap "Save RTF" first.');
                  return;
                }
                try {
                  await richContentRepository.save(TEST_NOTE_ID, rtfSnapshot, text);
                  setStatus('Persisted to SQLite.');
                } catch (e: any) {
                  setStatus(`Persist failed: ${e.message}`);
                }
              }}
            >
              <Text style={styles.buttonText}>Persist to DB</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.button}
              onPress={async () => {
                try {
                  const row = await richContentRepository.get(TEST_NOTE_ID);
                  if (!row) {
                    setStatus('No persisted RTF found for test note.');
                    return;
                  }
                  setLoadedRtfBase64(row.rtf_base64);
                  setRtfSnapshot(row.rtf_base64);
                  setEditorKey((k) => k + 1);
                  setStatus(`Loaded from SQLite (${row.rtf_base64.length} chars, updated ${row.updated_at})`);
                } catch (e: any) {
                  setStatus(`Load failed: ${e.message}`);
                }
              }}
            >
              <Text style={styles.buttonText}>Load from DB</Text>
            </TouchableOpacity>
          </View>

          {status ? <Text style={styles.statusText}>{status}</Text> : null}

          {rtfSnapshot && (
            <Text style={styles.rtfPreview} numberOfLines={3}>
              RTF: {rtfSnapshot.substring(0, 120)}...
            </Text>
          )}

          <View style={styles.editorFrame}>
            <GlideRichTextEditor
              key={editorKey}
              ref={editorRef}
              placeholder="Type here..."
              rtfBase64={loadedRtfBase64 ?? undefined}
              onChangeText={setText}
              onRichSnapshot={handleRtfSnapshot}
              style={styles.editor}
            />
          </View>

          <Text style={styles.meta} numberOfLines={3}>
            {text}
          </Text>
        </ScrollView>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: NotesColors.background,
  },
  container: {
    flex: 1,
    padding: 16,
    gap: 12,
    backgroundColor: NotesColors.background,
  },
  headerTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  backButton: {
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
  title: {
    fontSize: 18,
    fontWeight: '700',
    color: NotesColors.textPrimary,
  },
  sectionLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: NotesColors.textSecondary,
    marginTop: 4,
  },
  hint: {
    color: NotesColors.textSecondary,
    fontSize: 12,
  },
  scrollContent: {
    paddingTop: 4,
    paddingBottom: 24,
    gap: 12,
  },
  buttonRow: {
    flexDirection: 'row',
    gap: 8,
  },
  button: {
    flex: 1,
    backgroundColor: NotesColors.primary,
    borderRadius: 8,
    paddingVertical: 10,
    alignItems: 'center',
  },
  buttonText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 14,
  },
  statusText: {
    color: '#059669',
    fontSize: 12,
    fontWeight: '500',
  },
  rtfPreview: {
    color: '#6B7280',
    fontSize: 10,
    fontFamily: 'Menlo',
    backgroundColor: '#F3F4F6',
    padding: 8,
    borderRadius: 6,
  },
  editorFrame: {
    borderWidth: 1,
    borderColor: NotesColors.border,
    borderRadius: 12,
    overflow: 'hidden',
    minHeight: 280,
  },
  editor: {
    height: 280,
  },
  meta: {
    color: NotesColors.textSecondary,
    fontSize: 12,
  },
  diag: {
    color: NotesColors.textSecondary,
    fontSize: 12,
  },
});
