const REQUEST_ACCESS_ID = 1;
const QUERY_HEADSET_ID = 2;
const CONTROL_DEVICE_ID = 3;
const AUTHORISE_ID = 4;
const CREATE_SESSION_ID = 5;
const SUB_REQUEST_ID = 6;
const WARNING_CODE_HEADSET_DISCOVERY_COMPLETE = 142;

const COLOR_BLACK = "#000000";
const COLOR_RED = "#ff0000";
const COLOR_GREEN = "#00ff00";
const COLOR_CURSOR = "red";
const COLOR_ERASE = "rgba(0,0,0,1)";

class KalmanFilter {
  /**
   * @param {number} processNoise - Process noise covariance
   * @param {number} measurementNoise - Measurement noise covariance
   * @param {number} initialState - Initial state estimate
   */
  constructor(processNoise = 0.01, measurementNoise = 0.1, initialState = 0) {
    this.processNoise = processNoise;
    this.measurementNoise = measurementNoise;
    this.state = initialState;
    this.uncertainty = 1.0;
  }

  /**
   * @param {number} measurement - New measurement
   * @returns {number} - Filtered/smoothed value
   */
  update(measurement) {
    // Prediction step
    const predictedUncertainty = this.uncertainty + this.processNoise;

    // Update step
    const kalmanGain =
      predictedUncertainty / (predictedUncertainty + this.measurementNoise);
    this.state = this.state + kalmanGain * (measurement - this.state);
    this.uncertainty = (1 - kalmanGain) * predictedUncertainty;

    return this.state;
  }

  /**
   * Reset the filter to initial state
   */
  reset() {
    this.state = 0;
    this.uncertainty = 1.0;
  }
}

class CredentialManager {
  constructor() {
    this.storageKey = "cortex_credentials";
  }

  /**
   * @returns {{clientID: string, clientSecret: string} | null}
   */
  getCredentials() {
    const stored = localStorage.getItem(this.storageKey);
    if (stored) {
      try {
        return JSON.parse(stored);
      } catch (e) {
        console.error("Failed to parse stored credentials:", e);
        return null;
      }
    }
    return null;
  }

  /**
   * @param {string} clientID
   * @param {string} clientSecret
   */
  saveCredentials(clientID, clientSecret) {
    const credentials = { clientID, clientSecret };
    localStorage.setItem(this.storageKey, JSON.stringify(credentials));
  }

  clearCredentials() {
    localStorage.removeItem(this.storageKey);
  }

  hasCredentials() {
    return this.getCredentials() !== null;
  }
}

class LoginManager {
  /**
   * @param {CredentialManager} credentialManager
   * @param {() => void} onLoginSuccess
   */
  constructor(credentialManager, onLoginSuccess) {
    this.credentialManager = credentialManager;
    this.onLoginSuccess = onLoginSuccess;
    this.loginOverlay = document.getElementById("login-overlay");
    this.loginForm = document.getElementById("login-form");
    this.clearCredentialsBtn = document.getElementById("clear-credentials");

    this.setupEventListeners();
    this.checkCredentials();
  }

  setupEventListeners() {
    this.loginForm.addEventListener("submit", (e) => {
      e.preventDefault();
      this.handleLogin();
    });

    this.clearCredentialsBtn.addEventListener("click", () => {
      this.credentialManager.clearCredentials();
      this.showLoginForm();
    });
  }

  checkCredentials() {
    if (this.credentialManager.hasCredentials()) {
      this.hideLoginForm();
      this.onLoginSuccess();
    } else {
      this.showLoginForm();
    }
  }

  handleLogin() {
    const clientID = document.getElementById("client-id").value.trim();
    const clientSecret = document.getElementById("client-secret").value.trim();

    if (!clientID || !clientSecret) {
      alert("Please enter both Client ID and Client Secret");
      return;
    }

    this.credentialManager.saveCredentials(clientID, clientSecret);
    this.hideLoginForm();
    this.onLoginSuccess();
  }

  showLoginForm() {
    this.loginOverlay.classList.remove("hidden");
  }

  hideLoginForm() {
    this.loginOverlay.classList.add("hidden");
  }

  reinitialize() {
    this.checkCredentials();
  }
}

class Headset {
  /**
   * @param {{clientID: string, clientSecret: string}} user
   * @param {string} socketURL
   * @param {string[]} streams
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
    this.request(SUB_REQUEST_ID, "subscribe", streams);
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

class CanvasDrawing {
  /**
   * @param {string} canvasId
   */
  constructor(canvasId) {
    this.canvas = document.getElementById(canvasId);
    this.ctx = this.canvas.getContext("2d");
    this.isDrawing = false;
    this.isErasing = false;
    this.lastX = 0;
    this.lastY = 0;
    this.currentColor = COLOR_BLACK;
    this.undoStack = [];
    this.redoStack = [];
    this.cursor = this.createCursor();

    this.resizeCanvas();
    this.setupEventListeners();
  }

  /**
   * @returns {HTMLDivElement}
   */
  createCursor() {
    const cursor = document.createElement("div");
    cursor.style.width = "10px";
    cursor.style.height = "10px";
    cursor.style.backgroundColor = COLOR_CURSOR;
    cursor.style.borderRadius = "50%";
    cursor.style.position = "fixed";
    cursor.style.pointerEvents = "none";
    cursor.style.zIndex = "1000";
    document.body.appendChild(cursor);
    return cursor;
  }

  resizeCanvas() {
    this.canvas.width = window.innerWidth - 320;
    this.canvas.height = window.innerHeight;
  }

  saveCanvasState() {
    this.redoStack = [];
    this.undoStack.push(this.canvas.toDataURL());
    if (this.undoStack.length > 20) {
      this.undoStack.shift();
    }
  }

  undo() {
    if (this.undoStack.length > 0) {
      this.redoStack.push(this.canvas.toDataURL());
      const previousState = this.undoStack.pop();
      this.restoreCanvasState(previousState);
    }
  }

  redo() {
    if (this.redoStack.length > 0) {
      this.undoStack.push(this.canvas.toDataURL());
      const nextState = this.redoStack.pop();
      this.restoreCanvasState(nextState);
    }
  }

  /**
   * @param {string} dataURL
   */
  restoreCanvasState(dataURL) {
    const img = new Image();
    img.onload = () => {
      this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
      this.ctx.drawImage(img, 0, 0);
    };
    img.src = dataURL;
  }

  /**
   * @param {number} x
   * @param {number} y
   */
  draw(x, y) {
    if (this.isDrawing) {
      this.ctx.beginPath();
      this.ctx.moveTo(this.lastX, this.lastY);
      this.ctx.lineTo(x, y);

      if (this.isErasing) {
        this.ctx.globalCompositeOperation = "destination-out";
        this.ctx.lineWidth = 30;
        this.ctx.strokeStyle = COLOR_ERASE;
      } else {
        this.ctx.globalCompositeOperation = "source-over";
        this.ctx.lineWidth = 2;
        this.ctx.strokeStyle = this.currentColor;
      }

      this.ctx.stroke();
    }

    this.updateCursor(x, y);
    this.lastX = x;
    this.lastY = y;
  }

  /**
   * @param {number} x
   * @param {number} y
   */
  updateCursor(x, y) {
    this.cursor.style.left = this.canvas.offsetLeft + x - 5 + "px";
    this.cursor.style.top = this.canvas.offsetTop + y - 5 + "px";
  }

  startDrawing() {
    if (!this.isDrawing) {
      this.saveCanvasState();
    }
    this.isDrawing = true;
    this.updateStatus("Drawing");
  }

  stopDrawing() {
    this.isDrawing = false;
    this.updateStatus("Stopped");
  }

  toggleEraser() {
    this.isErasing = !this.isErasing;
    if (this.isErasing) {
      if (!this.isDrawing) {
        this.saveCanvasState();
      }
      this.isDrawing = true;
      this.updateStatus("Erasing");
    } else {
      this.isDrawing = false;
      this.updateStatus("Stopped");
    }
  }

  clearCanvas() {
    this.saveCanvasState();
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    this.updateStatus("Canvas Cleared");
  }

  /**
   * @param {string} color
   */
  setColor(color) {
    this.currentColor = color;
    this.updateStatus(`Color changed to ${color}`);
  }

  /**
   * @param {string} message
   */
  updateStatus(message) {
    document.getElementById("status").textContent = `Status: ${message}`;
  }

  setupEventListeners() {
    window.addEventListener("resize", () => this.resizeCanvas());
  }
}

class FaceTracker {
  /**
   * @param {string} videoId
   * @param {string} outputCanvasId
   * @param {CanvasDrawing} drawingCanvas
   */
  constructor(videoId, outputCanvasId, drawingCanvas) {
    this.video = document.getElementById(videoId);
    this.outputCanvas = document.getElementById(outputCanvasId);
    this.outputCtx = this.outputCanvas.getContext("2d");
    this.drawingCanvas = drawingCanvas;
    this.scalingFactor = 2.0;
    this.eyeX = 0;
    this.eyeY = 0;
    this.kalmanFilterX = new KalmanFilter();
    this.kalmanFilterY = new KalmanFilter();

    this.setupFaceMesh();
    this.setupCamera();
  }

  setupFaceMesh() {
    this.faceMesh = new FaceMesh({
      locateFile: (file) => {
        return `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/${file}`;
      },
    });

    this.faceMesh.setOptions({
      maxNumFaces: 1,
      refineLandmarks: true,
      minDetectionConfidence: 0.5,
      minTrackingConfidence: 0.5,
    });

    this.faceMesh.onResults((results) => this.onResults(results));
  }

  setupCamera() {
    this.camera = new Camera(this.video, {
      onFrame: async () => {
        await this.faceMesh.send({ image: this.video });
      },
      width: 320,
      height: 240,
    });
    this.camera.start();
  }

  /**
   * @param {any} results
   */
  onResults(results) {
    if (results.multiFaceLandmarks && results.multiFaceLandmarks.length > 0) {
      for (const landmarks of results.multiFaceLandmarks) {
        const leftEye = landmarks[33];
        const rightEye = landmarks[133];

        // Calculate average eye position
        const rawEyeX = (leftEye.x + rightEye.x) / 2;
        const rawEyeY = (leftEye.y + rightEye.y) / 2;

        // Apply Kalman filtering to smooth the position
        this.eyeX = this.kalmanFilterX.update(rawEyeX);
        this.eyeY = this.kalmanFilterY.update(rawEyeY);

        const centerX = this.drawingCanvas.canvas.width / 2;
        const centerY = this.drawingCanvas.canvas.height / 2;
        const offsetX = (this.eyeX - 0.5) * this.scalingFactor;
        const offsetY = (this.eyeY - 0.5) * this.scalingFactor;
        const canvasX = centerX - offsetX * this.drawingCanvas.canvas.width;
        const canvasY = centerY + offsetY * this.drawingCanvas.canvas.height;

        this.drawingCanvas.draw(canvasX, canvasY);
      }
    } else {
      // No face detected - could reset filters here if needed
      // this.resetFilters();
    }
  }

  /**
   * @param {number} factor
   */
  setScalingFactor(factor) {
    this.scalingFactor = factor;
  }

  /**
   * Reset the Kalman filters (useful when face tracking is lost and regained)
   */
  resetFilters() {
    this.kalmanFilterX.reset();
    this.kalmanFilterY.reset();
  }

  increaseSensitivity() {
    this.setScalingFactor(this.scalingFactor + 0.5);
  }

  decreaseSensitivity() {
    if (this.scalingFactor > 0.5) {
      this.setScalingFactor(this.scalingFactor - 0.5);
    }
  }
}

class KeybindManager {
  /**
   * @param {CanvasDrawing} drawingCanvas
   * @param {FaceTracker} faceTracker
   */
  constructor(drawingCanvas, faceTracker) {
    this.drawingCanvas = drawingCanvas;
    this.faceTracker = faceTracker;
    this.keybinds = new Map();
    this.setupKeybinds();
    this.setupEventListeners();
  }

  setupKeybinds() {
    this.keybinds.set("s", () => this.drawingCanvas.startDrawing());
    this.keybinds.set("x", () => this.drawingCanvas.stopDrawing());
    this.keybinds.set("e", () => this.drawingCanvas.toggleEraser());
    this.keybinds.set("c", () => this.drawingCanvas.clearCanvas());

    this.keybinds.set("z", () => this.drawingCanvas.undo());
    this.keybinds.set("y", () => this.drawingCanvas.redo());

    this.keybinds.set("1", () => this.setColor(COLOR_RED, "Red"));
    this.keybinds.set("2", () => this.setColor(COLOR_GREEN, "Green"));
    this.keybinds.set("4", () => this.setColor(COLOR_BLACK, "Black"));

    this.keybinds.set("ArrowUp", () => this.faceTracker.increaseSensitivity());
    this.keybinds.set("ArrowDown", () =>
      this.faceTracker.decreaseSensitivity(),
    );

    this.keybinds.set("Escape", () => {
      if (window.menuNavigator) {
        window.menuNavigator.clearSelection();
      }
    });
  }

  /**
   * @param {string} color
   * @param {string} name
   */
  setColor(color, name) {
    this.drawingCanvas.setColor(color);
    this.updateColorButton(color);
  }

  /**
   * @param {string} color
   */
  updateColorButton(color) {
    const colorButtons = document.querySelectorAll(".color-btn");
    colorButtons.forEach((btn) => btn.classList.remove("active"));

    const targetButton = document.querySelector(`[data-color="${color}"]`);
    if (targetButton) {
      targetButton.classList.add("active");
    }
  }

  setupEventListeners() {
    document.addEventListener("keydown", (e) => {
      const handler = this.keybinds.get(e.key);
      const modifierPressed = e.shiftKey || e.ctrlKey || e.altKey || e.metaKey;
      if (handler && !modifierPressed) {
        e.preventDefault();
        handler();
      }
    });

    document
      .getElementById("startBtn")
      .addEventListener("click", () => this.drawingCanvas.startDrawing());
    document
      .getElementById("stopBtn")
      .addEventListener("click", () => this.drawingCanvas.stopDrawing());
    document
      .getElementById("eraserBtn")
      .addEventListener("click", () => this.drawingCanvas.toggleEraser());
    document
      .getElementById("clearBtn")
      .addEventListener("click", () => this.drawingCanvas.clearCanvas());
    document
      .getElementById("undoBtn")
      .addEventListener("click", () => this.drawingCanvas.undo());
    document
      .getElementById("redoBtn")
      .addEventListener("click", () => this.drawingCanvas.redo());

    const colorButtons = document.querySelectorAll(".color-btn");
    document.getElementById("blackColor").classList.add("active");

    colorButtons.forEach((button) => {
      button.addEventListener("click", () => {
        const color = button.dataset.color;
        this.drawingCanvas.setColor(color);
        this.updateColorButton(color);
      });
    });
  }
}

class MenuNavigator {
  /**
   * @param {CanvasDrawing} drawingCanvas
   */
  constructor(drawingCanvas) {
    this.drawingCanvas = drawingCanvas;
    this.currentMenu = null;
    this.menuSections = [
      {
        id: "drawing-controls",
        title: "Drawing Controls",
        actions: [
          {
            name: "Start Drawing",
            action: () => this.drawingCanvas.startDrawing(),
          },
          {
            name: "Stop Drawing",
            action: () => this.drawingCanvas.stopDrawing(),
          },
          {
            name: "Toggle Eraser",
            action: () => this.drawingCanvas.toggleEraser(),
          },
        ],
      },
      {
        id: "edit-controls",
        title: "Edit Controls",
        actions: [
          { name: "Undo", action: () => this.drawingCanvas.undo() },
          { name: "Redo", action: () => this.drawingCanvas.redo() },
          {
            name: "Clear Canvas",
            action: () => this.drawingCanvas.clearCanvas(),
          },
        ],
      },
      {
        id: "color-controls",
        title: "Colours",
        actions: [
          { name: "Red", action: () => this.setColor(COLOR_RED, "Red") },
          { name: "Green", action: () => this.setColor(COLOR_GREEN, "Green") },
          { name: "Black", action: () => this.setColor(COLOR_BLACK, "Black") },
        ],
      },
    ];

    this.setupMenuElements();
  }

  setupMenuElements() {
    this.menuElements = document.querySelectorAll(".menu-section");

    this.menuElements.forEach((element) => {
      element.classList.remove("selected");
    });

    this.clearSelection();
  }

  /**
   * @param {string} color
   * @param {string} name
   */
  setColor(color, name) {
    this.drawingCanvas.setColor(color);
    this.updateColorButton(color);
    this.drawingCanvas.updateStatus(`Color changed to ${name}`);
  }

  /**
   * @param {string} color
   */
  updateColorButton(color) {
    const colorButtons = document.querySelectorAll(".color-btn");
    colorButtons.forEach((btn) => btn.classList.remove("active"));

    const targetButton = document.querySelector(`[data-color="${color}"]`);
    if (targetButton) {
      targetButton.classList.add("active");
    }
  }

  selectMenu(menuIndex) {
    this.menuElements.forEach((element) => {
      element.classList.remove("selected");
    });

    if (menuIndex >= 0 && menuIndex < this.menuElements.length) {
      this.currentMenu = menuIndex;
      this.menuElements[menuIndex].classList.add("selected");
      const menu = this.menuSections[menuIndex];
      const actions = menu.actions
        .map((action, index) => {
          const command = index === 0 ? "push" : index === 1 ? "pull" : "lift";
          return `${command}: ${action.name}`;
        })
        .join(" | ");
      this.drawingCanvas.updateStatus(
        `Headset: Selected ${menu.title} | ${actions}`,
      );
    }
  }

  executeAction(actionIndex) {
    if (
      this.currentMenu === null ||
      this.currentMenu >= this.menuSections.length
    ) {
      return;
    }

    const menu = this.menuSections[this.currentMenu];
    if (actionIndex >= 0 && actionIndex < menu.actions.length) {
      const action = menu.actions[actionIndex];
      action.action();
      this.drawingCanvas.updateStatus(
        `Headset: Executed ${action.name} from ${menu.title}`,
      );
    }
  }

  handleCommand(command) {
    if (this.currentMenu === null) {
      switch (command) {
        case "push":
          this.selectMenu(0);
          break;
        case "pull":
          this.selectMenu(1);
          break;
        case "lift":
          this.selectMenu(2);
          break;
      }
    } else {
      switch (command) {
        case "push":
          this.executeAction(0);
          break;
        case "pull":
          this.executeAction(1);
          break;
        case "lift":
          this.executeAction(2);
          break;
      }
    }
  }

  clearSelection() {
    this.currentMenu = null;
    this.menuElements.forEach((element) => {
      element.classList.remove("selected");
    });
  }
}

class HeadsetController {
  /**
   * @param {CanvasDrawing} drawingCanvas
   * @param {CredentialManager} credentialManager
   * @param {MenuNavigator} menuNavigator
   */
  constructor(drawingCanvas, credentialManager, menuNavigator) {
    this.drawingCanvas = drawingCanvas;
    this.credentialManager = credentialManager;
    this.menuNavigator = menuNavigator;
    this.socketURL = "wss://localhost:6868";
    this.streams = ["com"];
    this.headset = null;
    this.lastActionTime = 0;
    this.actionDelay = 1000;
  }

  initialize() {
    const credentials = this.credentialManager.getCredentials();
    if (!credentials) {
      console.error("No credentials available");
      return;
    }

    this.user = credentials;
    this.headset = new Headset(this.user, this.socketURL, this.streams);
    this.setupCommandHandler();
    this.headset.connect();
  }

  setupCommandHandler() {
    if (!this.headset) {
      console.error("Headset not initialized");
      return;
    }

    this.headset.handleCommand((command, intensity) => {
      if (intensity <= 0.5) {
        return;
      }

      const currentTime = Date.now();
      if (currentTime - this.lastActionTime < this.actionDelay) {
        console.log(`too soon since last action`);
        return;
      }

      this.lastActionTime = currentTime;
      this.menuNavigator.handleCommand(command);
      console.log(`Headset: ${command} command executed`);
    });
  }
}

class TemplateManager {
  /**
   * @param {HTMLCanvasElement} canvas
   * @param {CanvasRenderingContext2D} ctx
   * @param {string} defaultTemplate
   */
  constructor(canvas, ctx, defaultTemplate = "rectangle") {
    this.canvas = canvas;
    this.ctx = ctx;
    this.currentTemplate = defaultTemplate;
    this.templateButtons = Array.from(
      document.querySelectorAll(".template-btn"),
    );
    this.setupTemplateButtons();
    this.updateActiveButton();
    this.drawCurrentTemplate();
  }

  setupTemplateButtons() {
    this.templateButtons.forEach((btn) => {
      btn.addEventListener("click", () => {
        const template = btn.dataset.template;
        this.setCurrentTemplate(template);
      });
    });
  }

  setCurrentTemplate(template) {
    if (this.currentTemplate !== template) {
      this.currentTemplate = template;
      this.updateActiveButton();
      this.drawCurrentTemplate();
    }
  }

  updateActiveButton() {
    this.templateButtons.forEach((btn) => {
      btn.classList.toggle(
        "active",
        btn.dataset.template === this.currentTemplate,
      );
    });
  }

  drawCurrentTemplate() {
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    switch (this.currentTemplate) {
      case "star":
        this.drawStarOutline();
        break;
      case "rectangle":
        this.drawRectangleOutline();
        break;
      case "circle":
        this.drawCircleOutline();
        break;
      case "parallelogram":
        this.drawParallelogramOutline();
        break;
    }
  }

  drawStarOutline() {
    const { canvas, ctx } = this;
    const centerX = canvas.width / 2;
    const centerY = canvas.height / 2;
    const outerRadius = Math.min(canvas.width, canvas.height) * 0.25;
    const innerRadius = outerRadius * 0.4;
    const spikes = 5;
    ctx.save();
    ctx.strokeStyle = "#ddd";
    ctx.lineWidth = 3;
    ctx.setLineDash([10, 5]);
    ctx.beginPath();
    for (let i = 0; i < spikes * 2; i++) {
      const angle = (i * Math.PI) / spikes;
      const radius = i % 2 === 0 ? outerRadius : innerRadius;
      const x = centerX + Math.cos(angle - Math.PI / 2) * radius;
      const y = centerY + Math.sin(angle - Math.PI / 2) * radius;
      if (i === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
    }
    ctx.closePath();
    ctx.stroke();
    ctx.restore();
  }

  drawRectangleOutline() {
    const { canvas, ctx } = this;
    const centerX = canvas.width / 2;
    const centerY = canvas.height / 2;
    const width = Math.min(canvas.width, canvas.height) * 0.4;
    const height = width * 0.6;
    ctx.save();
    ctx.strokeStyle = "#ddd";
    ctx.lineWidth = 3;
    ctx.setLineDash([10, 5]);
    ctx.strokeRect(centerX - width / 2, centerY - height / 2, width, height);
    ctx.restore();
  }

  drawCircleOutline() {
    const { canvas, ctx } = this;
    const centerX = canvas.width / 2;
    const centerY = canvas.height / 2;
    const radius = Math.min(canvas.width, canvas.height) * 0.2;
    ctx.save();
    ctx.strokeStyle = "#ddd";
    ctx.lineWidth = 3;
    ctx.setLineDash([10, 5]);
    ctx.beginPath();
    ctx.arc(centerX, centerY, radius, 0, 2 * Math.PI);
    ctx.stroke();
    ctx.restore();
  }

  drawParallelogramOutline() {
    const { canvas, ctx } = this;
    const centerX = canvas.width / 2;
    const centerY = canvas.height / 2;
    const width = Math.min(canvas.width, canvas.height) * 0.4;
    const height = width * 0.5;
    const skew = width * 0.2;
    ctx.save();
    ctx.strokeStyle = "#ddd";
    ctx.lineWidth = 3;
    ctx.setLineDash([10, 5]);
    ctx.beginPath();
    ctx.moveTo(centerX - width / 2 + skew, centerY - height / 2);
    ctx.lineTo(centerX + width / 2 + skew, centerY - height / 2);
    ctx.lineTo(centerX + width / 2 - skew, centerY + height / 2);
    ctx.lineTo(centerX - width / 2 - skew, centerY + height / 2);
    ctx.closePath();
    ctx.stroke();
    ctx.restore();
  }

  redraw() {
    this.drawCurrentTemplate();
  }

  onResize() {
    this.drawCurrentTemplate();
  }
}

window.onload = (_) => {
  const credentialManager = new CredentialManager();
  const drawingCanvas = new CanvasDrawing("canvas");
  const faceTracker = new FaceTracker(
    "input-video",
    "output-canvas",
    drawingCanvas,
  );
  const keybindManager = new KeybindManager(drawingCanvas, faceTracker);
  const menuNavigator = new MenuNavigator(drawingCanvas);
  window.menuNavigator = menuNavigator;
  const headsetController = new HeadsetController(
    drawingCanvas,
    credentialManager,
    menuNavigator,
  );
  const loginManager = new LoginManager(credentialManager, () => {
    headsetController.initialize();
  });
  const templateManager = new TemplateManager(
    drawingCanvas.canvas,
    drawingCanvas.ctx,
    "rectangle",
  );
  drawingCanvas.resizeCanvas = () => {
    this.canvas.width = window.innerWidth - 320;
    this.canvas.height = window.innerHeight;
    templateManager.onResize();
  };
  drawingCanvas.clearCanvas = () => {
    this.saveCanvasState();
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    templateManager.redraw();
    this.updateStatus("Canvas Cleared");
  };
};
