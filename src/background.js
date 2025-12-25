// LazyScroll Background Service Worker
// Routes messages from sidebar to content scripts

// Get active tab
async function getActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

// Send message to active tab's content script
async function sendToContentScript(message) {
  const tab = await getActiveTab();
  console.log('[LazyScroll] Active tab:', tab?.id, tab?.url);
  if (tab?.id && !tab.url?.startsWith('chrome://')) {
    try {
      const response = await chrome.tabs.sendMessage(tab.id, message);
      console.log('[LazyScroll] Message sent to tab, response:', response);
    } catch (error) {
      console.error('[LazyScroll] Failed to send to content script:', error.message);
    }
  } else {
    console.warn('[LazyScroll] No valid tab found or chrome:// page');
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
    });
    sendResponse({ success: true });
  }
  return true;
});

// Open side panel when extension icon is clicked (optional - can also use popup)
chrome.action.onClicked.addListener((tab) => {
  chrome.sidePanel.open({ windowId: tab.windowId });
});

console.log('[LazyScroll] Background service worker loaded');
