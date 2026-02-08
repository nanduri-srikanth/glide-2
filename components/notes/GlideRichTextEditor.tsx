import React, { forwardRef, useCallback, useImperativeHandle, useRef } from 'react';
import {
  findNodeHandle,
  Platform,
  requireNativeComponent,
  NativeModules,
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
  onChange?: (e: NativeChangeEvent) => void;
  onRichSnapshot?: (e: { nativeEvent: { rtfBase64: string } }) => void;
};

export type GlideRichTextEditorHandle = {
  toggleBold: () => void;
  toggleItalic: () => void;
  toggleUnderline: () => void;
  toggleStrikethrough: () => void;
  toggleHighlight: () => void;
  getRtfBase64: () => Promise<string | null>;
  requestRtfSnapshot: () => void;
};

export type GlideRichTextEditorProps = Omit<NativeProps, 'onChange' | 'onRichSnapshot'> & {
  onChangeText?: (text: string) => void;
  onChange?: (e: NativeChangeEvent) => void;
  onRichSnapshot?: (rtfBase64: string) => void;
};

const viewManagerConfig =
  Platform.OS === 'ios' ? UIManager.getViewManagerConfig('GlideRichTextView') : null;

const nativeManager =
  Platform.OS === 'ios'
    ? ((NativeModules.GlideRichTextView ??
        NativeModules.GlideRichTextViewManager) as Record<string, unknown> | undefined)
    : undefined;

const NativeGlideRichTextView =
  Platform.OS === 'ios' && viewManagerConfig
    ? requireNativeComponent<NativeProps>('GlideRichTextView')
    : null;

function dispatchCommand(viewHandle: number, command: string) {
  // 1. Try NativeModules (classic bridge, may be unavailable in New Architecture/bridgeless).
  const fn = nativeManager?.[command];
  if (typeof fn === 'function') {
    (fn as (tag: number) => void)(viewHandle);
    return;
  }

  // 2. Try numeric command ID from view manager config.
  const commandId = viewManagerConfig?.Commands?.[command];
  if (commandId != null) {
    UIManager.dispatchViewManagerCommand(viewHandle, commandId, []);
    return;
  }

  // 3. Dispatch with string command name (RN 0.71+ / New Architecture interop).
  try {
    UIManager.dispatchViewManagerCommand(viewHandle, command, []);
  } catch (e) {
    console.warn(`[GlideRichTextEditor] Command dispatch failed: ${command}`, e);
  }
}

export const GlideRichTextEditor = forwardRef<GlideRichTextEditorHandle, GlideRichTextEditorProps>(
  ({ onChangeText, onChange, onRichSnapshot, ...props }, ref) => {
    const nativeRef = useRef<any>(null);

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

    useImperativeHandle(ref, () => ({
      toggleBold: () => {
        const tag = findNodeHandle(nativeRef.current);
        if (!tag) return;
        dispatchCommand(tag, 'toggleBold');
      },
      toggleItalic: () => {
        const tag = findNodeHandle(nativeRef.current);
        if (!tag) return;
        dispatchCommand(tag, 'toggleItalic');
      },
      toggleUnderline: () => {
        const tag = findNodeHandle(nativeRef.current);
        if (!tag) return;
        dispatchCommand(tag, 'toggleUnderline');
      },
      toggleStrikethrough: () => {
        const tag = findNodeHandle(nativeRef.current);
        if (!tag) return;
        dispatchCommand(tag, 'toggleStrikethrough');
      },
      toggleHighlight: () => {
        const tag = findNodeHandle(nativeRef.current);
        if (!tag) return;
        dispatchCommand(tag, 'toggleHighlight');
      },
      getRtfBase64: async () => {
        const tag = findNodeHandle(nativeRef.current);
        if (!tag) return null;
        const fn = nativeManager?.getRtfBase64;
        if (typeof fn === 'function') {
          return (fn as (t: number) => Promise<string>)(tag);
        }
        return null;
      },
      requestRtfSnapshot: () => {
        const tag = findNodeHandle(nativeRef.current);
        if (!tag) return;
        dispatchCommand(tag, 'requestRtfSnapshot');
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
        ref={nativeRef}
        {...props}
        onChange={handleChange}
        onRichSnapshot={handleRichSnapshot}
      />
    );
  }
);

GlideRichTextEditor.displayName = 'GlideRichTextEditor';
// v2: requestRtfSnapshot + getRtfBase64 in imperative handle
