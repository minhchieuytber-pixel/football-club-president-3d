// src/media/PressNewsSystem.js
// Hệ thống Báo chí thể thao chuyên nghiệp: 30 nhóm kịch bản (A: Trước trận 1-10, B: Sau trận 11-20, C: Chuyển nhượng & Nội bộ 21-30),
// Hệ thống tạo ảnh báo chí minh họa riêng theo từng bối cảnh (SVG editorial nhẹ, sắc nét trên iPhone), Bình luận CĐV & Kho lưu trữ tin tức

export class NewsImageSystem {
  // Tạo ảnh báo chí thể thao phong cách tạp chí (SVG Data URI chuẩn 16:9, siêu nhẹ cho iPhone, khác biệt theo từng sự kiện)
  static generateEditorialImage(sceneType, caption = 'PARIS SAINT-GERMAIN', accent = '#da291c', playerBadge = '10') {
    const palettes = {
      pre_clash: ['#07142b', '#0f2c59', '#da291c'],
      training: ['#0b2e1f', '#14532d', '#38bdf8'],
      celebration: ['#001a4d', '#003876', '#d4af37'],
      defeat: ['#111827', '#1f2937', '#ef4444'],
      goalkeeper: ['#0c1c38', '#1e3a8a', '#facc15'],
      transfer: ['#091224', '#1e1b4b', '#da291c'],
      boardroom: ['#1c1410', '#3b2518', '#d4af37'],
      fans: ['#00205b', '#7f1d1d', '#f8fafc'],
      trophy: ['#0f172a', '#1e3a8a', '#f59e0b']
    };
    const [c1, c2, c3] = palettes[sceneType] || palettes.pre_clash;

    let sceneArt = '';
    if (sceneType === 'celebration' || sceneType === 'trophy') {
      // Cầu thủ áo PSG giơ hai tay ăn mừng dưới ánh đèn Parc des Princes
      sceneArt = `
        <circle cx="120" cy="40" r="65" fill="${c3}" opacity="0.16"/>
        <circle cx="520" cy="40" r="65" fill="#38bdf8" opacity="0.15"/>
        <rect x="0" y="210" width="640" height="90" fill="#1b5e20" opacity="0.72"/>
        <circle cx="320" cy="112" r="24" fill="#e0ac82"/>
        <path d="M282,144 L358,144 L352,228 L288,228 Z" fill="#00205b"/>
        <rect x="311" y="144" width="18" height="84" fill="#da291c"/>
        <path d="M282,148 L244,98 L258,88 L294,136 Z" fill="#00205b"/>
        <path d="M358,148 L396,98 L382,88 L346,136 Z" fill="#00205b"/>
        <text x="320" y="196" fill="#fff" font-size="26" font-weight="800" text-anchor="middle" font-family="sans-serif">${playerBadge}</text>
        ${sceneType === 'trophy' ? `<polygon points="440,120 472,120 462,175 450,175" fill="#d4af37"/><rect x="444" y="175" width="24" height="12" fill="#111827"/>` : ''}`;
    } else if (sceneType === 'transfer') {
      // Chủ tịch & Tân binh cầm áo đấu PSG tại buổi ký hợp đồng
      sceneArt = `
        <rect x="24" y="24" width="592" height="252" rx="14" fill="rgba(255,255,255,0.04)" stroke="${c3}" stroke-opacity="0.35"/>
        <circle cx="220" cy="118" r="22" fill="#f2c6a0"/>
        <rect x="188" y="146" width="64" height="88" rx="8" fill="#0f172a"/>
        <rect x="216" y="146" width="8" height="44" fill="#da291c"/>
        <circle cx="420" cy="118" r="22" fill="#e0ac82"/>
        <rect x="388" y="146" width="64" height="88" rx="8" fill="#00205b"/>
        <rect x="412" y="146" width="16" height="88" fill="#da291c"/>
        <rect x="278" y="138" width="84" height="92" rx="6" fill="#00205b" stroke="#fff" stroke-width="2"/>
        <rect x="311" y="138" width="18" height="92" fill="#da291c"/>
        <text x="320" y="194" fill="#fff" font-size="28" font-weight="800" text-anchor="middle" font-family="sans-serif">${playerBadge}</text>`;
    } else if (sceneType === 'goalkeeper') {
      // Thủ môn bay người cứu thua trước khung thành
      sceneArt = `
        <rect x="0" y="210" width="640" height="90" fill="#1b5e20" opacity="0.78"/>
        <rect x="90" y="75" width="460" height="135" fill="none" stroke="#ffffff" stroke-width="4" opacity="0.7"/>
        <circle cx="290" cy="145" r="20" fill="#f2c6a0"/>
        <rect x="255" y="130" width="110" height="34" rx="12" fill="#facc15" transform="rotate(-18 310 145)"/>
        <circle cx="408" cy="112" r="14" fill="#ffffff" stroke="#1e293b" stroke-width="2"/>`;
    } else if (sceneType === 'boardroom') {
      // Phòng họp Ban Giám đốc & họp báo
      sceneArt = `
        <rect x="110" y="175" width="420" height="58" rx="10" fill="#4a2d20"/>
        <circle cx="220" cy="132" r="20" fill="#f2c6a0"/>
        <rect x="192" y="154" width="56" height="40" rx="6" fill="#0f172a"/>
        <circle cx="320" cy="126" r="22" fill="#f2c6a0"/>
        <rect x="290" y="150" width="60" height="44" rx="6" fill="#00205b"/>
        <circle cx="420" cy="132" r="20" fill="#e0ac82"/>
        <rect x="392" y="154" width="56" height="40" rx="6" fill="#1e293b"/>`;
    } else if (sceneType === 'training') {
      // Sân tập Campus PSG với HLV quan sát
      sceneArt = `
        <rect x="0" y="185" width="640" height="115" fill="#1e6b34"/>
        <line x1="0" y1="210" x2="640" y2="210" stroke="#fff" stroke-opacity="0.45" stroke-width="3"/>
        <circle cx="210" cy="132" r="18" fill="#c68652"/><rect x="190" y="154" width="40" height="62" rx="6" fill="#00205b"/>
        <circle cx="320" cy="128" r="18" fill="#8d5524"/><rect x="300" y="150" width="40" height="66" rx="6" fill="#00205b"/>
        <circle cx="465" cy="134" r="18" fill="#e0ac82"/><rect x="445" y="156" width="40" height="60" rx="6" fill="#1e293b"/>
        <circle cx="265" cy="214" r="9" fill="#fff"/>`;
    } else {
      // Đối đầu trước trận / CĐV / Thất bại
      sceneArt = `
        <rect x="0" y="210" width="640" height="90" fill="#14532d" opacity="0.65"/>
        <circle cx="210" cy="124" r="24" fill="#e0ac82"/>
        <rect x="174" y="154" width="72" height="82" rx="8" fill="#00205b"/>
        <rect x="202" y="154" width="16" height="82" fill="#da291c"/>
        <text x="320" y="176" fill="${c3}" font-size="38" font-weight="900" text-anchor="middle" font-family="sans-serif">VS</text>
        <circle cx="430" cy="124" r="24" fill="#f2c6a0"/>
        <rect x="394" y="154" width="72" height="82" rx="8" fill="#334155"/>`;
    }

    const safeCap = String(caption).replace(/[<>&"]/g, '').slice(0, 44);
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 300">
      <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="${c1}"/><stop offset="100%" stop-color="${c2}"/></linearGradient></defs>
      <rect width="640" height="300" fill="url(#g)"/>
      ${sceneArt}
      <rect x="0" y="246" width="640" height="54" fill="rgba(5,10,22,0.82)"/>
      <rect x="18" y="258" width="6" height="28" fill="${c3}"/>
      <text x="34" y="278" fill="#f8fafc" font-size="18" font-weight="700" font-family="sans-serif">${safeCap}</text>
    </svg>`;
    return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  }
}

export class PressNewsSystem {
  static outlets = ['L\'Équipe', 'Le Parisien Sport', 'France Football', 'RMC Sport', 'PSG Insider', 'Canal+ Foot'];

  // 30+ nhóm kịch bản báo chí chuẩn hóa + News Engine phân loại rõ Chuyển nhượng / Nội bộ / Thi đấu / Thương mại & Trạng thái xác thực
  static createArticle(state, cfg) {
    const {
      scenarioId = 1, category, tagType = 'Chính thức', verificationStatus = null,
      title, summary, body,
      imageType = 'pre_clash', imageCaption = 'PARIS SAINT-GERMAIN', relatedEntity = 'PSG',
      importance = 'Cao', fanTone = 'positive', badge = '10', dedupeKey = null
    } = cfg;
    if (dedupeKey && state.newsArchive.some((a) => a.dedupeKey === dedupeKey)) {
      return null;
    }
    const resolvedVerification = verificationStatus || (
      tagType === 'Chính thức' ? 'Chính thức'
        : (tagType === 'Tin đồn' ? 'Tin đồn' : 'Chưa xác nhận')
    );
    const outlet = PressNewsSystem.outlets[(state.newsArchive.length + scenarioId) % PressNewsSystem.outlets.length];
    const comments = PressNewsSystem.generateFanComments(fanTone, relatedEntity);
    const article = {
      id: `news_${Date.now()}_${Math.floor(Math.random() * 9999)}`,
      dedupeKey: dedupeKey || null,
      scenarioId,
      category,      // Tin PSG | Trước trận | Sau trận | Chuyển nhượng | Ligue 1 | Champions League | Nội bộ | Thương mại
      tagType,       // Chính thức | Tin đồn | Chưa xác nhận | Nhận định chuyên gia | Phản ứng CĐV
      verificationStatus: resolvedVerification, // Chính thức | Chưa xác nhận | Tin đồn
      outlet,
      date: `Tuần ${state.week} · ${state.dayName} (${state.season})`,
      title,
      summary,
      body,
      image: NewsImageSystem.generateEditorialImage(imageType, imageCaption, '#da291c', badge),
      relatedEntity,
      importance,
      read: false,
      saved: false,
      likes: 2400 + Math.floor(Math.random() * 22000),
      comments
    };
    state.newsArchive.unshift(article);
    if (state.newsArchive.length > 90) state.newsArchive.pop();
    return article;
  }

  static generateFanComments(tone, entity) {
    if (tone === 'win') {
      return [
        { user: '@Parisien_1970', text: 'Một trận đấu quá thuyết phục! Hàng công PSG chơi gắn kết và sắc bén thực sự.' },
        { user: '@Ultras_Auteuil', text: `${entity} xứng đáng nhận tràng pháo tay từ cả Parc des Princes!` },
        { user: '@Lucas_PSG', text: 'Hy vọng Chủ tịch Phạm Minh Chiêu và toàn đội tiếp tục giữ vững phong độ này.' }
      ];
    }
    if (tone === 'loss') {
      return [
        { user: '@Marc_Paris', text: 'Đây không phải màn trình diễn mà CĐV Paris mong đợi. HLV cần sớm rà soát lại hàng thủ.' },
        { user: '@Sophie_75', text: 'Chúng ta kiểm soát bóng nhiều nhưng bỏ lỡ quá nhiều cơ hội rõ rệt!' },
        { user: '@Jean_PSG', text: 'Tin tưởng Chủ tịch Phạm Minh Chiêu sẽ có những điều chỉnh kịp thời.' }
      ];
    }
    if (tone === 'transfer') {
      return [
        { user: '@Mercato_Paris', text: `Bản hợp đồng mang tên ${entity} hứa hẹn nâng tầm đội hình PSG!` },
        { user: '@Kylian_Fan', text: 'Liệu cậu ấy có hòa nhập nhanh với triết lý kiểm soát bóng của PSG không?' },
        { user: '@PSG_Vietnam', text: 'Chủ tịch Phạm Minh Chiêu làm chuyển nhượng rất quyết đoán và bài bản.' }
      ];
    }
    return [
      { user: '@ParcDesPrinces', text: `Mọi ánh mắt đang hướng về ${entity} trước giờ bóng lăn!` },
      { user: '@IciCestParis', text: 'Cổ động viên PSG luôn sẵn sàng tiếp lửa trên khán đài!' }
    ];
  }

  // Tự động tạo loạt bài báo NHÓM A (Trước trận đấu — Kịch bản 1 đến 10)
  static generatePreMatchNews(state, fixture) {
    const opp = fixture.home === 'Paris Saint-Germain' ? fixture.away : fixture.home;
    const star = state.getPsgSquad()[0]?.name || 'Ousmane Dembélé';
    const injured = state.getPsgSquad().filter((p) => p.injuryDays > 0);
    const isBig = fixture.importance >= 1.15;

    PressNewsSystem.createArticle(state, {
      scenarioId: isBig ? 1 : 2,
      category: fixture.comp === 'UEFA Champions League' ? 'Champions League' : 'Trước trận',
      tagType: 'Nhận định chuyên gia',
      title: isBig ? `Đại chiến rực lửa: PSG sẵn sàng quyết đấu ${opp} tại ${fixture.comp}!` : `PSG đứng trước cơ hội giành trọn 3 điểm trước ${opp}`,
      summary: `Paris Saint-Germain hoàn tất khâu chuẩn bị cuối cùng trước cuộc đối đầu ${opp} tại ${fixture.stadium}.`,
      body: `Trước thềm vòng đấu ${fixture.round} (${fixture.date} · ${fixture.time}), thầy trò HLV ${state.coach.name} đang tập trung tối đa cho cuộc chạm trán ${opp} tại ${fixture.stadium}. Ngôi sao ${star} đang đạt phong độ cao và được kỳ vọng sẽ tạo nên khác biệt. ${injured.length > 0 ? `Đáng lưu ý, PSG đang cân nhắc bài toán thể trạng khi ${injured.map((p) => p.name).join(', ')} cần theo dõi y tế.` : 'Tin vui là toàn bộ đội hình chính của PSG đều đạt thể trạng tốt nhất.'}`,
      imageType: isBig ? 'pre_clash' : 'training',
      imageCaption: `${fixture.home} vs ${fixture.away}`,
      relatedEntity: star,
      fanTone: 'neutral'
    });

    if (injured.length > 0) {
      PressNewsSystem.createArticle(state, {
        scenarioId: 5,
        category: 'Tin PSG',
        tagType: 'Chính thức',
        title: `Bài toán nhân sự: PSG thận trọng với thể trạng của ${injured[0].name}`,
        summary: `Trung tâm Y tế PSG xác nhận ${injured[0].name} chưa đạt 100% thể lực trước trận gặp ${opp}.`,
        body: `Bộ phận Y tế do BS. Christophe Baudot phụ trách đã gửi báo cáo lên Chủ tịch Phạm Minh Chiêu và HLV trưởng. Nhiều khả năng ban huấn luyện sẽ xoay tua hợp lý để đảm bảo lực lượng cho chặng đường dài.`,
        imageType: 'training',
        imageCaption: `Y TẾ PSG · ${injured[0].name}`,
        relatedEntity: injured[0].name,
        fanTone: 'neutral'
      });
    }
  }

  // Tự động tạo loạt bài báo NHÓM B (Sau trận đấu — Kịch bản 11 đến 20, chuẩn xác 100% dữ liệu trận)
  static generatePostMatchNews(state, res) {
    const score = `${res.homeGoals}-${res.awayGoals}`;
    const diff = res.psgGoals - res.oppGoals;
    const motm = res.motm?.name || 'Ousmane Dembélé';
    const cat = res.fixture.comp === 'UEFA Champions League' ? 'Champions League' : 'Sau trận';

    // Bài chính sau trận (Kịch bản 11 / 12 / 13 / 14)
    if (res.psgWon) {
      const scenarioId = res.lateWinner ? 12 : 11;
      const title = res.lateWinner
        ? `Nghẹt thở phút cuối! PSG hạ gục ${res.oppName} ${score} đầy cảm xúc!`
        : diff >= 3
          ? `PSG thắng áp đảo ${res.oppName} với tỷ số ${score} tại ${res.fixture.comp}!`
          : `PSG giành chiến thắng thuyết phục ${score} trước ${res.oppName}!`;
      PressNewsSystem.createArticle(state, {
        scenarioId, category: cat, tagType: 'Chính thức', title,
        summary: `Cầu thủ xuất sắc nhất ${motm} (${res.motm.rating} điểm) dẫn dắt PSG giành trọn niềm vui trước ${res.oppName}.`,
        body: `Tại ${res.fixture.stadium}, Paris Saint-Germain khép lại trận đấu với tỷ số ${res.fixture.home} ${score} ${res.fixture.away}. PSG kiểm soát ${res.psgIsHome ? res.stats.homePoss : res.stats.awayPoss}% bóng, tung ra ${res.psgIsHome ? res.stats.homeShots : res.stats.awayShots} cú sút (xG ${res.psgIsHome ? res.stats.homeXg : res.stats.awayXg}). Các bàn thắng của PSG được ghi do công của: ${res.goalEvents.filter((e) => e.team === 'Paris Saint-Germain').map((e) => `${e.scorer} (${e.minute}')`).join(', ') || 'hàng công PSG'}.`,
        imageType: 'celebration',
        imageCaption: `PSG ${score} ${res.oppName} · MOTM: ${motm}`,
        relatedEntity: motm,
        fanTone: 'win'
      });
    } else if (res.psgDrew) {
      PressNewsSystem.createArticle(state, {
        scenarioId: 13, category: cat, tagType: 'Chính thức',
        title: `PSG chia điểm đáng tiếc (${score}) trong cuộc đối đầu ${res.oppName}`,
        summary: `Dù tạo ra nhiều cơ hội, PSG không thể giữ trọn 3 điểm trước lối chơi kỷ luật của ${res.oppName}.`,
        body: `Trận đấu giữa ${res.fixture.home} và ${res.fixture.away} kết thúc với tỷ số hòa ${score}. ${motm} (${res.motm.rating} điểm) là điểm sáng lớn nhất của PSG, nhưng ban huấn luyện vẫn còn nhiều việc phải làm ở khâu tận dụng cơ hội.`,
        imageType: 'pre_clash',
        imageCaption: `HÒA ${score} · ${res.oppName}`,
        relatedEntity: motm,
        fanTone: 'neutral'
      });
    } else {
      PressNewsSystem.createArticle(state, {
        scenarioId: 14, category: cat, tagType: 'Chính thức',
        title: `PSG nhận thất bại ${score} trước ${res.oppName}: Bài học về sự tập trung`,
        summary: `Đội bóng thành Paris không thể vượt qua ${res.oppName} tại ${res.fixture.comp}, giới chuyên môn phân tích khâu phòng ngự.`,
        body: `Dù kiểm soát bóng ${res.psgIsHome ? res.stats.homePoss : res.stats.awayPoss}%, Paris Saint-Germain để thua ${score} trước ${res.oppName}. HLV ${state.coach.name} khẳng định đội bóng sẽ nhanh chóng đứng dậy và đã gửi báo cáo chuyên môn chi tiết lên Chủ tịch Phạm Minh Chiêu.`,
        imageType: 'defeat',
        imageCaption: `SAU TRẬN: ${res.fixture.home} ${score} ${res.fixture.away}`,
        relatedEntity: state.coach.name,
        fanTone: 'loss'
      });
    }

    // Kiểm tra cầu thủ PSG lập hat-trick (Kịch bản #15)
    const psgGoalCounts = {};
    (res.goalEvents || []).filter((e) => e.team === 'Paris Saint-Germain').forEach((e) => {
      psgGoalCounts[e.scorer] = (psgGoalCounts[e.scorer] || 0) + 1;
    });
    const hatTrickHero = Object.entries(psgGoalCounts).find(([, cnt]) => cnt >= 3);
    if (hatTrickHero) {
      PressNewsSystem.createArticle(state, {
        scenarioId: 15, category: 'Sau trận', tagType: 'Chính thức', verificationStatus: 'Chính thức',
        title: `HAT-TRICK RỰC SÁNG! ${hatTrickHero[0]} bùng nổ ${hatTrickHero[1]} bàn thắng trước ${res.oppName}!`,
        summary: `Màn trình diễn siêu hạng giúp ${hatTrickHero[0]} trở thành tâm điểm của truyền thông châu Âu sau trận thắng ${score}.`,
        body: `Với ${hatTrickHero[1]} pha lập công trước ${res.oppName}, ${hatTrickHero[0]} đã khẳng định đẳng cấp ngôi sao hàng đầu trong đội hình Paris Saint-Germain dưới triều đại Chủ tịch Phạm Minh Chiêu.`,
        imageType: 'celebration',
        imageCaption: `HAT-TRICK · ${hatTrickHero[0].toUpperCase()}`,
        relatedEntity: hatTrickHero[0],
        importance: 'Rất cao',
        fanTone: 'win'
      });
    }

    // Kiểm tra HLV bị chỉ trích nếu chuỗi thua >= 2
    if (!res.psgWon && !res.psgDrew && (state.loseStreak || 0) >= 2) {
      PressNewsSystem.createArticle(state, {
        scenarioId: 20, category: 'Nội bộ', tagType: 'Nhận định chuyên gia', verificationStatus: 'Chưa xác nhận',
        title: `Áp lực gia tăng với HLV ${state.coach?.name} sau ${state.loseStreak} thất bại liên tiếp của PSG`,
        summary: `Giới chuyên môn Pháp phân tích những dấu hỏi về chiến thuật và kỳ vọng phản ứng từ Chủ tịch Phạm Minh Chiêu.`,
        body: `Chuỗi ${state.loseStreak} trận không thắng khiến ghế HLV trưởng tại Parc des Princes trở thành chủ đề nóng trên mặt báo. Tuy nhiên Ban lãnh đạo PSG chưa phát đi thông báo chính thức nào về tương lai HLV ${state.coach?.name}.`,
        imageType: 'boardroom',
        imageCaption: `ÁP LỰC CHIẾN THUẬT · ${state.coach?.name?.toUpperCase() || 'PSG'}`,
        relatedEntity: state.coach?.name || 'HLV PSG',
        importance: 'Rất cao',
        fanTone: 'loss'
      });
    }

    // Bài phụ chuyên sâu (Thủ môn giữ sạch lưới #18 / Cầu thủ trẻ tỏa sáng #17)
    if (res.cleanSheet && res.gkRating) {
      PressNewsSystem.createArticle(state, {
        scenarioId: 18, category: 'Tin PSG', tagType: 'Nhận định chuyên gia', verificationStatus: 'Chính thức',
        title: `Bức tường thép ${res.gkRating.name}: Giữ sạch lưới ấn tượng trước ${res.oppName}!`,
        summary: `Thủ thành ${res.gkRating.name} nhận điểm ${res.gkRating.rating} nhờ sự chắc chắn tuyệt đối trong khung gỗ PSG.`,
        body: `Những pha ra vào hợp lý và cản phá xuất sắc của ${res.gkRating.name} là nền tảng giúp Paris Saint-Germain bảo toàn mảnh lưới suốt 90 phút.`,
        imageType: 'goalkeeper',
        imageCaption: `CLEAN SHEET · ${res.gkRating.name}`,
        relatedEntity: res.gkRating.name,
        fanTone: 'win'
      });
    } else if (res.youngStar) {
      PressNewsSystem.createArticle(state, {
        scenarioId: 17, category: 'Tin PSG', tagType: 'Nhận định chuyên gia', verificationStatus: 'Chính thức',
        title: `Tài năng trẻ ${res.youngStar.name} gây ấn tượng mạnh với điểm số ${res.youngStar.rating}!`,
        summary: `Cầu thủ ${res.youngStar.age} tuổi tận dụng xuất sắc cơ hội ra sân trong màu áo PSG.`,
        body: `Màn trình diễn tự tin của ${res.youngStar.name} cho thấy chính sách phát triển tài năng trẻ dưới thời Chủ tịch Phạm Minh Chiêu đang đi đúng hướng.`,
        imageType: 'celebration',
        imageCaption: `TÀI NĂNG TRẺ · ${res.youngStar.name}`,
        relatedEntity: res.youngStar.name,
        fanTone: 'win'
      });
    }
  }

  // NHÓM C: Tin chuyển nhượng (TUYỆT ĐỐI không gắn 'Chính thức' nếu isOfficial === false!)
  static generateTransferNews(state, playerName, fromClub, fee, isOfficial = true, extra = {}) {
    const status = isOfficial ? 'Chính thức' : (extra.verificationStatus || 'Tin đồn');
    PressNewsSystem.createArticle(state, {
      scenarioId: isOfficial ? 24 : 21,
      category: 'Chuyển nhượng',
      tagType: status,
      verificationStatus: status,
      title: isOfficial
        ? `CHÍNH THỨC: PSG ${extra.isSale ? `chia tay ${playerName} sang ${fromClub}` : `chào đón tân binh ${playerName} từ ${fromClub}`}!`
        : (extra.title || `Tin đồn Mercato: PSG và thương vụ ${playerName}`),
      summary: isOfficial
        ? `Chủ tịch Phạm Minh Chiêu hoàn tất thương vụ ${playerName} với mức phí €${fee}M.`
        : (extra.summary || `Truyền thông châu Âu cho biết đang có những động thái xung quanh ${playerName}, nhưng chưa có xác nhận chính thức.`),
      body: isOfficial
        ? `Paris Saint-Germain chính thức xác nhận thương vụ ${playerName} (${fromClub}) với tổng mức phí €${fee}M. Chủ tịch Phạm Minh Chiêu và Giám đốc thể thao đã hoàn tất đầy đủ hồ sơ pháp lý.`
        : (extra.body || `Theo nguồn tin Mercato chưa xác thực, tương lai của ${playerName} đang được giới truyền thông quan tâm. Các bên liên quan chưa đưa ra thông báo chính thức nào.`),
      imageType: 'transfer',
      imageCaption: `MERCATO · ${playerName.toUpperCase()}`,
      relatedEntity: playerName,
      importance: fee >= 50 ? 'Rất cao' : 'Cao',
      fanTone: 'transfer',
      dedupeKey: extra.dedupeKey || null
    });
  }

  static generateTrophyNews(state, trophy) {
    if (!state || !trophy) return;
    PressNewsSystem.createArticle(state, {
      scenarioId: 29,
      category: trophy.category === 'international' ? 'Champions League' : 'Tin PSG',
      tagType: 'Chính thức',
      verificationStatus: 'Chính thức',
      title: `CHAMPIONS! PSG chính thức đăng quang ${trophy.competitionName} mùa giải ${trophy.seasonName}!`,
      summary: `Chiếc cúp ${trophy.competitionName} đã được trao cho PSG và tự động trưng bày trang trọng tại Bảo tàng Danh hiệu CLB.`,
      body: `${trophy.historicalDescription} HLV trưởng ${trophy.winningManagerName} cùng đội hình ${trophy.squadSnapshot?.length || 11} cầu thủ đã làm nên trang sử vàng mới dưới sự lãnh đạo của Chủ tịch ${trophy.presidentName}. Người hâm mộ có thể tham quan trực tiếp chiếc cúp tại ${trophy.displayLocation}.`,
      imageType: 'trophy',
      imageCaption: `VÔ ĐỊCH ${trophy.competitionName.toUpperCase()} · ${trophy.seasonName}`,
      relatedEntity: trophy.winningManagerName || 'PSG',
      importance: 'Rất cao',
      fanTone: 'win'
    });
  }

  // Kết nối News Engine với ClubEventBus trung tâm cho đủ 4 nhóm tin (Chuyển nhượng, Nội bộ, Thi đấu, Thương mại)
  static subscribeToEventBus(eventBus, state) {
    if (!eventBus) return;

    eventBus.on('TRANSFER_BID_RECEIVED', (p) => {
      PressNewsSystem.createArticle(state, {
        scenarioId: 22, category: 'Chuyển nhượng', tagType: 'Chưa xác nhận', verificationStatus: 'Chưa xác nhận',
        title: `Tin nóng: ${p.buyerClub} gửi đề nghị ${p.dealType === 'loan' ? 'mượn' : `€${p.fee}M hỏi mua`} ${p.playerName} của PSG`,
        summary: `Đề nghị từ ${p.buyerClub} đang nằm trên bàn làm việc của Chủ tịch Phạm Minh Chiêu, hiện chưa có quyết định chốt hạ.`,
        body: `Các nguồn tin sát sườn tiết lộ ${p.buyerClub} muốn có sự phục vụ của ${p.playerName} (${p.position}). Phía Paris Saint-Germain chưa công bố phản hồi chính thức.`,
        imageType: 'transfer', imageCaption: `${p.buyerClub.toUpperCase()} → ${p.playerName.toUpperCase()}`,
        relatedEntity: p.playerName, importance: 'Cao', fanTone: 'transfer',
        dedupeKey: `news_bid_${p.bidId}`
      });
    });

    eventBus.on('TRANSFER_NEGOTIATION_STARTED', (p) => {
      PressNewsSystem.createArticle(state, {
        scenarioId: 21, category: 'Chuyển nhượng', tagType: 'Chưa xác nhận', verificationStatus: 'Chưa xác nhận',
        title: `Đàm phán mở màn: PSG tiếp xúc ${p.fromClub} cho trường hợp của ${p.playerName}`,
        summary: `Giám đốc Thể thao PSG đã bắt đầu trao đổi với ${p.fromClub} về mức phí dự kiến €${p.askFee}M.`,
        body: `Thương vụ ${p.playerName} vẫn đang ở giai đoạn đàm phán giữa hai câu lạc bộ và chưa đạt thỏa thuận chính thức cuối cùng.`,
        imageType: 'transfer', imageCaption: `ĐÀM PHÁN · ${p.playerName.toUpperCase()}`,
        relatedEntity: p.playerName, importance: 'Cao', fanTone: 'transfer',
        dedupeKey: `news_negstart_${p.negId}`
      });
    });

    eventBus.on('TRANSFER_COUNTER_OFFER', (p) => {
      PressNewsSystem.createArticle(state, {
        scenarioId: 23, category: 'Chuyển nhượng', tagType: 'Chưa xác nhận', verificationStatus: 'Chưa xác nhận',
        title: p.stage === 2
          ? `Cầu thủ ${p.playerName} đặt yêu cầu lương €${p.counterValue}k/tuần với PSG`
          : `Đàm phán căng thẳng: ${p.fromClub} nâng giá ${p.playerName} lên €${p.counterValue}M`,
        summary: `Hai bên đang thương lượng chi tiết nhưng thương vụ chưa được ký kết.`,
        body: `${p.message || 'Các cuộc thương thảo vẫn tiếp tục diễn ra giữa đại diện các bên.'}`,
        imageType: 'transfer', imageCaption: `THƯƠNG LƯỢNG · ${p.playerName.toUpperCase()}`,
        relatedEntity: p.playerName, importance: 'Trung bình', fanTone: 'transfer',
        dedupeKey: `news_counter_${p.negId}_r${p.round}`
      });
    });

    eventBus.on('TRANSFER_DEAL_FAILED', (p) => {
      PressNewsSystem.createArticle(state, {
        scenarioId: 25, category: 'Chuyển nhượng', tagType: 'Chính thức', verificationStatus: 'Chính thức',
        title: `Đàm phán đổ bể: Thương vụ ${p.playerName} không thể đi đến thống nhất`,
        summary: p.reason || `PSG và đối tác không đạt được thỏa thuận cuối cùng cho ${p.playerName}.`,
        body: `Các cuộc đàm phán liên quan tới ${p.playerName} đã chính thức khép lại mà không có chữ ký nào được thực hiện.`,
        imageType: 'boardroom', imageCaption: `THẤT BẠI · ${p.playerName.toUpperCase()}`,
        relatedEntity: p.playerName, importance: 'Cao', fanTone: 'loss',
        dedupeKey: `news_fail_${p.negId}`
      });
    });

    eventBus.on('CONTRACT_RENEWED', (p) => {
      PressNewsSystem.createArticle(state, {
        scenarioId: 27, category: 'Nội bộ', tagType: 'Chính thức', verificationStatus: 'Chính thức',
        title: `CHÍNH THỨC: ${p.playerName} gia hạn hợp đồng gắn bó tương lai cùng PSG`,
        summary: `Bản hợp đồng mới có thời hạn ${p.contractYears} năm với mức lương €${p.weeklyWage}k/tuần vừa được Chủ tịch Phạm Minh Chiêu phê duyệt.`,
        body: `Ban lãnh đạo Paris Saint-Germain xác nhận đã giữ chân thành công ${p.playerName}. Động thái này củng cố sự ổn định dài hạn trong phòng thay đồ tại Campus PSG.`,
        imageType: 'transfer', imageCaption: `GIA HẠN · ${p.playerName.toUpperCase()}`,
        relatedEntity: p.playerName, importance: 'Cao', fanTone: 'win'
      });
    });

    eventBus.on('STAFF_CHANGED', (p) => {
      PressNewsSystem.createArticle(state, {
        scenarioId: 28, category: 'Nội bộ', tagType: 'Chính thức', verificationStatus: 'Chính thức',
        title: `Biến động nhân sự PSG: ${p.title || `${p.staffName} đảm nhận vai trò ${p.role}`}`,
        summary: p.summary || `Chủ tịch Phạm Minh Chiêu chính thức điều chỉnh cấu trúc nhân sự chuyên môn tại CLB.`,
        body: p.body || `Quyết định bổ nhiệm/điều chỉnh ${p.staffName} (${p.role}) nhằm nâng cao hiệu suất vận hành đội một và học viện Paris Saint-Germain.`,
        imageType: 'boardroom', imageCaption: `NHÂN SỰ PSG · ${(p.staffName || 'BHL').toUpperCase()}`,
        relatedEntity: p.staffName || 'Ban huấn luyện PSG', importance: 'Cao', fanTone: 'neutral'
      });
    });

    eventBus.on('PLAYER_INJURED', (p) => {
      PressNewsSystem.createArticle(state, {
        scenarioId: 19, category: 'Tin PSG', tagType: 'Chính thức', verificationStatus: 'Chính thức',
        title: `Tin y tế PSG: ${p.playerName} chấn thương, dự kiến nghỉ ${p.days} ngày`,
        summary: `Bộ phận Y tế xác nhận ${p.playerName} gặp vấn đề ${p.injuryType || 'cơ bắp'} và đang được điều trị tích cực.`,
        body: `HLV trưởng sẽ phải tính toán phương án xoay tua nhân sự trong thời gian ${p.playerName} hồi phục tại Trung tâm Y tế Campus PSG.`,
        imageType: 'training', imageCaption: `Y TẾ PSG · ${p.playerName.toUpperCase()}`,
        relatedEntity: p.playerName, importance: 'Cao', fanTone: 'loss'
      });
    });

    eventBus.on('SPONSOR_SIGNED', (p) => {
      PressNewsSystem.createArticle(state, {
        scenarioId: 30, category: 'Thương mại', tagType: 'Chính thức', verificationStatus: 'Chính thức',
        title: `THƯƠNG MẠI: PSG ${p.isRenewal ? 'gia hạn' : 'ký hợp đồng mới'} với nhà tài trợ ${p.sponsorName} (€${p.annualValueM}M/năm)`,
        summary: `Thỏa thuận ${p.slot} giúp củng cố mạnh mẽ tiềm lực tài chính và vị thế thương hiệu toàn cầu của PSG.`,
        body: `Dưới sự chủ trì của Chủ tịch Phạm Minh Chiêu, Paris Saint-Germain tiếp tục mở rộng hệ sinh thái đối tác chiến lược cùng ${p.sponsorName} trong ${p.years} năm tới.`,
        imageType: 'boardroom', imageCaption: `TÀI TRỢ · ${p.sponsorName.toUpperCase()}`,
        relatedEntity: p.sponsorName, importance: 'Cao', fanTone: 'win'
      });
    });

    eventBus.on('COMMERCIAL_MILESTONE', (p) => {
      PressNewsSystem.createArticle(state, {
        scenarioId: 31, category: 'Thương mại', tagType: 'Chính thức', verificationStatus: 'Chính thức',
        title: `Bùng nổ thương mại: ${p.title} mang về €${p.revenueM}M doanh thu cho PSG`,
        summary: `Lượng áo đấu bán ra tăng thêm ${p.jerseysSoldK}k chiếc và lượng người hâm mộ toàn cầu tăng thêm ${p.fanGainM}M.`,
        body: `Chiến dịch thương mại do Chủ tịch Phạm Minh Chiêu phê duyệt đã tạo cú hích mạnh về doanh số bán lẻ và độ phủ thương hiệu Paris Saint-Germain trên toàn thế giới.`,
        imageType: 'fans', imageCaption: `THƯƠNG MẠI PSG · +€${p.revenueM}M`,
        relatedEntity: 'Thương mại PSG', importance: 'Trung bình', fanTone: 'win'
      });
    });

    eventBus.on('RUMOR_ACTION_TAKEN', (p) => {
      if (!p?.rumor) return;
      if (p.action === 'deny' || p.action === 'confirm' || p.action === 'delegate_media') {
        const isConfirmedOfficial = p.action === 'confirm' && p.rumor.verificationStatus === 'Thông báo chính thức';
        PressNewsSystem.createArticle(state, {
          scenarioId: 32,
          category: 'Nội bộ',
          tagType: isConfirmedOfficial ? 'Chính thức' : 'Chưa xác nhận',
          verificationStatus: isConfirmedOfficial ? 'Chính thức' : 'Chưa xác nhận',
          title: p.action === 'deny'
            ? `PSG lên tiếng bác bỏ tin đồn liên quan tới ${p.rumor.relatedEntity}`
            : p.action === 'confirm'
              ? `CHÍNH THỨC: Chủ tịch Phạm Minh Chiêu xác nhận thông tin về ${p.rumor.relatedEntity}`
              : `Phòng Truyền thông PSG phát thông cáo làm rõ tin đồn ${p.rumor.relatedEntity}`,
          summary: p.message,
          body: `${p.rumor.detail} — Phản hồi chính thức từ PSG: ${p.message}`,
          imageType: 'boardroom',
          imageCaption: `TRUYỀN THÔNG PSG · ${p.rumor.relatedEntity.toUpperCase()}`,
          relatedEntity: p.rumor.relatedEntity,
          importance: 'Cao',
          fanTone: p.action === 'deny' ? 'neutral' : 'transfer'
        });
      }
    });
  }
}
