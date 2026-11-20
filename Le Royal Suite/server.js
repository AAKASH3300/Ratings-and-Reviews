import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import pino from 'pino';
import QRCode from 'qrcode';
import makeWASocket, { DisconnectReason, useMultiFileAuthState } from '@whiskeysockets/baileys';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 5002;

app.use(cors());
app.use(express.json({ limit: '25mb' }));

// Auth storage for Le Royal Suite WhatsApp session
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
  currentGuest: null,
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
          console.log('[Le Royal Suite WhatsApp] New QR code generated.');
        } catch (err) {
          console.error('[Le Royal Suite WhatsApp] QR generation error:', err);
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
        console.log(`[Le Royal Suite WhatsApp] Connected successfully as +${userPhone}!`);
      }
    });

  } catch (err) {
    console.error('[Le Royal Suite WhatsApp] Connection error:', err);
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

// Default Hotel Image
app.get('/api/default-image', (req, res) => {
  const imgPath = path.join(__dirname, 'logo.jpg');
  const fallback = path.join(__dirname, 'default_hotel_image.png');
  const target = fs.existsSync(imgPath) ? imgPath : fallback;
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

  const { guests, imageBase64, delaySeconds = 6 } = req.body;
  if (!guests || !Array.isArray(guests) || !guests.length) {
    return res.status(400).json({ error: 'No guests provided in list.' });
  }

  let imageBuffer = null;
  if (imageBase64 && typeof imageBase64 === 'string') {
    const clean = imageBase64.replace(/^data:image\/\w+;base64,/, '');
    imageBuffer = Buffer.from(clean, 'base64');
  }

  batchJob = {
    isSending: true,
    shouldCancel: false,
    total: guests.length,
    currentIndex: 0,
    currentGuest: null,
    sentList: [],
    failedList: [],
    startedAt: new Date().toISOString(),
    finishedAt: null
  };

  res.json({ success: true, message: 'Batch sending started.', total: guests.length });

  (async () => {
    console.log(`[Le Royal Suite Batch] Sending to ${guests.length} guests (image: ${!!imageBuffer})...`);

    for (let i = 0; i < guests.length; i++) {
      if (batchJob.shouldCancel) break;

      const g = guests[i];
      batchJob.currentIndex = i + 1;
      batchJob.currentGuest = { name: g.name, num: g.num, rooms: g.rooms, src: g.src };

      const jid = `${g.num}@s.whatsapp.net`;

      try {
        if (imageBuffer && imageBuffer.length > 0) {
          // Send photo with hotel review request as caption!
          await sock.sendMessage(jid, {
            image: imageBuffer,
            caption: g.message
          });
        } else {
          // Send formatted text message with emojis
          await sock.sendMessage(jid, { text: g.message });
        }

        batchJob.sentList.push({
          num: g.num,
          name: g.name,
          rooms: g.rooms,
          src: g.src,
          time: new Date().toLocaleTimeString('en-IN', { hour12: true })
        });

        console.log(`[Le Royal Suite Batch] (${i + 1}/${guests.length}) Sent to ${g.name} (+${g.num})`);
      } catch (err) {
        console.error(`[Le Royal Suite Batch] Failed for ${g.name}:`, err.message);
        batchJob.failedList.push({
          num: g.num,
          name: g.name,
          rooms: g.rooms,
          src: g.src,
          error: err.message
        });
      }

      if (i < guests.length - 1 && !batchJob.shouldCancel) {
        const ms = Math.max(delaySeconds, 3) * 1000;
        await new Promise(r => setTimeout(r, ms));
      }
    }

    batchJob.isSending = false;
    batchJob.finishedAt = new Date().toISOString();
    batchJob.currentGuest = null;
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

// Single Message Instant Send (for 1 or 2 specific guests)
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
      name: recipient.name || 'Guest',
      rooms: recipient.rooms || [],
      src: recipient.src || 'Direct',
      time: new Date().toLocaleTimeString('en-IN', { hour12: true })
    };

    if (!batchJob.sentList) batchJob.sentList = [];
    batchJob.sentList = [receipt, ...batchJob.sentList.filter(s => s.num !== recipient.num)];

    console.log(`[Le Royal Suite Single] Sent successfully to ${recipient.name} (+${recipient.num})`);
    res.json({ success: true, receipt });
  } catch (err) {
    console.error(`[Le Royal Suite Single] Failed for ${recipient.num}:`, err.message);
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
  console.log(`🏨 Le Royal Suite Hotel Review Sender is live on http://localhost:${PORT}`);
});
