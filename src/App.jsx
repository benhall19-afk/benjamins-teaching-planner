import React, { useState, useEffect, useMemo, useCallback } from 'react';
import Markdown from 'react-markdown';
import * as api from './api';
import {
  SERIES_OPTIONS, THEME_OPTIONS, AUDIENCE_OPTIONS, SEASON_OPTIONS,
  LESSON_TYPE_OPTIONS, SCHEDULE_LESSON_TYPES, PREACHERS, SPECIAL_EVENTS,
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
      <div className="flex gap-2">
        <input
          type="text"
          value={newValue}
          onChange={(e) => setNewValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') handleAddNew();
            if (e.key === 'Escape') { setIsAdding(false); setNewValue(''); }
          }}
          placeholder={`New ${label}...`}
          className="flex-1 px-3 py-2 border border-gold/30 rounded-lg text-sm bg-white focus:border-gold outline-none"
          autoFocus
        />
        <button
          onClick={handleAddNew}
          className="px-3 py-2 bg-sage text-white rounded-lg text-sm hover:bg-sage/90"
        >
          Add
        </button>
        <button
          onClick={() => { setIsAdding(false); setNewValue(''); }}
          className="px-3 py-2 bg-gray-200 text-ink rounded-lg text-sm hover:bg-gray-300"
        >
          Cancel
        </button>
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
        className="flex-1 px-3 py-2 border border-gold/30 rounded-lg text-sm bg-white focus:border-gold outline-none"
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
// MAIN APP COMPONENT
// ============================================

export default function App() {
  // Data state
  const [sermons, setSermons] = useState([]);
  const [schedule, setSchedule] = useState([]);
  const [hashtags, setHashtags] = useState([]);
  const [seriesOptions, setSeriesOptions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  
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
      const [sermonsData, scheduleData, hashtagsData, seriesData] = await Promise.all([
        api.fetchSermons().catch(() => []),
        api.fetchSchedule().catch(() => []),
        api.fetchHashtags().catch(() => []),
        api.fetchSeries().catch(() => [])
      ]);

      setSermons(sermonsData);
      setSchedule(scheduleData);
      setHashtags(hashtagsData);
      // Extract series titles from the API response
      setSeriesOptions(seriesData.map(s => s.title).filter(Boolean));
    } catch (err) {
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

  const sermonsNeedingInfo = useMemo(() => {
    return sermons.filter(s => !s.properties?.sermon_information_added);
  }, [sermons]);

  const currentSermon = sermonsNeedingInfo[currentSermonIndex];

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
    return status === 'complete' || status === 'Ready to Preach';
  };

  const getLessonTypeColor = (lessonType) => {
    switch (lessonType) {
      case 'Sermon AM':
        return 'bg-blue-100 border-blue-400 text-blue-800 hover:bg-blue-200';
      case 'Sermon PM':
        return 'bg-amber-100 border-amber-400 text-amber-800 hover:bg-amber-200';
      case 'Afternoon Study':
        return 'bg-green-100 border-green-400 text-green-800 hover:bg-green-200';
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
      await api.updateScheduleEntry(entry.id, {
        sermon_name: entry.sermon_name,
        lesson_type: entry.lesson_type || entry.properties?.lesson_type,
        preacher: entry.preacher || entry.properties?.preacher,
        sermon_date: entry.sermon_date || entry.properties?.sermon_date,
        special_event: entry.special_event || entry.properties?.special_event,
        status: entry.status || entry.properties?.status
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
    const seriesForAnalysis = seriesOptions.length > 0 ? seriesOptions : SERIES_OPTIONS;

    try {
      const result = await api.analyzeSermon(
        currentSermon.title || currentSermon.sermon_title,
        currentSermon.contentMarkdown || currentSermon.content || '',
        {
          series: seriesForAnalysis,
          themes: THEME_OPTIONS,
          audiences: AUDIENCE_OPTIONS,
          seasons: SEASON_OPTIONS,
          lessonTypes: LESSON_TYPE_OPTIONS,
          hashtags: getAllHashtags()
        }
      );

      setRecommendations(result);
      setEditedRecommendations(result);
    } catch (err) {
      showToast('Analysis failed: ' + err.message, 'error');
      setRecommendations({ error: 'Analysis failed. Please try again.' });
    }
    setIsAnalyzing(false);
  };

  const handleApproveRecommendations = async () => {
    if (!currentSermon || !editedRecommendations) return;
    
    setIsSaving(true);
    try {
      await api.updateSermon(currentSermon.id, {
        series: editedRecommendations.series,
        sermon_themefocus: editedRecommendations.theme,
        audience: editedRecommendations.audience,
        seasonholiday: editedRecommendations.season,
        lesson_type: editedRecommendations.lessonType,
        key_takeaway: editedRecommendations.keyTakeaway,
        hashtags: editedRecommendations.hashtags,
        sermon_information_added: true
      });
      
      // Update local state
      setSermons(prev => prev.map(s => 
        s.id === currentSermon.id 
          ? { ...s, properties: { ...s.properties, sermon_information_added: true } }
          : s
      ));
      
      setRecommendations(null);
      setEditedRecommendations({});
      showToast('Sermon information saved!', 'success');
      
      if (currentSermonIndex < sermonsNeedingInfo.length - 1) {
        setCurrentSermonIndex(prev => prev + 1);
      }
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

  // ============================================
  // RENDER
  // ============================================

  const { daysInMonth, startingDay, year, month } = getDaysInMonth(currentDate);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="text-4xl mb-4 animate-pulse-gold">📖</div>
          <p className="text-ink font-display text-xl">Loading Bible Teaching Planner...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen p-4 md:p-6">
      <div className="max-w-6xl mx-auto">
        
        {/* Header */}
        <header className="bg-white rounded-xl shadow-md p-4 mb-6 border border-gold/20">
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div className="flex items-center gap-3">
              <span className="text-3xl">📖</span>
              <div>
                <h1 className="text-2xl font-display font-bold text-ink">Bible Teaching Planner</h1>
                <p className="text-sm text-ink/60">Benjamin Hall</p>
              </div>
            </div>
            
            <div className="flex items-center gap-3">
              {/* Tab Switcher */}
              <div className="flex bg-parchment rounded-lg p-1">
                <button
                  onClick={() => setActiveTab('calendar')}
                  className={`px-4 py-2 rounded-md text-sm font-medium transition-all ${
                    activeTab === 'calendar' 
                      ? 'bg-white shadow text-burgundy' 
                      : 'text-ink/60 hover:text-ink'
                  }`}
                >
                  📅 Calendar
                </button>
                <button
                  onClick={() => setActiveTab('review')}
                  className={`px-4 py-2 rounded-md text-sm font-medium transition-all flex items-center gap-2 ${
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

        {/* Calendar Tab */}
        {activeTab === 'calendar' && (
          <div className="bg-white rounded-xl shadow-md border border-gold/20 overflow-hidden">
            {/* Calendar Controls */}
            <div className="p-4 border-b border-gold/20 flex items-center justify-between flex-wrap gap-4 bg-gradient-to-r from-parchment to-white">
              <div className="flex items-center gap-3">
                <button 
                  onClick={() => navigateMonth(-1)} 
                  className="w-10 h-10 flex items-center justify-center hover:bg-white rounded-lg transition-colors text-xl"
                >
                  ◀
                </button>
                <h2 className="text-xl font-display font-semibold text-ink min-w-48 text-center">
                  {MONTH_NAMES[month]} {year}
                </h2>
                <button 
                  onClick={() => navigateMonth(1)} 
                  className="w-10 h-10 flex items-center justify-center hover:bg-white rounded-lg transition-colors text-xl"
                >
                  ▶
                </button>
              </div>
              
              <div className="flex items-center gap-3 flex-wrap">
                <select
                  value={lessonTypeFilter}
                  onChange={(e) => setLessonTypeFilter(e.target.value)}
                  className="px-3 py-2 border border-gold/30 rounded-lg text-sm bg-white focus:border-gold outline-none"
                >
                  <option value="all">All Types</option>
                  {SCHEDULE_LESSON_TYPES.map(type => (
                    <option key={type} value={type}>{type}</option>
                  ))}
                </select>
                
                <button
                  onClick={() => setShowShiftModal(true)}
                  className="px-3 py-2 bg-gradient-to-r from-burgundy to-burgundy/80 text-white rounded-lg text-sm font-medium hover:shadow-md transition-all"
                >
                  ⬇️ Shift Down
                </button>
              </div>
            </div>

            {/* Calendar Grid */}
            <div className="p-4">
              {/* Day Headers */}
              <div className="grid grid-cols-7 gap-1 mb-2">
                {DAY_NAMES.map(day => (
                  <div 
                    key={day} 
                    className={`text-center text-sm font-semibold py-2 ${
                      day === 'Sun' ? 'text-burgundy' : 'text-ink/60'
                    }`}
                  >
                    {day}
                  </div>
                ))}
              </div>
              
              {/* Calendar Days */}
              <div className="grid grid-cols-7 gap-1">
                {/* Empty cells for days before month starts */}
                {Array.from({ length: startingDay }).map((_, i) => (
                  <div key={`empty-${i}`} className="min-h-24 bg-parchment/30 rounded-lg" />
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
                      className={`calendar-day group min-h-24 p-1.5 rounded-lg border transition-all cursor-pointer ${
                        isToday
                          ? 'border-gold bg-gold/10'
                          : isSunday
                            ? 'bg-burgundy/5 border-burgundy/20'
                            : 'border-gray-200 hover:border-gold/40'
                      } ${draggedEvent ? 'hover:border-gold hover:bg-gold/5' : ''}`}
                    >
                      <div className="day-header flex items-center justify-between mb-1">
                        <span className={`text-sm font-medium ${
                          isToday ? 'text-gold' : isSunday ? 'text-burgundy' : 'text-ink/60'
                        }`}>
                          {day}
                        </span>
                        <button
                          onClick={(e) => { e.stopPropagation(); setAddDate(dateStr); setShowAddModal(true); }}
                          className={`w-5 h-5 flex items-center justify-center text-gold hover:bg-gold/20 rounded transition-all text-sm ${
                            isSunday ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
                          }`}
                        >
                          +
                        </button>
                      </div>

                      <div className="space-y-1">
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
                              className={`entry-card w-full text-left px-1.5 py-1 rounded border text-xs truncate cursor-grab active:cursor-grabbing ${getLessonTypeColor(lessonType)} ${draggedEvent?.id === event.id ? 'opacity-50' : ''} ${shouldDim ? 'opacity-40' : ''}`}
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

            {/* Legend */}
            <div className="p-4 border-t border-gold/20 bg-parchment/30 flex items-center justify-between text-sm flex-wrap gap-4">
              <div className="flex items-center gap-6 flex-wrap">
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 rounded bg-blue-100 border border-blue-400" />
                  <span className="text-ink/70">Sermon AM</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 rounded bg-amber-100 border border-amber-400" />
                  <span className="text-ink/70">Sermon PM</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 rounded bg-green-100 border border-green-400" />
                  <span className="text-ink/70">Afternoon Study</span>
                </div>
              </div>
              <label className="flex items-center gap-2 cursor-pointer select-none">
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
          <div className="bg-white rounded-xl shadow-md border border-gold/20 p-6 mb-6">
            {sermonsNeedingInfo.length === 0 ? (
              <div className="text-center py-12">
                <div className="text-6xl mb-4">✅</div>
                <h2 className="text-2xl font-display font-bold text-ink">All Sermons Reviewed!</h2>
                <p className="text-ink/60 mt-2">No sermons need information added.</p>
              </div>
            ) : currentSermon ? (
              <div>
                {/* Review Header */}
                <div className="flex items-center justify-between mb-6">
                  <h2 className="text-xl font-display font-semibold text-ink">
                    Sermon {currentSermonIndex + 1} of {sermonsNeedingInfo.length}
                  </h2>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setCurrentSermonIndex(Math.max(0, currentSermonIndex - 1))}
                      disabled={currentSermonIndex === 0}
                      className="w-10 h-10 flex items-center justify-center hover:bg-parchment rounded-lg disabled:opacity-30 transition-colors"
                    >
                      ◀
                    </button>
                    <button
                      onClick={() => setCurrentSermonIndex(Math.min(sermonsNeedingInfo.length - 1, currentSermonIndex + 1))}
                      disabled={currentSermonIndex === sermonsNeedingInfo.length - 1}
                      className="w-10 h-10 flex items-center justify-center hover:bg-parchment rounded-lg disabled:opacity-30 transition-colors"
                    >
                      ▶
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-stretch">
                  {/* Sermon Info */}
                  <div className="bg-parchment/50 rounded-xl p-4 border border-gold/20 flex flex-col max-h-[calc(100vh-250px)]">
                    <h3 className="font-display font-semibold text-lg text-ink mb-3">
                      {currentSermon.title || currentSermon.sermon_title}
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
                        {(currentSermon.contentMarkdown || currentSermon.content || 'No content preview available.')
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

                    <button
                      onClick={handleAnalyzeSermon}
                      disabled={isAnalyzing}
                      className="w-full py-3 mt-4 bg-gradient-to-r from-burgundy to-burgundy/80 text-white rounded-lg font-medium hover:shadow-md transition-all disabled:opacity-50 flex items-center justify-center gap-2 flex-shrink-0"
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
                  </div>

                  {/* Recommendations */}
                  <div className="bg-blue-50/50 rounded-xl p-4 border border-blue-200/50 flex flex-col max-h-[calc(100vh-250px)]">
                    <h3 className="font-display font-semibold text-lg text-ink mb-3">
                      Recommendations
                    </h3>

                    {!recommendations ? (
                      <p className="text-ink/60 text-sm">
                        Click "Analyze with AI" to get recommendations for this sermon's metadata.
                      </p>
                    ) : recommendations.error ? (
                      <p className="text-burgundy text-sm">{recommendations.error}</p>
                    ) : (
                      <div className="flex flex-col flex-1 overflow-hidden">
                        <div className="space-y-3 flex-1 overflow-y-auto pr-1">
                          {[
                            { key: 'series', label: 'Series', options: seriesOptions.length > 0 ? seriesOptions : SERIES_OPTIONS, canAddToApi: true },
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
                                      await api.addSeries(newValue);
                                      setSeriesOptions(prev => [...prev, newValue]);
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

                        <div className="flex gap-3 pt-4 mt-auto">
                          <button
                            onClick={handleApproveRecommendations}
                            disabled={isSaving}
                            className="flex-1 py-2.5 bg-sage text-white rounded-lg font-medium hover:bg-sage/90 transition-all disabled:opacity-50"
                          >
                            {isSaving ? 'Saving...' : '✓ Approve & Save'}
                          </button>
                          <button
                            onClick={handleSkipSermon}
                            className="flex-1 py-2.5 bg-gray-200 text-ink rounded-lg font-medium hover:bg-gray-300 transition-all"
                          >
                            Skip
                          </button>
                        </div>
                      </div>
                    )}
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
      className="modal-backdrop fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="bg-white rounded-xl p-6 max-w-md w-full max-h-[90vh] overflow-y-auto shadow-2xl">
        {children}
      </div>
    </div>
  );
}

function EntryForm({ entry, onChange, onSave, onDelete, onCancel, isSaving, showDelete }) {
  const updateField = (field, value) => {
    onChange({ 
      ...entry, 
      [field]: value,
      properties: { ...entry.properties, [field]: value }
    });
  };

  const getValue = (field) => entry[field] || entry.properties?.[field] || '';

  return (
    <div className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-ink/70 mb-1">Name</label>
        <input
          type="text"
          value={getValue('sermon_name')}
          onChange={(e) => updateField('sermon_name', e.target.value)}
          className="w-full px-3 py-2 border border-gold/30 rounded-lg focus:border-gold outline-none"
        />
      </div>
      
      <div>
        <label className="block text-sm font-medium text-ink/70 mb-1">Type</label>
        <select
          value={getValue('lesson_type')}
          onChange={(e) => updateField('lesson_type', e.target.value)}
          className="w-full px-3 py-2 border border-gold/30 rounded-lg focus:border-gold outline-none"
        >
          <option value="">Select...</option>
          {SCHEDULE_LESSON_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
      </div>
      
      <div>
        <label className="block text-sm font-medium text-ink/70 mb-1">Preacher</label>
        <select
          value={getValue('preacher')}
          onChange={(e) => updateField('preacher', e.target.value)}
          className="w-full px-3 py-2 border border-gold/30 rounded-lg focus:border-gold outline-none"
        >
          <option value="">Select...</option>
          {PREACHERS.map(p => <option key={p} value={p}>{p}</option>)}
        </select>
      </div>
      
      <div>
        <label className="block text-sm font-medium text-ink/70 mb-1">Date</label>
        <input
          type="date"
          value={getValue('sermon_date')}
          onChange={(e) => updateField('sermon_date', e.target.value)}
          className="w-full px-3 py-2 border border-gold/30 rounded-lg focus:border-gold outline-none"
        />
      </div>
      
      <div>
        <label className="block text-sm font-medium text-ink/70 mb-1">Special Event</label>
        <select
          value={getValue('special_event')}
          onChange={(e) => updateField('special_event', e.target.value)}
          className="w-full px-3 py-2 border border-gold/30 rounded-lg focus:border-gold outline-none"
        >
          <option value="">None</option>
          {SPECIAL_EVENTS.map(ev => <option key={ev} value={ev}>{ev}</option>)}
        </select>
      </div>
      
      <div className="flex gap-3 pt-2">
        <button
          onClick={onSave}
          disabled={isSaving}
          className="flex-1 py-2.5 bg-burgundy text-white rounded-lg font-medium hover:bg-burgundy/90 transition-all disabled:opacity-50"
        >
          {isSaving ? 'Saving...' : 'Save'}
        </button>
        <button
          onClick={onCancel}
          className="flex-1 py-2.5 bg-gray-200 text-ink rounded-lg font-medium hover:bg-gray-300 transition-all"
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

function AddEntryForm({ initialDate, onSave, onCancel, isSaving }) {
  const [entry, setEntry] = useState({
    sermon_name: '',
    lesson_type: 'Sermon AM',
    preacher: 'Benjamin',
    sermon_date: initialDate || '',
    special_event: ''
  });

  return (
    <div className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-ink/70 mb-1">Name</label>
        <input
          type="text"
          value={entry.sermon_name}
          onChange={(e) => setEntry(prev => ({ ...prev, sermon_name: e.target.value }))}
          className="w-full px-3 py-2 border border-gold/30 rounded-lg focus:border-gold outline-none"
          placeholder="Sermon name..."
        />
      </div>
      
      <div>
        <label className="block text-sm font-medium text-ink/70 mb-1">Type</label>
        <select
          value={entry.lesson_type}
          onChange={(e) => setEntry(prev => ({ ...prev, lesson_type: e.target.value }))}
          className="w-full px-3 py-2 border border-gold/30 rounded-lg focus:border-gold outline-none"
        >
          {SCHEDULE_LESSON_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
      </div>
      
      <div>
        <label className="block text-sm font-medium text-ink/70 mb-1">Preacher</label>
        <select
          value={entry.preacher}
          onChange={(e) => setEntry(prev => ({ ...prev, preacher: e.target.value }))}
          className="w-full px-3 py-2 border border-gold/30 rounded-lg focus:border-gold outline-none"
        >
          {PREACHERS.map(p => <option key={p} value={p}>{p}</option>)}
        </select>
      </div>
      
      <div>
        <label className="block text-sm font-medium text-ink/70 mb-1">Date</label>
        <input
          type="date"
          value={entry.sermon_date}
          onChange={(e) => setEntry(prev => ({ ...prev, sermon_date: e.target.value }))}
          className="w-full px-3 py-2 border border-gold/30 rounded-lg focus:border-gold outline-none"
        />
      </div>
      
      <div>
        <label className="block text-sm font-medium text-ink/70 mb-1">Special Event</label>
        <select
          value={entry.special_event}
          onChange={(e) => setEntry(prev => ({ ...prev, special_event: e.target.value }))}
          className="w-full px-3 py-2 border border-gold/30 rounded-lg focus:border-gold outline-none"
        >
          <option value="">None</option>
          {SPECIAL_EVENTS.map(ev => <option key={ev} value={ev}>{ev}</option>)}
        </select>
      </div>
      
      <div className="flex gap-3 pt-2">
        <button
          onClick={() => onSave(entry)}
          disabled={isSaving}
          className="flex-1 py-2.5 bg-sage text-white rounded-lg font-medium hover:bg-sage/90 transition-all disabled:opacity-50"
        >
          {isSaving ? 'Adding...' : 'Add Entry'}
        </button>
        <button
          onClick={onCancel}
          className="flex-1 py-2.5 bg-gray-200 text-ink rounded-lg font-medium hover:bg-gray-300 transition-all"
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
    <div className="space-y-4">
      <p className="text-sm text-ink/70">
        This will move all sermons from the selected date forward by the specified number of weeks.
      </p>
      
      <div>
        <label className="block text-sm font-medium text-ink/70 mb-1">From Date</label>
        <input
          type="date"
          value={fromDate}
          onChange={(e) => setFromDate(e.target.value)}
          className="w-full px-3 py-2 border border-gold/30 rounded-lg focus:border-gold outline-none"
        />
      </div>
      
      <div>
        <label className="block text-sm font-medium text-ink/70 mb-1">Number of Weeks</label>
        <input
          type="number"
          min="1"
          max="12"
          value={weeks}
          onChange={(e) => setWeeks(parseInt(e.target.value) || 1)}
          className="w-full px-3 py-2 border border-gold/30 rounded-lg focus:border-gold outline-none"
        />
      </div>
      
      <div>
        <label className="block text-sm font-medium text-ink/70 mb-1">What to Shift</label>
        <select
          value={scope}
          onChange={(e) => setScope(e.target.value)}
          className="w-full px-3 py-2 border border-gold/30 rounded-lg focus:border-gold outline-none"
        >
          <option value="all">All Sermons</option>
          <option value="benjamin">Benjamin's Sermons Only</option>
        </select>
      </div>
      
      <div className="flex gap-3 pt-2">
        <button
          onClick={() => onShift(fromDate, weeks, scope)}
          disabled={isSaving || !fromDate}
          className="flex-1 py-2.5 bg-burgundy text-white rounded-lg font-medium hover:bg-burgundy/90 transition-all disabled:opacity-50"
        >
          {isSaving ? 'Shifting...' : 'Shift Down'}
        </button>
        <button
          onClick={onCancel}
          className="flex-1 py-2.5 bg-gray-200 text-ink rounded-lg font-medium hover:bg-gray-300 transition-all"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
