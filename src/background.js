// LazyScroll Background Service Worker
// Routes messages from sidebar to content scripts
// Falls back to keyboard events for PDFs

// Track debugger state per tab
const debuggerAttached = new Set();

// Get active tab
async function getActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

// Send keyboard event via debugger API (for PDFs)
async function sendKeyboardEvent(tabId, direction, speed) {
  const key = direction === 'up' ? 'ArrowUp' : 'ArrowDown';
  const keyCode = direction === 'up' ? 38 : 40;

  try {
    // Attach debugger if not already attached
    if (!debuggerAttached.has(tabId)) {
      await chrome.debugger.attach({ tabId }, '1.3');
      debuggerAttached.add(tabId);
      console.log('[LazyScroll] Debugger attached to tab:', tabId);
    }

    // Send multiple key events based on speed (more events = faster scroll)
    const keyPresses = Math.max(1, Math.floor(speed / 10));

    for (let i = 0; i < keyPresses; i++) {
      await chrome.debugger.sendCommand({ tabId }, 'Input.dispatchKeyEvent', {
        type: 'keyDown',
        key,
        code: key,
        windowsVirtualKeyCode: keyCode,
        nativeVirtualKeyCode: keyCode
      });

      await chrome.debugger.sendCommand({ tabId }, 'Input.dispatchKeyEvent', {
        type: 'keyUp',
        key,
        code: key,
        windowsVirtualKeyCode: keyCode,
        nativeVirtualKeyCode: keyCode
      });
    }

    return true;
  } catch (error) {
    console.error('[LazyScroll] Keyboard event failed:', error.message);
    debuggerAttached.delete(tabId);
    return false;
  }
}

// Clean up debugger when tab closes or navigates
chrome.tabs.onRemoved.addListener((tabId) => {
  if (debuggerAttached.has(tabId)) {
    debuggerAttached.delete(tabId);
  }
});

chrome.debugger.onDetach.addListener((source) => {
  if (source.tabId) {
    debuggerAttached.delete(source.tabId);
    console.log('[LazyScroll] Debugger detached from tab:', source.tabId);
  }
});

// Send message to active tab's content script
async function sendToContentScript(message) {
  const tab = await getActiveTab();
  console.log('[LazyScroll] Active tab:', tab?.id, tab?.url);

  if (!tab?.id) {
    console.warn('[LazyScroll] No active tab found');
    return false;
  }

  // Skip chrome:// pages entirely - use keyboard fallback
  if (tab.url?.startsWith('chrome://')) {
    console.log('[LazyScroll] Chrome page detected, using keyboard fallback');
    return await sendKeyboardEvent(tab.id, message.direction, message.speed);
  }

  // PDF files - use keyboard fallback (window.scrollBy doesn't work on PDF viewer)
  if (tab.url?.toLowerCase().endsWith('.pdf')) {
    console.log('[LazyScroll] PDF detected, using keyboard fallback');
    return await sendKeyboardEvent(tab.id, message.direction, message.speed);
  }

  // Try content script first
  try {
    const response = await chrome.tabs.sendMessage(tab.id, message);
    console.log('[LazyScroll] Content script responded:', response);
    return true;
  } catch (error) {
    console.log('[LazyScroll] Content script failed, trying keyboard fallback:', error.message);
    // Fallback to keyboard events (for PDFs and other restricted pages)
    return await sendKeyboardEvent(tab.id, message.direction, message.speed);
  }
}

// Message handler
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'SCROLL_COMMAND') {
    console.log('[LazyScroll] Background received scroll command:', message.direction, message.speed);
    sendToContentScript({
      type: 'SCROLL',
      direction: message.direction,
      speed: message.speed
    }).then(success => {
      sendResponse({ success });
    });
    return true; // Keep channel open for async response
  }
});

// Open side panel when extension icon is clicked
chrome.action.onClicked.addListener((tab) => {
  chrome.sidePanel.open({ windowId: tab.windowId });
});

console.log('[LazyScroll] Background service worker loaded');
