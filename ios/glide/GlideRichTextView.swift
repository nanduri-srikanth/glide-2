import UIKit
import React

// MARK: - FormattingTextView (custom subclass for selection menu)

/// UITextView subclass that injects formatting actions into the native selection menu.
/// Requires a `formattingDelegate` to call back into GlideRichTextView.
protocol FormattingTextViewDelegate: AnyObject {
  func formattingToggleBold()
  func formattingToggleItalic()
  func formattingToggleUnderline()
  func formattingToggleStrikethrough()
  func formattingToggleHighlight()
  func formattingClearFormatting()
  var isFormattingEditable: Bool { get }
}

final class FormattingTextView: UITextView {
  weak var formattingDelegate: FormattingTextViewDelegate?

  // MARK: Selection menu via UIMenuBuilder (iOS 16+)

  override func buildMenu(with builder: any UIMenuBuilder) {
    super.buildMenu(with: builder)

    // Only add formatting when editable and there's a selection
    guard formattingDelegate?.isFormattingEditable == true,
          selectedRange.length > 0 else { return }

    let boldAction = UIAction(title: "Bold", image: UIImage(systemName: "bold")) { [weak self] _ in
      self?.formattingDelegate?.formattingToggleBold()
    }
    let italicAction = UIAction(title: "Italic", image: UIImage(systemName: "italic")) { [weak self] _ in
      self?.formattingDelegate?.formattingToggleItalic()
    }
    let underlineAction = UIAction(title: "Underline", image: UIImage(systemName: "underline")) { [weak self] _ in
      self?.formattingDelegate?.formattingToggleUnderline()
    }
    let strikethroughAction = UIAction(title: "Strikethrough", image: UIImage(systemName: "strikethrough")) { [weak self] _ in
      self?.formattingDelegate?.formattingToggleStrikethrough()
    }
    let highlightAction = UIAction(title: "Highlight", image: UIImage(systemName: "highlighter")) { [weak self] _ in
      self?.formattingDelegate?.formattingToggleHighlight()
    }
    let clearAction = UIAction(title: "Clear Formatting", image: UIImage(systemName: "textformat"), attributes: .destructive) { [weak self] _ in
      self?.formattingDelegate?.formattingClearFormatting()
    }

    let formattingMenu = UIMenu(
      title: "Format",
      image: UIImage(systemName: "textformat"),
      children: [boldAction, italicAction, underlineAction, strikethroughAction, highlightAction, clearAction]
    )

    builder.insertSibling(formattingMenu, beforeMenu: .standardEdit)
  }
}

// MARK: - GlideRichTextView

final class GlideRichTextView: UIView, UITextViewDelegate, FormattingTextViewDelegate {
  private let textView = FormattingTextView()
  private let placeholderLabel = UILabel()

  private var isApplyingContentFromJS = false
  private var lastSelectedRange = NSRange(location: 0, length: 0)
  private var lastAppliedRtfBase64: String?
  private var hasAppliedInitialPlaintext = false
  private var hasAutoFocused = false
  private var debounceTimer: Timer?
  private var tapToEditRecognizer: UITapGestureRecognizer?
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
        // After setting attributedText, normalize paragraph style for visual consistency
        let mutable = NSMutableAttributedString(attributedString: textView.attributedText ?? NSAttributedString())
        let fullRange = NSRange(location: 0, length: mutable.length)
        if fullRange.length > 0 {
          mutable.addAttribute(.paragraphStyle, value: defaultParagraphStyle(), range: fullRange)
          let savedRange = textView.selectedRange
          textView.attributedText = mutable
          textView.selectedRange = savedRange
        }
        // Move cursor to end.
        let end = NSRange(location: (textView.attributedText?.length ?? attr.length), length: 0)
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
      // After setting text, apply paragraph style
      let mutable = NSMutableAttributedString(attributedString: textView.attributedText ?? NSAttributedString())
      let fullRange = NSRange(location: 0, length: mutable.length)
      if fullRange.length > 0 {
        mutable.addAttribute(.paragraphStyle, value: defaultParagraphStyle(), range: fullRange)
        textView.attributedText = mutable
      }
      isApplyingContentFromJS = false
      updatePlaceholderVisibility()
#if DEBUG
      print("[GlideRichTextView] Applied initialPlaintext (\(next.count) chars)")
#endif
    }
  }

  /// Focus the editor on mount/update. Applied once per native view instance.
  @objc var autoFocus: Bool = false {
    didSet {
      if !autoFocus { return }
      guard editable else { return }  // Don't auto-focus when not editable
      if hasAutoFocused { return }
      hasAutoFocused = true
      DispatchQueue.main.async { [weak self] in
        _ = self?.textView.becomeFirstResponder()
      }
    }
  }

  /// Prop-based trigger for RTF snapshots.  Increment from JS to request a snapshot.
  /// Works through the New Architecture interop layer (commands don't).
  private var lastSnapshotNonce: Int = 0
  @objc var snapshotNonce: NSNumber = 0 {
    didSet {
      let nonce = snapshotNonce.intValue
      if nonce > 0 && nonce != lastSnapshotNonce {
        lastSnapshotNonce = nonce
        requestRtfSnapshot()
      }
    }
  }

  private var lastFocusNonce: Int = 0
  @objc var focusNonce: NSNumber = 0 {
    didSet {
      let nonce = focusNonce.intValue
      if nonce > 0 && nonce != lastFocusNonce {
        lastFocusNonce = nonce
        DispatchQueue.main.async { [weak self] in
          _ = self?.textView.becomeFirstResponder()
        }
      }
    }
  }

  @objc var editable: Bool = true {
    didSet {
      textView.isEditable = editable
      // Hide/show the formatting toolbar when toggling editability
      textView.inputAccessoryView = editable ? accessoryToolbar : nil
      // Reloading inputAccessoryView requires resigning/becoming first responder
      if textView.isFirstResponder {
        textView.reloadInputViews()
      }
      tapToEditRecognizer?.isEnabled = !editable
    }
  }

  @objc var scrollEnabled: Bool = true {
    didSet {
      textView.isScrollEnabled = scrollEnabled
    }
  }

  @objc var selectable: Bool = true {
    didSet {
      textView.isSelectable = selectable
    }
  }

  @objc var onChange: RCTBubblingEventBlock?
  @objc var onEditTap: RCTDirectEventBlock?
  @objc var onRichSnapshot: RCTBubblingEventBlock?
  @objc var onSelectionChange: RCTDirectEventBlock?

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
    textView.isEditable = true
    textView.isSelectable = true
    textView.isScrollEnabled = true
    textView.alwaysBounceVertical = true
    // Match RN screen padding; avoid double horizontal padding that makes text feel "squeezed".
    textView.textContainerInset = UIEdgeInsets(top: 8, left: 0, bottom: 8, right: 0)
    textView.textContainer.lineFragmentPadding = 0
    textView.adjustsFontForContentSizeCategory = true
    textView.keyboardDismissMode = .interactive
    textView.autocorrectionType = .yes
    textView.smartQuotesType = .yes
    textView.smartDashesType = .yes
    textView.smartInsertDeleteType = .yes

    // Default typing attributes (can be customized later).
    textView.font = UIFont.preferredFont(forTextStyle: .body)
    textView.textColor = .label
    textView.typingAttributes = [
      .font: UIFont.preferredFont(forTextStyle: .body),
      .foregroundColor: UIColor.label,
      .paragraphStyle: defaultParagraphStyle(),
    ]

    placeholderLabel.textColor = .secondaryLabel
    placeholderLabel.font = UIFont.preferredFont(forTextStyle: .body)
    placeholderLabel.numberOfLines = 0
    placeholderLabel.isUserInteractionEnabled = false

    textView.formattingDelegate = self

    addSubview(textView)
    addSubview(placeholderLabel)

    // Tap-to-edit: fires onEditTap when in read mode (editable=false).
    // Long-press for text selection passes through because cancelsTouchesInView is false.
    let tapToEdit = UITapGestureRecognizer(target: self, action: #selector(handleTapToEdit(_:)))
    tapToEdit.numberOfTapsRequired = 1
    tapToEdit.cancelsTouchesInView = false
    textView.addGestureRecognizer(tapToEdit)
    tapToEditRecognizer = tapToEdit

    updatePlaceholderVisibility()
  }

  @objc private func handleTapToEdit(_ gesture: UITapGestureRecognizer) {
    // Only fire when not editable (read mode)
    guard !editable else { return }

    // Get the tap location in the textView for cursor placement
    let point = gesture.location(in: textView)

    // Find the closest text position to the tap point
    guard let position = textView.closestPosition(to: point) else {
      onEditTap?([:])
      return
    }

    let offset = textView.offset(from: textView.beginningOfDocument, to: position)
    onEditTap?([
      "tapOffset": offset,
      "tapY": point.y,
    ])
  }

  /// Shared paragraph style used for both typing and loaded content.
  /// Matches the visual rhythm of the read-mode Markdown renderer.
  private func defaultParagraphStyle() -> NSMutableParagraphStyle {
    let style = NSMutableParagraphStyle()
    style.lineSpacing = 4            // extra space between wrapped lines
    style.paragraphSpacing = 8       // space between paragraphs
    style.lineHeightMultiple = 1.15  // consistent line height
    return style
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

    // Fire onSelectionChange with caret geometry for JS-side auto-scroll
    guard let onSelectionChange = onSelectionChange else { return }

    let selection = textView.selectedRange

    // Get the caret rect in the textView's coordinate space.
    // For a range selection, use the end of the selection.
    let caretPosition: UITextPosition
    if let pos = textView.position(from: textView.beginningOfDocument, offset: selection.location + selection.length) {
      caretPosition = pos
    } else if let pos = textView.position(from: textView.beginningOfDocument, offset: selection.location) {
      caretPosition = pos
    } else {
      return
    }

    let caretRect = textView.caretRect(for: caretPosition)

    // Only fire if we have a valid rect
    guard !caretRect.isNull && !caretRect.isInfinite else { return }

    onSelectionChange([
      "selectionStart": selection.location,
      "selectionEnd": selection.location + selection.length,
      "caretY": caretRect.origin.y,
      "caretHeight": caretRect.size.height,
    ])
  }

  func textViewDidBeginEditing(_ textView: UITextView) {
    // Fire initial selection event so JS can scroll to caret position
    textViewDidChangeSelection(textView)
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

  func clearFormatting() {
#if DEBUG
    print("[GlideRichTextView] clearFormatting")
#endif
    prepareForFormatting()
    let range = textView.selectedRange
    guard range.length > 0 else { return }

    let storage = textView.textStorage
    let defaultFont = UIFont.preferredFont(forTextStyle: .body)

    storage.beginEditing()
    storage.removeAttribute(.underlineStyle, range: range)
    storage.removeAttribute(.strikethroughStyle, range: range)
    storage.removeAttribute(.backgroundColor, range: range)
    storage.removeAttribute(.link, range: range)
    storage.addAttribute(.font, value: defaultFont, range: range)
    storage.addAttribute(.foregroundColor, value: UIColor.label, range: range)
    storage.addAttribute(.paragraphStyle, value: defaultParagraphStyle(), range: range)
    storage.endEditing()

    // Reset typing attributes to defaults so future input is unformatted.
    textView.typingAttributes = [
      .font: defaultFont,
      .foregroundColor: UIColor.label,
      .paragraphStyle: defaultParagraphStyle(),
    ]
  }

  // MARK: - FormattingTextViewDelegate

  var isFormattingEditable: Bool { return editable }

  func formattingToggleBold() { toggleBold() }
  func formattingToggleItalic() { toggleItalic() }
  func formattingToggleUnderline() { toggleUnderline() }
  func formattingToggleStrikethrough() { toggleStrikethrough() }
  func formattingToggleHighlight() { toggleHighlight() }
  func formattingClearFormatting() { clearFormatting() }

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
