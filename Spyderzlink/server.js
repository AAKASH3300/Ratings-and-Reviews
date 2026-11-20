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
const PORT = process.env.PORT || 5001;

app.use(cors());
app.use(express.json({ limit: '25mb' }));

// Auth storage for Spyderzlink WhatsApp session
const AUTH_DIR = path.join(__dirname, 'auth_info_baileys');
if (!fs.existsSync(AUTH_DIR)) {
  fs.mkdirSync(AUTH_DIR, { recursive: true });
}

let sock = null;
let connectionStatus = 'connecting';
let currentQrCode = null;
let userPhone = null;

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
          console.log('[Spyderzlink WhatsApp] New QR code generated.');
        } catch (err) {
          console.error('[Spyderzlink WhatsApp] QR generation error:', err);
        }
      }

      if (connection === 'close') {
        const statusCode = lastDisconnect?.error?.output?.statusCode;
        const isLoggedOut = statusCode === DisconnectReason.loggedOut;
        connectionStatus = 'disconnected';
        currentQrCode = null;
        userPhone = null;

        if (isLoggedOut) {
          try {
            fs.rmSync(AUTH_DIR, { recursive: true, force: true });
            fs.mkdirSync(AUTH_DIR, { recursive: true });
          } catch (e) {}
          setTimeout(connectToWhatsApp, 3000);
        } else {
          setTimeout(connectToWhatsApp, 3000);
        }
      } else if (connection === 'open') {
        connectionStatus = 'connected';
        currentQrCode = null;
        const id = sock?.user?.id || '';
        userPhone = id.split(':')[0] || id.split('@')[0];
        console.log(`[Spyderzlink WhatsApp] Connected successfully as +${userPhone}!`);
      }
    });

  } catch (err) {
    console.error('[Spyderzlink WhatsApp] Connection error:', err);
    connectionStatus = 'disconnected';
    setTimeout(connectToWhatsApp, 5000);
  }
}

connectToWhatsApp();

// Endpoints
app.get('/api/whatsapp/status', (req, res) => {
  res.json({
    status: connectionStatus,
    qrCode: currentQrCode,
    userPhone: userPhone
  });
});

app.post('/api/whatsapp/disconnect', async (req, res) => {
  try {
    if (sock) await sock.logout().catch(() => {});
    fs.rmSync(AUTH_DIR, { recursive: true, force: true });
    fs.mkdirSync(AUTH_DIR, { recursive: true });
    connectionStatus = 'disconnected';
    currentQrCode = null;
    userPhone = null;
    setTimeout(connectToWhatsApp, 1500);
    res.json({ success: true, message: 'Disconnected.' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Default Bus Image (SpyderZ Link Logo)
app.get('/api/default-image', (req, res) => {
  const logoPath = path.join(__dirname, 'logo.jpg');
  const fallback = path.join(__dirname, 'default_bus_image.png');
  const target = fs.existsSync(logoPath) ? logoPath : fallback;
  if (fs.existsSync(target)) {
    const data = fs.readFileSync(target).toString('base64');
    return res.json({ success: true, dataUrl: `data:image/jpeg;base64,${data}` });
  }
  res.json({ success: false });
});

// Batch Send with Optional Image Attachment + Emojis & Text
app.post('/api/send-batch', async (req, res) => {
  if (batchJob.isSending) {
    return res.status(400).json({ error: 'A sending job is already in progress.' });
  }

  if (connectionStatus !== 'connected' || !sock) {
    return res.status(400).json({
      error: 'WhatsApp is not connected. Please scan the QR code first.'
    });
  }

  const { passengers, imageBase64, delaySeconds = 6 } = req.body;
  if (!passengers || !Array.isArray(passengers) || !passengers.length) {
    return res.status(400).json({ error: 'No passengers provided in list.' });
  }

  let imageBuffer = null;
  if (imageBase64 && typeof imageBase64 === 'string') {
    const clean = imageBase64.replace(/^data:image\/\w+;base64,/, '');
    imageBuffer = Buffer.from(clean, 'base64');
  }

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

  (async () => {
    console.log(`[Spyderzlink Batch] Sending to ${passengers.length} passengers (image: ${!!imageBuffer})...`);

    for (let i = 0; i < passengers.length; i++) {
      if (batchJob.shouldCancel) break;

      const p = passengers[i];
      batchJob.currentIndex = i + 1;
      batchJob.currentPassenger = { name: p.name, num: p.num, seats: p.seats, src: p.src };

      const jid = `${p.num}@s.whatsapp.net`;

      try {
        if (imageBuffer && imageBuffer.length > 0) {
          // Send photo with review message as caption!
          await sock.sendMessage(jid, {
            image: imageBuffer,
            caption: p.message
          });
        } else {
          // Send formatted text message with emojis
          await sock.sendMessage(jid, { text: p.message });
        }

        batchJob.sentList.push({
          num: p.num,
          name: p.name,
          seats: p.seats,
          src: p.src,
          time: new Date().toLocaleTimeString('en-IN', { hour12: true })
        });

        console.log(`[Spyderzlink Batch] (${i + 1}/${passengers.length}) Sent to ${p.name} (+${p.num})`);
      } catch (err) {
        console.error(`[Spyderzlink Batch] Failed for ${p.name}:`, err.message);
        batchJob.failedList.push({
          num: p.num,
          name: p.name,
          seats: p.seats,
          src: p.src,
          error: err.message
        });
      }

      if (i < passengers.length - 1 && !batchJob.shouldCancel) {
        const ms = Math.max(delaySeconds, 3) * 1000;
        await new Promise(r => setTimeout(r, ms));
      }
    }

    batchJob.isSending = false;
    batchJob.finishedAt = new Date().toISOString();
    batchJob.currentPassenger = null;
  })();
});

app.get('/api/send-batch/progress', (req, res) => {
  res.json(batchJob);
});

app.post('/api/send-batch/cancel', (req, res) => {
  if (batchJob.isSending) {
    batchJob.shouldCancel = true;
    return res.json({ success: true, message: 'Cancelled.' });
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

  let imageBuffer = null;
  if (imageBase64 && typeof imageBase64 === 'string') {
    const clean = imageBase64.replace(/^data:image\/\w+;base64,/, '');
    imageBuffer = Buffer.from(clean, 'base64');
  }

  const jid = `${recipient.num}@s.whatsapp.net`;
  try {
    if (imageBuffer && imageBuffer.length > 0) {
      await sock.sendMessage(jid, {
        image: imageBuffer,
        caption: message
      });
    } else {
      await sock.sendMessage(jid, { text: message });
    }

    const receipt = {
      num: recipient.num,
      name: recipient.name || 'Passenger',
      seats: recipient.seats || [],
      src: recipient.src || 'r',
      time: new Date().toLocaleTimeString('en-IN', { hour12: true })
    };

    if (!batchJob.sentList) batchJob.sentList = [];
    batchJob.sentList = [receipt, ...batchJob.sentList.filter(s => s.num !== recipient.num)];

    console.log(`[Spyderzlink Single] Sent successfully to ${recipient.name} (+${recipient.num})`);
    res.json({ success: true, receipt });
  } catch (err) {
    console.error(`[Spyderzlink Single] Failed for ${recipient.num}:`, err.message);
    res.status(500).json({ error: err.message });
  }
});

// PDF Parser for Ezeeinfo Charts
app.post('/api/upload-chart-pdf', async (req, res) => {
  try {
    let text = '';
    const base64Data = req.body?.base64Pdf;

    if (base64Data) {
      const base64Clean = base64Data.replace(/^data:application\/pdf;base64,/, '');
      const buf = Buffer.from(base64Clean, 'base64');
      const tempPath = path.join(__dirname, `temp_${Date.now()}.pdf`);
      try {
        fs.writeFileSync(tempPath, buf);
        text = execFileSync('pdftotext', ['-layout', tempPath, '-'], { encoding: 'utf-8' });
        fs.unlinkSync(tempPath);
      } catch (e) {
        if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
        const parser = new PDFParse({ data: buf });
        const parsed = await parser.getText();
        text = parsed.text;
      }
    } else {
      let pdfPath = req.body?.pdfPath;
      if (!pdfPath || !fs.existsSync(pdfPath)) {
        const defaultPdf = path.join(process.env.HOME || '/home/shageenfathima', 'Downloads', 'Trip Chart.pdf');
        if (fs.existsSync(defaultPdf)) pdfPath = defaultPdf;
        else return res.status(400).json({ error: 'No PDF uploaded and Trip Chart.pdf not found in ~/Downloads.' });
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
    const routeMatch = text.match(/Sched(?:u)?el Name\s*:\s*([^\n]+)/i);
    let route = 'Udumalpet to Chennai';
    if (routeMatch) route = routeMatch[1].split(/\s{2,}|Trip Id/i)[0].trim();

    const dateMatch = text.match(/Travel Date\s*:\s*([0-9]{4}-[0-9]{2}-[0-9]{2})/i);
    const travelDate = dateMatch ? dateMatch[1] : 'yesterday';

    const driverNums = new Set();
    const dm = text.slice(0, 1000).matchAll(/Mobile\s*:\s*([0-9]{10})/gi);
    for (const d of dm) driverNums.add(d[1]);

    const seatEntries = [];
    const mobileEntries = [];

    lines.forEach((line, idx) => {
      const sm = line.match(/^\s*([LU]\d{1,2}[A-Za-z]?|\d{1,2}[A-Za-z]?)\s+(SPY[A-Z0-9]+)/);
      if (sm) seatEntries.push({ lineIdx: idx, seat: sm[1].toUpperCase(), pnr: sm[2] });

      const mm = line.match(/\b([6-9]\d{9})\b/);
      if (mm) {
        const rawNum = mm[1];
        if (!driverNums.has(rawNum)) {
          let name = '';
          const nm = line.match(/([A-Za-z\s.'-]+?)\s+\d{1,2}\s+[MF]\s+/);
          if (nm) name = nm[1].trim();
          if (!name && idx > 0) {
            const pnm = lines[idx - 1].match(/(?:SPY[A-Z0-9]+\s+)?([A-Za-z\s.'-]+)$/);
            if (pnm) name = pnm[1].trim();
          }

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
          if (!passengersMap[num].seats.includes(se.seat)) passengersMap[num].seats.push(se.seat);
          if (name && passengersMap[num].name === 'Sir/Madam') passengersMap[num].name = name;
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

    res.json({ success: true, route, date: travelDate, totalSeats: totalSeatsMapped, passengers });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Serve static React files
const distPath = path.join(__dirname, 'dist');
if (fs.existsSync(distPath)) {
  app.use(express.static(distPath));
  app.use((req, res) => res.sendFile(path.join(distPath, 'index.html')));
}

app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚌 Spyderzlink Bus Review Sender is live on http://localhost:${PORT}`);
});
