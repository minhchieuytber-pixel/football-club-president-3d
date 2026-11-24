// src/media/PressConferenceSystem.js
// Hệ thống Họp Báo Tương Tác (PressQuestionSystem, DialogueBranchSystem) & Phát Sóng Trực Tiếp PSG TV (PSGTVBroadcastSystem, CameraDirectionSystem)

export class PressQuestionSystem {
  // Sinh bộ câu hỏi phù hợp bối cảnh thực tế của thương vụ/sự kiện (không hỏi dữ liệu chưa tồn tại!)
  static buildQuestionsForEvent(event, state) {
    const subj = event.subjectName;
    const fee = event.fee || 0;
    const wage = event.wage || 0;
    const pos = event.position || '';
    const shirtNum = event.shirtNumber || null;
    const fromClub = event.fromClub || '';
    const coachName = state.coach?.name || 'HLV trưởng PSG';
    const isPlayerEvt = ['player_signing', 'record_signing', 'contract_renewal', 'youth_promotion'].includes(event.eventType);
    const isCoachEvt = event.eventType === 'head_coach_appointment';
    const isSponsorEvt = ['major_sponsor', 'commercial_partner'].includes(event.eventType);

    const psgSquad = state.getPsgSquad ? state.getPsgSquad() : [];
    const samePosRival = isPlayerEvt
      ? psgSquad.find((p) => p.id !== event.playerId && p.position === pos)
      : null;

    const questions = [];

    if (isPlayerEvt) {
      // A. Câu hỏi dành cho Chủ tịch Phạm Minh Chiêu
      questions.push({
        id: 'q_pres_why',
        target: 'president',
        category: 'Chiến lược',
        reporter: 'Julien Bernard',
        outlet: 'PSG TV',
        question: `Thưa Chủ tịch Phạm Minh Chiêu, tại sao PSG quyết định ${event.eventType === 'youth_promotion' ? `đôn ${subj} từ Học viện lên đội một` : event.eventType === 'contract_renewal' ? `gia hạn hợp đồng dài hạn với ${subj}` : `chiêu mộ ${subj} từ ${fromClub}`} ở thời điểm này?`,
        options: [
          {
            key: 'A',
            text: `${subj} là mảnh ghép hoàn hảo cho chiến lược xây dựng đội hình trẻ trung, bền vững và dài hạn của PSG.`,
            impact: { mediaReputation: +3, fanTrust: +3, boardConfidence: +4, playerMorale: +4, sponsorAppeal: +2, publicImage: +3 },
            tone: 'strategic'
          },
          {
            key: 'B',
            text: 'Chúng tôi muốn sở hữu đội hình đủ mạnh để vô địch Ligue 1 và chinh phục mọi danh hiệu lớn, đặc biệt là Champions League.',
            impact: { mediaReputation: +2, fanTrust: +5, boardConfidence: +1, playerMorale: +3, sponsorAppeal: +4, publicImage: +2 },
            tone: 'ambitious'
          },
          {
            key: 'C',
            text: `HLV trưởng ${coachName} đã trực tiếp đề xuất ${subj} và Ban lãnh đạo hoàn toàn tin tưởng đánh giá chuyên môn của ông ấy.`,
            impact: { mediaReputation: +3, fanTrust: +2, boardConfidence: +3, playerMorale: +5, sponsorAppeal: +1, publicImage: +3 },
            tone: 'coach_backed'
          },
          {
            key: 'D',
            text: `PSG nhìn thấy cả đẳng cấp chuyên môn lẫn giá trị thương mại toàn cầu mà ${subj} mang lại cho thương hiệu Paris.`,
            impact: { mediaReputation: +1, fanTrust: -1, boardConfidence: +3, playerMorale: +1, sponsorAppeal: +6, publicImage: +1 },
            tone: 'commercial'
          }
        ]
      });

      // B. Câu hỏi dành cho Cầu thủ mới (trả lời cá nhân hóa theo tính cách, tuổi, quốc tịch, vai trò!)
      questions.push({
        id: 'q_player_feel',
        target: 'player',
        category: 'Cảm xúc tân binh',
        reporter: 'Matthieu Delacroix',
        outlet: 'Sports Daily',
        question: `${subj}, bạn cảm thấy thế nào khi chính thức ký hợp đồng và khoác áo số ${shirtNum || 'mới'} của Paris Saint-Germain? Tại sao bạn chọn Paris?`,
        playerReply: DialogueBranchSystem.generatePlayerReply(event, state, 'feelings')
      });

      // C. Câu hỏi bất ngờ theo dữ liệu thật của thương vụ (phí chuyển nhượng cao / ngân sách)
      if (fee >= 35) {
        questions.push({
          id: 'q_pres_fee',
          target: 'president',
          category: 'Chất vấn tài chính',
          reporter: 'Matteo Romano',
          outlet: 'Transfer Insider',
          question: `Thưa Chủ tịch, mức phí €${fee}M${wage >= 180 ? ` kèm mức lương €${wage}k/tuần` : ''} là khoản đầu tư rất lớn. Liệu thương vụ này có phù hợp với ngân sách và Luật Công bằng Tài chính (FFP)?`,
          options: [
            {
              key: 'A',
              text: 'Mọi con số đều đã được Giám đốc Tài chính kiểm toán kỹ lưỡng. PSG hoàn toàn nằm trong vùng an toàn FFP.',
              impact: { mediaReputation: +4, fanTrust: +2, boardConfidence: +5, playerMorale: +1, sponsorAppeal: +3, publicImage: +3 },
              tone: 'calm_finance'
            },
            {
              key: 'B',
              text: `Đẳng cấp của ${subj} hoàn toàn xứng đáng từng xu. Một CLB tham vọng châu Âu phải dám đầu tư đúng chỗ.`,
              impact: { mediaReputation: +1, fanTrust: +4, boardConfidence: -1, playerMorale: +6, sponsorAppeal: +3, publicImage: +1 },
              tone: 'bold'
            },
            {
              key: 'C',
              text: 'Chúng tôi có kế hoạch cân bằng doanh thu thương mại, bản quyền và thanh lý hợp lý để giữ cấu trúc lương lành mạnh.',
              impact: { mediaReputation: +3, fanTrust: +1, boardConfidence: +4, playerMorale: +0, sponsorAppeal: +4, publicImage: +2 },
              tone: 'balanced'
            }
          ]
        });
      }

      // Câu hỏi bất ngờ cho Cầu thủ về cạnh tranh vị trí với ngôi sao đang có ở PSG (chỉ hỏi nếu thật sự có đối thủ cùng vị trí!)
      if (samePosRival) {
        questions.push({
          id: 'q_player_compete',
          target: 'player',
          category: 'Áp lực cạnh tranh',
          reporter: 'Clara Rossi',
          outlet: 'International Sports Network',
          question: `${subj}, tại PSG hiện đã có ${samePosRival.name} (OVR ${samePosRival.ovr}) ở vị trí ${pos}. Bạn có sẵn sàng cạnh tranh sòng phẳng cho suất đá chính dưới thời HLV ${coachName}?`,
          playerReply: DialogueBranchSystem.generatePlayerReply(event, state, 'competition', { rivalName: samePosRival.name })
        });
      }

      // A2. Câu hỏi cho Chủ tịch về mục tiêu mùa giải & Champions League + bổ sung lực lượng
      questions.push({
        id: 'q_pres_ucl',
        target: 'president',
        category: 'Mục tiêu & Champions League',
        reporter: 'Clara Rossi',
        outlet: 'International Sports Network',
        question: `Thưa Chủ tịch Phạm Minh Chiêu, sau thương vụ ${subj}, PSG có tiếp tục bổ sung lực lượng không và ngài đánh giá thế nào về cơ hội vô địch Champions League mùa ${state.season}?`,
        options: [
          {
            key: 'A',
            text: 'Chúng tôi luôn mở rộng cánh cửa nếu xuất hiện cơ hội hợp lý. Mục tiêu của PSG là tiến tới đỉnh cao Champions League từng bước vững chắc.',
            impact: { mediaReputation: +4, fanTrust: +3, boardConfidence: +4, playerMorale: +3, sponsorAppeal: +3, publicImage: +4 },
            tone: 'measured'
          },
          {
            key: 'B',
            text: 'Với tập thể hiện tại và sự bổ sung này, PSG đủ sức thách thức mọi ông lớn châu Âu để mang cúp về Parc des Princes!',
            impact: { mediaReputation: +2, fanTrust: +6, boardConfidence: +1, playerMorale: +5, sponsorAppeal: +4, publicImage: +2 },
            tone: 'fiery'
          },
          {
            key: 'C',
            text: 'Ưu tiên số một là sự ổn định của phòng thay đồ và tạo đất diễn cho các tài năng trẻ Học viện cùng các tân binh.',
            impact: { mediaReputation: +3, fanTrust: +2, boardConfidence: +3, playerMorale: +4, sponsorAppeal: +1, publicImage: +3 },
            tone: 'grounded'
          },
          {
            key: 'D',
            text: 'Thị trường chuyển nhượng vẫn đang mở và Giám đốc Thể thao sẽ làm việc không ngừng nghỉ đến phút cuối cùng.',
            impact: { mediaReputation: +2, fanTrust: +4, boardConfidence: -1, playerMorale: -1, sponsorAppeal: +3, publicImage: +1 },
            tone: 'market_hype'
          }
        ]
      });

      // B2. Lời nhắn của cầu thủ gửi người hâm mộ PSG
      questions.push({
        id: 'q_player_fans',
        target: 'player',
        category: 'Gửi người hâm mộ',
        reporter: 'Julien Bernard',
        outlet: 'PSG TV',
        question: `Cuối cùng, ${subj}, bạn muốn nhắn gửi điều gì tới các cổ động viên PSG đang theo dõi trực tiếp qua PSG TV tại Parc des Princes?`,
        playerReply: DialogueBranchSystem.generatePlayerReply(event, state, 'fans')
      });
    } else if (isCoachEvt) {
      questions.push({
        id: 'q_coach_pres_1',
        target: 'president',
        category: 'Bổ nhiệm HLV trưởng',
        reporter: 'Julien Bernard',
        outlet: 'PSG TV',
        question: `Thưa Chủ tịch Phạm Minh Chiêu, điều gì khiến ngài tin tưởng trao ghế HLV trưởng PSG cho ${subj}?`,
        options: [
          { key: 'A', text: `${subj} sở hữu triết lý bóng đá hiện đại, bản lĩnh đấu trường lớn và tầm nhìn đồng điệu với PSG.`, impact: { mediaReputation: +4, fanTrust: +4, boardConfidence: +4, playerMorale: +4, sponsorAppeal: +3, publicImage: +4 }, tone: 'strategic' },
          { key: 'B', text: 'Chúng tôi cần một nhà cầm quân quyết đoán để chinh phục UEFA Champions League ngay mùa giải này.', impact: { mediaReputation: +2, fanTrust: +5, boardConfidence: +1, playerMorale: +2, sponsorAppeal: +4, publicImage: +2 }, tone: 'ambitious' },
          { key: 'C', text: `${subj} có năng lực phát triển cầu thủ trẻ xuất sắc và xây dựng kỷ luật phòng thay đồ chặt chẽ.`, impact: { mediaReputation: +3, fanTrust: +3, boardConfidence: +4, playerMorale: +3, sponsorAppeal: +2, publicImage: +3 }, tone: 'youth' }
        ]
      });
      questions.push({
        id: 'q_coach_subj_1',
        target: 'player',
        category: 'Triết lý huấn luyện',
        reporter: 'Matthieu Delacroix',
        outlet: 'Sports Daily',
        question: `Thưa HLV ${subj}, người hâm mộ Paris có thể kỳ vọng lối chơi như thế nào dưới triều đại mới của ông?`,
        playerReply: `"Cảm ơn Chủ tịch Phạm Minh Chiêu đã tin tưởng. Tại Paris Saint-Germain, chúng tôi sẽ chơi thứ bóng đá chủ động, kỷ luật, tốc độ cao và gắn kết từ sân tập đến từng trận đấu tại Parc des Princes."`
      });
    } else if (isSponsorEvt) {
      questions.push({
        id: 'q_spon_pres_1',
        target: 'president',
        category: 'Thương mại & Tài trợ',
        reporter: 'Clara Rossi',
        outlet: 'International Sports Network',
        question: `Thưa Chủ tịch, thỏa thuận hợp tác chiến lược với ${subj} sẽ mang lại bước tiến gì cho thương hiệu toàn cầu của PSG?`,
        options: [
          { key: 'A', text: 'Đây là cột mốc nâng tầm sức mạnh tài chính bền vững và mở rộng tầm ảnh hưởng của PSG ra toàn cầu.', impact: { mediaReputation: +4, fanTrust: +2, boardConfidence: +5, playerMorale: +1, sponsorAppeal: +6, publicImage: +4 }, tone: 'strategic' },
          { key: 'B', text: 'Nguồn lực thương mại mới sẽ được tái đầu tư trực tiếp vào đội một và Học viện bóng đá PSG.', impact: { mediaReputation: +3, fanTrust: +5, boardConfidence: +4, playerMorale: +3, sponsorAppeal: +4, publicImage: +3 }, tone: 'fan_friendly' },
          { key: 'C', text: 'PSG tiếp tục khẳng định vị thế là thương hiệu thể thao Modern Luxury hàng đầu thế giới.', impact: { mediaReputation: +3, fanTrust: +1, boardConfidence: +3, playerMorale: +1, sponsorAppeal: +5, publicImage: +4 }, tone: 'luxury' }
        ]
      });
    } else {
      // Giám đốc thể thao / Sự kiện nhân sự cấp cao khác
      questions.push({
        id: 'q_exec_pres_1',
        target: 'president',
        category: 'Nhân sự cấp cao',
        reporter: 'Julien Bernard',
        outlet: 'PSG TV',
        question: `Thưa Chủ tịch, việc bổ nhiệm ${subj} vào cương vị ${event.position || 'Giám đốc Thể thao'} sẽ thay đổi chiến lược của PSG ra sao?`,
        options: [
          { key: 'A', text: `${subj} mang tới tư duy chuyên nghiệp và mạng lưới tuyển trạch hàng đầu để nâng chuẩn vận hành của PSG.`, impact: { mediaReputation: +4, fanTrust: +3, boardConfidence: +5, playerMorale: +2, sponsorAppeal: +3, publicImage: +3 }, tone: 'strategic' },
          { key: 'B', text: 'Chúng tôi hướng tới sự hiệu quả tối đa trên thị trường chuyển nhượng và sự ổn định nhiều mùa giải liên tiếp.', impact: { mediaReputation: +3, fanTrust: +4, boardConfidence: +4, playerMorale: +2, sponsorAppeal: +2, publicImage: +3 }, tone: 'balanced' },
          { key: 'C', text: 'Ban lãnh đạo sẽ trao quyền chuyên môn rõ ràng để tối ưu hóa sức mạnh đội một và Học viện.', impact: { mediaReputation: +3, fanTrust: +3, boardConfidence: +3, playerMorale: +3, sponsorAppeal: +2, publicImage: +3 }, tone: 'empowered' }
        ]
      });
    }

    return questions;
  }

  // Xây dựng họp báo theo bối cảnh điều hành CLB (Trước mùa giải, Trước trận lớn, Sau trận, Khủng hoảng truyền thông)
  static buildContextQuestions(contextType, ctx = {}, state = null) {
    const season = state?.season || '2026/27';
    const coachName = state?.coach?.name || 'Luis Enrique';
    const nextFx = ctx.fixture || state?.getCurrentWeekFixture?.() || state?.getNextFixture?.();
    const lastRes = ctx.matchResult || state?.lastMatchResult;

    if (contextType === 'pre_season') {
      return [
        {
          id: 'ctx_preseason_1',
          reporter: 'Julien Bernard',
          outlet: 'PSG TV',
          category: 'Mục tiêu mùa giải',
          question: `Thưa Chủ tịch Phạm Minh Chiêu, bước vào mùa giải ${season}, mục tiêu cao nhất mà ngài đặt ra cho HLV ${coachName} và toàn đội là gì?`,
          options: [
            {
              key: 'A',
              text: 'Thống trị Ligue 1 và dồn toàn lực chinh phục chiếc cúp UEFA Champions League danh giá!',
              repDelta: { fanTrust: +5, mediaTrust: +3, partnerTrust: +3, coachTrust: -1 },
              tone: 'ambitious'
            },
            {
              key: 'B',
              text: 'Xây dựng lối chơi bản sắc, kết hợp các ngôi sao và cầu thủ Học viện PSG để phát triển bền vững.',
              repDelta: { governanceSkill: +4, coachTrust: +4, playerTrust: +3, fanTrust: +2 },
              tone: 'balanced'
            },
            {
              key: 'C',
              text: 'Cân bằng thành tích thể thao với sức khỏe tài chính FFP và mở rộng thương hiệu toàn cầu.',
              repDelta: { partnerTrust: +5, governanceSkill: +4, mediaTrust: +2 },
              tone: 'corporate'
            }
          ]
        },
        {
          id: 'ctx_preseason_2',
          reporter: 'Matteo Romano',
          outlet: 'Transfer Insider',
          category: 'Kế hoạch chuyển nhượng',
          question: 'PSG sẽ tiếp tục bạo chi trên thị trường chuyển nhượng hay ưu tiên giữ ổn định bộ khung hiện có?',
          options: [
            {
              key: 'A',
              text: 'Chúng tôi chỉ bổ sung những vị trí thực sự cần thiết theo đề xuất chuyên môn của BHL.',
              repDelta: { coachTrust: +3, governanceSkill: +4, mediaTrust: +2 },
              tone: 'disciplined'
            },
            {
              key: 'B',
              text: 'Nếu xuất hiện siêu sao nâng tầm Champions League, PSG luôn sẵn sàng hành động quyết đoán.',
              repDelta: { fanTrust: +4, partnerTrust: +3, playerTrust: -1 },
              tone: 'bold'
            }
          ]
        }
      ];
    }

    if (contextType === 'pre_big_match') {
      const opp = nextFx ? (nextFx.home === 'Paris Saint-Germain' ? nextFx.away : nextFx.home) : (ctx.opponent || 'đối thủ lớn');
      const comp = nextFx?.comp || 'UEFA Champions League';
      return [
        {
          id: 'ctx_prematch_1',
          reporter: 'Clara Rossi',
          outlet: 'International Sports Network',
          category: 'Trước đại chiến',
          question: `Thưa Chủ tịch, trước cuộc thư hùng với ${opp} tại ${comp}, ngài đánh giá thế nào về tinh thần phòng thay đồ PSG?`,
          options: [
            {
              key: 'A',
              text: `Tôi tin tưởng tuyệt đối vào sự chuẩn bị chiến thuật của HLV ${coachName} và bản lĩnh các cầu thủ.`,
              repDelta: { coachTrust: +4, playerTrust: +4, fanTrust: +2 },
              tone: 'supportive'
            },
            {
              key: 'B',
              text: 'Tại Parc des Princes, người hâm mộ xứng đáng được chứng kiến một PSG tấn công rực lửa và giành chiến thắng!',
              repDelta: { fanTrust: +5, mediaTrust: +2, partnerTrust: +2 },
              tone: 'fiery'
            },
            {
              key: 'C',
              text: `Chúng tôi tôn trọng ${opp}, nhưng PSG luôn bước ra sân với tâm thế làm chủ cuộc chơi.`,
              repDelta: { mediaTrust: +3, governanceSkill: +2, playerTrust: +2 },
              tone: 'measured'
            }
          ]
        }
      ];
    }

    if (contextType === 'post_match') {
      const score = lastRes ? `${lastRes.homeGoals}-${lastRes.awayGoals}` : 'vừa qua';
      const opp = lastRes?.oppName || 'đối thủ';
      const won = lastRes ? lastRes.psgWon : true;
      return [
        {
          id: 'ctx_postmatch_1',
          reporter: 'Matthieu Delacroix',
          outlet: 'Sports Daily',
          category: 'Sau trận đấu',
          question: won
            ? `Chúc mừng Chủ tịch sau kết quả ${score} trước ${opp}! Ngài đánh giá đâu là yếu tố quyết định thắng lợi này?`
            : `Thưa Chủ tịch, sau kết quả ${score} chưa như kỳ vọng trước ${opp}, Ban lãnh đạo có điều chỉnh gì ngay lập tức không?`,
          options: won
            ? [
                {
                  key: 'A',
                  text: 'Công sức thuộc về tinh thần đoàn kết của toàn đội, HLV trưởng và sự cổ vũ cuồng nhiệt từ khán đài.',
                  repDelta: { playerTrust: +4, coachTrust: +4, fanTrust: +4 },
                  tone: 'humble'
                },
                {
                  key: 'B',
                  text: 'Chiến thắng này khẳng định hướng đầu tư và quản trị thể thao của PSG đang đi đúng quỹ đạo.',
                  repDelta: { governanceSkill: +3, partnerTrust: +3, mediaTrust: +2 },
                  tone: 'confident'
                }
              ]
            : [
                {
                  key: 'A',
                  text: 'Thất bại là bài học cần thiết. Ban lãnh đạo sẽ ngồi lại bình tĩnh cùng HLV để rút kinh nghiệm.',
                  repDelta: { coachTrust: +3, governanceSkill: +3, mediaTrust: +2 },
                  tone: 'calm'
                },
                {
                  key: 'B',
                  text: 'Tôi chia sẻ sự thất vọng với CĐV và yêu cầu toàn đội phản ứng mạnh mẽ ngay từ buổi tập ngày mai.',
                  repDelta: { fanTrust: +4, playerTrust: -1, governanceSkill: +2 },
                  tone: 'demanding'
                }
              ]
        }
      ];
    }

    // crisis_response
    const crisisTitle = ctx.crisisTitle || 'làn sóng tin đồn & áp lực dư luận';
    return [
      {
        id: 'ctx_crisis_1',
        reporter: 'Matteo Romano',
        outlet: 'Transfer Insider',
        category: 'Họp báo Xử lý Khủng hoảng',
        question: `Thưa Chủ tịch Phạm Minh Chiêu, dư luận đang rất quan tâm tới ${crisisTitle}. Thông điệp chính thức của PSG lúc này là gì?`,
        options: [
          {
            key: 'A',
            text: 'PSG vận hành dựa trên kỷ luật, sự minh bạch tài chính và sự đoàn kết tuyệt đối giữa Chủ tịch, HLV và cầu thủ.',
            repDelta: { governanceSkill: +5, mediaTrust: +4, partnerTrust: +3, coachTrust: +2 },
            tone: 'authoritative'
          },
          {
            key: 'B',
            text: 'Mọi thông tin chính thức chỉ xuất hiện trên PSG.fr và PSG TV. Chúng tôi mong CĐV không bị nhiễu loạn bởi tin đồn.',
            repDelta: { fanTrust: +4, mediaTrust: +2, playerTrust: +2 },
            tone: 'protective'
          }
        ]
      }
    ];
  }
}

export class ContextPressConferenceRunner {
  constructor(state) {
    this.state = state;
    this.activeSession = null;
    this.completedCount = 0;
  }

  start(contextType, ctx = {}) {
    const labels = {
      pre_season: 'Họp Báo Khởi Động Mùa Giải',
      pre_big_match: 'Họp Báo Trước Trận Đấu Lớn',
      post_match: 'Họp Báo Sau Trận Đấu',
      crisis_response: 'Họp Báo Đặc Biệt Xử Lý Khủng Hoảng'
    };
    const questions = PressQuestionSystem.buildContextQuestions(contextType, ctx, this.state);
    this.activeSession = {
      id: `pconf_${Date.now()}`,
      contextType,
      title: labels[contextType] || 'Họp Báo PSG TV',
      questions,
      currentIdx: 0,
      answers: []
    };
    this.state?.televisionSystem?.pushBreakingNews(`🔴 TRỰC TIẾP HỌP BÁO: Chủ tịch Phạm Minh Chiêu chủ trì ${this.activeSession.title}`, 'press_conference');
    return this.activeSession;
  }

  answer(optionKey) {
    const ses = this.activeSession;
    if (!ses) return { ok: false, error: 'Không có buổi họp báo nào đang mở.' };
    const q = ses.questions[ses.currentIdx];
    if (!q) return { ok: false, error: 'Đã hoàn tất toàn bộ câu hỏi.' };
    const opt = (q.options || []).find((o) => o.key === optionKey) || q.options?.[0];
    if (!opt) return { ok: false, error: 'Lựa chọn không hợp lệ.' };

    ses.answers.push({ question: q.question, outlet: q.outlet, answer: opt.text, repDelta: opt.repDelta });
    this.state?.reputationSystem?.applyDelta(opt.repDelta, `Họp báo (${ses.title})`, `${ses.id}_${q.id}`);

    ses.currentIdx++;
    const finished = ses.currentIdx >= ses.questions.length;
    if (finished) {
      this.completedCount++;
      this.state?.eventBus?.emit('PRESS_CONFERENCE_COMPLETED', {
        sessionId: ses.id,
        contextType: ses.contextType,
        title: ses.title,
        answers: ses.answers
      }, ses.id);
      const summary = `${ses.title}: "${ses.answers[0]?.answer || ''}"`;
      this.state?.pushSocial('PSG TV', '@PSGTV', `🎙️ Chủ tịch Phạm Minh Chiêu vừa kết thúc ${ses.title}.`, 'positive');
      this.activeSession = null;
      return { ok: true, finished: true, summary };
    }
    return { ok: true, finished: false, nextQuestion: ses.questions[ses.currentIdx] };
  }
}

export class DialogueBranchSystem {
  // Tạo câu trả lời riêng biệt cho từng cầu thủ dựa trên tính cách, tuổi, danh tiếng, quốc tịch, số áo & vai trò!
  static generatePlayerReply(event, state, topic, extra = {}) {
    const p = event.playerId ? state.getPlayerById(event.playerId) : null;
    const name = event.subjectName;
    const personality = p?.personality || (p?.ovr >= 88 ? 'Tham vọng' : p?.age <= 21 ? 'Nhiệt huyết' : 'Điềm tĩnh');
    const age = p?.age || 23;
    const nat = p?.nationality || 'Pháp';
    const ovr = p?.ovr || 82;
    const role = p?.psychology?.squadRole || 'Đá chính thường xuyên';
    const coachName = state.coach?.name || 'HLV trưởng';
    const shirt = event.shirtNumber ? `#${event.shirtNumber}` : 'áo đấu PSG';
    const fromClub = event.fromClub || 'CLB cũ';

    if (topic === 'feelings') {
      if (event.eventType === 'youth_promotion') {
        return `"Tôi trưởng thành từ chính Học viện PSG, nên khoảnh khắc ký hợp đồng đội một trước Chủ tịch Phạm Minh Chiêu là giấc mơ thành hiện thực. Với số áo ${shirt}, tôi sẽ chiến đấu hết mình cho màu áo Paris!"`;
      }
      if (ovr >= 88 || personality === 'Tham vọng') {
        return `"Tôi đến Paris Saint-Germain để chinh phục những đỉnh cao lớn nhất châu Âu. Sau cuộc trao đổi thẳng thắn với Chủ tịch Phạm Minh Chiêu về vai trò '${role}' và dự án cùng HLV ${coachName}, tôi biết đây là bến đỗ đúng đắn nhất trong sự nghiệp của mình."`;
      }
      if (age <= 21) {
        return `"Ở tuổi ${age}, việc được khoác áo số ${shirt} tại một trong những CLB lớn nhất thế giới là niềm tự hào lớn với tôi và gia đình tại ${nat}. Tôi trân trọng quãng thời gian ở ${fromClub}, nhưng giờ là lúc bước lên đẳng cấp mới tại PSG!"`;
      }
      if (personality === 'Điềm tĩnh' || personality === 'Kỷ luật') {
        return `"Rất vinh dự được gia nhập Paris Saint-Germain. Tôi thích sự chuyên nghiệp và cơ sở vật chất hiện đại ở đây. Tôi không hứa hẹn hoa mỹ, mà sẽ chứng minh giá trị bằng màn trình diễn ổn định trên sân cỏ."`;
      }
      return `"Cảm giác thật tuyệt vời! Paris là thành phố đặc biệt và PSG có một tập thể giàu năng lượng. Tôi đã sẵn sàng ra sân tập ngay ngày mai dưới sự dẫn dắt của HLV ${coachName} cùng chiếc áo ${shirt}."`;
    }

    if (topic === 'competition') {
      const rival = extra.rivalName || 'các ngôi sao hiện tại';
      if (ovr >= 86) {
        return `"Cạnh tranh với những cầu thủ đẳng cấp như ${rival} chính là lý do tôi đến PSG. Ở các CLB muốn vô địch Champions League, sự cạnh tranh lành mạnh giúp tất cả cùng tiến bộ — và tôi hoàn toàn tự tin vào năng lực của mình."`;
      }
      return `"Tôi rất tôn trọng ${rival} và các đồng đội mới. Tôi sẽ lắng nghe HLV ${coachName}, học hỏi mỗi buổi tập và tận dụng triệt để mọi cơ hội ra sân để khẳng định vị trí trong đội hình."`;
    }

    // topic === 'fans'
    if (nat === 'Pháp') {
      return `"Ici c'est Paris! Tôi rất nóng lòng được bước ra thảm cỏ Parc des Princes trước sự cổ vũ cuồng nhiệt của các bạn. Hãy cùng nhau tạo nên một mùa giải ${state.season} thật rực rỡ!"`;
    }
    return `"Xin chào người hâm mộ Paris Saint-Germain trên toàn thế giới! Cảm ơn tình cảm nồng nhiệt các bạn đã dành cho ${name}. Tôi cam kết cống hiến 100% đam mê trong từng phút thi đấu vì danh hiệu của PSG — Ici c'est Paris!"`;
  }
}

export class PSGTVBroadcastSystem {
  constructor() {
    this.reset();
  }

  reset() {
    this.isLive = false;
    this.programTitle = 'PSG TV – Official Signing Ceremony';
    this.eventId = null;
    this.subjectName = '';
    this.presidentName = 'Phạm Minh Chiêu';
    this.elapsedSec = 0;
    this.viewerCount = 0;
    this.peakViewers = 0;
    this.activeCameraAngle = 'wide_stage';
    this.liveComments = [];
    this.tickerText = 'PSG TV · Kênh truyền hình chính thức Paris Saint-Germain';
  }

  startLive(event) {
    this.isLive = true;
    this.eventId = event.eventId;
    this.subjectName = event.subjectName;
    this.elapsedSec = 0;
    const baseViewers = event.eventType === 'record_signing' ? 148000
      : event.ovr >= 88 ? 112000
        : event.eventType === 'head_coach_appointment' ? 96000
          : event.eventType === 'youth_promotion' ? 38000
            : 64000;
    this.viewerCount = baseViewers + Math.floor(Math.random() * 14000);
    this.peakViewers = this.viewerCount;
    this.activeCameraAngle = 'wide_stage';
    this.tickerText = `🔴 LIVE · PSG TV – Official Signing Ceremony · Chủ tịch Phạm Minh Chiêu ra mắt ${event.subjectName} ${event.shirtNumber ? `(#${event.shirtNumber})` : ''}`;
    this.liveComments = [
      { user: 'PSG_Ultras91', text: `Chào mừng ${event.subjectName} đến với Parc des Princes! 🔴🔵` },
      { user: 'ParisFoot_FR', text: 'Sân khấu họp báo PSG TV nhìn quá đẳng cấp, Chủ tịch Phạm Minh Chiêu làm việc cực chuyên nghiệp!' },
      { user: 'EuroTactics', text: `Hóng phần hỏi đáp của ${event.subjectName} về kế hoạch mùa giải mới!` }
    ];
  }

  stopLive() {
    this.isLive = false;
  }

  setCameraAngle(angleKey) {
    const valid = ['wide_stage', 'president_closeup', 'player_closeup', 'journalist_cam', 'signing_desk'];
    if (!valid.includes(angleKey)) return false;
    this.activeCameraAngle = angleKey;
    return true;
  }

  pushLiveReaction(user, text, viewerDelta = 2400) {
    if (!this.isLive) return;
    this.viewerCount = Math.max(5000, this.viewerCount + viewerDelta);
    if (this.viewerCount > this.peakViewers) this.peakViewers = this.viewerCount;
    this.liveComments.unshift({ user, text });
    if (this.liveComments.length > 24) this.liveComments.pop();
  }

  tick(dt) {
    if (!this.isLive) return;
    this.elapsedSec += dt;
    if (Math.random() < dt * 0.6) {
      this.viewerCount = Math.max(12000, this.viewerCount + Math.round((Math.random() - 0.35) * 650));
      if (this.viewerCount > this.peakViewers) this.peakViewers = this.viewerCount;
    }
  }

  getFormattedDuration() {
    const total = Math.floor(this.elapsedSec);
    const m = Math.floor(total / 60);
    const s = total % 60;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }

  exportState() {
    return {
      isLive: this.isLive,
      eventId: this.eventId,
      subjectName: this.subjectName,
      elapsedSec: Math.floor(this.elapsedSec),
      viewerCount: this.viewerCount,
      peakViewers: this.peakViewers,
      activeCameraAngle: this.activeCameraAngle,
      liveComments: this.liveComments.slice(0, 12)
    };
  }

  importState(snap) {
    if (!snap) return;
    Object.assign(this, snap);
  }
}
