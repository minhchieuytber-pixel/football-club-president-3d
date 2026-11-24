// src/camera/ThirdPersonCamera.js
// Camera góc nhìn thứ nhất (First-Person) & chuyển cảnh CCTV/Ceremony mượt mà:
// Giảm chấn hàm mũ độc lập FPS (vị trí, độ cao mắt, góc nhìn, FOV), tránh xuyên tường, 0 cấp phát Vector3 mỗi frame.

function dampFactor(lambda, dt) {
  return dt > 0 ? 1 - Math.exp(-lambda * dt) : 0;
}

function shortestAngleDiff(from, to) {
  let diff = (to - from) % (Math.PI * 2);
  if (diff > Math.PI) diff -= Math.PI * 2;
  if (diff < -Math.PI) diff += Math.PI * 2;
  return diff;
}

export class ThirdPersonCamera {
  constructor(camera) {
    this.camera = camera;
    this.yaw = Math.PI; // nhìn ra phía cửa / bàn làm việc Phòng Chủ tịch
    this.pitch = -0.06;
    this.targetYaw = this.yaw;
    this.targetPitch = this.pitch;
    this._smoothLookActive = false;

    this.eyeHeight = 1.72;
    this.targetEyeHeight = 1.72;
    this.isSeated = false;

    this.baseFov = 62;
    this.fov = 62;
    this._sprintFovOffset = 0;

    // Nhịp bước chân rất nhẹ khi đi/chạy (chỉ mang cảm giác chân thực, không gây chóng mặt)
    this._bobPhase = 0;
    this._bobAmount = 0;
    this._motionSpeedRatio = 0;
    this._isSprinting = false;

    this.currentPos = new THREE.Vector3();
    this.initialized = false;
    this.collisionResolver = null;

    // Pre-allocated scratch vectors (zero per-frame GC)
    this._desired = new THREE.Vector3();
    this._lookDir = new THREE.Vector3();
    this._lookTarget = new THREE.Vector3();

    // Smooth fixed-target camera state (CCTV & Ceremony TV angles)
    this._fixedActive = false;
    this._fixedPos = new THREE.Vector3();
    this._fixedLook = new THREE.Vector3();
  }

  setCollisionResolver(resolverFn) {
    this.collisionResolver = typeof resolverFn === 'function' ? resolverFn : null;
  }

  setSeated(isSeated) {
    this.isSeated = !!isSeated;
    this.targetEyeHeight = this.isSeated ? 1.24 : 1.72;
    if (this.isSeated) {
      this._motionSpeedRatio = 0;
      this._isSprinting = false;
    }
  }

  setMotionState(speedRatio = 0, isSprinting = false) {
    this._motionSpeedRatio = Math.max(0, Math.min(1.5, speedRatio));
    this._isSprinting = !!isSprinting;
  }

  setLookDirection(yaw, pitch = -0.05, smooth = false) {
    const clampedPitch = Math.max(-1.15, Math.min(1.15, pitch));
    if (smooth) {
      this.targetYaw = this.yaw + shortestAngleDiff(this.yaw, yaw);
      this.targetPitch = clampedPitch;
      this._smoothLookActive = true;
    } else {
      this.yaw = yaw;
      this.targetYaw = yaw;
      this.pitch = clampedPitch;
      this.targetPitch = clampedPitch;
      this._smoothLookActive = false;
    }
  }

  rotate(dx, dy) {
    this._smoothLookActive = false;
    this.targetYaw -= dx * 0.0048;
    this.targetPitch = Math.max(-1.15, Math.min(1.15, this.targetPitch - dy * 0.0042));
  }

  zoom(delta) {
    this.baseFov = Math.max(42, Math.min(76, this.baseFov + delta * 0.02));
  }

  snapTo(targetPosition, yaw = null, pitch = null) {
    this.eyeHeight = this.targetEyeHeight;
    this._bobAmount = 0;
    this._fixedActive = false;
    if (targetPosition) {
      this.currentPos.set(
        targetPosition.x,
        targetPosition.y + this.eyeHeight,
        targetPosition.z
      );
      this.initialized = true;
      this.camera.position.copy(this.currentPos);
    }
    if (yaw !== null && yaw !== undefined) {
      this.setLookDirection(yaw, pitch !== null && pitch !== undefined ? pitch : this.pitch, false);
    }
  }

  updateFixedTarget(pos, lookAt, dt, instant = false) {
    const safeDt = dt > 0 ? Math.min(dt, 0.1) : 0;

    if (!this._fixedActive || instant) {
      const distSq = this.camera.position.distanceToSquared
        ? this.camera.position.distanceToSquared(pos)
        : (
          (this.camera.position.x - pos.x) ** 2 +
          (this.camera.position.y - pos.y) ** 2 +
          (this.camera.position.z - pos.z) ** 2
        );
      // Nếu góc máy mới cách rất xa (>45m, ví dụ từ HQ sang CCTV SVĐ) -> cắt cảnh tức thời, không bay xuyên tường!
      if (instant || distSq > 2025) {
        this._fixedPos.set(pos.x, pos.y, pos.z);
        this._fixedLook.set(lookAt.x, lookAt.y, lookAt.z);
      } else {
        this._fixedPos.copy(this.camera.position);
        this._lookDir.set(
          -Math.sin(this.yaw) * Math.cos(this.pitch),
          Math.sin(this.pitch),
          -Math.cos(this.yaw) * Math.cos(this.pitch)
        );
        this._fixedLook.copy(this.camera.position).add(this._lookDir);
      }
      this._fixedActive = true;
    }

    const posF = dampFactor(7.5, safeDt);
    const lookF = dampFactor(9.5, safeDt);
    this._fixedPos.x += (pos.x - this._fixedPos.x) * posF;
    this._fixedPos.y += (pos.y - this._fixedPos.y) * posF;
    this._fixedPos.z += (pos.z - this._fixedPos.z) * posF;

    this._fixedLook.x += (lookAt.x - this._fixedLook.x) * lookF;
    this._fixedLook.y += (lookAt.y - this._fixedLook.y) * lookF;
    this._fixedLook.z += (lookAt.z - this._fixedLook.z) * lookF;

    // Reset FOV mượt về baseFov khi xem CCTV / Lễ ký kết
    const fovF = dampFactor(8, safeDt);
    this.fov += (this.baseFov - this.fov) * fovF;
    if (Math.abs(this.camera.fov - this.fov) > 0.02) {
      this.camera.fov = this.fov;
      this.camera.updateProjectionMatrix();
    }

    this.camera.position.copy(this._fixedPos);
    this.camera.lookAt(this._fixedLook);
  }

  update(targetPosition, dt) {
    const safeDt = dt > 0 ? Math.min(dt, 0.1) : 0;

    // Nếu vừa thoát CCTV/Event camera từ khoảng cách xa -> snap gọn về mắt nhân vật thay vì bay xuyên tường
    if (this._fixedActive) {
      this._fixedActive = false;
      const dx = this.camera.position.x - targetPosition.x;
      const dz = this.camera.position.z - targetPosition.z;
      if (dx * dx + dz * dz > 144) {
        this.currentPos.set(targetPosition.x, targetPosition.y + this.eyeHeight, targetPosition.z);
      } else {
        this.currentPos.copy(this.camera.position);
      }
    }

    // Giảm chấn hàm mũ độc lập FPS cho độ cao mắt & nhịp bước nhẹ
    this.eyeHeight += (this.targetEyeHeight - this.eyeHeight) * dampFactor(10, safeDt);

    const moving = !this.isSeated && this._motionSpeedRatio > 0.08;
    if (moving) {
      const freq = this._isSprinting ? 11.2 : 7.6;
      this._bobPhase = (this._bobPhase + safeDt * freq * Math.min(1.25, this._motionSpeedRatio)) % (Math.PI * 20);
    }
    const targetBob = moving ? Math.sin(this._bobPhase) * (this._isSprinting ? 0.028 : 0.016) * Math.min(1, this._motionSpeedRatio) : 0;
    this._bobAmount += (targetBob - this._bobAmount) * dampFactor(12, safeDt);

    // Giảm chấn góc nhìn (nhanh nhạy khi vuốt tay, êm ái khi tự xoay vào ghế ngồi)
    const rotLambda = this._smoothLookActive ? 10 : 32;
    const rotF = dampFactor(rotLambda, safeDt);
    const yawDiff = this.targetYaw - this.yaw;
    const pitchDiff = this.targetPitch - this.pitch;
    this.yaw += yawDiff * rotF;
    this.pitch += pitchDiff * rotF;
    if (this._smoothLookActive && Math.abs(yawDiff) < 0.008 && Math.abs(pitchDiff) < 0.008) {
      this.yaw = this.targetYaw;
      this.pitch = this.targetPitch;
      this._smoothLookActive = false;
    }

    // Giảm chấn FOV mượt (tăng nhẹ +3.2° khi chạy nước rút)
    const targetSprintFov = (moving && this._isSprinting) ? 3.2 : 0;
    this._sprintFovOffset += (targetSprintFov - this._sprintFovOffset) * dampFactor(7, safeDt);
    const desiredFov = Math.max(42, Math.min(78, this.baseFov + this._sprintFovOffset));
    this.fov += (desiredFov - this.fov) * dampFactor(10, safeDt);
    if (Math.abs(this.camera.fov - this.fov) > 0.02) {
      this.camera.fov = this.fov;
      this.camera.updateProjectionMatrix();
    }

    this._desired.set(
      targetPosition.x,
      targetPosition.y + this.eyeHeight + this._bobAmount,
      targetPosition.z
    );

    if (!this.initialized) {
      this.currentPos.copy(this._desired);
      this.initialized = true;
    } else {
      const posAlpha = dampFactor(16, safeDt);
      this.currentPos.lerp(this._desired, posAlpha);
    }

    // Chống kẹp camera vào góc tường khi di chuyển nhanh qua cửa/góc hẹp
    if (this.collisionResolver && !this.isSeated) {
      const safeCam = this.collisionResolver(this.currentPos.x, this.currentPos.z, 0.26);
      if (safeCam) {
        this.currentPos.x = safeCam.x;
        this.currentPos.z = safeCam.z;
      }
    }

    this.camera.position.copy(this.currentPos);
    this._lookDir.set(
      -Math.sin(this.yaw) * Math.cos(this.pitch),
      Math.sin(this.pitch),
      -Math.cos(this.yaw) * Math.cos(this.pitch)
    );
    this._lookTarget.copy(this.currentPos).add(this._lookDir);
    this.camera.lookAt(this._lookTarget);
  }
}
