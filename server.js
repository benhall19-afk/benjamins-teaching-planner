/**
 * Sermon Manager Backend Server
 *
 * This server connects to the Craft Multi-Document API to manage
 * sermons, schedules, and related content.
 */

import express from 'express';
import cors from 'cors';
import { config } from 'dotenv';

// Load environment variables
config();

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
// IN-MEMORY CACHE (loaded from Craft on startup)
// ============================================

let sermonsCache = [];
let scheduleCache = [];
let hashtagsCache = [];

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
 * Get collection items from Craft
 */
async function getCollectionItems(collectionId) {
  return await craftRequest(`/collections/${collectionId}/items`);
}

/**
 * Update collection items in Craft
 */
async function updateCollectionItems(collectionId, items) {
  return await craftRequest(`/collections/${collectionId}/items`, {
    method: 'PUT',
    body: JSON.stringify({ itemsToUpdate: items })
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

// Get schedule (Bible Teaching Overview)
app.get('/api/schedule', async (req, res) => {
  try {
    if (!COLLECTIONS.schedule) {
      return res.status(503).json({ error: 'Schedule collection not found. Check API connection.' });
    }
    const result = await getCollectionItems(COLLECTIONS.schedule);
    const rawSchedule = result.items || result;

    // Flatten properties into top-level fields for frontend compatibility
    const schedule = rawSchedule.map(item => ({
      id: item.id,
      sermon_name: item.sermon_name || item.title || '',
      lesson_type: item.properties?.lesson_type || '',
      preacher: item.properties?.preacher || '',
      sermon_date: item.properties?.sermon_date || '',
      special_event: item.properties?.special_event || '',
      status: item.properties?.status || '',
      notes: item.properties?.notes || '',
      // New merged fields from Sermons collection
      content: item.properties?.content || '',
      content_type: item.properties?.content_type || '',
      sermon_information_added: item.properties?.sermon_information_added || false,
      series: item.properties?.series || '',
      sermon_themefocus: item.properties?.sermon_themefocus || '',
      audience: item.properties?.audience || '',
      seasonholiday: item.properties?.seasonholiday || '',
      key_takeaway: item.properties?.key_takeaway || '',
      hashtags: item.properties?.hashtags || '',
      properties: item.properties // Keep original for reference
    }));

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

// Get sermon series (from relationship database)
app.get('/api/series', async (req, res) => {
  try {
    if (!COLLECTIONS.series) {
      return res.status(503).json({ error: 'Series collection not found. Check API connection.' });
    }
    const result = await getCollectionItems(COLLECTIONS.series);
    const rawSeries = result.items || result;

    // Extract just the titles for the dropdown
    const series = rawSeries.map(item => ({
      id: item.id,
      title: item.title || ''
    }));

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
    const { title } = req.body;

    if (!title) {
      return res.status(400).json({ error: 'Title is required' });
    }

    const result = await craftRequest(`/collections/${COLLECTIONS.series}/items`, {
      method: 'POST',
      body: JSON.stringify({ items: [{ title, properties: {} }] })
    });

    res.json({ success: true, result });
  } catch (error) {
    res.status(500).json({ error: 'Failed to add series', details: error.message });
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
    if (updates.special_event) craftUpdates.properties.special_event = updates.special_event;
    if (updates.status) craftUpdates.properties.status = updates.status;
    if (updates.notes) craftUpdates.properties.notes = updates.notes;
    if (updates.series) craftUpdates.properties.series = updates.series;

    // New merged fields from Sermons collection
    if (updates.content !== undefined) craftUpdates.properties.content = updates.content;
    if (updates.content_type) craftUpdates.properties.content_type = updates.content_type;
    if (updates.sermon_information_added !== undefined) {
      craftUpdates.properties.sermon_information_added = updates.sermon_information_added;
    }
    if (updates.sermon_themefocus) craftUpdates.properties.sermon_themefocus = updates.sermon_themefocus;
    if (updates.audience) craftUpdates.properties.audience = updates.audience;
    if (updates.seasonholiday) craftUpdates.properties.seasonholiday = updates.seasonholiday;
    if (updates.key_takeaway) craftUpdates.properties.key_takeaway = updates.key_takeaway;
    if (updates.hashtags) craftUpdates.properties.hashtags = updates.hashtags;

    const result = await updateCollectionItems(COLLECTIONS.schedule, [craftUpdates]);

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
      status: entry.status || 'idea'
    };

    // Only add optional fields if they have values (Craft doesn't accept null)
    if (entry.special_event) properties.special_event = entry.special_event;
    if (entry.series) properties.series = entry.series;
    if (entry.notes) properties.notes = entry.notes;

    // New merged fields from Sermons collection
    if (entry.content) properties.content = entry.content;
    if (entry.content_type) properties.content_type = entry.content_type;
    if (entry.sermon_information_added !== undefined) {
      properties.sermon_information_added = entry.sermon_information_added;
    }
    if (entry.sermon_themefocus) properties.sermon_themefocus = entry.sermon_themefocus;
    if (entry.audience) properties.audience = entry.audience;
    if (entry.seasonholiday) properties.seasonholiday = entry.seasonholiday;
    if (entry.key_takeaway) properties.key_takeaway = entry.key_takeaway;
    if (entry.hashtags) properties.hashtags = entry.hashtags;

    const craftEntry = {
      sermon_name: entry.sermon_name || '',
      properties
    };

    const result = await addCollectionItems(COLLECTIONS.schedule, [craftEntry]);

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

// Analyze sermon with Claude (proxy to Claude API)
app.post('/api/analyze-sermon', async (req, res) => {
  try {
    const { title, content, options } = req.body;
    
    const CLAUDE_API_KEY = process.env.CLAUDE_API_KEY;
    if (!CLAUDE_API_KEY) {
      return res.status(500).json({ error: 'Claude API key not configured' });
    }
    
    const prompt = `Analyze this sermon and recommend classification values.

CRITICAL: You MUST use EXACTLY one of the provided options for each field. Do not create new values.

SERMON TITLE: ${title}
SERMON CONTENT: ${content}

VALID OPTIONS (use ONLY these exact values):
- Series (pick ONE): ${options.series.join(' | ')}
- Theme (pick ONE): ${options.themes.join(' | ')}
- Audience (pick ONE): ${options.audiences.join(' | ')}
- Season (pick ONE): ${options.seasons.join(' | ')}
- Lesson Type (pick ONE): ${options.lessonTypes.join(' | ')}

AVAILABLE HASHTAGS: ${options.hashtags.join(', ')}

Return ONLY valid JSON with this exact structure:
{"series":"<exact value from Series options>","theme":"<exact value from Theme options>","audience":"<exact value from Audience options>","season":"<exact value from Season options>","lessonType":"<exact value from Lesson Type options>","keyTakeaway":"<one sentence summary>","hashtags":"#topic/x, #topic/y"}`;

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': CLAUDE_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 500,
        messages: [{ role: 'user', content: prompt }]
      })
    });
    
    const data = await response.json();
    const text = data.content[0].text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    const parsed = JSON.parse(text);
    
    res.json(parsed);
  } catch (error) {
    res.status(500).json({ error: 'Failed to analyze sermon', details: error.message });
  }
});

// ============================================
// START SERVER
// ============================================

async function startServer() {
  // Initialize collections from Craft API
  await initializeCollections();

  app.listen(PORT, () => {
    console.log(`
╔════════════════════════════════════════════════════════════╗
║           SERMON MANAGER API SERVER                        ║
╠════════════════════════════════════════════════════════════╣
║  Server running on: http://localhost:${PORT}                  ║
║                                                            ║
║  Craft API: ${CRAFT_API_URL ? 'Connected' : 'Not configured'}
║                                                            ║
║  Endpoints:                                                ║
║    GET  /api/health          - Health check                ║
║    GET  /api/collections     - List all collections        ║
║    GET  /api/sermons         - Get all sermons             ║
║    GET  /api/schedule        - Get schedule                ║
║    GET  /api/hashtags        - Get hashtags                ║
║    PUT  /api/sermons/:id     - Update sermon               ║
║    PUT  /api/schedule/:id    - Update schedule entry       ║
║    POST /api/schedule        - Add schedule entry          ║
║    DELETE /api/schedule/:id  - Delete schedule entry       ║
║    POST /api/schedule/batch-update - Batch update dates    ║
║    POST /api/analyze-sermon  - AI sermon analysis          ║
╚════════════════════════════════════════════════════════════╝
    `);
  });
}

startServer();

export default app;
