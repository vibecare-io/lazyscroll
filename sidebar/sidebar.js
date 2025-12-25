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

// State
let handLandmarker = null;
let faceLandmarker = null;
let isTracking = false;
let isScrolling = false;
let animationId = null;
let frameCount = 0;

// Settings (defaults)
let scrollSpeed = 20;      // pixels per frame
let deadzone = 0.05;       // 5% of screen height
let invertScroll = false;

// Current detection results
let currentHand = null;
let currentFace = null;

// Hand skeleton connections for drawing
const HAND_CONNECTIONS = [
  [0, 1], [1, 2], [2, 3], [3, 4],       // Thumb
  [0, 5], [5, 6], [6, 7], [7, 8],       // Index
  [0, 9], [9, 10], [10, 11], [11, 12],  // Middle
  [0, 13], [13, 14], [14, 15], [15, 16], // Ring
  [0, 17], [17, 18], [18, 19], [19, 20], // Pinky
  [5, 9], [9, 13], [13, 17]             // Palm
];

// Lip landmark index in FaceLandmarker (upper lip center)
// FaceLandmarker uses 478 landmarks, index 13 is upper lip
const LIP_CENTER_INDEX = 13;

// Distance helper
function dist(p1, p2) {
  return Math.sqrt(Math.pow(p1.x - p2.x, 2) + Math.pow(p1.y - p2.y, 2));
}

// Initialize MediaPipe models
async function initializeModels() {
  updateStatus('Loading AI models...');

  try {
    const wasmPath = chrome.runtime.getURL('lib/wasm');
    const vision = await FilesetResolver.forVisionTasks(wasmPath);

    // Initialize HandLandmarker
    handLandmarker = await HandLandmarker.createFromOptions(vision, {
      baseOptions: {
        modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task',
        delegate: 'GPU'
      },
      runningMode: 'VIDEO',
      numHands: 1
    });

    // Initialize FaceLandmarker
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

  // Detect hands
  const handResults = handLandmarker.detectForVideo(video, startTimeMs);
  if (handResults.landmarks && handResults.landmarks.length > 0) {
    currentHand = handResults.landmarks[0];
  } else {
    currentHand = null;
  }

  // Detect face
  const faceResults = faceLandmarker.detectForVideo(video, startTimeMs);
  if (faceResults.faceLandmarks && faceResults.faceLandmarks.length > 0) {
    currentFace = faceResults.faceLandmarks[0];
  } else {
    currentFace = null;
  }

  // Process results and draw
  processTrackingResults();
  drawInterface();

  animationId = requestAnimationFrame(detectFrame);
}

// Main scroll logic - lip-relative detection
function processTrackingResults() {
  if (!currentHand || !currentFace || !isTracking) {
    stopScrolling();
    return;
  }

  // Get key landmarks
  const indexTip = currentHand[8];   // Fingertip
  const indexPip = currentHand[6];   // PIP joint
  const indexMcp = currentHand[5];   // Knuckle (MCP)
  const lipCenter = currentFace[LIP_CENTER_INDEX]; // Lip center

  if (!indexTip || !indexPip || !indexMcp || !lipCenter) {
    stopScrolling();
    return;
  }

  // Check if index finger is pointed (extended)
  const tipToMcp = dist(indexTip, indexMcp);
  const pipToMcp = dist(indexPip, indexMcp);
  const isPointed = tipToMcp > pipToMcp * 1.15;

  // Calculate gap from lip center
  // Positive gap = finger above lips, Negative gap = finger below lips
  const gap = lipCenter.y - indexTip.y;
  const absGap = Math.abs(gap);

  if (!isPointed) {
    stopScrolling();
    return;
  }

  if (absGap > deadzone) {
    isScrolling = true;
    // gap > 0 means finger is above lips -> scroll up
    // gap < 0 means finger is below lips -> scroll down
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

// Draw visual feedback on canvas
function drawInterface() {
  if (!canvas || !isTracking) return;

  const width = canvas.width;
  const height = canvas.height;
  frameCount++;

  ctx.save();
  ctx.clearRect(0, 0, width, height);

  // Mirror horizontal for natural feedback
  ctx.scale(-1, 1);
  ctx.translate(-width, 0);

  // 1. Draw Lip Reference Line and Deadzone
  if (currentFace && currentFace[LIP_CENTER_INDEX]) {
    const lip = currentFace[LIP_CENTER_INDEX];
    const ly = lip.y * height;
    const lx = lip.x * width;
    const dzPixels = deadzone * height;

    // Deadzone shading - more visible
    ctx.fillStyle = isScrolling ? 'rgba(34, 211, 238, 0.15)' : 'rgba(255, 255, 255, 0.08)';
    ctx.fillRect(0, ly - dzPixels, width, dzPixels * 2);

    // Threshold lines (dashed) - brighter
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

    // Main horizontal horizon line - brighter
    ctx.beginPath();
    ctx.moveTo(0, ly);
    ctx.lineTo(width, ly);
    ctx.strokeStyle = isScrolling ? 'rgba(34, 211, 238, 0.8)' : 'rgba(255, 255, 255, 0.4)';
    ctx.lineWidth = isScrolling ? 3 : 2;
    ctx.stroke();

    // Central anchor point at lip center - larger and brighter
    ctx.beginPath();
    ctx.arc(lx, ly, 6, 0, 2 * Math.PI);
    ctx.fillStyle = isScrolling ? '#22d3ee' : '#ffffff';
    ctx.fill();
    // Add outline for better visibility
    ctx.strokeStyle = isScrolling ? '#0891b2' : '#666666';
    ctx.lineWidth = 2;
    ctx.stroke();
  }

  // 2. Draw Hand and Index Finger
  if (currentHand) {
    const indexTip = currentHand[8];
    const tx = indexTip.x * width;
    const ty = indexTip.y * height;

    // Draw hand skeleton - more visible
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

      const diff = lipY - ty; // Positive = finger above lips
      const color = diff > 0 ? '#22d3ee' : '#fb7185'; // Cyan for up, Pink for down
      const absDiff = Math.abs(diff);

      // Gradient line from threshold to finger
      const gradient = ctx.createLinearGradient(tx, targetY, tx, ty);
      gradient.addColorStop(0, 'rgba(255, 255, 255, 0)');
      gradient.addColorStop(1, color);

      ctx.beginPath();
      ctx.moveTo(tx, targetY);
      ctx.lineTo(tx, ty);
      ctx.strokeStyle = gradient;
      ctx.lineWidth = 4;
      ctx.stroke();

      // Animated chevrons for direction
      if (absDiff > dzPixels + 10) {
        const numChevrons = 3;
        const spacing = 15;
        const offset = (frameCount % 30) / 30 * spacing;

        ctx.strokeStyle = color;
        ctx.lineWidth = 2;
        for (let i = 0; i < numChevrons; i++) {
          const cy = diff > 0
            ? ty + (i * spacing) + offset
            : ty - (i * spacing) - offset;

          ctx.beginPath();
          ctx.moveTo(tx - 6, cy + (diff > 0 ? 6 : -6));
          ctx.lineTo(tx, cy);
          ctx.lineTo(tx + 6, cy + (diff > 0 ? 6 : -6));
          ctx.stroke();
        }
      }

      // Main pointer with glow
      ctx.beginPath();
      ctx.arc(tx, ty, 10, 0, 2 * Math.PI);
      ctx.fillStyle = color;
      ctx.shadowBlur = 20;
      ctx.shadowColor = color;
      ctx.fill();
      ctx.shadowBlur = 0;
    } else {
      // Idle state - bright green dot
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

    // Set canvas size
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;

    // Hide placeholder
    placeholder.classList.add('hidden');

    isTracking = true;
    updateStatus('Gestures active', 'active');
    startBtn.textContent = 'Disable Gestures';
    startBtn.classList.add('active');

    // Start detection loop
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

  // Clear canvas
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // Show placeholder
  placeholder.classList.remove('hidden');

  // Reset results
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

// Initialize on load
initializeModels();
