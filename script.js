class EyeTrackingPaint {
  constructor() {
    this.canvas = document.getElementById("canvas");
    this.ctx = this.canvas.getContext("2d");
    this.startBtn = document.getElementById("startBtn");
    this.stopBtn = document.getElementById("stopBtn");
    this.clearBtn = document.getElementById("clearBtn");
    this.eraseBtn = document.getElementById("eraseBtn");
    this.status = document.getElementById("status");

    this.isDrawing = false;
    this.startPoint = null;
    this.currentGaze = { x: 0, y: 0 };
    this.lines = [];
    this.isErasing = false;

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
    this.eraseBtn.addEventListener("click", this.toggleEraser.bind(this));
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
    } else if (event.key === "e") {
      this.toggleEraser();
    }
  }

  handleGaze(data) {
    if (!data) return;

    this.currentGaze.x = data.x - 160;
    this.currentGaze.y = data.y;

    if (this.isErasing) {
      this.eraseAt(this.currentGaze.x, this.currentGaze.y);
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
}

document.addEventListener("DOMContentLoaded", () => {
  new EyeTrackingPaint();
});
