import UIKit
import React

final class GlideRichTextView: UIView, UITextViewDelegate {
  private let textView = UITextView()
  private let placeholderLabel = UILabel()

  private var isApplyingContentFromJS = false
  private var lastSelectedRange = NSRange(location: 0, length: 0)
  private var lastAppliedRtfBase64: String?
  private var hasAppliedInitialPlaintext = false
  private var debounceTimer: Timer?
  private lazy var accessoryToolbar: UIToolbar = makeAccessoryToolbar()

  // MARK: - React Props

  @objc var content: NSString = "" {
    didSet {
      // Keep this view mostly "uncontrolled": allow JS to set initial content, or
      // reset content explicitly, but avoid infinite loops when native emits changes.
      let next = content as String
      if next == textView.text { return }
      isApplyingContentFromJS = true
      textView.text = next
      isApplyingContentFromJS = false
      updatePlaceholderVisibility()
    }
  }

  @objc var placeholder: NSString = "" {
    didSet {
      placeholderLabel.text = placeholder as String
      updatePlaceholderVisibility()
    }
  }

  // Base64-encoded RTF document. Setting this will replace the editor content with rich text.
  @objc var rtfBase64: NSString = "" {
    didSet {
      let next = rtfBase64 as String
      if next.isEmpty { return }
      if next == lastAppliedRtfBase64 { return }

      guard let data = Data(base64Encoded: next) else {
#if DEBUG
        print("[GlideRichTextView] Failed to decode rtfBase64")
#endif
        return
      }

      do {
        let attr = try NSAttributedString(
          data: data,
          options: [.documentType: NSAttributedString.DocumentType.rtf],
          documentAttributes: nil
        )
        isApplyingContentFromJS = true
        lastAppliedRtfBase64 = next
        textView.attributedText = attr
        // Move cursor to end.
        let end = NSRange(location: attr.length, length: 0)
        textView.selectedRange = end
        lastSelectedRange = end
        isApplyingContentFromJS = false
        updatePlaceholderVisibility()
      } catch {
#if DEBUG
        print("[GlideRichTextView] Failed to parse RTF: \(error)")
#endif
      }
    }
  }

  /// Sets initial plain text when mounted, applied only once on first non-empty set.
  @objc var initialPlaintext: NSString = "" {
    didSet {
      let next = initialPlaintext as String
      if next.isEmpty { return }
      if hasAppliedInitialPlaintext { return }

      hasAppliedInitialPlaintext = true
      isApplyingContentFromJS = true
      textView.text = next
      isApplyingContentFromJS = false
      updatePlaceholderVisibility()
#if DEBUG
      print("[GlideRichTextView] Applied initialPlaintext (\(next.count) chars)")
#endif
    }
  }

  @objc var onChange: RCTBubblingEventBlock?
  @objc var onRichSnapshot: RCTBubblingEventBlock?

  // MARK: - Init

  override init(frame: CGRect) {
    super.init(frame: frame)
    setUp()
  }

  required init?(coder: NSCoder) {
    super.init(coder: coder)
    setUp()
  }

  private func setUp() {
    backgroundColor = .clear

    textView.backgroundColor = .clear
    textView.delegate = self
    textView.inputAccessoryView = accessoryToolbar
    textView.isScrollEnabled = true
    textView.alwaysBounceVertical = true
    textView.textContainerInset = UIEdgeInsets(top: 12, left: 12, bottom: 12, right: 12)
    textView.adjustsFontForContentSizeCategory = true
    textView.keyboardDismissMode = .interactive
    textView.autocorrectionType = .yes
    textView.smartQuotesType = .yes
    textView.smartDashesType = .yes
    textView.smartInsertDeleteType = .yes

    // Default typing attributes (can be customized later).
    textView.font = UIFont.preferredFont(forTextStyle: .body)
    textView.textColor = .label

    placeholderLabel.textColor = .secondaryLabel
    placeholderLabel.font = UIFont.preferredFont(forTextStyle: .body)
    placeholderLabel.numberOfLines = 0
    placeholderLabel.isUserInteractionEnabled = false

    addSubview(textView)
    addSubview(placeholderLabel)

    updatePlaceholderVisibility()
  }

  private func makeAccessoryToolbar() -> UIToolbar {
    let toolbar = UIToolbar()
    toolbar.isTranslucent = true

    let bold = UIBarButtonItem(title: "B", style: .plain, target: self, action: #selector(handleBold))
    let italic = UIBarButtonItem(title: "I", style: .plain, target: self, action: #selector(handleItalic))
    let underline = UIBarButtonItem(title: "U", style: .plain, target: self, action: #selector(handleUnderline))
    let strike = UIBarButtonItem(title: "S", style: .plain, target: self, action: #selector(handleStrikethrough))
    let highlight = UIBarButtonItem(title: "H", style: .plain, target: self, action: #selector(handleHighlight))

    let spacer = UIBarButtonItem(barButtonSystemItem: .flexibleSpace, target: nil, action: nil)
    toolbar.items = [bold, spacer, italic, spacer, underline, spacer, strike, spacer, highlight]
    toolbar.sizeToFit()
    return toolbar
  }

  @objc private func handleBold() { toggleBold() }
  @objc private func handleItalic() { toggleItalic() }
  @objc private func handleUnderline() { toggleUnderline() }
  @objc private func handleStrikethrough() { toggleStrikethrough() }
  @objc private func handleHighlight() { toggleHighlight() }

  override func layoutSubviews() {
    super.layoutSubviews()
    textView.frame = bounds

    // Position placeholder inside the text container inset.
    let inset = textView.textContainerInset
    let maxWidth = bounds.width - inset.left - inset.right
    let size = placeholderLabel.sizeThatFits(CGSize(width: maxWidth, height: CGFloat.greatestFiniteMagnitude))
    placeholderLabel.frame = CGRect(
      x: inset.left + 4,
      y: inset.top,
      width: maxWidth,
      height: size.height
    )
  }

  private func updatePlaceholderVisibility() {
    placeholderLabel.isHidden = !textView.text.isEmpty || (placeholder as String).isEmpty
  }

  // MARK: - UITextViewDelegate

  func textViewDidChange(_ textView: UITextView) {
    updatePlaceholderVisibility()

    if isApplyingContentFromJS { return }

    lastSelectedRange = textView.selectedRange

    // Debounce onChange to ~300ms to avoid excessive JS bridge traffic.
    debounceTimer?.invalidate()
    debounceTimer = Timer.scheduledTimer(withTimeInterval: 0.3, repeats: false) { [weak self] _ in
      guard let self = self else { return }
      let selection = self.textView.selectedRange
      self.onChange?([
        "text": self.textView.text ?? "",
        "selectionStart": selection.location,
        "selectionEnd": selection.location + selection.length,
      ])
    }
  }

  func textViewDidChangeSelection(_ textView: UITextView) {
    if isApplyingContentFromJS { return }
    lastSelectedRange = textView.selectedRange
  }

  // MARK: - Snapshot Methods

  /// Converts the current attributedText to base64-encoded RTF and fires the onRichSnapshot event.
  /// Called explicitly from the view manager, NOT automatically.
  func requestRtfSnapshot() {
    let attr = textView.attributedText ?? NSAttributedString(string: "")
    let range = NSRange(location: 0, length: attr.length)

    do {
      let data = try attr.data(from: range, documentAttributes: [
        .documentType: NSAttributedString.DocumentType.rtf,
      ])
      let base64 = data.base64EncodedString()
#if DEBUG
      print("[GlideRichTextView] requestRtfSnapshot emitting \(base64.count) chars")
#endif
      onRichSnapshot?([
        "rtfBase64": base64,
      ])
    } catch {
#if DEBUG
      print("[GlideRichTextView] requestRtfSnapshot failed: \(error)")
#endif
    }
  }

  /// Returns the current plain text content of the editor.
  func getPlainText() -> String {
    return textView.text ?? ""
  }

  // MARK: - Formatting Commands

  private func prepareForFormatting() {
    // React Native toolbar taps can cause the UITextView to lose focus and collapse selection.
    // Restore the last known selection and ensure we are first responder before applying attributes.
    _ = textView.becomeFirstResponder()
    if lastSelectedRange.location != NSNotFound {
      textView.selectedRange = lastSelectedRange
    }
#if DEBUG
    let r = textView.selectedRange
    print("[GlideRichTextView] formatting selection loc=\(r.location) len=\(r.length)")
#endif
  }

  func toggleBold() {
#if DEBUG
    print("[GlideRichTextView] toggleBold")
#endif
    prepareForFormatting()
    toggleFontTrait(.traitBold)
  }

  func toggleItalic() {
#if DEBUG
    print("[GlideRichTextView] toggleItalic")
#endif
    prepareForFormatting()
    toggleFontTrait(.traitItalic)
  }

  func toggleUnderline() {
#if DEBUG
    print("[GlideRichTextView] toggleUnderline")
#endif
    prepareForFormatting()
    toggleTextStyleAttribute(.underlineStyle, onValue: NSUnderlineStyle.single.rawValue as NSNumber, offValue: 0 as NSNumber)
  }

  func toggleStrikethrough() {
#if DEBUG
    print("[GlideRichTextView] toggleStrikethrough")
#endif
    prepareForFormatting()
    toggleTextStyleAttribute(.strikethroughStyle, onValue: NSUnderlineStyle.single.rawValue as NSNumber, offValue: 0 as NSNumber)
  }

  func toggleHighlight() {
#if DEBUG
    print("[GlideRichTextView] toggleHighlight")
#endif
    prepareForFormatting()
    let onColor = UIColor.systemYellow.withAlphaComponent(0.35)
    toggleTextStyleAttribute(.backgroundColor, onValue: onColor, offValue: UIColor.clear)
  }

  func getRtfBase64() throws -> String {
    let attr = textView.attributedText ?? NSAttributedString(string: "")
    let range = NSRange(location: 0, length: attr.length)
    let data = try attr.data(from: range, documentAttributes: [
      .documentType: NSAttributedString.DocumentType.rtf,
    ])
    return data.base64EncodedString()
  }

  private func toggleFontTrait(_ trait: UIFontDescriptor.SymbolicTraits) {
    let range = textView.selectedRange
    let storage = textView.textStorage

    // Cursor (no selection): update typing attributes.
    if range.length == 0 {
      let currentFont = (textView.typingAttributes[.font] as? UIFont) ?? (textView.font ?? UIFont.preferredFont(forTextStyle: .body))
      let nextFont = fontByTogglingTrait(font: currentFont, trait: trait)
      textView.typingAttributes[.font] = nextFont
      return
    }

    let shouldEnable = !rangeFullyHasFontTrait(range: range, trait: trait)

    storage.beginEditing()
    storage.enumerateAttribute(.font, in: range, options: []) { value, subrange, _ in
      let currentFont = (value as? UIFont) ?? (textView.font ?? UIFont.preferredFont(forTextStyle: .body))
      let nextFont = fontBySettingTrait(font: currentFont, trait: trait, enabled: shouldEnable)
      storage.addAttribute(.font, value: nextFont, range: subrange)
    }
    storage.endEditing()
  }

  private func rangeFullyHasFontTrait(range: NSRange, trait: UIFontDescriptor.SymbolicTraits) -> Bool {
    if range.length == 0 { return false }
    let storage = textView.textStorage

    var fully = true
    storage.enumerateAttribute(.font, in: range, options: []) { value, _, stop in
      let font = (value as? UIFont) ?? (textView.font ?? UIFont.preferredFont(forTextStyle: .body))
      if !font.fontDescriptor.symbolicTraits.contains(trait) {
        fully = false
        stop.pointee = true
      }
    }
    return fully
  }

  private func fontByTogglingTrait(font: UIFont, trait: UIFontDescriptor.SymbolicTraits) -> UIFont {
    let enabled = !font.fontDescriptor.symbolicTraits.contains(trait)
    return fontBySettingTrait(font: font, trait: trait, enabled: enabled)
  }

  private func fontBySettingTrait(font: UIFont, trait: UIFontDescriptor.SymbolicTraits, enabled: Bool) -> UIFont {
    var traits = font.fontDescriptor.symbolicTraits
    if enabled {
      traits.insert(trait)
    } else {
      traits.remove(trait)
    }
    let descriptor = font.fontDescriptor.withSymbolicTraits(traits) ?? font.fontDescriptor
    return UIFont(descriptor: descriptor, size: font.pointSize)
  }

  private func toggleTextStyleAttribute(_ key: NSAttributedString.Key, onValue: Any, offValue: Any) {
    let range = textView.selectedRange
    let storage = textView.textStorage

    if range.length == 0 {
      let current = textView.typingAttributes[key]
      let shouldEnable = !isAttributeEnabled(current: current, onValue: onValue)
      if shouldEnable {
        textView.typingAttributes[key] = onValue
      } else {
        textView.typingAttributes.removeValue(forKey: key)
      }
      return
    }

    let shouldEnable = !rangeFullyHasAttribute(range: range, key: key, onValue: onValue)
    storage.beginEditing()
    storage.enumerateAttribute(key, in: range, options: []) { _, subrange, _ in
      if shouldEnable {
        storage.addAttribute(key, value: onValue, range: subrange)
      } else {
        storage.removeAttribute(key, range: subrange)
      }
    }
    storage.endEditing()
  }

  private func rangeFullyHasAttribute(range: NSRange, key: NSAttributedString.Key, onValue: Any) -> Bool {
    if range.length == 0 { return false }
    let storage = textView.textStorage
    var fully = true
    storage.enumerateAttribute(key, in: range, options: []) { value, _, stop in
      if !isAttributeEnabled(current: value, onValue: onValue) {
        fully = false
        stop.pointee = true
      }
    }
    return fully
  }

  private func isAttributeEnabled(current: Any?, onValue: Any) -> Bool {
    if let current = current as? NSNumber, let on = onValue as? NSNumber {
      return current.intValue != 0 && current == on
    }
    if let currentColor = current as? UIColor, let onColor = onValue as? UIColor {
      // UIColor equality can be tricky; use CGColor where possible.
      return currentColor.cgColor == onColor.cgColor
    }
    return false
  }
}
