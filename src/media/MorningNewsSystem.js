// src/media/MorningNewsSystem.js
// Hệ thống "PSG Morning News" phát trên TV Phòng Chủ tịch (đủ 10 mục cố định theo dữ liệu thực tế & chống lặp lại bằng chữ ký digest).

export class MorningNewsSystem {
  constructor(state) {
    this.state = state;
    this.reset();
  }

  reset() {
    this.currentProgram = null;
    this.history = [];
    this.lastDigestSignature = '';
  }

  _computeDigestSignature(state) {
    const nextFx = state.getNextFixture?.();
    const lastRes = state.lastMatchResult;
    const negCount = state.transferSystem?.activeNegotiations?.length || 0;
    const bidCount = state.transferSystem?.incomingBids?.length || 0;
    const repCount = state.pendingReports?.length || 0;
    const crisisCount = state.rumorCrisisSystem?.crises?.filter((c) => c.status === 'active').length || 0;
    const newsTopId = state.newsArchive?.[0]?.id || 'none';
    return [
      state.season,
      state.week,
      state.dayNum,
      nextFx?.id || 'nofx',
      lastRes?.fixture?.id || 'nolast',
      negCount,
      bidCount,
      repCount,
      crisisCount,
      Math.round(state.finance?.budget || 0),
      newsTopId
    ].join('|');
  }

  generateDigest(force = false) {
    const s = this.state;
    if (!s) return null;
    const sig = this._computeDigestSignature(s);
    if (!force && this.currentProgram && this.lastDigestSignature === sig) {
      return { updated: false, program: this.currentProgram };
    }

    const squad = s.getPsgSquad ? s.getPsgSquad() : [];
    const injured = squad.filter((p) => p.injuryDays > 0);
    const avgOvr = squad.length ? (squad.reduce((sum, p) => sum + (p.ovr || 80), 0) / squad.length).toFixed(1) : '84.0';
    const topPlayer = squad[0] || { name: 'Ousmane Dembélé', ovr: 90, goals: 0 };

    const lastRes = s.lastMatchResult;
    const nextFx = s.getCurrentWeekFixture?.() || s.getNextFixture?.();
    const ts = s.transferSystem;
    const completedPsg = (ts?.completedDeals || []).filter((d) => d.from === 'Paris Saint-Germain' || d.to === 'Paris Saint-Germain');
    const negs = ts?.activeNegotiations || [];
    const bids = ts?.incomingBids || [];
    const unhandledRumors = (s.rumorCrisisSystem?.rumors || []).filter((r) => !r.handled);
    const activeCrises = (s.rumorCrisisSystem?.crises || []).filter((c) => c.status === 'active');
    const pendingEvents = s.signingEventSystem?.pendingEvents || [];

    const ligue1Sorted = [...(s.clubs || [])]
      .filter((c) => c.league === 'Ligue 1')
      .sort((a, b) => b.pts - a.pts || (b.gf - b.ga) - (a.gf - a.ga));
    const leader = ligue1Sorted[0] || { name: 'Paris Saint-Germain', pts: 0 };
    const psgRank = ligue1Sorted.findIndex((c) => c.name === 'Paris Saint-Germain') + 1;
    const topNews = s.newsArchive?.[0];
    const socialTop = s.socialFeed?.[0];
    const repAvg = s.reputationSystem?.getOverallScore() ?? s.president?.prestige ?? 86;

    const sections = [
      {
        index: 1,
        key: 'psg_headline',
        title: '1. Tin chính về Paris Saint-Germain',
        badge: topNews?.verificationStatus || topNews?.tagType || 'Chính thức',
        content: topNews
          ? `${topNews.title} — ${topNews.summary}`
          : `Chủ tịch Phạm Minh Chiêu điều hành ngày làm việc mới tại Campus PSG, duy trì điểm uy tín tổng hợp ${repAvg}/100.`
      },
      {
        index: 2,
        key: 'first_team_status',
        title: '2. Tình trạng đội một PSG',
        badge: `${squad.length} cầu thủ`,
        content: `OVR trung bình ${avgOvr}, ngôi sao dẫn dắt ${topPlayer.name} (OVR ${topPlayer.ovr}). ${injured.length > 0 ? `Y tế theo dõi ${injured.length} ca (${injured.slice(0, 2).map((p) => `${p.name} ${p.injuryDays}n`).join(', ')}).` : '100% lực lượng sẵn sàng thi đấu, không có chấn thương.'}`
      },
      {
        index: 3,
        key: 'latest_match',
        title: '3. Kết quả trận gần nhất',
        badge: lastRes ? lastRes.fixture?.comp : 'Mở màn mùa giải',
        content: lastRes
          ? `${lastRes.fixture.home} ${lastRes.homeGoals}-${lastRes.awayGoals} ${lastRes.fixture.away} (${lastRes.psgWon ? 'Chiến thắng' : lastRes.psgDrew ? 'Hòa' : 'Thất bại'}) · Cầu thủ xuất sắc nhất: ${lastRes.motm?.name || 'N/A'} (${lastRes.motm?.rating || '-'}đ).`
          : 'Chưa có trận chính thức nào khép lại trong mùa giải mới — toàn đội đang chuẩn bị cho trận khai màn.'
      },
      {
        index: 4,
        key: 'transfer_updates',
        title: '4. Tin chuyển nhượng Mercato',
        badge: ts?.isWindowOpen() ? 'Thị trường mở' : 'Đã đóng cửa',
        content: completedPsg.length > 0
          ? `Thương vụ PSG gần nhất: ${completedPsg[0].playerName} (${completedPsg[0].from} → ${completedPsg[0].to}, €${completedPsg[0].fee}M). Hiện có ${bids.length} đề nghị hỏi mua/mượn gửi tới PSG.`
          : `Kỳ chuyển nhượng đang ${ts?.isWindowOpen() ? 'mở cửa' : 'đóng'}. PSG đang nhận ${bids.length} đề nghị từ các đối thủ châu Âu và theo dõi ${unhandledRumors.length} tin đồn mới.`
      },
      {
        index: 5,
        key: 'negotiations_progress',
        title: '5. Tiến trình đàm phán hiện tại',
        badge: `${negs.length} hồ sơ`,
        content: negs.length > 0
          ? negs.slice(0, 2).map((n) => `${n.playerName} (${n.fromClub} · ${n.stage === 2 ? 'GĐ 2: Hợp đồng cá nhân' : `GĐ 1: CLB yêu cầu €${n.clubAskFee}M`})`).join(' | ')
          : 'Không có thương vụ mua/mượn nào đang kẹt tiến độ. Các hồ sơ gia hạn đội một vẫn nằm trong tầm kiểm soát.'
      },
      {
        index: 6,
        key: 'finance_ffp',
        title: '6. Tình hình tài chính & FFP',
        badge: s.finance?.ffpStatus || 'An toàn',
        content: `Ngân sách khả dụng €${(s.finance?.budget || 0).toFixed(1)}M · Quỹ chuyển nhượng €${(s.finance?.transferBudget || 0).toFixed(1)}M · Quỹ lương €${(s.finance?.weeklyWages || 0).toFixed(2)}M/tuần · Giá trị thương hiệu €${s.brandMetrics?.brandValue || 4120}M.`
      },
      {
        index: 7,
        key: 'fan_social',
        title: '7. Phản ứng người hâm mộ',
        badge: `Tín nhiệm ${s.reputationSystem?.metrics?.fanTrust ?? s.president?.fanSupport ?? 84}%`,
        content: socialTop
          ? `${socialTop.author} (${socialTop.handle}): "${socialTop.text}" (${(socialTop.likes || 0).toLocaleString('vi-VN')} lượt thích).`
          : 'Không khí tại Parc des Princes và cộng đồng mạng đang giữ mức tích cực.'
      },
      {
        index: 8,
        key: 'league_world_news',
        title: '8. Tin bóng đá quốc tế & Ligue 1',
        badge: `PSG Hạng ${psgRank || 1}`,
        content: `${leader.name} đang dẫn đầu Ligue 1 với ${leader.pts} điểm. Thị trường châu Âu ghi nhận ${(ts?.completedDeals || []).length} thương vụ hoàn tất từ đầu mùa.`
      },
      {
        index: 9,
        key: 'today_schedule',
        title: '9. Lịch trình thi đấu & huấn luyện',
        badge: s.timeSystem ? s.timeSystem.getDateString() : `Tuần ${s.week}`,
        content: `${nextFx ? `Trận kế tiếp: ${nextFx.home} vs ${nextFx.away} (${nextFx.comp} · ${nextFx.round}). ` : 'Hoàn tất lịch thi đấu hiện tại. '}Giáo án sân tập 09:00–12:00: ${s.trainingSystem?.focus || 'Cân bằng'} (${s.trainingSystem?.intensity || 'Trung bình'}).`
      },
      {
        index: 10,
        key: 'pending_presidential',
        title: '10. Vấn đề chờ Chủ tịch phê duyệt',
        badge: `${(s.pendingReports?.length || 0) + bids.length + activeCrises.length + unhandledRumors.length} đầu việc`,
        content: `Báo cáo phòng ban: ${s.pendingReports?.length || 0} · Đề nghị chuyển nhượng đến: ${bids.length} · Tin đồn cần xử lý: ${unhandledRumors.length} · Khủng hoảng: ${activeCrises.length} · Lễ ký kết chờ chủ trì: ${pendingEvents.length}.`
      }
    ];

    const program = {
      id: `mnews_${Date.now()}`,
      signature: sig,
      programTitle: 'PSG MORNING NEWS · BẢN TIN SÁNG ĐẶC BIỆT',
      presenter: 'Élodie Laurent · Trường quay PSG TV',
      dateLabel: s.timeSystem ? `${s.timeSystem.dayNameUpper} · ${s.timeSystem.getDateString()}` : `Tuần ${s.week}`,
      generatedAt: s.timeSystem ? s.timeSystem.getTimeString() : '09:00',
      sections
    };

    this.lastDigestSignature = sig;
    this.currentProgram = program;
    this.history.unshift(program);
    if (this.history.length > 14) this.history.length = 14;

    return { updated: true, program };
  }

  exportState() {
    return {
      currentProgram: this.currentProgram,
      lastDigestSignature: this.lastDigestSignature,
      history: this.history.slice(0, 7)
    };
  }

  importState(snap) {
    if (!snap) return;
    if (snap.currentProgram) this.currentProgram = snap.currentProgram;
    if (snap.lastDigestSignature) this.lastDigestSignature = snap.lastDigestSignature;
    if (Array.isArray(snap.history)) this.history = snap.history;
  }
}
