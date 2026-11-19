import React, { useState, useEffect, useRef } from 'react';
import * as XLSX from 'xlsx';
import { parseChartContent, formatPhoneDisplay } from './utils/ezeeinfoParser';

const KEY = 'omni-bus-vite-v2';
const HIST_KEY = 'omni-bus-sent-hist-v2';

const R_EN = "Hi {name}, thank you for travelling with {bus} ({route}) yesterday! redBus will send you a message on WhatsApp to rate your trip. If you enjoyed your journey, please take a moment to give us a 5-star rating on redBus. As a new service, your rating helps us tremendously. Thank you!";
const R_TA = "வணக்கம் {name}, நேற்று {bus}-ல் ({route}) பயணம் செய்தமைக்கு மிக்க நன்றி! உங்கள் பயணத்தை rate செய்ய redBus WhatsApp-ல் ஒரு செய்தி அனுப்பும். பயணம் பிடித்திருந்தால், redBus-ல் எங்களுக்கு 5-star rating கொடுங்கள். புதிய சேவையான எங்களுக்கு உங்கள் ஆதரவு மிகவும் உதவும். நன்றி!";
const D_EN = "Hi {name}, thank you for travelling with {bus} ({route}) yesterday! How was your trip? If you enjoyed your journey, a quick 5-star Google review would really help our service: {link} - Thank you!";
const D_TA = "வணக்கம் {name}, நேற்று {bus}-ல் ({route}) பயணம் செய்தமைக்கு மிக்க நன்றி! உங்கள் பயண அனுபவம் எப்படி இருந்தது? ஒரு நிமிடம் ஒதுக்கி எங்களுக்கு ஒரு Google review கொடுத்தால் மிகவும் உதவியாக இருக்கும்: {link}";

const EZEE_DEMO = [
  { name: 'Ashwanth', num: '916382836622', seats: ['L4'], src: 'r' },
  { name: 'Lakshmi', num: '918220801522', seats: ['L13', 'L14W'], src: 'r' },
  { name: 'Gowthaman', num: '919342331226', seats: ['U2'], src: 'r' },
  { name: 'Banumathi', num: '919445704763', seats: ['U13', 'U14W'], src: 'r' },
  { name: 'Ananth', num: '916382361789', seats: ['L5'], src: 'r' },
  { name: 'Dinesh Kumar', num: '919080208773', seats: ['U5'], src: 'r' },
  { name: 'Prabhakaran', num: '917305836990', seats: ['U4'], src: 'd' }
];

export default function App() {
  const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];

  // Config State
  const [bus, setBus] = useState('SpyderZ Link');
  const [route, setRoute] = useState('Udumalpet ↔ Chennai');
  const [date, setDate] = useState(yesterday);
  const [googleLink, setGoogleLink] = useState('');
  const [tplR, setTplR] = useState(R_TA);
  const [tplD, setTplD] = useState(D_TA);
  const [activeTab, setActiveTab] = useState('r');
  const [useFirstName, setUseFirstName] = useState(false);
  const [defSrc, setDefSrc] = useState('r');
  const [pasteText, setPasteText] = useState('');
  const [passengers, setPassengers] = useState(EZEE_DEMO);
  const [invalidLines, setInvalidLines] = useState([]);
  const [dupesCount, setDupesCount] = useState(2);
  const [isExample, setIsExample] = useState(true);
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [theme, setTheme] = useState('light');
  const [toastMsg, setToastMsg] = useState('');
  const [dragOver, setDragOver] = useState(false);
  const [delaySeconds, setDelaySeconds] = useState(6);

  // WhatsApp Backend Connection State
  const [waStatus, setWaStatus] = useState('connecting'); // 'connecting' | 'qr' | 'connected' | 'disconnected'
  const [waQrCode, setWaQrCode] = useState(null);
  const [waUserPhone, setWaUserPhone] = useState(null);
  const [showQrModal, setShowQrModal] = useState(false);

  // 1-Click Automated Batch Sending State
  const [batchProgress, setBatchProgress] = useState({
    isSending: false,
    total: 0,
    currentIndex: 0,
    currentPassenger: null,
    sentList: [],
    failedList: []
  });

  const textareaRef = useRef(null);
  const fileInputRef = useRef(null);

  // Load saved preferences
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(KEY) || 'null');
      if (saved) {
        if (saved.bus) setBus(saved.bus);
        if (saved.route) setRoute(saved.route);
        if (saved.date) setDate(saved.date);
        if (saved.googleLink) setGoogleLink(saved.googleLink);
        if (saved.tplR) setTplR(saved.tplR);
        if (saved.tplD) setTplD(saved.tplD);
        if (saved.activeTab) setActiveTab(saved.activeTab);
        if (saved.useFirstName !== undefined) setUseFirstName(saved.useFirstName);
        if (saved.passengers && saved.passengers.length) {
          setPassengers(saved.passengers);
          setIsExample(false);
        }
        if (saved.theme) setTheme(saved.theme);
      }
    } catch (e) {}
  }, []);

  // Save preferences
  useEffect(() => {
    const data = {
      bus, route, date, googleLink, tplR, tplD,
      activeTab, useFirstName, passengers: isExample ? [] : passengers,
      theme
    };
    try { localStorage.setItem(KEY, JSON.stringify(data)); } catch (e) {}
  }, [bus, route, date, googleLink, tplR, tplD, activeTab, useFirstName, passengers, theme, isExample]);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  // Poll WhatsApp Status & Batch Progress
  useEffect(() => {
    const pollStatus = async () => {
      try {
        const res = await fetch('/api/whatsapp/status');
        if (res.ok) {
          const data = await res.json();
          setWaStatus(data.status);
          setWaQrCode(data.qrCode);
          setWaUserPhone(data.userPhone);
        }
      } catch (e) {}

      try {
        const progRes = await fetch('/api/send-batch/progress');
        if (progRes.ok) {
          const progData = await progRes.json();
          setBatchProgress(progData);
        }
      } catch (e) {}
    };

    pollStatus();
    const interval = setInterval(pollStatus, 2000);
    return () => clearInterval(interval);
  }, []);

  const showToast = (msg) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(''), 2500);
  };

  const getDisplayName = (name) => {
    let n = (name || '').trim();
    if (!n || n.toLowerCase() === 'passenger' || n.toLowerCase() === 'sir/madam') return 'Sir/Madam';
    if (useFirstName) n = n.split(/\s+/)[0];
    return n;
  };

  const formatMessage = (p) => {
    const tpl = (p && p.src === 'd') ? tplD : tplR;
    const name = getDisplayName(p && p.name);
    const seatStr = (p && p.seats && p.seats.length) ? p.seats.join(', ') : '';
    return tpl
      .split('{name}').join(name)
      .split('{bus}').join(bus || 'SpyderZ Link')
      .split('{route}').join(route || 'Udumalpet ↔ Chennai')
      .split('{date}').join(date || 'yesterday')
      .split('{seat}').join(seatStr)
      .split('{link}').join(googleLink.trim() || '{link}');
  };

  // Build List from Text
  const handleBuildList = (textToParse = pasteText) => {
    if (!textToParse.trim()) {
      showToast('Please paste or upload a chart first.');
      return;
    }
    const res = parseChartContent(textToParse, defSrc);
    if (!res.rows.length) {
      showToast('No valid passenger phone numbers detected.');
      return;
    }
    if (res.detectedRoute) setRoute(res.detectedRoute);
    if (res.detectedDate) setDate(res.detectedDate);
    setPassengers(res.rows);
    setInvalidLines(res.invalid);
    setDupesCount(res.dupes);
    setIsExample(false);
    setFilter('all');
    setPasteText('');
    showToast(`Loaded ${res.rows.length} passengers!`);
    const s3 = document.getElementById('step3');
    if (s3) s3.scrollIntoView({ behavior: 'smooth' });
  };

  const handleFileUpload = (file) => {
    const ext = file.name.split('.').pop().toLowerCase();
    if (ext === 'pdf') {
      const reader = new FileReader();
      reader.onload = () => {
        fetch('/api/upload-chart-pdf', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ base64Pdf: reader.result })
        })
          .then(res => res.json())
          .then(data => {
            if (data.success && data.passengers) {
              if (data.route) setRoute(data.route);
              if (data.date) setDate(data.date);
              setPassengers(data.passengers);
              setIsExample(false);
              showToast(`Loaded ${data.passengers.length} passengers (${data.totalSeats} seats) from PDF!`);
            } else {
              alert('Could not parse PDF: ' + (data.error || 'Unknown error'));
            }
          })
          .catch(err => alert('Error parsing PDF: ' + err.message));
      };
      reader.readAsDataURL(file);
      return;
    }

    if (ext === 'xlsx' || ext === 'xls') {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const data = new Uint8Array(e.target.result);
          const wb = XLSX.read(data, { type: 'array' });
          const firstSheet = wb.Sheets[wb.SheetNames[0]];
          const csv = XLSX.utils.sheet_to_csv(firstSheet);
          handleBuildList(csv);
        } catch (err) {
          alert('Could not parse Excel file: ' + err.message);
        }
      };
      reader.readAsArrayBuffer(file);
    } else {
      const reader = new FileReader();
      reader.onload = (e) => {
        handleBuildList(e.target.result);
      };
      reader.readAsText(file);
    }
  };

  // Disconnect WhatsApp session
  const handleDisconnectWa = async () => {
    if (confirm('Disconnect this WhatsApp session? You can reconnect anytime by scanning a new QR code.')) {
      try {
        await fetch('/api/whatsapp/disconnect', { method: 'POST' });
        showToast('Disconnected.');
      } catch (e) {
        alert('Error disconnecting: ' + e.message);
      }
    }
  };

  // 1-Click "Send to All" Handler
  const handleSendAll = async () => {
    if (waStatus !== 'connected') {
      setShowQrModal(true);
      return;
    }

    if (isExample) {
      alert('Please upload yesterday’s actual passenger chart in Step 1 first before sending.');
      return;
    }

    if (!passengers.length) {
      alert('No passengers in list to send to.');
      return;
    }

    const unlinkedDirect = passengers.filter(p => p.src === 'd' && !googleLink.trim());
    if (unlinkedDirect.length > 0) {
      if (!confirm(`Warning: You have ${unlinkedDirect.length} direct bookings, but no Google Review link entered. Send anyway?`)) {
        return;
      }
    }

    const payloadPassengers = passengers.map(p => ({
      num: p.num,
      name: getDisplayName(p.name),
      seats: p.seats,
      src: p.src,
      message: formatMessage(p)
    }));

    try {
      const res = await fetch('/api/send-batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          passengers: payloadPassengers,
          delaySeconds: Number(delaySeconds) || 6
        })
      });

      const data = await res.json();
      if (!res.ok) {
        alert('Failed to start sending: ' + (data.error || 'Unknown error'));
      } else {
        showToast('🚀 Automated sending started!');
      }
    } catch (e) {
      alert('Network error communicating with server: ' + e.message);
    }
  };

  // Stop / Cancel Sending
  const handleCancelSend = async () => {
    if (confirm('Pause/Cancel remaining messages?')) {
      try {
        await fetch('/api/send-batch/cancel', { method: 'POST' });
        showToast('Cancelling job...');
      } catch (e) {}
    }
  };

  // Export CSV Report
  const handleExportCSV = () => {
    if (!passengers.length) return alert('No passengers to export.');
    const sentMap = {};
    (batchProgress.sentList || []).forEach(s => { sentMap[s.num] = s.time; });

    const rows = [
      ['Name', 'Mobile', 'Seats', 'Source', 'Status', 'SentTime', 'Route', 'Date', 'Message']
    ];
    passengers.forEach(p => {
      const sentTime = sentMap[p.num] || '';
      const status = sentTime ? 'Sent' : 'Pending';
      const seatStr = (p.seats || []).join(';');
      const msg = formatMessage(p).replace(/"/g, '""');
      rows.push([`"${p.name}"`, `"${p.num}"`, `"${seatStr}"`, `"${p.src === 'd' ? 'Direct' : 'redBus'}"`, `"${status}"`, `"${sentTime}"`, `"${route}"`, `"${date}"`, `"${msg}"`]);
    });
    const blob = new Blob([rows.map(r => r.join(',')).join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Review_Delivery_Report_${date || 'chart'}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const total = passengers.length;
  const sentCount = (batchProgress.sentList || []).length;
  const percentDone = total ? Math.round((sentCount / total) * 100) : 0;
  const isSending = batchProgress.isSending;

  // Filter passengers
  let displayList = passengers;
  const sentNumSet = new Set((batchProgress.sentList || []).map(s => s.num));
  if (filter === 'todo') displayList = passengers.filter(p => !sentNumSet.has(p.num));
  else if (filter === 'done') displayList = passengers.filter(p => sentNumSet.has(p.num));

  if (search.trim()) {
    const q = search.trim().toLowerCase();
    displayList = displayList.filter(p =>
      p.name.toLowerCase().includes(q) ||
      p.num.includes(q) ||
      (p.seats || []).join(' ').toLowerCase().includes(q)
    );
  }

  return (
    <div className="wrap">
      {/* Top Header */}
      <header className="top-header">
        <div>
          <span className="route-tag">{bus} · {route}</span>
          <h1>Omni Bus Review Sender</h1>
          <p className="lede">One-click automated post-trip review sender for your passengers. Upload yesterday's chart and tap Send.</p>
        </div>
        <button
          type="button"
          className="icon-btn"
          onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
          title="Toggle Theme"
        >
          {theme === 'dark' ? '☀️' : '🌙'}
        </button>
      </header>

      {/* WhatsApp Status Banner */}
      <section className="card" style={{ padding: '14px 18px', background: waStatus === 'connected' ? 'var(--accent-soft)' : 'var(--warn-bg)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 20 }}>{waStatus === 'connected' ? '🟢' : '📱'}</span>
            <div>
              <div style={{ fontWeight: 700, fontSize: 14, color: waStatus === 'connected' ? 'var(--accent)' : 'var(--warn)' }}>
                {waStatus === 'connected'
                  ? `WhatsApp Ready: Connected as +${waUserPhone || 'Office WhatsApp'}`
                  : 'WhatsApp Not Connected to Office Phone'}
              </div>
              <div style={{ fontSize: 12.5, color: 'var(--muted)' }}>
                {waStatus === 'connected'
                  ? 'Ready to send messages to all passengers in 1 click.'
                  : 'Scan the QR code once to link the office WhatsApp phone.'}
              </div>
            </div>
          </div>

          <div className="row-inline">
            {waStatus === 'connected' ? (
              <button type="button" className="btn btn-ghost btn-small" onClick={handleDisconnectWa}>
                Disconnect
              </button>
            ) : (
              <button type="button" className="btn btn-primary btn-small" onClick={() => setShowQrModal(true)}>
                Scan QR Code
              </button>
            )}
          </div>
        </div>

        {/* Inline QR Code if user requests or disconnected */}
        {(showQrModal || (waStatus !== 'connected' && waQrCode)) && (
          <div style={{ marginTop: 12, padding: 16, background: 'var(--surface)', borderRadius: 10, textAlign: 'center', border: '1px solid var(--line)' }}>
            <h3 style={{ margin: '0 0 6px 0', fontSize: 16 }}>Link Office WhatsApp Phone</h3>
            <p style={{ margin: '0 0 12px 0', fontSize: 13, color: 'var(--muted)' }}>
              1. Open WhatsApp on office phone &gt; tap <strong>Settings</strong> (or 3 dots) &gt; <strong>Linked Devices</strong><br/>
              2. Tap <strong>Link a Device</strong> and point your camera at this QR code:
            </p>
            {waQrCode ? (
              <img src={waQrCode} alt="WhatsApp QR Code" style={{ width: 220, height: 220, margin: '0 auto', display: 'block', borderRadius: 8 }} />
            ) : (
              <div style={{ padding: 40, color: 'var(--muted)' }}>Generating QR code...</div>
            )}
            <div style={{ marginTop: 10 }}>
              <button type="button" className="btn btn-ghost btn-small" onClick={() => setShowQrModal(false)}>
                Hide QR Code
              </button>
            </div>
          </div>
        )}
      </section>

      {/* Step 1: Upload Chart */}
      <section className="card">
        <div className="head">
          <p className="eyebrow">Step 1</p>
          <h2>Upload Yesterday's Passenger Chart</h2>
        </div>

        {/* Drag & Drop Zone */}
        <div
          className={`dropzone ${dragOver ? 'dragover' : ''}`}
          onClick={() => fileInputRef.current && fileInputRef.current.click()}
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragOver(false);
            if (e.dataTransfer.files && e.dataTransfer.files[0]) {
              handleFileUpload(e.dataTransfer.files[0]);
            }
          }}
        >
          <span className="dropzone-icon">📥</span>
          <span className="dropzone-text">Drop EzeeInfo PDF, Excel (.xlsx), CSV, or Chart text file here</span>
          <span className="dropzone-sub">or click to browse from computer</span>
          <input
            type="file"
            ref={fileInputRef}
            accept=".pdf,.xlsx,.xls,.csv,.tsv,.txt"
            style={{ display: 'none' }}
            onChange={(e) => {
              if (e.target.files && e.target.files[0]) {
                handleFileUpload(e.target.files[0]);
              }
            }}
          />
        </div>

        {/* Paste Box */}
        <div className="field">
          <label>Or Paste Chart Lines from EzeeInfo Dashboard / WhatsApp</label>
          <textarea
            rows={3}
            value={pasteText}
            onChange={(e) => setPasteText(e.target.value)}
            placeholder="Paste table rows from EzeeInfo Boarding Chart...&#10;L4   SPYQAUBX50600   ASHWANTH   24 M 6382836622   Udumalaipet   Chennai   Redbus&#10;U9   SPYQAUI58M641   ARUN PRAKASH   32 M 9840012345   Direct"
          />
        </div>

        <div className="row-inline" style={{ justifyContent: 'space-between' }}>
          <div className="row-inline">
            <span style={{ fontSize: 13, color: 'var(--muted)' }}>Unspecified:</span>
            <select
              value={defSrc}
              onChange={(e) => setDefSrc(e.target.value)}
              style={{ width: 'auto', minHeight: 34, padding: '2px 8px', fontSize: 13 }}
            >
              <option value="r">redBus</option>
              <option value="d">Direct</option>
            </select>
          </div>
          <div className="row-inline">
            <button
              type="button"
              className="btn btn-ghost btn-small"
              style={{ fontWeight: 600, color: 'var(--accent)', borderColor: 'var(--accent)' }}
              onClick={async () => {
                try {
                  const res = await fetch('/api/upload-chart-pdf', { method: 'POST' });
                  const data = await res.json();
                  if (data.success && data.passengers) {
                    if (data.route) setRoute(data.route);
                    if (data.date) setDate(data.date);
                    setPassengers(data.passengers);
                    setIsExample(false);
                    showToast(`Loaded yesterday's chart: ${data.passengers.length} passengers (${data.totalSeats} seats)!`);
                  } else {
                    alert('Error: ' + data.error);
                  }
                } catch (e) {
                  alert('Network error: ' + e.message);
                }
              }}
            >
              ⚡ Load Yesterday's Chart (18 Nov)
            </button>
            <button type="button" className="btn btn-primary btn-small" onClick={() => handleBuildList()}>
              Build List
            </button>
          </div>
        </div>
      </section>

      {/* Step 2: Message & Link Customization */}
      <section className="card">
        <div className="head">
          <p className="eyebrow">Step 2</p>
          <h2>Customize Review Messages</h2>
        </div>

        <div className="tabs">
          <button
            type="button"
            className={`tab ${activeTab === 'r' ? 'active' : ''}`}
            onClick={() => setActiveTab('r')}
          >
            redBus Passengers
          </button>
          <button
            type="button"
            className={`tab ${activeTab === 'd' ? 'active' : ''}`}
            onClick={() => setActiveTab('d')}
          >
            Direct Bookings
          </button>
        </div>

        {activeTab === 'd' && (
          <div className="field">
            <label>Google Review Link</label>
            <input
              type="url"
              value={googleLink}
              onChange={(e) => setGoogleLink(e.target.value)}
              placeholder="https://g.page/r/your-bus-service/review"
            />
          </div>
        )}

        <div className="field">
          <div className="row-inline" style={{ justifyContent: 'space-between' }}>
            <span className="label">Message</span>
            <div className="row-inline">
              <button
                type="button"
                className="btn btn-ghost btn-small"
                onClick={() => activeTab === 'd' ? setTplD(D_EN) : setTplR(R_EN)}
              >
                English
              </button>
              <button
                type="button"
                className="btn btn-ghost btn-small"
                onClick={() => activeTab === 'd' ? setTplD(D_TA) : setTplR(R_TA)}
              >
                தமிழ்
              </button>
            </div>
          </div>
          <textarea
            ref={textareaRef}
            rows={4}
            value={activeTab === 'd' ? tplD : tplR}
            onChange={(e) => activeTab === 'd' ? setTplD(e.target.value) : setTplR(e.target.value)}
          />
        </div>

        <div className="bubble-wrap">
          <span className="label">Preview</span>
          <div className="bubble">
            {formatMessage(passengers[0] || { name: 'Ashwanth', num: '916382836622', seats: ['L4'], src: activeTab })}
          </div>
        </div>
      </section>

      {/* Step 3: Single-Click Send To All */}
      <section className="card" id="step3">
        <div className="head">
          <p className="eyebrow">Step 3</p>
          <h2>1-Click Delivery to All Passengers</h2>
        </div>

        {/* Big Action Box */}
        <div style={{
          padding: 20,
          background: 'var(--surface)',
          border: '2px solid var(--accent)',
          borderRadius: 14,
          display: 'flex',
          flexDirection: 'column',
          gap: 14,
          boxShadow: '0 4px 16px rgba(11, 122, 71, 0.1)'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
            <div>
              <div style={{ fontSize: 18, fontWeight: 700 }}>
                {isSending ? `Sending to passengers (${batchProgress.currentIndex} of ${total})...` : `Ready to send to ${total} passengers`}
              </div>
              <div style={{ fontSize: 13, color: 'var(--muted)' }}>
                {isSending
                  ? `Currently sending to: ${batchProgress.currentPassenger ? `${batchProgress.currentPassenger.name} (+${batchProgress.currentPassenger.num})` : 'Next...'}`
                  : 'Automated sequence: Sends WhatsApp messages in the background with safe rate-limiting.'}
              </div>
            </div>

            <div className="row-inline">
              <label style={{ fontSize: 12.5, color: 'var(--muted)' }}>Delay:</label>
              <select
                value={delaySeconds}
                onChange={(e) => setDelaySeconds(e.target.value)}
                disabled={isSending}
                style={{ width: 'auto', minHeight: 34, padding: '2px 8px', fontSize: 12.5 }}
              >
                <option value={5}>5s per passenger</option>
                <option value={6}>6s per passenger (Recommended)</option>
                <option value={8}>8s per passenger</option>
                <option value={10}>10s per passenger</option>
              </select>
            </div>
          </div>

          {/* Progress Bar */}
          <div className="meter" style={{ height: 12 }}>
            <span style={{ width: `${percentDone}%`, background: isSending ? 'linear-gradient(90deg, #0B7A47, #34D58A)' : 'var(--accent)' }}></span>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: 'var(--muted)' }}>
            <span><strong>{sentCount}</strong> sent of <strong>{total}</strong></span>
            <span><strong>{percentDone}%</strong> completed</span>
          </div>

          {/* Primary Action Button */}
          <div style={{ display: 'flex', gap: 10 }}>
            {isSending ? (
              <button
                type="button"
                className="btn btn-ghost"
                onClick={handleCancelSend}
                style={{ flex: 1, minHeight: 50, fontSize: 16, color: 'var(--warn)', borderColor: 'var(--warn)' }}
              >
                ⏹ Stop / Cancel Sending
              </button>
            ) : (
              <button
                type="button"
                className="btn btn-primary"
                onClick={handleSendAll}
                style={{ flex: 1, minHeight: 50, fontSize: 16, fontWeight: 700 }}
              >
                🚀 Send to All Passengers (1-Click)
              </button>
            )}
          </div>
        </div>

        {/* Live Delivery Activity Log */}
        {((batchProgress.sentList && batchProgress.sentList.length > 0) || (batchProgress.failedList && batchProgress.failedList.length > 0)) && (
          <div style={{ marginTop: 10 }}>
            <h4 style={{ margin: '0 0 8px 0', fontSize: 14 }}>Live Delivery Receipts</h4>
            <div style={{ maxHeight: 200, overflowY: 'auto', border: '1px solid var(--line)', borderRadius: 10, padding: 8, fontSize: 13, background: 'var(--bg)' }}>
              {batchProgress.sentList.map((s, idx) => (
                <div key={idx} style={{ padding: '4px 6px', display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--line)' }}>
                  <span>✓ <strong>{s.name}</strong> ({formatPhoneDisplay(s.num)}) {s.seats && s.seats.length ? `[Seats: ${s.seats.join(',')}]` : ''}</span>
                  <span style={{ color: 'var(--accent)', fontWeight: 600 }}>Sent at {s.time}</span>
                </div>
              ))}
              {batchProgress.failedList.map((f, idx) => (
                <div key={idx} style={{ padding: '4px 6px', display: 'flex', justifyContent: 'space-between', color: 'var(--rb)' }}>
                  <span>✗ <strong>{f.name}</strong> ({formatPhoneDisplay(f.num)})</span>
                  <span>Failed: {f.error}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Toolbar & Passenger List */}
        <div style={{ marginTop: 14 }}>
          <div className="toolbar">
            <div className="tabs">
              <button
                type="button"
                className={`tab ${filter === 'all' ? 'active' : ''}`}
                onClick={() => setFilter('all')}
              >
                All <b>{total}</b>
              </button>
              <button
                type="button"
                className={`tab ${filter === 'todo' ? 'active' : ''}`}
                onClick={() => setFilter('todo')}
              >
                Pending <b>{total - sentCount}</b>
              </button>
              <button
                type="button"
                className={`tab ${filter === 'done' ? 'active' : ''}`}
                onClick={() => setFilter('done')}
              >
                Sent <b>{sentCount}</b>
              </button>
            </div>

            <input
              type="text"
              className="search-input"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="🔍 Search name, phone..."
            />
          </div>

          <ul className="list" style={{ marginTop: 10 }}>
            {displayList.map(p => {
              const isSent = sentNumSet.has(p.num);
              return (
                <li key={p.num} className={`row ${isSent ? 'done' : ''}`}>
                  <div className="who">
                    <div className="name-row">
                      <span className="name">{getDisplayName(p.name)}</span>
                      {p.seats && p.seats.length > 0 && (
                        <span className="seat-badge">{p.seats.join(', ')}</span>
                      )}
                    </div>
                    <div className="num-row">
                      <span className="num">{formatPhoneDisplay(p.num)}</span>
                    </div>
                  </div>

                  <span className={`chip ${p.src === 'd' ? 'chip-d' : 'chip-r'}`}>
                    {p.src === 'd' ? 'Direct' : 'redBus'}
                  </span>

                  {isSent ? (
                    <span style={{ fontSize: 13, color: 'var(--accent)', fontWeight: 600 }}>✓ Sent</span>
                  ) : (
                    <span style={{ fontSize: 13, color: 'var(--muted)' }}>Pending</span>
                  )}
                </li>
              );
            })}
          </ul>
        </div>

        {/* Footer */}
        <div className="foot">
          <button type="button" className="btn btn-ghost btn-small" onClick={handleExportCSV}>
            📥 Download Delivery Report (CSV)
          </button>
        </div>
      </section>

      {/* Toast */}
      <div className={`toast ${toastMsg ? 'show' : ''}`} role="status">
        {toastMsg}
      </div>
    </div>
  );
}
