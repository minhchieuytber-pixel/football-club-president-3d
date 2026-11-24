// src/ui/TaskManager.js
// Hệ thống Quản lý Tác vụ Thông minh (Smart Task Management) & Quản lý trạng thái đa ứng dụng.
// Phân tách rõ 6 cấp giao diện: Desktop -> Application -> Application View -> Task Window -> Modal -> Notification.

export const TASK_STATUS = Object.freeze({
  PENDING: 'pending',
  IN_PROGRESS: 'in_progress',
  COMPLETED: 'completed',
  FAILED: 'failed',
  CANCELLED: 'cancelled'
});

export const TASK_STATUS_LABEL = Object.freeze({
  pending: 'Chờ xử lý',
  in_progress: 'Đang thực hiện',
  completed: 'Hoàn thành',
  failed: 'Thất bại',
  cancelled: 'Đã hủy'
});

export const UI_LAYERS = Object.freeze({
  DESKTOP: 'desktop',
  APPLICATION: 'application',
  APPLICATION_VIEW: 'application_view',
  TASK_WINDOW: 'task_window',
  MODAL: 'modal',
  NOTIFICATION: 'notification'
});

export class SmartTaskManager {
  constructor() {
    this._seq = 1;
    this.tasks = [];
    this.activeTaskId = null;
    this.openedApps = new Set();
    this.appViewStates = new Map();
  }

  _clone(obj) {
    if (!obj || typeof obj !== 'object') return {};
    try {
      return JSON.parse(JSON.stringify(obj));
    } catch (_) {
      return { ...obj };
    }
  }

  // === QUẢN LÝ TRẠNG THÁI ĐA ỨNG DỤNG TRÊN MÁY TÍNH ===
  markAppOpen(appId) {
    if (appId) this.openedApps.add(appId);
  }

  markAppClosed(appId) {
    if (appId) this.openedApps.delete(appId);
  }

  clearOpenApps() {
    this.openedApps.clear();
  }

  saveAppViewState(appId, snapshot) {
    if (!appId || !snapshot) return;
    this.appViewStates.set(appId, this._clone(snapshot));
  }

  getAppViewState(appId) {
    if (!appId || !this.appViewStates.has(appId)) return null;
    return this._clone(this.appViewStates.get(appId));
  }

  // === QUẢN LÝ VÒNG ĐỜI TÁC VỤ (PENDING -> IN_PROGRESS -> COMPLETED / FAILED / CANCELLED) ===
  createTask({ id = null, type = 'general', title = 'Tác vụ quản trị', sourceApp = null, sourceView = null, payload = {}, status = TASK_STATUS.IN_PROGRESS } = {}) {
    if (id) {
      const existing = this.getTaskById(id);
      if (existing) {
        existing.type = String(type || existing.type);
        existing.title = String(title || existing.title);
        existing.sourceApp = sourceApp || existing.sourceApp;
        existing.sourceView = sourceView || existing.sourceView;
        existing.updatedAt = Date.now();
        this.activeTaskId = existing.id;
        return existing;
      }
    }
    const task = {
      id: id ? String(id) : `task_${Date.now()}_${this._seq++}`,
      type: String(type),
      title: String(title),
      sourceApp: sourceApp || null,
      sourceView: sourceView || null,
      payload: this._clone(payload),
      status: Object.values(TASK_STATUS).includes(status) ? status : TASK_STATUS.IN_PROGRESS,
      errorReason: null,
      lastError: null,
      resultMessage: null,
      createdAt: Date.now(),
      updatedAt: Date.now()
    };
    this.tasks.unshift(task);
    if (this.tasks.length > 60) this.tasks.length = 60;
    this.activeTaskId = task.id;
    return task;
  }

  getActiveTask() {
    if (!this.activeTaskId) return null;
    return this.tasks.find((t) => t.id === this.activeTaskId) || null;
  }

  getTaskById(taskId) {
    return this.tasks.find((t) => t.id === taskId) || null;
  }

  getTask(taskId) {
    return this.getTaskById(taskId);
  }

  setTaskStatus(taskId, status, extra = {}) {
    const t = this.getTaskById(taskId);
    if (!t || !Object.values(TASK_STATUS).includes(status)) return null;
    t.status = status;
    t.updatedAt = Date.now();
    if ('errorReason' in extra) {
      t.errorReason = extra.errorReason;
      t.lastError = extra.errorReason;
    }
    if ('resultMessage' in extra) t.resultMessage = extra.resultMessage;
    return t;
  }

  startTask(taskId) {
    return this.setTaskStatus(taskId, TASK_STATUS.IN_PROGRESS, { errorReason: null });
  }

  completeTask(taskId, resultMessage = 'Đã hoàn thành tác vụ.') {
    const t = this.setTaskStatus(taskId, TASK_STATUS.COMPLETED, {
      errorReason: null,
      resultMessage
    });
    if (this.activeTaskId === taskId) {
      this.activeTaskId = null;
    }
    return t;
  }

  failTask(taskId, errorReason = 'Không thể hoàn thành tác vụ.') {
    // Khi thất bại: giữ nguyên activeTaskId để cửa sổ tác vụ KHÔNG tự đóng, cho phép người chơi sửa & thử lại
    return this.setTaskStatus(taskId, TASK_STATUS.FAILED, {
      errorReason: String(errorReason || 'Lỗi không xác định')
    });
  }

  cancelTask(taskId, reason = 'Chủ tịch đã hủy tác vụ.') {
    const t = this.setTaskStatus(taskId, TASK_STATUS.CANCELLED, {
      resultMessage: reason
    });
    if (this.activeTaskId === taskId) {
      this.activeTaskId = null;
    }
    return t;
  }

  clearActiveTask() {
    this.activeTaskId = null;
  }

  getTasksByStatus(status) {
    return this.tasks.filter((t) => t.status === status);
  }

  exportState() {
    const appStatesObj = {};
    for (const [k, v] of this.appViewStates.entries()) {
      appStatesObj[k] = this._clone(v);
    }
    return {
      tasks: this.tasks.slice(0, 30).map((t) => this._clone(t)),
      openedApps: Array.from(this.openedApps),
      appViewStates: appStatesObj
    };
  }

  importState(snap) {
    if (!snap || typeof snap !== 'object') return;
    if (Array.isArray(snap.tasks)) {
      this.tasks = snap.tasks.slice(0, 30).map((t) => this._clone(t));
    }
    if (Array.isArray(snap.openedApps)) {
      this.openedApps = new Set(snap.openedApps);
    }
    if (snap.appViewStates && typeof snap.appViewStates === 'object') {
      this.appViewStates = new Map(Object.entries(snap.appViewStates));
    }
    this.activeTaskId = null;
  }
}
