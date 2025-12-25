// LazyScroll Permissions Page

const allowBtn = document.getElementById('allowBtn');
const status = document.getElementById('status');
const hint = document.getElementById('hint');
const icon = document.getElementById('icon');
const videoPreview = document.getElementById('video-preview');

allowBtn.addEventListener('click', async () => {
  allowBtn.disabled = true;
  allowBtn.textContent = 'Requesting...';
  status.textContent = '';
  status.className = 'status';

  try {
    // Request camera permission
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { width: 640, height: 480, facingMode: 'user' }
    });

    // Show preview
    videoPreview.srcObject = stream;
    videoPreview.style.display = 'block';

    // Update UI
    icon.innerHTML = `
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
        <polyline points="22 4 12 14.01 9 11.01"/>
      </svg>
    `;
    icon.className = 'icon success';
    status.textContent = 'Camera access granted!';
    status.className = 'status success';
    hint.textContent = 'You can now close this tab and use LazyScroll.';
    allowBtn.textContent = 'Done - Close Tab';
    allowBtn.disabled = false;

    // Notify background script
    chrome.runtime.sendMessage({ type: 'CAMERA_PERMISSION_GRANTED' });

    // Change button to close tab
    allowBtn.onclick = () => {
      stream.getTracks().forEach(track => track.stop());
      window.close();
    };

  } catch (err) {
    console.error('Camera permission error:', err);

    icon.innerHTML = `
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <circle cx="12" cy="12" r="10"/>
        <line x1="15" y1="9" x2="9" y2="15"/>
        <line x1="9" y1="9" x2="15" y2="15"/>
      </svg>
    `;
    icon.className = 'icon error';

    if (err.name === 'NotAllowedError') {
      status.textContent = 'Camera access denied';
      hint.innerHTML = `
        To use LazyScroll, please allow camera access:<br><br>
        1. Click the camera icon in the address bar<br>
        2. Select "Always allow"<br>
        3. Reload this page and try again
      `;
    } else {
      status.textContent = 'Camera error: ' + err.message;
      hint.textContent = 'Please make sure your camera is connected and not in use by another application.';
    }

    status.className = 'status error';
    allowBtn.textContent = 'Try Again';
    allowBtn.disabled = false;
  }
});

// Check if permission already granted
navigator.permissions.query({ name: 'camera' }).then(result => {
  if (result.state === 'granted') {
    // Auto-request to show preview
    allowBtn.click();
  }
}).catch(() => {
  // permissions API not supported, user will click manually
});
