import Foundation
import React

@objc(GlideRichTextViewManager)
final class GlideRichTextViewManager: RCTViewManager {
  override static func requiresMainQueueSetup() -> Bool {
    true
  }

  override func view() -> UIView! {
    GlideRichTextView()
  }

  // MARK: - Commands (called via NativeModules.GlideRichTextView.*)

  @objc func toggleBold(_ reactTag: NSNumber) {
#if DEBUG
    print("[GlideRichTextViewManager] toggleBold tag=\(reactTag)")
#endif
    withView(reactTag) { $0.toggleBold() }
  }

  @objc func toggleItalic(_ reactTag: NSNumber) {
#if DEBUG
    print("[GlideRichTextViewManager] toggleItalic tag=\(reactTag)")
#endif
    withView(reactTag) { $0.toggleItalic() }
  }

  @objc func toggleUnderline(_ reactTag: NSNumber) {
#if DEBUG
    print("[GlideRichTextViewManager] toggleUnderline tag=\(reactTag)")
#endif
    withView(reactTag) { $0.toggleUnderline() }
  }

  @objc func toggleStrikethrough(_ reactTag: NSNumber) {
#if DEBUG
    print("[GlideRichTextViewManager] toggleStrikethrough tag=\(reactTag)")
#endif
    withView(reactTag) { $0.toggleStrikethrough() }
  }

  @objc func toggleHighlight(_ reactTag: NSNumber) {
#if DEBUG
    print("[GlideRichTextViewManager] toggleHighlight tag=\(reactTag)")
#endif
    withView(reactTag) { $0.toggleHighlight() }
  }

  @objc func getRtfBase64(
    _ reactTag: NSNumber,
    resolver resolve: @escaping RCTPromiseResolveBlock,
    rejecter reject: @escaping RCTPromiseRejectBlock
  ) {
    withView(reactTag) { view in
      do {
        let rtf = try view.getRtfBase64()
        resolve(rtf)
      } catch {
        reject("rtf_encode_failed", error.localizedDescription, error)
      }
    }
  }

  @objc func requestRtfSnapshot(_ reactTag: NSNumber) {
#if DEBUG
    print("[GlideRichTextViewManager] requestRtfSnapshot tag=\(reactTag)")
#endif
    withView(reactTag) { $0.requestRtfSnapshot() }
  }

  private func withView(_ reactTag: NSNumber, _ block: @escaping (GlideRichTextView) -> Void) {
    bridge.uiManager.addUIBlock { _, viewRegistry in
      guard let view = viewRegistry?[reactTag] as? GlideRichTextView else { return }
      block(view)
    }
  }
}
