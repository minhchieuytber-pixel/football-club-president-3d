// src/club/GameState.js
// Trung tâm dữ liệu duy nhất (Single Source of Truth) của Football Club President Simulator 3D — Paris Saint-Germain
// Tích hợp đồng bộ: PlayerDatabase, StaffDatabase, ClubDatabase, SquadFormationSystem, TransferSystem, ManagerManagementSystem,
// CoachingStaffSystem, TrainingSystem, PlayerDevelopmentSystem, GameTimeSystem, Finance, Media & SaveLoad.
import { createInitialDepartments, createInitialNpcProfiles } from '../departments/DepartmentData.js';
import { generateRealPlayers200, generateAcademy100, enrichPlayerProfile } from '../players/PlayerDatabase.js';
import { createWorldClubs } from '../leagues/LeagueSystem.js';
import { MatchCalendarSystem } from '../matchday/MatchCalendarSystem.js';
import { MatchdaySystem } from '../matchday/MatchdaySystem.js';
import { PressNewsSystem } from '../media/PressNewsSystem.js';
import { SquadFormationSystem } from '../squad/SquadFormationSystem.js';
import { RivalrySystem } from '../matches/MatchSystems.js';
import { TaskAssignmentSystem } from '../dialogue/DialogueSystem.js';
import { createInitialStaffDatabase, STAFF_ROLE_META } from '../staff/StaffDatabase.js';
import { ManagerManagementSystem } from '../staff/ManagerManagementSystem.js';
import { CoachingStaffSystem } from '../staff/CoachingStaffSystem.js';
import { TransferSystem } from '../transfers/TransferSystem.js';
import { TransferConsultationSystem } from '../transfers/TransferConsultationSystem.js';
import { PlayerDevelopmentSystem } from '../training/PlayerDevelopmentSystem.js';
import { TrainingSystem } from '../training/TrainingSystem.js';
import { GameTimeSystem } from '../time/GameTimeSystem.js';
import { SigningEventSystem, createMediaNpcProfiles } from '../media/SigningEventSystem.js';
import { MediaReputationSystem } from '../media/MediaNewsGenerator.js';
import { TrophySystem } from '../trophies/TrophySystem.js';
import { TournamentSystem } from '../leagues/TournamentSystem.js';
import { ClubEventBus } from '../core/ClubEventBus.js';
import { ReputationSystem } from './ReputationSystem.js';
import { CommercialFacilitySystem } from './CommercialFacilitySystem.js';
import { RumorAndCrisisSystem } from '../media/RumorAndCrisisSystem.js';
import { MorningNewsSystem } from '../media/MorningNewsSystem.js';
import { TelevisionSystem } from '../media/TelevisionSystem.js';
import { ContextPressConferenceRunner } from '../media/PressConferenceSystem.js';
import { ClubRelationshipSystem } from '../relations/ClubRelationshipSystem.js';
import { DynamicMarketValueSystem } from '../valuation/DynamicMarketValueSystem.js';
import { GlobalClubAISystem } from '../ai/GlobalClubAISystem.js';

export class GameState {
  constructor() {
    this._squadListeners = [];
    this._staffListeners = [];
    this.reset();
  }

  onSquadChange(fn) {
    this._squadListeners.push(fn);
  }

  notifySquadChanged() {
    this._squadListeners.forEach((fn) => { try { fn(this); } catch (_) {} });
  }

  onStaffChange(fn) {
    this._staffListeners.push(fn);
  }

  notifyStaffChanged() {
    this._staffListeners.forEach((fn) => { try { fn(this); } catch (_) {} });
  }

  reset() {
    this.president = {
      name: 'Phạm Minh Chiêu',
      club: 'Paris Saint-Germain',
      stadium: 'Parc des Princes',
      league: 'Ligue 1',
      prestige: 88,
      boardTrust: 86,
      fanSupport: 84
    };
    this.season = '2026/27';
    this.seasonNum = 1;
    this.week = 1;
    this.dayNum = 1;
    this.activeKit = 'home';

    // Hệ thống thời gian thống nhất toàn game (1 ngày = 15 phút thực, scale = 96)
    this.timeSystem = new GameTimeSystem('2026-08-03T09:15:00Z');
    this.dayName = this.timeSystem.dayName;
    this.clockHour = this.timeSystem.clockHour;

    this.finance = {
      budget: 245.0,
      cash: 245.0,
      bankBalance: 245.0,
      transferBudget: 165.0,
      weeklyWages: 4.85,
      debt: 0.0,
      ffpStatus: 'An toàn (72% doanh thu)',
      income: { tv: 112, tickets: 68, sponsors: 145, merch: 54, prize: 42, sales: 0 },
      expenses: { playerWages: 215, staffWages: 28, coachWage: 10, transfers: 0, ops: 38, maintenance: 16 },
      receivables: [],
      payables: [],
      processedTxIds: [],
      financialLogs: [
        { txKey: 'init_1', date: 'Tuần 1', category: 'Tài trợ', counterparty: 'Qatar Airways & Nike', desc: 'Tài trợ chính Qatar Airways & Nike (đợt 1)', amount: +48.0 },
        { txKey: 'init_2', date: 'Tuần 1', category: 'Quỹ lương', counterparty: 'Nội bộ PSG', desc: 'Quỹ lương tuần đội một & 12 phòng ban', amount: -4.85 }
      ],
      periodReports: { weeklyIn: 0, weeklyOut: 0, monthlyIn: 0, monthlyOut: 0, seasonIn: 48.0, seasonOut: 4.85 },
      ledger: [
        { date: 'Tuần 1', desc: 'Tài trợ chính Qatar Airways & Nike (đợt 1)', amount: +48.0 },
        { date: 'Tuần 1', desc: 'Quỹ lương tuần đội một & 12 phòng ban', amount: -4.85 }
      ]
    };

    // Cơ sở dữ liệu nhân sự (12 chức vụ BHL + Ban lãnh đạo + Ứng viên)
    this.staffDb = createInitialStaffDatabase();
    this.departments = createInitialDepartments().map((d) => ({ ...d, proposalApproved: false }));
    this.npcs = [...createInitialNpcProfiles(), ...createMediaNpcProfiles()];
    this.players = generateRealPlayers200();
    this.academy = generateAcademy100();
    this.clubs = createWorldClubs();
    this.fixtures = MatchCalendarSystem.buildSeasonSchedule(this.clubs, 2026);

    // Khởi tạo trạng thái HLV trưởng đồng bộ 100% từ StaffDatabase
    const hc = this.staffDb.active.find((s) => s.roleKey === 'head_coach');
    this.coach = {
      staffId: hc?.staffId || 'stf_hc_01',
      vacant: false,
      name: hc?.name || 'Luis Enrique',
      nationality: hc?.nationality || 'Tây Ban Nha',
      age: hc?.age || 55,
      reputation: hc?.reputation || 91,
      experience: hc?.experience || 90,
      tactics: hc?.ratings?.tactics || 92,
      youthDev: hc?.youthDev || 86,
      dressingRoom: hc?.dressingRoom || 85,
      wage: hc?.wage || 195,
      contractYears: hc?.contractYears || 3,
      tacticalStyle: hc?.tacticalStyle || '4-3-3 Kiểm soát bóng',
      formation: '4-3-3 Kiểm soát bóng',
      objectives: ['Vô địch Ligue 1', 'Tối thiểu Bán kết Champions League', 'Đôn 2 cầu thủ Học viện lên đội một']
    };

    // Đồng bộ 12 thành viên Ban huấn luyện vào danh sách NPC ban đầu để hiện diện thực tế trong thế giới 3D
    this.staffDb.active.forEach((st) => {
      const meta = STAFF_ROLE_META[st.roleKey];
      if (!meta) return;
      const idx = this.npcs.findIndex((n) => n.id === st.npcId);
      const prof = {
        id: st.npcId,
        staffId: st.staffId,
        roleKey: st.roleKey,
        name: st.name,
        role: st.role,
        dept: st.dept,
        age: st.age,
        gender: 'Nam',
        personality: st.personality,
        skill: st.overall || st.reputation,
        morale: st.morale,
        relation: st.relation,
        outfit: st.appearance?.outfit || (st.isCoachingStaff ? 'coach_psg' : 'suit_navy'),
        skin: st.appearance?.skin || 0xf2c6a0,
        hair: st.appearance?.hair || 0x2c1d11,
        hairStyle: st.appearance?.hairStyle ?? 0,
        home: st.home || meta.home,
        pitchSpot: st.pitchSpot || meta.pitchSpot,
        isCoachingStaff: !!st.isCoachingStaff,
        isManagedStaff: true,
        task: st.currentDuty || meta.duty
      };
      if (idx !== -1) this.npcs[idx] = prof;
      else this.npcs.push(prof);
    });

    // Gắn playerId cho các NPC cầu thủ khởi tạo
    this.npcs.forEach((n) => {
      if (n.isPlayer && !n.playerId) {
        const match = this.players.find((p) => p.name === n.name);
        if (match) {
          n.playerId = match.id;
          n.position = match.position;
        }
      }
    });

    this.pendingReports = [
      { id: 'rep_1', dept: 'Ban Huấn Luyện', author: this.coach.name, title: 'Đề xuất tăng ngân sách phân tích video đối thủ (€1.5M)', detail: 'Trang bị hệ thống camera chiến thuật góc rộng phân tích pressing cho Ligue 1 & Champions League.', cost: -1.5, effect: { deptId: 'coaching', perf: 5, morale: 4 } },
      { id: 'rep_2', dept: 'Phòng Marketing & Thương Mại', author: 'Antoine Lefèvre', title: 'Ký gói tài trợ khu vực Châu Á (+€14.0M)', detail: 'Đối tác viễn thông đề nghị tài trợ biển LED Parc des Princes trong 1 mùa giải.', cost: +14.0, effect: { deptId: 'marketing', perf: 4, prestige: 3 } },
      { id: 'rep_3', dept: 'Phòng Y Tế', author: 'BS. Christophe Baudot', title: 'Nâng cấp buồng hồi phục lạnh Cryotherapy (€1.8M)', detail: 'Giúp giảm 25% nguy cơ căng cơ và rút ngắn thời gian hồi phục cho đội một.', cost: -1.8, effect: { deptId: 'medical', perf: 6, morale: 5 } },
      { id: 'rep_4', dept: 'Phòng Tuyển Trạch', author: 'Marc-Antoine Delacroix', title: 'Mở rộng mạng lưới săn cầu thủ U20 Nam Mỹ (€2.2M)', detail: 'Phát hiện sớm các tài năng trẻ tiềm năng 90+ trước các đối thủ Ngoại hạng Anh.', cost: -2.2, effect: { deptId: 'scouting', perf: 5, morale: 4 } }
    ];

    this.dailyBriefings = [];
    this.meetingMinutes = [
      {
        id: 'mm_0',
        date: 'Tuần 1 · Mùa 2026/27',
        topic: 'Khởi động chiến lược mùa giải mới dưới thời Chủ tịch Phạm Minh Chiêu',
        attendees: ['Victoriano Melero', 'Luís Campos', 'Luis Enrique', 'Jean-Baptiste Laurent'],
        votes: { approve: 4, reject: 0, abstain: 0 },
        decision: 'Phê duyệt mục tiêu Vô địch Ligue 1, tiến sâu tại UEFA Champions League và kiểm soát quỹ lương bền vững.',
        owner: 'Ban Điều Hành PSG'
      }
    ];

    this.phoneInbox = [
      { id: 'msg_1', from: 'Lịch Thi Đấu PSG', title: `⚠️ Tuần 1 có trận: ${this.fixtures[0].home} vs ${this.fixtures[0].away}`, body: 'Thưa Chủ tịch, tuần này PSG có trận đấu chính thức. Không thể tua qua tuần khi trận đấu chưa diễn ra.', urgent: true, read: false },
      { id: 'msg_2', from: 'Luís Campos (GĐ Thể Thao)', title: 'Kỳ chuyển nhượng Mùa Hè 2026 đang mở cửa!', body: 'Danh sách 200 cầu thủ thật, bộ lọc đầy đủ & quy trình đàm phán 2 giai đoạn đã sẵn sàng trên máy tính macOS.', urgent: false, read: false },
      { id: 'msg_3', from: 'Ban Huấn Luyện (12 chuyên gia)', title: 'Hệ thống huấn luyện 3D & Lịch tập 09:00–12:00 đã kích hoạt', body: 'Thưa Chủ tịch Phạm Minh Chiêu, 12 thành viên Ban huấn luyện PSG đã sẵn sàng trên sân tập thực hiện các bài tập thể lực, chuyền, sút, chiến thuật & đấu tập đối kháng.', urgent: false, read: false }
    ];

    this.incomingCall = null;
    this.socialFeed = [
      { id: 'soc_1', author: 'Le Parisien Sport', handle: '@leparisien_psg', text: 'Chủ tịch Phạm Minh Chiêu chính thức chủ trì buổi làm việc đầu tuần tại Trụ sở Campus PSG.', likes: 12480, sentiment: 'positive' },
      { id: 'soc_2', author: 'Collectif Ultras Paris', handle: '@Co_Ultras_Paris', text: 'Parc des Princes đã sẵn sàng rực cháy cho trận mở màn tuần này!', likes: 8940, sentiment: 'positive' }
    ];

    this.seasonHistory = [
      { season: '2025/26', ligue1Winner: 'Paris Saint-Germain', uclWinner: 'Paris Saint-Germain', topScorer: 'Ousmane Dembélé (24 bàn)', psgRank: 'Hạng 1', trophies: 'Ligue 1, Coupe de France, UCL', revenue: '€805M' }
    ];

    this.dialogueLogs = [];
    this.transferLogs = [];
    this.loseStreak = 0;
    this.headToHead = {};
    this.assignedTasks = [];
    this.newsArchive = [];
    this.matchReports = [];
    this.lastMatchResult = null;
    this.lastSeasonSummary = null;
    this.latestTrophyBroadcast = null;

    // Khởi tạo EventBus trung tâm & toàn bộ hệ thống con kết nối chung Single Source of Truth
    this.eventBus = new ClubEventBus(this);
    this.reputationSystem = new ReputationSystem(this);
    this.commercialSystem = new CommercialFacilitySystem(this);
    this.rumorCrisisSystem = new RumorAndCrisisSystem(this);
    this.morningNewsSystem = new MorningNewsSystem(this);
    this.televisionSystem = new TelevisionSystem(this);
    this.contextPressConference = new ContextPressConferenceRunner(this);

    this.formationSystem = new SquadFormationSystem(this);
    this.managerSystem = new ManagerManagementSystem(this);
    this.coachingSystem = new CoachingStaffSystem(this);
    this.developmentSystem = new PlayerDevelopmentSystem(this);
    this.trainingSystem = new TrainingSystem(this);
    this.transferSystem = new TransferSystem(this);
    this.transferConsultationSystem = new TransferConsultationSystem(this);
    this.trophySystem = new TrophySystem(this);
    this.tournamentSystem = new TournamentSystem(this, this.trophySystem);
    this.brandMetrics = null;
    MediaReputationSystem.ensureBrandMetrics(this);
    this.signingEventSystem = new SigningEventSystem(this);
    this.relationshipSystem = new ClubRelationshipSystem(this);
    this.matchdaySystem = new MatchdaySystem(this);
    this.matchdaySystem.syncScheduleFromState();
    this.valuationSystem = new DynamicMarketValueSystem(this);
    this.globalClubAI = new GlobalClubAISystem(this);

    this._bindCoreEventBus();

    // Đăng ký sự kiện đồng hồ toàn game
    this.timeSystem.on('onDayChange', (evt) => this.handleNewGameDay(evt));
    this.timeSystem.on('onHour', () => this.matchdaySystem?.onTimeAdvanced(this.timeSystem));

    this.generateDailyBriefing();
    if (this.fixtures[0]) PressNewsSystem.generatePreMatchNews(this, this.fixtures[0]);
    PressNewsSystem.createArticle(this, {
      scenarioId: 26, category: 'Nội bộ', tagType: 'Chính thức', verificationStatus: 'Chính thức',
      title: 'Chủ tịch Phạm Minh Chiêu chính thức mở màn mùa giải mới cùng Paris Saint-Germain',
      summary: 'Ban lãnh đạo PSG khẳng định quyết tâm bảo vệ ngôi vương Ligue 1 và chinh phục UEFA Champions League.',
      body: `Tại trụ sở hiện đại Campus PSG, Chủ tịch Phạm Minh Chiêu đã có buổi làm việc đầu mùa với 12 phòng ban và HLV trưởng ${this.coach.name}, đặt mục tiêu kết hợp giữa bản sắc bóng đá tấn công và sự phát triển bền vững của Học viện.`,
      imageType: 'boardroom', imageCaption: 'BAN LÃNH ĐẠO PSG · MÙA GIẢI MỚI', relatedEntity: 'Chủ tịch Phạm Minh Chiêu', fanTone: 'win'
    });
    this.morningNewsSystem.generateDigest(true);
  }

  _bindCoreEventBus() {
    if (!this.eventBus) return;
    PressNewsSystem.subscribeToEventBus(this.eventBus, this);
    this.rumorCrisisSystem.subscribeToEventBus(this.eventBus);
    this.eventBus.on('TRANSFER_DEAL_COMPLETED', (deal) => {
      if (deal && (deal.to === 'Paris Saint-Germain' || deal.from === 'Paris Saint-Germain')) {
        this.televisionSystem?.pushBreakingNews(`${deal.playerName}: ${deal.from} → ${deal.to} (€${deal.fee}M)`, 'transfer_news');
        this.morningNewsSystem?.generateDigest(true);
      }
    });
  }

  renewPsgPlayerContract(playerId, years = 3, customWage = null) {
    const p = this.getPsgSquad().find((x) => x.id === playerId);
    if (!p) return { ok: false, error: 'Không tìm thấy cầu thủ trong đội một PSG.' };
    const newWage = Math.max(p.wage || 40, Number(customWage || Math.round((p.wage || 60) * 1.1)));
    const newYears = Math.max(2, Math.min(5, Number(years || 3)));
    p.wage = newWage;
    p.contractYears = newYears;
    p.morale = Math.min(100, (p.morale || 80) + 8);
    if (p.contract) {
      p.contract.weeklyWage = newWage;
      p.contract.annualWage = +((newWage * 52) / 1000).toFixed(2);
      p.contract.contractYears = newYears;
      p.contract.renewalStatus = 'Ổn định';
    }
    if (p.psychology) p.psychology.morale = p.morale;
    this.transferSystem?.recalcWeeklyWages();
    this.reputationSystem?.applyDelta(
      { playerTrust: +3, governanceSkill: +2, fanTrust: +1 },
      `Gia hạn hợp đồng ${p.name} (+${newYears} năm)`
    );
    this.eventBus?.emit('CONTRACT_RENEWED', {
      playerId: p.id,
      playerName: p.name,
      weeklyWage: newWage,
      contractYears: newYears
    });
    this.relationshipSystem?.onContractRenewed(p);
    this.notifySquadChanged();
    return { ok: true, player: p, newWage, newYears };
  }

  getTotalPendingApprovalsCount() {
    const rep = this.pendingReports?.length || 0;
    const bids = this.transferSystem?.incomingBids?.length || 0;
    const rumors = (this.rumorCrisisSystem?.rumors || []).filter((r) => !r.handled).length;
    const crises = (this.rumorCrisisSystem?.crises || []).filter((c) => c.status === 'active').length;
    const events = this.signingEventSystem?.pendingEvents?.length || 0;
    return rep + bids + rumors + crises + events;
  }

  // ==================== SINGLE SOURCE OF TRUTH LOOKUPS ====================

  getPlayerById(playerId) {
    if (!playerId) return null;
    return this.players.find((p) => p.id === playerId) || this.academy.find((y) => y.id === playerId) || null;
  }

  getAllPlayers() {
    const map = new Map();
    this.players.forEach((p) => map.set(p.id, p));
    this.academy.forEach((y) => { if (!map.has(y.id)) map.set(y.id, y); });
    return Array.from(map.values());
  }

  getPsgSquad() {
    return this.players
      .filter((p) => p.club === 'Paris Saint-Germain' && p.squadLevel !== 'Cho mượn')
      .sort((a, b) => b.ovr - a.ovr);
  }

  setActiveKit(kitKey) {
    const valid = ['home', 'away', 'third'];
    if (!valid.includes(kitKey)) return false;
    if (this.activeKit === kitKey) return true;
    this.activeKit = kitKey;
    this.formationSystem?.notify();
    this.notifySquadChanged();
    return true;
  }

  getNextFixture() {
    return this.fixtures.find((f) => !f.played) || null;
  }

  getCurrentWeekFixture() {
    return this.fixtures.find((f) => !f.played && f.week <= this.week) || null;
  }

  // Cập nhật thời gian toàn game (gọi mỗi frame trong main.js)
  tickTime(realDt) {
    this.timeSystem.tick(realDt);
    this.televisionSystem?.tick(realDt);
    this.clockHour = this.timeSystem.clockHour;
    this.dayName = this.timeSystem.dayName;
  }

  // Sự kiện tự động khi bước sang ngày mới theo đồng hồ GameTimeSystem (không trùng lặp)
  handleNewGameDay(evt) {
    const daysPassed = Math.max(1, evt.daysPassed || 1);
    this.dayNum += daysPassed;
    this.dayName = this.timeSystem.dayName;

    // 1. Hồi phục thể lực & tiến triển chấn thương theo số ngày trôi qua + cấp Trung tâm Y tế
    const rehabMult = this.coachingSystem?.getTrainingQualityMultipliers()?.rehab || 1.0;
    const medLv = this.commercialSystem?.getFacilityLevel('medical_lab') || 3;
    const medBonus = 1 + medLv * 0.06;
    this.getPsgSquad().forEach((p) => {
      if (p.injuryDays > 0) {
        const heal = daysPassed * (rehabMult >= 1.1 ? 1.25 : 1) * medBonus;
        p.injuryDays = Math.max(0, Math.round(p.injuryDays - heal));
        if (p.health) p.health.injuryDays = p.injuryDays;
      }
      if (p.health) {
        p.health.fatigue = Math.max(0, p.health.fatigue - 9 * daysPassed);
        p.health.fitness = Math.min(100, p.health.fitness + 6 * daysPassed);
        p.health.recoveryNeeded = p.health.fitness < 72 || p.health.fatigue > 58;
      }
    });

    // 2. Đồng bộ kỳ chuyển nhượng Mùa Hè / Mùa Đông theo lịch thực
    this.transferSystem?.syncWindowWithDate(evt.year, evt.month, evt.day);
    if (this.transferSystem?.isWindowOpen() && Math.random() < 0.35) {
      this.transferSystem.runAiTransferMarketCycle(1);
    }

    // 3. Tiến độ nhiệm vụ, Bản tin ngày & Bản Tin Sáng PSG Morning News
    TaskAssignmentSystem.advanceTasks(this, 35 * daysPassed);
    this.generateDailyBriefing();
    this.morningNewsSystem?.generateDigest(false);
    this.matchdaySystem?.onTimeAdvanced(this.timeSystem, { bulkJump: daysPassed > 1 });
    this.relationshipSystem?.onDailyTick?.(evt);

    if (this._onNewDayToast) {
      this._onNewDayToast(`🌅 Ngày mới: ${this.timeSystem.dayNameUpper} (${evt.date}) — Bản tin sáng PSG & lịch huấn luyện đã cập nhật!`);
    }
  }

  generateDailyBriefing() {
    const fx = this.getCurrentWeekFixture();
    const injured = this.getPsgSquad().filter((p) => p.injuryDays > 0);
    const avgPerf = Math.round(this.departments.reduce((s, d) => s + d.performance, 0) / this.departments.length);
    const dateTxt = this.timeSystem ? `${this.timeSystem.dayName} · ${this.timeSystem.getDateString()}` : `Ngày ${this.dayNum} · ${this.dayName}`;
    this.dailyBriefings.unshift({
      id: `brief_${Date.now()}_${Math.random()}`,
      date: `${dateTxt} · Tuần ${this.week} (${this.season})`,
      matchAlert: fx ? `⚽ Tuần này có trận ${fx.comp}: ${fx.home} vs ${fx.away} (Chưa thi đấu — Bắt buộc hoàn thành trước khi qua tuần)` : '✅ Không còn trận đấu tồn đọng trong tuần này.',
      trainingNote: `🏃 Giáo án 09:00–12:00 (${this.trainingSystem?.focus || 'Cân bằng'} · Cường độ: ${this.trainingSystem?.intensity || 'Trung bình'}) dưới quyền HLV ${this.coach.name}.`,
      healthNote: injured.length > 0 ? `🏥 Chấn thương (${injured.length}): ${injured.map((p) => `${p.name} (${p.injuryDays} ngày)`).join(', ')}.` : '💚 Thể trạng đội một 100% sẵn sàng, không có ca chấn thương.',
      financeNote: `💶 Ngân sách: €${this.finance.budget.toFixed(1)}M · Quỹ CN: €${this.finance.transferBudget.toFixed(1)}M · ${this.transferSystem?.getWindowLabel() || ''} · TB 12 phòng: ${avgPerf}%.`
    });
    if (this.dailyBriefings.length > 20) this.dailyBriefings.pop();
  }

  resolvePendingReport(reportId, approve) {
    const idx = this.pendingReports.findIndex((r) => r.id === reportId);
    if (idx === -1) return null;
    const rep = this.pendingReports[idx];
    this.pendingReports.splice(idx, 1);
    if (approve) {
      if (rep.cost !== 0) this.addLedger(`${rep.dept}: ${rep.title}`, rep.cost);
      if (rep.effect?.deptId) {
        const d = this.departments.find((x) => x.id === rep.effect.deptId);
        if (d) {
          d.performance = Math.min(100, d.performance + (rep.effect.perf || 4));
          d.morale = Math.min(100, d.morale + (rep.effect.morale || 3));
        }
      }
      if (rep.effect?.prestige) this.president.prestige = Math.min(100, this.president.prestige + rep.effect.prestige);
    }
    return rep;
  }

  ensureFinanceIntegrity() {
    if (!this.finance || typeof this.finance !== 'object') return;
    const f = this.finance;
    f.budget = +(Number(f.budget || 0)).toFixed(2);
    f.cash = +(Number(f.cash ?? f.budget)).toFixed(2);
    f.bankBalance = f.cash;
    f.transferBudget = Math.max(0, +(Number(f.transferBudget ?? 0)).toFixed(2));
    f.debt = Math.max(0, +(Number(f.debt ?? 0)).toFixed(2));
    if (!f.income) f.income = { tv: 112, tickets: 68, sponsors: 145, merch: 54, prize: 42, sales: 0 };
    if (!f.expenses) f.expenses = { playerWages: 215, staffWages: 28, coachWage: 10, transfers: 0, ops: 38, maintenance: 16 };
    if (!Array.isArray(f.receivables)) f.receivables = [];
    if (!Array.isArray(f.payables)) f.payables = [];
    if (!Array.isArray(f.processedTxIds)) f.processedTxIds = [];
    if (!Array.isArray(f.financialLogs)) f.financialLogs = [];
    if (!Array.isArray(f.ledger)) f.ledger = [];
    if (!f.periodReports) f.periodReports = { weeklyIn: 0, weeklyOut: 0, monthlyIn: 0, monthlyOut: 0, seasonIn: 0, seasonOut: 0 };
    this._updatePsgFfpStatus();
  }

  _updatePsgFfpStatus() {
    const f = this.finance;
    if (!f) return;
    const inc = Object.values(f.income || {}).reduce((s, v) => s + Number(v || 0), 0);
    const exp = Object.values(f.expenses || {}).reduce((s, v) => s + Number(v || 0), 0);
    const ratio = inc > 0 ? Math.round((exp / inc) * 100) : 85;
    if ((f.cash ?? f.budget) < 10 || (f.debt || 0) > 85 || ratio > 96) {
      f.ffpStatus = `Cảnh báo cao (${ratio}% doanh thu)`;
    } else if (ratio > 84 || (f.debt || 0) > 35) {
      f.ffpStatus = `Theo dõi FFP (${ratio}% doanh thu)`;
    } else {
      f.ffpStatus = `An toàn (${ratio}% doanh thu)`;
    }
  }

  recordFinanceTransaction({
    txKey = null,
    desc,
    amount,
    category = 'Khác',
    counterparty = 'Hệ thống CLB',
    incomeField = null,
    expenseField = null,
    transferBudgetDelta = null,
    noTransferBudgetScale = false
  }) {
    this.ensureFinanceIntegrity();
    const f = this.finance;
    const amt = +Number(amount || 0).toFixed(2);
    if (!Number.isFinite(amt)) return { ok: false, duplicate: false };
    if (txKey && f.processedTxIds.includes(txKey)) {
      return { ok: false, duplicate: true };
    }
    if (txKey) {
      f.processedTxIds.push(txKey);
      if (f.processedTxIds.length > 350) f.processedTxIds.shift();
    }

    const dateStr = this.timeSystem ? this.timeSystem.getDateString() : `Tuần ${this.week}`;
    f.budget = +(f.budget + amt).toFixed(2);
    f.cash = +(f.cash + amt).toFixed(2);
    if (f.cash < 0) {
      f.debt = +(f.debt + Math.abs(f.cash)).toFixed(2);
      f.cash = 0;
    }
    f.bankBalance = f.cash;
    if (f.budget < 0) f.budget = 0;

    if (transferBudgetDelta !== null && transferBudgetDelta !== undefined) {
      f.transferBudget = Math.max(0, +(f.transferBudget + transferBudgetDelta).toFixed(2));
    } else if (!noTransferBudgetScale) {
      if (amt < 0) f.transferBudget = Math.max(0, +(f.transferBudget + amt * 0.6).toFixed(2));
      else f.transferBudget = +(f.transferBudget + amt * 0.5).toFixed(2);
    }
    f.transferBudget = Math.min(f.transferBudget, +(Math.max(f.cash, f.budget) * 1.15).toFixed(2));

    if (amt >= 0) {
      f.periodReports.weeklyIn = +(f.periodReports.weeklyIn + amt).toFixed(2);
      f.periodReports.monthlyIn = +(f.periodReports.monthlyIn + amt).toFixed(2);
      f.periodReports.seasonIn = +(f.periodReports.seasonIn + amt).toFixed(2);
      if (incomeField && f.income) {
        f.income[incomeField] = +(Number(f.income[incomeField] || 0) + amt).toFixed(2);
      }
    } else {
      const absAmt = Math.abs(amt);
      f.periodReports.weeklyOut = +(f.periodReports.weeklyOut + absAmt).toFixed(2);
      f.periodReports.monthlyOut = +(f.periodReports.monthlyOut + absAmt).toFixed(2);
      f.periodReports.seasonOut = +(f.periodReports.seasonOut + absAmt).toFixed(2);
      if (expenseField && f.expenses) {
        f.expenses[expenseField] = +(Number(f.expenses[expenseField] || 0) + absAmt).toFixed(2);
      }
    }

    f.ledger.unshift({ date: dateStr, desc, amount: amt });
    if (f.ledger.length > 60) f.ledger.pop();

    f.financialLogs.unshift({
      txKey: txKey || `tx_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      date: dateStr,
      week: this.week,
      season: this.season,
      category,
      counterparty,
      desc,
      amount: amt,
      cashAfter: f.cash
    });
    if (f.financialLogs.length > 120) f.financialLogs.pop();

    this._updatePsgFfpStatus();
    this.globalClubAI?.syncPsgClubSummary?.();
    return { ok: true, amount: amt, cash: f.cash, transferBudget: f.transferBudget };
  }

  addLedger(desc, amount, meta = {}) {
    return this.recordFinanceTransaction({
      txKey: meta.txKey || null,
      desc,
      amount,
      category: meta.category || (amount >= 0 ? 'Thu nhập' : 'Chi phí'),
      counterparty: meta.counterparty || 'CLB Paris Saint-Germain',
      incomeField: meta.incomeField || null,
      expenseField: meta.expenseField || null,
      transferBudgetDelta: meta.transferBudgetDelta ?? null,
      noTransferBudgetScale: !!meta.noTransferBudgetScale
    });
  }

  processDueInstallments() {
    this.ensureFinanceIntegrity();
    const f = this.finance;
    const wk = this.week;
    const sNum = this.seasonNum;

    const nextReceivables = [];
    for (const r of f.receivables) {
      if (r.remaining > 0.05 && wk >= (r.nextDueWeek || 0)) {
        const amt = +Math.min(r.remaining, r.perInstallment || r.remaining).toFixed(2);
        this.recordFinanceTransaction({
          txKey: `psg_rcv_${r.id}_s${sNum}_w${wk}`,
          desc: `Thu trả góp: ${r.desc} (${r.counterparty})`,
          amount: +amt,
          category: 'Trả góp chuyển nhượng',
          counterparty: r.counterparty,
          incomeField: 'sales'
        });
        r.remaining = +(r.remaining - amt).toFixed(2);
        r.installmentsLeft = Math.max(0, (r.installmentsLeft || 1) - 1);
        r.nextDueWeek = wk + (r.dueIntervalWeeks || 4);
      }
      if (r.remaining > 0.05) nextReceivables.push(r);
    }
    f.receivables = nextReceivables;

    const nextPayables = [];
    for (const p of f.payables) {
      if (p.remaining > 0.05 && wk >= (p.nextDueWeek || 0)) {
        const amt = +Math.min(p.remaining, p.perInstallment || p.remaining).toFixed(2);
        this.recordFinanceTransaction({
          txKey: `psg_pay_${p.id}_s${sNum}_w${wk}`,
          desc: `Trả góp chuyển nhượng: ${p.desc} (${p.counterparty})`,
          amount: -amt,
          category: 'Trả góp chuyển nhượng',
          counterparty: p.counterparty,
          expenseField: 'transfers',
          transferBudgetDelta: 0
        });
        p.remaining = +(p.remaining - amt).toFixed(2);
        p.installmentsLeft = Math.max(0, (p.installmentsLeft || 1) - 1);
        p.nextDueWeek = wk + (p.dueIntervalWeeks || 4);
      }
      if (p.remaining > 0.05) nextPayables.push(p);
    }
    f.payables = nextPayables;
  }

  pushSocial(author, handle, text, sentiment = 'neutral') {
    this.socialFeed.unshift({ id: `soc_${Date.now()}_${Math.random()}`, author, handle, text, likes: 1800 + Math.floor(Math.random() * 14000), sentiment });
    if (this.socialFeed.length > 25) this.socialFeed.pop();
  }

  pushPhoneMsg(from, title, body, urgent = false, extra = {}) {
    this.phoneInbox.unshift({ id: `msg_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`, from, title, body, urgent, read: false, ...extra });
    if (this.phoneInbox.length > 30) this.phoneInbox.pop();
  }

  advanceWeek(onLivingWorldEvent) {
    const pendingFx = this.getCurrentWeekFixture();
    if (pendingFx) {
      return { blocked: true, fixture: pendingFx };
    }

    this.week++;
    const periodId = `S${this.seasonNum}_W${this.week}`;
    this.ensureFinanceIntegrity();
    this.finance.periodReports.weeklyIn = 0;
    this.finance.periodReports.weeklyOut = 0;
    if (this.week % 4 === 1) {
      this.finance.periodReports.monthlyIn = 0;
      this.finance.periodReports.monthlyOut = 0;
    }

    // Tua tiến đúng 7 ngày trên đồng hồ duy nhất GameTimeSystem & đặt về 09:00 sáng
    this.timeSystem.advanceGameDays(7);
    this.timeSystem.setTimeOfDay(9, 0);
    this.clockHour = this.timeSystem.clockHour;
    this.dayName = this.timeSystem.dayName;

    // Thu/Chi trả góp đến hạn của PSG
    this.processDueInstallments();

    this.transferSystem.recalcWeeklyWages();
    const wageM = this.finance.weeklyWages;
    const facUpkeep = this.commercialSystem?.getTotalWeeklyFacilityUpkeep() || 0;
    this.addLedger(
      `Chi trả quỹ lương tuần ${this.week} (Đội một + BHL + 12 phòng ban) & bảo trì CSVC`,
      -(wageM + facUpkeep),
      { txKey: `wk_wages_${this.seasonNum}_${this.week}`, category: 'Lương & Vận hành', counterparty: 'Nội bộ PSG' }
    );
    if (this.week % 2 === 0) {
      const jerseyRev = +(5.8 + this.president.prestige * 0.04 + ((this.commercialSystem?.commercial?.globalStores || 14) * 0.08)).toFixed(2);
      this.addLedger(
        `Doanh thu thương mại & áo đấu tuần ${this.week}`,
        jerseyRev,
        { txKey: `wk_merch_${this.seasonNum}_${this.week}`, category: 'Thương mại', counterparty: 'Hệ thống bán lẻ PSG', incomeField: 'merch' }
      );
    }

    // Tiến triển học viện & cầu thủ đang cho mượn (nhân hệ số cấp Học viện)
    const acLv = this.commercialSystem?.getFacilityLevel('youth_academy') || 3;
    const acChance = 0.18 + acLv * 0.04;
    this.academy.forEach((y) => { if (!y.promoted && Math.random() < acChance && y.ovr < y.pot) y.ovr = Math.min(y.pot, y.ovr + 1); });
    this.transferSystem.simulateLoanProgress();

    // Báo cáo chờ duyệt mới
    const deptSample = this.departments[this.week % this.departments.length];
    this.pendingReports.unshift({
      id: `rep_w${this.week}_${Date.now()}`,
      dept: deptSample.name,
      author: deptSample.head,
      title: `Đề xuất tối ưu hoạt động Tuần ${this.week} (${deptSample.name})`,
      detail: deptSample.proposal,
      cost: -1.0,
      effect: { deptId: deptSample.id, perf: 4, morale: 4 }
    });

    // Thông báo trận đấu tuần mới
    const newFx = this.getCurrentWeekFixture();
    if (newFx) {
      newFx.status = 'Hôm nay thi đấu';
      PressNewsSystem.generatePreMatchNews(this, newFx);
      this.pushPhoneMsg('Lịch Thi Đấu PSG', `⚠️ Tuần ${this.week} có trận: ${newFx.home} vs ${newFx.away}`, `Giải ${newFx.comp} (${newFx.round}). Hãy vào mục Ngày Thi Đấu để chỉ đạo trước khi qua tuần.`, true);
    }

    // Hoạt động Hệ sinh thái CLB AI Toàn cầu & Định giá Cầu thủ Hàng Tuần (CHỈ chạy đúng 1 lần khi qua tuần NEXT!)
    this.globalClubAI?.onWeeklyEcosystemTick(periodId);
    if (this.transferSystem.isWindowOpen()) {
      this.transferSystem.generateIncomingBids(1);
    }
    const valRes = this.valuationSystem?.runWeeklyValuation(periodId);
    if (valRes?.ran && valRes.report) {
      const rep = valRes.report;
      this.pushPhoneMsg(
        'Trung Tâm Định Giá Toàn Cầu',
        `📈 WEEKLY PLAYER VALUATION · Tuần ${this.week}`,
        rep.summaryText,
        false,
        { actionType: 'open_market_value', actionLabel: 'XEM CHI TIẾT', periodId }
      );
      PressNewsSystem.generateValuationMoversNews?.(this, rep);
    }

    this.rumorCrisisSystem?.generateWeeklyIntel();
    this.relationshipSystem?.onWeeklyTick();

    // Kiểm tra sự kiện chấn thương thực tế dựa trên injuryRisk & Trung tâm Y tế
    const medLv = this.commercialSystem?.getFacilityLevel('medical_lab') || 3;
    const injuryProb = Math.max(0.1, 0.34 - medLv * 0.035);
    const psgSquad = this.getPsgSquad();
    const roll = Math.random();
    if (roll < injuryProb && psgSquad.length > 0) {
      const tired = [...psgSquad].sort((a, b) => (b.health?.injuryRisk || 10) - (a.health?.injuryRisk || 10));
      const target = tired[Math.floor(Math.random() * Math.min(6, tired.length))];
      if (target && target.injuryDays === 0) {
        target.injuryDays = 14;
        if (target.health) { target.health.injuryDays = 14; target.health.injuryType = 'Căng cơ gân kheo'; }
        target.career?.injuryHistory?.unshift({ date: this.timeSystem.getDateString(), type: 'Căng cơ gân kheo', days: 14 });
        const medHead = this.staffDb.active.find((s) => s.roleKey === 'head_medical')?.name || 'Trưởng Y Tế';
        const evtText = `${target.name} bị căng cơ trong buổi tập! Trung tâm Y tế đã lập báo cáo (nghỉ 14 ngày).`;
        this.pushPhoneMsg(`${medHead} (Y Tế)`, `Báo cáo chấn thương: ${target.name}`, evtText, true);
        this.eventBus?.emit('PLAYER_INJURED', {
          playerId: target.id,
          playerName: target.name,
          days: 14,
          injuryType: 'Căng cơ gân kheo'
        }, `inj_${target.id}_w${this.week}`);
        this.incomingCall = {
          caller: `${medHead} · Trưởng Bộ Phận Y Tế`,
          summary: `${target.name} chấn thương cơ (14 ngày). Chủ tịch có duyệt phác đồ hồi phục nhanh (€0.6M → 7 ngày) không?`,
          acceptLabel: 'Duyệt hồi phục nhanh (-€0.6M)',
          rejectLabel: 'Điều trị tiêu chuẩn',
          onAccept: () => { target.injuryDays = 7; if (target.health) target.health.injuryDays = 7; this.addLedger(`Phác đồ hồi phục ${target.name}`, -0.6); },
          onReject: () => {}
        };
        if (onLivingWorldEvent) onLivingWorldEvent(evtText);
      }
    }

    TaskAssignmentSystem.advanceTasks(this, 60);
    this.generateDailyBriefing();
    this.morningNewsSystem?.generateDigest(true);
    if (!this.getNextFixture()) this.concludeSeason();
    return { blocked: false, valuationReport: valRes?.report || null };
  }

  runAutomaticMatchday(directive = 'none') {
    const fx = this.getCurrentWeekFixture() || this.getNextFixture();
    if (!fx || !this.matchdaySystem) return null;
    return this.matchdaySystem.simulateMatchComplete(fx, { directive });
  }

  // Tổng kết mùa giải hoàn chỉnh & tự động mở kỳ chuyển nhượng Mùa Hè cho mùa mới!
  concludeSeason() {
    const eos = this.tournamentSystem.resolveEndOfSeason();
    const champ = eos.ligue1Winner;
    const psgRankIdx = eos.psgRankIdx;
    const psgSquad = this.getPsgSquad();
    const topScorer = [...psgSquad].sort((a, b) => b.goals - a.goals)[0];
    const topAssister = [...psgSquad].sort((a, b) => b.assists - a.assists)[0];
    const expiringContracts = psgSquad.filter((p) => (p.contractYears || 1) <= 1).map((p) => p.name);
    const revenueNum = Math.round(760 + this.president.prestige * 1.2);
    const earnedNames = eos.earnedThisSeason.map((t) => t.competitionName);

    const summary = {
      season: this.season,
      ligue1Winner: champ,
      uclWinner: eos.uclWinner,
      topScorer: topScorer ? `${topScorer.name} (${topScorer.goals} bàn)` : 'Ousmane Dembélé',
      topAssister: topAssister ? `${topAssister.name} (${topAssister.assists} kiến tạo)` : 'Vitinha',
      psgRank: `Hạng ${psgRankIdx || 1}`,
      trophies: earnedNames.length > 0 ? earnedNames.join(', ') : (champ === 'Paris Saint-Germain' ? 'Vô địch Ligue 1' : `Hạng ${psgRankIdx || 2} Ligue 1 (0 danh hiệu)`),
      revenue: `€${revenueNum}M`,
      expiringContracts,
      earnedTrophies: eos.earnedThisSeason
    };
    this.lastSeasonSummary = summary;
    this.seasonHistory.unshift(summary);

    // Xử lý tự động các cầu thủ hết hạn cho mượn
    const loanSummary = this.transferSystem.processExpiredLoans();

    // Sang mùa giải mới
    this.seasonNum++;
    const startY = 2025 + this.seasonNum;
    this.season = `${startY}/${String((startY + 1) % 100).padStart(2, '0')}`;
    this.week = 1;

    // Đặt đồng hồ về 01/07/{startY} 09:00 để mở Kỳ Chuyển Nhượng Mùa Hè!
    this.timeSystem.setCalendarDate(startY, 7, 1, 9, 0);
    this.clockHour = this.timeSystem.clockHour;
    this.dayName = this.timeSystem.dayName;

    // Reset BXH & cập nhật tuổi + hợp đồng toàn bộ cầu thủ & nhân sự
    this.clubs.forEach((c) => { c.played = 0; c.won = 0; c.drawn = 0; c.lost = 0; c.gf = 0; c.ga = 0; c.pts = 0; });
    this.getAllPlayers().forEach((p) => {
      p.age++;
      p.goals = 0;
      p.assists = 0;
      p.apps = 0;
      p.justJoined = false;
      p.contractYears = Math.max(0, (p.contractYears || 1) - 1);
      if (p.contract) {
        p.contract.contractYears = p.contractYears;
        p.contract.renewalStatus = p.contractYears <= 1 ? 'Cần gia hạn gấp' : 'Ổn định';
      }
      if (p.career?.seasonStats) {
        p.career.seasonStats = { apps: 0, goals: 0, assists: 0, avgRating: 7.0, minutes: 0, cleanSheets: 0, yellowCards: 0 };
      }
    });
    this.staffDb.active.forEach((st) => {
      st.age++;
      st.contractYears = Math.max(1, (st.contractYears || 1) - 1);
    });
    if (this.coach && !this.coach.vacant) {
      this.coach.contractYears = Math.max(1, (this.coach.contractYears || 1) - 1);
    }

    const wonUclLast = eos.uclWinner === 'Paris Saint-Germain';
    this.fixtures = MatchCalendarSystem.buildSeasonSchedule(this.clubs, startY, {
      qualifiedSuperCup: wonUclLast,
      qualifiedClubWorldCup: wonUclLast || (this.seasonNum % 2 === 1)
    });
    this.matchdaySystem?.resetForNewSeason();
    this.tournamentSystem.resetSeasonState();
    this.addLedger(
      `Tiền thưởng kết thúc mùa ${summary.season} & bản quyền truyền hình`,
      85.0,
      { txKey: `eos_tv_prize_${summary.season}`, category: 'Tiền thưởng & TV', counterparty: 'LFP / UEFA', incomeField: 'prize' }
    );
    this.globalClubAI?.onSeasonEnd(eos);
    this.valuationSystem?.onSeasonRollover();
    this.relationshipSystem?.onSeasonEndEvaluation?.(summary);
    this.finance.periodReports.seasonIn = 0;
    this.finance.periodReports.seasonOut = 0;

    // Tự động mở kỳ chuyển nhượng Mùa Hè mới (cấu hình động theo năm startY)
    this.transferSystem.openWindow('summer', startY);
    this.generateDailyBriefing();

    return { summary, loanSummary };
  }

  // ==================== XUẤT / NHẬP TOÀN BỘ TRẠNG THÁI SAVE/LOAD ====================

  exportFullState(playerPos = null) {
    return {
      version: 2,
      president: this.president,
      season: this.season,
      seasonNum: this.seasonNum,
      week: this.week,
      dayNum: this.dayNum,
      dayName: this.dayName,
      clockHour: this.clockHour,
      activeKit: this.activeKit,
      coach: this.coach,
      finance: this.finance,
      departments: this.departments,
      npcs: this.npcs,
      players: this.players,
      academy: this.academy,
      clubs: this.clubs,
      fixtures: this.fixtures,
      pendingReports: this.pendingReports,
      dailyBriefings: this.dailyBriefings,
      meetingMinutes: this.meetingMinutes,
      phoneInbox: this.phoneInbox,
      socialFeed: this.socialFeed,
      seasonHistory: this.seasonHistory,
      dialogueLogs: this.dialogueLogs,
      transferLogs: this.transferLogs,
      loseStreak: this.loseStreak,
      headToHead: this.headToHead,
      assignedTasks: this.assignedTasks,
      newsArchive: this.newsArchive,
      matchReports: this.matchReports,
      lastMatchResult: this.lastMatchResult,
      lastSeasonSummary: this.lastSeasonSummary,
      latestTrophyBroadcast: this.latestTrophyBroadcast,
      staffDb: this.staffDb,
      brandMetrics: this.brandMetrics,
      formationState: this.formationSystem.exportState(),
      transferState: this.transferSystem.exportState(),
      transferConsultationState: this.transferConsultationSystem.exportState(),
      trainingState: this.trainingSystem.exportState(),
      timeState: this.timeSystem.exportState(),
      signingEventState: this.signingEventSystem.exportState(),
      trophyState: this.trophySystem.exportState(),
      tournamentState: this.tournamentSystem.exportState(),
      eventBusState: this.eventBus.exportState(),
      reputationState: this.reputationSystem.exportState(),
      commercialState: this.commercialSystem.exportState(),
      rumorCrisisState: this.rumorCrisisSystem.exportState(),
      morningNewsState: this.morningNewsSystem.exportState(),
      televisionState: this.televisionSystem.exportState(),
      relationshipState: this.relationshipSystem.exportState(),
      matchdayState: this.matchdaySystem?.exportState?.() || null,
      valuationState: this.valuationSystem?.exportState?.() || null,
      globalClubAIState: this.globalClubAI?.exportState?.() || null,
      uiPrefs: this.uiPrefs || null,
      playerPos
    };
  }

  importFullState(snap) {
    if (!snap) return;
    const directKeys = [
      'president', 'season', 'seasonNum', 'week', 'dayNum', 'dayName', 'clockHour', 'activeKit',
      'coach', 'finance', 'departments', 'npcs', 'clubs', 'fixtures',
      'pendingReports', 'dailyBriefings', 'meetingMinutes', 'phoneInbox', 'socialFeed',
      'seasonHistory', 'dialogueLogs', 'transferLogs', 'loseStreak', 'headToHead',
      'assignedTasks', 'newsArchive', 'matchReports', 'lastMatchResult', 'lastSeasonSummary',
      'latestTrophyBroadcast', 'brandMetrics'
    ];
    directKeys.forEach((k) => {
      if (snap[k] !== undefined) this[k] = snap[k];
    });
    if (!['home', 'away', 'third'].includes(this.activeKit)) {
      this.activeKit = 'home';
    }

    if (Array.isArray(snap.players)) {
      this.players = snap.players.map((p, idx) => enrichPlayerProfile(p, idx, false));
    }
    if (Array.isArray(snap.academy)) {
      this.academy = snap.academy.map((y, idx) => enrichPlayerProfile(y, idx, true));
    }
    if (snap.staffDb) this.staffDb = snap.staffDb;
    if (snap.timeState) {
      this.timeSystem.importState(snap.timeState);
      this.clockHour = this.timeSystem.clockHour;
      this.dayName = this.timeSystem.dayName;
    }
    if (snap.formationState) this.formationSystem.importState(snap.formationState);
    if (snap.transferState) this.transferSystem.importState(snap.transferState);
    if (snap.transferConsultationState) this.transferConsultationSystem?.importState(snap.transferConsultationState);
    if (snap.trainingState) this.trainingSystem.importState(snap.trainingState);
    MediaReputationSystem.ensureBrandMetrics(this);
    if (snap.signingEventState) this.signingEventSystem.importState(snap.signingEventState);
    if (snap.trophyState) this.trophySystem.importState(snap.trophyState);
    if (snap.tournamentState) this.tournamentSystem.importState(snap.tournamentState);
    if (snap.eventBusState) this.eventBus.importState(snap.eventBusState);
    if (snap.reputationState) this.reputationSystem.importState(snap.reputationState);
    else this.reputationSystem.syncFromLegacyIfNeeded();
    if (snap.commercialState) this.commercialSystem.importState(snap.commercialState);
    if (snap.rumorCrisisState) this.rumorCrisisSystem.importState(snap.rumorCrisisState);
    if (snap.morningNewsState) this.morningNewsSystem.importState(snap.morningNewsState);
    else this.morningNewsSystem.generateDigest(true);
    if (snap.televisionState) this.televisionSystem.importState(snap.televisionState);
    if (snap.relationshipState) this.relationshipSystem.importState(snap.relationshipState);
    if (this.matchdaySystem) {
      if (snap.matchdayState) this.matchdaySystem.importState(snap.matchdayState);
      else this.matchdaySystem.syncScheduleFromState();
    }

    // Khôi phục định giá & AI CLB toàn cầu mà TUYỆT ĐỐI KHÔNG kích hoạt tính lại tuần khi Load!
    this.ensureFinanceIntegrity();
    this.globalClubAI?.importState(snap.globalClubAIState || null);
    this.valuationSystem?.importState(snap.valuationState || null);

    if (snap.uiPrefs) this.uiPrefs = snap.uiPrefs;

    this.notifyStaffChanged();
    this.notifySquadChanged();
  }
}
