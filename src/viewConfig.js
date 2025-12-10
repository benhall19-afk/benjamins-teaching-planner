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
    name: 'Family Devotions',
    icon: '❤️',
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
  relationships: {
    id: 'relationships',
    name: 'Relationships',
    icon: '☕',
    theme: 'navy',
    layout: 'monthly',
    primaryAction: null,
    primaryActionLabel: null,
    emptyMessage: 'No meetups scheduled for this month',
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

export const VIEW_ORDER = ['sermons', 'devotions', 'english', 'relationships', 'combined'];

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
 * Check if an English class is prepared (shows star indicator)
 * Shows star for: Prepared, Complete, or Cancelled Class
 * @param {Object} englishClass - English class object
 * @returns {boolean}
 */
export function isEnglishClassPrepared(englishClass) {
  const status = englishClass?.class_status?.toLowerCase() || '';
  return status === 'prepared' || status === 'complete' || status === 'cancelled class';
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

/**
 * Check if a relationship meetup is prepared (shows star indicator)
 * @param {Object} meetup - Relationship meetup object
 * @returns {boolean}
 */
export function isRelationshipMeetupPrepared(meetup) {
  const prepared = meetup?.prepared?.toLowerCase() || '';
  return prepared === 'prepared';
}

/**
 * Get display title for a relationship meetup
 * @param {Object} meetup - Relationship meetup object
 * @returns {string}
 */
export function getRelationshipMeetupDisplayTitle(meetup) {
  // If there's a title, use it
  if (meetup?.title) return meetup.title;
  // Otherwise, use the first person's name
  if (meetup?.who && meetup.who.length > 0) {
    const names = meetup.who.map(w => w.title || w.name).filter(Boolean);
    return names.join(', ') || 'Untitled Meetup';
  }
  return 'Untitled Meetup';
}

/**
 * Calculate days since a given date
 * @param {string} dateString - ISO date string
 * @returns {number|null}
 */
export function daysSince(dateString) {
  if (!dateString) return null;
  const date = new Date(dateString);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  date.setHours(0, 0, 0, 0);
  const diffTime = today - date;
  const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
  return diffDays;
}

/**
 * Format days since as a human-readable string
 * @param {number|null} days - Number of days
 * @returns {string}
 */
export function formatDaysSince(days) {
  if (days === null || days === undefined) return '-';
  if (days === 0) return 'today';
  if (days === 1) return '1 day ago';
  return `${days} days ago`;
}

export default VIEWS;
