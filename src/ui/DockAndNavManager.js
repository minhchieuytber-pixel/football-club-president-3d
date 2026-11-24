// src/ui/DockAndNavManager.js
// Quản lý thống nhất trạng thái thanh Dock macOS (vị trí, hướng, cuộn, thu gọn/mở rộng, kích thước, hiển thị)
// và Navigation History Manager dùng chung toàn hệ thống (Nút Back Thông Minh đa cấp & khôi phục trạng thái giao diện).

export const DEFAULT_DOCK_STATE = Object.freeze({
  position: 'bottom',       // 'bottom' | 'left' | 'right' | 'floating'
  orientation: 'horizontal', // 'horizontal' | 'vertical'
  x: null,                  // tọa độ X khi kéo thả tự do ('floating')
  y: null,                  // tọa độ Y khi kéo thả tự do ('floating')
  scrollLeft: 0,            // vị trí cuộn ngang dải icon Dock
  scrollTop: 0,             // vị trí cuộn dọc dải icon Dock
  collapsed: false,         // thu gọn / mở rộng
  size: 'medium',           // 'small' | 'medium' | 'large'
  visible: true             // ẩn / hiện Dock
});

export class DockStateManager {
  constructor(initialState = null) {
    this.state = { ...DEFAULT_DOCK_STATE };
    if (initialState) this.importState(initialState);
  }

  getState() {
    return { ...this.state };
  }

  _clampCoord(val, min, max) {
    const num = Number(val);
    if (!Number.isFinite(num)) return min;
    return Math.max(min, Math.min(max, Math.round(num)));
  }

  setPosition(position, x = null, y = null, bounds = null) {
    const valid = ['bottom', 'left', 'right', 'floating'];
    if (!valid.includes(position)) return this.getState();
    this.state.position = position;
    if (position === 'left' || position === 'right') {
      this.state.orientation = 'vertical';
      this.state.x = null;
      this.state.y = null;
    } else if (position === 'bottom') {
      this.state.orientation = 'horizontal';
      this.state.x = null;
      this.state.y = null;
    } else if (position === 'floating') {
      if (x !== null && y !== null) {
        this.setFloatingCoordinates(x, y, bounds);
      }
    }
    return this.getState();
  }

  setFloatingCoordinates(x, y, bounds = null) {
    const w = bounds?.containerWidth || 960;
    const h = bounds?.containerHeight || 600;
    const dockW = bounds?.dockWidth || 220;
    const dockH = bounds?.dockHeight || 54;
    const minX = 6;
    const minY = 32;
    const maxX = Math.max(minX, w - Math.min(dockW, w - 12) - 6);
    const maxY = Math.max(minY, h - Math.min(dockH, h - 40) - 6);

    this.state.position = 'floating';
    this.state.x = this._clampCoord(x, minX, maxX);
    this.state.y = this._clampCoord(y, minY, maxY);
    return this.getState();
  }

  setOrientation(orientation) {
    if (orientation !== 'horizontal' && orientation !== 'vertical') return this.getState();
    this.state.orientation = orientation;
    if (this.state.position !== 'floating') {
      if (orientation === 'vertical' && this.state.position === 'bottom') {
        this.state.position = 'left';
      } else if (orientation === 'horizontal' && (this.state.position === 'left' || this.state.position === 'right')) {
        this.state.position = 'bottom';
      }
    }
    return this.getState();
  }

  toggleCollapsed(force = null) {
    this.state.collapsed = typeof force === 'boolean' ? force : !this.state.collapsed;
    return this.state.collapsed;
  }

  setSize(size) {
    if (['small', 'medium', 'large'].includes(size)) {
      this.state.size = size;
    }
    return this.state.size;
  }

  setVisible(visible) {
    this.state.visible = !!visible;
    return this.state.visible;
  }

  updateScroll(scrollLeft = 0, scrollTop = 0) {
    if (Number.isFinite(scrollLeft) && scrollLeft >= 0) {
      this.state.scrollLeft = Math.round(scrollLeft);
    }
    if (Number.isFinite(scrollTop) && scrollTop >= 0) {
      this.state.scrollTop = Math.round(scrollTop);
    }
  }

  resetToDefault() {
    this.state = { ...DEFAULT_DOCK_STATE };
    return this.getState();
  }

  exportState() {
    return { ...this.state };
  }

  importState(snap) {
    if (!snap || typeof snap !== 'object') return;
    if (['bottom', 'left', 'right', 'floating'].includes(snap.position)) {
      this.state.position = snap.position;
    }
    if (snap.orientation === 'horizontal' || snap.orientation === 'vertical') {
      this.state.orientation = snap.orientation;
    } else if (this.state.position === 'left' || this.state.position === 'right') {
      this.state.orientation = 'vertical';
    } else {
      this.state.orientation = 'horizontal';
    }
    this.state.x = Number.isFinite(snap.x) ? Math.round(snap.x) : null;
    this.state.y = Number.isFinite(snap.y) ? Math.round(snap.y) : null;
    this.state.scrollLeft = Number.isFinite(snap.scrollLeft) && snap.scrollLeft >= 0 ? Math.round(snap.scrollLeft) : 0;
    this.state.scrollTop = Number.isFinite(snap.scrollTop) && snap.scrollTop >= 0 ? Math.round(snap.scrollTop) : 0;
    this.state.collapsed = !!snap.collapsed;
    this.state.size = ['small', 'medium', 'large'].includes(snap.size) ? snap.size : 'medium';
    this.state.visible = typeof snap.visible === 'boolean' ? snap.visible : true;
  }
}

export class NavigationHistoryManager {
  constructor(maxDepth = 45) {
    this.maxDepth = maxDepth;
    this.stack = [];
    this.current = null;
  }

  _cloneSnapshot(snap) {
    if (!snap || typeof snap !== 'object') return {};
    try {
      return JSON.parse(JSON.stringify(snap));
    } catch (_) {
      return { ...snap };
    }
  }

  _cloneEntry(entry) {
    if (!entry) return null;
    return {
      routeKey: String(entry.routeKey || ''),
      screen: String(entry.screen || ''),
      label: String(entry.label || ''),
      params: this._cloneSnapshot(entry.params || {}),
      uiSnapshot: this._cloneSnapshot(entry.uiSnapshot || {})
    };
  }

  /**
   * Ghi nhận chuyển màn hình hợp lệ:
   * - Không đẩy bản ghi trùng khi chỉ re-render cùng routeKey
   * - Không ghi đè lịch sử khi skipHistory = true (cập nhật bộ lọc / hành động nội trang)
   */
  navigate(entry, { skipHistory = false, replace = false } = {}) {
    const normalized = this._cloneEntry(entry);
    if (!normalized || !normalized.routeKey) return;

    if (skipHistory) {
      if (this.current) {
        this.current = {
          ...this.current,
          ...normalized,
          uiSnapshot: { ...this.current.uiSnapshot, ...normalized.uiSnapshot }
        };
      } else {
        this.current = normalized;
      }
      return;
    }

    if (replace) {
      this.current = normalized;
      return;
    }

    if (this.current && this.current.routeKey !== normalized.routeKey) {
      const top = this.stack[this.stack.length - 1];
      if (!top || top.routeKey !== this.current.routeKey) {
        this.stack.push(this._cloneEntry(this.current));
        while (this.stack.length > this.maxDepth) {
          this.stack.shift();
        }
      } else {
        // Cập nhật snapshot mới nhất cho phần tử trên cùng nếu cùng routeKey
        this.stack[this.stack.length - 1] = this._cloneEntry(this.current);
      }
    }

    this.current = normalized;
  }

  updateCurrentSnapshot(partialSnap) {
    if (!this.current || !partialSnap) return;
    this.current.uiSnapshot = {
      ...this.current.uiSnapshot,
      ...this._cloneSnapshot(partialSnap)
    };
  }

  canGoBack() {
    if (this.stack.length > 0) return true;
    // Nếu đang ở một tab con của Máy tính mà chưa có lịch sử trước đó -> cho phép Back về trang chính 'overview'
    if (this.current && this.current.screen === 'computer' && this.current.params?.tab && this.current.params.tab !== 'overview') {
      return true;
    }
    return false;
  }

  peekBackTarget() {
    if (this.stack.length > 0) {
      return this.stack[this.stack.length - 1];
    }
    if (this.current && this.current.screen === 'computer' && this.current.params?.tab && this.current.params.tab !== 'overview') {
      return { routeKey: 'pc:overview', screen: 'computer', label: 'Tổng quan Máy tính PSG', params: { tab: 'overview' } };
    }
    return null;
  }

  peekBackLabel() {
    const target = this.peekBackTarget();
    if (target?.label) return target.label;
    return 'Desktop PSG';
  }

  pop() {
    if (this.stack.length > 0) {
      const prev = this.stack.pop();
      this.current = prev;
      return this._cloneEntry(prev);
    }
    if (this.current && this.current.screen === 'computer' && this.current.params?.tab && this.current.params.tab !== 'overview') {
      const rootEntry = {
        routeKey: 'pc:overview',
        screen: 'computer',
        label: 'Tổng quan',
        params: { tab: 'overview' },
        uiSnapshot: { activeTab: 'overview', scrollMainTop: 0 }
      };
      this.current = rootEntry;
      return this._cloneEntry(rootEntry);
    }
    return null;
  }

  clear() {
    this.stack = [];
    this.current = null;
  }

  exportState() {
    return {
      stack: this.stack.slice(-this.maxDepth).map((e) => this._cloneEntry(e)),
      current: this._cloneEntry(this.current)
    };
  }

  importState(snap) {
    if (!snap || typeof snap !== 'object') return;
    this.stack = Array.isArray(snap.stack) ? snap.stack.slice(-this.maxDepth).map((e) => this._cloneEntry(e)).filter(Boolean) : [];
    this.current = snap.current ? this._cloneEntry(snap.current) : null;
  }
}
