// src/controls/TouchControls.js
// Điều khiển đa chạm độc lập trên iPhone Landscape: Tay trái di chuyển bằng Joystick đồng thời tay phải vuốt xoay màn hình không xung đột
export class TouchControls {
  constructor(cameraController, canvasEl, onInteract, onCanvasTap = null) {
    this.cam = cameraController;
    this.canvas = canvasEl;
    this.onInteract = onInteract;
    this.onCanvasTap = onCanvasTap;
    this.moveVec = { x: 0, y: 0 };
    this.sprint = false;
    this.keys = new Set();

    this.joyTouchId = null;
    this.camTouchId = null;
    this.lastCamPt = { x: 0, y: 0 };
    this.mouseDragging = false;
    this._mouseDownPt = { x: 0, y: 0 };
    this.pointerNDC = { x: 0, y: 0 };
    this.pointerActive = false;
    this._inputVec = { x: 0, y: 0, moving: false };
    this._abortController = typeof AbortController !== 'undefined' ? new AbortController() : null;

    this.bindKeyboard();
    this.bindMultiTouch();
  }

  _listenerOpts(extra) {
    const signal = this._abortController?.signal;
    if (!signal) return extra;
    return extra ? { ...extra, signal } : { signal };
  }

  bindKeyboard() {
    const opts = this._listenerOpts();
    window.addEventListener('keydown', (e) => {
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName)) return;
      this.keys.add(e.code);
      if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') this.sprint = true;
      if (e.code === 'KeyE' && this.onInteract) this.onInteract();
    }, opts);
    window.addEventListener('keyup', (e) => {
      this.keys.delete(e.code);
      if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') this.sprint = false;
    }, opts);
  }

  bindMultiTouch() {
    const zone = document.getElementById('joy-zone');
    const knob = document.getElementById('joy-knob');
    const maxR = 38;
    const defaultOpts = this._listenerOpts();
    const passiveOpts = this._listenerOpts({ passive: true });
    const nonPassiveOpts = this._listenerOpts({ passive: false });

    const updateKnob = (clientX, clientY) => {
      if (!zone || !knob) return;
      const rect = zone.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      let dx = clientX - cx;
      let dy = clientY - cy;
      const dist = Math.hypot(dx, dy);
      if (dist > maxR) {
        dx = (dx / dist) * maxR;
        dy = (dy / dist) * maxR;
      }
      knob.style.transform = `translate(${dx}px, ${dy}px)`;
      this.moveVec.x = dx / maxR;
      this.moveVec.y = dy / maxR;
    };

    const resetKnob = () => {
      this.joyTouchId = null;
      if (knob) knob.style.transform = 'translate(0px, 0px)';
      this.moveVec.x = 0;
      this.moveVec.y = 0;
    };

    // Ngón tay trái trên vùng Joystick
    if (zone) {
      zone.addEventListener('touchstart', (e) => {
        e.preventDefault();
        for (const t of e.changedTouches) {
          if (this.joyTouchId === null && t.identifier !== this.camTouchId) {
            this.joyTouchId = t.identifier;
            updateKnob(t.clientX, t.clientY);
          }
        }
      }, nonPassiveOpts);

      let mouseJoy = false;
      zone.addEventListener('mousedown', (e) => {
        e.stopPropagation();
        mouseJoy = true;
        updateKnob(e.clientX, e.clientY);
      }, defaultOpts);
      window.addEventListener('mousemove', (e) => {
        if (mouseJoy) updateKnob(e.clientX, e.clientY);
      }, defaultOpts);
      window.addEventListener('mouseup', () => {
        if (mouseJoy) { mouseJoy = false; resetKnob(); }
      }, defaultOpts);
    }

    // Lắng nghe đa chạm toàn cục trên window để tay trái giữ joystick vẫn cho phép tay phải vuốt xoay camera tự do
    window.addEventListener('touchstart', (e) => {
      this.pointerActive = false;
      const target = e.target;
      if (target && target.closest && (
        target.closest('#modal-backdrop.open') ||
        target.closest('#ceremony-sheet.open') ||
        target.closest('button') ||
        target.closest('#joy-zone')
      )) {
        return;
      }
      for (const t of e.changedTouches) {
        if (t.identifier !== this.joyTouchId && this.camTouchId === null) {
          this.camTouchId = t.identifier;
          this.lastCamPt.x = t.clientX;
          this.lastCamPt.y = t.clientY;
        }
      }
    }, passiveOpts);

    window.addEventListener('touchmove', (e) => {
      for (const t of e.changedTouches) {
        if (t.identifier === this.joyTouchId) {
          updateKnob(t.clientX, t.clientY);
        } else if (t.identifier === this.camTouchId) {
          const dx = t.clientX - this.lastCamPt.x;
          const dy = t.clientY - this.lastCamPt.y;
          this.cam.rotate(dx, dy);
          this.lastCamPt.x = t.clientX;
          this.lastCamPt.y = t.clientY;
        }
      }
    }, passiveOpts);

    const onEnd = (e) => {
      for (const t of e.changedTouches) {
        if (t.identifier === this.joyTouchId) resetKnob();
        if (t.identifier === this.camTouchId) this.camTouchId = null;
      }
    };
    window.addEventListener('touchend', onEnd, passiveOpts);
    window.addEventListener('touchcancel', onEnd, passiveOpts);

    // Chuột xoay camera, trỏ vật thể 3D trực tiếp & cuộn zoom trên máy tính
    if (this.canvas) {
      const updatePointerNDC = (clientX, clientY) => {
        const rect = this.canvas.getBoundingClientRect();
        if (!rect || rect.width <= 0 || rect.height <= 0) return;
        this.pointerNDC.x = ((clientX - rect.left) / rect.width) * 2 - 1;
        this.pointerNDC.y = -((clientY - rect.top) / rect.height) * 2 + 1;
        this.pointerActive = true;
      };

      this.canvas.addEventListener('mousedown', (e) => {
        if (e.button === 0) {
          this.mouseDragging = true;
          this.lastCamPt.x = e.clientX;
          this.lastCamPt.y = e.clientY;
          this._mouseDownPt.x = e.clientX;
          this._mouseDownPt.y = e.clientY;
          updatePointerNDC(e.clientX, e.clientY);
        }
      }, defaultOpts);
      this.canvas.addEventListener('mousemove', (e) => {
        if (!this.mouseDragging) {
          updatePointerNDC(e.clientX, e.clientY);
        }
      }, defaultOpts);
      this.canvas.addEventListener('mouseleave', () => {
        this.pointerActive = false;
      }, defaultOpts);
      window.addEventListener('mousemove', (e) => {
        if (!this.mouseDragging) return;
        this.cam.rotate(e.clientX - this.lastCamPt.x, e.clientY - this.lastCamPt.y);
        this.lastCamPt.x = e.clientX;
        this.lastCamPt.y = e.clientY;
      }, defaultOpts);
      window.addEventListener('mouseup', (e) => {
        const wasDragging = this.mouseDragging;
        this.mouseDragging = false;
        if (wasDragging && e.button === 0 && e.target === this.canvas && this.onCanvasTap) {
          const dragDist = Math.hypot(e.clientX - this._mouseDownPt.x, e.clientY - this._mouseDownPt.y);
          if (dragDist < 6) {
            updatePointerNDC(e.clientX, e.clientY);
            this.onCanvasTap(this.pointerNDC);
          }
        }
      }, defaultOpts);
      this.canvas.addEventListener('wheel', (e) => {
        this.cam.zoom(e.deltaY);
      }, passiveOpts);
    }
  }

  destroy() {
    if (this._abortController) {
      this._abortController.abort();
      this._abortController = null;
    }
    this.keys.clear();
    this.joyTouchId = null;
    this.camTouchId = null;
    this.mouseDragging = false;
    this.moveVec.x = 0;
    this.moveVec.y = 0;
  }

  getInputVector() {
    let x = this.moveVec.x;
    let y = this.moveVec.y;
    if (this.keys.has('KeyW') || this.keys.has('ArrowUp')) y -= 1;
    if (this.keys.has('KeyS') || this.keys.has('ArrowDown')) y += 1;
    if (this.keys.has('KeyA') || this.keys.has('ArrowLeft')) x -= 1;
    if (this.keys.has('KeyD') || this.keys.has('ArrowRight')) x += 1;
    const mag = Math.hypot(x, y);
    if (mag > 1) { x /= mag; y /= mag; }
    this._inputVec.x = x;
    this._inputVec.y = y;
    this._inputVec.moving = mag > 0.08;
    return this._inputVec;
  }
}
