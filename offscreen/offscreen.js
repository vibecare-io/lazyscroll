// Import MediaPipe from local bundle
import { HandLandmarker, FilesetResolver } from '../lib/vision_bundle.mjs';

const INDEX_FINGER_TIP = 8;
const SCROLL_UP_THRESHOLD = 0.33;
const SCROLL_DOWN_THRESHOLD = 0.66;
const BASE_SCROLL_SPEED = 5;

let handLandmarker = null;
let video = null;
let canvas = null;
let ctx = null;
let isRunning = false;
let lastScrollDirection = null;
let sensitivity = 1.0;

async function initializeHandLandmarker() {
  // Use local WASM files
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

  console.log('[LazyScroll] HandLandmarker initialized');
}

async function startCamera() {
  video = document.getElementById('video');
  canvas = document.getElementById('canvas');
  ctx = canvas.getContext('2d');

  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { width: 640, height: 480, facingMode: 'user' }
    });

    video.srcObject = stream;
    await video.play();

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;

    console.log('[LazyScroll] Camera started');
    isRunning = true;
    detectHands();
  } catch (error) {
    console.error('[LazyScroll] Camera error:', error);
    chrome.runtime.sendMessage({ type: 'CAMERA_ERROR', error: error.message });
  }
}

function stopCamera() {
  isRunning = false;
  if (video && video.srcObject) {
    video.srcObject.getTracks().forEach(track => track.stop());
    video.srcObject = null;
  }
  console.log('[LazyScroll] Camera stopped');
}

async function detectHands() {
  if (!isRunning || !handLandmarker || !video) return;

  const startTimeMs = performance.now();
  const results = handLandmarker.detectForVideo(video, startTimeMs);

  // Draw to canvas for preview
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(video, 0, 0);

  let scrollData = null;

  if (results.landmarks && results.landmarks.length > 0) {
    const landmarks = results.landmarks[0];
    const indexFingerTip = landmarks[INDEX_FINGER_TIP];

    // Draw landmarks on canvas
    drawLandmarks(landmarks);

    // Calculate scroll direction and speed
    scrollData = calculateScroll(indexFingerTip.y);

    // Send frame data with landmarks for preview
    sendFrameData(landmarks);
  }

  // Send scroll command if needed
  if (scrollData) {
    chrome.runtime.sendMessage({
      type: 'SCROLL_COMMAND',
      direction: scrollData.direction,
      speed: scrollData.speed
    });
  }

  // Continue detection loop
  requestAnimationFrame(detectHands);
}

function drawLandmarks(landmarks) {
  // Draw connections
  const connections = [
    [0, 1], [1, 2], [2, 3], [3, 4],     // Thumb
    [0, 5], [5, 6], [6, 7], [7, 8],     // Index
    [0, 9], [9, 10], [10, 11], [11, 12], // Middle
    [0, 13], [13, 14], [14, 15], [15, 16], // Ring
    [0, 17], [17, 18], [18, 19], [19, 20], // Pinky
    [5, 9], [9, 13], [13, 17]           // Palm
  ];

  ctx.strokeStyle = '#00FF00';
  ctx.lineWidth = 2;

  connections.forEach(([start, end]) => {
    ctx.beginPath();
    ctx.moveTo(landmarks[start].x * canvas.width, landmarks[start].y * canvas.height);
    ctx.lineTo(landmarks[end].x * canvas.width, landmarks[end].y * canvas.height);
    ctx.stroke();
  });

  // Draw points
  ctx.fillStyle = '#FF0000';
  landmarks.forEach((point, index) => {
    ctx.beginPath();
    ctx.arc(point.x * canvas.width, point.y * canvas.height, index === INDEX_FINGER_TIP ? 8 : 4, 0, 2 * Math.PI);
    ctx.fill();
  });
}

function calculateScroll(fingerY) {
  // fingerY is normalized 0-1 (top to bottom)
  if (fingerY < SCROLL_UP_THRESHOLD) {
    // Scroll up - finger in top 1/3
    const distance = SCROLL_UP_THRESHOLD - fingerY;
    const speed = Math.round(distance * BASE_SCROLL_SPEED * sensitivity * 10);
    return { direction: 'up', speed: Math.max(1, speed) };
  } else if (fingerY > SCROLL_DOWN_THRESHOLD) {
    // Scroll down - finger in bottom 1/3
    const distance = fingerY - SCROLL_DOWN_THRESHOLD;
    const speed = Math.round(distance * BASE_SCROLL_SPEED * sensitivity * 10);
    return { direction: 'down', speed: Math.max(1, speed) };
  }

  // Dead zone - no scroll
  return null;
}

function sendFrameData(landmarks) {
  // Convert canvas to data URL for preview
  const frameDataUrl = canvas.toDataURL('image/jpeg', 0.5);

  chrome.runtime.sendMessage({
    type: 'FRAME_DATA',
    frame: frameDataUrl,
    landmarks: landmarks.map(l => ({ x: l.x, y: l.y }))
  });
}

// Listen for messages from background
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  switch (message.type) {
    case 'START_TRACKING':
      sensitivity = message.sensitivity || 1.0;
      if (!handLandmarker) {
        initializeHandLandmarker().then(() => startCamera());
      } else {
        startCamera();
      }
      sendResponse({ success: true });
      break;

    case 'STOP_TRACKING':
      stopCamera();
      sendResponse({ success: true });
      break;

    case 'UPDATE_SENSITIVITY':
      sensitivity = message.sensitivity;
      sendResponse({ success: true });
      break;
  }
  return true;
});

// Initialize on load
console.log('[LazyScroll] Offscreen document loaded');
