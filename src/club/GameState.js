// src/club/GameState.js
// Trung tâm dữ liệu duy nhất (Single Source of Truth) của Football Club President Simulator 3D — Paris Saint-Germain
// Tích hợp đồng bộ: PlayerDatabase, StaffDatabase, ClubDatabase, SquadFormationSystem, TransferSystem, ManagerManagementSystem,
// CoachingStaffSystem, TrainingSystem, PlayerDevelopmentSystem, GameTimeSystem, Finance, Media & SaveLoad.
import { createInitialDepartments, createInitialNpcProfiles } from '../departments/DepartmentData.js';
import { generateRealPlayers200, generateAcademy100, enrichPlayerProfile } from '../players/PlayerDatabase.js';
import { createWorldClubs, simulateLigue1Round } from '../leagues/LeagueSystem.js';
import { MatchCalendarSystem, MatchSimulationEngine } from '../matches/MatchSimulationEngine.js';
import { PressNewsSystem } from '../media/PressNewsSystem.js';
import { SquadFormationSystem } from '../squad/SquadFormationSystem.js';
import { RivalrySystem } from '../matches/MatchSystems.js';
import { TaskAssignmentSystem } from '../dialogue/DialogueSystem.js';
import { createInitialStaffDatabase, STAFF_ROLE_META } from '../staff/StaffDatabase.js';
import { ManagerManagementSystem } from '../staff/ManagerManagementSystem.js';
import { CoachingStaffSystem } from '../staff/CoachingStaffSystem.js';
import { TransferSystem } from '../transfers/TransferSystem.js';
import { PlayerDevelopmentSystem } from '../training/PlayerDevelopmentSystem.js';
import { TrainingSystem } from '../training/TrainingSystem.js';
import { GameTimeSystem } from '../time/GameTimeSystem.js';
import { SigningEventSystem, createMediaNpcProfiles } from '../media/SigningEventSystem.js';
import { MediaReputationSystem } from '../media/MediaNewsGenerator.js';
import { TrophySystem } from '../trophies/TrophySystem.js';
import { TournamentSystem } from '../leagues/TournamentSystem.js';

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
      transferBudget: 165.0,
      weeklyWages: 4.85,
      debt: 0.0,
      ffpStatus: 'An toàn (72% doanh thu)',
      income: { tv: 112, tickets: 68, sponsors: 145, merch: 54, prize: 42, sales: 0 },
      expenses: { playerWages: 215, staffWages: 28, coachWage: 10, transfers: 0, ops: 38, maintenance: 16 },
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

    // Khởi tạo toàn bộ các hệ thống con kết nối chung Single Source of Truth
    this.formationSystem = new SquadFormationSystem(this);
    this.managerSystem = new ManagerManagementSystem(this);
    this.coachingSystem = new CoachingStaffSystem(this);
    this.developmentSystem = new PlayerDevelopmentSystem(this);
    this.trainingSystem = new TrainingSystem(this);
    this.transferSystem = new TransferSystem(this);
    this.trophySystem = new TrophySystem(this);
    this.tournamentSystem = new TournamentSystem(this, this.trophySystem);
    this.brandMetrics = null;
    MediaReputationSystem.ensureBrandMetrics(this);
    this.signingEventSystem = new SigningEventSystem(this);

    // Đăng ký sự kiện đồng hồ toàn game
    this.timeSystem.on('onDayChange', (evt) => this.handleNewGameDay(evt));

    this.generateDailyBriefing();
    if (this.fixtures[0]) PressNewsSystem.generatePreMatchNews(this, this.fixtures[0]);
    PressNewsSystem.createArticle(this, {
      scenarioId: 26, category: 'Nội bộ', tagType: 'Chính thức',
      title: 'Chủ tịch Phạm Minh Chiêu chính thức mở màn mùa giải mới cùng Paris Saint-Germain',
      summary: 'Ban lãnh đạo PSG khẳng định quyết tâm bảo vệ ngôi vương Ligue 1 và chinh phục UEFA Champions League.',
      body: `Tại trụ sở hiện đại Campus PSG, Chủ tịch Phạm Minh Chiêu đã có buổi làm việc đầu mùa với 12 phòng ban và HLV trưởng ${this.coach.name}, đặt mục tiêu kết hợp giữa bản sắc bóng đá tấn công và sự phát triển bền vững của Học viện.`,
      imageType: 'boardroom', imageCaption: 'BAN LÃNH ĐẠO PSG · MÙA GIẢI MỚI', relatedEntity: 'Chủ tịch Phạm Minh Chiêu', fanTone: 'win'
    });
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
    this.clockHour = this.timeSystem.clockHour;
    this.dayName = this.timeSystem.dayName;
  }

  // Sự kiện tự động khi bước sang ngày mới theo đồng hồ GameTimeSystem (không trùng lặp)
  handleNewGameDay(evt) {
    const daysPassed = Math.max(1, evt.daysPassed || 1);
    this.dayNum += daysPassed;
    this.dayName = this.timeSystem.dayName;

    // 1. Hồi phục thể lực & tiến triển chấn thương theo số ngày trôi qua
    const rehabMult = this.coachingSystem?.getTrainingQualityMultipliers()?.rehab || 1.0;
    this.getPsgSquad().forEach((p) => {
      if (p.injuryDays > 0) {
        const heal = daysPassed * (rehabMult >= 1.1 ? 1.25 : 1);
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

    // 3. Tiến độ nhiệm vụ & Bản tin ngày
    TaskAssignmentSystem.advanceTasks(this, 35 * daysPassed);
    this.generateDailyBriefing();

    if (this._onNewDayToast) {
      this._onNewDayToast(`🌅 Ngày mới: ${this.timeSystem.dayNameUpper} (${evt.date}) — Bản tin tình hình & lịch huấn luyện đã cập nhật!`);
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

  addLedger(desc, amount) {
    this.finance.budget = +(this.finance.budget + amount).toFixed(2);
    if (amount < 0) this.finance.transferBudget = Math.max(0, +(this.finance.transferBudget + amount * 0.6).toFixed(2));
    else this.finance.transferBudget = +(this.finance.transferBudget + amount * 0.5).toFixed(2);
    this.finance.ledger.unshift({ date: `${this.timeSystem ? this.timeSystem.getDateString() : `Tuần ${this.week}`}`, desc, amount: +amount.toFixed(2) });
    if (this.finance.ledger.length > 40) this.finance.ledger.pop();
  }

  pushSocial(author, handle, text, sentiment = 'neutral') {
    this.socialFeed.unshift({ id: `soc_${Date.now()}_${Math.random()}`, author, handle, text, likes: 1800 + Math.floor(Math.random() * 14000), sentiment });
    if (this.socialFeed.length > 25) this.socialFeed.pop();
  }

  pushPhoneMsg(from, title, body, urgent = false) {
    this.phoneInbox.unshift({ id: `msg_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`, from, title, body, urgent, read: false });
    if (this.phoneInbox.length > 30) this.phoneInbox.pop();
  }

  advanceWeek(onLivingWorldEvent) {
    const pendingFx = this.getCurrentWeekFixture();
    if (pendingFx) {
      return { blocked: true, fixture: pendingFx };
    }

    this.week++;
    // Tua tiến đúng 7 ngày trên đồng hồ duy nhất GameTimeSystem & đặt về 09:00 sáng
    this.timeSystem.advanceGameDays(7);
    this.timeSystem.setTimeOfDay(9, 0);
    this.clockHour = this.timeSystem.clockHour;
    this.dayName = this.timeSystem.dayName;

    this.transferSystem.recalcWeeklyWages();
    const wageM = this.finance.weeklyWages;
    this.addLedger(`Chi trả quỹ lương tuần ${this.week} (Đội một + BHL + 12 phòng ban)`, -wageM);
    if (this.week % 2 === 0) {
      this.addLedger(`Doanh thu thương mại & áo đấu tuần ${this.week}`, +(5.8 + this.president.prestige * 0.04).toFixed(2));
    }

    // Tiến triển học viện & cầu thủ đang cho mượn
    this.academy.forEach((y) => { if (!y.promoted && Math.random() < 0.22 && y.ovr < y.pot) y.ovr = Math.min(y.pot, y.ovr + 1); });
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

    // Hoạt động AI thị trường chuyển nhượng (nếu đang mở cửa sổ)
    if (this.transferSystem.isWindowOpen()) {
      this.transferSystem.runAiTransferMarketCycle(3);
      this.transferSystem.generateIncomingBids(1);
    }

    // Kiểm tra sự kiện chấn thương thực tế dựa trên injuryRisk
    const psgSquad = this.getPsgSquad();
    const roll = Math.random();
    if (roll < 0.28 && psgSquad.length > 0) {
      const tired = [...psgSquad].sort((a, b) => (b.health?.injuryRisk || 10) - (a.health?.injuryRisk || 10));
      const target = tired[Math.floor(Math.random() * Math.min(6, tired.length))];
      if (target && target.injuryDays === 0) {
        target.injuryDays = 14;
        if (target.health) { target.health.injuryDays = 14; target.health.injuryType = 'Căng cơ gân kheo'; }
        target.career?.injuryHistory?.unshift({ date: this.timeSystem.getDateString(), type: 'Căng cơ gân kheo', days: 14 });
        const medHead = this.staffDb.active.find((s) => s.roleKey === 'head_medical')?.name || 'Trưởng Y Tế';
        const evtText = `${target.name} bị căng cơ trong buổi tập! Trung tâm Y tế đã lập báo cáo (nghỉ 14 ngày).`;
        this.pushPhoneMsg(`${medHead} (Y Tế)`, `Báo cáo chấn thương: ${target.name}`, evtText, true);
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
    if (!this.getNextFixture()) this.concludeSeason();
    return { blocked: false };
  }

  runAutomaticMatchday(directive = 'none') {
    const fx = this.getCurrentWeekFixture() || this.getNextFixture();
    if (!fx) return null;
    const homeClub = this.clubs.find((c) => c.name === fx.home) || this.clubs[0];
    const awayClub = this.clubs.find((c) => c.name === fx.away) || this.clubs[1];
    const res = MatchSimulationEngine.simulateMatch(fx, homeClub, awayClub, this, directive);

    fx.played = true;
    fx.status = 'Đã kết thúc';
    fx.homeGoals = res.homeGoals;
    fx.awayGoals = res.awayGoals;
    this.lastMatchResult = res;
    this.matchReports.unshift(res.coachReport);
    if (this.matchReports.length > 30) this.matchReports.pop();

    simulateLigue1Round(this.clubs, fx, res.homeGoals, res.awayGoals);
    if (!this.headToHead) this.headToHead = {};
    RivalrySystem.recordResult(this.headToHead, fx.home, fx.away, res.homeGoals, res.awayGoals, fx.comp, this.season, res.goalEvents.map((e) => `${e.scorer} (${e.minute}')`));

    res.ratings.forEach((r) => {
      const pl = this.getPlayerById(r.id);
      if (!pl) return;
      pl.apps++;
      pl.goals += r.goals;
      pl.assists += r.assists;
      if (pl.career) {
        pl.career.totalApps = (pl.career.totalApps || 0) + 1;
        pl.career.totalGoals = (pl.career.totalGoals || 0) + r.goals;
        pl.career.totalAssists = (pl.career.totalAssists || 0) + r.assists;
        if (pl.career.seasonStats) {
          pl.career.seasonStats.apps = pl.apps;
          pl.career.seasonStats.goals = pl.goals;
          pl.career.seasonStats.assists = pl.assists;
          pl.career.seasonStats.minutes = (pl.career.seasonStats.minutes || 0) + 86;
          pl.career.seasonStats.avgRating = +(((pl.career.seasonStats.avgRating * (pl.apps - 1)) + r.rating) / pl.apps).toFixed(2);
        }
        if (Array.isArray(pl.career.recentForm5)) {
          pl.career.recentForm5.unshift(r.rating);
          if (pl.career.recentForm5.length > 5) pl.career.recentForm5.pop();
        }
      }
      if (pl.health) {
        pl.health.fatigue = Math.min(100, pl.health.fatigue + 16);
        pl.health.fitness = Math.max(45, pl.health.fitness - 11);
      }
      if (r.rating >= 7.8) {
        pl.form = Math.min(99, pl.form + 3);
        pl.morale = Math.min(100, pl.morale + 4);
        pl.value = +(pl.value + 1).toFixed(1);
      } else if (r.rating <= 5.9) {
        pl.form = Math.max(48, pl.form - 2);
        pl.morale = Math.max(38, pl.morale - 3);
      }
      if (pl.psychology) pl.psychology.morale = pl.morale;
    });

    if (res.psgIsHome) this.addLedger(`Doanh thu bán vé & VIP Parc des Princes (${fx.comp})`, 4.2);
    if (res.psgWon) {
      this.loseStreak = 0;
      this.president.fanSupport = Math.min(100, this.president.fanSupport + 3);
      this.president.boardTrust = Math.min(100, this.president.boardTrust + 2);
      this.president.prestige = Math.min(100, this.president.prestige + 1);
      if (fx.comp === 'UEFA Champions League') this.addLedger('Tiền thưởng chiến thắng UEFA Champions League', 2.8);
    } else if (!res.psgDrew) {
      this.loseStreak++;
      this.president.fanSupport = Math.max(25, this.president.fanSupport - 4);
      this.president.boardTrust = Math.max(30, this.president.boardTrust - 3);
    }

    PressNewsSystem.generatePostMatchNews(this, res);
    const tourRes = this.tournamentSystem.evaluateMatchResult(res);
    if (tourRes?.awarded && tourRes.trophy) {
      res.awardedTrophy = tourRes.trophy;
    }
    this.pushPhoneMsg(
      'Trung Tâm Thi Đấu PSG',
      `🏁 KẾT QUẢ: ${fx.home} ${res.homeGoals} - ${res.awayGoals} ${fx.away} (${fx.comp})`,
      `Cầu thủ xuất sắc nhất: ${res.motm.name} (${res.motm.rating} điểm). Báo cáo chuyên môn của HLV ${this.coach.name} đã sẵn sàng.`,
      true
    );
    this.generateDailyBriefing();
    return res;
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
    this.tournamentSystem.resetSeasonState();
    this.addLedger(`Tiền thưởng kết thúc mùa ${summary.season} & bản quyền truyền hình`, 85.0);

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
      trainingState: this.trainingSystem.exportState(),
      timeState: this.timeSystem.exportState(),
      signingEventState: this.signingEventSystem.exportState(),
      trophyState: this.trophySystem.exportState(),
      tournamentState: this.tournamentSystem.exportState(),
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
    if (snap.trainingState) this.trainingSystem.importState(snap.trainingState);
    MediaReputationSystem.ensureBrandMetrics(this);
    if (snap.signingEventState) this.signingEventSystem.importState(snap.signingEventState);
    if (snap.trophyState) this.trophySystem.importState(snap.trophyState);
    if (snap.tournamentState) this.tournamentSystem.importState(snap.tournamentState);

    this.notifyStaffChanged();
    this.notifySquadChanged();
  }
}
