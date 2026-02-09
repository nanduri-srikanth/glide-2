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
  func formattingToggleBulletList()
  func formattingToggleNumberedList()
  func formattingIndent()
  func formattingOutdent()
  func formattingClearFormatting()
  var isFormattingEditable: Bool { get }
}

final class FormattingTextView: UITextView {
  weak var formattingDelegate: FormattingTextViewDelegate?

  // MARK: Selection menu via UIMenuBuilder (iOS 16+)

  override func buildMenu(with builder: any UIMenuBuilder) {
    super.buildMenu(with: builder)

    // Show formatting menu when editable (list/indent work at cursor, inline formatting handles cursor too)
    guard formattingDelegate?.isFormattingEditable == true else { return }

    // -- Text style actions --
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

    let textStyleMenu = UIMenu(title: "", options: .displayInline, children: [
      boldAction, italicAction, underlineAction, strikethroughAction, highlightAction,
    ])

    // -- List & indent actions --
    let bulletAction = UIAction(title: "Bullet List", image: UIImage(systemName: "list.bullet")) { [weak self] _ in
      self?.formattingDelegate?.formattingToggleBulletList()
    }
    let numberedAction = UIAction(title: "Numbered List", image: UIImage(systemName: "list.number")) { [weak self] _ in
      self?.formattingDelegate?.formattingToggleNumberedList()
    }
    let indentAction = UIAction(title: "Indent", image: UIImage(systemName: "increase.indent")) { [weak self] _ in
      self?.formattingDelegate?.formattingIndent()
    }
    let outdentAction = UIAction(title: "Outdent", image: UIImage(systemName: "decrease.indent")) { [weak self] _ in
      self?.formattingDelegate?.formattingOutdent()
    }

    let listMenu = UIMenu(title: "", options: .displayInline, children: [
      bulletAction, numberedAction, indentAction, outdentAction,
    ])

    // -- Clear formatting --
    let clearAction = UIAction(title: "Clear Formatting", image: UIImage(systemName: "textformat"), attributes: .destructive) { [weak self] _ in
      self?.formattingDelegate?.formattingClearFormatting()
    }
    let clearMenu = UIMenu(title: "", options: .displayInline, children: [clearAction])

    let formattingMenu = UIMenu(
      title: "Format",
      image: UIImage(systemName: "textformat"),
      children: [textStyleMenu, listMenu, clearMenu]
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
  private var lastContentHeight: CGFloat = 0

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
      emitContentSizeIfNeeded()
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
        emitContentSizeIfNeeded()
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
      emitContentSizeIfNeeded()
#if DEBUG
      print("[GlideRichTextView] Applied initialPlaintext (\(next.count) chars)")
#endif
    }
  }

  /// Sets initial content from markdown syntax, parsed into NSAttributedString.
  /// Applied only once (reuses hasAppliedInitialPlaintext guard).
  /// After rendering, auto-snapshots RTF so it persists for future opens.
  @objc var initialMarkdown: NSString = "" {
    didSet {
      let next = initialMarkdown as String
      if next.isEmpty { return }
      if hasAppliedInitialPlaintext { return }

      hasAppliedInitialPlaintext = true
      isApplyingContentFromJS = true
      let attributed = parseMarkdownToAttributedString(next)
      textView.attributedText = attributed
      isApplyingContentFromJS = false
      updatePlaceholderVisibility()
      emitContentSizeIfNeeded()
#if DEBUG
      print("[GlideRichTextView] Applied initialMarkdown (\(next.count) chars)")
#endif

      // Auto-snapshot so RTF is persisted for future opens
      DispatchQueue.main.asyncAfter(deadline: .now() + 0.3) { [weak self] in
        self?.requestRtfSnapshot()
      }
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
      // No accessory toolbar; selection menu handles formatting.
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
  @objc var onContentSizeChange: RCTDirectEventBlock?

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
    textView.inputAccessoryView = nil
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

  // MARK: - Markdown Parser

  /// Parses LLM-produced markdown into NSAttributedString with proper formatting.
  /// Supports: ## headers, - bullets, - [ ] / - [x] checklists, **bold**, _italic_ / *italic*,
  /// $...$ inline math, $$...$$ block math
  private func parseMarkdownToAttributedString(_ markdown: String) -> NSAttributedString {
    let result = NSMutableAttributedString()
    let bodyFont = UIFont.preferredFont(forTextStyle: .body)
    let headlineFont = UIFont.preferredFont(forTextStyle: .headline)
    let textColor = UIColor.label
    let lines = markdown.components(separatedBy: "\n")

    var blockMathBuffer: String? = nil  // Accumulates lines inside $$ ... $$

    for (index, line) in lines.enumerated() {
      let trimmed = line.trimmingCharacters(in: .whitespaces)

      // ── Block math accumulation ($$ ... $$) ──
      if let buffer = blockMathBuffer {
        if trimmed.hasSuffix("$$") {
          let closing = String(trimmed.dropLast(2))
          let fullLatex = buffer + (closing.isEmpty ? "" : "\n" + closing)
          if index > 0 { result.append(NSAttributedString(string: "\n")) }
          result.append(buildBlockMathLine(latex: fullLatex, font: bodyFont))
          blockMathBuffer = nil
        } else {
          blockMathBuffer = buffer + "\n" + trimmed
        }
        continue
      }

      // Check for block math start
      if trimmed.hasPrefix("$$") {
        let afterOpen = String(trimmed.dropFirst(2))
        if afterOpen.hasSuffix("$$") && afterOpen.count > 2 {
          // Single-line block math: $$...$$ on one line
          let latex = String(afterOpen.dropLast(2))
          if index > 0 { result.append(NSAttributedString(string: "\n")) }
          result.append(buildBlockMathLine(latex: latex, font: bodyFont))
          continue
        }
        blockMathBuffer = afterOpen
        continue
      }

      if index > 0 {
        result.append(NSAttributedString(string: "\n"))
      }

      // Skip empty lines (they create paragraph spacing naturally)
      if trimmed.isEmpty {
        continue
      }

      // ## Header
      if trimmed.hasPrefix("## ") {
        let headerText = String(trimmed.dropFirst(3))
        let headerStyle = NSMutableParagraphStyle()
        headerStyle.lineSpacing = 4
        headerStyle.paragraphSpacingBefore = index > 0 ? 12 : 0
        headerStyle.paragraphSpacing = 4
        headerStyle.lineHeightMultiple = 1.15

        let boldHeadline = fontBySettingTrait(font: headlineFont, trait: .traitBold, enabled: true)
        let attrs: [NSAttributedString.Key: Any] = [
          .font: boldHeadline,
          .foregroundColor: textColor,
          .paragraphStyle: headerStyle,
        ]
        let attrLine = applyInlineFormatting(headerText, baseAttributes: attrs, baseFont: boldHeadline)
        result.append(attrLine)
        continue
      }

      // - [ ] Unchecked checklist item
      if trimmed.hasPrefix("- [ ] ") {
        let itemText = String(trimmed.dropFirst(6))
        let lineAttr = buildListLine(prefix: "\u{2610}  ", text: itemText, font: bodyFont, color: textColor)
        result.append(lineAttr)
        continue
      }

      // - [x] Checked checklist item
      if trimmed.hasPrefix("- [x] ") || trimmed.hasPrefix("- [X] ") {
        let itemText = String(trimmed.dropFirst(6))
        let lineAttr = buildListLine(prefix: "\u{2611}  ", text: itemText, font: bodyFont, color: textColor)
        result.append(lineAttr)
        continue
      }

      // - Bullet item
      if trimmed.hasPrefix("- ") {
        let itemText = String(trimmed.dropFirst(2))
        let lineAttr = buildListLine(prefix: "\u{2022}  ", text: itemText, font: bodyFont, color: textColor)
        result.append(lineAttr)
        continue
      }

      // 1. Numbered list item (matches "1. ", "2. ", "10. ", etc.)
      if let range = trimmed.range(of: #"^\d+\.\s"#, options: .regularExpression) {
        let itemText = String(trimmed[range.upperBound...])
        let numberPrefix = String(trimmed[trimmed.startIndex..<range.upperBound])
        let lineAttr = buildListLine(prefix: numberPrefix, text: itemText, font: bodyFont, color: textColor)
        result.append(lineAttr)
        continue
      }

      // Plain text / prose paragraph (with inline math support)
      let paraStyle = defaultParagraphStyle()
      let attrs: [NSAttributedString.Key: Any] = [
        .font: bodyFont,
        .foregroundColor: textColor,
        .paragraphStyle: paraStyle,
      ]
      let attrLine = applyInlineFormatting(trimmed, baseAttributes: attrs, baseFont: bodyFont)
      result.append(attrLine)
    }

    return result
  }

  // MARK: - Math Rendering Helpers

  /// Unicode maps for LaTeX → Unicode conversion

  private static let greekMap: [String: String] = [
    "\\alpha": "α", "\\beta": "β", "\\gamma": "γ", "\\delta": "δ",
    "\\epsilon": "ε", "\\varepsilon": "ε", "\\zeta": "ζ", "\\eta": "η",
    "\\theta": "θ", "\\iota": "ι", "\\kappa": "κ", "\\lambda": "λ",
    "\\mu": "μ", "\\nu": "ν", "\\xi": "ξ", "\\pi": "π",
    "\\rho": "ρ", "\\sigma": "σ", "\\tau": "τ", "\\upsilon": "υ",
    "\\phi": "φ", "\\chi": "χ", "\\psi": "ψ", "\\omega": "ω",
    "\\Gamma": "Γ", "\\Delta": "Δ", "\\Theta": "Θ", "\\Lambda": "Λ",
    "\\Xi": "Ξ", "\\Pi": "Π", "\\Sigma": "Σ", "\\Phi": "Φ",
    "\\Psi": "Ψ", "\\Omega": "Ω",
  ]

  private static let subscriptMap: [Character: Character] = [
    "0": "₀", "1": "₁", "2": "₂", "3": "₃", "4": "₄",
    "5": "₅", "6": "₆", "7": "₇", "8": "₈", "9": "₉",
    "a": "ₐ", "e": "ₑ", "i": "ᵢ", "o": "ₒ", "x": "ₓ",
    "n": "ₙ", "m": "ₘ", "r": "ᵣ", "s": "ₛ", "t": "ₜ",
  ]

  private static let superscriptMap: [Character: Character] = [
    "0": "⁰", "1": "¹", "2": "²", "3": "³", "4": "⁴",
    "5": "⁵", "6": "⁶", "7": "⁷", "8": "⁸", "9": "⁹",
    "+": "⁺", "-": "⁻", "n": "ⁿ", "i": "ⁱ",
  ]

  private static let symbolMap: [String: String] = [
    "\\times": "×", "\\div": "÷", "\\cdot": "·", "\\pm": "±",
    "\\leq": "≤", "\\geq": "≥", "\\neq": "≠", "\\approx": "≈",
    "\\infty": "∞", "\\partial": "∂", "\\nabla": "∇",
    "\\sum": "∑", "\\prod": "∏", "\\int": "∫", "\\sqrt": "√",
    "\\rightarrow": "→", "\\leftarrow": "←", "\\to": "→",
    "\\Rightarrow": "⇒", "\\Leftrightarrow": "⇔",
    "\\degree": "°", "\\angle": "∠", "\\perp": "⊥",
    "\\in": "∈", "\\notin": "∉", "\\subset": "⊂",
    "\\cup": "∪", "\\cap": "∩",
    "\\forall": "∀", "\\exists": "∃", "\\ldots": "…",
    "\\langle": "⟨", "\\rangle": "⟩",
  ]

  private static let fractionMap: [String: String] = [
    "1/2": "½", "1/3": "⅓", "2/3": "⅔", "1/4": "¼", "3/4": "¾",
    "1/5": "⅕", "2/5": "⅖", "3/5": "⅗", "4/5": "⅘",
    "1/8": "⅛", "3/8": "⅜", "5/8": "⅝", "7/8": "⅞",
  ]

  /// Converts a LaTeX string to Unicode text.
  private func latexToUnicode(_ latex: String) -> String {
    var result = latex.trimmingCharacters(in: .whitespaces)

    // Greek letters (longest first)
    for (cmd, uni) in Self.greekMap.sorted(by: { $0.key.count > $1.key.count }) {
      result = result.replacingOccurrences(of: cmd, with: uni)
    }

    // Symbols (longest first)
    for (cmd, uni) in Self.symbolMap.sorted(by: { $0.key.count > $1.key.count }) {
      result = result.replacingOccurrences(of: cmd, with: uni)
    }

    // \frac{a}{b} → a⁄b or Unicode fraction
    if let fracRegex = try? NSRegularExpression(pattern: #"\\frac\{([^}]+)\}\{([^}]+)\}"#) {
      let nsResult = result as NSString
      let matches = fracRegex.matches(in: result, range: NSRange(location: 0, length: nsResult.length))
      for match in matches.reversed() {
        let num = nsResult.substring(with: match.range(at: 1))
        let den = nsResult.substring(with: match.range(at: 2))
        let key = "\(num)/\(den)"
        let replacement = Self.fractionMap[key] ?? "\(num)⁄\(den)"
        result = (result as NSString).replacingCharacters(in: match.range, with: replacement)
      }
    }

    // \sqrt{...} → √(...)
    if let sqrtRegex = try? NSRegularExpression(pattern: #"\\sqrt\{([^}]+)\}"#) {
      let nsResult = result as NSString
      let matches = sqrtRegex.matches(in: result, range: NSRange(location: 0, length: nsResult.length))
      for match in matches.reversed() {
        let inner = nsResult.substring(with: match.range(at: 1))
        result = (result as NSString).replacingCharacters(in: match.range, with: "√(\(inner))")
      }
    }

    // Subscripts: _{...} or _x
    if let subBracedRegex = try? NSRegularExpression(pattern: #"_\{([^}]+)\}"#) {
      let nsResult = result as NSString
      let matches = subBracedRegex.matches(in: result, range: NSRange(location: 0, length: nsResult.length))
      for match in matches.reversed() {
        let inner = nsResult.substring(with: match.range(at: 1))
        let converted = String(inner.map { Self.subscriptMap[$0] ?? $0 })
        result = (result as NSString).replacingCharacters(in: match.range, with: converted)
      }
    }
    if let subSingleRegex = try? NSRegularExpression(pattern: #"_([0-9a-z])"#) {
      let nsResult = result as NSString
      let matches = subSingleRegex.matches(in: result, range: NSRange(location: 0, length: nsResult.length))
      for match in matches.reversed() {
        let ch = nsResult.substring(with: match.range(at: 1))
        if let c = ch.first, let sub = Self.subscriptMap[c] {
          result = (result as NSString).replacingCharacters(in: match.range, with: String(sub))
        }
      }
    }

    // Superscripts: ^{...} or ^x
    if let supBracedRegex = try? NSRegularExpression(pattern: #"\^\{([^}]+)\}"#) {
      let nsResult = result as NSString
      let matches = supBracedRegex.matches(in: result, range: NSRange(location: 0, length: nsResult.length))
      for match in matches.reversed() {
        let inner = nsResult.substring(with: match.range(at: 1))
        let converted = String(inner.map { Self.superscriptMap[$0] ?? $0 })
        result = (result as NSString).replacingCharacters(in: match.range, with: converted)
      }
    }
    if let supSingleRegex = try? NSRegularExpression(pattern: #"\^([0-9a-z+\-])"#) {
      let nsResult = result as NSString
      let matches = supSingleRegex.matches(in: result, range: NSRange(location: 0, length: nsResult.length))
      for match in matches.reversed() {
        let ch = nsResult.substring(with: match.range(at: 1))
        if let c = ch.first, let sup = Self.superscriptMap[c] {
          result = (result as NSString).replacingCharacters(in: match.range, with: String(sup))
        }
      }
    }

    // Function names: \sin → sin, etc.
    for fn in ["sin", "cos", "tan", "log", "ln", "exp", "lim", "max", "min"] {
      result = result.replacingOccurrences(of: "\\\(fn)", with: fn)
    }

    // Strip \text{...} → inner text
    if let textRegex = try? NSRegularExpression(pattern: #"\\text\{([^}]+)\}"#) {
      let nsResult = result as NSString
      let matches = textRegex.matches(in: result, range: NSRange(location: 0, length: nsResult.length))
      for match in matches.reversed() {
        let inner = nsResult.substring(with: match.range(at: 1))
        result = (result as NSString).replacingCharacters(in: match.range, with: inner)
      }
    }

    // Strip \left, \right
    result = result.replacingOccurrences(of: "\\left", with: "")
    result = result.replacingOccurrences(of: "\\right", with: "")

    return result
  }

  /// Builds a block math attributed string (centered, styled)
  private func buildBlockMathLine(latex: String, font: UIFont) -> NSAttributedString {
    let unicodeText = latexToUnicode(latex)
    let mathStyle = NSMutableParagraphStyle()
    mathStyle.alignment = .center
    mathStyle.lineSpacing = 6
    mathStyle.paragraphSpacing = 8
    mathStyle.paragraphSpacingBefore = 8
    mathStyle.lineHeightMultiple = 1.2

    let mathFont = UIFont.monospacedSystemFont(ofSize: font.pointSize + 2, weight: .regular)
    let mathColor = UIColor { tc in
      tc.userInterfaceStyle == .dark
        ? UIColor(red: 0.7, green: 0.55, blue: 0.9, alpha: 1.0)
        : UIColor(red: 0.38, green: 0.27, blue: 0.53, alpha: 1.0)
    }

    let attrs: [NSAttributedString.Key: Any] = [
      .font: mathFont,
      .foregroundColor: mathColor,
      .paragraphStyle: mathStyle,
      .backgroundColor: UIColor { tc in
        tc.userInterfaceStyle == .dark
          ? UIColor(white: 1.0, alpha: 0.04)
          : UIColor(red: 0.38, green: 0.27, blue: 0.53, alpha: 0.06)
      },
    ]

    return NSAttributedString(string: unicodeText, attributes: attrs)
  }

  /// Builds an attributed string for a list item (bullet, checklist) with indentation.
  private func buildListLine(prefix: String, text: String, font: UIFont, color: UIColor) -> NSAttributedString {
    let listStyle = NSMutableParagraphStyle()
    listStyle.lineSpacing = 4
    listStyle.paragraphSpacing = 4
    listStyle.lineHeightMultiple = 1.15
    listStyle.headIndent = 24
    listStyle.firstLineHeadIndent = 8

    let attrs: [NSAttributedString.Key: Any] = [
      .font: font,
      .foregroundColor: color,
      .paragraphStyle: listStyle,
    ]

    let result = NSMutableAttributedString(string: prefix, attributes: attrs)
    let textPart = applyInlineFormatting(text, baseAttributes: attrs, baseFont: font)
    result.append(textPart)
    return result
  }

  /// Applies **bold**, *italic* / _italic_, and $inline math$ formatting within a text string.
  private func applyInlineFormatting(_ text: String, baseAttributes: [NSAttributedString.Key: Any], baseFont: UIFont) -> NSAttributedString {
    let result = NSMutableAttributedString()
    var remaining = text[text.startIndex...]

    while !remaining.isEmpty {
      // $inline math$ (single $, not $$)
      if remaining.hasPrefix("$") && !remaining.hasPrefix("$$") {
        let afterDollar = remaining.index(after: remaining.startIndex)
        if afterDollar < remaining.endIndex {
          if let endRange = remaining[afterDollar...].range(of: "$") {
            let mathContent = String(remaining[afterDollar..<endRange.lowerBound])
            // Only render as math if content is non-empty and doesn't start/end with space
            if !mathContent.isEmpty && !mathContent.hasPrefix(" ") && !mathContent.hasSuffix(" ") {
              let unicodeText = latexToUnicode(mathContent)
              var mathAttrs = baseAttributes
              let mathColor = UIColor { tc in
                tc.userInterfaceStyle == .dark
                  ? UIColor(red: 0.7, green: 0.55, blue: 0.9, alpha: 1.0)
                  : UIColor(red: 0.38, green: 0.27, blue: 0.53, alpha: 1.0)
              }
              mathAttrs[.foregroundColor] = mathColor
              result.append(NSAttributedString(string: unicodeText, attributes: mathAttrs))
              remaining = remaining[remaining.index(after: endRange.lowerBound)...]
              continue
            }
          }
        }
      }

      // **bold**
      if remaining.hasPrefix("**") {
        if let endRange = remaining[remaining.index(remaining.startIndex, offsetBy: 2)...].range(of: "**") {
          let boldStart = remaining.index(remaining.startIndex, offsetBy: 2)
          let boldText = String(remaining[boldStart..<endRange.lowerBound])
          var boldAttrs = baseAttributes
          boldAttrs[.font] = fontBySettingTrait(font: baseFont, trait: .traitBold, enabled: true)
          result.append(NSAttributedString(string: boldText, attributes: boldAttrs))
          remaining = remaining[endRange.upperBound...]
          continue
        }
      }

      // *italic* (single asterisk, but not **)
      if remaining.hasPrefix("*") && !remaining.hasPrefix("**") {
        if let endRange = remaining[remaining.index(after: remaining.startIndex)...].range(of: "*") {
          let italicStart = remaining.index(after: remaining.startIndex)
          let italicText = String(remaining[italicStart..<endRange.lowerBound])
          var italicAttrs = baseAttributes
          italicAttrs[.font] = fontBySettingTrait(font: baseFont, trait: .traitItalic, enabled: true)
          result.append(NSAttributedString(string: italicText, attributes: italicAttrs))
          remaining = remaining[endRange.upperBound...]
          continue
        }
      }

      // _italic_
      if remaining.hasPrefix("_") {
        if let endRange = remaining[remaining.index(after: remaining.startIndex)...].range(of: "_") {
          let italicStart = remaining.index(after: remaining.startIndex)
          let italicText = String(remaining[italicStart..<endRange.lowerBound])
          var italicAttrs = baseAttributes
          italicAttrs[.font] = fontBySettingTrait(font: baseFont, trait: .traitItalic, enabled: true)
          result.append(NSAttributedString(string: italicText, attributes: italicAttrs))
          remaining = remaining[endRange.upperBound...]
          continue
        }
      }

      // Regular character — accumulate until next marker
      let nextBold = remaining.range(of: "**")
      let nextStar = remaining.range(of: "*")
      let nextUnderscore = remaining.range(of: "_")
      let nextDollar = remaining.range(of: "$")

      // Find the nearest marker
      var nearest = remaining.endIndex
      if let r = nextBold { nearest = min(nearest, r.lowerBound) }
      if let r = nextStar, r.lowerBound > remaining.startIndex { nearest = min(nearest, r.lowerBound) }
      if let r = nextUnderscore, r.lowerBound > remaining.startIndex { nearest = min(nearest, r.lowerBound) }
      if let r = nextDollar, r.lowerBound > remaining.startIndex { nearest = min(nearest, r.lowerBound) }

      // If nearest is startIndex (current char is a marker that didn't close), consume one char
      if nearest == remaining.startIndex {
        let ch = String(remaining[remaining.startIndex])
        result.append(NSAttributedString(string: ch, attributes: baseAttributes))
        remaining = remaining[remaining.index(after: remaining.startIndex)...]
      } else {
        let plain = String(remaining[remaining.startIndex..<nearest])
        result.append(NSAttributedString(string: plain, attributes: baseAttributes))
        remaining = remaining[nearest...]
      }
    }

    return result
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

    // Re-measure after layout so the JS side gets an accurate height.
    // The abs() guard in emitContentSizeIfNeeded prevents infinite loops.
    emitContentSizeIfNeeded()
  }

  private func updatePlaceholderVisibility() {
    placeholderLabel.isHidden = !textView.text.isEmpty || (placeholder as String).isEmpty
  }

  // MARK: - UITextViewDelegate

  func textViewDidChange(_ textView: UITextView) {
    updatePlaceholderVisibility()
    emitContentSizeIfNeeded()

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

  private func emitContentSizeIfNeeded() {
    guard let onContentSizeChange = onContentSizeChange else { return }
    // Need a valid width to measure text height accurately
    guard textView.bounds.width > 0 else { return }
    // sizeThatFits is more reliable than contentSize — it calculates the
    // actual text layout height for the current width regardless of scroll state.
    let fittingSize = textView.sizeThatFits(CGSize(
      width: textView.bounds.width,
      height: CGFloat.greatestFiniteMagnitude
    ))
    let height = fittingSize.height
    guard height.isFinite, height > 0 else { return }
    if abs(height - lastContentHeight) < 0.5 { return }
    lastContentHeight = height
    onContentSizeChange([
      "height": height,
    ])
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
    // Formatting actions can cause the UITextView to lose focus and collapse selection.
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

  // MARK: - List & Indent Commands

  private static let bulletPrefix = "\u{2022}  "
  private static let indentStep: CGFloat = 24

  /// Returns the paragraph style used for list items (bullet, numbered).
  private func listParagraphStyle() -> NSMutableParagraphStyle {
    let style = NSMutableParagraphStyle()
    style.lineSpacing = 4
    style.paragraphSpacing = 4
    style.lineHeightMultiple = 1.15
    style.headIndent = 24
    style.firstLineHeadIndent = 8
    return style
  }

  /// Builds prefix attributes using existing line styles when possible.
  private func listPrefixAttributes(at location: Int) -> [NSAttributedString.Key: Any] {
    var attrs: [NSAttributedString.Key: Any] = [:]
    if location >= 0 && location < textView.textStorage.length {
      attrs = textView.textStorage.attributes(at: location, effectiveRange: nil)
    }
    if attrs[.font] == nil {
      attrs[.font] = textView.font ?? UIFont.preferredFont(forTextStyle: .body)
    }
    if attrs[.foregroundColor] == nil {
      attrs[.foregroundColor] = UIColor.label
    }
    attrs[.paragraphStyle] = listParagraphStyle()
    return attrs
  }

  /// Expands a range (or cursor position) to cover full paragraphs.
  private func fullParagraphRange(for range: NSRange) -> NSRange {
    let nsText = (textView.text ?? "") as NSString
    return nsText.paragraphRange(for: range)
  }

  /// Collects individual paragraph sub-ranges within a full paragraph range.
  private func paragraphSubRanges(in paraRange: NSRange) -> [NSRange] {
    let nsText = (textView.text ?? "") as NSString
    var ranges: [NSRange] = []
    var loc = paraRange.location
    while loc < NSMaxRange(paraRange) {
      let lineRange = nsText.paragraphRange(for: NSRange(location: loc, length: 0))
      ranges.append(lineRange)
      loc = NSMaxRange(lineRange)
    }
    return ranges
  }

  func toggleBulletList() {
    prepareForFormatting()
    let storage = textView.textStorage
    let paraRange = fullParagraphRange(for: textView.selectedRange)
    let subRanges = paragraphSubRanges(in: paraRange)

    storage.beginEditing()
    // Process in reverse to avoid range invalidation
    for range in subRanges.reversed() {
      let lineText = storage.attributedSubstring(from: range).string

      if lineText.hasPrefix(Self.bulletPrefix) {
        // Remove bullet prefix and reset paragraph style
        let prefixRange = NSRange(location: range.location, length: Self.bulletPrefix.count)
        storage.replaceCharacters(in: prefixRange, with: "")
        let newLineRange = NSRange(location: range.location, length: range.length - Self.bulletPrefix.count)
        if newLineRange.length > 0 {
          storage.addAttribute(.paragraphStyle, value: defaultParagraphStyle(), range: newLineRange)
        }
      } else if lineText.range(of: #"^\d+\.\s"#, options: .regularExpression) != nil {
        // Replace number prefix with bullet prefix
        if let swiftRange = lineText.range(of: #"^\d+\.\s"#, options: .regularExpression) {
          let prefixLen = lineText.distance(from: swiftRange.lowerBound, to: swiftRange.upperBound)
          let prefixNSRange = NSRange(location: range.location, length: prefixLen)
          let attrs = listPrefixAttributes(at: range.location)
          storage.replaceCharacters(in: prefixNSRange, with: NSAttributedString(string: Self.bulletPrefix, attributes: attrs))
          let newLineRange = NSRange(location: range.location, length: range.length - prefixLen + Self.bulletPrefix.count)
          if newLineRange.length > 0 {
            storage.addAttribute(.paragraphStyle, value: listParagraphStyle(), range: newLineRange)
          }
        }
      } else {
        // Add bullet prefix and list paragraph style
        let attrs = listPrefixAttributes(at: range.location)
        storage.insert(NSAttributedString(string: Self.bulletPrefix, attributes: attrs), at: range.location)
        let newLineRange = NSRange(location: range.location, length: range.length + Self.bulletPrefix.count)
        if newLineRange.length > 0 {
          storage.addAttribute(.paragraphStyle, value: listParagraphStyle(), range: newLineRange)
        }
      }
    }
    storage.endEditing()
  }

  func toggleNumberedList() {
    prepareForFormatting()
    let storage = textView.textStorage
    let paraRange = fullParagraphRange(for: textView.selectedRange)
    let subRanges = paragraphSubRanges(in: paraRange)

    // First pass: determine if we're toggling off (all lines already numbered)
    let allNumbered = subRanges.allSatisfy { range in
      let lineText = storage.attributedSubstring(from: range).string
      return lineText.range(of: #"^\d+\.\s"#, options: .regularExpression) != nil
    }

    storage.beginEditing()
    // Process in reverse to avoid range invalidation
    for (reverseIdx, range) in subRanges.reversed().enumerated() {
      let lineText = storage.attributedSubstring(from: range).string
      let forwardIdx = subRanges.count - 1 - reverseIdx
      let numberPrefix = "\(forwardIdx + 1). "

      if allNumbered {
        // Remove number prefix and reset paragraph style
        if let swiftRange = lineText.range(of: #"^\d+\.\s"#, options: .regularExpression) {
          let prefixLen = lineText.distance(from: swiftRange.lowerBound, to: swiftRange.upperBound)
          let prefixNSRange = NSRange(location: range.location, length: prefixLen)
          storage.replaceCharacters(in: prefixNSRange, with: "")
          let newLineRange = NSRange(location: range.location, length: range.length - prefixLen)
          if newLineRange.length > 0 {
            storage.addAttribute(.paragraphStyle, value: defaultParagraphStyle(), range: newLineRange)
          }
        }
      } else if lineText.hasPrefix(Self.bulletPrefix) {
        // Replace bullet prefix with number prefix
        let prefixNSRange = NSRange(location: range.location, length: Self.bulletPrefix.count)
        let attrs = listPrefixAttributes(at: range.location)
        storage.replaceCharacters(in: prefixNSRange, with: NSAttributedString(string: numberPrefix, attributes: attrs))
        let newLineRange = NSRange(location: range.location, length: range.length - Self.bulletPrefix.count + numberPrefix.count)
        if newLineRange.length > 0 {
          storage.addAttribute(.paragraphStyle, value: listParagraphStyle(), range: newLineRange)
        }
      } else if lineText.range(of: #"^\d+\.\s"#, options: .regularExpression) != nil {
        // Already numbered — renumber with correct index
        if let swiftRange = lineText.range(of: #"^\d+\.\s"#, options: .regularExpression) {
          let prefixLen = lineText.distance(from: swiftRange.lowerBound, to: swiftRange.upperBound)
          let prefixNSRange = NSRange(location: range.location, length: prefixLen)
          storage.replaceCharacters(in: prefixNSRange, with: numberPrefix)
        }
      } else {
        // Add number prefix and list paragraph style
        let attrs = listPrefixAttributes(at: range.location)
        storage.insert(NSAttributedString(string: numberPrefix, attributes: attrs), at: range.location)
        let newLineRange = NSRange(location: range.location, length: range.length + numberPrefix.count)
        if newLineRange.length > 0 {
          storage.addAttribute(.paragraphStyle, value: listParagraphStyle(), range: newLineRange)
        }
      }
    }
    storage.endEditing()
  }

  func increaseIndent() {
    prepareForFormatting()
    let storage = textView.textStorage
    let paraRange = fullParagraphRange(for: textView.selectedRange)

    storage.beginEditing()
    storage.enumerateAttribute(.paragraphStyle, in: paraRange, options: []) { value, subrange, _ in
      let current = (value as? NSParagraphStyle) ?? defaultParagraphStyle()
      let style = current.mutableCopy() as! NSMutableParagraphStyle
      style.headIndent += Self.indentStep
      style.firstLineHeadIndent += Self.indentStep
      storage.addAttribute(.paragraphStyle, value: style, range: subrange)
    }
    storage.endEditing()
  }

  func decreaseIndent() {
    prepareForFormatting()
    let storage = textView.textStorage
    let paraRange = fullParagraphRange(for: textView.selectedRange)

    storage.beginEditing()
    storage.enumerateAttribute(.paragraphStyle, in: paraRange, options: []) { value, subrange, _ in
      let current = (value as? NSParagraphStyle) ?? defaultParagraphStyle()
      let style = current.mutableCopy() as! NSMutableParagraphStyle
      style.headIndent = max(0, style.headIndent - Self.indentStep)
      style.firstLineHeadIndent = max(0, style.firstLineHeadIndent - Self.indentStep)
      storage.addAttribute(.paragraphStyle, value: style, range: subrange)
    }
    storage.endEditing()
  }

  // MARK: - FormattingTextViewDelegate

  var isFormattingEditable: Bool { return editable }

  func formattingToggleBold() { toggleBold() }
  func formattingToggleItalic() { toggleItalic() }
  func formattingToggleUnderline() { toggleUnderline() }
  func formattingToggleStrikethrough() { toggleStrikethrough() }
  func formattingToggleHighlight() { toggleHighlight() }
  func formattingToggleBulletList() { toggleBulletList() }
  func formattingToggleNumberedList() { toggleNumberedList() }
  func formattingIndent() { increaseIndent() }
  func formattingOutdent() { decreaseIndent() }
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
