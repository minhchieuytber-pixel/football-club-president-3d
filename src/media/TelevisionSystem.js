// src/media/TelevisionSystem.js
// Hệ thống TV Truyền thông trong Phòng Chủ tịch:
// - Bật/Tắt độc lập (khi tắt màn hình 3D & UI chuyển về màu đen)
// - 9 Kênh truyền hình dữ liệu sống động theo GameState + Chế độ PSG Morning News (10 mục)
// - Canvas2D Broadcast Renderer cho màn hình TV 3D (chỉ vẽ khi TV bật & Chủ tịch ở gần Phòng Chủ tịch)

export const TV_CHANNELS = [
  { id: 'psg_tv', name: 'PSG TV', short: 'PSG TV', accent: '#da291c', bgA: '#00153d', bgB: '#002a6e', presenter: 'Élodie Laurent' },
  { id: 'football_news', name: 'Football News', short: 'FOOTBALL', accent: '#38bdf8', bgA: '#0a192f', bgB: '#102a43', presenter: 'David Harrison' },
  { id: 'transfer_news', name: 'Transfer News', short: 'MERCATO', accent: '#f59e0b', bgA: '#1e1b4b', bgB: '#312e81', presenter: 'Matteo Romano' },
  { id: 'ligue1_news', name: 'Ligue 1 News', short: 'LIGUE 1', accent: '#22c55e', bgA: '#062019', bgB: '#0f3d2e', presenter: 'Julien Bernard' },
  { id: 'ucl_news', name: 'Champions League News', short: 'UCL LIVE', accent: '#60a5fa', bgA: '#050b29', bgB: '#172554', presenter: 'Lukas Schneider' },
  { id: 'sports_finance', name: 'Sports Finance', short: 'FINANCE', accent: '#d4af37', bgA: '#17130a', bgB: '#2b220e', presenter: 'Clara Rossi' },
  { id: 'press_conference', name: 'Press Conference', short: 'PRESS LIVE', accent: '#ef4444', bgA: '#1a0a10', bgB: '#3b0d1b', presenter: 'Sophie Chevalier' },
  { id: 'football_analysis', name: 'Football Analysis', short: 'TACTICS', accent: '#a78bfa', bgA: '#130f26', bgB: '#241b4d', presenter: 'Thierry Laurey' },
  { id: 'fan_media', name: 'Fan & Media', short: 'FAN PULSE', accent: '#fb7185', bgA: '#181124', bgB: '#33163b', presenter: 'Paris Trending' }
];

export class TelevisionSystem {
  constructor(state) {
    this.state = state;
    this.reset();
  }

  reset() {
    this.isOn = true;
    this.muted = false;
    this.activeChannelId = 'psg_tv';
    this.programMode = 'channel'; // 'channel' | 'morning_news'
    this.channelSwitchPulse = 0; // Thời gian hiệu ứng chuyển kênh (giây)
    this.breakingBanner = null;
    this.breakingTimer = 0;
  }

  getChannelMeta(channelId = this.activeChannelId) {
    return TV_CHANNELS.find((c) => c.id === channelId) || TV_CHANNELS[0];
  }

  setPower(on) {
    const next = !!on;
    if (this.isOn === next) return this.isOn;
    this.isOn = next;
    if (this.isOn) {
      this.channelSwitchPulse = 0.45;
      this.state?.morningNewsSystem?.generateDigest(false);
    }
    return this.isOn;
  }

  togglePower() {
    return this.setPower(!this.isOn);
  }

  toggleMute() {
    this.muted = !this.muted;
    return this.muted;
  }

  switchChannel(channelId) {
    const target = TV_CHANNELS.find((c) => c.id === channelId);
    if (!target) return { ok: false, error: 'Kênh không tồn tại.' };
    if (!this.isOn) this.isOn = true;
    this.activeChannelId = target.id;
    this.programMode = 'channel';
    this.channelSwitchPulse = 0.55;
    return { ok: true, channel: target };
  }

  openMorningNews() {
    if (!this.isOn) this.isOn = true;
    this.activeChannelId = 'psg_tv';
    this.programMode = 'morning_news';
    this.channelSwitchPulse = 0.4;
    const digestRes = this.state?.morningNewsSystem?.generateDigest(false);
    return { ok: true, program: digestRes?.program || this.state?.morningNewsSystem?.currentProgram };
  }

  pushBreakingNews(headline, channelId = 'transfer_news') {
    this.breakingBanner = {
      headline,
      channelId,
      date: this.state?.timeSystem ? this.state.timeSystem.getTimeString() : 'LIVE'
    };
    this.breakingTimer = 45;
  }

  tick(dt) {
    if (this.channelSwitchPulse > 0) {
      this.channelSwitchPulse = Math.max(0, this.channelSwitchPulse - dt);
    }
    if (this.breakingTimer > 0) {
      this.breakingTimer = Math.max(0, this.breakingTimer - dt);
      if (this.breakingTimer === 0) this.breakingBanner = null;
    }
  }

  // Lấy dữ liệu phát sóng thực tế cho từng kênh trong 9 kênh TV
  getChannelBroadcastData(channelId = this.activeChannelId) {
    const s = this.state;
    const meta = this.getChannelMeta(channelId);
    const squad = s.getPsgSquad ? s.getPsgSquad() : [];
    const news = s.newsArchive || [];
    const nextFx = s.getCurrentWeekFixture?.() || s.getNextFixture?.();
    const lastRes = s.lastMatchResult;
    const ts = s.transferSystem;
    const ligue1 = [...(s.clubs || [])]
      .filter((c) => c.league === 'Ligue 1')
      .sort((a, b) => b.pts - a.pts || (b.gf - b.ga) - (a.gf - a.ga));

    let headline = '';
    let subheadline = '';
    let mainCards = [];
    let statsStrip = [];
    let ticker = '';

    if (channelId === 'psg_tv') {
      const mNews = s.morningNewsSystem?.currentProgram;
      const topPsgNews = news.find((n) => n.category === 'Tin PSG' || n.category === 'Nội bộ') || news[0];
      headline = topPsgNews ? topPsgNews.title : `PARIS SAINT-GERMAIN · MÙA GIẢI ${s.season}`;
      subheadline = nextFx
        ? `Trận kế tiếp: ${nextFx.home} vs ${nextFx.away} (${nextFx.comp} · ${nextFx.round})`
        : `Chủ tịch Phạm Minh Chiêu điều hành toàn diện Campus PSG`;
      mainCards = [
        { label: 'Bản Tin Sáng PSG', title: mNews?.sections?.[0]?.content || 'Bản tin 10 mục đã sẵn sàng phát sóng', tag: 'MORNING NEWS' },
        { label: 'Đội Một PSG', title: `${squad.length} cầu thủ · Đội trưởng & trụ cột sẵn sàng (${squad[0]?.name || 'PSG'} OVR ${squad[0]?.ovr || 90})`, tag: `Tuần ${s.week}` },
        { label: 'Hoạt động 3D', title: `HLV ${s.coach?.name} chỉ đạo sân tập (${s.trainingSystem?.focus || 'Cân bằng'})`, tag: s.activeKit?.toUpperCase() || 'HOME' }
      ];
      statsStrip = [
        { k: 'Ngân sách', v: `€${(s.finance?.budget || 0).toFixed(1)}M` },
        { k: 'Uy tín Chủ tịch', v: `${s.reputationSystem?.getOverallScore() ?? s.president?.prestige}/100` },
        { k: 'CĐV Toàn cầu', v: `${s.brandMetrics?.fanbase || 185.4}M` }
      ];
      ticker = `🔴 PSG TV · ${subheadline} · Giá trị thương hiệu €${s.brandMetrics?.brandValue || 4120}M · Ici c'est Paris!`;
    } else if (channelId === 'football_news') {
      const topNews = news.slice(0, 4);
      headline = topNews[0]?.title || 'TOÀN CẢNH BÓNG ĐÁ CHÂU ÂU & THẾ GIỚI';
      subheadline = `${topNews[0]?.outlet || 'Football News'} · Cập nhật theo thời gian thực`;
      mainCards = topNews.map((n) => ({
        label: `${n.outlet} · ${n.verificationStatus || n.tagType}`,
        title: n.title,
        tag: n.category
      }));
      statsStrip = [
        { k: 'Tổng bài báo', v: `${news.length}` },
        { k: 'Trận đã đấu', v: `${(s.fixtures || []).filter((f) => f.played).length}` },
        { k: 'CLB Thế giới', v: `${s.clubs?.length || 68}` }
      ];
      ticker = news.slice(0, 3).map((n) => `[${n.verificationStatus || n.tagType}] ${n.title}`).join('  ••  ') || 'Football News · Cập nhật liên tục 24/7';
    } else if (channelId === 'transfer_news') {
      const mNews = news.filter((n) => n.category === 'Chuyển nhượng' || n.category === 'Tin chuyển nhượng');
      const deals = ts?.completedDeals || [];
      const rumors = (s.rumorCrisisSystem?.rumors || []).slice(0, 2);
      const valRep = s.valuationSystem?.latestWeeklyReport;
      const topRiser = valRep?.risers?.[0];
      headline = deals[0]
        ? `MERCATO LIVE: ${deals[0].playerName} (${deals[0].from} → ${deals[0].to} · €${deals[0].fee}M)`
        : 'MERCATO CENTER · THEO DÕI THỊ TRƯỜNG CHUYỂN NHƯỢNG';
      subheadline = ts?.getWindowLabel() || 'Thị trường chuyển nhượng';
      mainCards = [
        ...deals.slice(0, 2).map((d) => ({ label: `Chính thức · ${d.date}`, title: `${d.playerName}: ${d.from} ➔ ${d.to} (€${d.fee}M)`, tag: d.type })),
        ...(topRiser ? [{ label: `Định giá Tuần ${valRep.week}`, title: `📈 ${topRiser.name} (${topRiser.club}) đạt €${topRiser.current}M (+${topRiser.deltaPct}%)`, tag: 'VALUATION' }] : []),
        ...rumors.map((r) => ({ label: `${r.verificationStatus} · ${r.source}`, title: r.title, tag: 'TIN ĐỒN' }))
      ];
      if (mainCards.length === 0 && mNews[0]) {
        mainCards.push({ label: mNews[0].verificationStatus || 'Tin đồn', title: mNews[0].title, tag: 'MERCATO' });
      }
      statsStrip = [
        { k: 'Đang đàm phán', v: `${ts?.activeNegotiations?.length || 0}` },
        { k: 'Hỏi mua PSG', v: `${ts?.incomingBids?.length || 0}` },
        { k: 'Thương vụ xong', v: `${deals.length}` }
      ];
      ticker = `MERCATO · Đang mở: ${ts?.isWindowOpen() ? 'CÓ' : 'KHÔNG'} · Quỹ CN PSG: €${(s.finance?.transferBudget || 0).toFixed(1)}M · ${topRiser ? `Tăng giá mạnh: ${topRiser.name} €${topRiser.current}M` : (rumors[0]?.title || 'Thị trường châu Âu sôi động')}`;
    } else if (channelId === 'ligue1_news') {
      const psgRow = ligue1.find((c) => c.name === 'Paris Saint-Germain') || { pts: 0, played: 0 };
      const rank = ligue1.findIndex((c) => c.name === 'Paris Saint-Germain') + 1;
      headline = `LIGUE 1 · PSG ĐANG XẾP HẠNG ${rank || 1} (${psgRow.pts} ĐIỂM)`;
      subheadline = `Dẫn đầu: ${ligue1[0]?.name || 'Paris Saint-Germain'} (${ligue1[0]?.pts || 0}đ) · Đã đấu ${psgRow.played} vòng`;
      mainCards = ligue1.slice(0, 4).map((c, idx) => ({
        label: `Hạng #${idx + 1} · ${c.manager}`,
        title: `${c.name} — ${c.pts} điểm (${c.won}T ${c.drawn}H ${c.lost}B · HS ${c.gf - c.ga})`,
        tag: c.name === 'Paris Saint-Germain' ? 'PSG' : 'LIGUE 1'
      }));
      statsStrip = [
        { k: 'Hạng PSG', v: `#${rank || 1}` },
        { k: 'Điểm số', v: `${psgRow.pts}đ` },
        { k: 'Đối thủ bám đuổi', v: ligue1[1]?.name?.split(' ').pop() || 'Monaco' }
      ];
      ticker = ligue1.slice(0, 5).map((c, i) => `${i + 1}. ${c.name} (${c.pts}đ)`).join('  |  ');
    } else if (channelId === 'ucl_news') {
      const uclFx = (s.fixtures || []).find((f) => f.comp === 'UEFA Champions League' && !f.played);
      const uclNews = news.filter((n) => n.category === 'Champions League');
      headline = uclFx
        ? `CHAMPIONS LEAGUE: ${uclFx.home} vs ${uclFx.away}`
        : 'UEFA CHAMPIONS LEAGUE · HÀNH TRÌNH ĐỈNH CAO CHÂU ÂU';
      subheadline = uclFx ? `${uclFx.round} · ${uclFx.stadium}` : 'Phân tích các ứng viên hàng đầu châu Âu';
      mainCards = (uclNews.length ? uclNews.slice(0, 3) : []).map((n) => ({
        label: n.outlet,
        title: n.title,
        tag: 'UCL'
      }));
      if (mainCards.length === 0) {
        mainCards = (s.clubs || []).filter((c) => c.rating >= 88).slice(0, 4).map((c) => ({
          label: `${c.league} · OVR ${c.rating}`,
          title: `${c.name} (HLV ${c.manager}) — Ứng viên nặng ký tại Champions League`,
          tag: 'CONTENDER'
        }));
      }
      statsStrip = [
        { k: 'Cúp C1 đã giành', v: `${s.trophySystem?.getEarnedCount?.() || 0}` },
        { k: 'Hệ số PSG', v: `${s.clubs?.[0]?.rating || 89}` },
        { k: 'Mục tiêu BĐH', v: 'Bán kết+' }
      ];
      ticker = `⭐ UEFA CHAMPIONS LEAGUE · ${headline} · Real Madrid, Man City, Bayern Munich & PSG dẫn đầu nhóm ứng viên`;
    } else if (channelId === 'sports_finance') {
      const comm = s.commercialSystem;
      const annualSponsors = comm?.getTotalSponsorAnnualRevenue() ?? s.finance?.income?.sponsors ?? 145;
      const topRichClub = s.globalClubAI?.getRivalFinanceOverview?.(3)?.find((c) => c.name !== 'Paris Saint-Germain');
      const rcvSum = (s.finance?.receivables || []).reduce((sum, r) => sum + (r.remaining || 0), 0);
      const paySum = (s.finance?.payables || []).reduce((sum, p) => sum + (p.remaining || 0), 0);
      headline = `SPORTS FINANCE · TIỀN MẶT PSG €${(s.finance?.cash ?? s.finance?.budget ?? 0).toFixed(1)}M · THƯƠNG HIỆU €${s.brandMetrics?.brandValue || 4120}M`;
      subheadline = `${s.finance?.ffpStatus || 'An toàn FFP'} · Quỹ lương €${(s.finance?.weeklyWages || 0).toFixed(2)}M/tuần`;
      mainCards = [
        { label: 'Ngân sách, Tiền mặt & Trả góp', title: `Cash: €${(s.finance?.cash ?? s.finance?.budget ?? 0).toFixed(1)}M · Quỹ CN: €${(s.finance?.transferBudget || 0).toFixed(1)}M · Phải thu €${rcvSum.toFixed(1)}M / Phải trả €${paySum.toFixed(1)}M`, tag: 'TREASURY' },
        { label: 'Tài trợ & Thương mại', title: `Doanh thu tài trợ: €${annualSponsors}M/năm · Áo đấu bán ra: ${comm?.commercial?.jerseysSoldK || 940}k chiếc`, tag: 'SPONSORS' },
        ...(topRichClub ? [{ label: 'Tài chính Đối thủ Châu Âu', title: `${topRichClub.name}: Cash €${topRichClub.cash}M · Quỹ CN €${topRichClub.transferBudget}M · ${topRichClub.ffpStatus}`, tag: topRichClub.tier?.toUpperCase() || 'RIVAL' }] : [])
      ];
      statsStrip = [
        { k: 'Tiền mặt PSG', v: `€${(s.finance?.cash ?? s.finance?.budget ?? 0).toFixed(1)}M` },
        { k: 'Lương/tuần', v: `€${(s.finance?.weeklyWages || 0).toFixed(2)}M` },
        { k: 'Uy tín Đối tác', v: `${s.reputationSystem?.metrics?.partnerTrust ?? 87}/100` }
      ];
      ticker = `💶 SPORTS FINANCE · Cash €${(s.finance?.cash ?? s.finance?.budget ?? 0).toFixed(1)}M · Tài trợ €${annualSponsors}M/năm · ${s.finance?.ffpStatus}${topRichClub ? ` · Đối thủ dẫn đầu: ${topRichClub.name} (€${topRichClub.cash}M)` : ''}`;
    } else if (channelId === 'press_conference') {
      const activeEvt = s.signingEventSystem?.activeEvent;
      const bcast = s.signingEventSystem?.broadcast;
      const archiveEvt = s.signingEventSystem?.eventArchive?.[0];
      headline = activeEvt
        ? `🔴 LIVE HỌP BÁO: ${activeEvt.headline}`
        : archiveEvt
          ? `PHÁT LẠI HỌP BÁO: ${archiveEvt.headline}`
          : 'TRUNG TÂM HỌP BÁO PARC DES PRINCES & CAMPUS PSG';
      subheadline = activeEvt
        ? `Đang trực tiếp (${(bcast?.viewerCount || 68000).toLocaleString('vi-VN')} khán giả) · MC Élodie Laurent`
        : 'Sẵn sàng kết nối trực tiếp các buổi họp báo trước/sau trận, ra mắt tân binh & xử lý truyền thông';
      mainCards = [
        {
          label: activeEvt ? 'Đang phát sóng LIVE' : 'Sự kiện gần nhất',
          title: activeEvt ? activeEvt.status : (archiveEvt ? `${archiveEvt.completedAt} · ${archiveEvt.broadcastStatus}` : 'Chưa có buổi họp báo đang trực tiếp'),
          tag: activeEvt ? 'LIVE' : 'ARCHIVE'
        },
        {
          label: 'Chủ tọa',
          title: `Chủ tịch Phạm Minh Chiêu & GĐ Truyền thông Sophie Chevalier`,
          tag: 'PSG MEDIA'
        }
      ];
      statsStrip = [
        { k: 'Sự kiện chờ', v: `${s.signingEventSystem?.pendingEvents?.length || 0}` },
        { k: 'Đã tổ chức', v: `${s.signingEventSystem?.eventArchive?.length || 0}` },
        { k: 'Uy tín Báo chí', v: `${s.reputationSystem?.metrics?.mediaTrust ?? 83}/100` }
      ];
      ticker = `🎙️ PRESS CONFERENCE CHANNEL · ${headline} · Mở Máy tính > Quản lý Truyền thông để chủ trì họp báo bất cứ lúc nào`;
    } else if (channelId === 'football_analysis') {
      const fm = s.formationSystem;
      const starters = (fm?.starterIds || []).map((id) => s.getPlayerById?.(id)).filter(Boolean);
      const starterOvr = starters.length ? (starters.reduce((sum, p) => sum + p.ovr, 0) / starters.length).toFixed(1) : '86.5';
      headline = `FOOTBALL ANALYSIS · PHÂN TÍCH HỆ THỐNG ${fm?.formation || '4-3-3'} CỦA PSG`;
      subheadline = `HLV ${s.coach?.name} · Phong cách: ${s.coach?.tacticalStyle} · OVR XI: ${starterOvr}`;
      mainCards = [
        { label: 'Sơ đồ & Chỉ số XI', title: `${fm?.formation || '4-3-3'} · OVR trung bình đội hình chính ${starterOvr}`, tag: 'TACTICS' },
        { label: 'Trận gần nhất', title: lastRes ? `Kiểm soát bóng ${lastRes.psgIsHome ? lastRes.stats.homePoss : lastRes.stats.awayPoss}% · xG ${lastRes.psgIsHome ? lastRes.stats.homeXg : lastRes.stats.awayXg}` : 'Chờ dữ liệu trận đấu đầu tiên', tag: 'DATA' },
        { label: 'Huấn luyện Campus', title: `Trọng tâm: ${s.trainingSystem?.focus || 'Cân bằng'} · Cường độ: ${s.trainingSystem?.intensity || 'Trung bình'}`, tag: 'TRAINING' }
      ];
      statsStrip = [
        { k: 'Sơ đồ', v: fm?.formation || '4-3-3' },
        { k: 'Chuỗi thua', v: `${s.loseStreak || 0}` },
        { k: 'HLV Tín nhiệm', v: `${s.reputationSystem?.metrics?.coachTrust ?? 85}/100` }
      ];
      ticker = `📊 TACTICS LAB · ${headline} · Chuyên gia đánh giá sự cân bằng giữa pressing và kiểm soát trung tuyến`;
    } else {
      // fan_media
      const social = (s.socialFeed || []).slice(0, 4);
      const crises = (s.rumorCrisisSystem?.crises || []).filter((c) => c.status === 'active');
      headline = crises[0] ? `🔥 DƯ LUẬN NÓNG: ${crises[0].title}` : 'FAN & MEDIA · NHỊP ĐẬP CỔ ĐỘNG VIÊN PARC DES PRINCES';
      subheadline = `Mạng xã hội PSG (${(s.brandMetrics?.fanbase || 185.4).toFixed(1)}M người theo dõi) · Độ hài lòng ${s.reputationSystem?.metrics?.fanTrust ?? 84}%`;
      mainCards = social.map((p) => ({
        label: `${p.author} (${p.handle})`,
        title: p.text,
        tag: `❤️ ${(p.likes || 0).toLocaleString('vi-VN')}`
      }));
      statsStrip = [
        { k: 'Fan Toàn cầu', v: `${s.brandMetrics?.fanbase || 185.4}M` },
        { k: 'Tin đồn mở', v: `${(s.rumorCrisisSystem?.rumors || []).filter((r) => !r.handled).length}` },
        { k: 'Khủng hoảng', v: `${crises.length}` }
      ];
      ticker = social.map((p) => `${p.handle}: ${p.text}`).join('  ••  ') || 'Fan & Media · Cộng đồng PSG Paris & Quốc tế';
    }

    return {
      channel: meta,
      headline,
      subheadline,
      mainCards,
      statsStrip,
      ticker: this.breakingBanner ? `⚡ BREAKING: ${this.breakingBanner.headline}  ••  ${ticker}` : ticker
    };
  }

  // Vẽ hình ảnh phát sóng trực tiếp lên Canvas2D (dùng cho màn hình TV 3D trong Phòng Chủ tịch)
  renderScreenCanvas(ctx, w, h, animTime = 0) {
    if (!ctx) return;

    // KHI TẮT: màn hình trở về màu đen tuyệt đối
    if (!this.isOn) {
      ctx.fillStyle = '#04060a';
      ctx.fillRect(0, 0, w, h);
      return;
    }

    // Hiệu ứng nhiễu sóng chuyển kênh ngắn gọn
    if (this.channelSwitchPulse > 0.28) {
      ctx.fillStyle = '#090d16';
      ctx.fillRect(0, 0, w, h);
      for (let y = 0; y < h; y += 6) {
        const shade = 25 + Math.floor(Math.sin(y * 0.7 + animTime * 42) * 22 + 22);
        ctx.fillStyle = `rgb(${shade},${shade + 6},${shade + 14})`;
        ctx.fillRect(0, y, w, 3);
      }
      ctx.fillStyle = 'rgba(255,255,255,0.85)';
      ctx.font = 'bold 20px sans-serif';
      ctx.fillText(`CHUYỂN KÊNH → ${this.getChannelMeta().name.toUpperCase()}`, 26, h / 2);
      return;
    }

    const data = this.getChannelBroadcastData(this.activeChannelId);
    const ch = data.channel;

    const grad = ctx.createLinearGradient(0, 0, w, h);
    grad.addColorStop(0, ch.bgA);
    grad.addColorStop(1, ch.bgB);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);

    // Lưới trang trí studio
    ctx.strokeStyle = 'rgba(255,255,255,0.06)';
    ctx.lineWidth = 1;
    for (let x = 0; x < w; x += 48) {
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke();
    }

    // Thanh top bar kênh
    ctx.fillStyle = 'rgba(4, 9, 20, 0.84)';
    ctx.fillRect(0, 0, w, 40);
    ctx.fillStyle = ch.accent;
    ctx.fillRect(14, 8, 126, 24);
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 12px sans-serif';
    ctx.fillText(ch.name.toUpperCase().slice(0, 16), 22, 24);

    // Chấm LIVE nhấp nháy
    const pulse = (Math.sin(animTime * 4) + 1) * 0.5;
    ctx.fillStyle = `rgba(239, 68, 68, ${0.45 + pulse * 0.55})`;
    ctx.beginPath(); ctx.arc(162, 20, 5, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#fca5a5';
    ctx.font = 'bold 11px sans-serif';
    ctx.fillText(this.programMode === 'morning_news' ? 'MORNING NEWS' : 'LIVE', 173, 24);

    ctx.fillStyle = '#cbd5e1';
    ctx.font = '11px sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText(`${this.state?.timeSystem?.getTimeString() || '09:00'} · ${ch.presenter}`, w - 16, 24);
    ctx.textAlign = 'left';

    // Tiêu đề chính trên màn hình TV 3D
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 18px sans-serif';
    const hl = data.headline.length > 48 ? `${data.headline.slice(0, 47)}…` : data.headline;
    ctx.fillText(hl, 18, 72);

    ctx.fillStyle = '#93c5fd';
    ctx.font = '12px sans-serif';
    const sub = data.subheadline.length > 64 ? `${data.subheadline.slice(0, 63)}…` : data.subheadline;
    ctx.fillText(sub, 18, 94);

    // Khối nội dung 2 card bên dưới
    const cards = (data.mainCards || []).slice(0, 2);
    cards.forEach((c, idx) => {
      const y = 112 + idx * 46;
      ctx.fillStyle = 'rgba(255,255,255,0.08)';
      ctx.fillRect(18, y, w - 36, 38);
      ctx.fillStyle = ch.accent;
      ctx.fillRect(18, y, 4, 38);

      ctx.fillStyle = '#facc15';
      ctx.font = 'bold 10px sans-serif';
      ctx.fillText(String(c.label || '').slice(0, 42), 30, y + 14);

      ctx.fillStyle = '#f8fafc';
      ctx.font = '12px sans-serif';
      ctx.fillText(String(c.title || '').slice(0, 60), 30, y + 30);
    });

    // Thanh Ticker chạy ngang phía đáy TV
    ctx.fillStyle = '#070d1c';
    ctx.fillRect(0, h - 32, w, 32);
    ctx.fillStyle = ch.accent;
    ctx.fillRect(0, h - 32, 92, 32);
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 11px sans-serif';
    ctx.fillText('TIN MỚI', 20, h - 12);

    ctx.save();
    ctx.beginPath();
    ctx.rect(98, h - 32, w - 108, 32);
    ctx.clip();
    const msg = `${data.ticker}     ••     ${data.ticker}`;
    const offset = (animTime * 48) % Math.max(300, data.ticker.length * 7);
    ctx.fillStyle = '#e2e8f0';
    ctx.font = '12px sans-serif';
    ctx.fillText(msg, 102 - offset, h - 12);
    ctx.restore();
  }

  exportState() {
    return {
      isOn: this.isOn,
      muted: this.muted,
      activeChannelId: this.activeChannelId,
      programMode: this.programMode
    };
  }

  importState(snap) {
    if (!snap) return;
    if (typeof snap.isOn === 'boolean') this.isOn = snap.isOn;
    if (typeof snap.muted === 'boolean') this.muted = snap.muted;
    if (snap.activeChannelId) this.activeChannelId = snap.activeChannelId;
    if (snap.programMode) this.programMode = snap.programMode;
  }
}
