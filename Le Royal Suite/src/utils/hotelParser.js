export function normalizePhone(raw) {
  if (!raw) return null;
  let digits = String(raw).replace(/\D/g, '');
  if (digits.startsWith('0091')) digits = digits.slice(2);
  else if (digits.startsWith('0') && digits.length === 11 && /^[6-9]/.test(digits[1])) {
    digits = '91' + digits.slice(1);
  }
  // Standard 10-digit Indian mobile
  if (digits.length === 10 && /^[6-9]/.test(digits)) return '91' + digits;
  // 12-digit Indian mobile with 91 prefix
  if (digits.length === 12 && digits.startsWith('91') && /^[6-9]/.test(digits[2])) return digits;
  // Fallback for any 10-digit number
  if (digits.length === 10) return '91' + digits;
  // International format (11 to 15 digits)
  if (digits.length >= 11 && digits.length <= 15) return digits;
  return null;
}

export function formatPhoneDisplay(num) {
  if (!num) return '';
  const d = String(num).replace(/\D/g, '');
  if (d.length === 12 && d.startsWith('91')) {
    return '+91 ' + d.slice(2, 7) + ' ' + d.slice(7);
  }
  if (d.length === 10) {
    return '+91 ' + d.slice(0, 5) + ' ' + d.slice(5);
  }
  return '+' + d;
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

    // 1. Detect phone number in the line (handles with or without +91, with spaces, dashes, etc.)
    const phoneRegex = /(\+?\d[\d\s\-().]{7,}\d)/;
    const numMatch = line.match(phoneRegex);
    let num = null;
    let lineWithoutPhone = line;

    if (numMatch) {
      num = normalizePhone(numMatch[1]);
      if (num) {
        lineWithoutPhone = line.replace(numMatch[1], ' ');
      }
    }

    if (!num) {
      if (line.length >= 6 && !/^(hotel|resort|printed|le royal)/i.test(line)) {
        invalid.push(line);
      }
      return;
    }

    // 2. Detect Source (Booking.com, MMT, Agoda, Direct, etc.)
    let src = 'Direct';
    if (/booking\.?com/i.test(lineWithoutPhone)) src = 'Booking.com';
    else if (/makemytrip|mmt/i.test(lineWithoutPhone)) src = 'MakeMyTrip';
    else if (/agoda/i.test(lineWithoutPhone)) src = 'Agoda';
    else if (/goibibo/i.test(lineWithoutPhone)) src = 'Goibibo';

    // 3. Optional Room detection (NOT required, supported if present)
    let room = '';
    const roomMatch = lineWithoutPhone.match(/\b(?:room|suite|deluxe|villa|cottage|r\.?no\.?)[:\s]*([A-Za-z]?\d{2,4}[A-Za-z]?)\b/i);
    if (roomMatch) {
      room = roomMatch[1].toUpperCase();
      lineWithoutPhone = lineWithoutPhone.replace(roomMatch[0], ' ');
    }

    // 4. Detect Name from remaining text
    let cleaned = lineWithoutPhone
      .replace(/booking\.?com|makemytrip|mmt|agoda|goibibo|direct|walk-?in|cash|card|upi|paid|checkout|checkin/gi, ' ')
      .replace(/[,;|\-]+/g, ' ')
      .replace(/[^A-Za-z\s.'-]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    let name = cleanGuestName(cleaned);
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
