/**
 * Holiday Definitions for Sermon Manager
 *
 * Holidays are defined with rules that auto-calculate dates each year.
 * Rule types:
 * - 'fixed': Same date every year (month, day)
 * - 'relative': Nth weekday of month (month, weekday, nth)
 * - 'easter': Calculated from Easter Sunday (offset in days)
 * - 'lunar': Special lunar calendar calculations
 */

export const HOLIDAY_COLORS = {
  gold: { hex: '#c9a227', light: 'rgba(201, 162, 39, 0.15)' },
  pink: { hex: '#ec4899', light: 'rgba(236, 72, 153, 0.15)' },
  pinkLight: { hex: '#f472b6', light: 'rgba(244, 114, 182, 0.15)' },
  blue: { hex: '#3b82f6', light: 'rgba(59, 130, 246, 0.15)' },
  lightBlue: { hex: '#38bdf8', light: 'rgba(56, 189, 248, 0.15)' },
  yellow: { hex: '#eab308', light: 'rgba(234, 179, 8, 0.15)' },
  yellowLight: { hex: '#facc15', light: 'rgba(250, 204, 21, 0.15)' },
  purple: { hex: '#9333ea', light: 'rgba(147, 51, 234, 0.15)' },
  orange: { hex: '#f97316', light: 'rgba(249, 115, 22, 0.15)' },
  green: { hex: '#16a34a', light: 'rgba(22, 163, 74, 0.15)' },
  slate: { hex: '#64748b', light: 'rgba(100, 116, 139, 0.15)' },
};

export const HOLIDAY_RULES = {
  // ============================================
  // FIXED DATE HOLIDAYS (same date every year)
  // ============================================

  newYear: {
    id: 'newYear',
    name: "New Year's Day",
    type: 'fixed',
    month: 0,  // January (0-indexed)
    day: 1,
    emoji: '🎉',
    color: 'gold',
  },

  valentines: {
    id: 'valentines',
    name: "Valentine's Day",
    type: 'fixed',
    month: 1,  // February
    day: 14,
    emoji: '💝',
    color: 'pink',
  },

  songkran: {
    id: 'songkran',
    name: 'Songkran',
    type: 'fixed',
    month: 3,  // April
    day: 13,
    emoji: '💦',
    color: 'blue',
  },

  thaiMothersDay: {
    id: 'thaiMothersDay',
    name: "Thai Mother's Day",
    type: 'fixed',
    month: 7,  // August
    day: 12,
    emoji: '💙',
    color: 'lightBlue',
  },

  thaiFathersDay: {
    id: 'thaiFathersDay',
    name: "Thai Father's Day",
    type: 'fixed',
    month: 11, // December
    day: 5,
    emoji: '👑',
    color: 'yellow',
  },

  christmas: {
    id: 'christmas',
    name: 'Christmas',
    type: 'fixed',
    month: 11, // December
    day: 25,
    emoji: '🎄',
    color: 'green',
  },

  // ============================================
  // RELATIVE DATE HOLIDAYS (Nth weekday of month)
  // ============================================

  usMothersDay: {
    id: 'usMothersDay',
    name: "Mother's Day (US)",
    type: 'relative',
    month: 4,      // May
    weekday: 0,    // Sunday (0=Sun, 1=Mon, etc.)
    nth: 2,        // 2nd Sunday
    emoji: '💐',
    color: 'pinkLight',
  },

  usFathersDay: {
    id: 'usFathersDay',
    name: "Father's Day (US)",
    type: 'relative',
    month: 5,      // June
    weekday: 0,    // Sunday
    nth: 3,        // 3rd Sunday
    emoji: '👔',
    color: 'blue',
  },

  thanksgiving: {
    id: 'thanksgiving',
    name: 'Thanksgiving (US)',
    type: 'relative',
    month: 10,     // November
    weekday: 4,    // Thursday
    nth: 4,        // 4th Thursday
    emoji: '🦃',
    color: 'orange',
  },

  // ============================================
  // EASTER-BASED HOLIDAYS
  // ============================================

  easter: {
    id: 'easter',
    name: 'Resurrection Sunday',
    type: 'easter',
    offset: 0,     // Easter Sunday itself
    emoji: '✝️',
    color: 'purple',
  },

  // ============================================
  // LUNAR HOLIDAYS
  // ============================================

  loiKrathong: {
    id: 'loiKrathong',
    name: 'Loi Krathong',
    type: 'lunar',
    lunarType: 'loiKrathong', // Full moon of 12th Thai lunar month
    emoji: '🪷',
    color: 'yellowLight',
  },
};

/**
 * Create a custom holiday entry
 * @param {Object} data - Holiday data
 * @returns {Object} Holiday object
 */
export function createCustomHoliday(data) {
  return {
    id: `custom_${Date.now()}`,
    name: data.name,
    type: data.recurring ? (data.ruleType || 'fixed') : 'oneTime',
    emoji: data.emoji || '📌',
    color: data.color || 'slate',
    isCustom: true,
    // For fixed type
    month: data.month,
    day: data.day,
    // For one-time only
    year: data.year,
    date: data.date,
    // For relative type
    weekday: data.weekday,
    nth: data.nth,
  };
}

/**
 * Get color values for a holiday
 * @param {string} colorKey - The color key from holiday definition
 * @returns {Object} Color object with hex and light values
 */
export function getHolidayColor(colorKey) {
  return HOLIDAY_COLORS[colorKey] || HOLIDAY_COLORS.slate;
}
