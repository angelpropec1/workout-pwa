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
  const EXERCISES = [
    // Chest
    { id:"seated_chest_press", name:"Seated chest press", group:"Chest", type:"strength" },
    { id:"bench_press", name:"Bench press", group:"Chest", type:"strength" },
    { id:"decline_bench_press", name:"Decline bench press", group:"Chest", type:"strength" },
    { id:"incline_bench_press", name:"Incline bench press", group:"Chest", type:"strength" },
    { id:"seated_butterfly", name:"Seated butterfly", group:"Chest", type:"strength" },
    { id:"pushups", name:"Pushups", group:"Chest", type:"bodyweight" },
    // Arms
    { id:"seated_barbell", name:"Seated barbell", group:"Arms", type:"strength" },
    { id:"barbell_21s", name:"21’s barbell", group:"Arms", type:"strength" },
    { id:"tricep_pulldown", name:"Tricep pull down", group:"Arms", type:"strength" },
    { id:"dips", name:"Dips", group:"Arms", type:"bodyweight" },
    // Stomach/Core
    { id:"situps", name:"Sit-ups", group:"Core", type:"bodyweight" },
    { id:"leg_raises", name:"Leg raises", group:"Core", type:"bodyweight" },
    { id:"cycle_crunch", name:"Cycle crunch", group:"Core", type:"bodyweight" },
    // Shoulders
    { id:"seated_shoulder_press", name:"Seated shoulder press", group:"Shoulders", type:"strength" },
    { id:"db_reverse_fly", name:"Dumbbell reverse fly", group:"Shoulders", type:"strength" },
    { id:"db_front_raises", name:"Dumbbell front raises", group:"Shoulders", type:"strength" },
    { id:"weight_steering", name:"Weight steering", group:"Shoulders", type:"strength" },
    // Back
    { id:"lat_pulldown", name:"Lat pull down", group:"Back", type:"strength" },
    { id:"seated_pulldown", name:"Seated pull down weights", group:"Back", type:"strength" },
    { id:"seated_pull_row", name:"Seated pull row weights", group:"Back", type:"strength" },
    { id:"back_extensions", name:"Back extensions", group:"Back", type:"bodyweight" },
    // Legs
    { id:"seated_squats", name:"Seated squats", group:"Legs", type:"strength" },
    { id:"calf_extensions", name:"Calf extensions", group:"Legs", type:"strength" },
    { id:"leg_extensions", name:"Leg extensions", group:"Legs", type:"strength" },
    { id:"leg_curl", name:"Leg curl", group:"Legs", type:"strength" },
  ];

  const TEMPLATES = {
    w1: {
      id:"w1",
      name:"Chest, Arms & Stomach",
      exercises:[
        "seated_chest_press","bench_press","incline_bench_press","decline_bench_press","seated_butterfly","pushups",
        "seated_barbell","barbell_21s","tricep_pulldown","dips",
        "situps","leg_raises","cycle_crunch"
      ],
    },
    w2: {
      id:"w2",
      name:"Shoulders, Back & Stomach",
      exercises:[
        "seated_shoulder_press","db_reverse_fly","db_front_raises","weight_steering",
        "lat_pulldown","seated_pulldown","seated_pull_row","back_extensions",
        "situps","leg_raises","cycle_crunch"
      ],
    },
    w3: {
      id:"w3",
      name:"Legs & Core",
      exercises:[
        "seated_squats","calf_extensions","leg_extensions","leg_curl",
        "situps","leg_raises","cycle_crunch"
      ],
    },
  };

  const findExercise = (id) => EXERCISES.find(x => x.id === id);

  // ---------- Defaults ----------
  const DEFAULTS = {
    sets: 4,
    reps: 10,
    maxWeightKg: 200,
    showBest: true,
  };

  // ---------- IndexedDB ----------
  const DB_NAME = "workout_log_db";
  const DB_VER = 1;
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
    settings: { ...DEFAULTS },
    currentWorkout: null, // {id, templateId, templateName, startedAt, finishedAt, cardio, notes}
    currentExerciseId: null,
    currentExerciseDraft: null, // {exerciseId, sets, notes, setEntries:[{weightKg,reps}]}
    cachedStats: new Map(), // exerciseId -> { last, best }
    cachedActions: new Map(), // exerciseId -> actionText
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

  function buildRepsOptions() {
    const opts = [];
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
    };
    await idbPut("workouts", state.currentWorkout);
    $("#workoutTitle").textContent = t.name;
    $("#workoutMeta").textContent = `Started: ${fmtDate(state.currentWorkout.startedAt)}`;
    $("#workoutKicker").textContent = "Workout in progress";
    $("#cardioType").value = "";
    $("#cardioMins").value = "";
    $("#cardioNotes").value = "";
    $("#cardioSavedText").textContent = "";

    setSubtitle("Workout started.");
    await renderExerciseList();
    showView("#viewWorkout");
  }

  async function cardioSave() {
    if (!state.currentWorkout) return;
    const type = $("#cardioType").value.trim();
    const mins = clampInt($("#cardioMins").value.trim(), 0);
    const notes = $("#cardioNotes").value.trim();
    if (!type) {
      state.currentWorkout.cardio = null;
      $("#cardioSavedText").textContent = "No cardio saved.";
    } else {
      state.currentWorkout.cardio = { type, mins, notes };
      $("#cardioSavedText").textContent = `Saved: ${type}, ${mins} min${notes ? " — " + notes : ""}`;
    }
    await idbPut("workouts", state.currentWorkout);
    setSubtitle("Cardio saved.");
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

      const lastLine = stats.last
        ? `Last: ${stats.last.top.weightKg}kg × ${stats.last.top.reps} (${stats.last.sets} sets)`
        : "Last: —";
      const bestLine = state.settings.showBest && stats.best
        ? `Best: ${stats.best.top.weightKg}kg × ${stats.best.top.reps}`
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
          <div class="badge">${ex.group}</div>
        </div>
        <div class="exercise-actions">
          <button class="primary" data-open="${exId}">Log</button>
        </div>
      `;
      container.appendChild(card);
    }

    $$("[data-open]").forEach(btn => {
      btn.addEventListener("click", async () => openExerciseModal(btn.getAttribute("data-open")));
    });
  }

  function makeSetRow(setIndex, weightOptionsHtml, repsOptionsHtml, defaultWeight, defaultReps) {
    const wSel = `
      <select class="weightSel" data-set="${setIndex}">
        ${weightOptionsHtml.replace(`value="${defaultWeight}"`, `value="${defaultWeight}" selected`)}
      </select>
    `;
    const rSel = `
      <select class="repsSel" data-set="${setIndex}">
        ${repsOptionsHtml.replace(`value="${defaultReps}"`, `value="${defaultReps}" selected`)}
      </select>
    `;
    return `
      <div class="set-row">
        <div class="set-label">Set ${setIndex + 1}</div>
        <div>${wSel}<div class="mini">kg</div></div>
        <div>${rSel}<div class="mini">reps</div></div>
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
    };
    state.currentExerciseDraft = draft;

    // stats / action
    const stats = await computeStats(exerciseId);
    const action = await loadAction(exerciseId);

    $("#modalTitle").textContent = ex.name;
    $("#modalKicker").textContent = `${ex.group}`;
    $("#exerciseNotes").value = "";
    $("#setCount").value = String(DEFAULTS.sets);

    const lastTxt = stats.last ? `Last: ${stats.last.top.weightKg}kg × ${stats.last.top.reps}` : "Last: —";
    const bestTxt = state.settings.showBest
      ? (stats.best ? `Best: ${stats.best.top.weightKg}kg × ${stats.best.top.reps}` : "Best: —")
      : "";
    $("#modalLastBest").textContent = bestTxt ? `${lastTxt}  •  ${bestTxt}` : lastTxt;

    $("#modalActionHint").textContent = action ? `Saved action: ${action}` : "Saved action: —";

    $("#modalStatus").textContent = "";

    buildSetsUI(DEFAULTS.sets);
    showModal("#exerciseModal");
  }

  function buildSetsUI(setCount) {
    const maxW = state.settings.maxWeightKg;
    const weightOpts = buildWeightOptions(maxW);
    const repsOpts = buildRepsOptions();
    const container = $("#setsContainer");
    container.innerHTML = "";
    for (let i = 0; i < setCount; i++) {
      container.insertAdjacentHTML("beforeend", makeSetRow(i, weightOpts, repsOpts, 0, DEFAULTS.reps));
    }
    // keep draft in sync
    state.currentExerciseDraft.sets = setCount;
    state.currentExerciseDraft.setEntries = Array.from({ length: setCount }, () => ({ weightKg: 0, reps: DEFAULTS.reps }));
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

  // ---------- Finish Workout ----------
  async function finishWorkout() {
    if (!state.currentWorkout) return;

    state.currentWorkout.finishedAt = nowIso();
    await idbPut("workouts", state.currentWorkout);

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
    out.push("");

    if (workout.cardio?.type) {
      out.push(`CARDIO`);
      out.push(`- ${workout.cardio.type}: ${workout.cardio.mins ?? 0} min${workout.cardio.notes ? " — " + workout.cardio.notes : ""}`);
      out.push("");
    }

    out.push(`EXERCISES`);
    for (const log of logs) {
      const ex = findExercise(log.exerciseId);
      const stats = await computeStats(log.exerciseId); // includes last/best; NOTE: last includes this log too, but ok for export
      // Build last excluding current: quick method: find previous log
      const prev = await previousLog(log.exerciseId, log.finishedAt);
      const prevTop = prev ? topSetFromLog(prev) : null;
      const best = stats.best?.top ?? null;

      const top = topSetFromLog(log);
      const sets = log.sets.length;
      const vol = volumeFromLog(log);

      out.push(`- ${ex.name} (${ex.group})`);
      out.push(`  Today: top ${top ? `${top.weightKg}kg×${top.reps}` : "—"} | Sets: ${sets} | Volume: ${Math.round(vol)}kg`);
      out.push(`  Last: ${prevTop ? `${prevTop.weightKg}kg×${prevTop.reps}` : "—"}${prev ? ` (${fmtDate(prev.finishedAt)})` : ""}`);
      out.push(`  Best: ${best ? `${best.weightKg}kg×${best.reps}` : "—"}`);
      out.push(`  Sets logged: ${log.sets.map(s => `${s.weightKg}×${s.reps}`).join("  |  ")}`);
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
      window.prompt("Copy this report:", exportText);
    }
  }

  function openChatGPT() {
    // Opens ChatGPT in a new tab/window (PWA: should open Safari)
    window.open("https://chatgpt.com", "_blank");
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
        <div class="mini">${w.cardio?.type ? `Cardio: ${w.cardio.type} ${w.cardio.mins ?? 0} min` : "Cardio: —"}</div>
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
          window.prompt("Copy this report:", text);
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

  // ---------- Service Worker ----------
  async function registerSW() {
    if (!("serviceWorker" in navigator)) return;
    try {
      await navigator.serviceWorker.register("./sw.js");
    } catch (e) {
      // ignore
    }
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
      state.currentWorkout = { id, templateId:"cardio", templateName:"Cardio Only", startedAt:nowIso(), finishedAt:null, cardio:null, notes:"" };
      await idbPut("workouts", state.currentWorkout);
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
    $("#btnSaveCardio").addEventListener("click", cardioSave);
    $("#btnFinishWorkout").addEventListener("click", finishWorkout);
    $("#btnPauseWorkout").addEventListener("click", () => {
      alert("Paused. (Tip: it auto-saves your workout start + each exercise log.)");
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

    // Exercise modal
    $("#btnCloseModal").addEventListener("click", () => hideModal("#exerciseModal"));
    $("#setCount").addEventListener("change", () => buildSetsUI(Number($("#setCount").value)));
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

  // ---------- Init ----------
  async function init() {
    db = await idbOpen();
    state.settings = await loadSettings();
    applySettingsToUI();
    wire();
    await registerSW();
    setSubtitle("Ready. (Add to Home Screen in Safari)");
  }

  init();
})();
