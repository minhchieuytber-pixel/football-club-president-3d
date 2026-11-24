// src/training/PlayerDevelopmentSystem.js
// Hệ thống phát triển chỉ số cầu thủ khoa học phụ thuộc vào: Tuổi, Tiềm năng, Chất lượng Ban huấn luyện, Cường độ tập, Thái độ, Thể lực & Phục hồi.
// Không tăng chỉ số đồng đều hay quá nhanh; tập quá nặng gây giảm thể lực, tăng mệt mỏi & nguy cơ chấn thương.
import { recalculatePlayerOverall } from '../players/PlayerDatabase.js';

export class PlayerDevelopmentSystem {
  constructor(state) {
    this.state = state;
  }

  // Đánh giá 1 buổi tập hoàn chỉnh cho toàn đội một PSG -> cập nhật thể lực, mệt mỏi, chỉ số từng cầu thủ & trả về kết quả cá nhân
  evaluateTrainingSession(drillsExecuted, intensity = 'Trung bình', dateLabel = '') {
    const squad = this.state.getPsgSquad();
    const coaching = this.state.coachingSystem
      ? this.state.coachingSystem.getTrainingQualityMultipliers()
      : { overall: 1.0, fitness: 1.0, technical: 1.0, tactical: 1.0, gk: 1.0, setPieces: 1.0, rehab: 1.0, youthDev: 1.0 };

    const intensityCfg = {
      'Hồi phục':   { load: -10, fitDelta: +9, gainMult: 0.35, injuryRiskAdd: -4 },
      'Nhẹ':        { load: 4,   fitDelta: +2, gainMult: 0.72, injuryRiskAdd: -1 },
      'Trung bình': { load: 11,  fitDelta: -4, gainMult: 1.0,  injuryRiskAdd: 1 },
      'Cao':        { load: 21,  fitDelta: -11, gainMult: 1.28, injuryRiskAdd: 5 }
    }[intensity] || { load: 11, fitDelta: -4, gainMult: 1.0, injuryRiskAdd: 1 };

    const results = [];
    const injuriesTriggered = [];

    squad.forEach((p) => {
      if (!p.health) p.health = { fitness: 88, matchFitness: 85, fatigue: 15, injuryRisk: 8, injuryDays: 0, recoveryNeeded: false };
      if (!p.attributes) return;

      // Cầu thủ đang chấn thương tập phục hồi cùng HLV phục hồi & Bộ phận Y tế
      if ((p.injuryDays || 0) > 0) {
        const rehabBonus = coaching.rehab >= 1.05 ? 1 : 0;
        p.health.fatigue = Math.max(0, p.health.fatigue - 12);
        p.health.fitness = Math.min(95, p.health.fitness + 5 + rehabBonus * 2);
        results.push({
          playerId: p.id, name: p.name, position: p.position,
          participated: false, rating: 0, status: `Đang phục hồi chấn thương (${p.injuryDays} ngày)`,
          changes: [], overloaded: false
        });
        return;
      }

      // Kiểm tra quá tải trước buổi tập
      const preOverloaded = p.health.fitness < 68 || p.health.fatigue > 62;
      const overloadPenalty = preOverloaded && intensity === 'Cao' ? 0.45 : preOverloaded ? 0.72 : 1.0;

      // Cập nhật thể lực, match fitness & mức độ mệt mỏi
      const staminaMitigation = ((p.attributes.mid?.stamina || 75) - 70) * 0.08;
      p.health.fatigue = Math.max(0, Math.min(100, Math.round(p.health.fatigue + intensityCfg.load - staminaMitigation * 0.3)));
      p.health.fitness = Math.max(35, Math.min(100, Math.round(p.health.fitness + intensityCfg.fitDelta + (intensity === 'Hồi phục' ? coaching.rehab * 3 : 0))));
      p.health.matchFitness = Math.max(45, Math.min(100, Math.round(p.health.matchFitness + (intensity === 'Hồi phục' ? 1 : 3))));
      p.health.injuryRisk = Math.max(3, Math.min(65, Math.round(
        6 + p.health.fatigue * 0.35 + (100 - p.health.fitness) * 0.25 + intensityCfg.injuryRiskAdd - (coaching.rehab - 1) * 10
      )));
      p.health.recoveryNeeded = p.health.fitness < 72 || p.health.fatigue > 58;

      // Rủi ro chấn thương do tập quá nặng khi thể lực yếu
      if (intensity === 'Cao' && p.health.fitness < 66 && Math.random() < (p.health.injuryRisk / 220)) {
        const days = 5 + Math.floor(Math.random() * 10);
        p.injuryDays = days;
        p.health.injuryDays = days;
        p.health.injuryType = 'Quá tải cơ bắp (tập luyện cường độ cao)';
        p.career?.injuryHistory?.unshift({ date: dateLabel || 'Hôm nay', type: p.health.injuryType, days });
        injuriesTriggered.push({ playerId: p.id, name: p.name, days, type: p.health.injuryType });
      }

      // Tính tốc độ phát triển cá nhân (tuổi trẻ + khoảng cách tới POT + thái độ chuyên nghiệp + chất lượng BHL)
      const ageFactor = p.age <= 20 ? 1.45 : p.age <= 23 ? 1.2 : p.age <= 27 ? 0.85 : p.age <= 30 ? 0.48 : 0.2;
      const roomToGrow = Math.max(0, (p.pot || p.ovr) - p.ovr);
      const potFactor = roomToGrow >= 8 ? 1.35 : roomToGrow >= 4 ? 1.05 : roomToGrow >= 1 ? 0.72 : 0.22;
      const profFactor = (p.professionalism || 78) / 80;
      const coachFactor = coaching.overall;

      const baseChance = 0.22 * ageFactor * potFactor * profFactor * coachFactor * intensityCfg.gainMult * overloadPenalty;
      const changes = [];
      const prevOvr = p.ovr;

      const tryBoost = (bucket, key, label, specMult = 1.0) => {
        if (!bucket || typeof bucket[key] !== 'number') return;
        if (bucket[key] >= Math.min(99, (p.pot || 95) + 2)) return;
        const prob = Math.min(0.75, baseChance * specMult);
        if (Math.random() < prob) {
          bucket[key] = Math.min(99, bucket[key] + 1);
          changes.push(`${label} +1`);
        }
      };

      // Áp dụng tiến bộ theo đúng loại bài tập đã thực hiện trong buổi!
      if (p.position === 'GK') {
        tryBoost(p.attributes.gk, 'reflexes', 'Phản xạ', coaching.gk);
        tryBoost(p.attributes.gk, 'handling', 'Bắt bóng', coaching.gk);
        tryBoost(p.attributes.gk, 'diving', 'Đổ người', coaching.gk);
        tryBoost(p.attributes.gk, 'positioning', 'Chọn vị trí GK', coaching.gk);
      } else {
        drillsExecuted.forEach((drill) => {
          if (drill === 'fitness') {
            tryBoost(p.attributes.mid, 'stamina', 'Thể lực', coaching.fitness);
            tryBoost(p.attributes.training, 'acceleration', 'Tăng tốc', coaching.fitness);
            tryBoost(p.attributes.training, 'sprintSpeed', 'Tốc độ bứt tốc', coaching.fitness);
            tryBoost(p.attributes.training, 'agility', 'Khéo léo', coaching.fitness);
            p.attributes.def.pace = Math.round((p.attributes.training.acceleration + p.attributes.training.sprintSpeed) / 2);
            p.attributes.att.pace = p.attributes.def.pace;
          } else if (drill === 'shooting') {
            tryBoost(p.attributes.att, 'finishing', 'Dứt điểm', coaching.technical);
            tryBoost(p.attributes.training, 'shotPower', 'Lực sút', coaching.technical);
            tryBoost(p.attributes.training, 'longShots', 'Sút xa', coaching.technical);
            tryBoost(p.attributes.training, 'volleys', 'Vô-lê', coaching.technical);
            tryBoost(p.attributes.training, 'composure', 'Bình tĩnh', coaching.technical);
          } else if (drill === 'passing') {
            tryBoost(p.attributes.mid, 'shortPassing', 'Chuyền ngắn', coaching.technical);
            tryBoost(p.attributes.mid, 'longPassing', 'Chuyền dài', coaching.technical);
            tryBoost(p.attributes.mid, 'vision', 'Tầm nhìn', coaching.tactical);
            tryBoost(p.attributes.mid, 'ballControl', 'Kiểm soát bóng', coaching.technical);
            tryBoost(p.attributes.mid, 'ballRetention', 'Giữ bóng', coaching.technical);
          } else if (drill === 'tactics') {
            tryBoost(p.attributes.training, 'tacticalAwareness', 'Tư duy chiến thuật', coaching.tactical);
            tryBoost(p.attributes.att, 'positioning', 'Chọn vị trí tấn công', coaching.tactical);
            tryBoost(p.attributes.def, 'positioning', 'Chọn vị trí phòng ngự', coaching.tactical);
          } else if (drill === 'defending') {
            tryBoost(p.attributes.def, 'marking', 'Kèm người', coaching.tactical);
            tryBoost(p.attributes.def, 'tackling', 'Tắc bóng', coaching.tactical);
            tryBoost(p.attributes.def, 'interceptions', 'Cắt bóng', coaching.tactical);
            tryBoost(p.attributes.def, 'duels', 'Tranh chấp', coaching.fitness);
          } else if (drill === 'set_pieces') {
            tryBoost(p.attributes.att, 'aerial', 'Không chiến', coaching.setPieces);
            tryBoost(p.attributes.training, 'shotPower', 'Đá phạt', coaching.setPieces);
            tryBoost(p.attributes.mid, 'longPassing', 'Tạt phạt góc', coaching.setPieces);
          } else if (drill === 'scrimmage') {
            tryBoost(p.attributes.training, 'composure', 'Bản lĩnh đấu tập', coaching.overall);
            tryBoost(p.attributes.att, 'dribbling', 'Rê bóng', coaching.technical);
            tryBoost(p.attributes.att, 'chanceCreation', 'Tạo cơ hội', coaching.tactical);
          }
        });
      }

      // Giới hạn tối đa 2 chỉ số tăng trong 1 buổi tập để phát triển chân thực, không ảo
      if (changes.length > 2) changes.length = 2;

      const nextOvr = recalculatePlayerOverall(p);
      if (nextOvr > prevOvr) {
        changes.unshift(`⭐ OVR ${prevOvr} → ${nextOvr}`);
      }

      // Điểm đánh giá buổi tập cá nhân (5.8 – 9.4)
      const perfScore = +(
        6.4 +
        (p.health.fitness / 100) * 1.1 +
        ((p.professionalism || 75) / 100) * 0.9 +
        (changes.length * 0.35) -
        (preOverloaded ? 0.7 : 0) +
        (Math.random() - 0.45) * 0.8
      ).toFixed(1);
      const clampedRating = Math.max(5.5, Math.min(9.5, perfScore));

      // Tác động nhẹ tới phong độ & tinh thần
      if (clampedRating >= 8.0) {
        p.form = Math.min(99, (p.form || 75) + 1);
        p.morale = Math.min(100, (p.morale || 80) + 1);
      } else if (preOverloaded) {
        p.morale = Math.max(40, (p.morale || 80) - 2);
      }
      if (p.psychology) p.psychology.morale = p.morale;

      if (changes.length > 0) {
        if (!p.developmentLog) p.developmentLog = [];
        p.developmentLog.unshift({ date: dateLabel || 'Hôm nay', intensity, changes });
        if (p.developmentLog.length > 15) p.developmentLog.pop();
      }

      results.push({
        playerId: p.id,
        name: p.name,
        position: p.position,
        participated: true,
        rating: clampedRating,
        fitness: p.health.fitness,
        fatigue: p.health.fatigue,
        recoveryNeeded: p.health.recoveryNeeded,
        changes,
        overloaded: p.health.recoveryNeeded,
        status: p.health.recoveryNeeded ? 'Cần giảm tải / phục hồi' : clampedRating >= 8.0 ? 'Tập xuất sắc' : 'Hoàn thành tốt'
      });
    });

    return { results, injuriesTriggered };
  }
}
