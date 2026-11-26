// src/animations/AnimationSystem.js
// Hệ thống hoạt ảnh khớp nối đầy đủ cho cầu thủ, ban huấn luyện & nhân viên 3D:
// Hỗ trợ crossfade mượt theo hàm mũ độc lập FPS, tiếp đất chuẩn sải chân (chống trượt/bay chân) và LOD hoạt ảnh.

const TWO_PI_HUNDRED = Math.PI * 200;

const FAST_STATES = new Set(['kick', 'pass', 'tackle', 'dive_gk']);
const LOCOMOTION_STATES = new Set(['walk', 'run', 'train', 'turn', 'gym_treadmill', 'gym_bike']);

function damp(current, target, f) {
  return current + (target - current) * f;
}

export class AnimationSystem {
  constructor() {
    // Reusable target pose struct (zero per-frame GC allocations)
    this._target = {
      pelvisY: 0.92,
      pelvisRotX: 0,
      pelvisRotZ: 0,
      pelvisRotY: 0,
      torsoRotX: 0,
      torsoRotY: 0,
      headRotY: 0,
      headRotX: 0,
      lHipX: 0,
      rHipX: 0,
      lKneeX: 0,
      rKneeX: 0,
      lShX: 0,
      rShX: 0,
      lShZ: -0.04,
      rShZ: 0.04,
      lElbX: -0.08,
      rElbX: -0.08
    };
  }

  _resetTarget(basePelvisY) {
    const p = this._target;
    p.pelvisY = basePelvisY;
    p.pelvisRotX = 0;
    p.pelvisRotZ = 0;
    p.pelvisRotY = 0;
    p.torsoRotX = 0;
    p.torsoRotY = 0;
    p.headRotY = 0;
    p.headRotX = 0;
    p.lHipX = 0;
    p.rHipX = 0;
    p.lKneeX = 0;
    p.rKneeX = 0;
    p.lShX = 0;
    p.rShX = 0;
    p.lShZ = -0.04;
    p.rShZ = 0.04;
    p.lElbX = -0.08;
    p.rElbX = -0.08;
    return p;
  }

  updateRig(meshRoot, state, dt, speedFactor = 1.0, lod = 0) {
    const rig = meshRoot?.userData?.rig;
    if (!rig) return;

    const prevState = rig._prevState;
    const stateChanged = prevState !== state;

    // Luôn cập nhật rig.state đồng bộ để NpcSystem / kiểm thử nhận trạng thái tức thời
    rig.state = state;

    // Ẩn chi tiết mặt nhỏ (mắt, lông mày, mũi) ở LOD 2 xa để tiết kiệm 5 draw calls / NPC
    if (rig.faceDetailGroup) {
      rig.faceDetailGroup.visible = lod < 2;
    }

    const safeDt = dt > 0 ? Math.min(dt, 0.25) : 0;

    // Animation LOD throttling khi caller gọi liên tục mỗi frame (không double-skip nếu NpcSystem đã stagger dt lớn)
    let effDt = safeDt;
    if (!stateChanged && lod >= 1) {
      if (lod === 1 && safeDt < 0.026) {
        rig._lodAccumDt = (rig._lodAccumDt || 0) + safeDt;
        if (rig._lodAccumDt < 0.032) return;
        effDt = rig._lodAccumDt;
        rig._lodAccumDt = 0;
      } else if (lod >= 2 && safeDt < 0.06) {
        rig._lodAccumDt = (rig._lodAccumDt || 0) + safeDt;
        if (rig._lodAccumDt < 0.085) return;
        effDt = rig._lodAccumDt;
        rig._lodAccumDt = 0;
      } else {
        rig._lodAccumDt = 0;
      }
    } else {
      rig._lodAccumDt = 0;
    }

    // Theo dõi chuyển đổi trạng thái để crossfade mượt không giật khớp
    if (stateChanged) {
      rig._prevState = state;
      rig._blendTime = 0;
      if (FAST_STATES.has(state)) {
        rig._blendDuration = 0.12;
      } else if (LOCOMOTION_STATES.has(state)) {
        rig._blendDuration = 0.18;
      } else {
        rig._blendDuration = 0.24;
      }
      if (state === 'dive_gk') {
        rig._diveSide = Math.sin(rig.animPhase || 0) >= 0 ? 1 : -1;
      }
    }

    const clampedSpeed = Math.max(0.15, Math.min(2.0, Number.isFinite(speedFactor) ? speedFactor : 1.0));
    const rate =
      state === 'run' || state === 'gym_treadmill' ? 11.4
      : state === 'walk' ? 7.2
      : state === 'train' || state === 'gym_bike' ? 9.6
      : state === 'turn' ? 6.0
      : state === 'celebrate' ? 6.4
      : state === 'stretch' || state === 'gym_weights' ? 4.2
      : state === 'eat' ? 3.8
      : 3.2;

    const phaseMult = (state === 'walk' || state === 'run' || state === 'train' || state === 'gym_treadmill' || state === 'gym_bike')
      ? clampedSpeed
      : Math.max(0.5, clampedSpeed);
    rig.animPhase = (rig.animPhase || 0) + effDt * rate * phaseMult;
    if (rig.animPhase > TWO_PI_HUNDRED) {
      rig.animPhase -= TWO_PI_HUNDRED;
    }

    const t = rig.animPhase;
    const basePelvisY = rig.basePelvisY ?? 0.92;
    const p = this._resetTarget(basePelvisY);

    if (state === 'kick' || state === 'pass') {
      const power = state === 'kick' ? 1.24 : 0.76;
      const swing = Math.sin(t * 1.4) * 0.12;
      p.pelvisY = basePelvisY - 0.04;
      p.torsoRotX = -0.15;
      p.torsoRotY = state === 'kick' ? -0.22 : -0.12;
      p.rHipX = -power + swing;
      p.rKneeX = 0.25;
      p.lHipX = 0.28;
      p.lKneeX = 0.15;
      p.lShX = -0.65;
      p.rShX = 0.55;
      p.lShZ = -0.14;
      p.rShZ = 0.14;
      p.lElbX = -0.4;
      p.rElbX = -0.4;
    } else if (state === 'dive_gk') {
      // Thủ môn bay người cản phá (cố định hướng bay mỗi lần đổ người, không lật trái/phải giữa không trung)
      const side = rig._diveSide || 1;
      p.pelvisY = 0.45;
      p.pelvisRotZ = side * 1.15;
      p.torsoRotX = 0.08;
      p.lShX = -2.55;
      p.rShX = -2.55;
      p.lShZ = -0.12;
      p.rShZ = 0.12;
      p.lElbX = -0.15;
      p.rElbX = -0.15;
      p.lHipX = 0.22;
      p.rHipX = -0.18;
      p.lKneeX = 0.18;
      p.rKneeX = 0.18;
      p.headRotY = side * 0.18;
    } else if (state === 'stretch') {
      // Khởi động / giãn cơ thể lực
      const s = Math.abs(Math.sin(t));
      p.pelvisY = basePelvisY - s * 0.16;
      p.torsoRotX = 0.25 + Math.sin(t) * 0.18;
      p.lHipX = -0.25 * s;
      p.rHipX = -0.25 * s;
      p.lKneeX = 0.48 * s;
      p.rKneeX = 0.48 * s;
      p.lShX = -1.6 + Math.sin(t) * 0.7;
      p.rShX = -1.6 + Math.sin(t) * 0.7;
      p.lShZ = -0.08;
      p.rShZ = 0.08;
      p.lElbX = -0.2;
      p.rElbX = -0.2;
    } else if (state === 'tackle') {
      p.pelvisY = 0.42;
      p.torsoRotX = -0.58;
      p.torsoRotY = 0.14;
      p.rHipX = -1.25;
      p.rKneeX = 0.12;
      p.lHipX = -0.65;
      p.lKneeX = 1.35;
      p.lShX = 0.65;
      p.rShX = -0.5;
      p.lShZ = -0.14;
      p.rShZ = 0.14;
      p.lElbX = -0.35;
      p.rElbX = -0.35;
    } else if (state === 'throw_in') {
      p.pelvisY = basePelvisY - 0.015;
      p.torsoRotX = -0.18 + Math.sin(t * 2) * 0.15;
      p.lHipX = -0.15;
      p.rHipX = 0.22;
      p.lKneeX = 0.1;
      p.rKneeX = 0.15;
      p.lShX = -2.75;
      p.rShX = -2.75;
      p.lShZ = -0.06;
      p.rShZ = 0.06;
      p.lElbX = -0.35;
      p.rElbX = -0.35;
    } else if (state === 'clipboard' || state === 'tablet' || state === 'notes') {
      // Cầm bảng chiến thuật / sử dụng máy tính bảng / ghi chép kết quả
      p.torsoRotX = 0.06;
      p.lShX = -0.68;
      p.lElbX = -0.95;
      p.rShX = -0.64 + Math.sin(t * 2.1) * 0.14;
      p.rElbX = -0.92 + Math.cos(t * 2.1) * 0.12;
      p.headRotY = Math.sin(t * 0.55) * 0.25;
      p.headRotX = 0.12;
    } else if (state === 'observe') {
      // Đứng quan sát tập luyện (tay khoanh nhẹ, đầu quét theo diễn biến sân)
      p.torsoRotX = 0.02;
      p.lShX = -0.35;
      p.rShX = -0.35;
      p.lElbX = -1.05;
      p.rElbX = -1.05;
      p.headRotY = Math.sin(t * 0.65) * 0.48;
    } else if (state === 'supervise' || state === 'gesture' || state === 'instruct') {
      // HLV chỉ đạo / ra hiệu / hướng dẫn cầu thủ
      p.torsoRotX = 0.04;
      p.torsoRotY = Math.sin(t * 0.8) * 0.08;
      p.rShX = -0.95 + Math.sin(t * 1.6) * 0.52;
      p.rShZ = 0.08;
      p.rElbX = -0.35;
      p.lShX = state === 'instruct' ? -0.65 + Math.cos(t * 1.5) * 0.35 : -0.25;
      p.lShZ = -0.06;
      p.lElbX = -0.5;
      p.headRotY = Math.sin(t * 0.75) * 0.38;
    } else if (state === 'walk' || state === 'run' || state === 'train') {
      const baseAmp = state === 'run' ? 0.72 : state === 'train' ? 0.58 : 0.46;
      const amp = baseAmp * Math.min(1.15, 0.45 + 0.55 * clampedSpeed);
      const armAmp = amp * 0.85;
      const sinT = Math.sin(t);
      const cosT = Math.cos(t);
      const swing = sinT * amp;

      // Sửa nhịp nhún hông đúng sinh học: hạ thấp khi bước tách chân (|sinT| lớn), nâng về đỉnh khi chân trụ thẳng (sinT ≈ 0)
      const legDrop = (1 - Math.cos(swing)) * 0.44;
      const flightLift = state === 'run' ? Math.max(0, Math.cos(t * 2)) * 0.018 : 0;
      p.pelvisY = basePelvisY - legDrop + flightLift;
      p.pelvisRotY = sinT * (state === 'run' ? 0.09 : 0.055);
      p.torsoRotX = state === 'run' ? 0.14 : state === 'train' ? 0.08 : 0.04;
      p.torsoRotY = -sinT * (state === 'run' ? 0.13 : 0.075);

      p.lHipX = swing;
      p.rHipX = -swing;
      p.lKneeX = Math.max(0, -cosT * amp * 0.92);
      p.rKneeX = Math.max(0, cosT * amp * 0.92);

      p.lShX = -sinT * armAmp;
      p.rShX = sinT * armAmp;
      p.lShZ = -0.055;
      p.rShZ = 0.055;
      p.lElbX = -0.32 - Math.max(0, sinT * 0.32);
      p.rElbX = -0.32 - Math.max(0, -sinT * 0.32);
      p.headRotY = 0;
    } else if (state === 'turn') {
      // Xoay người tại chỗ mượt mà với nhịp nhún chân nhẹ
      const sinT = Math.sin(t);
      p.pelvisY = basePelvisY - 0.015;
      p.pelvisRotY = sinT * 0.1;
      p.torsoRotY = sinT * 0.14;
      p.lHipX = sinT * 0.16;
      p.rHipX = -sinT * 0.16;
      p.lKneeX = Math.max(0, -Math.cos(t) * 0.22);
      p.rKneeX = Math.max(0, Math.cos(t) * 0.22);
      p.lShX = -sinT * 0.15;
      p.rShX = sinT * 0.15;
      p.lElbX = -0.22;
      p.rElbX = -0.22;
      p.headRotY = sinT * 0.16;
    } else if (state === 'celebrate') {
      // Ăn mừng bàn thắng / lễ ký kết thành công
      const jump = Math.max(0, Math.sin(t)) * 0.07;
      p.pelvisY = basePelvisY + jump;
      p.torsoRotX = -0.06 + Math.sin(t * 2) * 0.04;
      p.lKneeX = jump > 0.01 ? 0.16 : 0.04;
      p.rKneeX = jump > 0.01 ? 0.16 : 0.04;
      p.lShX = -2.55 + Math.sin(t * 2) * 0.22;
      p.rShX = -2.55 + Math.cos(t * 2) * 0.22;
      p.lShZ = -0.18;
      p.rShZ = 0.18;
      p.lElbX = -0.24;
      p.rElbX = -0.24;
      p.headRotX = -0.14;
      p.headRotY = Math.sin(t) * 0.2;
    } else if (state === 'sign_contract') {
      // Ngồi ký hợp đồng: hơi cúi người, tay phải đưa bút ký mượt trên giấy
      p.pelvisY = 0.56;
      p.torsoRotX = 0.16;
      p.lHipX = -1.48;
      p.rHipX = -1.48;
      p.lKneeX = 1.48;
      p.rKneeX = 1.48;
      p.lShX = -0.78;
      p.lElbX = -0.82;
      p.rShX = -0.85 + Math.sin(t * 2.8) * 0.12;
      p.rElbX = -0.65 + Math.cos(t * 3.1) * 0.15;
      p.headRotY = 0.08;
      p.headRotX = 0.12;
    } else if (state === 'handshake') {
      // Bắt tay chính thức: đứng thẳng, đưa tay phải ra bắt tay nhịp nhàng
      p.torsoRotX = 0.05;
      p.rShX = -1.05 + Math.sin(t * 3.2) * 0.14;
      p.rElbX = -0.45;
      p.lShX = -0.1;
      p.lElbX = -0.2;
    } else if (state === 'hold_jersey') {
      // Cầm áo đấu PSG giơ lên chụp ảnh ra mắt (reset hoàn toàn khớp gối về 0!)
      p.torsoRotX = -0.02;
      p.lShX = -1.32;
      p.rShX = -1.32;
      p.lShZ = -0.06;
      p.rShZ = 0.06;
      p.lElbX = -0.35;
      p.rElbX = -0.35;
      p.headRotY = Math.sin(t * 0.6) * 0.18;
    } else if (state === 'take_photo' || state === 'film_camera') {
      // Nhiếp ảnh gia chụp ảnh / Quay phim ghi hình (reset khớp gối chuẩn đứng vững!)
      p.pelvisY = basePelvisY - (state === 'take_photo' ? 0.05 : 0);
      p.torsoRotX = 0.08;
      p.lHipX = -0.08;
      p.rHipX = 0.08;
      p.lKneeX = state === 'take_photo' ? 0.14 : 0.04;
      p.rKneeX = state === 'take_photo' ? 0.10 : 0.04;
      p.lShX = -1.25;
      p.rShX = -1.25;
      p.lElbX = -1.25;
      p.rElbX = -1.25;
      p.headRotY = Math.sin(t * 0.5) * 0.25;
    } else if (state === 'raise_hand') {
      // Phóng viên ngồi giơ tay đặt câu hỏi trong phòng họp báo
      p.pelvisY = 0.56;
      p.torsoRotX = 0.02;
      p.lHipX = -1.48;
      p.rHipX = -1.48;
      p.lKneeX = 1.48;
      p.rKneeX = 1.48;
      p.rShX = -2.65 + Math.sin(t * 2.0) * 0.12;
      p.rShZ = 0.08;
      p.rElbX = -0.18;
      p.lShX = -0.5;
      p.lElbX = -0.8;
    } else if (state === 'sit' || state === 'work_pc' || state === 'watch_tv' || state === 'use_desk') {
      const isDesk = state === 'work_pc' || state === 'use_desk';
      p.pelvisY = 0.56;
      p.torsoRotX = isDesk ? 0.08 : (state === 'watch_tv' ? -0.06 : 0.02);
      p.lHipX = -1.48;
      p.rHipX = -1.48;
      p.lKneeX = 1.48;
      p.rKneeX = 1.48;
      if (isDesk) {
        p.lShX = -0.75 + Math.sin(t * 2.2) * 0.06;
        p.rShX = -0.75 + Math.cos(t * 2.4) * 0.06;
        p.lElbX = -0.82;
        p.rElbX = -0.82;
      } else if (state === 'watch_tv') {
        p.lShX = -0.35;
        p.rShX = -0.45;
        p.lElbX = -0.85;
        p.rElbX = -0.85;
        p.headRotX = -0.05;
      } else {
        p.lShX = -0.45;
        p.rShX = -0.45;
        p.lElbX = -0.7;
        p.rElbX = -0.7;
      }
      p.headRotY = Math.sin(t * 0.45) * 0.14;
    } else if (state === 'sleep' || state === 'lie_rest') {
      // Nằm ngủ / nằm nghỉ phục hồi trên giường
      const breath = Math.sin(t * 0.9) * 0.02;
      p.pelvisY = 0.42;
      p.pelvisRotX = -1.42;
      p.torsoRotX = breath;
      p.headRotX = 0.12;
      p.headRotY = state === 'sleep' ? 0.08 : Math.sin(t * 0.4) * 0.16;
      p.lHipX = 0.04;
      p.rHipX = -0.04;
      p.lKneeX = 0.08;
      p.rKneeX = 0.10;
      p.lShX = -0.12;
      p.rShX = -0.14;
      p.lElbX = -0.35;
      p.rElbX = -0.35;
    } else if (state === 'eat') {
      // Ăn uống / bổ sung dinh dưỡng
      const lift = Math.max(0, Math.sin(t * 2.1));
      p.pelvisY = basePelvisY;
      p.torsoRotX = 0.05;
      p.rShX = -0.55 - lift * 0.48;
      p.rElbX = -0.95 - lift * 0.38;
      p.lShX = -0.25;
      p.lElbX = -0.55;
      p.headRotX = 0.10 - lift * 0.06;
      p.headRotY = Math.sin(t * 0.7) * 0.12;
    } else if (state === 'gym_treadmill') {
      // Chạy bộ trên máy chạy bộ
      const sinT = Math.sin(t);
      const cosT = Math.cos(t);
      const swing = sinT * 0.62;
      p.pelvisY = basePelvisY - (1 - Math.cos(swing)) * 0.36;
      p.torsoRotX = 0.12;
      p.lHipX = swing;
      p.rHipX = -swing;
      p.lKneeX = Math.max(0, -cosT * 0.68);
      p.rKneeX = Math.max(0, cosT * 0.68);
      p.lShX = -sinT * 0.50;
      p.rShX = sinT * 0.50;
      p.lElbX = -0.65;
      p.rElbX = -0.65;
    } else if (state === 'gym_bike') {
      // Đạp xe thể lực tại chỗ
      const sinT = Math.sin(t);
      const cosT = Math.cos(t);
      p.pelvisY = 0.60;
      p.torsoRotX = 0.24;
      p.lHipX = -1.05 + sinT * 0.42;
      p.rHipX = -1.05 - sinT * 0.42;
      p.lKneeX = 1.05 - cosT * 0.35;
      p.rKneeX = 1.05 + cosT * 0.35;
      p.lShX = -0.82;
      p.rShX = -0.82;
      p.lElbX = -0.45;
      p.rElbX = -0.45;
    } else if (state === 'gym_weights') {
      // Tập tạ / squat tăng sức mạnh
      const rep = (Math.sin(t * 1.4) + 1) * 0.5;
      p.pelvisY = basePelvisY - rep * 0.26;
      p.torsoRotX = 0.16 * rep;
      p.lHipX = -0.58 * rep;
      p.rHipX = -0.58 * rep;
      p.lKneeX = 0.92 * rep;
      p.rKneeX = 0.92 * rep;
      p.lShX = -1.05 - rep * 0.55;
      p.rShX = -1.05 - rep * 0.55;
      p.lShZ = -0.18;
      p.rShZ = 0.18;
      p.lElbX = -0.85;
      p.rElbX = -0.85;
    } else if (state === 'talk') {
      p.torsoRotX = 0.02;
      p.torsoRotY = Math.sin(t * 0.7) * 0.06;
      p.lShX = -0.35 + Math.sin(t * 1.4) * 0.25;
      p.rShX = -0.42 + Math.cos(t * 1.6) * 0.30;
      p.lElbX = -0.75;
      p.rElbX = -0.85;
      p.headRotY = Math.sin(t * 0.9) * 0.18;
    } else if (state === 'pull_curtain') {
      // Đưa tay lên ngang tầm thanh/vải rèm và kéo mượt sang hai bên
      const sweep = Math.sin(t * 2.2);
      p.pelvisY = basePelvisY;
      p.torsoRotX = 0.04;
      p.torsoRotY = sweep * 0.09;
      p.rShX = -1.52 + Math.sin(t * 3.0) * 0.14;
      p.rShZ = 0.16 + sweep * 0.30;
      p.rElbX = -0.38;
      p.lShX = -1.24 + Math.cos(t * 2.8) * 0.12;
      p.lShZ = -0.14 - sweep * 0.22;
      p.lElbX = -0.46;
      p.headRotX = -0.08;
      p.headRotY = sweep * 0.14;
    } else if (state === 'open_door' || state === 'close_door') {
      // Đưa tay phải ra nắm tay nắm cửa, xoay nhẹ vai đẩy/kéo mở hoặc đóng cửa phòng
      const dir = state === 'close_door' ? -1 : 1;
      const push = Math.sin(t * 4.2) * dir;
      p.pelvisY = basePelvisY;
      p.torsoRotX = 0.06;
      p.torsoRotY = (-0.10 + push * 0.08) * dir;
      p.rShX = -1.08 + push * 0.18;
      p.rShZ = 0.08;
      p.rElbX = -0.45 - push * 0.12;
      p.lShX = -0.10;
      p.lElbX = -0.22;
      p.headRotX = 0.04;
      p.headRotY = -0.06 * dir;
    } else {
      // idle / stand: giữ chân chạm sàn tuyệt đối (nhịp thở nhẹ trên thân trên, không ấn giày xuyên sàn)
      p.pelvisY = basePelvisY;
      p.torsoRotX = Math.sin(t * 0.85) * 0.018;
      p.lShX = Math.sin(t * 0.85) * 0.035;
      p.rShX = -Math.sin(t * 0.85) * 0.035;
      p.lElbX = -0.1;
      p.rElbX = -0.1;
      p.headRotY = Math.sin(t * 0.5) * 0.08;
    }

    // Tính hệ số crossfade hàm mũ độc lập FPS (tăng dần mượt khi vừa đổi state)
    const blendDur = rig._blendDuration || 0.22;
    rig._blendTime = Math.min(blendDur, (rig._blendTime || 0) + effDt);
    const blendNorm = blendDur > 0 ? rig._blendTime / blendDur : 1;
    const smoothP = blendNorm * blendNorm * (3 - 2 * blendNorm);

    const isLocomotion = state === 'walk' || state === 'run' || state === 'train' || state === 'gym_treadmill' || state === 'gym_bike';
    const isFast = FAST_STATES.has(state);
    const baseLambda = isFast ? 15 : isLocomotion ? 12 : 10;
    const limbLambda = isLocomotion ? (10 + 14 * smoothP) : isFast ? (13 + 7 * smoothP) : (8 + 5 * smoothP);

    const bodyF = effDt > 0 ? 1 - Math.exp(-baseLambda * effDt) : 0;
    const limbF = effDt > 0 ? 1 - Math.exp(-limbLambda * effDt) : 0;

    // Áp dụng pose mượt cho toàn bộ khớp (không có bất kỳ phép gán cứng gây snap nào!)
    rig.pelvis.position.y = damp(rig.pelvis.position.y, p.pelvisY, bodyF);
    rig.pelvis.rotation.x = damp(rig.pelvis.rotation.x || 0, p.pelvisRotX, bodyF);
    rig.pelvis.rotation.z = damp(rig.pelvis.rotation.z || 0, p.pelvisRotZ, bodyF);
    rig.pelvis.rotation.y = damp(rig.pelvis.rotation.y || 0, p.pelvisRotY, bodyF);

    rig.torso.rotation.x = damp(rig.torso.rotation.x || 0, p.torsoRotX, bodyF);
    rig.torso.rotation.y = damp(rig.torso.rotation.y || 0, p.torsoRotY, bodyF);

    rig.headGroup.rotation.y = damp(rig.headGroup.rotation.y || 0, p.headRotY, bodyF);
    rig.headGroup.rotation.x = damp(rig.headGroup.rotation.x || 0, p.headRotX, bodyF);

    rig.leftLeg.hip.rotation.x = damp(rig.leftLeg.hip.rotation.x || 0, p.lHipX, limbF);
    rig.rightLeg.hip.rotation.x = damp(rig.rightLeg.hip.rotation.x || 0, p.rHipX, limbF);
    rig.leftLeg.knee.rotation.x = damp(rig.leftLeg.knee.rotation.x || 0, p.lKneeX, limbF);
    rig.rightLeg.knee.rotation.x = damp(rig.rightLeg.knee.rotation.x || 0, p.rKneeX, limbF);

    rig.leftArm.shoulder.rotation.x = damp(rig.leftArm.shoulder.rotation.x || 0, p.lShX, limbF);
    rig.rightArm.shoulder.rotation.x = damp(rig.rightArm.shoulder.rotation.x || 0, p.rShX, limbF);
    rig.leftArm.shoulder.rotation.z = damp(rig.leftArm.shoulder.rotation.z || 0, p.lShZ, bodyF);
    rig.rightArm.shoulder.rotation.z = damp(rig.rightArm.shoulder.rotation.z || 0, p.rShZ, bodyF);
    rig.leftArm.elbow.rotation.x = damp(rig.leftArm.elbow.rotation.x || 0, p.lElbX, limbF);
    rig.rightArm.elbow.rotation.x = damp(rig.rightArm.elbow.rotation.x || 0, p.rElbX, limbF);
  }
}
