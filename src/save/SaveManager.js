// src/save/SaveManager.js
// Hệ thống lưu game nhiều ô bằng IndexedDB (tự động fallback sang LocalStorage khi chạy trong sandbox),
// sao chép sâu an toàn (JSON clone) để đảm bảo lưu đầy đủ đa mùa giải: cầu thủ, nhân sự, HLV, BHL, đội hình, chuyển nhượng, huấn luyện, thời gian & tài chính.
export class SaveManager {
  constructor() {
    this.dbName = 'PSG_President_Sim_3D_DB';
    this.storeName = 'saves';
    this.settingsKey = 'psg_president_3d_settings';
    this.autoSaveKey = 'psg_president_3d_autosave';
    this.autoSaveSlot = 'autosave';
  }

  openDB() {
    return new Promise((resolve, reject) => {
      if (typeof window === 'undefined' || !window.indexedDB) return reject(new Error('No IndexedDB'));
      try {
        const req = window.indexedDB.open(this.dbName, 1);
        req.onupgradeneeded = () => {
          const db = req.result;
          if (!db.objectStoreNames.contains(this.storeName)) {
            db.createObjectStore(this.storeName, { keyPath: 'slot' });
          }
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      } catch (e) {
        reject(e);
      }
    });
  }

  _buildPayload(slotId, stateSnapshot, cloneData = true) {
    const cleanData = cloneData ? JSON.parse(JSON.stringify(stateSnapshot)) : stateSnapshot;
    const coachName = cleanData.coach?.name || 'HLV PSG';
    const squadCnt = (cleanData.players || []).filter((p) => p.club === 'Paris Saint-Germain' && p.squadLevel !== 'Cho mượn').length;
    return {
      slot: slotId,
      savedAt: new Date().toLocaleString('vi-VN'),
      savedAtMs: Date.now(),
      summary: `Mùa ${cleanData.season} · T${cleanData.week} · HLV ${coachName} · ${squadCnt} CT · €${(cleanData.finance?.budget || 0).toFixed(1)}M`,
      data: cleanData
    };
  }

  saveAutoSync(stateSnapshot) {
    if (!stateSnapshot || typeof localStorage === 'undefined') return { ok: false };
    try {
      const payload = this._buildPayload(this.autoSaveSlot, stateSnapshot, false);
      localStorage.setItem(this.autoSaveKey, JSON.stringify(payload));
      return { ok: true, mode: 'LocalStorage', payload };
    } catch (err) {
      return { ok: false, error: String(err) };
    }
  }

  async saveAuto(stateSnapshot) {
    const syncRes = this.saveAutoSync(stateSnapshot);
    const idbRes = await this.saveSlot(this.autoSaveSlot, stateSnapshot);
    return syncRes.ok ? syncRes : idbRes;
  }

  loadAutoSync() {
    if (typeof localStorage === 'undefined') return null;
    try {
      const raw = localStorage.getItem(this.autoSaveKey);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      return parsed && parsed.data ? parsed : null;
    } catch (_) {
      return null;
    }
  }

  async loadAuto() {
    const syncRec = this.loadAutoSync();
    const idbRec = await this.loadSlot(this.autoSaveSlot);
    if (syncRec && idbRec) {
      return (idbRec.savedAtMs || 0) > (syncRec.savedAtMs || 0) ? idbRec : syncRec;
    }
    return syncRec || idbRec || null;
  }

  async clearAutoSave() {
    try {
      if (typeof localStorage !== 'undefined') localStorage.removeItem(this.autoSaveKey);
    } catch (_) {}
    try {
      const db = await this.openDB();
      await new Promise((res, rej) => {
        const tx = db.transaction(this.storeName, 'readwrite');
        tx.objectStore(this.storeName).delete(this.autoSaveSlot);
        tx.oncomplete = res;
        tx.onerror = () => rej(tx.error);
      });
    } catch (_) {}
  }

  async saveSlot(slotId, stateSnapshot) {
    const payload = this._buildPayload(slotId, stateSnapshot, true);
    try {
      const db = await this.openDB();
      await new Promise((res, rej) => {
        const tx = db.transaction(this.storeName, 'readwrite');
        tx.objectStore(this.storeName).put(payload);
        tx.oncomplete = res;
        tx.onerror = () => rej(tx.error);
      });
      return { ok: true, mode: 'IndexedDB', payload };
    } catch (_) {
      try {
        localStorage.setItem(`psg_save_${slotId}`, JSON.stringify(payload));
        return { ok: true, mode: 'LocalStorage', payload };
      } catch (err) {
        return { ok: false, error: String(err) };
      }
    }
  }

  async loadSlot(slotId) {
    try {
      const db = await this.openDB();
      const rec = await new Promise((res, rej) => {
        const tx = db.transaction(this.storeName, 'readonly');
        const req = tx.objectStore(this.storeName).get(slotId);
        req.onsuccess = () => res(req.result || null);
        req.onerror = () => rej(req.error);
      });
      if (rec) return rec;
    } catch (_) {}
    try {
      const raw = localStorage.getItem(`psg_save_${slotId}`);
      return raw ? JSON.parse(raw) : null;
    } catch (_) {
      return null;
    }
  }

  async listSlots() {
    const slots = [];
    for (const id of ['slot_1', 'slot_2', 'slot_3']) {
      const rec = await this.loadSlot(id);
      slots.push({ id, rec });
    }
    return slots;
  }

  saveSettings(settings) {
    try {
      const current = this.loadSettings();
      const merged = { ...current, ...(settings || {}) };
      localStorage.setItem(this.settingsKey, JSON.stringify(merged));
    } catch (_) {}
  }

  loadSettings() {
    try {
      const raw = localStorage.getItem(this.settingsKey);
      return raw ? { quality: 'Medium', muted: false, ...(JSON.parse(raw) || {}) } : { quality: 'Medium', muted: false };
    } catch (_) {
      return { quality: 'Medium', muted: false };
    }
  }
}
