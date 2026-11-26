// src/staff/ManagerManagementSystem.js
// Hệ thống Quản lý Nhân sự thực tế: Sa thải, Đàm phán hợp đồng, Bổ nhiệm HLV trưởng & toàn bộ chức vụ Ban lãnh đạo / Ban huấn luyện PSG.
// Đồng bộ 100%: StaffDatabase -> ClubDatabase -> DepartmentData -> CoachingStaffSystem -> NPCSystem -> Phone/Computer -> Media -> SaveLoad.
import { STAFF_ROLE_META } from './StaffDatabase.js';
import { PressNewsSystem } from '../media/PressNewsSystem.js';

export class ManagerManagementSystem {
  constructor(state) {
    this.state = state;
  }

  get db() {
    return this.state.staffDb;
  }

  getActiveByRole(roleKey) {
    return this.db.active.find((s) => s.roleKey === roleKey && s.status === 'active') || null;
  }

  getById(staffId) {
    return (
      this.db.active.find((s) => s.staffId === staffId) ||
      this.db.candidates.find((s) => s.staffId === staffId) ||
      this.db.departed.find((s) => s.staffId === staffId) ||
      null
    );
  }

  getAllManagedRoles() {
    return Object.entries(STAFF_ROLE_META).map(([roleKey, meta]) => ({
      roleKey,
      ...meta,
      current: this.getActiveByRole(roleKey)
    }));
  }

  getCandidatesForRole(roleKey) {
    const list = this.db.candidates.filter((c) => c.roleKey === roleKey && c.status === 'candidate');
    if (list.length > 0) return list;
    // Sinh ứng viên thực tế nếu chức vụ phụ đang chưa có sẵn ứng viên trong pool
    const meta = STAFF_ROLE_META[roleKey] || { title: 'Chuyên gia', dept: 'Ban Huấn Luyện', deptId: 'coaching', isCoachingStaff: true };
    const generated = [
      {
        staffId: `cand_${roleKey}_g1`,
        npcId: meta.npcId || `npc_${roleKey}`,
        roleKey,
        role: meta.title,
        dept: meta.dept,
        deptId: meta.deptId,
        isCoachingStaff: !!meta.isCoachingStaff,
        name: 'Stéphane Moulin',
        age: 48,
        nationality: 'Pháp',
        currentClub: 'Tự do',
        status: 'candidate',
        experience: 84,
        achievements: ['Kinh nghiệm dày dạn tại Ligue 1 & cúp Châu Âu'],
        tacticalStyle: 'Kỷ luật chiến thuật & tối ưu hiệu suất nhóm',
        youthDev: 84,
        dressingRoom: 85,
        reputation: 83,
        overall: 85,
        specialty: meta.duty,
        ratings: { tactics: 84, fitness: 83, technical: 84, gk: 82, analysis: 84, medical: 80, management: 84, scouting: 80 },
        personality: 'Cẩn thận',
        wage: 34,
        contractYears: 3,
        home: meta.home,
        pitchSpot: meta.pitchSpot,
        appearance: { outfit: meta.isCoachingStaff ? 'coach_psg' : 'suit_navy', skin: 0xf2c6a0, hair: 0x4a321f, hairStyle: 0 }
      },
      {
        staffId: `cand_${roleKey}_g2`,
        npcId: meta.npcId || `npc_${roleKey}`,
        roleKey,
        role: meta.title,
        dept: meta.dept,
        deptId: meta.deptId,
        isCoachingStaff: !!meta.isCoachingStaff,
        name: 'Miguel Ángel Nadal',
        age: 44,
        nationality: 'Tây Ban Nha',
        currentClub: 'Tự do',
        status: 'candidate',
        experience: 86,
        achievements: ['Chuyên gia phương pháp huấn luyện hiện đại La Liga'],
        tacticalStyle: 'Kiểm soát cường độ cao & phát triển chi tiết',
        youthDev: 86,
        dressingRoom: 84,
        reputation: 85,
        overall: 87,
        specialty: meta.duty,
        ratings: { tactics: 86, fitness: 86, technical: 87, gk: 85, analysis: 86, medical: 82, management: 84, scouting: 82 },
        personality: 'Tham vọng',
        wage: 42,
        contractYears: 3,
        home: meta.home,
        pitchSpot: meta.pitchSpot,
        appearance: { outfit: meta.isCoachingStaff ? 'coach_psg' : 'suit_navy', skin: 0xe0ac82, hair: 0x2c1d11, hairStyle: 2 }
      }
    ];
    this.db.candidates.push(...generated);
    return generated;
  }

  calculateSeverance(staff) {
    if (!staff) return 0;
    const years = Math.max(0.5, staff.contractYears || 1);
    const raw = ((staff.wage || 30) * 52 * years) / 1000;
    return +Math.max(0.5, Math.min(28, raw * 0.72)).toFixed(2);
  }

  calculateBuyout(candidate) {
    if (!candidate || !candidate.currentClub || candidate.currentClub === 'Tự do' || candidate.currentClub === 'Paris Saint-Germain') {
      return 0;
    }
    const base = candidate.roleKey === 'head_coach' ? 6.5 : 1.8;
    return +(base * (candidate.reputation / 85)).toFixed(2);
  }

  getFormattedDate() {
    if (this.state.timeSystem) return this.state.timeSystem.getDateString();
    return `Tuần ${this.state.week} · ${this.state.season}`;
  }

  // Sa thải HLV trưởng hoặc bất kỳ chức vụ nào trong hệ thống nhân sự
  fireStaff(roleKey, reason = 'Quyết định tái cơ cấu chuyên môn của Chủ tịch Phạm Minh Chiêu') {
    const staff = this.getActiveByRole(roleKey);
    if (!staff) return { ok: false, error: 'Chức vụ này hiện đang trống.' };

    const severance = this.calculateSeverance(staff);
    const dateStr = this.getFormattedDate();

    // 1. Trừ bồi thường hợp đồng
    if (severance > 0) {
      this.state.addLedger(`Bồi thường chấm dứt hợp đồng ${staff.role} ${staff.name}`, -severance);
    }

    // 2. Chuyển sang trạng thái đã rời CLB & lưu lịch sử
    staff.status = 'departed';
    staff.currentClub = 'Tự do';
    staff.departedDate = dateStr;
    staff.departureReason = reason;

    const idx = this.db.active.findIndex((s) => s.staffId === staff.staffId);
    if (idx !== -1) this.db.active.splice(idx, 1);
    this.db.departed.unshift(staff);

    this.db.history.unshift({
      id: `stf_hist_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      date: dateStr,
      action: 'Sa thải / Miễn nhiệm',
      roleKey: staff.roleKey,
      role: staff.role,
      staffId: staff.staffId,
      name: staff.name,
      reason,
      cost: severance
    });

    // 3. Cập nhật vị trí trống trên toàn bộ hệ thống dữ liệu
    this.syncRoleAcrossSystems(roleKey, null);

    // 4. Thông báo đến Ban lãnh đạo, Điện thoại & Báo chí
    this.state.pushPhoneMsg(
      'Ban Lãnh Đạo PSG',
      `⚠️ Miễn nhiệm ${staff.role}: ${staff.name}`,
      `Chủ tịch Phạm Minh Chiêu đã chấm dứt hợp đồng với ${staff.name} (${staff.role}). Khoản bồi thường: €${severance}M. Lý do: ${reason}. Vị trí hiện đang chuyển sang trạng thái ĐANG TUYỂN DỤNG.`,
      true
    );

    if (roleKey === 'head_coach') {
      PressNewsSystem.createArticle(this.state, {
        scenarioId: 40,
        category: 'Nội bộ',
        tagType: 'Nóng',
        title: `CHÍNH THỨC: PSG sa thải HLV trưởng ${staff.name}!`,
        summary: `Chủ tịch Phạm Minh Chiêu quyết định chấm dứt hợp đồng với ${staff.name} và mở tiến trình tìm kiếm thuyền trưởng mới tại Parc des Princes.`,
        body: `Paris Saint-Germain chính thức thông báo chia tay HLV trưởng ${staff.name} sau quyết định từ Chủ tịch Phạm Minh Chiêu với lý do: "${reason}". Khoản đền bù hợp đồng ước tính €${severance}M. Ghế nóng tại Parc des Princes hiện đang để trống trong khi Ban lãnh đạo mở danh sách đàm phán với các ứng viên hàng đầu châu Âu.`,
        imageType: 'boardroom',
        imageCaption: `BIẾN ĐỘNG GHẾ NÓNG · PARIS SAINT-GERMAIN`,
        relatedEntity: staff.name,
        fanTone: 'neutral'
      });
    }

    this.state.executionSystem?.handleStaffDeparted?.(roleKey, staff.name, reason);
    this.state.documentSystem?.syncFromClubState?.();
    this.state.generateDailyBriefing();
    this.state.notifyStaffChanged();
    return { ok: true, departed: staff, severance };
  }

  // Đàm phán hợp đồng với ứng viên (trả về đồng ý / đưa điều kiện mới / từ chối)
  negotiateOffer(staffId, offer) {
    const cand = this.getById(staffId);
    if (!cand) return { outcome: 'rejected', message: 'Không tìm thấy hồ sơ ứng viên.' };

    const askWage = cand.wage || 60;
    const askYears = cand.contractYears || 3;
    const offerWage = Number(offer.wage || askWage);
    const offerYears = Number(offer.contractYears || askYears);
    const buyoutFee = this.calculateBuyout(cand);

    const wageRatio = offerWage / Math.max(1, askWage);
    const yearsDiff = Math.abs(offerYears - askYears);
    const prestigeBonus = (this.state.president.prestige - 80) * 0.005;
    const score = wageRatio + prestigeBonus - yearsDiff * 0.04;

    if (buyoutFee > this.state.finance.budget) {
      return {
        outcome: 'rejected',
        message: `CLB chủ quản ${cand.currentClub} yêu cầu phí giải phóng €${buyoutFee}M vượt quá ngân sách hiện tại.`,
        buyoutFee
      };
    }

    if (score >= 0.96) {
      return {
        outcome: 'accepted',
        message: `${cand.name}: "Tôi rất vinh dự khi nhận được lời mời từ Chủ tịch Phạm Minh Chiêu. Dự án tại Paris Saint-Germain và các điều khoản hợp đồng hoàn toàn phù hợp. Tôi đồng ý gia nhập PSG!"`,
        buyoutFee,
        agreedOffer: {
          wage: offerWage,
          contractYears: offerYears,
          objectives: offer.objectives || ['Vô địch Ligue 1', 'Tiến sâu tại Champions League'],
          tacticalReq: offer.tacticalReq || cand.tacticalStyle
        }
      };
    }

    if (score >= 0.80) {
      const counterWage = Math.round(askWage * 0.98);
      const counterYears = Math.max(2, Math.min(5, askYears));
      return {
        outcome: 'counter',
        message: `${cand.name}: "Tôi rất quan tâm tới chiếc ghế tại PSG, nhưng tôi đề nghị mức lương €${counterWage}k/tuần với thời hạn ${counterYears} năm để đảm bảo sự ổn định cho dự án."`,
        buyoutFee,
        counterOffer: { wage: counterWage, contractYears: counterYears }
      };
    }

    return {
      outcome: 'rejected',
      message: `${cand.name}: "Mức đãi ngộ €${offerWage}k/tuần còn quá xa so với kỳ vọng (€${askWage}k/tuần) của tôi. Tôi buộc phải từ chối lời đề nghị này."`,
      buyoutFee
    };
  }

  // Bổ nhiệm nhân sự chính thức sau khi hai bên đạt thỏa thuận
  appointStaff(staffId, agreedOffer = {}) {
    const cand = this.getById(staffId);
    if (!cand) return { ok: false, error: 'Không tìm thấy hồ sơ ứng viên.' };

    const roleKey = cand.roleKey;
    const meta = STAFF_ROLE_META[roleKey] || {};
    const buyoutFee = this.calculateBuyout(cand);

    // Nếu vị trí vẫn còn người đương nhiệm -> miễn nhiệm trước khi bổ nhiệm người mới
    const existing = this.getActiveByRole(roleKey);
    if (existing && existing.staffId !== cand.staffId) {
      this.fireStaff(roleKey, `Thay thế bằng ${cand.name} theo quyết định của Chủ tịch`);
    }

    if (buyoutFee > 0) {
      this.state.addLedger(`Phí giải phóng hợp đồng ${cand.role} ${cand.name} từ ${cand.currentClub}`, -buyoutFee);
    }

    // Gỡ khỏi danh sách ứng viên / đã rời CLB và đưa vào đội ngũ đang hoạt động
    const cIdx = this.db.candidates.findIndex((c) => c.staffId === cand.staffId);
    if (cIdx !== -1) this.db.candidates.splice(cIdx, 1);
    const dIdx = this.db.departed.findIndex((d) => d.staffId === cand.staffId);
    if (dIdx !== -1) this.db.departed.splice(dIdx, 1);

    const dateStr = this.getFormattedDate();
    const years = Number(agreedOffer.contractYears || cand.contractYears || 3);
    const wage = Number(agreedOffer.wage || cand.wage || 60);
    const curYear = this.state.timeSystem ? this.state.timeSystem.year : (2025 + this.state.seasonNum);

    cand.status = 'active';
    cand.currentClub = 'Paris Saint-Germain';
    cand.wage = wage;
    cand.contractYears = years;
    cand.signedDate = dateStr;
    cand.expiryDate = `30/06/${curYear + years}`;
    cand.objectives = agreedOffer.objectives || ['Vô địch Ligue 1', 'Cạnh tranh UEFA Champions League'];
    cand.tacticalReq = agreedOffer.tacticalReq || cand.tacticalStyle;
    cand.npcId = meta.npcId || cand.npcId;
    cand.home = meta.home || cand.home;
    cand.pitchSpot = meta.pitchSpot !== undefined ? meta.pitchSpot : cand.pitchSpot;
    cand.isCoachingStaff = !!meta.isCoachingStaff;
    cand.morale = 92;
    cand.relation = 86;

    this.db.active.push(cand);

    this.db.history.unshift({
      id: `stf_hist_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      date: dateStr,
      action: 'Bổ nhiệm',
      roleKey: cand.roleKey,
      role: cand.role,
      staffId: cand.staffId,
      name: cand.name,
      reason: `Ký hợp đồng ${years} năm (€${wage}k/tuần) · Mục tiêu: ${(cand.objectives || []).join(', ')}`,
      cost: buyoutFee
    });

    // Đồng bộ toàn game!
    this.syncRoleAcrossSystems(roleKey, cand);

    this.state.pushPhoneMsg(
      'Phòng Nhân Sự & Ban Điều Hành PSG',
      `✅ CHÍNH THỨC BỔ NHIỆM: ${cand.name} (${cand.role})`,
      `${cand.name} đã ký hợp đồng ${years} năm (€${wage}k/tuần) và lập tức tiếp nhận văn phòng, lịch huấn luyện & nhiệm vụ tại Campus PSG.`,
      true
    );

    if (roleKey === 'head_coach') {
      PressNewsSystem.createArticle(this.state, {
        scenarioId: 41,
        category: 'Nội bộ',
        tagType: 'Chính thức',
        title: `CHÍNH THỨC: ${cand.name} trở thành HLV trưởng mới của Paris Saint-Germain!`,
        summary: `Chủ tịch Phạm Minh Chiêu hoàn tất bản hợp đồng ${years} năm với ${cand.name} theo triết lý ${cand.tacticalStyle}.`,
        body: `Paris Saint-Germain chính thức ra mắt tân HLV trưởng ${cand.name} với bản hợp đồng có thời hạn ${years} năm, mức lương €${wage}k/tuần. Tân thuyền trưởng người ${cand.nationality} đã có mặt ngay tại văn phòng Ban huấn luyện và sân tập Campus PSG để trực tiếp điều hành buổi tập của đội một.`,
        imageType: 'boardroom',
        imageCaption: `TÂN HLV TRƯỞNG PSG · ${cand.name.toUpperCase()}`,
        relatedEntity: cand.name,
        fanTone: 'win'
      });
    }

    this.state.generateDailyBriefing();
    this.state.notifyStaffChanged();

    // Tự động mở Sự kiện Công bố Chính thức cho HLV trưởng mới hoặc Giám đốc Thể thao mới!
    if (this.state.signingEventSystem && (roleKey === 'head_coach' || roleKey === 'sporting_director')) {
      this.state.signingEventSystem.scheduleOfficialEvent({
        dealVerified: true,
        dealKey: `staff_app_${roleKey}_${cand.staffId}_${this.state.season}`,
        eventType: roleKey === 'head_coach' ? 'head_coach_appointment' : 'sporting_director_appointment',
        staffId: cand.staffId,
        subjectName: cand.name,
        position: cand.role,
        ovr: cand.overall,
        fromClub: cand.currentClub || 'Tự do',
        fee: buyoutFee,
        wage,
        contractYears: years
      });
    }

    return { ok: true, appointed: cand, buyoutFee };
  }

  // Gia hạn hợp đồng cho nhân sự hiện tại
  extendStaffContract(roleKey, extraYears = 2, wageIncreasePct = 0.08) {
    const staff = this.getActiveByRole(roleKey);
    if (!staff) return { ok: false, error: 'Chức vụ đang trống.' };
    staff.contractYears += extraYears;
    staff.wage = Math.round(staff.wage * (1 + wageIncreasePct));
    staff.morale = Math.min(100, (staff.morale || 82) + 8);
    staff.relation = Math.min(100, (staff.relation || 80) + 6);
    this.syncRoleAcrossSystems(roleKey, staff);
    this.state.notifyStaffChanged();
    return { ok: true, staff };
  }

  // Đồng bộ dữ liệu chức vụ sang ClubDatabase, DepartmentData, state.coach & CoachingStaffSystem
  syncRoleAcrossSystems(roleKey, staffObj) {
    const meta = STAFF_ROLE_META[roleKey];
    if (roleKey === 'head_coach') {
      const prevCoach = this.state.coach ? { ...this.state.coach } : null;
      const psgClub = this.state.clubs?.find((c) => c.name === 'Paris Saint-Germain');
      if (staffObj) {
        this.state.coach = {
          staffId: staffObj.staffId,
          vacant: false,
          name: staffObj.name,
          nationality: staffObj.nationality,
          age: staffObj.age,
          reputation: staffObj.reputation,
          experience: staffObj.experience,
          tactics: staffObj.ratings?.tactics || 88,
          youthDev: staffObj.youthDev,
          dressingRoom: staffObj.dressingRoom,
          wage: staffObj.wage,
          contractYears: staffObj.contractYears,
          tacticalStyle: staffObj.tacticalStyle,
          formation: `${this.state.formationSystem?.formation || '4-3-3'} · ${staffObj.tacticalStyle.split('&')[0].trim()}`,
          objectives: staffObj.objectives || ['Vô địch Ligue 1', 'Tiến sâu tại UEFA Champions League']
        };
        if (psgClub) psgClub.manager = staffObj.name;
      } else {
        this.state.coach = {
          staffId: null,
          vacant: true,
          name: 'Đang tuyển dụng (Trống ghế)',
          nationality: '-',
          age: 0,
          reputation: 60,
          experience: 60,
          tactics: 68,
          youthDev: 68,
          dressingRoom: 65,
          wage: 0,
          contractYears: 0,
          tacticalStyle: 'HLV Tạm quyền điều phối cơ bản',
          formation: `${this.state.formationSystem?.formation || '4-3-3'} · Tạm quyền`,
          objectives: ['Tuyển dụng HLV trưởng chính thức']
        };
        if (psgClub) psgClub.manager = 'Đang tuyển dụng';
      }
      this.state.relationshipSystem?.onHeadCoachChanged?.(prevCoach, staffObj);
    }

    // Cập nhật Trưởng phòng ban tương ứng trong DepartmentData
    const deptMap = {
      head_coach: 'coaching',
      sporting_director: 'transfers',
      academy_director: 'academy',
      head_medical: 'medical',
      cfo: 'finance'
    };
    const deptId = deptMap[roleKey];
    if (deptId && this.state.departments) {
      const d = this.state.departments.find((x) => x.id === deptId);
      if (d) {
        d.head = staffObj ? staffObj.name : 'Đang tuyển dụng';
        d.headId = staffObj ? staffObj.npcId : null;
        if (staffObj) {
          d.performance = Math.min(100, Math.round((d.performance + (staffObj.overall || 85)) / 2));
        } else {
          d.performance = Math.max(45, d.performance - 15);
        }
      }
    }

    // Cập nhật mảng npcs trong state để đồng bộ Save/Load & Dialogue
    if (meta && this.state.npcs) {
      const npcIdx = this.state.npcs.findIndex((n) => n.id === meta.npcId);
      if (staffObj) {
        const updatedProfile = {
          id: meta.npcId,
          staffId: staffObj.staffId,
          roleKey,
          name: staffObj.name,
          role: staffObj.role,
          dept: staffObj.dept,
          age: staffObj.age,
          gender: 'Nam',
          personality: staffObj.personality,
          skill: staffObj.overall || staffObj.reputation,
          morale: staffObj.morale || 86,
          relation: staffObj.relation || 82,
          outfit: staffObj.appearance?.outfit || (meta.isCoachingStaff ? 'coach_psg' : 'suit_navy'),
          skin: staffObj.appearance?.skin || 0xf2c6a0,
          hair: staffObj.appearance?.hair || 0x2c1d11,
          hairStyle: staffObj.appearance?.hairStyle ?? 0,
          home: meta.home,
          pitchSpot: meta.pitchSpot,
          isCoachingStaff: !!meta.isCoachingStaff,
          isManagedStaff: true,
          task: staffObj.currentDuty || meta.duty
        };
        if (npcIdx !== -1) this.state.npcs[npcIdx] = updatedProfile;
        else this.state.npcs.push(updatedProfile);
      } else if (npcIdx !== -1) {
        this.state.npcs.splice(npcIdx, 1);
      }
    }
  }
}
