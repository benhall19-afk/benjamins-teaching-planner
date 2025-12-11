import React, { useState, useEffect, useMemo, useCallback } from 'react';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import * as api from './api';
import {
  SERIES_OPTIONS, THEME_OPTIONS, AUDIENCE_OPTIONS, SEASON_OPTIONS,
  LESSON_TYPE_OPTIONS, PREACHERS, SPECIAL_EVENTS,
  MONTH_NAMES, DAY_NAMES, getAllHashtags
} from './constants';
import { VIEWS, isSermonPrepared, isDevotionPrepared, getDevotionDisplayTitle, isEnglishClassPrepared, isEnglishClassCompleted, getEnglishClassDisplayTitle, isRelationshipMeetupPrepared, getRelationshipMeetupDisplayTitle, daysSince, formatDaysSince } from './viewConfig';
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
    <div className={`toast fixed bottom-4 right-4 ${bgColor} text-white px-4 py-3 rounded-lg shadow-lg z-[100] flex items-center gap-2`}>
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

  // Count items per series (sermons, devotion lessons, or English classes)
  const itemCountBySeries = useMemo(() => {
    if (isDevotionView) {
      // For devotions, count from the series data directly (already computed)
      return series.reduce((acc, s) => {
        if (s.isDevotionSeries) {
          acc[s.id] = {
            total: s.lessonCount || 0,
            complete: s.completedCount || 0,
            bufferDays: s.bufferDays,
            items: []
          };
        }
        // For English series, use prepared/assigned counts
        if (s.isEnglishSeries) {
          acc[s.id] = {
            prepared: s.preparedCount || 0,
            assigned: s.assignedCount || 0,
            total: s.classCount || 0,
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
      <div className="relative">
        {(() => {
          // Single line with overlap detection for ALL views
          // Calculate positions for all series
          const seriesPositions = seriesWithDates.map(s => {
            const startPos = getPositionForDate(s.startDate);
            const endPos = getPositionForDate(s.endDate);
            return { series: s, startPos, endPos };
          }).filter(sp => sp.startPos !== null && sp.endPos !== null && sp.startPos < 100 && sp.endPos > 0);

          // Find overlapping regions
          const findOverlaps = () => {
            const overlaps = [];
            for (let i = 0; i < seriesPositions.length; i++) {
              for (let j = i + 1; j < seriesPositions.length; j++) {
                const a = seriesPositions[i];
                const b = seriesPositions[j];
                const overlapStart = Math.max(a.startPos, b.startPos);
                const overlapEnd = Math.min(a.endPos, b.endPos);
                if (overlapStart < overlapEnd) {
                  overlaps.push({
                    left: overlapStart,
                    width: overlapEnd - overlapStart,
                    series: [a.series, b.series]
                  });
                }
              }
            }
            return overlaps;
          };

          const overlaps = findOverlaps();

          return (
            <div className="relative h-7">
              {/* Overlap indicators */}
              {overlaps.map((overlap, idx) => (
                <div
                  key={`overlap-${idx}`}
                  className="absolute -top-5 text-center"
                  style={{
                    left: `${overlap.left}%`,
                    width: `${overlap.width}%`
                  }}
                >
                  <span className="text-xs" title={`Overlap: ${overlap.series.map(s => s.title).join(' & ')}`}>
                    ⚡
                  </span>
                </div>
              ))}

              {/* Series bars on single line */}
              {seriesPositions.map(({ series: s, startPos, endPos }) => {
                const counts = itemCountBySeries[s.id] || { prepared: 0, assigned: 0, total: 0, complete: 0, items: [] };
                const totalSundays = getSundaysInRange(s.startDate, s.endDate);
                const width = Math.max(5, endPos - startPos);
                const left = Math.max(0, startPos);

                // Check if this series overlaps with any other
                const hasOverlap = overlaps.some(o => o.series.some(os => os.id === s.id));

                // Determine series type
                const isDevSeries = s.isDevotionSeries;
                const isEngSeries = s.isEnglishSeries;

                // Use different colors based on series type, overlap and selection
                // Theme colors: Sermons = sage, Devotions = amber, English = purple
                let barColor;
                if (selectedSeries?.id === s.id) {
                  // Selected state
                  if (isEngSeries) {
                    barColor = 'bg-purple-600 ring-2 ring-purple-300';
                  } else if (isDevSeries) {
                    barColor = 'bg-amber-600 ring-2 ring-amber-300';
                  } else {
                    barColor = 'bg-sage-600 ring-2 ring-sage-300';
                  }
                } else if (hasOverlap) {
                  // Overlap state with gradient
                  if (isEngSeries) {
                    barColor = 'bg-gradient-to-r from-purple-500 via-pink-500 to-purple-500 hover:from-purple-600 hover:via-pink-600 hover:to-purple-600';
                  } else if (isDevSeries) {
                    barColor = 'bg-gradient-to-r from-amber-500 via-rose-500 to-amber-500 hover:from-amber-600 hover:via-rose-600 hover:to-amber-600';
                  } else {
                    barColor = 'bg-gradient-to-r from-sage-500 via-amber-500 to-sage-500 hover:from-sage-600 hover:via-amber-600 hover:to-sage-600';
                  }
                } else {
                  // Normal state
                  if (isEngSeries) {
                    barColor = 'bg-purple-500 hover:bg-purple-600';
                  } else if (isDevSeries) {
                    barColor = 'bg-amber-500 hover:bg-amber-600';
                  } else {
                    barColor = 'bg-sage-500 hover:bg-sage-600';
                  }
                }

                // Determine count display based on series type
                let countDisplay;
                if (isEngSeries) {
                  // English: prepared/assigned
                  countDisplay = `(${counts.prepared}/${counts.assigned})`;
                } else if (isDevSeries) {
                  // Devotions: complete/total with buffer days
                  const bufferPart = counts.bufferDays !== null && counts.bufferDays !== undefined
                    ? ` ${counts.bufferDays >= 0 ? '+' : ''}${counts.bufferDays}`
                    : '';
                  countDisplay = `(${counts.complete}/${counts.total})${bufferPart}`;
                } else {
                  // Sermons: total/totalSundays
                  countDisplay = `(${counts.total}/${totalSundays})`;
                }

                return (
                  <div
                    key={s.id}
                    className="series-bar absolute h-7 cursor-pointer group"
                    style={{
                      left: `${left}%`,
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
                        {countDisplay}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          );
        })()}

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
            const counts = itemCountBySeries[selectedSeries.id] || { total: 0, complete: 0, prepared: 0, assigned: 0, items: [] };
            const isDevSeries = selectedSeries.isDevotionSeries;
            const isEngSeries = selectedSeries.isEnglishSeries;
            const totalSlots = isDevSeries ? counts.total : getSundaysInRange(selectedSeries.startDate, selectedSeries.endDate);

            // Calculate progress based on series type
            let progress = 0;
            if (isEngSeries) {
              progress = counts.assigned > 0 ? Math.round((counts.prepared / counts.assigned) * 100) : 0;
            } else if (isDevSeries) {
              progress = counts.total > 0 ? Math.round((counts.complete / counts.total) * 100) : 0;
            } else {
              progress = totalSlots > 0 ? Math.round((counts.total / totalSlots) * 100) : 0;
            }

            return (
              <>
                <div className="text-sm text-ink/80 mb-2">
                  {isEngSeries
                    ? `${counts.prepared} of ${counts.assigned} classes prepared`
                    : isDevSeries
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

                {/* Item list (sermons only, devotions and English don't have detailed list here) */}
                {!isDevSeries && !isEngSeries && counts.items.length > 0 && (
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
  const [editingEnglishClass, setEditingEnglishClass] = useState(null);
  const [showAddEnglishModal, setShowAddEnglishModal] = useState(false);
  const [addEnglishDate, setAddEnglishDate] = useState(null);
  const [showAddDevotionModal, setShowAddDevotionModal] = useState(false);
  const [addDevotionDate, setAddDevotionDate] = useState(null);

  // Relationships data state
  const [relationshipMeetups, setRelationshipMeetups] = useState([]);
  const [discipleContacts, setDiscipleContacts] = useState([]);
  const [familyContacts, setFamilyContacts] = useState([]);
  const [supportingPastorContacts, setSupportingPastorContacts] = useState([]);
  const [spirituallyInterestedContacts, setSpirituallyInterestedContacts] = useState([]);
  const [spiritualLessons, setSpiritualLessons] = useState([]);
  const [relationshipsLoading, setRelationshipsLoading] = useState(false);
  const [selectedMeetup, setSelectedMeetup] = useState(null);
  const [showAddMeetupModal, setShowAddMeetupModal] = useState(false);
  const [addMeetupDate, setAddMeetupDate] = useState(null);
  const [addMeetupContact, setAddMeetupContact] = useState(null);
  const [editingMeetup, setEditingMeetup] = useState(null);
  // Accordion state for contact sections: 'disciple' | 'family' | 'supporting-pastor' | null
  const [openContactSection, setOpenContactSection] = useState(null);
  // Toggle to show/hide entire contacts section
  const [showContactsSection, setShowContactsSection] = useState(false);

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

  // Review state (sermons)
  const [currentSermonIndex, setCurrentSermonIndex] = useState(0);
  const [recommendations, setRecommendations] = useState(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [editedRecommendations, setEditedRecommendations] = useState({});
  const [isSaving, setIsSaving] = useState(false);

  // Review state (relationship meetups)
  const [currentMeetupReviewIndex, setCurrentMeetupReviewIndex] = useState(0);
  const [editedMeetupReview, setEditedMeetupReview] = useState({});

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
  // VIEW CHANGE HANDLER
  // ============================================

  // Handle view changes - auto-switch to calendar tab for views without review option
  const handleViewChange = (newView) => {
    setCurrentView(newView);
    // Views without review option should default to calendar tab
    if (newView === 'devotions' || newView === 'english' || newView === 'combined') {
      setActiveTab('calendar');
    }
  };

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

  // Load Relationships data on demand
  async function loadRelationships(forceRefresh = false) {
    if (!forceRefresh && relationshipMeetups.length > 0) return; // Already loaded
    setRelationshipsLoading(true);
    try {
      const [meetupsData, disciplesData, familyData, supportingPastorData, spirituallyInterestedData, lessonsData] = await Promise.all([
        api.fetchRelationshipMeetups().catch((e) => { console.error('Failed to fetch meetups:', e); return []; }),
        api.fetchDiscipleContacts(forceRefresh).catch((e) => { console.error('Failed to fetch disciples:', e); return []; }),
        api.fetchFamilyContacts(forceRefresh).catch((e) => { console.error('Failed to fetch family:', e); return []; }),
        api.fetchSupportingPastorContacts(forceRefresh).catch((e) => { console.error('Failed to fetch supporting pastors:', e); return []; }),
        api.fetchSpirituallyInterestedContacts(forceRefresh).catch((e) => { console.error('Failed to fetch spiritually interested:', e); return []; }),
        api.fetchSpiritualLessons().catch((e) => { console.error('Failed to fetch lessons:', e); return []; })
      ]);
      setRelationshipMeetups(meetupsData);
      setDiscipleContacts(disciplesData);
      setFamilyContacts(familyData);
      setSupportingPastorContacts(supportingPastorData);
      setSpirituallyInterestedContacts(spirituallyInterestedData);
      setSpiritualLessons(lessonsData);
      if (forceRefresh) {
        showToast('Contacts refreshed!', 'success');
      }
    } catch (err) {
      console.error('loadRelationships error:', err);
      showToast('Could not load relationships data.', 'error');
    }
    setRelationshipsLoading(false);
  }

  // Load data when switching views
  useEffect(() => {
    if (currentView === 'devotions' || currentView === 'combined') {
      loadDevotions();
    }
    if (currentView === 'english' || currentView === 'combined') {
      loadEnglish();
    }
    if (currentView === 'relationships' || currentView === 'combined') {
      loadRelationships();
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

  // Relationship meetups needing review (prepared === 'Prepared' and date is past)
  const meetupsNeedingReview = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    return relationshipMeetups.filter(m => {
      // Only show meetups marked as "Prepared"
      if (m.prepared !== 'Prepared') return false;

      // Only show meetups with a date in the past or today
      if (!m.when) return false;
      const meetupDate = new Date(m.when);
      meetupDate.setHours(0, 0, 0, 0);
      return meetupDate <= today;
    }).sort((a, b) => new Date(a.when) - new Date(b.when)); // Oldest first
  }, [relationshipMeetups]);

  const currentMeetupForReview = meetupsNeedingReview[currentMeetupReviewIndex];

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
        // If lessons have series_id, filter by it; otherwise associate all lessons with this series
        const seriesLessons = devotionLessons.filter(l => {
          const lessonSeriesId = l.series_id || l.properties?.series_id || l.properties?.devotions_series?.relations?.[0]?.blockId;
          // If lesson has a series_id, match it; if not, assume all lessons belong to this series (single-series case)
          return lessonSeriesId ? lessonSeriesId === s.id : true;
        });
        const scheduledDates = seriesLessons
          .map(l => l.scheduled_date)
          .filter(Boolean)
          .sort();
        const lastScheduledDate = scheduledDates.length > 0 ? scheduledDates[scheduledDates.length - 1] : null;

        const completedCount = seriesLessons.filter(l => l.last_taught).length;
        const remainingLessons = seriesLessons.length - completedCount;
        // Use series_completion_date (scheduled end) to calculate buffer days
        const endDate = s.series_completion_date || s.properties?.series_completion_date;
        const daysOfWeek = s.what_days_of_the_week || s.properties?.what_days_of_the_week || [];

        // Calculate buffer days: count how many valid teaching days exist from today to end date, minus remaining lessons
        let bufferDays = null;
        if (endDate && remainingLessons >= 0) {
          const today = new Date();
          today.setHours(0, 0, 0, 0);
          const end = new Date(endDate);
          end.setHours(0, 0, 0, 0);

          if (end >= today) {
            // Map day names to day numbers (0=Sunday, 1=Monday, etc.)
            const dayNameToNumber = {
              'sunday': 0, 'monday': 1, 'tuesday': 2, 'wednesday': 3,
              'thursday': 4, 'friday': 5, 'saturday': 6
            };
            const daysArray = Array.isArray(daysOfWeek) ? daysOfWeek : (daysOfWeek ? daysOfWeek.split(/[,\s]+/) : []);
            const validDays = daysArray
              .map(d => dayNameToNumber[d.toLowerCase().trim()])
              .filter(d => d !== undefined);

            // Count valid teaching days from today to end date (inclusive)
            let availableDays = 0;
            const current = new Date(today);
            while (current <= end) {
              if (validDays.length === 0 || validDays.includes(current.getDay())) {
                availableDays++;
              }
              current.setDate(current.getDate() + 1);
            }

            bufferDays = availableDays - remainingLessons;
          }
        }

        return {
          id: s.id,
          title: s.title,
          startDate: s.series_start_date || s.properties?.series_start_date,
          endDate: s.series_completion_date || s.properties?.series_completion_date || lastScheduledDate || s.series_start_date || s.properties?.series_start_date,
          isDevotionSeries: true,
          lessonCount: seriesLessons.length,
          completedCount,
          remainingLessons,
          bufferDays
        };
      });
  }, [devotionSeries, devotionLessons]);

  // Transform English series for timeline display
  const englishSeriesForTimeline = useMemo(() => {
    return englishSeries
      .filter(s => s.title && s.title.trim() !== '')
      .map(s => {
        // Get classes assigned to this series
        const seriesClasses = englishClasses.filter(c => c.series_id === s.id);

        // Get the series date range
        const startDate = s.series_start_date || s.properties?.series_start_date;
        const endDate = s.series_completion_date || s.properties?.series_completion_date;

        // Filter to only classes within the series timeline dates
        const classesInTimeline = seriesClasses.filter(c => {
          if (!c.class_date || !startDate || !endDate) return true; // Include if we can't filter
          const classDate = c.class_date.split('T')[0];
          return classDate >= startDate && classDate <= endDate;
        });

        // Count prepared classes (those with status 'prepared' or 'complete')
        const preparedCount = classesInTimeline.filter(c => {
          const status = c.class_status?.toLowerCase() || '';
          return status === 'prepared' || status === 'complete';
        }).length;

        // Count assigned classes (those with a class_date set)
        const assignedCount = classesInTimeline.filter(c => c.class_date).length;

        return {
          id: s.id,
          title: s.title,
          startDate: startDate,
          endDate: endDate,
          isEnglishSeries: true,
          preparedCount: preparedCount,
          assignedCount: assignedCount,
          classCount: seriesClasses.length
        };
      });
  }, [englishSeries, englishClasses]);

  // Keep index in bounds when list shrinks (after completing sermons)
  useEffect(() => {
    if (sermonsNeedingInfo.length > 0 && currentSermonIndex >= sermonsNeedingInfo.length) {
      setCurrentSermonIndex(sermonsNeedingInfo.length - 1);
    }
  }, [sermonsNeedingInfo.length, currentSermonIndex]);

  // Keep meetup review index in bounds
  useEffect(() => {
    if (meetupsNeedingReview.length > 0 && currentMeetupReviewIndex >= meetupsNeedingReview.length) {
      setCurrentMeetupReviewIndex(meetupsNeedingReview.length - 1);
    }
  }, [meetupsNeedingReview.length, currentMeetupReviewIndex]);

  // Initialize editedMeetupReview when current meetup changes
  useEffect(() => {
    if (currentMeetupForReview) {
      setEditedMeetupReview({
        when: currentMeetupForReview.when || '',
        type: currentMeetupForReview.type || '',
        purpose: currentMeetupForReview.purpose || '',
        notes: currentMeetupForReview.notes || ''
      });
    }
  }, [currentMeetupForReview]);

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

    // Get relationship meetups (for 'relationships' and 'combined' views)
    if (currentView === 'relationships' || currentView === 'combined') {
      const meetups = relationshipMeetups.filter(item => {
        if (!item.when) return false;
        const itemDate = item.when.split('T')[0];
        return itemDate === dateStr;
      }).map(item => ({ ...item, source: 'relationship' }));
      events.push(...meetups);
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

  const handleSaveEnglishClass = async (englishClass) => {
    setIsSaving(true);
    try {
      await api.updateEnglishClass(englishClass.id, {
        title: englishClass.title,
        class_date: englishClass.class_date,
        class_status: englishClass.class_status,
        notes: englishClass.notes
      });

      // Update local state
      setEnglishClasses(prev => prev.map(c => c.id === englishClass.id ? englishClass : c));
      setEditingEnglishClass(null);
      showToast('English class saved!', 'success');
    } catch (err) {
      showToast('Failed to save: ' + err.message, 'error');
    }
    setIsSaving(false);
  };

  const handleAddEnglishClass = async (newClass) => {
    setIsSaving(true);
    try {
      const result = await api.addEnglishClass(
        newClass.title,
        newClass.class_date,
        activeEnglishSeries?.id || null,
        newClass.notes
      );

      // Add to local state
      const addedClass = {
        ...newClass,
        id: result.result?.id || `temp_${Date.now()}`,
        class_status: 'Preparing',
        series_title: activeEnglishSeries?.title
      };
      setEnglishClasses(prev => [...prev, addedClass]);
      setShowAddEnglishModal(false);
      showToast('English class added!', 'success');
    } catch (err) {
      showToast('Failed to add class: ' + err.message, 'error');
    }
    setIsSaving(false);
  };

  const handleAddDevotion = async (newDevotion) => {
    setIsSaving(true);
    try {
      const result = await api.addDevotionLesson(
        newDevotion.title,
        newDevotion.week_lesson,
        newDevotion.day,
        newDevotion.scheduled_date,
        activeDevotionSeries?.id || null
      );

      // Add to local state
      const addedLesson = {
        ...newDevotion,
        id: result.result?.id || `temp_${Date.now()}`,
        prepared_to_teach: false,
        series_title: activeDevotionSeries?.title
      };
      setDevotionLessons(prev => [...prev, addedLesson]);
      setShowAddDevotionModal(false);
      showToast('Devotion lesson added!', 'success');
    } catch (err) {
      showToast('Failed to add lesson: ' + err.message, 'error');
    }
    setIsSaving(false);
  };

  const handleAddMeetup = async (newMeetup) => {
    setIsSaving(true);
    try {
      const result = await api.addRelationshipMeetup(newMeetup);

      // Add to local state
      const addedMeetup = {
        ...newMeetup,
        id: result.result?.id || `temp_${Date.now()}`,
        source: 'relationship'
      };
      setRelationshipMeetups(prev => [...prev, addedMeetup]);
      setShowAddMeetupModal(false);
      setAddMeetupContact(null);
      showToast('Meetup added!', 'success');
    } catch (err) {
      showToast('Failed to add meetup: ' + err.message, 'error');
    }
    setIsSaving(false);
  };

  const handleUpdateMeetup = async (meetupId, updates) => {
    try {
      await api.updateRelationshipMeetup(meetupId, updates);
      setRelationshipMeetups(prev =>
        prev.map(m => m.id === meetupId ? { ...m, ...updates } : m)
      );
      showToast('Meetup updated!', 'success');
    } catch (err) {
      showToast('Failed to update meetup: ' + err.message, 'error');
    }
  };

  const handleDeleteMeetup = async (meetupId) => {
    try {
      await api.deleteRelationshipMeetup(meetupId);
      setRelationshipMeetups(prev => prev.filter(m => m.id !== meetupId));
      setSelectedMeetup(null);
      showToast('Meetup deleted!', 'success');
    } catch (err) {
      showToast('Failed to delete meetup: ' + err.message, 'error');
    }
  };

  const handleDrop = async (newDate) => {
    if (!draggedEvent) return;

    // Check if this is a contact drop (for creating new meetup)
    if (draggedEvent.type === 'contact') {
      setAddMeetupDate(newDate);
      setAddMeetupContact(draggedEvent.contact);
      setShowAddMeetupModal(true);
      setDraggedEvent(null);
      return;
    }

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

  // Mark meetup as complete (move from Prepared to Complete)
  const handleMarkMeetupComplete = async (saveEdits = false) => {
    if (!currentMeetupForReview) return;

    setIsSaving(true);
    try {
      const updates = { prepared: 'Complete' };

      // Optionally save any edits to notes
      if (saveEdits && editedMeetupReview.notes !== currentMeetupForReview.notes) {
        updates.notes = editedMeetupReview.notes;
      }

      await api.updateRelationshipMeetup(currentMeetupForReview.id, updates);

      // Update local state
      setRelationshipMeetups(prev => prev.map(m =>
        m.id === currentMeetupForReview.id
          ? { ...m, prepared: 'Complete', notes: saveEdits ? editedMeetupReview.notes : m.notes }
          : m
      ));

      setEditedMeetupReview({});
      showToast('Meetup marked as complete!', 'success');
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
            <ViewSwitcher currentView={currentView} onViewChange={handleViewChange} />

            {/* Tab Switcher - Emojis on mobile, text on desktop, hidden for devotions/english/combined */}
            {currentView !== 'devotions' && currentView !== 'english' && currentView !== 'combined' && (
            <div className="flex toggle-glass-container">
              {/* Sliding indicator */}
              <div
                className="toggle-glass-indicator"
                style={{
                  left: activeTab === 'calendar' ? '2px' : '50%',
                  width: 'calc(50% - 2px)',
                }}
              />
              <button
                onClick={() => setActiveTab('calendar')}
                className={`toggle-glass-btn ${activeTab === 'calendar' ? 'active' : ''}`}
              >
                <span className="md:hidden text-lg">📅</span>
                <span className="hidden md:inline">Calendar</span>
              </button>
              <button
                onClick={() => setActiveTab('review')}
                className={`toggle-glass-btn flex items-center ${activeTab === 'review' ? 'active' : ''}`}
              >
                <span className="md:hidden text-lg">📝</span>
                <span className="hidden md:inline">Review</span>
                {currentView === 'relationships' ? (
                  meetupsNeedingReview.length > 0 && (
                    <span className="bg-sage-600 text-white text-xs px-1.5 py-0.5 rounded-full ml-1 md:ml-2">
                      {meetupsNeedingReview.length}
                    </span>
                  )
                ) : (
                  sermonsNeedingInfo.length > 0 && (
                    <span className="bg-sage-600 text-white text-xs px-1.5 py-0.5 rounded-full ml-1 md:ml-2">
                      {sermonsNeedingInfo.length}
                    </span>
                  )
                )}
              </button>
            </div>
            )}
          </div>

          {/* Series Timeline - integrated into header, only on Calendar tab (not for combined or relationships view) */}
          {activeTab === 'calendar' && currentView !== 'combined' && currentView !== 'relationships' && (
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
                    onClick={() => {
                      if (currentView === 'english') {
                        setAddEnglishDate(null);
                        setShowAddEnglishModal(true);
                      } else if (currentView === 'devotions') {
                        setAddDevotionDate(null);
                        setShowAddDevotionModal(true);
                      } else {
                        setAddDate(null);
                        setShowAddModal(true);
                      }
                    }}
                    className={`w-6 h-6 rounded-full flex items-center justify-center transition-colors text-sm ${
                      currentView === 'english'
                        ? 'bg-purple/10 hover:bg-purple/20 text-purple-600'
                        : currentView === 'devotions'
                        ? 'bg-amber/10 hover:bg-amber/20 text-amber-600'
                        : 'bg-sage/10 hover:bg-sage/20 text-sage-600'
                    }`}
                    title={currentView === 'english' ? 'Add English class' : currentView === 'devotions' ? 'Add devotion lesson' : 'Add sermon'}
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

          {/* Contact Sections Accordion - only for relationships view */}
          {activeTab === 'calendar' && currentView === 'relationships' && (() => {
            // Helper to get days since last contact for a contact
            const getDaysSinceContact = (contact) => {
              const lastMeetup = relationshipMeetups
                .filter(m => m.who?.some(w => w.blockId === contact.id))
                .sort((a, b) => new Date(b.when) - new Date(a.when))[0];
              return lastMeetup?.when ? daysSince(lastMeetup.when) : null;
            };

            // Sort contacts by oldest last-contacted (null/never contacted first, then highest days)
            const sortByOldestContact = (contacts) => {
              return [...contacts].sort((a, b) => {
                const aDays = getDaysSinceContact(a);
                const bDays = getDaysSinceContact(b);
                // null (never contacted) comes first, then sort by most days
                if (aDays === null && bDays === null) return 0;
                if (aDays === null) return -1;
                if (bDays === null) return 1;
                return bDays - aDays; // Higher days (older) first
              });
            };

            // Color classes for contact types
            const contactColors = {
              disciple: 'bg-navy-50 hover:bg-navy-100 border-navy-200',
              family: 'bg-teal-50 hover:bg-teal-100 border-teal-200',
              'supporting-pastor': 'bg-violet-50 hover:bg-violet-100 border-violet-200',
              alyssa: 'bg-pink-50 hover:bg-pink-100 border-pink-200'
            };

            // Check if contact is Alyssa (case-insensitive)
            const isAlyssa = (contact) => contact.name?.toLowerCase() === 'alyssa';

            // Render a contact pill with type-based color
            const renderContactPill = (contact, type) => {
              const days = getDaysSinceContact(contact);
              // Alyssa gets special pink color regardless of which section she's in
              const colorType = isAlyssa(contact) ? 'alyssa' : type;
              const colorClass = contactColors[colorType] || contactColors.disciple;

              return (
                <div
                  key={contact.id}
                  draggable
                  onDragStart={(e) => {
                    e.dataTransfer.setData('contact', JSON.stringify(contact));
                    setDraggedEvent({ type: 'contact', contact });
                  }}
                  onDragEnd={() => setDraggedEvent(null)}
                  className={`flex items-center gap-1.5 px-2 py-1 rounded-full border cursor-grab text-xs text-ink/80 transition-colors ${colorClass}`}
                >
                  <span>👤</span>
                  <span>{contact.name}</span>
                  <span className="text-ink/40">
                    ({days !== null ? (days === 0 ? 'today' : `${days}d`) : '-'})
                  </span>
                </div>
              );
            };

            // Toggle accordion section (only one open at a time)
            const toggleSection = (section) => {
              setOpenContactSection(prev => prev === section ? null : section);
            };

            // Sorted contact lists
            const sortedDisciples = sortByOldestContact(discipleContacts);
            const sortedFamily = sortByOldestContact(familyContacts);
            const sortedSupportingPastors = sortByOldestContact(supportingPastorContacts).slice(0, 5);
            const sortedSpirituallyInterested = sortByOldestContact(spirituallyInterestedContacts);

            return (
              <div className="border-t border-navy/10">
                {/* Contacts Section Toggle Header */}
                <div className="px-4 sm:px-6 py-2 flex items-center justify-between">
                  <button
                    onClick={() => setShowContactsSection(!showContactsSection)}
                    className="flex items-center gap-1.5 text-ink/60 hover:text-ink/80 transition-colors"
                  >
                    <svg
                      className={`w-3.5 h-3.5 transition-transform duration-200 ${showContactsSection ? 'rotate-180' : ''}`}
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                    <span className="font-medium uppercase tracking-wider text-xs">Contacts</span>
                  </button>
                  {showContactsSection && (
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => loadRelationships(true)}
                        disabled={relationshipsLoading}
                        className="w-6 h-6 rounded-full flex items-center justify-center transition-colors text-sm bg-navy/10 hover:bg-navy/20 text-navy-600 disabled:opacity-50"
                        title="Refresh contacts"
                      >
                        <svg className={`w-3.5 h-3.5 ${relationshipsLoading ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                        </svg>
                      </button>
                    </div>
                  )}
                </div>

                {/* Collapsible Contacts Content */}
                <div
                  className={`overflow-hidden transition-all duration-300 ease-in-out ${
                    showContactsSection ? 'max-h-[2000px] opacity-100' : 'max-h-0 opacity-0'
                  }`}
                >
                  {/* Disciple Contacts Section */}
                  <div className="px-4 sm:px-6 py-2 flex items-center justify-between border-t border-navy/5">
                    <button
                      onClick={() => toggleSection('disciple')}
                      className="flex items-center gap-1.5 text-ink/60 hover:text-ink/80 transition-colors"
                    >
                      <svg
                        className={`w-3.5 h-3.5 transition-transform duration-200 ${openContactSection === 'disciple' ? 'rotate-180' : ''}`}
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                      <span className="font-medium uppercase tracking-wider text-xs">Disciple Contacts</span>
                    </button>
                  </div>
                  <div
                    className={`overflow-hidden transition-all duration-300 ease-in-out ${
                      openContactSection === 'disciple' ? 'max-h-96 opacity-100' : 'max-h-0 opacity-0'
                    }`}
                  >
                    <div className="px-4 sm:px-6 pb-3">
                      <div className="flex flex-wrap gap-2">
                        {sortedDisciples.map(c => renderContactPill(c, 'disciple'))}
                        {discipleContacts.length === 0 && !relationshipsLoading && (
                          <p className="text-xs text-ink/40 italic">No disciple contacts found</p>
                        )}
                        {relationshipsLoading && (
                          <p className="text-xs text-ink/40 italic">Loading contacts...</p>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Family Section */}
                  <div className="px-4 sm:px-6 py-2 flex items-center justify-between border-t border-navy/5">
                    <button
                      onClick={() => toggleSection('family')}
                      className="flex items-center gap-1.5 text-ink/60 hover:text-ink/80 transition-colors"
                    >
                      <svg
                        className={`w-3.5 h-3.5 transition-transform duration-200 ${openContactSection === 'family' ? 'rotate-180' : ''}`}
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                      <span className="font-medium uppercase tracking-wider text-xs">Family</span>
                    </button>
                  </div>
                  <div
                    className={`overflow-hidden transition-all duration-300 ease-in-out ${
                      openContactSection === 'family' ? 'max-h-96 opacity-100' : 'max-h-0 opacity-0'
                    }`}
                  >
                    <div className="px-4 sm:px-6 pb-3">
                      <div className="flex flex-wrap gap-2">
                        {sortedFamily.map(c => renderContactPill(c, 'family'))}
                        {familyContacts.length === 0 && !relationshipsLoading && (
                          <p className="text-xs text-ink/40 italic">No family contacts found</p>
                        )}
                        {relationshipsLoading && (
                          <p className="text-xs text-ink/40 italic">Loading contacts...</p>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Supporting Pastor Section */}
                  <div className="px-4 sm:px-6 py-2 flex items-center justify-between border-t border-navy/5">
                    <button
                      onClick={() => toggleSection('supporting-pastor')}
                      className="flex items-center gap-1.5 text-ink/60 hover:text-ink/80 transition-colors"
                    >
                      <svg
                        className={`w-3.5 h-3.5 transition-transform duration-200 ${openContactSection === 'supporting-pastor' ? 'rotate-180' : ''}`}
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                      <span className="font-medium uppercase tracking-wider text-xs">Supporting Pastor</span>
                      <span className="text-ink/40 text-xs">(top 5)</span>
                    </button>
                  </div>
                  <div
                    className={`overflow-hidden transition-all duration-300 ease-in-out ${
                      openContactSection === 'supporting-pastor' ? 'max-h-96 opacity-100' : 'max-h-0 opacity-0'
                    }`}
                  >
                    <div className="px-4 sm:px-6 pb-3">
                      <div className="flex flex-wrap gap-2">
                        {sortedSupportingPastors.map(c => renderContactPill(c, 'supporting-pastor'))}
                        {supportingPastorContacts.length === 0 && !relationshipsLoading && (
                          <p className="text-xs text-ink/40 italic">No supporting pastor contacts found</p>
                        )}
                        {relationshipsLoading && (
                          <p className="text-xs text-ink/40 italic">Loading contacts...</p>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Spiritually Interested Section */}
                  <div className="px-4 sm:px-6 py-2 flex items-center justify-between border-t border-navy/5">
                    <button
                      onClick={() => toggleSection('spiritually-interested')}
                      className="flex items-center gap-1.5 text-ink/60 hover:text-ink/80 transition-colors"
                    >
                      <svg
                        className={`w-3.5 h-3.5 transition-transform duration-200 ${openContactSection === 'spiritually-interested' ? 'rotate-180' : ''}`}
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                      <span className="font-medium uppercase tracking-wider text-xs">Spiritually Interested</span>
                    </button>
                  </div>
                  <div
                    className={`overflow-hidden transition-all duration-300 ease-in-out ${
                      openContactSection === 'spiritually-interested' ? 'max-h-96 opacity-100' : 'max-h-0 opacity-0'
                    }`}
                  >
                    <div className="px-4 sm:px-6 pb-3">
                      <div className="flex flex-wrap gap-2">
                        {sortedSpirituallyInterested.map(c => renderContactPill(c, 'spiritually-interested'))}
                        {spirituallyInterestedContacts.length === 0 && !relationshipsLoading && (
                          <p className="text-xs text-ink/40 italic">No spiritually interested contacts found</p>
                        )}
                        {relationshipsLoading && (
                          <p className="text-xs text-ink/40 italic">Loading contacts...</p>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            );
          })()}
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
                  relationshipMeetups={relationshipMeetups}
                  currentDate={currentDate}
                  onDateChange={setCurrentDate}
                  onEventClick={(event) => {
                    if (event.source === 'devotion') {
                      setSelectedDevotionLesson(event);
                    } else if (event.source === 'english') {
                      setSelectedEnglishClass(event);
                    } else if (event.source === 'relationship') {
                      setSelectedMeetup(event);
                    } else {
                      setSelectedSermon({ ...event });
                    }
                  }}
                  onEventDragStart={setDraggedEvent}
                  onEventDragEnd={() => setDraggedEvent(null)}
                  onDayDrop={handleDrop}
                  draggedEvent={draggedEvent}
                  getHolidaysForDate={getHolidaysForDate}
                  onPlanDay={async (dateKey, events) => {
                    try {
                      // Transform events into the format expected by the API
                      const items = events.map(event => ({
                        type: event.source,
                        title: event.displayTitle,
                        subtitle: event.source === 'sermon'
                          ? (event.preacher || event.primary_text || '')
                          : event.source === 'devotion'
                          ? (event.day ? `Day ${event.day}` : '')
                          : (event.series_title || ''),
                        id: event.id,
                        craftUrl: event.id ? `craftdocs://open?blockId=${event.id}&spaceId=${import.meta.env.VITE_CRAFT_SPACE_ID}` : null
                      }));

                      await api.planDay(dateKey, items);
                      showToast(`Added ${items.length} items to Daily Notes!`, 'success');
                    } catch (error) {
                      console.error('Failed to plan day:', error);
                      showToast('Failed to add items to Daily Notes', 'error');
                    }
                  }}
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

              {/* Filter Icons - absolute right (only for sermons view) */}
              {currentView === 'sermons' && (
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
              </div>
              )}
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
                                  if (currentView === 'english') {
                                    setAddEnglishDate(dateStr);
                                    setShowAddEnglishModal(true);
                                  } else if (currentView === 'devotions') {
                                    setAddDevotionDate(dateStr);
                                    setShowAddDevotionModal(true);
                                  } else if (currentView === 'relationships') {
                                    setAddMeetupDate(dateStr);
                                    setShowAddMeetupModal(true);
                                  } else {
                                    setAddDate(dateStr);
                                    setShowAddModal(true);
                                  }
                                }
                              }}
                              className={`calendar-day group min-h-16 sm:min-h-24 p-1 sm:p-1.5 rounded-lg border transition-smooth cursor-pointer ${isToday ? (currentView === 'english' ? 'border-purple bg-purple-100/70' : currentView === 'devotions' ? 'border-amber bg-amber-100/70' : currentView !== 'relationships' ? 'border-sage bg-sage-100/70' : '') : 'border-sage/20 bg-white/50'} hover:border-sage/50 ${draggedEvent ? 'hover:border-sage-500 hover:bg-sage-50' : ''} ${hasDayHoliday ? `calendar-day-holiday calendar-day-holiday--${primaryDayHoliday.color}` : ''}`}
                              style={isToday && currentView === 'relationships' ? { borderColor: '#627d98', backgroundColor: 'rgba(188, 204, 220, 0.7)' } : {}}
                            >
                              <div className="day-header flex items-center justify-between mb-0.5 sm:mb-1">
                                <span className="flex items-center gap-0.5">
                                  <span
                                    className={`text-xs sm:text-sm font-medium ${
                                      isToday
                                        ? `text-white ${currentView === 'english' ? 'bg-purple-500' : currentView === 'devotions' ? 'bg-amber-500' : currentView !== 'relationships' ? 'bg-sage-500' : ''} rounded-full w-5 h-5 sm:w-6 sm:h-6 flex items-center justify-center`
                                        : isSunday ? 'text-burgundy' : 'text-ink/60'
                                    }`}
                                    style={isToday && currentView === 'relationships' ? { backgroundColor: '#486581' } : {}}
                                  >
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
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    if (currentView === 'english') {
                                      setAddEnglishDate(dateStr);
                                      setShowAddEnglishModal(true);
                                    } else if (currentView === 'devotions') {
                                      setAddDevotionDate(dateStr);
                                      setShowAddDevotionModal(true);
                                    } else if (currentView === 'relationships') {
                                      setAddMeetupDate(dateStr);
                                      setShowAddMeetupModal(true);
                                    } else {
                                      setAddDate(dateStr);
                                      setShowAddModal(true);
                                    }
                                  }}
                                  className={`w-5 h-5 hidden sm:flex items-center justify-center ${currentView === 'english' ? 'text-purple-600 hover:bg-purple/20' : currentView === 'devotions' ? 'text-amber-600 hover:bg-amber/20' : currentView === 'relationships' ? 'text-navy-600 hover:bg-navy/20' : 'text-sage-600 hover:bg-sage/20'} rounded-full transition-all text-sm opacity-0 group-hover:opacity-100`}
                                >
                                  +
                                </button>
                              </div>

                              <div className="space-y-0.5 sm:space-y-1">
                                {events.map(event => {
                                  // Determine display based on source
                                  const isDevotionItem = event.source === 'devotion';
                                  const isEnglishItem = event.source === 'english';
                                  const isRelationshipItem = event.source === 'relationship';
                                  const lessonType = event.lesson_type || event.properties?.lesson_type;
                                  const name = isDevotionItem
                                    ? getDevotionDisplayTitle(event)
                                    : isEnglishItem
                                    ? getEnglishClassDisplayTitle(event)
                                    : isRelationshipItem
                                    ? getRelationshipMeetupDisplayTitle(event)
                                    : (event.sermon_name || event.properties?.sermon_name || event.title || lessonType || '—');
                                  const isPrepared = isDevotionItem
                                    ? isDevotionPrepared(event)
                                    : isEnglishItem
                                    ? isEnglishClassPrepared(event)
                                    : isRelationshipItem
                                    ? isRelationshipMeetupPrepared(event)
                                    : isPreparedSermon(event);
                                  const shouldDim = hidePrepared && isPrepared;
                                  // For relationship items, determine color based on contact's tag group
                                  // Check for Alyssa by name (includes "alyssa" since full name is "Alyssa Hall")
                                  const isAlyssaMeetup = isRelationshipItem && event.who?.some(w => {
                                    const nameFromWho = (w.title || w.name || '').toLowerCase();
                                    if (nameFromWho.includes('alyssa')) return true;
                                    // Also look up the contact from the lists to check name
                                    const contact = discipleContacts.find(c => c.id === w.blockId) ||
                                                    familyContacts.find(c => c.id === w.blockId) ||
                                                    supportingPastorContacts.find(c => c.id === w.blockId) ||
                                                    spirituallyInterestedContacts.find(c => c.id === w.blockId);
                                    const nameFromContact = (contact?.title || contact?.name || '').toLowerCase();
                                    return nameFromContact.includes('alyssa');
                                  });
                                  const isFamilyMeetup = isRelationshipItem && !isAlyssaMeetup && event.who?.some(w =>
                                    familyContacts.some(c => c.id === w.blockId)
                                  );
                                  const isPastorMeetup = isRelationshipItem && !isAlyssaMeetup && !isFamilyMeetup && event.who?.some(w =>
                                    supportingPastorContacts.some(c => c.id === w.blockId)
                                  );
                                  const isSpirituallyInterestedMeetup = isRelationshipItem && !isAlyssaMeetup && !isFamilyMeetup && !isPastorMeetup && event.who?.some(w =>
                                    spirituallyInterestedContacts.some(c => c.id === w.blockId)
                                  );
                                  const colorClass = isDevotionItem
                                    ? 'bg-amber-50 border-amber-300 text-amber-700 hover:bg-amber-100'
                                    : isEnglishItem
                                    ? 'bg-purple-50 border-purple-300 text-purple-700 hover:bg-purple-100'
                                    : isRelationshipItem
                                    ? (isAlyssaMeetup
                                        ? 'bg-pink-50 border-pink-300 text-pink-700 hover:bg-pink-100'
                                        : isFamilyMeetup
                                        ? 'bg-teal-50 border-teal-300 text-teal-700 hover:bg-teal-100'
                                        : isPastorMeetup
                                        ? 'bg-violet-50 border-violet-300 text-violet-700 hover:bg-violet-100'
                                        : isSpirituallyInterestedMeetup
                                        ? 'bg-emerald-50 border-emerald-300 text-emerald-700 hover:bg-emerald-100'
                                        : 'bg-sky-50 border-sky-300 text-sky-700 hover:bg-sky-100')
                                    : getLessonTypeColor(lessonType);

                                  const handleClick = () => {
                                    if (isDevotionItem) {
                                      setSelectedDevotionLesson(event);
                                    } else if (isEnglishItem) {
                                      setSelectedEnglishClass(event);
                                    } else if (isRelationshipItem) {
                                      setSelectedMeetup(event);
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
                className="mt-2 mb-4 text-xs text-ink/40 hover:text-ink/70 transition-colors flex items-center gap-1"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
                Manage Holidays
              </button>
            </div>

            {/* Footer - View-specific content */}
            <div className={`p-3 sm:p-4 border-t ${currentView === 'devotions' ? 'border-amber/10 bg-amber-50/30' : currentView === 'english' ? 'border-purple/10 bg-purple-50/30' : currentView === 'relationships' ? 'border-navy/10 bg-navy-50/30' : currentView === 'combined' ? 'border-slate/10 bg-slate-50/30' : 'border-sage/10 bg-sage-50/30'} text-xs sm:text-sm`}>
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

              {/* Relationships View Footer */}
              {currentView === 'relationships' && (
                <>
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-medium uppercase tracking-wider text-[10px] text-ink/50">Legend</span>
                  </div>
                  <div className="flex items-center gap-3 sm:gap-4 flex-wrap">
                    <div className="flex items-center gap-1.5">
                      <div className="w-3 h-3 rounded bg-sky-50 border border-sky-200" />
                      <span className="text-ink/70">Disciple</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <div className="w-3 h-3 rounded bg-teal-50 border border-teal-200" />
                      <span className="text-ink/70">Family</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <div className="w-3 h-3 rounded bg-violet-50 border border-violet-200" />
                      <span className="text-ink/70">Pastor</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <div className="w-3 h-3 rounded bg-emerald-50 border border-emerald-200" />
                      <span className="text-ink/70">Spiritually Interested</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <div className="w-3 h-3 rounded bg-pink-50 border border-pink-200" />
                      <span className="text-ink/70">Alyssa</span>
                    </div>
                  </div>
                </>
              )}
            </div>
            </>
            )}
          </div>
        )}

        {/* Review Tab */}
        {activeTab === 'review' && (
          <div className="glass-card p-3 sm:p-6 mb-4 sm:mb-6 animate-card-in overflow-hidden">
            {currentView === 'relationships' ? (
              /* Relationship Meetup Review */
              meetupsNeedingReview.length === 0 ? (
                <div className="text-center py-8 sm:py-12">
                  <div className="text-4xl sm:text-6xl mb-3 sm:mb-4">✅</div>
                  <h2 className="text-xl sm:text-2xl font-display font-bold text-ink">All Meetups Reviewed!</h2>
                  <p className="text-ink/60 mt-2 text-sm sm:text-base">No prepared meetups need review.</p>
                </div>
              ) : currentMeetupForReview ? (
                <div>
                  {/* Review Header */}
                  <div className="flex items-center justify-between mb-4 sm:mb-6">
                    <h2 className="text-base sm:text-xl font-display font-semibold text-ink">
                      Meetup {currentMeetupReviewIndex + 1} of {meetupsNeedingReview.length}
                    </h2>
                    <div className="flex gap-2">
                      <button
                        onClick={() => setCurrentMeetupReviewIndex(Math.max(0, currentMeetupReviewIndex - 1))}
                        disabled={currentMeetupReviewIndex === 0}
                        className="w-9 h-9 sm:w-10 sm:h-10 flex items-center justify-center hover:bg-parchment rounded-lg disabled:opacity-30 transition-colors"
                      >
                        ◀
                      </button>
                      <button
                        onClick={() => setCurrentMeetupReviewIndex(Math.min(meetupsNeedingReview.length - 1, currentMeetupReviewIndex + 1))}
                        disabled={currentMeetupReviewIndex === meetupsNeedingReview.length - 1}
                        className="w-9 h-9 sm:w-10 sm:h-10 flex items-center justify-center hover:bg-parchment rounded-lg disabled:opacity-30 transition-colors"
                      >
                        ▶
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6 items-stretch">
                    {/* Meetup Info */}
                    <div className="bg-parchment/50 rounded-lg sm:rounded-xl p-3 sm:p-4 border border-gold/20 flex flex-col">
                      <h3 className="font-display font-semibold text-base sm:text-lg text-ink mb-3">
                        {currentMeetupForReview.title || 'Meetup'}
                      </h3>

                      <div className="space-y-3 text-sm">
                        <div className="flex items-center gap-2">
                          <span className="text-ink/50 w-20">Date:</span>
                          <span className="text-ink font-medium">
                            {currentMeetupForReview.when
                              ? new Date(currentMeetupForReview.when).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })
                              : 'No date'}
                          </span>
                        </div>

                        <div className="flex items-center gap-2">
                          <span className="text-ink/50 w-20">With:</span>
                          <div className="flex flex-wrap gap-1">
                            {currentMeetupForReview.who?.map((person, idx) => {
                              const contact = discipleContacts.find(c => c.id === person.blockId) ||
                                              familyContacts.find(c => c.id === person.blockId) ||
                                              supportingPastorContacts.find(c => c.id === person.blockId);
                              return (
                                <span key={idx} className="px-2 py-0.5 bg-navy/10 rounded-full text-xs">
                                  {contact?.name || person.blockId?.slice(0, 8)}
                                </span>
                              );
                            }) || <span className="text-ink/40">No one specified</span>}
                          </div>
                        </div>

                        <div className="flex items-center gap-2">
                          <span className="text-ink/50 w-20">Type:</span>
                          <span className="text-ink">{currentMeetupForReview.type || '-'}</span>
                        </div>

                        <div className="flex items-center gap-2">
                          <span className="text-ink/50 w-20">Purpose:</span>
                          <span className="text-ink">{currentMeetupForReview.purpose || '-'}</span>
                        </div>

                        {currentMeetupForReview.lesson && (
                          <div className="flex items-center gap-2">
                            <span className="text-ink/50 w-20">Lesson:</span>
                            <span className="text-ink">
                              {spiritualLessons.find(l => l.id === currentMeetupForReview.lesson.blockId)?.title || 'Lesson'}
                            </span>
                          </div>
                        )}

                        {currentMeetupForReview.notes && (
                          <div className="mt-3 pt-3 border-t border-ink/10">
                            <span className="text-ink/50 text-xs uppercase tracking-wider">Notes:</span>
                            <p className="text-ink/70 mt-1 whitespace-pre-wrap">{currentMeetupForReview.notes}</p>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Edit / Confirm Section */}
                    <div className="bg-blue-50/50 rounded-lg sm:rounded-xl p-3 sm:p-4 border border-blue-200/50 flex flex-col">
                      <h3 className="font-medium uppercase tracking-wider text-xs text-ink/60 mb-3">
                        Review & Confirm
                      </h3>

                      <p className="text-ink/50 text-xs mb-4">
                        Review the meetup details and add any notes before marking complete.
                      </p>

                      <div className="space-y-4 flex-1">
                        <div>
                          <label className="block text-xs font-medium text-ink/70 mb-1">Notes</label>
                          <textarea
                            value={editedMeetupReview.notes || ''}
                            onChange={(e) => setEditedMeetupReview(prev => ({ ...prev, notes: e.target.value }))}
                            rows={4}
                            className="w-full input-glass text-sm resize-y"
                            placeholder="Add review notes about how the meetup went..."
                          />
                        </div>
                      </div>

                      <div className="flex flex-col sm:flex-row gap-2 mt-4">
                        <button
                          onClick={() => handleMarkMeetupComplete(false)}
                          disabled={isSaving}
                          className="flex-1 py-2.5 sm:py-3 rounded-xl font-medium text-sm transition-all bg-ink/10 hover:bg-ink/20 text-ink disabled:opacity-50 flex items-center justify-center gap-2"
                        >
                          {isSaving ? 'Saving...' : '✓ Approve'}
                        </button>
                        <button
                          onClick={() => handleMarkMeetupComplete(true)}
                          disabled={isSaving}
                          className="flex-1 py-2.5 sm:py-3 btn-glossy-sage text-sm disabled:opacity-50 flex items-center justify-center gap-2"
                        >
                          {isSaving ? 'Saving...' : '✓ Approve & Complete'}
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              ) : null
            ) : (
              /* Sermon Review - existing code */
              sermonsNeedingInfo.length === 0 ? (
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

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6 items-stretch overflow-hidden">
                  {/* Sermon Info */}
                  <div className="bg-parchment/50 rounded-lg sm:rounded-xl p-3 sm:p-4 border border-gold/20 flex flex-col max-h-[50vh] sm:max-h-[calc(100vh-250px)] min-w-0 overflow-hidden">
                    <h3 className="font-display font-semibold text-base sm:text-lg text-ink mb-2 sm:mb-3">
                      {currentSermon.sermon_name || currentSermon.title || currentSermon.properties?.sermon_name}
                    </h3>
                    <div className="text-sm text-ink/70 flex-1 overflow-y-auto overflow-x-hidden pr-2 break-words [overflow-wrap:anywhere] [word-break:break-word] min-w-0">
                      <Markdown
                        remarkPlugins={[remarkGfm]}
                        components={{
                          a: ({node, ...props}) => <a {...props} className="text-burgundy hover:underline break-words" target="_blank" rel="noopener noreferrer" />,
                          img: () => null,
                          h1: ({node, ...props}) => <h1 {...props} className="text-lg font-bold mt-3 mb-2 break-words" />,
                          h2: ({node, ...props}) => <h2 {...props} className="text-base font-bold mt-3 mb-2 break-words" />,
                          h3: ({node, ...props}) => <h3 {...props} className="text-sm font-bold mt-2 mb-1 break-words" />,
                          h4: ({node, ...props}) => <h4 {...props} className="text-sm font-semibold mt-2 mb-1 text-burgundy break-words" />,
                          h5: ({node, ...props}) => <h5 {...props} className="text-sm font-medium mt-2 mb-1 break-words" />,
                          h6: ({node, ...props}) => <h6 {...props} className="text-xs font-medium mt-2 mb-1 break-words" />,
                          p: ({node, ...props}) => <p {...props} className="mb-2 break-words [overflow-wrap:anywhere]" />,
                          ul: ({node, ...props}) => <ul {...props} className="list-disc pl-4 mb-2 break-words" />,
                          ol: ({node, ...props}) => <ol {...props} className="list-decimal pl-4 mb-2 break-words" />,
                          li: ({node, ...props}) => <li {...props} className="mb-1 break-words [overflow-wrap:anywhere]" />,
                          strong: ({node, ...props}) => <strong {...props} className="font-semibold" />,
                          blockquote: ({node, ...props}) => <blockquote {...props} className="border-l-2 border-burgundy/50 pl-3 italic my-2 break-words [overflow-wrap:anywhere]" />,
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
                          .replace(/\*\*\s+/g, '**')
                          .replace(/\s+\*\*/g, '**')
                          .replace(/^-\s+(#{1,6})\s+/gm, '$1 ')
                          .replace(/^\s*-\s+(#{1,6})\s+/gm, '$1 ')
                          // Fix list items followed by bold (need space after dash)
                          .replace(/^(\s*)-\*\*/gm, '$1- **')
                          // Fix blockquotes followed by bold (need space after >)
                          .replace(/^(\s*)>\*\*/gm, '$1> **')
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
            )
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

      {/* Edit English Class Modal */}
      {editingEnglishClass && (
        <Modal onClose={() => setEditingEnglishClass(null)}>
          <h3 className="font-medium uppercase tracking-wider text-xs text-purple-600 mb-4">Edit English Class</h3>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-ink/70 mb-1">Title</label>
              <input
                type="text"
                value={editingEnglishClass.title || ''}
                onChange={(e) => setEditingEnglishClass({...editingEnglishClass, title: e.target.value})}
                className="w-full input-glass"
                placeholder="Class title"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-ink/70 mb-1">Class Date</label>
              <input
                type="date"
                value={editingEnglishClass.class_date || ''}
                onChange={(e) => setEditingEnglishClass({...editingEnglishClass, class_date: e.target.value})}
                className="w-full input-glass"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-ink/70 mb-1">Status</label>
              <select
                value={editingEnglishClass.class_status || 'Preparing'}
                onChange={(e) => setEditingEnglishClass({...editingEnglishClass, class_status: e.target.value})}
                className="w-full input-glass"
              >
                <option value="Preparing">Preparing</option>
                <option value="Prepared">Prepared</option>
                <option value="Complete">Complete</option>
                <option value="Cancelled Class">Cancelled Class</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-ink/70 mb-1">Notes</label>
              <textarea
                value={editingEnglishClass.notes || ''}
                onChange={(e) => setEditingEnglishClass({...editingEnglishClass, notes: e.target.value})}
                className="w-full input-glass"
                rows={3}
                placeholder="Class notes..."
              />
            </div>
            <div className="flex gap-3 pt-2">
              <button
                onClick={() => setEditingEnglishClass(null)}
                className="flex-1 px-4 py-2.5 btn-glass text-sm"
              >
                Cancel
              </button>
              <button
                onClick={() => handleSaveEnglishClass(editingEnglishClass)}
                disabled={isSaving}
                className="flex-1 px-4 py-2.5 bg-purple-500 text-white rounded-full text-sm font-medium hover:bg-purple-600 transition-colors disabled:opacity-50"
              >
                {isSaving ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* Add English Class Modal */}
      {showAddEnglishModal && (
        <Modal onClose={() => setShowAddEnglishModal(false)}>
          <h3 className="font-medium uppercase tracking-wider text-xs text-purple-600 mb-4">Add English Class</h3>
          <AddEnglishClassForm
            initialDate={addEnglishDate}
            onSave={handleAddEnglishClass}
            onCancel={() => setShowAddEnglishModal(false)}
            isSaving={isSaving}
            activeSeries={activeEnglishSeries}
          />
        </Modal>
      )}

      {/* Add Devotion Lesson Modal */}
      {showAddDevotionModal && (
        <Modal onClose={() => setShowAddDevotionModal(false)}>
          <h3 className="font-medium uppercase tracking-wider text-xs text-amber-600 mb-4">Add Devotion Lesson</h3>
          <AddDevotionForm
            initialDate={addDevotionDate}
            onSave={handleAddDevotion}
            onCancel={() => setShowAddDevotionModal(false)}
            isSaving={isSaving}
            activeSeries={activeDevotionSeries}
          />
        </Modal>
      )}

      {/* Add Meetup Modal */}
      {showAddMeetupModal && (
        <Modal onClose={() => { setShowAddMeetupModal(false); setAddMeetupContact(null); }}>
          <h3 className="font-medium uppercase tracking-wider text-xs text-navy-600 mb-4">Add Meetup</h3>
          <AddMeetupForm
            initialDate={addMeetupDate}
            initialContact={addMeetupContact}
            contacts={discipleContacts}
            lessons={spiritualLessons}
            onSave={handleAddMeetup}
            onCancel={() => { setShowAddMeetupModal(false); setAddMeetupContact(null); }}
            isSaving={isSaving}
          />
        </Modal>
      )}

      {/* Edit Meetup Modal */}
      {editingMeetup && (
        <Modal onClose={() => setEditingMeetup(null)}>
          <h3 className="font-medium uppercase tracking-wider text-xs text-navy-600 mb-4">Edit Meetup</h3>
          <EditMeetupForm
            meetup={editingMeetup}
            contacts={[...new Map([...discipleContacts, ...familyContacts, ...supportingPastorContacts, ...spirituallyInterestedContacts].map(c => [c.id, c])).values()]}
            lessons={spiritualLessons}
            onSave={async (updates) => {
              setIsSaving(true);
              try {
                await api.updateRelationshipMeetup(editingMeetup.id, updates);
                setRelationshipMeetups(prev =>
                  prev.map(m => m.id === editingMeetup.id ? { ...m, ...updates } : m)
                );
                setEditingMeetup(null);
                showToast('Meetup updated!', 'success');
              } catch (err) {
                showToast('Failed to update meetup: ' + err.message, 'error');
              }
              setIsSaving(false);
            }}
            onCancel={() => setEditingMeetup(null)}
            isSaving={isSaving}
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
          // Close detail popup and open edit modal
          setSelectedEnglishClass(null);
          setEditingEnglishClass({ ...item });
        }}
      />

      {/* Relationship Meetup Detail Popup */}
      <ItemDetailPopup
        item={selectedMeetup}
        source="relationship"
        isOpen={!!selectedMeetup}
        onClose={() => setSelectedMeetup(null)}
        onUpdate={handleUpdateMeetup}
        onEdit={(item) => {
          setSelectedMeetup(null);
          setEditingMeetup(item);
        }}
        onDelete={handleDeleteMeetup}
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

function AddEnglishClassForm({ initialDate, onSave, onCancel, isSaving, activeSeries }) {
  const [entry, setEntry] = useState({
    title: '',
    class_date: initialDate || '',
    notes: ''
  });

  return (
    <div className="space-y-3 sm:space-y-4">
      <div>
        <label className="block text-xs sm:text-sm font-medium text-ink/70 mb-1">Class Title</label>
        <input
          type="text"
          value={entry.title}
          onChange={(e) => setEntry(prev => ({ ...prev, title: e.target.value }))}
          className="w-full input-glass text-sm sm:text-base"
          placeholder="Class title..."
        />
      </div>

      <div>
        <label className="block text-xs sm:text-sm font-medium text-ink/70 mb-1">Class Date</label>
        <input
          type="date"
          value={entry.class_date}
          onChange={(e) => setEntry(prev => ({ ...prev, class_date: e.target.value }))}
          className="w-full input-glass text-sm sm:text-base"
        />
      </div>

      {activeSeries && (
        <div className="bg-purple-50 rounded-xl p-3">
          <div className="text-xs text-purple-600 mb-1">Active Series</div>
          <div className="text-sm font-medium text-ink">{activeSeries.title}</div>
        </div>
      )}

      <div>
        <label className="block text-xs sm:text-sm font-medium text-ink/70 mb-1">Notes (optional)</label>
        <textarea
          value={entry.notes}
          onChange={(e) => setEntry(prev => ({ ...prev, notes: e.target.value }))}
          className="w-full input-glass text-sm sm:text-base"
          rows={3}
          placeholder="Class notes..."
        />
      </div>

      <div className="flex gap-3 pt-2">
        <button
          onClick={onCancel}
          className="flex-1 px-4 py-2.5 btn-glass text-sm"
        >
          Cancel
        </button>
        <button
          onClick={() => onSave(entry)}
          disabled={isSaving || !entry.title || !entry.class_date}
          className="flex-1 px-4 py-2.5 bg-purple-500 text-white rounded-full text-sm font-medium hover:bg-purple-600 transition-colors disabled:opacity-50"
        >
          {isSaving ? 'Adding...' : 'Add Class'}
        </button>
      </div>
    </div>
  );
}

function AddDevotionForm({ initialDate, onSave, onCancel, isSaving, activeSeries }) {
  const [entry, setEntry] = useState({
    title: '',
    week_lesson: '',
    day: '',
    scheduled_date: initialDate || ''
  });

  return (
    <div className="space-y-3 sm:space-y-4">
      <div>
        <label className="block text-xs sm:text-sm font-medium text-ink/70 mb-1">Lesson Title</label>
        <input
          type="text"
          value={entry.title}
          onChange={(e) => setEntry(prev => ({ ...prev, title: e.target.value }))}
          className="w-full input-glass text-sm sm:text-base"
          placeholder="Lesson title..."
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs sm:text-sm font-medium text-ink/70 mb-1">Week</label>
          <input
            type="text"
            value={entry.week_lesson}
            onChange={(e) => setEntry(prev => ({ ...prev, week_lesson: e.target.value }))}
            className="w-full input-glass text-sm sm:text-base"
            placeholder="e.g., Week 1"
          />
        </div>
        <div>
          <label className="block text-xs sm:text-sm font-medium text-ink/70 mb-1">Day</label>
          <input
            type="text"
            value={entry.day}
            onChange={(e) => setEntry(prev => ({ ...prev, day: e.target.value }))}
            className="w-full input-glass text-sm sm:text-base"
            placeholder="e.g., Day 1"
          />
        </div>
      </div>

      <div>
        <label className="block text-xs sm:text-sm font-medium text-ink/70 mb-1">Scheduled Date</label>
        <input
          type="date"
          value={entry.scheduled_date}
          onChange={(e) => setEntry(prev => ({ ...prev, scheduled_date: e.target.value }))}
          className="w-full input-glass text-sm sm:text-base"
        />
      </div>

      {activeSeries && (
        <div className="bg-amber-50 rounded-xl p-3">
          <div className="text-xs text-amber-600 mb-1">Active Series</div>
          <div className="text-sm font-medium text-ink">{activeSeries.title}</div>
        </div>
      )}

      <div className="flex gap-3 pt-2">
        <button
          onClick={onCancel}
          className="flex-1 px-4 py-2.5 btn-glass text-sm"
        >
          Cancel
        </button>
        <button
          onClick={() => onSave(entry)}
          disabled={isSaving || !entry.title}
          className="flex-1 px-4 py-2.5 bg-amber-500 text-white rounded-full text-sm font-medium hover:bg-amber-600 transition-colors disabled:opacity-50"
        >
          {isSaving ? 'Adding...' : 'Add Lesson'}
        </button>
      </div>
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

function AddMeetupForm({ initialDate, initialContact, contacts, lessons, onSave, onCancel, isSaving }) {
  const [entry, setEntry] = useState({
    title: '',
    when: initialDate || '',
    who: initialContact ? [{ blockId: initialContact.id, title: initialContact.name }] : [],
    type: '1:1',
    purpose: 'Fellowship',
    lesson: null,
    prepared: 'Scheduled',
    notes: ''
  });

  const typeOptions = ['1:1', 'Group', 'Family'];
  const purposeOptions = ['Discipleship', 'First Time', 'Fellowship', 'Relationship Building'];
  const preparedOptions = ['Scheduled', 'Need to Print of Study', 'Prepared'];

  return (
    <div className="space-y-3 sm:space-y-4">
      <div>
        <label className="block text-xs sm:text-sm font-medium text-ink/70 mb-1">Title (optional)</label>
        <input
          type="text"
          value={entry.title}
          onChange={(e) => setEntry(prev => ({ ...prev, title: e.target.value }))}
          className="w-full input-glass text-sm sm:text-base"
          placeholder="Meetup title..."
        />
      </div>

      <div>
        <label className="block text-xs sm:text-sm font-medium text-ink/70 mb-1">Date</label>
        <input
          type="date"
          value={entry.when}
          onChange={(e) => setEntry(prev => ({ ...prev, when: e.target.value }))}
          className="w-full input-glass text-sm sm:text-base"
        />
      </div>

      <div>
        <label className="block text-xs sm:text-sm font-medium text-ink/70 mb-1">Who</label>
        <select
          value={entry.who[0]?.blockId || ''}
          onChange={(e) => {
            const contact = contacts.find(c => c.id === e.target.value);
            if (contact) {
              setEntry(prev => ({ ...prev, who: [{ blockId: contact.id, title: contact.name }] }));
            } else {
              setEntry(prev => ({ ...prev, who: [] }));
            }
          }}
          className="w-full input-glass text-sm sm:text-base"
        >
          <option value="">Select contact...</option>
          {contacts.map(contact => (
            <option key={contact.id} value={contact.id}>{contact.name || contact.title}</option>
          ))}
        </select>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs sm:text-sm font-medium text-ink/70 mb-1">Type</label>
          <select
            value={entry.type}
            onChange={(e) => setEntry(prev => ({ ...prev, type: e.target.value }))}
            className="w-full input-glass text-sm sm:text-base"
          >
            {typeOptions.map(opt => (
              <option key={opt} value={opt}>{opt}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-xs sm:text-sm font-medium text-ink/70 mb-1">Purpose</label>
          <select
            value={entry.purpose}
            onChange={(e) => setEntry(prev => ({ ...prev, purpose: e.target.value }))}
            className="w-full input-glass text-sm sm:text-base"
          >
            {purposeOptions.map(opt => (
              <option key={opt} value={opt}>{opt}</option>
            ))}
          </select>
        </div>
      </div>

      <div>
        <label className="block text-xs sm:text-sm font-medium text-ink/70 mb-1">Lesson (optional)</label>
        <select
          value={entry.lesson?.blockId || ''}
          onChange={(e) => {
            const lesson = lessons.find(l => l.id === e.target.value);
            if (lesson) {
              setEntry(prev => ({ ...prev, lesson: { blockId: lesson.id, title: lesson.title } }));
            } else {
              setEntry(prev => ({ ...prev, lesson: null }));
            }
          }}
          className="w-full input-glass text-sm sm:text-base"
        >
          <option value="">No lesson</option>
          {lessons.map(lesson => (
            <option key={lesson.id} value={lesson.id}>{lesson.title}</option>
          ))}
        </select>
      </div>

      <div>
        <label className="block text-xs sm:text-sm font-medium text-ink/70 mb-1">Prepared</label>
        <select
          value={entry.prepared}
          onChange={(e) => setEntry(prev => ({ ...prev, prepared: e.target.value }))}
          className="w-full input-glass text-sm sm:text-base"
        >
          {preparedOptions.map(opt => (
            <option key={opt} value={opt}>{opt}</option>
          ))}
        </select>
      </div>

      <div>
        <label className="block text-xs sm:text-sm font-medium text-ink/70 mb-1">Notes (optional)</label>
        <textarea
          value={entry.notes}
          onChange={(e) => setEntry(prev => ({ ...prev, notes: e.target.value }))}
          className="w-full input-glass text-sm sm:text-base"
          rows={3}
          placeholder="Meetup notes..."
        />
      </div>

      <div className="flex gap-3 pt-2">
        <button
          onClick={onCancel}
          className="flex-1 px-4 py-2.5 btn-glass text-sm"
        >
          Cancel
        </button>
        <button
          onClick={() => onSave(entry)}
          disabled={isSaving || !entry.when || entry.who.length === 0}
          className="flex-1 px-4 py-2.5 text-white rounded-full text-sm font-medium transition-colors disabled:opacity-50"
          style={{ backgroundColor: 'var(--navy-500)' }}
        >
          {isSaving ? 'Adding...' : 'Add Meetup'}
        </button>
      </div>
    </div>
  );
}

function EditMeetupForm({ meetup, contacts, lessons, onSave, onCancel, isSaving }) {
  const [entry, setEntry] = useState({
    title: meetup.title || '',
    when: meetup.when?.split('T')[0] || '',
    who: meetup.who || [],
    type: meetup.type || '1:1',
    purpose: meetup.purpose || 'Fellowship',
    lesson: meetup.lesson || null,
    prepared: meetup.prepared || 'Scheduled',
    notes: meetup.notes || ''
  });

  const typeOptions = ['1:1', 'Group', 'Family'];
  const purposeOptions = ['Discipleship', 'First Time', 'Fellowship', 'Relationship Building'];
  const preparedOptions = ['Scheduled', 'Need to Print of Study', 'Prepared', 'Complete'];

  return (
    <div className="space-y-3 sm:space-y-4">
      <div>
        <label className="block text-xs sm:text-sm font-medium text-ink/70 mb-1">Title (optional)</label>
        <input
          type="text"
          value={entry.title}
          onChange={(e) => setEntry(prev => ({ ...prev, title: e.target.value }))}
          className="w-full input-glass text-sm sm:text-base"
          placeholder="Meetup title..."
        />
      </div>

      <div>
        <label className="block text-xs sm:text-sm font-medium text-ink/70 mb-1">Date</label>
        <input
          type="date"
          value={entry.when}
          onChange={(e) => setEntry(prev => ({ ...prev, when: e.target.value }))}
          className="w-full input-glass text-sm sm:text-base"
        />
      </div>

      <div>
        <label className="block text-xs sm:text-sm font-medium text-ink/70 mb-1">Who</label>
        <select
          value={entry.who[0]?.blockId || ''}
          onChange={(e) => {
            const contact = contacts.find(c => c.id === e.target.value);
            if (contact) {
              setEntry(prev => ({ ...prev, who: [{ blockId: contact.id, title: contact.name }] }));
            } else {
              setEntry(prev => ({ ...prev, who: [] }));
            }
          }}
          className="w-full input-glass text-sm sm:text-base"
        >
          <option value="">Select contact...</option>
          {contacts.map(contact => (
            <option key={contact.id} value={contact.id}>{contact.name || contact.title}</option>
          ))}
        </select>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs sm:text-sm font-medium text-ink/70 mb-1">Type</label>
          <select
            value={entry.type}
            onChange={(e) => setEntry(prev => ({ ...prev, type: e.target.value }))}
            className="w-full input-glass text-sm sm:text-base"
          >
            {typeOptions.map(opt => (
              <option key={opt} value={opt}>{opt}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-xs sm:text-sm font-medium text-ink/70 mb-1">Purpose</label>
          <select
            value={entry.purpose}
            onChange={(e) => setEntry(prev => ({ ...prev, purpose: e.target.value }))}
            className="w-full input-glass text-sm sm:text-base"
          >
            {purposeOptions.map(opt => (
              <option key={opt} value={opt}>{opt}</option>
            ))}
          </select>
        </div>
      </div>

      <div>
        <label className="block text-xs sm:text-sm font-medium text-ink/70 mb-1">Lesson (optional)</label>
        <select
          value={entry.lesson?.blockId || ''}
          onChange={(e) => {
            const lesson = lessons.find(l => l.id === e.target.value);
            if (lesson) {
              setEntry(prev => ({ ...prev, lesson: { blockId: lesson.id, title: lesson.title } }));
            } else {
              setEntry(prev => ({ ...prev, lesson: null }));
            }
          }}
          className="w-full input-glass text-sm sm:text-base"
        >
          <option value="">No lesson</option>
          {lessons.map(lesson => (
            <option key={lesson.id} value={lesson.id}>{lesson.title}</option>
          ))}
        </select>
      </div>

      <div>
        <label className="block text-xs sm:text-sm font-medium text-ink/70 mb-1">Status</label>
        <select
          value={entry.prepared}
          onChange={(e) => setEntry(prev => ({ ...prev, prepared: e.target.value }))}
          className="w-full input-glass text-sm sm:text-base"
        >
          {preparedOptions.map(opt => (
            <option key={opt} value={opt}>{opt}</option>
          ))}
        </select>
      </div>

      <div>
        <label className="block text-xs sm:text-sm font-medium text-ink/70 mb-1">Notes (optional)</label>
        <textarea
          value={entry.notes}
          onChange={(e) => setEntry(prev => ({ ...prev, notes: e.target.value }))}
          className="w-full input-glass text-sm sm:text-base"
          rows={3}
          placeholder="Meetup notes..."
        />
      </div>

      <div className="flex gap-3 pt-2">
        <button
          onClick={onCancel}
          className="flex-1 px-4 py-2.5 btn-glass text-sm"
        >
          Cancel
        </button>
        <button
          onClick={() => onSave(entry)}
          disabled={isSaving || !entry.when || entry.who.length === 0}
          className="flex-1 px-4 py-2.5 text-white rounded-full text-sm font-medium transition-colors disabled:opacity-50"
          style={{ backgroundColor: 'var(--navy-500)' }}
        >
          {isSaving ? 'Saving...' : 'Save Changes'}
        </button>
      </div>
    </div>
  );
}
