/**
 * API Service for Sermon Manager
 * Handles all communication with the backend server
 */

const API_BASE = '/api';

class ApiError extends Error {
  constructor(message, status, details) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

async function handleResponse(response) {
  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Unknown error' }));
    throw new ApiError(error.error || 'Request failed', response.status, error.details);
  }
  return response.json();
}

// ============================================
// SERMONS API
// ============================================

export async function fetchSermons() {
  const response = await fetch(`${API_BASE}/sermons`);
  return handleResponse(response);
}

export async function updateSermon(id, updates) {
  const response = await fetch(`${API_BASE}/sermons/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(updates)
  });
  return handleResponse(response);
}

// ============================================
// SCHEDULE API
// ============================================

export async function fetchSchedule() {
  const response = await fetch(`${API_BASE}/schedule`);
  return handleResponse(response);
}

export async function updateScheduleEntry(id, updates) {
  const response = await fetch(`${API_BASE}/schedule/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(updates)
  });
  return handleResponse(response);
}

export async function addScheduleEntry(entry) {
  const response = await fetch(`${API_BASE}/schedule`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(entry)
  });
  return handleResponse(response);
}

export async function deleteScheduleEntry(id) {
  const response = await fetch(`${API_BASE}/schedule/${id}`, {
    method: 'DELETE'
  });
  return handleResponse(response);
}

export async function batchUpdateSchedule(updates) {
  const response = await fetch(`${API_BASE}/schedule/batch-update`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ updates })
  });
  return handleResponse(response);
}

// ============================================
// HASHTAGS API
// ============================================

export async function fetchHashtags() {
  const response = await fetch(`${API_BASE}/hashtags`);
  return handleResponse(response);
}

// ============================================
// AI ANALYSIS API
// ============================================

export async function analyzeSermon(title, content, options) {
  const response = await fetch(`${API_BASE}/analyze-sermon`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title, content, options })
  });
  return handleResponse(response);
}

// ============================================
// SERIES API
// ============================================

export async function fetchSeries() {
  const response = await fetch(`${API_BASE}/series`);
  return handleResponse(response);
}

export async function addSeries(title, startDate = null, endDate = null) {
  const response = await fetch(`${API_BASE}/series`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title, startDate, endDate })
  });
  return handleResponse(response);
}

export async function updateSeries(id, updates) {
  const response = await fetch(`${API_BASE}/series/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(updates)
  });
  return handleResponse(response);
}

// ============================================
// SCHEMA API - Add options to single-select fields
// ============================================

export async function addFieldOption(fieldName, newOption) {
  const response = await fetch(`${API_BASE}/add-field-option`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ fieldName, newOption })
  });
  return handleResponse(response);
}

// ============================================
// MIGRATION API
// ============================================

export async function migrateSermons() {
  const response = await fetch(`${API_BASE}/migrate-sermons`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  });
  return handleResponse(response);
}

// ============================================
// DEVOTIONS API
// ============================================

export async function fetchDevotionSeries() {
  const response = await fetch(`${API_BASE}/devotions/series`);
  return handleResponse(response);
}

export async function fetchDevotionLessons() {
  const response = await fetch(`${API_BASE}/devotions/lessons`);
  return handleResponse(response);
}

export async function addDevotionSeries(title, startDate = null, endDate = null) {
  const response = await fetch(`${API_BASE}/devotions/series`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title, startDate, endDate })
  });
  return handleResponse(response);
}

export async function updateDevotionLesson(id, updates) {
  const response = await fetch(`${API_BASE}/devotions/lessons/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(updates)
  });
  return handleResponse(response);
}

export async function addDevotionLesson(title, weekLesson = null, day = null, scheduledDate = null, seriesId = null) {
  const response = await fetch(`${API_BASE}/devotions/lessons`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title, weekLesson, day, scheduledDate, seriesId })
  });
  return handleResponse(response);
}

export async function planDevotionsMonth() {
  const response = await fetch(`${API_BASE}/devotions/plan-month`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  });
  return handleResponse(response);
}

export async function cascadeRescheduleDevotions(fromLessonId, newDate) {
  const response = await fetch(`${API_BASE}/devotions/cascade-reschedule`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ fromLessonId, newDate })
  });
  return handleResponse(response);
}

// ============================================
// ENGLISH CLASS API
// ============================================

export async function fetchEnglishSeries() {
  const response = await fetch(`${API_BASE}/english/series`);
  return handleResponse(response);
}

export async function fetchEnglishClasses() {
  const response = await fetch(`${API_BASE}/english/classes`);
  return handleResponse(response);
}

export async function addEnglishSeries(title, startDate = null, endDate = null) {
  const response = await fetch(`${API_BASE}/english/series`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title, startDate, endDate })
  });
  return handleResponse(response);
}

export async function addEnglishClass(title, classDate = null, seriesId = null, notes = null) {
  const response = await fetch(`${API_BASE}/english/classes`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title, classDate, seriesId, notes })
  });
  return handleResponse(response);
}

export async function updateEnglishClass(id, updates) {
  const response = await fetch(`${API_BASE}/english/classes/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(updates)
  });
  return handleResponse(response);
}

export async function planEnglishMonth() {
  const response = await fetch(`${API_BASE}/english/plan-month`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  });
  return handleResponse(response);
}

export async function cascadeRescheduleEnglish(fromClassId, newDate) {
  const response = await fetch(`${API_BASE}/english/cascade-reschedule`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ fromClassId, newDate })
  });
  return handleResponse(response);
}

// ============================================
// HEALTH CHECK
// ============================================

export async function healthCheck() {
  const response = await fetch(`${API_BASE}/health`);
  return handleResponse(response);
}

export { ApiError };
