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

export async function addSeries(title) {
  const response = await fetch(`${API_BASE}/series`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title })
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
