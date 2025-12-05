/**
 * HolidayManagementModal Component
 *
 * Modal for viewing and managing holidays:
 * - View all built-in holidays with their calculated dates
 * - Add custom one-time or recurring holidays
 * - Edit/delete custom holidays
 */

import { useState, useMemo } from 'react';
import { HOLIDAY_RULES, HOLIDAY_COLORS } from '../holidays';

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

const COLOR_OPTIONS = Object.keys(HOLIDAY_COLORS);

const EMOJI_OPTIONS = ['📌', '🎉', '💝', '🎄', '✝️', '🦃', '💐', '👔', '💦', '🪷', '👑', '💙', '🌟', '🎁', '🏆', '🎂', '🙏', '❤️', '🌸', '🔔'];

export default function HolidayManagementModal({
  isOpen,
  onClose,
  allHolidayRules,
  customHolidays,
  getHolidaysForYear,
  onAddHoliday,
  onDeleteHoliday
}) {
  const [viewYear, setViewYear] = useState(new Date().getFullYear());
  const [showAddForm, setShowAddForm] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    emoji: '📌',
    color: 'slate',
    recurring: true,
    ruleType: 'fixed',
    month: 0,
    day: 1,
    weekday: 0,
    nth: 1,
    date: ''
  });

  // Get all holidays for the selected year
  const yearHolidays = useMemo(() => {
    if (!getHolidaysForYear) return { holidays: {} };
    return getHolidaysForYear(viewYear);
  }, [getHolidaysForYear, viewYear]);

  // Flatten holidays into a sorted list
  const holidayList = useMemo(() => {
    const list = [];
    Object.entries(yearHolidays.holidays || {}).forEach(([dateStr, holidays]) => {
      holidays.forEach(h => {
        list.push({
          ...h,
          dateStr,
          isBuiltIn: !h.isCustom
        });
      });
    });
    // Sort by date
    list.sort((a, b) => new Date(a.dateStr) - new Date(b.dateStr));
    return list;
  }, [yearHolidays]);

  const resetForm = () => {
    setFormData({
      name: '',
      emoji: '📌',
      color: 'slate',
      recurring: true,
      ruleType: 'fixed',
      month: 0,
      day: 1,
      weekday: 0,
      nth: 1,
      date: ''
    });
    setShowAddForm(false);
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!formData.name.trim()) return;

    const holidayData = {
      name: formData.name.trim(),
      emoji: formData.emoji,
      color: formData.color,
      recurring: formData.recurring,
      ruleType: formData.ruleType,
      month: formData.month,
      day: formData.day,
      weekday: formData.weekday,
      nth: formData.nth
    };

    // For one-time holidays, add year and full date
    if (!formData.recurring && formData.date) {
      const dateObj = new Date(formData.date);
      holidayData.year = dateObj.getFullYear();
      holidayData.date = formData.date;
    }

    onAddHoliday?.(holidayData);
    resetForm();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/30 modal-backdrop"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative modal-glass w-full max-w-2xl max-h-[85vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="p-4 border-b border-ink/10 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-ink">Holiday Calendar</h2>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-ink/10 transition-colors"
          >
            <span className="text-xl leading-none">&times;</span>
          </button>
        </div>

        {/* Year Navigation */}
        <div className="p-3 border-b border-ink/5 flex items-center justify-center gap-4">
          <button
            onClick={() => setViewYear(y => y - 1)}
            className="p-2 hover:bg-ink/5 rounded-lg transition-colors"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <span className="text-lg font-bold text-ink min-w-[80px] text-center">{viewYear}</span>
          <button
            onClick={() => setViewYear(y => y + 1)}
            className="p-2 hover:bg-ink/5 rounded-lg transition-colors"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </button>
        </div>

        {/* Holiday List */}
        <div className="flex-1 overflow-y-auto p-4">
          {holidayList.length === 0 ? (
            <div className="text-center text-ink/50 py-8">
              No holidays found for {viewYear}
            </div>
          ) : (
            <div className="space-y-2">
              {holidayList.map((holiday, index) => (
                <div
                  key={`${holiday.id}-${index}`}
                  className="flex items-center gap-3 p-3 rounded-lg bg-white/50 hover:bg-white/80 transition-colors"
                >
                  {/* Color indicator */}
                  <div
                    className="w-1 h-10 rounded-full flex-shrink-0"
                    style={{ backgroundColor: HOLIDAY_COLORS[holiday.color]?.hex || '#64748b' }}
                  />

                  {/* Emoji */}
                  <span className="text-xl flex-shrink-0">{holiday.emoji}</span>

                  {/* Name and date */}
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-ink truncate">{holiday.name}</div>
                    <div className="text-xs text-ink/50">
                      {formatDateDisplay(holiday.dateStr)}
                    </div>
                  </div>

                  {/* Type badge */}
                  <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${
                    holiday.isBuiltIn
                      ? 'bg-ink/10 text-ink/60'
                      : 'bg-amber-100 text-amber-700'
                  }`}>
                    {holiday.isBuiltIn ? 'Built-in' : 'Custom'}
                  </span>

                  {/* Delete button (custom only) */}
                  {!holiday.isBuiltIn && (
                    <button
                      onClick={() => onDeleteHoliday?.(holiday.id)}
                      className="p-1.5 text-ink/40 hover:text-red-500 hover:bg-red-50 rounded transition-colors"
                      title="Delete holiday"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Add Holiday Form */}
        {showAddForm ? (
          <div className="p-4 border-t border-ink/10 bg-white/50">
            <form onSubmit={handleSubmit} className="space-y-3">
              <div className="flex items-center gap-2 mb-3">
                <span className="font-medium text-ink">Add Custom Holiday</span>
                <button
                  type="button"
                  onClick={resetForm}
                  className="ml-auto text-xs text-ink/50 hover:text-ink"
                >
                  Cancel
                </button>
              </div>

              {/* Name and Emoji Row */}
              <div className="flex gap-2">
                <div className="flex-1">
                  <input
                    type="text"
                    value={formData.name}
                    onChange={(e) => setFormData(f => ({ ...f, name: e.target.value }))}
                    placeholder="Holiday name..."
                    className="w-full input-glass text-sm"
                    required
                  />
                </div>
                <select
                  value={formData.emoji}
                  onChange={(e) => setFormData(f => ({ ...f, emoji: e.target.value }))}
                  className="select-glass text-sm w-16"
                >
                  {EMOJI_OPTIONS.map(emoji => (
                    <option key={emoji} value={emoji}>{emoji}</option>
                  ))}
                </select>
                <select
                  value={formData.color}
                  onChange={(e) => setFormData(f => ({ ...f, color: e.target.value }))}
                  className="select-glass text-sm"
                >
                  {COLOR_OPTIONS.map(color => (
                    <option key={color} value={color}>{color}</option>
                  ))}
                </select>
              </div>

              {/* Recurring toggle */}
              <div className="flex items-center gap-3">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    checked={formData.recurring}
                    onChange={() => setFormData(f => ({ ...f, recurring: true }))}
                    className="accent-sage-500"
                  />
                  <span className="text-sm">Recurring (every year)</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    checked={!formData.recurring}
                    onChange={() => setFormData(f => ({ ...f, recurring: false }))}
                    className="accent-sage-500"
                  />
                  <span className="text-sm">One-time</span>
                </label>
              </div>

              {/* Date input based on recurring type */}
              {formData.recurring ? (
                <div className="flex gap-2">
                  <select
                    value={formData.ruleType}
                    onChange={(e) => setFormData(f => ({ ...f, ruleType: e.target.value }))}
                    className="select-glass text-sm"
                  >
                    <option value="fixed">Fixed Date</option>
                    <option value="relative">Relative (e.g., 2nd Sunday)</option>
                  </select>

                  {formData.ruleType === 'fixed' ? (
                    <>
                      <select
                        value={formData.month}
                        onChange={(e) => setFormData(f => ({ ...f, month: parseInt(e.target.value) }))}
                        className="select-glass text-sm flex-1"
                      >
                        {MONTHS.map((m, i) => (
                          <option key={i} value={i}>{m}</option>
                        ))}
                      </select>
                      <input
                        type="number"
                        min="1"
                        max="31"
                        value={formData.day}
                        onChange={(e) => setFormData(f => ({ ...f, day: parseInt(e.target.value) || 1 }))}
                        className="input-glass text-sm w-16"
                      />
                    </>
                  ) : (
                    <>
                      <select
                        value={formData.nth}
                        onChange={(e) => setFormData(f => ({ ...f, nth: parseInt(e.target.value) }))}
                        className="select-glass text-sm"
                      >
                        <option value={1}>1st</option>
                        <option value={2}>2nd</option>
                        <option value={3}>3rd</option>
                        <option value={4}>4th</option>
                        <option value={5}>5th</option>
                      </select>
                      <select
                        value={formData.weekday}
                        onChange={(e) => setFormData(f => ({ ...f, weekday: parseInt(e.target.value) }))}
                        className="select-glass text-sm"
                      >
                        {WEEKDAYS.map((d, i) => (
                          <option key={i} value={i}>{d}</option>
                        ))}
                      </select>
                      <select
                        value={formData.month}
                        onChange={(e) => setFormData(f => ({ ...f, month: parseInt(e.target.value) }))}
                        className="select-glass text-sm flex-1"
                      >
                        {MONTHS.map((m, i) => (
                          <option key={i} value={i}>{m}</option>
                        ))}
                      </select>
                    </>
                  )}
                </div>
              ) : (
                <input
                  type="date"
                  value={formData.date}
                  onChange={(e) => setFormData(f => ({ ...f, date: e.target.value }))}
                  className="input-glass text-sm w-full"
                  required={!formData.recurring}
                />
              )}

              <button
                type="submit"
                className="w-full btn-themed py-2 text-sm"
              >
                Add Holiday
              </button>
            </form>
          </div>
        ) : (
          <div className="p-4 border-t border-ink/10">
            <button
              onClick={() => setShowAddForm(true)}
              className="w-full btn-glass py-2 text-sm flex items-center justify-center gap-2"
            >
              <span>+</span>
              <span>Add Custom Holiday</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Format a date string for display
 */
function formatDateDisplay(dateStr) {
  const date = new Date(dateStr + 'T00:00:00');
  return date.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric'
  });
}
