/**
 * UpcomingHolidays Component
 *
 * Displays a horizontally scrollable row of upcoming holiday cards
 * showing holidays within the next 6 weeks with countdown text.
 */

import { useMemo } from 'react';
import { getCountdownText } from '../utils/holidayCalculations';

export default function UpcomingHolidays({ getUpcoming, weeksAhead = 6 }) {
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
      <div className="flex items-center gap-2 mb-2">
        <span className="text-xs font-medium text-ink/50 uppercase tracking-wide">
          Upcoming Holidays
        </span>
        <div className="flex-1 h-px bg-ink/10" />
      </div>

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
