import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import { execFileSync } from 'child_process';
import { createRequire } from 'module';
import pino from 'pino';
import QRCode from 'qrcode';
import makeWASocket, { DisconnectReason, useMultiFileAuthState } from '@whiskeysockets/baileys';

const require = createRequire(import.meta.url);
const { PDFParse } = require('pdf-parse');

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json({ limit: '10mb' }));

// Auth storage directory for Baileys WhatsApp session
const AUTH_DIR = path.join(__dirname, 'auth_info_baileys');
if (!fs.existsSync(AUTH_DIR)) {
  fs.mkdirSync(AUTH_DIR, { recursive: true });
}

let sock = null;
let connectionStatus = 'connecting'; // 'connecting' | 'qr' | 'connected' | 'disconnected'
let currentQrCode = null;
let userPhone = null;

// Batch Sending State
let batchJob = {
  isSending: false,
  shouldCancel: false,
  total: 0,
  currentIndex: 0,
  currentPassenger: null,
  sentList: [],
  failedList: [],
  startedAt: null,
  finishedAt: null
};

// Initialize WhatsApp Baileys Connection
async function connectToWhatsApp() {
  try {
    const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);

    sock = makeWASocket({
      auth: state,
      logger: pino({ level: 'silent' }),
      printQRInTerminal: false,
      connectTimeoutMs: 60000,
      defaultQueryTimeoutMs: 60000,
      keepAliveIntervalMs: 25000
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', async (update) => {
      const { connection, lastDisconnect, qr } = update;

      if (qr) {
        try {
          currentQrCode = await QRCode.toDataURL(qr);
          connectionStatus = 'qr';
          console.log('[WhatsApp] New QR code generated. Ready to scan in web UI.');
        } catch (err) {
          console.error('[WhatsApp] QR generation error:', err);
        }
      }

      if (connection === 'close') {
        const statusCode = lastDisconnect?.error?.output?.statusCode;
        const isLoggedOut = statusCode === DisconnectReason.loggedOut;
        console.log(`[WhatsApp] Connection closed (code: ${statusCode}, loggedOut: ${isLoggedOut})`);

        connectionStatus = 'disconnected';
        currentQrCode = null;
        userPhone = null;

        if (isLoggedOut) {
          console.log('[WhatsApp] Session logged out. Clearing auth credentials...');
          try {
            fs.rmSync(AUTH_DIR, { recursive: true, force: true });
            fs.mkdirSync(AUTH_DIR, { recursive: true });
          } catch (e) {}
          setTimeout(connectToWhatsApp, 3000);
        } else {
          console.log('[WhatsApp] Reconnecting in 3 seconds...');
          setTimeout(connectToWhatsApp, 3000);
        }
      } else if (connection === 'open') {
        connectionStatus = 'connected';
        currentQrCode = null;
        const id = sock?.user?.id || '';
        userPhone = id.split(':')[0] || id.split('@')[0];
        console.log(`[WhatsApp] Connected successfully as +${userPhone}!`);
      }
    });

  } catch (err) {
    console.error('[WhatsApp] Connection error:', err);
    connectionStatus = 'disconnected';
    setTimeout(connectToWhatsApp, 5000);
  }
}

// Start connection on server boot
connectToWhatsApp();

// API Endpoints

// 1. WhatsApp Status & QR Code
app.get('/api/whatsapp/status', (req, res) => {
  res.json({
    status: connectionStatus,
    qrCode: currentQrCode,
    userPhone: userPhone
  });
});

// 2. Disconnect / Log Out
app.post('/api/whatsapp/disconnect', async (req, res) => {
  try {
    if (sock) {
      await sock.logout().catch(() => {});
    }
    fs.rmSync(AUTH_DIR, { recursive: true, force: true });
    fs.mkdirSync(AUTH_DIR, { recursive: true });
    connectionStatus = 'disconnected';
    currentQrCode = null;
    userPhone = null;
    setTimeout(connectToWhatsApp, 1500);
    res.json({ success: true, message: 'Disconnected. New QR code generating...' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// 3. Batch Send to All Passengers
app.post('/api/send-batch', async (req, res) => {
  if (batchJob.isSending) {
    return res.status(400).json({ error: 'A sending job is already in progress.' });
  }

  if (connectionStatus !== 'connected' || !sock) {
    return res.status(400).json({
      error: 'WhatsApp is not connected. Please scan the QR code in the header first.'
    });
  }

  const { passengers, delaySeconds = 6 } = req.body;
  if (!passengers || !Array.isArray(passengers) || !passengers.length) {
    return res.status(400).json({ error: 'No passengers provided in list.' });
  }

  // Initialize job
  batchJob = {
    isSending: true,
    shouldCancel: false,
    total: passengers.length,
    currentIndex: 0,
    currentPassenger: null,
    sentList: [],
    failedList: [],
    startedAt: new Date().toISOString(),
    finishedAt: null
  };

  res.json({ success: true, message: 'Batch sending started.', total: passengers.length });

  // Execute in background
  (async () => {
    console.log(`[Batch] Starting review request delivery to ${passengers.length} passengers...`);

    try {
      for (let i = 0; i < passengers.length; i++) {
        if (batchJob.shouldCancel) {
          console.log('[Batch] Sending cancelled by user.');
          break;
        }

        const p = passengers[i];
        batchJob.currentIndex = i + 1;
        batchJob.currentPassenger = {
          name: p.name,
          num: p.num,
          seats: p.seats,
          src: p.src
        };

        const cleanNum = String(p.num || '').replace(/\D/g, '');
        if (!cleanNum || cleanNum.length < 10) {
          console.error(`[Batch] Invalid phone number for ${p.name}: ${p.num}`);
          batchJob.failedList.push({
            num: p.num,
            name: p.name,
            seats: p.seats,
            src: p.src,
            error: 'Invalid phone number format'
          });
          continue;
        }

        const jid = `${cleanNum}@s.whatsapp.net`;

        try {
          if (imageBuffer && imageBuffer.length > 0) {
            try {
              await sock.sendMessage(jid, {
                image: imageBuffer,
                caption: p.message
              });
            } catch (imgErr) {
              console.warn(`[Batch] Image failed for ${p.name} (+${cleanNum}), fallback to text:`, imgErr.message);
              await sock.sendMessage(jid, { text: p.message });
            }
          } else {
            await sock.sendMessage(jid, { text: p.message });
          }

          batchJob.sentList.push({
            num: cleanNum,
            name: p.name,
            seats: p.seats,
            src: p.src,
            time: new Date().toLocaleTimeString('en-IN', { hour12: true })
          });

          console.log(`[Batch] (${i + 1}/${passengers.length}) Sent to ${p.name} (+${cleanNum}) [Seats: ${(p.seats||[]).join(',')}]`);
        } catch (err) {
          console.error(`[Batch] Failed for ${p.name} (+${cleanNum}):`, err.message);
          batchJob.failedList.push({
            num: cleanNum,
            name: p.name,
            seats: p.seats,
            src: p.src,
            error: err.message || 'WhatsApp message rejected'
          });
        }

        // Safe rate-limiting delay between messages (if not last item)
        if (i < passengers.length - 1 && !batchJob.shouldCancel) {
          const ms = Math.max(delaySeconds, 3) * 1000;
          await new Promise(r => setTimeout(r, ms));
        }
      }
    } catch (fatalErr) {
      console.error('[Batch] Fatal loop error:', fatalErr);
    } finally {
      batchJob.isSending = false;
      batchJob.finishedAt = new Date().toISOString();
      batchJob.currentPassenger = null;
      console.log(`[Batch] Complete! Successfully sent: ${batchJob.sentList.length}, Failed: ${batchJob.failedList.length}`);
    }
  })();
});

// 4. Progress Status
app.get('/api/send-batch/progress', (req, res) => {
  res.json(batchJob);
});

// 5. Cancel Sending Job
app.post('/api/send-batch/cancel', (req, res) => {
  if (batchJob.isSending) {
    batchJob.shouldCancel = true;
    batchJob.isSending = false;
    return res.json({ success: true, message: 'Cancellation signal sent.' });
  }
  res.json({ success: true, message: 'No job running.' });
});

// Single Message Instant Send (for 1 or 2 specific passengers)
app.post('/api/send-single', async (req, res) => {
  if (connectionStatus !== 'connected' || !sock) {
    return res.status(400).json({
      error: 'WhatsApp is not connected. Please scan the QR code first.'
    });
  }

  const { recipient, message, imageBase64 } = req.body;
  if (!recipient || !recipient.num) {
    return res.status(400).json({ error: 'Recipient phone number is required.' });
  }
  if (!message || !message.trim()) {
    return res.status(400).json({ error: 'Message text cannot be empty.' });
  }

  const cleanNum = String(recipient.num).replace(/\D/g, '');
  if (!cleanNum || cleanNum.length < 10) {
    return res.status(400).json({ error: 'Valid recipient phone number is required.' });
  }

  let imageBuffer = null;
  if (imageBase64 && typeof imageBase64 === 'string') {
    const clean = imageBase64.replace(/^data:image\/\w+;base64,/, '');
    imageBuffer = Buffer.from(clean, 'base64');
  }

  const jid = `${cleanNum}@s.whatsapp.net`;
  try {
    if (imageBuffer && imageBuffer.length > 0) {
      try {
        await sock.sendMessage(jid, {
          image: imageBuffer,
          caption: message
        });
      } catch (imgErr) {
        console.warn(`[Root Single] Image failed, fallback to text:`, imgErr.message);
        await sock.sendMessage(jid, { text: message });
      }
    } else {
      await sock.sendMessage(jid, { text: message });
    }

    const receipt = {
      num: cleanNum,
      name: recipient.name || 'Passenger',
      seats: recipient.seats || [],
      src: recipient.src || 'r',
      time: new Date().toLocaleTimeString('en-IN', { hour12: true })
    };

    if (!batchJob.sentList) batchJob.sentList = [];
    batchJob.sentList = [receipt, ...batchJob.sentList.filter(s => s.num !== cleanNum)];

    console.log(`[Root Single] Sent successfully to ${recipient.name} (+${cleanNum})`);
    res.json({ success: true, receipt });
  } catch (err) {
    console.error(`[Root Single] Failed for ${cleanNum}:`, err.message);
    res.status(500).json({ error: err.message });
  }
});

// 6. PDF & Chart Upload Parser Endpoint
app.post('/api/upload-chart-pdf', async (req, res) => {
  try {
    let text = '';
    const base64Data = req.body?.base64Pdf;

    if (base64Data) {
      // Decode base64 PDF uploaded from browser
      const base64Clean = base64Data.replace(/^data:application\/pdf;base64,/, '');
      const buf = Buffer.from(base64Clean, 'base64');
      
      // Try pdftotext with temp file if available, otherwise pdf-parse
      const tempPath = path.join(__dirname, `temp_${Date.now()}.pdf`);
      try {
        fs.writeFileSync(tempPath, buf);
        text = execFileSync('pdftotext', ['-layout', tempPath, '-'], { encoding: 'utf-8' });
        fs.unlinkSync(tempPath);
      } catch (e) {
        if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
        // Fallback to pure JS parser (works on Render without poppler)
        const parser = new PDFParse({ data: buf });
        const parsed = await parser.getText();
        text = parsed.text;
      }
    } else {
      // Local fallback for quick testing
      let pdfPath = req.body?.pdfPath;
      if (!pdfPath || !fs.existsSync(pdfPath)) {
        const defaultPdf = path.join(process.env.HOME || '/home/shageenfathima', 'Downloads', 'Trip Chart.pdf');
        if (fs.existsSync(defaultPdf)) {
          pdfPath = defaultPdf;
        } else {
          return res.status(400).json({ error: 'No PDF uploaded and Trip Chart.pdf not found in ~/Downloads.' });
        }
      }

      try {
        text = execFileSync('pdftotext', ['-layout', pdfPath, '-'], { encoding: 'utf-8' });
      } catch (e) {
        const buf = fs.readFileSync(pdfPath);
        const parser = new PDFParse({ data: buf });
        const parsed = await parser.getText();
        text = parsed.text;
      }
    }

    const lines = text.split('\n');

    // Route & Date
    const routeMatch = text.match(/Sched(?:u)?el Name\s*:\s*([^\n]+)/i);
    let route = 'Udumalpet to Chennai';
    if (routeMatch) {
      route = routeMatch[1].split(/\s{2,}|Trip Id/i)[0].trim();
    }

    const dateMatch = text.match(/Travel Date\s*:\s*([0-9]{4}-[0-9]{2}-[0-9]{2})/i);
    const travelDate = dateMatch ? dateMatch[1] : 'yesterday';

    // Driver numbers to ignore
    const driverNums = new Set();
    const dm = text.slice(0, 1000).matchAll(/Mobile\s*:\s*([0-9]{10})/gi);
    for (const d of dm) driverNums.add(d[1]);

    const seatEntries = [];
    const mobileEntries = [];

    lines.forEach((line, idx) => {
      // Seat match: L1, U10W, etc.
      const sm = line.match(/^\s*([LU]\d{1,2}[A-Za-z]?|\d{1,2}[A-Za-z]?)\s+(SPY[A-Z0-9]+)/);
      if (sm) {
        seatEntries.push({ lineIdx: idx, seat: sm[1].toUpperCase(), pnr: sm[2] });
      }

      // Mobile match
      const mm = line.match(/\b([6-9]\d{9})\b/);
      if (mm) {
        const rawNum = mm[1];
        if (!driverNums.has(rawNum)) {
          let name = '';
          const nm = line.match(/([A-Za-z\s.'-]+?)\s+\d{1,2}\s+[MF]\s+/);
          if (nm) {
            name = nm[1].trim();
          }

          if (!name && idx > 0) {
            const prevLine = lines[idx - 1];
            const pnm = prevLine.match(/(?:SPY[A-Z0-9]+\s+)?([A-Za-z\s.'-]+)$/);
            if (pnm) name = pnm[1].trim();
          }

          // Clean name
          name = name
            .replace(/^[A-Z0-9]{6,}\s+/i, '')
            .replace(/^\d{4}-\d{2}-\d{2}\s+/, '')
            .replace(/^[^A-Za-z]+/, '')
            .replace(/^(?:Imran Refer|Amount Bus Pay|Printed By|Passenger)\s*/i, '')
            .trim();

          const src = /redbus/i.test(line) ? 'r' : 'd';
          mobileEntries.push({ lineIdx: idx, num: '91' + rawNum, name, src });
        }
      }
    });

    const passengersMap = {};
    seatEntries.forEach(se => {
      let bestM = null;
      let minDist = 999;
      mobileEntries.forEach(me => {
        const dist = Math.abs(se.lineIdx - me.lineIdx);
        if (dist <= 3 && dist < minDist) {
          minDist = dist;
          bestM = me;
        }
      });

      if (bestM) {
        const { num, name, src } = bestM;
        if (passengersMap[num]) {
          if (!passengersMap[num].seats.includes(se.seat)) {
            passengersMap[num].seats.push(se.seat);
          }
          if (name && passengersMap[num].name === 'Sir/Madam') {
            passengersMap[num].name = name;
          }
        } else {
          passengersMap[num] = {
            num,
            name: name ? name.toLowerCase().replace(/(^|\s)\S/g, l => l.toUpperCase()) : 'Sir/Madam',
            seats: [se.seat],
            src
          };
        }
      }
    });

    const passengers = Object.values(passengersMap);
    const totalSeatsMapped = passengers.reduce((acc, p) => acc + p.seats.length, 0);

    res.json({
      success: true,
      route,
      date: travelDate,
      totalSeats: totalSeatsMapped,
      passengers
    });
  } catch (err) {
    console.error('Error parsing PDF:', err);
    res.status(500).json({ error: err.message });
  }
});

// Serve frontend build from dist/
const distPath = path.join(__dirname, 'dist');
if (fs.existsSync(distPath)) {
  app.use(express.static(distPath));
  app.use((req, res) => {
    res.sendFile(path.join(distPath, 'index.html'));
  });
}

app.listen(PORT, '0.0.0.0', () => {
  console.log(`\n========================================================`);
  console.log(`🚀 Omni Bus Review Sender Web App is LIVE!`);
  console.log(`👉 Open in browser: http://localhost:${PORT}`);
  console.log(`========================================================\n`);
});
