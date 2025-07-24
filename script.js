const REQUEST_ACCESS_ID = 1;
const QUERY_HEADSET_ID = 2;
const CONTROL_DEVICE_ID = 3;
const AUTHORISE_ID = 4;
const CREATE_SESSION_ID = 5;
const SUB_REQUEST_ID = 6;
const WARNING_CODE_HEADSET_DISCOVERY_COMPLETE = 142;

class Headset {
  /**
   * @param {{clientID: string, clientSecret: string}} user
   * @param {string} socketURL
   */
  constructor(user, socketURL, streams) {
    this.user = user;
    this.socketURL = socketURL;
    this.streams = streams;
    this.socket = undefined;
    this.connected = false;
    this.handlers = new Map();
    this.sessionID = undefined;
    this.authToken = undefined;
    this.headsetID = undefined;
    this.commandHandler = undefined;
  }

  /**
   * @param {number} id
   * @param {string} method
   * @param {object} params
   */
  request(id, method, params) {
    const payload = {
      jsonrpc: "2.0",
      id: id,
      method: method,
      params: params,
    };
    this.socket.send(JSON.stringify(payload));
  }

  /**
   * @param {(command: string, intensity: number) => void} handler
   */
  handleCommand(handler) {
    this.commandHandler = handler;
  }

  /**
   * @param {string} id
   * @param {(data: any) => void} handler
   */
  addHandler(id, handler) {
    this.handlers.set(id, handler);
  }

  /**
   * @param {string} id
   */
  removeHandler(id) {
    this.handlers.delete(id);
  }

  /**
   * @param {string[]} streams
   */
  subscribe(streams) {
    const params = {
      cortexToken: this.authToken,
      session: this.sessionID,
      streams: streams,
    };
    this.request(SUB_REQUEST_ID, "subscribe", params);
  }

  createSession() {
    this.addHandler(CREATE_SESSION_ID, (data) => {
      this.sessionID = data["result"]["id"];
      console.log("session id", this.sessionID);
      this.subscribe(this.streams);
    });
    const params = {
      cortexToken: this.authToken,
      headset: this.headsetID,
      status: "active",
    };
    this.request(CREATE_SESSION_ID, "createSession", params);
  }

  authorise() {
    this.addHandler(AUTHORISE_ID, (data) => {
      this.authToken = data["result"]["cortexToken"];
      console.log("auth token", this.authToken);
      this.createSession();
    });
    const params = {
      clientId: this.user.clientID,
      clientSecret: this.user.clientSecret,
      license: user.license,
      debit: user.debit,
    };
    this.request(AUTHORISE_ID, "authorize", params);
  }

  controlDevice() {
    this.addHandler(CONTROL_DEVICE_ID, (_) => {
      console.log("connected");
      this.authorise();
    });
    const params = { command: "connect", headset: this.headsetID };
    this.request(CONTROL_DEVICE_ID, "controlDevice", params);
  }

  getCredentials() {
    this.addHandler(QUERY_HEADSET_ID, (data) => {
      if (data["result"].length > 0) {
        const headset = data["result"][0];
        if (headset["status"] == "connected") {
          this.connected = true;
        }
        this.headsetID = headset["id"];
        console.log("headset id", this.headsetID);
        this.controlDevice();
      } else {
        this.connected = false;
        console.error("no headset connected");
      }
    });

    this.request(QUERY_HEADSET_ID, "queryHeadsets", {});
    // const query_headset = () =>
    //   this.request(QUERY_HEADSET_ID, "queryHeadsets", {});
    // query_headset();
    // setInterval(query_headset, 60_000);
  }

  /**
   * @param {string[]} streams
   */
  authenticate() {
    this.addHandler(REQUEST_ACCESS_ID, (_) => {
      this.getCredentials();
    });
    const params = {
      clientId: this.user.clientID,
      clientSecret: this.user.clientSecret,
    };
    this.request(REQUEST_ACCESS_ID, "requestAccess", params);
  }

  connect() {
    this.socket = new WebSocket(this.socketURL);
    this.socket.addEventListener("message", ({ data }) => {
      const message = JSON.parse(data);
      if (message.warning) {
        console.warn("warning:", message.warning.code, message.warning.message);
        // if (message.warning.code == WARNING_CODE_HEADSET_DISCOVERY_COMPLETE) {
        //   this.refreshHeadsetList();
        // }
      } else if (message.error) {
        console.error(
          "error:",
          message.error.code,
          message.error.message,
          message.error.data,
        );
      } else {
        console.debug("received message:", message);
        const message_id = message["id"];
        // handle command
        if (message_id == undefined) {
          if (this.commandHandler != undefined) {
            const command = message["com"][0];
            const intensity = message["com"][1];
            this.commandHandler(command, intensity);
          }
        } else if (this.handlers.has(message_id)) {
          const handler = this.handlers.get(message_id);
          handler(message);
        }
      }
    });
    this.socket.addEventListener("open", () => {
      this.authenticate();
    });
  }
}

let canvas = document.getElementById("canvas");
let ctx = canvas.getContext("2d");
let isDrawing = false;
let isErasing = false;
let lastX = 0;
let lastY = 0;
let eyeX = 0;
let eyeY = 0;
let scalingFactor = 2.0; // Adjust this to control movement sensitivity
let currentColor = '#000000';

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
window.addEventListener("resize", resizeCanvas);

// MediaPipe Face Mesh setup
const video = document.getElementById("input-video");
const outputCanvas = document.getElementById("output-canvas");
const outputCtx = outputCanvas.getContext("2d");

const faceMesh = new FaceMesh({
  locateFile: (file) => {
    return `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/${file}`;
  },
});

faceMesh.setOptions({
  maxNumFaces: 1,
  refineLandmarks: true,
  minDetectionConfidence: 0.5,
  minTrackingConfidence: 0.5,
});

faceMesh.onResults(onResults);

// Camera setup
const camera = new Camera(video, {
  onFrame: async () => {
    await faceMesh.send({ image: video });
  },
  width: 320,
  height: 240,
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
          ctx.strokeStyle = currentColor; // Use selected color
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
  document.getElementById("status").textContent = "Status: Drawing";
});

document.getElementById("stopBtn").addEventListener("click", () => {
  isDrawing = false;
  document.getElementById("status").textContent = "Status: Stopped";
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

// Color button functionality
const colorButtons = document.querySelectorAll('.color-btn');

// Set initial active color (black)
document.getElementById('blackColor').classList.add('active');

colorButtons.forEach(button => {
  button.addEventListener('click', () => {
    // Remove active class from all buttons
    colorButtons.forEach(btn => btn.classList.remove('active'));
    
    // Add active class to clicked button
    button.classList.add('active');
    
    // Set the current color
    currentColor = button.dataset.color;
    document.getElementById('status').textContent = `Status: Color changed to ${button.textContent}`;
  });
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
    document.getElementById("status").textContent = "Status: Drawing";
  } else if (e.key === "x") {
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
  } else if (e.key === '1') {
    // Select Red
    colorButtons.forEach(btn => btn.classList.remove('active'));
    document.getElementById('redColor').classList.add('active');
    currentColor = '#ff0000';
    document.getElementById('status').textContent = 'Status: Color changed to Red';
  } else if (e.key === '2') {
    // Select Green
    colorButtons.forEach(btn => btn.classList.remove('active'));
    document.getElementById('greenColor').classList.add('active');
    currentColor = '#00ff00';
    document.getElementById('status').textContent = 'Status: Color changed to Green';
  } else if (e.key === '3') {
    // Select Blue
    colorButtons.forEach(btn => btn.classList.remove('active'));
    document.getElementById('blueColor').classList.add('active');
    currentColor = '#0000ff';
    document.getElementById('status').textContent = 'Status: Color changed to Blue';
  } else if (e.key === '4') {
    // Select Black
    colorButtons.forEach(btn => btn.classList.remove('active'));
    document.getElementById('blackColor').classList.add('active');
    currentColor = '#000000';
    document.getElementById('status').textContent = 'Status: Color changed to Black';
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

const user = {
  clientID: "",
  clientSecret: "",
};
const socketURL = "wss://localhost:6868";
const streams = ["com"];

const headset = new Headset(user, socketURL, streams);
headset.handleCommand((command, intensity) => {
  if (intensity <= 0.5) {
    return;
  }
  switch (command) {
    case "push":
      
      isDrawing = true;
      document.getElementById("status").textContent = "Status: Drawing";
      break;
    case "pull":
      isDrawing = false;
      document.getElementById("status").textContent = "Status: Stopped";
      break;
    case "lift":
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      document.getElementById("status").textContent = "Status: Canvas Cleared";
      break;
  }
});
headset.connect();
