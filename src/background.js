// LazyScroll Background Service Worker
// Routes messages from sidebar to content scripts
// Falls back to keyboard events for PDFs

// Track debugger state per tab
const debuggerAttached = new Set();

// Throttle keyboard events for smoother PDF scrolling
let lastKeyPressTime = 0;

// Get active tab
async function getActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

// Send keyboard event via debugger API (for PDFs)
async function sendKeyboardEvent(tabId, direction, speed) {
  // Throttle proportionally: speed 1-100 maps to interval 100ms-16ms
  // Linear interpolation: faster overall, still proportional
  const now = Date.now();
  const minInterval = Math.round(16 + ((100 - speed) / 100) * 84);

  if (now - lastKeyPressTime < minInterval) {
    return true; // Skip this frame, throttled
  }
  lastKeyPressTime = now;

  const key = direction === 'up' ? 'ArrowUp' : 'ArrowDown';
  const keyCode = direction === 'up' ? 38 : 40;

  try {
    // Attach debugger if not already attached
    if (!debuggerAttached.has(tabId)) {
      await chrome.debugger.attach({ tabId }, '1.3');
      debuggerAttached.add(tabId);
    }

    // Send single key event (throttling controls speed now)
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
  }
});

// Send message to active tab's content script
async function sendToContentScript(message) {
  const tab = await getActiveTab();

  if (!tab?.id) {
    return false;
  }

  // Skip chrome:// pages - use keyboard fallback
  if (tab.url?.startsWith('chrome://')) {
    return await sendKeyboardEvent(tab.id, message.direction, message.speed);
  }

  // PDF files - use keyboard fallback (window.scrollBy doesn't work on PDF viewer)
  if (tab.url?.toLowerCase().endsWith('.pdf')) {
    return await sendKeyboardEvent(tab.id, message.direction, message.speed);
  }

  // Try content script first
  try {
    await chrome.tabs.sendMessage(tab.id, message);
    return true;
  } catch (error) {
    // Fallback to keyboard events for restricted pages
    return await sendKeyboardEvent(tab.id, message.direction, message.speed);
  }
}

// Message handler
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'SCROLL_COMMAND') {
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
