// LazyScroll Sidebar - Face + Hand Detection with Lip-Relative Scrolling
import { HandLandmarker, FaceLandmarker, FilesetResolver } from '../lib/vision_bundle.mjs';

// DOM Elements
const video = document.getElementById('video');
const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');
const startBtn = document.getElementById('startBtn');
const placeholder = document.getElementById('placeholder');
const statusEl = document.getElementById('status');
const scrollSpeedSlider = document.getElementById('scrollSpeed');
const scrollSpeedValue = document.getElementById('scrollSpeedValue');
const deadzoneSlider = document.getElementById('deadzone');
const deadzoneValue = document.getElementById('deadzoneValue');
const invertScrollCheckbox = document.getElementById('invertScroll');
const cameraContainer = document.getElementById('cameraContainer');
const placeholderText = document.getElementById('placeholderText');
const setupMessage = document.getElementById('setupMessage');
const controlsSection = document.getElementById('controls');

// Compact mode elements
const compactBtn = document.getElementById('compactBtn');
const expandBtn = document.getElementById('expandBtn');
const compactView = document.getElementById('compactView');
const fullViewContent = document.getElementById('fullViewContent');
const compactIndicator = document.getElementById('compactIndicator');
const compactText = document.getElementById('compactText');

// State
let handLandmarker = null;
let faceLandmarker = null;
let isTracking = false;
let isScrolling = false;
let animationId = null;
let frameCount = 0;

// Settings (defaults)
let scrollSpeed = 20;
let deadzone = 0.05;
let invertScroll = false;

// Current detection results
let currentHand = null;
let currentFace = null;

// Hand skeleton connections for drawing
const HAND_CONNECTIONS = [
  [0, 1], [1, 2], [2, 3], [3, 4],
  [0, 5], [5, 6], [6, 7], [7, 8],
  [0, 9], [9, 10], [10, 11], [11, 12],
  [0, 13], [13, 14], [14, 15], [15, 16],
  [0, 17], [17, 18], [18, 19], [19, 20],
  [5, 9], [9, 13], [13, 17]
];

const LIP_CENTER_INDEX = 13;

function dist(p1, p2) {
  return Math.sqrt(Math.pow(p1.x - p2.x, 2) + Math.pow(p1.y - p2.y, 2));
}

// Initialize MediaPipe models
async function initializeModels() {
  updateStatus('Loading AI models...');

  try {
    const wasmPath = chrome.runtime.getURL('lib/wasm');
    const vision = await FilesetResolver.forVisionTasks(wasmPath);

    handLandmarker = await HandLandmarker.createFromOptions(vision, {
      baseOptions: {
        modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task',
        delegate: 'GPU'
      },
      runningMode: 'VIDEO',
      numHands: 1
    });

    faceLandmarker = await FaceLandmarker.createFromOptions(vision, {
      baseOptions: {
        modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task',
        delegate: 'GPU'
      },
      runningMode: 'VIDEO',
      numFaces: 1,
      outputFaceBlendshapes: false,
      outputFacialTransformationMatrixes: false
    });

    updateStatus('Ready');
    return true;
  } catch (error) {
    console.error('[LazyScroll] Failed to init models:', error);
    updateStatus('Failed to load detection models', 'error');
    return false;
  }
}

// Main detection loop
function detectFrame() {
  if (!isTracking || !handLandmarker || !faceLandmarker || !video.videoWidth) {
    return;
  }

  const startTimeMs = performance.now();

  const handResults = handLandmarker.detectForVideo(video, startTimeMs);
  if (handResults.landmarks && handResults.landmarks.length > 0) {
    currentHand = handResults.landmarks[0];
  } else {
    currentHand = null;
  }

  const faceResults = faceLandmarker.detectForVideo(video, startTimeMs);
  if (faceResults.faceLandmarks && faceResults.faceLandmarks.length > 0) {
    currentFace = faceResults.faceLandmarks[0];
  } else {
    currentFace = null;
  }

  processTrackingResults();
  drawInterface();

  animationId = requestAnimationFrame(detectFrame);
}

// Main scroll logic
function processTrackingResults() {
  if (!currentHand || !currentFace || !isTracking) {
    stopScrolling();
    return;
  }

  const indexTip = currentHand[8];
  const indexPip = currentHand[6];
  const indexMcp = currentHand[5];
  const lipCenter = currentFace[LIP_CENTER_INDEX];

  if (!indexTip || !indexPip || !indexMcp || !lipCenter) {
    stopScrolling();
    return;
  }

  const tipToMcp = dist(indexTip, indexMcp);
  const pipToMcp = dist(indexPip, indexMcp);
  const isPointed = tipToMcp > pipToMcp * 1.15;

  const gap = lipCenter.y - indexTip.y;
  const absGap = Math.abs(gap);

  if (!isPointed) {
    stopScrolling();
    return;
  }

  if (absGap > deadzone) {
    isScrolling = true;
    const direction = gap > 0 ? 'up' : 'down';
    const actualDirection = invertScroll ? (direction === 'up' ? 'down' : 'up') : direction;

    sendScrollCommand(actualDirection, scrollSpeed);
  } else {
    stopScrolling();
  }
}

function stopScrolling() {
  isScrolling = false;
}

function sendScrollCommand(direction, speed) {
  chrome.runtime.sendMessage({
    type: 'SCROLL_COMMAND',
    direction,
    speed
  }).catch(() => {});
}

// Draw visual feedback
function drawInterface() {
  if (!canvas || !isTracking) return;

  const width = canvas.width;
  const height = canvas.height;
  frameCount++;

  ctx.save();
  ctx.clearRect(0, 0, width, height);
  ctx.scale(-1, 1);
  ctx.translate(-width, 0);

  if (currentFace && currentFace[LIP_CENTER_INDEX]) {
    const lip = currentFace[LIP_CENTER_INDEX];
    const ly = lip.y * height;
    const lx = lip.x * width;
    const dzPixels = deadzone * height;

    ctx.fillStyle = isScrolling ? 'rgba(34, 211, 238, 0.15)' : 'rgba(255, 255, 255, 0.08)';
    ctx.fillRect(0, ly - dzPixels, width, dzPixels * 2);

    ctx.beginPath();
    ctx.setLineDash([8, 8]);
    ctx.moveTo(0, ly - dzPixels);
    ctx.lineTo(width, ly - dzPixels);
    ctx.moveTo(0, ly + dzPixels);
    ctx.lineTo(width, ly + dzPixels);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.beginPath();
    ctx.moveTo(0, ly);
    ctx.lineTo(width, ly);
    ctx.strokeStyle = isScrolling ? 'rgba(34, 211, 238, 0.8)' : 'rgba(255, 255, 255, 0.4)';
    ctx.lineWidth = isScrolling ? 3 : 2;
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(lx, ly, 6, 0, 2 * Math.PI);
    ctx.fillStyle = isScrolling ? '#22d3ee' : '#ffffff';
    ctx.fill();
    ctx.strokeStyle = isScrolling ? '#0891b2' : '#666666';
    ctx.lineWidth = 2;
    ctx.stroke();
  }

  if (currentHand) {
    const indexTip = currentHand[8];
    const tx = indexTip.x * width;
    const ty = indexTip.y * height;

    ctx.strokeStyle = 'rgba(0, 255, 100, 0.6)';
    ctx.lineWidth = 2;
    HAND_CONNECTIONS.forEach(([start, end]) => {
      const p1 = currentHand[start];
      const p2 = currentHand[end];
      if (p1 && p2) {
        ctx.beginPath();
        ctx.moveTo(p1.x * width, p1.y * height);
        ctx.lineTo(p2.x * width, p2.y * height);
        ctx.stroke();
      }
    });

    if (isScrolling && currentFace && currentFace[LIP_CENTER_INDEX]) {
      const lipY = currentFace[LIP_CENTER_INDEX].y * height;
      const dzPixels = deadzone * height;
      const targetY = ty < lipY ? lipY - dzPixels : lipY + dzPixels;
      const diff = lipY - ty;
      const color = diff > 0 ? '#22d3ee' : '#fb7185';
      const absDiff = Math.abs(diff);

      const gradient = ctx.createLinearGradient(tx, targetY, tx, ty);
      gradient.addColorStop(0, 'rgba(255, 255, 255, 0)');
      gradient.addColorStop(1, color);

      ctx.beginPath();
      ctx.moveTo(tx, targetY);
      ctx.lineTo(tx, ty);
      ctx.strokeStyle = gradient;
      ctx.lineWidth = 4;
      ctx.stroke();

      if (absDiff > dzPixels + 10) {
        const numChevrons = 3;
        const spacing = 15;
        const offset = (frameCount % 30) / 30 * spacing;

        ctx.strokeStyle = color;
        ctx.lineWidth = 2;
        for (let i = 0; i < numChevrons; i++) {
          const cy = diff > 0 ? ty + (i * spacing) + offset : ty - (i * spacing) - offset;
          ctx.beginPath();
          ctx.moveTo(tx - 6, cy + (diff > 0 ? 6 : -6));
          ctx.lineTo(tx, cy);
          ctx.lineTo(tx + 6, cy + (diff > 0 ? 6 : -6));
          ctx.stroke();
        }
      }

      ctx.beginPath();
      ctx.arc(tx, ty, 10, 0, 2 * Math.PI);
      ctx.fillStyle = color;
      ctx.shadowBlur = 20;
      ctx.shadowColor = color;
      ctx.fill();
      ctx.shadowBlur = 0;
    } else {
      ctx.beginPath();
      ctx.arc(tx, ty, 8, 0, 2 * Math.PI);
      ctx.fillStyle = '#00ff66';
      ctx.fill();
      ctx.strokeStyle = '#006622';
      ctx.lineWidth = 2;
      ctx.stroke();
    }
  }

  ctx.restore();
}

// Start camera and tracking
async function startTracking() {
  if (!handLandmarker || !faceLandmarker) {
    const initialized = await initializeModels();
    if (!initialized) return;
  }

  try {
    updateStatus('Starting camera...');
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { width: 640, height: 480, facingMode: 'user' }
    });

    video.srcObject = stream;
    await video.play();

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;

    placeholder.classList.add('hidden');

    isTracking = true;
    updateStatus('Gestures active', 'active');
    startBtn.textContent = 'Disable Gestures';
    startBtn.classList.add('active');
    updateCompactStatus();

    detectFrame();
  } catch (error) {
    console.error('[LazyScroll] Camera error:', error);
    if (error.name === 'NotAllowedError') {
      updateStatus('Camera access denied', 'error');
    } else {
      updateStatus('Camera error: ' + error.message, 'error');
    }
  }
}

// Stop tracking
function stopTracking() {
  isTracking = false;
  isScrolling = false;

  if (animationId) {
    cancelAnimationFrame(animationId);
    animationId = null;
  }

  if (video.srcObject) {
    video.srcObject.getTracks().forEach(track => track.stop());
    video.srcObject = null;
  }

  ctx.clearRect(0, 0, canvas.width, canvas.height);
  placeholder.classList.remove('hidden');
  currentHand = null;
  currentFace = null;

  updateStatus('Ready');
  startBtn.innerHTML = `
    <span class="btn-icon">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
        <path d="M7 11.5V14m0-2.5v-6a1.5 1.5 0 1 1 3 0m-3 6a1.5 1.5 0 1 0-3 0v3c0 4.418 3.582 8 8 8s8-3.582 8-8v-1.5m-4-6.5v8m0-8a1.5 1.5 0 0 0-3 0m3 0a1.5 1.5 0 0 1 3 0m0 0v1.5m0 0a1.5 1.5 0 0 1 3 0v4.5"/>
      </svg>
    </span>
    Enable Gestures
  `;
  startBtn.classList.remove('active');
  updateCompactStatus();
}

function updateStatus(text, className = '') {
  statusEl.textContent = text;
  statusEl.className = 'status ' + className;
}

// Event Listeners
startBtn.addEventListener('click', () => {
  if (isTracking) {
    stopTracking();
  } else {
    startTracking();
  }
});

scrollSpeedSlider.addEventListener('input', () => {
  scrollSpeed = parseInt(scrollSpeedSlider.value);
  scrollSpeedValue.textContent = `${scrollSpeed} px`;
  chrome.storage.local.set({ scrollSpeed });
});

deadzoneSlider.addEventListener('input', () => {
  deadzone = parseFloat(deadzoneSlider.value);
  deadzoneValue.textContent = `${Math.round(deadzone * 100)}%`;
  chrome.storage.local.set({ deadzone });
});

invertScrollCheckbox.addEventListener('change', () => {
  invertScroll = invertScrollCheckbox.checked;
  chrome.storage.local.set({ invertScroll });
});

// Load saved settings
chrome.storage.local.get(['scrollSpeed', 'deadzone', 'invertScroll'], (result) => {
  if (result.scrollSpeed !== undefined) {
    scrollSpeed = result.scrollSpeed;
    scrollSpeedSlider.value = scrollSpeed;
    scrollSpeedValue.textContent = `${scrollSpeed} px`;
  }
  if (result.deadzone !== undefined) {
    deadzone = result.deadzone;
    deadzoneSlider.value = deadzone;
    deadzoneValue.textContent = `${Math.round(deadzone * 100)}%`;
  }
  if (result.invertScroll !== undefined) {
    invertScroll = result.invertScroll;
    invertScrollCheckbox.checked = invertScroll;
  }
});

// Camera permission handling
let cameraPermissionState = 'prompt';

async function checkCameraPermission() {
  try {
    const result = await navigator.permissions.query({ name: 'camera' });
    handlePermissionState(result.state);
    result.addEventListener('change', () => handlePermissionState(result.state));
  } catch (e) {
    chrome.storage.local.get(['cameraPermissionGranted'], (data) => {
      handlePermissionState(data.cameraPermissionGranted ? 'granted' : 'prompt');
    });
  }
}

async function handlePermissionState(state) {
  cameraPermissionState = state;
  updatePermissionUI(state);

  if (state !== 'granted') {
    const { cameraSetupComplete } = await chrome.storage.local.get(['cameraSetupComplete']);
    if (!cameraSetupComplete) {
      openPermissionsPage();
    }
  }
}

function updatePermissionUI(state) {
  if (state === 'granted') {
    placeholderText.textContent = 'Click to start';
    placeholder.classList.remove('denied');
    setupMessage.classList.add('hidden');
    controlsSection.classList.remove('hidden');
  } else if (state === 'denied') {
    placeholderText.textContent = 'Camera blocked - click to fix';
    placeholder.classList.add('denied');
    setupMessage.querySelector('p').textContent = 'Camera access was denied. Click above to try again.';
    setupMessage.classList.remove('hidden');
    controlsSection.classList.add('hidden');
  } else {
    placeholderText.textContent = 'Click to enable camera';
    placeholder.classList.remove('denied');
    setupMessage.classList.remove('hidden');
    controlsSection.classList.add('hidden');
  }
}

function openPermissionsPage() {
  chrome.tabs.create({ url: chrome.runtime.getURL('permissions/permissions.html') });
}

placeholder.addEventListener('click', async () => {
  if (cameraPermissionState !== 'granted') {
    openPermissionsPage();
    return;
  }
  if (!isTracking) {
    startTracking();
  }
});

chrome.runtime.onMessage.addListener((message) => {
  if (message.type === 'CAMERA_PERMISSION_GRANTED') {
    cameraPermissionState = 'granted';
    chrome.storage.local.set({ cameraSetupComplete: true });
    updatePermissionUI('granted');
  }
});

// Compact mode functions
function enterCompactMode() {
  fullViewContent.classList.add('hidden');
  compactView.classList.remove('hidden');
  updateCompactStatus();
  chrome.storage.local.set({ compactMode: true });
}

function exitCompactMode() {
  compactView.classList.add('hidden');
  fullViewContent.classList.remove('hidden');
  chrome.storage.local.set({ compactMode: false });
}

function updateCompactStatus() {
  if (isTracking) {
    compactIndicator.classList.add('active');
    compactIndicator.classList.remove('inactive');
    compactText.textContent = 'Gestures active';
  } else {
    compactIndicator.classList.remove('active');
    compactIndicator.classList.add('inactive');
    compactText.textContent = 'Gestures paused';
  }
}

compactBtn.addEventListener('click', enterCompactMode);
expandBtn.addEventListener('click', exitCompactMode);

chrome.storage.local.get(['compactMode'], (result) => {
  if (result.compactMode) {
    enterCompactMode();
  }
});

// Initialize
checkCameraPermission();
initializeModels();
