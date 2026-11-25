// src/matchday/CoachMatchAI.js
// Hệ thống AI Huấn luyện viên Trưởng & Ban huấn luyện tự chủ chuyên môn trước và trong Matchday:
// - Đánh giá toàn bộ đội hình PSG: vị trí sở trường (PositionSuitabilityAI), OVR, phong độ, thể lực, mệt mỏi, chấn thương, treo giò & quan hệ nội bộ.
// - Tự động quyết định: Sơ đồ chiến thuật, 11 đá chính, Đội trưởng, Danh sách dự bị (tối đa 9), Cầu thủ vắng mặt, Cầu thủ không sử dụng & Lý do chuyên môn.
// - Trước trận: Chủ tịch CHỈ XEM, KHÔNG can thiệp/chỉnh sửa. Trong trận: HLV đề xuất thay người thông minh để Chủ tịch duyệt/từ chối.

import { FORMATION_PRESETS } from '../squad/SquadFormationSystem.js';
import {
  normalizePosition,
  POSITION_DISPLAY_LABEL
} from '../squad/PositionSuitabilityAI.js';
import { getPlayerPortraitDataUrl } from '../players/PlayerDatabase.js';

function getCoachPreferredFormation(coach, oppRating, psgAvgOvr, importance) {
  const style = String(coach?.tacticalStyle || coach?.formation || '').trim();
  const baseMatch = style.match(/\b(4-3-3|4-2-3-1|4-4-2|3-5-2|3-4-3|4-1-4-1|5-3-2|4-3-1-2)\b/);
  let chosen = baseMatch ? baseMatch[1] : '4-3-3';

  // HLV giàu kinh nghiệm chiến thuật điều chỉnh sơ đồ theo đối thủ & tầm quan trọng trận đấu
  const coachTactics = coach?.tactics || 85;
  if (coachTactics >= 84) {
    if (oppRating >= psgAvgOvr + 2 && importance >= 1.25) {
      chosen = chosen === '4-3-3' ? '4-2-3-1' : chosen;
    } else if (oppRating <= 77 && importance <= 1.0 && style.includes('Tấn công')) {
      chosen = '3-4-3';
    }
  }
  return FORMATION_PRESETS[chosen] ? chosen : '4-3-3';
}

function isPlayerAvailable(p) {
  return !!p && (p.injuryDays || 0) <= 0 && !p.suspended;
}

export class CoachMatchAI {
  static selectMatchdayLineup(state, fixture, options = {}) {
    const squad = state.getPsgSquad();
    const coach = state.coach || { name: 'Luis Enrique', tactics: 88, tacticalStyle: '4-3-3 Kiểm soát bóng' };
    const suitabilityAI = state.formationSystem?.suitabilityAI;
    const oppName = fixture.home === 'Paris Saint-Germain' ? fixture.away : fixture.home;
    const oppClub = state.clubs?.find((c) => c.name === oppName);
    const oppRating = oppClub?.rating || 79;
    const psgIsHome = fixture.home === 'Paris Saint-Germain';
    const importance = fixture.importance || 1.0;

    const availPool = squad.filter(isPlayerAvailable);
    const injured = squad.filter((p) => (p.injuryDays || 0) > 0);
    const suspended = squad.filter((p) => (p.injuryDays || 0) <= 0 && !!p.suspended);

    const avgOvr = availPool.length
      ? Math.round(availPool.slice(0, 14).reduce((s, p) => s + p.ovr, 0) / Math.min(14, availPool.length))
      : 84;

    const formation = getCoachPreferredFormation(coach, oppRating, avgOvr, importance);
    const presetSlots = FORMATION_PRESETS[formation] || FORMATION_PRESETS['4-3-3'];
    const tacticName = oppRating >= 86
      ? `${coach.tacticalStyle || 'Kiểm soát bóng'} (Chặt chẽ & Chuyển trạng thái)`
      : (importance >= 1.2 ? `${coach.tacticalStyle || 'Kiểm soát bóng'} (Áp đặt cường độ cao)` : `${coach.tacticalStyle || 'Kiểm soát bóng'}`);

    const ctx = {
      formation,
      tacticName,
      tacticalStyle: coach.tacticalStyle || tacticName,
      coachTacticalStyle: coach.tacticalStyle || tacticName
    };

    // Tích hợp cam kết / chỉ đạo hợp tác giữa Chủ tịch & HLV từ ClubRelationshipSystem
    const overrides = state.relationshipSystem?.getCoachMatchSelectionOverrides?.() || {
      boostStarterIds: new Set(),
      restPlayerIds: new Set(),
      naturalPosIds: new Set(),
      subOpportunityIds: new Set(),
      reduceMinutesIds: new Set()
    };

    const isLowPriorityMatch = importance < 1.05 || (oppRating <= 78 && psgIsHome);
    const relProfiles = state.relationshipSystem?.playerRelations || {};

    // Hàm chấm điểm ưu tiên chọn đá chính theo chuyên môn HLV AI
    const scoreCandidateForSlot = (player, slotRole) => {
      const suit = suitabilityAI
        ? suitabilityAI.evaluatePlayerAtPosition(player, slotRole, ctx)
        : { score: normalizePosition(player.position) === normalizePosition(slotRole) ? 98 : 65 };
      const suitScore = suit.score || 60;
      const fit = player.health?.fitness ?? 90;
      const fat = player.health?.fatigue ?? 15;
      const form = player.form ?? 76;
      const morale = player.morale ?? 80;
      const rel = relProfiles[player.id]?.metrics;
      const coachTrustBonus = rel ? ((rel.trustCoach - 65) * 0.08) : 0;

      // Trọng số thực chiến: độ phù hợp vị trí + OVR + phong độ + thể lực - quá tải
      let total =
        suitScore * 0.42 +
        player.ovr * 0.36 +
        form * 0.14 +
        fit * 0.12 -
        Math.max(0, fat - 48) * 0.35 +
        morale * 0.04 +
        coachTrustBonus;

      // Xoay tua thông minh khi gặp đối thủ yếu/cúp nhỏ hoặc cầu thủ quá tải
      if (isLowPriorityMatch && fat >= 60) total -= 12;
      if (isLowPriorityMatch && player.age <= 21 && (coach.youthDev || 80) >= 75) total += 4.5;
      if (fit < 68) total -= 18;

      // Áp dụng quyết định HLV từ ClubRelationshipSystem
      if (overrides.boostStarterIds?.has(player.id)) total += 16;
      if (overrides.restPlayerIds?.has(player.id)) total -= 42;
      if (overrides.naturalPosIds?.has(player.id) && normalizePosition(player.position) === normalizePosition(slotRole)) {
        total += 12;
      }

      return { total, suit };
    };

    const chosenIds = new Set();
    const starters = new Array(presetSlots.length).fill(null);

    // Ưu tiên chọn Thủ môn trước, sau đó các vị trí ít lựa chọn thay thế hơn để tránh trái sở trường
    const slotOrder = presetSlots
      .map((s, idx) => ({ idx, role: normalizePosition(s.role), x: s.x, y: s.y }))
      .sort((a, b) => {
        if (a.role === 'GK' && b.role !== 'GK') return -1;
        if (b.role === 'GK' && a.role !== 'GK') return 1;
        const cntA = availPool.filter((p) => normalizePosition(p.position) === a.role).length;
        const cntB = availPool.filter((p) => normalizePosition(p.position) === b.role).length;
        return cntA - cntB;
      });

    for (const sl of slotOrder) {
      let best = null;
      let bestVal = -Infinity;
      let bestSuit = null;
      for (const p of availPool) {
        if (chosenIds.has(p.id)) continue;
        // Không đưa cầu thủ ngoài sân vào GK trừ trường hợp bất khả kháng hết thủ môn
        if (sl.role === 'GK' && p.position !== 'GK' && availPool.some((k) => !chosenIds.has(k.id) && k.position === 'GK')) {
          continue;
        }
        if (sl.role !== 'GK' && p.position === 'GK' && availPool.some((k) => !chosenIds.has(k.id) && k.position !== 'GK')) {
          continue;
        }
        const { total, suit } = scoreCandidateForSlot(p, sl.role);
        if (total > bestVal) {
          bestVal = total;
          best = p;
          bestSuit = suit;
        }
      }
      if (best) {
        chosenIds.add(best.id);
        const reasons = [];
        if ((bestSuit?.score || 0) >= 90) reasons.push('Đúng sở trường');
        if ((best.form || 75) >= 82) reasons.push(`Phong độ cao (${best.form})`);
        if ((best.health?.fitness ?? 90) >= 86) reasons.push('Thể lực sung mãn');
        if (overrides.boostStarterIds?.has(best.id)) reasons.push('HLV ưu tiên theo kế hoạch');
        if (reasons.length === 0) reasons.push(`OVR ${best.ovr} đáp ứng tốt yêu cầu chiến thuật`);

        starters[sl.idx] = {
          slotIndex: sl.idx,
          playerId: best.id,
          name: best.name,
          shirtNumber: best.shirtNumber || (sl.idx + 1),
          position: best.position,
          assignedRole: sl.role,
          displayRole: POSITION_DISPLAY_LABEL[sl.role] || sl.role,
          formationX: sl.x,
          formationY: sl.y,
          ovr: best.ovr,
          age: best.age,
          form: best.form ?? 76,
          fitness: best.health?.fitness ?? 90,
          fatigue: best.health?.fatigue ?? 15,
          morale: best.morale ?? 80,
          suitabilityScore: bestSuit?.score ?? 85,
          avatar: best.avatarSvg || getPlayerPortraitDataUrl(best),
          selectionReason: reasons.join(' · '),
          player: best
        };
      }
    }

    const validStarters = starters.filter(Boolean);
    const avgSuitability = validStarters.length
      ? Math.round(validStarters.reduce((s, x) => s + x.suitabilityScore, 0) / validStarters.length)
      : 85;

    // Chọn Đội trưởng: ưu tiên Marquinhos / đội trưởng hiện tại nếu đá chính, hoặc cầu thủ có kinh nghiệm & uy tín cao nhất
    const currentCapId = state.formationSystem?.captainId;
    let captainSlot = validStarters.find((s) => s.playerId === currentCapId)
      || validStarters.find((s) => s.name === 'Marquinhos')
      || [...validStarters].sort((a, b) => (b.ovr + (b.age >= 26 ? 6 : 0)) - (a.ovr + (a.age >= 26 ? 6 : 0)))[0]
      || null;
    const captainId = captainSlot?.playerId || null;
    if (captainSlot) captainSlot.isCaptain = true;

    // Danh sách dự bị (tối đa 9 cầu thủ khỏe mạnh, gồm tối thiểu 1 thủ môn dự bị nếu có)
    const remainingAvail = availPool.filter((p) => !chosenIds.has(p.id));
    remainingAvail.sort((a, b) => {
      const aPri = (overrides.subOpportunityIds?.has(a.id) ? 14 : 0) + (overrides.restPlayerIds?.has(a.id) ? -8 : 0);
      const bPri = (overrides.subOpportunityIds?.has(b.id) ? 14 : 0) + (overrides.restPlayerIds?.has(b.id) ? -8 : 0);
      return (b.ovr * 0.75 + (b.form ?? 75) * 0.25 + bPri) - (a.ovr * 0.75 + (a.form ?? 75) * 0.25 + aPri);
    });

    const benchPlayers = [];
    const subGk = remainingAvail.find((p) => p.position === 'GK');
    if (subGk) benchPlayers.push(subGk);
    for (const p of remainingAvail) {
      if (benchPlayers.length >= 9) break;
      if (!benchPlayers.includes(p)) benchPlayers.push(p);
    }
    const benchIds = new Set(benchPlayers.map((p) => p.id));

    const bench = benchPlayers.map((p) => ({
      playerId: p.id,
      name: p.name,
      shirtNumber: p.shirtNumber || 99,
      position: p.position,
      displayPosition: POSITION_DISPLAY_LABEL[normalizePosition(p.position)] || p.position,
      ovr: p.ovr,
      age: p.age,
      form: p.form ?? 75,
      fitness: p.health?.fitness ?? 90,
      fatigue: p.health?.fatigue ?? 15,
      avatar: p.avatarSvg || getPlayerPortraitDataUrl(p),
      benchNote: overrides.subOpportunityIds?.has(p.id)
        ? 'Phương án vào sân hiệp 2 theo kế hoạch BHL'
        : overrides.restPlayerIds?.has(p.id)
          ? 'Được cho ngồi dự bị giữ thể lực'
          : (p.age <= 21 ? 'Tài năng trẻ sẵn sàng tạo đột biến' : 'Dự bị chiến lược'),
      player: p
    }));

    const unavailable = [
      ...injured.map((p) => ({
        playerId: p.id,
        name: p.name,
        shirtNumber: p.shirtNumber || '-',
        position: p.position,
        ovr: p.ovr,
        status: 'Chấn thương',
        detail: `${p.health?.injuryType || 'Chấn thương'} · Nghỉ ${p.injuryDays} ngày`,
        avatar: p.avatarSvg || getPlayerPortraitDataUrl(p)
      })),
      ...suspended.map((p) => ({
        playerId: p.id,
        name: p.name,
        shirtNumber: p.shirtNumber || '-',
        position: p.position,
        ovr: p.ovr,
        status: 'Treo giò',
        detail: 'Bị cấm thi đấu 1 trận do án kỷ luật / thẻ đỏ',
        avatar: p.avatarSvg || getPlayerPortraitDataUrl(p)
      }))
    ];

    const unused = remainingAvail
      .filter((p) => !benchIds.has(p.id))
      .map((p) => {
        let reason = 'Không nằm trong danh sách 20 cầu thủ đăng ký trận này';
        if ((p.health?.fitness ?? 90) < 70) reason = `Thể lực thấp (${p.health?.fitness ?? 70}%), cần hồi phục thêm`;
        else if (overrides.restPlayerIds?.has(p.id)) reason = 'Được HLV cho nghỉ hoàn toàn để hồi phục thể trạng';
        else if (p.age <= 20) reason = 'Cầu thủ trẻ tiếp tục tích lũy ở đội hình dự phòng';
        return {
          playerId: p.id,
          name: p.name,
          shirtNumber: p.shirtNumber || '-',
          position: p.position,
          ovr: p.ovr,
          form: p.form ?? 74,
          fitness: p.health?.fitness ?? 90,
          reason,
          avatar: p.avatarSvg || getPlayerPortraitDataUrl(p)
        };
      });

    // Lý do chuyên môn đầy đủ của HLV trưởng
    const restedNames = validStarters.length > 0
      ? squad.filter((p) => overrides.restPlayerIds?.has(p.id)).map((p) => p.name)
      : [];
    const rotatedTired = remainingAvail.filter((p) => (p.health?.fatigue ?? 0) >= 60).map((p) => p.name);
    const coachRationale = [
      `HLV trưởng ${coach.name} lựa chọn sơ đồ ${formation} (${tacticName}) ${psgIsHome ? 'tại Parc des Princes' : `trên sân khách gặp ${oppName} (OVR ${oppRating})`}.`,
      `Độ phù hợp chiến thuật AI của 11 đá chính đạt ${avgSuitability}/100; ${captainSlot ? `${captainSlot.name} mang băng đội trưởng.` : ''}`,
      injured.length + suspended.length > 0
        ? `Vắng mặt bất khả kháng: ${[...injured.map((p) => `${p.name} (CT ${p.injuryDays}n)`), ...suspended.map((p) => `${p.name} (Treo giò)`)].join(', ')}.`
        : 'Toàn bộ trụ cột đều đủ điều kiện ra sân, không có ca chấn thương hay treo giò.',
      restedNames.length > 0
        ? `Áp dụng điều chỉnh nghỉ ngơi cho: ${restedNames.join(', ')}.`
        : (rotatedTired.length > 0 ? `Xoay tua giữ sức cho ${rotatedTired.slice(0, 2).join(', ')} trên băng ghế dự bị.` : 'Giữ bộ khung mạnh nhất để kiểm soát thế trận ngay từ đầu.')
    ];

    return {
      formation,
      tacticName,
      captainId,
      captainName: captainSlot?.name || '',
      avgSuitability,
      starters: validStarters,
      bench,
      unavailable,
      unused,
      coachName: coach.name,
      coachRationale,
      overrides,
      lockNote: 'Toàn bộ đội hình, sơ đồ, băng đội trưởng và danh sách đăng ký do HLV Trưởng & Ban huấn luyện quyết định trước trận.'
    };
  }

  // Đề xuất thay người trực tiếp trong trận của HLV Trưởng dựa trên diễn biến thực tế
  static generateLiveSubSuggestion(liveSession, state) {
    if (!liveSession || liveSession.subsUsed >= liveSession.maxSubs) return null;
    const onPitch = liveSession.activeStarters.filter((s) => !s.redCarded && s.assignedRole !== 'GK');
    const availBench = liveSession.bench.filter(
      (b) => !liveSession.subbedInIds.includes(b.playerId) && !liveSession.subbedOutIds.includes(b.playerId) && b.position !== 'GK'
    );
    if (onPitch.length === 0 || availBench.length === 0) return null;

    const overrides = liveSession.plan?.overrides;
    // Chọn cầu thủ cần rút ra: thẻ vàng + mệt, hoặc reduceMinutes, hoặc stamina thấp nhất
    const outSorted = [...onPitch].sort((a, b) => {
      const aScore = (a.yellowCard ? 28 : 0) + (overrides?.reduceMinutesIds?.has(a.playerId) ? 24 : 0) + (100 - a.liveStamina) - a.liveRating * 4;
      const bScore = (b.yellowCard ? 28 : 0) + (overrides?.reduceMinutesIds?.has(b.playerId) ? 24 : 0) + (100 - b.liveStamina) - b.liveRating * 4;
      return bScore - aScore;
    });
    const outTarget = outSorted[0];
    if (!outTarget) return null;

    // Chọn cầu thủ dự bị phù hợp nhất thay thế
    const suitabilityAI = state.formationSystem?.suitabilityAI;
    const ctx = { formation: liveSession.plan.formation, tacticName: liveSession.plan.tacticName };
    const inSorted = [...availBench].sort((a, b) => {
      const sA = suitabilityAI ? suitabilityAI.evaluatePlayerAtPosition(a.player, outTarget.assignedRole, ctx).score : (a.position === outTarget.assignedRole ? 95 : 70);
      const sB = suitabilityAI ? suitabilityAI.evaluatePlayerAtPosition(b.player, outTarget.assignedRole, ctx).score : (b.position === outTarget.assignedRole ? 95 : 70);
      const bonusA = overrides?.subOpportunityIds?.has(a.playerId) ? 18 : 0;
      const bonusB = overrides?.subOpportunityIds?.has(b.playerId) ? 18 : 0;
      return (sB * 0.55 + b.ovr * 0.45 + bonusB) - (sA * 0.55 + a.ovr * 0.45 + bonusA);
    });
    const inTarget = inSorted[0];
    if (!inTarget) return null;

    const reasonParts = [];
    if (outTarget.yellowCard) reasonParts.push('đang dính thẻ vàng');
    if (outTarget.liveStamina < 64) reasonParts.push(`thể lực xuống ${Math.round(outTarget.liveStamina)}%`);
    if (overrides?.reduceMinutesIds?.has(outTarget.playerId)) reasonParts.push('theo kế hoạch giữ sức');
    if (reasonParts.length === 0) reasonParts.push('làm mới sức tấn công/kiểm soát tuyến');

    return {
      id: `csug_${liveSession.minute}_${outTarget.playerId}_${inTarget.playerId}`,
      minute: liveSession.minute,
      slotIndex: outTarget.slotIndex,
      outPlayerId: outTarget.playerId,
      outName: outTarget.name,
      inPlayerId: inTarget.playerId,
      inName: inTarget.name,
      role: outTarget.displayRole,
      reason: `HLV ${liveSession.plan.coachName} đề xuất rút ${outTarget.name} (${reasonParts.join(', ')}) để tung ${inTarget.name} (${inTarget.displayPosition}, OVR ${inTarget.ovr}) vào sân.`,
      status: 'pending'
    };
  }
}
