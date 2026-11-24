// src/media/MediaNewsGenerator.js
// Hệ thống Báo chí 8 tòa soạn độc lập (MediaNewsGenerator), Phản ứng 6 nhóm người hâm mộ (FanReactionSystem)
// & Tác động Thương hiệu - Danh tiếng cân bằng (MediaReputationSystem). Chống trùng lặp bài báo & chống cộng thưởng 2 lần!

export const MEDIA_OUTLETS_8 = [
  { name: 'PSG Official', author: 'Ban Biên Tập PSG.fr', angle: 'official', category: 'Tin PSG' },
  { name: 'PSG TV', author: 'Élodie Laurent · PSG TV', angle: 'broadcast', category: 'Tin PSG' },
  { name: 'Football World News', author: 'David Harrison', angle: 'global', category: 'Chuyển nhượng' },
  { name: 'Sports Daily', author: 'Matthieu Delacroix', angle: 'tactical', category: 'Chuyển nhượng' },
  { name: 'Transfer Insider', author: 'Matteo Romano', angle: 'finance', category: 'Chuyển nhượng' },
  { name: 'European Football Media', author: 'Lukas Schneider', angle: 'ucl', category: 'Champions League' },
  { name: 'International Sports Network', author: 'Clara Rossi', angle: 'star_power', category: 'Nội bộ' },
  { name: 'Fan Forum', author: 'Cộng đồng Parc des Princes', angle: 'fans', category: 'Tin PSG' }
];

function buildEventImageSvg(headline, subline, badgeText) {
  const esc = (s) => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 300">
    <defs><linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#001640"/><stop offset="55%" stop-color="#00205b"/><stop offset="100%" stop-color="#0f172a"/></linearGradient></defs>
    <rect width="640" height="300" fill="url(#bg)"/>
    <rect x="0" y="0" width="640" height="8" fill="#da291c"/>
    <rect x="0" y="292" width="640" height="8" fill="#d4af37"/>
    <circle cx="548" cy="145" r="78" fill="rgba(218,41,28,0.18)" stroke="#d4af37" stroke-width="2.5"/>
    <text x="548" y="140" text-anchor="middle" fill="#fff" font-size="28" font-weight="900" font-family="sans-serif">PSG</text>
    <text x="548" y="168" text-anchor="middle" fill="#fde68a" font-size="13" font-weight="700" font-family="sans-serif">PARIS</text>
    <rect x="30" y="34" width="210" height="28" rx="14" fill="#da291c"/>
    <text x="135" y="53" text-anchor="middle" fill="#fff" font-size="12" font-weight="800" font-family="sans-serif">${esc(badgeText)}</text>
    <text x="30" y="128" fill="#fff" font-size="28" font-weight="900" font-family="sans-serif">${esc(headline.slice(0, 32))}</text>
    <text x="30" y="166" fill="#93c5fd" font-size="18" font-weight="700" font-family="sans-serif">${esc(subline.slice(0, 48))}</text>
    <text x="30" y="255" fill="#cbd5e1" font-size="13" font-weight="600" font-family="sans-serif">OFFICIAL SIGNING &amp; PRESS EVENT · PARC DES PRINCES · CHỦ TỊCH PHẠM MINH CHIÊU</text>
  </svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

export class FanReactionSystem {
  // Tạo phản ứng chân thực từ 6 nhóm đối tượng dựa trên dữ liệu sự kiện & câu trả lời của Chủ tịch
  static generateReactions(event, state) {
    const subj = event.subjectName;
    const fee = event.fee || 0;
    const ovr = event.ovr || 82;
    const pos = event.position || '';
    const presTone = event.presidentAnswers?.[0]?.tone || 'strategic';
    const highFee = fee >= 65;

    return [
      {
        group: 'Người hâm mộ PSG',
        author: 'Collectif Ultras Paris',
        sentiment: ovr >= 84 || event.eventType === 'youth_promotion' ? 'positive' : 'neutral',
        text: event.eventType === 'youth_promotion'
          ? `Tuyệt vời! Chủ tịch Phạm Minh Chiêu giữ đúng bản sắc khi trao cơ hội cho tài năng Học viện ${subj}. Đây là tương lai của Paris!`
          : ovr >= 86
            ? `Bản hợp đồng quá đẳng cấp! ${subj} (${pos}) sẽ nâng tầm PSG tại UEFA Champions League. Cảm ơn Chủ tịch Phạm Minh Chiêu!`
            : `Chào mừng ${subj} đến Parc des Princes! Hy vọng cậu ấy sớm hòa nhập và chứng tỏ giá trị trong màu áo PSG.`
      },
      {
        group: 'Người hâm mộ trung lập',
        author: 'EuroFoot Watcher',
        sentiment: 'neutral',
        text: highFee
          ? `PSG chi €${fee}M cho ${subj} cho thấy tham vọng cực lớn mùa ${state.season}. Hãy chờ xem màn thể hiện thực tế tại Ligue 1 & UCL.`
          : `Nước đi khá thông minh của PSG với thương vụ ${subj}. Đội hình Paris đang ngày càng cân bằng hơn.`
      },
      {
        group: 'Người hâm mộ đối thủ',
        author: 'RivalFan_OM',
        sentiment: 'skeptical',
        text: highFee
          ? `Chi €${fee}M rồi mở họp báo hoành tráng, nhưng liệu ${subj} có chịu nổi áp lực cạnh tranh vị trí chính thức ở Paris không?`
          : `PSG lại bổ sung thêm nhân sự mới. Cuộc đua Ligue 1 mùa này sẽ rất căng thẳng, nhưng tiền không phải lúc nào cũng đảm bảo danh hiệu.`
      },
      {
        group: 'Chuyên gia bóng đá',
        author: 'Thierry Laurey · Chuyên gia chiến thuật',
        sentiment: 'positive',
        text: `Về chuyên môn, ${subj} phù hợp với hệ thống ${state.formationSystem?.formation || '4-3-3'} của HLV ${state.coach?.name || 'PSG'}. ${presTone === 'strategic' ? 'Phát biểu điềm tĩnh của Chủ tịch Phạm Minh Chiêu cho thấy dự án có chiều sâu.' : 'Thông điệp đầy tham vọng từ Ban lãnh đạo sẽ tạo động lực nhưng cũng đặt áp lực lớn lên toàn đội.'}`
      },
      {
        group: 'Nhà báo',
        author: 'Matthieu Delacroix · Sports Daily',
        sentiment: 'neutral',
        text: `Buổi lễ ký kết và họp báo trực tiếp PSG TV được tổ chức theo tiêu chuẩn hàng đầu châu Âu (${(event.broadcastPeakViewers || 72000).toLocaleString('vi-VN')} lượt xem trực tiếp).`
      },
      {
        group: 'Cộng đồng mạng',
        author: '@ParisTrending',
        sentiment: 'positive',
        text: `Hashtag #Welcome${subj.replace(/\s+/g, '')} đang lọt Top Trending tại Pháp sau buổi ra mắt trực tiếp trên PSG TV! 🔥🔴🔵`
      }
    ];
  }
}

export class MediaNewsGenerator {
  // Sinh 8 bài viết độc lập từ 8 tòa soạn (chống trùng lặp theo eventId + outlet, không đăng nếu sự kiện chưa hợp lệ!)
  static generateArticlesForEvent(event, state, fanReactions = []) {
    if (!event || !event.eventId || !event.dealVerified) return [];
    if (!state.newsArchive) state.newsArchive = [];

    const dateStr = state.timeSystem ? `${state.timeSystem.getDateString()} · ${state.timeSystem.getTimeString()}` : `Tuần ${state.week}`;
    const subj = event.subjectName;
    const feeTxt = event.fee > 0 ? `€${event.fee}M` : (event.eventType === 'youth_promotion' ? 'đôn từ Học viện' : 'thỏa thuận chính thức');
    const shirtTxt = event.shirtNumber ? `số áo #${event.shirtNumber}` : 'vai trò mới';
    const presQuote = event.presidentAnswers?.[0]?.text || 'PSG đang xây dựng đội hình hướng đến những danh hiệu lớn.';
    const playerQuote = event.playerAnswers?.[0]?.text || `"Tôi rất tự hào khi gia nhập Paris Saint-Germain."`;
    const viewers = (event.broadcastPeakViewers || 68000).toLocaleString('vi-VN');

    const created = [];

    MEDIA_OUTLETS_8.forEach((out, idx) => {
      const uniqueArticleKey = `evart_${event.eventId}_${idx}`;
      // Chống trùng lặp tuyệt đối!
      if (state.newsArchive.some((a) => a.id === uniqueArticleKey)) return;

      let title = '';
      let summary = '';
      let body = '';

      if (out.angle === 'official') {
        title = `CHÍNH THỨC: PSG công bố ${subj} (${shirtTxt}) tại Trụ sở Campus PSG`;
        summary = `Chủ tịch Phạm Minh Chiêu đã chủ trì lễ ký hợp đồng và họp báo ra mắt ${subj} trước truyền thông Paris.`;
        body = `Paris Saint-Germain hân hạnh xác nhận ${subj} chính thức gắn bó với đội bóng${event.contractYears ? ` theo bản hợp đồng ${event.contractYears} năm` : ''}. Phát biểu trong buổi họp báo, Chủ tịch Phạm Minh Chiêu nhấn mạnh: "${presQuote}". Về phần mình, ${subj} chia sẻ: ${playerQuote}`;
      } else if (out.angle === 'broadcast') {
        title = `PSG TV LIVE: Hơn ${viewers} khán giả theo dõi lễ ra mắt ${subj}`;
        summary = `Chương trình PSG TV – Official Signing Ceremony thu hút sự quan tâm lớn với phần hỏi đáp trực tiếp cùng Chủ tịch và tân binh.`;
        body = `Buổi phát sóng trực tiếp từ Phòng Họp Báo PSG đã ghi nhận đỉnh điểm ${viewers} người xem cùng lúc. Từ khoảnh khắc Chủ tịch Phạm Minh Chiêu bắt tay ${subj} tại Phòng Ký Hợp Đồng cho đến màn cầm áo đấu PSG, mọi khoảnh khắc đều tạo hiệu ứng bùng nổ trên mạng xã hội.`;
      } else if (out.angle === 'global') {
        title = `Thương vụ ${subj} (${feeTxt}) của PSG tạo sức hút lớn trên thị trường bóng đá thế giới`;
        summary = `Truyền thông quốc tế đánh giá cao quy mô tổ chức lễ ra mắt và thông điệp tham vọng từ Paris Saint-Germain.`;
        body = `Không chỉ là một bản hợp đồng chuyên môn, sự kiện ra mắt ${subj} dưới sự chủ trì của Chủ tịch Phạm Minh Chiêu còn cho thấy vị thế thương hiệu toàn cầu của PSG. Các chuyên gia nhận định đây là lời tuyên chiến rõ ràng cho mùa giải ${state.season}.`;
      } else if (out.angle === 'tactical') {
        title = `Phân tích chuyên môn: ${subj} sẽ phù hợp ra sao trong sơ đồ ${state.formationSystem?.formation || '4-3-3'} của PSG?`;
        summary = `HLV ${state.coach?.name || 'PSG'} có thêm lựa chọn chất lượng ở vị trí ${event.position || 'trọng yếu'} sau buổi ra mắt hôm nay.`;
        body = `Với năng lực chuyên môn đã được kiểm chứng${event.ovr ? ` (OVR ${event.ovr})` : ''}, ${subj} giúp tăng chiều sâu đội hình PSG cho cả Ligue 1 lẫn đấu trường châu Âu. Trong buổi họp báo, tân binh cũng khẳng định quyết tâm cạnh tranh sòng phẳng tại sân tập.`;
      } else if (out.angle === 'finance') {
        title = `Chi tiết hợp đồng ${subj} tại PSG: Phí ${feeTxt}${event.wage ? ` · Lương €${event.wage}k/tuần` : ''}`;
        summary = `Bóc tách cấu trúc tài chính của thương vụ vừa được công bố chính thức tại Paris.`;
        body = `Theo nguồn tin từ Transfer Insider, thương vụ ${subj}${event.fromClub ? ` từ ${event.fromClub}` : ''} đã hoàn tất đầy đủ 2 giai đoạn đàm phán trước khi bước vào lễ ký kết. Chủ tịch Phạm Minh Chiêu khẳng định PSG vẫn kiểm soát tốt quỹ lương và tuân thủ FFP.`;
      } else if (out.angle === 'ucl') {
        title = `Chủ tịch Phạm Minh Chiêu gửi thông điệp Champions League trong ngày ra mắt ${subj}`;
        summary = `Các đối thủ lớn tại châu Âu đang dõi theo sát động thái tăng cường lực lượng của PSG.`;
        body = `Phát biểu trước giới truyền thông châu Âu, Chủ tịch Phạm Minh Chiêu tuyên bố: "${presQuote}". Với chất lượng đội hình hiện tại, PSG tiếp tục nằm trong nhóm ứng viên hàng đầu tại UEFA Champions League ${state.season}.`;
      } else if (out.angle === 'star_power') {
        title = `${subj} lần đầu xuất hiện trước truyền thông Paris: Bản lĩnh và khát khao danh hiệu`;
        summary = `Góc nhìn hậu trường từ phòng ký hợp đồng sang trọng đến sân khấu họp báo quốc tế của PSG.`;
        body = `Trước ống kính của các phóng viên quốc tế, ${subj} tỏ ra tự tin khi chia sẻ: ${playerQuote}. Sự chuẩn bị bài bản của Giám đốc truyền thông và Ban lãnh đạo giúp hình ảnh PSG ghi điểm mạnh với các đối tác thương mại.`;
      } else {
        title = `CĐV PSG bùng nổ phản ứng sau lễ công bố ${subj}: Kỳ vọng lớn tại Parc des Princes`;
        summary = `Hàng nghìn bình luận sôi nổi trên diễn đàn người hâm mộ xoay quanh bản hợp đồng mới của Chủ tịch Phạm Minh Chiêu.`;
        body = `Ngay sau khi họp báo khép lại, diễn đàn Fan Forum ghi nhận làn sóng thảo luận sôi nổi. Đa số CĐV Paris hào hứng chờ đợi màn ra mắt trên sân cỏ của ${subj}, trong khi một số ý kiến trung lập kỳ vọng cầu thủ nhanh chóng chứng minh xứng đáng với kỳ vọng.`;
      }

      const views = Math.round((12000 + (event.ovr || 80) * 450 + (event.fee || 15) * 600) * (0.8 + (idx % 4) * 0.14));
      const article = {
        id: uniqueArticleKey,
        eventId: event.eventId,
        outlet: out.name,
        author: out.author,
        category: out.category,
        tagType: event.eventType === 'record_signing' ? 'Kỷ lục' : 'Chính thức',
        date: dateStr,
        title,
        summary,
        body,
        image: buildEventImageSvg(subj, title, out.name.toUpperCase()),
        views,
        interestScore: Math.min(100, Math.round(68 + (event.ovr ? (event.ovr - 70) * 1.1 : 12) + (event.fee >= 60 ? 10 : 0))),
        likes: Math.round(views * 0.18),
        read: false,
        saved: false,
        comments: fanReactions.slice(0, 3).map((r) => ({ user: `${r.author} (${r.group})`, text: r.text }))
      };

      state.newsArchive.unshift(article);
      created.push(article);
    });

    if (state.newsArchive.length > 90) state.newsArchive.length = 90;
    return created;
  }
}

export class MediaReputationSystem {
  static ensureBrandMetrics(state) {
    if (!state.brandMetrics) {
      state.brandMetrics = {
        globalReputation: 86,
        mediaInfluence: 84,
        brandValue: 4120,      // Triệu €
        fanbase: 185.4,        // Triệu người hâm mộ toàn cầu
        fanSatisfaction: state.president?.fanSupport || 84,
        sponsorAppeal: 87,
        commercialValue: 86,
        appliedEventIds: []
      };
    }
    return state.brandMetrics;
  }

  // Áp dụng tác động hợp lý, không lạm phát, và TUYỆT ĐỐI không cộng thưởng 2 lần cho cùng 1 eventId!
  static applyEventImpact(event, state) {
    const bm = MediaReputationSystem.ensureBrandMetrics(state);
    if (bm.appliedEventIds.includes(event.eventId)) {
      return { applied: false, reason: 'Sự kiện này đã được tính thưởng trước đó.', delta: null };
    }

    // Tổng hợp tác động từ các câu trả lời của Chủ tịch trong họp báo
    const qaSum = { mediaReputation: 0, fanTrust: 0, boardConfidence: 0, playerMorale: 0, sponsorAppeal: 0, publicImage: 0 };
    (event.presidentAnswers || []).forEach((ans) => {
      if (!ans.impact) return;
      Object.keys(qaSum).forEach((k) => { qaSum[k] += (ans.impact[k] || 0); });
    });

    // Hệ số tầm vóc thực tế (cầu thủ thường không thể làm tăng danh tiếng như siêu sao OVR 90!)
    const starScale = event.eventType === 'record_signing' ? 1.0
      : (event.ovr || 80) >= 88 ? 0.85
        : (event.ovr || 80) >= 83 ? 0.55
          : event.eventType === 'head_coach_appointment' ? 0.75
            : event.eventType === 'major_sponsor' ? 0.65
              : 0.35;

    const qualityMult = event.hadPressConference ? 1.0 : 0.45;
    const clampDelta = (v, min, max) => Math.max(min, Math.min(max, Math.round(v)));

    const delta = {
      globalReputation: clampDelta((qaSum.mediaReputation * 0.25 + 1.5 * starScale) * qualityMult, -2, 4),
      mediaInfluence:   clampDelta((qaSum.publicImage * 0.3 + 2.0 * starScale) * qualityMult, -2, 5),
      brandValueM:      +(Math.max(-10, Math.min(45, (12 * starScale + qaSum.sponsorAppeal * 1.4) * qualityMult))).toFixed(1),
      fanbaseM:         +(Math.max(-0.2, Math.min(2.8, (0.9 * starScale + qaSum.fanTrust * 0.08) * qualityMult))).toFixed(2),
      fanSatisfaction:  clampDelta(qaSum.fanTrust * 0.45 * qualityMult, -4, 6),
      sponsorAppeal:    clampDelta((qaSum.sponsorAppeal * 0.35 + 1.2 * starScale) * qualityMult, -2, 5),
      commercialValue:  clampDelta((qaSum.sponsorAppeal * 0.3 + 1.0 * starScale) * qualityMult, -2, 4),
      boardTrust:       clampDelta(qaSum.boardConfidence * 0.4, -3, 5),
      playerMorale:     clampDelta(qaSum.playerMorale * 0.8, -5, 10)
    };

    bm.globalReputation = Math.max(40, Math.min(100, bm.globalReputation + delta.globalReputation));
    bm.mediaInfluence = Math.max(40, Math.min(100, bm.mediaInfluence + delta.mediaInfluence));
    bm.brandValue = +(bm.brandValue + delta.brandValueM).toFixed(1);
    bm.fanbase = +(bm.fanbase + delta.fanbaseM).toFixed(2);
    bm.fanSatisfaction = Math.max(25, Math.min(100, bm.fanSatisfaction + delta.fanSatisfaction));
    bm.sponsorAppeal = Math.max(40, Math.min(100, bm.sponsorAppeal + delta.sponsorAppeal));
    bm.commercialValue = Math.max(40, Math.min(100, bm.commercialValue + delta.commercialValue));
    bm.appliedEventIds.push(event.eventId);

    // Đồng bộ sang chỉ số Chủ tịch & Cầu thủ
    state.president.prestige = Math.max(30, Math.min(100, state.president.prestige + Math.round(delta.globalReputation * 0.6)));
    state.president.fanSupport = Math.max(25, Math.min(100, state.president.fanSupport + delta.fanSatisfaction));
    state.president.boardTrust = Math.max(25, Math.min(100, state.president.boardTrust + delta.boardTrust));

    if (event.playerId) {
      const p = state.getPlayerById(event.playerId);
      if (p) {
        p.morale = Math.max(40, Math.min(100, (p.morale || 85) + delta.playerMorale));
        p.popularity = Math.min(100, (p.popularity || Math.round((p.ovr || 80) * 0.9)) + Math.max(1, Math.round(starScale * 5)));
        if (p.psychology) p.psychology.morale = p.morale;
      }
    }

    return { applied: true, delta, brandMetrics: bm };
  }
}
