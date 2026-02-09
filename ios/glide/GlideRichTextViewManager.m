#import <React/RCTViewManager.h>

// Export the view manager under the exact JS component name:
// requireNativeComponent('GlideRichTextView')
@interface RCT_EXTERN_REMAP_MODULE(GlideRichTextView, GlideRichTextViewManager, RCTViewManager)

RCT_EXPORT_VIEW_PROPERTY(content, NSString)
RCT_EXPORT_VIEW_PROPERTY(placeholder, NSString)
RCT_EXPORT_VIEW_PROPERTY(rtfBase64, NSString)
RCT_EXPORT_VIEW_PROPERTY(initialPlaintext, NSString)
RCT_EXPORT_VIEW_PROPERTY(snapshotNonce, NSNumber)
RCT_EXPORT_VIEW_PROPERTY(autoFocus, BOOL)
RCT_EXPORT_VIEW_PROPERTY(onChange, RCTBubblingEventBlock)
RCT_EXPORT_VIEW_PROPERTY(onRichSnapshot, RCTBubblingEventBlock)

// Commands
RCT_EXTERN_METHOD(toggleBold:(nonnull NSNumber *)reactTag)
RCT_EXTERN_METHOD(toggleItalic:(nonnull NSNumber *)reactTag)
RCT_EXTERN_METHOD(toggleUnderline:(nonnull NSNumber *)reactTag)
RCT_EXTERN_METHOD(toggleStrikethrough:(nonnull NSNumber *)reactTag)
RCT_EXTERN_METHOD(toggleHighlight:(nonnull NSNumber *)reactTag)

RCT_EXTERN_METHOD(requestRtfSnapshot:(nonnull NSNumber *)reactTag)

// Snapshot rich text for persistence (base64-encoded RTF).
RCT_EXTERN_METHOD(getRtfBase64:(nonnull NSNumber *)reactTag
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

@end
