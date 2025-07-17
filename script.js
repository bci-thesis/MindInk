let canvas = document.getElementById('canvas');
let ctx = canvas.getContext('2d');
let isDrawing = false;
let isErasing = false;
let lastX = 0;
let lastY = 0;
let eyeX = 0;
let eyeY = 0;
let scalingFactor = 2.0; // Adjust this to control movement sensitivity

// Undo/Redo functionality
let undoStack = [];
let redoStack = [];

function saveCanvasState() {
  redoStack = []; // Clear redo stack when new action is taken
  undoStack.push(canvas.toDataURL());
  // Limit undo stack to 20 states to prevent memory issues
  if (undoStack.length > 20) {
    undoStack.shift();
  }
}

function undo() {
  if (undoStack.length > 0) {
    redoStack.push(canvas.toDataURL());
    const previousState = undoStack.pop();
    restoreCanvasState(previousState);
  }
}

function redo() {
  if (redoStack.length > 0) {
    undoStack.push(canvas.toDataURL());
    const nextState = redoStack.pop();
    restoreCanvasState(nextState);
  }
}

function restoreCanvasState(dataURL) {
  const img = new Image();
  img.onload = function() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0);
  };
  img.src = dataURL;
}

let lastCursorX = 0;
let lastCursorY = 0;

// Create cursor element
const cursor = document.createElement('div');
cursor.style.width = '10px';
cursor.style.height = '10px';
cursor.style.backgroundColor = 'red';
cursor.style.borderRadius = '50%';
cursor.style.position = 'fixed';
cursor.style.pointerEvents = 'none';
cursor.style.zIndex = '1000';
document.body.appendChild(cursor);

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
      // Apply scaling factor to amplify movement from the center
      const centerX = canvas.width / 2;
      const centerY = canvas.height / 2;
      const offsetX = (eyeX - 0.5) * scalingFactor;
      const offsetY = (eyeY - 0.5) * scalingFactor;
      const canvasX = centerX - (offsetX * canvas.width);
      const canvasY = centerY + (offsetY * canvas.height);
      
      if (isDrawing) {
        ctx.beginPath();
        ctx.moveTo(lastX, lastY);
        ctx.lineTo(canvasX, canvasY);
        
        // Set composite operation and line width based on mode
        if (isErasing) {
          ctx.globalCompositeOperation = 'destination-out';
          ctx.lineWidth = 30; // Bigger eraser
        } else {
          ctx.globalCompositeOperation = 'source-over';
          ctx.lineWidth = 2; // Normal drawing
        }
        
        ctx.stroke();
      }
      
      // Update cursor position
      cursor.style.left = (canvas.offsetLeft + canvasX - 5) + 'px';
      cursor.style.top = (canvas.offsetTop + canvasY - 5) + 'px';
      
      lastX = canvasX;
      lastY = canvasY;
    }
  }
}

// Drawing controls
document.getElementById('startBtn').addEventListener('click', () => {
  if (!isDrawing) {
    saveCanvasState(); // Save state before starting to draw
  }
  isDrawing = true;
  document.getElementById('status').textContent = 'Status: Drawing';
});

document.getElementById('stopBtn').addEventListener('click', () => {
  isDrawing = false;
  document.getElementById('status').textContent = 'Status: Stopped';
});

document.getElementById('clearBtn').addEventListener('click', () => {
  saveCanvasState(); // Save state before clearing
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  document.getElementById('status').textContent = 'Status: Canvas Cleared';
});

document.getElementById('eraserBtn').addEventListener('click', () => {
  isErasing = !isErasing;
  document.getElementById('status').textContent = `Status: ${isErasing ? 'Eraser' : 'Draw'} Mode`;
});

document.getElementById('undoBtn').addEventListener('click', () => {
  undo();
  document.getElementById('status').textContent = 'Status: Undo';
});

document.getElementById('redoBtn').addEventListener('click', () => {
  redo();
  document.getElementById('status').textContent = 'Status: Redo';
});

// Keyboard shortcuts
document.addEventListener('keydown', (e) => {
  if (e.key === 's') {
    if (!isDrawing) {
      saveCanvasState(); // Save state before starting to draw
    }
    isDrawing = true;
    document.getElementById('status').textContent = 'Status: Drawing';
  } else if (e.key === 'x') {
    isDrawing = false;
    document.getElementById('status').textContent = 'Status: Stopped';
  } else if (e.key === 'c') {
    saveCanvasState(); // Save state before clearing
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    document.getElementById('status').textContent = 'Status: Canvas Cleared';
  } else if (e.key === 'e') {
    isErasing = !isErasing;
    document.getElementById('status').textContent = `Status: ${isErasing ? 'Eraser' : 'Draw'} Mode`;
  } else if (e.key === 'z') {
    undo();
    document.getElementById('status').textContent = 'Status: Undo';
  } else if (e.key === 'y') {
    redo();
    document.getElementById('status').textContent = 'Status: Redo';
  } else if (e.key === 'ArrowUp') {
    scalingFactor += 0.5;
    document.getElementById('status').textContent = `Status: Sensitivity ${scalingFactor.toFixed(1)}x`;
  } else if (e.key === 'ArrowDown') {
    if (scalingFactor > 0.5) {
      scalingFactor -= 0.5;
      document.getElementById('status').textContent = `Status: Sensitivity ${scalingFactor.toFixed(1)}x`;
    }
  }
});
