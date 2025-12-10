import React, { useMemo, useState, useEffect, useRef } from 'react';
import { isSermonPrepared, isDevotionPrepared, getDevotionDisplayTitle, isEnglishClassPrepared, getEnglishClassDisplayTitle, isRelationshipMeetupPrepared, getRelationshipMeetupDisplayTitle } from '../viewConfig';

const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

function getWeekDates(date) {
  const d = new Date(date);
  const day = d.getDay();
  // Adjust to start from Monday (day 1). If Sunday (0), go back 6 days
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  const start = new Date(d.setDate(diff));

  const dates = [];
  for (let i = 0; i < 7; i++) {
    const date = new Date(start);
    date.setDate(start.getDate() + i);
    dates.push(date);
  }
  return dates;
}

function formatDateKey(date) {
  return date.toISOString().split('T')[0];
}

// Get ISO week number
function getWeekNumber(date) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
}

// Get sermon display title - check multiple fields
function getSermonDisplayTitle(sermon) {
  return sermon.sermon_name || sermon.properties?.sermon_name || sermon.title || 'Untitled';
}

export default function WeeklyCalendar({
  sermons = [],
  devotions = [],
  englishClasses = [],
  relationshipMeetups = [],
  currentDate,
  onDateChange,
  onEventClick,
  onEventDragStart,
  onEventDragEnd,
  onDayDrop,
  draggedEvent,
  getHolidaysForDate,
  onPlanDay
}) {
  const [planningDay, setPlanningDay] = useState(null);
  const weekDates = useMemo(() => getWeekDates(currentDate), [currentDate]);

  // Refs for scrolling to today
  const scrollContainerRef = useRef(null);
  const todayCardRef = useRef(null);

  // Scroll to center today's card on mount and when week changes
  useEffect(() => {
    if (scrollContainerRef.current && todayCardRef.current) {
      const container = scrollContainerRef.current;
      const todayCard = todayCardRef.current;
      const containerWidth = container.offsetWidth;
      const cardLeft = todayCard.offsetLeft;
      const cardWidth = todayCard.offsetWidth;
      // Calculate scroll position to center the card
      const scrollTo = cardLeft - (containerWidth / 2) + (cardWidth / 2);
      container.scrollTo({ left: scrollTo, behavior: 'smooth' });
    }
  }, [currentDate]);

  const today = new Date();
  const todayKey = formatDateKey(today);

  // Map events to their dates
  const eventsByDate = useMemo(() => {
    const map = {};

    // Add sermons
    sermons.forEach(sermon => {
      const date = sermon.sermon_date || sermon.properties?.sermon_date;
      if (date) {
        const key = date.split('T')[0];
        if (!map[key]) map[key] = [];
        map[key].push({
          ...sermon,
          source: 'sermon',
          isPrepared: isSermonPrepared(sermon),
          displayTitle: getSermonDisplayTitle(sermon),
        });
      }
    });

    // Add devotions
    devotions.forEach(devotion => {
      const date = devotion.scheduled_date;
      if (date) {
        const key = date.split('T')[0];
        if (!map[key]) map[key] = [];
        map[key].push({
          ...devotion,
          source: 'devotion',
          isPrepared: isDevotionPrepared(devotion),
          displayTitle: getDevotionDisplayTitle(devotion),
        });
      }
    });

    // Add English classes
    englishClasses.forEach(englishClass => {
      const date = englishClass.class_date;
      // Skip cancelled classes
      if (englishClass.class_status?.toLowerCase() === 'cancelled class') return;
      if (date) {
        const key = date.split('T')[0];
        if (!map[key]) map[key] = [];
        map[key].push({
          ...englishClass,
          source: 'english',
          isPrepared: isEnglishClassPrepared(englishClass),
          displayTitle: getEnglishClassDisplayTitle(englishClass),
        });
      }
    });

    // Add relationship meetups
    relationshipMeetups.forEach(meetup => {
      const date = meetup.when;
      if (date) {
        const key = date.split('T')[0];
        if (!map[key]) map[key] = [];
        map[key].push({
          ...meetup,
          source: 'relationship',
          isPrepared: isRelationshipMeetupPrepared(meetup),
          displayTitle: getRelationshipMeetupDisplayTitle(meetup),
        });
      }
    });

    return map;
  }, [sermons, devotions, englishClasses, relationshipMeetups]);

  const navigateWeek = (direction) => {
    const newDate = new Date(currentDate);
    newDate.setDate(newDate.getDate() + (direction * 7));
    onDateChange(newDate);
  };

  return (
    <div className="glass-card rounded-2xl p-4">
      {/* Week Navigation */}
      <div className="flex items-center justify-between mb-4">
        <button
          onClick={() => navigateWeek(-1)}
          className="p-2 hover:bg-slate-100 rounded-lg transition-colors"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>

        <div className="text-center">
          <div className="flex flex-col md:flex-row items-center justify-center gap-1 md:gap-2">
            <span className="bg-slate-600 text-white text-xs font-bold px-2.5 py-1 rounded-full">
              Week {getWeekNumber(weekDates[0])}
            </span>
            <span className="text-ink/40 hidden md:inline">—</span>
            <span className="font-medium text-ink text-sm md:text-base">
              {weekDates[0].toLocaleDateString('en-US', { month: 'long', day: 'numeric' })}
              {' - '}
              {weekDates[6].toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
            </span>
          </div>
        </div>

        <button
          onClick={() => navigateWeek(1)}
          className="p-2 hover:bg-slate-100 rounded-lg transition-colors"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </button>
      </div>

      {/* Horizontal Scrollable Week Layout */}
      <div ref={scrollContainerRef} className="overflow-x-auto pb-2 -mx-4 px-4">
        <div className="flex gap-3" style={{ minWidth: 'max-content' }}>
          {weekDates.map((date, index) => {
            const dateKey = formatDateKey(date);
            const events = eventsByDate[dateKey] || [];
            const isToday = dateKey === todayKey;
            const isPast = date < today && dateKey !== todayKey;

            // Check for holidays on this day
            const dayHolidays = getHolidaysForDate?.(dateKey) || [];
            const hasDayHoliday = dayHolidays.length > 0;
            const primaryDayHoliday = dayHolidays[0];

            // Build class string for holiday styling
            const holidayRingClass = hasDayHoliday
              ? `ring-2 ring-[var(--holiday-${primaryDayHoliday.color})]`
              : '';

            return (
              <div
                key={dateKey}
                ref={isToday ? todayCardRef : null}
                onDragOver={(e) => e.preventDefault()}
                onDrop={() => onDayDrop?.(dateKey)}
                className={`flex-shrink-0 w-44 bg-white/60 rounded-xl p-3 ${
                  isToday ? 'ring-2 ring-slate-400 bg-white/80' : ''
                } ${isPast ? 'opacity-50' : ''} ${!isToday && hasDayHoliday ? holidayRingClass : ''}`}
                style={hasDayHoliday && !isToday ? {
                  '--ring-color': `var(--holiday-${primaryDayHoliday.color})`,
                  boxShadow: `0 0 0 2px var(--holiday-${primaryDayHoliday.color})`,
                  backgroundColor: `var(--holiday-${primaryDayHoliday.color}-light)`
                } : {}}
              >
                {/* Day Header */}
                <div className="text-center mb-3 pb-2 border-b border-slate-100">
                  <div className={`text-xs font-medium uppercase tracking-wide ${
                    isToday ? 'text-slate-600' : 'text-ink/50'
                  }`}>
                    {DAY_NAMES[index]}
                    {hasDayHoliday && (
                      <span className="ml-1" title={dayHolidays.map(h => h.name).join(', ')}>
                        {primaryDayHoliday.emoji}
                      </span>
                    )}
                  </div>
                  <div className={`text-2xl font-bold mt-1 ${
                    isToday ? 'text-slate-600' : 'text-ink'
                  }`}>
                    {date.getDate()}
                  </div>
                  {isToday && (
                    <span className="text-[10px] font-medium text-white bg-slate-500 px-2 py-0.5 rounded-full">
                      Today
                    </span>
                  )}
                  {hasDayHoliday && !isToday && (
                    <div className="text-[9px] font-medium text-ink/60 mt-1 truncate" title={primaryDayHoliday.name}>
                      {primaryDayHoliday.name}
                    </div>
                  )}
                </div>

                {/* Events Stack */}
                <div className="space-y-2 min-h-[120px]">
                  {events.map((event, eventIndex) => (
                    <div
                      key={`${event.id}-${eventIndex}`}
                      draggable
                      onDragStart={() => onEventDragStart?.(event)}
                      onDragEnd={() => onEventDragEnd?.()}
                      onClick={() => onEventClick?.(event)}
                      className={`
                        relative p-2 rounded-lg cursor-grab active:cursor-grabbing transition-all hover:shadow-md
                        ${event.source === 'sermon' ? 'event-card-sage' : event.source === 'devotion' ? 'event-card-amber' : event.source === 'english' ? 'event-card-purple' : 'event-card-navy'}
                        ${draggedEvent?.id === event.id ? 'opacity-50' : ''}
                      `}
                    >
                      {/* Badge Row */}
                      <div className="flex items-center justify-between mb-1">
                        <span className={`text-[8px] font-bold uppercase px-1.5 py-0.5 rounded ${
                          event.source === 'sermon'
                            ? 'bg-sage-200 text-sage-700'
                            : event.source === 'devotion'
                            ? 'bg-amber-200 text-amber-700'
                            : event.source === 'english'
                            ? 'bg-purple-200 text-purple-700'
                            : 'bg-navy-200 text-navy-700'
                        }`}>
                          {event.source === 'sermon' ? 'Sermon' : event.source === 'devotion' ? 'Devotion' : event.source === 'english' ? 'English' : 'Relationship'}
                        </span>
                        {event.isPrepared && (
                          <span className="text-[10px]" title="Prepared">⭐</span>
                        )}
                      </div>

                      {/* Title */}
                      <div className="text-xs font-semibold text-ink leading-tight line-clamp-2">
                        {event.displayTitle}
                      </div>

                      {/* Subtitle */}
                      <div className="text-[10px] text-ink/50 mt-1 truncate">
                        {event.source === 'sermon' && (event.preacher || event.primary_text || '')}
                        {event.source === 'devotion' && (event.day ? (String(event.day).toLowerCase().startsWith('day') ? event.day : `Day ${event.day}`) : '')}
                        {event.source === 'english' && (event.series_title || '')}
                        {event.source === 'relationship' && (event.who?.map(w => w.title || w.name).join(', ') || '')}
                      </div>
                    </div>
                  ))}

                  {events.length === 0 && (
                    <div className="text-xs text-ink/30 text-center py-8">
                      No events
                    </div>
                  )}
                </div>

                {/* Plan Day Button - only show for today when there are events */}
                {isToday && events.length > 0 && onPlanDay && (
                  <button
                    onClick={async () => {
                      setPlanningDay(dateKey);
                      try {
                        await onPlanDay(dateKey, events);
                      } finally {
                        setPlanningDay(null);
                      }
                    }}
                    disabled={planningDay === dateKey}
                    className={`mt-3 w-full py-2 px-3 rounded-lg text-xs font-medium transition-all ${
                      planningDay === dateKey
                        ? 'bg-slate-200 text-slate-500 cursor-wait'
                        : 'bg-slate-600 text-white hover:bg-slate-700 active:scale-95'
                    }`}
                  >
                    {planningDay === dateKey ? (
                      <span className="flex items-center justify-center gap-2">
                        <svg className="animate-spin h-3 w-3" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                        </svg>
                        Planning...
                      </span>
                    ) : (
                      '📋 Plan Today'
                    )}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Legend */}
      <div className="flex items-center justify-center gap-4 md:gap-6 mt-4 pt-3 border-t border-slate-100 flex-wrap">
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded bg-sage-400" />
          <span className="text-xs text-ink/60">Sermons</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded bg-amber-400" />
          <span className="text-xs text-ink/60">Devotions</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded bg-purple-400" />
          <span className="text-xs text-ink/60">English</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded bg-navy-400" />
          <span className="text-xs text-ink/60">Relationships</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs">⭐</span>
          <span className="text-xs text-ink/60">Prepared</span>
        </div>
      </div>
    </div>
  );
}
