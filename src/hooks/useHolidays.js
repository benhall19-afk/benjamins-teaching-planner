/**
 * useHolidays Hook
 *
 * React hook for managing holiday data with:
 * - Memoized holiday calculations (cached by year)
 * - localStorage persistence for custom holidays
 * - Functions to get holidays by date or week
 * - CRUD operations for custom holidays
 */

import { useState, useEffect, useMemo, useCallback } from 'react';
import { HOLIDAY_RULES, createCustomHoliday, getHolidayColor, HOLIDAY_COLORS } from '../holidays';
import {
  calculateHolidaysForYear,
  getWeekKey,
  formatDateKey,
  getUpcomingHolidays,
} from '../utils/holidayCalculations';

const STORAGE_KEY = 'sermon-manager-custom-holidays';

/**
 * Hook for managing and accessing holiday data
 * @param {Date} currentDate - The current date being viewed (for year calculation)
 * @returns {Object} Holiday data and functions
 */
export function useHolidays(currentDate) {
  // Load custom holidays from localStorage
  const [customHolidays, setCustomHolidays] = useState(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      return stored ? JSON.parse(stored) : {};
    } catch {
      return {};
    }
  });

  // State for Holiday Management Modal
  const [isManagementOpen, setIsManagementOpen] = useState(false);

  // Save custom holidays to localStorage when they change
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(customHolidays));
    } catch (error) {
      console.error('Failed to save custom holidays:', error);
    }
  }, [customHolidays]);

  // Merge built-in and custom holidays
  const allHolidayRules = useMemo(() => ({
    ...HOLIDAY_RULES,
    ...customHolidays,
  }), [customHolidays]);

  // Calculate holidays for visible year range (current year +/- 1)
  // This ensures smooth transitions when viewing December/January
  const holidayCache = useMemo(() => {
    const currentYear = currentDate.getFullYear();
    const years = [currentYear - 1, currentYear, currentYear + 1];

    const cache = {};
    years.forEach(year => {
      cache[year] = calculateHolidaysForYear(year, allHolidayRules);
    });

    return cache;
  }, [currentDate.getFullYear(), allHolidayRules]);

  /**
   * Get holidays for a specific date
   * @param {string} dateStr - Date in "YYYY-MM-DD" format
   * @returns {Array} Array of holidays on that date
   */
  const getHolidaysForDate = useCallback((dateStr) => {
    if (!dateStr) return [];
    const year = parseInt(dateStr.split('-')[0]);
    return holidayCache[year]?.holidays[dateStr] || [];
  }, [holidayCache]);

  /**
   * Get holidays for a specific week
   * @param {string} weekKey - Week in "YYYY-WNN" format
   * @returns {Array} Array of holidays in that week
   */
  const getHolidaysForWeek = useCallback((weekKey) => {
    if (!weekKey) return [];
    const year = parseInt(weekKey.split('-W')[0]);
    return holidayCache[year]?.weekHolidays[weekKey] || [];
  }, [holidayCache]);

  /**
   * Get holidays for a week containing a specific date
   * @param {Date} date - A date within the week
   * @returns {Array} Array of holidays in that week
   */
  const getHolidaysForWeekFromDate = useCallback((date) => {
    if (!date) return [];
    const weekKey = getWeekKey(date);
    return getHolidaysForWeek(weekKey);
  }, [getHolidaysForWeek]);

  /**
   * Get all holidays for a specific year (for management UI)
   * @param {number} year - The year
   * @returns {Object} Calculated holidays for that year
   */
  const getHolidaysForYear = useCallback((year) => {
    if (holidayCache[year]) {
      return holidayCache[year];
    }
    // Calculate on demand if not in cache
    return calculateHolidaysForYear(year, allHolidayRules);
  }, [holidayCache, allHolidayRules]);

  /**
   * Get upcoming holidays within specified weeks
   * @param {number} weeksAhead - Number of weeks to look ahead
   * @returns {Array} Array of upcoming holidays sorted by date
   */
  const getUpcoming = useCallback((weeksAhead = 6) => {
    return getUpcomingHolidays(allHolidayRules, weeksAhead);
  }, [allHolidayRules]);

  /**
   * Add a new custom holiday
   * @param {Object} holidayData - Holiday data
   * @returns {Object} The created holiday
   */
  const addCustomHoliday = useCallback((holidayData) => {
    const newHoliday = createCustomHoliday(holidayData);
    setCustomHolidays(prev => ({
      ...prev,
      [newHoliday.id]: newHoliday,
    }));
    return newHoliday;
  }, []);

  /**
   * Update a custom holiday
   * @param {string} id - Holiday ID
   * @param {Object} updates - Fields to update
   */
  const updateCustomHoliday = useCallback((id, updates) => {
    setCustomHolidays(prev => {
      if (!prev[id]) return prev;
      return {
        ...prev,
        [id]: { ...prev[id], ...updates },
      };
    });
  }, []);

  /**
   * Delete a custom holiday
   * @param {string} id - Holiday ID to delete
   */
  const deleteCustomHoliday = useCallback((id) => {
    setCustomHolidays(prev => {
      const { [id]: removed, ...rest } = prev;
      return rest;
    });
  }, []);

  /**
   * Check if a date has any holidays
   * @param {string} dateStr - Date in "YYYY-MM-DD" format
   * @returns {boolean} True if date has holidays
   */
  const hasHoliday = useCallback((dateStr) => {
    return getHolidaysForDate(dateStr).length > 0;
  }, [getHolidaysForDate]);

  /**
   * Check if a week has any holidays
   * @param {string} weekKey - Week in "YYYY-WNN" format
   * @returns {boolean} True if week has holidays
   */
  const weekHasHoliday = useCallback((weekKey) => {
    return getHolidaysForWeek(weekKey).length > 0;
  }, [getHolidaysForWeek]);

  // Modal control functions
  const openManagement = useCallback(() => setIsManagementOpen(true), []);
  const closeManagement = useCallback(() => setIsManagementOpen(false), []);

  return {
    // Data
    allHolidayRules,
    customHolidays,
    holidayColors: HOLIDAY_COLORS,

    // Date/week lookups
    getHolidaysForDate,
    getHolidaysForWeek,
    getHolidaysForWeekFromDate,
    getHolidaysForYear,
    getUpcoming,

    // Utility checks
    hasHoliday,
    weekHasHoliday,
    getHolidayColor,
    getWeekKey,
    formatDateKey,

    // CRUD operations
    addCustomHoliday,
    updateCustomHoliday,
    deleteCustomHoliday,

    // Modal state
    isManagementOpen,
    openManagement,
    closeManagement,
  };
}

export default useHolidays;
