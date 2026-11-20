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

export function cleanPassengerName(s) {
  return (s || '')
    .replace(/^[A-Z0-9]{8,}\s+/i, '') // Remove PNR prefix
    .replace(/^\d{4}-\d{2}-\d{2}\s+/, '') // Remove date
    .replace(/^(?:mr|mrs|ms)\.?\s+/i, '')
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

    // Search for mobile number (with or without +91, spaces, dashes)
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

    if (!num || driverNums[num]) {
      if (line.length > 10 && !/^(printed by|vehicle|landmark)/i.test(line)) {
        invalid.push(line);
      }
      return;
    }

    // Booking source detection
    const isRb = /red\s?bus/i.test(lineWithoutPhone);
    const isDirect = /\b(?:direct|counter|offline|walk-?in|cash|office|website)\b/i.test(lineWithoutPhone);
    const src = isRb ? 'r' : isDirect ? 'd' : defaultSource;

    // Seat pattern (L4, U9, L13, L14W, etc.) - ignore isolated 91 or 0
    let seat = '';
    const seatMatch = lineWithoutPhone.match(/\b([LU]\d{1,2}[A-Za-z]?|\d{1,2}[A-Za-z]?)\b/i);
    if (seatMatch && !/^(91|0)$/.test(seatMatch[1])) {
      seat = seatMatch[1].toUpperCase();
      lineWithoutPhone = lineWithoutPhone.replace(seatMatch[0], ' ');
    }

    // Passenger Name detection
    let name = '';
    // EzeeInfo layout pattern: Name Age Gender Mobile
    const nm = line.match(/([A-Za-z\s.'-]+?)\s+\d{1,2}\s+[MF]\s+/);
    if (nm) {
      name = cleanPassengerName(nm[1]);
    } else {
      // Clean remaining line
      let cleaned = lineWithoutPhone
        .replace(/red\s?bus|direct|counter|offline|walk-?in|cash|office|website|sleeper|ac/gi, ' ')
        .replace(/[,;|\-]+/g, ' ')
        .replace(/[^A-Za-z\s.'-]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();

      if (cleaned.length >= 2) {
        name = cleanPassengerName(cleaned);
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
