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

type NativeProps = ViewProps & {
  content?: string;
  placeholder?: string;
  initialPlaintext?: string;
  rtfBase64?: string;
  snapshotNonce?: number;
  onChange?: (e: NativeChangeEvent) => void;
  onRichSnapshot?: (e: { nativeEvent: { rtfBase64: string } }) => void;
};

export type GlideRichTextEditorHandle = {
  requestRtfSnapshot: () => void;
};

export type GlideRichTextEditorProps = Omit<NativeProps, 'onChange' | 'onRichSnapshot' | 'snapshotNonce'> & {
  onChangeText?: (text: string) => void;
  onChange?: (e: NativeChangeEvent) => void;
  onRichSnapshot?: (rtfBase64: string) => void;
};

const viewManagerConfig =
  Platform.OS === 'ios' ? UIManager.getViewManagerConfig('GlideRichTextView') : null;

const NativeGlideRichTextView =
  Platform.OS === 'ios' && viewManagerConfig
    ? requireNativeComponent<NativeProps>('GlideRichTextView')
    : null;

export const GlideRichTextEditor = forwardRef<GlideRichTextEditorHandle, GlideRichTextEditorProps>(
  ({ onChangeText, onChange, onRichSnapshot, ...props }, ref) => {
    const [snapshotNonce, setSnapshotNonce] = useState(0);

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

    // Prop-based trigger: incrementing snapshotNonce causes the native view to
    // capture an RTF snapshot and fire onRichSnapshot.  This avoids command
    // dispatch which doesn't work through the New Architecture interop layer.
    useImperativeHandle(ref, () => ({
      requestRtfSnapshot: () => {
        setSnapshotNonce(n => n + 1);
      },
    }), []);

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
        onChange={handleChange}
        onRichSnapshot={handleRichSnapshot}
      />
    );
  }
);

GlideRichTextEditor.displayName = 'GlideRichTextEditor';
