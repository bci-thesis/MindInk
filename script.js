class EyeTrackingPaint {
  constructor() {
    this.canvas = document.getElementById("canvas");
    this.ctx = this.canvas.getContext("2d");
    this.startBtn = document.getElementById("startBtn");
    this.stopBtn = document.getElementById("stopBtn");
    this.clearBtn = document.getElementById("clearBtn");
    this.status = document.getElementById("status");

    this.isDrawing = false;
    this.startPoint = null;
    this.currentGaze = { x: 0, y: 0 };
    this.lines = [];

    this.init();
  }

  init() {
    this.setupCanvas();
    this.setupEventListeners();
    this.setupWebGazer();
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
  }

  setupWebGazer() {
    webgazer.setGazeListener(this.handleGaze.bind(this)).begin();
  }

  handleKeyPress(event) {
    if (event.key === "s") {
      this.startDrawing();
    } else if (event.key === "x") {
      this.stopDrawing();
    } else if (event.key === "c") {
      this.clearCanvas();
    }
  }

  handleGaze(data) {
    if (!data) return;

    this.currentGaze.x = data.x - 160;
    this.currentGaze.y = data.y;
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
    if (this.isDrawing && this.startPoint) {
      const endPoint = { ...this.currentGaze };
      this.lines.push({ start: this.startPoint, end: endPoint });
      this.redrawCanvas();

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
}

document.addEventListener("DOMContentLoaded", () => {
  new EyeTrackingPaint();
});
