// src/core/ClubEventBus.js
// Hệ thống Event Bus trung tâm (Single Source of Truth) bảo đảm mỗi sự kiện chỉ phát sinh 1 lần (Idempotent),
// đồng bộ đồng thời tới Máy tính, TV, Điện thoại, Báo chí, Tin đồn, Khủng hoảng & Uy tín Chủ tịch.

export class ClubEventBus {
  constructor(state) {
    this.state = state;
    this._listeners = new Map();
    this._processedKeys = [];
    this._processedSet = new Set();
    this._maxProcessed = 350;
    this.eventHistory = [];
    this._maxHistory = 80;
  }

  on(eventType, handler) {
    if (typeof handler !== 'function') return () => {};
    if (!this._listeners.has(eventType)) {
      this._listeners.set(eventType, []);
    }
    const list = this._listeners.get(eventType);
    list.push(handler);
    return () => {
      const idx = list.indexOf(handler);
      if (idx !== -1) list.splice(idx, 1);
    };
  }

  hasProcessed(eventKey) {
    return !!eventKey && this._processedSet.has(eventKey);
  }

  markProcessed(eventKey) {
    if (!eventKey || this._processedSet.has(eventKey)) return false;
    this._processedSet.add(eventKey);
    this._processedKeys.push(eventKey);
    while (this._processedKeys.length > this._maxProcessed) {
      const oldest = this._processedKeys.shift();
      this._processedSet.delete(oldest);
    }
    return true;
  }

  emit(eventType, payload = {}, eventKey = null) {
    if (eventKey && this.hasProcessed(eventKey)) {
      return { ok: false, duplicate: true, eventKey };
    }
    if (eventKey) this.markProcessed(eventKey);

    const record = {
      id: `evt_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      type: eventType,
      eventKey: eventKey || null,
      date: this.state?.timeSystem ? this.state.timeSystem.getDateString() : `Tuần ${this.state?.week || 1}`,
      time: this.state?.timeSystem ? this.state.timeSystem.getTimeString() : '09:00',
      payload
    };

    this.eventHistory.unshift(record);
    if (this.eventHistory.length > this._maxHistory) {
      this.eventHistory.length = this._maxHistory;
    }

    const specific = this._listeners.get(eventType) || [];
    const wildcard = this._listeners.get('*') || [];
    const handlers = [...specific, ...wildcard];
    for (let i = 0; i < handlers.length; i++) {
      try {
        handlers[i](payload, record, this.state);
      } catch (err) {
        console.error(`[ClubEventBus] Error in listener for ${eventType}:`, err);
      }
    }
    return { ok: true, record };
  }

  exportState() {
    return {
      processedKeys: [...this._processedKeys],
      eventHistory: this.eventHistory.slice(0, 50)
    };
  }

  importState(snap) {
    if (!snap) return;
    this._processedKeys = Array.isArray(snap.processedKeys) ? snap.processedKeys.slice(-this._maxProcessed) : [];
    this._processedSet = new Set(this._processedKeys);
    this.eventHistory = Array.isArray(snap.eventHistory) ? snap.eventHistory.slice(0, this._maxHistory) : [];
  }
}
