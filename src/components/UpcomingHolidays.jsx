/**
 * UpcomingHolidays Component
 *
 * Displays a horizontally scrollable row of upcoming holiday cards
 * showing holidays within the next 6 weeks with countdown text.
 * Collapsible with default collapsed state.
 */

import { useMemo, useState } from 'react';
import { getCountdownText } from '../utils/holidayCalculations';

export default function UpcomingHolidays({ getUpcoming, weeksAhead = 6, defaultExpanded = false }) {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);

  // Get upcoming holidays
  const upcomingHolidays = useMemo(() => {
    return getUpcoming(weeksAhead);
  }, [getUpcoming, weeksAhead]);

  // Don't render if no upcoming holidays
  if (!upcomingHolidays || upcomingHolidays.length === 0) {
    return null;
  }

  return (
    <div className="mt-4 px-1">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center gap-2 mb-2 hover:opacity-80 transition-opacity"
      >
        <svg
          className={`w-3.5 h-3.5 text-ink/50 transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
        <span className="text-xs font-medium text-ink/50 uppercase tracking-wide">
          Upcoming Holidays
        </span>
        {!isExpanded && (
          <span className="text-xs text-ink/40">({upcomingHolidays.length})</span>
        )}
        <div className="flex-1 h-px bg-ink/10" />
      </button>

      <div
        className={`overflow-hidden transition-all duration-300 ease-in-out ${
          isExpanded ? 'max-h-96 opacity-100' : 'max-h-0 opacity-0'
        }`}
      >
        <div className="upcoming-holidays">
          {upcomingHolidays.map((holiday) => (
            <div
              key={`${holiday.id}-${holiday.calculatedDate}`}
              className={`upcoming-holiday-card upcoming-holiday-card--${holiday.color}`}
              title={`${holiday.name} - ${formatDate(holiday.dateObj)}`}
            >
              <div className="upcoming-holiday-header">
                <span className="upcoming-holiday-emoji">{holiday.emoji}</span>
                <span className="upcoming-holiday-name">{holiday.name}</span>
              </div>
              <span className="upcoming-holiday-countdown">
                {getCountdownText(holiday.weeksAway, holiday.daysAway)}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/**
 * Format a date for display
 * @param {Date} date - The date to format
 * @returns {string} Formatted date string
 */
function formatDate(date) {
  return date.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
}
