/**
 * Sermon Manager Backend Server
 *
 * This server connects to the Craft Multi-Document API to manage
 * sermons, schedules, and related content.
 */

import express from 'express';
import cors from 'cors';
import { config } from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

// Load environment variables (override any existing shell env vars)
config({ override: true });

// ES Module __dirname equivalent
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

// ============================================
// CRAFT API CONFIGURATION
// ============================================

const CRAFT_API_URL = process.env.CRAFT_API_URL || 'https://connect.craft.do/links/AdnPvBSCigK/api/v1';
const CRAFT_API_KEY = process.env.CRAFT_API_KEY || '';

// Collection IDs - will be discovered from API
let COLLECTIONS = {
  sermons: null,
  schedule: null,
  hashtags: null,
  series: null
};

// ============================================
// DEVOTIONS API CONFIGURATION
// ============================================

const DEVOTIONS_API_URL = process.env.DEVOTIONS_API_URL || '';
const DEVOTIONS_API_KEY = process.env.DEVOTIONS_API_KEY || '';

// Known collection IDs for devotions (from API discovery)
const DEVOTIONS_COLLECTIONS = {
  series: 'DD29A779-691F-4A21-A84E-57EE4B6CFA06',
  lessons: '2F99FAB6-A464-4623-B81A-B4E260C336D1'
};

// ============================================
// ENGLISH CLASS API CONFIGURATION
// ============================================

const ENGLISH_API_URL = process.env.ENGLISH_API_URL || '';
const ENGLISH_API_KEY = process.env.ENGLISH_API_KEY || '';

// Known collection IDs for English classes (from API discovery)
const ENGLISH_COLLECTIONS = {
  series: '7C9E077B-31E3-4164-B7D9-E7D787C54D8B',
  classes: '71E90888-EA24-4104-AC36-82B82C8D0C82'
};

// ============================================
// IN-MEMORY CACHE WITH TTL
// ============================================

const cache = {
  schedule: { data: null, timestamp: 0, refreshing: false },
  series: { data: null, timestamp: 0, refreshing: false },
  hashtags: { data: null, timestamp: 0, refreshing: false },
  sermons: { data: null, timestamp: 0, refreshing: false }
};
const CACHE_TTL = 300000; // 5 minutes - data doesn't change often
const STALE_TTL = 600000; // 10 minutes - serve stale data while refreshing

function getCached(key) {
  const entry = cache[key];
  if (entry.data && (Date.now() - entry.timestamp) < CACHE_TTL) {
    return { data: entry.data, fresh: true };
  }
  // Return stale data if within stale window (will trigger background refresh)
  if (entry.data && (Date.now() - entry.timestamp) < STALE_TTL) {
    return { data: entry.data, fresh: false };
  }
  return null;
}

function setCache(key, data) {
  cache[key] = { data, timestamp: Date.now(), refreshing: false };
}

function setRefreshing(key, value) {
  if (cache[key]) cache[key].refreshing = value;
}

function invalidateCache(key) {
  if (key) {
    cache[key] = { data: null, timestamp: 0 };
  } else {
    // Invalidate all
    Object.keys(cache).forEach(k => cache[k] = { data: null, timestamp: 0 });
  }
}

// ============================================
// DEVOTIONS CACHE
// ============================================

const devotionsCache = {
  series: { data: null, timestamp: 0, refreshing: false },
  lessons: { data: null, timestamp: 0, refreshing: false }
};

function getCachedDevotions(key) {
  const entry = devotionsCache[key];
  if (entry.data && (Date.now() - entry.timestamp) < CACHE_TTL) {
    return { data: entry.data, fresh: true };
  }
  if (entry.data && (Date.now() - entry.timestamp) < STALE_TTL) {
    return { data: entry.data, fresh: false };
  }
  return null;
}

function setCacheDevotions(key, data) {
  devotionsCache[key] = { data, timestamp: Date.now(), refreshing: false };
}

function setRefreshingDevotions(key, value) {
  if (devotionsCache[key]) devotionsCache[key].refreshing = value;
}

function invalidateCacheDevotions(key) {
  if (key) {
    devotionsCache[key] = { data: null, timestamp: 0 };
  } else {
    Object.keys(devotionsCache).forEach(k => devotionsCache[k] = { data: null, timestamp: 0 });
  }
}

// ============================================
// ENGLISH CLASS CACHE
// ============================================

const englishCache = {
  series: { data: null, timestamp: 0, refreshing: false },
  classes: { data: null, timestamp: 0, refreshing: false }
};

function getCachedEnglish(key) {
  const entry = englishCache[key];
  if (entry.data && (Date.now() - entry.timestamp) < CACHE_TTL) {
    return { data: entry.data, fresh: true };
  }
  if (entry.data && (Date.now() - entry.timestamp) < STALE_TTL) {
    return { data: entry.data, fresh: false };
  }
  return null;
}

function setCacheEnglish(key, data) {
  englishCache[key] = { data, timestamp: Date.now(), refreshing: false };
}

function setRefreshingEnglish(key, value) {
  if (englishCache[key]) englishCache[key].refreshing = value;
}

function invalidateCacheEnglish(key) {
  if (key) {
    englishCache[key] = { data: null, timestamp: 0 };
  } else {
    Object.keys(englishCache).forEach(k => englishCache[k] = { data: null, timestamp: 0 });
  }
}

// Legacy variables (kept for compatibility)
let sermonsCache = [];
let scheduleCache = [];
let hashtagsCache = [];

// ============================================
// RATING CONVERSION HELPERS
// ============================================

// Craft stores ratings as star emoji strings: "⭐️", "⭐️⭐️", etc.
const STAR_EMOJI = '⭐️';

function starsToNumber(starString) {
  if (!starString) return 0;
  // Count the star emojis in the string
  const matches = starString.match(/⭐️/g);
  return matches ? matches.length : 0;
}

function numberToStars(num) {
  if (!num || num < 1 || num > 5) return '';
  return STAR_EMOJI.repeat(num);
}

// ============================================
// CRAFT API HELPERS
// ============================================

/**
 * Make authenticated request to Craft API
 */
async function craftRequest(endpoint, options = {}) {
  const url = `${CRAFT_API_URL}${endpoint}`;
  const response = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${CRAFT_API_KEY}`,
      ...options.headers
    }
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Craft API error (${response.status}): ${errorText}`);
  }

  return response.json();
}

/**
 * Make authenticated request to Devotions Craft API
 */
async function devotionsRequest(endpoint, options = {}) {
  if (!DEVOTIONS_API_URL || !DEVOTIONS_API_KEY) {
    throw new Error('Devotions API not configured');
  }

  const url = `${DEVOTIONS_API_URL}${endpoint}`;
  const response = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${DEVOTIONS_API_KEY}`,
      ...options.headers
    }
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Devotions API error (${response.status}): ${errorText}`);
  }

  return response.json();
}

/**
 * Make authenticated request to English Class Craft API
 */
async function englishRequest(endpoint, options = {}) {
  if (!ENGLISH_API_URL || !ENGLISH_API_KEY) {
    throw new Error('English Class API not configured');
  }

  const url = `${ENGLISH_API_URL}${endpoint}`;
  const response = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${ENGLISH_API_KEY}`,
      ...options.headers
    }
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`English Class API error (${response.status}): ${errorText}`);
  }

  return response.json();
}

/**
 * Get all collections from Craft
 */
async function getCollections() {
  return await craftRequest('/collections');
}

/**
 * Get collection schema
 */
async function getCollectionSchema(collectionId) {
  return await craftRequest(`/collections/${collectionId}/schema`);
}

/**
 * Update collection schema (to add new single-select options)
 */
async function updateCollectionSchema(collectionId, schema) {
  return await craftRequest(`/collections/${collectionId}/schema`, {
    method: 'PUT',
    body: JSON.stringify(schema)
  });
}

/**
 * Get collection items from Craft
 */
async function getCollectionItems(collectionId) {
  return await craftRequest(`/collections/${collectionId}/items`);
}

/**
 * Update collection items in Craft
 * @param {string} collectionId - The collection ID
 * @param {Array} items - Items to update
 * @param {boolean} allowNewSelectOptions - If true, automatically adds new single-select options to schema
 */
async function updateCollectionItems(collectionId, items, allowNewSelectOptions = false) {
  const body = { itemsToUpdate: items };
  if (allowNewSelectOptions) {
    body.allowNewSelectOptions = true;
  }
  return await craftRequest(`/collections/${collectionId}/items`, {
    method: 'PUT',
    body: JSON.stringify(body)
  });
}

/**
 * Add collection items to Craft
 */
async function addCollectionItems(collectionId, items) {
  return await craftRequest(`/collections/${collectionId}/items`, {
    method: 'POST',
    body: JSON.stringify({ items: items })
  });
}

/**
 * Delete collection items from Craft
 */
async function deleteCollectionItems(collectionId, itemIds) {
  return await craftRequest(`/collections/${collectionId}/items`, {
    method: 'DELETE',
    body: JSON.stringify({ idsToDelete: itemIds })
  });
}

/**
 * Initialize collections by discovering them from the API
 */
async function initializeCollections() {
  try {
    console.log('Discovering collections from Craft API...');
    const result = await getCollections();
    const collections = result.items || result;

    console.log(`Found ${collections.length} collections:`);
    collections.forEach(col => {
      console.log(`  - ${col.name || col.title} (ID: ${col.id})`);
    });

    // Map collections by name (case-insensitive partial match)
    for (const col of collections) {
      const name = (col.name || col.title || '').toLowerCase();
      if (name.includes('sermon') && !name.includes('hashtag') && !name.includes('series') && !name.includes('schedule') && !name.includes('overview')) {
        COLLECTIONS.sermons = col.id;
      } else if (name.includes('schedule') || name.includes('overview') || name.includes('teaching')) {
        COLLECTIONS.schedule = col.id;
      } else if (name.includes('hashtag')) {
        COLLECTIONS.hashtags = col.id;
      } else if (name.includes('series')) {
        COLLECTIONS.series = col.id;
      }
    }

    console.log('Mapped collections:', COLLECTIONS);
    return collections;
  } catch (error) {
    console.error('Failed to discover collections:', error.message);
    return [];
  }
}

// ============================================
// API ROUTES
// ============================================

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Get all collections (for debugging)
app.get('/api/collections', async (req, res) => {
  try {
    const collections = await getCollections();
    res.json(collections);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch collections', details: error.message });
  }
});

// Get collection schema
app.get('/api/collections/:id/schema', async (req, res) => {
  try {
    const schema = await getCollectionSchema(req.params.id);
    res.json(schema);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch schema', details: error.message });
  }
});

// Add a new option to a single-select field in the schema
app.post('/api/add-field-option', async (req, res) => {
  try {
    const { fieldName, newOption } = req.body;

    if (!fieldName || !newOption) {
      return res.status(400).json({ error: 'fieldName and newOption are required' });
    }

    if (!COLLECTIONS.schedule) {
      return res.status(503).json({ error: 'Schedule collection not found' });
    }

    // Get current schema
    const schema = await getCollectionSchema(COLLECTIONS.schedule);

    // Find the field in the schema
    const field = schema.properties?.find(p => p.name === fieldName);
    if (!field) {
      return res.status(404).json({ error: `Field '${fieldName}' not found in schema` });
    }

    // Check if option already exists
    const existingOptions = field.options || [];
    if (existingOptions.includes(newOption)) {
      return res.json({ success: true, message: 'Option already exists', alreadyExists: true });
    }

    // Add the new option
    const updatedOptions = [...existingOptions, newOption];

    // Update the schema - only send the field being updated
    const updatedSchema = {
      properties: schema.properties.map(p => {
        if (p.name === fieldName) {
          return { ...p, options: updatedOptions };
        }
        return p;
      })
    };

    await updateCollectionSchema(COLLECTIONS.schedule, updatedSchema);

    console.log(`Added option "${newOption}" to field "${fieldName}"`);
    res.json({ success: true, message: `Added "${newOption}" to ${fieldName}`, options: updatedOptions });
  } catch (error) {
    console.error('Failed to add field option:', error);
    res.status(500).json({ error: 'Failed to add field option', details: error.message });
  }
});

// Get all sermons
app.get('/api/sermons', async (req, res) => {
  try {
    if (!COLLECTIONS.sermons) {
      return res.status(503).json({ error: 'Sermons collection not found. Check API connection.' });
    }
    const result = await getCollectionItems(COLLECTIONS.sermons);
    const rawSermons = result.items || result;

    // Normalize sermon data structure to ensure properties field exists
    const sermons = rawSermons.map(item => {
      // Extract content - it may be an array of blocks or a string
      let contentMarkdown = '';
      if (Array.isArray(item.content)) {
        contentMarkdown = item.content
          .filter(block => block.markdown)
          .map(block => block.markdown)
          .join('\n');
      } else {
        contentMarkdown = item.contentMarkdown || item.content || '';
      }

      return {
        id: item.id,
        title: item.title || item.sermon_title || '',
        sermon_title: item.sermon_title || item.title || '',
        contentMarkdown,
        properties: {
          sermon_information_added: item.properties?.sermon_information_added || false,
          ...item.properties
        }
      };
    });

    sermonsCache = sermons;
    res.json(sermons);
  } catch (error) {
    // Return cached data if API fails
    if (sermonsCache.length > 0) {
      res.json(sermonsCache);
    } else {
      res.status(500).json({ error: 'Failed to fetch sermons', details: error.message });
    }
  }
});

// Helper to fetch and process schedule data
async function fetchScheduleData() {
  if (!COLLECTIONS.schedule) {
    throw new Error('Schedule collection not found');
  }
  const result = await getCollectionItems(COLLECTIONS.schedule);
  const rawSchedule = result.items || result;

  return rawSchedule.map(item => {
    let contentMarkdown = '';
    if (Array.isArray(item.content)) {
      contentMarkdown = item.content
        .filter(block => block.markdown)
        .map(block => block.markdown)
        .join('\n');
    } else if (item.contentMarkdown) {
      contentMarkdown = item.contentMarkdown;
    } else if (typeof item.content === 'string') {
      contentMarkdown = item.content;
    }

    return {
      id: item.id,
      sermon_name: item.sermon_name || item.title || '',
      content: contentMarkdown,
      lesson_type: item.properties?.lesson_type || '',
      preacher: item.properties?.preacher || '',
      sermon_date: item.properties?.sermon_date || '',
      special_event: item.properties?.special_event || '',
      status: item.properties?.status || '',
      notes: item.properties?.notes || '',
      rating: starsToNumber(item.properties?.rating),
      series: item.properties?.sermon_series?.relations?.[0]?.title || '',
      sermon_series_id: item.properties?.sermon_series?.relations?.[0]?.blockId || null,
      sermon_information_added: item.properties?.sermon_information_added || false,
      sermon_themefocus: item.properties?.sermon_themefocus || '',
      audience: item.properties?.audience || '',
      seasonholiday: item.properties?.seasonholiday || '',
      key_takeaway: item.properties?.key_takeaway || '',
      hashtags: item.properties?.hashtags || '',
      primary_text: item.properties?.primary_text || '',
      series_number: item.properties?.series_number || null,
      properties: item.properties
    };
  });
}

// Get schedule (Bible Teaching Overview)
app.get('/api/schedule', async (req, res) => {
  try {
    // Check cache first
    const cached = getCached('schedule');
    if (cached) {
      // Serve cached data immediately
      res.json(cached.data);

      // If stale, refresh in background (don't await)
      if (!cached.fresh && !cache.schedule.refreshing) {
        setRefreshing('schedule', true);
        fetchScheduleData()
          .then(data => {
            setCache('schedule', data);
            console.log('Schedule cache refreshed in background');
          })
          .catch(err => {
            console.error('Background refresh failed:', err.message);
            setRefreshing('schedule', false);
          });
      }
      return;
    }

    if (!COLLECTIONS.schedule) {
      return res.status(503).json({ error: 'Schedule collection not found. Check API connection.' });
    }

    const schedule = await fetchScheduleData();
    setCache('schedule', schedule);
    scheduleCache = schedule;
    res.json(schedule);
  } catch (error) {
    if (scheduleCache.length > 0) {
      res.json(scheduleCache);
    } else {
      res.status(500).json({ error: 'Failed to fetch schedule', details: error.message });
    }
  }
});

// Get hashtags
app.get('/api/hashtags', async (req, res) => {
  try {
    if (!COLLECTIONS.hashtags) {
      return res.status(503).json({ error: 'Hashtags collection not found. Check API connection.' });
    }
    const result = await getCollectionItems(COLLECTIONS.hashtags);
    const hashtags = result.items || result;
    hashtagsCache = hashtags;
    res.json(hashtags);
  } catch (error) {
    if (hashtagsCache.length > 0) {
      res.json(hashtagsCache);
    } else {
      res.status(500).json({ error: 'Failed to fetch hashtags', details: error.message });
    }
  }
});

// Helper to fetch series data
async function fetchSeriesData() {
  if (!COLLECTIONS.series) {
    throw new Error('Series collection not found');
  }
  const result = await getCollectionItems(COLLECTIONS.series);
  const rawSeries = result.items || result;

  return rawSeries.map(item => ({
    id: item.id,
    title: item.title || '',
    startDate: item.properties?.series_start_date || null,
    endDate: item.properties?.series_end_date || null
  }));
}

// Get sermon series (from relationship database)
app.get('/api/series', async (req, res) => {
  try {
    // Check cache first
    const cached = getCached('series');
    if (cached) {
      res.json(cached.data);

      // If stale, refresh in background
      if (!cached.fresh && !cache.series.refreshing) {
        setRefreshing('series', true);
        fetchSeriesData()
          .then(data => {
            setCache('series', data);
            console.log('Series cache refreshed in background');
          })
          .catch(err => {
            console.error('Series background refresh failed:', err.message);
            setRefreshing('series', false);
          });
      }
      return;
    }

    if (!COLLECTIONS.series) {
      return res.status(503).json({ error: 'Series collection not found. Check API connection.' });
    }

    const series = await fetchSeriesData();
    setCache('series', series);
    res.json(series);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch series', details: error.message });
  }
});

// Add a new sermon series
app.post('/api/series', async (req, res) => {
  try {
    if (!COLLECTIONS.series) {
      return res.status(503).json({ error: 'Series collection not found' });
    }
    const { title, startDate, endDate } = req.body;

    if (!title) {
      return res.status(400).json({ error: 'Title is required' });
    }

    const properties = {};
    if (startDate) properties.series_start_date = startDate;
    if (endDate) properties.series_end_date = endDate;

    const result = await craftRequest(`/collections/${COLLECTIONS.series}/items`, {
      method: 'POST',
      body: JSON.stringify({ items: [{ title, properties }] })
    });
    invalidateCache('series');

    res.json({ success: true, result });
  } catch (error) {
    res.status(500).json({ error: 'Failed to add series', details: error.message });
  }
});

// Update a sermon series (dates)
app.put('/api/series/:id', async (req, res) => {
  try {
    if (!COLLECTIONS.series) {
      return res.status(503).json({ error: 'Series collection not found' });
    }
    const { id } = req.params;
    const { title, startDate, endDate } = req.body;

    const updateItem = { id };
    if (title) updateItem.title = title;

    const properties = {};
    if (startDate !== undefined) properties.series_start_date = startDate || '';
    if (endDate !== undefined) properties.series_end_date = endDate || '';

    if (Object.keys(properties).length > 0) {
      updateItem.properties = properties;
    }

    const result = await updateCollectionItems(COLLECTIONS.series, [updateItem]);
    invalidateCache('series');

    res.json({ success: true, result });
  } catch (error) {
    res.status(500).json({ error: 'Failed to update series', details: error.message });
  }
});

// Update a sermon
app.put('/api/sermons/:id', async (req, res) => {
  try {
    if (!COLLECTIONS.sermons) {
      return res.status(503).json({ error: 'Sermons collection not found' });
    }
    const { id } = req.params;
    const updates = req.body;

    // Wrap fields in properties object for Craft API
    const result = await updateCollectionItems(COLLECTIONS.sermons, [{
      id,
      properties: updates
    }]);

    res.json({ success: true, result });
  } catch (error) {
    res.status(500).json({ error: 'Failed to update sermon', details: error.message });
  }
});

// Update a schedule entry
app.put('/api/schedule/:id', async (req, res) => {
  try {
    if (!COLLECTIONS.schedule) {
      return res.status(503).json({ error: 'Schedule collection not found' });
    }
    const { id } = req.params;
    const updates = req.body;

    // Map frontend field names to Craft property keys
    const craftUpdates = {
      id,
      sermon_name: updates.sermon_name,
      properties: {}
    };

    // Original schedule fields
    if (updates.lesson_type) craftUpdates.properties.lesson_type = updates.lesson_type;
    if (updates.preacher) craftUpdates.properties.preacher = updates.preacher;
    if (updates.sermon_date) craftUpdates.properties.sermon_date = updates.sermon_date;
    if (updates.special_event !== undefined) craftUpdates.properties.special_event = updates.special_event;
    if (updates.status) craftUpdates.properties.status = updates.status;
    if (updates.notes !== undefined) craftUpdates.properties.notes = updates.notes;
    if (updates.rating !== undefined) craftUpdates.properties.rating = numberToStars(updates.rating);

    // Series is a RELATION field - need to send as sermon_series with blockId
    if (updates.sermon_series_id) {
      craftUpdates.properties.sermon_series = {
        relations: [{ blockId: updates.sermon_series_id }]
      };
    } else if (updates.sermon_series_id === null || updates.sermon_series_id === '') {
      // Clear the series relation
      craftUpdates.properties.sermon_series = { relations: [] };
    }

    // Metadata fields
    if (updates.sermon_information_added !== undefined) {
      craftUpdates.properties.sermon_information_added = updates.sermon_information_added;
    }
    if (updates.sermon_themefocus !== undefined) craftUpdates.properties.sermon_themefocus = updates.sermon_themefocus;
    if (updates.audience !== undefined) craftUpdates.properties.audience = updates.audience;
    if (updates.seasonholiday !== undefined) craftUpdates.properties.seasonholiday = updates.seasonholiday;
    if (updates.key_takeaway !== undefined) craftUpdates.properties.key_takeaway = updates.key_takeaway;
    if (updates.hashtags !== undefined) craftUpdates.properties.hashtags = updates.hashtags;
    if (updates.primary_text !== undefined) craftUpdates.properties.primary_text = updates.primary_text;
    if (updates.series_number !== undefined) craftUpdates.properties.series_number = updates.series_number;

    // Use allowNewSelectOptions to automatically add any new theme/audience/season values to Craft schema
    const result = await updateCollectionItems(COLLECTIONS.schedule, [craftUpdates], true);
    invalidateCache('schedule');

    res.json({ success: true, result });
  } catch (error) {
    res.status(500).json({ error: 'Failed to update schedule entry', details: error.message });
  }
});

// Add a new schedule entry
app.post('/api/schedule', async (req, res) => {
  try {
    if (!COLLECTIONS.schedule) {
      return res.status(503).json({ error: 'Schedule collection not found' });
    }
    const entry = req.body;

    // Build properties object, only including fields that have values
    const properties = {
      lesson_type: entry.lesson_type || '',
      preacher: entry.preacher || '',
      sermon_date: entry.sermon_date || '',
      status: entry.status || 'Draft'
    };

    // Only add optional fields if they have values (Craft doesn't accept null)
    if (entry.special_event) properties.special_event = entry.special_event;
    if (entry.notes) properties.notes = entry.notes;

    // Series is a RELATION field - need to send as sermon_series with blockId
    if (entry.sermon_series_id) {
      properties.sermon_series = {
        relations: [{ blockId: entry.sermon_series_id }]
      };
    }

    // Metadata fields
    if (entry.sermon_information_added !== undefined) {
      properties.sermon_information_added = entry.sermon_information_added;
    }
    if (entry.sermon_themefocus) properties.sermon_themefocus = entry.sermon_themefocus;
    if (entry.audience) properties.audience = entry.audience;
    if (entry.seasonholiday) properties.seasonholiday = entry.seasonholiday;
    if (entry.key_takeaway) properties.key_takeaway = entry.key_takeaway;
    if (entry.hashtags) properties.hashtags = entry.hashtags;
    if (entry.primary_text) properties.primary_text = entry.primary_text;
    if (entry.series_number !== undefined) properties.series_number = entry.series_number;

    const craftEntry = {
      sermon_name: entry.sermon_name || '',
      properties
    };

    const result = await addCollectionItems(COLLECTIONS.schedule, [craftEntry]);
    invalidateCache('schedule');

    res.json({ success: true, result });
  } catch (error) {
    res.status(500).json({ error: 'Failed to add schedule entry', details: error.message });
  }
});

// Delete a schedule entry
app.delete('/api/schedule/:id', async (req, res) => {
  try {
    if (!COLLECTIONS.schedule) {
      return res.status(503).json({ error: 'Schedule collection not found' });
    }
    const { id } = req.params;

    const result = await deleteCollectionItems(COLLECTIONS.schedule, [id]);
    invalidateCache('schedule');

    res.json({ success: true, result });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete schedule entry', details: error.message });
  }
});

// ============================================
// MIGRATION ENDPOINT
// ============================================

/**
 * Calculate next Sunday from a given date
 */
function getNextSunday(date) {
  const d = new Date(date);
  const day = d.getDay();
  const daysUntilSunday = day === 0 ? 0 : 7 - day;
  d.setDate(d.getDate() + daysUntilSunday);
  return d.toISOString().split('T')[0];
}

/**
 * One-time migration: Move all sermons from Sermons collection to Bible Teaching Overview
 */
app.post('/api/migrate-sermons', async (req, res) => {
  try {
    if (!COLLECTIONS.sermons || !COLLECTIONS.schedule) {
      return res.status(503).json({
        error: 'Collections not found. Ensure both Sermons and Schedule collections exist.'
      });
    }

    console.log('Starting sermon migration...');

    // Fetch all sermons
    const result = await getCollectionItems(COLLECTIONS.sermons);
    const rawSermons = result.items || result;

    console.log(`Found ${rawSermons.length} sermons to migrate`);

    const migratedItems = [];
    const errors = [];

    for (const sermon of rawSermons) {
      try {
        // Extract content
        let contentMarkdown = '';
        if (Array.isArray(sermon.content)) {
          contentMarkdown = sermon.content
            .filter(block => block.markdown)
            .map(block => block.markdown)
            .join('\n');
        } else {
          contentMarkdown = sermon.contentMarkdown || sermon.content || '';
        }

        // Calculate sermon_date from creation date (next Sunday)
        // Craft items may have createdAt, or we use current date
        const creationDate = sermon.createdAt || sermon.properties?.createdAt || new Date().toISOString();
        const sermonDate = getNextSunday(creationDate);

        // Map status values to Craft's allowed options: idea, in progress, complete, archive
        let status = sermon.properties?.status || 'idea';
        const statusMap = {
          'draft': 'idea',
          'Ready to Preach': 'in progress',
          'complete': 'complete',
          'Unprepared': 'idea'
        };
        status = statusMap[status] || 'idea';

        // Build the migrated entry
        const migratedEntry = {
          sermon_name: sermon.title || sermon.sermon_title || 'Untitled Sermon',
          properties: {
            lesson_type: 'Sermon AM',
            content_type: 'Sermon',
            preacher: 'Benjamin',
            sermon_date: sermonDate,
            status: status,
            content: contentMarkdown,
            sermon_information_added: sermon.properties?.sermon_information_added || false,
            series: sermon.properties?.series || '',
            sermon_themefocus: sermon.properties?.sermon_themefocus || '',
            audience: sermon.properties?.audience || '',
            seasonholiday: sermon.properties?.seasonholiday || '',
            key_takeaway: sermon.properties?.key_takeaway || '',
            hashtags: sermon.properties?.hashtags || ''
          }
        };

        // Only add non-empty values (Craft doesn't like nulls)
        Object.keys(migratedEntry.properties).forEach(key => {
          if (migratedEntry.properties[key] === '' || migratedEntry.properties[key] === null) {
            delete migratedEntry.properties[key];
          }
        });

        migratedItems.push(migratedEntry);
      } catch (err) {
        errors.push({ sermonId: sermon.id, error: err.message });
      }
    }

    if (migratedItems.length === 0) {
      return res.json({
        success: false,
        message: 'No sermons to migrate',
        errors
      });
    }

    // Add migrated items in batches to avoid "request entity too large" error
    console.log(`Migrating ${migratedItems.length} sermons to Bible Teaching Overview in batches...`);
    const BATCH_SIZE = 3;
    let successCount = 0;
    const results = [];

    for (let i = 0; i < migratedItems.length; i += BATCH_SIZE) {
      const batch = migratedItems.slice(i, i + BATCH_SIZE);
      console.log(`Processing batch ${Math.floor(i / BATCH_SIZE) + 1}: ${batch.length} items`);

      try {
        const batchResult = await addCollectionItems(COLLECTIONS.schedule, batch);
        results.push(batchResult);
        successCount += batch.length;
      } catch (batchErr) {
        console.error(`Batch ${Math.floor(i / BATCH_SIZE) + 1} failed:`, batchErr.message);
        errors.push({ batch: Math.floor(i / BATCH_SIZE) + 1, error: batchErr.message });
      }
    }

    res.json({
      success: successCount > 0,
      message: `Successfully migrated ${successCount} of ${migratedItems.length} sermons`,
      migrated: successCount,
      errors: errors.length > 0 ? errors : undefined,
      results
    });

  } catch (error) {
    console.error('Migration failed:', error);
    res.status(500).json({
      error: 'Migration failed',
      details: error.message
    });
  }
});

// Batch update (for shift operations)
app.post('/api/schedule/batch-update', async (req, res) => {
  try {
    if (!COLLECTIONS.schedule) {
      return res.status(503).json({ error: 'Schedule collection not found' });
    }
    const { updates } = req.body; // Array of { id, sermon_date, ... }

    const craftUpdates = updates.map(u => ({
      id: u.id,
      properties: {
        sermon_date: u.sermon_date
      }
    }));

    const result = await updateCollectionItems(COLLECTIONS.schedule, craftUpdates);

    res.json({ success: true, result, count: updates.length });
  } catch (error) {
    res.status(500).json({ error: 'Failed to batch update schedule', details: error.message });
  }
});

// ============================================
// DEVOTIONS API ROUTES
// ============================================

// Helpers to fetch devotions data
async function fetchDevotionSeriesData() {
  const result = await devotionsRequest(`/collections/${DEVOTIONS_COLLECTIONS.series}/items`);
  return (result.items || result).map(item => ({
    id: item.id,
    title: item.title || '',
    series_start_date: item.properties?.series_start_date || null,
    series_completion_date_goal: item.properties?.series_completion_date_goal || null,
    series_completion_date: item.properties?.series_completion_date || null,
    current_estimated_completion_date: item.properties?.current_estimated_completion_date || null,
    what_days_of_the_week: item.properties?.what_days_of_the_week || [],
    course: item.properties?.course || null,
    properties: item.properties
  }));
}

async function fetchDevotionLessonsData() {
  const result = await devotionsRequest(`/collections/${DEVOTIONS_COLLECTIONS.lessons}/items`);
  return (result.items || result).map(item => ({
    id: item.id,
    title: item.title || '',
    lesson_order: item.properties?.lesson_order || null,
    week_lesson: item.properties?.week_lesson || null,
    day: item.properties?.day || null,
    category: item.properties?.category || null,
    scheduled_date: item.properties?.scheduled_date || null,
    last_taught: item.properties?.last_taught || null,
    prepared_to_teach: item.properties?.prepared_to_teach || false,
    properties: item.properties,
    content: item.content || []
  }));
}

// Get devotion series (with days of week configuration)
app.get('/api/devotions/series', async (req, res) => {
  try {
    const cached = getCachedDevotions('series');
    if (cached) {
      res.json(cached.data);

      if (!cached.fresh && !devotionsCache.series.refreshing) {
        setRefreshingDevotions('series', true);
        fetchDevotionSeriesData()
          .then(data => {
            setCacheDevotions('series', data);
            console.log('Devotion series cache refreshed in background');
          })
          .catch(err => {
            console.error('Devotion series background refresh failed:', err.message);
            setRefreshingDevotions('series', false);
          });
      }
      return;
    }

    const series = await fetchDevotionSeriesData();
    setCacheDevotions('series', series);
    res.json(series);
  } catch (error) {
    console.error('Failed to fetch devotion series:', error);
    res.status(500).json({ error: 'Failed to fetch devotion series', details: error.message });
  }
});

// Add a new devotion series
app.post('/api/devotions/series', async (req, res) => {
  try {
    const { title, startDate, endDate } = req.body;

    if (!title) {
      return res.status(400).json({ error: 'Title is required' });
    }

    const properties = {};
    if (startDate) properties.series_start_date = startDate;
    if (endDate) properties.series_completion_date_goal = endDate;

    const result = await devotionsRequest(`/collections/${DEVOTIONS_COLLECTIONS.series}/items`, {
      method: 'POST',
      body: JSON.stringify({ items: [{ title, properties }] })
    });

    invalidateCacheDevotions('series');
    res.json(result);
  } catch (error) {
    console.error('Failed to add devotion series:', error);
    res.status(500).json({ error: 'Failed to add devotion series', details: error.message });
  }
});

// Get all devotion lessons
app.get('/api/devotions/lessons', async (req, res) => {
  try {
    const cached = getCachedDevotions('lessons');
    if (cached) {
      res.json(cached.data);

      if (!cached.fresh && !devotionsCache.lessons.refreshing) {
        setRefreshingDevotions('lessons', true);
        fetchDevotionLessonsData()
          .then(data => {
            setCacheDevotions('lessons', data);
            console.log('Devotion lessons cache refreshed in background');
          })
          .catch(err => {
            console.error('Devotion lessons background refresh failed:', err.message);
            setRefreshingDevotions('lessons', false);
          });
      }
      return;
    }

    const lessons = await fetchDevotionLessonsData();
    setCacheDevotions('lessons', lessons);
    res.json(lessons);
  } catch (error) {
    console.error('Failed to fetch devotion lessons:', error);
    res.status(500).json({ error: 'Failed to fetch devotion lessons', details: error.message });
  }
});

// Update a devotion lesson
app.put('/api/devotions/lessons/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;

    const craftUpdates = { id, properties: {} };

    // Map fields to properties
    if (updates.scheduled_date !== undefined) craftUpdates.properties.scheduled_date = updates.scheduled_date;
    if (updates.last_taught !== undefined) craftUpdates.properties.last_taught = updates.last_taught;
    if (updates.prepared_to_teach !== undefined) craftUpdates.properties.prepared_to_teach = updates.prepared_to_teach;

    const result = await devotionsRequest(`/collections/${DEVOTIONS_COLLECTIONS.lessons}/items`, {
      method: 'PUT',
      body: JSON.stringify({ itemsToUpdate: [craftUpdates] })
    });

    invalidateCacheDevotions('lessons');
    res.json({ success: true, result });
  } catch (error) {
    console.error('Failed to update devotion lesson:', error);
    res.status(500).json({ error: 'Failed to update devotion lesson', details: error.message });
  }
});

// Plan lessons for the next 30 days
app.post('/api/devotions/plan-month', async (req, res) => {
  try {
    // 1. Get active series (first one with a start date)
    const seriesResult = await devotionsRequest(`/collections/${DEVOTIONS_COLLECTIONS.series}/items`);
    const allSeries = seriesResult.items || seriesResult;
    const activeSeries = allSeries.find(s => s.properties?.series_start_date && s.title);

    if (!activeSeries) {
      return res.status(400).json({ error: 'No active series found' });
    }

    const daysOfWeek = activeSeries.properties?.what_days_of_the_week || ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

    // 2. Get all lessons and sort by lesson_order (or fall back to week/day)
    const lessonsResult = await devotionsRequest(`/collections/${DEVOTIONS_COLLECTIONS.lessons}/items`);
    const allLessons = lessonsResult.items || lessonsResult;

    // Parse week number from week_lesson (e.g., "Week 1 - ..." → 1)
    const getWeekNum = (weekLesson) => {
      if (!weekLesson) return 999;
      const match = weekLesson.match(/Week\s+(\d+)/i);
      return match ? parseInt(match[1]) : 999;
    };

    // Parse day number (e.g., "Day 1" → 1)
    const getDayNum = (day) => {
      if (!day) return 999;
      const match = day.match(/Day\s+(\d+)/i);
      return match ? parseInt(match[1]) : 999;
    };

    const lessons = allLessons.sort((a, b) => {
      // Prefer lesson_order if both have it
      const orderA = a.properties?.lesson_order;
      const orderB = b.properties?.lesson_order;

      if (orderA != null && orderB != null) {
        return orderA - orderB;
      }

      // Fall back to week/day sorting
      const weekA = getWeekNum(a.properties?.week_lesson);
      const weekB = getWeekNum(b.properties?.week_lesson);
      if (weekA !== weekB) return weekA - weekB;
      return getDayNum(a.properties?.day) - getDayNum(b.properties?.day);
    });

    // 3. Find last completed lesson (has last_taught date)
    const completedLessons = lessons.filter(l => l.properties?.last_taught);
    let startIndex = 0;

    if (completedLessons.length > 0) {
      // Sort completed by last_taught date to find the most recent
      completedLessons.sort((a, b) =>
        new Date(b.properties.last_taught) - new Date(a.properties.last_taught)
      );
      const lastCompleted = completedLessons[0];
      const lastCompletedIndex = lessons.findIndex(l => l.id === lastCompleted.id);
      startIndex = lastCompletedIndex + 1;
    }

    // 4. Generate next 30 calendar days matching days_of_week
    const dayMap = { 'Sunday': 0, 'Monday': 1, 'Tuesday': 2, 'Wednesday': 3, 'Thursday': 4, 'Friday': 5, 'Saturday': 6 };
    const allowedDays = daysOfWeek.map(d => dayMap[d]).filter(d => d !== undefined);

    const scheduleDates = [];
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    let current = new Date(today);

    // Generate up to 30 matching dates (or stop after 90 days)
    const maxDaysToSearch = 90;
    let daysSearched = 0;

    while (scheduleDates.length < 30 && daysSearched < maxDaysToSearch) {
      if (allowedDays.includes(current.getDay())) {
        scheduleDates.push(current.toISOString().split('T')[0]);
      }
      current.setDate(current.getDate() + 1);
      daysSearched++;
    }

    // 5. Assign scheduled_date to lessons starting from startIndex
    const updates = [];
    for (let i = 0; i < scheduleDates.length && (startIndex + i) < lessons.length; i++) {
      const lesson = lessons[startIndex + i];
      updates.push({
        id: lesson.id,
        properties: { scheduled_date: scheduleDates[i] }
      });
    }

    // 6. Batch update
    if (updates.length > 0) {
      await devotionsRequest(`/collections/${DEVOTIONS_COLLECTIONS.lessons}/items`, {
        method: 'PUT',
        body: JSON.stringify({ itemsToUpdate: updates })
      });
    }

    invalidateCacheDevotions('lessons');
    res.json({
      success: true,
      scheduled: updates.length,
      activeSeries: activeSeries.title,
      daysOfWeek,
      startFromLesson: startIndex < lessons.length ? lessons[startIndex].title : null
    });
  } catch (error) {
    console.error('Failed to plan month:', error);
    res.status(500).json({ error: 'Failed to plan month', details: error.message });
  }
});

// Cascade reschedule after a lesson is moved
app.post('/api/devotions/cascade-reschedule', async (req, res) => {
  try {
    const { fromLessonId, newDate } = req.body;

    if (!fromLessonId || !newDate) {
      return res.status(400).json({ error: 'fromLessonId and newDate are required' });
    }

    // Get active series for days_of_week
    const seriesResult = await devotionsRequest(`/collections/${DEVOTIONS_COLLECTIONS.series}/items`);
    const allSeries = seriesResult.items || seriesResult;
    const activeSeries = allSeries.find(s => s.properties?.series_start_date && s.title);
    const daysOfWeek = activeSeries?.properties?.what_days_of_the_week || ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

    const dayMap = { 'Sunday': 0, 'Monday': 1, 'Tuesday': 2, 'Wednesday': 3, 'Thursday': 4, 'Friday': 5, 'Saturday': 6 };
    const allowedDays = daysOfWeek.map(d => dayMap[d]).filter(d => d !== undefined);

    // Get all lessons sorted
    const lessonsResult = await devotionsRequest(`/collections/${DEVOTIONS_COLLECTIONS.lessons}/items`);
    const allLessons = lessonsResult.items || lessonsResult;

    const getWeekNum = (weekLesson) => {
      if (!weekLesson) return 999;
      const match = weekLesson.match(/Week\s+(\d+)/i);
      return match ? parseInt(match[1]) : 999;
    };

    const getDayNum = (day) => {
      if (!day) return 999;
      const match = day.match(/Day\s+(\d+)/i);
      return match ? parseInt(match[1]) : 999;
    };

    const lessons = allLessons.sort((a, b) => {
      const weekA = getWeekNum(a.properties?.week_lesson);
      const weekB = getWeekNum(b.properties?.week_lesson);
      if (weekA !== weekB) return weekA - weekB;
      return getDayNum(a.properties?.day) - getDayNum(b.properties?.day);
    });

    // Find the moved lesson's index
    const movedIndex = lessons.findIndex(l => l.id === fromLessonId);
    if (movedIndex === -1) {
      return res.status(404).json({ error: 'Lesson not found' });
    }

    // Generate dates starting from newDate
    const scheduleDates = [newDate];
    let current = new Date(newDate);
    current.setDate(current.getDate() + 1);

    // Get remaining lessons count after the moved one
    const remainingCount = lessons.length - movedIndex - 1;

    // Generate enough dates for remaining lessons
    let generated = 0;
    const maxDays = 180;
    while (generated < remainingCount && generated < maxDays) {
      if (allowedDays.includes(current.getDay())) {
        scheduleDates.push(current.toISOString().split('T')[0]);
        generated++;
      }
      current.setDate(current.getDate() + 1);
    }

    // Build updates: moved lesson + all following lessons
    const updates = [];
    updates.push({
      id: fromLessonId,
      properties: { scheduled_date: newDate }
    });

    for (let i = 1; i < scheduleDates.length && (movedIndex + i) < lessons.length; i++) {
      const lesson = lessons[movedIndex + i];
      updates.push({
        id: lesson.id,
        properties: { scheduled_date: scheduleDates[i] }
      });
    }

    // Batch update
    if (updates.length > 0) {
      await devotionsRequest(`/collections/${DEVOTIONS_COLLECTIONS.lessons}/items`, {
        method: 'PUT',
        body: JSON.stringify({ itemsToUpdate: updates })
      });
    }

    invalidateCacheDevotions('lessons');
    res.json({ success: true, rescheduled: updates.length });
  } catch (error) {
    console.error('Failed to cascade reschedule:', error);
    res.status(500).json({ error: 'Failed to cascade reschedule', details: error.message });
  }
});

// ============================================
// ENGLISH CLASS API ROUTES
// ============================================

// Helpers to fetch English class data
async function fetchEnglishSeriesData() {
  const result = await englishRequest(`/collections/${ENGLISH_COLLECTIONS.series}/items`);
  return (result.items || result).map(item => ({
    id: item.id,
    title: item.title || '',
    series_start_date: item.properties?.series_start_date || null,
    series_completion_date: item.properties?.series_completion_date || null,
    what_days_of_the_week: item.properties?.what_days_of_the_week || [],
    properties: item.properties
  }));
}

async function fetchEnglishClassesData() {
  const result = await englishRequest(`/collections/${ENGLISH_COLLECTIONS.classes}/items`);
  return (result.items || result).map(item => ({
    id: item.id,
    title: item.title || '',
    class_date: item.properties?.class_date || null,
    class_status: item.properties?.class_status || null,
    notes: item.properties?.notes || null,
    needed_resources: item.properties?.needed_resources || null,
    series_id: item.properties?.english_class_series?.relations?.[0]?.blockId || null,
    series_title: item.properties?.english_class_series?.relations?.[0]?.title || null,
    properties: item.properties,
    content: item.content || []
  }));
}

// Get English class series (with days of week configuration)
app.get('/api/english/series', async (req, res) => {
  try {
    const cached = getCachedEnglish('series');
    if (cached) {
      res.json(cached.data);

      if (!cached.fresh && !englishCache.series.refreshing) {
        setRefreshingEnglish('series', true);
        fetchEnglishSeriesData()
          .then(data => {
            setCacheEnglish('series', data);
            console.log('English series cache refreshed in background');
          })
          .catch(err => {
            console.error('English series background refresh failed:', err.message);
            setRefreshingEnglish('series', false);
          });
      }
      return;
    }

    const series = await fetchEnglishSeriesData();
    setCacheEnglish('series', series);
    res.json(series);
  } catch (error) {
    console.error('Failed to fetch English series:', error);
    res.status(500).json({ error: 'Failed to fetch English series', details: error.message });
  }
});

// Add a new English class series
app.post('/api/english/series', async (req, res) => {
  try {
    const { title, startDate, endDate } = req.body;

    if (!title) {
      return res.status(400).json({ error: 'Title is required' });
    }

    const properties = {};
    if (startDate) properties.series_start_date = startDate;
    if (endDate) properties.series_completion_date = endDate;

    const result = await englishRequest(`/collections/${ENGLISH_COLLECTIONS.series}/items`, {
      method: 'POST',
      body: JSON.stringify({ items: [{ title, properties }] })
    });

    invalidateCacheEnglish('series');
    res.json(result);
  } catch (error) {
    console.error('Failed to add English series:', error);
    res.status(500).json({ error: 'Failed to add English series', details: error.message });
  }
});

// Get all English classes
app.get('/api/english/classes', async (req, res) => {
  try {
    const cached = getCachedEnglish('classes');
    if (cached) {
      res.json(cached.data);

      if (!cached.fresh && !englishCache.classes.refreshing) {
        setRefreshingEnglish('classes', true);
        fetchEnglishClassesData()
          .then(data => {
            setCacheEnglish('classes', data);
            console.log('English classes cache refreshed in background');
          })
          .catch(err => {
            console.error('English classes background refresh failed:', err.message);
            setRefreshingEnglish('classes', false);
          });
      }
      return;
    }

    const classes = await fetchEnglishClassesData();
    setCacheEnglish('classes', classes);
    res.json(classes);
  } catch (error) {
    console.error('Failed to fetch English classes:', error);
    res.status(500).json({ error: 'Failed to fetch English classes', details: error.message });
  }
});

// Add a new English class
app.post('/api/english/classes', async (req, res) => {
  try {
    const { title, classDate, seriesId, notes } = req.body;

    if (!title) {
      return res.status(400).json({ error: 'Title is required' });
    }

    const properties = {
      class_status: 'Preparing'
    };
    if (classDate) properties.class_date = classDate;
    if (notes) properties.notes = notes;
    if (seriesId) {
      properties.english_class_series = {
        relations: [{ blockId: seriesId }]
      };
    }

    const result = await englishRequest(`/collections/${ENGLISH_COLLECTIONS.classes}/items`, {
      method: 'POST',
      body: JSON.stringify({ items: [{ title, properties }] })
    });

    invalidateCacheEnglish('classes');
    res.json(result);
  } catch (error) {
    console.error('Failed to add English class:', error);
    res.status(500).json({ error: 'Failed to add English class', details: error.message });
  }
});

// Update an English class
app.put('/api/english/classes/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;

    const craftUpdates = { id, properties: {} };

    // Map fields to properties
    if (updates.class_date !== undefined) craftUpdates.properties.class_date = updates.class_date;
    if (updates.class_status !== undefined) craftUpdates.properties.class_status = updates.class_status;
    if (updates.notes !== undefined) craftUpdates.properties.notes = updates.notes;

    const result = await englishRequest(`/collections/${ENGLISH_COLLECTIONS.classes}/items`, {
      method: 'PUT',
      body: JSON.stringify({ itemsToUpdate: [craftUpdates] })
    });

    invalidateCacheEnglish('classes');
    res.json({ success: true, result });
  } catch (error) {
    console.error('Failed to update English class:', error);
    res.status(500).json({ error: 'Failed to update English class', details: error.message });
  }
});

// Plan classes for the next 30 days
app.post('/api/english/plan-month', async (req, res) => {
  try {
    // 1. Get active series (first one with a start date)
    const seriesResult = await englishRequest(`/collections/${ENGLISH_COLLECTIONS.series}/items`);
    const allSeries = seriesResult.items || seriesResult;
    const activeSeries = allSeries.find(s => s.properties?.series_start_date && s.title);

    if (!activeSeries) {
      return res.status(400).json({ error: 'No active series found' });
    }

    const daysOfWeek = activeSeries.properties?.what_days_of_the_week || ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];

    // 2. Get all classes and sort by class_date
    const classesResult = await englishRequest(`/collections/${ENGLISH_COLLECTIONS.classes}/items`);
    const allClasses = classesResult.items || classesResult;

    // Sort classes by existing class_date or leave unsorted if no dates
    const classes = allClasses.sort((a, b) => {
      const dateA = a.properties?.class_date;
      const dateB = b.properties?.class_date;
      if (!dateA && !dateB) return 0;
      if (!dateA) return 1;
      if (!dateB) return -1;
      return new Date(dateA) - new Date(dateB);
    });

    // 3. Find last completed class (has class_status = 'Complete')
    const completedClasses = classes.filter(c => c.properties?.class_status?.toLowerCase() === 'complete');
    let startIndex = 0;

    if (completedClasses.length > 0) {
      // Find the most recently completed by class_date
      completedClasses.sort((a, b) =>
        new Date(b.properties.class_date) - new Date(a.properties.class_date)
      );
      const lastCompleted = completedClasses[0];
      const lastCompletedIndex = classes.findIndex(c => c.id === lastCompleted.id);
      startIndex = lastCompletedIndex + 1;
    }

    // 4. Generate next 30 calendar days matching days_of_week
    const dayMap = { 'Sunday': 0, 'Monday': 1, 'Tuesday': 2, 'Wednesday': 3, 'Thursday': 4, 'Friday': 5, 'Saturday': 6 };
    const allowedDays = daysOfWeek.map(d => dayMap[d]).filter(d => d !== undefined);

    const scheduleDates = [];
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    let current = new Date(today);

    // Generate up to 30 matching dates (or stop after 90 days)
    const maxDaysToSearch = 90;
    let daysSearched = 0;

    while (scheduleDates.length < 30 && daysSearched < maxDaysToSearch) {
      if (allowedDays.includes(current.getDay())) {
        scheduleDates.push(current.toISOString().split('T')[0]);
      }
      current.setDate(current.getDate() + 1);
      daysSearched++;
    }

    // 5. Assign class_date to classes starting from startIndex
    const updates = [];
    for (let i = 0; i < scheduleDates.length && (startIndex + i) < classes.length; i++) {
      const englishClass = classes[startIndex + i];
      updates.push({
        id: englishClass.id,
        properties: { class_date: scheduleDates[i] }
      });
    }

    // 6. Batch update
    if (updates.length > 0) {
      await englishRequest(`/collections/${ENGLISH_COLLECTIONS.classes}/items`, {
        method: 'PUT',
        body: JSON.stringify({ itemsToUpdate: updates })
      });
    }

    invalidateCacheEnglish('classes');
    res.json({
      success: true,
      scheduled: updates.length,
      activeSeries: activeSeries.title,
      daysOfWeek,
      startFromClass: startIndex < classes.length ? classes[startIndex].title : null
    });
  } catch (error) {
    console.error('Failed to plan month:', error);
    res.status(500).json({ error: 'Failed to plan month', details: error.message });
  }
});

// Cascade reschedule after a class is moved
app.post('/api/english/cascade-reschedule', async (req, res) => {
  try {
    const { fromClassId, newDate } = req.body;

    if (!fromClassId || !newDate) {
      return res.status(400).json({ error: 'fromClassId and newDate are required' });
    }

    // Get active series for days_of_week
    const seriesResult = await englishRequest(`/collections/${ENGLISH_COLLECTIONS.series}/items`);
    const allSeries = seriesResult.items || seriesResult;
    const activeSeries = allSeries.find(s => s.properties?.series_start_date && s.title);
    const daysOfWeek = activeSeries?.properties?.what_days_of_the_week || ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];

    const dayMap = { 'Sunday': 0, 'Monday': 1, 'Tuesday': 2, 'Wednesday': 3, 'Thursday': 4, 'Friday': 5, 'Saturday': 6 };
    const allowedDays = daysOfWeek.map(d => dayMap[d]).filter(d => d !== undefined);

    // Get all classes sorted by class_date
    const classesResult = await englishRequest(`/collections/${ENGLISH_COLLECTIONS.classes}/items`);
    const allClasses = classesResult.items || classesResult;

    const classes = allClasses.sort((a, b) => {
      const dateA = a.properties?.class_date;
      const dateB = b.properties?.class_date;
      if (!dateA && !dateB) return 0;
      if (!dateA) return 1;
      if (!dateB) return -1;
      return new Date(dateA) - new Date(dateB);
    });

    // Find the moved class's index
    const movedIndex = classes.findIndex(c => c.id === fromClassId);
    if (movedIndex === -1) {
      return res.status(404).json({ error: 'Class not found' });
    }

    // Generate dates starting from newDate
    const scheduleDates = [newDate];
    let current = new Date(newDate);
    current.setDate(current.getDate() + 1);

    // Get remaining classes count after the moved one
    const remainingCount = classes.length - movedIndex - 1;

    // Generate enough dates for remaining classes
    let generated = 0;
    const maxDays = 180;
    while (generated < remainingCount && generated < maxDays) {
      if (allowedDays.includes(current.getDay())) {
        scheduleDates.push(current.toISOString().split('T')[0]);
        generated++;
      }
      current.setDate(current.getDate() + 1);
    }

    // Build updates: moved class + all following classes
    const updates = [];
    updates.push({
      id: fromClassId,
      properties: { class_date: newDate }
    });

    for (let i = 1; i < scheduleDates.length && (movedIndex + i) < classes.length; i++) {
      const englishClass = classes[movedIndex + i];
      updates.push({
        id: englishClass.id,
        properties: { class_date: scheduleDates[i] }
      });
    }

    // Batch update
    if (updates.length > 0) {
      await englishRequest(`/collections/${ENGLISH_COLLECTIONS.classes}/items`, {
        method: 'PUT',
        body: JSON.stringify({ itemsToUpdate: updates })
      });
    }

    invalidateCacheEnglish('classes');
    res.json({ success: true, rescheduled: updates.length });
  } catch (error) {
    console.error('Failed to cascade reschedule:', error);
    res.status(500).json({ error: 'Failed to cascade reschedule', details: error.message });
  }
});

// Analyze sermon with Claude (proxy to Claude API)
app.post('/api/analyze-sermon', async (req, res) => {
  try {
    const { title, content, options } = req.body;

    const CLAUDE_API_KEY = process.env.CLAUDE_API_KEY;
    if (!CLAUDE_API_KEY) {
      return res.status(500).json({ error: 'Claude API key not configured' });
    }

    const systemPrompt = `You are a sermon classification assistant for a Christian missionary ministry in Thailand. Your job is to carefully analyze sermon content and accurately categorize it based on its main themes, purpose, and teaching focus.

UNDERSTANDING THE SERIES CATEGORIES:
- "Christianity Explored" - Introductory teachings for seekers/new believers about basic Christian faith
- "How to Preach" - Training materials for preachers on sermon preparation and delivery
- "Preach the Gospel" - Evangelistic messages focused on sharing the gospel
- "Foundational Discipleship" - Core teachings for growing believers (prayer, Bible study, spiritual disciplines)
- "Gospel & Redemption" - Deep theological teachings on salvation, atonement, grace
- "Daily Christian Living" - Practical application of faith in everyday life, work, relationships
- "Special & Seasonal" - Holiday messages (Christmas, Easter, etc.) or special occasion sermons
- "Other" - Only if nothing else fits

UNDERSTANDING THEMES:
- "Faith" - Trusting God, believing His promises, walking by faith
- "Obedience" - Following God's commands, submission to His will
- "Grace" - Unmerited favor, God's love despite our failures
- "Worship" - Praising God, honoring Him, devotion
- "Evangelism" - Sharing faith, witnessing, reaching the lost
- "Discipleship" - Growing in Christ, spiritual maturity, following Jesus
- "Redemption" - Being saved, forgiveness, restoration
- "Character" - Developing godly character traits
- "Work & Purpose" - Vocation, calling, serving God through work
- "Community/Family" - Church life, family relationships, fellowship

CLASSIFICATION GUIDANCE:
1. Read the ENTIRE sermon content carefully before classifying
2. Identify the MAIN point/purpose, not just surface-level keywords
3. Consider: What is the preacher trying to accomplish? What should listeners DO or BELIEVE?
4. For Theme: What is the dominant spiritual concept being taught?
5. For Series: Where would this sermon best fit in a teaching curriculum?
6. For Key Takeaway: Summarize the ONE main thing listeners should remember

PRIMARY TEXT IDENTIFICATION:
- Identify the main Bible passage(s) that the sermon is based on
- List the primary scripture reference(s) in standard format (e.g., "John 3:16" or "Romans 8:28-30")
- If there are multiple main passages, list them separated by commas (e.g., "Matthew 5:1-12, Luke 6:20-26")
- Only include passages that are central to the sermon's message, not every verse mentioned
- If the sermon is topical without a clear primary text, use "Topical" or leave blank

CRITICAL RULES - YOU MUST FOLLOW THESE:
- For Series, Theme, Audience, Season, and Lesson Type: You MUST use EXACTLY one of the provided options - copy/paste the exact text
- NEVER create new values or variations - only use what is listed
- If unsure, pick the closest match from the provided options
- For Theme: ONLY use these exact values: Faith, Obedience, Grace, Worship, Evangelism, Discipleship, Redemption, Character, Work & Purpose, Community/Family`;

    const userPrompt = `Analyze this sermon and classify it accurately.

SERMON TITLE: ${title}

SERMON CONTENT:
${content ? content.substring(0, 8000) : 'No content available - classify based on title only'}

---

VALID OPTIONS (you MUST use exactly one of these for each field):

SERIES OPTIONS: ${options.series.join(' | ')}

THEME OPTIONS: ${options.themes.join(' | ')}

AUDIENCE OPTIONS: ${options.audiences.join(' | ')}

SEASON OPTIONS: ${options.seasons.join(' | ')}

LESSON TYPE OPTIONS: ${options.lessonTypes.join(' | ')}

AVAILABLE HASHTAGS (pick 6 most relevant):
${options.hashtags.join(', ')}

---

First, briefly explain your reasoning for each classification (2-3 sentences total).
Then provide the JSON output.

RESPOND WITH THIS EXACT FORMAT:
REASONING: [Your brief explanation]

JSON:
{"primaryText":"<Bible reference(s)>","series":"<value>","theme":"<value>","audience":"<value>","season":"<value>","lessonType":"<value>","keyTakeaway":"<one compelling sentence>","hashtags":"#topic/a, #topic/b, #topic/c, #topic/d, #topic/e, #topic/f"}`;

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': CLAUDE_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1000,
        system: systemPrompt,
        messages: [{ role: 'user', content: userPrompt }]
      })
    });

    const data = await response.json();

    if (!data.content || !data.content[0]) {
      console.error('Claude API error:', data);
      return res.status(500).json({ error: 'Invalid response from Claude API', details: JSON.stringify(data) });
    }

    const text = data.content[0].text;

    // Extract JSON from response (look for JSON: marker or ```json block)
    let jsonStr = text;
    if (text.includes('JSON:')) {
      jsonStr = text.split('JSON:')[1];
    }
    jsonStr = jsonStr.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();

    // Find the JSON object
    const jsonMatch = jsonStr.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.error('Could not find JSON in response:', text);
      return res.status(500).json({ error: 'Could not parse Claude response' });
    }

    const parsed = JSON.parse(jsonMatch[0]);

    // Debug logging to see what AI returned
    console.log('AI Analysis Response:', JSON.stringify(parsed, null, 2));

    // Note: We don't validate/restrict themes, audiences, etc. because users can add
    // custom options to Craft. The AI suggestions are passed through as-is, and the
    // frontend allows adding new values to Craft's single-select fields.

    res.json(parsed);
  } catch (error) {
    console.error('Analyze sermon error:', error);
    res.status(500).json({ error: 'Failed to analyze sermon', details: error.message });
  }
});

// ============================================
// SERVE FRONTEND (Production)
// ============================================

// Serve static files from the dist directory
app.use(express.static(path.join(__dirname, 'dist')));

// SPA fallback - serve index.html for all non-API routes
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});

// ============================================
// START SERVER
// ============================================

// Pre-warm all caches on startup for instant first load
async function prewarmCache() {
  console.log('Pre-warming cache...');
  const startTime = Date.now();

  try {
    // Fetch all data in parallel
    const results = await Promise.allSettled([
      COLLECTIONS.schedule ? fetchScheduleData().then(data => {
        setCache('schedule', data);
        console.log('  ✓ Schedule cache warmed');
      }) : Promise.resolve(),
      COLLECTIONS.series ? fetchSeriesData().then(data => {
        setCache('series', data);
        console.log('  ✓ Series cache warmed');
      }) : Promise.resolve(),
      DEVOTIONS_API_URL ? fetchDevotionSeriesData().then(data => {
        setCacheDevotions('series', data);
        console.log('  ✓ Devotion series cache warmed');
      }) : Promise.resolve(),
      DEVOTIONS_API_URL ? fetchDevotionLessonsData().then(data => {
        setCacheDevotions('lessons', data);
        console.log('  ✓ Devotion lessons cache warmed');
      }) : Promise.resolve()
    ]);

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    const failed = results.filter(r => r.status === 'rejected').length;
    console.log(`Cache pre-warmed in ${elapsed}s (${failed} failed)`);
  } catch (error) {
    console.error('Cache pre-warming failed:', error.message);
  }
}

async function startServer() {
  // Initialize collections from Craft API
  await initializeCollections();

  // Pre-warm cache before accepting requests (parallel fetch)
  await prewarmCache();

  app.listen(PORT, () => {
    console.log(`
╔════════════════════════════════════════════════════════════╗
║           MULTI-VIEW CALENDAR API SERVER                   ║
╠════════════════════════════════════════════════════════════╣
║  Server running on: http://localhost:${PORT}                  ║
║  Cache: Pre-warmed and ready (5 min TTL)                   ║
║                                                            ║
║  Sermons API: ${CRAFT_API_URL ? 'Connected' : 'Not configured'}
║  Devotions API: ${DEVOTIONS_API_URL ? 'Connected' : 'Not configured'}
║                                                            ║
║  Sermon Endpoints:                                         ║
║    GET  /api/schedule        - Get schedule                ║
║    PUT  /api/schedule/:id    - Update schedule entry       ║
║    POST /api/schedule        - Add schedule entry          ║
║    DELETE /api/schedule/:id  - Delete schedule entry       ║
║    POST /api/schedule/batch-update - Batch update dates    ║
║                                                            ║
║  Devotions Endpoints:                                      ║
║    GET  /api/devotions/series   - Get devotion series      ║
║    GET  /api/devotions/lessons  - Get all lessons          ║
║    PUT  /api/devotions/lessons/:id - Update lesson         ║
║    POST /api/devotions/plan-month - Schedule 30 days       ║
║    POST /api/devotions/cascade-reschedule - Reschedule     ║
╚════════════════════════════════════════════════════════════╝
    `);
  });
}

startServer();

export default app;
