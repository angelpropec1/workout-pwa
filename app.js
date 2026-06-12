/* Workout Log PWA (local-first, no login)
   - Saves workouts locally using IndexedDB
   - iPhone-friendly UI
   - 3 templates + cardio
   - Shows Last/Best per exercise
   - Action Next Time per exercise
   - Export to ChatGPT (copy)
*/
(() => {
  "use strict";

  // ---------- Helpers ----------
  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => Array.from(document.querySelectorAll(sel));
  const fmtDate = (d) => new Date(d).toLocaleString(undefined, { weekday:"short", year:"numeric", month:"short", day:"2-digit", hour:"2-digit", minute:"2-digit" });
  const pad2 = (n) => String(n).padStart(2, "0");
  const nowIso = () => new Date().toISOString();
  const clampInt = (v, def) => {
    const n = Number.parseInt(String(v), 10);
    return Number.isFinite(n) ? n : def;
  };
  const round1 = (n) => Math.round(n * 10) / 10;

  // ---------- Data (Exercises + Templates) ----------
  // Types:
  //  strength        -> weight (kg) + reps  (dumbbell only)
  //  bodyweight      -> reps only
  //  bodyweight_time -> seconds only (holds)
  const EXERCISES = [
    // Chest, Arms & Stomach
    { id:"barbell_21s", name:"21's barbells", group:"Arms", type:"bodyweight" },
    { id:"tricep_dips", name:"Tricep dips", group:"Arms", type:"bodyweight" },
    { id:"pushups", name:"Pushups", group:"Chest", type:"bodyweight" },
    { id:"tricep_ext_barbell", name:"Tricep extension barbell", group:"Arms", type:"bodyweight" },
    { id:"ring_flys", name:"Ring flys", group:"Chest", type:"bodyweight" },
    { id:"ring_crossover_pushups", name:"Ring crossover push-ups", group:"Chest", type:"bodyweight" },
    { id:"roman_chair", name:"Roman chair", group:"Stomach", type:"bodyweight" },
    { id:"bench_leg_raises", name:"Bench leg raises", group:"Stomach", type:"bodyweight" },
    // Shoulders, Back & Stomach
    { id:"db_shoulder_press", name:"Dumbbell shoulder press", group:"Shoulders", type:"strength" },
    { id:"db_lateral_raise", name:"Dumbbell lateral raise", group:"Shoulders", type:"strength" },
    { id:"db_forward_raise", name:"Dumbbell forward raise", group:"Shoulders", type:"strength" },
    { id:"ring_face_pullup", name:"Ring face pull up", group:"Back", type:"bodyweight" },
    { id:"ring_pike_hold", name:"Ring pike hold", group:"Stomach", type:"bodyweight_time" },
    { id:"parallettes_l_sit", name:"Parallettes L sit", group:"Stomach", type:"bodyweight_time" },
    { id:"plank", name:"Plank", group:"Stomach", type:"bodyweight_time" },
    // Legs & Core
    { id:"kb_squats", name:"Kettlebell squats", group:"Legs", type:"bodyweight" },
    { id:"kb_lunge_switches", name:"Kettlebell lunge switches", group:"Legs", type:"bodyweight" },
    { id:"kb_swings", name:"Kettlebell swings", group:"Legs", type:"bodyweight" },
    { id:"kb_goblet_squat", name:"Kettlebell goblet squat", group:"Legs", type:"bodyweight" },
    { id:"pendulum_lunges", name:"Pendulum lunges", group:"Legs", type:"bodyweight" },
    { id:"kb_russian_twists", name:"Kettlebell russian twists", group:"Core", type:"bodyweight" },
    { id:"kb_hollow_hold_scissors", name:"Kettlebell hollow hold scissors", group:"Core", type:"bodyweight" },
  ];

  const TEMPLATES = {
    w1: {
      id:"w1",
      name:"Chest, Arms & Stomach",
      exercises:[
        "barbell_21s","tricep_dips","pushups","tricep_ext_barbell",
        "ring_flys","ring_crossover_pushups","roman_chair","bench_leg_raises"
      ],
    },
    w2: {
      id:"w2",
      name:"Shoulders, Back & Stomach",
      exercises:[
        "db_shoulder_press","db_lateral_raise","db_forward_raise",
        "ring_face_pullup","ring_pike_hold","parallettes_l_sit","plank"
      ],
    },
    w3: {
      id:"w3",
      name:"Legs & Core",
      exercises:[
        "kb_squats","kb_lunge_switches","kb_swings","kb_goblet_squat",
        "pendulum_lunges","kb_russian_twists","kb_hollow_hold_scissors"
      ],
    },
  };

  const findExercise = (id) => EXERCISES.find(x => x.id === id);
  const exType = (id) => findExercise(id)?.type ?? "bodyweight";
  const isTimeEx = (id) => exType(id) === "bodyweight_time";
  const isStrengthEx = (id) => exType(id) === "strength";

  // Format a top set according to exercise type (kg×reps / reps / sec)
  function fmtTop(exerciseId, top) {
    if (!top) return "—";
    if (isTimeEx(exerciseId)) return `${top.reps} sec`;
    if (isStrengthEx(exerciseId)) return `${top.weightKg}kg × ${top.reps}`;
    return `${top.reps} reps`;
  }

  // ---------- Exercise pictograms (blue figure on black) ----------
  const PIC_BLUE = "#4c8dff";
  const pHead = (x, y) => `<circle cx="${x}" cy="${y}" r="4.5" fill="${PIC_BLUE}" stroke="none"/>`;
  const pL = (pts) => `<polyline points="${pts}"/>`;
  const pKb = (x, y) => `<path d="M ${x-3.5} ${y-3} q 3.5 -6 7 0"/><circle cx="${x}" cy="${y+1}" r="4" fill="${PIC_BLUE}" stroke="none"/>`;
  const pDb = (x, y) => `<line x1="${x-5}" y1="${y}" x2="${x+5}" y2="${y}" stroke-width="6"/>`;
  const pDbV = (x, y) => `<line x1="${x}" y1="${y-5}" x2="${x}" y2="${y+5}" stroke-width="6"/>`;
  const pBar = (x, y, w=9) => `<line x1="${x-w}" y1="${y}" x2="${x+w}" y2="${y}"/><line x1="${x-w}" y1="${y-3}" x2="${x-w}" y2="${y+3}"/><line x1="${x+w}" y1="${y-3}" x2="${x+w}" y2="${y+3}"/>`;
  const pGround = () => `<line x1="6" y1="57" x2="58" y2="57" opacity="0.45"/>`;
  const pRing = (x, y, topX=x) => `<line x1="${topX}" y1="2" x2="${x}" y2="${y-3}"/><circle cx="${x}" cy="${y}" r="3"/>`;
  const pArrowR = (x, y) => `<path d="M ${x} ${y} h 8 m 0 0 l -3 -3 m 3 3 l -3 3" stroke-width="2" opacity="0.8"/>`;
  const pArrowL = (x, y) => `<path d="M ${x} ${y} h -8 m 0 0 l 3 -3 m -3 3 l 3 3" stroke-width="2" opacity="0.8"/>`;

  // [startPose, endPose] per exercise
  const EXERCISE_PICS = {
    barbell_21s: [
      pHead(32,12)+pL("32,17 32,38")+pL("27,56 32,38 37,56")+pL("32,22 26,38")+pL("32,22 38,38")+pBar(32,40,12),
      pHead(32,12)+pL("32,17 32,38")+pL("27,56 32,38 37,56")+pL("32,22 26,32 25,24")+pL("32,22 38,32 39,24")+pBar(32,23,12),
    ],
    tricep_dips: [
      pL("16,30 42,30")+pL("20,30 20,56")+pL("38,30 38,56")+pHead(29,8)+pL("29,13 29,32")+pL("29,17 29,30")+pL("29,32 33,44 30,54"),
      pL("16,30 42,30")+pL("20,30 20,56")+pL("38,30 38,56")+pHead(29,16)+pL("29,21 29,38")+pL("29,24 37,26 35,30")+pL("29,38 33,48 30,56"),
    ],
    pushups: [
      pGround()+pHead(14,24)+pL("16,30 52,52")+pL("16,30 16,56"),
      pGround()+pHead(13,41)+pL("16,46 52,52")+pL("16,46 24,50 24,56"),
    ],
    tricep_ext_barbell: [
      pHead(32,12)+pL("32,17 32,38")+pL("27,56 32,38 37,56")+pL("32,20 33,6")+pBar(33,6,8),
      pHead(32,12)+pL("32,17 32,38")+pL("27,56 32,38 37,56")+pL("32,20 33,11 43,16")+pBar(45,17,7),
    ],
    ring_flys: [
      pRing(16,24,12)+pRing(48,24,52)+pHead(32,14)+pL("32,19 32,40")+pL("27,56 32,40 37,56")+pL("32,23 17,23")+pL("32,23 47,23"),
      pRing(26,22,12)+pRing(38,22,52)+pHead(32,14)+pL("32,19 32,40")+pL("27,56 32,40 37,56")+pL("32,25 27,21")+pL("32,25 37,21"),
    ],
    ring_crossover_pushups: [
      pGround()+pRing(20,42,20)+pHead(16,24)+pL("19,30 52,50")+pL("19,30 20,40"),
      pGround()+pRing(21,40,20)+pHead(16,37)+pL("19,42 52,52")+pL("19,42 27,45 22,41"),
    ],
    roman_chair: [
      pGround()+pL("30,42 54,42")+pL("34,42 34,56")+pL("50,42 50,56")+pL("36,40 52,41")+pHead(11,34)+pL("34,40 14,36"),
      pGround()+pL("30,42 54,42")+pL("34,42 34,56")+pL("50,42 50,56")+pL("36,40 52,41")+pHead(18,54)+pL("34,40 20,51"),
    ],
    bench_leg_raises: [
      pL("12,42 52,42")+pL("16,42 16,54")+pL("48,42 48,54")+pHead(15,36)+pL("20,39 38,39")+pL("38,39 56,34")+pL("24,39 24,45"),
      pL("12,42 52,42")+pL("16,42 16,54")+pL("48,42 48,54")+pHead(15,36)+pL("20,39 38,39")+pL("38,39 40,16")+pL("24,39 24,45"),
    ],
    db_shoulder_press: [
      pHead(32,12)+pL("32,17 32,38")+pL("27,56 32,38 37,56")+pL("32,22 24,28 23,19")+pL("32,22 40,28 41,19")+pDb(23,15)+pDb(41,15),
      pHead(32,12)+pL("32,17 32,38")+pL("27,56 32,38 37,56")+pL("32,22 25,9")+pL("32,22 39,9")+pDb(25,6)+pDb(39,6),
    ],
    db_lateral_raise: [
      pHead(32,12)+pL("32,17 32,38")+pL("27,56 32,38 37,56")+pL("32,22 26,38")+pL("32,22 38,38")+pDb(25,41)+pDb(39,41),
      pHead(32,12)+pL("32,17 32,38")+pL("27,56 32,38 37,56")+pL("32,22 16,22")+pL("32,22 48,22")+pDbV(13,22)+pDbV(51,22),
    ],
    db_forward_raise: [
      pHead(30,12)+pL("30,17 30,38")+pL("26,56 30,38 34,56")+pL("30,21 35,37")+pDb(36,40),
      pHead(30,12)+pL("30,17 30,38")+pL("26,56 30,38 34,56")+pL("30,21 49,21")+pDbV(52,21),
    ],
    ring_face_pullup: [
      pGround()+pRing(41,23,46)+pHead(36,23)+pL("20,56 34,28")+pL("32,30 40,25"),
      pGround()+pRing(37,19,46)+pHead(31,17)+pL("20,56 30,22")+pL("29,25 38,22 35,18"),
    ],
    ring_pike_hold: [
      pGround()+pRing(48,37,48)+pHead(12,30)+pL("14,36 47,38")+pL("14,36 14,56"),
      pGround()+pRing(48,35,48)+pHead(12,33)+pL("14,38 32,18 47,34")+pL("14,38 14,56"),
    ],
    parallettes_l_sit: [
      pGround()+pL("20,42 34,42")+pL("23,42 23,56")+pL("31,42 31,56")+pHead(27,12)+pL("27,17 27,36")+pL("27,21 27,40")+pL("27,36 36,40 36,50"),
      pGround()+pL("20,42 34,42")+pL("23,42 23,56")+pL("31,42 31,56")+pHead(27,12)+pL("27,17 27,36")+pL("27,21 27,40")+pL("27,36 48,34"),
    ],
    plank: [
      pGround()+pHead(13,32)+pL("18,36 50,48 52,56")+pL("20,38 16,52 26,54"),
      pGround()+pHead(13,26)+pL("18,31 50,48 52,56")+pL("18,31 16,54"),
    ],
    kb_squats: [
      pHead(30,12)+pL("30,17 30,38")+pL("26,56 30,38 34,56")+pL("30,21 33,34")+pKb(34,39),
      pHead(30,24)+pL("30,29 26,40")+pL("26,40 37,44 37,56")+pL("26,40 27,48 24,56")+pL("30,31 38,37")+pKb(39,42),
    ],
    kb_lunge_switches: [
      pHead(32,14)+pL("32,19 32,38")+pL("32,38 42,46 42,56")+pL("32,38 24,50 28,56")+pL("32,23 36,29")+pKb(37,33),
      pHead(32,14)+pL("32,19 32,38")+pL("32,38 22,46 22,56")+pL("32,38 40,50 36,56")+pL("32,23 28,29")+pKb(27,33),
    ],
    kb_swings: [
      pGround()+pHead(22,19)+pL("24,24 33,38")+pL("33,38 29,56")+pL("33,38 38,56")+pL("26,27 34,45")+pKb(35,49),
      pGround()+pHead(28,12)+pL("28,17 28,38")+pL("24,56 28,38 32,56")+pL("28,21 47,23")+pKb(50,25),
    ],
    kb_goblet_squat: [
      pHead(32,10)+pL("32,15 32,36")+pL("27,56 32,36 37,56")+pL("32,20 28,26")+pL("32,20 36,26")+pKb(32,28),
      pHead(32,20)+pL("32,25 32,38")+pL("32,38 22,42 24,56")+pL("32,38 42,42 40,56")+pL("32,28 28,32")+pL("32,28 36,32")+pKb(32,34),
    ],
    pendulum_lunges: [
      pGround()+pArrowR(44,22)+pHead(30,16)+pL("30,21 30,38")+pL("30,38 40,46 40,56")+pL("30,38 22,50 26,56"),
      pGround()+pArrowL(20,22)+pHead(30,16)+pL("30,21 30,38")+pL("30,38 36,46 36,56")+pL("30,38 18,48 14,56"),
    ],
    kb_russian_twists: [
      pGround()+pHead(24,22)+pL("34,46 26,28")+pL("34,46 46,36 52,42")+pL("27,32 15,41")+pKb(13,44),
      pGround()+pHead(24,22)+pL("34,46 26,28")+pL("34,46 46,36 52,42")+pL("27,32 40,42")+pKb(43,45),
    ],
    kb_hollow_hold_scissors: [
      pGround()+pHead(12,42)+pL("17,44 36,48")+pL("36,48 54,34")+pL("36,48 52,46")+pL("20,43 24,32")+pKb(25,29),
      pGround()+pHead(12,42)+pL("17,44 36,48")+pL("36,48 54,44")+pL("36,48 50,30")+pL("20,43 24,32")+pKb(25,29),
    ],
  };

  function pic(content) {
    return `<svg class="ex-pic" viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><rect x="0.5" y="0.5" width="63" height="63" rx="12" fill="#000"/><g fill="none" stroke="${PIC_BLUE}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">${content}</g></svg>`;
  }

  function exercisePicsHtml(exerciseId) {
    const p = EXERCISE_PICS[exerciseId];
    if (!p) return "";
    return `<div class="exercise-pics">${pic(p[0])}${pic(p[1])}</div>`;
  }

  // ---------- Defaults ----------
  const DEFAULTS = {
    sets: 4,
    reps: 10,
    maxWeightKg: 200,
    showBest: true,
    proteinTarget: 180,
    stepsTarget: 12500,
    sleepTarget: 80,
  };

  // ---------- IndexedDB ----------
    const CLOUD_URL = "https://workoutlog-ricky-default-rtdb.europe-west1.firebasedatabase.app";
  const CLOUD_KEY = "ricky";
const DB_NAME = "workout_log_db";
  const DB_VER = 4;
  let db = null;

  function idbOpen() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VER);
      req.onupgradeneeded = () => {
        const d = req.result;
        if (!d.objectStoreNames.contains("workouts")) {
          const s = d.createObjectStore("workouts", { keyPath:"id" });
          s.createIndex("byDate", "startedAt");
        }
        if (!d.objectStoreNames.contains("exerciseLogs")) {
          const s = d.createObjectStore("exerciseLogs", { keyPath:"key" }); // key: workoutId|exerciseId
          s.createIndex("byWorkout", "workoutId");
          s.createIndex("byExercise", "exerciseId");
          s.createIndex("byDate", "finishedAt");
        }
        if (!d.objectStoreNames.contains("actions")) {
          d.createObjectStore("actions", { keyPath:"exerciseId" }); // {exerciseId, text, updatedAt}
        }
        if (!d.objectStoreNames.contains("daily")) {
          d.createObjectStore("daily", { keyPath:"id" });
        }
        if (!d.objectStoreNames.contains("settings")) {
          d.createObjectStore("settings", { keyPath:"id" }); // {id:"settings", ...}
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  function tx(store, mode="readonly") {
    return db.transaction(store, mode).objectStore(store);
  }

  function idbGet(store, key) {
    return new Promise((resolve, reject) => {
      const req = tx(store).get(key);
      req.onsuccess = () => resolve(req.result ?? null);
      req.onerror = () => reject(req.error);
    });
  }

  function idbPut(store, value) {
    return new Promise((resolve, reject) => {
      const req = tx(store, "readwrite").put(value);
      req.onsuccess = () => resolve(true);
      req.onerror = () => reject(req.error);
    });
  }

  function idbDel(store, key) {
    return new Promise((resolve, reject) => {
      const req = tx(store, "readwrite").delete(key);
      req.onsuccess = () => resolve(true);
      req.onerror = () => reject(req.error);
    });
  }

  function idbGetAll(store) {
    return new Promise((resolve, reject) => {
      const req = tx(store).getAll();
      req.onsuccess = () => resolve(req.result ?? []);
      req.onerror = () => reject(req.error);
    });
  }

  function idbClearAll() {
    return new Promise((resolve, reject) => {
      const t = db.transaction(["workouts","exerciseLogs","actions","settings"], "readwrite");
      t.oncomplete = () => resolve(true);
      t.onerror = () => reject(t.error);
      t.objectStore("workouts").clear();
      t.objectStore("exerciseLogs").clear();
      t.objectStore("actions").clear();
      t.objectStore("settings").clear();
    });
  }

  async function loadSettings() {
    const s = await idbGet("settings", "settings");
    const merged = { ...DEFAULTS, ...(s?.value ?? {}) };
    return merged;
  }

  async function saveSettings(value) {
    await idbPut("settings", { id:"settings", value });
  }

  // ---------- State ----------
  const state = {
    lastSyncAt: null,
    settings: { ...DEFAULTS },
    currentWorkout: null, // {id, templateId, templateName, startedAt, finishedAt, cardio, notes}
    currentExerciseId: null,
    currentExerciseDraft: null, // {exerciseId, sets, notes, setEntries:[{weightKg,reps}]}
    cachedStats: new Map(), // exerciseId -> { last, best }
    cachedActions: new Map(), // exerciseId -> actionText
    daily: null,
    dailyKey: "",
  };

  // ---------- Views ----------
  function showView(id) {
    $$(".view").forEach(v => v.classList.remove("active"));
    $(id).classList.add("active");
  }

  function setSubtitle(text) {
    $("#subtitle").textContent = text;
  }

  // ---------- Weight/Reps Options ----------
  function buildWeightOptions(maxKg) {
    const opts = [];
    for (let w = 0; w <= maxKg + 1e-9; w += 2.5) {
      const val = round1(w);
      opts.push(`<option value="${val}">${val}</option>`);
    }
    return opts.join("");
  }

  function buildRepsOptions(exerciseId) {
    const opts = [];
    if (isTimeEx(exerciseId)) {
      for (let s = 0; s <= 600; s += 5) {
        opts.push(`<option value="${s}">${s}</option>`);
      }
      return opts.join("");
    }
    for (let r = 0; r <= 50; r++) {
      opts.push(`<option value="${r}">${r}</option>`);
    }
    return opts.join("");
  }

  // ---------- Stats (Last/Best) ----------
  function topSetFromLog(log) {
    // log: { sets:[{weightKg,reps}] }
    // Top set = highest weight; tie-break by reps
    if (!log?.sets?.length) return null;
    let best = null;
    for (const s of log.sets) {
      const w = Number(s.weightKg ?? 0);
      const r = Number(s.reps ?? 0);
      if (!best) best = { weightKg:w, reps:r };
      else if (w > best.weightKg) best = { weightKg:w, reps:r };
      else if (w === best.weightKg && r > best.reps) best = { weightKg:w, reps:r };
    }
    return best;
  }

  function volumeFromLog(log) {
    if (!log?.sets?.length) return 0;
    let v = 0;
    for (const s of log.sets) {
      const w = Number(s.weightKg ?? 0);
      const r = Number(s.reps ?? 0);
      v += (w * r);
    }
    return v;
  }

  async function computeStats(exerciseId) {
    // Find most recent log (Last) and best all-time top set (Best)
    const all = await idbGetAll("exerciseLogs");
    const logs = all.filter(x => x.exerciseId === exerciseId && x.finishedAt);
    logs.sort((a,b) => new Date(b.finishedAt) - new Date(a.finishedAt));

    const lastLog = logs[0] ?? null;
    const lastTop = lastLog ? topSetFromLog(lastLog) : null;

    let bestTop = null;
    for (const l of logs) {
      const t = topSetFromLog(l);
      if (!t) continue;
      if (!bestTop) bestTop = { ...t, finishedAt:l.finishedAt };
      else if (t.weightKg > bestTop.weightKg) bestTop = { ...t, finishedAt:l.finishedAt };
      else if (t.weightKg === bestTop.weightKg && t.reps > bestTop.reps) bestTop = { ...t, finishedAt:l.finishedAt };
    }

    const result = {
      last: lastTop ? { top:lastTop, sets: lastLog.sets.length, when:lastLog.finishedAt } : null,
      best: bestTop ? { top:{ weightKg:bestTop.weightKg, reps:bestTop.reps }, when:bestTop.finishedAt } : null,
    };
    state.cachedStats.set(exerciseId, result);
    return result;
  }

  async function loadAction(exerciseId) {
    if (state.cachedActions.has(exerciseId)) return state.cachedActions.get(exerciseId);
    const a = await idbGet("actions", exerciseId);
    const text = a?.text ?? "";
    state.cachedActions.set(exerciseId, text);
    return text;
  }

  // ---------- Workout Flow ----------
  async function startWorkout(templateId) {
    const t = TEMPLATES[templateId];
    const id = `w_${Date.now()}`;
    state.currentWorkout = {
      id,
      templateId,
      templateName: t.name,
      startedAt: nowIso(),
      finishedAt: null,
      cardio: null, // {type, mins, notes}
      notes: "",
      gymMins: null,
      calories: null,
    };
    await idbPut("workouts", state.currentWorkout);
    cloudPushBestEffort();
    $("#workoutTitle").textContent = t.name;
    $("#workoutMeta").textContent = `Started: ${fmtDate(state.currentWorkout.startedAt)}`;
    $("#workoutKicker").textContent = "Workout in progress";
    $("#cardioType").value = "";
    $("#cardioMins").value = "";
    if ($("#cardioDistance")) $("#cardioDistance").value = "";
    $("#cardioNotes").value = "";
    $("#cardioSavedText").textContent = "";

    const gm = $("#gymMins");
    const gc = $("#gymCals");
    const gtxt = $("#gymStatsSavedText");
    if (gm) gm.value = "";
    if (gc) gc.value = "";
    if (gtxt) gtxt.textContent = "";

    setSubtitle("Workout started.");
    await renderExerciseList();
    showView("#viewWorkout");
  }

  async function cardioSave() {
    if (!state.currentWorkout) return;
    const type = $("#cardioType").value.trim();
    const mins = clampInt($("#cardioMins").value.trim(), 0);
    const distRaw = $("#cardioDistance") ? $("#cardioDistance").value.trim() : "";
    const distanceKm = distRaw ? (Number.isFinite(Number(distRaw)) ? round1(Number(distRaw)) : null) : null;
    const notes = $("#cardioNotes").value.trim();
    if (!type) {
      state.currentWorkout.cardio = null;
      $("#cardioSavedText").textContent = "No cardio saved.";
    } else {
      state.currentWorkout.cardio = { type, mins, distanceKm, notes };
      $("#cardioSavedText").textContent = `Saved: ${type}, ${mins} min${distanceKm ? `, ${distanceKm} km` : ""}${notes ? " — " + notes : ""}`;
    }
    await idbPut("workouts", state.currentWorkout);
    cloudPushBestEffort();
    setSubtitle("Cardio saved.");
  }

  // ---------- Inline set logging (tick a set -> pick reps / kg) ----------
  const MAX_SETS = 6;

  function inlineRepsOptions(exId, selected) {
    const isTime = isTimeEx(exId);
    const max = isTime ? 600 : 50;
    const step = isTime ? 5 : 1;
    const start = isTime ? 5 : 1;
    let html = "";
    for (let v = start; v <= max; v += step) {
      html += `<option value="${v}"${v === selected ? " selected" : ""}>${v}</option>`;
    }
    return html;
  }

  function inlineKgOptions(selected) {
    let html = "";
    for (let v = 1; v <= 30; v++) {
      html += `<option value="${v}"${v === selected ? " selected" : ""}>${v}</option>`;
    }
    return html;
  }

  const clampKg = (v) => Math.min(30, Math.max(1, Math.round(Number(v) || 10)));

  function buildInlineSets(ex, existing, prev) {
    const weighted = ex.type === "strength";
    const isTime = ex.type === "bodyweight_time";
    const unit = isTime ? "sec" : "reps";
    const rows = [];
    for (let i = 0; i < MAX_SETS; i++) {
      const cur = existing?.sets?.[i] ?? null;
      const hint = prev?.sets?.[i] ?? null;
      const checked = !!cur;
      const defReps = Number(cur?.reps) || Number(hint?.reps) || (isTime ? 30 : DEFAULTS.reps);
      const defKg = clampKg(cur?.weightKg ?? hint?.weightKg ?? 10);
      const hintTxt = hint ? (weighted ? `Prev: ${hint.weightKg}kg×${hint.reps}` : `Prev: ${hint.reps} ${unit}`) : "";
      rows.push(`
        <div class="iset-row">
          <label class="iset-tick">
            <input type="checkbox" class="isetChk" data-ex="${ex.id}" data-i="${i}" ${checked ? "checked" : ""}/>
            Set ${i + 1}
          </label>
          <div class="iset-fields" style="${checked ? "" : "display:none;"}">
            ${weighted ? `<select class="isetKg" data-ex="${ex.id}" data-i="${i}">${inlineKgOptions(defKg)}</select><span class="mini">kg</span>` : ""}
            <select class="isetReps" data-ex="${ex.id}" data-i="${i}">${inlineRepsOptions(ex.id, defReps)}</select><span class="mini">${unit}</span>
          </div>
          ${hintTxt ? `<span class="mini iset-hint">${hintTxt}</span>` : ""}
        </div>`);
    }
    return rows.join("");
  }

  function collectInlineEntries(exId) {
    const entries = [];
    $$(`.isetChk[data-ex="${exId}"]`).forEach(chk => {
      if (!chk.checked) return;
      const i = chk.getAttribute("data-i");
      const repsSel = document.querySelector(`.isetReps[data-ex="${exId}"][data-i="${i}"]`);
      const kgSel = document.querySelector(`.isetKg[data-ex="${exId}"][data-i="${i}"]`);
      entries.push({ weightKg: kgSel ? Number(kgSel.value) : 0, reps: repsSel ? Number(repsSel.value) : 0 });
    });
    return entries;
  }

  async function saveInlineLog(exId) {
    if (!state.currentWorkout) return;
    const entries = collectInlineEntries(exId);
    const key = `${state.currentWorkout.id}|${exId}`;
    const notesEl = document.querySelector(`.isetNotes[data-ex="${exId}"]`);
    const notes = notesEl ? notesEl.value.trim() : "";

    if (!entries.length && !notes) {
      await idbDel("exerciseLogs", key);
    } else {
      await idbPut("exerciseLogs", {
        key,
        workoutId: state.currentWorkout.id,
        exerciseId: exId,
        finishedAt: nowIso(),
        sets: entries.map((s, i) => ({ set: i + 1, weightKg: Number(s.weightKg), reps: Number(s.reps) })),
        notes,
      });
    }
    state.cachedStats.delete(exId);
    cloudPushBestEffort();

    const statusEl = document.querySelector(`.iset-status[data-ex="${exId}"]`);
    if (statusEl) statusEl.textContent = entries.length ? `Saved: ${entries.length} set${entries.length > 1 ? "s" : ""} ✅` : "";
  }

  async function renderExerciseList() {
    const t = TEMPLATES[state.currentWorkout.templateId];
    const container = $("#exerciseList");
    container.innerHTML = "";

    for (const exId of t.exercises) {
      const ex = findExercise(exId);
      if (!ex) continue;

      const stats = await computeStats(exId);
      const action = await loadAction(exId);
      const existing = await idbGet("exerciseLogs", `${state.currentWorkout.id}|${exId}`);
      const prev = await previousLog(exId, state.currentWorkout.startedAt);

      const lastLine = stats.last
        ? `Last: ${fmtTop(exId, stats.last.top)} (${stats.last.sets} sets)`
        : "Last: —";
      const bestLine = state.settings.showBest && stats.best
        ? `Best: ${fmtTop(exId, stats.best.top)}`
        : (state.settings.showBest ? "Best: —" : "");

      const actionLine = action ? `Action: ${action}` : "Action: —";

      const card = document.createElement("div");
      card.className = "exercise-card";
      card.innerHTML = `
        <div class="exercise-top">
          <div>
            <div class="exercise-name">${ex.name}</div>
            <div class="exercise-mini">${lastLine}${bestLine ? "<br/>" + bestLine : ""}<br/>${actionLine}</div>
          </div>
          <div class="exercise-side">
            <div class="badge">${ex.group}</div>
            ${exercisePicsHtml(exId)}
          </div>
        </div>
        <div class="iset-list">${buildInlineSets(ex, existing, prev)}</div>
        <div class="row" style="width:100%;">
          <input class="isetNotes" data-ex="${exId}" placeholder="Notes (optional)" value="${escapeHtml(existing?.notes ?? "")}" style="flex:1;"/>
          <button class="secondary" data-action-ex="${exId}">Action</button>
        </div>
        <div class="mini iset-status" data-ex="${exId}"></div>
      `;
      container.appendChild(card);
    }

    // Idempotent handlers (container persists across renders)
    container.onchange = async (e) => {
      const tEl = e.target;
      if (tEl.classList.contains("isetChk")) {
        const fields = tEl.closest(".iset-row")?.querySelector(".iset-fields");
        if (fields) fields.style.display = tEl.checked ? "" : "none";
        await saveInlineLog(tEl.getAttribute("data-ex"));
      } else if (tEl.classList.contains("isetReps") || tEl.classList.contains("isetKg") || tEl.classList.contains("isetNotes")) {
        await saveInlineLog(tEl.getAttribute("data-ex"));
      }
    };
    container.onclick = async (e) => {
      const btn = e.target.closest("[data-action-ex]");
      if (!btn) return;
      const exId = btn.getAttribute("data-action-ex");
      state.currentExerciseId = exId;
      state.currentExerciseDraft = {
        workoutId: state.currentWorkout.id,
        exerciseId: exId,
        setEntries: collectInlineEntries(exId),
      };
      await openActionModal();
    };
  }

  function makeSetRow(setIndex, weightOptionsHtml, repsOptionsHtml, defaultWeight, defaultReps, exType, exerciseId, prevHint) {
    const isBody = (exType === "bodyweight" || exType === "bodyweight_time");
    const weightCol = isBody ? `
        <div>
          <div class="mini">bodyweight</div>
        </div>
      ` : `
        <div>
          <select class="weightSel" data-set="${setIndex}">
            ${weightOptionsHtml.replace(`value="${defaultWeight}"`, `value="${defaultWeight}" selected`)}
          </select>
          <div class="mini">kg</div>
        </div>
      `;

    const label = isTimeEx(exerciseId) ? "sec" : "reps";
    const repsCol = `
        <div>
          <select class="repsSel" data-set="${setIndex}">
            ${repsOptionsHtml.replace(`value="${defaultReps}"`, `value="${defaultReps}" selected`)}
          </select>
          <div class="mini">${label}</div>
        </div>
      `;

    const hint = prevHint ? (() => {
      const w = Number(prevHint.weightKg ?? 0);
      const r = Number(prevHint.reps ?? 0);
      if (isTimeEx(exerciseId)) return `Prev: ${r} sec`;
      if (isBody) return `Prev: ${r} reps`;
      return `Prev: ${w}kg×${r}`;
    })() : "";

    return `
      <div class="set-row" style="grid-template-columns:${isBody ? "72px 1fr" : "72px 1fr 1fr"}">
        <div class="set-label">Set ${setIndex + 1}</div>
        ${isBody ? repsCol : weightCol + repsCol}
              ${hint ? `<div class="mini" style="grid-column:1/-1; margin-top:6px;">${hint}</div>` : ""}
      </div>
    `;
  }

  async function openExerciseModal(exerciseId) {
    if (!state.currentWorkout) return;

    const ex = findExercise(exerciseId);
    state.currentExerciseId = exerciseId;

    // default draft
    const sets = DEFAULTS.sets;
    const draft = {
      workoutId: state.currentWorkout.id,
      exerciseId,
      sets,
      setEntries: Array.from({ length: sets }, () => ({ weightKg: 0, reps: DEFAULTS.reps })),
      notes: "",
      gymMins: null,
      calories: null,
    };
    state.currentExerciseDraft = draft;

    // If you've already logged this exercise in this workout, load it so it doesn't reset
    const existingKey = `${draft.workoutId}|${draft.exerciseId}`;
    const existing = await idbGet("exerciseLogs", existingKey);
    const existingEntries = existing?.sets ? existing.sets.map(s => ({ weightKg: s.weightKg, reps: s.reps })) : null;
    const existingNotes = existing?.notes ?? "";
    const existingSetCount = existing?.sets?.length ?? null;
    if (existingEntries && existingSetCount) {
      state.currentExerciseDraft.sets = existingSetCount;
      state.currentExerciseDraft.setEntries = existingEntries.map(e => ({ weightKg: Number(e.weightKg ?? 0), reps: Number(e.reps ?? DEFAULTS.reps) }));
      state.currentExerciseDraft.notes = existingNotes;
    }

    // Use previous session's per-set weights/reps as recommended defaults (so each set has a target)
    let prevHints = null;
    if (!(existingEntries && existingSetCount)) {
      const prev = await previousLog(draft.exerciseId, state.currentWorkout.startedAt);
      if (prev?.sets?.length) {
        const clampCount = Math.max(3, Math.min(5, prev.sets.length));
        const prevSets = prev.sets.slice(0, clampCount).map(s => ({ weightKg: Number(s.weightKg ?? 0), reps: Number(s.reps ?? DEFAULTS.reps) }));
        prevHints = prevSets;
        // Prefill the draft with those targets (strength moves). For bodyweight, weight stays 0 anyway.
        state.currentExerciseDraft.sets = clampCount;
        state.currentExerciseDraft.setEntries = prevSets.map(s => ({ weightKg: s.weightKg, reps: s.reps }));
        state.currentExerciseDraft.prevHints = prevHints;
      }
    } else {
      // still show previous targets as hints even if we already logged this exercise today
      const prev = await previousLog(draft.exerciseId, state.currentWorkout.startedAt);
      if (prev?.sets?.length) {
        const clampCount = Math.max(3, Math.min(5, prev.sets.length));
        prevHints = prev.sets.slice(0, clampCount).map(s => ({ weightKg: Number(s.weightKg ?? 0), reps: Number(s.reps ?? DEFAULTS.reps) }));
        state.currentExerciseDraft.prevHints = prevHints;
      }
    }

    // stats / action
    const stats = await computeStats(exerciseId);
    const action = await loadAction(exerciseId);

    $("#modalTitle").textContent = ex.name;
    $("#modalKicker").textContent = `${ex.group}`;
    const modalPics = $("#modalPics");
    if (modalPics) modalPics.innerHTML = exercisePicsHtml(exerciseId);
    $("#exerciseNotes").value = state.currentExerciseDraft.notes || "";
    $("#setCount").value = String(state.currentExerciseDraft.sets || DEFAULTS.sets);

    const lastTxt = stats.last ? `Last: ${fmtTop(exerciseId, stats.last.top)}` : "Last: —";
    const bestTxt = state.settings.showBest
      ? (stats.best ? `Best: ${fmtTop(exerciseId, stats.best.top)}` : "Best: —")
      : "";
    $("#modalLastBest").textContent = bestTxt ? `${lastTxt}  •  ${bestTxt}` : lastTxt;

    $("#modalActionHint").textContent = action ? `Saved action: ${action}` : "Saved action: —";

    $("#modalStatus").textContent = "";

    buildSetsUI(state.currentExerciseDraft.sets || DEFAULTS.sets, state.currentExerciseDraft.setEntries, state.currentExerciseDraft.prevHints);
    showModal("#exerciseModal");
  }

  function buildSetsUI(setCount, existingEntries, prevHints) {
    const ex = findExercise(state.currentExerciseId);
    const exType = ex?.type ?? "strength";
    const maxW = state.settings.maxWeightKg;
    const weightOpts = buildWeightOptions(maxW);
    const repsOpts = buildRepsOptions(state.currentExerciseId);
    const container = $("#setsContainer");
    container.innerHTML = "";

    const entries = existingEntries && Array.isArray(existingEntries) ? existingEntries.slice(0) : [];
    // Normalize entries to {weightKg, reps}
    const norm = entries.map(e => ({ weightKg: Number(e.weightKg ?? 0), reps: Number(e.reps ?? DEFAULTS.reps) }));

    for (let i = 0; i < setCount; i++) {
      const init = norm[i] ?? { weightKg: 0, reps: DEFAULTS.reps };
      const ph = (prevHints && Array.isArray(prevHints)) ? prevHints[i] : null;
      container.insertAdjacentHTML("beforeend", makeSetRow(i, weightOpts, repsOpts, init.weightKg, init.reps, exType, state.currentExerciseId, ph));
    }

    // update draft but preserve existing values
    state.currentExerciseDraft.sets = setCount;
    state.currentExerciseDraft.setEntries = Array.from({ length: setCount }, (_, i) => {
      const init = norm[i] ?? { weightKg: 0, reps: DEFAULTS.reps };
      return { weightKg: init.weightKg, reps: init.reps };
    });

    // attach listeners
    $$(".weightSel").forEach(sel => {
      sel.addEventListener("change", () => {
        const idx = Number(sel.getAttribute("data-set"));
        state.currentExerciseDraft.setEntries[idx].weightKg = Number(sel.value);
      });
    });
    $$(".repsSel").forEach(sel => {
      sel.addEventListener("change", () => {
        const idx = Number(sel.getAttribute("data-set"));
        state.currentExerciseDraft.setEntries[idx].reps = Number(sel.value);
      });
    });

  }

  async function saveExerciseLog() {
    const d = state.currentExerciseDraft;
    if (!d) return;

    // pull latest values (in case)
    $$(".weightSel").forEach(sel => {
      const idx = Number(sel.getAttribute("data-set"));
      d.setEntries[idx].weightKg = Number(sel.value);
    });
    // If no weight selectors (bodyweight), keep weight at 0
    if ($$(".weightSel").length === 0) {
      d.setEntries = d.setEntries.map(s => ({ weightKg: 0, reps: s.reps }));
    }
    $$(".repsSel").forEach(sel => {
      const idx = Number(sel.getAttribute("data-set"));
      d.setEntries[idx].reps = Number(sel.value);
    });
    d.notes = $("#exerciseNotes").value.trim();

    const key = `${d.workoutId}|${d.exerciseId}`;
    const record = {
      key,
      workoutId: d.workoutId,
      exerciseId: d.exerciseId,
      finishedAt: nowIso(),
      sets: d.setEntries.map((s, i) => ({ set:i+1, weightKg:Number(s.weightKg), reps:Number(s.reps) })),
      notes: d.notes,
    };
    await idbPut("exerciseLogs", record);
    $("#modalStatus").textContent = "Saved ✅";

    // invalidate caches
    state.cachedStats.delete(d.exerciseId);

    setSubtitle("Exercise saved.");
    hideModal("#exerciseModal");
    await renderExerciseList();
  }

  // ---------- Action Next Time ----------
  function suggestAction(exerciseId, draft, stats) {
    // Simple auto suggestion:
    // If today top set >= last top set (weight,reps) -> suggest +2.5kg next time if reps>=10, else +1 rep
    // Else suggest match last or drop weight to hit 4x10.
    const topToday = (() => {
      let best = null;
      for (const s of draft.setEntries) {
        const w = Number(s.weightKg ?? 0);
        const r = Number(s.reps ?? 0);
        if (!best) best = { weightKg:w, reps:r };
        else if (w > best.weightKg) best = { weightKg:w, reps:r };
        else if (w === best.weightKg && r > best.reps) best = { weightKg:w, reps:r };
      }
      return best;
    })();

    const last = stats?.last?.top ?? null;
    const timeBased = isTimeEx(exerciseId);
    const weighted = isStrengthEx(exerciseId);

    if (timeBased) {
      if (!topToday) return "Aim: hold with clean form, build up time gradually.";
      if (!last) return "Next time: add +5–10 sec to your best hold.";
      if (topToday.reps >= last.reps) return "Next time: add +5–10 sec on your longest hold.";
      return "Next time: aim to match your last best hold time.";
    }

    if (!weighted) {
      if (!topToday) return "Aim: complete 4×10 with clean form.";
      if (!last) return "Next time: add +1–2 reps on your first set.";
      if (topToday.reps >= last.reps) return "Next time: add +1 rep per set (or slow the tempo for difficulty).";
      return "Next time: aim to match last time, focus on full range of motion.";
    }

    if (!topToday) return "Aim: complete 4×10 with clean form.";

    if (!last) {
      if (topToday.reps >= 10) return "Next time: add +2.5kg and aim for 4×10 (or as close as possible).";
      return "Next time: keep weight the same and add +1–2 reps on your first set.";
    }

    const improved = (topToday.weightKg > last.weightKg) || (topToday.weightKg === last.weightKg && topToday.reps >= last.reps);

    if (improved) {
      if (topToday.reps >= 10) return "Next time: add +2.5kg if you can keep set 1–2 at 10 reps.";
      return "Next time: keep the same weight and add +1 rep on set 1 (then match across sets).";
    }

    // worse than last
    if (last.reps >= 10) return "Next time: try to match last time; if not, drop 2.5kg and hit 4×10.";
    return "Next time: keep weight the same and aim to beat last time by +1 rep on your top set.";
  }

  async function openActionModal() {
    const exId = state.currentExerciseId;
    const ex = findExercise(exId);
    const stats = await computeStats(exId);
    const currentSaved = await loadAction(exId);

    $("#actionTitle").textContent = ex.name;

    const suggestion = suggestAction(exId, state.currentExerciseDraft, stats);
    $("#actionSuggestion").textContent = `Suggestion: ${suggestion}`;
    $("#actionText").value = currentSaved || suggestion;

    $("#actionStatus").textContent = "";
    showModal("#actionModal");
  }

  async function saveAction() {
    const exId = state.currentExerciseId;
    const text = $("#actionText").value.trim();
    await idbPut("actions", { exerciseId: exId, text, updatedAt: nowIso() });
    state.cachedActions.set(exId, text);
    $("#actionStatus").textContent = "Saved ✅";
    $("#modalActionHint").textContent = text ? `Saved action: ${text}` : "Saved action: —";
    setSubtitle("Action saved.");
    setTimeout(() => hideModal("#actionModal"), 250);
  }

  
  async function saveGymStats() {
    if (!state.currentWorkout) return;
    const mins = $("#gymMins") ? $("#gymMins").value.trim() : "";
    const cals = $("#gymCals") ? $("#gymCals").value.trim() : "";
    const m = mins ? Number.parseInt(mins, 10) : null;
    const c = cals ? Number.parseInt(cals, 10) : null;
    state.currentWorkout.gymMins = Number.isFinite(m) ? m : null;
    state.currentWorkout.calories = Number.isFinite(c) ? c : null;
    await idbPut("workouts", state.currentWorkout);
    cloudPushBestEffort();
    const t = $("#gymStatsSavedText");
    if (t) t.textContent = `Saved: ${state.currentWorkout.gymMins ?? "—"} min, ${state.currentWorkout.calories ?? "—"} cals`;
    setSubtitle("Gym stats saved.");
  }


  
  
  function fmtAgo(iso) {
    if (!iso) return "";
    const t = Date.parse(iso);
    if (!Number.isFinite(t)) return "";
    const diff = Math.max(0, Date.now() - t);
    const s = Math.floor(diff / 1000);
    if (s < 10) return "just now";
    if (s < 60) return `${s}s ago`;
    const m = Math.floor(s / 60);
    if (m < 60) return `${m}m ago`;
    const h = Math.floor(m / 60);
    if (h < 48) return `${h}h ago`;
    const d = Math.floor(h / 24);
    return `${d}d ago`;
  }

  function updateLastSyncLine() {
    const el = $("#lastSyncLine");
    if (!el) return;
    if (!state.lastSyncAt) {
      el.textContent = "Last sync: —";
      return;
    }
    el.textContent = `Last sync: ${fmtAgo(state.lastSyncAt)} (${new Date(state.lastSyncAt).toLocaleString()})`;
  }

// ---------- Cloud Sync (Firebase RTDB REST) ----------
  function cloudPath(path) {
    const p = path.startsWith("/") ? path.slice(1) : path;
    return `${CLOUD_URL}/${p}.json`;
  }

  async function cloudGetSnapshot() {
    const url = cloudPath(`workoutlog/${CLOUD_KEY}/snapshot`);
    const res = await fetch(url, { method:"GET", cache:"no-store" });
    if (!res.ok) return null;
    const data = await res.json();
    return data || null;
  }

  async function cloudPutSnapshot(snapshot) {
    const url = cloudPath(`workoutlog/${CLOUD_KEY}/snapshot`);
    const res = await fetch(url, {
      method:"PUT",
      headers:{ "Content-Type":"application/json" },
      body: JSON.stringify(snapshot),
    });
    return res.ok;
  }

  async function makeLocalSnapshot() {
    const workouts = await idbGetAll("workouts");
    const exerciseLogs = await idbGetAll("exerciseLogs");
    const daily = await idbGetAll("daily");
    const settings = state.settings || await loadSettings();
    return {
      updatedAt: nowIso(),
      workouts,
      exerciseLogs,
      daily,
      settings,
    };
  }

  async function applySnapshotToLocal(snapshot) {
    if (!snapshot) return;
    await idbClear("workouts");
    await idbClear("exerciseLogs");
    await idbClear("daily");
    // settings store is key/value; we just write one record "app"
    await idbPutMany("workouts", snapshot.workouts || []);
    await idbPutMany("exerciseLogs", snapshot.exerciseLogs || []);
    await idbPutMany("daily", snapshot.daily || []);
    if (snapshot.settings) {
      await idbPut("settings", { id:"app", ...snapshot.settings });
    }
  }

  
  function updateCloudButtons() {
    const online = navigator.onLine !== false;
    const syncBtn = $("#btnSyncNow");
    const resetBtn = $("#btnCloudResetLocal");
    $("#btnResetUiState")?.addEventListener("click", () => resetUiState(true));

    // Export modal controls (v13)
    $("#btnExportClose")?.addEventListener("click", () => closeExportModal());
    $("#exportModal")?.addEventListener("click", (e) => {
      if (e.target && e.target.id === "exportModal") closeExportModal();
    });
    $("#btnExportSelectAll")?.addEventListener("click", () => {
      const ta = $("#exportTextArea");
      if (!ta) return;
      ta.focus();
      ta.select();
    });
    $("#btnExportCopy")?.addEventListener("click", async () => {
      const ta = $("#exportTextArea");
      const status = $("#exportModalStatus");
      if (!ta) return;
      const text = ta.value || "";
      let ok = false;
      try {
        if (navigator.clipboard && navigator.clipboard.writeText) {
          await navigator.clipboard.writeText(text);
          ok = true;
        }
      } catch (_) {}
      if (!ok) ok = copyTextFallback(text);
      if (status) status.textContent = ok ? "Copied ✅" : "Copy failed — tap Select all then Copy.";
    });
    $("#btnExportShare")?.addEventListener("click", async () => {
      const ta = $("#exportTextArea");
      const status = $("#exportModalStatus");
      if (!ta) return;
      const text = ta.value || "";
      try {
        if (navigator.share) {
          await navigator.share({ text });
          if (status) status.textContent = "Shared ✅";
        } else {
          if (status) status.textContent = "Share not available on this browser.";
        }
      } catch (_) {
        if (status) status.textContent = "Share cancelled.";
      }
    });


    if (syncBtn) syncBtn.disabled = !online;
    if (resetBtn) resetBtn.disabled = !online;
    if (!online) {
      setCloudStatus("Cloud: offline (connect to internet).");
    }
  }

function setCloudStatus(text) {
    const el = $("#cloudStatus");
    if (el) el.textContent = text || "";
    const info = $("#cloudSyncInfo");
    if (info) info.textContent = text || "";
  
    updateLastSyncLine();
  }

  async function syncNow(direction) {
    // direction: "pull" to force reset local from cloud, else bidirectional (newest wins)
    try {
      updateCloudButtons();
      setCloudStatus("Cloud: syncing…");
      const cloud = await cloudGetSnapshot();
      const local = await makeLocalSnapshot();

      const cloudAt = cloud?.updatedAt ? Date.parse(cloud.updatedAt) : 0;
      const localAt = local?.updatedAt ? Date.parse(local.updatedAt) : 0;

      if (direction === "pull") {
        if (cloud) {
          await applySnapshotToLocal(cloud);
          state.settings = await loadSettings();
          await loadDaily();
          state.lastSyncAt = nowIso();
          setCloudStatus(`Cloud: pulled ✅ (cloud ${cloud.updatedAt})`);
        } else {
          setCloudStatus("Cloud: nothing to pull yet.");
        }
        return;
      }

      // Newest wins
      if (cloud && cloudAt > localAt) {
        await applySnapshotToLocal(cloud);
        state.settings = await loadSettings();
        await loadDaily();
        state.lastSyncAt = nowIso();
          setCloudStatus(`Cloud: pulled ✅ (cloud ${cloud.updatedAt})`);
      } else {
        const ok = await cloudPutSnapshot(local);
        if (ok) state.lastSyncAt = nowIso();
        setCloudStatus(ok ? `Cloud: pushed ✅ (local ${local.updatedAt})` : "Cloud: push failed.");
      }
    } catch (e) {
      setCloudStatus("Cloud: sync failed (check internet / try again).");
    }
  }

  // Push after local writes (best-effort)
  async function cloudPushBestEffort() {
    try {
      const snap = await makeLocalSnapshot();
      await cloudPutSnapshot(snap);
    } catch (e) {
      // ignore
    }
  }

// ---------- Export Sheet (iOS-friendly copy) ----------
  function openExportSheet(text) {
    const sheet = $("#exportSheet");
    const ta = $("#exportText");
    const status = $("#exportStatus");
    if (!sheet || !ta) return;

    ta.value = text || "";
    if (status) status.textContent = "";
    sheet.classList.remove("hidden");

    // Scroll to top and focus for easier manual selection if needed
    ta.scrollTop = 0;
    ta.focus();
    ta.setSelectionRange(0, 0);
  }

  function closeExportSheet() {
    const sheet = $("#exportSheet");
    if (!sheet) return;
    sheet.classList.add("hidden");
  }

  async function copyExportToClipboard() {
    const ta = $("#exportText");
    const status = $("#exportStatus");
    const text = ta ? ta.value : "";
    if (!text) return;

    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(text);
      } else {
        // Fallback: select all and execCommand
        ta.focus();
        ta.select();
        document.execCommand("copy");
        ta.setSelectionRange(0, 0);
      }
      if (status) status.textContent = "Copied ✅ Now paste into ChatGPT.";
    } catch (e) {
      if (status) status.textContent = "Could not auto-copy. Tap and hold in the box → Select All → Copy.";
    }
  }

  function openChatGPT() {
    // Try app link first, fall back to website
    const url = "https://chat.openai.com/";
    window.open(url, "_blank");
  }

// ---------- Finish Workout ----------
  async function finishWorkout() {
    if (!state.currentWorkout) return;

    state.currentWorkout.finishedAt = nowIso();
    await idbPut("workouts", state.currentWorkout);
    cloudPushBestEffort();

    // build summary + export text
    const exportText = await buildExportText(state.currentWorkout.id);
    $("#finishSummary").innerHTML = renderSummaryHtml(exportText);

    $("#exportStatus").textContent = "";
    showView("#viewFinish");
    setSubtitle("Workout finished.");
  }

  function renderSummaryHtml(exportText) {
    // Simple readable HTML for the finish screen
    const lines = exportText.split("\n").slice(0, 18); // just a taste on screen
    const html = lines.map(l => `<div>${escapeHtml(l)}</div>`).join("");
    return `<div class="mini">Preview (export includes full detail):</div><div style="margin-top:8px">${html}</div>`;
  }

  function escapeHtml(s){
    return String(s)
      .replaceAll("&","&amp;")
      .replaceAll("<","&lt;")
      .replaceAll(">","&gt;")
      .replaceAll('"',"&quot;")
      .replaceAll("'","&#039;");
  }

  async function buildExportText(workoutId) {
    const workout = await idbGet("workouts", workoutId);
    const allLogs = await idbGetAll("exerciseLogs");
    const logs = allLogs.filter(x => x.workoutId === workoutId);
    logs.sort((a,b) => (EXERCISES.findIndex(e => e.id === a.exerciseId) - EXERCISES.findIndex(e => e.id === b.exerciseId)));

    const start = new Date(workout.startedAt);
    const end = new Date(workout.finishedAt || workout.startedAt);
    const durMin = Math.max(0, Math.round((end - start) / 60000));

    const out = [];
    out.push(`WORKOUT REPORT`);
    out.push(`Template: ${workout.templateName}`);
    out.push(`Started: ${fmtDate(workout.startedAt)}`);
    out.push(`Finished: ${workout.finishedAt ? fmtDate(workout.finishedAt) : "—"}`);
    out.push(`Duration: ${durMin} min`);
    if (workout.gymMins != null) out.push(`Workout time: ${workout.gymMins} min`);
    if (workout.calories != null) out.push(`Calories (iWatch): ${workout.calories}`);
    out.push("");

    if (workout.cardio?.type) {
      out.push(`CARDIO`);
      const distTxt = workout.cardio.distanceKm ? `, ${workout.cardio.distanceKm} km` : "";
      out.push(`- ${workout.cardio.type}: ${workout.cardio.mins ?? 0} min${distTxt}${workout.cardio.notes ? " — " + workout.cardio.notes : ""}`);
      out.push("");
    }

    out.push(`EXERCISES`);
    for (const log of logs) {
      const ex = findExercise(log.exerciseId) ?? { name: log.exerciseId, group: "", type: "bodyweight" };
      const stats = await computeStats(log.exerciseId); // includes last/best; NOTE: last includes this log too, but ok for export
      // Build last excluding current: quick method: find previous log
      const prev = await previousLog(log.exerciseId, log.finishedAt);
      const prevTop = prev ? topSetFromLog(prev) : null;
      const best = stats.best?.top ?? null;

      const top = topSetFromLog(log);
      const sets = log.sets.length;
      const timeBased = ex.type === "bodyweight_time";
      const weighted = ex.type === "strength";
      const unit = timeBased ? "sec" : "reps";

      const workLine = weighted
        ? `Volume: ${Math.round(volumeFromLog(log))}kg`
        : `Total: ${log.sets.reduce((a, s) => a + Number(s.reps ?? 0), 0)} ${unit}`;

      out.push(`- ${ex.name}${ex.group ? ` (${ex.group})` : ""}`);
      out.push(`  Today: top ${fmtTop(log.exerciseId, top)} | Sets: ${sets} | ${workLine}`);
      out.push(`  Last: ${fmtTop(log.exerciseId, prevTop)}${prev ? ` (${fmtDate(prev.finishedAt)})` : ""}`);
      out.push(`  Best: ${fmtTop(log.exerciseId, best)}`);
      out.push(`  Sets logged: ${log.sets.map(s => weighted ? `${s.weightKg}kg×${s.reps}` : `${s.reps} ${unit}`).join("  |  ")}`);
      if (log.notes) out.push(`  Notes: ${log.notes}`);
      const action = await loadAction(log.exerciseId);
      if (action) out.push(`  Action next time: ${action}`);
      out.push("");
    }

    out.push(`COACHING REQUEST`);
    out.push(`Please summarise this session and tell me what to adjust next time for each exercise (load/reps/sets), and any weekly pattern if you see one.`);
    return out.join("\n");
  }

  async function previousLog(exerciseId, currentFinishedAt) {
    const all = await idbGetAll("exerciseLogs");
    const logs = all.filter(x => x.exerciseId === exerciseId && x.finishedAt && x.finishedAt < currentFinishedAt);
    logs.sort((a,b) => new Date(b.finishedAt) - new Date(a.finishedAt));
    return logs[0] ?? null;
  }

  async function exportToChatGPT() {
    if (!state.currentWorkout) return;
    const exportText = await buildExportText(state.currentWorkout.id);
    try {
      await navigator.clipboard.writeText(exportText);
      $("#exportStatus").textContent = "Copied to clipboard ✅ Paste it into ChatGPT.";
    } catch {
      // fallback
      $("#exportStatus").textContent = "Copy failed. Your browser may block clipboard. Use the manual copy prompt.";
      window.openExportSheet(text);
    // auto-copy for convenience
    copyExportToClipboard();
}
  }

  function openChatGPT() {
    // Opens ChatGPT in a new tab/window (PWA: should open Safari)
    window.open("https://chatgpt.com", "_blank");
  }

  
  function copyTextFallback(text) {
    try {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.setAttribute("readonly", "true");
      ta.style.position = "fixed";
      ta.style.top = "-1000px";
      ta.style.left = "-1000px";
      document.body.appendChild(ta);
      ta.focus();
      ta.select();
      const ok = document.execCommand("copy");
      document.body.removeChild(ta);
      return ok;
    } catch (_) {
      return false;
    }
  }

  function openExportModal(text) {
    const modal = $("#exportModal");
    const ta = $("#exportTextArea");
    const status = $("#exportModalStatus");
    if (!modal || !ta) {
      // fallback: show prompt (old behaviour)
      window.prompt("Copy this report:", text);
      return;
    }
    ta.value = text;
    if (status) status.textContent = "";
    modal.classList.remove("hidden");

    // ensure selection is easy on iOS
    setTimeout(() => {
      try {
        ta.focus();
      } catch (_) {}
    }, 50);
  }

  function closeExportModal() {
    const modal = $("#exportModal");
    if (modal) modal.classList.add("hidden");
  }


  // ---------- UI Recovery ----------
  function resetUiState(showMessage) {
    try {
      localStorage.removeItem("actionModalOpen");
      localStorage.removeItem("exportModalOpen");
      localStorage.removeItem("exerciseModalOpen");
      localStorage.removeItem("uiState");
      localStorage.removeItem("pendingActionExerciseId");
      sessionStorage.removeItem("actionModalOpen");
      sessionStorage.removeItem("exportModalOpen");
      sessionStorage.removeItem("exerciseModalOpen");
      sessionStorage.removeItem("uiState");
    } catch (_) {}

    ["#actionModal","#exerciseModal","#exportModal","#exportSheet"].forEach((sel) => {
      const el = $(sel);
      if (!el) return;
      el.classList.add("hidden");
      el.classList.remove("show");
      el.setAttribute("aria-hidden", "true");
      el.style.display = "";
    });

    if (showMessage) {
      const s = $("#uiResetStatus");
      if (s) s.textContent = "UI state reset ✅";
    }
  }

  function applyStartupRecovery() {
    try {
      const url = new URL(window.location.href);
      if (url.searchParams.get("resetUI") === "1") {
        resetUiState(false);
        url.searchParams.delete("resetUI");
        history.replaceState({}, "", url.toString());
      }
    } catch (_) {}

    resetUiState(false);
  }

// ---------- History ----------
  async function renderHistory() {
    const workouts = await idbGetAll("workouts");
    workouts.sort((a,b) => new Date(b.startedAt) - new Date(a.startedAt));
    const box = $("#historyList");
    box.innerHTML = "";

    if (!workouts.length) {
      box.innerHTML = `<div class="mini">No workouts yet.</div>`;
      return;
    }

    for (const w of workouts) {
      const start = new Date(w.startedAt);
      const end = new Date(w.finishedAt || w.startedAt);
      const durMin = Math.max(0, Math.round((end - start) / 60000));

      const item = document.createElement("div");
      item.className = "history-item";
      item.innerHTML = `
        <h4>${w.templateName}</h4>
        <div class="mini">Started: ${fmtDate(w.startedAt)}</div>
        <div class="mini">Duration: ${durMin} min</div>
        <div class="mini">${w.cardio?.type ? `Cardio: ${w.cardio.type} ${w.cardio.mins ?? 0} min${w.cardio.distanceKm ? `, ${w.cardio.distanceKm} km` : ""}` : "Cardio: —"}</div>
        <div class="row">
          <button class="secondary" data-export="${w.id}">Export</button>
          <button class="danger" data-delete="${w.id}">Delete</button>
        </div>
      `;
      box.appendChild(item);
    }

    $$("[data-export]").forEach(btn => {
      btn.addEventListener("click", async () => {
        const id = btn.getAttribute("data-export");
        const text = await buildExportText(id);
        try {
          await navigator.clipboard.writeText(text);
          setSubtitle("History export copied ✅");
        } catch {
          window.openExportSheet(text);
    // auto-copy for convenience
    copyExportToClipboard();
}
      });
    });

    $$("[data-delete]").forEach(btn => {
      btn.addEventListener("click", async () => {
        const id = btn.getAttribute("data-delete");
        const ok = confirm("Delete this workout and its exercise logs?");
        if (!ok) return;
        await deleteWorkout(id);
        await renderHistory();
        setSubtitle("Deleted.");
      });
    });
  }

  async function deleteWorkout(workoutId) {
    await idbDel("workouts", workoutId);
    const allLogs = await idbGetAll("exerciseLogs");
    const mine = allLogs.filter(x => x.workoutId === workoutId);
    for (const l of mine) await idbDel("exerciseLogs", l.key);
  }

  // ---------- Backup ----------
  async function exportBackup() {
    const data = {
      exportedAt: nowIso(),
      workouts: await idbGetAll("workouts"),
      exerciseLogs: await idbGetAll("exerciseLogs"),
      actions: await idbGetAll("actions"),
      settings: (await idbGet("settings","settings"))?.value ?? state.settings,
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type:"application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `workout-backup-${new Date().toISOString().slice(0,10)}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    $("#settingsStatus").textContent = "Backup exported ✅";
  }

  async function importBackup(file) {
    const text = await file.text();
    const data = JSON.parse(text);

    // wipe then restore
    await idbClearAll();

    for (const w of (data.workouts ?? [])) await idbPut("workouts", w);
    for (const l of (data.exerciseLogs ?? [])) await idbPut("exerciseLogs", l);
    for (const a of (data.actions ?? [])) await idbPut("actions", a);
    await saveSettings({ ...DEFAULTS, ...(data.settings ?? {}) });

    state.cachedStats.clear();
    state.cachedActions.clear();
    state.settings = await loadSettings();
    applySettingsToUI();
    $("#settingsStatus").textContent = "Backup imported ✅";
    setSubtitle("Imported backup.");
  }

  // ---------- Modal helpers ----------
  function showModal(id) {
    const m = $(id);
    m.classList.add("show");
    m.setAttribute("aria-hidden", "false");
  }
  function hideModal(id) {
    const m = $(id);
    m.classList.remove("show");
    m.setAttribute("aria-hidden", "true");
  }

  // ---------- Settings UI ----------
  function applySettingsToUI() {
    $("#maxWeight").value = String(state.settings.maxWeightKg);
    $("#showBestToggle").checked = !!state.settings.showBest;
  }

  async function saveSettingsFromUI() {
    const maxW = clampInt($("#maxWeight").value, DEFAULTS.maxWeightKg);
    const showBest = !!$("#showBestToggle").checked;

    state.settings = { ...state.settings, maxWeightKg: maxW, showBest };
    await saveSettings(state.settings);

    $("#settingsStatus").textContent = "Saved ✅";
    setSubtitle("Settings saved.");
    // Re-render if in workout
    if (state.currentWorkout) await renderExerciseList();
  }

  // ---------- Daily Protein + Creatine (local, resets by date) ----------
  function todayKey() {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  }

  async function loadDaily() {
    const key = todayKey();
    state.dailyKey = key;

    let rec = await idbGet("daily", key);
    if (!rec) {
      rec = { id: key, proteinConsumed: 0, stepsDone: 0, sleepScore: null, creatineTaken: false, updatedAt: nowIso() };
      await idbPut("daily", rec);
    }
    state.daily = rec;
    renderDailyUI();
  }

  async function saveDaily() {
    if (!state.daily) return;
    state.daily.updatedAt = nowIso();
    await idbPut("daily", state.daily);
    cloudPushBestEffort();
    renderDailyUI();
  }

  async function renderProteinHistory() {
    const box = $("#proteinHistoryList");
    if (!box) return;

    const target = state.settings.proteinTarget ?? 180;
    const targetSteps = state.settings.stepsTarget ?? 12500;

    const all = await idbGetAll("daily");
    all.sort((a, b) => String(b.id).localeCompare(String(a.id)));

    const last7 = all.slice(0, 7);

    if (!last7.length) {
      box.innerHTML = `<div class="mini">No daily entries yet.</div>`;
      return;
    }

    box.innerHTML = "";

    for (const d of last7) {
      const consumed = Number(d.proteinConsumed ?? 0);
      const left = Math.max(0, target - consumed);
      const ok = consumed >= target;
      const creatine = d.creatineTaken ? "✅" : "—";

      const item = document.createElement("div");
      item.className = "history-item";
      item.innerHTML = `
        <h4>${d.id}</h4>
        <div class="mini">Protein: ${consumed}g / ${target}g ${ok ? "✅" : `(${left}g left)`}</div>
        <div class="mini">Creatine: ${creatine}</div>
        <div class="mini">Steps: ${Number(d.stepsDone ?? 0)} / ${targetSteps} ${Number(d.stepsDone ?? 0) >= targetSteps ? "✅" : ""}</div>
        <div class="mini">Sleep: ${d.sleepScore == null ? "—" : d.sleepScore} / ${state.settings.sleepTarget ?? 80} ${d.sleepScore != null && d.sleepScore >= (state.settings.sleepTarget ?? 80) ? "✅" : ""}</div>
      `;
      box.appendChild(item);
    }
  }

  function renderDailyUI() {
    const target = state.settings.proteinTarget ?? 180;
    const targetSteps = state.settings.stepsTarget ?? 12500;
    const consumed = state.daily?.proteinConsumed ?? 0;
    const left = Math.max(0, target - consumed);

    const dateEl = $("#dailyDateText");
    if (dateEl) dateEl.textContent = `Date: ${state.dailyKey}`;

    const tEl = $("#proteinTargetText");
    const cEl = $("#proteinConsumedText");
    const lEl = $("#proteinLeftText");
    if (tEl) tEl.textContent = `${target}g`;
    if (cEl) cEl.textContent = `${consumed}g`;
    if (lEl) lEl.textContent = `${left}g`;

    const stepsTarget = state.settings.stepsTarget ?? 12500;
    const stepsDone = state.daily?.stepsDone ?? 0;
    const stepsLeft = Math.max(0, stepsTarget - stepsDone);

    const stEl = $("#stepsTargetText");
    const sdEl = $("#stepsDoneText");
    const slEl = $("#stepsLeftText");
    if (stEl) stEl.textContent = `${stepsTarget}`;
    if (sdEl) sdEl.textContent = `${stepsDone}`;
    if (slEl) slEl.textContent = `${stepsLeft}`;

    const sleepTarget = state.settings.sleepTarget ?? 80;
    const sleepScore = (state.daily?.sleepScore ?? null);
    const ssEl = $("#sleepScoreText");
    const stEl2 = $("#sleepTargetText");
    const sstEl = $("#sleepStatusText");
    if (stEl2) stEl2.textContent = `${sleepTarget}`;
    if (ssEl) ssEl.textContent = (sleepScore == null ? "—" : `${sleepScore}`);
    if (sstEl) {
      if (sleepScore == null) sstEl.textContent = "—";
      else sstEl.textContent = sleepScore >= sleepTarget ? "✅" : "⬆️";
    }

    const chk = $("#chkCreatine");
    if (chk) chk.checked = !!state.daily?.creatineTaken;

    renderProteinHistory();
  }

  async function addProtein(grams) {
    const g = Number.parseInt(String(grams), 10);
    if (!Number.isFinite(g) || g <= 0) return;

    if (!state.daily || state.dailyKey !== todayKey()) {
      await loadDaily();
    }

    state.daily.proteinConsumed = Math.max(0, (state.daily.proteinConsumed ?? 0) + g);
    await saveDaily();

    const s = $("#dailyStatus");
    if (s) s.textContent = `Added ${g}g ✅`;
  }

  async function resetProteinToday() {
    if (!state.daily || state.dailyKey !== todayKey()) {
      await loadDaily();
    }
    state.daily.proteinConsumed = 0;
    await saveDaily();

    const s = $("#dailyStatus");
    if (s) s.textContent = "Reset ✅";
  }

  async function toggleCreatineTaken(isTaken) {
    if (!state.daily || state.dailyKey !== todayKey()) {
      await loadDaily();
    }
    state.daily.creatineTaken = !!isTaken;
    await saveDaily();

    const s = $("#dailyStatus");
    if (s) s.textContent = isTaken ? "Creatine ticked ✅" : "Creatine unticked";
  }


  // ---------- Service Worker ----------
  async function registerSW() {
    if (!("serviceWorker" in navigator)) return;
    try {
      await navigator.serviceWorker.register("./sw.js");
    } catch (e) {
      // ignore
    }
  }

  async function addSteps(steps) {
    const s = Number.parseInt(String(steps), 10);
    if (!Number.isFinite(s) || s <= 0) return;

    if (!state.daily || state.dailyKey !== todayKey()) {
      await loadDaily();
    }

    state.daily.stepsDone = Math.max(0, (state.daily.stepsDone ?? 0) + s);
    await saveDaily();

    const msg = $("#dailyStatus");
    if (msg) msg.textContent = `Added ${s} steps ✅`;
  }

  async function resetStepsToday() {
    if (!state.daily || state.dailyKey !== todayKey()) {
      await loadDaily();
    }
    state.daily.stepsDone = 0;
    await saveDaily();

    const msg = $("#dailyStatus");
    if (msg) msg.textContent = "Steps reset ✅";
  }



  // ---------- Event Wiring ----------
  function wire() {
    // Home start buttons
    $$("[data-start-template]").forEach(btn => {
      btn.addEventListener("click", () => startWorkout(btn.getAttribute("data-start-template")));
    });

    $("#btnCardioOnly").addEventListener("click", async () => {
      // Cardio-only workout uses w3 template id but empty exercises; kept simple
      const id = `w_${Date.now()}`;
      state.currentWorkout = { id, templateId:"cardio", templateName:"Cardio Only", startedAt:nowIso(), finishedAt:null, cardio:null, notes:"", gymMins:null, calories:null };
      await idbPut("workouts", state.currentWorkout);
    cloudPushBestEffort();
      $("#workoutTitle").textContent = "Cardio Only";
      $("#workoutMeta").textContent = `Started: ${fmtDate(state.currentWorkout.startedAt)}`;
      $("#workoutKicker").textContent = "Workout in progress";
      $("#exerciseList").innerHTML = `<div class="mini">No strength exercises for cardio-only.</div>`;
      showView("#viewWorkout");
      setSubtitle("Cardio-only started.");
    });

    // Header buttons
    $("#btnHistory").addEventListener("click", async () => {
      await renderHistory();
      showView("#viewHistory");
      setSubtitle("History.");
    });
    $("#btnSettings").addEventListener("click", () => {
      applySettingsToUI();
      $("#settingsStatus").textContent = "";
      showView("#viewSettings");
      setSubtitle("Settings.");
    });

    // Workout controls
    $("#btnSaveGymStats")?.addEventListener("click", saveGymStats);
    $("#btnBackToHomeFromWorkout")?.addEventListener("click", async () => {
      if (!state.currentWorkout) {
        showView("#viewHome");
        setSubtitle("Ready.");
        return;
      }
      const ok = confirm("Go back to Home? This will cancel the current workout (nothing will be exported).");
      if (!ok) return;
      await deleteWorkout(state.currentWorkout.id);
      state.currentWorkout = null;
      showView("#viewHome");
      setSubtitle("Workout cancelled.");
    });

    $("#btnSaveCardio").addEventListener("click", cardioSave);
    $("#btnFinishWorkout").addEventListener("click", finishWorkout);
    $("#btnPauseWorkout").addEventListener("click", () => {
      alert("Paused. (Tip: it auto-saves your workout start + each exercise log.)");
    });

    // Export sheet
    $("#btnSyncNow")?.addEventListener("click", () => syncNow());
    $("#btnCloudResetLocal")?.addEventListener("click", () => syncNow("pull"));

    $("#btnCloseExport")?.addEventListener("click", closeExportSheet);
    $("#btnCopyExport")?.addEventListener("click", copyExportToClipboard);
    $("#btnOpenChatGPT")?.addEventListener("click", openChatGPT);
    $("#exportSheet")?.addEventListener("click", (e) => {
      if (e.target && e.target.id === "exportSheet") closeExportSheet();
    });

    // History
    $("#btnBackFromHistory").addEventListener("click", () => {
      showView("#viewHome");
      setSubtitle("Ready.");
    });
    $("#btnClearAll").addEventListener("click", async () => {
      const ok = confirm("This will delete ALL workouts on this device. Continue?");
      if (!ok) return;
      await idbClearAll();
      state.cachedStats.clear();
      state.cachedActions.clear();
      state.currentWorkout = null;
      setSubtitle("Cleared.");
      await renderHistory();
    });

    // Settings
    $("#btnBackFromSettings").addEventListener("click", () => {
      showView("#viewHome");
      setSubtitle("Ready.");
    });
    $("#btnSaveSettings").addEventListener("click", saveSettingsFromUI);
    $("#btnExportBackup").addEventListener("click", exportBackup);
    $("#fileImport").addEventListener("change", async (e) => {
      const file = e.target.files?.[0];
      if (!file) return;
      await importBackup(file);
      e.target.value = "";
    });

    // Daily (protein + creatine)
    $("#btnAdd10")?.addEventListener("click", () => addProtein(10));
    $("#btnAdd20")?.addEventListener("click", () => addProtein(20));
    $("#btnAdd30")?.addEventListener("click", () => addProtein(30));

    $("#btnAddProtein")?.addEventListener("click", () => {
      const v = $("#proteinAddInput").value.trim();
      $("#proteinAddInput").value = "";
      addProtein(v);
    });

    $("#btnResetProtein")?.addEventListener("click", () => resetProteinToday());

    $("#chkCreatine")?.addEventListener("change", (e) => {
      toggleCreatineTaken(e.target.checked);
    });

    $("#btnAdd1000")?.addEventListener("click", () => addSteps(1000));
    $("#btnAdd2000")?.addEventListener("click", () => addSteps(2000));
    $("#btnAdd5000")?.addEventListener("click", () => addSteps(5000));

    $("#btnAddSteps")?.addEventListener("click", () => {
      const v = $("#stepsAddInput").value.trim();
      $("#stepsAddInput").value = "";
      addSteps(v);
    });

    $("#btnResetSteps")?.addEventListener("click", () => resetStepsToday());

    $("#btnSetSleep")?.addEventListener("click", () => {
      const v = $("#sleepInput").value.trim();
      $("#sleepInput").value = "";
      setSleepScore(v);
    });
    $("#btnResetSleep")?.addEventListener("click", () => resetSleepScoreToday());

    // Exercise modal
    $("#btnCloseModal").addEventListener("click", () => { hideModal("#exerciseModal"); resetUiState(false); });
    $("#setCount").addEventListener("change", () => buildSetsUI(Number($("#setCount").value), state.currentExerciseDraft.setEntries, state.currentExerciseDraft.prevHints));
    $("#btnSaveExercise").addEventListener("click", saveExerciseLog);
    $("#btnActionNext").addEventListener("click", openActionModal);

    // Action modal
    $("#btnCloseAction").addEventListener("click", () => hideModal("#actionModal"));
    $("#btnSaveAction").addEventListener("click", saveAction);
    $("#btnUseSuggestion").addEventListener("click", () => {
      const s = $("#actionSuggestion").textContent.replace(/^Suggestion:\s*/,"");
      $("#actionText").value = s;
    });

    // Finish view
    $("#btnDone").addEventListener("click", () => {
      state.currentWorkout = null;
      showView("#viewHome");
      setSubtitle("Ready.");
    });
    $("#btnExportChatGPT").addEventListener("click", exportToChatGPT);
    $("#btnOpenChatGPT").addEventListener("click", openChatGPT);
  }

  async function setSleepScore(score) {
    const s = Number.parseInt(String(score), 10);
    if (!Number.isFinite(s) || s < 0 || s > 100) {
      const msg = $("#dailyStatus");
      if (msg) msg.textContent = "Sleep score must be 0–100.";
      return;
    }

    if (!state.daily || state.dailyKey !== todayKey()) {
      await loadDaily();
    }

    state.daily.sleepScore = s;
    await saveDaily();

    const msg = $("#dailyStatus");
    if (msg) msg.textContent = `Sleep score set to ${s} ✅`;
  }

  async function resetSleepScoreToday() {
    if (!state.daily || state.dailyKey !== todayKey()) {
      await loadDaily();
    }
    state.daily.sleepScore = null;
    await saveDaily();

    const msg = $("#dailyStatus");
    if (msg) msg.textContent = "Sleep score reset ✅";
  }



  // ---------- Init ----------
  async function init() {
    applyStartupRecovery();
    db = await idbOpen();
    state.settings = await loadSettings();
    applySettingsToUI();
    wire();
    await registerSW();
    setSubtitle("Ready. (Add to Home Screen in Safari)");
  }

  init();
})();
  async function idbClear(storeName) {
    const d = await openDb();
    return new Promise((resolve, reject) => {
      const tx = d.transaction(storeName, "readwrite");
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => reject(tx.error);
      tx.objectStore(storeName).clear();
    });
  }

  async function idbPutMany(storeName, items) {
    const d = await openDb();
    return new Promise((resolve, reject) => {
      const tx = d.transaction(storeName, "readwrite");
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => reject(tx.error);
      const s = tx.objectStore(storeName);
      (items || []).forEach(it => s.put(it));
    });
  }


