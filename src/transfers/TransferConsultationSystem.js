// src/transfers/TransferConsultationSystem.js
// HỆ THỐNG THAM VẤN CÁC BỘ PHẬN KHI NHẬN ĐỀ NGHỊ CHUYỂN NHƯỢNG CẦU THỦ
// Bổ sung quy trình tham vấn nội bộ đa góc độ cho Chủ tịch PSG trước khi quyết định bán/mượn/giữ/thương lượng.
// Tuyệt đối không tự động chấp nhận, không tự động từ chối, không quyết định thay Chủ tịch theo số đông.

import { normalizePosition, getPositionGroup } from '../squad/PositionSuitabilityAI.js';
import { NPCPersonalitySystem } from '../dialogue/DialogueSystem.js';

export const SD_RECOMMENDATIONS = {
  SELL: 'Nên bán',
  SELL_HIGHER: 'Nên bán nếu đạt mức giá cao hơn',
  SELL_WITH_REPLACEMENT: 'Chỉ bán khi tìm được người thay thế',
  KEEP: 'Nên giữ lại',
  NEVER_SELL_NOW: 'Tuyệt đối không nên bán ở thời điểm hiện tại'
};

export const COACH_RECOMMENDATIONS = {
  AGREE_SELL: 'Đồng ý bán',
  AGREE_WITH_REPLACEMENT: 'Đồng ý bán nếu có người thay thế',
  SELL_END_OF_SEASON: 'Chỉ bán sau khi kết thúc mùa giải',
  DISAGREE_SELL: 'Không đồng ý bán',
  RAISE_PRICE_FIRST: 'Đề nghị tăng giá trước khi quyết định'
};

export const CONSULTATION_DECISIONS = {
  ACCEPT: 'accept',
  REJECT: 'reject',
  COUNTER_FEE: 'counter_fee',
  COUNTER_CLAUSES: 'counter_clauses',
  REQUIRE_REPLACEMENT: 'require_replacement',
  DEFER: 'defer',
  REEVALUATE: 'reevaluate'
};

function clamp(val, lo, hi) {
  return Math.max(lo, Math.min(hi, val));
}

export function normalizeBidObject(bid, player = null) {
  if (!bid) return null;
  const mv = player?.valuation?.current ?? player?.value ?? bid.marketValue ?? bid.fee ?? bid.offerFee ?? 20;
  const askingPrice = bid.askingPrice ?? player?.valuation?.askingPrice ?? Math.round(mv * 1.18);
  const fee = Number(bid.fee ?? bid.offerFee ?? mv);
  const dealType = bid.dealType || bid.type || 'buy';
  const buyerClub = bid.buyerClub || bid.fromClub || 'CLB đối tác';
  const clauses = bid.clauses && typeof bid.clauses === 'object'
    ? {
        sellOnPct: Number(bid.clauses.sellOnPct || 0),
        bonusFee: Number(bid.clauses.bonusFee || 0),
        paymentTerms: bid.clauses.paymentTerms || (dealType === 'loan' ? 'Chia 60% quỹ lương' : (fee >= 30 ? '65% trả trước + 35% trả góp' : '100% trả trước')),
        extraNotes: Array.isArray(bid.clauses.extraNotes) ? [...bid.clauses.extraNotes] : []
      }
    : {
        sellOnPct: 0,
        bonusFee: 0,
        paymentTerms: dealType === 'loan' ? 'Chia 60% quỹ lương' : (fee >= 30 ? '65% trả trước + 35% trả góp' : '100% trả trước'),
        extraNotes: []
      };
  return {
    id: bid.id,
    playerId: bid.playerId || player?.id,
    playerName: bid.playerName || player?.name || 'Cầu thủ PSG',
    position: bid.position || player?.position || 'CM',
    ovr: bid.ovr ?? player?.ovr ?? 80,
    buyerClub,
    buyerStrategy: bid.buyerStrategy || 'Tăng cường đội hình',
    dealType,
    fee,
    askingPrice,
    marketValue: mv,
    buyOptionFee: Number(bid.buyOptionFee || 0),
    clauses,
    deadlineWeek: bid.deadlineWeek || null,
    deadlineDate: bid.deadlineDate || (bid.deadlineWeek ? `Cuối Tuần ${bid.deadlineWeek}` : 'Trước khi đóng kỳ chuyển nhượng'),
    rounds: bid.rounds || 0,
    status: bid.status || 'pending'
  };
}

export function formatBidClausesText(bid) {
  const norm = normalizeBidObject(bid);
  if (!norm) return 'Không có điều khoản phụ';
  const items = [];
  if (norm.dealType === 'loan') {
    items.push(norm.buyOptionFee > 0 ? `Kèm tùy chọn mua đứt €${norm.buyOptionFee}M` : 'Cho mượn thuần túy (không mua đứt)');
  }
  if (norm.clauses.sellOnPct > 0) items.push(`${norm.clauses.sellOnPct}% phí bán lại tương lai`);
  if (norm.clauses.bonusFee > 0) items.push(`+€${norm.clauses.bonusFee}M thưởng thành tích`);
  if (norm.clauses.paymentTerms) items.push(norm.clauses.paymentTerms);
  if (norm.clauses.extraNotes?.length) items.push(...norm.clauses.extraNotes);
  return items.length ? items.join(' · ') : 'Thanh toán tiêu chuẩn';
}

export class TransferConsultationSystem {
  constructor(state) {
    this.state = state;
    this.consultations = [];
    this.replacementWatchlist = [];
  }

  _dateStr() {
    return this.state.timeSystem?.getDateString?.() || `Tuần ${this.state.week || 1} · ${this.state.season || '2025/26'}`;
  }

  _resolveActiveStaff() {
    const active = this.state.staffDb?.active || [];
    const findRole = (...keys) => {
      for (const k of keys) {
        const found = active.find((s) => s.roleKey === k && s.status !== 'departed');
        if (found) return found;
      }
      return null;
    };

    const hcStaff = findRole('head_coach');
    const headCoach = hcStaff || {
      staffId: 'stf_hc_fallback',
      roleKey: 'head_coach',
      role: 'HLV Trưởng',
      name: this.state.coach?.name || 'HLV Trưởng PSG',
      personality: 'Thẳng thắn',
      tacticalStyle: this.state.coach?.formation || '4-3-3 Kiểm soát bóng',
      ratings: { tactics: 88, management: 86, analysis: 85, fitness: 82 },
      relation: this.state.relationshipSystem?.chairmanCoachTrust ?? 78
    };

    const sportingDirector = findRole('sporting_director') || {
      staffId: 'stf_sd_fallback',
      roleKey: 'sporting_director',
      role: 'Giám Đốc Thể Thao',
      name: 'Giám đốc Thể thao PSG',
      personality: 'Tham vọng',
      tacticalStyle: 'Cân bằng tài chính & giá trị tài sản CLB',
      ratings: { scouting: 90, analysis: 87, management: 88 },
      relation: 82
    };

    const tacticalCoach = findRole('tactical_coach', 'tactical_analyst', 'assistant_manager') || {
      staffId: 'stf_tc_fallback',
      roleKey: 'tactical_coach',
      role: 'Trợ Lý Phân Tích Chiến Thuật',
      name: 'Trợ lý Chiến thuật PSG',
      personality: 'Cẩn thận',
      tacticalStyle: 'Cấu trúc cự ly đội hình & vai trò chuyên biệt',
      ratings: { tactics: 86, analysis: 88, technical: 80 },
      relation: 80
    };

    const fitnessCoach = findRole('fitness_coach', 'rehab_coach', 'head_medical') || {
      staffId: 'stf_fc_fallback',
      roleKey: 'fitness_coach',
      role: 'Trợ Lý Thể Lực',
      name: 'Trợ lý Thể lực PSG',
      personality: 'Thẳng thắn',
      tacticalStyle: 'Kiểm soát tải vận động & phòng chống chấn thương',
      ratings: { fitness: 88, medical: 84, analysis: 80 },
      relation: 80
    };

    const devCoach = findRole('individual_dev_coach', 'technical_coach', 'academy_director') || {
      staffId: 'stf_dev_fallback',
      roleKey: 'individual_dev_coach',
      role: 'Trợ Lý Phát Triển Cầu Thủ',
      name: 'HLV Phát triển Cá nhân PSG',
      personality: 'Nhiệt tình',
      tacticalStyle: 'Phát huy tiềm năng trẻ & cầu nối Học viện',
      ratings: { technical: 85, scouting: 80, analysis: 82 },
      youthDev: 88,
      relation: 82
    };

    const gkCoach = findRole('gk_coach', 'asst_gk_coach') || {
      staffId: 'stf_gk_fallback',
      roleKey: 'gk_coach',
      role: 'HLV Thủ Môn',
      name: 'HLV Thủ môn PSG',
      personality: 'Cẩn thận',
      tacticalStyle: 'Phản xạ, chơi chân & chỉ huy vòng cấm',
      ratings: { gk: 90, tactics: 78, technical: 82 },
      relation: 80
    };

    return { sportingDirector, headCoach, tacticalCoach, fitnessCoach, devCoach, gkCoach };
  }

  _gatherContext(rawBid) {
    const p = this.state.getPlayerById?.(rawBid.playerId) || this.state.players?.find((x) => x.id === rawBid.playerId);
    if (!p) return null;

    const bid = normalizeBidObject(rawBid, p);
    const squad = this.state.getPsgSquad ? this.state.getPsgSquad() : (this.state.players || []).filter((x) => x.club === 'Paris Saint-Germain');
    const normPos = normalizePosition(p.position);
    const posGroup = getPositionGroup(normPos);
    const starterIds = this.state.formationSystem?.starterIds || [];
    const isStarter = starterIds.includes(p.id);

    const samePosPlayers = squad
      .filter((x) => x.id !== p.id && normalizePosition(x.position) === normPos)
      .sort((a, b) => (b.ovr || 0) - (a.ovr || 0));
    const sameGroupPlayers = squad
      .filter((x) => x.id !== p.id && getPositionGroup(normalizePosition(x.position)) === posGroup)
      .sort((a, b) => (b.ovr || 0) - (a.ovr || 0));

    const bestBackup = samePosPlayers[0] || sameGroupPlayers[0] || null;
    const backupOvrGap = bestBackup ? (p.ovr || 75) - (bestBackup.ovr || 70) : 14;
    const squadAvgOvr = squad.length ? +(squad.reduce((s, x) => s + (x.ovr || 75), 0) / squad.length).toFixed(1) : 82;

    const marketValue = Math.max(1, p.valuation?.current ?? p.value ?? bid.marketValue ?? 15);
    const askingPrice = Math.max(marketValue, bid.askingPrice ?? p.valuation?.askingPrice ?? Math.round(marketValue * 1.18));
    const offerFee = Math.max(0.5, bid.fee);
    const effectiveTotalFee = offerFee + (bid.clauses?.bonusFee || 0) * 0.6;
    const offerRatio = bid.dealType === 'loan'
      ? ((bid.buyOptionFee || marketValue * 0.9) / marketValue)
      : (offerFee / marketValue);
    const askRatio = bid.dealType === 'loan'
      ? (offerFee / Math.max(1, marketValue * 0.14))
      : (offerFee / Math.max(1, askingPrice));

    const contractYears = Number(p.contractYears ?? p.contract?.contractYears ?? 3);
    const wage = Number(p.wage ?? p.contract?.weeklyWage ?? 60);
    const annualWageM = +((wage * 52) / 1000).toFixed(2);
    const age = Number(p.age ?? 25);
    const ovr = Number(p.ovr ?? 80);
    const pot = Math.max(ovr, Number(p.pot ?? ovr));
    const growthRoom = pot - ovr;

    const form = Number(p.form ?? p.morale ?? 78);
    const fitness = Number(p.health?.fitness ?? p.fitness ?? 88);
    const fatigue = Number(p.health?.fatigue ?? p.fatigue ?? 14);
    const injuryDays = Number(p.injuryDays ?? 0);
    const injuryHistory = Array.isArray(p.career?.injuryHistory) ? p.career.injuryHistory : [];
    const avgRating = Number(p.stats?.avgRating ?? p.rating ?? 7.1);
    const apps = Number(p.stats?.apps ?? 0);

    const relProfile = this.state.relationshipSystem?.playerRelations?.[p.id]
      || this.state.relationshipSystem?.ensurePlayerProfile?.(p.id)
      || null;
    const wantsToLeave = Boolean(relProfile?.wantsToLeave || relProfile?.transferRequestSent);
    const mood = relProfile?.mood || (p.morale >= 80 ? 'Hài lòng' : p.morale >= 65 ? 'Bình thường' : 'Bất mãn');
    const satisfaction = Number(relProfile?.satisfaction ?? p.satisfaction ?? p.morale ?? 76);
    const activeConflict = (this.state.relationshipSystem?.conflicts || []).find(
      (c) => c.playerId === p.id && c.status === 'active'
    ) || null;

    // Học viện cùng vị trí
    const academyAtPos = (this.state.academy || [])
      .filter((y) => y.club === 'Paris Saint-Germain' && (normalizePosition(y.position) === normPos || getPositionGroup(normalizePosition(y.position)) === posGroup))
      .sort((a, b) => ((b.ovr || 60) + (b.pot || 70) * 0.4) - ((a.ovr || 60) + (a.pot || 70) * 0.4));
    const topAcademy = academyAtPos[0] || null;
    const academyExactPos = academyAtPos.filter((y) => normalizePosition(y.position) === normPos);

    // Ứng viên thay thế trên thị trường có thể mua được bằng tiền bán + ngân sách
    const maxReplaceBudget = (this.state.finance?.transferBudget ?? 100) + (bid.dealType === 'buy' ? offerFee * 0.65 : 0);
    const replacementCandidates = (this.state.players || [])
      .filter((x) =>
        x.club !== 'Paris Saint-Germain' &&
        normalizePosition(x.position) === normPos &&
        x.ovr >= Math.max(76, ovr - 5) &&
        (x.valuation?.current ?? x.value) <= maxReplaceBudget
      )
      .sort((a, b) => (b.ovr || 0) - (a.ovr || 0))
      .slice(0, 5);

    // Nhu cầu từ các CLB đối thủ khác để ước lượng khả năng bán giá cao hơn trong tương lai
    const interestedRivals = (this.state.clubs || [])
      .filter((c) =>
        c.name !== 'Paris Saint-Germain' &&
        c.name !== bid.buyerClub &&
        (c.positionalNeeds?.includes(p.position) || c.positionalNeeds?.includes(normPos)) &&
        ((c.finance?.transferBudget ?? c.budget ?? 0) >= marketValue * 0.75)
      )
      .sort((a, b) => ((b.finance?.transferBudget ?? b.budget ?? 0) - (a.finance?.transferBudget ?? a.budget ?? 0)))
      .slice(0, 4);

    // Bối cảnh mùa giải
    const curWeek = this.state.week || 1;
    const totalWeeks = Math.max(curWeek, this.state.fixtures?.length || 38);
    const weeksLeft = Math.max(0, totalWeeks - curWeek);
    const isMidSeasonPressure = curWeek >= 6 && weeksLeft >= 6;
    const windowState = this.state.transferSystem?.windowState || 'summer';
    const transferWindowOpen = this.state.transferSystem?.isWindowOpen?.() ?? true;
    const psgStanding = (this.state.clubs || [])
      .filter((c) => c.league === 'Ligue 1')
      .sort((a, b) => (b.pts || 0) - (a.pts || 0))
      .findIndex((c) => c.name === 'Paris Saint-Germain') + 1;

    const psgCash = Number(this.state.finance?.cash ?? 120);
    const psgTransferBudget = Number(this.state.finance?.transferBudget ?? 120);
    const squadSize = squad.length;

    const isKeyStar = ovr >= 86 || (isStarter && ovr >= 83);
    const isBenchOrRotation = !isStarter && ovr < 84;
    const isGK = normPos === 'GK';

    return {
      bid,
      player: p,
      normPos,
      posGroup,
      isGK,
      squadSize,
      isStarter,
      isKeyStar,
      isBenchOrRotation,
      samePosCount: samePosPlayers.length,
      sameGroupCount: sameGroupPlayers.length,
      bestBackup,
      backupOvrGap,
      squadAvgOvr,
      marketValue,
      askingPrice,
      offerFee,
      effectiveTotalFee,
      offerRatio: +offerRatio.toFixed(2),
      askRatio: +askRatio.toFixed(2),
      contractYears,
      wage,
      annualWageM,
      age,
      ovr,
      pot,
      growthRoom,
      form,
      fitness,
      fatigue,
      injuryDays,
      injuryHistoryCount: injuryHistory.length,
      avgRating,
      apps,
      wantsToLeave,
      mood,
      satisfaction,
      activeConflict,
      topAcademy,
      academyExactCount: academyExactPos.length,
      replacementCandidates,
      interestedRivals,
      curWeek,
      weeksLeft,
      isMidSeasonPressure,
      windowState,
      transferWindowOpen,
      psgStanding: psgStanding || 1,
      psgCash,
      psgTransferBudget,
      valuationTrend: p.valuation?.trend || 'stable',
      valuationDeltaPct: p.valuation?.deltaPct ?? 0,
      buyerClubObj: (this.state.clubs || []).find((c) => c.name === bid.buyerClub) || null,
      coachStyle: this.state.relationshipSystem?.getCoachStyleProfile?.() || { styleName: 'Cân bằng', stubbornness: 60, youthTrust: 70 },
      formation: this.state.formationSystem?.formation || this.state.coach?.formation || '4-3-3'
    };
  }

  _personalityTone(staff, baseMsg) {
    const openerMap = {
      'Tham vọng': 'Xét trên tham vọng vươn tầm của PSG, ',
      'Cẩn thận': 'Sau khi rà soát kỹ dữ liệu chuyên môn và rủi ro, ',
      'Cẩn trọng': 'Chúng ta cần thận trọng trước khi chốt thương vụ này: ',
      'Thẳng thắn': 'Nói thẳng thắn không vòng vo: ',
      'Bảo thủ': 'Ưu tiên hàng đầu vẫn là sự an toàn và kỷ luật: ',
      'Nhiệt tình': 'Tôi thực sự tâm huyết với bài toán nhân sự này: ',
      'Ngoại giao': 'Đặt lợi ích hài hòa của CLB lên trên hết, ',
      'Hòa đồng': 'Xét cả yếu tố phòng thay đồ lẫn chuyên môn, '
    };
    const opener = openerMap[staff?.personality] || (NPCPersonalitySystem.getReaction?.(staff?.personality, 'challenge') ? '' : '');
    if (!opener) return baseMsg;
    return `${opener}${baseMsg.charAt(0).toLowerCase()}${baseMsg.slice(1)}`;
  }

  _evaluateSportingDirector(ctx, staff) {
    // Đánh giá đủ 10 yếu tố chiến lược & tài chính
    const factors = [];
    let sellScore = 0;

    // 1 & 2: Giá đề nghị vs giá thị trường & giá yêu cầu
    if (ctx.bid.dealType === 'buy') {
      if (ctx.offerRatio >= 1.28) {
        sellScore += 32;
        factors.push(`Phí đề nghị €${ctx.offerFee}M vượt trội +${Math.round((ctx.offerRatio - 1) * 100)}% so với giá trị thị trường (€${ctx.marketValue}M).`);
      } else if (ctx.offerRatio >= 1.05) {
        sellScore += 14;
        factors.push(`Mức giá €${ctx.offerFee}M nhỉnh hơn định giá thị trường (€${ctx.marketValue}M), nhưng vẫn có dư địa ép lên mức €${ctx.askingPrice}M.`);
      } else if (ctx.offerRatio >= 0.88) {
        sellScore -= 8;
        factors.push(`Đề nghị €${ctx.offerFee}M đang hơi thấp so với mức kỳ vọng €${ctx.askingPrice}M của CLB.`);
      } else {
        sellScore -= 30;
        factors.push(`Mức trả €${ctx.offerFee}M thấp hơn rõ rệt giá trị thực (€${ctx.marketValue}M), dễ làm mất giá tài sản PSG.`);
      }
    } else {
      const optRatio = (ctx.bid.buyOptionFee || 0) / ctx.marketValue;
      sellScore += optRatio >= 1.05 ? 10 : -8;
      factors.push(`Đề nghị mượn phí €${ctx.offerFee}M${ctx.bid.buyOptionFee ? ` kèm điều khoản mua đứt €${ctx.bid.buyOptionFee}M` : ' (không có điều khoản mua đứt)'}.`);
    }

    // 3. Khả năng bán giá cao hơn trong tương lai
    const canSellHigherLater = ctx.age <= 24 && ctx.growthRoom >= 4 && ctx.contractYears >= 2 && ctx.interestedRivals.length >= 1;
    if (canSellHigherLater && ctx.offerRatio < 1.25) {
      sellScore -= 16;
      factors.push(`Còn trẻ (${ctx.age} tuổi, POT ${ctx.pot}) và có ${ctx.interestedRivals.length} CLB theo đuổi — giữ thêm 1 mùa có thể nâng trần bán lên €${Math.round(ctx.marketValue * 1.28)}M.`);
    } else if (ctx.age >= 29) {
      sellScore += 14;
      factors.push(`Ở tuổi ${ctx.age}, giá trị thị trường khó tăng thêm; đây là cửa sổ thanh khoản tốt.`);
    }

    // 4. Vai trò dài hạn
    if (ctx.ovr >= 86 && ctx.age <= 27) {
      sellScore -= 22;
      factors.push(`Đây là hạt nhân chiến lược dài hạn (OVR ${ctx.ovr}), không nên dễ dàng đánh mất.`);
    } else if (ctx.isBenchOrRotation && ctx.samePosCount >= 2) {
      sellScore += 16;
      factors.push(`Vị trí ${ctx.normPos} đang dư nhân sự (${ctx.samePosCount + 1} người), cầu thủ chủ yếu xoay tua.`);
    }

    // 5. Hợp đồng còn lại
    if (ctx.contractYears <= 1) {
      sellScore += 22;
      factors.push(`Hợp đồng chỉ còn ${ctx.contractYears} năm — nguy cơ mất trắng hoặc rớt giá mạnh nếu không bán hoặc gia hạn.`);
    } else if (ctx.contractYears >= 4) {
      sellScore -= 8;
      factors.push(`Hợp đồng còn dài (${ctx.contractYears} năm), PSG nắm toàn quyền ép giá.`);
    }

    // 6. Quỹ lương & tài chính
    if (ctx.wage >= 160 && !ctx.isStarter) {
      sellScore += 14;
      factors.push(`Giải phóng quỹ lương lớn €${ctx.wage}k/tuần (€${ctx.annualWageM}M/năm) cho cầu thủ chưa chắc suất đá chính.`);
    } else {
      factors.push(`Quỹ lương giải phóng ước tính €${ctx.annualWageM}M/năm, hỗ trợ biên độ FFP và ngân sách tái đầu tư.`);
    }

    // 7 & 8. Khả năng tìm người thay thế & nhu cầu đội hình
    const replaceHard = ctx.replacementCandidates.length === 0 || (ctx.isStarter && ctx.backupOvrGap >= 6 && ctx.offerFee < ctx.replacementCandidates[0]?.value);
    if (replaceHard) {
      sellScore -= 18;
      factors.push(`Thị trường hiện khan hiếm người thay thế ngang tầm ở vị trí ${ctx.normPos} trong ngân sách tương đương.`);
    } else if (ctx.replacementCandidates.length >= 2) {
      sellScore += 8;
      factors.push(`Đã có sẵn ${ctx.replacementCandidates.length} phương án thay thế tiềm năng (như ${ctx.replacementCandidates[0].name}, OVR ${ctx.replacementCandidates[0].ovr}).`);
    }

    // 9. Tâm lý rời đi
    if (ctx.wantsToLeave) {
      sellScore += 12;
      factors.push(`Cầu thủ đã bộc lộ ý muốn ra đi — kéo dài bế tắc sẽ làm giảm giá trị chuyển nhượng.`);
    }

    // 10. Điều kiện thanh toán / điều khoản phụ
    if (ctx.clauses?.sellOnPct > 0 || ctx.clauses?.bonusFee > 0) {
      sellScore += 4;
    }

    // Xác định khuyến nghị đúng 5 mức chuẩn Giám đốc thể thao
    let recommendation = SD_RECOMMENDATIONS.KEEP;
    let stance = 'Trung lập';
    if (ctx.offerRatio < 0.82 && ctx.isKeyStar) {
      recommendation = SD_RECOMMENDATIONS.NEVER_SELL_NOW;
      stance = 'Phản đối mạnh';
    } else if (ctx.offerRatio < 0.90 || (ctx.askRatio < 0.88 && ctx.wantsToLeave)) {
      recommendation = ctx.contractYears <= 1 || ctx.wantsToLeave || ctx.isBenchOrRotation
        ? SD_RECOMMENDATIONS.SELL_HIGHER
        : SD_RECOMMENDATIONS.KEEP;
      stance = recommendation === SD_RECOMMENDATIONS.SELL_HIGHER ? 'Đòi nâng giá' : 'Giữ lại';
    } else if (sellScore >= 24) {
      if (ctx.isStarter && (ctx.samePosCount === 0 || ctx.backupOvrGap >= 5)) {
        recommendation = SD_RECOMMENDATIONS.SELL_WITH_REPLACEMENT;
        stance = 'Bán có điều kiện';
      } else {
        recommendation = SD_RECOMMENDATIONS.SELL;
        stance = 'Ủng hộ bán';
      }
    } else if (sellScore >= 6) {
      if (ctx.offerRatio < 1.12 && ctx.contractYears >= 2) {
        recommendation = SD_RECOMMENDATIONS.SELL_HIGHER;
        stance = 'Ép giá thêm';
      } else if (ctx.isStarter && ctx.backupOvrGap >= 5) {
        recommendation = SD_RECOMMENDATIONS.SELL_WITH_REPLACEMENT;
        stance = 'Cần người thế chỗ';
      } else {
        recommendation = SD_RECOMMENDATIONS.SELL;
        stance = 'Nghiêng về bán';
      }
    } else if (ctx.isKeyStar && ctx.offerRatio < 1.25 && !ctx.wantsToLeave) {
      recommendation = ctx.offerRatio < 0.95 ? SD_RECOMMENDATIONS.NEVER_SELL_NOW : SD_RECOMMENDATIONS.KEEP;
      stance = 'Phản đối bán';
    } else {
      recommendation = SD_RECOMMENDATIONS.KEEP;
      stance = 'Ưu tiên giữ';
    }

    const coreQuote = (() => {
      if (recommendation === SD_RECOMMENDATIONS.SELL) {
        return `Thương vụ ${ctx.player.name} sang ${ctx.bid.buyerClub} với €${ctx.offerFee}M rất hợp lý về mặt kinh tế (${ctx.offerRatio >= 1 ? `+${Math.round((ctx.offerRatio - 1) * 100)}%` : ''} định giá €${ctx.marketValue}M) và giúp tái cấu trúc quỹ lương €${ctx.annualWageM}M/năm.`;
      }
      if (recommendation === SD_RECOMMENDATIONS.SELL_HIGHER) {
        return `Mức €${ctx.offerFee}M từ ${ctx.bid.buyerClub} chưa tối đa hóa giá trị của ${ctx.player.name}. Chúng ta nên phản đề nghị lên quanh €${Math.max(ctx.askingPrice, Math.round(ctx.offerFee * 1.18))}M hoặc chèn thêm % bán lại.`;
      }
      if (recommendation === SD_RECOMMENDATIONS.SELL_WITH_REPLACEMENT) {
        const rep = ctx.replacementCandidates[0];
        return `Mức phí €${ctx.offerFee}M rất đáng cân nhắc, nhưng vì ${ctx.player.name} quan trọng với cấu trúc ${ctx.normPos}, tôi chỉ khuyến nghị chốt nếu ta khóa được người thay thế${rep ? ` (ứng viên hàng đầu: ${rep.name}, €${rep.value}M)` : ''}.`;
      }
      if (recommendation === SD_RECOMMENDATIONS.NEVER_SELL_NOW) {
        return `Không có lý do gì để bán ${ctx.player.name} lúc này với €${ctx.offerFee}M. Đây là tài sản cốt lõi (${ctx.ovr} OVR, HĐ còn ${ctx.contractYears} năm) và lời hỏi mua này dưới chuẩn rất xa.`;
      }
      return `Về bài toán tài sản dài hạn, tôi nghiêng về giữ ${ctx.player.name}. Với tuổi ${ctx.age} và giá trị €${ctx.marketValue}M, việc bán ở mức €${ctx.offerFee}M chưa mang lại lợi thế chiến lược đủ lớn.`;
    })();

    return {
      roleKey: 'sporting_director',
      department: 'Giám đốc Thể thao',
      staffName: staff.name,
      personality: staff.personality,
      recommendation,
      stance,
      tone: recommendation === SD_RECOMMENDATIONS.SELL ? 'positive' : (recommendation === SD_RECOMMENDATIONS.NEVER_SELL_NOW || recommendation === SD_RECOMMENDATIONS.KEEP ? 'negative' : 'caution'),
      score: clamp(50 + sellScore, 5, 98),
      factors: factors.slice(0, 6),
      quote: this._personalityTone(staff, coreQuote)
    };
  }

  _evaluateHeadCoach(ctx, staff) {
    const factors = [];
    let keepScore = 0;

    // 1. Tần suất đá chính
    if (ctx.isStarter) {
      keepScore += 30;
      factors.push(`${ctx.player.name} đang là trụ cột đội hình xuất phát (${ctx.formation}, ${ctx.apps} lần ra sân).`);
    } else {
      keepScore -= 14;
      factors.push(`${ctx.player.name} hiện không nằm trong 11 cái tên đá chính thường xuyên.`);
    }

    // 2. Tầm quan trọng chiến thuật & OVR so với mặt bằng đội
    if (ctx.ovr >= ctx.squadAvgOvr + 3) {
      keepScore += 22;
      factors.push(`Đẳng cấp OVR ${ctx.ovr} vượt trội mặt bằng đội (${ctx.squadAvgOvr}), ảnh hưởng trực tiếp tới trần chuyên môn.`);
    } else if (ctx.ovr < ctx.squadAvgOvr - 2) {
      keepScore -= 10;
      factors.push(`Chỉ số OVR ${ctx.ovr} hiện thấp hơn trung bình đội (${ctx.squadAvgOvr}).`);
    }

    // 3 & 4. Người thay thế & chiều sâu vị trí
    if (ctx.samePosCount === 0) {
      keepScore += 28;
      factors.push(`Cảnh báo thiếu hụt: PSG không còn cầu thủ thuần vị trí ${ctx.normPos} nào khác trong đội một nếu bán.`);
    } else if (ctx.backupOvrGap >= 6) {
      keepScore += 18;
      factors.push(`Phương án dự phòng (${ctx.bestBackup?.name || 'chưa rõ'}, OVR ${ctx.bestBackup?.ovr || '?'}) kém tới ${ctx.backupOvrGap} điểm OVR.`);
    } else {
      keepScore -= 8;
      factors.push(`Chiều sâu ${ctx.normPos} ổn định: ${ctx.bestBackup?.name || 'nhân sự dự phòng'} (OVR ${ctx.bestBackup?.ovr || '?'}) đủ sức gánh vác.`);
    }

    // 5. Phong độ hiện tại
    if (ctx.form >= 82 || ctx.avgRating >= 7.3) {
      keepScore += 12;
      factors.push(`Phong độ thi đấu rất cao (${ctx.form}/100 · điểm TB ${ctx.avgRating}).`);
    } else if (ctx.form <= 62) {
      keepScore -= 12;
      factors.push(`Phong độ gần đây đi xuống (${ctx.form}/100), khó tạo đột biến ngay.`);
    }

    // 6. Học viện
    if (ctx.topAcademy && ctx.topAcademy.ovr >= 73) {
      keepScore -= 5;
      factors.push(`Học viện có tài năng ${ctx.topAcademy.name} (OVR ${ctx.topAcademy.ovr}/POT ${ctx.topAcademy.pot}) có thể dần thử lửa.`);
    }

    // 7. Tâm lý cầu thủ / Phòng thay đồ
    if (ctx.wantsToLeave || ctx.activeConflict) {
      keepScore -= 22;
      factors.push(`Cầu thủ đang bất mãn / muốn ra đi (${ctx.mood}) — ép giữ có nguy cơ ảnh hưởng bầu không khí phòng thay đồ.`);
    } else if (ctx.satisfaction >= 80) {
      keepScore += 8;
      factors.push(`Tinh thần gắn bó tốt (${ctx.mood}), hòa nhập cao với triết lý huấn luyện.`);
    }

    // 8. Thời điểm mùa giải
    if (ctx.isStarter && ctx.isMidSeasonPressure) {
      keepScore += 14;
      factors.push(`Mùa giải đang ở giai đoạn căng thẳng (Tuần ${ctx.curWeek}, còn ${ctx.weeksLeft} vòng), mất trụ cột giữa đường rất rủi ro.`);
    }

    let recommendation = COACH_RECOMMENDATIONS.DISAGREE_SELL;
    let stance = 'Giữ quân';

    if (ctx.wantsToLeave && (!ctx.isStarter || ctx.samePosCount >= 1 && ctx.backupOvrGap <= 5)) {
      recommendation = COACH_RECOMMENDATIONS.AGREE_SELL;
      stance = 'Đồng ý chia tay';
    } else if (ctx.isStarter && (ctx.samePosCount === 0 || ctx.backupOvrGap >= 6 || ctx.ovr >= 86)) {
      if (ctx.isMidSeasonPressure && !ctx.wantsToLeave) {
        recommendation = ctx.offerRatio >= 1.25 ? COACH_RECOMMENDATIONS.SELL_END_OF_SEASON : COACH_RECOMMENDATIONS.DISAGREE_SELL;
        stance = recommendation === COACH_RECOMMENDATIONS.SELL_END_OF_SEASON ? 'Hoãn cuối mùa' : 'Phản đối bán';
      } else if (ctx.wantsToLeave || ctx.offerRatio >= 1.3) {
        recommendation = COACH_RECOMMENDATIONS.AGREE_WITH_REPLACEMENT;
        stance = 'Cần người thay thế';
      } else {
        recommendation = COACH_RECOMMENDATIONS.DISAGREE_SELL;
        stance = 'Không đồng ý';
      }
    } else if (keepScore <= -6) {
      if (ctx.offerRatio < 0.85 && !ctx.wantsToLeave) {
        recommendation = COACH_RECOMMENDATIONS.RAISE_PRICE_FIRST;
        stance = 'Đề nghị tăng giá';
      } else {
        recommendation = COACH_RECOMMENDATIONS.AGREE_SELL;
        stance = 'Đồng ý bán';
      }
    } else if (keepScore <= 18) {
      if (ctx.samePosCount >= 1 && ctx.backupOvrGap <= 4) {
        recommendation = ctx.offerRatio < 0.92 ? COACH_RECOMMENDATIONS.RAISE_PRICE_FIRST : COACH_RECOMMENDATIONS.AGREE_WITH_REPLACEMENT;
        stance = recommendation === COACH_RECOMMENDATIONS.RAISE_PRICE_FIRST ? 'Ép giá thêm' : 'Bán nếu có thế chỗ';
      } else {
        recommendation = ctx.isMidSeasonPressure ? COACH_RECOMMENDATIONS.SELL_END_OF_SEASON : COACH_RECOMMENDATIONS.AGREE_WITH_REPLACEMENT;
        stance = recommendation === COACH_RECOMMENDATIONS.SELL_END_OF_SEASON ? 'Để cuối mùa' : 'Cần thay thế';
      }
    } else {
      recommendation = COACH_RECOMMENDATIONS.DISAGREE_SELL;
      stance = 'Phản đối bán';
    }

    const coreQuote = (() => {
      if (recommendation === COACH_RECOMMENDATIONS.AGREE_SELL) {
        return `Từ góc độ chuyên môn sân cỏ, tôi đồng ý để ${ctx.player.name} ra đi. Hiện đội hình ${ctx.formation} đã có ${ctx.bestBackup ? `${ctx.bestBackup.name} (OVR ${ctx.bestBackup.ovr})` : 'lựa chọn xoay tua'} đảm đương tốt${ctx.wantsToLeave ? ', và việc giữ một cầu thủ muốn đi sẽ làm nặng bầu không khí tập luyện' : ''}.`;
      }
      if (recommendation === COACH_RECOMMENDATIONS.AGREE_WITH_REPLACEMENT) {
        return `Tôi có thể chấp nhận chia tay ${ctx.player.name} nhưng điều kiện tiên quyết là Ban lãnh đạo phải đưa về một ${ctx.normPos} đủ trình độ ngay lập tức, nếu không cấu trúc chiến thuật sẽ suy yếu rõ rệt.`;
      }
      if (recommendation === COACH_RECOMMENDATIONS.SELL_END_OF_SEASON) {
        return `Không nên tháo gỡ mắt xích ${ctx.player.name} ngay giữa chiến dịch Tuần ${ctx.curWeek}. Hãy giữ cậu ấy hoàn thành mục tiêu mùa giải rồi mới kích hoạt bán vào mùa hè.`;
      }
      if (recommendation === COACH_RECOMMENDATIONS.RAISE_PRICE_FIRST) {
        return `Tôi không phản đối về mặt xoay tua đội hình, nhưng bỏ một nhân tố vẫn đóng góp được như ${ctx.player.name} với mức €${ctx.offerFee}M là chưa tương xứng công sức huấn luyện — đề nghị nâng giá thêm.`;
      }
      return `Tôi hoàn toàn không đồng ý bán ${ctx.player.name}. Cậu ấy là nhân tố sống còn trong hệ thống ${ctx.formation} (OVR ${ctx.ovr}, phong độ ${ctx.form}/100), khoảng trống để lại là quá lớn (${ctx.bestBackup ? `dự phòng ${ctx.bestBackup.name} kém ${ctx.backupOvrGap} OVR` : 'không có người thay'}).`;
    })();

    return {
      roleKey: 'head_coach',
      department: 'HLV Trưởng',
      staffName: staff.name,
      personality: staff.personality,
      recommendation,
      stance,
      tone: recommendation === COACH_RECOMMENDATIONS.AGREE_SELL ? 'positive' : (recommendation === COACH_RECOMMENDATIONS.DISAGREE_SELL ? 'negative' : 'caution'),
      score: clamp(100 - (50 + keepScore), 5, 95),
      factors: factors.slice(0, 6),
      quote: this._personalityTone(staff, coreQuote)
    };
  }

  _evaluateTacticalCoach(ctx, staff) {
    const factors = [];
    const roleImpact = ctx.isStarter ? 'Trụ cột vận hành sơ đồ' : 'Phương án chiến thuật linh hoạt';
    factors.push(`Vai trò trong sơ đồ ${ctx.formation}: ${roleImpact} tại vị trí ${ctx.normPos}.`);
    if (ctx.bestBackup) {
      factors.push(`Phương án kế cận ngay lập tức: ${ctx.bestBackup.name} (OVR ${ctx.bestBackup.ovr}, chênh ${ctx.backupOvrGap >= 0 ? `-${ctx.backupOvrGap}` : `+${Math.abs(ctx.backupOvrGap)}`} OVR).`);
    } else {
      factors.push(`Thiếu hụt cấu trúc: Hiện không có cầu thủ chuyên trách ${ctx.normPos} thứ hai để xoay vòng.`);
    }
    factors.push(`Lối chơi đối tác ${ctx.bid.buyerClub}: ${ctx.bid.buyerStrategy}.`);

    let recommendation = 'Giữ để ổn định cấu trúc chiến thuật';
    let stance = 'Giữ cấu trúc';
    let tone = 'negative';

    if (!ctx.isStarter && ctx.samePosCount >= 1 && ctx.backupOvrGap <= 3) {
      recommendation = 'Hệ thống chiến thuật không bị xáo trộn nếu bán';
      stance = 'Ít ảnh hưởng';
      tone = 'positive';
    } else if (ctx.isStarter && ctx.backupOvrGap <= 3 && ctx.samePosCount >= 1) {
      recommendation = 'Có thể xoay chuyển chiến thuật nếu bổ sung đúng mẫu cầu thủ';
      stance = 'Thay thế được';
      tone = 'caution';
    } else if (ctx.samePosCount === 0 || ctx.backupOvrGap >= 6) {
      recommendation = 'Cảnh báo suy giảm cấu trúc chiến thuật nghiêm trọng';
      stance = 'Rủi ro chiến thuật cao';
      tone = 'negative';
    } else {
      recommendation = 'Chỉ bán khi điều chỉnh lại vai trò tuyến ' + ctx.posGroup;
      stance = 'Cần điều chỉnh';
      tone = 'caution';
    }

    const coreQuote = ctx.samePosCount === 0 || ctx.backupOvrGap >= 6
      ? `Dữ liệu cự ly đội hình ${ctx.formation} cho thấy mất ${ctx.player.name} sẽ làm tụt mạnh chất lượng tuyến ${ctx.posGroup}${ctx.bestBackup ? ` vì ${ctx.bestBackup.name} chưa đạt ngưỡng chuyển trạng thái tương đương` : ' do không có phương án dự phòng đúng vị trí'}.`
      : `Nếu chia tay ${ctx.player.name}, ${ctx.bestBackup ? `${ctx.bestBackup.name} có thể đảm nhận vai trò ${ctx.normPos} mà không làm vỡ khối pressing của ${ctx.formation}` : `ban huấn luyện có thể chuyển biến thể linh hoạt ở tuyến ${ctx.posGroup}`}.`;

    return {
      roleKey: 'tactical_coach',
      department: 'Trợ lý Phân tích Chiến thuật',
      staffName: staff.name,
      personality: staff.personality,
      recommendation,
      stance,
      tone,
      factors,
      quote: this._personalityTone(staff, coreQuote)
    };
  }

  _evaluateFitnessCoach(ctx, staff) {
    const factors = [];
    const durabilityRisk = ctx.injuryHistoryCount >= 3 || ctx.fitness <= 68 || (ctx.age >= 30 && ctx.fatigue >= 35);
    const squadOverloadRisk = ctx.samePosCount === 0 || (ctx.isStarter && ctx.samePosCount <= 1);

    factors.push(`Thể lực hiện tại: ${ctx.fitness}% · Mệt mỏi tích lũy: ${ctx.fatigue}% · Tiền sử chấn thương: ${ctx.injuryHistoryCount} lần.`);
    factors.push(`Tải vận động tuyến ${ctx.normPos}: Còn ${ctx.samePosCount} nhân sự dự phòng ở đội một.`);
    if (ctx.injuryDays > 0) {
      factors.push(`Lưu ý y tế: Cầu thủ đang trong giai đoạn điều trị (${ctx.injuryDays} ngày hồi phục).`);
    }

    let recommendation = 'Đủ thể trạng duy trì cường độ';
    let stance = 'Thể lực ổn';
    let tone = 'caution';

    if (durabilityRisk && ctx.samePosCount >= 1) {
      recommendation = 'Có rủi ro thể lực cá nhân — bán lúc giá tốt giúp giảm tải y tế';
      stance = 'Cảnh báo độ bền';
      tone = 'positive';
    } else if (squadOverloadRisk) {
      recommendation = 'Bán sẽ đẩy các cầu thủ còn lại vào nguy cơ quá tải cơ bắp';
      stance = 'Nguy cơ quá tải đội';
      tone = 'negative';
    } else {
      recommendation = 'Tải vận động đội hình vẫn trong ngưỡng kiểm soát';
      stance = 'An toàn tải';
      tone = 'positive';
    }

    const coreQuote = squadOverloadRisk
      ? `Nếu bán ${ctx.player.name} lúc này, mật độ thi đấu dày sẽ dồn tải trực tiếp lên ${ctx.bestBackup ? ctx.bestBackup.name : 'các cầu thủ trái sở trường'}, làm tăng mạnh nguy cơ căng cơ và chấn thương.`
      : (durabilityRisk
        ? `${ctx.player.name} đã có ${ctx.injuryHistoryCount} lần chấn thương trong hồ sơ (thể lực ${ctx.fitness}%, mệt mỏi ${ctx.fatigue}%). Xét bài toán sinh học dài hạn, chia tay ở mức €${ctx.offerFee}M là lựa chọn an toàn cho quỹ y tế.`
        : `Nền tảng thể lực của ${ctx.player.name} (${ctx.fitness}%, mệt mỏi ${ctx.fatigue}%) đang ở trạng thái tốt và việc xoay tua ${ctx.normPos} hiện vẫn rất an toàn.`);

    return {
      roleKey: 'fitness_coach',
      department: 'Trợ lý Thể lực',
      staffName: staff.name,
      personality: staff.personality,
      recommendation,
      stance,
      tone,
      factors,
      quote: this._personalityTone(staff, coreQuote)
    };
  }

  _evaluateDevelopmentCoach(ctx, staff) {
    const factors = [];
    factors.push(`Trần phát triển cá nhân: OVR ${ctx.ovr} → POT ${ctx.pot} (dư địa tăng +${ctx.growthRoom} điểm, ${ctx.age} tuổi).`);
    if (ctx.topAcademy) {
      factors.push(`Ứng viên Học viện nổi bật nhất ở nhóm ${ctx.normPos}: ${ctx.topAcademy.name} (${ctx.topAcademy.age} tuổi · OVR ${ctx.topAcademy.ovr}/POT ${ctx.topAcademy.pot}).`);
    } else {
      factors.push(`Học viện hiện chưa có nhân sự cùng vị trí ${ctx.normPos} sẵn sàng bước lên.`);
    }

    let recommendation = 'Tiếp tục bồi dưỡng trong hệ thống PSG';
    let stance = 'Giữ phát triển';
    let tone = 'caution';

    if (ctx.growthRoom >= 5 && ctx.age <= 22 && ctx.bid.dealType === 'buy') {
      recommendation = 'Còn dư địa tăng trưởng lớn — ưu tiên giữ hoặc chỉ cho mượn';
      stance = 'Tiềm năng cao';
      tone = 'negative';
    } else if (ctx.topAcademy && ctx.topAcademy.ovr >= 72 && (!ctx.isStarter || ctx.growthRoom <= 2)) {
      recommendation = `Mở đường đôn tài năng trẻ ${ctx.topAcademy.name} lên đội một`;
      stance = 'Mở lộ trình trẻ';
      tone = 'positive';
    } else if (ctx.bid.dealType === 'loan' && ctx.age <= 23) {
      recommendation = 'Nên cho mượn để tích lũy số phút thi đấu đỉnh cao';
      stance = 'Ủng hộ cho mượn';
      tone = 'positive';
    } else {
      recommendation = 'Học viện chưa đủ lực thay thế trực tiếp ở đỉnh cao';
      stance = 'Chưa sẵn kế cận';
      tone = 'caution';
    }

    const coreQuote = ctx.growthRoom >= 5 && ctx.age <= 22 && ctx.bid.dealType === 'buy'
      ? `${ctx.player.name} mới ${ctx.age} tuổi nhưng trần tiềm năng đạt ${ctx.pot}. Bán đứt ở thời điểm này có thể khiến PSG tiếc nuối chỉ sau 1-2 mùa.`
      : (ctx.topAcademy
        ? `Tại Học viện, ${ctx.topAcademy.name} (OVR ${ctx.topAcademy.ovr}/POT ${ctx.topAcademy.pot}) đang tiến bộ nhanh. Nếu bán ${ctx.player.name}, chúng ta có thể đẩy nhanh lộ trình hòa nhập đội một cho nhân tố trẻ này.`
        : `Lứa U19 hiện chưa có gương mặt nào đủ chín cho vị trí ${ctx.normPos}; nếu bán đi, PSG buộc phải tìm nhân sự từ bên ngoài.`);

    return {
      roleKey: 'development_coach',
      department: 'Trợ lý Phát triển Cầu thủ',
      staffName: staff.name,
      personality: staff.personality,
      recommendation,
      stance,
      tone,
      factors,
      quote: this._personalityTone(staff, coreQuote)
    };
  }

  _evaluateGkCoach(ctx, staff) {
    // CHỈ được gọi khi cầu thủ là thủ môn (GK)
    const factors = [];
    const totalGKs = 1 + ctx.samePosCount;
    factors.push(`Quân số thủ môn đội một hiện có: ${totalGKs} người (${ctx.bestBackup ? `dự bị số 1: ${ctx.bestBackup.name}, OVR ${ctx.bestBackup.ovr}` : 'chưa có GK dự phòng đạt chuẩn'}).`);
    factors.push(`Năng lực bắt bóng & phát bóng hiện tại: OVR ${ctx.ovr} · Phong độ ${ctx.form}/100 · Độ tuổi thủ môn ${ctx.age}.`);

    let recommendation = 'Giữ để bảo toàn chất lượng khung gỗ';
    let stance = 'Bảo toàn khung gỗ';
    let tone = 'negative';

    if (totalGKs <= 2 && ctx.isStarter) {
      recommendation = 'Rủi ro lớn cho khung gỗ — tuyệt đối phải có thủ môn thay thế trước';
      stance = 'Thiếu GK dự phòng';
      tone = 'negative';
    } else if (!ctx.isStarter && totalGKs >= 3) {
      recommendation = 'Có thể tạo điều kiện ra sân mới nếu giữ lại tối thiểu 2 thủ môn chất lượng';
      stance = 'Cho phép xoay vòng';
      tone = 'positive';
    } else {
      recommendation = 'Cần kiểm tra kỹ thủ môn kế cận trước khi chốt';
      stance = 'Thận trọng';
      tone = 'caution';
    }

    const coreQuote = ctx.isStarter
      ? `Vị trí thủ môn đòi hỏi sự ổn định tuyệt đối trong phòng ngự và phát động từ tuyến dưới. Với ${totalGKs} thủ môn hiện tại${ctx.bestBackup ? ` (dự bị ${ctx.bestBackup.name} OVR ${ctx.bestBackup.ovr})` : ''}, để ${ctx.player.name} rời đi mà chưa có thủ môn đẳng cấp tương đương là rủi ro rất lớn.`
      : `Ở nhóm thủ môn (${totalGKs} người), ${ctx.player.name} đang cạnh tranh phía sau. Nếu ${ctx.bestBackup ? ctx.bestBackup.name : 'thủ môn số 1'} ổn định thể lực và học viện bổ sung GK thứ 3, phương án ra đi có thể giúp cậu ấy duy trì cảm giác bóng.`;

    return {
      roleKey: 'gk_coach',
      department: 'HLV Thủ môn',
      staffName: staff.name,
      personality: staff.personality,
      recommendation,
      stance,
      tone,
      factors,
      quote: this._personalityTone(staff, coreQuote)
    };
  }

  _buildSynthesisConclusion(ctx, opinions) {
    const sd = opinions.find((o) => o.roleKey === 'sporting_director');
    const hc = opinions.find((o) => o.roleKey === 'head_coach');

    const sdProSell = [SD_RECOMMENDATIONS.SELL, SD_RECOMMENDATIONS.SELL_WITH_REPLACEMENT].includes(sd?.recommendation);
    const sdAskMore = sd?.recommendation === SD_RECOMMENDATIONS.SELL_HIGHER;
    const hcProSell = [COACH_RECOMMENDATIONS.AGREE_SELL, COACH_RECOMMENDATIONS.AGREE_WITH_REPLACEMENT].includes(hc?.recommendation);
    const hcOpposes = hc?.recommendation === COACH_RECOMMENDATIONS.DISAGREE_SELL;

    let divergenceType = 'aligned';
    let headline = 'Các bộ phận cơ bản thống nhất góc nhìn';
    let detail = '';

    if (sdProSell && hcOpposes) {
      divergenceType = 'sd_sell_coach_keep';
      headline = 'Bất đồng chiến lược: Giám đốc Thể thao nghiêng về bán · HLV trưởng phản đối';
      detail = `${sd.staffName} đánh giá mức phí €${ctx.offerFee}M rất hấp dẫn về mặt tài chính, nhưng ${hc.staffName} cảnh báo việc mất ${ctx.player.name} sẽ tạo lỗ hổng trực tiếp trong sơ đồ ${ctx.formation}.`;
    } else if (!sdProSell && hcProSell) {
      divergenceType = 'coach_sell_sd_hold';
      headline = 'Khác biệt đánh giá: HLV trưởng sẵn sàng chia tay · Giám đốc Thể thao chưa hài lòng về giá';
      detail = `${hc.staffName} đồng ý để cầu thủ ra đi nhằm ổn định đội hình, nhưng ${sd.staffName} cho rằng lời hỏi mua €${ctx.offerFee}M chưa xứng với giá trị thực (€${ctx.marketValue}M) hoặc tiềm năng bán lại.`;
    } else if (sdProSell && hcProSell) {
      divergenceType = 'consensus_sell';
      headline = 'Đồng thuận mở cửa: Cả Tài chính và Chuyên môn đều chấp thuận nếu đủ điều kiện';
      detail = `Cả ${sd.staffName} và ${hc.staffName} đều cởi mở với thương vụ ${ctx.player.name} → ${ctx.bid.buyerClub} (€${ctx.offerFee}M), lưu ý kiểm tra kỹ phương án thay thế và các điều khoản kèm theo.`;
    } else if (!sdProSell && hcOpposes) {
      divergenceType = 'consensus_keep';
      headline = 'Đồng thuận giữ người: Cả Ban lãnh đạo thể thao và HLV trưởng đều không muốn bán lúc này';
      detail = `Cả góc độ tài sản CLB lẫn chuyên môn sân cỏ đều nghiêng về giữ ${ctx.player.name}${sdAskMore ? `, trừ khi đối tác nâng giá vượt ngưỡng €${ctx.askingPrice}M` : ''}.`;
    } else {
      divergenceType = 'mixed';
      headline = 'Quan điểm phân hóa giữa các bộ phận chuyên môn';
      detail = `GĐ Thể thao (${sd?.recommendation}) và HLV trưởng (${hc?.recommendation}) có điều kiện kèm theo khác nhau — Chủ tịch cần cân nhắc giữa lợi ích tài chính (€${ctx.offerFee}M) và sự ổn định chuyên môn.`;
    }

    return {
      divergenceType,
      headline,
      detail,
      note: 'Báo cáo này chỉ mang tính tham vấn chuyên môn. Quyền quyết định cuối cùng thuộc về Chủ tịch Phạm Minh Chiêu.'
    };
  }

  _snapshotOffer(ctx) {
    return {
      bidId: ctx.bid.id,
      playerId: ctx.player.id,
      buyerClub: ctx.bid.buyerClub,
      dealType: ctx.bid.dealType,
      fee: ctx.offerFee,
      buyOptionFee: ctx.bid.buyOptionFee || 0,
      clausesJson: JSON.stringify(ctx.bid.clauses || {}),
      askingPrice: ctx.askingPrice,
      marketValue: ctx.marketValue,
      isStarter: ctx.isStarter,
      wantsToLeave: ctx.wantsToLeave,
      injuryDays: ctx.injuryDays,
      week: ctx.curWeek
    };
  }

  isConsultationStale(consultation, currentRawBid) {
    if (!consultation || !currentRawBid) return { stale: false, reasons: [] };
    const snap = consultation.offerSnapshot || {};
    const p = this.state.getPlayerById?.(currentRawBid.playerId);
    const bid = normalizeBidObject(currentRawBid, p);
    const reasons = [];

    const oldFee = Number(snap.fee || 0);
    const feeDiff = Math.abs(bid.fee - oldFee);
    const feePct = oldFee > 0 ? feeDiff / oldFee : 0;
    if (feeDiff >= 5 || feePct >= 0.1) {
      reasons.push(`Mức phí đề nghị thay đổi từ €${oldFee}M → €${bid.fee}M`);
    }
    if (bid.dealType !== snap.dealType) {
      reasons.push(`Hình thức chuyển nhượng đổi từ ${snap.dealType} → ${bid.dealType}`);
    }
    if (Number(bid.buyOptionFee || 0) !== Number(snap.buyOptionFee || 0)) {
      reasons.push(`Phí mua đứt thay đổi (€${snap.buyOptionFee || 0}M → €${bid.buyOptionFee || 0}M)`);
    }
    if (JSON.stringify(bid.clauses || {}) !== (snap.clausesJson || '{}')) {
      reasons.push('Điều khoản phụ chuyển nhượng đã được cập nhật');
    }
    if (p) {
      const relProfile = this.state.relationshipSystem?.playerRelations?.[p.id];
      const nowWantsLeave = Boolean(relProfile?.wantsToLeave || relProfile?.transferRequestSent);
      if (nowWantsLeave !== Boolean(snap.wantsToLeave)) {
        reasons.push(`Tâm lý cầu thủ thay đổi (${nowWantsLeave ? 'đã bày tỏ muốn ra đi' : 'đã ổn định trở lại'})`);
      }
      if ((p.injuryDays || 0) > 0 && (snap.injuryDays || 0) === 0) {
        reasons.push('Cầu thủ vừa gặp chấn thương');
      }
    }

    return { stale: reasons.length > 0, reasons };
  }

  getConsultationForBid(bidId) {
    return this.consultations.find((c) => c.offerId === bidId) || null;
  }

  getConsultationById(consultationId) {
    return this.consultations.find((c) => c.consultationId === consultationId) || null;
  }

  consultOffer(bidId, { forceReevaluate = false } = {}) {
    const rawBid = (this.state.transferSystem?.incomingBids || []).find((b) => b.id === bidId);
    if (!rawBid) {
      return { ok: false, error: 'Không tìm thấy đề nghị chuyển nhượng đang hoạt động.' };
    }

    const existing = this.getConsultationForBid(bidId);
    if (existing && !forceReevaluate) {
      const staleCheck = this.isConsultationStale(existing, rawBid);
      if (!staleCheck.stale) {
        return { ok: true, cached: true, stale: false, consultation: existing };
      }
      // Nếu offer thay đổi đáng kể -> tự động tạo đánh giá lại mới hoặc đánh dấu để UI biết,
      // ở đây khi Chủ tịch mở lại sau thay đổi lớn ta gắn cờ staleCheck để tránh dùng báo cáo cũ sai lệch!
      existing.staleStatus = staleCheck;
      return { ok: true, cached: true, stale: true, staleReasons: staleCheck.reasons, consultation: existing };
    }

    const ctx = this._gatherContext(rawBid);
    if (!ctx) return { ok: false, error: 'Không tìm thấy hồ sơ cầu thủ tương ứng.' };

    const staff = this._resolveActiveStaff();
    const opinions = [
      this._evaluateSportingDirector(ctx, staff.sportingDirector),
      this._evaluateHeadCoach(ctx, staff.headCoach),
      this._evaluateTacticalCoach(ctx, staff.tacticalCoach),
      this._evaluateFitnessCoach(ctx, staff.fitnessCoach),
      this._evaluateDevelopmentCoach(ctx, staff.devCoach)
    ];

    // HLV thủ môn CHỈ tham gia khi cầu thủ là thủ môn (GK)
    if (ctx.isGK) {
      opinions.push(this._evaluateGkCoach(ctx, staff.gkCoach));
    }

    const summaryTable = opinions.map((op) => ({
      roleKey: op.roleKey,
      department: op.department,
      staffName: op.staffName,
      stance: op.stance,
      recommendation: op.recommendation,
      tone: op.tone
    }));

    const conclusion = this._buildSynthesisConclusion(ctx, opinions);
    const consultationId = `cons_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;

    const record = {
      consultationId,
      offerId: ctx.bid.id,
      playerId: ctx.player.id,
      playerName: ctx.player.name,
      playerSummary: {
        id: ctx.player.id,
        name: ctx.player.name,
        age: ctx.age,
        position: ctx.player.position,
        normPos: ctx.normPos,
        ovr: ctx.ovr,
        pot: ctx.pot,
        form: ctx.form,
        fitness: ctx.fitness,
        contractYears: ctx.contractYears,
        wage: ctx.wage,
        marketValue: ctx.marketValue,
        askingPrice: ctx.askingPrice,
        isStarter: ctx.isStarter,
        wantsToLeave: ctx.wantsToLeave,
        mood: ctx.mood
      },
      offerSummary: {
        buyerClub: ctx.bid.buyerClub,
        buyerStrategy: ctx.bid.buyerStrategy,
        dealType: ctx.bid.dealType,
        fee: ctx.offerFee,
        buyOptionFee: ctx.bid.buyOptionFee || 0,
        clausesText: formatBidClausesText(ctx.bid),
        clauses: ctx.bid.clauses,
        deadlineDate: ctx.bid.deadlineDate,
        deadlineWeek: ctx.bid.deadlineWeek,
        rounds: ctx.bid.rounds
      },
      offerSnapshot: this._snapshotOffer(ctx),
      opinions,
      summaryTable,
      conclusion,
      followUps: existing?.followUps ? [...existing.followUps] : [],
      presetQuestions: this.getSuggestedFollowUpQuestions(ctx),
      createdAt: this._dateStr(),
      createdWeek: ctx.curWeek,
      version: (existing?.version || 0) + 1,
      staleStatus: { stale: false, reasons: [] },
      finalDecision: null,
      dealOutcome: null
    };

    // Giữ tối đa 1 bản ghi active mới nhất cho mỗi offerId (thay thế bản ghi cũ khi re-evaluate để không trùng lặp)
    this.consultations = this.consultations.filter((c) => c.offerId !== bidId);
    this.consultations.unshift(record);
    if (this.consultations.length > 40) this.consultations.length = 40;

    return { ok: true, cached: false, stale: false, reevaluated: Boolean(existing), consultation: record };
  }

  getSuggestedFollowUpQuestions(ctxOrCons) {
    const isGK = ctxOrCons?.isGK ?? (normalizePosition(ctxOrCons?.playerSummary?.position) === 'GK');
    const questions = [
      { id: 'q_hc_tactic', roleKey: 'head_coach', label: 'Nếu bán cầu thủ này, đội sẽ vận hành chiến thuật thế nào?' },
      { id: 'q_sd_summer', roleKey: 'sporting_director', label: 'Có thể bán với mức giá cao hơn vào kỳ chuyển nhượng tới không?' },
      { id: 'q_sd_replace', roleKey: 'sporting_director', label: 'Thị trường hiện có ứng viên nào thay thế phù hợp ngân sách?' },
      { id: 'q_tc_weakness', roleKey: 'tactical_coach', label: 'Khoảng trống chuyên môn lớn nhất trên sân nếu chia tay là gì?' },
      { id: 'q_fc_overload', roleKey: 'fitness_coach', label: 'Việc thiếu cầu thủ này có làm nhóm còn lại bị quá tải không?' },
      { id: 'q_dev_academy', roleKey: 'development_coach', label: 'Cầu thủ trẻ nào ở Học viện đủ sức lấp vào chỗ trống này?' }
    ];
    if (isGK) {
      questions.push({ id: 'q_gk_depth', roleKey: 'gk_coach', label: 'Nhóm thủ môn còn lại có đảm bảo cho mặt trận Champions League không?' });
    }
    return questions;
  }

  askFollowUp(consultationId, targetRoleKey = 'head_coach', questionInput = '') {
    const cons = this.getConsultationById(consultationId);
    if (!cons) return { ok: false, error: 'Không tìm thấy phiên tham vấn.' };

    const rawBid = (this.state.transferSystem?.incomingBids || []).find((b) => b.id === cons.offerId);
    const ctx = rawBid ? this._gatherContext(rawBid) : null;
    const p = this.state.getPlayerById?.(cons.playerId);
    if (!ctx && !p) return { ok: false, error: 'Hồ sơ cầu thủ không còn khả dụng.' };

    const dataCtx = ctx || {
      bid: normalizeBidObject({ ...cons.offerSummary, id: cons.offerId, playerId: cons.playerId, playerName: cons.playerSummary.name, position: cons.playerSummary.position, ovr: cons.playerSummary.ovr }, p),
      player: p,
      normPos: cons.playerSummary.normPos,
      posGroup: getPositionGroup(cons.playerSummary.normPos),
      isGK: cons.playerSummary.normPos === 'GK',
      isStarter: cons.playerSummary.isStarter,
      samePosCount: 1,
      bestBackup: null,
      backupOvrGap: 5,
      marketValue: cons.playerSummary.marketValue,
      askingPrice: cons.playerSummary.askingPrice,
      offerFee: cons.offerSummary.fee,
      offerRatio: +(cons.offerSummary.fee / Math.max(1, cons.playerSummary.marketValue)).toFixed(2),
      contractYears: cons.playerSummary.contractYears,
      age: cons.playerSummary.age,
      ovr: cons.playerSummary.ovr,
      pot: cons.playerSummary.pot,
      growthRoom: Math.max(0, cons.playerSummary.pot - cons.playerSummary.ovr),
      form: cons.playerSummary.form,
      fitness: cons.playerSummary.fitness,
      fatigue: 15,
      injuryHistoryCount: 0,
      wantsToLeave: cons.playerSummary.wantsToLeave,
      topAcademy: null,
      replacementCandidates: [],
      interestedRivals: [],
      formation: this.state.formationSystem?.formation || '4-3-3',
      psgTransferBudget: this.state.finance?.transferBudget ?? 100
    };

    const staffMap = this._resolveActiveStaff();
    const roleMap = {
      sporting_director: { staff: staffMap.sportingDirector, dept: 'Giám đốc Thể thao' },
      head_coach: { staff: staffMap.headCoach, dept: 'HLV Trưởng' },
      tactical_coach: { staff: staffMap.tacticalCoach, dept: 'Trợ lý Phân tích Chiến thuật' },
      fitness_coach: { staff: staffMap.fitnessCoach, dept: 'Trợ lý Thể lực' },
      development_coach: { staff: staffMap.devCoach, dept: 'Trợ lý Phát triển Cầu thủ' },
      gk_coach: { staff: staffMap.gkCoach, dept: 'HLV Thủ môn' }
    };

    const effectiveRoleKey = (targetRoleKey === 'gk_coach' && !dataCtx.isGK) ? 'head_coach' : (roleMap[targetRoleKey] ? targetRoleKey : 'head_coach');
    const advisor = roleMap[effectiveRoleKey];
    const qText = String(questionInput || '').trim() || 'Đánh giá chi tiết hơn giúp tôi về phương án xử lý thương vụ này.';
    const qLower = qText.toLowerCase();

    let answerBody = '';
    if (effectiveRoleKey === 'head_coach') {
      if (qLower.includes('chiến thuật') || qLower.includes('vận hành') || qLower.includes('đội hình')) {
        const backupText = dataCtx.bestBackup
          ? `tôi sẽ đẩy ${dataCtx.bestBackup.name} (OVR ${dataCtx.bestBackup.ovr}) lên đá vị trí ${dataCtx.normPos} trong sơ đồ ${dataCtx.formation}`
          : `tôi buộc phải chuyển sang biến thể 4-2-3-1 hoặc 3-5-2 để vá chỗ trống ${dataCtx.normPos}`;
        answerBody = `Nếu bán ${dataCtx.player.name}, ${backupText}. Điểm mấu chốt là khoảng chênh lệch chất lượng (${dataCtx.backupOvrGap} OVR) sẽ đòi hỏi tuyến ${dataCtx.posGroup} phải hỗ trợ bọc lót nhiều hơn trong các trận lớn.`;
      } else if (qLower.includes('phòng thay đồ') || qLower.includes('tâm lý') || qLower.includes('muốn đi')) {
        answerBody = dataCtx.wantsToLeave
          ? `${dataCtx.player.name} đã có dấu hiệu muốn ra đi. Nếu Chủ tịch quyết giữ, tôi cần một buổi làm việc rõ ràng để cam kết vai trò, tránh lây lan tâm lý chán nản.`
          : `Hiện ${dataCtx.player.name} giữ thái độ chuyên nghiệp (${dataCtx.mood}). Bán đột ngột một nhân tố được đồng đội tin cậy có thể làm phòng thay đồ hụt hẫng nhẹ trong vài tuần đầu.`;
      } else {
        answerBody = `Với phong độ ${dataCtx.form}/100 và vai trò ${dataCtx.isStarter ? 'đá chính thường xuyên' : 'dự bị xoay tua'}, ưu tiên của tôi vẫn là ${dataCtx.isStarter ? 'bảo toàn bộ khung thi đấu' : 'giữ sự cạnh tranh lành mạnh trừ khi có người thay chất lượng hơn'}.`;
      }
    } else if (effectiveRoleKey === 'sporting_director') {
      if (qLower.includes('giá') || qLower.includes('mùa hè') || qLower.includes('cao hơn') || qLower.includes('bán lại')) {
        const canRise = dataCtx.age <= 25 && dataCtx.growthRoom >= 3 && dataCtx.contractYears >= 2;
        const projCeiling = Math.round(dataCtx.marketValue * (canRise ? 1.24 : (dataCtx.contractYears <= 1 ? 0.72 : 0.96)));
        const rivalText = dataCtx.interestedRivals.length
          ? `Hiện có ${dataCtx.interestedRivals.map((c) => c.name).slice(0, 2).join(', ')} cũng đang tìm ${dataCtx.normPos}.`
          : 'Hiện chưa ghi nhận nhiều đối thủ lớn cạnh tranh trực tiếp vị trí này.';
        answerBody = canRise
          ? `Khả năng bán giá cao hơn vào mùa hè là KHẢ THI (ước tính trần €${projCeiling}M so với €${dataCtx.offerFee}M hiện tại) nhờ cầu thủ mới ${dataCtx.age} tuổi, còn ${dataCtx.contractYears} năm HĐ và dư địa lên ${dataCtx.pot} OVR. ${rivalText}`
          : `Rất khó bán giá cao hơn đáng kể ở kỳ tới (ước tính chỉ quanh €${projCeiling}M) vì tuổi ${dataCtx.age} và thời hạn HĐ còn ${dataCtx.contractYears} năm. ${rivalText}`;
      } else if (qLower.includes('thay thế') || qLower.includes('ứng viên') || qLower.includes('mua')) {
        const topList = dataCtx.replacementCandidates.slice(0, 3);
        answerBody = topList.length
          ? `Trong phạm vi ngân sách €${Math.round(dataCtx.psgTransferBudget + dataCtx.offerFee * 0.6)}M, bộ phận tuyển trạch đã chấm ${topList.map((r) => `${r.name} (${r.club}, OVR ${r.ovr}, ~€${r.value}M)`).join('; ')}.`
          : `Thị trường đang rất khan hiếm ${dataCtx.normPos} đạt ngưỡng OVR ≥ ${Math.max(78, dataCtx.ovr - 4)} trong tầm giá €${dataCtx.offerFee}M. Nếu bán, ta phải chi phụ trội hoặc kích hoạt điều khoản tìm người trước.`;
      } else {
        answerBody = `So với giá trị thị trường €${dataCtx.marketValue}M và giá yêu cầu €${dataCtx.askingPrice}M, đề nghị €${dataCtx.offerFee}M đang ở mức ${Math.round(dataCtx.offerRatio * 100)}% giá trị thực. Nếu đàm phán thêm điều khoản bán lại 10–15% sẽ tối ưu dòng tiền cho PSG.`;
      }
    } else if (effectiveRoleKey === 'tactical_coach') {
      answerBody = dataCtx.bestBackup
        ? `Khi đặt ${dataCtx.bestBackup.name} (OVR ${dataCtx.bestBackup.ovr}) thay thế ${dataCtx.player.name} (OVR ${dataCtx.ovr}) ở vai trò ${dataCtx.normPos}, điểm cần bù đắp lớn nhất là sự ổn định chuyển trạng thái và cự ly phối hợp nhóm trong sơ đồ ${dataCtx.formation}.`
        : `Lỗ hổng lớn nhất là sự khuyết hẳn một nhân sự thuần ${dataCtx.normPos} — buộc đội phải kéo cầu thủ trái sở trường sang đá vá với hiệu suất thấp hơn khoảng 10–15%.`;
    } else if (effectiveRoleKey === 'fitness_coach') {
      answerBody = `Tải thi đấu hiện tại cho thấy ${dataCtx.player.name} có ${dataCtx.fitness}% thể lực, mệt mỏi ${dataCtx.fatigue}%, từng dính ${dataCtx.injuryHistoryCount} chấn thương. Nếu không có người thay thế, nhóm ${dataCtx.samePosCount <= 1 ? 'còn lại sẽ chạm ngưỡng quá tải nhanh trong chuỗi trận mật độ 3 ngày/trận' : 'còn lại vẫn đủ nhân sự chia tải hợp lý'}.`;
    } else if (effectiveRoleKey === 'development_coach') {
      answerBody = dataCtx.topAcademy
        ? `Từ Học viện PSG, ${dataCtx.topAcademy.name} (${dataCtx.topAcademy.age} tuổi, ${dataCtx.topAcademy.position}, OVR ${dataCtx.topAcademy.ovr}/POT ${dataCtx.topAcademy.pot}) là phương án nội bộ sáng giá nhất. Cậu ấy cần khoảng 1 mùa luân phiên đá cúp/dự bị trước khi gánh vai chính.`
        : `Hiện lứa trẻ Học viện chưa có cầu thủ vị trí ${dataCtx.normPos} đạt ngưỡng sẵn sàng lên đội một ngay lập tức; việc bán sẽ không tạo ra cơ hội đôn trẻ trực tiếp tức thì.`;
    } else if (effectiveRoleKey === 'gk_coach') {
      answerBody = `Trong khung gỗ, giữ tối thiểu 2 thủ môn OVR trên 80 là chuẩn bắt buộc cho Champions League. Hiện đội có ${1 + dataCtx.samePosCount} thủ môn${dataCtx.bestBackup ? ` (kế cận là ${dataCtx.bestBackup.name}, OVR ${dataCtx.bestBackup.ovr})` : ''} — nếu chia tay ${dataCtx.player.name} mà chưa ký thủ môn mới thì độ an toàn sẽ giảm rõ rệt.`;
    }

    const qaEntry = {
      id: `qa_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`,
      roleKey: effectiveRoleKey,
      department: advisor.dept,
      staffName: advisor.staff.name,
      question: qText,
      answer: this._personalityTone(advisor.staff, answerBody),
      askedAt: this._dateStr()
    };

    cons.followUps = cons.followUps || [];
    cons.followUps.push(qaEntry);
    return { ok: true, entry: qaEntry, consultation: cons };
  }

  _applyDecisionConsequences(cons, decisionType, outcomeInfo = {}) {
    const p = this.state.getPlayerById?.(cons.playerId);
    const sdOp = cons.opinions.find((o) => o.roleKey === 'sporting_director');
    const hcOp = cons.opinions.find((o) => o.roleKey === 'head_coach');
    const staff = this._resolveActiveStaff();

    const isStarter = Boolean(cons.playerSummary?.isStarter);
    const ovr = Number(cons.playerSummary?.ovr || 80);
    const importanceFactor = isStarter ? (ovr >= 86 ? 1.5 : 1.2) : 0.7;
    const stubbornFactor = staff.headCoach?.personality === 'Thẳng thắn' || staff.headCoach?.personality === 'Tham vọng' ? 1.25 : 1.0;

    let coachDelta = 0;
    let sdDelta = 0;
    let coachNote = '';
    let sdNote = '';

    const hcOpposedSell = hcOp?.recommendation === COACH_RECOMMENDATIONS.DISAGREE_SELL || hcOp?.recommendation === COACH_RECOMMENDATIONS.SELL_END_OF_SEASON;
    const hcAgreedSell = hcOp?.recommendation === COACH_RECOMMENDATIONS.AGREE_SELL;
    const sdProSell = [SD_RECOMMENDATIONS.SELL, SD_RECOMMENDATIONS.SELL_WITH_REPLACEMENT].includes(sdOp?.recommendation);
    const sdOpposedCheap = [SD_RECOMMENDATIONS.KEEP, SD_RECOMMENDATIONS.NEVER_SELL_NOW].includes(sdOp?.recommendation);

    if (decisionType === CONSULTATION_DECISIONS.ACCEPT) {
      if (outcomeInfo.playerRejected) {
        // Thương vụ đổ bể do cầu thủ từ chối chứ không phải lỗi ép bán thành công
        if (hcOpposedSell) coachDelta += 1;
        coachNote = `${cons.playerName} đã tự từ chối gia nhập ${cons.offerSummary.buyerClub}.`;
      } else {
        if (hcOpposedSell) {
          coachDelta = -Math.round(4 * importanceFactor * stubbornFactor);
          if (cons.opinions.some((o) => o.roleKey === 'head_coach' && o.recommendation === COACH_RECOMMENDATIONS.DISAGREE_SELL)) {
            coachDelta = Math.min(-3, coachDelta);
          }
          coachNote = `${staff.headCoach.name} không hài lòng vì ${cons.playerName} bị bán trái khuyến nghị chuyên môn.`;
          this.state.pushPhoneMsg?.(
            staff.headCoach.name,
            `⚠️ Phản ứng chuyên môn sau thương vụ ${cons.playerName}`,
            `Thưa Chủ tịch, việc để ${cons.playerName} rời đội đúng như tôi đã cảnh báo sẽ khiến bộ khung ${cons.playerSummary.normPos} gặp áp lực lớn. Ban huấn luyện mong sớm có phương án bù đắp.`,
            false
          );
        } else if (hcAgreedSell) {
          coachDelta = +Math.round(2 * importanceFactor);
          coachNote = `${staff.headCoach.name} đánh giá cao sự thống nhất khi xử lý gọn thương vụ.`;
        } else if (hcOp?.recommendation === COACH_RECOMMENDATIONS.AGREE_WITH_REPLACEMENT) {
          coachDelta = -2;
          coachNote = `${staff.headCoach.name} nhắc nhở cần sớm chốt người thay thế ${cons.playerName} như đã khuyến nghị.`;
          this.replacementWatchlist.unshift({
            playerId: cons.playerId,
            playerName: cons.playerName,
            position: cons.playerSummary.normPos,
            createdWeek: this.state.week || 1,
            reason: 'Đã bán cầu thủ theo diện cần tìm người thay thế',
            status: 'urgent'
          });
        }

        if (sdProSell) sdDelta += Math.round(3 * (cons.offerSummary.fee >= cons.playerSummary.askingPrice ? 1.3 : 1));
        else if (sdOpposedCheap) sdDelta -= Math.round(3 * importanceFactor);
      }
    } else if (decisionType === CONSULTATION_DECISIONS.REJECT) {
      if (hcOpposedSell) {
        coachDelta = +Math.round(3 * importanceFactor);
        coachNote = `${staff.headCoach.name} rất trân trọng việc Chủ tịch lắng nghe khuyến nghị giữ ${cons.playerName}.`;
      } else if (hcAgreedSell && cons.playerSummary?.wantsToLeave) {
        coachDelta = -2;
        coachNote = `${staff.headCoach.name} lo ngại việc giữ cầu thủ muốn đi sẽ cần thêm công tác tư tưởng.`;
      }
      if (sdProSell && cons.offerSummary.fee >= cons.playerSummary.marketValue * 1.2) {
        sdDelta -= 2;
        sdNote = `${staff.sportingDirector.name} tiếc nuối vì bỏ lỡ cơ hội thu về €${cons.offerSummary.fee}M.`;
      } else if (sdOpposedCheap) {
        sdDelta += 2;
        sdNote = `${staff.sportingDirector.name} đồng tình việc không bán rẻ tài sản CLB.`;
      }
      if (p && cons.playerSummary?.wantsToLeave) {
        p.morale = Math.max(30, (p.morale || 70) - 3);
      }
    } else if (decisionType === CONSULTATION_DECISIONS.REQUIRE_REPLACEMENT) {
      coachDelta += 2;
      sdDelta += 1;
      coachNote = 'Ban huấn luyện và Giám đốc Thể thao đồng thuận ưu tiên tìm người thay thế trước khi mở cửa bán.';
    }

    if (coachDelta !== 0) {
      this.state.relationshipSystem?._adjustChairmanCoachRelation?.(
        coachDelta,
        `Quyết định tham vấn chuyển nhượng ${cons.playerName}`
      );
      const hcObj = (this.state.staffDb?.active || []).find((s) => s.roleKey === 'head_coach');
      if (hcObj) hcObj.relation = clamp((hcObj.relation ?? 80) + coachDelta, 15, 100);
    }
    if (sdDelta !== 0) {
      const sdObj = (this.state.staffDb?.active || []).find((s) => s.roleKey === 'sporting_director');
      if (sdObj) sdObj.relation = clamp((sdObj.relation ?? 82) + sdDelta, 15, 100);
    }

    return { coachDelta, sdDelta, coachNote, sdNote };
  }

  executeDecision(consultationId, decisionType, params = {}) {
    const cons = this.getConsultationById(consultationId);
    if (!cons) return { ok: false, error: 'Không tìm thấy hồ sơ tham vấn.' };

    const ts = this.state.transferSystem;
    if (!ts) return { ok: false, error: 'Hệ thống chuyển nhượng chưa sẵn sàng.' };

    const bid = (ts.incomingBids || []).find((b) => b.id === cons.offerId);
    if (!bid && decisionType !== CONSULTATION_DECISIONS.REEVALUATE) {
      return { ok: false, error: 'Đề nghị chuyển nhượng này đã không còn hiệu lực.' };
    }

    if (decisionType === CONSULTATION_DECISIONS.REEVALUATE) {
      const res = this.consultOffer(cons.offerId, { forceReevaluate: true });
      return res;
    }

    if (decisionType === CONSULTATION_DECISIONS.ACCEPT) {
      const res = ts.acceptIncomingBid(bid.id);
      if (!res.ok) {
        const consequences = this._applyDecisionConsequences(cons, decisionType, { playerRejected: Boolean(res.playerRejected) });
        if (res.playerRejected) {
          cons.finalDecision = { type: decisionType, at: this._dateStr(), week: this.state.week || 1, status: 'player_rejected' };
          cons.dealOutcome = { ok: false, reason: res.error, consequences };
        }
        return { ...res, consultation: cons, consequences };
      }
      const consequences = this._applyDecisionConsequences(cons, decisionType, { deal: res.deal });
      cons.finalDecision = { type: decisionType, at: this._dateStr(), week: this.state.week || 1, fee: bid.fee };
      cons.dealOutcome = { ok: true, deal: res.deal, consequences };
      return { ok: true, decision: decisionType, deal: res.deal, consultation: cons, consequences };
    }

    if (decisionType === CONSULTATION_DECISIONS.REJECT) {
      const res = ts.rejectIncomingBid(bid.id);
      const consequences = this._applyDecisionConsequences(cons, decisionType, {});
      cons.finalDecision = { type: decisionType, at: this._dateStr(), week: this.state.week || 1 };
      cons.dealOutcome = { ok: true, rejected: true, consequences };
      return { ok: true, decision: decisionType, bid: res.bid, consultation: cons, consequences };
    }

    if (decisionType === CONSULTATION_DECISIONS.COUNTER_FEE) {
      const reqFee = Number(params.fee || Math.round(bid.fee * 1.15));
      const res = ts.counterIncomingBid(bid.id, reqFee);
      if (!res.ok) return res;
      cons.finalDecision = { type: decisionType, at: this._dateStr(), week: this.state.week || 1, requestedFee: reqFee, outcome: res.outcome };
      if (res.outcome === 'walked_away') {
        cons.dealOutcome = { ok: true, walkedAway: true, message: res.message };
      } else {
        cons.staleStatus = this.isConsultationStale(cons, res.bid || bid);
      }
      return { ...res, decision: decisionType, consultation: cons };
    }

    if (decisionType === CONSULTATION_DECISIONS.COUNTER_CLAUSES) {
      const res = ts.counterIncomingBidWithClauses(bid.id, {
        sellOnPct: params.sellOnPct,
        bonusFee: params.bonusFee,
        buyOptionFee: params.buyOptionFee,
        note: params.note
      });
      if (!res.ok) return res;
      cons.finalDecision = { type: decisionType, at: this._dateStr(), week: this.state.week || 1, params, outcome: res.outcome };
      if (res.outcome === 'walked_away') {
        cons.dealOutcome = { ok: true, walkedAway: true, message: res.message };
      } else {
        cons.staleStatus = this.isConsultationStale(cons, res.bid || bid);
      }
      return { ...res, decision: decisionType, consultation: cons };
    }

    if (decisionType === CONSULTATION_DECISIONS.REQUIRE_REPLACEMENT) {
      bid.status = 'awaiting_replacement';
      bid.replacementRequired = true;
      const existingWatch = this.replacementWatchlist.find((w) => w.playerId === cons.playerId && w.status === 'active');
      if (!existingWatch) {
        this.replacementWatchlist.unshift({
          id: `rep_${Date.now()}_${cons.playerId}`,
          playerId: cons.playerId,
          playerName: cons.playerName,
          position: cons.playerSummary.normPos,
          offerId: bid.id,
          createdWeek: this.state.week || 1,
          reason: `Chủ tịch yêu cầu khóa phương án thay thế ${cons.playerSummary.normPos} trước khi quyết định bán cho ${bid.buyerClub}.`,
          status: 'active'
        });
      }
      const consequences = this._applyDecisionConsequences(cons, decisionType, {});
      cons.finalDecision = { type: decisionType, at: this._dateStr(), week: this.state.week || 1 };
      this.state.pushPhoneMsg?.(
        'Giám đốc Thể thao PSG',
        `🔎 Ưu tiên tìm người thay thế ${cons.playerName} (${cons.playerSummary.normPos})`,
        `Đã nhận chỉ thị từ Chủ tịch: tạm giữ đề nghị từ ${bid.buyerClub} (€${bid.fee}M) và ưu tiên chốt phương án thay thế vị trí ${cons.playerSummary.normPos} trước khi bán.`,
        false
      );
      return {
        ok: true,
        decision: decisionType,
        bid,
        consultation: cons,
        consequences,
        message: `Đã giữ đề nghị của ${bid.buyerClub} ở trạng thái chờ người thay thế — cầu thủ chưa bị bán.`
      };
    }

    if (decisionType === CONSULTATION_DECISIONS.DEFER) {
      const curWeek = this.state.week || 1;
      if (bid.deadlineWeek && curWeek > bid.deadlineWeek) {
        return { ok: false, error: `Đề nghị từ ${bid.buyerClub} đã sát/quá hạn phản hồi (${bid.deadlineDate}), không thể hoãn thêm.` };
      }
      bid.status = 'deferred';
      bid.deferredWeek = curWeek;
      cons.finalDecision = { type: decisionType, at: this._dateStr(), week: curWeek };
      return {
        ok: true,
        decision: decisionType,
        bid,
        consultation: cons,
        message: `Đã tạm hoãn quyết định với ${bid.buyerClub}. Hạn phản hồi: ${bid.deadlineDate}.`
      };
    }

    return { ok: false, error: 'Hành động quyết định không hợp lệ.' };
  }

  exportState() {
    return {
      consultations: this.consultations,
      replacementWatchlist: this.replacementWatchlist
    };
  }

  importState(snap) {
    if (!snap) return;
    if (Array.isArray(snap.consultations)) {
      const seen = new Set();
      this.consultations = snap.consultations.filter((c) => {
        if (!c || !c.consultationId || seen.has(c.consultationId)) return false;
        seen.add(c.consultationId);
        return true;
      });
    }
    if (Array.isArray(snap.replacementWatchlist)) {
      this.replacementWatchlist = snap.replacementWatchlist;
    }
  }
}
