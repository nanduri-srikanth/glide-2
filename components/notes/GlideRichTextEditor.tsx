import React, { forwardRef, useCallback, useImperativeHandle, useState } from 'react';
import {
  Platform,
  requireNativeComponent,
  UIManager,
  ViewProps,
  View,
  Text,
} from 'react-native';

type NativeChangeEvent = {
  nativeEvent: {
    text: string;
    selectionStart: number;
    selectionEnd: number;
  };
};

type NativeSelectionChangeEvent = {
  nativeEvent: {
    selectionStart: number;
    selectionEnd: number;
    caretY: number;
    caretHeight: number;
  };
};

type NativeContentSizeChangeEvent = {
  nativeEvent: {
    height: number;
  };
};

type NativeUndoStateChangeEvent = {
  nativeEvent: {
    canUndo: boolean;
    canRedo: boolean;
  };
};

type NativeEditTapEvent = {
  nativeEvent: {
    tapOffset: number;
    tapY: number;
  };
};

type NativeProps = ViewProps & {
  content?: string;
  placeholder?: string;
  initialPlaintext?: string;
  initialMarkdown?: string;
  rtfBase64?: string;
  snapshotNonce?: number;
  autoFocus?: boolean;
  editable?: boolean;
  scrollEnabled?: boolean;
  selectable?: boolean;
  focusNonce?: number;
  undoNonce?: number;
  redoNonce?: number;
  onChange?: (e: NativeChangeEvent) => void;
  onRichSnapshot?: (e: { nativeEvent: { rtfBase64: string } }) => void;
  onSelectionChange?: (e: NativeSelectionChangeEvent) => void;
  onEditTap?: (e: NativeEditTapEvent) => void;
  onContentSizeChange?: (e: NativeContentSizeChangeEvent) => void;
  onUndoStateChange?: (e: NativeUndoStateChangeEvent) => void;
};

export type GlideRichTextEditorHandle = {
  requestRtfSnapshot: () => void;
  focus: () => void;
  undo: () => void;
  redo: () => void;
};

export type GlideRichTextEditorProps = Omit<NativeProps, 'onChange' | 'onRichSnapshot' | 'snapshotNonce' | 'focusNonce' | 'undoNonce' | 'redoNonce' | 'onSelectionChange' | 'onEditTap' | 'onContentSizeChange' | 'onUndoStateChange'> & {
  onChangeText?: (text: string) => void;
  onChange?: (e: NativeChangeEvent) => void;
  onRichSnapshot?: (rtfBase64: string) => void;
  onSelectionChange?: (e: { selectionStart: number; selectionEnd: number; caretY: number; caretHeight: number }) => void;
  onEditTap?: (e: { tapOffset: number; tapY: number }) => void;
  onContentSizeChange?: (e: { height: number }) => void;
  onUndoStateChange?: (e: { canUndo: boolean; canRedo: boolean }) => void;
};

const viewManagerConfig =
  Platform.OS === 'ios' ? UIManager.getViewManagerConfig('GlideRichTextView') : null;

const NativeGlideRichTextView =
  Platform.OS === 'ios' && viewManagerConfig
    ? requireNativeComponent<NativeProps>('GlideRichTextView')
    : null;

// Dev-only: warn if the native view manager is missing expected props
if (__DEV__ && viewManagerConfig) {
  const expectedProps = ['focusNonce', 'undoNonce', 'redoNonce', 'onSelectionChange', 'onEditTap', 'onContentSizeChange', 'onUndoStateChange', 'selectable', 'initialMarkdown'];
  const nativeProps = (viewManagerConfig as any).NativeProps || {};
  const missing = expectedProps.filter(p => !(p in nativeProps));
  if (missing.length > 0) {
    console.warn(
      `[GlideRichTextEditor] Native view manager is missing props: ${missing.join(', ')}. ` +
      'Run `expo run:ios` to rebuild the native dev client.'
    );
  }
}

export const GlideRichTextEditor = forwardRef<GlideRichTextEditorHandle, GlideRichTextEditorProps>(
  ({ onChangeText, onChange, onRichSnapshot, onSelectionChange, onEditTap, onContentSizeChange, onUndoStateChange, ...props }, ref) => {
    const [snapshotNonce, setSnapshotNonce] = useState(0);
    const [focusNonce, setFocusNonce] = useState(0);
    const [undoNonce, setUndoNonce] = useState(0);
    const [redoNonce, setRedoNonce] = useState(0);

    const handleChange = useCallback(
      (e: NativeChangeEvent) => {
        onChangeText?.(e.nativeEvent.text);
        onChange?.(e);
      },
      [onChangeText, onChange]
    );

    const handleRichSnapshot = useCallback(
      (e: { nativeEvent: { rtfBase64: string } }) => {
        onRichSnapshot?.(e.nativeEvent.rtfBase64);
      },
      [onRichSnapshot]
    );

    const handleSelectionChange = useCallback(
      (e: NativeSelectionChangeEvent) => {
        onSelectionChange?.({
          selectionStart: e.nativeEvent.selectionStart,
          selectionEnd: e.nativeEvent.selectionEnd,
          caretY: e.nativeEvent.caretY,
          caretHeight: e.nativeEvent.caretHeight,
        });
      },
      [onSelectionChange]
    );

    const handleEditTap = useCallback(
      (e: NativeEditTapEvent) => {
        onEditTap?.({
          tapOffset: e.nativeEvent.tapOffset,
          tapY: e.nativeEvent.tapY,
        });
      },
      [onEditTap]
    );

    const handleContentSizeChange = useCallback(
      (e: NativeContentSizeChangeEvent) => {
        onContentSizeChange?.({ height: e.nativeEvent.height });
      },
      [onContentSizeChange]
    );

    const handleUndoStateChange = useCallback(
      (e: NativeUndoStateChangeEvent) => {
        onUndoStateChange?.({
          canUndo: e.nativeEvent.canUndo,
          canRedo: e.nativeEvent.canRedo,
        });
      },
      [onUndoStateChange]
    );

    // Prop-based trigger: incrementing snapshotNonce causes the native view to
    // capture an RTF snapshot and fire onRichSnapshot.  This avoids command
    // dispatch which doesn't work through the New Architecture interop layer.
    // Intentionally omit the deps array so Fast Refresh can update the ref handle
    // when methods are added/changed (otherwise the handle can be stale until remount).
    useImperativeHandle(ref, () => ({
      requestRtfSnapshot: () => setSnapshotNonce(n => n + 1),
      focus: () => setFocusNonce(n => n + 1),
      undo: () => setUndoNonce(n => n + 1),
      redo: () => setRedoNonce(n => n + 1),
    }));

    if (Platform.OS !== 'ios') {
      return null;
    }

    if (!NativeGlideRichTextView) {
      return (
        <View style={[{ padding: 12 }, props.style]}>
          <Text style={{ fontSize: 12, color: '#6B7280' }}>
            Native rich editor not available. Rebuild the iOS dev client (expo run:ios) so it
            includes GlideRichTextView.
          </Text>
        </View>
      );
    }

    if (!viewManagerConfig) {
      return null;
    }

    return (
      <NativeGlideRichTextView
        {...props}
        snapshotNonce={snapshotNonce}
        focusNonce={focusNonce}
        undoNonce={undoNonce}
        redoNonce={redoNonce}
        onChange={handleChange}
        onRichSnapshot={handleRichSnapshot}
        onSelectionChange={handleSelectionChange}
        onEditTap={handleEditTap}
        onContentSizeChange={handleContentSizeChange}
        onUndoStateChange={handleUndoStateChange}
      />
    );
  }
);

GlideRichTextEditor.displayName = 'GlideRichTextEditor';
