import React, { useState, useEffect, useRef } from 'react';
import * as XLSX from 'xlsx';
import { parseHotelGuests, formatPhoneDisplay } from './utils/hotelParser';

const KEY = 'le-royal-suite-v1';
const HOTEL_EMOJIS = ['🏨', '🛏️', '⭐', '🌟', '🙏', '✨', '🛎️', '☕', '🍽️', '📍', '💖', '🌸'];

const HOTEL_DEMO = [
  { name: 'Rajesh Kumar', num: '919840012345', rooms: ['204'], src: 'Direct' },
  { name: 'Dr. Anitha S', num: '919791698889', rooms: ['Suite 301'], src: 'Booking.com' },
  { name: 'Praveen Balaji', num: '918802916696', rooms: ['102', '103'], src: 'Direct' },
  { name: 'Siddharth R', num: '919440110078', rooms: ['Deluxe 208'], src: 'MakeMyTrip' }
];

const H_EN = "Dear {name}, thank you for staying with us at {hotel} (Room {room})! 🏨✨ We hope you had a pleasant and relaxing stay. If you enjoyed our hospitality, could you please take a moment to share your experience on our Google page? ⭐⭐⭐⭐⭐ Your review helps our team grow: {link} - Warm regards, {hotel} Team 🙏";
const H_TA = "வணக்கம் {name}, {hotel}-ல் (Room {room}) தங்கியிருந்தமைக்கு மிக்க நன்றி! 🏨✨ உங்கள் தங்குதல் இனிமையாகவும் திருப்திகரமாகவும் அமைந்திருக்கும் என நம்புகிறோம். எங்கள் சேவை பிடித்திருந்தால், Google-ல் எங்களுக்கு 5-star review கொடுத்து வாழ்த்துங்கள் ⭐⭐⭐⭐⭐: {link} - அன்புடன், {hotel} நிர்வாகம் 🙏";

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

  // Poll WhatsApp Status
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
    const roomStr = (g && g.rooms && g.rooms.length) ? g.rooms.join(', ') : 'your room';
    return tpl
      .split('{name}').join(name)
      .split('{hotel}').join(hotel || 'Le Royal Suite')
      .split('{room}').join(roomStr)
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
    if (!res.rows.length) return showToast('No valid guest phone numbers detected.');
    setGuests(res.rows);
    setFilter('all');
    setPasteText('');
    showToast(`Loaded ${res.rows.length} hotel guests!`);
  };

  // 1-Click Send to All
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
      rooms: g.rooms,
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
      (g.rooms || []).join(' ').toLowerCase().includes(q)
    );
  }

  return (
    <div className="wrap">
      {/* Header */}
      <header className="top-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <img
            src="/logo.jpg"
            alt="Le Royal Suite Logo"
            style={{ width: 52, height: 52, objectFit: 'cover', borderRadius: 10, border: '1.5px solid var(--accent)', boxShadow: '0 2px 8px rgba(0,0,0,0.1)' }}
          />
          <div>
            <span className="hotel-tag">🏨 {hotel} · Luxury Stay</span>
            <h1>Le Royal Suite Review Sender</h1>
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

      {/* WhatsApp Status Bar */}
      <section className="card" style={{ padding: '14px 18px', background: waStatus === 'connected' ? 'var(--accent-soft)' : 'var(--warn-bg)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 20 }}>{waStatus === 'connected' ? '🟢' : '📱'}</span>
            <div>
              <div style={{ fontWeight: 700, fontSize: 14, color: waStatus === 'connected' ? 'var(--accent)' : 'var(--warn)' }}>
                {waStatus === 'connected'
                  ? `WhatsApp Ready: Connected as +${waUserPhone || 'Hotel Reception'}`
                  : 'WhatsApp Not Connected to Reception Phone'}
              </div>
              <div style={{ fontSize: 12.5, color: 'var(--muted)' }}>
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
          <div style={{ marginTop: 12, padding: 16, background: 'var(--surface)', borderRadius: 10, textAlign: 'center', border: '1px solid var(--line)' }}>
            <h3 style={{ margin: '0 0 6px 0', fontSize: 16 }}>Link Hotel Reception WhatsApp</h3>
            <p style={{ margin: '0 0 12px 0', fontSize: 13, color: 'var(--muted)' }}>
              Open WhatsApp on reception phone &gt; Linked Devices &gt; Link a Device &gt; Scan this QR code:
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

      {/* Step 1: Upload Guest List */}
      <section className="card">
        <div className="head">
          <p className="eyebrow">Step 1</p>
          <h2>Upload Hotel Guest Check-out List</h2>
        </div>

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
          <span className="dropzone-text">Drop Hotel Guest Excel (.xlsx), CSV, or PMS export here</span>
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
          <label>Or Paste Guest Rows (Room No, Guest Name, Mobile Number, Source)</label>
          <textarea
            rows={3}
            value={pasteText}
            onChange={(e) => setPasteText(e.target.value)}
            placeholder="Room 102, Rajesh Kumar, 9840012345, Direct&#10;Suite 301, Dr. Anitha S, 9791698889, Booking.com&#10;204, Praveen Balaji, 8802916696, MakeMyTrip"
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
            Build Guest List
          </button>
        </div>
      </section>

      {/* Step 2: Message, Emojis & Image Attachment */}
      <section className="card">
        <div className="head">
          <p className="eyebrow">Step 2</p>
          <h2>Customize Google Review Message & Hotel Photo</h2>
        </div>

        <div className="field">
          <label>Google Review Link (for Le Royal Suite)</label>
          <input
            type="url"
            value={googleLink}
            onChange={(e) => setGoogleLink(e.target.value)}
            placeholder="https://g.page/r/your-hotel-link/review"
          />
          <p className="hint">In your Google Business Profile for Le Royal Suite, click "Ask for reviews" and paste the short link.</p>
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
            rows={4}
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
            {['{name}', '{room}', '{hotel}', '{date}', '{link}'].map(tag => (
              <button key={tag} type="button" className="tag-btn" onClick={() => insertText(tag)}>
                + {tag}
              </button>
            ))}
          </div>
        </div>

        {/* Image Attachment Box */}
        <div style={{ border: '1px solid var(--line)', borderRadius: 12, padding: 14, background: 'var(--bg)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
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
              Upload Hotel Photo
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
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <img src={selectedImage} alt="Hotel Banner Thumbnail" style={{ width: 120, height: 75, objectFit: 'cover', borderRadius: 8, border: '1px solid var(--line)' }} />
              <div style={{ fontSize: 13, color: 'var(--muted)' }}>
                Guests will receive this luxury banner/photo in WhatsApp with your Google Review request as caption!
              </div>
            </div>
          )}
        </div>

        {/* Live Preview */}
        <div className="bubble-wrap">
          <span className="label">Live WhatsApp Preview</span>
          <div className="bubble">
            {attachImage && selectedImage && (
              <img src={selectedImage} alt="Preview attachment" style={{ maxWidth: '100%', maxHeight: 200, borderRadius: 8, marginBottom: 8, display: 'block', objectFit: 'cover' }} />
            )}
            <div>{formatMessage(guests[0] || { name: 'Rajesh Kumar', num: '919840012345', rooms: ['204'] })}</div>
          </div>
        </div>
      </section>

      {/* Step 3: Send to All Guests */}
      <section className="card" id="step3">
        <div className="head">
          <p className="eyebrow">Step 3</p>
          <h2>1-Click Delivery to All Guests</h2>
        </div>

        <div style={{ padding: 18, border: '2px solid var(--accent)', borderRadius: 14, background: 'var(--surface)', display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
            <div>
              <div style={{ fontSize: 18, fontWeight: 700 }}>
                {isSending ? `Sending to guests (${batchProgress.currentIndex} of ${total})...` : `Ready to send to ${total} guests`}
              </div>
              <div style={{ fontSize: 13, color: 'var(--muted)' }}>
                {attachImage ? 'Sending luxury banner photo with review caption & emojis.' : 'Sending text message with emojis.'}
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
                <option value={5}>5s per guest</option>
                <option value={6}>6s per guest (Recommended)</option>
                <option value={8}>8s per guest</option>
              </select>
            </div>
          </div>

          <div className="meter" style={{ height: 12 }}>
            <span style={{ width: `${percentDone}%`, background: isSending ? 'linear-gradient(90deg, #B45309, #F59E0B)' : 'var(--accent)' }}></span>
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
              style={{ minHeight: 50, fontSize: 16, color: 'var(--warn)', borderColor: 'var(--warn)' }}
            >
              ⏹ Stop / Cancel Sending
            </button>
          ) : (
            <button
              type="button"
              className="btn btn-primary"
              onClick={handleSendAll}
              style={{ minHeight: 50, fontSize: 16, fontWeight: 700 }}
            >
              🚀 Send to All Guests (1-Click)
            </button>
          )}
        </div>

        {/* Live Receipts */}
        {(batchProgress.sentList && batchProgress.sentList.length > 0) && (
          <div style={{ marginTop: 10 }}>
            <h4 style={{ margin: '0 0 8px 0', fontSize: 14 }}>Live Delivery Receipts</h4>
            <div style={{ maxHeight: 200, overflowY: 'auto', border: '1px solid var(--line)', borderRadius: 10, padding: 8, fontSize: 13, background: 'var(--bg)' }}>
              {batchProgress.sentList.map((s, idx) => (
                <div key={idx} style={{ padding: '4px 6px', display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--line)' }}>
                  <span>✓ <strong>{s.name}</strong> ({formatPhoneDisplay(s.num)}) {s.rooms && s.rooms.length ? `[Room: ${s.rooms.join(',')}]` : ''}</span>
                  <span style={{ color: 'var(--accent)', fontWeight: 600 }}>Sent at {s.time}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Guest List */}
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
              placeholder="🔍 Search guest, room, phone..."
            />
          </div>

          <ul className="list" style={{ marginTop: 10 }}>
            {displayList.map(g => {
              const isSent = sentNumSet.has(g.num);
              return (
                <li key={g.num} className={`row ${isSent ? 'done' : ''}`}>
                  <div className="who">
                    <div className="name-row">
                      <span className="name">{getDisplayName(g.name)}</span>
                      {g.rooms && g.rooms.length > 0 && <span className="room-badge">Room {g.rooms.join(', ')}</span>}
                    </div>
                    <div className="num-row">
                      <span className="num">{formatPhoneDisplay(g.num)}</span>
                    </div>
                  </div>
                  <span className="chip">{g.src || 'Direct'}</span>
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
      </section>

      {/* Toast */}
      <div className={`toast ${toastMsg ? 'show' : ''}`} role="status">{toastMsg}</div>
    </div>
  );
}
