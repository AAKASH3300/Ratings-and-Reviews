export function normalizePhone(raw) {
  const d = String(raw || '').replace(/\D/g, '');
  if (d.length === 10 && /^[6-9]/.test(d)) return '91' + d;
  if (d.length === 11 && d[0] === '0' && /^[6-9]/.test(d[1])) return '91' + d.slice(1);
  if (d.length === 12 && d.slice(0, 2) === '91' && /^[6-9]/.test(d[2])) return d;
  return null;
}

export function formatPhoneDisplay(num) {
  if (num && num.length === 12 && num.startsWith('91')) {
    return '+91 ' + num.slice(2, 7) + ' ' + num.slice(7);
  }
  return '+' + num;
}

export function cleanGuestName(s) {
  return (s || '')
    .replace(/^(?:mr|mrs|ms|dr|prof)\.?\s+/i, '')
    .replace(/[^A-Za-z\s.'-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function titleCase(s) {
  if (!s) return '';
  return s.toLowerCase().replace(/(^|[\s.'-])([a-z])/g, (m, a, b) => a + b.toUpperCase());
}

export function parseHotelGuests(text) {
  const lines = text.split(/\r?\n/).map(s => s.trim()).filter(Boolean);
  const guestsMap = {};
  const invalid = [];
  let dupes = 0;

  lines.forEach(line => {
    // Ignore table headers
    if (/^(s\.?\s*no|sl|room|guest|name|mobile|phone|check|date|pnr|bill)\b/i.test(line)) return;

    // Search for phone number (10 digits starting with 6-9)
    const numMatch = line.match(/(?:^|[^\d])((?:\+?91[\s-]*)?0?[6-9]\d{4}[\s-]?\d{5})(?!\d)/);
    if (!numMatch) {
      if (line.length > 8 && !/^(hotel|resort|printed|le royal)/i.test(line)) {
        invalid.push(line);
      }
      return;
    }

    const num = normalizePhone(numMatch[1]);
    if (!num) return;

    // Detect Room number (e.g. Room 102, Suite 301, 204, Deluxe 105)
    let room = '';
    const roomMatch = line.match(/\b(?:room|suite|deluxe|villa|cottage|r\.no)?\s*([A-Za-z]?\d{2,4}[A-Za-z]?)\b/i);
    if (roomMatch) {
      room = roomMatch[1].toUpperCase();
    }

    // Detect Source (Booking.com, MMT, Agoda, Direct, Walk-in)
    let src = 'Direct';
    if (/booking\.?com/i.test(line)) src = 'Booking.com';
    else if (/makemytrip|mmt/i.test(line)) src = 'MakeMyTrip';
    else if (/agoda/i.test(line)) src = 'Agoda';
    else if (/goibibo/i.test(line)) src = 'Goibibo';

    // Detect Name
    let name = '';
    const parts = line.split(/[\t,|;]+/).map(s => s.trim());
    for (const p of parts) {
      if (!/\d/.test(p) && p.length >= 3) {
        if (!/direct|booking|makemytrip|agoda|room|deluxe|suite|checkout|checkin|cash|card|upi|paid/i.test(p)) {
          name = cleanGuestName(p);
          break;
        }
      }
    }

    if (!name || name.length < 2) {
      name = 'Guest';
    } else {
      name = titleCase(name);
    }

    if (guestsMap[num]) {
      dupes++;
      if (room && !guestsMap[num].rooms.includes(room)) {
        guestsMap[num].rooms.push(room);
      }
      if (guestsMap[num].name === 'Guest' && name !== 'Guest') {
        guestsMap[num].name = name;
      }
    } else {
      guestsMap[num] = {
        name,
        num,
        rooms: room ? [room] : [],
        src
      };
    }
  });

  return {
    rows: Object.values(guestsMap),
    invalid,
    dupes
  };
}
