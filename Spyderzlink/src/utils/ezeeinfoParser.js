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

export function cleanPassengerName(s) {
  return (s || '')
    .replace(/^[A-Z0-9]{8,}\s+/i, '') // Remove PNR prefix
    .replace(/^\d{4}-\d{2}-\d{2}\s+/, '') // Remove date
    .replace(/[^A-Za-z\s.'-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function titleCase(s) {
  if (!s) return '';
  return s.toLowerCase().replace(/(^|[\s.'-])([a-z])/g, (m, a, b) => a + b.toUpperCase());
}

export function parseChartContent(text, defaultSource = 'r') {
  const lines = text.split(/\r?\n/).map(s => s.trim()).filter(Boolean);
  const passengersMap = {};
  const invalid = [];
  let dupes = 0;
  let detectedRoute = '';
  let detectedDate = '';

  // 1. Detect route & date from header if present
  for (let i = 0; i < Math.min(lines.length, 25); i++) {
    const l = lines[i];
    const rm = l.match(/Schedule Name\s*:\s*([^;\n]+)/i);
    if (rm) {
      detectedRoute = rm[1].split(/\s{2,}|Trip Id/i)[0].trim();
    }
    const dm = l.match(/Travel Date\s*:\s*([0-9]{4}-[0-9]{2}-[0-9]{2})/i);
    if (dm) {
      detectedDate = dm[1];
    }
  }

  // 2. Extract driver phone numbers to ignore
  const driverNums = {};
  text.replace(/Driver\d*\s*Mobile\s*:\s*([0-9]{10})/gi, (m, n) => {
    driverNums['91' + n] = true;
  });

  // 3. Parse lines
  lines.forEach(line => {
    // Ignore header labels
    if (/^(s\.?\s*no|seat\s*no|passenger|pnr|fare|bus type|schedule|landmark|total seats)\b/i.test(line)) return;

    // Search for mobile number (10-12 digits starting with 6-9)
    const numMatch = line.match(/(?:^|[^\d])((?:\+?91[\s-]*)?0?[6-9]\d{4}[\s-]?\d{5})(?!\d)/);
    if (!numMatch) {
      if (line.length > 10 && !/^(printed by|vehicle|landmark)/i.test(line)) {
        invalid.push(line);
      }
      return;
    }

    const num = normalizePhone(numMatch[1]);
    if (!num || driverNums[num]) return;

    // Booking source detection
    const isRb = /red\s?bus/i.test(line);
    const isDirect = /\b(?:direct|counter|offline|walk-?in|cash|office|website)\b/i.test(line);
    const src = isRb ? 'r' : isDirect ? 'd' : defaultSource;

    // Seat pattern (L4, U9, L13, L14W, etc.)
    const seatMatch = line.match(/\b([LU]\d{1,2}[A-Za-z]?|\d{1,2}[A-Za-z]?)\b/i);
    const seat = seatMatch ? seatMatch[1].toUpperCase() : '';

    // Passenger Name detection
    let name = '';
    // EzeeInfo layout pattern: Name Age Gender Mobile
    const nm = line.match(/([A-Za-z\s.'-]+?)\s+\d{1,2}\s+[MF]\s+/);
    if (nm) {
      name = cleanPassengerName(nm[1]);
    } else {
      // Split by tab, comma, semicolon
      const parts = line.split(/[\t,|;]+/).map(s => s.trim());
      for (const p of parts) {
        if (!/\d/.test(p) && p.length >= 3 && !/redbus|direct|counter|sleeper|ac/i.test(p)) {
          name = cleanPassengerName(p);
          break;
        }
      }
    }

    if (!name || name.length < 2 || /^(type|point|passenger|station|fare)$/i.test(name)) {
      name = 'Sir/Madam';
    } else {
      name = titleCase(name);
    }

    if (passengersMap[num]) {
      dupes++;
      if (seat && !passengersMap[num].seats.includes(seat)) {
        passengersMap[num].seats.push(seat);
      }
      if (passengersMap[num].name === 'Sir/Madam' && name !== 'Sir/Madam') {
        passengersMap[num].name = name;
      }
    } else {
      passengersMap[num] = {
        name,
        num,
        seats: seat ? [seat] : [],
        src
      };
    }
  });

  return {
    rows: Object.values(passengersMap),
    invalid,
    dupes,
    detectedRoute,
    detectedDate
  };
}
