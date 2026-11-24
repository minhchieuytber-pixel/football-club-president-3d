// src/club/ReputationSystem.js
// Hệ thống Uy Tín Chủ Tịch Phạm Minh Chiêu (6 trụ cột độc lập, đồng bộ hai chiều với president & brandMetrics)

export const REPUTATION_PILLARS = [
  { key: 'fanTrust', label: 'Uy tín người hâm mộ', short: 'CĐV', icon: '📣', color: '#38bdf8' },
  { key: 'playerTrust', label: 'Uy tín cầu thủ', short: 'Cầu thủ', icon: '⚽', color: '#4ade80' },
  { key: 'coachTrust', label: 'Uy tín HLV', short: 'HLV', icon: '👔', color: '#fbbf24' },
  { key: 'mediaTrust', label: 'Uy tín truyền thông', short: 'Báo chí', icon: '📺', color: '#f472b6' },
  { key: 'partnerTrust', label: 'Uy tín đối tác', short: 'Đối tác', icon: '🤝', color: '#a78bfa' },
  { key: 'governanceSkill', label: 'Năng lực quản trị', short: 'Quản trị', icon: '🏛️', color: '#facc15' }
];

const clamp = (v, min = 15, max = 100) => Math.max(min, Math.min(max, Math.round(v)));

export class ReputationSystem {
  constructor(state) {
    this.state = state;
    this.reset();
  }

  reset() {
    this.metrics = {
      fanTrust: 84,
      playerTrust: 86,
      coachTrust: 85,
      mediaTrust: 83,
      partnerTrust: 87,
      governanceSkill: 88
    };
    this.decisionLog = [];
    this._appliedKeys = new Set();
    this.syncToLegacyPresident();
  }

  getOverallScore() {
    const vals = Object.values(this.metrics);
    return Math.round(vals.reduce((s, v) => s + v, 0) / vals.length);
  }

  getTierLabel() {
    const avg = this.getOverallScore();
    if (avg >= 90) return 'Chủ tịch Huyền thoại Châu Âu';
    if (avg >= 82) return 'Lãnh đạo Xuất sắc';
    if (avg >= 72) return 'Điều hành Ổn định';
    if (avg >= 58) return 'Đang chịu Áp lực';
    return 'Khủng hoảng Tín nhiệm';
  }

  applyDelta(deltas = {}, reason = 'Quyết định điều hành', eventKey = null) {
    if (eventKey && this._appliedKeys.has(eventKey)) {
      return { applied: false, duplicate: true };
    }
    if (eventKey) {
      this._appliedKeys.add(eventKey);
      if (this._appliedKeys.size > 300) {
        const first = this._appliedKeys.values().next().value;
        this._appliedKeys.delete(first);
      }
    }

    const appliedDelta = {};
    let hasChange = false;
    REPUTATION_PILLARS.forEach(({ key }) => {
      const d = Number(deltas[key] || 0);
      if (d !== 0) {
        const prev = this.metrics[key];
        const next = clamp(prev + d);
        this.metrics[key] = next;
        appliedDelta[key] = next - prev;
        if (next !== prev) hasChange = true;
      }
    });

    this.syncToLegacyPresident();

    if (hasChange || reason) {
      this.decisionLog.unshift({
        id: `rep_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`,
        date: this.state?.timeSystem ? this.state.timeSystem.getDateString() : `Tuần ${this.state?.week || 1}`,
        reason,
        deltas: appliedDelta,
        overallAfter: this.getOverallScore()
      });
      if (this.decisionLog.length > 50) this.decisionLog.length = 50;
    }

    return { applied: true, deltas: appliedDelta, overall: this.getOverallScore() };
  }

  syncToLegacyPresident() {
    if (!this.state) return;
    if (this.state.president) {
      this.state.president.fanSupport = this.metrics.fanTrust;
      this.state.president.boardTrust = Math.round((this.metrics.governanceSkill + this.metrics.partnerTrust) / 2);
      this.state.president.prestige = this.getOverallScore();
    }
    if (this.state.brandMetrics) {
      this.state.brandMetrics.fanSatisfaction = this.metrics.fanTrust;
      this.state.brandMetrics.mediaInfluence = this.metrics.mediaTrust;
      this.state.brandMetrics.sponsorAppeal = this.metrics.partnerTrust;
      this.state.brandMetrics.globalReputation = this.getOverallScore();
    }
  }

  syncFromLegacyIfNeeded() {
    if (!this.state?.president) return;
    this.metrics.fanTrust = clamp(this.state.president.fanSupport ?? this.metrics.fanTrust);
  }

  exportState() {
    return {
      metrics: { ...this.metrics },
      decisionLog: this.decisionLog.slice(0, 40),
      appliedKeys: Array.from(this._appliedKeys).slice(-200)
    };
  }

  importState(snap) {
    if (!snap) return;
    if (snap.metrics) {
      REPUTATION_PILLARS.forEach(({ key }) => {
        if (typeof snap.metrics[key] === 'number') {
          this.metrics[key] = clamp(snap.metrics[key]);
        }
      });
    }
    this.decisionLog = Array.isArray(snap.decisionLog) ? snap.decisionLog.slice(0, 50) : [];
    this._appliedKeys = new Set(Array.isArray(snap.appliedKeys) ? snap.appliedKeys : []);
    this.syncToLegacyPresident();
  }
}
