/* =========================================================
   ひとやすみ - メインスクリプト (呼吸ガイド + 波の音)
   ========================================================= */

/* ---------- 要素取得 ---------- */
const timer           = document.getElementById("timer");
const status          = document.getElementById("status");
const title           = document.getElementById("title");
const message         = document.getElementById("message");
const progressCircle  = document.getElementById("progressCircle");
const breathCircle    = document.getElementById("breathCircle");
const breathText      = document.getElementById("breathText");
const waveToggle      = document.getElementById("waveToggle");
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

/* ---------- 定数 ---------- */
const CIRCUMFERENCE = 2 * Math.PI * 118;

/* ---------- 状態 ---------- */
let REST_DURATION    = 5 * 60;
let endTime          = null;
let tickId           = null;
let notifyEnabled    = false;
let wakeLock         = null;
let wakeLockRetryId  = null;
let pausedTimeLeft   = null;

// 呼吸ガイド
let breathTimerId    = null;
let breathPhase      = "inhale";  // inhale / hold / exhale
let breathCycleCount = 0;

// 波の音
let audioCtx         = null;
let waveNodes        = null;
let wavePlaying      = false;

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

/* =========================================================
   Screen Wake Lock
   ========================================================= */
async function requestWakeLock() {
    if (!("wakeLock" in navigator)) return;
    if (wakeLock) return;
    if (document.visibilityState !== "visible") return;
    try {
        wakeLock = await navigator.wakeLock.request("screen");
        console.log("[WakeLock] ON");
        wakeLock.addEventListener("release", () => {
            wakeLock = null;
        });
    } catch (err) {
        wakeLock = null;
    }
}
async function releaseWakeLock() {
    if (!wakeLock) return;
    try { await wakeLock.release(); wakeLock = null; } catch (err) {}
}
function startWakeLockWatchdog() {
    stopWakeLockWatchdog();
    wakeLockRetryId = setInterval(() => {
        if (tickId === null) { stopWakeLockWatchdog(); return; }
        if (wakeLock === null && document.visibilityState === "visible") {
            requestWakeLock();
        }
    }, 1000);
}
function stopWakeLockWatchdog() {
    if (wakeLockRetryId) { clearInterval(wakeLockRetryId); wakeLockRetryId = null; }
}

/* =========================================================
   波の音（Web Audio API で生成）
   ========================================================= */
function getAudioCtx() {
    if (!audioCtx) {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (audioCtx.state === "suspended") audioCtx.resume();
    return audioCtx;
}

function startWaveSound() {
    if (wavePlaying) return;
    const ctx = getAudioCtx();

    // ピンクノイズ風のバッファを生成
    const bufferSize = 2 * ctx.sampleRate;
    const noiseBuffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const output = noiseBuffer.getChannelData(0);

    // ピンクノイズ生成（1/f ゆらぎ）
    let b0=0, b1=0, b2=0, b3=0, b4=0, b5=0, b6=0;
    for (let i = 0; i < bufferSize; i++) {
        const white = Math.random() * 2 - 1;
        b0 = 0.99886 * b0 + white * 0.0555179;
        b1 = 0.99332 * b1 + white * 0.0750759;
        b2 = 0.96900 * b2 + white * 0.1538520;
        b3 = 0.86650 * b3 + white * 0.3104856;
        b4 = 0.55000 * b4 + white * 0.5329522;
        b5 = -0.7616 * b5 - white * 0.0168980;
        output[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362) * 0.11;
        b6 = white * 0.115926;
    }

    // ノイズソース
    const noise = ctx.createBufferSource();
    noise.buffer = noiseBuffer;
    noise.loop = true;

    // ローパスフィルター（波のこもった音）
    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = 500;
    filter.Q.value = 0.7;

    // ゆっくり振幅を揺らす（波の寄せ引き）
    const lfo = ctx.createOscillator();
    lfo.type = "sine";
    lfo.frequency.value = 0.08;   // 12秒周期

    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 0.35;
    lfo.connect(lfoGain);

    const mainGain = ctx.createGain();
    mainGain.gain.value = 0.25;
    lfoGain.connect(mainGain.gain);

    noise.connect(filter);
    filter.connect(mainGain);
    mainGain.connect(ctx.destination);

    noise.start(0);
    lfo.start(0);

    waveNodes = { noise, filter, lfo, lfoGain, mainGain };
    wavePlaying = true;
    console.log("[Wave] 再生開始");
}

function stopWaveSound() {
    if (!wavePlaying || !waveNodes) return;
    try {
        waveNodes.noise.stop();
        waveNodes.lfo.stop();
    } catch (e) {}
    waveNodes = null;
    wavePlaying = false;
    console.log("[Wave] 停止");
}

waveToggle?.addEventListener("click", () => {
    if (wavePlaying) {
        stopWaveSound();
        waveToggle.textContent = "🌊 波の音を流す";
        waveToggle.setAttribute("aria-pressed", "false");
    } else {
        startWaveSound();
        waveToggle.textContent = "🌊 波の音を止める";
        waveToggle.setAttribute("aria-pressed", "true");
    }
});

/* =========================================================
   呼吸ガイド（4-7-8呼吸法）
   ========================================================= */
function startBreathGuide() {
    stopBreathGuide();
    breathCycleCount = 0;
    runBreathCycle();
}

function runBreathCycle() {
    if (!breathCircle || !breathText) return;

    // フェーズ1: 吸う（4秒）
    breathPhase = "inhale";
    breathCircle.classList.add("active");
    breathCircle.classList.remove("hold", "exhale");
    breathCircle.classList.add("inhale");
    breathText.textContent = "吸って…";

    breathTimerId = setTimeout(() => {
        // フェーズ2: 止める（7秒）
        breathPhase = "hold";
        breathCircle.classList.remove("inhale");
        breathCircle.classList.add("hold");
        breathText.textContent = "止めて…";

        breathTimerId = setTimeout(() => {
            // フェーズ3: 吐く（8秒）
            breathPhase = "exhale";
            breathCircle.classList.remove("hold");
            breathCircle.classList.add("exhale");
            breathText.textContent = "吐いて…";

            breathTimerId = setTimeout(() => {
                breathCycleCount++;
                // 休憩中なら繰り返す
                if (tickId !== null) {
                    runBreathCycle();
                }
            }, 8000);
        }, 7000);
    }, 4000);
}

function stopBreathGuide() {
    if (breathTimerId) {
        clearTimeout(breathTimerId);
        breathTimerId = null;
    }
    if (breathCircle) {
        breathCircle.classList.remove("active", "inhale", "hold", "exhale");
    }
    if (breathText) {
        breathText.hidden = true;
        breathText.textContent = "";
    }
}

/* =========================================================
   モーダル
   ========================================================= */
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

/* =========================================================
   通知
   ========================================================= */
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
        silent: true,   // 通知音を鳴らさない
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

/* =========================================================
   休憩時間
   ========================================================= */
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

/* =========================================================
   タイマー表示
   ========================================================= */
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

/* =========================================================
   休憩開始
   ========================================================= */
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
    waveToggle.hidden = false;
    document.querySelector(".timer-wrap").classList.add("pulse");

    title.textContent = "休憩中…";
    title.classList.remove("fade-in");
    message.innerHTML = "呼吸を整えながら、ゆっくり過ごしましょう。";
    message.classList.remove("fade-in");

    // 呼吸ガイド開始
    if (breathText) breathText.hidden = false;
    startBreathGuide();

    // 波の音を自動開始
    if (!wavePlaying) {
        startWaveSound();
        waveToggle.textContent = "🌊 波の音を止める";
        waveToggle.setAttribute("aria-pressed", "true");
    }

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

/* =========================================================
   休憩完了
   ========================================================= */
function finishRest() {
    if (tickId) { clearInterval(tickId); tickId = null; }
    endTime = null;
    pausedTimeLeft = null;
    localStorage.removeItem("restEndTime");
    releaseWakeLock();
    stopWakeLockWatchdog();
    stopBreathGuide();

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
    waveToggle.hidden = true;

    // 波の音を停止
    stopWaveSound();

    // 祝福エフェクト
    showCelebration();

    // 通知（音は鳴らさない）
    sendNotification("休憩おつかれさま 🌿", "休憩時間が終わりました。");
}

/* =========================================================
   ストップ
   ========================================================= */
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
    stopWaveSound();
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
    waveToggle.hidden = true;
    waveToggle.textContent = "🌊 波の音を流す";
    waveToggle.setAttribute("aria-pressed", "false");
}

/* ---------- ボタンイベント ---------- */
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
});

/* =========================================================
   復帰チェック
   ========================================================= */
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
        waveToggle.hidden = false;
        if (breathText) breathText.hidden = false;
        startBreathGuide();
        startTicking();
        startWakeLockWatchdog();
    }
}

/* =========================================================
   通知時刻リスト
   ========================================================= */
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

/* =========================================================
   通知スケジュール
   ========================================================= */
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

/* =========================================================
   祝福エフェクト
   ========================================================= */
function showCelebration() {
    if (!celebration) return;
    celebration.hidden = false;
    setTimeout(() => { celebration.hidden = true; }, 1500);
}

/* =========================================================
   時間帯ごとの挨拶
   ========================================================= */
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

/* =========================================================
   タイマー円タップで開始
   ========================================================= */
timerWrap?.addEventListener("click", () => {
    if (tickId === null && restButton && !restButton.hidden) {
        startRest(false);
    }
});

/* =========================================================
   iPhone 用ホーム画面追加案内
   ========================================================= */
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

/* =========================================================
   復帰トリガー
   ========================================================= */
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

/* =========================================================
   初期化
   ========================================================= */
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