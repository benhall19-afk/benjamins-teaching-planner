/**
 * View Configuration for Multi-View Calendar System
 */

export const VIEWS = {
  sermons: {
    id: 'sermons',
    name: 'Bible Teaching Planner',
    icon: '📖',
    theme: 'sage',
    layout: 'monthly',
    primaryAction: 'moveSermons',
    primaryActionLabel: 'Move Sermons',
    emptyMessage: 'No teachings scheduled for this month',
  },
  devotions: {
    id: 'devotions',
    name: 'Hall Family Devotions',
    icon: '👨‍👩‍👧‍👦',
    theme: 'amber',
    layout: 'monthly',
    primaryAction: 'planMonth',
    primaryActionLabel: 'Plan This Month',
    emptyMessage: 'No devotions scheduled for this month',
  },
  english: {
    id: 'english',
    name: 'Teaching English',
    icon: '✏️',
    theme: 'purple',
    layout: 'monthly',
    primaryAction: 'planMonth',
    primaryActionLabel: 'Plan This Month',
    emptyMessage: 'No classes scheduled for this month',
  },
  combined: {
    id: 'combined',
    name: 'This Week',
    icon: '📅',
    theme: 'neutral',
    layout: 'weekly',
    primaryAction: null,
    primaryActionLabel: null,
    emptyMessage: 'No items scheduled this week',
  },
};

export const VIEW_ORDER = ['sermons', 'devotions', 'english', 'combined'];

/**
 * Check if a sermon is prepared/ready
 * @param {Object} sermon - Sermon object
 * @returns {boolean}
 */
export function isSermonPrepared(sermon) {
  const status = sermon.status?.toLowerCase() || '';
  return status === 'complete' || status === 'ready to preach';
}

/**
 * Check if a devotion lesson is prepared
 * @param {Object} lesson - Devotion lesson object
 * @returns {boolean}
 */
export function isDevotionPrepared(lesson) {
  return lesson?.prepared_to_teach === true;
}

/**
 * Check if a devotion lesson is completed
 * @param {Object} lesson - Devotion lesson object
 * @returns {boolean}
 */
export function isDevotionCompleted(lesson) {
  return lesson.last_taught && new Date(lesson.last_taught) <= new Date();
}

/**
 * Get display title for a devotion lesson
 * @param {Object} lesson - Devotion lesson object
 * @returns {string}
 */
export function getDevotionDisplayTitle(lesson) {
  const parts = [];
  if (lesson.week_lesson) parts.push(lesson.week_lesson);
  if (lesson.day) {
    // Handle both numeric day (3) and string day ("Day 3")
    const dayStr = String(lesson.day);
    parts.push(dayStr.toLowerCase().startsWith('day') ? dayStr : `Day ${dayStr}`);
  }
  if (lesson.title && !lesson.week_lesson) parts.push(lesson.title);
  return parts.join(' - ') || lesson.title || 'Untitled Lesson';
}

/**
 * Check if an English class is prepared
 * @param {Object} englishClass - English class object
 * @returns {boolean}
 */
export function isEnglishClassPrepared(englishClass) {
  const status = englishClass?.class_status?.toLowerCase() || '';
  return status === 'prepared';
}

/**
 * Check if an English class is completed
 * @param {Object} englishClass - English class object
 * @returns {boolean}
 */
export function isEnglishClassCompleted(englishClass) {
  const status = englishClass?.class_status?.toLowerCase() || '';
  return status === 'complete';
}

/**
 * Check if an English class is cancelled
 * @param {Object} englishClass - English class object
 * @returns {boolean}
 */
export function isEnglishClassCancelled(englishClass) {
  const status = englishClass?.class_status?.toLowerCase() || '';
  return status === 'cancelled class';
}

/**
 * Get display title for an English class
 * @param {Object} englishClass - English class object
 * @returns {string}
 */
export function getEnglishClassDisplayTitle(englishClass) {
  return englishClass?.title || 'Untitled Class';
}

export default VIEWS;
