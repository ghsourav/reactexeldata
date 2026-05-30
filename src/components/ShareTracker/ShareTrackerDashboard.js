import { useState, useRef, useCallback, useEffect } from "react";
import defaultConfigData from "../../config/defaultConfig.json";
import "./ShareTrackerDashboard.css";

// ─── API ─────────────────────────────────────────────────────────────────────
const API_KEY  = process.env.REACT_APP_RAPIDAPI_KEY;
const API_HOST = process.env.REACT_APP_RAPIDAPI_HOST;

// ─── Helpers ──────────────────────────────────────────────────────────────────
function formatAmt(v) {
  if (v == null || isNaN(v)) return v;
  return v < 100 ? parseFloat(v.toFixed(2)) : Math.floor(v);
}
function midOf(hi, lo) {
  if (!hi || !lo) return 0;
  return parseFloat(((+hi + +lo) / 2).toFixed(2));
}
function fluctPct(hi, lo) {
  if (!hi || !lo || +lo === 0) return 0;
  return parseFloat((((+hi - +lo) / +lo) * 100).toFixed(2));
}
function parseMktCapCr(raw) {
  if (!raw) return 0;
  const s = String(raw).replace(/,/g, "").trim();
  const m = s.match(/([\d.]+)\s*(Cr|Lakh|K|M|B|T)?/i);
  if (!m) return 0;
  let n = parseFloat(m[1]);
  const u = (m[2] || "").toUpperCase();
  if (u === "T") n = n * 10000000;
  if (u === "B") n = n * 10000;
  if (u === "M") n = n * 100;
  return n;
}
function capLabel(cr) {
  const n = parseFloat(cr);
  if (!n || isNaN(n)) return "—";
  if (n < 5000)  return "S";
  if (n < 20000) return "M";
  return "L";
}
// Row-1 summary string builder
function buildSummary(cap, pe, divPct, qDiv, hi, mid, lo, fluc) {
  return `(${cap})(${pe})(${divPct}%)(${qDiv}) (${hi}_${mid}_${lo})(${fluc}%)`;
}
// Parse "17.66 / 16.90" → { hi, lo }
function parseHL(str) {
  if (!str || !String(str).includes("/")) return { hi: null, lo: null };
  const [a, b] = String(str).split("/");
  return { hi: parseFloat(a) || null, lo: parseFloat(b) || null };
}

// ─── API fetch ────────────────────────────────────────────────────────────────
async function fetchStock(name) {
  const res = await fetch(
    `https://${API_HOST}/stock?name=${encodeURIComponent(name.toUpperCase())}`,
    { headers: { "x-rapidapi-key": API_KEY, "x-rapidapi-host": API_HOST } }
  );
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const d   = await res.json();
  const det = d.stockDetailsReusableData || {};
  const prof = d.companyProfile || {};
  const divArr    = (d.stockCorporateActionData?.dividend) || [];
  const latestDiv = divArr[0] || {};

  const wk52High = parseFloat(d.yearHigh) || 0;
  const wk52Low  = parseFloat(d.yearLow)  || 0;
  const dayHigh  = parseFloat(det.high)   || 0;
  const dayLow   = parseFloat(det.low)    || 0;
  const mktCapRaw = det.marketCap || "0";
  const mktCapCr  = parseMktCapCr(mktCapRaw);
  const divPct    = parseFloat(det.dividendYield ?? det.dividendPercentage ?? det.dividend) ||
                    parseFloat(latestDiv.percentage) || 0;
  const qtrlyDiv  = parseFloat(latestDiv.value ?? latestDiv.dividendAmount ?? latestDiv.amount) || 0;
  const peRatio   = parseFloat(det.sectorPriceToEarningsValueRatio) || 0;
  const wk52Mid   = midOf(wk52High, wk52Low);

  return {
    inputName:  name,
    shareName:  d.companyName || name,
    nse: prof.exchangeCodeNse || "—",
    bse: prof.exchangeCodeBse || "—",
    date: det.date || "—",
    dayHigh:  formatAmt(dayHigh),
    dayLow:   formatAmt(dayLow),
    wk52High: formatAmt(wk52High),
    wk52Low:  formatAmt(wk52Low),
    wk52Mid:  formatAmt(wk52Mid),
    fluctPct: fluctPct(dayHigh, dayLow),
    mktCapRaw, mktCapCr,
    capLabel: capLabel(mktCapCr),
    peRatio, divPct, qtrlyDiv,
    notFound: false,
  };
}

// ─── SheetJS loader ───────────────────────────────────────────────────────────
async function loadXLSX() {
  if (window.XLSX) return window.XLSX;
  return new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = "https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js";
    s.onload  = () => resolve(window.XLSX);
    s.onerror = () => reject(new Error("SheetJS load failed"));
    document.head.appendChild(s);
  });
}

// ─── Parse uploaded workbook → share metadata ─────────────────────────────────
function parseWorkbook(wb) {
  const ws = wb.Sheets["BSE-NSE"];
  if (!ws) return [];
  const XL = window.XLSX;
  const range = XL.utils.decode_range(ws["!ref"] || "A1:A1");
  const shares = [];

  for (let c = 5; c <= range.e.c; c++) {
    const r14addr = XL.utils.encode_cell({ r: 13, c }); // row 14 = idx 13
    const cell14  = ws[r14addr];
    if (!cell14 || !cell14.v) continue;

    const nameRaw = String(cell14.v);
    const tkMatch = nameRaw.replace(/\n/g, " ").match(/\(([A-Z0-9\-]+)\)/);
    const ticker  = tkMatch ? tkMatch[1] : nameRaw.split(/[\s\n]/)[0];
    const display = nameRaw.split("\n")[0].trim();

    const gv = (row) => {
      const addr = XL.utils.encode_cell({ r: row - 1, c });
      return ws[addr] ? ws[addr].v : null;
    };

    // Collect last 26 day lows from rows 15-40 (indices 14-39)
    const dayLows26 = [];
    for (let r = 14; r <= 39; r++) {
      const addr = XL.utils.encode_cell({ r, c });
      const cell = ws[addr];
      if (cell && cell.v && String(cell.v).includes("/")) {
        const [, loStr] = String(cell.v).split("/");
        const lo = parseFloat(loStr);
        if (!isNaN(lo) && lo > 0) dayLows26.push(lo);
      }
    }

    shares.push({
      col: XL.utils.encode_col(c),
      ci:  c,
      ticker,
      display,
      fullName: nameRaw,
      r1:  String(gv(1) || ""),
      r2:  String(gv(2) || ""),
      r5:  gv(5),
      r6:  parseFloat(gv(6) || 0),
      r8:  parseFloat(gv(8) || 0),
      r10: parseFloat(gv(10) || 0),
      r13: String(gv(13) || ""),
      r15: String(gv(15) || ""),
      dayLows26,
      minLow26: dayLows26.length ? Math.min(...dayLows26) : 0,
    });
  }
  return shares;
}

// ─── Color constants (SheetJS uses 6-char RGB, no alpha prefix) ──────────────
// These exactly match the original Excel file's color scheme
const FILL = {
  YELLOW:      "FFFF00",   // Row 15 uninvested — dayLow ≤ MaxBuy  (was FFFFFF00)
  GREEN:       "92D050",   // Row 15 invested   — dayHigh > MaxBuy  (was FF92D050)
  BLUE:        "00B0F0",   // Row 8/13 baseline / industry           (was FF00B0F0)
  AMBER:       "FFC000",   // Row 7/9/11 sell/profit formulas        (was FFFFC000)
  GREEN2:      "00B050",   // Row 5/12 profit/investment             (was FF00B050)
  NONE:        null,       // No fill — remove existing fill
  // Row 1 cap colors (6th Go) — as specified: light purple / aqua / orange / yellow
  CAP_L:       "CC99FF",   // Large cap  >20k Cr  — light purple
  CAP_M:       "E0FFFF",   // Mid cap  5k–20k Cr  — light aqua/cyan
  CAP_S:       "FFE0B2",   // Small cap  <5k Cr   — light orange
  CAP_TOP300:  "FFFF00",   // Top 300             — yellow
};

// ─── Apply solid fill to a SheetJS cell (6-char RGB, no alpha) ───────────────
function setCellFill(ws, addr, rgb6) {
  // Ensure cell exists
  if (!ws[addr]) ws[addr] = { t: "s", v: "" };
  if (!ws[addr].s) ws[addr].s = {};
  if (rgb6 === null) {
    // Remove fill entirely — set to no fill pattern
    ws[addr].s.fill = { patternType: "none" };
  } else {
    ws[addr].s.fill = {
      patternType: "solid",
      fgColor: { rgb: rgb6 },
      bgColor: { indexed: 64 },
    };
  }
}

// ─── Core: apply results to workbook ─────────────────────────────────────────
function applyToWorkbook(wb, shares, fetchedMap, goActions, today) {
  const XL  = window.XLSX;
  const ws  = wb.Sheets["BSE-NSE"];
  const dateStr = today.toLocaleDateString("en-IN", {
    day: "2-digit", month: "short", year: "numeric", timeZone: "Asia/Kolkata"
  });

  const setCell = (row, colIdx, value, fmt) => {
    const addr = XL.utils.encode_cell({ r: row - 1, c: colIdx });
    ws[addr] = ws[addr] || {};
    ws[addr].v = value;
    ws[addr].t = typeof value === "number" ? "n" : "s";
    if (fmt) ws[addr].z = fmt;
  };

  const getCell = (row, colIdx) => {
    const addr = XL.utils.encode_cell({ r: row - 1, c: colIdx });
    return ws[addr] ? ws[addr].v : null;
  };

  for (const share of shares) {
    const data = fetchedMap[share.ticker] || fetchedMap[share.display.toUpperCase()];
    if (!data) continue;
    const ci = share.ci;

    // ── 1st Go: Row 15 DayHL ─────────────────────────────────────────
    if (goActions["1stGo"]) {
      const hlStr = `${data.dayHigh} / ${data.dayLow}`;
      setCell(15, ci, hlStr, "@");
    }

    // ── 2nd Go: Row 10 Historical (update if dayLow < current r10) ───
    if (goActions["2ndGo"]) {
      const currentR10 = parseFloat(getCell(10, ci) || 0);
      if (data.dayLow > 0 && (currentR10 === 0 || data.dayLow < currentR10)) {
        const newVal = formatAmt(data.dayLow);
        setCell(10, ci, newVal);
      }
    }

    // ── 3rd Go: Row 15 yellow if dayLow ≤ r6 when r5 blank/zero ────────
    if (goActions["3rdGo"]) {
      const r5 = getCell(5, ci);
      const isBlank = r5 == null || r5 === "" || Number(r5) === 0;
      const r6 = share.r6;
      const { lo } = parseHL(getCell(15, ci));
      const addr = XL.utils.encode_cell({ r: 14, c: ci });
      if (isBlank && lo != null && lo <= r6) {
        setCellFill(ws, addr, FILL.YELLOW);
      } else if (isBlank) {
        // dayLow > r6 while not invested → no color
        setCellFill(ws, addr, FILL.NONE);
      }
    }

    // ── 4th Go: Row 15 lightgreen if dayHigh > r6 when r5 not blank; else yellow ─
    if (goActions["4thGo"]) {
      const r5 = getCell(5, ci);
      const isInvested = r5 != null && r5 !== "" && Number(r5) !== 0;
      const r6 = share.r6;
      const { hi } = parseHL(getCell(15, ci));
      if (isInvested) {
        const addr = XL.utils.encode_cell({ r: 14, c: ci });
        setCellFill(ws, addr, hi != null && hi > r6 ? FILL.GREEN : FILL.YELLOW);
      }
    }

    // ── 5th Go: Row 10 = min of last 26 day lows ─────────────────────
    if (goActions["5thGo"]) {
      // Collect fresh 26 lows from current row 15 down
      const lows = [];
      for (let r = 15; r <= 40; r++) {
        const v = getCell(r, ci);
        if (v && String(v).includes("/")) {
          const [, loStr] = String(v).split("/");
          const lo = parseFloat(loStr);
          if (!isNaN(lo) && lo > 0) lows.push(lo);
        }
      }
      if (lows.length > 0) {
        const minLow = Math.min(...lows);
        setCell(10, ci, formatAmt(minLow));
      }
    }

    // ── 6th Go: Row 1 – Mkt cap, P/E, Div%, QDiv, 52wk, fluc% + cap color ─
    if (goActions["6thGo"]) {
      const cap  = data.capLabel;
      const pe   = data.peRatio;
      const div  = data.divPct;
      const qdiv = data.qtrlyDiv;
      const hi52 = data.wk52High;
      const lo52 = data.wk52Low;
      const mid52 = data.wk52Mid;
      const fluc = data.fluctPct;
      const summary = buildSummary(cap, pe, div, qdiv, hi52, mid52, lo52, fluc);
      setCell(1, ci, summary, "@");

      // Apply cap-size color to Row 1 cell
      const addr  = XL.utils.encode_cell({ r: 0, c: ci });
      const color = cap === "L" ? FILL.CAP_L
                  : cap === "M" ? FILL.CAP_M
                  : FILL.CAP_S;      // "S" or unknown → small cap orange
      setCellFill(ws, addr, color);
    }

    // ── 7th Go: Row 1 – recalculate mid of 52wk + fluctuation % ──────
    if (goActions["7thGo"]) {
      const cap  = data.capLabel;
      const pe   = data.peRatio;
      const div  = data.divPct;
      const qdiv = data.qtrlyDiv;
      const hi52 = data.wk52High;
      const lo52 = data.wk52Low;
      const mid52 = formatAmt(midOf(hi52, lo52));
      const fluc  = fluctPct(data.dayHigh, data.dayLow);
      const summary = buildSummary(cap, pe, div, qdiv, hi52, mid52, lo52, fluc);
      setCell(1, ci, summary, "@");
      // Re-apply same cap color to keep it consistent
      const addr  = XL.utils.encode_cell({ r: 0, c: ci });
      const color = cap === "L" ? FILL.CAP_L
                  : cap === "M" ? FILL.CAP_M
                  : FILL.CAP_S;
      setCellFill(ws, addr, color);
    }
  }

  // Update date in col A row 15 IF 1st go
  if (goActions["1stGo"]) {
    const addrA15 = XL.utils.encode_cell({ r: 14, c: 0 });
    ws[addrA15] = { t: "s", v: dateStr, z: "d-mmm-yy" };
  }

  return wb;
}

// ─── Insert new row 15 (push existing data down) ─────────────────────────────
function insertNewRow15(wb) {
  const XL = window.XLSX;
  const ws = wb.Sheets["BSE-NSE"];
  const range = XL.utils.decode_range(ws["!ref"] || "A1:A1");

  // Shift rows 15..end down by 1 (bottom to top)
  for (let r = range.e.r; r >= 14; r--) {
    for (let c = 0; c <= range.e.c; c++) {
      const src = XL.utils.encode_cell({ r, c });
      const dst = XL.utils.encode_cell({ r: r + 1, c });
      if (ws[src]) {
        ws[dst] = { ...ws[src] };
        delete ws[src];
      } else {
        delete ws[dst];
      }
    }
  }
  // Clear new row 15 (idx 14) for fresh data
  for (let c = 0; c <= range.e.c; c++) {
    delete ws[XL.utils.encode_cell({ r: 14, c })];
  }

  // Row E (col 4) spacer
  ws[XL.utils.encode_cell({ r: 14, c: 4 })] = { t: "s", v: " " };

  // Update ref
  ws["!ref"] = XL.utils.encode_range({
    s: { r: 0, c: 0 },
    e: { r: range.e.r + 1, c: range.e.c },
  });
  return wb;
}

// ─── Download helper ──────────────────────────────────────────────────────────
function downloadWb(wb, fileName) {
  const XL   = window.XLSX;
  const wbout = XL.write(wb, { bookType: "xlsx", type: "array", cellStyles: true });
  const blob  = new Blob([wbout], { type: "application/octet-stream" });
  const url   = URL.createObjectURL(blob);
  const a     = Object.assign(document.createElement("a"), { href: url, download: fileName });
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ─── Default config ───────────────────────────────────────────────────────────
const DEFAULT_CONFIG = Object.entries(defaultConfigData)
  .map(([k, v]) => `${k} - ${v}`)
  .join("\n");

// ─── Go button definitions ────────────────────────────────────────────────────
const GO_BUTTONS = [
  {
    id: "1stGo", label: "1st Go — DayHL (Row 15)",
    desc: "Insert new Row 15 with today's Day High & Low",
    color: "#0d6efd",
  },
  {
    id: "2ndGo", label: "2nd Go — Historical Min (Row 10)",
    desc: "Update Row 10 if today's Day Low < current Historical value",
    color: "#6610f2",
  },
  {
    id: "3rdGo", label: "3rd Go — Color Row 15 (uninvested)",
    desc: "Yellow if DayLow ≤ MaxBuy (Row6) when not invested (Row5 blank)",
    color: "#fd7e14",
  },
  {
    id: "4thGo", label: "4th Go — Color Row 15 (invested)",
    desc: "LightGreen if DayHigh > MaxBuy (Row6) when invested; else Yellow",
    color: "#198754",
  },
  {
    id: "5thGo", label: "5th Go — 26-Row Min Low (Row 10)",
    desc: "Update Row 10 with minimum Day Low across last 26 data rows",
    color: "#6f42c1",
  },
  {
    id: "6thGo", label: "6th Go — 52wk + MktCap (Row 1)",
    desc: "Update Row 1: MktCap, P/E, Div%, QDiv, 52wk range, Fluc% + cap color",
    color: "#0dcaf0",
  },
  {
    id: "7thGo", label: "7th Go — Recalc Mid & Fluc% (Row 1)",
    desc: "Recalculate 52wk midpoint and Day High/Low fluctuation % in Row 1",
    color: "#20c997",
  },
];

// ─── Main App ─────────────────────────────────────────────────────────────────
export default function App() {
  const [config, setConfig]         = useState(DEFAULT_CONFIG);
  const [savedConfig, setSavedConfig] = useState(DEFAULT_CONFIG);
  const [editingConfig, setEditingConfig] = useState(false);

  const [uploadedFile, setUploadedFile]   = useState(null);
  const [uploadedName, setUploadedName]   = useState("None");
  const [workbook, setWorkbook]           = useState(null);
  const [shares, setShares]               = useState([]);   // parsed from file
  const [xlReady, setXlReady]             = useState(false);

  const [shareInput, setShareInput] = useState("");
  const [results, setResults]       = useState([]);         // fetched API data
  const [fetchedMap, setFetchedMap] = useState({});         // ticker → data
  const [running, setRunning]       = useState(false);
  const [activeGo, setActiveGo]     = useState(null);
  const [progress, setProgress]     = useState(0);
  const [log, setLog]               = useState([]);

  const uploadRef = useRef(null);

  const addLog = useCallback((msg) => {
    setLog(prev => [`[${new Date().toLocaleTimeString("en-IN")}] ${msg}`, ...prev].slice(0, 80));
  }, []);

  // Preload SheetJS on mount
  useEffect(() => {
    loadXLSX().then(() => { setXlReady(true); addLog("SheetJS ready."); }).catch(e => addLog(`SheetJS error: ${e.message}`));
  }, []);

  // ── Upload handler ────────────────────────────────────────────────────────
  const handleUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    addLog(`Reading: ${file.name}…`);
    try {
      const XL = await loadXLSX();
      const ab = await file.arrayBuffer();
      const wb = XL.read(new Uint8Array(ab), { type: "array", cellStyles: true, cellNF: true, cellDates: true });
      const parsed = parseWorkbook(wb);
      setWorkbook(wb);
      setUploadedFile(file);
      setUploadedName(file.name);
      setShares(parsed);
      setShareInput(parsed.map(s => s.ticker).join(", "));
      addLog(`✓ Loaded: ${file.name} — ${parsed.length} shares found`);
    } catch (err) {
      addLog(`ERROR reading file: ${err.message}`);
    }
    e.target.value = "";
  };

  // ── Fetch all shares ──────────────────────────────────────────────────────
  const handleFetch = async () => {
    if (running) return;
    const names = shareInput.split(",").map(s => s.trim()).filter(Boolean);
    if (!names.length) { addLog("No share names entered."); return; }

    setRunning(true);
    setResults([]);
    setFetchedMap({});
    setProgress(0);
    addLog(`Fetching ${names.length} shares…`);

    const fetched = [];
    const fMap    = {};
    for (let i = 0; i < names.length; i++) {
      const name = names[i];
      addLog(`→ ${name}`);
      try {
        const d = await fetchStock(name);
        fetched.push(d);
        fMap[d.inputName.toUpperCase()] = d;
        fMap[d.nse.toUpperCase()]       = d;
        fMap[d.bse.toUpperCase()]       = d;
        // also map exact ticker
        const share = shares.find(s => s.ticker.toUpperCase() === name.toUpperCase());
        if (share) fMap[share.ticker] = d;
        addLog(`  ✓ ${d.shareName} H:${d.dayHigh} L:${d.dayLow} 52wk:${d.wk52Low}–${d.wk52High}`);
      } catch (err) {
        fetched.push({ inputName: name, notFound: true });
        addLog(`  ✗ ${name}: ${err.message}`);
      }
      setProgress(Math.round(((i + 1) / names.length) * 100));
      setResults([...fetched]);
    }

    setFetchedMap(fMap);
    addLog(`Fetch complete: ${fetched.filter(f => !f.notFound).length} ok, ${fetched.filter(f => f.notFound).length} failed`);
    setRunning(false);
  };

  // ── Run a Go action ───────────────────────────────────────────────────────
  const handleGo = async (goId) => {
    if (running) return;
    if (!workbook) { addLog("⚠ Upload your tracker .xlsx first."); return; }
    const goodResults = results.filter(r => !r.notFound);
    if (!goodResults.length) { addLog("⚠ Fetch share data first."); return; }

    setRunning(true);
    setActiveGo(goId);
    addLog(`Running: ${goId}…`);

    try {
      const XL = await loadXLSX();
      const ab = await uploadedFile.arrayBuffer();
      let wb   = XL.read(new Uint8Array(ab), { type: "array", cellStyles: true, cellNF: true, cellDates: true });

      // Build fresh fetch map keyed by ticker from share list
      const fMap = {};
      for (const share of shares) {
        const d = fetchedMap[share.ticker] ||
                  fetchedMap[share.display.toUpperCase()] ||
                  fetchedMap[share.ticker.toUpperCase()];
        if (d) fMap[share.ticker] = d;
      }
      // Also populate from API results by NSE/BSE
      for (const r of goodResults) {
        fMap[r.nse?.toUpperCase()]  = r;
        fMap[r.bse?.toUpperCase()]  = r;
        fMap[r.inputName?.toUpperCase()] = r;
      }

      // 1st Go needs a new row inserted first
      if (goId === "1stGo") {
        wb = insertNewRow15(wb);
        addLog("Inserted new Row 15");
      }

      const goActions = { [goId]: true };
      wb = applyToWorkbook(wb, shares, fMap, goActions, new Date());

      const today = new Date();
      const ds = today.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "2-digit" }).replace(/ /g, "-");
      const outName = uploadedName.replace(/\.xlsx$/i, ``) + `_${goId}_${ds}.xlsx`;
      downloadWb(wb, outName);
      addLog(`✓ Downloaded: ${outName}`);
    } catch (err) {
      addLog(`ERROR in ${goId}: ${err.message}`);
    }

    setRunning(false);
    setActiveGo(null);
  };

  // ── Run ALL Goes ──────────────────────────────────────────────────────────
  const handleAllGoes = async () => {
    if (running) return;
    if (!workbook) { addLog("⚠ Upload your tracker .xlsx first."); return; }
    const goodResults = results.filter(r => !r.notFound);
    if (!goodResults.length) { addLog("⚠ Fetch share data first."); return; }

    setRunning(true);
    setActiveGo("ALL");
    addLog("Running ALL 7 Goes sequentially…");

    try {
      const XL = await loadXLSX();
      const ab = await uploadedFile.arrayBuffer();
      let wb   = XL.read(new Uint8Array(ab), { type: "array", cellStyles: true, cellNF: true, cellDates: true });

      const fMap = {};
      for (const share of shares) {
        const d = fetchedMap[share.ticker] || fetchedMap[share.display.toUpperCase()];
        if (d) fMap[share.ticker] = d;
      }
      for (const r of goodResults) {
        fMap[r.nse?.toUpperCase()]  = r;
        fMap[r.bse?.toUpperCase()]  = r;
        fMap[r.inputName?.toUpperCase()] = r;
      }

      wb = insertNewRow15(wb);
      wb = applyToWorkbook(wb, shares, fMap,
        { "1stGo":true,"2ndGo":true,"3rdGo":true,"4thGo":true,"5thGo":true,"6thGo":true,"7thGo":true },
        new Date()
      );

      const today = new Date();
      const ds = today.toLocaleDateString("en-IN", { day:"2-digit", month:"short", year:"2-digit" }).replace(/ /g,"-");
      const outName = uploadedName.replace(/\.xlsx$/i,"") + `_AllGoes_${ds}.xlsx`;
      downloadWb(wb, outName);
      addLog(`✓ All Goes complete: ${outName}`);
    } catch (err) {
      addLog(`ERROR: ${err.message}`);
    }
    setRunning(false);
    setActiveGo(null);
  };

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div className="std-page">

      {/* ── Header ── */}
      <div className="std-header">
        <div className="std-header-left">
          <div className="std-title">Share Trading Tracker</div>
          <div className="std-subtitle">
            <span className={`std-badge ${xlReady ? "std-badge--ready" : "std-badge--loading"}`}>
              {xlReady ? "✓ SheetJS Ready" : "⏳ Loading…"}
            </span>
            <span className="std-badge">Automation Dashboard</span>
          </div>
        </div>
      </div>

      {/* ── Toolbar: File + Fetch side by side ── */}
      <div className="std-toolbar">

        {/* File card */}
        <div className="std-glass-card">
          <div className="std-card-label">Tracker File</div>
          <div className="std-file-row">
            <span className={`std-file-name ${uploadedName === "None" ? "std-file-name--none" : "std-file-name--ok"}`}>
              {uploadedName === "None" ? "No file uploaded yet" : `✓ ${uploadedName}`}
            </span>
            {shares.length > 0 && (
              <span className="std-file-count">{shares.length} shares</span>
            )}
            <input ref={uploadRef} type="file" accept=".xlsx" style={{ display: "none" }} onChange={handleUpload} />
            <button className="std-btn std-btn-upload" onClick={() => uploadRef.current.click()} disabled={running}>
              ↑ Upload .xlsx
            </button>
          </div>
        </div>

        {/* Fetch card */}
        <div className="std-glass-card">
          <div className="std-card-label">Share Tickers</div>
          <div className="std-fetch-inner">
            <textarea
              className="std-fetch-ta"
              value={shareInput}
              onChange={e => setShareInput(e.target.value)}
              disabled={running}
              placeholder="e.g. RELIANCE, TCS, INFY — auto-populated from uploaded file"
              rows={2}
            />
            <button className="std-btn std-btn-fetch" onClick={handleFetch} disabled={running}>
              ⟳ Fetch
            </button>
          </div>
        </div>
      </div>

      {/* ── Progress ── */}
      <div className="std-prog-row">
        <span className="std-prog-label">
          {running ? `⟳ Running: ${activeGo || "Fetch"}…` : progress === 100 ? "✓ Completed" : "● Idle"}
        </span>
        <span className="std-prog-pct">{progress}%</span>
        <div className="std-prog-track">
          <div className="std-prog-fill" style={{ width: `${progress}%` }} />
        </div>
      </div>

      {/* ── Main 3-column layout ── */}
      <div className="std-main-row">

        {/* LEFT: Config */}
        <div className="std-left-panel">
          <div className="std-panel-hdr">Configuration</div>
          <div className="std-config-body">
            {editingConfig ? (
              <textarea
                className="std-config-ta"
                value={config}
                onChange={e => setConfig(e.target.value)}
              />
            ) : (
              <ol className="std-cfg-ol">
                {savedConfig.split("\n").filter(Boolean).map((line, i) => {
                  const [k, ...v] = line.split(" - ");
                  return (
                    <li key={i} className="std-cfg-line">
                      <span className="std-cfg-key">{k}</span>
                      {v.length > 0 && <span className="std-cfg-val">{v.join(" - ")}</span>}
                    </li>
                  );
                })}
              </ol>
            )}
          </div>
          <div className="std-cfg-actions">
            <button className="std-btn-sm" onClick={() => { setConfig(DEFAULT_CONFIG); setSavedConfig(DEFAULT_CONFIG); setEditingConfig(false); addLog("Config reset."); }}>Reset</button>
            <button className="std-btn-sm" onClick={() => setEditingConfig(true)} disabled={editingConfig}>Edit</button>
            <button className="std-btn-sm std-btn-sm--save" onClick={() => { setSavedConfig(config); setEditingConfig(false); addLog("Config saved."); }} disabled={!editingConfig}>Save</button>
          </div>
        </div>

        {/* MIDDLE: Go Buttons */}
        <div className="std-mid-panel">
          <div className="std-panel-hdr">Actions</div>
          <div className="std-go-buttons">
            {GO_BUTTONS.map(g => (
              <button
                key={g.id}
                className="std-go-btn"
                style={{
                  background: activeGo === g.id
                    ? "rgba(255,255,255,0.15)"
                    : `${g.color}22`,
                  color: activeGo === g.id ? "#fff" : g.color,
                  border: `1.5px solid ${g.color}55`,
                  boxShadow: activeGo === g.id ? `0 0 16px ${g.color}66` : "none",
                  opacity: running && activeGo !== g.id ? 0.4 : 1,
                }}
                onClick={() => handleGo(g.id)}
                disabled={running}
                title={g.desc}
              >
                <span className="std-go-btn-id" style={{ color: g.color }}>{g.id}</span>
                <span className="std-go-btn-label">{g.label.split("—")[1]?.trim() || g.label}</span>
              </button>
            ))}
            <button
              className="std-go-btn"
              style={{
                background: activeGo === "ALL" ? "rgba(255,255,255,0.15)" : "rgba(108,99,255,0.12)",
                color: "#fff",
                border: "1.5px solid rgba(108,99,255,0.5)",
                boxShadow: activeGo === "ALL" ? "0 0 20px rgba(108,99,255,0.5)" : "none",
                fontWeight: "bold",
                marginTop: 4,
                opacity: running && activeGo !== "ALL" ? 0.4 : 1,
              }}
              onClick={handleAllGoes}
              disabled={running}
              title="Run all 7 Goes in sequence and download"
            >
              <span className="std-go-btn-id" style={{ color: "#a78bfa" }}>ALL</span>
              <span className="std-go-btn-label">Run All 7 Goes → Download</span>
            </button>
          </div>
          <div className="std-go-hint">
            Upload .xlsx → Fetch → Run Go → auto-downloads
          </div>
        </div>

        {/* RIGHT: Log */}
        <div className="std-right-panel">
          <div className="std-panel-hdr">Activity Log</div>
          <div className="std-log-box">
            {log.length === 0
              ? <span className="std-log-idle">Log output will appear here…</span>
              : log.map((l, i) => (
                  <div key={i} className={
                    l.includes("ERROR") ? "std-log-error"
                    : l.includes("✓")  ? "std-log-ok"
                    : "std-log-normal"
                  }>{l}</div>
                ))}
          </div>
        </div>
      </div>

      {/* ── Results table ── */}
      {results.length > 0 && (
        <div className="std-results-wrap">
          <div className="std-table-title">
            Fetched Data — {results.filter(r => !r.notFound).length} / {results.length} shares
          </div>
          <div className="std-table-scroll">
            <table className="std-table">
              <thead>
                <tr>
                  {["#","Share Name","NSE","BSE","Date (IST)","Unit","Day High","Day Low",
                    "52wk High","52wk Mid","52wk Low","Fluc %","Mkt Cap","P/E","Div %","Qtly Div","Cap"].map(h => (
                    <th key={h} className="std-th">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {results.map((r, i) => r.notFound ? (
                  <tr key={i}>
                    <td colSpan={17} className="std-td std-td--not-found">
                      ✗ {r.inputName} — not found / API error
                    </td>
                  </tr>
                ) : (
                  <tr key={i} className={i % 2 === 0 ? "std-td--row-even" : "std-td--row-odd"}>
                    <td className="std-td">{i + 1}</td>
                    <td className="std-td std-td--name">{r.shareName}</td>
                    <td className="std-td">{r.nse}</td>
                    <td className="std-td">{r.bse}</td>
                    <td className="std-td">{r.date}</td>
                    <td className="std-td std-td--unit">INR</td>
                    <td className="std-td std-td--high">{r.dayHigh}</td>
                    <td className="std-td std-td--low">{r.dayLow}</td>
                    <td className="std-td">{r.wk52High}</td>
                    <td className="std-td std-td--mid">{r.wk52Mid}</td>
                    <td className="std-td">{r.wk52Low}</td>
                    <td className={`std-td ${r.fluctPct >= 4 ? "std-td--fluc-high" : ""}`}>{r.fluctPct}%</td>
                    <td className="std-td">{r.mktCapRaw}</td>
                    <td className="std-td">{r.peRatio}</td>
                    <td className="std-td std-td--div">{r.divPct > 0 ? `${r.divPct}%` : "—"}</td>
                    <td className="std-td std-td--div">{r.qtrlyDiv > 0 ? `₹${r.qtrlyDiv}` : "—"}</td>
                    <td className={`std-td std-td--cap-${r.capLabel}`}>{r.capLabel}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Legend ── */}
      <div className="std-legend-row">
        <span className="std-legend-title">Excel Cell Colors:</span>
        <span className="std-legend-item"><span className="std-chip" style={{ background:"#CC99FF" }}>L</span> Large &gt;20k Cr</span>
        <span className="std-legend-item"><span className="std-chip" style={{ background:"#E0FFFF" }}>M</span> Mid 5k–20k Cr</span>
        <span className="std-legend-item"><span className="std-chip" style={{ background:"#FFE0B2" }}>S</span> Small &lt;5k Cr</span>
        <span className="std-legend-item"><span className="std-chip" style={{ background:"#FFFF00" }}>T300</span> Top 300</span>
        <span className="std-legend-item"><span className="std-chip" style={{ background:"#92D050" }}>■</span> Green = Hi&gt;MaxBuy (invested)</span>
        <span className="std-legend-item"><span className="std-chip" style={{ background:"#FFFF00" }}>■</span> Yellow = Lo≤MaxBuy (uninvested)</span>
      </div>

      {/* ── Footer ── */}
      <div className="std-footer">
        <span>Developed by </span>
        <a href="https://www.linkedin.com/in/ghsourav/" target="_blank" rel="noopener noreferrer" className="std-footer-link">
          ghsourav
        </a>
        <span className="std-footer-sep">|</span>
        <span className="std-footer-info">FriendsHotel.In · Share Trading Tracker v1.3</span>
      </div>

    </div>
  );
}