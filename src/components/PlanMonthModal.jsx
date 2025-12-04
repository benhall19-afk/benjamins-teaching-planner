import React, { useState, useMemo } from 'react';
import * as api from '../api';

export default function PlanMonthModal({
  isOpen,
  onClose,
  activeSeries,
  lessons,
  onPlanComplete
}) {
  const [isPlanning, setIsPlanning] = useState(false);
  const [error, setError] = useState(null);

  // Find the last completed lesson and next lesson to schedule
  const planInfo = useMemo(() => {
    if (!lessons || lessons.length === 0) {
      return { lastCompleted: null, nextLesson: null, upcomingCount: 0 };
    }

    // Sort lessons by lesson_order (if available) or fall back to week/day parsing
    const sortedLessons = [...lessons].sort((a, b) => {
      // Prefer lesson_order if both have it
      const orderA = a.lesson_order ?? a.properties?.lesson_order;
      const orderB = b.lesson_order ?? b.properties?.lesson_order;

      if (orderA != null && orderB != null) {
        return orderA - orderB;
      }

      // Fall back to week/day parsing
      const weekA = parseInt((a.week_lesson || '').match(/\d+/)?.[0] || '0');
      const weekB = parseInt((b.week_lesson || '').match(/\d+/)?.[0] || '0');
      if (weekA !== weekB) return weekA - weekB;

      const dayA = parseInt((a.day || '').match(/\d+/)?.[0] || '0');
      const dayB = parseInt((b.day || '').match(/\d+/)?.[0] || '0');
      return dayA - dayB;
    });

    // Find last completed lesson (has last_taught date) - get the one with highest order
    let lastCompletedIndex = -1;
    sortedLessons.forEach((lesson, idx) => {
      if (lesson.last_taught) {
        lastCompletedIndex = idx;
      }
    });

    const lastCompleted = lastCompletedIndex >= 0 ? sortedLessons[lastCompletedIndex] : null;
    const nextLesson = sortedLessons[lastCompletedIndex + 1] || sortedLessons[0];

    // Count lessons without scheduled_date after the last completed
    const upcomingCount = sortedLessons.slice(lastCompletedIndex + 1)
      .filter(l => !l.scheduled_date).length;

    return { lastCompleted, nextLesson, upcomingCount };
  }, [lessons]);

  // Get configured days from active series
  const scheduledDays = useMemo(() => {
    if (!activeSeries || !activeSeries.what_days_of_the_week) return [];

    // Map day names to day numbers
    const daysMap = {
      'sunday': 0, 'sun': 0,
      'monday': 1, 'mon': 1,
      'tuesday': 2, 'tue': 2,
      'wednesday': 3, 'wed': 3,
      'thursday': 4, 'thu': 4,
      'friday': 5, 'fri': 5,
      'saturday': 6, 'sat': 6
    };

    // Handle both array and string formats
    const daysArray = Array.isArray(activeSeries.what_days_of_the_week)
      ? activeSeries.what_days_of_the_week
      : activeSeries.what_days_of_the_week.split(/[,\s]+/);

    return daysArray
      .map(d => d.toLowerCase().trim())
      .filter(d => daysMap[d] !== undefined)
      .map(d => daysMap[d]);
  }, [activeSeries]);

  const handlePlan = async () => {
    setIsPlanning(true);
    setError(null);

    try {
      const result = await api.planDevotionsMonth();
      onPlanComplete?.(result);
      onClose();
    } catch (err) {
      console.error('Failed to plan month:', err);
      setError(err.message || 'Failed to schedule lessons. Please try again.');
    }

    setIsPlanning(false);
  };

  if (!isOpen) return null;

  const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/30 modal-backdrop"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="modal-glass relative w-full max-w-md p-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold text-ink">Plan This Month</h2>
          <button
            onClick={onClose}
            className="p-1 hover:bg-amber-100 rounded-lg transition-colors"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="space-y-4">
          {/* Active Series Info */}
          {activeSeries ? (
            <div className="bg-amber-50 rounded-xl p-4">
              <div className="text-sm text-amber-700 font-medium mb-1">Active Series</div>
              <div className="text-lg font-semibold text-ink">{activeSeries.title}</div>
              {scheduledDays.length > 0 && (
                <div className="text-sm text-amber-600 mt-1">
                  Days: {scheduledDays.map(d => dayNames[d].substring(0, 3)).join(', ')}
                </div>
              )}
            </div>
          ) : (
            <div className="bg-amber-50 rounded-xl p-4 text-amber-700">
              No active series found. Please configure an active devotion series.
            </div>
          )}

          {/* Last Completed */}
          {planInfo.lastCompleted && (
            <div className="bg-white/50 rounded-xl p-4">
              <div className="text-sm text-ink/50 mb-1">Last Completed</div>
              <div className="font-medium text-ink">
                {planInfo.lastCompleted.week_lesson}{planInfo.lastCompleted.day ? ` - ${planInfo.lastCompleted.day}` : ''}
              </div>
              <div className="text-sm text-ink/60">
                {new Date(planInfo.lastCompleted.last_taught).toLocaleDateString()}
              </div>
            </div>
          )}

          {/* Next Lesson */}
          {planInfo.nextLesson && (
            <div className="bg-white/50 rounded-xl p-4">
              <div className="text-sm text-ink/50 mb-1">Next Lesson to Schedule</div>
              <div className="font-medium text-ink">
                {planInfo.nextLesson.week_lesson}{planInfo.nextLesson.day ? ` - ${planInfo.nextLesson.day}` : ''}
              </div>
              {planInfo.upcomingCount > 0 && (
                <div className="text-sm text-amber-600 mt-1">
                  {planInfo.upcomingCount} lessons will be scheduled
                </div>
              )}
            </div>
          )}

          {/* Error Message */}
          {error && (
            <div className="bg-red-50 text-red-700 rounded-xl p-4 text-sm">
              {error}
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex gap-3 pt-2">
            <button
              onClick={onClose}
              className="flex-1 px-4 py-2.5 btn-glass text-sm"
            >
              Cancel
            </button>
            <button
              onClick={handlePlan}
              disabled={isPlanning || !activeSeries}
              className="flex-1 px-4 py-2.5 btn-themed text-sm disabled:opacity-50"
            >
              {isPlanning ? (
                <span className="flex items-center justify-center gap-2">
                  <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Planning...
                </span>
              ) : (
                'Plan 30 Days'
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
