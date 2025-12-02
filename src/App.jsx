import React, { useState, useEffect, useMemo, useCallback } from 'react';
import Markdown from 'react-markdown';
import * as api from './api';
import {
  SERIES_OPTIONS, THEME_OPTIONS, AUDIENCE_OPTIONS, SEASON_OPTIONS,
  LESSON_TYPE_OPTIONS, PREACHERS, SPECIAL_EVENTS,
  MONTH_NAMES, DAY_NAMES, getAllHashtags
} from './constants';

// ============================================
// TOAST NOTIFICATIONS
// ============================================

function Toast({ message, type, onClose }) {
  useEffect(() => {
    const timer = setTimeout(onClose, 4000);
    return () => clearTimeout(timer);
  }, [onClose]);

  const bgColor = type === 'success' ? 'bg-sage' : type === 'error' ? 'bg-burgundy' : 'bg-gold';

  return (
    <div className={`toast fixed bottom-4 right-4 ${bgColor} text-white px-4 py-3 rounded-lg shadow-lg z-50 flex items-center gap-2`}>
      <span>{type === 'success' ? '✓' : type === 'error' ? '✕' : 'ℹ'}</span>
      <span>{message}</span>
      <button onClick={onClose} className="ml-2 hover:opacity-70">×</button>
    </div>
  );
}

// ============================================
// SELECT WITH ADD NEW OPTION
// ============================================

function SelectWithAdd({ value, onChange, options, customOptions, onAddCustom, label }) {
  const [isAdding, setIsAdding] = useState(false);
  const [newValue, setNewValue] = useState('');

  const allOptions = [...options, ...customOptions];

  const handleAddNew = () => {
    if (newValue.trim()) {
      onAddCustom(newValue.trim());
      onChange(newValue.trim());
      setNewValue('');
      setIsAdding(false);
    }
  };

  if (isAdding) {
    return (
      <div className="flex flex-col sm:flex-row gap-2">
        <input
          type="text"
          value={newValue}
          onChange={(e) => setNewValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') handleAddNew();
            if (e.key === 'Escape') { setIsAdding(false); setNewValue(''); }
          }}
          placeholder={`New ${label}...`}
          className="flex-1 px-3 py-2.5 sm:py-2 border border-gold/30 rounded-lg text-sm bg-white focus:border-gold outline-none"
          autoFocus
        />
        <div className="flex gap-2">
          <button
            onClick={handleAddNew}
            className="flex-1 sm:flex-none px-3 py-2.5 sm:py-2 bg-sage text-white rounded-lg text-sm hover:bg-sage/90"
          >
            Add
          </button>
          <button
            onClick={() => { setIsAdding(false); setNewValue(''); }}
            className="flex-1 sm:flex-none px-3 py-2.5 sm:py-2 bg-gray-200 text-ink rounded-lg text-sm hover:bg-gray-300"
          >
            Cancel
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex gap-2">
      <select
        value={value || ''}
        onChange={(e) => {
          if (e.target.value === '__add_new__') {
            setIsAdding(true);
          } else {
            onChange(e.target.value);
          }
        }}
        className="flex-1 px-3 py-2.5 sm:py-2 border border-gold/30 rounded-lg text-sm bg-white focus:border-gold outline-none"
      >
        <option value="">Select...</option>
        {allOptions.map(opt => (
          <option key={opt} value={opt}>{opt}</option>
        ))}
        <option value="__add_new__">+ Add new...</option>
      </select>
    </div>
  );
}

// ============================================
// SERIES TIMELINE COMPONENT
// ============================================

function SeriesTimeline({ series, schedule, currentDate, onSeriesClick, onSeriesUpdate, onNavigateMonth, onAddSeries }) {
  const [selectedSeries, setSelectedSeries] = useState(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [dragging, setDragging] = useState(null);

  // Generate 12 months centered on current month
  const months = useMemo(() => {
    const result = [];
    const centerDate = new Date(currentDate);
    // Start 5 months before current month
    centerDate.setMonth(centerDate.getMonth() - 5);

    for (let i = 0; i < 12; i++) {
      const d = new Date(centerDate);
      d.setMonth(d.getMonth() + i);
      result.push({
        year: d.getFullYear(),
        month: d.getMonth(),
        label: MONTH_NAMES[d.getMonth()].substring(0, 3),
        fullLabel: `${MONTH_NAMES[d.getMonth()]} ${d.getFullYear()}`,
        isCurrent: d.getMonth() === currentDate.getMonth() && d.getFullYear() === currentDate.getFullYear()
      });
    }
    return result;
  }, [currentDate]);

  // Filter series with dates only
  const seriesWithDates = useMemo(() => {
    return series.filter(s => s.startDate && s.endDate);
  }, [series]);

  const seriesWithoutDates = useMemo(() => {
    return series.filter(s => !s.startDate || !s.endDate);
  }, [series]);

  // Count sermons per series
  const sermonCountBySeries = useMemo(() => {
    return schedule.reduce((acc, entry) => {
      if (entry.sermon_series_id) {
        if (!acc[entry.sermon_series_id]) {
          acc[entry.sermon_series_id] = { total: 0, complete: 0, sermons: [] };
        }
        acc[entry.sermon_series_id].total++;
        acc[entry.sermon_series_id].sermons.push(entry);
        if (entry.status === 'Complete' || entry.status === 'Ready to Preach') {
          acc[entry.sermon_series_id].complete++;
        }
      }
      return acc;
    }, {});
  }, [schedule]);

  // Count Sundays in date range
  const getSundaysInRange = (startStr, endStr) => {
    if (!startStr || !endStr) return 0;
    const start = new Date(startStr);
    const end = new Date(endStr);
    let count = 0;
    const current = new Date(start);
    while (current <= end) {
      if (current.getDay() === 0) count++;
      current.setDate(current.getDate() + 1);
    }
    return count;
  };

  // Calculate position for a date within the timeline
  const getPositionForDate = (dateStr) => {
    if (!dateStr) return null;
    const date = new Date(dateStr);
    const startMonth = months[0];
    const startDate = new Date(startMonth.year, startMonth.month, 1);
    const endMonth = months[months.length - 1];
    const endDate = new Date(endMonth.year, endMonth.month + 1, 0);

    const totalDays = (endDate - startDate) / (1000 * 60 * 60 * 24);
    const dayPosition = (date - startDate) / (1000 * 60 * 60 * 24);

    return Math.max(0, Math.min(100, (dayPosition / totalDays) * 100));
  };

  // Format date for display
  const formatDate = (dateStr) => {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  // Close popover when clicking outside
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (selectedSeries && !e.target.closest('.series-popover') && !e.target.closest('.series-bar')) {
        setSelectedSeries(null);
      }
    };
    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, [selectedSeries]);

  if (seriesWithDates.length === 0 && seriesWithoutDates.length === 0) {
    return null;
  }

  return (
    <div className="bg-white rounded-xl shadow-md border border-gold/20 p-3 sm:p-4 mb-4 relative">
      {/* Header with + button */}
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-ink/70">Series Timeline</h3>
        <button
          onClick={() => setShowAddModal(true)}
          className="w-7 h-7 rounded-full bg-gold/20 hover:bg-gold/40 text-gold flex items-center justify-center transition-colors text-lg"
          title="Add series to timeline"
        >
          +
        </button>
      </div>

      {/* Month headers */}
      <div className="flex border-b border-gold/20 pb-2 mb-3">
        {months.map((m, i) => (
          <div
            key={`${m.year}-${m.month}`}
            className={`flex-1 text-center text-xs cursor-pointer hover:text-gold transition-colors ${
              m.isCurrent ? 'font-bold text-gold' : 'text-ink/60'
            }`}
            onClick={() => onNavigateMonth(new Date(m.year, m.month, 1))}
            title={m.fullLabel}
          >
            {m.label}
          </div>
        ))}
      </div>

      {/* Series bars */}
      <div className="relative min-h-16 space-y-2">
        {seriesWithDates.map(s => {
          const startPos = getPositionForDate(s.startDate);
          const endPos = getPositionForDate(s.endDate);
          const counts = sermonCountBySeries[s.id] || { total: 0, complete: 0, sermons: [] };
          const totalSundays = getSundaysInRange(s.startDate, s.endDate);

          if (startPos === null || endPos === null || startPos >= 100 || endPos <= 0) {
            return null;
          }

          const width = Math.max(5, endPos - startPos);
          const left = Math.max(0, startPos);

          return (
            <div
              key={s.id}
              className="series-bar relative h-7 cursor-pointer group"
              style={{
                marginLeft: `${left}%`,
                width: `${Math.min(width, 100 - left)}%`
              }}
              onClick={(e) => {
                e.stopPropagation();
                setSelectedSeries(selectedSeries?.id === s.id ? null : s);
              }}
            >
              <div
                className={`absolute inset-0 rounded-full px-2 py-1 text-white text-xs flex items-center justify-between overflow-hidden transition-all ${
                  selectedSeries?.id === s.id ? 'bg-burgundy ring-2 ring-gold' : 'bg-burgundy/80 hover:bg-burgundy'
                }`}
              >
                <span className="truncate font-medium">{s.title}</span>
                <span className="text-white/80 whitespace-nowrap ml-1">
                  ({counts.total}/{totalSundays})
                </span>
              </div>
            </div>
          );
        })}

        {seriesWithDates.length === 0 && (
          <div className="text-center text-ink/40 text-sm py-4">
            No series with dates. Click + to add one.
          </div>
        )}
      </div>

      {/* Series Popover */}
      {selectedSeries && (
        <div
          className="series-popover absolute z-50 bg-white rounded-lg shadow-xl border border-gold/30 p-4 w-72"
          style={{
            left: '50%',
            transform: 'translateX(-50%)',
            top: '100%',
            marginTop: '8px'
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="font-semibold text-ink mb-1">{selectedSeries.title}</div>
          <div className="text-xs text-ink/60 mb-3">
            {formatDate(selectedSeries.startDate)} → {formatDate(selectedSeries.endDate)}
          </div>

          {/* Progress */}
          {(() => {
            const counts = sermonCountBySeries[selectedSeries.id] || { total: 0, complete: 0, sermons: [] };
            const totalSundays = getSundaysInRange(selectedSeries.startDate, selectedSeries.endDate);
            const progress = totalSundays > 0 ? Math.round((counts.total / totalSundays) * 100) : 0;

            return (
              <>
                <div className="text-sm text-ink/80 mb-2">
                  {counts.total} of {totalSundays} Sundays planned
                </div>
                <div className="h-2 bg-sage/30 rounded-full overflow-hidden mb-3">
                  <div
                    className="h-full bg-sage transition-all"
                    style={{ width: `${progress}%` }}
                  />
                </div>

                {/* Sermon list */}
                {counts.sermons.length > 0 && (
                  <div className="max-h-32 overflow-y-auto space-y-1 mb-3">
                    {counts.sermons.slice(0, 5).map(sermon => (
                      <div key={sermon.id} className="text-xs flex items-center gap-2">
                        <span className={`w-4 ${
                          sermon.status === 'Complete' || sermon.status === 'Ready to Preach'
                            ? 'text-sage'
                            : 'text-ink/40'
                        }`}>
                          {sermon.status === 'Complete' || sermon.status === 'Ready to Preach' ? '✓' : '○'}
                        </span>
                        <span className="truncate text-ink/70">{sermon.sermon_name}</span>
                      </div>
                    ))}
                    {counts.sermons.length > 5 && (
                      <div className="text-xs text-ink/40 pl-6">
                        +{counts.sermons.length - 5} more...
                      </div>
                    )}
                  </div>
                )}
              </>
            );
          })()}

          <button
            onClick={() => {
              onSeriesClick(selectedSeries);
              setSelectedSeries(null);
            }}
            className="w-full py-2 bg-gold/20 hover:bg-gold/30 text-gold rounded-lg text-sm font-medium transition-colors"
          >
            View in Calendar
          </button>
        </div>
      )}

      {/* Add Series Modal */}
      {showAddModal && (
        <AddSeriesModal
          seriesWithoutDates={seriesWithoutDates}
          onClose={() => setShowAddModal(false)}
          onAddDates={async (seriesId, startDate, endDate) => {
            await onSeriesUpdate(seriesId, { startDate, endDate });
            setShowAddModal(false);
          }}
          onCreateSeries={async (title, startDate, endDate) => {
            await onAddSeries(title, startDate, endDate);
            setShowAddModal(false);
          }}
        />
      )}

    </div>
  );
}

// ============================================
// ADD SERIES MODAL
// ============================================

function AddSeriesModal({ seriesWithoutDates, onClose, onAddDates, onCreateSeries }) {
  const [mode, setMode] = useState('existing'); // 'existing' or 'new'
  const [selectedSeriesId, setSelectedSeriesId] = useState('');
  const [newTitle, setNewTitle] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [saving, setSaving] = useState(false);

  const handleSubmit = async () => {
    if (mode === 'existing' && selectedSeriesId && startDate && endDate) {
      setSaving(true);
      await onAddDates(selectedSeriesId, startDate, endDate);
      setSaving(false);
    } else if (mode === 'new' && newTitle && startDate && endDate) {
      setSaving(true);
      await onCreateSeries(newTitle, startDate, endDate);
      setSaving(false);
    }
  };

  const canSubmit = mode === 'existing'
    ? (selectedSeriesId && startDate && endDate)
    : (newTitle && startDate && endDate);

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl max-w-md w-full p-6">
        <h3 className="text-lg font-semibold text-ink mb-4">Add Series to Timeline</h3>

        {/* Mode tabs */}
        <div className="flex bg-parchment rounded-lg p-1 mb-4">
          <button
            onClick={() => setMode('existing')}
            className={`flex-1 py-2 rounded-md text-sm font-medium transition-all ${
              mode === 'existing' ? 'bg-white shadow text-burgundy' : 'text-ink/60'
            }`}
          >
            Existing Series
          </button>
          <button
            onClick={() => setMode('new')}
            className={`flex-1 py-2 rounded-md text-sm font-medium transition-all ${
              mode === 'new' ? 'bg-white shadow text-burgundy' : 'text-ink/60'
            }`}
          >
            Create New
          </button>
        </div>

        {/* Existing series selection */}
        {mode === 'existing' && (
          <div className="mb-4">
            <label className="block text-sm font-medium text-ink/70 mb-1">Series without dates</label>
            {seriesWithoutDates.length > 0 ? (
              <select
                value={selectedSeriesId}
                onChange={(e) => setSelectedSeriesId(e.target.value)}
                className="w-full px-3 py-2 border border-gold/30 rounded-lg text-sm bg-white focus:border-gold outline-none"
              >
                <option value="">Select a series...</option>
                {seriesWithoutDates.map(s => (
                  <option key={s.id} value={s.id}>{s.title}</option>
                ))}
              </select>
            ) : (
              <p className="text-sm text-ink/50 italic">All series have dates set</p>
            )}
          </div>
        )}

        {/* New series title */}
        {mode === 'new' && (
          <div className="mb-4">
            <label className="block text-sm font-medium text-ink/70 mb-1">Series Title</label>
            <input
              type="text"
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              className="w-full px-3 py-2 border border-gold/30 rounded-lg text-sm bg-white focus:border-gold outline-none"
              placeholder="Enter series title..."
            />
          </div>
        )}

        {/* Date inputs */}
        <div className="grid grid-cols-2 gap-3 mb-6">
          <div>
            <label className="block text-sm font-medium text-ink/70 mb-1">Start Date</label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="w-full px-3 py-2 border border-gold/30 rounded-lg text-sm bg-white focus:border-gold outline-none"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-ink/70 mb-1">End Date</label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="w-full px-3 py-2 border border-gold/30 rounded-lg text-sm bg-white focus:border-gold outline-none"
            />
          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 py-2.5 bg-gray-200 text-ink rounded-lg font-medium hover:bg-gray-300 transition-all"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={!canSubmit || saving}
            className="flex-1 py-2.5 bg-burgundy text-white rounded-lg font-medium hover:bg-burgundy/90 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saving ? 'Saving...' : 'Add to Timeline'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ============================================
// MAIN APP COMPONENT
// ============================================

export default function App() {
  // Data state - unified: schedule now contains all entries (including migrated sermons)
  const [schedule, setSchedule] = useState([]);
  const [seriesOptions, setSeriesOptions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Unscheduled sermons sidebar
  const [showUnscheduled, setShowUnscheduled] = useState(false);
  
  // UI state
  const [activeTab, setActiveTab] = useState('calendar');
  const [toast, setToast] = useState(null);
  
  // Calendar state
  const [currentDate, setCurrentDate] = useState(new Date());
  const [hidePrepared, setHidePrepared] = useState(false);
  const [lessonTypeFilter, setLessonTypeFilter] = useState('all');
  const [editingEntry, setEditingEntry] = useState(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [addDate, setAddDate] = useState(null);
  const [showShiftModal, setShowShiftModal] = useState(false);
  const [draggedEvent, setDraggedEvent] = useState(null);

  // Review state
  const [currentSermonIndex, setCurrentSermonIndex] = useState(0);
  const [recommendations, setRecommendations] = useState(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [editedRecommendations, setEditedRecommendations] = useState({});
  const [isSaving, setIsSaving] = useState(false);

  // Custom options (user-added values)
  const [customOptions, setCustomOptions] = useState({
    series: [],
    theme: [],
    audience: [],
    season: [],
    lessonType: []
  });

  // ============================================
  // DATA LOADING
  // ============================================

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    setLoading(true);
    setError(null);
    try {
      // Schedule now contains all entries (including migrated sermons with content)
      const [scheduleData, seriesData] = await Promise.all([
        api.fetchSchedule().catch((e) => { console.error('Failed to fetch schedule:', e); return []; }),
        api.fetchSeries().catch((e) => { console.error('Failed to fetch series:', e); return []; })
      ]);

      console.log('Loaded data - Schedule:', scheduleData.length, 'items, Series:', seriesData.length, 'items');
      console.log('Series data sample:', seriesData.slice(0, 3));

      setSchedule(scheduleData);
      // Keep full series objects (id + title) for relation handling
      const filteredSeries = seriesData.filter(s => s && s.title);
      console.log('Filtered series:', filteredSeries.length, 'items');
      setSeriesOptions(filteredSeries);
    } catch (err) {
      console.error('loadData error:', err);
      setError('Failed to load data. Using offline mode.');
      showToast('Could not connect to server. Running in demo mode.', 'error');
    }
    setLoading(false);
  }

  // ============================================
  // HELPERS
  // ============================================

  const showToast = (message, type = 'info') => {
    setToast({ message, type });
  };

  // Filter schedule entries that need review:
  // - Only "Complete", "Ready to Preach", or "archive" status
  // - Benjamin only
  // - sermon_information_added is false/undefined
  const sermonsNeedingInfo = useMemo(() => {
    console.log('sermonsNeedingInfo filter - schedule length:', schedule.length);
    const validStatuses = ['Complete', 'Ready to Preach', 'archive'];
    const result = schedule.filter(s => {
      const status = s.status || s.properties?.status;
      // Only include sermons with specific statuses
      if (!validStatuses.includes(status)) return false;
      // Only show Benjamin's sermons for review
      const preacher = s.preacher || s.properties?.preacher;
      if (preacher !== 'Benjamin') return false;
      // Use nullish coalescing (??) instead of || to properly handle false values
      const infoAdded = s.sermon_information_added ?? s.properties?.sermon_information_added;
      // Show in review if NOT explicitly true (handles false, undefined, null, 'false')
      return infoAdded !== true && infoAdded !== 'true';
    });
    console.log('sermonsNeedingInfo result:', result.length, 'items');
    if (result.length === 0 && schedule.length > 0) {
      // Debug: show first few Benjamin items
      const benjaminItems = schedule.filter(s => s.preacher === 'Benjamin').slice(0, 3);
      console.log('Benjamin items sample:', benjaminItems.map(s => ({
        name: s.sermon_name,
        status: s.status,
        preacher: s.preacher,
        sermon_information_added: s.sermon_information_added
      })));
    }
    return result;
  }, [schedule]);

  const currentSermon = sermonsNeedingInfo[currentSermonIndex];

  // Keep index in bounds when list shrinks (after completing sermons)
  useEffect(() => {
    if (sermonsNeedingInfo.length > 0 && currentSermonIndex >= sermonsNeedingInfo.length) {
      setCurrentSermonIndex(sermonsNeedingInfo.length - 1);
    }
  }, [sermonsNeedingInfo.length, currentSermonIndex]);

  // Initialize editedRecommendations with existing sermon data when sermon changes
  useEffect(() => {
    if (currentSermon) {
      setEditedRecommendations({
        sermonDate: currentSermon.sermon_date || currentSermon.properties?.sermon_date || '',
        notes: currentSermon.notes || currentSermon.properties?.notes || '',
        rating: currentSermon.rating || currentSermon.properties?.rating || 0,
        primaryText: currentSermon.primary_text || currentSermon.properties?.primary_text || '',
        series: currentSermon.series || currentSermon.properties?.sermon_series?.relations?.[0]?.title || '',
        theme: currentSermon.sermon_themefocus || currentSermon.properties?.sermon_themefocus || '',
        audience: currentSermon.audience || currentSermon.properties?.audience || '',
        season: currentSermon.seasonholiday || currentSermon.properties?.seasonholiday || '',
        lessonType: currentSermon.lesson_type || currentSermon.properties?.lesson_type || '',
        keyTakeaway: currentSermon.key_takeaway || currentSermon.properties?.key_takeaway || '',
        hashtags: currentSermon.hashtags || currentSermon.properties?.hashtags || ''
      });
      setRecommendations(null); // Clear AI recommendations when sermon changes
    }
  }, [currentSermon?.id]);

  // Filter unscheduled sermons (no date set, exclude archived)
  const unscheduledSermons = useMemo(() => {
    return schedule.filter(s => {
      const status = s.status || s.properties?.status;
      if (status === 'archive') return false;
      const date = s.sermon_date || s.properties?.sermon_date;
      return !date || date === '';
    });
  }, [schedule]);

  // Categorize unscheduled by readiness
  const readyToSchedule = useMemo(() => {
    return unscheduledSermons.filter(s => {
      const status = s.status || s.properties?.status;
      return status === 'Complete' || status === 'Ready to Preach' || status === 'in progress';
    });
  }, [unscheduledSermons]);

  const needsPreparation = useMemo(() => {
    return unscheduledSermons.filter(s => {
      const status = s.status || s.properties?.status;
      return status !== 'Complete' && status !== 'Ready to Preach' && status !== 'in progress';
    });
  }, [unscheduledSermons]);

  const getDaysInMonth = (date) => {
    const year = date.getFullYear();
    const month = date.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    return { 
      daysInMonth: lastDay.getDate(), 
      startingDay: firstDay.getDay(), 
      year, 
      month 
    };
  };

  const formatDateString = (year, month, day) => {
    return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  };

  const getEventsForDate = (dateStr) => {
    return schedule.filter(item => {
      if (!item.sermon_date && !item.properties?.sermon_date) return false;
      const itemDate = item.sermon_date || item.properties?.sermon_date;
      if (itemDate !== dateStr) return false;

      const lessonType = item.lesson_type || item.properties?.lesson_type;
      if (lessonTypeFilter !== 'all' && lessonType !== lessonTypeFilter) return false;

      return true;
    });
  };

  const isPreparedSermon = (event) => {
    const status = event.status || event.properties?.status;
    return status === 'Complete' || status === 'Ready to Preach';
  };

  const getLessonTypeColor = (lessonType) => {
    switch (lessonType) {
      case 'Sermon':
      case 'Sermon AM':
        return 'bg-blue-100 border-blue-400 text-blue-800 hover:bg-blue-200';
      case 'Sermon PM':
      case 'Devotional':
        return 'bg-amber-100 border-amber-400 text-amber-800 hover:bg-amber-200';
      case 'Bible Lesson':
      case 'Short English Bible Lesson':
      case 'Afternoon Study':
        return 'bg-green-100 border-green-400 text-green-800 hover:bg-green-200';
      case 'Young Children\'s Bible Lesson':
        return 'bg-purple-100 border-purple-400 text-purple-800 hover:bg-purple-200';
      case 'Video Lesson':
        return 'bg-pink-100 border-pink-400 text-pink-800 hover:bg-pink-200';
      default:
        return 'bg-gray-100 border-gray-400 text-gray-800 hover:bg-gray-200';
    }
  };

  // ============================================
  // CALENDAR ACTIONS
  // ============================================

  const navigateMonth = (direction) => {
    setCurrentDate(prev => {
      const newDate = new Date(prev);
      newDate.setMonth(newDate.getMonth() + direction);
      return newDate;
    });
  };

  const handleSaveEntry = async (entry) => {
    setIsSaving(true);
    try {
      // Look up sermon_series_id from series title if needed
      const seriesTitle = entry.series || entry.properties?.series;
      const seriesObj = seriesOptions.find(s => s.title === seriesTitle);
      const sermonSeriesId = entry.sermon_series_id || seriesObj?.id || null;

      await api.updateScheduleEntry(entry.id, {
        sermon_name: entry.sermon_name,
        lesson_type: entry.lesson_type || entry.properties?.lesson_type,
        preacher: entry.preacher || entry.properties?.preacher,
        sermon_date: entry.sermon_date || entry.properties?.sermon_date,
        special_event: entry.special_event || entry.properties?.special_event,
        status: entry.status || entry.properties?.status,
        sermon_series_id: sermonSeriesId,
        primary_text: entry.primary_text || entry.properties?.primary_text
      });

      // Update local state
      setSchedule(prev => prev.map(s => s.id === entry.id ? entry : s));
      setEditingEntry(null);
      showToast('Entry saved successfully!', 'success');
    } catch (err) {
      showToast('Failed to save: ' + err.message, 'error');
    }
    setIsSaving(false);
  };

  const handleAddEntry = async (entry) => {
    setIsSaving(true);
    try {
      const result = await api.addScheduleEntry(entry);
      
      // Add to local state with temp ID
      const newEntry = { 
        ...entry, 
        id: result.result?.id || `temp_${Date.now()}`,
        properties: entry 
      };
      setSchedule(prev => [...prev, newEntry]);
      setShowAddModal(false);
      showToast('Entry added successfully!', 'success');
    } catch (err) {
      showToast('Failed to add: ' + err.message, 'error');
    }
    setIsSaving(false);
  };

  const handleDeleteEntry = async (id) => {
    if (!confirm('Are you sure you want to delete this entry?')) return;

    setIsSaving(true);
    try {
      await api.deleteScheduleEntry(id);
      setSchedule(prev => prev.filter(s => s.id !== id));
      setEditingEntry(null);
      showToast('Entry deleted!', 'success');
    } catch (err) {
      showToast('Failed to delete: ' + err.message, 'error');
    }
    setIsSaving(false);
  };

  const handleDrop = async (newDate) => {
    if (!draggedEvent) return;

    const oldDate = draggedEvent.sermon_date;
    if (oldDate === newDate) {
      setDraggedEvent(null);
      return;
    }

    // Optimistically update UI
    const updatedEvent = { ...draggedEvent, sermon_date: newDate };
    setSchedule(prev => prev.map(s => s.id === draggedEvent.id ? updatedEvent : s));
    setDraggedEvent(null);

    try {
      await api.updateScheduleEntry(draggedEvent.id, {
        ...draggedEvent,
        sermon_date: newDate
      });
      showToast('Date updated!', 'success');
    } catch (err) {
      // Revert on error
      setSchedule(prev => prev.map(s => s.id === draggedEvent.id ? draggedEvent : s));
      showToast('Failed to update date: ' + err.message, 'error');
    }
  };

  const handleShift = async (fromDate, weeks, scope) => {
    const shiftMs = weeks * 7 * 24 * 60 * 60 * 1000;
    const fromDateObj = new Date(fromDate);
    
    const updates = [];
    const updatedSchedule = schedule.map(item => {
      const itemDate = item.sermon_date || item.properties?.sermon_date;
      if (!itemDate) return item;
      
      const itemDateObj = new Date(itemDate);
      const preacher = item.preacher || item.properties?.preacher;
      
      if (itemDateObj >= fromDateObj) {
        if (scope === 'all' || (scope === 'benjamin' && preacher === 'Benjamin')) {
          const newDateStr = new Date(itemDateObj.getTime() + shiftMs).toISOString().split('T')[0];
          updates.push({ id: item.id, sermon_date: newDateStr });
          return { 
            ...item, 
            sermon_date: newDateStr,
            properties: { ...item.properties, sermon_date: newDateStr }
          };
        }
      }
      return item;
    });
    
    setIsSaving(true);
    try {
      await api.batchUpdateSchedule(updates);
      setSchedule(updatedSchedule);
      setShowShiftModal(false);
      showToast(`Shifted ${updates.length} entries by ${weeks} week(s)!`, 'success');
    } catch (err) {
      showToast('Failed to shift: ' + err.message, 'error');
    }
    setIsSaving(false);
  };

  // ============================================
  // SERMON REVIEW ACTIONS
  // ============================================

  const handleAnalyzeSermon = async () => {
    if (!currentSermon) return;
    setIsAnalyzing(true);

    // Use dynamic series from API, fall back to hardcoded if empty
    const seriesTitles = seriesOptions.map(s => s.title);
    const seriesForAnalysis = seriesTitles.length > 0 ? seriesTitles : SERIES_OPTIONS;

    // Get existing values from the entry to pre-populate
    const existingValues = {
      primaryText: currentSermon.primary_text || currentSermon.properties?.primary_text || '',
      series: currentSermon.series || currentSermon.properties?.series || '',
      theme: currentSermon.sermon_themefocus || currentSermon.properties?.sermon_themefocus || '',
      audience: currentSermon.audience || currentSermon.properties?.audience || '',
      season: currentSermon.seasonholiday || currentSermon.properties?.seasonholiday || '',
      lessonType: currentSermon.content_type || currentSermon.properties?.content_type || '',
      keyTakeaway: currentSermon.key_takeaway || currentSermon.properties?.key_takeaway || '',
      hashtags: currentSermon.hashtags || currentSermon.properties?.hashtags || ''
    };

    try {
      const result = await api.analyzeSermon(
        currentSermon.sermon_name || currentSermon.title || currentSermon.properties?.sermon_name,
        currentSermon.content || currentSermon.contentMarkdown || currentSermon.properties?.content || '',
        {
          series: seriesForAnalysis,
          themes: THEME_OPTIONS,
          audiences: AUDIENCE_OPTIONS,
          seasons: SEASON_OPTIONS,
          lessonTypes: LESSON_TYPE_OPTIONS,
          hashtags: getAllHashtags()
        }
      );

      // Merge AI results with existing values - AI only fills blank fields
      const mergedResult = {
        primaryText: existingValues.primaryText || result.primaryText,
        series: existingValues.series || result.series,
        theme: existingValues.theme || result.theme,
        audience: existingValues.audience || result.audience,
        season: existingValues.season || result.season,
        lessonType: existingValues.lessonType || result.lessonType,
        keyTakeaway: existingValues.keyTakeaway || result.keyTakeaway,
        hashtags: existingValues.hashtags || result.hashtags
      };

      setRecommendations(mergedResult);
      // Preserve existing sermonDate, notes, and rating - AI doesn't change them
      setEditedRecommendations(prev => ({
        ...mergedResult,
        sermonDate: prev.sermonDate || currentSermon.sermon_date || currentSermon.properties?.sermon_date || '',
        notes: prev.notes || currentSermon.notes || currentSermon.properties?.notes || '',
        rating: prev.rating || currentSermon.rating || currentSermon.properties?.rating || 0
      }));
    } catch (err) {
      showToast('Analysis failed: ' + err.message, 'error');
      setRecommendations({ error: 'Analysis failed. Please try again.' });
    }
    setIsAnalyzing(false);
  };

  // Save recommendations without marking as complete
  // Note: Server uses allowNewSelectOptions=true so new theme/audience/season values
  // are automatically added to Craft's schema when saving
  const handleApprove = async () => {
    if (!currentSermon || !editedRecommendations) return;

    setIsSaving(true);
    try {
      // Look up sermon_series_id from series title (case-insensitive, trimmed)
      const selectedSeries = (editedRecommendations.series || '').trim().toLowerCase();
      const seriesObj = seriesOptions.find(s =>
        s.title && s.title.trim().toLowerCase() === selectedSeries
      );
      const sermonSeriesId = seriesObj?.id || null;

      console.log('Series lookup:', {
        selectedSeries: editedRecommendations.series,
        foundMatch: seriesObj?.title,
        sermonSeriesId,
        availableSeries: seriesOptions.map(s => s.title)
      });

      await api.updateScheduleEntry(currentSermon.id, {
        sermon_date: editedRecommendations.sermonDate,
        notes: editedRecommendations.notes,
        rating: editedRecommendations.rating || 0,
        primary_text: editedRecommendations.primaryText,
        sermon_series_id: sermonSeriesId,
        sermon_themefocus: editedRecommendations.theme,
        audience: editedRecommendations.audience,
        seasonholiday: editedRecommendations.season,
        key_takeaway: editedRecommendations.keyTakeaway,
        hashtags: editedRecommendations.hashtags
        // sermon_information_added stays false
      });

      // Update local state
      setSchedule(prev => prev.map(s =>
        s.id === currentSermon.id
          ? {
              ...s,
              sermon_date: editedRecommendations.sermonDate,
              notes: editedRecommendations.notes,
              rating: editedRecommendations.rating,
              primary_text: editedRecommendations.primaryText,
              series: editedRecommendations.series,
              sermon_themefocus: editedRecommendations.theme,
              audience: editedRecommendations.audience,
              seasonholiday: editedRecommendations.season,
              content_type: editedRecommendations.lessonType,
              key_takeaway: editedRecommendations.keyTakeaway,
              hashtags: editedRecommendations.hashtags,
              properties: { ...s.properties, sermon_date: editedRecommendations.sermonDate, notes: editedRecommendations.notes, rating: editedRecommendations.rating, primary_text: editedRecommendations.primaryText }
            }
          : s
      ));

      showToast('Recommendations saved!', 'success');
    } catch (err) {
      showToast('Failed to save: ' + err.message, 'error');
    }
    setIsSaving(false);
  };

  // Save recommendations AND mark as complete
  // Note: Server uses allowNewSelectOptions=true so new theme/audience/season values
  // are automatically added to Craft's schema when saving
  const handleApproveAndComplete = async () => {
    if (!currentSermon || !editedRecommendations) return;

    setIsSaving(true);
    try {
      // Look up sermon_series_id from series title (case-insensitive, trimmed)
      const selectedSeries = (editedRecommendations.series || '').trim().toLowerCase();
      const seriesObj = seriesOptions.find(s =>
        s.title && s.title.trim().toLowerCase() === selectedSeries
      );
      const sermonSeriesId = seriesObj?.id || null;

      console.log('Series lookup (complete):', {
        selectedSeries: editedRecommendations.series,
        foundMatch: seriesObj?.title,
        sermonSeriesId,
        availableSeries: seriesOptions.map(s => s.title)
      });

      await api.updateScheduleEntry(currentSermon.id, {
        sermon_date: editedRecommendations.sermonDate,
        notes: editedRecommendations.notes,
        rating: editedRecommendations.rating || 0,
        primary_text: editedRecommendations.primaryText,
        sermon_series_id: sermonSeriesId,
        sermon_themefocus: editedRecommendations.theme,
        audience: editedRecommendations.audience,
        seasonholiday: editedRecommendations.season,
        key_takeaway: editedRecommendations.keyTakeaway,
        hashtags: editedRecommendations.hashtags,
        sermon_information_added: true
      });

      // Update local state
      setSchedule(prev => prev.map(s =>
        s.id === currentSermon.id
          ? {
              ...s,
              sermon_date: editedRecommendations.sermonDate,
              notes: editedRecommendations.notes,
              rating: editedRecommendations.rating,
              primary_text: editedRecommendations.primaryText,
              series: editedRecommendations.series,
              sermon_themefocus: editedRecommendations.theme,
              audience: editedRecommendations.audience,
              seasonholiday: editedRecommendations.season,
              content_type: editedRecommendations.lessonType,
              key_takeaway: editedRecommendations.keyTakeaway,
              hashtags: editedRecommendations.hashtags,
              sermon_information_added: true,
              properties: { ...s.properties, sermon_date: editedRecommendations.sermonDate, notes: editedRecommendations.notes, rating: editedRecommendations.rating, primary_text: editedRecommendations.primaryText, sermon_information_added: true }
            }
          : s
      ));

      setRecommendations(null);
      setEditedRecommendations({});
      showToast('Sermon information saved and marked complete!', 'success');
      // Don't advance index - the next sermon slides into current position automatically
    } catch (err) {
      showToast('Failed to save: ' + err.message, 'error');
    }
    setIsSaving(false);
  };

  const handleSkipSermon = () => {
    setRecommendations(null);
    setEditedRecommendations({});
    if (currentSermonIndex < sermonsNeedingInfo.length - 1) {
      setCurrentSermonIndex(prev => prev + 1);
    }
  };

  // Mark sermon as complete without AI analysis (for sermons that don't need full review)
  const handleMarkComplete = async () => {
    if (!currentSermon) return;

    setIsSaving(true);
    try {
      await api.updateScheduleEntry(currentSermon.id, {
        sermon_information_added: true
      });

      // Update local state
      setSchedule(prev => prev.map(s =>
        s.id === currentSermon.id
          ? {
              ...s,
              sermon_information_added: true,
              properties: { ...s.properties, sermon_information_added: true }
            }
          : s
      ));

      setRecommendations(null);
      setEditedRecommendations({});
      showToast('Marked as complete!', 'success');
      // Don't advance index - the next sermon slides into current position automatically
    } catch (err) {
      showToast('Failed to mark complete: ' + err.message, 'error');
    }
    setIsSaving(false);
  };

  // ============================================
  // RENDER
  // ============================================

  const { daysInMonth, startingDay, year, month } = getDaysInMonth(currentDate);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-parchment">
        <div className="text-center">
          <div className="relative w-20 h-20 mx-auto mb-4">
            {/* Spinning circle */}
            <div className="absolute inset-0 rounded-full border-4 border-gold/20" />
            <div className="absolute inset-0 rounded-full border-4 border-transparent border-t-gold animate-spin" />
            {/* Book icon in center */}
            <div className="absolute inset-0 flex items-center justify-center text-3xl">
              📖
            </div>
          </div>
          <p className="text-ink font-display text-xl">Loading Bible Teaching Planner...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen p-4 md:p-6">
      <div className="max-w-6xl mx-auto">
        
        {/* Header */}
        <header className="bg-white rounded-lg sm:rounded-xl shadow-md p-3 sm:p-4 mb-4 sm:mb-6 border border-gold/20">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 sm:gap-4">
            <div className="flex items-center gap-2 sm:gap-3">
              <span className="text-2xl sm:text-3xl">📖</span>
              <div>
                <h1 className="text-xl sm:text-2xl font-display font-bold text-ink">Bible Teaching Planner</h1>
                <p className="text-xs sm:text-sm text-ink/60">Benjamin Hall</p>
              </div>
            </div>

            <div className="flex items-center w-full sm:w-auto">
              {/* Tab Switcher */}
              <div className="flex bg-parchment rounded-lg p-1 w-full sm:w-auto">
                <button
                  onClick={() => setActiveTab('calendar')}
                  className={`flex-1 sm:flex-none px-3 sm:px-4 py-2 rounded-md text-xs sm:text-sm font-medium transition-all ${
                    activeTab === 'calendar'
                      ? 'bg-white shadow text-burgundy'
                      : 'text-ink/60 hover:text-ink'
                  }`}
                >
                  📅 Calendar
                </button>
                <button
                  onClick={() => setActiveTab('review')}
                  className={`flex-1 sm:flex-none px-3 sm:px-4 py-2 rounded-md text-xs sm:text-sm font-medium transition-all flex items-center justify-center gap-2 ${
                    activeTab === 'review'
                      ? 'bg-white shadow text-burgundy'
                      : 'text-ink/60 hover:text-ink'
                  }`}
                >
                  📝 Review
                  {sermonsNeedingInfo.length > 0 && (
                    <span className="bg-burgundy text-white text-xs px-2 py-0.5 rounded-full">
                      {sermonsNeedingInfo.length}
                    </span>
                  )}
                </button>
              </div>
            </div>
          </div>
        </header>

        {/* Series Timeline - only on Calendar tab */}
        {activeTab === 'calendar' && (
          <SeriesTimeline
            series={seriesOptions}
            schedule={schedule}
            currentDate={currentDate}
            onSeriesClick={(s) => {
              // Navigate to the series start date in calendar
              if (s.startDate) {
                const d = new Date(s.startDate);
                setCurrentDate(new Date(d.getFullYear(), d.getMonth(), 1));
              }
            }}
            onSeriesUpdate={async (seriesId, updates) => {
              try {
                await api.updateSeries(seriesId, updates);
                // Refresh series list
                const freshSeries = await api.fetchSeries();
                setSeriesOptions(freshSeries);
                showToast('Series updated!', 'success');
              } catch (err) {
                showToast('Failed to update series: ' + err.message, 'error');
              }
            }}
            onNavigateMonth={(date) => {
              setCurrentDate(date);
            }}
            onAddSeries={async (title, startDate, endDate) => {
              try {
                await api.addSeries(title, startDate, endDate);
                // Refresh series list
                const freshSeries = await api.fetchSeries();
                setSeriesOptions(freshSeries);
                showToast('Series created!', 'success');
              } catch (err) {
                showToast('Failed to create series: ' + err.message, 'error');
              }
            }}
          />
        )}

        {/* Calendar Tab */}
        {activeTab === 'calendar' && (
          <div className="bg-white rounded-xl shadow-md border border-gold/20 overflow-hidden">
            {/* Calendar Controls */}
            <div className="p-3 sm:p-4 border-b border-gold/20 flex flex-col sm:flex-row items-center justify-between gap-3 sm:gap-4 bg-gradient-to-r from-parchment to-white">
              {/* Left spacer - matches filters width for true centering */}
              <div className="hidden sm:block order-1 sm:min-w-[280px]" />

              {/* Month/Year Navigation - Centered */}
              <div className="flex items-center justify-center gap-2 sm:gap-3 order-1 sm:order-2">
                <button
                  onClick={() => navigateMonth(-1)}
                  className="w-9 h-9 sm:w-10 sm:h-10 flex items-center justify-center hover:bg-white rounded-lg transition-colors text-lg sm:text-xl"
                >
                  ◀
                </button>
                <h2
                  onClick={() => setCurrentDate(new Date())}
                  className="text-lg sm:text-xl font-display font-semibold text-ink min-w-36 sm:min-w-48 text-center cursor-pointer hover:text-gold transition-colors"
                  title="Click to return to today"
                >
                  {MONTH_NAMES[month]} {year}
                </h2>
                <button
                  onClick={() => navigateMonth(1)}
                  className="w-9 h-9 sm:w-10 sm:h-10 flex items-center justify-center hover:bg-white rounded-lg transition-colors text-lg sm:text-xl"
                >
                  ▶
                </button>
              </div>

              {/* Filters */}
              <div className="flex items-center gap-2 sm:gap-3 flex-wrap justify-center sm:justify-end order-2 sm:order-3 w-full sm:w-auto sm:min-w-[280px]">
                <select
                  value={lessonTypeFilter}
                  onChange={(e) => setLessonTypeFilter(e.target.value)}
                  className="px-2 sm:px-3 py-1.5 sm:py-2 border border-gold/30 rounded-lg text-xs sm:text-sm bg-white focus:border-gold outline-none flex-1 sm:flex-none"
                >
                  <option value="all">All Types</option>
                  {LESSON_TYPE_OPTIONS.map(type => (
                    <option key={type} value={type}>{type}</option>
                  ))}
                </select>

                {unscheduledSermons.length > 0 && (
                  <button
                    onClick={() => setShowUnscheduled(!showUnscheduled)}
                    className={`px-2 sm:px-3 py-1.5 sm:py-2 rounded-lg text-xs sm:text-sm font-medium transition-all flex-1 sm:flex-none ${
                      showUnscheduled
                        ? 'bg-gold text-white'
                        : 'bg-gold/20 text-gold hover:bg-gold/30'
                    }`}
                  >
                    📋 Unscheduled ({unscheduledSermons.length})
                  </button>
                )}

                <button
                  onClick={() => setShowShiftModal(true)}
                  className="px-2 sm:px-3 py-1.5 sm:py-2 bg-gradient-to-r from-burgundy to-burgundy/80 text-white rounded-lg text-xs sm:text-sm font-medium hover:shadow-md transition-all flex-1 sm:flex-none"
                >
                  ⬇️ Shift Down
                </button>
              </div>
            </div>

            {/* Calendar Grid with optional sidebar */}
            <div className={`flex ${showUnscheduled ? 'flex-col lg:flex-row' : ''}`}>
              {/* Main Calendar */}
              <div className={`p-2 sm:p-4 ${showUnscheduled ? 'flex-1' : 'w-full'}`}>
              {/* Day Headers */}
              <div className="grid grid-cols-7 gap-0.5 sm:gap-1 mb-1 sm:mb-2">
                {DAY_NAMES.map(day => (
                  <div
                    key={day}
                    className={`text-center text-xs sm:text-sm font-semibold py-1 sm:py-2 ${
                      day === 'Sun' ? 'text-burgundy' : 'text-ink/60'
                    }`}
                  >
                    {day}
                  </div>
                ))}
              </div>

              {/* Calendar Days */}
              <div className="grid grid-cols-7 gap-0.5 sm:gap-1">
                {/* Empty cells for days before month starts */}
                {Array.from({ length: startingDay }).map((_, i) => (
                  <div key={`empty-${i}`} className="min-h-16 sm:min-h-24 bg-parchment/30 rounded-lg" />
                ))}

                {/* Actual days */}
                {Array.from({ length: daysInMonth }).map((_, i) => {
                  const day = i + 1;
                  const dateStr = formatDateString(year, month, day);
                  const events = getEventsForDate(dateStr);
                  const isSunday = new Date(year, month, day).getDay() === 0;
                  const isToday = new Date().toISOString().split('T')[0] === dateStr;

                  return (
                    <div
                      key={day}
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={() => handleDrop(dateStr)}
                      onClick={(e) => {
                        // Only open add modal if clicking on the day cell itself, not on an event
                        if (e.target === e.currentTarget || e.target.closest('.day-header')) {
                          setAddDate(dateStr);
                          setShowAddModal(true);
                        }
                      }}
                      className={`calendar-day group min-h-16 sm:min-h-24 p-1 sm:p-1.5 rounded-lg border transition-all cursor-pointer ${
                        isToday
                          ? 'border-gold bg-gold/10'
                          : isSunday
                            ? 'bg-burgundy/5 border-burgundy/20'
                            : 'border-gray-200 hover:border-gold/40'
                      } ${draggedEvent ? 'hover:border-gold hover:bg-gold/5' : ''}`}
                    >
                      <div className="day-header flex items-center justify-between mb-0.5 sm:mb-1">
                        <span className={`text-xs sm:text-sm font-medium ${
                          isToday ? 'text-gold' : isSunday ? 'text-burgundy' : 'text-ink/60'
                        }`}>
                          {day}
                        </span>
                        <button
                          onClick={(e) => { e.stopPropagation(); setAddDate(dateStr); setShowAddModal(true); }}
                          className="w-5 h-5 hidden sm:flex items-center justify-center text-gold hover:bg-gold/20 rounded transition-all text-sm opacity-0 group-hover:opacity-100"
                        >
                          +
                        </button>
                      </div>

                      <div className="space-y-0.5 sm:space-y-1">
                        {events.map(event => {
                          const lessonType = event.lesson_type || event.properties?.lesson_type;
                          const name = event.sermon_name || event.title || lessonType || '—';
                          const isPrepared = isPreparedSermon(event);
                          const shouldDim = hidePrepared && isPrepared;

                          return (
                            <button
                              key={event.id}
                              draggable
                              onDragStart={() => setDraggedEvent(event)}
                              onDragEnd={() => setDraggedEvent(null)}
                              onClick={() => setEditingEntry({ ...event })}
                              className={`entry-card w-full text-left px-1 sm:px-1.5 py-0.5 sm:py-1 rounded border text-xs truncate cursor-grab active:cursor-grabbing ${getLessonTypeColor(lessonType)} ${draggedEvent?.id === event.id ? 'opacity-50' : ''} ${shouldDim ? 'opacity-40' : ''}`}
                            >
                              {name}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
              </div>

              {/* Unscheduled Sermons Sidebar */}
              {showUnscheduled && (
                <div className="w-full lg:w-72 border-t lg:border-t-0 lg:border-l border-gold/20 p-3 sm:p-4 bg-parchment/30 max-h-[40vh] lg:max-h-none overflow-y-auto">
                  <h3 className="font-display font-semibold text-sm text-ink mb-3">
                    Unscheduled Sermons
                  </h3>

                  {readyToSchedule.length > 0 && (
                    <div className="mb-4">
                      <h4 className="text-xs font-medium text-sage mb-2">Ready to Schedule</h4>
                      <div className="space-y-1">
                        {readyToSchedule.map(sermon => (
                          <div
                            key={sermon.id}
                            draggable
                            onDragStart={() => setDraggedEvent(sermon)}
                            onDragEnd={() => setDraggedEvent(null)}
                            onClick={() => setEditingEntry({ ...sermon })}
                            className="px-2 py-1.5 bg-white border border-sage/30 rounded text-xs cursor-grab active:cursor-grabbing hover:bg-sage/10 transition-colors truncate"
                          >
                            {sermon.sermon_name || sermon.properties?.sermon_name || 'Untitled'}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {needsPreparation.length > 0 && (
                    <div>
                      <h4 className="text-xs font-medium text-burgundy/70 mb-2">Needs Preparation</h4>
                      <div className="space-y-1">
                        {needsPreparation.map(sermon => (
                          <div
                            key={sermon.id}
                            draggable
                            onDragStart={() => setDraggedEvent(sermon)}
                            onDragEnd={() => setDraggedEvent(null)}
                            onClick={() => setEditingEntry({ ...sermon })}
                            className="px-2 py-1.5 bg-white/50 border border-gray-200 rounded text-xs cursor-grab active:cursor-grabbing hover:bg-gray-50 transition-colors truncate text-ink/60"
                          >
                            {sermon.sermon_name || sermon.properties?.sermon_name || 'Untitled'}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {unscheduledSermons.length === 0 && (
                    <p className="text-xs text-ink/50 italic">No unscheduled sermons</p>
                  )}
                </div>
              )}
            </div>

            {/* Legend */}
            <div className="p-3 sm:p-4 border-t border-gold/20 bg-parchment/30 flex flex-col sm:flex-row items-start sm:items-center justify-between text-xs sm:text-sm gap-3 sm:gap-4">
              <div className="flex items-center gap-3 sm:gap-6 flex-wrap">
                <div className="flex items-center gap-1.5 sm:gap-2">
                  <div className="w-3 h-3 sm:w-4 sm:h-4 rounded bg-blue-100 border border-blue-400" />
                  <span className="text-ink/70">Sermon AM</span>
                </div>
                <div className="flex items-center gap-1.5 sm:gap-2">
                  <div className="w-3 h-3 sm:w-4 sm:h-4 rounded bg-amber-100 border border-amber-400" />
                  <span className="text-ink/70">Sermon PM</span>
                </div>
                <div className="flex items-center gap-1.5 sm:gap-2">
                  <div className="w-3 h-3 sm:w-4 sm:h-4 rounded bg-green-100 border border-green-400" />
                  <span className="text-ink/70">Afternoon Study</span>
                </div>
              </div>
              <label className="flex items-center gap-2 cursor-pointer select-none w-full sm:w-auto">
                <input
                  type="checkbox"
                  checked={hidePrepared}
                  onChange={() => setHidePrepared(!hidePrepared)}
                  className="w-4 h-4 rounded border-gold/30 text-burgundy focus:ring-burgundy"
                />
                <span className="text-ink/70">View only Unprepared Sermons</span>
              </label>
            </div>
          </div>
        )}

        {/* Review Tab */}
        {activeTab === 'review' && (
          <div className="bg-white rounded-lg sm:rounded-xl shadow-md border border-gold/20 p-3 sm:p-6 mb-4 sm:mb-6">
            {sermonsNeedingInfo.length === 0 ? (
              <div className="text-center py-8 sm:py-12">
                <div className="text-4xl sm:text-6xl mb-3 sm:mb-4">✅</div>
                <h2 className="text-xl sm:text-2xl font-display font-bold text-ink">All Sermons Reviewed!</h2>
                <p className="text-ink/60 mt-2 text-sm sm:text-base">No sermons need information added.</p>
              </div>
            ) : currentSermon ? (
              <div>
                {/* Review Header */}
                <div className="flex items-center justify-between mb-4 sm:mb-6">
                  <h2 className="text-base sm:text-xl font-display font-semibold text-ink">
                    Sermon {currentSermonIndex + 1} of {sermonsNeedingInfo.length}
                  </h2>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setCurrentSermonIndex(Math.max(0, currentSermonIndex - 1))}
                      disabled={currentSermonIndex === 0}
                      className="w-9 h-9 sm:w-10 sm:h-10 flex items-center justify-center hover:bg-parchment rounded-lg disabled:opacity-30 transition-colors"
                    >
                      ◀
                    </button>
                    <button
                      onClick={() => setCurrentSermonIndex(Math.min(sermonsNeedingInfo.length - 1, currentSermonIndex + 1))}
                      disabled={currentSermonIndex === sermonsNeedingInfo.length - 1}
                      className="w-9 h-9 sm:w-10 sm:h-10 flex items-center justify-center hover:bg-parchment rounded-lg disabled:opacity-30 transition-colors"
                    >
                      ▶
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6 items-stretch">
                  {/* Sermon Info */}
                  <div className="bg-parchment/50 rounded-lg sm:rounded-xl p-3 sm:p-4 border border-gold/20 flex flex-col max-h-[50vh] sm:max-h-[calc(100vh-250px)]">
                    <h3 className="font-display font-semibold text-base sm:text-lg text-ink mb-2 sm:mb-3">
                      {currentSermon.sermon_name || currentSermon.title || currentSermon.properties?.sermon_name}
                    </h3>
                    <div className="text-sm text-ink/70 flex-1 overflow-y-auto overflow-x-hidden pr-2">
                      <Markdown
                        components={{
                          a: ({node, ...props}) => <a {...props} className="text-burgundy hover:underline break-words" target="_blank" rel="noopener noreferrer" />,
                          h1: ({node, ...props}) => <h1 {...props} className="text-lg font-bold mt-3 mb-2" />,
                          h2: ({node, ...props}) => <h2 {...props} className="text-base font-bold mt-3 mb-2" />,
                          h3: ({node, ...props}) => <h3 {...props} className="text-sm font-bold mt-2 mb-1" />,
                          h4: ({node, ...props}) => <h4 {...props} className="text-sm font-semibold mt-2 mb-1 text-burgundy" />,
                          h5: ({node, ...props}) => <h5 {...props} className="text-sm font-medium mt-2 mb-1" />,
                          h6: ({node, ...props}) => <h6 {...props} className="text-xs font-medium mt-2 mb-1" />,
                          p: ({node, ...props}) => <p {...props} className="mb-2 break-words" />,
                          ul: ({node, ...props}) => <ul {...props} className="list-disc pl-4 mb-2" />,
                          ol: ({node, ...props}) => <ol {...props} className="list-decimal pl-4 mb-2" />,
                          li: ({node, ...props}) => <li {...props} className="mb-1" />,
                          strong: ({node, ...props}) => <strong {...props} className="font-semibold" />,
                          blockquote: ({node, ...props}) => <blockquote {...props} className="border-l-2 border-burgundy/50 pl-3 italic my-2" />,
                        }}
                      >
                        {(currentSermon.content || currentSermon.contentMarkdown || currentSermon.properties?.content || 'No content preview available.')
                          .replace(/<highlight[^>]*>/gi, '**')
                          .replace(/<\/highlight>/gi, '**')
                          .replace(/<callout[^>]*>/gi, '\n> ')
                          .replace(/<\/callout>/gi, '\n')
                          .replace(/<[^>]+>/g, '')
                          .replace(/^-\s+(#{1,6})\s+/gm, '$1 ')
                          .replace(/^\s*-\s+(#{1,6})\s+/gm, '$1 ')
                        }
                      </Markdown>
                    </div>

                    <div className="flex flex-col sm:flex-row gap-2 mt-3 sm:mt-4 flex-shrink-0">
                      <button
                        onClick={handleAnalyzeSermon}
                        disabled={isAnalyzing || isSaving}
                        className="flex-1 py-2.5 sm:py-3 bg-gradient-to-r from-burgundy to-burgundy/80 text-white rounded-lg text-sm sm:text-base font-medium hover:shadow-md transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                      >
                        {isAnalyzing ? (
                          <>
                            <span className="animate-spin">⏳</span>
                            Analyzing...
                          </>
                        ) : (
                          <>
                            🤖 Analyze with AI
                          </>
                        )}
                      </button>
                      <button
                        onClick={handleMarkComplete}
                        disabled={isAnalyzing || isSaving}
                        className="flex-1 py-2.5 sm:py-3 bg-sage text-white rounded-lg text-sm sm:text-base font-medium hover:bg-sage/90 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                      >
                        {isSaving ? 'Saving...' : '✓ Mark Complete'}
                      </button>
                    </div>
                  </div>

                  {/* Recommendations */}
                  <div className="bg-blue-50/50 rounded-lg sm:rounded-xl p-3 sm:p-4 border border-blue-200/50 flex flex-col max-h-[50vh] sm:max-h-[calc(100vh-250px)]">
                    <h3 className="font-display font-semibold text-base sm:text-lg text-ink mb-2 sm:mb-3">
                      Recommendations
                    </h3>

                    {recommendations?.error && (
                      <p className="text-burgundy text-sm mb-3">{recommendations.error}</p>
                    )}

                    <div className="flex flex-col flex-1 overflow-hidden">
                      <p className="text-ink/50 text-xs mb-3">
                        {recommendations ? '✓ AI analyzed - review below' : 'Edit existing values or click "Analyze with AI" to auto-fill'}
                      </p>
                      <div className="space-y-3 flex-1 overflow-y-auto pr-1">
                        {/* Date picker - not changed by AI */}
                        <div>
                          <label className="block text-xs font-medium text-ink/70 mb-1">Date</label>
                          <input
                            type="date"
                            value={editedRecommendations.sermonDate || ''}
                            onChange={(e) => setEditedRecommendations(prev => ({ ...prev, sermonDate: e.target.value }))}
                            className="w-full px-3 py-2 border border-gold/30 rounded-lg text-sm bg-white focus:border-gold outline-none"
                          />
                        </div>

                        {/* Notes - not changed by AI */}
                        <div>
                          <label className="block text-xs font-medium text-ink/70 mb-1">Notes</label>
                          <textarea
                            value={editedRecommendations.notes || ''}
                            onChange={(e) => setEditedRecommendations(prev => ({ ...prev, notes: e.target.value }))}
                            rows={2}
                            className="w-full px-3 py-2 border border-gold/30 rounded-lg text-sm bg-white focus:border-gold outline-none resize-y"
                            placeholder="Review notes about how the sermon went..."
                          />
                        </div>

                        {/* Rating - not changed by AI */}
                        <div>
                          <label className="block text-xs font-medium text-ink/70 mb-1">Rating</label>
                          <div className="flex gap-1">
                            {[1, 2, 3, 4, 5].map(star => (
                              <button
                                key={star}
                                type="button"
                                onClick={() => setEditedRecommendations(prev => ({ ...prev, rating: star }))}
                                className={`text-2xl transition-all hover:scale-110 ${
                                  (editedRecommendations.rating || 0) >= star
                                    ? 'opacity-100'
                                    : 'opacity-30 hover:opacity-50'
                                }`}
                              >
                                ⭐
                              </button>
                            ))}
                            {editedRecommendations.rating > 0 && (
                              <button
                                type="button"
                                onClick={() => setEditedRecommendations(prev => ({ ...prev, rating: 0 }))}
                                className="ml-2 text-xs text-ink/50 hover:text-ink/70"
                              >
                                Clear
                              </button>
                            )}
                          </div>
                        </div>

                        {/* Primary Text - Bible passages */}
                        <div>
                          <label className="block text-xs font-medium text-ink/70 mb-1">Primary Text</label>
                          <input
                            type="text"
                            value={editedRecommendations.primaryText || ''}
                            onChange={(e) => setEditedRecommendations(prev => ({ ...prev, primaryText: e.target.value }))}
                            className="w-full px-3 py-2 border border-gold/30 rounded-lg text-sm bg-white focus:border-gold outline-none"
                            placeholder="e.g., John 3:16, Romans 8:28-30"
                          />
                        </div>

                        {[
                          { key: 'series', label: 'Series', options: seriesOptions.length > 0 ? seriesOptions.map(s => s.title) : SERIES_OPTIONS, canAddToApi: true },
                          { key: 'theme', label: 'Theme', options: THEME_OPTIONS, canAddToApi: false },
                          { key: 'audience', label: 'Audience', options: AUDIENCE_OPTIONS, canAddToApi: false },
                          { key: 'season', label: 'Season', options: SEASON_OPTIONS, canAddToApi: false },
                          { key: 'lessonType', label: 'Type', options: LESSON_TYPE_OPTIONS, canAddToApi: false },
                        ].map(({ key, label, options, canAddToApi }) => (
                          <div key={key}>
                            <label className="block text-xs font-medium text-ink/70 mb-1">{label}</label>
                            <SelectWithAdd
                              value={editedRecommendations[key] || ''}
                              onChange={(value) => setEditedRecommendations(prev => ({ ...prev, [key]: value }))}
                              options={options}
                              customOptions={customOptions[key] || []}
                              onAddCustom={async (newValue) => {
                                // For series, also add to Craft database
                                if (canAddToApi && key === 'series') {
                                  try {
                                    const result = await api.addSeries(newValue);
                                    // Add as object to match expected format {id, title}
                                    const newSeriesObj = {
                                      id: result.result?.items?.[0]?.id || `temp_${Date.now()}`,
                                      title: newValue
                                    };
                                    setSeriesOptions(prev => [...prev, newSeriesObj]);
                                    showToast(`Series "${newValue}" added!`, 'success');
                                  } catch (err) {
                                    showToast('Failed to add series: ' + err.message, 'error');
                                    return; // Don't add to local options if API failed
                                  }
                                } else {
                                  // For other fields, just add locally
                                  setCustomOptions(prev => ({
                                    ...prev,
                                    [key]: [...(prev[key] || []), newValue]
                                  }));
                                }
                              }}
                              label={label}
                            />
                          </div>
                        ))}

                        <div>
                          <label className="block text-xs font-medium text-ink/70 mb-1">Key Takeaway</label>
                          <input
                            type="text"
                            value={editedRecommendations.keyTakeaway || ''}
                            onChange={(e) => setEditedRecommendations(prev => ({ ...prev, keyTakeaway: e.target.value }))}
                            className="w-full px-3 py-2 border border-gold/30 rounded-lg text-sm bg-white focus:border-gold outline-none"
                          />
                        </div>

                        <div>
                          <label className="block text-xs font-medium text-ink/70 mb-1">Hashtags</label>
                          <input
                            type="text"
                            value={editedRecommendations.hashtags || ''}
                            onChange={(e) => setEditedRecommendations(prev => ({ ...prev, hashtags: e.target.value }))}
                            className="w-full px-3 py-2 border border-gold/30 rounded-lg text-sm bg-white focus:border-gold outline-none"
                            placeholder="#topic/faith, #topic/obedience"
                          />
                        </div>
                      </div>

                      <div className="flex flex-col sm:flex-row gap-2 pt-4 mt-auto">
                        <button
                          onClick={handleApprove}
                          disabled={isSaving}
                          className="flex-1 py-2.5 bg-blue-500 text-white rounded-lg font-medium hover:bg-blue-600 transition-all disabled:opacity-50 text-sm"
                        >
                          {isSaving ? 'Saving...' : '✓ Approve'}
                        </button>
                        <button
                          onClick={handleApproveAndComplete}
                          disabled={isSaving}
                          className="flex-1 py-2.5 bg-sage text-white rounded-lg font-medium hover:bg-sage/90 transition-all disabled:opacity-50 text-sm"
                        >
                          {isSaving ? 'Saving...' : '✓ Approve & Complete'}
                        </button>
                        <button
                          onClick={handleSkipSermon}
                          className="flex-1 py-2.5 bg-gray-200 text-ink rounded-lg font-medium hover:bg-gray-300 transition-all text-sm"
                        >
                          Skip
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="text-center py-12">
                <div className="text-6xl mb-4">⚠️</div>
                <h2 className="text-2xl font-display font-bold text-ink">Unable to Load Sermons</h2>
                <p className="text-ink/60 mt-2">There was an issue loading sermon data. Please check your connection and try again.</p>
                <button
                  onClick={loadData}
                  className="mt-4 px-6 py-2 bg-burgundy text-white rounded-lg hover:bg-burgundy/90 transition-colors"
                >
                  Retry
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Edit Entry Modal */}
      {editingEntry && (
        <Modal onClose={() => setEditingEntry(null)}>
          <h3 className="text-xl font-display font-semibold text-ink mb-4">Edit Entry</h3>
          <EntryForm
            entry={editingEntry}
            onChange={setEditingEntry}
            onSave={() => handleSaveEntry(editingEntry)}
            onDelete={() => handleDeleteEntry(editingEntry.id)}
            onCancel={() => setEditingEntry(null)}
            isSaving={isSaving}
            showDelete
            seriesOptions={seriesOptions}
            onAddSeries={async (newSeries) => {
              try {
                const result = await api.addSeries(newSeries);
                // Add as object to match the expected format {id, title}
                const newSeriesObj = {
                  id: result.result?.items?.[0]?.id || `temp_${Date.now()}`,
                  title: newSeries
                };
                setSeriesOptions(prev => [...prev, newSeriesObj]);
                showToast(`Series "${newSeries}" added!`, 'success');
              } catch (err) {
                showToast('Failed to add series: ' + err.message, 'error');
              }
            }}
          />
        </Modal>
      )}

      {/* Add Entry Modal */}
      {showAddModal && (
        <Modal onClose={() => setShowAddModal(false)}>
          <h3 className="text-xl font-display font-semibold text-ink mb-4">Add New Entry</h3>
          <AddEntryForm
            initialDate={addDate}
            onSave={handleAddEntry}
            onCancel={() => setShowAddModal(false)}
            isSaving={isSaving}
            seriesOptions={seriesOptions}
            onAddSeries={async (newSeries) => {
              try {
                const result = await api.addSeries(newSeries);
                const newSeriesObj = {
                  id: result.result?.items?.[0]?.id || `temp_${Date.now()}`,
                  title: newSeries
                };
                setSeriesOptions(prev => [...prev, newSeriesObj]);
                showToast(`Series "${newSeries}" added!`, 'success');
              } catch (err) {
                showToast('Failed to add series: ' + err.message, 'error');
              }
            }}
          />
        </Modal>
      )}

      {/* Shift Modal */}
      {showShiftModal && (
        <Modal onClose={() => setShowShiftModal(false)}>
          <h3 className="text-xl font-display font-semibold text-ink mb-4">Shift Sermons Down</h3>
          <ShiftForm
            onShift={handleShift}
            onCancel={() => setShowShiftModal(false)}
            isSaving={isSaving}
          />
        </Modal>
      )}

      {/* Toast */}
      {toast && (
        <Toast
          message={toast.message}
          type={toast.type}
          onClose={() => setToast(null)}
        />
      )}
    </div>
  );
}

// ============================================
// SUB-COMPONENTS
// ============================================

function Modal({ children, onClose }) {
  return (
    <div
      className="modal-backdrop fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-2 sm:p-4"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="bg-white rounded-lg sm:rounded-xl p-4 sm:p-6 max-w-[calc(100vw-1rem)] sm:max-w-md w-full max-h-[85vh] sm:max-h-[90vh] overflow-y-auto shadow-2xl">
        {children}
      </div>
    </div>
  );
}

function EntryForm({ entry, onChange, onSave, onDelete, onCancel, isSaving, showDelete, seriesOptions = [], onAddSeries }) {
  const updateField = (field, value) => {
    onChange({
      ...entry,
      [field]: value,
      properties: { ...entry.properties, [field]: value }
    });
  };

  const getValue = (field) => entry[field] || entry.properties?.[field] || '';

  return (
    <div className="space-y-3 sm:space-y-4">
      <div>
        <label className="block text-xs sm:text-sm font-medium text-ink/70 mb-1">Name</label>
        <input
          type="text"
          value={getValue('sermon_name')}
          onChange={(e) => updateField('sermon_name', e.target.value)}
          className="w-full px-3 py-2.5 sm:py-2 border border-gold/30 rounded-lg focus:border-gold outline-none text-sm sm:text-base"
        />
      </div>

      <div>
        <label className="block text-xs sm:text-sm font-medium text-ink/70 mb-1">Notes</label>
        <textarea
          value={getValue('notes')}
          onChange={(e) => updateField('notes', e.target.value)}
          rows={2}
          className="w-full px-3 py-2.5 sm:py-2 border border-gold/30 rounded-lg focus:border-gold outline-none text-sm sm:text-base resize-y"
          placeholder="Quick notes about this entry..."
        />
      </div>

      <div>
        <label className="block text-xs sm:text-sm font-medium text-ink/70 mb-1">Series</label>
        <SelectWithAdd
          value={getValue('series')}
          onChange={(value) => updateField('series', value)}
          options={seriesOptions.map(s => s.title || s)}
          customOptions={[]}
          onAddCustom={async (newValue) => {
            if (onAddSeries) {
              await onAddSeries(newValue);
            }
          }}
          label="Series"
        />
      </div>

      <div>
        <label className="block text-xs sm:text-sm font-medium text-ink/70 mb-1">Type</label>
        <select
          value={getValue('lesson_type')}
          onChange={(e) => updateField('lesson_type', e.target.value)}
          className="w-full px-3 py-2.5 sm:py-2 border border-gold/30 rounded-lg focus:border-gold outline-none text-sm sm:text-base"
        >
          <option value="">Select...</option>
          {LESSON_TYPE_OPTIONS.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
      </div>

      <div>
        <label className="block text-xs sm:text-sm font-medium text-ink/70 mb-1">Preacher</label>
        <select
          value={getValue('preacher')}
          onChange={(e) => updateField('preacher', e.target.value)}
          className="w-full px-3 py-2.5 sm:py-2 border border-gold/30 rounded-lg focus:border-gold outline-none text-sm sm:text-base"
        >
          <option value="">Select...</option>
          {PREACHERS.map(p => <option key={p} value={p}>{p}</option>)}
        </select>
      </div>

      <div>
        <label className="block text-xs sm:text-sm font-medium text-ink/70 mb-1">Date</label>
        <input
          type="date"
          value={getValue('sermon_date')}
          onChange={(e) => updateField('sermon_date', e.target.value)}
          className="w-full px-3 py-2.5 sm:py-2 border border-gold/30 rounded-lg focus:border-gold outline-none text-sm sm:text-base"
        />
      </div>

      <div>
        <label className="block text-xs sm:text-sm font-medium text-ink/70 mb-1">Special Event</label>
        <select
          value={getValue('special_event')}
          onChange={(e) => updateField('special_event', e.target.value)}
          className="w-full px-3 py-2.5 sm:py-2 border border-gold/30 rounded-lg focus:border-gold outline-none text-sm sm:text-base"
        >
          <option value="">None</option>
          {SPECIAL_EVENTS.map(ev => <option key={ev} value={ev}>{ev}</option>)}
        </select>
      </div>

      <div>
        <label className="block text-xs sm:text-sm font-medium text-ink/70 mb-1">Status</label>
        <select
          value={getValue('status')}
          onChange={(e) => updateField('status', e.target.value)}
          className="w-full px-3 py-2.5 sm:py-2 border border-gold/30 rounded-lg focus:border-gold outline-none text-sm sm:text-base"
        >
          <option value="">Select...</option>
          <option value="Draft">Draft</option>
          <option value="in progress">In Progress</option>
          <option value="Complete">Complete</option>
          <option value="Ready to Preach">Ready to Preach</option>
          <option value="archive">Archive</option>
        </select>
      </div>

      <div className="flex flex-col sm:flex-row gap-2 sm:gap-3 pt-2">
        <button
          onClick={onSave}
          disabled={isSaving}
          className="w-full sm:flex-1 py-2.5 bg-burgundy text-white rounded-lg text-sm sm:text-base font-medium hover:bg-burgundy/90 transition-all disabled:opacity-50"
        >
          {isSaving ? 'Saving...' : 'Save'}
        </button>
        <button
          onClick={onCancel}
          className="w-full sm:flex-1 py-2.5 bg-gray-200 text-ink rounded-lg text-sm sm:text-base font-medium hover:bg-gray-300 transition-all"
        >
          Cancel
        </button>
      </div>
      
      {showDelete && (
        <button
          onClick={onDelete}
          disabled={isSaving}
          className="w-full py-2 text-burgundy hover:bg-burgundy/10 rounded-lg text-sm transition-all"
        >
          🗑 Delete Entry
        </button>
      )}
    </div>
  );
}

function AddEntryForm({ initialDate, onSave, onCancel, isSaving, seriesOptions = [], onAddSeries }) {
  const [entry, setEntry] = useState({
    sermon_name: '',
    notes: '',
    series: '',
    lesson_type: 'Sermon',
    preacher: 'Benjamin',
    sermon_date: initialDate || '',
    special_event: '',
    status: 'Draft'
  });

  return (
    <div className="space-y-3 sm:space-y-4">
      <div>
        <label className="block text-xs sm:text-sm font-medium text-ink/70 mb-1">Name</label>
        <input
          type="text"
          value={entry.sermon_name}
          onChange={(e) => setEntry(prev => ({ ...prev, sermon_name: e.target.value }))}
          className="w-full px-3 py-2.5 sm:py-2 border border-gold/30 rounded-lg focus:border-gold outline-none text-sm sm:text-base"
          placeholder="Sermon name..."
        />
      </div>

      <div>
        <label className="block text-xs sm:text-sm font-medium text-ink/70 mb-1">Notes</label>
        <textarea
          value={entry.notes}
          onChange={(e) => setEntry(prev => ({ ...prev, notes: e.target.value }))}
          rows={2}
          className="w-full px-3 py-2.5 sm:py-2 border border-gold/30 rounded-lg focus:border-gold outline-none text-sm sm:text-base resize-y"
          placeholder="Quick notes about this entry..."
        />
      </div>

      <div>
        <label className="block text-xs sm:text-sm font-medium text-ink/70 mb-1">Series</label>
        <SelectWithAdd
          value={entry.series}
          onChange={(value) => setEntry(prev => ({ ...prev, series: value }))}
          options={seriesOptions.map(s => s.title || s)}
          customOptions={[]}
          onAddCustom={async (newValue) => {
            if (onAddSeries) {
              await onAddSeries(newValue);
            }
          }}
          label="Series"
        />
      </div>

      <div>
        <label className="block text-xs sm:text-sm font-medium text-ink/70 mb-1">Type</label>
        <select
          value={entry.lesson_type}
          onChange={(e) => setEntry(prev => ({ ...prev, lesson_type: e.target.value }))}
          className="w-full px-3 py-2.5 sm:py-2 border border-gold/30 rounded-lg focus:border-gold outline-none text-sm sm:text-base"
        >
          {LESSON_TYPE_OPTIONS.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
      </div>

      <div>
        <label className="block text-xs sm:text-sm font-medium text-ink/70 mb-1">Preacher</label>
        <select
          value={entry.preacher}
          onChange={(e) => setEntry(prev => ({ ...prev, preacher: e.target.value }))}
          className="w-full px-3 py-2.5 sm:py-2 border border-gold/30 rounded-lg focus:border-gold outline-none text-sm sm:text-base"
        >
          {PREACHERS.map(p => <option key={p} value={p}>{p}</option>)}
        </select>
      </div>

      <div>
        <label className="block text-xs sm:text-sm font-medium text-ink/70 mb-1">Date</label>
        <input
          type="date"
          value={entry.sermon_date}
          onChange={(e) => setEntry(prev => ({ ...prev, sermon_date: e.target.value }))}
          className="w-full px-3 py-2.5 sm:py-2 border border-gold/30 rounded-lg focus:border-gold outline-none text-sm sm:text-base"
        />
      </div>

      <div>
        <label className="block text-xs sm:text-sm font-medium text-ink/70 mb-1">Special Event</label>
        <select
          value={entry.special_event}
          onChange={(e) => setEntry(prev => ({ ...prev, special_event: e.target.value }))}
          className="w-full px-3 py-2.5 sm:py-2 border border-gold/30 rounded-lg focus:border-gold outline-none text-sm sm:text-base"
        >
          <option value="">None</option>
          {SPECIAL_EVENTS.map(ev => <option key={ev} value={ev}>{ev}</option>)}
        </select>
      </div>

      <div>
        <label className="block text-xs sm:text-sm font-medium text-ink/70 mb-1">Status</label>
        <select
          value={entry.status}
          onChange={(e) => setEntry(prev => ({ ...prev, status: e.target.value }))}
          className="w-full px-3 py-2.5 sm:py-2 border border-gold/30 rounded-lg focus:border-gold outline-none text-sm sm:text-base"
        >
          <option value="Draft">Draft</option>
          <option value="in progress">In Progress</option>
          <option value="Complete">Complete</option>
          <option value="Ready to Preach">Ready to Preach</option>
          <option value="archive">Archive</option>
        </select>
      </div>

      <div className="flex flex-col sm:flex-row gap-2 sm:gap-3 pt-2">
        <button
          onClick={() => onSave(entry)}
          disabled={isSaving}
          className="w-full sm:flex-1 py-2.5 bg-sage text-white rounded-lg text-sm sm:text-base font-medium hover:bg-sage/90 transition-all disabled:opacity-50"
        >
          {isSaving ? 'Adding...' : 'Add Entry'}
        </button>
        <button
          onClick={onCancel}
          className="w-full sm:flex-1 py-2.5 bg-gray-200 text-ink rounded-lg text-sm sm:text-base font-medium hover:bg-gray-300 transition-all"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

function ShiftForm({ onShift, onCancel, isSaving }) {
  const [fromDate, setFromDate] = useState('');
  const [weeks, setWeeks] = useState(1);
  const [scope, setScope] = useState('all');

  return (
    <div className="space-y-3 sm:space-y-4">
      <p className="text-xs sm:text-sm text-ink/70">
        This will move all sermons from the selected date forward by the specified number of weeks.
      </p>

      <div>
        <label className="block text-xs sm:text-sm font-medium text-ink/70 mb-1">From Date</label>
        <input
          type="date"
          value={fromDate}
          onChange={(e) => setFromDate(e.target.value)}
          className="w-full px-3 py-2.5 sm:py-2 border border-gold/30 rounded-lg focus:border-gold outline-none text-sm sm:text-base"
        />
      </div>

      <div>
        <label className="block text-xs sm:text-sm font-medium text-ink/70 mb-1">Number of Weeks</label>
        <input
          type="number"
          min="1"
          max="12"
          value={weeks}
          onChange={(e) => setWeeks(parseInt(e.target.value) || 1)}
          className="w-full px-3 py-2.5 sm:py-2 border border-gold/30 rounded-lg focus:border-gold outline-none text-sm sm:text-base"
        />
      </div>

      <div>
        <label className="block text-xs sm:text-sm font-medium text-ink/70 mb-1">What to Shift</label>
        <select
          value={scope}
          onChange={(e) => setScope(e.target.value)}
          className="w-full px-3 py-2.5 sm:py-2 border border-gold/30 rounded-lg focus:border-gold outline-none text-sm sm:text-base"
        >
          <option value="all">All Sermons</option>
          <option value="benjamin">Benjamin's Sermons Only</option>
        </select>
      </div>

      <div className="flex flex-col sm:flex-row gap-2 sm:gap-3 pt-2">
        <button
          onClick={() => onShift(fromDate, weeks, scope)}
          disabled={isSaving || !fromDate}
          className="w-full sm:flex-1 py-2.5 bg-burgundy text-white rounded-lg text-sm sm:text-base font-medium hover:bg-burgundy/90 transition-all disabled:opacity-50"
        >
          {isSaving ? 'Shifting...' : 'Shift Down'}
        </button>
        <button
          onClick={onCancel}
          className="w-full sm:flex-1 py-2.5 bg-gray-200 text-ink rounded-lg text-sm sm:text-base font-medium hover:bg-gray-300 transition-all"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
