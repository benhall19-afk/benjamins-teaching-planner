import React, { useState, useEffect, useMemo, useCallback } from 'react';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import * as api from './api';
import {
  SERIES_OPTIONS, THEME_OPTIONS, AUDIENCE_OPTIONS, SEASON_OPTIONS,
  LESSON_TYPE_OPTIONS, PREACHERS, SPECIAL_EVENTS,
  MONTH_NAMES, DAY_NAMES, getAllHashtags
} from './constants';
import { VIEWS, isSermonPrepared, isDevotionPrepared, getDevotionDisplayTitle, isEnglishClassPrepared, isEnglishClassCompleted, getEnglishClassDisplayTitle } from './viewConfig';
import ViewSwitcher from './components/ViewSwitcher';
import ItemDetailPopup from './components/ItemDetailPopup';
import PlanMonthModal from './components/PlanMonthModal';
import WeeklyCalendar from './components/WeeklyCalendar';
import UpcomingHolidays from './components/UpcomingHolidays';
import HolidayManagementModal from './components/HolidayManagementModal';
import { useHolidays } from './hooks/useHolidays';
import { getWeekKey } from './utils/holidayCalculations';

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
          className="flex-1 input-glass text-sm"
          autoFocus
        />
        <div className="flex gap-2">
          <button
            onClick={handleAddNew}
            className="flex-1 sm:flex-none px-3 py-2.5 sm:py-2 btn-glossy-sage text-sm"
          >
            Add
          </button>
          <button
            onClick={() => { setIsAdding(false); setNewValue(''); }}
            className="flex-1 sm:flex-none px-3 py-2.5 sm:py-2 btn-glass text-sm"
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
        className="flex-1 select-glass text-sm"
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

function SeriesTimeline({ series, schedule, currentDate, onSeriesClick, onSeriesUpdate, onNavigateMonth, onAddSeries, isDevotionView = false }) {
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

  // Count items per series (sermons or devotion lessons)
  const itemCountBySeries = useMemo(() => {
    if (isDevotionView) {
      // For devotions, count from the series data directly (already computed)
      return series.reduce((acc, s) => {
        if (s.isDevotionSeries) {
          acc[s.id] = {
            total: s.lessonCount || 0,
            complete: s.completedCount || 0,
            items: []
          };
        }
        return acc;
      }, {});
    }
    // For sermons
    return schedule.reduce((acc, entry) => {
      if (entry.sermon_series_id) {
        if (!acc[entry.sermon_series_id]) {
          acc[entry.sermon_series_id] = { total: 0, complete: 0, items: [] };
        }
        acc[entry.sermon_series_id].total++;
        acc[entry.sermon_series_id].items.push(entry);
        if (entry.status === 'Complete' || entry.status === 'Ready to Preach') {
          acc[entry.sermon_series_id].complete++;
        }
      }
      return acc;
    }, {});
  }, [schedule, series, isDevotionView]);

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
    <div className="relative">
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
          const counts = itemCountBySeries[s.id] || { total: 0, complete: 0, items: [] };
          const totalSundays = getSundaysInRange(s.startDate, s.endDate);

          if (startPos === null || endPos === null || startPos >= 100 || endPos <= 0) {
            return null;
          }

          const width = Math.max(5, endPos - startPos);
          const left = Math.max(0, startPos);

          const isDevSeries = s.isDevotionSeries;
          const barColor = isDevSeries
            ? (selectedSeries?.id === s.id ? 'bg-amber-600 ring-2 ring-amber-300' : 'bg-amber-500 hover:bg-amber-600')
            : (selectedSeries?.id === s.id ? 'bg-sage-600 ring-2 ring-sage-300' : 'bg-sage-500 hover:bg-sage-600');

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
                className={`absolute inset-0 rounded-full px-2 py-1 text-white text-xs flex items-center justify-between overflow-hidden transition-all ${barColor}`}
              >
                <span className="truncate font-medium">{s.title}</span>
                <span className="text-white/80 whitespace-nowrap ml-1">
                  {isDevSeries
                    ? `(${counts.complete}/${counts.total})`
                    : `(${counts.total}/${totalSundays})`
                  }
                </span>
              </div>
            </div>
          );
        })}

        {seriesWithDates.length === 0 && (
          <div className="text-center text-ink/40 text-sm py-4">
            {isDevotionView
              ? 'No devotion series with dates found.'
              : 'No series with dates. Click + to add one.'
            }
          </div>
        )}
      </div>

      {/* Series Popover */}
      {selectedSeries && (
        <div
          className="series-popover absolute z-50 glass-card p-4 w-72"
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
            const counts = itemCountBySeries[selectedSeries.id] || { total: 0, complete: 0, items: [] };
            const isDevSeries = selectedSeries.isDevotionSeries;
            const totalSlots = isDevSeries ? counts.total : getSundaysInRange(selectedSeries.startDate, selectedSeries.endDate);
            const progress = counts.total > 0 ? Math.round((counts.complete / counts.total) * 100) : 0;

            return (
              <>
                <div className="text-sm text-ink/80 mb-2">
                  {isDevSeries
                    ? `${counts.complete} of ${counts.total} lessons completed`
                    : `${counts.total} of ${totalSlots} Sundays planned`
                  }
                </div>
                <div className={`h-2 ${isDevSeries ? 'bg-amber/30' : 'bg-sage/30'} rounded-full overflow-hidden mb-3`}>
                  <div
                    className={`h-full ${isDevSeries ? 'bg-amber-500' : 'bg-sage'} transition-all`}
                    style={{ width: `${progress}%` }}
                  />
                </div>

                {/* Item list (sermons only, devotions don't have detailed list here) */}
                {!isDevSeries && counts.items.length > 0 && (
                  <div className="max-h-32 overflow-y-auto space-y-1 mb-3">
                    {counts.items.slice(0, 5).map(sermon => (
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
                    {counts.items.length > 5 && (
                      <div className="text-xs text-ink/40 pl-6">
                        +{counts.items.length - 5} more...
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
          isDevotionView={isDevotionView}
        />
      )}

    </div>
  );
}

// ============================================
// ADD SERIES MODAL
// ============================================

function AddSeriesModal({ seriesWithoutDates, onClose, onAddDates, onCreateSeries, isDevotionView = false }) {
  const [mode, setMode] = useState('existing'); // 'existing' or 'new'
  const [selectedSeriesId, setSelectedSeriesId] = useState('');
  const [newTitle, setNewTitle] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [saving, setSaving] = useState(false);

  // Dynamic labels based on view type
  const labels = isDevotionView ? {
    title: 'Add Devotion Series to Timeline',
    seriesTitle: 'Devotion Series Title',
    startDate: 'Series Start Date',
    endDate: 'Completion Date Goal',
    placeholder: 'Enter devotion series title...'
  } : {
    title: 'Add Sermon Series to Timeline',
    seriesTitle: 'Series Title',
    startDate: 'Start Date',
    endDate: 'End Date',
    placeholder: 'Enter series title...'
  };

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
        <h3 className="font-medium uppercase tracking-wider text-xs text-ink/60 mb-4">{labels.title}</h3>

        {/* Mode tabs */}
        <div className="flex bg-parchment rounded-lg p-1 mb-4">
          <button
            onClick={() => setMode('existing')}
            className={`flex-1 py-2 rounded-md text-sm font-medium transition-all ${
              mode === 'existing' ? `bg-white shadow ${isDevotionView ? 'text-amber-600' : 'text-burgundy'}` : 'text-ink/60'
            }`}
          >
            Existing Series
          </button>
          <button
            onClick={() => setMode('new')}
            className={`flex-1 py-2 rounded-md text-sm font-medium transition-all ${
              mode === 'new' ? `bg-white shadow ${isDevotionView ? 'text-amber-600' : 'text-burgundy'}` : 'text-ink/60'
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
                className="w-full select-glass text-sm"
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
            <label className="block text-sm font-medium text-ink/70 mb-1">{labels.seriesTitle}</label>
            <input
              type="text"
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              className="w-full input-glass text-sm"
              placeholder={labels.placeholder}
            />
          </div>
        )}

        {/* Date inputs */}
        <div className="grid grid-cols-2 gap-3 mb-6">
          <div>
            <label className="block text-sm font-medium text-ink/70 mb-1">{labels.startDate}</label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="w-full input-glass text-sm"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-ink/70 mb-1">{labels.endDate}</label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="w-full input-glass text-sm"
            />
          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 py-2.5 btn-glass"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={!canSubmit || saving}
            className={`flex-1 py-2.5 disabled:opacity-50 disabled:cursor-not-allowed ${
              isDevotionView ? 'btn-glossy-amber' : 'btn-glossy'
            }`}
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
  // View state - which calendar view is active
  const [currentView, setCurrentView] = useState('sermons');

  // Data state - unified: schedule now contains all entries (including migrated sermons)
  const [schedule, setSchedule] = useState([]);
  const [seriesOptions, setSeriesOptions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Devotions data state
  const [devotionSeries, setDevotionSeries] = useState([]);
  const [devotionLessons, setDevotionLessons] = useState([]);
  const [devotionsLoading, setDevotionsLoading] = useState(false);
  const [selectedDevotionLesson, setSelectedDevotionLesson] = useState(null);
  const [showPlanMonthModal, setShowPlanMonthModal] = useState(false);

  // English class data state
  const [englishSeries, setEnglishSeries] = useState([]);
  const [englishClasses, setEnglishClasses] = useState([]);
  const [englishLoading, setEnglishLoading] = useState(false);
  const [selectedEnglishClass, setSelectedEnglishClass] = useState(null);

  // Unscheduled sermons sidebar
  const [showUnscheduled, setShowUnscheduled] = useState(false);

  // UI state
  const [activeTab, setActiveTab] = useState('calendar');
  const [toast, setToast] = useState(null);
  
  // Calendar state
  const [currentDate, setCurrentDate] = useState(new Date());
  const [hidePrepared, setHidePrepared] = useState(false);
  const [filterBenjamin, setFilterBenjamin] = useState(false);
  const [editingEntry, setEditingEntry] = useState(null);
  const [selectedSermon, setSelectedSermon] = useState(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [addDate, setAddDate] = useState(null);
  const [showShiftModal, setShowShiftModal] = useState(false);
  const [draggedEvent, setDraggedEvent] = useState(null);
  const [showTimeline, setShowTimeline] = useState(false);

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

  // Holiday system
  const {
    getHolidaysForDate,
    getHolidaysForWeek,
    getUpcoming,
    getHolidayColor,
    getHolidaysForYear,
    allHolidayRules,
    customHolidays,
    addCustomHoliday,
    deleteCustomHoliday,
    isManagementOpen,
    openManagement,
    closeManagement,
  } = useHolidays(currentDate);

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
      // Also pre-load devotions and english classes since backend cache is pre-warmed
      const [scheduleData, seriesData, devotionSeriesData, devotionLessonsData, englishSeriesData, englishClassesData] = await Promise.all([
        api.fetchSchedule().catch((e) => { console.error('Failed to fetch schedule:', e); return []; }),
        api.fetchSeries().catch((e) => { console.error('Failed to fetch series:', e); return []; }),
        api.fetchDevotionSeries().catch((e) => { console.error('Failed to fetch devotion series:', e); return []; }),
        api.fetchDevotionLessons().catch((e) => { console.error('Failed to fetch devotion lessons:', e); return []; }),
        api.fetchEnglishSeries().catch((e) => { console.error('Failed to fetch english series:', e); return []; }),
        api.fetchEnglishClasses().catch((e) => { console.error('Failed to fetch english classes:', e); return []; })
      ]);

      setSchedule(scheduleData);
      // Keep full series objects (id + title) for relation handling
      const filteredSeries = seriesData.filter(s => s && s.title);
      setSeriesOptions(filteredSeries);
      // Pre-load devotions for instant view switching
      setDevotionSeries(devotionSeriesData);
      setDevotionLessons(devotionLessonsData);
      // Pre-load english classes for instant view switching
      setEnglishSeries(englishSeriesData);
      setEnglishClasses(englishClassesData);
    } catch (err) {
      console.error('loadData error:', err);
      setError('Failed to load data. Using offline mode.');
      showToast('Could not connect to server. Running in demo mode.', 'error');
    }
    setLoading(false);
  }

  // Load devotions data when view changes to devotions or combined
  async function loadDevotions(forceRefresh = false) {
    if (!forceRefresh && devotionLessons.length > 0) return; // Already loaded
    setDevotionsLoading(true);
    try {
      const [seriesData, lessonsData] = await Promise.all([
        api.fetchDevotionSeries().catch((e) => { console.error('Failed to fetch devotion series:', e); return []; }),
        api.fetchDevotionLessons().catch((e) => { console.error('Failed to fetch devotion lessons:', e); return []; })
      ]);
      setDevotionSeries(seriesData);
      setDevotionLessons(lessonsData);
    } catch (err) {
      console.error('loadDevotions error:', err);
      showToast('Could not load devotions data.', 'error');
    }
    setDevotionsLoading(false);
  }

  // Load English classes data on demand
  async function loadEnglish(forceRefresh = false) {
    if (!forceRefresh && englishClasses.length > 0) return; // Already loaded
    setEnglishLoading(true);
    try {
      const [seriesData, classesData] = await Promise.all([
        api.fetchEnglishSeries().catch((e) => { console.error('Failed to fetch english series:', e); return []; }),
        api.fetchEnglishClasses().catch((e) => { console.error('Failed to fetch english classes:', e); return []; })
      ]);
      setEnglishSeries(seriesData);
      setEnglishClasses(classesData);
    } catch (err) {
      console.error('loadEnglish error:', err);
      showToast('Could not load English class data.', 'error');
    }
    setEnglishLoading(false);
  }

  // Load data when switching views
  useEffect(() => {
    if (currentView === 'devotions' || currentView === 'combined') {
      loadDevotions();
    }
    if (currentView === 'english' || currentView === 'combined') {
      loadEnglish();
    }
  }, [currentView]);

  // Theme switching effect with fade-blur transition
  const isFirstRender = React.useRef(true);
  useEffect(() => {
    const theme = VIEWS[currentView]?.theme || 'sage';

    // Skip animation on first render
    if (isFirstRender.current) {
      isFirstRender.current = false;
      document.documentElement.setAttribute('data-theme', theme);
      return;
    }

    // Add transition class for blur effect
    document.body.classList.add('view-transitioning');

    // Change theme
    document.documentElement.setAttribute('data-theme', theme);

    // Remove transition class after animation completes
    const timeout = setTimeout(() => {
      document.body.classList.remove('view-transitioning');
    }, 400);

    return () => clearTimeout(timeout);
  }, [currentView]);

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

  // Get the active devotion series (first one with a title)
  const activeDevotionSeries = useMemo(() => {
    if (devotionSeries.length === 0) return null;
    // Find the first series with a title (filter out empty placeholder entries)
    return devotionSeries.find(s => s.title && s.title.trim() !== '') || null;
  }, [devotionSeries]);

  // Get the active English series (first one with a title)
  const activeEnglishSeries = useMemo(() => {
    if (englishSeries.length === 0) return null;
    // Find the first series with a title (filter out empty placeholder entries)
    return englishSeries.find(s => s.title && s.title.trim() !== '') || null;
  }, [englishSeries]);

  // Transform devotion series for timeline display
  const devotionSeriesForTimeline = useMemo(() => {
    return devotionSeries
      .filter(s => s.title && s.title.trim() !== '')
      .map(s => {
        // Calculate end date based on lessons if not explicitly set
        const seriesLessons = devotionLessons.filter(l => l.series_id === s.id || l.properties?.series_id === s.id);
        const scheduledDates = seriesLessons
          .map(l => l.scheduled_date)
          .filter(Boolean)
          .sort();
        const lastScheduledDate = scheduledDates.length > 0 ? scheduledDates[scheduledDates.length - 1] : null;

        return {
          id: s.id,
          title: s.title,
          startDate: s.series_start_date || s.properties?.series_start_date,
          endDate: s.series_completion_date || s.properties?.series_completion_date || lastScheduledDate || s.series_start_date || s.properties?.series_start_date,
          isDevotionSeries: true,
          lessonCount: seriesLessons.length,
          completedCount: seriesLessons.filter(l => l.last_taught).length
        };
      });
  }, [devotionSeries, devotionLessons]);

  // Transform English series for timeline display
  const englishSeriesForTimeline = useMemo(() => {
    return englishSeries
      .filter(s => s.title && s.title.trim() !== '')
      .map(s => {
        // Calculate end date based on classes if not explicitly set
        const seriesClasses = englishClasses.filter(c => c.series_id === s.id);
        const scheduledDates = seriesClasses
          .map(c => c.class_date)
          .filter(Boolean)
          .sort();
        const lastScheduledDate = scheduledDates.length > 0 ? scheduledDates[scheduledDates.length - 1] : null;

        return {
          id: s.id,
          title: s.title,
          startDate: s.series_start_date || s.properties?.series_start_date,
          endDate: s.series_completion_date || s.properties?.series_completion_date || lastScheduledDate || s.series_start_date || s.properties?.series_start_date,
          isEnglishSeries: true,
          classCount: seriesClasses.length,
          completedCount: seriesClasses.filter(c => c.class_status?.toLowerCase() === 'complete').length
        };
      });
  }, [englishSeries, englishClasses]);

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
      startingDay: (firstDay.getDay() + 6) % 7, // Monday-based (Mon=0, Sun=6) 
      year, 
      month 
    };
  };

  const formatDateString = (year, month, day) => {
    return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  };

  // Get ISO week number for a date
  const getWeekNumber = (date) => {
    const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
    const dayNum = d.getUTCDay() || 7;
    d.setUTCDate(d.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    return Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
  };

  // Group calendar days into weeks
  const getCalendarWeeks = (daysInMonth, startingDay, year, month) => {
    const weeks = [];
    let currentWeek = [];

    // Add empty cells for days before month starts
    for (let i = 0; i < startingDay; i++) {
      currentWeek.push(null);
    }

    // Add actual days
    for (let day = 1; day <= daysInMonth; day++) {
      currentWeek.push(day);
      if (currentWeek.length === 7) {
        weeks.push(currentWeek);
        currentWeek = [];
      }
    }

    // Add remaining days (partial week)
    if (currentWeek.length > 0) {
      while (currentWeek.length < 7) currentWeek.push(null);
      weeks.push(currentWeek);
    }

    return weeks;
  };

  const getEventsForDate = (dateStr) => {
    const events = [];

    // Get sermons (for 'sermons' and 'combined' views)
    if (currentView === 'sermons' || currentView === 'combined') {
      const sermons = schedule.filter(item => {
        if (!item.sermon_date && !item.properties?.sermon_date) return false;
        const itemDate = item.sermon_date || item.properties?.sermon_date;
        if (itemDate !== dateStr) return false;
        // Filter by Benjamin if enabled
        if (filterBenjamin) {
          const preacher = item.preacher || item.properties?.preacher;
          if (preacher !== 'Benjamin') return false;
        }
        return true;
      }).map(item => ({ ...item, source: 'sermon' }));
      events.push(...sermons);
    }

    // Get devotions (for 'devotions' and 'combined' views)
    if (currentView === 'devotions' || currentView === 'combined') {
      const devotions = devotionLessons.filter(item => {
        if (!item.scheduled_date) return false;
        const itemDate = item.scheduled_date.split('T')[0];
        return itemDate === dateStr;
      }).map(item => ({ ...item, source: 'devotion' }));
      events.push(...devotions);
    }

    // Get English classes (for 'english' and 'combined' views)
    if (currentView === 'english' || currentView === 'combined') {
      const english = englishClasses.filter(item => {
        if (!item.class_date) return false;
        const itemDate = item.class_date.split('T')[0];
        // Don't show cancelled classes in calendar
        if (item.class_status?.toLowerCase() === 'cancelled class') return false;
        return itemDate === dateStr;
      }).map(item => ({ ...item, source: 'english' }));
      events.push(...english);
    }

    return events;
  };

  const isPreparedSermon = (event) => {
    const status = event.status || event.properties?.status;
    return status === 'Complete' || status === 'Ready to Preach';
  };

  const getLessonTypeColor = (lessonType) => {
    switch (lessonType) {
      case 'Sermon':
      case 'Sermon AM':
      case 'Sermon PM':
        return 'bg-sage-100 border-sage-400 text-sage-800 hover:bg-sage-200';
      case 'Bible Lesson':
      case 'Afternoon Study':
        return 'bg-sky-50 border-sky-300 text-sky-700 hover:bg-sky-100';
      case 'Short English Bible Lesson':
        return 'bg-teal-50 border-teal-300 text-teal-700 hover:bg-teal-100';
      case 'Devotional':
        return 'bg-amber-50 border-amber-300 text-amber-700 hover:bg-amber-100';
      case 'Young Children\'s Bible Lesson':
        return 'bg-violet-50 border-violet-300 text-violet-700 hover:bg-violet-100';
      case 'Video Lesson':
        return 'bg-rose-50 border-rose-300 text-rose-700 hover:bg-rose-100';
      default:
        return 'bg-slate-50 border-slate-300 text-slate-600 hover:bg-slate-100';
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

    // Check event type
    const isDevotionDrag = draggedEvent.source === 'devotion' || (draggedEvent.scheduled_date !== undefined && !draggedEvent.class_date);
    const isEnglishDrag = draggedEvent.source === 'english' || draggedEvent.class_date !== undefined;

    const oldDate = isEnglishDrag ? draggedEvent.class_date : (isDevotionDrag ? draggedEvent.scheduled_date : draggedEvent.sermon_date);
    if (oldDate === newDate) {
      setDraggedEvent(null);
      return;
    }

    if (isEnglishDrag) {
      // Handle English class drop with cascade reschedule
      setDraggedEvent(null);
      showToast('Rescheduling English classes...', 'info');

      try {
        const result = await api.cascadeRescheduleEnglish(draggedEvent.id, newDate);
        // Reload English classes to get the updated schedule
        await loadEnglish(true);
        showToast(`Rescheduled ${result.rescheduled} class${result.rescheduled !== 1 ? 'es' : ''}!`, 'success');
      } catch (err) {
        showToast('Failed to reschedule: ' + err.message, 'error');
      }
    } else if (isDevotionDrag) {
      // Handle devotion drop with cascade reschedule
      // This will move the dragged lesson AND shift all following lessons to valid days
      setDraggedEvent(null);
      showToast('Rescheduling devotions...', 'info');

      try {
        const result = await api.cascadeRescheduleDevotions(draggedEvent.id, newDate);
        // Reload devotions to get the updated schedule
        await loadDevotions(true);
        showToast(`Rescheduled ${result.rescheduled} devotion${result.rescheduled !== 1 ? 's' : ''}!`, 'success');
      } catch (err) {
        showToast('Failed to reschedule: ' + err.message, 'error');
      }
    } else {
      // Handle sermon drop
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
      <div className="min-h-screen flex items-center justify-center">
        {/* Glossy background blobs */}
        <div className="glossy-blob glossy-blob-1" />
        <div className="glossy-blob glossy-blob-2" />
        <div className="text-center relative z-10">
          {/* Animated dots loader */}
          <div className="flex items-center justify-center gap-1.5 mb-5">
            <div className="w-2.5 h-2.5 rounded-full bg-sage-600 animate-bounce" style={{ animationDelay: '0ms', animationDuration: '600ms' }} />
            <div className="w-2.5 h-2.5 rounded-full bg-sage-500 animate-bounce" style={{ animationDelay: '100ms', animationDuration: '600ms' }} />
            <div className="w-2.5 h-2.5 rounded-full bg-sage-400 animate-bounce" style={{ animationDelay: '200ms', animationDuration: '600ms' }} />
          </div>
          <p className="text-ink/60 text-xs tracking-widest uppercase font-medium">Loading</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen relative pb-24 md:pb-0">
      {/* Glossy background blobs */}
      <div className="glossy-blob glossy-blob-1" />
      <div className="glossy-blob glossy-blob-2" />
      <div className="glossy-blob glossy-blob-3" />

      {/* Combined Header with Navigation and Series Timeline */}
      <header className="sticky top-0 z-40 px-4 md:px-6 pt-4 pb-2 max-w-6xl mx-auto">
        <div className="glass-card rounded-2xl overflow-hidden">
          {/* Top Navigation Bar */}
          <div className="flex items-center justify-between px-4 sm:px-6 py-3 border-b border-sage/10">
            <ViewSwitcher currentView={currentView} onViewChange={setCurrentView} />

            {/* Tab Switcher - Hidden on mobile, shown on md+ */}
            <div className="hidden md:flex items-center gap-1 bg-sage-50/50 rounded-full p-1">
              <button
                onClick={() => setActiveTab('calendar')}
                className={`px-3 sm:px-4 py-1.5 rounded-full text-xs sm:text-sm font-medium transition-all ${
                  activeTab === 'calendar' ? 'bg-white shadow-sm text-sage-700' : 'text-ink/50 hover:text-ink/70'
                }`}
              >
                📅 Calendar
              </button>
              <button
                onClick={() => setActiveTab('review')}
                className={`px-3 sm:px-4 py-1.5 rounded-full text-xs sm:text-sm font-medium transition-all flex items-center gap-1.5 ${
                  activeTab === 'review' ? 'bg-white shadow-sm text-sage-700' : 'text-ink/50 hover:text-ink/70'
                }`}
              >
                📝 Review
                {sermonsNeedingInfo.length > 0 && (
                  <span className="bg-sage-600 text-white text-xs px-1.5 py-0.5 rounded-full">
                    {sermonsNeedingInfo.length}
                  </span>
                )}
              </button>
            </div>
          </div>

          {/* Series Timeline - integrated into header, only on Calendar tab (not for combined view) */}
          {activeTab === 'calendar' && currentView !== 'combined' && (
            <div className="border-t border-sage/10">
              {/* Toggle Header */}
              <div className="px-4 sm:px-6 py-2 flex items-center justify-between">
                <button
                  onClick={() => setShowTimeline(!showTimeline)}
                  className="flex items-center gap-1.5 text-ink/60 hover:text-ink/80 transition-colors"
                >
                  <svg
                    className={`w-3.5 h-3.5 transition-transform duration-200 ${showTimeline ? 'rotate-180' : ''}`}
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                  <span className="font-medium uppercase tracking-wider text-xs">Series Timeline</span>
                </button>
                {showTimeline && (
                  <button
                    onClick={() => setShowAddModal(true)}
                    className={`w-6 h-6 rounded-full flex items-center justify-center transition-colors text-sm ${
                      currentView === 'devotions'
                        ? 'bg-amber/10 hover:bg-amber/20 text-amber-600'
                        : 'bg-sage/10 hover:bg-sage/20 text-sage-600'
                    }`}
                    title="Add series to timeline"
                  >
                    +
                  </button>
                )}
              </div>

              {/* Collapsible Content with Animation */}
              <div
                className={`overflow-hidden transition-all duration-300 ease-in-out ${
                  showTimeline ? 'max-h-96 opacity-100' : 'max-h-0 opacity-0'
                }`}
              >
                <div className="px-4 sm:px-6 pb-3">
                  <SeriesTimeline
                    series={currentView === 'devotions' ? devotionSeriesForTimeline : currentView === 'english' ? englishSeriesForTimeline : seriesOptions}
                    schedule={currentView === 'devotions' ? devotionLessons : currentView === 'english' ? englishClasses : schedule}
                    currentDate={currentDate}
                    isDevotionView={currentView === 'devotions' || currentView === 'english'}
                    onSeriesClick={(s) => {
                      // Navigate to the series start date in calendar
                      if (s.startDate) {
                        const d = new Date(s.startDate);
                        setCurrentDate(new Date(d.getFullYear(), d.getMonth(), 1));
                      }
                    }}
                    onSeriesUpdate={(currentView === 'devotions' || currentView === 'english') ? null : async (seriesId, updates) => {
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
                        if (currentView === 'devotions') {
                          await api.addDevotionSeries(title, startDate, endDate);
                          // Refresh devotion series list
                          const freshSeries = await api.fetchDevotionSeries();
                          setDevotionSeries(freshSeries);
                        } else if (currentView === 'english') {
                          await api.addEnglishSeries(title, startDate, endDate);
                          // Refresh English series list
                          const freshSeries = await api.fetchEnglishSeries();
                          setEnglishSeries(freshSeries);
                        } else {
                          await api.addSeries(title, startDate, endDate);
                          // Refresh sermon series list
                          const freshSeries = await api.fetchSeries();
                          setSeriesOptions(freshSeries);
                        }
                        showToast('Series created!', 'success');
                      } catch (err) {
                        showToast('Failed to create series: ' + err.message, 'error');
                      }
                    }}
                  />
                </div>
              </div>
            </div>
          )}
        </div>
      </header>

      {/* Main Content */}
      <div className="px-4 md:px-6 pb-6 max-w-6xl mx-auto relative z-10">
        {/* Calendar Tab */}
        {activeTab === 'calendar' && (
          <div className="glass-card overflow-hidden animate-card-in">
            {/* Weekly Layout */}
            {VIEWS[currentView]?.layout === 'weekly' ? (
              <div className="p-4">
                <WeeklyCalendar
                  sermons={schedule}
                  devotions={devotionLessons}
                  englishClasses={englishClasses}
                  currentDate={currentDate}
                  onDateChange={setCurrentDate}
                  onEventClick={(event) => {
                    if (event.source === 'devotion') {
                      setSelectedDevotionLesson(event);
                    } else if (event.source === 'english') {
                      setSelectedEnglishClass(event);
                    } else {
                      setSelectedSermon({ ...event });
                    }
                  }}
                  onEventDragStart={setDraggedEvent}
                  onEventDragEnd={() => setDraggedEvent(null)}
                  onDayDrop={handleDrop}
                  draggedEvent={draggedEvent}
                  getHolidaysForDate={getHolidaysForDate}
                />
              </div>
            ) : (
            <>
            {/* Calendar Controls */}
            <div className="p-3 sm:p-4 border-b border-sage/10 bg-gradient-to-r from-sage-50/50 to-white/50 relative">
              {/* Month/Year Navigation - Truly Centered */}
              <div className="flex items-center justify-center gap-2 sm:gap-3">
                <button
                  onClick={() => navigateMonth(-1)}
                  className="w-9 h-9 sm:w-10 sm:h-10 flex items-center justify-center hover:bg-white rounded-lg transition-colors text-lg sm:text-xl"
                >
                  ◀
                </button>
                <h2
                  onClick={() => setCurrentDate(new Date())}
                  className="font-medium uppercase tracking-wider text-base sm:text-lg text-ink/60 min-w-32 sm:min-w-48 text-center cursor-pointer hover:text-ink transition-colors"
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

              {/* Left - Unscheduled button (desktop only, absolute) */}
              <div className="hidden sm:flex items-center absolute left-3 sm:left-4 top-1/2 -translate-y-1/2">
                {unscheduledSermons.length > 0 && (
                  <button
                    onClick={() => setShowUnscheduled(!showUnscheduled)}
                    className={`px-3 py-2 rounded-full text-sm font-medium transition-all ${
                      showUnscheduled
                        ? 'btn-glossy-sage'
                        : 'btn-glass'
                    }`}
                  >
                    📋 Unscheduled ({unscheduledSermons.length})
                  </button>
                )}
              </div>

              {/* Filter Icons - absolute right */}
              <div className="flex items-center gap-1.5 absolute right-3 sm:right-4 top-1/2 -translate-y-1/2">
                <button
                  onClick={() => setFilterBenjamin(!filterBenjamin)}
                  className={`w-8 h-8 sm:w-9 sm:h-9 rounded-full flex items-center justify-center text-base sm:text-lg transition-all shadow-sm ${
                    filterBenjamin
                      ? 'bg-sage-500 text-white ring-2 ring-sage-300'
                      : 'bg-white/80 hover:bg-white'
                  }`}
                  title={filterBenjamin ? "Show all entries" : "Show only Benjamin's entries"}
                >
                  👨‍🏫
                </button>

                <button
                  onClick={() => setHidePrepared(!hidePrepared)}
                  className={`w-8 h-8 sm:w-9 sm:h-9 rounded-full flex items-center justify-center text-base sm:text-lg transition-all shadow-sm ${
                    hidePrepared
                      ? 'bg-sage-500 text-white ring-2 ring-sage-300'
                      : 'bg-white/80 hover:bg-white'
                  }`}
                  title={hidePrepared ? "Show all sermons" : "Show only unprepared sermons"}
                >
                  {hidePrepared ? '☑️' : '✅'}
                </button>
              </div>
            </div>

            {/* Mobile-only: Unscheduled button */}
            {unscheduledSermons.length > 0 && (
              <div className="sm:hidden px-3 py-2 border-b border-sage/10 bg-gradient-to-r from-sage-50/50 to-white/50">
                <button
                  onClick={() => setShowUnscheduled(!showUnscheduled)}
                  className={`w-full px-3 py-2 rounded-full text-sm font-medium transition-all ${
                    showUnscheduled
                      ? 'btn-glossy-sage'
                      : 'btn-glass'
                  }`}
                >
                  📋 Unscheduled ({unscheduledSermons.length})
                </button>
              </div>
            )}

            {/* Calendar Grid with optional sidebar */}
            <div className={`flex ${showUnscheduled ? 'flex-col lg:flex-row' : ''}`}>
              {/* Main Calendar */}
              <div className={`p-2 sm:p-4 ${showUnscheduled ? 'flex-1' : 'w-full'}`}>
              {/* Day Headers with week indicator space */}
              <div className="flex mb-1 sm:mb-2">
                <div className="w-6 sm:w-7 flex-shrink-0" /> {/* Space for week indicators - matches .week-indicator width */}
                <div className="grid grid-cols-7 gap-0.5 sm:gap-1 flex-1">
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
              </div>

              {/* Calendar Weeks with Week Indicators */}
              <div className="space-y-0.5 sm:space-y-1">
                {getCalendarWeeks(daysInMonth, startingDay, year, month).map((week, weekIndex) => {
                  // Find first actual day in the week to calculate week number
                  const firstDayInWeek = week.find(d => d !== null);
                  const weekNum = firstDayInWeek
                    ? getWeekNumber(new Date(year, month, firstDayInWeek))
                    : null;

                  // Check if this week contains today
                  const todayStr = new Date().toISOString().split('T')[0];
                  const isCurrentWeek = week.some(day => {
                    if (day === null) return false;
                    return formatDateString(year, month, day) === todayStr;
                  });

                  // Check for holidays in this week
                  const firstDayDate = firstDayInWeek ? new Date(year, month, firstDayInWeek) : null;
                  const weekKey = firstDayDate ? getWeekKey(firstDayDate) : null;
                  const weekHolidays = weekKey ? getHolidaysForWeek(weekKey) : [];
                  const hasWeekHoliday = weekHolidays.length > 0;
                  const primaryWeekHoliday = weekHolidays[0];

                  return (
                    <div key={weekIndex} className={`flex ${hasWeekHoliday ? `week-row-holiday week-row-holiday--${primaryWeekHoliday.color}` : ''}`}>
                      {/* Week Number Semi-Circle Indicator */}
                      <div className={`week-indicator ${isCurrentWeek ? 'current' : ''}`}>
                        {hasWeekHoliday && (
                          <span className="week-indicator-holiday" title={weekHolidays.map(h => h.name).join(', ')}>
                            {weekHolidays.length > 1 ? (
                              <span className="week-indicator-holiday-multi">
                                {primaryWeekHoliday.emoji}
                                <span className="week-indicator-holiday-count">+{weekHolidays.length - 1}</span>
                              </span>
                            ) : (
                              primaryWeekHoliday.emoji
                            )}
                          </span>
                        )}
                        <span>{weekNum}</span>
                      </div>

                      {/* Days Grid for this week */}
                      <div className="grid grid-cols-7 gap-0.5 sm:gap-1 flex-1">
                        {week.map((day, dayIndex) => {
                          if (day === null) {
                            return (
                              <div key={`empty-${weekIndex}-${dayIndex}`} className="min-h-16 sm:min-h-24 bg-parchment/30 rounded-lg" />
                            );
                          }

                          const dateStr = formatDateString(year, month, day);
                          const events = getEventsForDate(dateStr);
                          const isSunday = dayIndex === 6; // Sunday is now at index 6 (Mon=0, Sun=6)
                          const isToday = todayStr === dateStr;

                          // Check for holidays on this specific day
                          const dayHolidays = getHolidaysForDate(dateStr);
                          const hasDayHoliday = dayHolidays.length > 0;
                          const primaryDayHoliday = dayHolidays[0];

                          return (
                            <div
                              key={day}
                              onDragOver={(e) => e.preventDefault()}
                              onDrop={() => handleDrop(dateStr)}
                              onClick={(e) => {
                                if (e.target === e.currentTarget || e.target.closest('.day-header')) {
                                  setAddDate(dateStr);
                                  setShowAddModal(true);
                                }
                              }}
                              className={`calendar-day group min-h-16 sm:min-h-24 p-1 sm:p-1.5 rounded-lg border transition-smooth cursor-pointer border-sage/20 hover:border-sage/50 ${isCurrentWeek ? 'bg-sage-100/70' : 'bg-white/50'} ${draggedEvent ? 'hover:border-sage-500 hover:bg-sage-50' : ''} ${hasDayHoliday ? `calendar-day-holiday calendar-day-holiday--${primaryDayHoliday.color}` : ''}`}
                            >
                              <div className="day-header flex items-center justify-between mb-0.5 sm:mb-1">
                                <span className="flex items-center gap-0.5">
                                  <span className={`text-xs sm:text-sm font-medium ${
                                    isToday
                                      ? 'text-white bg-sage-500 rounded-full w-5 h-5 sm:w-6 sm:h-6 flex items-center justify-center'
                                      : isSunday ? 'text-burgundy' : 'text-ink/60'
                                  }`}>
                                    {day}
                                  </span>
                                  {hasDayHoliday && (
                                    <span
                                      className="text-[0.6rem] sm:text-xs"
                                      title={dayHolidays.map(h => h.name).join(', ')}
                                    >
                                      {primaryDayHoliday.emoji}
                                    </span>
                                  )}
                                </span>
                                <button
                                  onClick={(e) => { e.stopPropagation(); setAddDate(dateStr); setShowAddModal(true); }}
                                  className="w-5 h-5 hidden sm:flex items-center justify-center text-sage-600 hover:bg-sage/20 rounded-full transition-all text-sm opacity-0 group-hover:opacity-100"
                                >
                                  +
                                </button>
                              </div>

                              <div className="space-y-0.5 sm:space-y-1">
                                {events.map(event => {
                                  // Determine display based on source
                                  const isDevotionItem = event.source === 'devotion';
                                  const isEnglishItem = event.source === 'english';
                                  const lessonType = event.lesson_type || event.properties?.lesson_type;
                                  const name = isDevotionItem
                                    ? getDevotionDisplayTitle(event)
                                    : isEnglishItem
                                    ? getEnglishClassDisplayTitle(event)
                                    : (event.sermon_name || event.properties?.sermon_name || event.title || lessonType || '—');
                                  const isPrepared = isDevotionItem
                                    ? isDevotionPrepared(event)
                                    : isEnglishItem
                                    ? isEnglishClassPrepared(event)
                                    : isPreparedSermon(event);
                                  const shouldDim = hidePrepared && isPrepared;
                                  const colorClass = isDevotionItem
                                    ? 'bg-amber-50 border-amber-300 text-amber-700 hover:bg-amber-100'
                                    : isEnglishItem
                                    ? 'bg-purple-50 border-purple-300 text-purple-700 hover:bg-purple-100'
                                    : getLessonTypeColor(lessonType);

                                  const handleClick = () => {
                                    if (isDevotionItem) {
                                      setSelectedDevotionLesson(event);
                                    } else if (isEnglishItem) {
                                      setSelectedEnglishClass(event);
                                    } else {
                                      setSelectedSermon({ ...event });
                                    }
                                  };

                                  return (
                                    <button
                                      key={event.id}
                                      draggable
                                      onDragStart={() => setDraggedEvent({ ...event, source: event.source })}
                                      onDragEnd={() => setDraggedEvent(null)}
                                      onClick={handleClick}
                                      className={`entry-card relative w-full text-left px-1 sm:px-1.5 py-0.5 sm:py-1 rounded border text-xs truncate cursor-grab active:cursor-grabbing ${colorClass} ${draggedEvent?.id === event.id ? 'opacity-50' : ''} ${shouldDim ? 'opacity-40' : ''}`}
                                    >
                                      {isPrepared && <span className="star-indicator" />}
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
                  );
                })}
              </div>
              </div>

              {/* Unscheduled Sermons Sidebar */}
              {showUnscheduled && (
                <div className="w-full lg:w-72 border-t lg:border-t-0 lg:border-l border-sage/10 p-3 sm:p-4 bg-sage-50/30 max-h-[40vh] lg:max-h-none overflow-y-auto animate-card-in">
                  <h3 className="font-medium uppercase tracking-wider text-xs text-ink/60 mb-3">
                    Unscheduled Sermons
                  </h3>

                  {readyToSchedule.length > 0 && (
                    <div className="mb-4">
                      <h4 className="font-medium uppercase tracking-wider text-[10px] text-sage-600 mb-2">Ready to Schedule</h4>
                      <div className="space-y-1">
                        {readyToSchedule.map(sermon => (
                          <div
                            key={sermon.id}
                            draggable
                            onDragStart={() => setDraggedEvent(sermon)}
                            onDragEnd={() => setDraggedEvent(null)}
                            onClick={() => setSelectedSermon({ ...sermon })}
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
                      <h4 className="font-medium uppercase tracking-wider text-[10px] text-amber-600 mb-2">Needs Preparation</h4>
                      <div className="space-y-1">
                        {needsPreparation.map(sermon => (
                          <div
                            key={sermon.id}
                            draggable
                            onDragStart={() => setDraggedEvent(sermon)}
                            onDragEnd={() => setDraggedEvent(null)}
                            onClick={() => setSelectedSermon({ ...sermon })}
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

            {/* Upcoming Holidays Info Box */}
            <div className="px-2 sm:px-4">
              <UpcomingHolidays getUpcoming={getUpcoming} weeksAhead={6} />
              <button
                onClick={openManagement}
                className="mt-2 text-xs text-ink/40 hover:text-ink/70 transition-colors flex items-center gap-1"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
                Manage Holidays
              </button>
            </div>

            {/* Footer - View-specific content */}
            <div className={`p-3 sm:p-4 border-t ${currentView === 'devotions' ? 'border-amber/10 bg-amber-50/30' : currentView === 'combined' ? 'border-slate/10 bg-slate-50/30' : 'border-sage/10 bg-sage-50/30'} text-xs sm:text-sm`}>
              {/* Sermons View Footer */}
              {currentView === 'sermons' && (
                <>
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-medium uppercase tracking-wider text-[10px] text-ink/50">Legend</span>
                    <button
                      onClick={() => setShowShiftModal(true)}
                      className="px-3 sm:px-4 py-1.5 sm:py-2 bg-white/80 hover:bg-white text-ink/70 hover:text-ink rounded-full text-xs sm:text-sm font-medium transition-all shadow-sm"
                    >
                      Move Sermons
                    </button>
                  </div>
                  <div className="flex items-center gap-3 sm:gap-4 flex-wrap">
                    <div className="flex items-center gap-1.5">
                      <div className="w-3 h-3 rounded bg-sage-100 border border-sage-400" />
                      <span className="text-ink/70">Sermon</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <div className="w-3 h-3 rounded bg-sky-50 border border-sky-300" />
                      <span className="text-ink/70">Bible Lesson</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <div className="w-3 h-3 rounded bg-teal-50 border border-teal-300" />
                      <span className="text-ink/70">Short English</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <div className="w-3 h-3 rounded bg-amber-50 border border-amber-300" />
                      <span className="text-ink/70">Devotional</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <div className="w-3 h-3 rounded bg-violet-50 border border-violet-300" />
                      <span className="text-ink/70">Children's</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <div className="w-3 h-3 rounded bg-rose-50 border border-rose-300" />
                      <span className="text-ink/70">Video</span>
                    </div>
                  </div>
                </>
              )}

              {/* Devotions View Footer */}
              {currentView === 'devotions' && (
                <div className="flex items-center justify-between">
                  <div className="flex-1">
                    {activeDevotionSeries ? (
                      <div className="flex items-center gap-3">
                        <div>
                          <div className="text-[10px] font-medium uppercase tracking-wider text-amber-600 mb-0.5">Active Series</div>
                          <div className="font-semibold text-ink">{activeDevotionSeries.title}</div>
                          {activeDevotionSeries.what_days_of_the_week && (
                            <div className="text-[10px] text-ink/50 mt-0.5">
                              {Array.isArray(activeDevotionSeries.what_days_of_the_week)
                                ? activeDevotionSeries.what_days_of_the_week.join(', ')
                                : activeDevotionSeries.what_days_of_the_week}
                            </div>
                          )}
                        </div>
                      </div>
                    ) : (
                      <div className="text-ink/50">No active series</div>
                    )}
                  </div>
                  <button
                    onClick={() => setShowPlanMonthModal(true)}
                    className="px-3 sm:px-4 py-1.5 sm:py-2 btn-themed text-xs sm:text-sm"
                  >
                    Schedule Next 30 Days
                  </button>
                </div>
              )}

              {/* English View Footer */}
              {currentView === 'english' && (
                <div className="flex items-center justify-between">
                  <div className="flex-1">
                    {activeEnglishSeries ? (
                      <div className="flex items-center gap-3">
                        <div>
                          <div className="text-[10px] font-medium uppercase tracking-wider text-purple-600 mb-0.5">Active Series</div>
                          <div className="font-semibold text-ink">{activeEnglishSeries.title}</div>
                          {activeEnglishSeries.what_days_of_the_week && (
                            <div className="text-[10px] text-ink/50 mt-0.5">
                              {Array.isArray(activeEnglishSeries.what_days_of_the_week)
                                ? activeEnglishSeries.what_days_of_the_week.join(', ')
                                : activeEnglishSeries.what_days_of_the_week}
                            </div>
                          )}
                        </div>
                      </div>
                    ) : (
                      <div className="text-ink/50">No active series</div>
                    )}
                  </div>
                  <button
                    onClick={() => setShowPlanMonthModal(true)}
                    className="px-3 sm:px-4 py-1.5 sm:py-2 btn-themed text-xs sm:text-sm"
                  >
                    Schedule Next 30 Days
                  </button>
                </div>
              )}

              {/* Combined View Footer */}
              {currentView === 'combined' && (
                <div className="flex items-center gap-4 sm:gap-6">
                  <div className="flex items-center gap-1.5">
                    <div className="w-3 h-3 rounded bg-sage-100 border border-sage-400" />
                    <span className="text-ink/70">Sermons</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <div className="w-3 h-3 rounded bg-amber-100 border border-amber-400" />
                    <span className="text-ink/70">Devotions</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs">⭐</span>
                    <span className="text-ink/70">Prepared</span>
                  </div>
                </div>
              )}
            </div>
            </>
            )}
          </div>
        )}

        {/* Review Tab */}
        {activeTab === 'review' && (
          <div className="glass-card p-3 sm:p-6 mb-4 sm:mb-6 animate-card-in">
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
                        remarkPlugins={[remarkGfm]}
                        components={{
                          a: ({node, ...props}) => <a {...props} className="text-burgundy hover:underline break-words" target="_blank" rel="noopener noreferrer" />,
                          img: () => null,
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
                          table: ({node, ...props}) => <table {...props} className="w-full border-collapse my-3 text-xs" />,
                          thead: ({node, ...props}) => <thead {...props} className="bg-sage-100" />,
                          tbody: ({node, ...props}) => <tbody {...props} />,
                          tr: ({node, ...props}) => <tr {...props} className="border-b border-sage-200" />,
                          th: ({node, ...props}) => <th {...props} className="text-left p-2 font-semibold text-ink/80" />,
                          td: ({node, ...props}) => <td {...props} className="p-2 text-ink/70" />,
                        }}
                      >
                        {(currentSermon.content || currentSermon.contentMarkdown || currentSermon.properties?.content || 'No content preview available.')
                          .replace(/<highlight[^>]*>/gi, '**')
                          .replace(/<\/highlight>/gi, '**')
                          .replace(/<callout[^>]*>/gi, '\n> ')
                          .replace(/<\/callout>/gi, '\n')
                          .replace(/<[^>]+>/g, '')
                          .replace(/\*{4,}/g, '**')
                          .replace(/\*\*\s*\*\*/g, '')
                          .replace(/^-\s+(#{1,6})\s+/gm, '$1 ')
                          .replace(/^\s*-\s+(#{1,6})\s+/gm, '$1 ')
                        }
                      </Markdown>
                    </div>

                    <div className="flex flex-col sm:flex-row gap-2 mt-3 sm:mt-4 flex-shrink-0">
                      <button
                        onClick={handleAnalyzeSermon}
                        disabled={isAnalyzing || isSaving}
                        className="flex-1 py-2.5 sm:py-3 btn-glossy text-sm sm:text-base disabled:opacity-50 flex items-center justify-center gap-2"
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
                        className="flex-1 py-2.5 sm:py-3 btn-glossy-sage text-sm sm:text-base disabled:opacity-50 flex items-center justify-center gap-2"
                      >
                        {isSaving ? 'Saving...' : '✓ Mark Complete'}
                      </button>
                    </div>
                  </div>

                  {/* Recommendations */}
                  <div className="bg-blue-50/50 rounded-lg sm:rounded-xl p-3 sm:p-4 border border-blue-200/50 flex flex-col max-h-[50vh] sm:max-h-[calc(100vh-250px)]">
                    <h3 className="font-medium uppercase tracking-wider text-xs text-ink/60 mb-2 sm:mb-3">
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
                            className="w-full input-glass text-sm"
                          />
                        </div>

                        {/* Notes - not changed by AI */}
                        <div>
                          <label className="block text-xs font-medium text-ink/70 mb-1">Notes</label>
                          <textarea
                            value={editedRecommendations.notes || ''}
                            onChange={(e) => setEditedRecommendations(prev => ({ ...prev, notes: e.target.value }))}
                            rows={2}
                            className="w-full input-glass text-sm resize-y"
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
                            className="w-full input-glass text-sm"
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
                            className="w-full input-glass text-sm"
                          />
                        </div>

                        <div>
                          <label className="block text-xs font-medium text-ink/70 mb-1">Hashtags</label>
                          <input
                            type="text"
                            value={editedRecommendations.hashtags || ''}
                            onChange={(e) => setEditedRecommendations(prev => ({ ...prev, hashtags: e.target.value }))}
                            className="w-full input-glass text-sm"
                            placeholder="#topic/faith, #topic/obedience"
                          />
                        </div>
                      </div>

                      <div className="flex flex-col sm:flex-row gap-2 pt-4 mt-auto">
                        <button
                          onClick={handleApprove}
                          disabled={isSaving}
                          className="flex-1 py-2.5 btn-glossy text-sm disabled:opacity-50"
                        >
                          {isSaving ? 'Saving...' : '✓ Approve'}
                        </button>
                        <button
                          onClick={handleApproveAndComplete}
                          disabled={isSaving}
                          className="flex-1 py-2.5 btn-glossy-sage text-sm disabled:opacity-50"
                        >
                          {isSaving ? 'Saving...' : '✓ Approve & Complete'}
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
                  className="mt-4 px-6 py-2 btn-glossy"
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
          <h3 className="font-medium uppercase tracking-wider text-xs text-ink/60 mb-4">Edit Entry</h3>
          <EntryForm
            entry={editingEntry}
            onChange={setEditingEntry}
            onSave={() => handleSaveEntry(editingEntry)}
            onDelete={() => handleDeleteEntry(editingEntry.id)}
            onCancel={() => setEditingEntry(null)}
            isSaving={isSaving}
            showDelete
            seriesOptions={seriesOptions}
            craftDeepLink={import.meta.env.VITE_CRAFT_SPACE_ID && editingEntry.id && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(editingEntry.id) ? `craftdocs://open?blockId=${editingEntry.id}&spaceId=${import.meta.env.VITE_CRAFT_SPACE_ID}` : null}
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
          <h3 className="font-medium uppercase tracking-wider text-xs text-ink/60 mb-4">Add New Entry</h3>
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
          <h3 className="font-medium uppercase tracking-wider text-xs text-ink/60 mb-4">Move Sermons</h3>
          <ShiftForm
            onShift={handleShift}
            onCancel={() => setShowShiftModal(false)}
            isSaving={isSaving}
          />
        </Modal>
      )}

      {/* Devotion Lesson Detail Popup */}
      <ItemDetailPopup
        item={selectedDevotionLesson}
        source="devotion"
        isOpen={!!selectedDevotionLesson}
        onClose={() => setSelectedDevotionLesson(null)}
        onUpdate={(updatedItem) => {
          // Update the lesson in the local state
          setDevotionLessons(prev =>
            prev.map(lesson =>
              lesson.id === updatedItem.id ? updatedItem : lesson
            )
          );
          showToast('Devotion lesson updated', 'success');
        }}
        onEdit={(item) => {
          // For now, just show a toast - full edit modal can be added later
          showToast('Edit functionality coming soon', 'info');
        }}
      />

      {/* English Class Detail Popup */}
      <ItemDetailPopup
        item={selectedEnglishClass}
        source="english"
        isOpen={!!selectedEnglishClass}
        onClose={() => setSelectedEnglishClass(null)}
        onUpdate={(updatedItem) => {
          // Update the class in the local state
          setEnglishClasses(prev =>
            prev.map(englishClass =>
              englishClass.id === updatedItem.id ? updatedItem : englishClass
            )
          );
          showToast('English class updated', 'success');
        }}
        onEdit={(item) => {
          // For now, just show a toast - full edit modal can be added later
          showToast('Edit functionality coming soon', 'info');
        }}
      />

      {/* Sermon Detail Popup */}
      <ItemDetailPopup
        item={selectedSermon}
        source="sermon"
        isOpen={!!selectedSermon}
        onClose={() => setSelectedSermon(null)}
        onUpdate={(updatedItem) => {
          // Update the sermon in the local state
          setSchedule(prev =>
            prev.map(sermon =>
              sermon.id === updatedItem.id ? updatedItem : sermon
            )
          );
          showToast('Sermon updated', 'success');
        }}
        onEdit={(item) => {
          // Close detail popup and open edit form
          setSelectedSermon(null);
          setEditingEntry({ ...item });
        }}
      />

      {/* Plan Month Modal for Devotions and English */}
      <PlanMonthModal
        isOpen={showPlanMonthModal}
        onClose={() => setShowPlanMonthModal(false)}
        currentView={currentView}
        activeSeries={currentView === 'english' ? activeEnglishSeries : activeDevotionSeries}
        lessons={currentView === 'english' ? englishClasses : devotionLessons}
        onPlanComplete={(result) => {
          if (currentView === 'english') {
            loadEnglish(true);
            showToast(`Scheduled ${result.scheduled || 'classes'} for the next 30 days`, 'success');
          } else {
            loadDevotions(true);
            showToast(`Scheduled ${result.scheduled || 'lessons'} for the next 30 days`, 'success');
          }
        }}
      />

      {/* Holiday Management Modal */}
      <HolidayManagementModal
        isOpen={isManagementOpen}
        onClose={closeManagement}
        allHolidayRules={allHolidayRules}
        customHolidays={customHolidays}
        getHolidaysForYear={getHolidaysForYear}
        onAddHoliday={addCustomHoliday}
        onDeleteHoliday={deleteCustomHoliday}
      />

      {/* Mobile Bottom Navigation - Only visible on mobile, hidden when modal is open */}
      {!editingEntry && !showAddModal && !showShiftModal && !selectedDevotionLesson && !selectedSermon && !showPlanMonthModal && (
      <nav className="mobile-bottom-nav md:hidden fixed bottom-4 left-1/2 -translate-x-1/2 z-50">
        <div className="flex items-center gap-1 bg-slate-900/95 backdrop-blur-lg rounded-full px-2 py-2 shadow-2xl">
          <button
            onClick={() => setActiveTab('calendar')}
            className={`flex items-center gap-1.5 px-4 py-2.5 rounded-full text-sm font-medium transition-all ${
              activeTab === 'calendar'
                ? 'bg-slate-700/80 text-white'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <span className="text-base">📅</span>
            <span>Calendar</span>
          </button>
          <button
            onClick={() => setActiveTab('review')}
            className={`flex items-center gap-1.5 px-4 py-2.5 rounded-full text-sm font-medium transition-all ${
              activeTab === 'review'
                ? 'bg-slate-700/80 text-white'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <span className="text-base">📝</span>
            <span>Review</span>
            {sermonsNeedingInfo.length > 0 && (
              <span className="bg-sage-500 text-white text-xs px-1.5 py-0.5 rounded-full ml-0.5">
                {sermonsNeedingInfo.length}
              </span>
            )}
          </button>
        </div>
      </nav>
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
      className="modal-backdrop fixed inset-0 bg-black/30 flex items-center justify-center z-[60] px-3 py-4 sm:p-4"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="modal-glass p-4 sm:p-6 w-full max-w-[min(calc(100vw-1.5rem),28rem)] max-h-[85vh] sm:max-h-[90vh] overflow-y-auto overflow-x-hidden box-border">
        {children}
      </div>
    </div>
  );
}

function EntryForm({ entry, onChange, onSave, onDelete, onCancel, isSaving, showDelete, seriesOptions = [], onAddSeries, craftDeepLink }) {
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
          className="w-full input-glass text-sm sm:text-base"
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
          className="w-full select-glass text-sm sm:text-base"
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
          className="w-full select-glass text-sm sm:text-base"
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
          className="w-full input-glass text-sm sm:text-base"
        />
      </div>

      <div>
        <label className="block text-xs sm:text-sm font-medium text-ink/70 mb-1">Special Event</label>
        <select
          value={getValue('special_event')}
          onChange={(e) => updateField('special_event', e.target.value)}
          className="w-full select-glass text-sm sm:text-base"
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
          className="w-full select-glass text-sm sm:text-base"
        >
          <option value="">Select...</option>
          <option value="Draft">Draft</option>
          <option value="in progress">In Progress</option>
          <option value="Complete">Complete</option>
          <option value="Ready to Preach">Ready to Preach</option>
          <option value="archive">Archive</option>
        </select>
      </div>

      <div>
        <label className="block text-xs sm:text-sm font-medium text-ink/70 mb-1">Notes</label>
        <textarea
          value={getValue('notes')}
          onChange={(e) => updateField('notes', e.target.value)}
          rows={2}
          className="w-full input-glass text-sm sm:text-base resize-y"
          placeholder="Quick notes about this entry..."
        />
      </div>

      {/* Open in Craft Link */}
      {craftDeepLink && (
        <a
          href={craftDeepLink}
          className="flex items-center justify-center gap-2 w-full py-2.5 text-sm font-medium rounded-full transition-all bg-gradient-to-r from-sage-100 to-sage-50 text-sage-700 hover:from-sage-200 hover:to-sage-100"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
          </svg>
          Open in Craft
        </a>
      )}

      <div className="flex flex-col sm:flex-row gap-2 sm:gap-3 pt-3">
        <button
          onClick={onSave}
          disabled={isSaving}
          className="w-full sm:flex-1 py-2.5 btn-glossy text-sm sm:text-base disabled:opacity-50"
        >
          {isSaving ? 'Saving...' : 'Save'}
        </button>
        <button
          onClick={onCancel}
          className="w-full sm:flex-1 py-2.5 btn-glass text-sm sm:text-base"
        >
          Cancel
        </button>
      </div>

      {showDelete && (
        <button
          onClick={onDelete}
          disabled={isSaving}
          className="w-full py-2 text-burgundy hover:bg-burgundy/10 rounded-full text-sm transition-all"
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
          className="w-full input-glass text-sm sm:text-base"
          placeholder="Sermon name..."
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
          className="w-full select-glass text-sm sm:text-base"
        >
          {LESSON_TYPE_OPTIONS.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
      </div>

      <div>
        <label className="block text-xs sm:text-sm font-medium text-ink/70 mb-1">Preacher</label>
        <select
          value={entry.preacher}
          onChange={(e) => setEntry(prev => ({ ...prev, preacher: e.target.value }))}
          className="w-full select-glass text-sm sm:text-base"
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
          className="w-full input-glass text-sm sm:text-base"
        />
      </div>

      <div>
        <label className="block text-xs sm:text-sm font-medium text-ink/70 mb-1">Special Event</label>
        <select
          value={entry.special_event}
          onChange={(e) => setEntry(prev => ({ ...prev, special_event: e.target.value }))}
          className="w-full select-glass text-sm sm:text-base"
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
          className="w-full select-glass text-sm sm:text-base"
        >
          <option value="Draft">Draft</option>
          <option value="in progress">In Progress</option>
          <option value="Complete">Complete</option>
          <option value="Ready to Preach">Ready to Preach</option>
          <option value="archive">Archive</option>
        </select>
      </div>

      <div>
        <label className="block text-xs sm:text-sm font-medium text-ink/70 mb-1">Notes</label>
        <textarea
          value={entry.notes}
          onChange={(e) => setEntry(prev => ({ ...prev, notes: e.target.value }))}
          rows={2}
          className="w-full input-glass text-sm sm:text-base resize-y"
          placeholder="Quick notes about this entry..."
        />
      </div>

      <div className="flex flex-col sm:flex-row gap-2 sm:gap-3 pt-3">
        <button
          onClick={() => onSave(entry)}
          disabled={isSaving}
          className="w-full sm:flex-1 py-2.5 btn-glossy-sage text-sm sm:text-base disabled:opacity-50"
        >
          {isSaving ? 'Adding...' : 'Add Entry'}
        </button>
        <button
          onClick={onCancel}
          className="w-full sm:flex-1 py-2.5 btn-glass text-sm sm:text-base"
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
          className="w-full input-glass text-sm sm:text-base"
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
          className="w-full input-glass text-sm sm:text-base"
        />
      </div>

      <div>
        <label className="block text-xs sm:text-sm font-medium text-ink/70 mb-1">What to Shift</label>
        <select
          value={scope}
          onChange={(e) => setScope(e.target.value)}
          className="w-full select-glass text-sm sm:text-base"
        >
          <option value="all">All Sermons</option>
          <option value="benjamin">Benjamin's Sermons Only</option>
        </select>
      </div>

      <div className="flex flex-col sm:flex-row gap-2 sm:gap-3 pt-2">
        <button
          onClick={() => onShift(fromDate, weeks, scope)}
          disabled={isSaving || !fromDate}
          className="w-full sm:flex-1 py-2.5 bg-sage-100 hover:bg-sage-200 text-sage-700 rounded-full text-sm sm:text-base font-medium transition-all disabled:opacity-50"
        >
          {isSaving ? 'Moving...' : 'Move Sermons'}
        </button>
        <button
          onClick={onCancel}
          className="w-full sm:flex-1 py-2.5 btn-glass text-sm sm:text-base"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
