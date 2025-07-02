class EyeTrackingPaint {
  constructor() {
    this.canvas = document.getElementById("canvas");
    this.ctx = this.canvas.getContext("2d");
    this.startBtn = document.getElementById("startBtn");
    this.stopBtn = document.getElementById("stopBtn");
    this.clearBtn = document.getElementById("clearBtn");
    this.eraseBtn = document.getElementById("eraseBtn");
    this.calibrateBtn = document.getElementById("calibrateBtn");
    this.status = document.getElementById("status");

    this.isDrawing = false;
    this.startPoint = null;
    this.currentGaze = { x: 0, y: 0 };
    this.lines = [];
    this.isErasing = false;
    this.isCalibrated = false;
    this.calibrationPoints = [];
    this.currentCalibrationPoint = 0;
    this.gazeListener = null;

    this.init();
  }

  init() {
    console.log("Initializing EyeTrackingPaint...");
    this.setupCanvas();
    this.setupEventListeners();
    
    // Initialize WebGazer with proper settings
    if (typeof webgazer !== 'undefined') {
      console.log("WebGazer found, setting up...");
      this.setupWebGazer();
    } else {
      console.log("WebGazer not found, waiting...");
      // Try again after a delay
      setTimeout(() => {
        if (typeof webgazer !== 'undefined') {
          console.log("WebGazer found on retry, setting up...");
          this.setupWebGazer();
        } else {
          console.error("WebGazer still not available after retry");
          this.updateStatus("Error: WebGazer not loaded. Please refresh the page.");
        }
      }, 2000);
    }
    
    this.stopBtn.disabled = true;
  }

  setupCanvas() {
    const resizeCanvas = () => {
      this.canvas.width = window.innerWidth;
      this.canvas.height = window.innerHeight;
    };

    resizeCanvas();
    window.addEventListener("resize", resizeCanvas);
  }

  setupEventListeners() {
    window.addEventListener("keydown", this.handleKeyPress.bind(this));
    this.startBtn.addEventListener("click", this.startDrawing.bind(this));
    this.stopBtn.addEventListener("click", this.stopDrawing.bind(this));
    this.clearBtn.addEventListener("click", this.clearCanvas.bind(this));
    this.eraseBtn.addEventListener("click", this.toggleEraser.bind(this));
    this.calibrateBtn.addEventListener("click", this.startCalibration.bind(this));
  }

  setupWebGazer() {
    console.log("Setting up WebGazer with optimal settings...");
    
    try {
      // Stop any existing instance
      if (webgazer.isReady()) {
        webgazer.end();
      }

      // Configure WebGazer with optimal settings
      webgazer
        .showVideo(true)
        .showFaceOverlay(true)
        .showFaceFeedbackBox(true)
        .setGazeListener((data, timestamp) => {
          if (data == null) return;
          
          // Log raw gaze data for debugging
          console.log("Gaze data:", data, "Timestamp:", timestamp);
          
          // Apply calibration offset
          let x = data.x - 160;
          let y = data.y;

          // Simple smoothing
          if (this.currentGaze.x !== 0 && this.currentGaze.y !== 0) {
            x = this.currentGaze.x * 0.7 + x * 0.3;
            y = this.currentGaze.y * 0.7 + y * 0.3;
          }

          this.currentGaze.x = x;
          this.currentGaze.y = y;

          if (this.isDrawing) {
            this.handleGazeUpdate();
          }
          
          if (this.isErasing) {
            this.eraseAt(x, y);
          }
        })
        .setTracker('TFFacemesh')
        .setRegression('ridge')
        .begin();

      console.log("WebGazer initialized successfully");
      this.updateStatus("Eye tracking ready - Press 'k' to calibrate");
      
    } catch (error) {
      console.error("Error setting up WebGazer:", error);
      this.updateStatus("Error initializing eye tracking. Please refresh.");
    }
  }

  handleGazeUpdate() {
    if (!this.isDrawing) return;
    
    if (!this.startPoint) {
      this.startPoint = { ...this.currentGaze };
      return;
    }

    // Draw the line
    this.ctx.save();
    this.ctx.strokeStyle = "black";
    this.ctx.lineWidth = 2;
    this.ctx.beginPath();
    this.ctx.moveTo(this.startPoint.x, this.startPoint.y);
    this.ctx.lineTo(this.currentGaze.x, this.currentGaze.y);
    this.ctx.stroke();
    this.ctx.restore();

    // Update start point for next segment
    this.startPoint = { ...this.currentGaze };
  }

  handleKeyPress(event) {
    if (event.key === "s") {
      this.startDrawing();
    } else if (event.key === "x") {
      this.stopDrawing();
    } else if (event.key === "c") {
      this.clearCanvas();
    } else if (event.key === "e") {
      this.toggleEraser();
    } else if (event.key === "k") {
      this.startCalibration();
    } else if (event.key === "t") {
      this.testWebGazer();
    }
  }

  startDrawing() {
    if (!this.isDrawing) {
      this.isDrawing = true;
      this.startPoint = { ...this.currentGaze };
      this.updateStatus("Drawing...");
      this.startBtn.disabled = true;
      this.stopBtn.disabled = false;
      this.drawGazeCursor(this.currentGaze.x, this.currentGaze.y);
    }
  }

  stopDrawing() {
    if (this.isDrawing) {
      this.isDrawing = false;
      this.startPoint = null;
      this.updateStatus("Ready");
      this.startBtn.disabled = false;
      this.stopBtn.disabled = true;
    }
  }

  clearCanvas() {
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    this.lines = [];
    this.updateStatus("Canvas cleared");
    setTimeout(() => this.updateStatus("Ready"), 2000);
  }

  redrawCanvas() {
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    this.drawAllLines();
  }

  drawGazeCursor(x, y) {
    if (x < 0 || y < 0 || x > this.canvas.width || y > this.canvas.height)
      return;

    this.ctx.save();
    this.ctx.fillStyle = "red";
    this.ctx.beginPath();
    this.ctx.arc(x, y, 5, 0, 2 * Math.PI);
    this.ctx.fill();
    this.ctx.restore();
  }

  drawLine(start, end) {
    this.ctx.save();
    this.ctx.strokeStyle = "black";
    this.ctx.lineWidth = 2;
    this.ctx.beginPath();
    this.ctx.moveTo(start.x, start.y);
    this.ctx.lineTo(end.x, end.y);
    this.ctx.stroke();
    this.ctx.restore();
  }

  drawAllLines() {
    this.lines.forEach((line) => this.drawLine(line.start, line.end));
  }

  updateStatus(message) {
    this.status.textContent = `Status: ${message}`;
  }

  toggleEraser() {
    this.isErasing = !this.isErasing;
    if (this.isErasing) {
      this.isDrawing = false;
      this.startBtn.disabled = true;
      this.stopBtn.disabled = true;
      this.eraseBtn.textContent = "Stop Erasing (e)";
      this.updateStatus("Erasing...");
    } else {
      this.startBtn.disabled = false;
      this.stopBtn.disabled = false;
      this.eraseBtn.textContent = "Erase (e)";
      this.updateStatus("Ready");
    }
  }

  eraseAt(x, y) {
    const eraserSize = 30; // You can adjust the eraser size
    this.ctx.clearRect(x - eraserSize / 2, y - eraserSize / 2, eraserSize, eraserSize);
  }

  startCalibration() {
    console.log("Starting calibration process...");
    if (!webgazer || typeof webgazer.clearData !== 'function') {
      console.error("WebGazer not properly initialized");
      this.updateStatus("Error: WebGazer not ready. Please refresh the page.");
      return;
    }

    // Reset WebGazer's calibration
    webgazer.clearData();
    console.log("Cleared previous calibration data");

    // Ensure video feed is visible during calibration
    webgazer.showVideo(true);
    webgazer.showFaceOverlay(true);
    webgazer.showFaceFeedbackBox(true);
    
    this.isDrawing = false;
    this.isErasing = false;
    this.startBtn.disabled = true;
    this.stopBtn.disabled = true;
    this.eraseBtn.disabled = true;
    this.calibrateBtn.disabled = true;

    // Define calibration points (16-point grid)
    const controlWidth = 320; // Width of the control panel
    const margin = {
      left: controlWidth + 100, // Account for control panel
      right: 100,
      top: 100,
      bottom: 200 // Increased bottom margin to avoid WebGazer video
    };
    
    // Calculate available space
    const width = window.innerWidth - margin.left - margin.right;
    const height = window.innerHeight - margin.top - margin.bottom;
    
    // Calculate point positions with better distribution (4x4 grid)
    const cols = [0.15, 0.38, 0.62, 0.85]; // Four columns
    const rows = [0.15, 0.38, 0.62, 0.85]; // Four rows
    
    this.calibrationPoints = [];
    for (let row of rows) {
      for (let col of cols) {
        this.calibrationPoints.push({
          x: margin.left + (width * col),
          y: margin.top + (height * row)
        });
      }
    }

    console.log("Calibration points:", this.calibrationPoints);
    this.currentCalibrationPoint = 0;
    this.showCalibrationPoint();
  }

  showCalibrationPoint() {
    console.log("Drawing calibration point", this.currentCalibrationPoint);
    if (this.currentCalibrationPoint >= this.calibrationPoints.length) {
      this.finishCalibration();
      return;
    }

    const point = this.calibrationPoints[this.currentCalibrationPoint];
    this.redrawCanvas();

    // Animated pulse effect
    const drawPulse = (radius) => {
      // Large outer glow
      this.ctx.save();
      this.ctx.beginPath();
      this.ctx.arc(point.x, point.y, radius + 20, 0, 2 * Math.PI);
      this.ctx.fillStyle = 'rgba(255, 255, 255, 0.2)';
      this.ctx.fill();

      // Medium outer glow
      this.ctx.beginPath();
      this.ctx.arc(point.x, point.y, radius + 10, 0, 2 * Math.PI);
      this.ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
      this.ctx.fill();

      // Main circle
      this.ctx.beginPath();
      this.ctx.arc(point.x, point.y, radius, 0, 2 * Math.PI);
      this.ctx.fillStyle = 'red';
      this.ctx.fill();
      
      // Inner circle
      this.ctx.beginPath();
      this.ctx.arc(point.x, point.y, radius * 0.6, 0, 2 * Math.PI);
      this.ctx.fillStyle = 'white';
      this.ctx.fill();
      this.ctx.restore();

      // Point number with better visibility
      this.ctx.save();
      // Draw text shadow for better contrast
      this.ctx.shadowColor = 'rgba(0, 0, 0, 0.5)';
      this.ctx.shadowBlur = 4;
      this.ctx.shadowOffsetX = 2;
      this.ctx.shadowOffsetY = 2;
      this.ctx.fillStyle = "white";
      this.ctx.font = "bold 28px Arial";
      this.ctx.textAlign = "center";
      this.ctx.fillText(this.currentCalibrationPoint + 1, point.x, point.y + 60);
      this.ctx.restore();
    };

    // Animate the point with larger size range
    let size = 25; // Increased base size
    let growing = true;
    const animate = () => {
      if (this.currentCalibrationPoint >= this.calibrationPoints.length) return;
      
      this.redrawCanvas();
      drawPulse(size);
      
      if (growing) {
        size += 0.5;
        if (size >= 35) growing = false;
      } else {
        size -= 0.5;
        if (size <= 25) growing = true;
      }
      
      requestAnimationFrame(animate);
    };
    animate();

    // Update status with point position info
    this.updateStatus(`Look at point ${this.currentCalibrationPoint + 1}/16 (${Math.round(point.x)}, ${Math.round(point.y)}) and focus for 2 seconds`);

    // Add click and space handlers
    const handlePointCalibration = () => {
      // Add calibration data point to WebGazer
      if (webgazer && typeof webgazer.addCalibrationPoint === 'function') {
        webgazer.addCalibrationPoint(point.x, point.y, point.x, point.y);
        console.log("Added calibration point:", point);
      }
      
      // Wait for 2 seconds while user looks at the point
      setTimeout(() => {
        this.currentCalibrationPoint++;
        this.showCalibrationPoint();
      }, 2000);
    };

    // Remove any existing listeners
    document.removeEventListener("keydown", this.spaceHandler);
    this.canvas.removeEventListener("click", this.clickHandler);

    // Add new listeners
    this.spaceHandler = (event) => {
      if (event.code === "Space") {
        event.preventDefault();
        handlePointCalibration();
      }
    };
    this.clickHandler = (event) => {
      const rect = this.canvas.getBoundingClientRect();
      const clickX = event.clientX - rect.left;
      const clickY = event.clientY - rect.top;
      const distance = Math.sqrt(
        Math.pow(clickX - point.x, 2) + Math.pow(clickY - point.y, 2)
      );
      
      if (distance < 50) { // Click within 50px radius
        handlePointCalibration();
      }
    };

    document.addEventListener("keydown", this.spaceHandler);
    this.canvas.addEventListener("click", this.clickHandler);
  }

  finishCalibration() {
    // Clean up event listeners
    document.removeEventListener("keydown", this.spaceHandler);
    this.canvas.removeEventListener("click", this.clickHandler);
    
    this.isCalibrated = true;
    this.startBtn.disabled = false;
    this.stopBtn.disabled = false;
    this.eraseBtn.disabled = false;
    this.calibrateBtn.disabled = false;
    
    // Store that calibration is complete
    if (webgazer && typeof webgazer.saveCalibration === 'function') {
      webgazer.saveCalibration();
    }
    
    this.updateStatus("Calibration complete! Press 's' to start drawing");
    this.redrawCanvas();
  }

  // Test method to verify WebGazer is working
  testWebGazer() {
    console.log("Testing WebGazer...");
    if (typeof webgazer !== 'undefined') {
      console.log("WebGazer object:", webgazer);
      console.log("WebGazer methods:", Object.getOwnPropertyNames(webgazer));
    } else {
      console.log("WebGazer is undefined");
    }
  }
}

document.addEventListener("DOMContentLoaded", () => {
  // Wait a bit for WebGazer to load
  setTimeout(() => {
    console.log("Initializing EyeTrackingPaint...");
    new EyeTrackingPaint();
  }, 1000);
});

