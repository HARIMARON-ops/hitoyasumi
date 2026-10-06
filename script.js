/* =========================================================
   ひとやすみ - メインスクリプト (完全版 v3)
   ========================================================= */

const timer           = document.getElementById("timer");
const status          = document.getElementById("status");
const title           = document.getElementById("title");
const message         = document.getElementById("message");
const progressCircle  = document.getElementById("progressCircle");
const breathCircle    = document.getElementById("breathCircle");
const breathCountdown = document.getElementById("breathCountdown");
const breathPanel     = document.getElementById("breathPanel");
const breathPhase     = document.getElementById("breathPhase");
const breathInstruction = document.getElementById("breathInstruction");
const breathCounter   = document.getElementById("breathCounter");
const phaseDot        = document.getElementById("phaseDot");
const soundPicker     = document.getElementById("soundPicker");
const timerWrap       = document.getElementById("timerWrap");
const greetingEl      = document.getElementById("greeting");
const celebration     = document.getElementById("celebration");

const restButton      = document.getElementById("restButton");
const resetButton     = document.getElementById("resetButton");
const stopButton      = document.getElementById("stopButton");
const continueButton  = document.getElementById("continueButton");
const notifyToggle    = document.getElementById("notifyToggle");
const scheduleButton  = document.getElementById("scheduleButton");
const durationButtons = document.querySelectorAll(".duration-btn");
const soundBtns       = document.querySelectorAll(".sound-btn");

const customMinutes = document.getElementById("customMinutes");
const applyCustom   = document.getElementById("applyCustom");

const scheduleModal   = document.getElementById("scheduleModal");
const timesList       = document.getElementById("timesList");
const addTimeBtn      = document.getElementById("addTimeBtn");
const quickBtns       = document.querySelectorAll(".quick-btn");
const scheduleEnabled = document.getElementById("scheduleEnabled");
const scheduleInfo    = document.getElementById("scheduleInfo");
const scheduleSave    = document.getElementById("scheduleSave");

const iosHint  = document.getElementById("iosHint");
const iosClose = document.getElementById("iosClose");

const CIRCUMFERENCE = 2 * Math.PI * 128;
const BREATH_INHALE  = 4;
const BREATH_HOLD    = 7;
const BREATH_EXHALE  = 8;

let REST_DURATION    = 5 * 60;
let endTime          = null;
let tickId           = null;
let notifyEnabled    = false;
let wakeLock         = null;
let wakeLockRetryId  = null;
let pausedTimeLeft   = null;

let breathTimerId    = null;
let breathCountdownId = null;
let breathCycleCount = 0;

let audioCtx         = null;
let currentSound     = "rain";
let soundNodes       = null;

if (progressCircle) progressCircle.style.strokeDasharray = CIRCUMFERENCE;

/* ---------- 端末判定 ---------- */
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
        wakeLock.addEventListener("release", () => { wakeLock = null; });
    } catch (err) { wakeLock = null; }
}
async function releaseWakeLock() {
    if (!wakeLock) return;
    try { await wakeLock.release(); wakeLock = null; } catch (err) {}
}
function startWakeLockWatchdog() {
    stopWakeLockWatchdog();
    wakeLockRetryId = setInterval(() => {
        if (tickId === null) { stopWakeLockWatchdog(); return; }
        if (wakeLock === null && document.visibilityState === "visible") requestWakeLock();
    }, 1000);
}
function stopWakeLockWatchdog() {
    if (wakeLockRetryId) { clearInterval(wakeLockRetryId); wakeLockRetryId = null; }
}

/* ---------- 環境音（雨のみ） ---------- */
function getAudioCtx() {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === "suspended") audioCtx.resume();
    return audioCtx;
}

function createPinkNoise(ctx, seconds = 4) {
    const bufferSize = seconds * ctx.sampleRate;
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    let b0=0, b1=0, b2=0, b3=0, b4=0, b5=0, b6=0;
    for (let i = 0; i < bufferSize; i++) {
        const white = Math.random() * 2 - 1;
        b0 = 0.99886 * b0 + white * 0.0555179;
        b1 = 0.99332 * b1 + white * 0.0750759;
        b2 = 0.96900 * b2 + white * 0.1538520;
        b3 = 0.86650 * b3 + white * 0.3104856;
        b4 = 0.55000 * b4 + white * 0.5329522;
        b5 = -0.7616 * b5 - white * 0.0168980;
        data[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362) * 0.11;
        b6 = white * 0.115926;
    }
    return buffer;
}

function createRainSound() {
    const ctx = getAudioCtx();
    const buffer = createPinkNoise(ctx, 4);
    const noise = ctx.createBufferSource();
    noise.buffer = buffer;
    noise.loop = true;

    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass"; lp.frequency.value = 3500; lp.Q.value = 0.5;

    const hp = ctx.createBiquadFilter();
    hp.type = "highpass"; hp.frequency.value = 200;

    const lfo1 = ctx.createOscillator();
    lfo1.type = "sine"; lfo1.frequency.value = 0.07;
    const lfo1Gain = ctx.createGain(); lfo1Gain.gain.value = 0.12;
    lfo1.connect(lfo1Gain);

    const lfo2 = ctx.createOscillator();
    lfo2.type = "sine"; lfo2.frequency.value = 0.23;
    const lfo2Gain = ctx.createGain(); lfo2Gain.gain.value = 0.06;
    lfo2.connect(lfo2Gain);

    const mainGain = ctx.createGain();
    mainGain.gain.value = 0.32;
    lfo1Gain.connect(mainGain.gain);
    lfo2Gain.connect(mainGain.gain);

    noise.connect(hp); hp.connect(lp); lp.connect(mainGain);
    mainGain.connect(ctx.destination);
    noise.start(0); lfo1.start(0); lfo2.start(0);

    // 遠くの雷
    let thunderTimerId = setInterval(() => {
        if (!soundNodes) return;
        const osc = ctx.createOscillator();
        const g = ctx.createGain();
        osc.type = "sine";
        osc.frequency.setValueAtTime(60, ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(30, ctx.currentTime + 1.5);
        const t = ctx.currentTime;
        g.gain.setValueAtTime(0, t);
        g.gain.linearRampToValueAtTime(0.06 * Math.random(), t + 0.3);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 2.5);
        osc.connect(g); g.connect(ctx.destination);
        osc.start(t); osc.stop(t + 2.5);
    }, 12000 + Math.random() * 15000);

    return { sources: [noise, lfo1, lfo2], thunderTimerId };
}

function startSound(type) {
    stopSound();
    if (type === "rain") {
        soundNodes = createRainSound();
        currentSound = "rain";
    }
}

function stopSound() {
    if (!soundNodes) return;
    try {
        soundNodes.sources.forEach((s) => s.stop());
        if (soundNodes.thunderTimerId) clearInterval(soundNodes.thunderTimerId);
    } catch (e) {}
    soundNodes = null;
}

soundBtns.forEach((btn) => {
    btn.addEventListener("click", () => {
        const type = btn.dataset.sound;
        const isActive = btn.classList.contains("active");

        if (isActive) {
            btn.classList.remove("active");
            localStorage.setItem("preferredSound", "none");
            currentSound = "none";
            if (tickId !== null) stopSound();
            const nameEl = btn.querySelector(".sound-name");
            if (nameEl) nameEl.textContent = "雨音を流す";
        } else {
            btn.classList.add("active");
            localStorage.setItem("preferredSound", "rain");
            currentSound = "rain";
            if (tickId !== null) startSound("rain");
            const nameEl = btn.querySelector(".sound-name");
            if (nameEl) nameEl.textContent = "雨音を止める";
        }
    });
});

/* ---------- 呼吸ガイド ---------- */
function setPhase(phase, label, instruction) {
    if (breathCircle) {
        breathCircle.classList.remove("inhale", "hold", "exhale");
        breathCircle.classList.add(phase);
    }
    if (breathCountdown) {
        breathCountdown.classList.remove("inhale", "hold", "exhale");
        breathCountdown.classList.add(phase);
    }
    if (breathPhase) {
        breathPhase.classList.remove("inhale", "hold", "exhale");
        breathPhase.classList.add(phase);
        breathPhase.textContent = label;
    }
    if (phaseDot) {
        phaseDot.classList.remove("inhale", "hold", "exhale");
        phaseDot.classList.add(phase);
    }
    if (breathInstruction) breathInstruction.textContent = instruction;

    const ripples = document.querySelectorAll(".ripple");
    ripples.forEach((r) => {
        r.classList.remove("inhale", "hold", "exhale", "active");
        void r.offsetWidth;
        r.classList.add(phase, "active");
    });

    if (phase === "inhale") spawnParticles("inhale", 12);
    else if (phase === "exhale") spawnParticles("exhale", 10);
}

function startCountdown(seconds) {
    if (breathCountdownId) clearInterval(breathCountdownId);
    if (!breathCountdown) return;
    breathCountdown.hidden = false;
    let remaining = seconds;
    breathCountdown.textContent = remaining;
    breathCountdownId = setInterval(() => {
        remaining--;
        if (remaining > 0) breathCountdown.textContent = remaining;
        else clearInterval(breathCountdownId);
    }, 1000);
}

function spawnParticles(type, count) {
    const container = document.getElementById("breathParticles");
    if (!container) return;
    container.classList.add("active");

    for (let i = 0; i < count; i++) {
        const p = document.createElement("div");
        p.className = `particle ${type}`;
        const angle = (Math.PI * 2 * i) / count + Math.random() * 0.5;
        const startRadius = type === "inhale" ? 30 : 150;
        const endRadius   = type === "inhale" ? 150 : 30;

        p.style.setProperty("--x-start", `${Math.cos(angle) * startRadius}px`);
        p.style.setProperty("--y-start", `${Math.sin(angle) * startRadius}px`);
        p.style.setProperty("--x-end", `${Math.cos(angle) * endRadius}px`);
        p.style.setProperty("--y-end", `${Math.sin(angle) * endRadius}px`);

        const size = 3 + Math.random() * 3;
        p.style.width = size + "px";
        p.style.height = size + "px";
        p.style.animationDelay = (Math.random() * 1.2) + "s";

        container.appendChild(p);
        setTimeout(() => p.remove(), 9000);
    }
}

function runBreathCycle() {
    if (!breathCircle) return;
    if (breathCounter) breathCounter.textContent = `${breathCycleCount + 1}回目`;

    setPhase("inhale", "吸う", "鼻からゆっくり吸って…");
    startCountdown(BREATH_INHALE);

    breathTimerId = setTimeout(() => {
        setPhase("hold", "止める", "そのまま止めて…");
        startCountdown(BREATH_HOLD);

        breathTimerId = setTimeout(() => {
            setPhase("exhale", "吐く", "口からゆっくり吐いて…");
            startCountdown(BREATH_EXHALE);

            breathTimerId = setTimeout(() => {
                breathCycleCount++;
                if (tickId !== null) runBreathCycle();
            }, BREATH_EXHALE * 1000);
        }, BREATH_HOLD * 1000);
    }, BREATH_INHALE * 1000);
}

function startBreathGuide() {
    stopBreathGuide();
    breathCycleCount = 0;
    if (breathCircle) breathCircle.classList.add("active");
    if (breathPanel) breathPanel.hidden = false;
    if (breathCounter) breathCounter.textContent = "1回目";
    if (timerWrap) timerWrap.classList.add("resting");
    runBreathCycle();
}

function stopBreathGuide() {
    if (breathTimerId) { clearTimeout(breathTimerId); breathTimerId = null; }
    if (breathCountdownId) { clearInterval(breathCountdownId); breathCountdownId = null; }
    if (breathCircle) breathCircle.classList.remove("active", "inhale", "hold", "exhale");
    if (breathCountdown) {
        breathCountdown.hidden = true;
        breathCountdown.classList.remove("inhale", "hold", "exhale");
    }
    if (breathPanel) breathPanel.hidden = true;
    if (timerWrap) timerWrap.classList.remove("resting");

    document.querySelectorAll(".ripple").forEach((r) => {
        r.classList.remove("inhale", "hold", "exhale", "active");
    });
    const container = document.getElementById("breathParticles");
    if (container) {
        container.classList.remove("active");
        container.innerHTML = "";
    }
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
        silent: true,
        ...options,
    };
    try {
        if ("serviceWorker" in navigator && location.protocol !== "file:") {
            const reg = await navigator.serviceWorker.ready;
            await reg.showNotification(t, opts);
        } else {
            new Notification(t, opts);
        }
    } catch (err) {}
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

/* ---------- タイマー ---------- */
function updateTimer() {
    let remaining = REST_DURATION;
    if (endTime) remaining = Math.max(0, Math.round((endTime - Date.now()) / 1000));
    else if (pausedTimeLeft !== null) remaining = pausedTimeLeft;
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

    status.textContent = "ゆっくり休みましょう。";
    restButton.disabled = true;
    restButton.hidden = false;
    resetButton.hidden = true;
    stopButton.hidden = false;
    continueButton.style.display = "none";
    document.querySelector(".timer-wrap").classList.add("pulse");

    title.textContent = "休憩中…";
    title.classList.remove("fade-in");
    message.innerHTML = "呼吸を整えながら、ゆっくり過ごしましょう。";
    message.classList.remove("fade-in");

    startBreathGuide();
    if (currentSound !== "none") startSound("rain");

    await requestWakeLock();
    startWakeLockWatchdog();

    if ("serviceWorker" in navigator && location.protocol !== "file:") {
        try {
            const reg = await navigator.serviceWorker.ready;
            reg.active?.postMessage({ type: "SCHEDULE_REST_END", endTime, duration });
        } catch (err) {}
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
    stopBreathGuide();
    stopSound();

    timer.textContent = "00:00";
    document.querySelector(".timer-wrap").classList.remove("pulse");

    title.textContent = "休憩おつかれさま";
    title.classList.add("fade-in");
    message.innerHTML = "自分のための時間を過ごしました。<br>また自分のペースで過ごしましょう。";
    message.classList.add("fade-in");
    status.textContent = "休憩完了 🌿";
    restButton.hidden = true;
    restButton.disabled = false;
    resetButton.hidden = false;
    stopButton.hidden = true;
    continueButton.style.display = "block";

    showCelebration();
    sendNotification("休憩おつかれさま 🌿", "休憩時間が終わりました。");
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
    stopBreathGuide();
    stopSound();
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
    scheduleButton.style.display = "none";
    soundPicker.style.display = "none";
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
        startBreathGuide();
        if (currentSound !== "none") startSound("rain");
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
        .map((i) => i.value).filter(Boolean);
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
    localStorage.removeItem("firedTimes_" + new Date().toDateString());
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
    const firedKey = "firedTimes_" + now.toDateString();
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

/* ---------- 祝福エフェクト ---------- */
function showCelebration() {
    if (!celebration) return;
    celebration.hidden = false;
    setTimeout(() => { celebration.hidden = true; }, 1500);
}

/* ---------- 時間帯挨拶 ---------- */
function updateGreeting() {
    const hour = new Date().getHours();
    let text = "今日もおつかれさま";
    if (hour >= 5 && hour < 11) text = "おはようございます";
    else if (hour >= 11 && hour < 14) text = "お昼のひとやすみ";
    else if (hour >= 14 && hour < 18) text = "午後のひとやすみ";
    else if (hour >= 18 && hour < 22) text = "夜のひとやすみ";
    else text = "遅くまでおつかれさま";
    if (greetingEl) greetingEl.textContent = text;
}

/* ---------- タイマー円タップ ---------- */
timerWrap?.addEventListener("click", () => {
    if (tickId === null && restButton && !restButton.hidden) startRest(false);
});

/* ---------- iPhone 案内 ---------- */
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
    // 雨音の状態復元
    const savedSound = localStorage.getItem("preferredSound");
    const rainBtn = document.querySelector('.sound-btn[data-sound="rain"]');
    const nameEl = rainBtn?.querySelector(".sound-name");
    if (savedSound === "none") {
        currentSound = "none";
        rainBtn?.classList.remove("active");
        if (nameEl) nameEl.textContent = "雨音を流す";
    } else {
        currentSound = "rain";
        rainBtn?.classList.add("active");
        if (nameEl) nameEl.textContent = "雨音を止める";
    }
    // 通知
    if (localStorage.getItem("notifyEnabled") === "1" &&
        "Notification" in window &&
        Notification.permission === "granted") {
        notifyEnabled = true;
        notifyToggle.setAttribute("aria-pressed", "true");
        notifyToggle.textContent = "🔔 通知オン";
    }
}

restoreSettings();
updateTimer();
checkRestOnReturn();
checkScheduledReminders();
updateGreeting();
setInterval(updateGreeting, 60 * 60 * 1000);
setInterval(checkScheduledReminders, 60 * 1000);

if ("serviceWorker" in navigator && location.protocol !== "file:") {
    navigator.serviceWorker.addEventListener("message", (e) => {
        if (e.data?.type === "REST_END") checkRestOnReturn();
    });
}

console.log("[ひとやすみ] 起動完了");