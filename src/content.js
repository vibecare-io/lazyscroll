// LazyScroll Content Script
// Handles scroll commands from sidebar

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'SCROLL') {
    const scrollAmount = message.direction === 'up' ? -message.speed : message.speed;
    window.scrollBy({
      top: scrollAmount,
      behavior: 'auto'
    });
    sendResponse({ success: true });
  }
  return true;
});
