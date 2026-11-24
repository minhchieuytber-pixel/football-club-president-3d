// src/club/CommercialFacilitySystem.js
// Quản lý Nhà tài trợ, Thương mại (áo đấu, bán lẻ, du đấu toàn cầu) & Cơ sở vật chất (nâng cấp Campus/SVĐ/Học viện/Y tế/TV)
// Đồng bộ tài chính, uy tín, thương hiệu & Event Bus.

export const FACILITY_DEFS = [
  {
    id: 'training_center',
    name: 'Trung tâm Huấn luyện Campus PSG',
    icon: '🏋️',
    category: 'Chuyên môn',
    maxLevel: 5,
    baseCost: 14,
    weeklyUpkeep: 0.25,
    bonusDesc: (lv) => `+${lv * 4}% tốc độ phát triển kỹ thuật & thể lực trong buổi tập 3D`
  },
  {
    id: 'medical_lab',
    name: 'Trung tâm Y tế & Phục hồi Cryotherapy',
    icon: '🏥',
    category: 'Y tế',
    maxLevel: 5,
    baseCost: 11,
    weeklyUpkeep: 0.2,
    bonusDesc: (lv) => `Giảm ${lv * 7}% rủi ro chấn thương và rút ngắn thời gian điều trị`
  },
  {
    id: 'youth_academy',
    name: 'Học viện Bóng đá PSG',
    icon: '🎓',
    category: 'Đào tạo trẻ',
    maxLevel: 5,
    baseCost: 12,
    weeklyUpkeep: 0.22,
    bonusDesc: (lv) => `+${lv * 6}% xác suất tăng OVR hàng tuần cho cầu thủ U15–U19`
  },
  {
    id: 'parc_vip',
    name: 'Parc des Princes VIP & Mặt cỏ Hybrid',
    icon: '🏟️',
    category: 'Sân vận động',
    maxLevel: 5,
    baseCost: 18,
    weeklyUpkeep: 0.35,
    bonusDesc: (lv) => `+€${(lv * 0.7).toFixed(1)}M doanh thu vé & khu VIP mỗi trận sân nhà`
  },
  {
    id: 'media_studio',
    name: 'Trường quay PSG TV & Truyền thông Số',
    icon: '📺',
    category: 'Truyền thông',
    maxLevel: 5,
    baseCost: 9,
    weeklyUpkeep: 0.16,
    bonusDesc: (lv) => `+${lv * 12}% sức lan tỏa họp báo, giảm tác động khủng hoảng báo chí`
  },
  {
    id: 'presidential_hq',
    name: 'Trung tâm Dữ liệu & Điều hành Chủ tịch',
    icon: '🏛️',
    category: 'Quản trị',
    maxLevel: 5,
    baseCost: 10,
    weeklyUpkeep: 0.18,
    bonusDesc: (lv) => `+${lv * 3}% hiệu quả tuyển trạch & đàm phán chuyển nhượng`
  }
];

export class CommercialFacilitySystem {
  constructor(state) {
    this.state = state;
    this.reset();
  }

  reset() {
    this.sponsors = [
      {
        id: 'sp_qatar',
        name: 'Qatar Airways',
        sector: 'Hàng không Quốc tế',
        slot: 'Nhà tài trợ Áo đấu Chính',
        annualValueM: 72.0,
        yearsLeft: 3,
        satisfaction: 88,
        objective: 'Top 2 Ligue 1 & Vòng Knock-out UCL',
        bonusM: 10.0,
        status: 'active'
      },
      {
        id: 'sp_nike',
        name: 'Nike · Jordan Brand',
        sector: 'Trang phục Thể thao',
        slot: 'Nhà tài trợ Trang phục & Áo đấu',
        annualValueM: 45.0,
        yearsLeft: 4,
        satisfaction: 91,
        objective: 'Doanh số áo đấu ≥ 1.1M chiếc/mùa',
        bonusM: 8.0,
        status: 'active'
      },
      {
        id: 'sp_goat',
        name: 'GOAT Global',
        sector: 'Thương mại Điện tử Luxury',
        slot: 'Logo Tay áo Chính thức',
        annualValueM: 14.0,
        yearsLeft: 2,
        satisfaction: 84,
        objective: 'Tăng trưởng người hâm mộ toàn cầu +3%',
        bonusM: 3.0,
        status: 'active'
      },
      {
        id: 'sp_accor',
        name: 'ALL · Accor Live Limitless',
        sector: 'Khách sạn & Du lịch',
        slot: 'Đối tác Chiến lược Toàn cầu',
        annualValueM: 14.0,
        yearsLeft: 1,
        satisfaction: 82,
        objective: 'Giữ uy tín thương hiệu ≥ 80 điểm',
        bonusM: 2.5,
        status: 'active'
      }
    ];

    this.sponsorOffers = [
      {
        id: 'offer_emirates_vip',
        name: 'Dior Maison Paris',
        sector: 'Thời trang Cao cấp',
        slot: 'Đối tác Trang phục & VIP Parc des Princes',
        annualValueM: 16.5,
        years: 3,
        signingBonusM: 6.0,
        minPrestige: 80,
        objective: 'Tổ chức sự kiện thương mại & duy trì hình ảnh Modern Luxury',
        status: 'pending'
      },
      {
        id: 'offer_orange_tech',
        name: 'Orange 5G France',
        sector: 'Viễn thông & Công nghệ',
        slot: 'Đối tác Hạ tầng Số Campus PSG',
        annualValueM: 11.5,
        years: 3,
        signingBonusM: 4.0,
        minPrestige: 74,
        objective: 'Phát triển nền tảng PSG TV & tương tác CĐV',
        status: 'pending'
      },
      {
        id: 'offer_crypto_global',
        name: 'Paris FinTech Group',
        sector: 'Tài chính Số',
        slot: 'Đối tác Khu vực Châu Á – Châu Âu',
        annualValueM: 19.0,
        years: 2,
        signingBonusM: 5.5,
        minPrestige: 85,
        objective: 'Tham dự UEFA Champions League & giữ top 3 truyền thông',
        status: 'pending'
      }
    ];

    this.commercial = {
      jerseysSoldK: 940,
      jerseyPriceEur: 115,
      merchRevenueM: 54.0,
      globalStores: 14,
      tourCompletedThisSeason: false,
      activeCampaigns: [
        { id: 'cmp_home_kit', name: 'Ra mắt Áo đấu Sân nhà Hechter 2026/27', status: 'Đang chạy', boostPct: 12, revenueM: 18.4 }
      ],
      topSellingStars: []
    };

    this.facilities = {
      training_center: { level: 3, condition: 92 },
      medical_lab: { level: 3, condition: 90 },
      youth_academy: { level: 3, condition: 94 },
      parc_vip: { level: 4, condition: 95 },
      media_studio: { level: 3, condition: 91 },
      presidential_hq: { level: 3, condition: 96 }
    };
  }

  getFacilityLevel(facilityId) {
    return this.facilities[facilityId]?.level || 1;
  }

  getTotalSponsorAnnualRevenue() {
    return +this.sponsors.reduce((s, sp) => s + (sp.annualValueM || 0), 0).toFixed(1);
  }

  getTotalWeeklyFacilityUpkeep() {
    return +FACILITY_DEFS.reduce((sum, def) => {
      const lv = this.getFacilityLevel(def.id);
      return sum + def.weeklyUpkeep * lv;
    }, 0).toFixed(2);
  }

  getTopSellingPlayers(limit = 5) {
    const squad = this.state?.getPsgSquad ? this.state.getPsgSquad() : [];
    return [...squad]
      .sort((a, b) => ((b.popularity || b.ovr) + b.goals * 2) - ((a.popularity || a.ovr) + a.goals * 2))
      .slice(0, limit)
      .map((p) => {
        const pop = p.popularity || p.ovr || 82;
        const estSoldK = Math.round(pop * 1.45 + (p.goals || 0) * 3.2);
        return {
          id: p.id,
          name: p.name,
          shirtNumber: p.shirtNumber || '-',
          position: p.position,
          popularity: pop,
          estSoldK,
          estRevenueM: +((estSoldK * 1000 * this.commercial.jerseyPriceEur) / 1e6 * 0.35).toFixed(1)
        };
      });
  }

  signSponsorOffer(offerId) {
    const idx = this.sponsorOffers.findIndex((o) => o.id === offerId);
    if (idx === -1) return { ok: false, error: 'Không tìm thấy đề nghị tài trợ.' };
    const offer = this.sponsorOffers[idx];
    const overallRep = this.state.reputationSystem?.getOverallScore() ?? this.state.president?.prestige ?? 80;
    if (overallRep < offer.minPrestige) {
      return { ok: false, error: `Đối tác ${offer.name} yêu cầu uy tín Chủ tịch tối thiểu ${offer.minPrestige}/100 (hiện tại: ${overallRep}).` };
    }

    this.sponsorOffers.splice(idx, 1);
    const newSponsor = {
      id: `sp_${Date.now()}`,
      name: offer.name,
      sector: offer.sector,
      slot: offer.slot,
      annualValueM: offer.annualValueM,
      yearsLeft: offer.years,
      satisfaction: 90,
      objective: offer.objective,
      bonusM: +(offer.annualValueM * 0.15).toFixed(1),
      status: 'active'
    };
    this.sponsors.unshift(newSponsor);

    if (this.state.finance) {
      this.state.finance.income.sponsors = this.getTotalSponsorAnnualRevenue();
      this.state.addLedger(`Ký hợp đồng tài trợ ${offer.name} (Thưởng ký)`, +offer.signingBonusM);
    }

    this.state.reputationSystem?.applyDelta(
      { partnerTrust: +4, governanceSkill: +2, mediaTrust: +2 },
      `Ký tài trợ chiến lược với ${offer.name} (€${offer.annualValueM}M/năm)`,
      `sponsor_sign_${newSponsor.id}`
    );

    this.state.signingEventSystem?.triggerCommercialEvent?.('major_sponsor', offer.name, offer.signingBonusM);

    this.state.eventBus?.emit('SPONSOR_SIGNED', {
      sponsorName: offer.name,
      slot: offer.slot,
      annualValueM: offer.annualValueM,
      signingBonusM: offer.signingBonusM,
      years: offer.years,
      official: true
    }, `sponsor_signed_${offer.id}`);

    return { ok: true, sponsor: newSponsor };
  }

  renewSponsor(sponsorId) {
    const sp = this.sponsors.find((x) => x.id === sponsorId);
    if (!sp) return { ok: false, error: 'Không tìm thấy nhà tài trợ.' };
    if (sp.satisfaction < 55) {
      return { ok: false, error: `${sp.name} chưa hài lòng (${sp.satisfaction}%) để gia hạn ngay lúc này.` };
    }
    const repBonus = (this.state.reputationSystem?.metrics?.partnerTrust || 85) >= 85 ? 1.12 : 1.05;
    sp.annualValueM = +(sp.annualValueM * repBonus).toFixed(1);
    sp.yearsLeft += 2;
    sp.satisfaction = Math.min(100, sp.satisfaction + 6);
    if (this.state.finance) {
      this.state.finance.income.sponsors = this.getTotalSponsorAnnualRevenue();
      this.state.addLedger(`Gia hạn hợp đồng tài trợ ${sp.name} (+2 năm)`, +3.5);
    }
    this.state.reputationSystem?.applyDelta({ partnerTrust: +3 }, `Gia hạn thành công đối tác ${sp.name}`);
    this.state.eventBus?.emit('SPONSOR_SIGNED', {
      sponsorName: sp.name,
      slot: sp.slot,
      annualValueM: sp.annualValueM,
      signingBonusM: 3.5,
      years: sp.yearsLeft,
      isRenewal: true,
      official: true
    });
    return { ok: true, sponsor: sp };
  }

  launchCommercialCampaign(campaignType) {
    const costMap = {
      jersey_star: { cost: 2.5, name: 'Chiến dịch Áo đấu Ngôi sao Toàn cầu', merchGain: 9.5, soldK: 95, fanGain: 1.4 },
      global_store: { cost: 4.0, name: 'Mở rộng PSG Flagship Store Châu Á & Mỹ', merchGain: 13.0, soldK: 70, fanGain: 2.1 },
      exhibition_tour: { cost: 3.0, name: 'Tour Giao hữu & Tri ân CĐV Quốc tế', merchGain: 11.2, soldK: 65, fanGain: 2.6 }
    };
    const cfg = costMap[campaignType];
    if (!cfg) return { ok: false, error: 'Chiến dịch không hợp lệ.' };
    if (campaignType === 'exhibition_tour' && this.commercial.tourCompletedThisSeason) {
      return { ok: false, error: 'Mùa giải này PSG đã tổ chức Tour du đấu quốc tế rồi.' };
    }
    if ((this.state.finance?.budget || 0) < cfg.cost) {
      return { ok: false, error: 'Ngân sách CLB không đủ để triển khai chiến dịch này.' };
    }

    if (campaignType === 'exhibition_tour') this.commercial.tourCompletedThisSeason = true;
    const netGain = +(cfg.merchGain - cfg.cost).toFixed(1);
    this.commercial.jerseysSoldK += cfg.soldK;
    this.commercial.merchRevenueM = +(this.commercial.merchRevenueM + cfg.merchGain).toFixed(1);
    if (campaignType === 'global_store') this.commercial.globalStores++;
    this.commercial.activeCampaigns.unshift({
      id: `cmp_${Date.now()}`,
      name: cfg.name,
      status: 'Hoàn tất triển khai',
      boostPct: 14,
      revenueM: cfg.merchGain
    });
    if (this.commercial.activeCampaigns.length > 12) this.commercial.activeCampaigns.length = 12;

    this.state.addLedger(`${cfg.name} (Doanh thu ròng)`, +netGain);
    if (this.state.finance?.income) {
      this.state.finance.income.merch = this.commercial.merchRevenueM;
    }
    if (this.state.brandMetrics) {
      this.state.brandMetrics.fanbase = +(this.state.brandMetrics.fanbase + cfg.fanGain).toFixed(2);
      this.state.brandMetrics.brandValue = +(this.state.brandMetrics.brandValue + 18).toFixed(1);
    }

    this.state.reputationSystem?.applyDelta(
      { fanTrust: +2, partnerTrust: +3, governanceSkill: +1 },
      `Triển khai ${cfg.name}`
    );

    this.state.eventBus?.emit('COMMERCIAL_MILESTONE', {
      campaignType,
      title: cfg.name,
      revenueM: cfg.merchGain,
      jerseysSoldK: cfg.soldK,
      fanGainM: cfg.fanGain
    });

    return { ok: true, campaign: cfg, netGain };
  }

  upgradeFacility(facilityId) {
    const def = FACILITY_DEFS.find((d) => d.id === facilityId);
    const fac = this.facilities[facilityId];
    if (!def || !fac) return { ok: false, error: 'Không tìm thấy cơ sở vật chất.' };
    if (fac.level >= def.maxLevel) return { ok: false, error: `${def.name} đã đạt cấp tối đa (${def.maxLevel}/${def.maxLevel}).` };

    const cost = Math.round(def.baseCost * (1 + (fac.level - 1) * 0.45));
    if ((this.state.finance?.budget || 0) < cost) {
      return { ok: false, error: `Ngân sách CLB (€${this.state.finance.budget.toFixed(1)}M) chưa đủ chi phí nâng cấp €${cost}M.` };
    }

    fac.level++;
    fac.condition = 100;
    this.state.addLedger(`Nâng cấp ${def.name} lên Cấp ${fac.level}`, -cost);
    if (this.state.finance?.expenses) {
      this.state.finance.expenses.maintenance = +(this.state.finance.expenses.maintenance + def.weeklyUpkeep * 12).toFixed(1);
    }

    this.state.reputationSystem?.applyDelta(
      { governanceSkill: +3, playerTrust: +2, coachTrust: +2 },
      `Nâng cấp ${def.name} lên Cấp ${fac.level}`
    );

    this.state.eventBus?.emit('FACILITY_UPGRADED', {
      facilityId,
      name: def.name,
      newLevel: fac.level,
      cost,
      bonusText: def.bonusDesc(fac.level)
    });

    return { ok: true, facilityId, name: def.name, newLevel: fac.level, cost };
  }

  exportState() {
    return {
      sponsors: this.sponsors,
      sponsorOffers: this.sponsorOffers,
      commercial: this.commercial,
      facilities: this.facilities
    };
  }

  importState(snap) {
    if (!snap) return;
    if (Array.isArray(snap.sponsors)) this.sponsors = snap.sponsors;
    if (Array.isArray(snap.sponsorOffers)) this.sponsorOffers = snap.sponsorOffers;
    if (snap.commercial) this.commercial = { ...this.commercial, ...snap.commercial };
    if (snap.facilities) this.facilities = { ...this.facilities, ...snap.facilities };
  }
}
