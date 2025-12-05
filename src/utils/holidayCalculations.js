/**
 * Holiday Date Calculation Utilities
 *
 * Functions to calculate holiday dates based on rules:
 * - Fixed dates (same date every year)
 * - Relative dates (Nth weekday of month)
 * - Easter (complex lunar calculation)
 * - Thai lunar holidays (approximation)
 */

/**
 * Calculate Easter Sunday for a given year using the Anonymous Gregorian algorithm
 * @param {number} year - The year to calculate Easter for
 * @returns {Date} Easter Sunday date
 */
export function calculateEaster(year) {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31) - 1; // 0-indexed
  const day = ((h + l - 7 * m + 114) % 31) + 1;

  return new Date(year, month, day);
}

/**
 * Calculate Nth weekday of a month
 * @param {number} year - The year
 * @param {number} month - Month (0-indexed, 0=January)
 * @param {number} weekday - Day of week (0=Sunday, 1=Monday, etc.)
 * @param {number} nth - Which occurrence (1st, 2nd, 3rd, etc.)
 * @returns {Date|null} The calculated date, or null if nth occurrence doesn't exist
 */
export function getNthWeekdayOfMonth(year, month, weekday, nth) {
  const firstDay = new Date(year, month, 1);
  const firstWeekday = firstDay.getDay();

  // Calculate the first occurrence of the target weekday
  let dayOfFirst = weekday - firstWeekday;
  if (dayOfFirst < 0) dayOfFirst += 7;
  dayOfFirst += 1; // Convert to 1-indexed day

  // Add weeks to get to nth occurrence
  const targetDay = dayOfFirst + (nth - 1) * 7;

  // Verify it's still in the same month
  const result = new Date(year, month, targetDay);
  if (result.getMonth() !== month) {
    return null; // nth occurrence doesn't exist
  }

  return result;
}

/**
 * Calculate Loi Krathong date (full moon of 12th Thai lunar month)
 * This uses an approximation based on the lunar cycle.
 * @param {number} year - The year to calculate for
 * @returns {Date} Approximate Loi Krathong date
 */
export function calculateLoiKrathong(year) {
  // Known Loi Krathong dates for reference:
  // 2023: November 27
  // 2024: November 15
  // 2025: November 5
  // 2026: November 24
  // 2027: November 13

  // Loi Krathong lookup table for accuracy (2023-2030)
  const knownDates = {
    2023: new Date(2023, 10, 27),
    2024: new Date(2024, 10, 15),
    2025: new Date(2025, 10, 5),
    2026: new Date(2026, 10, 24),
    2027: new Date(2027, 10, 13),
    2028: new Date(2028, 10, 1),
    2029: new Date(2029, 10, 20),
    2030: new Date(2030, 10, 9),
  };

  if (knownDates[year]) {
    return knownDates[year];
  }

  // For years outside the lookup table, use lunar cycle approximation
  // Reference: Nov 15, 2024 is a known Loi Krathong date
  const referenceDate = new Date(2024, 10, 15);
  const targetNovember = new Date(year, 10, 15);

  // Calculate approximate full moon based on 29.53-day lunar cycle
  const daysDiff = Math.floor((targetNovember - referenceDate) / (1000 * 60 * 60 * 24));
  const lunarCycles = daysDiff / 29.53;
  const remainder = ((lunarCycles % 1) + 1) % 1; // Normalize to 0-1
  const adjustment = Math.round(remainder * 29.53);

  let fullMoonDay = 15 - adjustment;
  if (fullMoonDay < 1) fullMoonDay += 30;
  if (fullMoonDay > 30) fullMoonDay = 30;

  return new Date(year, 10, fullMoonDay);
}

/**
 * Format a date to YYYY-MM-DD string
 * @param {Date} date - The date to format
 * @returns {string} Formatted date string
 */
export function formatDateKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Get ISO week number for a date
 * @param {Date} date - The date
 * @returns {number} ISO week number (1-53)
 */
export function getISOWeekNumber(date) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
}

/**
 * Get week key in format "YYYY-WNN" (e.g., "2025-W19")
 * @param {Date} date - The date
 * @returns {string} Week key
 */
export function getWeekKey(date) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const year = d.getUTCFullYear();
  const weekNum = getISOWeekNumber(date);
  return `${year}-W${String(weekNum).padStart(2, '0')}`;
}

/**
 * Calculate the date for a single holiday in a given year
 * @param {Object} holiday - Holiday rule object
 * @param {number} year - The year to calculate for
 * @returns {Date|null} The holiday date, or null if not applicable
 */
export function calculateHolidayDate(holiday, year) {
  switch (holiday.type) {
    case 'fixed':
      return new Date(year, holiday.month, holiday.day);

    case 'relative':
      return getNthWeekdayOfMonth(year, holiday.month, holiday.weekday, holiday.nth);

    case 'easter': {
      const easterDate = calculateEaster(year);
      if (holiday.offset) {
        easterDate.setDate(easterDate.getDate() + holiday.offset);
      }
      return easterDate;
    }

    case 'lunar':
      if (holiday.lunarType === 'loiKrathong') {
        return calculateLoiKrathong(year);
      }
      return null;

    case 'oneTime':
      // One-time custom holiday - only valid for its specific year
      if (holiday.year === year && holiday.date) {
        return new Date(holiday.date);
      }
      return null;

    default:
      return null;
  }
}

/**
 * Calculate all holiday dates for a given year
 * @param {number} year - The year to calculate for
 * @param {Object} holidayRules - Object containing all holiday rules
 * @returns {Object} Object with holidays by date and by week
 */
export function calculateHolidaysForYear(year, holidayRules) {
  const holidays = {}; // Key: date string "YYYY-MM-DD"
  const weekHolidays = {}; // Key: week string "YYYY-WNN"

  Object.values(holidayRules).forEach(holiday => {
    const date = calculateHolidayDate(holiday, year);

    if (date && date.getFullYear() === year) {
      const dateKey = formatDateKey(date);
      const weekKey = getWeekKey(date);

      const holidayEntry = {
        ...holiday,
        calculatedDate: dateKey,
        dateObj: date,
      };

      // Add to date lookup
      if (!holidays[dateKey]) holidays[dateKey] = [];
      holidays[dateKey].push(holidayEntry);

      // Add to week lookup
      if (!weekHolidays[weekKey]) weekHolidays[weekKey] = [];
      weekHolidays[weekKey].push(holidayEntry);
    }
  });

  return { holidays, weekHolidays };
}

/**
 * Get upcoming holidays within a specified number of weeks
 * @param {Object} holidayRules - All holiday rules
 * @param {number} weeksAhead - Number of weeks to look ahead (default: 6)
 * @returns {Array} Array of upcoming holidays sorted by date
 */
export function getUpcomingHolidays(holidayRules, weeksAhead = 6) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const endDate = new Date(today);
  endDate.setDate(endDate.getDate() + weeksAhead * 7);

  const currentYear = today.getFullYear();
  const nextYear = currentYear + 1;

  // Calculate holidays for current and next year (in case we're near year end)
  const currentYearHolidays = calculateHolidaysForYear(currentYear, holidayRules);
  const nextYearHolidays = calculateHolidaysForYear(nextYear, holidayRules);

  const upcoming = [];

  // Combine all holidays from both years
  const allHolidays = [
    ...Object.values(currentYearHolidays.holidays).flat(),
    ...Object.values(nextYearHolidays.holidays).flat(),
  ];

  allHolidays.forEach(holiday => {
    const holidayDate = holiday.dateObj;
    if (holidayDate >= today && holidayDate <= endDate) {
      // Calculate weeks away
      const diffTime = holidayDate - today;
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      const weeksAway = Math.floor(diffDays / 7);

      upcoming.push({
        ...holiday,
        daysAway: diffDays,
        weeksAway,
      });
    }
  });

  // Sort by date (closest first)
  upcoming.sort((a, b) => a.dateObj - b.dateObj);

  return upcoming;
}

/**
 * Get countdown text for a holiday
 * @param {number} weeksAway - Number of weeks until holiday
 * @param {number} daysAway - Number of days until holiday
 * @returns {string} Human-readable countdown text
 */
export function getCountdownText(weeksAway, daysAway) {
  if (daysAway === 0) {
    return 'Today!';
  }
  if (daysAway === 1) {
    return 'Tomorrow!';
  }
  if (daysAway <= 7) {
    return 'This week!';
  }
  if (daysAway <= 14) {
    return 'Next week!';
  }
  return `${weeksAway} weeks away!`;
}
