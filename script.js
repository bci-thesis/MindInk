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
      const canvasX = (1 - eyeX) * canvas.width;
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
document.getElementById("startBtn").addEventListener("click", () => {
  isDrawing = true;
  document.getElementById("status").textContent = "Status: Drawing";
});

document.getElementById("stopBtn").addEventListener("click", () => {
  isDrawing = false;
  document.getElementById("status").textContent = "Status: Stopped";
});

document.getElementById("clearBtn").addEventListener("click", () => {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  document.getElementById("status").textContent = "Status: Canvas Cleared";
});

// Keyboard shortcuts
document.addEventListener("keydown", (e) => {
  if (e.key === "s") {
    isDrawing = true;
    document.getElementById("status").textContent = "Status: Drawing";
  } else if (e.key === "x") {
    isDrawing = false;
    document.getElementById("status").textContent = "Status: Stopped";
  } else if (e.key === "c") {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    document.getElementById("status").textContent = "Status: Canvas Cleared";
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
