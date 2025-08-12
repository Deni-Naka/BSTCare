// BST Care - Content Script
console.log("[BST Care] Content script loaded ✅");

// Global variables
let phrases = []; // Array to store phrases and their replacements
let phraseRegex = null; // Regex for matching phrases
let overlaysEnabled = false; // Flag to track if highlighting is active
let mutationObserver = null; 
let lastFocusedEditable = null; 
window.activeReplacementMenu = null;

function buildRegex(phrases) {
  // Escape special regex characters and create pattern
  const escaped = phrases
    .flatMap(p => p.find.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .filter(Boolean);
  return new RegExp(escaped.join("|"), "gi");
}

function highlightText(text) {
  if (!text || !phraseRegex) return "";

  // Sanitize HTML in the text
  const safe = text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\n/g, "<br>");

  // Replace matches with highlighted spans
  return safe.replace(phraseRegex, match => {
    // Find the matching phrase object (case insensitive)
    const phraseObj = phrases.find(p => 
      p.find.toLowerCase() === match.toLowerCase()
    );
    
    // Skip if no replacements exist
    if (!phraseObj || !phraseObj.replacements || phraseObj.replacements.length === 0) {
      return match;
    }

    // Join replacements for tooltip display
    const replacements = phraseObj.replacements.join(" / ");
    return `<span class="highlighted-phrase" data-replacements="${escapeHtml(replacements)}">${match}</span>`;
  });
}

function escapeHtml(unsafe) {
  return unsafe
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function addOverlay(editable) {
  // Skip if overlay already exists
  if (editable.dataset.phraseHighlighterOverlay) return;
  editable.dataset.phraseHighlighterOverlay = "true";

  // Ensure proper positioning
  const style = getComputedStyle(editable);
  if (style.position === "static" || style.position === "") {
    editable.style.position = "relative";
  }

  // Track last focused editable
  editable.addEventListener('focus', () => {
    lastFocusedEditable = editable;
    console.log("Editable element focused:", editable);
  });

  // Create overlay element
  const overlay = document.createElement("div");
  overlay.className = "highlight-overlay";

  // Style overlay to match the editable element
  Object.assign(overlay.style, {
    position: "absolute",
    top: "0",
    left: "0",
    right: "0",
    bottom: "0",
    pointerEvents: "none",
    whiteSpace: "pre-wrap",
    padding: style.padding,
    font: style.font,
    lineHeight: style.lineHeight,
    color: "transparent",
    zIndex: "9999",
    userSelect: "none",
  });

  // Insert overlay after the editable element
  editable.parentNode.insertBefore(overlay, editable.nextSibling);

  /**
   * Updates the overlay with highlighted text
   */
  function update() {
    const text = editable.innerText || editable.textContent;
    
    // Clear if text is empty
    if (!text.trim()) {
      overlay.innerHTML = '';
      return;
    }
    
    // Update with highlighted content
    overlay.innerHTML = highlightText(text);
    
    // Make phrases interactive
    overlay.querySelectorAll('.highlighted-phrase').forEach(phrase => {
      phrase.style.pointerEvents = 'auto';
      phrase.style.position = 'relative';
    });
  }

  // Initial update
  update();

  // Click handler for replacement menu
  overlay.addEventListener('click', function(e) {
    const target = e.target.closest('.highlighted-phrase');
    if (!target) {
      if (window.activeReplacementMenu) {
        window.activeReplacementMenu.remove();
        window.activeReplacementMenu = null;
      }
      return;
    }
    
    e.preventDefault();
    e.stopPropagation();
    
    lastFocusedEditable = editable;
    const phrase = target.textContent;
    const replacements = target.dataset.replacements 
      ? target.dataset.replacements.split(' / ') 
      : [];
    
    const rect = target.getBoundingClientRect();
    createReplacementMenu(phrase, replacements, rect.left, rect.top + window.scrollY - 5);
  });

  // Optimized update handler using requestAnimationFrame
  const updateHandler = () => {
    requestAnimationFrame(update);
  };

  // Set up event listeners
  editable.addEventListener("input", updateHandler);
  editable.addEventListener("scroll", () => {
    overlay.scrollTop = editable.scrollTop;
    overlay.scrollLeft = editable.scrollLeft;
  });

  // Observe DOM changes
  const observer = new MutationObserver(updateHandler);
  observer.observe(editable, { 
    childList: true, 
    subtree: true, 
    characterData: true,
    characterDataOldValue: true 
  });
}

/**
 * Creates replacement suggestion menu
 * @param {string} phrase - Original phrase
 * @param {Array} replacements - Array of replacement options
 * @param {number} x - Horizontal position
 * @param {number} y - Vertical position
 */
function createReplacementMenu(phrase, replacements, x, y) {
  // Remove existing menu if any
  if (window.activeReplacementMenu) {
    window.activeReplacementMenu.remove();
    window.activeReplacementMenu = null;
  }

  // Convert string to array for backward compatibility
  if (typeof replacements === 'string') {
    replacements = [replacements];
  }

  // Create menu container
  const menu = document.createElement('div');
  menu.className = 'replacement-menu';
  
  // Position the menu
  Object.assign(menu.style, {
    position: 'fixed',
    left: `${x}px`,
    top: `${y}px`,
    zIndex: '100001',
    minWidth: '200px',
    background: '#fff',
    borderRadius: '4px',
    boxShadow: '0 2px 10px rgba(0,0,0,0.2)',
    padding: '8px 0',
    transform: 'translateY(-100%)'
  });

  // Add replacement options
  if (replacements && replacements.length > 0) {
    replacements.forEach((replacement, index) => {
      const item = document.createElement('div');
      item.className = `replacement-item ${index === 0 ? 'main' : ''}`;
      item.textContent = replacement;
      item.addEventListener('click', (e) => {
        e.stopPropagation();
        replacePhrase(phrase, replacement);
        menu.remove();
        window.activeReplacementMenu = null;
      });
      menu.appendChild(item);
    });
  }

  // Add default suggestions if no custom replacements
  if (!replacements || replacements.length === 0) {
    getSuggestions(phrase).forEach(sugg => {
      const item = document.createElement('div');
      item.className = 'replacement-item';
      item.textContent = sugg;
      item.addEventListener('click', (e) => {
        e.stopPropagation();
        replacePhrase(phrase, sugg);
        menu.remove();
        window.activeReplacementMenu = null;
      });
      menu.appendChild(item);
    });
  }

  document.body.appendChild(menu);
  window.activeReplacementMenu = menu;

  // Close menu when clicking outside
  setTimeout(() => {
    const clickHandler = (e) => {
      if (!menu.contains(e.target)) {
        menu.remove();
        document.removeEventListener('click', clickHandler);
        window.activeReplacementMenu = null;
      }
    };
    document.addEventListener('click', clickHandler);
  }, 0);
}

/**
 * Replaces phrase in editable content
 * @param {string} oldPhrase - Phrase to replace
 * @param {string} newPhrase - Replacement text
 */
function replacePhrase(oldPhrase, newPhrase) {
  console.log("Replacing:", oldPhrase, "with:", newPhrase);
  
  // Find the target editable element
  const editable = lastFocusedEditable || document.activeElement;
  
  if (!editable || !editable.isContentEditable) {
    console.log("No active editable, searching...");
    const editables = document.querySelectorAll('[contenteditable="true"]');
    if (editables.length > 0) {
      lastFocusedEditable = editables[0];
      console.log("Using first found editable");
      return replacePhrase(oldPhrase, newPhrase);
    }
    console.error("No suitable editable element found");
    return;
  }

  // Focus the element
  editable.focus();
  
  // Save current selection
  const selection = window.getSelection();
  const range = selection.rangeCount > 0 ? selection.getRangeAt(0) : null;
  
  // Find target element (special handling for ProseMirror)
  let targetElement = editable;
  if (editable.classList.contains('ProseMirror')) {
    targetElement = editable.querySelector('p') || editable;
  }

  // Get all text nodes
  const textNodes = [];
  const walker = document.createTreeWalker(
    targetElement,
    NodeFilter.SHOW_TEXT,
    null,
    false
  );
  
  let node;
  while (node = walker.nextNode()) {
    textNodes.push(node);
  }

  // Perform replacement
  let replacementDone = false;
  for (const textNode of textNodes) {
    const text = textNode.nodeValue;
    const regex = new RegExp(escapeRegExp(oldPhrase), 'gi');
    
    if (regex.test(text)) {
      const newText = text.replace(regex, newPhrase);
      textNode.nodeValue = newText;
      replacementDone = true;
    }
  }

  if (replacementDone) {
    // Trigger input event
    const event = new Event('input', { bubbles: true });
    editable.dispatchEvent(event);
    console.log("Replacement complete");
  } else {
    console.log("Phrase not found in content");
  }
}

/**
 * Escapes special regex characters
 * @param {string} string - Input string
 * @returns {string} - Escaped string
 */
function escapeRegExp(string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Gets default suggestions for a phrase
 * @param {string} phrase - Input phrase
 * @returns {Array} - Array of suggestions
 */
function getSuggestions(phrase) {
  // Default suggestions for common phrases
  const suggestions = {
    "нельзя": ["можно", "возможно", "лучше не стоит"],
    "неправильно": ["правильно", "верно", "точнее"]
  };
  
  return suggestions[phrase.toLowerCase()] || [];
}

/**
 * Enables phrase highlighting functionality
 */
function enableHighlighter() {
  if (overlaysEnabled) return;
  
  // Clean up existing overlays
  document.querySelectorAll('.highlight-overlay').forEach(el => el.remove());
  document.querySelectorAll('[data-phrase-highlighter-overlay]').forEach(el => {
    delete el.dataset.phraseHighlighterOverlay;
  });
  
  overlaysEnabled = true;
  console.log("[BST Care] Highlighter ENABLED ✅");

  // Add overlays to existing elements
  document.querySelectorAll('[contenteditable="true"]').forEach(addOverlay);

  // Set up mutation observer for new elements
  mutationObserver = new MutationObserver(mutations => {
    mutations.forEach(mutation => {
      mutation.addedNodes.forEach(node => {
        if (node.nodeType === Node.ELEMENT_NODE) {
          if (node.matches('[contenteditable="true"]')) {
            addOverlay(node);
          }
          node.querySelectorAll('[contenteditable="true"]').forEach(addOverlay);
        }
      });
    });
  });
  
  mutationObserver.observe(document.body, { 
    childList: true, 
    subtree: true 
  });
}

/**
 * Disables phrase highlighting functionality
 */
function disableHighlighter() {
  if (!overlaysEnabled) return;
  
  // Remove all overlays
  document.querySelectorAll('.highlight-overlay').forEach(el => el.remove());
  document.querySelectorAll('[data-phrase-highlighter-overlay]').forEach(el => {
    delete el.dataset.phraseHighlighterOverlay;
  });
  
  // Clean up observer
  mutationObserver?.disconnect();
  mutationObserver = null;
  
  // Reset state
  lastFocusedEditable = null;
  overlaysEnabled = false;
  
  console.log("[BST Care] Highlighter DISABLED ❌");
}

// Handle page unload
window.addEventListener('beforeunload', () => {
  if (overlaysEnabled) {
    disableHighlighter();
  }
});

/**
 * Checks settings and applies them
 */
function checkAndApplySettings() {
  chrome.storage.sync.get(
    {
      enabled: true,
      sites: ["app.intercom.com"],
      phrases: []
    },
    data => {
      const host = window.location.hostname.replace(/^www\./, "").toLowerCase();
      const allowed = data.enabled && data.sites.map(s => s.toLowerCase()).includes(host);

      // Convert old format to new format if needed
      phrases = (data.phrases || []).map(item => {
        if (item.replace) { // Old format
          return { find: item.find, replacements: [item.replace] };
        }
        return item; // New format
      });

      phraseRegex = buildRegex(phrases);

      if (allowed) {
        enableHighlighter();
      } else {
        disableHighlighter();
      }
    }
  );
}

// Listen for storage changes
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "sync") {
    checkAndApplySettings();
  }
});

// Initialize
checkAndApplySettings();