// src/time/GameTimeSystem.js
// Hệ thống Thời Gian Toàn Game duy nhất (Single Source of Truth)
// QUY TẮC CỐ ĐỊNH: 1 ngày trong game = 15 phút ngoài đời thực (900 giây thực = 86,400 giây game)
// Công thức kỹ thuật: GameTimeElapsed = RealTimeElapsed × 96 (tính theo delta time, không phụ thuộc FPS)
// - 1 giây thực   = 96 giây game
// - 37.5 giây thực = 1 giờ game
// - 900 giây thực  = 24 giờ game (1 ngày)
// - 30 phút thực   = 2 ngày game
// - 60 phút thực   = 4 ngày game

export const GAME_TIME_SCALE = 96; // 86400 / 900 = 96

const DAY_NAMES_VI = ['CHỦ NHẬT', 'THỨ HAI', 'THỨ BA', 'THỨ TƯ', 'THỨ NĂM', 'THỨ SÁU', 'THỨ BẢY'];
const DAY_NAMES_TITLE = ['Chủ Nhật', 'Thứ Hai', 'Thứ Ba', 'Thứ Tư', 'Thứ Năm', 'Thứ Sáu', 'Thứ Bảy'];
const WEATHERS = ['Quang đãng', 'Nắng nhẹ', 'Nhiều mây', 'Mưa nhẹ'];

export class GameTimeSystem {
  constructor(initialIsoDate = '2026-08-03T09:15:00Z') {
    this.gameScale = GAME_TIME_SCALE;
    this.speedMultiplier = 1; // 1 | 2 | 4
    this.userPaused = false;
    this.autoPauseReasons = new Set(); // Tạm dừng tự động khi họp, đàm phán, ra quyết định
    this.hiddenPaused = false;         // Tạm dừng khi ẩn tab / khóa màn hình iPhone
    this.firedEventKeys = new Set();   // Chống kích hoạt sự kiện trùng lặp

    this.listeners = {
      onHour: [],
      onDayChange: [],
      onMinute: []
    };

    this.reset(initialIsoDate);
  }

  reset(initialIsoDate = '2026-08-03T09:15:00Z') {
    // Lưu toàn bộ thời gian bằng giây game tính từ mốc UTC để không bị lệch múi giờ khi chạy trên iPhone/Web
    this.epochSeconds = Math.floor(Date.parse(initialIsoDate) / 1000);
    this.speedMultiplier = 1;
    this.userPaused = false;
    this.autoPauseReasons.clear();
    this.hiddenPaused = false;
    this.firedEventKeys.clear();
    this.weather = 'Quang đãng';
    this._syncDateFields();
    this._lastHourKey = `${this.getDayKey()}_${this.hour}`;
    this._lastDayKey = this.getDayKey();
    this._lastMinute = this.minute;
  }

  _syncDateFields() {
    const d = new Date(this.epochSeconds * 1000);
    this.year = d.getUTCFullYear();
    this.month = d.getUTCMonth() + 1;
    this.day = d.getUTCDate();
    this.dayOfWeekIdx = d.getUTCDay();
    this.dayNameUpper = DAY_NAMES_VI[this.dayOfWeekIdx];
    this.dayName = DAY_NAMES_TITLE[this.dayOfWeekIdx];
    this.hour = d.getUTCHours();
    this.minute = d.getUTCMinutes();
    this.second = d.getUTCSeconds();
    this.clockHour = this.hour + this.minute / 60 + this.second / 3600;
  }

  isPaused() {
    return this.userPaused || this.hiddenPaused || this.autoPauseReasons.size > 0;
  }

  setPaused(flag) {
    this.userPaused = !!flag;
  }

  togglePause() {
    this.userPaused = !this.userPaused;
    return this.userPaused;
  }

  setSpeed(mult) {
    if (![1, 2, 4].includes(mult)) return false;
    this.speedMultiplier = mult;
    this.userPaused = false;
    return true;
  }

  pushAutoPause(reason) {
    if (reason) this.autoPauseReasons.add(reason);
  }

  popAutoPause(reason) {
    if (reason) this.autoPauseReasons.delete(reason);
  }

  clearAutoPause() {
    this.autoPauseReasons.clear();
  }

  bindVisibilityGuards(onFreezeCallback = null, onResumeCallback = null) {
    if (typeof document === 'undefined' || typeof window === 'undefined') return;
    const freeze = () => {
      this.hiddenPaused = true;
      if (onFreezeCallback) onFreezeCallback();
    };
    const resume = () => {
      if (!document.hidden) {
        this.hiddenPaused = false;
        if (onResumeCallback) onResumeCallback();
      }
    };
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) freeze();
      else resume();
    });
    window.addEventListener('pagehide', freeze);
    window.addEventListener('pageshow', resume);
    window.addEventListener('blur', freeze);
    window.addEventListener('focus', resume);
    window.addEventListener('beforeunload', freeze);
  }

  on(eventName, fn) {
    if (this.listeners[eventName]) this.listeners[eventName].push(fn);
  }

  // Cập nhật thời gian theo delta time thực (giây) — KHÔNG phụ thuộc FPS!
  // Công thức: GameTimeElapsed = RealTimeElapsed × 96 × speedMultiplier
  tick(realDeltaSeconds) {
    if (this.isPaused()) return 0;
    if (!Number.isFinite(realDeltaSeconds) || realDeltaSeconds <= 0) return 0;

    // Chống bước nhảy thời gian bất thường nếu tab bị treo đột ngột (khi không chạy mô phỏng kiểm thử trực tiếp)
    const gameDeltaSeconds = realDeltaSeconds * this.gameScale * this.speedMultiplier;
    return this._advanceGameSeconds(gameDeltaSeconds);
  }

  // Cho phép tua tiến chính xác N ngày game (khi người chơi bấm Qua tuần hoặc kiểm thử)
  advanceGameDays(days) {
    return this._advanceGameSeconds(days * 86400);
  }

  // Đặt lại giờ trong ngày (ví dụ 09:00 sáng) mà không lùi ngày
  setTimeOfDay(hour, minute = 0) {
    const curDayStart = Math.floor(this.epochSeconds / 86400) * 86400;
    this.epochSeconds = curDayStart + hour * 3600 + minute * 60;
    this._syncDateFields();
    this._lastHourKey = `${this.getDayKey()}_${this.hour}`;
    this._lastMinute = this.minute;
  }

  // Chuyển ngày lịch đến đúng ngày mở màn mùa mới
  setCalendarDate(year, month, day, hour = 9, minute = 0) {
    const iso = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}T${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:00Z`;
    this.epochSeconds = Math.floor(Date.parse(iso) / 1000);
    this._syncDateFields();
    this._lastDayKey = this.getDayKey();
    this._lastHourKey = `${this._lastDayKey}_${this.hour}`;
    this._lastMinute = this.minute;
  }

  _advanceGameSeconds(gameDeltaSeconds) {
    const prevDayKey = this._lastDayKey;
    const prevHourKey = this._lastHourKey;
    const prevEpochDay = Math.floor(this.epochSeconds / 86400);

    this.epochSeconds += gameDeltaSeconds;
    this._syncDateFields();

    const curEpochDay = Math.floor(this.epochSeconds / 86400);
    const curDayKey = this.getDayKey();
    const curHourKey = `${curDayKey}_${this.hour}`;

    // Nếu nhảy nhiều ngày (ví dụ qua tuần), kích hoạt onDayChange đúng số ngày và không bao giờ lặp key
    if (curEpochDay > prevEpochDay) {
      const daysPassed = curEpochDay - prevEpochDay;
      this.weather = WEATHERS[(this.day + this.month) % WEATHERS.length];
      const evtKey = `day_${curDayKey}`;
      if (!this.firedEventKeys.has(evtKey)) {
        this.firedEventKeys.add(evtKey);
        if (this.firedEventKeys.size > 400) {
          const first = this.firedEventKeys.values().next().value;
          this.firedEventKeys.delete(first);
        }
        this.listeners.onDayChange.forEach((fn) => {
          try { fn({ daysPassed, date: this.getDateString(), dayKey: curDayKey, year: this.year, month: this.month, day: this.day }); } catch (_) {}
        });
      }
      this._lastDayKey = curDayKey;
    } else if (curDayKey !== prevDayKey) {
      this._lastDayKey = curDayKey;
    }

    if (curHourKey !== prevHourKey) {
      this._lastHourKey = curHourKey;
      this.listeners.onHour.forEach((fn) => {
        try { fn({ hour: this.hour, dayKey: curDayKey }); } catch (_) {}
      });
    }

    if (this.minute !== this._lastMinute) {
      this._lastMinute = this.minute;
      this.listeners.onMinute.forEach((fn) => {
        try { fn({ hour: this.hour, minute: this.minute }); } catch (_) {}
      });
    }

    return gameDeltaSeconds;
  }

  getDayKey() {
    return `${this.year}-${String(this.month).padStart(2, '0')}-${String(this.day).padStart(2, '0')}`;
  }

  getDateString() {
    return `${String(this.day).padStart(2, '0')}/${String(this.month).padStart(2, '0')}/${this.year}`;
  }

  getTimeString() {
    return `${String(this.hour).padStart(2, '0')}:${String(this.minute).padStart(2, '0')}`;
  }

  // Định dạng chuẩn yêu cầu: THỨ HAI – 15/07/2027 – 09:30
  getFullHudString() {
    return `${this.dayNameUpper} – ${this.getDateString()} – ${this.getTimeString()}`;
  }

  // Tính thời gian còn lại đến ngày thi đấu tiếp theo (dd/mm/yyyy)
  getCountdownToFixture(fixture) {
    if (!fixture || !fixture.date) return 'Đã hoàn thành mùa';
    const parts = fixture.date.split('/');
    if (parts.length !== 3) return fixture.date;
    const [dd, mm, yyyy] = parts.map(Number);
    const [hh, mi] = (fixture.time || '20:00').split(':').map(Number);
    const targetSec = Math.floor(Date.UTC(yyyy, mm - 1, dd, hh || 20, mi || 0, 0) / 1000);
    const diffSec = targetSec - this.epochSeconds;
    if (diffSec <= 0) return 'ĐẾN GIỜ THI ĐẤU!';
    const days = Math.floor(diffSec / 86400);
    const hrs = Math.floor((diffSec % 86400) / 3600);
    return days > 0 ? `Còn ${days} ngày ${hrs}g` : `Còn ${hrs} giờ`;
  }

  exportState() {
    return {
      epochSeconds: this.epochSeconds,
      speedMultiplier: this.speedMultiplier,
      userPaused: this.userPaused,
      weather: this.weather,
      firedEventKeys: Array.from(this.firedEventKeys).slice(-120)
    };
  }

  importState(snap) {
    if (!snap) return;
    if (typeof snap.epochSeconds === 'number') this.epochSeconds = snap.epochSeconds;
    if (snap.speedMultiplier) this.speedMultiplier = snap.speedMultiplier;
    this.userPaused = !!snap.userPaused;
    if (snap.weather) this.weather = snap.weather;
    this.firedEventKeys = new Set(Array.isArray(snap.firedEventKeys) ? snap.firedEventKeys : []);
    this.autoPauseReasons.clear();
    this.hiddenPaused = false;
    this._syncDateFields();
    this._lastDayKey = this.getDayKey();
    this._lastHourKey = `${this._lastDayKey}_${this.hour}`;
    this._lastMinute = this.minute;
  }
}
