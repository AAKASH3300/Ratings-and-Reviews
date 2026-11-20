import React, { useState, useEffect, useRef } from 'react';
import * as XLSX from 'xlsx';
import { parseHotelGuests, formatPhoneDisplay, normalizePhone, cleanGuestName, titleCase } from './utils/hotelParser';

const KEY = 'le-royal-suite-v1';
const HOTEL_EMOJIS = ['🏨', '🛏️', '⭐', '🌟', '🙏', '✨', '🛎️', '☕', '🍽️', '📍', '💖', '🌸'];

const HOTEL_DEMO = [
  { name: 'Rajesh Kumar', num: '919840012345', src: 'Direct' },
  { name: 'Dr. Anitha S', num: '919791698889', src: 'Booking.com' },
  { name: 'Praveen Balaji', num: '918802916696', src: 'Direct' },
  { name: 'Siddharth R', num: '919440110078', src: 'MakeMyTrip' }
];

const H_EN = "Dear {name}, thank you for staying with us at {hotel}! 🏨✨ We hope you had a pleasant and relaxing stay. If you enjoyed our hospitality, could you please take a moment to share your experience on our Google page? ⭐⭐⭐⭐⭐ Your review helps our team grow: {link} - Warm regards, {hotel} Team 🙏";
const H_TA = "வணக்கம் {name}, {hotel}-ல் தங்கியிருந்தமைக்கு மிக்க நன்றி! 🏨✨ உங்கள் தங்குதல் இனிமையாகவும் திருப்திகரமாகவும் அமைந்திருக்கும் என நம்புகிறோம். எங்கள் சேவை பிடித்திருந்தால், Google-ல் எங்களுக்கு 5-star review கொடுத்து வாழ்த்துங்கள் ⭐⭐⭐⭐⭐: {link} - அன்புடன், {hotel} நிர்வாகம் 🙏";

export default function App() {
  const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];

  const [hotel, setHotel] = useState('Le Royal Suite');
  const [date, setDate] = useState(yesterday);
  const [googleLink, setGoogleLink] = useState('https://g.page/r/leroyalsuite/review');
  const [tpl, setTpl] = useState(H_EN);
  const [useFirstName, setUseFirstName] = useState(false);
  const [pasteText, setPasteText] = useState('');
  const [guests, setGuests] = useState(HOTEL_DEMO);
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [theme, setTheme] = useState('light');
  const [toastMsg, setToastMsg] = useState('');
  const [dragOver, setDragOver] = useState(false);
  const [delaySeconds, setDelaySeconds] = useState(6);

  // Quick Add State (for 1 or 2 specific guests)
  const [quickName, setQuickName] = useState('');
  const [quickNum, setQuickNum] = useState('');
  const [quickSrc, setQuickSrc] = useState('Direct');
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
    currentGuest: null,
    sentList: [],
    failedList: []
  });

  const textareaRef = useRef(null);
  const fileInputRef = useRef(null);
  const imgInputRef = useRef(null);

  useEffect(() => {
    fetch('/api/default-image')
      .then(res => res.json())
      .then(data => {
        if (data.success && data.dataUrl) setSelectedImage(data.dataUrl);
      })
      .catch(() => {});

    try {
      const saved = JSON.parse(localStorage.getItem(KEY) || 'null');
      if (saved) {
        if (saved.hotel) setHotel(saved.hotel);
        if (saved.googleLink) setGoogleLink(saved.googleLink);
        if (saved.tpl) setTpl(saved.tpl);
        if (saved.theme) setTheme(saved.theme);
        if (saved.attachImage !== undefined) setAttachImage(saved.attachImage);
      }
    } catch (e) {}
  }, []);

  useEffect(() => {
    const data = { hotel, googleLink, tpl, theme, attachImage };
    try { localStorage.setItem(KEY, JSON.stringify(data)); } catch (e) {}
  }, [hotel, googleLink, tpl, theme, attachImage]);

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
    if (!n || n.toLowerCase() === 'guest' || n.toLowerCase() === 'sir/madam') return 'Guest';
    if (useFirstName) n = n.split(/\s+/)[0];
    return n;
  };

  const formatMessage = (g) => {
    const name = getDisplayName(g && g.name);
    return tpl
      .split('{name}').join(name)
      .split('{hotel}').join(hotel || 'Le Royal Suite')
      .split('{date}').join(date || 'yesterday')
      .split('{link}').join(googleLink.trim() || '{link}');
  };

  const insertText = (str) => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const updated = tpl.substring(0, start) + str + tpl.substring(end);
    setTpl(updated);
    setTimeout(() => {
      textarea.selectionStart = textarea.selectionEnd = start + str.length;
      textarea.focus();
    }, 10);
  };

  const handleCustomImageUpload = (file) => {
    if (!file || !file.type.startsWith('image/')) return alert('Please select a valid image (PNG/JPG).');
    const reader = new FileReader();
    reader.onload = (e) => {
      setSelectedImage(e.target.result);
      setAttachImage(true);
      showToast('Attached hotel photo!');
    };
    reader.readAsDataURL(file);
  };

  const handleFileUpload = (file) => {
    const ext = file.name.split('.').pop().toLowerCase();
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
    if (!textToParse.trim()) return showToast('Paste guest rows or upload a file first.');
    const res = parseHotelGuests(textToParse);
    if (!res.rows.length) return alert('No valid guest phone numbers detected. Enter a 10-digit number like 9840012345 (no room number needed).');
    setGuests(res.rows);
    setFilter('all');
    setPasteText('');
    showToast(`Loaded ${res.rows.length} hotel guests!`);
  };

  // Quick Add 1 or 2 Guests to List
  const handleAddQuickGuest = () => {
    if (!quickNum.trim()) return showToast('Please enter a mobile number.');
    const validNum = normalizePhone(quickNum);
    if (!validNum) {
      return alert('Invalid mobile number format. Enter a 10-digit number (e.g. 9840012345 or +91 98400 12345).');
    }
    const cleanName = cleanGuestName(quickName) || 'Guest';
    const newGuest = {
      name: titleCase(cleanName),
      num: validNum,
      rooms: [],
      src: quickSrc
    };
    setGuests(prev => {
      const filtered = prev.filter(g => g.num !== validNum);
      return [newGuest, ...filtered];
    });
    setQuickName('');
    setQuickNum('');
    showToast(`Added ${newGuest.name} to guest list!`);
  };

  // Send Single WhatsApp Review Message Instantly
  const handleSendSingle = async (guestToSend) => {
    if (waStatus !== 'connected') {
      setShowQrModal(true);
      return;
    }
    if (!guestToSend || !guestToSend.num) return;
    if (!googleLink.trim()) return alert('Please enter your Google Review link.');

    setSendingNum(guestToSend.num);
    try {
      const res = await fetch('/api/send-single', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          recipient: {
            num: guestToSend.num,
            name: getDisplayName(guestToSend.name),
            src: guestToSend.src
          },
          message: formatMessage(guestToSend),
          imageBase64: attachImage ? selectedImage : null
        })
      });
      const data = await res.json();
      if (!res.ok) {
        alert('Failed to send: ' + (data.error || 'Unknown error'));
      } else {
        showToast(`✓ Review request sent to ${guestToSend.name}!`);
        if (data.receipt) {
          setBatchProgress(prev => ({
            ...prev,
            sentList: [data.receipt, ...(prev.sentList || []).filter(s => s.num !== guestToSend.num)]
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
    const validNum = normalizePhone(quickNum);
    if (!validNum) {
      return alert('Please enter a valid 10-digit mobile number (e.g. 9840012345).');
    }
    const cleanName = cleanGuestName(quickName) || 'Guest';
    const guestObj = {
      name: titleCase(cleanName),
      num: validNum,
      rooms: [],
      src: quickSrc
    };
    setGuests(prev => {
      const filtered = prev.filter(g => g.num !== validNum);
      return [guestObj, ...filtered];
    });
    await handleSendSingle(guestObj);
  };

  const handleRemoveGuest = (numToRemove) => {
    setGuests(prev => prev.filter(g => g.num !== numToRemove));
    showToast('Removed from list.');
  };

  // 1-Click Send to All Guests
  const handleSendAll = async () => {
    if (waStatus !== 'connected') {
      setShowQrModal(true);
      return;
    }
    if (!guests.length) return alert('No guests in list.');
    if (!googleLink.trim()) return alert('Please enter your Google Review link.');

    const payloadGuests = guests.map(g => ({
      num: g.num,
      name: getDisplayName(g.name),
      rooms: g.rooms || [],
      src: g.src,
      message: formatMessage(g)
    }));

    try {
      const res = await fetch('/api/send-batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          guests: payloadGuests,
          imageBase64: attachImage ? selectedImage : null,
          delaySeconds: Number(delaySeconds) || 6
        })
      });
      const data = await res.json();
      if (!res.ok) alert('Failed: ' + (data.error || 'Unknown error'));
      else showToast('🚀 Sending review requests to guests!');
    } catch (e) {
      alert('Network error: ' + e.message);
    }
  };

  const handleCancelSend = async () => {
    if (confirm('Cancel remaining guest messages?')) {
      try { await fetch('/api/send-batch/cancel', { method: 'POST' }); } catch (e) {}
    }
  };

  const total = guests.length;
  const sentCount = (batchProgress.sentList || []).length;
  const percentDone = total ? Math.round((sentCount / total) * 100) : 0;
  const isSending = batchProgress.isSending;
  const sentNumSet = new Set((batchProgress.sentList || []).map(s => s.num));

  let displayList = guests;
  if (filter === 'todo') displayList = guests.filter(g => !sentNumSet.has(g.num));
  else if (filter === 'done') displayList = guests.filter(g => sentNumSet.has(g.num));

  if (search.trim()) {
    const q = search.trim().toLowerCase();
    displayList = displayList.filter(g =>
      g.name.toLowerCase().includes(q) ||
      g.num.includes(q) ||
      (g.src || '').toLowerCase().includes(q)
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
            alt="Le Royal Suite Logo"
            style={{ width: 56, height: 56, objectFit: 'cover', borderRadius: 12, border: '2px solid var(--accent)', boxShadow: '0 4px 12px rgba(197, 155, 39, 0.25)' }}
          />
          <div>
            <span className="hotel-tag">🏨 {hotel} · Luxury Boutique Stay</span>
            <h1>{hotel} Review Sender</h1>
            <p className="lede">Send 5-star Google Review requests with your official luxury logo to guests after checkout.</p>
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

      {/* Brand & Property Customization Toolbar (Allows Modifying Hotel Name and Checkout Date) */}
      <section className="meta-card">
        <div className="meta-item">
          <label>🏨 Hotel / Property Name (Click to edit)</label>
          <input
            type="text"
            value={hotel}
            onChange={(e) => setHotel(e.target.value)}
            placeholder="e.g. Le Royal Suite"
            title="Modify the property name here"
          />
        </div>
        <div className="meta-item">
          <label>📅 Guest Check-out Date</label>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            title="Modify checkout date"
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
                  ? `WhatsApp Ready: Connected as +${waUserPhone || 'Hotel Reception'}`
                  : 'WhatsApp Not Connected to Reception Phone'}
              </div>
              <div style={{ fontSize: 13, color: 'var(--muted)' }}>
                {waStatus === 'connected' ? 'Ready to send guest review requests in 1 click.' : 'Scan QR code once to link hotel reception phone.'}
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
            <h3 style={{ margin: '0 0 6px 0', fontSize: 17, fontWeight: 700 }}>Link Hotel Reception WhatsApp</h3>
            <p style={{ margin: '0 0 14px 0', fontSize: 13, color: 'var(--muted)' }}>
              Open WhatsApp on reception phone &gt; Linked Devices &gt; Link a Device &gt; Scan this QR code:
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

      {/* Step 1: Add Guests (Split Layout: Quick Add on Left, File/Paste on Right) */}
      <section className="card">
        <div className="head">
          <p className="eyebrow">Step 1</p>
          <h2>Add Hotel Guests (No Room No. Needed)</h2>
        </div>

        <div className="step1-split">
          {/* Left: Quick Add for 1 or 2 Members */}
          <div className="quick-add-box">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <strong style={{ fontSize: 14.5 }}>⚡ Quick Type & Send (1 or 2 Guests)</strong>
              <span style={{ fontSize: 11, background: 'var(--accent-soft)', color: 'var(--accent)', padding: '3px 9px', borderRadius: 6, fontWeight: 700 }}>Individual</span>
            </div>

            <div className="field">
              <label>Guest Name</label>
              <input
                type="text"
                value={quickName}
                onChange={(e) => setQuickName(e.target.value)}
                placeholder="e.g. Rajesh Kumar"
              />
            </div>

            <div className="field">
              <label>Mobile Number</label>
              <input
                type="text"
                value={quickNum}
                onChange={(e) => setQuickNum(e.target.value)}
                placeholder="e.g. 9840012345 or +91 98400 12345"
              />
              {quickNum.trim() ? (
                normalizedQuick ? (
                  <div className="phone-validation-hint valid">
                    ✓ Valid Number: {formatPhoneDisplay(normalizedQuick)}
                  </div>
                ) : (
                  <div className="phone-validation-hint invalid">
                    ⚠️ Enter a 10-digit number (e.g. 9840012345)
                  </div>
                )
              ) : null}
            </div>

            <div className="field">
              <label>Booking Source</label>
              <select value={quickSrc} onChange={(e) => setQuickSrc(e.target.value)}>
                <option value="Direct">Direct / Walk-in</option>
                <option value="Booking.com">Booking.com</option>
                <option value="MakeMyTrip">MakeMyTrip</option>
                <option value="Agoda">Agoda</option>
              </select>
            </div>

            <div className="row-inline" style={{ marginTop: 4 }}>
              <button
                type="button"
                className="btn btn-ghost btn-small"
                onClick={handleAddQuickGuest}
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
                <li>Enter any 10-digit mobile number (e.g. <code>9840012345</code> or <code>+91 98400 12345</code>).</li>
                <li>Country code <code>+91</code> is added automatically if omitted.</li>
                <li><strong>No room number is required</strong> to send!</li>
              </ul>
            </div>
          </div>

          {/* Right: Batch Upload or Paste Multiple Rows */}
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
              <span className="dropzone-text">Drop Hotel Guest Excel (.xlsx), CSV, or text here</span>
              <span className="dropzone-sub">or click to browse from computer</span>
              <input
                type="file"
                ref={fileInputRef}
                accept=".xlsx,.xls,.csv,.tsv,.txt"
                style={{ display: 'none' }}
                onChange={(e) => { if (e.target.files && e.target.files[0]) handleFileUpload(e.target.files[0]); }}
              />
            </div>

            <div className="field">
              <label>Or Paste Multiple Rows (Name, Mobile Number, Source)</label>
              <textarea
                rows={3}
                value={pasteText}
                onChange={(e) => setPasteText(e.target.value)}
                placeholder="Rajesh Kumar, 9840012345&#10;Dr. Anitha S, 9791698889, Booking.com&#10;Praveen Balaji, 8802916696, MakeMyTrip"
              />
            </div>

            <div className="row-inline" style={{ justifyContent: 'space-between' }}>
              <button
                type="button"
                className="btn btn-ghost btn-small"
                onClick={() => { setGuests(HOTEL_DEMO); showToast('Loaded sample guest list'); }}
              >
                Load Demo Guests
              </button>
              <button type="button" className="btn btn-primary btn-small" onClick={() => handleBuildList()}>
                Parse Guest Rows
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* Step 2: Message & Live Preview (2-Column Split: Inputs on Left, Smartphone Preview on Right) */}
      <section className="card">
        <div className="head">
          <p className="eyebrow">Step 2</p>
          <h2>Customize Review Message & WhatsApp Live Visualization</h2>
        </div>

        <div className="step2-split">
          {/* Left Column: Message Inputs & Controls */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div className="field">
              <label>Google Review Link (for Le Royal Suite)</label>
              <input
                type="url"
                value={googleLink}
                onChange={(e) => setGoogleLink(e.target.value)}
                placeholder="https://g.page/r/your-hotel-link/review"
              />
              <p className="hint">In your Google Business Profile, click "Ask for reviews" and paste the short link here.</p>
            </div>

            <div className="field">
              <div className="row-inline" style={{ justifyContent: 'space-between' }}>
                <span className="label">Review Request Text</span>
                <div className="row-inline">
                  <button type="button" className="btn btn-ghost btn-small" onClick={() => setTpl(H_EN)}>
                    English
                  </button>
                  <button type="button" className="btn btn-ghost btn-small" onClick={() => setTpl(H_TA)}>
                    தமிழ்
                  </button>
                </div>
              </div>

              <textarea
                ref={textareaRef}
                rows={5}
                value={tpl}
                onChange={(e) => setTpl(e.target.value)}
              />

              {/* Emoji Toolbar */}
              <div className="row-inline" style={{ gap: 4 }}>
                <span className="hint" style={{ alignSelf: 'center', marginRight: 4 }}>Add Emoji:</span>
                {HOTEL_EMOJIS.map(em => (
                  <button key={em} type="button" className="emoji-btn" onClick={() => insertText(' ' + em)}>
                    {em}
                  </button>
                ))}
              </div>

              {/* Tag Toolbar */}
              <div className="row-inline" style={{ gap: 4 }}>
                <span className="hint" style={{ alignSelf: 'center', marginRight: 4 }}>Insert Tag:</span>
                {['{name}', '{hotel}', '{date}', '{link}'].map(tag => (
                  <button key={tag} type="button" className="tag-btn" onClick={() => insertText(tag)}>
                    + {tag}
                  </button>
                ))}
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
                  <strong>Attach Hotel Suite Banner / Photo with WhatsApp Message</strong>
                </label>
                <button
                  type="button"
                  className="btn btn-ghost btn-small"
                  onClick={() => imgInputRef.current && imgInputRef.current.click()}
                >
                  Upload Photo
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
                  <img src={selectedImage} alt="Hotel Banner Thumbnail" style={{ width: 120, height: 75, objectFit: 'cover', borderRadius: 8, border: '1px solid var(--line)' }} />
                  <div style={{ fontSize: 13, color: 'var(--muted)' }}>
                    Guests will receive this luxury photo with your review request as caption!
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
                {/* WhatsApp Verified Hotel Brand Header */}
                <div className="wa-app-header">
                  <div className="wa-app-header-left">
                    <img src="/logo.jpg" alt="Avatar" className="wa-verified-avatar" style={{ objectFit: 'cover' }} />
                    <div>
                      <div className="wa-verified-name">
                        {hotel} <span style={{ color: '#F5D77F', fontSize: 13 }} title="Verified Luxury Property">✓</span>
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
                      {formatMessage(guests[0] || { name: 'Rajesh Kumar', num: '919840012345', src: 'Direct' })}
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
              💡 <strong>Instant Visualization:</strong> Any changes made on the left (text, emojis, photo) appear right here on this screen as your guest will see it on WhatsApp.
            </div>
          </div>
        </div>
      </section>

      {/* Step 3: Send to All Guests & Member List */}
      <section className="card" id="step3">
        <div className="head">
          <p className="eyebrow">Step 3</p>
          <h2>Delivery to All Guests ({total} Total)</h2>
        </div>

        <div style={{ padding: 20, border: '2px solid var(--accent)', borderRadius: 16, background: 'var(--surface)', display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
            <div>
              <div style={{ fontSize: 18.5, fontWeight: 800 }}>
                {isSending ? `Sending to guests (${batchProgress.currentIndex} of ${total})...` : `Ready to send to ${total} guests`}
              </div>
              <div style={{ fontSize: 13, color: 'var(--muted)' }}>
                {attachImage ? 'Sending photo with formatted text caption & emojis.' : 'Sending text message with emojis.'}
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
                <option value={5}>5s per guest</option>
                <option value={6}>6s per guest (Recommended)</option>
                <option value={8}>8s per guest</option>
              </select>
            </div>
          </div>

          <div className="meter" style={{ height: 12 }}>
            <span style={{ width: `${percentDone}%`, background: isSending ? 'linear-gradient(90deg, #C59B27, #F5D77F)' : 'var(--accent)' }}></span>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: 'var(--muted)' }}>
            <span><strong>{sentCount}</strong> sent of <strong>{total}</strong></span>
            <span><strong>{percentDone}%</strong> completed</span>
          </div>

          {isSending ? (
            <button
              type="button"
              className="btn btn-ghost"
              onClick={handleCancelSend}
              style={{ minHeight: 52, fontSize: 16, color: 'var(--warn)', borderColor: 'var(--warn)' }}
            >
              ⏹ Stop / Cancel Sending
            </button>
          ) : (
            <button
              type="button"
              className="btn btn-primary"
              onClick={handleSendAll}
              style={{ minHeight: 52, fontSize: 16, fontWeight: 800 }}
            >
              🚀 Send to All Guests (1-Click)
            </button>
          )}
        </div>

        {/* Live Receipts */}
        {(batchProgress.sentList && batchProgress.sentList.length > 0) && (
          <div style={{ marginTop: 12 }}>
            <h4 style={{ margin: '0 0 8px 0', fontSize: 14.5 }}>Live Delivery Receipts</h4>
            <div style={{ maxHeight: 220, overflowY: 'auto', border: '1px solid var(--line)', borderRadius: 12, padding: 10, fontSize: 13, background: 'var(--bg)' }}>
              {batchProgress.sentList.map((s, idx) => (
                <div key={idx} style={{ padding: '6px 8px', display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--line)' }}>
                  <span>✓ <strong>{s.name}</strong> ({formatPhoneDisplay(s.num)})</span>
                  <span style={{ color: 'var(--accent)', fontWeight: 700 }}>Sent at {s.time}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Guest List with Individual Send */}
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
            {displayList.map(g => {
              const isSent = sentNumSet.has(g.num);
              const isSendingThis = sendingNum === g.num;
              return (
                <li key={g.num} className={`row ${isSent ? 'done' : ''}`}>
                  <div className="who">
                    <div className="name-row">
                      <span className="name">{getDisplayName(g.name)}</span>
                    </div>
                    <div className="num-row">
                      <span className="num">{formatPhoneDisplay(g.num)}</span>
                    </div>
                  </div>
                  <span className="chip">
                    {g.src || 'Direct'}
                  </span>
                  <div className="member-row-actions">
                    {isSent ? (
                      <span style={{ fontSize: 13, color: 'var(--accent)', fontWeight: 700 }}>✓ Sent</span>
                    ) : (
                      <button
                        type="button"
                        className="btn-send-single"
                        onClick={() => handleSendSingle(g)}
                        disabled={isSendingThis || waStatus !== 'connected'}
                        title="Send WhatsApp review request to this guest now"
                      >
                        {isSendingThis ? 'Sending...' : '⚡ Send'}
                      </button>
                    )}
                    <button
                      type="button"
                      className="btn-remove-row"
                      onClick={() => handleRemoveGuest(g.num)}
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
    </div>
  );
}
