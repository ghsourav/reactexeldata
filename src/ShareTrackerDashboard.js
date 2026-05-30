import React, { useState, useRef } from 'react';
import axios from 'axios';

const API_KEY = '6be3c60e32msh3d1e2e2c12c3554p17ae54jsn280b15bafacc';
const API_HOST = 'indian-stock-exchange-api2.p.rapidapi.com';

const DEFAULT_CONFIG = `AppName - Parash Pathar
AppVersion - Ver. 1.1
AmountUnit - INR
TimeUnit - IST
Name - Tapas Paul
MailId - tapas1175@gmail.com
MobleNo - 7020646440
TrackerFileName - TapasPaul_Share_Trading_Tracker_v1.2_04-Feb-2026_Upload_1.xlsx
TrackerFileSheet - BSE-NSE
StartColumnNo - F
EndColumnNo - J
ShareNameReadRowNo - 14
DayHLUpdateRowNo - 15
52wkHLUdateRowNo - 1
MinValBaselineUpdateRowNo - 8
MinValHistoricalDataUpdateRowNo - 10
MaxBuyAmtRowNo - 6
InvestedAmtRowNo - 5
FlucDayHLDiffPercentColorRow - 13
ShareSellPercent - 3
FlucDayHLDiffPercent - 4`;

// Default share list (simulates what would be read from excel ShareNameReadRowNo)
const DEFAULT_SHARES = ['RELIANCE', 'TCS', 'INFY', 'HDFCBANK', 'WIPRO'];

const ACTION_BUTTONS = [
    { id: 1, label: 'DayHL', fields: ['dayHigh', 'dayLow', 'date'] },
    { id: 2, label: 'DayHL with Cell Color', fields: ['dayHigh', 'dayLow', 'date', 'color'] },
    { id: 3, label: 'Cell Color', fields: ['color'] },
    { id: 4, label: 'Monthly Min Value with Cell Color', fields: ['wk52High', 'wk52Low', 'wk52Mid', 'mktCap', 'color'] },
    { id: 5, label: 'Monthly Min Value', fields: ['wk52High', 'wk52Low', 'wk52Mid', 'mktCap', 'peRatio', 'dividend', 'qtrlyDiv'] },
];

function mktCapLabel(capCr) {
    const n = parseFloat(capCr);
    if (!n || isNaN(n)) return '—';
    if (n < 5000) return 'S';
    if (n < 20000) return 'M';
    return 'L';
}

function floorAmt(val) {
    if (val === null || val === undefined || isNaN(val)) return val;
    return val < 100 ? parseFloat(val.toFixed(2)) : Math.floor(val);
}

function midOf(high, low) {
    if (!high || !low) return 0;
    return parseFloat(((parseFloat(high) + parseFloat(low)) / 2).toFixed(2));
}

function fluctuationPct(high, low) {
    if (!high || !low || parseFloat(low) === 0) return 0;
    return parseFloat((((parseFloat(high) - parseFloat(low)) / parseFloat(low)) * 100).toFixed(2));
}

function parseMktCapCr(raw) {
    if (!raw) return 0;
    const s = String(raw).replace(/,/g, '').trim();
    const match = s.match(/([\d.]+)\s*(Cr|Lakh|K|M|B)?/i);
    if (!match) return 0;
    let n = parseFloat(match[1]);
    const unit = (match[2] || '').toUpperCase();
    if (unit === 'B') n = n * 100000 / 100;      // rough Cr
    if (unit === 'M') n = n * 100;
    return n;
}

async function fetchStock(name) {
    const res = await axios.get(`https://${API_HOST}/stock`, {
        params: { name: name.toUpperCase() },
        headers: { 'x-rapidapi-key': API_KEY, 'x-rapidapi-host': API_HOST },
    });
    const d = res.data;
    const det = d.stockDetailsReusableData || {};
    const prof = d.companyProfile || {};
    const divArr = (d.stockCorporateActionData?.dividend) || [];
    const latestDiv = divArr[0] || {};

    const wk52High = parseFloat(d.yearHigh) || 0;
    const wk52Low = parseFloat(d.yearLow) || 0;
    const wk52Mid = midOf(wk52High, wk52Low);
    const dayHigh = parseFloat(det.high) || 0;
    const dayLow = parseFloat(det.low) || 0;
    const fluctPct = fluctuationPct(dayHigh, dayLow);
    const mktCapRaw = det.marketCap || '0';
    const mktCapCr = parseMktCapCr(mktCapRaw);

    // Dividend %: try stockDetailsReusableData first, fallback to latest corporate action
    const divPct =
        parseFloat(det.dividendYield ?? det.dividendPercentage ?? det.dividend) ||
        parseFloat(latestDiv.percentage) ||
        0;

    // Quarterly div amount: prefer annualized / latest declared value
    const qtrlyDivAmt =
        parseFloat(latestDiv.value ?? latestDiv.dividendAmount ?? latestDiv.amount) ||
        0;

    return {
        shareName: d.companyName || name,
        nseCode: prof.exchangeCodeNse || '—',
        bseCode: prof.exchangeCodeBse || '—',
        date: det.date || '—',
        unit: 'INR',
        dayHigh: floorAmt(dayHigh),
        dayLow: floorAmt(dayLow),
        wk52High: floorAmt(wk52High),
        wk52Low: floorAmt(wk52Low),
        wk52Mid: floorAmt(wk52Mid),
        fluctPct,
        mktCapRaw,
        mktCapCr,
        mktCapLabel: mktCapLabel(mktCapCr),
        peRatio: parseFloat(det.sectorPriceToEarningsValueRatio) || 0,
        dividend: divPct,
        qtrlyDiv: qtrlyDivAmt,
        priceNSE: parseFloat((d.currentPrice || {}).NSE) || 0,
        priceBSE: parseFloat((d.currentPrice || {}).BSE) || 0,
        highColor: dayHigh > 0 && dayHigh > parseFloat(det.previousClose || 0) ? 'lightgreen' : '',
        lowColor: dayLow > 0 ? 'yellow' : '',
        fluctColor: fluctPct >= 4 ? 'orange' : '',
        notFound: false,
    };
}

export default function ShareTrackerDashboard() {
    const [configText, setConfigText] = useState(DEFAULT_CONFIG);
    const [savedConfig, setSavedConfig] = useState(DEFAULT_CONFIG);
    const [isEditing, setIsEditing] = useState(false);

    const [shareInput, setShareInput] = useState(DEFAULT_SHARES.join(', '));
    const [results, setResults] = useState([]);
    const [progress, setProgress] = useState(0);
    const [isRunning, setIsRunning] = useState(false);
    const [activeAction, setActiveAction] = useState(null);
    const [log, setLog] = useState([]);

    const [oldFileName] = useState('TapasPaul_Share_Trading_Tracker_v1.2_21-Nov-2024_FirstName.xlsx');
    const [newFileName, setNewFileName] = useState('None');
    const uploadRef = useRef(null);

    const configLines = savedConfig.split('\n').filter(l => l.trim());

    const addLog = (msg) =>
        setLog(prev => [`[${new Date().toLocaleTimeString()}] ${msg}`, ...prev].slice(0, 50));

    const handleSave = () => { setSavedConfig(configText); setIsEditing(false); addLog('Config saved.'); };
    const handleReset = () => { setConfigText(DEFAULT_CONFIG); setSavedConfig(DEFAULT_CONFIG); setIsEditing(false); addLog('Config reset.'); };

    const handleRun = async (action) => {
        if (isRunning) return;
        const names = shareInput.split(',').map(s => s.trim()).filter(Boolean);
        if (!names.length) { addLog('No share names entered.'); return; }

        setIsRunning(true);
        setActiveAction(action.label);
        setResults([]);
        setProgress(0);
        addLog(`Started: ${action.label} for [${names.join(', ')}]`);

        const fetched = [];
        for (let i = 0; i < names.length; i++) {
            const name = names[i];
            addLog(`Fetching: ${name}…`);
            try {
                const data = await fetchStock(name);
                fetched.push({ name, ...data });
                addLog(`OK: ${name} — High: ${data.dayHigh}, Low: ${data.dayLow}, 52wk: ${data.wk52Low}–${data.wk52High}`);
            } catch (err) {
                fetched.push({ name, notFound: true, shareName: name });
                addLog(`ERROR: ${name} — ${err.message || 'Not found'}`);
            }
            setProgress(Math.round(((i + 1) / names.length) * 100));
            setResults([...fetched]);
        }

        addLog(`Done: ${action.label}`);
        setIsRunning(false);
        setActiveAction(null);
    };

    const handleUpload = (e) => {
        const file = e.target.files[0];
        if (!file) return;
        setNewFileName(file.name);
        addLog(`Uploaded: ${file.name}`);
    };

    return (
        <div style={s.page}>
            <h4 style={s.title}>Share Trading Tracker — Automation Dashboard</h4>

            {/* Share name input */}
            <div style={s.shareInputRow}>
                <label style={s.shareLabel}>Share Names (comma-separated):</label>
                <input
                    style={s.shareInput}
                    value={shareInput}
                    onChange={e => setShareInput(e.target.value)}
                    disabled={isRunning}
                    placeholder="e.g. RELIANCE, TCS, INFY"
                />
            </div>

            {/* Main two-panel layout */}
            <div style={s.mainRow}>
                {/* LEFT */}
                <div style={s.leftPanel}>
                    <div style={s.panelHeader}>Configuration (Config List)</div>
                    <div style={s.configList}>
                        {isEditing ? (
                            <textarea style={s.configTA} value={configText} onChange={e => setConfigText(e.target.value)} />
                        ) : (
                            <ol style={s.ol}>
                                {configLines.map((line, i) => {
                                    const [key, ...rest] = line.split(' - ');
                                    return (
                                        <li key={i} style={s.cfgLine}>
                                            <span style={s.cfgKey}>{key}</span>
                                            {rest.length > 0 && <span style={s.cfgVal}> — {rest.join(' - ')}</span>}
                                        </li>
                                    );
                                })}
                            </ol>
                        )}
                    </div>
                    <div style={s.cfgActions}>
                        <button style={s.btnGray} onClick={handleReset} disabled={isRunning}>Reset</button>
                        <button style={s.btnGray} onClick={() => setIsEditing(true)} disabled={isRunning || isEditing}>Edit</button>
                        <button style={s.btnBlue} onClick={handleSave} disabled={isRunning || !isEditing}>Save</button>
                    </div>
                </div>

                {/* RIGHT */}
                <div style={s.rightPanel}>
                    <div style={s.actionBtns}>
                        {ACTION_BUTTONS.map(action => (
                            <button
                                key={action.id}
                                style={{
                                    ...s.actionBtn,
                                    ...(activeAction === action.label ? s.actionActive : {}),
                                    ...(isRunning && activeAction !== action.label ? s.actionDisabled : {}),
                                }}
                                onClick={() => handleRun(action)}
                                disabled={isRunning}
                            >
                                <b>{action.id}.</b> {action.label}
                            </button>
                        ))}
                    </div>

                    <div>
                        <div style={s.progressLabel}>
                            {isRunning ? `Running: ${activeAction}…` : progress === 100 ? 'Completed' : 'Idle'}
                            <span style={{ float: 'right' }}>{progress}%</span>
                        </div>
                        <div style={s.progressTrack}>
                            <div style={{ ...s.progressFill, width: `${progress}%` }} />
                        </div>
                    </div>

                    <div style={s.logBox}>
                        {log.length === 0
                            ? <span style={{ color: '#888' }}>Log output will appear here…</span>
                            : log.map((l, i) => <div key={i}>{l}</div>)}
                    </div>
                </div>
            </div>

            {/* Results table */}
            {results.length > 0 && (
                <div style={s.tableWrap}>
                    <table style={s.table}>
                        <thead>
                            <tr style={s.thead}>
                                <th style={s.th}>Share Name</th>
                                <th style={s.th}>NSE/BSE</th>
                                <th style={s.th}>Date (IST)</th>
                                <th style={{ ...s.th, ...s.thImportant }}>Unit</th>
                                <th style={s.th}>Day High</th>
                                <th style={s.th}>Day Low</th>
                                <th style={s.th}>Mkt Cap</th>
                                <th style={s.th}>P/E</th>
                                <th style={{ ...s.th, ...s.thImportant }}>Div %</th>
                                <th style={{ ...s.th, ...s.thImportant }}>Qtly Div (₹)</th>
                                <th style={s.th}>52wk High</th>
                                <th style={s.th}>52wk Mid</th>
                                <th style={s.th}>52wk Low</th>
                                <th style={s.th}>Fluc %</th>
                                <th style={s.th}>Cap</th>
                            </tr>
                        </thead>
                        <tbody>
                            {results.map((r, i) => r.notFound ? (
                                <tr key={i}>
                                    <td style={{ ...s.td, background: '#ffcccc', color: 'red' }} colSpan={15}>
                                        {r.name} — Not found / API error
                                    </td>
                                </tr>
                            ) : (
                                <tr key={i} style={{ background: i % 2 === 0 ? '#fff' : '#f8f9fa' }}>
                                    <td style={s.td}>{r.shareName}</td>
                                    <td style={s.td}>{r.nseCode} / {r.bseCode}</td>
                                    <td style={s.td}>{r.date}</td>
                                    <td style={{ ...s.td, ...s.tdImportant }}>{r.unit}</td>
                                    <td style={{ ...s.td, background: r.highColor || 'transparent' }}>{r.dayHigh}</td>
                                    <td style={{ ...s.td, background: r.lowColor || 'transparent' }}>{r.dayLow}</td>
                                    <td style={s.td}>{r.mktCapRaw}</td>
                                    <td style={s.td}>{r.peRatio}</td>
                                    <td style={{ ...s.td, ...s.tdImportant }}>{r.dividend > 0 ? `${r.dividend}%` : '—'}</td>
                                    <td style={{ ...s.td, ...s.tdImportant }}>{r.qtrlyDiv > 0 ? `₹ ${r.qtrlyDiv}` : '—'}</td>
                                    <td style={s.td}>{r.wk52High}</td>
                                    <td style={s.td}>{r.wk52Mid}</td>
                                    <td style={s.td}>{r.wk52Low}</td>
                                    <td style={{ ...s.td, background: r.fluctColor || 'transparent', fontWeight: r.fluctPct >= 4 ? 'bold' : 'normal' }}>
                                        {r.fluctPct}%
                                    </td>
                                    <td style={{ ...s.td, fontWeight: 'bold', color: r.mktCapLabel === 'S' ? '#e67e22' : r.mktCapLabel === 'M' ? '#2980b9' : '#27ae60' }}>
                                        {r.mktCapLabel}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

            {/* File rows */}
            <div style={s.fileRow}><span style={s.fileLabel}>Old File:</span><span>{oldFileName}</span></div>
            <div style={s.fileRow}><span style={s.fileLabel}>New File:</span><span style={{ color: newFileName === 'None' ? '#aaa' : '#0d6efd' }}>{newFileName}</span></div>
            <div style={s.uploadRow}>
                <input ref={uploadRef} type="file" accept=".xlsx" style={{ display: 'none' }} onChange={handleUpload} />
                <button style={s.btnBlue} onClick={() => uploadRef.current.click()} disabled={isRunning}>Upload</button>
                <button style={s.btnGray} disabled={isRunning} onClick={() => addLog(`Download: ${oldFileName}`)}>Download</button>
                <span style={{ fontSize: 11, color: '#888', marginLeft: 10 }}>* Once a button is clicked, others disable during execution</span>
            </div>
        </div>
    );
}

const s = {
    page: { fontFamily: 'Consolas, monospace', fontSize: 13, maxWidth: 1200, margin: '20px auto', padding: 16, border: '1px solid #ccc', borderRadius: 6, background: '#fafafa' },
    title: { textAlign: 'center', marginBottom: 12, fontSize: 16, fontWeight: 'bold' },
    shareInputRow: { display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 },
    shareLabel: { whiteSpace: 'nowrap', fontWeight: 'bold' },
    shareInput: { flex: 1, padding: '5px 8px', fontSize: 13, fontFamily: 'Consolas, monospace', border: '1px solid #aaa', borderRadius: 4 },
    mainRow: { display: 'flex', border: '1px solid #aaa', marginBottom: 0 },
    leftPanel: { flex: '0 0 44%', borderRight: '1px solid #aaa', display: 'flex', flexDirection: 'column' },
    panelHeader: { background: '#e9ecef', padding: '6px 12px', fontWeight: 'bold', borderBottom: '1px solid #aaa' },
    configList: { flex: 1, overflowY: 'auto', maxHeight: 320, padding: '4px 8px' },
    ol: { paddingLeft: 20, margin: 0 },
    cfgLine: { lineHeight: '1.65' },
    cfgKey: { color: '#0d6efd', fontWeight: 600 },
    cfgVal: { color: '#444' },
    configTA: { width: '100%', height: 280, fontSize: 12, fontFamily: 'Consolas, monospace', border: '1px solid #aaa', padding: 6, resize: 'vertical', boxSizing: 'border-box' },
    cfgActions: { display: 'flex', gap: 8, padding: '8px 12px', borderTop: '1px solid #aaa', background: '#f1f3f5', justifyContent: 'flex-end' },
    rightPanel: { flex: 1, display: 'flex', flexDirection: 'column', padding: 12, gap: 10 },
    actionBtns: { display: 'flex', flexDirection: 'column', gap: 5 },
    actionBtn: { padding: '6px 14px', background: '#0d6efd', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer', textAlign: 'left', fontSize: 13 },
    actionActive: { background: '#198754' },
    actionDisabled: { background: '#6c757d', opacity: 0.6, cursor: 'not-allowed' },
    progressLabel: { fontSize: 12, color: '#555', marginBottom: 3 },
    progressTrack: { height: 16, background: '#dee2e6', borderRadius: 4, overflow: 'hidden', border: '1px solid #bbb' },
    progressFill: { height: '100%', background: 'linear-gradient(90deg,#0d6efd,#198754)', transition: 'width 0.25s ease' },
    logBox: { background: '#212529', color: '#a8d8a8', fontSize: 11, fontFamily: 'Consolas, monospace', padding: 8, borderRadius: 4, minHeight: 72, maxHeight: 110, overflowY: 'auto' },
    tableWrap: { overflowX: 'auto', marginTop: 12, border: '1px solid #aaa' },
    table: { width: '100%', borderCollapse: 'collapse', fontSize: 12 },
    thead: { background: '#343a40', color: '#fff' },
    th: { padding: '6px 8px', border: '1px solid #555', whiteSpace: 'nowrap' },
    td: { padding: '5px 8px', border: '1px solid #dee2e6', whiteSpace: 'nowrap' },
    fileRow: { display: 'flex', gap: 10, padding: '6px 12px', borderTop: '1px solid #aaa', borderLeft: '1px solid #aaa', borderRight: '1px solid #aaa', background: '#fff' },
    fileLabel: { fontWeight: 'bold', minWidth: 70 },
    uploadRow: { display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', border: '1px solid #aaa', background: '#f8f9fa' },
    btnBlue: { padding: '5px 16px', background: '#0d6efd', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer', fontSize: 13 },
    btnGray: { padding: '5px 16px', background: '#6c757d', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer', fontSize: 13 },
    thImportant: { background: '#fff3cd', color: '#856404', borderBottom: '2px solid #ffc107' },
    tdImportant: { background: '#fffbf0', color: '#5a4200', fontWeight: '600' },
};
