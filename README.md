# LazyScroll

Hands-free scrolling for your browser using hand gestures and face detection.

![LazyScroll Demo](demo.gif)

Youtube: https://youtu.be/EFr2aEvXHJ8

## What is LazyScroll?

LazyScroll is a Chrome extension that lets you scroll any webpage without touching your keyboard or mouse. Point your index finger above your lips to scroll up, below to scroll down. Simple as that.

## Why?

- **Accessibility** — For users who have difficulty using traditional input devices
- **Convenience** — Scroll while eating, cooking, or when your hands are busy
- **Just because** — Sometimes the laziest solution is the best solution

## How to Use

1. Install the extension and click the icon to open the sidebar
2. Click **Enable Gestures** and allow camera access
3. Point your index finger:
   - **Above your lips** → Scroll up
   - **Below your lips** → Scroll down
   - **Near lip level** → Pause scrolling

## Under the Hood

LazyScroll uses [MediaPipe](https://developers.google.com/mediapipe) for real-time detection:

- **Hand Landmarker** — Detects 21 hand landmarks to track your index finger position
- **Face Landmarker** — Detects 478 face landmarks, using lip center (landmark #13) as the scroll anchor
- **Pointing Detection** — Checks if index finger is extended by comparing joint distances
- **Lip-Relative Scrolling** — Calculates vertical gap between fingertip and lip center to determine scroll direction and activation

The extension runs detection in the sidebar panel and sends scroll commands to the active tab via Chrome's messaging API. For PDFs and restricted pages, it falls back to simulated keyboard events using the Chrome Debugger API.

## Installation

```bash
git clone https://github.com/vibecare-io/lazyscroll.git
cd lazyscroll
bun install
```

Then load in Chrome:
1. Go to `chrome://extensions`
2. Enable **Developer mode**
3. Click **Load unpacked** and select the `lazyscroll` directory

## License

MIT
