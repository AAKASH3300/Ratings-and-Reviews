import React, { useState, useEffect, useRef } from 'react';
import * as XLSX from 'xlsx';
import { parseChartContent, formatPhoneDisplay, normalizePhone, cleanPassengerName, titleCase } from './utils/ezeeinfoParser';

const KEY = 'spyderzlink-bus-v1';
const BUS_EMOJIS = ['🚌', '🚍', '⭐', '🌟', '🙏', '✨', '🛣️', '🎫', '🛋️', '❄️', '📍', '💖'];

const R_EN = "Hi {name}, thank you for travelling with {bus} ({route}) yesterday! ⭐ redBus will send you a message on WhatsApp to rate your trip. If you enjoyed your journey, please give us a 5-star rating on redBus 🚌✨. As a new service, your rating helps us tremendously! 🙏";
const R_TA = "வணக்கம் {name}, நேற்று {bus}-ல் ({route}) பயணம் செய்தமைக்கு மிக்க நன்றி! 🚌 உங்கள் பயணத்தை rate செய்ய redBus WhatsApp-ல் ஒரு செய்தி அனுப்பும். பயணம் பிடித்திருந்தால், redBus-ல் எங்களுக்கு 5-star rating கொடுங்கள் ⭐⭐⭐⭐⭐. உங்கள் ஆதரவு எங்களுக்கு மிகவும் உதவும்! 🙏✨";
const D_EN = "Hi {name}, thank you for travelling with {bus} ({route}) yesterday! 🚌 How was your trip? If you enjoyed your journey, a quick 5-star Google review would really help our service: {link} ⭐⭐⭐⭐⭐ - Thank you! 🙏";
const D_TA = "வணக்கம் {name}, நேற்று {bus}-ல் ({route}) பயணம் செய்தமைக்கு மிக்க நன்றி! 🚌 உங்கள் பயண அனுபவம் எப்படி இருந்தது? ஒரு நிமிடம் ஒதுக்கி எங்களுக்கு ஒரு Google review கொடுத்தால் மிகவும் உதவியாக இருக்கும்: {link} ⭐⭐⭐⭐⭐ - நன்றி! 🙏";

export default function App() {
  const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];

  const [bus, setBus] = useState('SpyderZ Link');
  const [route, setRoute] = useState('Udumalaipettai to Chennai');
  const [date, setDate] = useState(yesterday);
  const [googleLink, setGoogleLink] = useState('');
  const [tplR, setTplR] = useState(R_TA);
  const [tplD, setTplD] = useState(D_TA);
  const [activeTab, setActiveTab] = useState('r');
  const [useFirstName, setUseFirstName] = useState(false);
  const [defSrc, setDefSrc] = useState('r');
  const [pasteText, setPasteText] = useState('');
  const [passengers, setPassengers] = useState([]);
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [theme, setTheme] = useState('light');
  const [toastMsg, setToastMsg] = useState('');
  const [dragOver, setDragOver] = useState(false);
  const [delaySeconds, setDelaySeconds] = useState(6);

  // Quick Add State (for 1 or 2 specific passengers)
  const [quickName, setQuickName] = useState('');
  const [quickNum, setQuickNum] = useState('');
  const [quickSrc, setQuickSrc] = useState('r');
  const [quickSeat, setQuickSeat] = useState('');
  const [sendingNum, setSendingNum] = useState(null);

  // Image Attachment State
  const [attachImage, setAttachImage] = useState(true);
  const [selectedImage, setSelectedImage] = useState(null);

  // WhatsApp Backend Connection State
  const [waStatus, setWaStatus] = useState('connecting');
  const [waQrCode, setWaQrCode] = useState(null);
  const [waUserPhone, setWaUserPhone] = useState(null);
  const [showQrModal, setShowQrModal] = useState(false);

  // Batch Progress State
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
  const imgInputRef = useRef(null);

  // Load default bus image & saved preferences
  useEffect(() => {
    fetch('/api/default-image')
      .then(res => res.json())
      .then(data => {
        if (data.success && data.dataUrl) {
          setSelectedImage(data.dataUrl);
        }
      })
      .catch(() => {});

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
        if (saved.theme) setTheme(saved.theme);
        if (saved.attachImage !== undefined) setAttachImage(saved.attachImage);
      }
    } catch (e) {}

    // Auto-load yesterday's chart on startup
    fetch('/api/upload-chart-pdf', { method: 'POST' })
      .then(res => res.json())
      .then(data => {
        if (data.success && data.passengers) {
          if (data.route) setRoute(data.route);
          if (data.date) setDate(data.date);
          setPassengers(data.passengers);
        }
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    const data = { bus, route, date, googleLink, tplR, tplD, activeTab, useFirstName, theme, attachImage };
    try { localStorage.setItem(KEY, JSON.stringify(data)); } catch (e) {}
  }, [bus, route, date, googleLink, tplR, tplD, activeTab, useFirstName, theme, attachImage]);

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
          setWaStatus(prev => {
            if (prev !== 'connected' && data.status === 'connected') {
              showToast(`🎉 WhatsApp Connected as +${data.userPhone || 'Bus Office'}! Ready to send in 1 click.`);
              setShowQrModal(false);
            }
            return data.status;
          });
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
    const isDirect = (p && p.src === 'd');
    const tpl = isDirect ? tplD : tplR;
    const name = getDisplayName(p && p.name);
    const seatStr = (p && p.seats && p.seats.length) ? p.seats.join(', ') : '';
    return tpl
      .split('{name}').join(name)
      .split('{bus}').join(bus || 'SpyderZ Link')
      .split('{route}').join(route || 'Udumalaipettai to Chennai')
      .split('{date}').join(date || 'yesterday')
      .split('{seat}').join(seatStr)
      .split('{link}').join(googleLink.trim() || '{link}');
  };

  const insertText = (str) => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const current = activeTab === 'd' ? tplD : tplR;
    const updated = current.substring(0, start) + str + current.substring(end);
    if (activeTab === 'd') setTplD(updated);
    else setTplR(updated);
    setTimeout(() => {
      textarea.selectionStart = textarea.selectionEnd = start + str.length;
      textarea.focus();
    }, 10);
  };

  const handleCustomImageUpload = (file) => {
    if (!file || !file.type.startsWith('image/')) return alert('Please select a valid image file (PNG/JPG).');
    const reader = new FileReader();
    reader.onload = (e) => {
      setSelectedImage(e.target.result);
      setAttachImage(true);
      showToast('Attached bus image!');
    };
    reader.readAsDataURL(file);
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
          alert('Could not parse Excel: ' + err.message);
        }
      };
      reader.readAsArrayBuffer(file);
    } else {
      const reader = new FileReader();
      reader.onload = (e) => handleBuildList(e.target.result);
      reader.readAsText(file);
    }
  };

  const handleBuildList = (textToParse = pasteText) => {
    if (!textToParse.trim()) return showToast('Paste chart rows or upload a file first.');
    const res = parseChartContent(textToParse, defSrc);
    if (!res.rows.length) return alert('No valid passenger phone numbers detected. Enter a 10-digit number like 9876543210.');
    if (res.detectedRoute) setRoute(res.detectedRoute);
    if (res.detectedDate) setDate(res.detectedDate);
    setPassengers(res.rows);
    setFilter('all');
    setPasteText('');
    showToast(`Loaded ${res.rows.length} passengers!`);
  };

  // Quick Add 1 or 2 Passengers to List
  const handleAddQuickPassenger = () => {
    if (!quickNum.trim()) return showToast('Please enter a mobile number.');
    const validNum = normalizePhone(quickNum);
    if (!validNum) {
      return alert('Invalid mobile number format. Enter a 10-digit number (e.g. 9876543210 or +91 98765 43210).');
    }
    const cleanName = cleanPassengerName(quickName) || 'Sir/Madam';
    const newPassenger = {
      name: titleCase(cleanName),
      num: validNum,
      seats: quickSeat.trim() ? [quickSeat.trim().toUpperCase()] : [],
      src: quickSrc
    };
    setPassengers(prev => {
      const filtered = prev.filter(p => p.num !== validNum);
      return [newPassenger, ...filtered];
    });
    setQuickName('');
    setQuickNum('');
    setQuickSeat('');
    showToast(`Added ${newPassenger.name} to passenger list!`);
  };

  // Send Single WhatsApp Review Message Instantly (for 1 or 2 members)
  const handleSendSingle = async (passengerToSend) => {
    if (waStatus !== 'connected') {
      setShowQrModal(true);
      showToast('📱 Please link WhatsApp using the QR code first!');
      return;
    }
    if (!passengerToSend || !passengerToSend.num) return;
    if (passengerToSend.src === 'd' && !googleLink.trim()) {
      return alert('Please enter your Google Review link for Direct passengers.');
    }

    setSendingNum(passengerToSend.num);
    try {
      const res = await fetch('/api/send-single', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          recipient: {
            num: passengerToSend.num,
            name: getDisplayName(passengerToSend.name),
            seats: passengerToSend.seats || [],
            src: passengerToSend.src
          },
          message: formatMessage(passengerToSend),
          imageBase64: attachImage ? selectedImage : null
        })
      });
      const data = await res.json();
      if (!res.ok) {
        alert('Failed to send: ' + (data.error || 'Unknown error'));
        if (data.error && data.error.includes('WhatsApp is not connected')) {
          setShowQrModal(true);
        }
      } else {
        const channelLabel = passengerToSend.src === 'd' ? 'Direct' : 'redBus';
        showToast(`✓ Sent ${channelLabel} reminder to ${passengerToSend.name}!`);
        if (data.receipt) {
          setBatchProgress(prev => ({
            ...prev,
            sentList: [data.receipt, ...(prev.sentList || []).filter(s => s.num !== passengerToSend.num)]
          }));
        }
      }
    } catch (e) {
      alert('Error sending: ' + e.message);
    } finally {
      setSendingNum(null);
    }
  };

  // Instant Send Directly from Quick Add Form
  const handleSendQuickNow = async () => {
    if (waStatus !== 'connected') {
      setShowQrModal(true);
      showToast('📱 Please link WhatsApp using the QR code first!');
      return;
    }
    const validNum = normalizePhone(quickNum);
    if (!validNum) {
      return alert('Please enter a valid 10-digit mobile number (e.g. 9876543210).');
    }
    const cleanName = cleanPassengerName(quickName) || 'Sir/Madam';
    const passObj = {
      name: titleCase(cleanName),
      num: validNum,
      seats: quickSeat.trim() ? [quickSeat.trim().toUpperCase()] : [],
      src: quickSrc
    };
    setPassengers(prev => {
      const filtered = prev.filter(p => p.num !== validNum);
      return [passObj, ...filtered];
    });
    await handleSendSingle(passObj);
  };

  const handleRemovePassenger = (numToRemove) => {
    setPassengers(prev => prev.filter(p => p.num !== numToRemove));
    showToast('Removed from list.');
  };

  // 1-Click Send to All
  const handleSendAll = async () => {
    if (waStatus !== 'connected') {
      setShowQrModal(true);
      showToast('📱 Please scan the WhatsApp QR code to link your phone first!');
      return;
    }
    if (!passengers.length) {
      return alert('No passengers in list. Please upload a Trip Chart PDF or add passengers first.');
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
          imageBase64: attachImage ? selectedImage : null,
          delaySeconds: Number(delaySeconds) || 6
        })
      });
      const data = await res.json();
      if (!res.ok) {
        alert('Failed: ' + (data.error || 'Unknown error'));
        if (data.error && data.error.includes('WhatsApp is not connected')) {
          setShowQrModal(true);
        }
      } else {
        showToast('🚀 Automated sending started! Watch live receipts below.');
      }
    } catch (e) {
      alert('Network error: ' + e.message);
    }
  };

  const handleCancelSend = async () => {
    if (confirm('Cancel remaining messages?')) {
      try {
        await fetch('/api/send-batch/cancel', { method: 'POST' });
        showToast('⏹ Sending cancelled.');
      } catch (e) {}
    }
  };

  const total = passengers.length;
  const sentCount = (batchProgress.sentList || []).length;
  const failedCount = (batchProgress.failedList || []).length;
  const processedCount = sentCount + failedCount;
  const percentDone = total ? Math.min(100, Math.round((processedCount / total) * 100)) : 0;
  const isSending = batchProgress.isSending;
  const sentNumSet = new Set((batchProgress.sentList || []).map(s => s.num));

  let displayList = passengers;
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

  const normalizedQuick = normalizePhone(quickNum);

  return (
    <div className="wrap">
      {/* Header */}
      <header className="top-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <img
            src="/logo.jpg"
            alt="SpyderZ Link Logo"
            style={{ width: 110, height: 48, objectFit: 'contain', background: '#000', borderRadius: 10, padding: '4px 8px', border: '1.5px solid var(--accent)', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}
          />
          <div>
            <span className="route-tag">🚌 {bus} · {route}</span>
            <h1>{bus} Review Sender</h1>
            <p className="lede">Executive review reminder platform for redBus & Direct passengers with custom branding and WhatsApp media delivery.</p>
          </div>
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

      {/* Brand & Route Customization Toolbar (Allows Modifying Bus Name, Route, Date) */}
      <section className="meta-card">
        <div className="meta-item">
          <label>🏷️ Service Name (Click to edit site name)</label>
          <input
            type="text"
            value={bus}
            onChange={(e) => setBus(e.target.value)}
            placeholder="e.g. SpyderZ Link"
            title="Modify the site / bus name here"
          />
        </div>
        <div className="meta-item">
          <label>🛣️ Route Name</label>
          <input
            type="text"
            value={route}
            onChange={(e) => setRoute(e.target.value)}
            placeholder="e.g. Udumalaipettai to Chennai"
            title="Modify route name"
          />
        </div>
        <div className="meta-item">
          <label>📅 Travel Date</label>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            title="Modify travel date"
          />
        </div>
      </section>

      {/* WhatsApp Status Bar with Pulsing Status Orb */}
      <section className="card" style={{ padding: '16px 20px', background: waStatus === 'connected' ? 'var(--accent-soft)' : 'var(--warn-bg)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span className={`status-orb ${waStatus === 'connected' ? 'connected' : 'disconnected'}`}></span>
            <div>
              <div style={{ fontWeight: 800, fontSize: 14.5, color: waStatus === 'connected' ? 'var(--accent)' : 'var(--warn)' }}>
                {waStatus === 'connected'
                  ? `WhatsApp Ready: Connected as +${waUserPhone || 'Bus Office'}`
                  : 'WhatsApp Not Connected to Office Phone'}
              </div>
              <div style={{ fontSize: 13, color: 'var(--muted)' }}>
                {waStatus === 'connected' ? 'Ready to send messages with images in 1 click.' : 'Scan QR code once to link office phone.'}
              </div>
            </div>
          </div>
          <div className="row-inline">
            {waStatus === 'connected' ? (
              <button type="button" className="btn btn-ghost btn-small" onClick={() => fetch('/api/whatsapp/disconnect', { method: 'POST' })}>
                Disconnect
              </button>
            ) : (
              <button type="button" className="btn btn-primary btn-small" onClick={() => setShowQrModal(true)}>
                Scan QR Code
              </button>
            )}
          </div>
        </div>

        {(showQrModal || (waStatus !== 'connected' && waQrCode)) && (
          <div style={{ marginTop: 14, padding: 20, background: 'var(--surface)', borderRadius: 14, textAlign: 'center', border: '1px solid var(--line)', boxShadow: '0 4px 12px rgba(0,0,0,0.05)' }}>
            <h3 style={{ margin: '0 0 6px 0', fontSize: 17, fontWeight: 700 }}>Link Bus Office WhatsApp Phone</h3>
            <p style={{ margin: '0 0 14px 0', fontSize: 13, color: 'var(--muted)' }}>
              Open WhatsApp on office phone &gt; Linked Devices &gt; Link a Device &gt; Scan this QR code:
            </p>
            {waQrCode ? (
              <img src={waQrCode} alt="WhatsApp QR Code" style={{ width: 220, height: 220, margin: '0 auto', display: 'block', borderRadius: 12, border: '1px solid var(--line)' }} />
            ) : (
              <div style={{ padding: 40, color: 'var(--muted)' }}>Generating QR code...</div>
            )}
            <div style={{ marginTop: 12 }}>
              <button type="button" className="btn btn-ghost btn-small" onClick={() => setShowQrModal(false)}>
                Hide QR Code
              </button>
            </div>
          </div>
        )}
      </section>

      {/* Step 1: Add Passengers (Split Layout: Quick Add on Left, Upload/Paste on Right) */}
      <section className="card">
        <div className="head">
          <p className="eyebrow">Step 1</p>
          <h2>Add Passengers (redBus & Direct)</h2>
        </div>

        <div className="step1-split">
          {/* Left: Quick Add for 1 or 2 Members */}
          <div className="quick-add-box">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <strong style={{ fontSize: 14.5 }}>⚡ Quick Type & Send (1 or 2 Members)</strong>
              <span style={{ fontSize: 11, background: 'var(--accent-soft)', color: 'var(--accent)', padding: '3px 9px', borderRadius: 6, fontWeight: 700 }}>Individual</span>
            </div>

            <div className="field">
              <label>Passenger Name</label>
              <input
                type="text"
                value={quickName}
                onChange={(e) => setQuickName(e.target.value)}
                placeholder="e.g. Ramesh / Priya"
              />
            </div>

            <div className="field">
              <label>Mobile Number</label>
              <input
                type="text"
                value={quickNum}
                onChange={(e) => setQuickNum(e.target.value)}
                placeholder="e.g. 9876543210 or +91 98765 43210"
              />
              {quickNum.trim() ? (
                normalizedQuick ? (
                  <div className="phone-validation-hint valid">
                    ✓ Valid Number: {formatPhoneDisplay(normalizedQuick)}
                  </div>
                ) : (
                  <div className="phone-validation-hint invalid">
                    ⚠️ Enter a 10-digit number (e.g. 9876543210)
                  </div>
                )
              ) : null}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <div className="field">
                <label>Booking Channel</label>
                <select value={quickSrc} onChange={(e) => setQuickSrc(e.target.value)}>
                  <option value="r">redBus</option>
                  <option value="d">Direct</option>
                </select>
              </div>
              <div className="field">
                <label>Seat No. (Optional)</label>
                <input
                  type="text"
                  value={quickSeat}
                  onChange={(e) => setQuickSeat(e.target.value)}
                  placeholder="e.g. L4, U2"
                />
              </div>
            </div>

            <div className="row-inline" style={{ marginTop: 4 }}>
              <button
                type="button"
                className="btn btn-ghost btn-small"
                onClick={handleAddQuickPassenger}
                style={{ flex: 1 }}
              >
                + Add to List
              </button>
              <button
                type="button"
                className="btn btn-primary btn-small"
                onClick={handleSendQuickNow}
                disabled={!normalizedQuick || sendingNum === normalizedQuick}
                style={{ flex: 1 }}
              >
                {sendingNum === normalizedQuick ? 'Sending...' : '⚡ Send Now'}
              </button>
            </div>

            {/* Format Note Callout */}
            <div className="format-note">
              <div className="format-note-title">💡 How to enter Mobile Number:</div>
              <ul>
                <li>Enter any 10-digit mobile number (e.g. <code>9876543210</code> or <code>+91 98765 43210</code>).</li>
                <li>Country code <code>+91</code> is automatically added if omitted.</li>
                <li>Ideal for sending redBus/Direct reminders to 1 or 2 passengers separately!</li>
              </ul>
            </div>
          </div>

          {/* Right: Upload File or Paste Rows */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div
              className={`dropzone ${dragOver ? 'dragover' : ''}`}
              onClick={() => fileInputRef.current && fileInputRef.current.click()}
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragOver(false);
                if (e.dataTransfer.files && e.dataTransfer.files[0]) handleFileUpload(e.dataTransfer.files[0]);
              }}
            >
              <span className="dropzone-icon">📥</span>
              <span className="dropzone-text">Drop EzeeInfo PDF, Excel (.xlsx), or CSV here</span>
              <span className="dropzone-sub">or click to browse from computer</span>
              <input
                type="file"
                ref={fileInputRef}
                accept=".pdf,.xlsx,.xls,.csv,.tsv,.txt"
                style={{ display: 'none' }}
                onChange={(e) => { if (e.target.files && e.target.files[0]) handleFileUpload(e.target.files[0]); }}
              />
            </div>

            <div className="field">
              <label>Or Paste Passenger Rows (Name, Mobile, Channel, Seat)</label>
              <textarea
                rows={3}
                value={pasteText}
                onChange={(e) => setPasteText(e.target.value)}
                placeholder="Ramesh, 9876543210, redBus, L4&#10;Divya, 9840012345, redBus, U1&#10;Karthik, 9791698889, Direct"
              />
            </div>

            <div className="row-inline" style={{ justifyContent: 'space-between' }}>
              <button
                type="button"
                className="btn btn-ghost btn-small"
                onClick={async () => {
                  try {
                    const res = await fetch('/api/upload-chart-pdf', { method: 'POST' });
                    const data = await res.json();
                    if (data.success && data.passengers) {
                      if (data.route) setRoute(data.route);
                      if (data.date) setDate(data.date);
                      setPassengers(data.passengers);
                      showToast(`Loaded yesterday's chart: ${data.passengers.length} passengers!`);
                    }
                  } catch (e) {
                    alert('Error: ' + e.message);
                  }
                }}
              >
                ⚡ Load Yesterday's Chart
              </button>
              <button type="button" className="btn btn-primary btn-small" onClick={() => handleBuildList()}>
                Parse Passenger Rows
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* Step 2: Message & Live Preview (2-Column Split: Inputs on Left, Smartphone Preview on Right) */}
      <section className="card">
        <div className="head">
          <p className="eyebrow">Step 2</p>
          <h2>Customize Message & WhatsApp Live Visualization</h2>
        </div>

        <div className="step2-split">
          {/* Left Column: Message Controls */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {/* Channel Switch */}
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
                Direct Bookings (Google Review)
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

            {/* Message Editor */}
            <div className="field">
              <div className="row-inline" style={{ justifyContent: 'space-between' }}>
                <span className="label">Message Text ({activeTab === 'r' ? 'redBus' : 'Direct'})</span>
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
                rows={5}
                value={activeTab === 'd' ? tplD : tplR}
                onChange={(e) => activeTab === 'd' ? setTplD(e.target.value) : setTplR(e.target.value)}
              />

              {/* Emoji Toolbar */}
              <div className="row-inline" style={{ gap: 4 }}>
                <span className="hint" style={{ alignSelf: 'center', marginRight: 4 }}>Add Emoji:</span>
                {BUS_EMOJIS.map(em => (
                  <button key={em} type="button" className="emoji-btn" onClick={() => insertText(' ' + em)}>
                    {em}
                  </button>
                ))}
              </div>

              {/* Dynamic Tag Buttons */}
              <div className="row-inline" style={{ gap: 4 }}>
                <span className="hint" style={{ alignSelf: 'center', marginRight: 4 }}>Insert Tag:</span>
                {['{name}', '{seat}', '{bus}', '{route}', '{date}'].map(tag => (
                  <button key={tag} type="button" className="tag-btn" onClick={() => insertText(tag)}>
                    + {tag}
                  </button>
                ))}
                {activeTab === 'd' && (
                  <button key="{link}" type="button" className="tag-btn" onClick={() => insertText('{link}')}>
                    + {'{link}'}
                  </button>
                )}
              </div>
            </div>

            {/* Image Attachment Box */}
            <div style={{ border: '1px solid var(--line)', borderRadius: 14, padding: 16, background: 'var(--bg)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, flexWrap: 'wrap', gap: 8 }}>
                <label className="check">
                  <input
                    type="checkbox"
                    checked={attachImage}
                    onChange={(e) => setAttachImage(e.target.checked)}
                  />
                  <strong>Attach Bus Brochure / Photo with WhatsApp Message</strong>
                </label>
                <button
                  type="button"
                  className="btn btn-ghost btn-small"
                  onClick={() => imgInputRef.current && imgInputRef.current.click()}
                >
                  Upload Image
                </button>
                <input
                  type="file"
                  ref={imgInputRef}
                  accept="image/*"
                  style={{ display: 'none' }}
                  onChange={(e) => { if (e.target.files && e.target.files[0]) handleCustomImageUpload(e.target.files[0]); }}
                />
              </div>

              {attachImage && selectedImage && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                  <img src={selectedImage} alt="Bus Brochure Thumbnail" style={{ width: 120, height: 75, objectFit: 'cover', borderRadius: 8, border: '1px solid var(--line)' }} />
                  <div style={{ fontSize: 13, color: 'var(--muted)' }}>
                    Passengers will receive this brochure in WhatsApp with your formatted review reminder as caption!
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Right Column: Smartphone Mockup Frame for Live WhatsApp Preview */}
          <div className="preview-sticky">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span className="label" style={{ fontSize: 13.5, fontWeight: 800 }}>📱 WhatsApp Live Visualization</span>
              <span style={{ fontSize: 11.5, color: 'var(--accent)', fontWeight: 700 }}>Real-time updates</span>
            </div>

            <div className="phone-mockup-frame">
              {/* Smartphone Status Bar & Dynamic Island */}
              <div className="phone-notch-bar">
                <span>9:41</span>
                <div className="phone-dynamic-island"></div>
                <span>5G 🔋</span>
              </div>

              <div className="wa-screen-inner">
                {/* WhatsApp Verified Brand Header */}
                <div className="wa-app-header">
                  <div className="wa-app-header-left">
                    <img src="/logo.jpg" alt="Avatar" className="wa-verified-avatar" style={{ objectFit: 'contain' }} />
                    <div>
                      <div className="wa-verified-name">
                        {bus} <span style={{ color: '#25D366', fontSize: 13 }} title="Verified Official Channel">✓</span>
                      </div>
                      <div className="wa-online-status">
                        <span className="wa-online-dot"></span> online
                      </div>
                    </div>
                  </div>
                  <div style={{ fontSize: 16, opacity: 0.9 }}>📞 📹 ⫶</div>
                </div>

                {/* WhatsApp Chat Canvas */}
                <div className="wa-chat-canvas">
                  <div className="wa-chat-bubble">
                    {attachImage && selectedImage && (
                      <img src={selectedImage} alt="Preview Attachment" className="wa-bubble-img" />
                    )}
                    <div>
                      {formatMessage(passengers[0] || { name: 'Harikrishnan', num: '917708155207', seats: ['L1'], src: activeTab })}
                    </div>
                    <div className="wa-time-meta">
                      <span>10:45 AM</span>
                      <span className="wa-check">✓✓</span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="phone-home-indicator"></div>
            </div>

            <div style={{ fontSize: 12.5, color: 'var(--muted)', background: 'var(--surface)', padding: '12px 14px', borderRadius: 10, border: '1px solid var(--line)', lineHeight: 1.45 }}>
              💡 <strong>Instant Visualization:</strong> Changes made on the left (text, emojis, photo, or tab switch) immediately appear on this phone screen.
            </div>
          </div>
        </div>
      </section>

      {/* Step 3: Send to All & Passenger List */}
      <section className="card" id="step3">
        <div className="head">
          <p className="eyebrow">Step 3</p>
          <h2>Delivery to All Passengers ({total} Total)</h2>
        </div>

        <div style={{ padding: 20, border: '2px solid var(--accent)', borderRadius: 16, background: 'var(--surface)', display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
            <div>
              <div style={{ fontSize: 18.5, fontWeight: 800 }}>
                {isSending ? `Sending to passengers (${batchProgress.currentIndex} of ${total})...` : `Ready to send to ${total} passengers`}
              </div>
              <div style={{ fontSize: 13, color: 'var(--muted)' }}>
                {attachImage ? 'Sending official brochure photo with formatted text caption & emojis.' : 'Sending text message with emojis.'}
              </div>
            </div>

            <div className="row-inline">
              <label style={{ fontSize: 13, color: 'var(--muted)', fontWeight: 600 }}>Delay:</label>
              <select
                value={delaySeconds}
                onChange={(e) => setDelaySeconds(e.target.value)}
                disabled={isSending}
                style={{ width: 'auto', minHeight: 36, padding: '3px 10px', fontSize: 13 }}
              >
                <option value={5}>5s per passenger</option>
                <option value={6}>6s per passenger (Recommended)</option>
                <option value={8}>8s per passenger</option>
              </select>
            </div>
          </div>

          <div className="meter" style={{ height: 12 }}>
            <span style={{ width: `${percentDone}%`, background: isSending ? 'linear-gradient(90deg, #0B7A47, #34D58A)' : 'var(--accent)' }}></span>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: 'var(--muted)' }}>
            <span>
              <strong>{sentCount}</strong> sent
              {failedCount > 0 && (
                <span style={{ color: 'var(--warn)', fontWeight: 700, marginLeft: 8 }}>
                  • {failedCount} failed
                </span>
              )} of <strong>{total}</strong>
            </span>
            <span><strong>{percentDone}%</strong> completed</span>
          </div>

          {isSending ? (
            <button
              type="button"
              className="btn btn-ghost"
              onClick={handleCancelSend}
              style={{
                minHeight: 52,
                fontSize: 15,
                fontWeight: 700,
                color: 'var(--warn)',
                borderColor: 'var(--warn)',
                background: 'rgba(239, 68, 68, 0.08)'
              }}
            >
              <span style={{ marginRight: 8, display: 'inline-block' }}>⏳</span>
              Sending ({batchProgress.currentIndex || 1} of {total})... Click to Stop
            </button>
          ) : waStatus !== 'connected' ? (
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => {
                setShowQrModal(true);
                showToast('📱 Please scan the WhatsApp QR code first!');
              }}
              style={{ minHeight: 52, fontSize: 16, fontWeight: 800, background: '#25D366', color: '#000' }}
            >
              📱 Link WhatsApp to Send ({total} Passengers)
            </button>
          ) : (
            <button
              type="button"
              className="btn btn-primary"
              onClick={handleSendAll}
              disabled={!total}
              style={{ minHeight: 52, fontSize: 16, fontWeight: 800 }}
            >
              🚀 Send to All Passengers (1-Click)
            </button>
          )}
        </div>

        {/* Failed Receipts / Warnings if any */}
        {(batchProgress.failedList && batchProgress.failedList.length > 0) && (
          <div style={{ marginTop: 12 }}>
            <h4 style={{ margin: '0 0 8px 0', fontSize: 14.5, color: 'var(--warn)' }}>
              ⚠️ Delivery Failures / Skipped ({batchProgress.failedList.length})
            </h4>
            <div style={{ maxHeight: 180, overflowY: 'auto', border: '1px solid var(--warn)', borderRadius: 12, padding: 10, fontSize: 13, background: 'rgba(239, 68, 68, 0.05)' }}>
              {batchProgress.failedList.map((f, idx) => (
                <div key={idx} style={{ padding: '6px 8px', display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid rgba(239, 68, 68, 0.2)' }}>
                  <span>❌ <strong>{f.name}</strong> ({formatPhoneDisplay(f.num)})</span>
                  <span style={{ color: 'var(--warn)', fontWeight: 600 }}>{f.error || 'Delivery failed'}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Live Receipts */}
        {(batchProgress.sentList && batchProgress.sentList.length > 0) && (
          <div style={{ marginTop: 12 }}>
            <h4 style={{ margin: '0 0 8px 0', fontSize: 14.5 }}>Live Delivery Receipts</h4>
            <div style={{ maxHeight: 220, overflowY: 'auto', border: '1px solid var(--line)', borderRadius: 12, padding: 10, fontSize: 13, background: 'var(--bg)' }}>
              {batchProgress.sentList.map((s, idx) => (
                <div key={idx} style={{ padding: '6px 8px', display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--line)' }}>
                  <span>✓ <strong>{s.name}</strong> ({formatPhoneDisplay(s.num)}) {s.seats && s.seats.length ? `[Seats: ${s.seats.join(',')}]` : ''}</span>
                  <span style={{ color: 'var(--accent)', fontWeight: 700 }}>Sent at {s.time}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Passenger List with Individual Send */}
        <div style={{ marginTop: 14 }}>
          <div className="toolbar">
            <div className="tabs">
              <button type="button" className={`tab ${filter === 'all' ? 'active' : ''}`} onClick={() => setFilter('all')}>
                All <b>{total}</b>
              </button>
              <button type="button" className={`tab ${filter === 'todo' ? 'active' : ''}`} onClick={() => setFilter('todo')}>
                Pending <b>{total - sentCount}</b>
              </button>
              <button type="button" className={`tab ${filter === 'done' ? 'active' : ''}`} onClick={() => setFilter('done')}>
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

          <ul className="list" style={{ marginTop: 12 }}>
            {displayList.map(p => {
              const isSent = sentNumSet.has(p.num);
              const isSendingThis = sendingNum === p.num;
              return (
                <li key={p.num} className={`row ${isSent ? 'done' : ''}`}>
                  <div className="who">
                    <div className="name-row">
                      <span className="name">{getDisplayName(p.name)}</span>
                      {p.seats && p.seats.length > 0 && <span className="seat-badge">{p.seats.join(', ')}</span>}
                    </div>
                    <div className="num-row">
                      <span className="num">{formatPhoneDisplay(p.num)}</span>
                    </div>
                  </div>
                  <span className={`chip ${p.src === 'd' ? 'chip-d' : 'chip-r'}`}>
                    {p.src === 'd' ? 'Direct' : 'redBus'}
                  </span>
                  <div className="member-row-actions">
                    {isSent ? (
                      <span style={{ fontSize: 13, color: 'var(--accent)', fontWeight: 700 }}>✓ Sent</span>
                    ) : (
                      <button
                        type="button"
                        className="btn-send-single"
                        onClick={() => handleSendSingle(p)}
                        disabled={isSendingThis || waStatus !== 'connected'}
                        title={`Send ${p.src === 'd' ? 'Direct' : 'redBus'} review reminder now`}
                      >
                        {isSendingThis ? 'Sending...' : '⚡ Send'}
                      </button>
                    )}
                    <button
                      type="button"
                      className="btn-remove-row"
                      onClick={() => handleRemovePassenger(p.num)}
                      title="Remove from list"
                    >
                      ✕
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      </section>

      {/* Toast */}
      <div className={`toast ${toastMsg ? 'show' : ''}`} role="status">{toastMsg}</div>

      {/* WhatsApp Link QR Modal Overlay */}
      {showQrModal && (
        <div className="qr-modal-backdrop" onClick={() => setShowQrModal(false)}>
          <div className="qr-modal-card" onClick={(e) => e.stopPropagation()}>
            <button
              type="button"
              className="modal-close-btn"
              onClick={() => setShowQrModal(false)}
              title="Close"
            >
              ✕
            </button>

            <div style={{ fontSize: 38, marginBottom: 6 }}>📱</div>
            <h3 style={{ margin: '0 0 8px 0', fontSize: 20, fontWeight: 700 }}>Link Office WhatsApp Phone</h3>
            <p style={{ margin: '0 0 16px 0', fontSize: 13.5, color: 'var(--muted)', lineHeight: 1.5 }}>
              Scan this QR code with WhatsApp on your office phone to start automated 1-click review reminders.
            </p>

            <div style={{
              background: '#FFFFFF',
              padding: 16,
              borderRadius: 16,
              display: 'inline-block',
              boxShadow: '0 8px 24px rgba(0,0,0,0.15)',
              margin: '0 auto 16px auto'
            }}>
              {waQrCode ? (
                <img
                  src={waQrCode}
                  alt="WhatsApp QR Code"
                  style={{ width: 220, height: 220, display: 'block' }}
                />
              ) : (
                <div style={{ width: 220, height: 220, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: '#666', gap: 10 }}>
                  <div style={{ fontSize: 24 }}>⏳</div>
                  <div style={{ fontSize: 13, fontWeight: 600 }}>Generating QR Code...</div>
                  <div style={{ fontSize: 11, color: '#999' }}>Takes 2-3 seconds</div>
                </div>
              )}
            </div>

            <ol style={{ textAlign: 'left', margin: '0 auto 18px auto', paddingLeft: 22, fontSize: 13, color: 'var(--ink)', lineHeight: 1.6, maxWidth: 360 }}>
              <li>Open <strong>WhatsApp</strong> on your office mobile</li>
              <li>Tap <strong>Settings / Menu (⋮)</strong> &rarr; <strong>Linked Devices</strong></li>
              <li>Tap <strong>Link a Device</strong> & scan this QR code</li>
            </ol>

            <div className="row-inline" style={{ justifyContent: 'center', gap: 10 }}>
              <button
                type="button"
                className="btn btn-ghost btn-small"
                onClick={() => setShowQrModal(false)}
              >
                Close Window
              </button>
              {waStatus === 'connected' && (
                <button
                  type="button"
                  className="btn btn-primary btn-small"
                  onClick={() => setShowQrModal(false)}
                >
                  ✓ Connected as +{waUserPhone}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
