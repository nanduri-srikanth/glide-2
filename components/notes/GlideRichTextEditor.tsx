import React, { forwardRef, useCallback, useImperativeHandle, useRef, useState } from 'react';
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

type NativeProps = ViewProps & {
  content?: string;
  placeholder?: string;
  initialPlaintext?: string;
  rtfBase64?: string;
  snapshotNonce?: number;
  autoFocus?: boolean;
  editable?: boolean;
  scrollEnabled?: boolean;
  selectable?: boolean;
  focusNonce?: number;
  onChange?: (e: NativeChangeEvent) => void;
  onRichSnapshot?: (e: { nativeEvent: { rtfBase64: string } }) => void;
  onSelectionChange?: (e: NativeSelectionChangeEvent) => void;
};

export type GlideRichTextEditorHandle = {
  requestRtfSnapshot: () => void;
  focus: () => void;
};

export type GlideRichTextEditorProps = Omit<NativeProps, 'onChange' | 'onRichSnapshot' | 'snapshotNonce' | 'focusNonce' | 'onSelectionChange'> & {
  onChangeText?: (text: string) => void;
  onChange?: (e: NativeChangeEvent) => void;
  onRichSnapshot?: (rtfBase64: string) => void;
  onSelectionChange?: (e: { selectionStart: number; selectionEnd: number; caretY: number; caretHeight: number }) => void;
};

const viewManagerConfig =
  Platform.OS === 'ios' ? UIManager.getViewManagerConfig('GlideRichTextView') : null;

const NativeGlideRichTextView =
  Platform.OS === 'ios' && viewManagerConfig
    ? requireNativeComponent<NativeProps>('GlideRichTextView')
    : null;

export const GlideRichTextEditor = forwardRef<GlideRichTextEditorHandle, GlideRichTextEditorProps>(
  ({ onChangeText, onChange, onRichSnapshot, onSelectionChange, ...props }, ref) => {
    const [snapshotNonce, setSnapshotNonce] = useState(0);
    const [focusNonce, setFocusNonce] = useState(0);

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

    // Prop-based trigger: incrementing snapshotNonce causes the native view to
    // capture an RTF snapshot and fire onRichSnapshot.  This avoids command
    // dispatch which doesn't work through the New Architecture interop layer.
    // Intentionally omit the deps array so Fast Refresh can update the ref handle
    // when methods are added/changed (otherwise the handle can be stale until remount).
    useImperativeHandle(ref, () => ({
      requestRtfSnapshot: () => setSnapshotNonce(n => n + 1),
      focus: () => setFocusNonce(n => n + 1),
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
        onChange={handleChange}
        onRichSnapshot={handleRichSnapshot}
        onSelectionChange={handleSelectionChange}
      />
    );
  }
);

GlideRichTextEditor.displayName = 'GlideRichTextEditor';
