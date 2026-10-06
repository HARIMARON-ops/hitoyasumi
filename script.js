/* =========================================================
   ひとやすみ - メインスクリプト (完全版)
   ========================================================= */

const timer           = document.getElementById("timer");
const status          = document.getElementById("status");
const title           = document.getElementById("title");
const message         = document.getElementById("message");
const progressCircle  = document.getElementById("progressCircle");

const restButton      = document.getElementById("restButton");
const resetButton     = document.getElementById("resetButton");
const stopButton      = document.getElementById("stopButton");
const continueButton  = document.getElementById("continueButton");
const notifyToggle    = document.getElementById("notifyToggle");
const scheduleButton  = document.getElementById("scheduleButton");
const durationButtons = document.querySelectorAll(".duration-btn");

const customMinutes = document.getElementById("customMinutes");
const applyCustom   = document.getElementById("applyCustom");

const scheduleModal   = document.getElementById("scheduleModal");
const timesList       = document.getElementById("timesList");
const addTimeBtn      = document.getElementById("addTimeBtn");
const quickBtns       = document.querySelectorAll(".quick-btn");
const scheduleEnabled = document.getElementById("scheduleEnabled");
const scheduleInfo    = document.getElementById("scheduleInfo");
const scheduleSave    = document.getElementById("scheduleSave");

const alarmToggle      = document.getElementById("alarmToggle");
const alarmSettingsBtn = document.getElementById("alarmSettingsBtn");
const alarmModal       = document.getElementById("alarmModal");
const alarmList        = document.getElementById("alarmList");
const alarmVolume      = document.getElementById("alarmVolume");
const volumeValue      = document.getElementById("volumeValue");
const vibrateEnabled   = document.getElementById("vibrateEnabled");
const alarmTestBtn     = document.getElementById("alarmTestBtn");
const alarmSaveBtn     = document.getElementById("alarmSaveBtn");

const iosHint  = document.getElementById("iosHint");
const iosClose = document.getElementById("iosClose");

const CIRCUMFERENCE = 2 * Math.PI * 108;

let REST_DURATION    = 5 * 60;
let endTime          = null;
let tickId           = null;
let notifyEnabled    = false;
let alarmEnabled     = false;
let alarmVolumeValue = 0.6;
let selectedAlarm    = "wood";
let audioCtx         = null;
let wakeLock         = null;
let wakeLockRetryId  = null;
let pausedTimeLeft   = null;

if (progressCircle) progressCircle.style.strokeDasharray = CIRCUMFERENCE;

function isiOS() {
    return /iPad|iPhone|iPod/.test(navigator.userAgent) ||
           (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}
function isInStandaloneMode() {
    return window.navigator.standalone === true ||
           window.matchMedia("(display-mode: standalone)").matches;
}

/* ---------- Wake Lock ---------- */
async function requestWakeLock() {
    if (!("wakeLock" in navigator)) return;
    if (wakeLock) return;
    if (document.visibilityState !== "visible") return;
    try {
        wakeLock = await navigator.wakeLock.request("screen");
        console.log("[WakeLock] ON");
        wakeLock.addEventListener("release", () => {
            console.log("[WakeLock] 解除");
            wakeLock = null;
        });
    } catch (err) {
        if (err.name === "NotAllowedError") {
            console.log("[WakeLock] 保留");
        } else {
            console.warn("[WakeLock] 失敗:", err);
        }
        wakeLock = null;
    }
}
async function releaseWakeLock() {
    if (!wakeLock) return;
    try {
        await wakeLock.release();
        wakeLock = null;
        console.log("[WakeLock] OFF");
    } catch (err) {
        console.warn("[WakeLock] 解除失敗:", err);
        wakeLock = null;
    }
}
function startWakeLockWatchdog() {
    stopWakeLockWatchdog();
    wakeLockRetryId = setInterval(() => {
        if (tickId === null) { stopWakeLockWatchdog(); return; }
        if (wakeLock === null && document.visibilityState === "visible") {
            console.log("[WakeLock] 再取得");
            requestWakeLock();
        }
    }, 1000);
}
function stopWakeLockWatchdog() {
    if (wakeLockRetryId) { clearInterval(wakeLockRetryId); wakeLockRetryId = null; }
}

/* ---------- モーダル ---------- */
document.addEventListener("click", (e) => {
    const closeBtn = e.target.closest && e.target.closest("[data-close]");
    if (closeBtn) {
        e.preventDefault();
        e.stopPropagation();
        const targetId = closeBtn.getAttribute("data-close");
        const modal = document.getElementById(targetId);
        if (modal) modal.hidden = true;
        return;
    }
    if (e.target.classList && e.target.classList.contains("modal")) {
        e.target.hidden = true;
    }
});

/* ---------- 通知 ---------- */
async function requestNotification() {
    if (!("Notification" in window)) {
        alert("このブラウザは通知に対応していません。");
        return false;
    }
    if (isiOS() && !isInStandaloneMode()) {
        alert("iPhone で通知を使うには、まず「ホーム画面に追加」してください。");
        return false;
    }
    if (Notification.permission === "granted") return true;
    if (Notification.permission === "denied") {
        alert("通知がブロックされています。設定から許可してください。");
        return false;
    }
    const perm = await Notification.requestPermission();
    return perm === "granted";
}
async function sendNotification(t, body, options = {}) {
    if (!notifyEnabled) return;
    if (!("Notification" in window) || Notification.permission !== "granted") return;
    if (isiOS() && !isInStandaloneMode()) return;
    const opts = {
        body,
        icon: "icons/icon-192.png",
        badge: "icons/icon-192.png",
        tag: options.tag || "hitoyasumi-" + Date.now(),
        ...options,
    };
    try {
        if ("serviceWorker" in navigator && location.protocol !== "file:") {
            const reg = await navigator.serviceWorker.ready;
            await reg.showNotification(t, opts);
        } else {
            new Notification(t, opts);
        }
    } catch (err) {
        console.warn("[通知] 失敗:", err);
    }
}
notifyToggle?.addEventListener("click", async () => {
    const ok = await requestNotification();
    notifyEnabled = ok;
    notifyToggle.setAttribute("aria-pressed", String(ok));
    notifyToggle.textContent = ok ? "🔔 通知オン" : "🔔 通知を有効にする";
    localStorage.setItem("notifyEnabled", ok ? "1" : "0");
});

/* ---------- 休憩時間 ---------- */
function setDuration(seconds) {
    if (tickId !== null) return;
    REST_DURATION = seconds;
    pausedTimeLeft = null;
    updateTimer();
    const min = Math.round(seconds / 60);
    status.textContent = `${min}分間、ゆっくり休みましょう。`;
    restButton.textContent = `${min}分休む`;
    localStorage.setItem("restDuration", String(seconds));
}
durationButtons.forEach((btn) => {
    btn.addEventListener("click", () => {
        durationButtons.forEach((b) => b.classList.remove("active"));
        btn.classList.add("active");
        customMinutes.value = btn.dataset.min;
        setDuration(parseInt(btn.dataset.min, 10) * 60);
    });
});
applyCustom?.addEventListener("click", () => {
    let m = parseInt(customMinutes.value, 10);
    if (isNaN(m) || m < 1) m = 1;
    if (m > 120) m = 120;
    customMinutes.value = m;
    durationButtons.forEach((b) => b.classList.remove("active"));
    setDuration(m * 60);
});

/* ---------- タイマー表示 ---------- */
function updateTimer() {
    let remaining = REST_DURATION;
    if (endTime) {
        remaining = Math.max(0, Math.round((endTime - Date.now()) / 1000));
    } else if (pausedTimeLeft !== null) {
        remaining = pausedTimeLeft;
    }
    const m = Math.floor(remaining / 60);
    const s = remaining % 60;
    timer.textContent = String(m).padStart(2, "0") + ":" + String(s).padStart(2, "0");
    const progress = remaining / REST_DURATION;
    progressCircle.style.strokeDashoffset = CIRCUMFERENCE * (1 - progress);
}

/* ---------- 休憩開始 ---------- */
async function startRest(fromResume = false) {
    if (tickId !== null) return;
    let duration;
    if (fromResume && pausedTimeLeft !== null && pausedTimeLeft > 0) {
        duration = pausedTimeLeft;
        pausedTimeLeft = null;
    } else {
        duration = REST_DURATION;
    }
    endTime = Date.now() + duration * 1000;
    localStorage.setItem("restEndTime", endTime);
    localStorage.setItem("restDurationUsed", String(duration));

    status.textContent = "ゆっくり休みましょう。";
    restButton.disabled = true;
    restButton.hidden = false;
    resetButton.hidden = true;
    stopButton.hidden = false;
    continueButton.style.display = "none";
    document.querySelector(".timer-wrap").classList.add("pulse");

    title.textContent = "休憩中…";
    title.classList.remove("fade-in");
    message.innerHTML = "自分のための時間を過ごしましょう。<br>終わったらやさしくお知らせします。";
    message.classList.remove("fade-in");

    await requestWakeLock();
    startWakeLockWatchdog();

    if ("serviceWorker" in navigator && location.protocol !== "file:") {
        try {
            const reg = await navigator.serviceWorker.ready;
            reg.active?.postMessage({ type: "SCHEDULE_REST_END", endTime, duration });
        } catch (err) { console.warn("SW 予約失敗:", err); }
    }
    startTicking();
}

function startTicking() {
    if (tickId) clearInterval(tickId);
    tickId = setInterval(() => {
        if (!endTime) return;
        updateTimer();
        if (Date.now() >= endTime) finishRest();
    }, 500);
    updateTimer();
}

/* ---------- 休憩完了 ---------- */
function finishRest() {
    if (tickId) { clearInterval(tickId); tickId = null; }
    endTime = null;
    pausedTimeLeft = null;
    localStorage.removeItem("restEndTime");
    releaseWakeLock();
    stopWakeLockWatchdog();

    timer.textContent = "00:00";
    document.querySelector(".timer-wrap").classList.remove("pulse");

    title.textContent = "休憩おつかれさま";
    title.classList.add("fade-in");
    message.innerHTML = "自分のための時間を過ごしました。<br>また自分のペースで過ごしましょう。";
    message.classList.add("fade-in");

    const usedDuration = parseInt(localStorage.getItem("restDurationUsed") || "300", 10);
    status.textContent = "休憩完了 🌿";
    restButton.hidden = true;
    restButton.disabled = false;
    resetButton.hidden = false;
    stopButton.hidden = true;
    continueButton.style.display = "block";

    sendNotification("休憩おつかれさま 🌿", `${Math.round(usedDuration / 60)}分の休憩が終わりました。`);
    playSelectedAlarm();
    if (navigator.vibrate && vibrateEnabled?.checked) navigator.vibrate([200, 100, 200]);
}

/* ---------- ストップ ---------- */
function stopRest() {
    if (tickId === null) return;
    const remaining = Math.max(0, Math.round((endTime - Date.now()) / 1000));
    pausedTimeLeft = remaining;
    clearInterval(tickId);
    tickId = null;
    endTime = null;
    localStorage.removeItem("restEndTime");
    releaseWakeLock();
    stopWakeLockWatchdog();
    document.querySelector(".timer-wrap").classList.remove("pulse");

    title.textContent = "休憩を一時停止しました";
    title.classList.add("fade-in");
    message.innerHTML = `残り <strong>${Math.floor(remaining / 60)}分${remaining % 60}秒</strong> です。<br>「続きから再開」で再開できます。`;
    message.classList.add("fade-in");
    status.textContent = "おつかれさまでした 🌿";
    restButton.hidden = true;
    resetButton.hidden = false;
    stopButton.hidden = true;
    continueButton.style.display = "block";
}

restButton?.addEventListener("click", () => startRest(false));
stopButton?.addEventListener("click", stopRest);
resetButton?.addEventListener("click", () => {
    resetButton.hidden = true;
    restButton.hidden = false;
    continueButton.style.display = "block";
    stopButton.hidden = true;
    startRest(true);
});
continueButton?.addEventListener("click", () => {
    title.textContent = "わかりました";
    title.classList.add("fade-in");
    message.innerHTML = "スマホを使うことが悪いわけではありません。<br>また休みたくなったときに、ここへ戻ってきてください。";
    message.classList.add("fade-in");
    status.textContent = "自分のペースでどうぞ。";
    restButton.style.display = "none";
    resetButton.style.display = "none";
    stopButton.style.display = "none";
    continueButton.style.display = "none";
    notifyToggle.style.display = "none";
    alarmToggle.style.display = "none";
    alarmSettingsBtn.style.display = "none";
    scheduleButton.style.display = "none";
});

/* ---------- 復帰チェック ---------- */
function checkRestOnReturn() {
    const saved = localStorage.getItem("restEndTime");
    if (!saved) return;
    const savedEnd = parseInt(saved, 10);
    const now = Date.now();
    if (now >= savedEnd) {
        endTime = savedEnd;
        notifyEnabled = localStorage.getItem("notifyEnabled") === "1";
        finishRest();
    } else {
        endTime = savedEnd;
        restButton.disabled = true;
        continueButton.style.display = "none";
        resetButton.hidden = true;
        stopButton.hidden = false;
        startTicking();
        startWakeLockWatchdog();
    }
}

/* ---------- 通知時刻リスト ---------- */
function renderTimesList(times) {
    timesList.innerHTML = "";
    if (!times.length) {
        const empty = document.createElement("div");
        empty.className = "empty";
        empty.textContent = "まだ時刻が追加されていません";
        timesList.appendChild(empty);
        return;
    }
    times.sort();
    times.forEach((t) => {
        const row = document.createElement("div");
        row.className = "time-row";
        const input = document.createElement("input");
        input.type = "time";
        input.value = t;
        input.addEventListener("change", updateScheduleInfo);
        const remove = document.createElement("button");
        remove.className = "remove-btn";
        remove.type = "button";
        remove.setAttribute("aria-label", "削除");
        remove.textContent = "×";
        remove.addEventListener("click", () => {
            row.remove();
            if (!timesList.querySelector(".time-row")) renderTimesList([]);
            updateScheduleInfo();
        });
        row.appendChild(input);
        row.appendChild(remove);
        timesList.appendChild(row);
    });
}
function getCurrentTimes() {
    return Array.from(timesList.querySelectorAll('input[type="time"]'))
        .map((i) => i.value)
        .filter(Boolean);
}
addTimeBtn?.addEventListener("click", () => {
    const existing = getCurrentTimes();
    const all = [...existing, "12:00"];
    renderTimesList(all);
    updateScheduleInfo();
});
quickBtns.forEach((btn) => {
    btn.addEventListener("click", () => {
        const preset = btn.dataset.preset;
        let times = [];
        if (preset === "clear") times = [];
        else if (preset === "hourly") {
            for (let h = 9; h <= 21; h++) times.push(String(h).padStart(2, "0") + ":00");
        } else if (preset === "2hours") {
            for (let h = 9; h <= 21; h += 2) times.push(String(h).padStart(2, "0") + ":00");
        } else if (preset === "work") {
            times = ["10:00", "12:30", "15:00", "17:30"];
        }
        renderTimesList(times);
        updateScheduleInfo();
    });
});

/* ---------- 通知スケジュール ---------- */
function loadScheduleSettings() {
    const saved = JSON.parse(localStorage.getItem("scheduleSettings") || "{}");
    const times = saved.times || ["10:00", "14:00", "18:00"];
    renderTimesList(times);
    scheduleEnabled.checked = !!saved.enabled;
    updateScheduleInfo();
}
function saveScheduleSettings() {
    const times = getCurrentTimes();
    const settings = { times, enabled: scheduleEnabled.checked };
    localStorage.setItem("scheduleSettings", JSON.stringify(settings));
    const todayKey = "firedTimes_" + new Date().toDateString();
    localStorage.removeItem(todayKey);
    updateScheduleInfo();
    return settings;
}
function updateScheduleInfo() {
    const times = getCurrentTimes();
    if (!scheduleEnabled.checked) { scheduleInfo.textContent = "現在オフです。"; return; }
    if (!times.length) { scheduleInfo.textContent = "時刻が未設定です。"; return; }
    scheduleInfo.textContent = `1日 ${times.length} 回、指定時刻に通知します。`;
}
scheduleButton?.addEventListener("click", () => {
    loadScheduleSettings();
    scheduleModal.hidden = false;
});
scheduleSave?.addEventListener("click", () => {
    saveScheduleSettings();
    scheduleModal.hidden = true;
    status.textContent = "スケジュールを保存しました。";
});
scheduleEnabled?.addEventListener("change", updateScheduleInfo);

function checkScheduledReminders() {
    const settings = JSON.parse(localStorage.getItem("scheduleSettings") || "{}");
    if (!settings.enabled || !settings.times?.length) return;
    const now = new Date();
    const nowMin = now.getHours() * 60 + now.getMinutes();
    const todayKey = now.toDateString();
    const firedKey = "firedTimes_" + todayKey;
    const fired = JSON.parse(localStorage.getItem(firedKey) || "[]");
    for (const t of settings.times) {
        if (fired.includes(t)) continue;
        const [h, m] = t.split(":").map(Number);
        const targetMin = h * 60 + m;
        if (nowMin >= targetMin && nowMin - targetMin <= 5) {
            sendNotification("ひとやすみ", `そろそろ ${t} です。少し休みませんか？ 🌿`, { tag: "reminder-" + t });
            fired.push(t);
            localStorage.setItem(firedKey, JSON.stringify(fired));
        }
    }
}

/* ---------- アラーム音 ---------- */
function getAudioCtx() {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === "suspended") audioCtx.resume();
    return audioCtx;
}
function playTone(freq, startTime, duration, volume = 0.3, type = "sine") {
    const ctx = getAudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    const attack = Math.min(0.15, duration * 0.2);
    const release = duration * 0.6;
    gain.gain.setValueAtTime(0, startTime);
    gain.gain.linearRampToValueAtTime(volume * alarmVolumeValue, startTime + attack);
    gain.gain.setValueAtTime(volume * alarmVolumeValue, startTime + duration - release);
    gain.gain.linearRampToValueAtTime(0.0001, startTime + duration);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(startTime);
    osc.stop(startTime + duration);
}
function playGentleChime() {
    const ctx = getAudioCtx();
    const now = ctx.currentTime + 0.1;
    const chord = [523.25, 659.25, 783.99];
    chord.forEach((f, i) => playTone(f, now + i * 0.08, 1.6, 0.22));
    chord.forEach((f, i) => playTone(f, now + 0.9 + i * 0.08, 1.8, 0.18));
}
function playBell() {
    const ctx = getAudioCtx();
    const now = ctx.currentTime + 0.1;
    playTone(880, now, 2.5, 0.25, "sine");
    playTone(1320, now + 0.02, 2.0, 0.12, "sine");
    playTone(1760, now + 0.05, 1.5, 0.06, "sine");
}
function playBirds() {
    const ctx = getAudioCtx();
    const now = ctx.currentTime + 0.1;
    playTone(1568, now + 0.0, 0.15, 0.15);
    playTone(1760, now + 0.25, 0.15, 0.15);
    playTone(1976, now + 0.5, 0.12, 0.15);
    playTone(1760, now + 0.65, 0.12, 0.15);
    playTone(2093, now + 0.85, 0.25, 0.18);
}
function playWood() {
    const ctx = getAudioCtx();
    const now = ctx.currentTime + 0.1;
    const woodTone = (freq, start) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = "triangle";
        osc.frequency.value = freq;
        gain.gain.setValueAtTime(0, start);
        gain.gain.linearRampToValueAtTime(0.3 * alarmVolumeValue, start + 0.01);
        gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.8);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(start);
        osc.stop(start + 0.8);
    };
    woodTone(659.25, now);
    woodTone(523.25, now + 0.35);
}
const ALARMS = {
    gentle: { name: "やさしいチャイム", desc: "ドミソの柔らかい和音が2回", play: playGentleChime },
    bell:   { name: "鈴の音",          desc: "りん、と1回静かに",       play: playBell },
    birds:  { name: "小鳥のさえずり",  desc: "高い音でぴよぴよと3回",   play: playBirds },
    wood:   { name: "木琴の音",        desc: "ポロン、ポロンと2音",     play: playWood },
    none:   { name: "鳴らさない",      desc: "通知だけ（音は無し）",     play: () => {} },
};
function playSelectedAlarm() {
    if (!alarmEnabled) return;
    const alarm = ALARMS[selectedAlarm];
    if (!alarm || selectedAlarm === "none") return;
    try { alarm.play(); } catch (err) { console.warn(err); }
}

/* ---------- アラーム設定 ---------- */
function renderAlarmList() {
    alarmList.innerHTML = "";
    Object.entries(ALARMS).forEach(([key, alarm]) => {
        const item = document.createElement("div");
        item.className = "alarm-item" + (key === selectedAlarm ? " active" : "");
        item.dataset.key = key;
        const radio = document.createElement("span");
        radio.className = "alarm-item-radio";
        const label = document.createElement("div");
        label.className = "alarm-item-label";
        label.innerHTML = `<div>${alarm.name}</div><div class="alarm-item-desc">${alarm.desc}</div>`;
        const play = document.createElement("button");
        play.className = "alarm-item-play";
        play.type = "button";
        play.textContent = "▶";
        play.setAttribute("aria-label", "試し聴き");
        play.addEventListener("click", (e) => {
            e.stopPropagation();
            if (key === "none") return;
            try { alarm.play(); } catch (err) { console.warn(err); }
        });
        item.appendChild(radio);
        item.appendChild(label);
        item.appendChild(play);
        item.addEventListener("click", () => { selectedAlarm = key; renderAlarmList(); });
        alarmList.appendChild(item);
    });
}
function loadAlarmSettings() {
    const saved = JSON.parse(localStorage.getItem("alarmSettings") || "{}");
    selectedAlarm = saved.alarm || "wood";
    alarmVolumeValue = saved.volume ?? 0.6;
    vibrateEnabled.checked = saved.vibrate !== false;
    alarmEnabled = !!saved.enabled;
    alarmVolume.value = Math.round(alarmVolumeValue * 100);
    volumeValue.textContent = alarmVolume.value;
    alarmToggle.setAttribute("aria-pressed", String(alarmEnabled));
    alarmToggle.textContent = alarmEnabled ? "🔔 アラームオン" : "🔕 アラームをオンにする";
    renderAlarmList();
}
function saveAlarmSettings() {
    const settings = {
        alarm: selectedAlarm,
        volume: alarmVolumeValue,
        vibrate: vibrateEnabled.checked,
        enabled: alarmEnabled,
    };
    localStorage.setItem("alarmSettings", JSON.stringify(settings));
}
alarmSettingsBtn?.addEventListener("click", () => {
    loadAlarmSettings();
    alarmModal.hidden = false;
});
alarmVolume?.addEventListener("input", () => {
    alarmVolumeValue = parseInt(alarmVolume.value, 10) / 100;
    volumeValue.textContent = alarmVolume.value;
});
alarmTestBtn?.addEventListener("click", () => {
    if (selectedAlarm === "none") { status.textContent = "「鳴らさない」が選択されています。"; return; }
    try { ALARMS[selectedAlarm].play(); } catch (err) { console.warn(err); }
});
alarmSaveBtn?.addEventListener("click", () => {
    saveAlarmSettings();
    alarmModal.hidden = true;
    status.textContent = "アラーム設定を保存しました。";
});
alarmToggle?.addEventListener("click", () => {
    alarmEnabled = !alarmEnabled;
    alarmToggle.setAttribute("aria-pressed", String(alarmEnabled));
    alarmToggle.textContent = alarmEnabled ? "🔔 アラームオン" : "🔕 アラームをオンにする";
    saveAlarmSettings();
    if (alarmEnabled) {
        try {
            const ctx = getAudioCtx();
            const osc = ctx.createOscillator();
            const g = ctx.createGain();
            g.gain.value = 0;
            osc.connect(g).connect(ctx.destination);
            osc.start();
            osc.stop(ctx.currentTime + 0.01);
        } catch (err) { console.warn("Audio unlock failed:", err); }
    }
});

/* ---------- iPhone 用ホーム画面追加案内 ---------- */
function shouldShowIosHint() {
    if (!isiOS()) return false;
    if (isInStandaloneMode()) return false;
    if (localStorage.getItem("iosHintDismissed") === "1") return false;
    return true;
}
if (shouldShowIosHint() && iosHint) {
    setTimeout(() => { iosHint.hidden = false; }, 3000);
}
iosClose?.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (iosHint) iosHint.hidden = true;
    localStorage.setItem("iosHintDismissed", "1");
});
window.addEventListener("appinstalled", () => {
    if (iosHint) iosHint.hidden = true;
    localStorage.setItem("iosHintDismissed", "1");
});

/* ---------- 復帰トリガー ---------- */
document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") {
        checkRestOnReturn();
        checkScheduledReminders();
        if (tickId !== null) requestWakeLock();
    }
});
window.addEventListener("focus", () => {
    checkRestOnReturn();
    checkScheduledReminders();
    if (tickId !== null) requestWakeLock();
});

/* ---------- 初期化 ---------- */
function restoreSettings() {
    const savedDur = parseInt(localStorage.getItem("restDuration") || "0", 10);
    if (savedDur >= 60) {
        REST_DURATION = savedDur;
        const m = Math.round(savedDur / 60);
        customMinutes.value = m;
        durationButtons.forEach((b) => {
            b.classList.toggle("active", parseInt(b.dataset.min, 10) === m);
        });
        restButton.textContent = `${m}分休む`;
    }
    if (localStorage.getItem("notifyEnabled") === "1" &&
        "Notification" in window &&
        Notification.permission === "granted") {
        notifyEnabled = true;
        notifyToggle.setAttribute("aria-pressed", "true");
        notifyToggle.textContent = "🔔 通知オン";
    }
}
restoreSettings();
loadAlarmSettings();
updateTimer();
checkRestOnReturn();
checkScheduledReminders();

setInterval(checkScheduledReminders, 60 * 1000);

if ("serviceWorker" in navigator && location.protocol !== "file:") {
    navigator.serviceWorker.addEventListener("message", (e) => {
        if (e.data?.type === "REST_END") checkRestOnReturn();
    });
}

console.log("[ひとやすみ] 起動完了");