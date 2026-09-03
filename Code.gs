<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Classroom Live Visualizer</title>
  <link rel="icon" href="data:,">
  <style>
    :root {
      --bg:#0a0a0c; --panel:#15151a; --accent:#3ddc97; --tech-color:#ff6b6b;
      --tool:#5aa9ff; --measure:#ffb84d; --key:#c792ea; --text:#f2f2f5; --muted:#8a8a94;
    }
    * { box-sizing: border-box; }
    html, body { margin:0; padding:0; background:var(--bg); color:var(--text);
      font-family:'Segoe UI',Roboto,Arial,sans-serif; height:100%; overflow:hidden; }
    #app { display:flex; flex-direction:column; height:100vh; }
    #topbar { display:flex; align-items:center; justify-content:space-between;
      padding:10px 18px; background:var(--panel); border-bottom:1px solid #232329;
      z-index:20; flex-wrap:wrap; gap:8px; }
    #topbar h1 { font-size:16px; margin:0; font-weight:600; letter-spacing:0.5px; }
    #status-dot { width:10px; height:10px; border-radius:50%; background:#444; display:inline-block; margin-right:8px; transition:background 0.3s; }
    #status-dot.live { background:#ff4757; box-shadow:0 0 8px #ff4757; animation:pulse 1.5s infinite; }
    @keyframes pulse { 0%,100%{opacity:1;} 50%{opacity:0.4;} }

    #controls { display:flex; gap:8px; flex-wrap:wrap; align-items:center; }
    button, select, input[type=text] {
      background:#1f1f26; color:var(--text); border:1px solid #33333c;
      padding:8px 12px; border-radius:6px; font-size:13px;
    }
    button { cursor:pointer; transition:background 0.2s; }
    button:hover { background:#2a2a33; }
    button.active { background:var(--accent); color:#05130c; border-color:var(--accent); }
    button#finishBtn { background:var(--tech-color); color:#fff; font-weight:600; }
    button#finishBtn:hover { background:#ff8787; }
    button#overheadBtn.active { background:#ffb84d; color:#211200; border-color:#ffb84d; }
    button:disabled { opacity:0.4; cursor:not-allowed; }
    #titleInput { width:200px; }
    #overheadSelect { display:none; }

    /* ---- Start screen ---- */
    #startOverlay { position:fixed; inset:0; background:var(--bg); display:flex;
      flex-direction:column; align-items:center; justify-content:center; z-index:200; gap:16px; }
    #startOverlay h2 { font-size:22px; margin:0; }
    #startOverlay p { color:var(--muted); font-size:14px; max-width:420px; text-align:center; margin:0; }
    #startBtn { background:var(--accent); color:#05130c; font-weight:700; font-size:16px;
      padding:14px 32px; border-radius:8px; border:none; }
    #startBtn:hover { background:#4eeaab; }

    /* ---- Split layout ---- */
    #layout { flex:1; display:flex; overflow:hidden; }
    #mainCol { position:relative; flex:1; overflow:hidden; background:#000; min-width:200px;
      display:flex; align-items:center; justify-content:center; }
    #stageCanvas { width:100%; height:100%; background:#000; transition:transform 0.35s ease; }
    #video { position:absolute; width:1px; height:1px; opacity:0; pointer-events:none; }

    #colResizer { width:6px; flex-shrink:0; cursor:col-resize; background:#232329; }
    #colResizer:hover { background:var(--accent); }

    #rightCol { width:320px; flex-shrink:0; display:flex; flex-direction:column;
      background:var(--panel); min-width:220px; max-width:600px; }

    #panelHeader { padding:12px 14px 0; font-size:12px; color:var(--muted); }
    #panelHeader b { color:var(--text); }

    #sidepanel { flex:1; min-height:80px; padding:10px 14px 14px; overflow-y:auto;
      display:flex; flex-direction:column; gap:16px; }
    .panel-section h3 { font-size:11px; text-transform:uppercase; letter-spacing:0.8px; color:var(--muted);
      margin:0 0 8px 0; display:flex; align-items:center; gap:6px; }
    .pdot { width:8px; height:8px; border-radius:50%; display:inline-block; }
    .chip { display:flex; justify-content:space-between; align-items:center;
      background:#1f1f26; border-radius:6px; padding:6px 10px; margin-bottom:6px;
      font-size:13px; animation:chipIn 1.4s ease; }
    .chip .time { color:var(--muted); font-size:11px; margin-left:8px; white-space:nowrap; }
    @keyframes chipIn {
      0% { opacity:0; transform:translateX(12px); background:#2a3f36; }
      15% { opacity:1; transform:translateX(0); background:#2a3f36; }
      100% { background:#1f1f26; }
    }
    .tool { border-left:3px solid var(--tool); }
    .measure { border-left:3px solid var(--measure); }
    .tech { border-left:3px solid var(--tech-color); }
    .key { border-left:3px solid var(--key); }
    .empty { color:var(--muted); font-size:12px; font-style:italic; }

    #rowResizer { height:6px; flex-shrink:0; cursor:row-resize; background:#232329; display:none; }
    #rowResizer:hover { background:#ffb84d; }
    #rowResizer.visible { display:block; }

    #overheadBox { display:none; flex-shrink:0; padding:10px 14px 14px; height:200px; min-height:100px; }
    #overheadBox h3 { font-size:11px; text-transform:uppercase; letter-spacing:0.8px; color:#ffb84d;
      margin:0 0 8px 0; }
    #overheadFrame { position:relative; width:100%; height:calc(100% - 22px); background:#000;
      border:2px solid #ffb84d; border-radius:6px; overflow:hidden; }
    #overheadVideo { width:100%; height:100%; object-fit:contain; background:#000; }

    #freeze-overlay { position:absolute; top:14px; left:14px; background:rgba(255,107,107,0.9);
      color:#fff; padding:6px 14px; border-radius:20px; font-size:13px; font-weight:600; display:none; z-index:15; }
    #zoom-indicator { position:absolute; top:14px; right:14px; background:rgba(0,0,0,0.55);
      color:var(--accent); padding:6px 12px; border-radius:20px; font-size:12px; display:none; z-index:15; }
    #flip-indicator { position:absolute; top:50px; right:14px; background:rgba(0,0,0,0.55);
      color:var(--tech-color); padding:6px 12px; border-radius:20px; font-size:12px; display:none; z-index:15; }

    #caption-zone { position:absolute; bottom:0; left:0; right:0; height:32%;
      display:none; flex-direction:column; justify-content:flex-end;
      padding:14px 24px 22px; background:linear-gradient(to top, rgba(0,0,0,0.85) 20%, rgba(0,0,0,0));
      z-index:12; pointer-events:none; }
    .badge { display:inline-block; padding:3px 10px; border-radius:12px; font-size:12px;
      font-weight:700; text-transform:uppercase; letter-spacing:0.5px; margin-bottom:6px; }
    .badge.step { background:var(--accent); color:#062017; }
    .badge.technique { background:var(--tech-color); color:#200606; }
    #current-caption { font-size:clamp(20px, 3vw, 34px); font-weight:600; line-height:1.3;
      text-shadow:0 2px 6px rgba(0,0,0,0.8); }
    #history-strip { font-size:13px; color:var(--muted); margin-top:6px; max-height:40px; overflow:hidden; }

    #listening-indicator { position:absolute; bottom:14px; left:14px; display:flex; align-items:center;
      gap:6px; background:rgba(0,0,0,0.55); padding:6px 12px; border-radius:20px;
      font-size:12px; color:var(--muted); z-index:15; }
    #listening-indicator .dot { width:8px; height:8px; border-radius:50%; background:var(--accent); animation:pulse 1.5s infinite; }
    #listening-indicator.paused .dot { background:#ff4757; animation:none; }

    #export-overlay { position:fixed; inset:0; background:rgba(0,0,0,0.85); display:none;
      align-items:center; justify-content:center; z-index:100; }
    #export-box { background:var(--panel); padding:30px 40px; border-radius:12px; text-align:center;
      min-width:320px; border:1px solid #2a2a33; }
    #export-box h2 { margin-top:0; font-size:18px; }
    #export-status { color:var(--muted); font-size:14px; margin:10px 0; }
    .spinner { width:36px; height:36px; border:4px solid #2a2a33; border-top-color:var(--accent);
      border-radius:50%; animation:spin 0.9s linear infinite; margin:12px auto; }
    @keyframes spin { to { transform:rotate(360deg); } }
    #export-links a { color:var(--accent); display:block; margin-top:8px; text-decoration:none; }
    #export-links a:hover { text-decoration:underline; }
    #closeExport { margin-top:16px; }
  </style>
</head>
<body>
<div id="startOverlay">
  <h2>Classroom Live Visualizer</h2>
  <p>Camera, microphone, and live transcription will start once you press Start. Panel sizes and lesson-type settings are remembered between sessions.</p>
  <select id="lessonTypeStart">
    <option value="cooking">Cooking Demonstration</option>
    <option value="tech">Technology / Workshop (General)</option>
  </select>
  <input type="text" id="titleInputStart" placeholder="Recipe / technique / focus skill…" style="width:280px;">
  <button id="startBtn">Start Recording &amp; Transcription</button>
</div>

<div id="app">
  <div id="topbar">
    <h1><span id="status-dot"></span>Classroom Live Visualizer</h1>
    <div id="controls">
      <input type="text" id="titleInput" placeholder="Recipe / technique / focus skill…">
      <select id="lessonType">
        <option value="cooking">Cooking</option>
        <option value="tech">Technology (General)</option>
      </select>
      <select id="cameraSelect" title="Switch main camera"></select>
      <button id="overheadBtn" title="Add/remove overhead camera">Add Overhead Feed</button>
      <select id="overheadSelect" title="Choose overhead camera"></select>
      <button id="mirrorBtn" title="Mirror horizontally (M)">Mirror ⇋</button>
      <button id="flipBtn" title="Flip upside down (F)">Flip 180° ↕</button>
      <button id="freezeBtn" title="Freeze (Space)">Freeze ❄</button>
      <button id="resetZoomBtn" title="Reset zoom">Reset Zoom</button>
      <button id="finishBtn">Finish &amp; Save Demo</button>
    </div>
  </div>

  <div id="layout">
    <div id="mainCol">
      <video id="video" autoplay playsinline muted></video>
      <canvas id="stageCanvas"></canvas>
      <div id="freeze-overlay">FROZEN — press Space to resume</div>
      <div id="zoom-indicator">Zoomed 2.5x</div>
      <div id="flip-indicator">Flipped 180°</div>
      <div id="listening-indicator"><span class="dot"></span><span id="listeningLabel">Listening (transcript hidden)</span></div>
      <div id="caption-zone">
        <div id="badge-row"></div>
        <div id="current-caption">Listening…</div>
        <div id="history-strip"></div>
      </div>
    </div>

    <div id="colResizer" title="Drag to resize panel"></div>

    <div id="rightCol">
      <div id="panelHeader">Focus: <b id="focusLabel">Untitled</b></div>
      <div id="sidepanel">
        <div class="panel-section">
          <h3><span class="pdot" style="background:var(--tool)"></span><span id="toolsHeading">Tools &amp; Equipment</span></h3>
          <div id="toolList"><div class="empty">None detected yet…</div></div>
        </div>
        <div class="panel-section">
          <h3><span class="pdot" style="background:var(--measure)"></span><span id="measuresHeading">Ingredients &amp; Quantities</span></h3>
          <div id="measureList"><div class="empty">None detected yet…</div></div>
        </div>
        <div class="panel-section">
          <h3><span class="pdot" style="background:var(--tech-color)"></span>Techniques &amp; Safety</h3>
          <div id="techList"><div class="empty">None detected yet…</div></div>
        </div>
        <div class="panel-section" id="keyTermSection">
          <h3><span class="pdot" style="background:var(--key)"></span><span id="keyHeading">Key Terms</span></h3>
          <div id="keyList"><div class="empty">None detected yet…</div></div>
        </div>
      </div>

      <div id="rowResizer" title="Drag to resize overhead box"></div>

      <div id="overheadBox">
        <h3>Overhead Feed</h3>
        <div id="overheadFrame"><video id="overheadVideo" autoplay playsinline muted></video></div>
      </div>
    </div>
  </div>
</div>

<div id="export-overlay">
  <div id="export-box">
    <h2>Saving Demonstration</h2>
    <div class="spinner" id="spinner"></div>
    <div id="export-status">Preparing upload…</div>
    <div id="export-links"></div>
    <button id="closeExport" style="display:none;">Close</button>
  </div>
</div>

<script>
(function() {
  const APPS_SCRIPT_URL = "PASTE_YOUR_DEPLOYED_WEB_APP_URL_HERE";

  const SHOW_LIVE_CAPTIONS = false;
  const LS_PREFIX = 'clv_';

  // ---------- Dictionaries per lesson type ----------
  const DICTS = {
    cooking: {
      tools: ["knife","frying pan","saucepan","oven","mixer","whisk","spatula","tongs",
        "grater","peeler","chopping board","thermometer","mixing bowl","rolling pin"],
      terms: ["flour","sugar","salt","butter","oil","egg","dough","batter","milk","yeast",
        "baking powder","vanilla","cream","cheese","garlic","onion","tomato","chicken","beef","rice"],
      toolsLabel: "Kitchen Tools",
      measuresLabel: "Ingredients & Quantities",
      keyLabel: "Other Ingredients",
      focusPrefix: "Dish"
    },
    tech: {
      tools: ["chisel","saw","drill","clamp","file","vice","press","hammer","screwdriver",
        "sander","router","soldering iron","glue gun","tape measure","square"],
      terms: ["timber","plywood","steel","aluminium","fabric","glue","paint","varnish",
        "acrylic","mdf","copper","brass","solder","circuit","resistor"],
      toolsLabel: "Tools & Equipment",
      measuresLabel: "Measurements",
      keyLabel: "Materials / Key Terms",
      focusPrefix: "Focus Skill"
    }
  };

  const MEASUREMENT_REGEX = /\b\d+(\.\d+)?\s*(g|kg|ml|l|cups?|tbsp|tsp|teaspoons?|tablespoons?|degrees?|°[CF]?|mm|cm|inches?|minutes?|mins?|seconds?|secs?|hours?|hrs?)\b/i;
  const STEP_PATTERNS = [
    /^\s*first\b/i, /^\s*next\b/i, /^\s*then\b/i, /^\s*after that\b/i,
    /^\s*now we\b/i, /^\s*step\s*\d+/i, /^\s*finally\b/i, /^\s*once .*then\b/i,
    /^\s*let'?s (start|begin|move on)/i
  ];
  const TECHNIQUE_PATTERNS = [
    /technique\s*:/i, /make sure to/i, /notice how/i, /hold the blade/i,
    /ensure the temperature/i, /be careful/i, /safety (tip|first)/i,
    /the key (is|here)/i, /important to/i, /watch (out|your)/i, /never/i, /always/i
  ];

  let lessonType = localStorage.getItem(LS_PREFIX + 'lessonType') || 'cooking';
  let activeDict = DICTS[lessonType];

  let mainStream = null, overheadStream = null, overheadActive = false;
  let mediaRecorder = null, recordedChunks = [];
  let currentZoom = 1, zoomOriginX = 0.5, zoomOriginY = 0.5;
  let mirrored = false, flipped = false, frozen = false;
  let recognizer = null, recognitionShouldRun = false, recognitionActive = false;
  let noSpeechCount = 0;
  let sessionStartTime = null;
  let transcriptLog = [];
  let currentDevices = [];
  let displayRafId = null, recordRafId = null;
  let thumbnailBase64 = null;

  const seenTools = new Set();
  const measureChipsByTerm = new Map();   // ingredient/material term -> chip element (combined measurement+term)
  const standaloneMeasureSet = new Set(); // process measurements not tied to a term (e.g. "10 minutes")
  const keyChipsByTerm = new Map();       // standalone key-term chips, removed if later combined with a measurement

  const mainVideo = document.getElementById('video');
  const overheadVideo = document.getElementById('overheadVideo');
  const displayCanvas = document.getElementById('stageCanvas');
  const displayCtx = displayCanvas.getContext('2d');
  const mainCol = document.getElementById('mainCol');
  const rightCol = document.getElementById('rightCol');
  const colResizer = document.getElementById('colResizer');
  const rowResizer = document.getElementById('rowResizer');

  const recordCanvas = document.createElement('canvas');
  const recordCtx = recordCanvas.getContext('2d');
  recordCanvas.width = 1920; recordCanvas.height = 1080;

  const statusDot = document.getElementById('status-dot');
  const titleInput = document.getElementById('titleInput');
  const titleInputStart = document.getElementById('titleInputStart');
  const lessonTypeSelect = document.getElementById('lessonType');
  const lessonTypeStart = document.getElementById('lessonTypeStart');
  const focusLabel = document.getElementById('focusLabel');
  const toolsHeading = document.getElementById('toolsHeading');
  const measuresHeading = document.getElementById('measuresHeading');
  const keyHeading = document.getElementById('keyHeading');
  const cameraSelect = document.getElementById('cameraSelect');
  const overheadBtn = document.getElementById('overheadBtn');
  const overheadSelect = document.getElementById('overheadSelect');
  const overheadBox = document.getElementById('overheadBox');
  const mirrorBtn = document.getElementById('mirrorBtn');
  const flipBtn = document.getElementById('flipBtn');
  const freezeBtn = document.getElementById('freezeBtn');
  const resetZoomBtn = document.getElementById('resetZoomBtn');
  const finishBtn = document.getElementById('finishBtn');
  const freezeOverlay = document.getElementById('freeze-overlay');
  const zoomIndicator = document.getElementById('zoom-indicator');
  const flipIndicator = document.getElementById('flip-indicator');
  const currentCaption = document.getElementById('current-caption');
  const badgeRow = document.getElementById('badge-row');
  const historyStrip = document.getElementById('history-strip');
  const captionZone = document.getElementById('caption-zone');
  const listeningIndicator = document.getElementById('listening-indicator');
  const listeningLabel = document.getElementById('listeningLabel');
  const toolList = document.getElementById('toolList');
  const measureList = document.getElementById('measureList');
  const techList = document.getElementById('techList');
  const keyList = document.getElementById('keyList');
  const startOverlay = document.getElementById('startOverlay');
  const startBtn = document.getElementById('startBtn');

  const exportOverlay = document.getElementById('export-overlay');
  const exportStatus = document.getElementById('export-status');
  const exportLinks = document.getElementById('export-links');
  const spinner = document.getElementById('spinner');
  const closeExportBtn = document.getElementById('closeExport');

  if (SHOW_LIVE_CAPTIONS) { captionZone.style.display = 'flex'; listeningIndicator.style.display = 'none'; }
  else { captionZone.style.display = 'none'; listeningIndicator.style.display = 'flex'; }

  // ---------- Persisted panel sizing ----------
  function applyPanelSizing() {
    const savedColWidth = localStorage.getItem(LS_PREFIX + 'rightColWidth');
    if (savedColWidth) rightCol.style.width = savedColWidth + 'px';
    const savedRowHeight = localStorage.getItem(LS_PREFIX + 'overheadHeight');
    if (savedRowHeight) overheadBox.style.height = savedRowHeight + 'px';
  }
  applyPanelSizing();

  function makeResizable(handle, onDrag, onDone) {
    let dragging = false;
    handle.addEventListener('mousedown', (e) => {
      dragging = true; e.preventDefault();
      const move = (ev) => { if (dragging) onDrag(ev); };
      const up = () => {
        dragging = false;
        document.removeEventListener('mousemove', move);
        document.removeEventListener('mouseup', up);
        onDone();
      };
      document.addEventListener('mousemove', move);
      document.addEventListener('mouseup', up);
    });
  }

  makeResizable(colResizer, (e) => {
    const layoutRect = document.getElementById('layout').getBoundingClientRect();
    let newWidth = layoutRect.right - e.clientX;
    newWidth = Math.max(220, Math.min(600, newWidth));
    rightCol.style.width = newWidth + 'px';
  }, () => {
    localStorage.setItem(LS_PREFIX + 'rightColWidth', parseInt(rightCol.style.width, 10));
  });

  makeResizable(rowResizer, (e) => {
    const rightRect = rightCol.getBoundingClientRect();
    let newHeight = rightRect.bottom - e.clientY;
    newHeight = Math.max(100, Math.min(rightRect.height - 100, newHeight));
    overheadBox.style.height = newHeight + 'px';
  }, () => {
    localStorage.setItem(LS_PREFIX + 'overheadHeight', parseInt(overheadBox.style.height, 10));
  });

  // ---------- Lesson type / focus label ----------
  function applyLessonType(type) {
    lessonType = type;
    activeDict = DICTS[type];
    localStorage.setItem(LS_PREFIX + 'lessonType', type);
    toolsHeading.textContent = activeDict.toolsLabel;
    measuresHeading.textContent = activeDict.measuresLabel;
    keyHeading.textContent = activeDict.keyLabel;
    updateFocusLabel();
  }

  function updateFocusLabel() {
    const t = titleInput.value.trim() || titleInputStart.value.trim();
    focusLabel.textContent = t ? `${activeDict.focusPrefix}: ${t}` : 'Untitled';
  }

  lessonTypeSelect.value = lessonType;
  lessonTypeStart.value = lessonType;
  applyLessonType(lessonType);

  lessonTypeSelect.addEventListener('change', (e) => applyLessonType(e.target.value));
  lessonTypeStart.addEventListener('change', (e) => { lessonTypeSelect.value = e.target.value; applyLessonType(e.target.value); });
  titleInput.addEventListener('input', () => { titleInputStart.value = titleInput.value; updateFocusLabel(); });
  titleInputStart.addEventListener('input', () => { titleInput.value = titleInputStart.value; updateFocusLabel(); });

  function classify(text) {
    for (const p of STEP_PATTERNS) if (p.test(text)) return "STEP";
    for (const p of TECHNIQUE_PATTERNS) if (p.test(text)) return "TECHNIQUE";
    return "SPEECH";
  }

  function elapsedTimeStr() {
    if (!sessionStartTime) return "00:00:00";
    const s = Math.floor((Date.now() - sessionStartTime) / 1000);
    const hh = String(Math.floor(s / 3600)).padStart(2, '0');
    const mm = String(Math.floor((s % 3600) / 60)).padStart(2, '0');
    const ss = String(s % 60).padStart(2, '0');
    return `${hh}:${mm}:${ss}`;
  }

  function makeChip(text) {
    const chip = document.createElement('div');
    chip.innerHTML = `<span class="label">${text}</span><span class="time">${elapsedTimeStr()}</span>`;
    return chip;
  }

  function flashUpdate(chip) {
    chip.style.animation = 'none';
    requestAnimationFrame(() => { chip.style.animation = 'chipIn 1.4s ease'; });
  }

  function addSimpleChip(container, text, cssClass, seenSet) {
    const norm = text.toLowerCase().trim();
    if (seenSet.has(norm)) return;
    seenSet.add(norm);
    if (container.querySelector('.empty')) container.innerHTML = '';
    const chip = makeChip(text);
    chip.className = 'chip ' + cssClass;
    container.appendChild(chip);
    container.scrollTop = container.scrollHeight;
  }

  // Adds/updates a combined "measurement + ingredient" chip, keyed by the
  // ingredient/material term so restated amounts correct the existing entry
  // instead of creating a duplicate. Also removes any standalone Key Term
  // chip for the same term, since it's now been quantified.
  function addOrUpdateMeasureTerm(term, combinedLabel) {
    const norm = term.toLowerCase().trim();
    if (measureChipsByTerm.has(norm)) {
      const chip = measureChipsByTerm.get(norm);
      chip.querySelector('.label').textContent = combinedLabel;
      chip.querySelector('.time').textContent = elapsedTimeStr();
      flashUpdate(chip);
    } else {
      if (measureList.querySelector('.empty')) measureList.innerHTML = '';
      const chip = makeChip(combinedLabel);
      chip.className = 'chip measure';
      measureList.appendChild(chip);
      measureChipsByTerm.set(norm, chip);
      measureList.scrollTop = measureList.scrollHeight;
    }
    if (keyChipsByTerm.has(norm)) {
      const oldChip = keyChipsByTerm.get(norm);
      oldChip.remove();
      keyChipsByTerm.delete(norm);
      if (keyList.children.length === 0) keyList.innerHTML = '<div class="empty">None detected yet…</div>';
    }
  }

  function addKeyTermChip(term) {
    const norm = term.toLowerCase().trim();
    if (keyChipsByTerm.has(norm) || measureChipsByTerm.has(norm)) return;
    if (keyList.querySelector('.empty')) keyList.innerHTML = '';
    const chip = makeChip(term);
    chip.className = 'chip key';
    keyList.appendChild(chip);
    keyChipsByTerm.set(norm, chip);
    keyList.scrollTop = keyList.scrollHeight;
  }

  function extractCategories(text) {
    const lower = text.toLowerCase();

    activeDict.tools.forEach(tool => { if (lower.includes(tool)) addSimpleChip(toolList, tool, 'tool', seenTools); });

    // Find each measurement occurrence and check the words immediately
    // following it against the active ingredient/material dictionary.
    const words = text.split(/\s+/);
    let matchedAnyTerm = false;
    const measureRe = new RegExp(MEASUREMENT_REGEX.source, 'gi');
    let m;
    while ((m = measureRe.exec(text)) !== null) {
      const measurementText = m[0].trim();
      const after = text.slice(m.index + m[0].length, m.index + m[0].length + 40).toLowerCase();
      let foundTerm = null;
      for (const term of activeDict.terms) {
        if (after.includes(term)) { foundTerm = term; break; }
      }
      if (foundTerm) {
        addOrUpdateMeasureTerm(foundTerm, `${measurementText} ${foundTerm}`);
        matchedAnyTerm = true;
      } else if (!standaloneMeasureSet.has(measurementText.toLowerCase())) {
        standaloneMeasureSet.add(measurementText.toLowerCase());
        addSimpleChip(measureList, measurementText, 'measure', new Set()); // process parameter, not ingredient-linked
      }
    }

    // Any dictionary term mentioned without an accompanying measurement in
    // this utterance still gets logged as a standalone key term.
    activeDict.terms.forEach(term => {
      if (lower.includes(term)) addKeyTermChip(term);
    });
  }

  function resizeDisplayCanvas() {
    const rect = mainCol.getBoundingClientRect();
    displayCanvas.width = rect.width;
    displayCanvas.height = rect.height;
  }
  window.addEventListener('resize', resizeDisplayCanvas);

  function drawContain(targetCtx, videoEl, tx, ty, tw, th) {
    const vw = videoEl.videoWidth, vh = videoEl.videoHeight;
    if (!vw || !vh) return;
    const scale = Math.min(tw / vw, th / vh);
    const dw = vw * scale, dh = vh * scale;
    const dx = tx + (tw - dw) / 2, dy = ty + (th - dh) / 2;
    targetCtx.drawImage(videoEl, dx, dy, dw, dh);
  }

  function drawMainFeed(targetCtx, x, y, w, h) {
    targetCtx.save();
    targetCtx.beginPath();
    targetCtx.rect(x, y, w, h);
    targetCtx.clip();
    targetCtx.fillStyle = '#000';
    targetCtx.fillRect(x, y, w, h);
    const originXpx = x + zoomOriginX * w, originYpx = y + zoomOriginY * h;
    targetCtx.translate(originXpx, originYpx);
    if (flipped) targetCtx.rotate(Math.PI);
    if (mirrored) targetCtx.scale(-1, 1);
    targetCtx.scale(currentZoom, currentZoom);
    targetCtx.translate(-originXpx, -originYpx);
    drawContain(targetCtx, mainVideo, x, y, w, h);
    targetCtx.restore();
  }

  function renderDisplayFrame() {
    if (!frozen) drawMainFeed(displayCtx, 0, 0, displayCanvas.width, displayCanvas.height);
    displayRafId = requestAnimationFrame(renderDisplayFrame);
  }

  function renderRecordFrame() {
    if (!frozen) {
      recordCtx.fillStyle = '#000';
      recordCtx.fillRect(0, 0, recordCanvas.width, recordCanvas.height);
      if (overheadActive && overheadVideo.videoWidth) {
        const mainW = recordCanvas.width * 0.72;
        const overheadW = recordCanvas.width - mainW;
        drawMainFeed(recordCtx, 0, 0, mainW, recordCanvas.height);
        recordCtx.save();
        recordCtx.fillStyle = '#000';
        recordCtx.fillRect(mainW, 0, overheadW, recordCanvas.height);
        drawContain(recordCtx, overheadVideo, mainW + 8, 8, overheadW - 16, recordCanvas.height - 16);
        recordCtx.strokeStyle = '#ffb84d';
        recordCtx.lineWidth = 4;
        recordCtx.strokeRect(mainW + 4, 4, overheadW - 8, recordCanvas.height - 8);
        recordCtx.restore();
      } else {
        drawMainFeed(recordCtx, 0, 0, recordCanvas.width, recordCanvas.height);
      }
    }
    recordRafId = requestAnimationFrame(renderRecordFrame);
  }

  function startRecorder() {
    const canvasStream = recordCanvas.captureStream(30);
    const audioTrack = mainStream.getAudioTracks()[0];
    if (audioTrack) canvasStream.addTrack(audioTrack);
    let mimeType = 'video/webm;codecs=vp9,opus';
    if (!MediaRecorder.isTypeSupported(mimeType)) mimeType = 'video/webm';
    try { mediaRecorder = new MediaRecorder(canvasStream, { mimeType }); }
    catch (e) { mediaRecorder = new MediaRecorder(canvasStream); }
    mediaRecorder.ondataavailable = (e) => { if (e.data && e.data.size > 0) recordedChunks.push(e.data); };
    mediaRecorder.start(1000);
    sessionStartTime = Date.now();
  }

  async function initMainMedia(deviceId) {
    if (mainStream) mainStream.getTracks().forEach(t => t.stop());
    const constraints = {
      video: { deviceId: deviceId ? { exact: deviceId } : undefined,
        width: { ideal: 1920 }, height: { ideal: 1080 }, frameRate: { ideal: 30 } },
      audio: true
    };
    mainStream = await navigator.mediaDevices.getUserMedia(constraints);
    mainVideo.srcObject = mainStream;
    statusDot.classList.add('live');
    if (!mediaRecorder) {
      resizeDisplayCanvas();
      renderDisplayFrame();
      renderRecordFrame();
      startRecorder();
      startSpeech();
    }
  }

  async function enumerateCameras() {
    const devices = await navigator.mediaDevices.enumerateDevices();
    currentDevices = devices.filter(d => d.kind === 'videoinput');
    [cameraSelect, overheadSelect].forEach(sel => {
      const keepFirst = sel.id === 'overheadSelect' ? '<option value="">Choose overhead camera…</option>' : '';
      sel.innerHTML = keepFirst;
      currentDevices.forEach((d, i) => {
        const opt = document.createElement('option');
        opt.value = d.deviceId;
        opt.textContent = d.label || `Camera ${i + 1}`;
        sel.appendChild(opt);
      });
    });
  }

  cameraSelect.addEventListener('change', async (e) => {
    try { await initMainMedia(e.target.value); }
    catch (err) { console.log("Camera switch failed:", err.message); }
  });

  overheadBtn.addEventListener('click', () => {
    if (!overheadActive) overheadSelect.style.display = 'inline-block';
    else stopOverhead();
  });

  overheadSelect.addEventListener('change', async (e) => {
    const deviceId = e.target.value;
    if (!deviceId) return;
    try {
      overheadStream = await navigator.mediaDevices.getUserMedia({
        video: { deviceId: { exact: deviceId }, width: { ideal: 1920 }, height: { ideal: 1080 } },
        audio: false
      });
      overheadVideo.srcObject = overheadStream;
      overheadActive = true;
      overheadBtn.textContent = 'Remove Overhead Feed';
      overheadBtn.classList.add('active');
      overheadBox.style.display = 'block';
      rowResizer.classList.add('visible');
      overheadSelect.style.display = 'none';
      applyPanelSizing();
    } catch (err) { console.log('Overhead camera failed to start:', err.message); }
  });

  function stopOverhead() {
    if (overheadStream) overheadStream.getTracks().forEach(t => t.stop());
    overheadStream = null; overheadActive = false;
    overheadBtn.textContent = 'Add Overhead Feed';
    overheadBtn.classList.remove('active');
    overheadBox.style.display = 'none';
    rowResizer.classList.remove('visible');
    overheadSelect.style.display = 'none';
    overheadSelect.value = '';
  }

  displayCanvas.addEventListener('dblclick', (e) => {
    const rect = displayCanvas.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width, y = (e.clientY - rect.top) / rect.height;
    if (currentZoom === 1) {
      zoomOriginX = x; zoomOriginY = y; currentZoom = 2.5;
      zoomIndicator.style.display = 'block';
    } else {
      currentZoom = 1; zoomOriginX = 0.5; zoomOriginY = 0.5;
      zoomIndicator.style.display = 'none';
    }
  });

  resetZoomBtn.addEventListener('click', () => {
    currentZoom = 1; zoomOriginX = 0.5; zoomOriginY = 0.5;
    zoomIndicator.style.display = 'none';
  });

  function toggleMirror() { mirrored = !mirrored; mirrorBtn.classList.toggle('active', mirrored); }
  mirrorBtn.addEventListener('click', toggleMirror);

  function toggleFlip() {
    flipped = !flipped; flipBtn.classList.toggle('active', flipped);
    flipIndicator.style.display = flipped ? 'block' : 'none';
  }
  flipBtn.addEventListener('click', toggleFlip);

  function toggleFreeze() {
    frozen = !frozen; freezeBtn.classList.toggle('active', frozen);
    freezeOverlay.style.display = frozen ? 'block' : 'none';
  }
  freezeBtn.addEventListener('click', toggleFreeze);

  document.addEventListener('keydown', (e) => {
    if (e.target.tagName === 'SELECT' || e.target.tagName === 'INPUT') return;
    if (e.code === 'Space') { e.preventDefault(); toggleFreeze(); }
    if (e.key.toLowerCase() === 'm') { toggleMirror(); }
    if (e.key.toLowerCase() === 'f') { toggleFlip(); }
  });

  // ---------- Speech recognition with robust auto-restart ----------
  function startSpeech() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) { console.log('Speech recognition not supported.'); return; }
    recognitionShouldRun = true;
    recognizer = new SpeechRecognition();
    recognizer.continuous = true;
    recognizer.interimResults = true;
    recognizer.lang = 'en-AU';

    recognizer.onstart = () => { recognitionActive = true; noSpeechCount = 0; listeningIndicator.classList.remove('paused'); };

    recognizer.onresult = (event) => {
      noSpeechCount = 0;
      let interim = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        const text = result[0].transcript.trim();
        if (result.isFinal) {
          if (text.length > 0) {
            const type = classify(text);
            const time = elapsedTimeStr();
            transcriptLog.push({ time, type, text });
            renderCaption(text, type);
            extractCategories(text);
            if (type === 'TECHNIQUE') addSimpleChip(techList, text, 'tech', new Set());
          }
        } else {
          interim = text;
        }
      }
      if (interim) renderCaption(interim, "SPEECH", true);
    };

    recognizer.onerror = (e) => {
      console.log('Speech recognition error:', e.error);
      if (e.error === 'not-allowed' || e.error === 'service-not-allowed') {
        recognitionShouldRun = false;
        listeningIndicator.classList.add('paused');
        listeningLabel.textContent = 'Transcription unavailable (mic permission)';
      } else if (e.error === 'no-speech') {
        noSpeechCount++;
      }
      // onend fires after onerror in Chrome; restart logic lives there.
    };

    recognizer.onend = () => {
      recognitionActive = false;
      if (!recognitionShouldRun) return;
      const delay = noSpeechCount > 3 ? 1500 : 400;
      setTimeout(restartRecognizerSafe, delay);
    };

    try { recognizer.start(); } catch (e) { console.log('Could not start recognition:', e.message); }
  }

  function restartRecognizerSafe() {
    if (!recognitionShouldRun || recognitionActive || !recognizer) return;
    try { recognizer.start(); }
    catch (e) {
      if (e.name === 'InvalidStateError') return; // already running, ignore
      console.log('Restart failed:', e.message);
      setTimeout(restartRecognizerSafe, 1000);
    }
  }

  function renderCaption(text, type, isInterim) {
    currentCaption.textContent = text;
    badgeRow.innerHTML = '';
    if (type === 'STEP') {
      const b = document.createElement('span'); b.className = 'badge step'; b.textContent = 'Step';
      badgeRow.appendChild(b);
    } else if (type === 'TECHNIQUE') {
      const b = document.createElement('span'); b.className = 'badge technique'; b.textContent = 'Technique / Safety';
      badgeRow.appendChild(b);
    }
    if (!isInterim) {
      const line = document.createElement('div');
      line.textContent = `[${elapsedTimeStr()}] ${text}`;
      historyStrip.prepend(line);
      while (historyStrip.childNodes.length > 2) historyStrip.removeChild(historyStrip.lastChild);
    }
  }

  finishBtn.addEventListener('click', async () => {
    if (!mediaRecorder) return;
    exportOverlay.style.display = 'flex';
    exportStatus.textContent = 'Stopping recording…';
    spinner.style.display = 'block';
    closeExportBtn.style.display = 'none';
    exportLinks.innerHTML = '';

    recognitionShouldRun = false;
    if (recognizer) { try { recognizer.stop(); } catch (e) {} }

    try { thumbnailBase64 = recordCanvas.toDataURL('image/png'); } catch (e) { thumbnailBase64 = null; }

    if (displayRafId) cancelAnimationFrame(displayRafId);
    if (recordRafId) cancelAnimationFrame(recordRafId);

    const durationSeconds = sessionStartTime ? (Date.now() - sessionStartTime) / 1000 : 0;
    const sessionTitle = titleInput.value.trim();

    mediaRecorder.onstop = async () => {
      exportStatus.textContent = 'Encoding video…';
      const blob = new Blob(recordedChunks, { type: mediaRecorder.mimeType || 'video/webm' });
      const reader = new FileReader();
      reader.onload = async function() {
        const base64data = reader.result;
        exportStatus.textContent = 'Uploading to Google Drive…';
        try {
          const resp = await fetch(APPS_SCRIPT_URL, {
            method: 'POST',
            body: JSON.stringify({
              action: 'saveDemonstrationPackage',
              base64Video: base64data,
              transcriptLog: transcriptLog,
              sessionTitle: sessionTitle,
              thumbnailBase64: thumbnailBase64,
              meta: { durationSeconds: durationSeconds, mimeType: mediaRecorder.mimeType || 'video/webm' }
            })
          });
          if (!resp.ok) throw new Error('Server responded with status ' + resp.status);
          const result = await resp.json();
          onSaveSuccess(result);
        } catch (err) {
          onSaveFailure(err);
        }
      };
      reader.readAsDataURL(blob);
    };
    mediaRecorder.stop();
  });

  function onSaveSuccess(result) {
    spinner.style.display = 'none';
    if (result.success) {
      exportStatus.textContent = 'Saved successfully!';
      exportLinks.innerHTML = `
        <a href="${result.videoUrl}" target="_blank">Open Video File</a>
        <a href="${result.docUrl}" target="_blank">Open Demonstration Doc</a>`;
    } else {
      exportStatus.textContent = 'Error: ' + result.message;
    }
    closeExportBtn.style.display = 'inline-block';
  }

  function onSaveFailure(err) {
    spinner.style.display = 'none';
    exportStatus.textContent = 'Upload failed: ' + (err.message || err) + ' — check that your Apps Script deployment is redeployed with the latest code and APPS_SCRIPT_URL is set correctly in the script.';
    closeExportBtn.style.display = 'inline-block';
  }

  closeExportBtn.addEventListener('click', () => { exportOverlay.style.display = 'none'; });

  // ---------- Start button gates everything ----------
  startBtn.addEventListener('click', async () => {
    startBtn.disabled = true;
    startBtn.textContent = 'Starting…';
    titleInput.value = titleInputStart.value;
    updateFocusLabel();
    try {
      resizeDisplayCanvas();
      await initMainMedia(null);
      await enumerateCameras();
      startOverlay.style.display = 'none';
    } catch (err) {
      startBtn.disabled = false;
      startBtn.textContent = 'Start Recording & Transcription';
      alert('Camera/mic access error: ' + err.message);
    }
  });
})();
</script>
</body>
</html>
