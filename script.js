let canvas = document.getElementById('canvas');
let ctx = canvas.getContext('2d');
let isDrawing = false;
let lastX = 0;
let lastY = 0;
let eyeX = 0;
let eyeY = 0;

// Set canvas size
function resizeCanvas() {
  canvas.width = window.innerWidth - 320;
  canvas.height = window.innerHeight;
}
resizeCanvas();
window.addEventListener('resize', resizeCanvas);

// MediaPipe Face Mesh setup
const video = document.getElementById('input-video');
const outputCanvas = document.getElementById('output-canvas');
const outputCtx = outputCanvas.getContext('2d');

const faceMesh = new FaceMesh({
  locateFile: (file) => {
    return `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/${file}`;
  }
});

faceMesh.setOptions({
  maxNumFaces: 1,
  refineLandmarks: true,
  minDetectionConfidence: 0.5,
  minTrackingConfidence: 0.5
});

faceMesh.onResults(onResults);

// Camera setup
const camera = new Camera(video, {
  onFrame: async () => {
    await faceMesh.send({image: video});
  },
  width: 320,
  height: 240
});
camera.start();

function onResults(results) {
  if (results.multiFaceLandmarks) {
    for (const landmarks of results.multiFaceLandmarks) {
      // Get eye landmarks (indices 33 and 133 for left and right eye centers)
      const leftEye = landmarks[33];
      const rightEye = landmarks[133];
      
      // Calculate average eye position
      eyeX = (leftEye.x + rightEye.x) / 2;
      eyeY = (leftEye.y + rightEye.y) / 2;
      
      // Convert eye position to canvas coordinates and mirror the X coordinate
      const canvasX = ((1 - eyeX) * canvas.width);
      const canvasY = eyeY * canvas.height;
      
      if (isDrawing) {
        ctx.beginPath();
        ctx.moveTo(lastX, lastY);
        ctx.lineTo(canvasX, canvasY);
        ctx.stroke();
      }
      
      lastX = canvasX;
      lastY = canvasY;
    }
  }
}

// Drawing controls
document.getElementById('startBtn').addEventListener('click', () => {
  isDrawing = true;
  document.getElementById('status').textContent = 'Status: Drawing';
});

document.getElementById('stopBtn').addEventListener('click', () => {
  isDrawing = false;
  document.getElementById('status').textContent = 'Status: Stopped';
});

document.getElementById('clearBtn').addEventListener('click', () => {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  document.getElementById('status').textContent = 'Status: Canvas Cleared';
});

// Keyboard shortcuts
document.addEventListener('keydown', (e) => {
  if (e.key === 's') {
    isDrawing = true;
    document.getElementById('status').textContent = 'Status: Drawing';
  } else if (e.key === 'x') {
    isDrawing = false;
    document.getElementById('status').textContent = 'Status: Stopped';
  } else if (e.key === 'c') {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    document.getElementById('status').textContent = 'Status: Canvas Cleared';
  }
});
