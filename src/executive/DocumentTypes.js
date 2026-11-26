// src/executive/DocumentTypes.js
// Định nghĩa chuẩn dữ liệu cho Hệ thống Văn bản Giấy, Khay KHẨN, Quyết định Chủ tịch & Thực thi Nhiệm vụ PSG

export const DOC_CATEGORY = {
  TRANSFER: 'transfer',       // 1. Hồ sơ Chuyển nhượng
  HR: 'hr',                   // 2. Hồ sơ Nhân sự
  FINANCE: 'finance',         // 3. Hồ sơ Tài chính
  COACHING: 'coaching',       // 4. Hồ sơ Ban huấn luyện
  EXECUTIVE: 'executive',     // 5. Hồ sơ Quyết định Chủ tịch
  COMMERCIAL: 'commercial'    // 6. Hồ sơ Đối tác & Thương mại
};

export const DOC_STACK_META = [
  {
    category: DOC_CATEGORY.TRANSFER,
    interactId: 'doc_stack_transfer',
    label: 'Hồ sơ Chuyển nhượng',
    shortCode: 'CN',
    icon: '🤝',
    colorHex: '#1d4ed8',
    colorInt: 0x1d4ed8,
    accentHex: '#60a5fa',
    dept: 'Phòng Chuyển nhượng & Tuyển trạch',
    wing: 'right',
    deskOffset: { x: 0.92, z: -0.36, rotY: 0.06 }
  },
  {
    category: DOC_CATEGORY.HR,
    interactId: 'doc_stack_hr',
    label: 'Hồ sơ Nhân sự',
    shortCode: 'NS',
    icon: '👥',
    colorHex: '#7c3aed',
    colorInt: 0x7c3aed,
    accentHex: '#c4b5fd',
    dept: 'Phòng Nhân sự & Quản trị Cầu thủ',
    wing: 'left',
    deskOffset: { x: -0.94, z: 0.40, rotY: -0.07 }
  },
  {
    category: DOC_CATEGORY.FINANCE,
    interactId: 'doc_stack_finance',
    label: 'Hồ sơ Tài chính',
    shortCode: 'TC',
    icon: '💶',
    colorHex: '#ca8a04',
    colorInt: 0xca8a04,
    accentHex: '#fde047',
    dept: 'Ban Tài chính & Kiểm toán FFP',
    wing: 'right',
    deskOffset: { x: 1.34, z: -0.36, rotY: -0.05 }
  },
  {
    category: DOC_CATEGORY.COACHING,
    interactId: 'doc_stack_coaching',
    label: 'Hồ sơ Ban huấn luyện',
    shortCode: 'BHL',
    icon: '👔',
    colorHex: '#059669',
    colorInt: 0x059669,
    accentHex: '#6ee7b7',
    dept: 'Ban Huấn luyện & Y tế Thể thao',
    wing: 'left',
    deskOffset: { x: -0.94, z: 0.04, rotY: 0.04 }
  },
  {
    category: DOC_CATEGORY.EXECUTIVE,
    interactId: 'doc_stack_executive',
    label: 'Quyết định Chủ tịch',
    shortCode: 'QĐ',
    icon: '🏛️',
    colorHex: '#334155',
    colorInt: 0x1e293b,
    accentHex: '#d4af37',
    dept: 'Văn phòng Chủ tịch & Pháp chế',
    wing: 'right',
    deskOffset: { x: 0.92, z: 0.34, rotY: 0.04 }
  },
  {
    category: DOC_CATEGORY.COMMERCIAL,
    interactId: 'doc_stack_commercial',
    label: 'Đối tác & Thương mại',
    shortCode: 'TM',
    icon: '🏅',
    colorHex: '#be185d',
    colorInt: 0xbe185d,
    accentHex: '#f9a8d4',
    dept: 'Thương mại, Tài trợ & Truyền thông',
    wing: 'left',
    deskOffset: { x: -1.38, z: 0.32, rotY: 0.10 }
  }
];

export const URGENT_TRAY_META = {
  interactId: 'doc_tray_urgent',
  label: 'KHAY KHẨN CẤP · ƯU TIÊN CHỦ TỊCH',
  shortLabel: 'URGENT',
  icon: '🚨',
  colorHex: '#dc2626',
  colorInt: 0x991b1b,
  goldHex: '#d4af37',
  deskOffset: { x: -0.94, z: -0.34, rotY: -0.04 }
};

export const DOC_STATUS = {
  NEW: 'NEW',
  PENDING: 'PENDING',
  UNDER_REVIEW: 'UNDER_REVIEW',
  WAITING_INFORMATION: 'WAITING_INFORMATION',
  APPROVED: 'APPROVED',
  REJECTED: 'REJECTED',
  REVISION_REQUIRED: 'REVISION_REQUIRED',
  COMPLETED: 'COMPLETED',
  EXPIRED: 'EXPIRED',
  ARCHIVED: 'ARCHIVED'
};

export const DOC_STATUS_LABELS = {
  NEW: 'Mới trình',
  PENDING: 'Chờ Chủ tịch duyệt',
  UNDER_REVIEW: 'Đang xem xét',
  WAITING_INFORMATION: 'Chờ bổ sung thông tin',
  APPROVED: 'Đã phê duyệt (Đang triển khai)',
  REJECTED: 'Đã từ chối',
  REVISION_REQUIRED: 'Yêu cầu chỉnh sửa',
  COMPLETED: 'Hoàn tất thực thi',
  EXPIRED: 'Hết hiệu lực',
  ARCHIVED: 'Đã lưu trữ'
};

export const DOC_PRIORITY = {
  URGENT: 'URGENT',
  HIGH: 'HIGH',
  MEDIUM: 'MEDIUM',
  LOW: 'LOW'
};

export const PRIORITY_WEIGHT = {
  URGENT: 4,
  HIGH: 3,
  MEDIUM: 2,
  LOW: 1
};

export const PRIORITY_LABELS = {
  URGENT: 'KHẨN CẤP',
  HIGH: 'CAO',
  MEDIUM: 'TRUNG BÌNH',
  LOW: 'THẤP'
};

export const TASK_STATUS = {
  APPROVED: 'APPROVED',
  ASSIGNED: 'ASSIGNED',
  IN_PROGRESS: 'IN_PROGRESS',
  WAITING_RESPONSE: 'WAITING_RESPONSE',
  BLOCKED: 'BLOCKED',
  PAUSED: 'PAUSED',
  COMPLETED: 'COMPLETED',
  FAILED: 'FAILED',
  CANCELLED: 'CANCELLED'
};

export const TASK_STATUS_LABELS = {
  APPROVED: 'Đã phê duyệt',
  ASSIGNED: 'Đã giao phụ trách',
  IN_PROGRESS: 'Đang thực hiện',
  WAITING_RESPONSE: 'Chờ phản hồi đối tác',
  BLOCKED: 'Đang vướng mắc',
  PAUSED: 'Tạm dừng theo lệnh',
  COMPLETED: 'Đã hoàn thành',
  FAILED: 'Thất bại',
  CANCELLED: 'Đã hủy'
};

export const DELEGATION_MODE = {
  DIRECT_CONTROL: 'DIRECT_CONTROL',
  DELEGATE: 'DELEGATE',
  SUPERVISE: 'SUPERVISE',
  APPROVAL_REQUIRED: 'APPROVAL_REQUIRED'
};

export const DELEGATION_MODE_LABELS = {
  DIRECT_CONTROL: 'Trực tiếp điều hành',
  DELEGATE: 'Ủy quyền toàn phần',
  SUPERVISE: 'Giám sát tiến độ',
  APPROVAL_REQUIRED: 'Cần Chủ tịch duyệt bước chốt'
};

export const EXEC_ACTIONS = {
  APPROVE: 'APPROVE',
  REJECT: 'REJECT',
  SIGN: 'SIGN',
  REQUEST_REVISION: 'REQUEST_REVISION',
  REQUEST_INFORMATION: 'REQUEST_INFORMATION',
  FORWARD: 'FORWARD',
  ASSIGN_TASK: 'ASSIGN_TASK',
  ADD_INSTRUCTION: 'ADD_INSTRUCTION',
  CLOSE: 'CLOSE'
};

// Bản đồ quyền hạn & trách nhiệm mặc định theo vai trò NPC
export const ROLE_RESPONSIBILITY_MAP = {
  ceo: {
    npcId: 'npc_ceo',
    roleKey: 'ceo',
    title: 'Tổng Giám Đốc (CEO)',
    dept: 'Ban Điều Hành',
    authorityScope: ['executive', 'finance', 'commercial', 'hr'],
    canSignSmallUnderM: 8,
    maxConcurrentTasks: 4
  },
  vp: {
    npcId: 'npc_vp',
    roleKey: 'vp',
    title: 'Phó Chủ Tịch Điều Hành',
    dept: 'Ban Điều Hành',
    authorityScope: ['executive', 'commercial', 'hr'],
    canSignSmallUnderM: 6,
    maxConcurrentTasks: 3
  },
  sporting_director: {
    npcId: 'npc_sporting',
    roleKey: 'sporting_director',
    title: 'Giám Đốc Thể Thao',
    dept: 'Phòng Chuyển Nhượng & Thể Thao',
    authorityScope: ['transfer', 'coaching', 'hr'],
    canSignSmallUnderM: 12,
    maxConcurrentTasks: 4
  },
  head_coach: {
    npcId: 'npc_coach',
    roleKey: 'head_coach',
    title: 'HLV Trưởng',
    dept: 'Ban Huấn Luyện',
    authorityScope: ['coaching'],
    canSignSmallUnderM: 1,
    maxConcurrentTasks: 3
  },
  cfo: {
    npcId: 'npc_cfo',
    roleKey: 'cfo',
    title: 'Giám Đốc Tài Chính (CFO)',
    dept: 'Phòng Tài Chính',
    authorityScope: ['finance', 'commercial'],
    canSignSmallUnderM: 5,
    maxConcurrentTasks: 4
  },
  transfers: {
    npcId: 'npc_tr1',
    roleKey: 'transfers',
    title: 'Trưởng Phòng Chuyển Nhượng',
    dept: 'Phòng Chuyển Nhượng',
    authorityScope: ['transfer'],
    canSignSmallUnderM: 4,
    maxConcurrentTasks: 3
  },
  scouting: {
    npcId: 'npc_scout',
    roleKey: 'scouting',
    title: 'Giám Đốc Tuyển Trạch',
    dept: 'Phòng Tuyển Trạch',
    authorityScope: ['transfer'],
    canSignSmallUnderM: 2,
    maxConcurrentTasks: 3
  },
  hr: {
    npcId: 'npc_hr',
    roleKey: 'hr',
    title: 'Giám Đốc Nhân Sự (HR)',
    dept: 'Phòng Nhân Sự',
    authorityScope: ['hr', 'coaching'],
    canSignSmallUnderM: 2,
    maxConcurrentTasks: 3
  },
  media: {
    npcId: 'npc_media',
    roleKey: 'media',
    title: 'Giám Đốc Truyền Thông',
    dept: 'Phòng Truyền Thông & Báo Chí',
    authorityScope: ['executive', 'commercial'],
    canSignSmallUnderM: 2,
    maxConcurrentTasks: 3
  },
  marketing: {
    npcId: 'npc_mkt',
    roleKey: 'marketing',
    title: 'Giám Đốc Thương Mại & Tài Trợ',
    dept: 'Phòng Marketing & Thương Mại',
    authorityScope: ['commercial', 'finance'],
    canSignSmallUnderM: 4,
    maxConcurrentTasks: 3
  },
  legal: {
    npcId: 'npc_legal',
    roleKey: 'legal',
    title: 'Trưởng Phòng Pháp Chế',
    dept: 'Phòng Pháp Chế',
    authorityScope: ['transfer', 'commercial', 'hr', 'executive'],
    canSignSmallUnderM: 2,
    maxConcurrentTasks: 3
  },
  head_medical: {
    npcId: 'npc_med',
    roleKey: 'head_medical',
    title: 'Trưởng Bộ Phận Y Tế',
    dept: 'Trung Tâm Y Tế PSG',
    authorityScope: ['coaching', 'hr'],
    canSignSmallUnderM: 2,
    maxConcurrentTasks: 3
  },
  facilities: {
    npcId: 'npc_fac',
    roleKey: 'facilities',
    title: 'Giám Đốc Cơ Sở Vật Chất',
    dept: 'Quản Lý Cơ Sở Vật Chất',
    authorityScope: ['finance', 'commercial', 'executive'],
    canSignSmallUnderM: 3,
    maxConcurrentTasks: 3
  },
  academy_director: {
    npcId: 'npc_acad',
    roleKey: 'academy_director',
    title: 'Giám Đốc Học Viện PSG',
    dept: 'Học Viện Bóng Đá',
    authorityScope: ['hr', 'coaching'],
    canSignSmallUnderM: 2,
    maxConcurrentTasks: 3
  }
};

export function isActivePendingDocStatus(status) {
  return (
    status === DOC_STATUS.NEW ||
    status === DOC_STATUS.PENDING ||
    status === DOC_STATUS.UNDER_REVIEW ||
    status === DOC_STATUS.WAITING_INFORMATION ||
    status === DOC_STATUS.REVISION_REQUIRED
  );
}

export function isTerminalDocStatus(status) {
  return (
    status === DOC_STATUS.COMPLETED ||
    status === DOC_STATUS.REJECTED ||
    status === DOC_STATUS.EXPIRED ||
    status === DOC_STATUS.ARCHIVED
  );
}

// Quy tắc chặt chẽ quyết định một văn bản có đủ điều kiện vào khay ĐỎ URGENT hay không
export function qualifiesForUrgentTray(doc) {
  if (!doc) return false;
  if (!isActivePendingDocStatus(doc.status)) return false;
  if (doc.priority === DOC_PRIORITY.URGENT) return true;
  if (doc.isEscalated || doc.hasDeadlineWarning) return true;
  if (Number.isFinite(doc.daysUntilDeadline) && doc.daysUntilDeadline <= 2) return true;
  if (Math.abs(Number(doc.financialImpactM || 0)) >= 25) return true;
  return false;
}

// Sắp xếp khay KHẨN: độ khẩn -> sát hạn nhất -> hệ quả lớn nhất -> mới nhất
export function compareUrgentPriority(a, b) {
  const pw = (PRIORITY_WEIGHT[b.priority] || 1) - (PRIORITY_WEIGHT[a.priority] || 1);
  if (pw !== 0) return pw;
  const da = Number.isFinite(a.daysUntilDeadline) ? a.daysUntilDeadline : 99;
  const db = Number.isFinite(b.daysUntilDeadline) ? b.daysUntilDeadline : 99;
  if (da !== db) return da - db;
  const ia = Math.abs(Number(a.financialImpactM || 0)) + Number(a.impactScore || 0);
  const ib = Math.abs(Number(b.financialImpactM || 0)) + Number(b.impactScore || 0);
  if (ib !== ia) return ib - ia;
  return (b.createdSeq || 0) - (a.createdSeq || 0);
}
