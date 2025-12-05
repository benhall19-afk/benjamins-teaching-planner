import React, { useState, useEffect } from 'react';
import * as api from '../api';
import { isSermonPrepared, isDevotionPrepared, getDevotionDisplayTitle } from '../viewConfig';
import LoadingIndicator from './LoadingIndicator';

export default function ItemDetailPopup({
  item,
  source,
  isOpen,
  onClose,
  onUpdate,
  onEdit
}) {
  const [markingComplete, setMarkingComplete] = useState(false);
  const [togglingPrepared, setTogglingPrepared] = useState(false);
  const [completionDate, setCompletionDate] = useState(
    new Date().toISOString().split('T')[0]
  );
  const [error, setError] = useState(null);

  // Local optimistic state for prepared toggle
  const initialPrepared = item
    ? (source === 'sermon' ? isSermonPrepared(item) : isDevotionPrepared(item))
    : false;
  const [localPrepared, setLocalPrepared] = useState(initialPrepared);

  // Local optimistic state for sermon status
  const [localStatus, setLocalStatus] = useState(item?.status || 'Draft');
  const [updatingStatus, setUpdatingStatus] = useState(false);

  // Reset local state when item changes
  useEffect(() => {
    if (item) {
      const prepared = source === 'sermon'
        ? isSermonPrepared(item)
        : isDevotionPrepared(item);
      setLocalPrepared(prepared);
      if (source === 'sermon') {
        setLocalStatus(item.status || 'Draft');
      }
    }
  }, [item, source]);

  // Lock body scroll when popup is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
      return () => {
        document.body.style.overflow = '';
      };
    }
  }, [isOpen]);

  if (!isOpen || !item) return null;

  const isPrepared = localPrepared;

  const displayTitle = source === 'sermon'
    ? (item.title || 'Untitled')
    : getDevotionDisplayTitle(item);

  const handleMarkComplete = async () => {
    setMarkingComplete(true);
    setError(null);

    try {
      if (source === 'sermon') {
        await api.updateScheduleEntry(item.id, {
          status: 'Complete'
        });
        onUpdate?.({ ...item, status: 'Complete' }, source);
      } else {
        await api.updateDevotionLesson(item.id, {
          last_taught: completionDate
        });
        onUpdate?.({ ...item, last_taught: completionDate }, source);
      }
      onClose();
    } catch (err) {
      console.error('Failed to mark complete:', err);
      setError(err.message || 'Failed to update. Please try again.');
    }

    setMarkingComplete(false);
  };

  const handleTogglePrepared = async () => {
    if (source !== 'devotion') return;

    const newValue = !localPrepared;

    // Optimistic update - flip immediately
    setLocalPrepared(newValue);
    setTogglingPrepared(true);
    setError(null);

    try {
      await api.updateDevotionLesson(item.id, {
        prepared_to_teach: newValue
      });
      onUpdate?.({ ...item, prepared_to_teach: newValue }, source);
    } catch (err) {
      // Revert on error
      setLocalPrepared(!newValue);
      console.error('Failed to toggle prepared:', err);
      setError(err.message || 'Failed to update. Please try again.');
    }

    setTogglingPrepared(false);
  };

  const handleStatusChange = async (newStatus) => {
    if (source !== 'sermon') return;

    const oldStatus = localStatus;

    // Optimistic update
    setLocalStatus(newStatus);
    setUpdatingStatus(true);
    setError(null);

    try {
      await api.updateScheduleEntry(item.id, { status: newStatus });
      onUpdate?.({ ...item, status: newStatus }, source);
    } catch (err) {
      // Revert on error
      setLocalStatus(oldStatus);
      console.error('Failed to update status:', err);
      setError(err.message || 'Failed to update status. Please try again.');
    }

    setUpdatingStatus(false);
  };

  const colorClass = source === 'sermon' ? 'sage' : 'amber';

  // Generate Craft deeplink URL (only for items with valid UUID format)
  const spaceId = import.meta.env.VITE_CRAFT_SPACE_ID;
  const isValidUUID = item.id && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(item.id);
  const craftDeepLink = spaceId && isValidUUID
    ? `craftdocs://open?blockId=${item.id}&spaceId=${spaceId}`
    : null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/30 modal-backdrop"
        onClick={onClose}
      />

      {/* Popup */}
      <div className="modal-glass relative w-full max-w-md p-4 sm:p-6 max-h-[85vh] sm:max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-start justify-between mb-4">
          <div className="flex-1 pr-4">
            <div className={`text-xs font-medium text-${colorClass}-600 uppercase tracking-wider mb-1`}>
              {source === 'sermon' ? 'Sermon' : (item.category || 'Devotion')}
            </div>
            {source === 'sermon' && (
              <h2 className="text-xl font-semibold text-ink">{displayTitle}</h2>
            )}
          </div>
          <button
            onClick={onClose}
            className={`p-1 hover:bg-${colorClass}-100 rounded-lg transition-colors`}
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Details */}
        <div className="flex-1 overflow-y-auto">
          <div className="w-full">
            <div className="space-y-4">
              {/* Details */}
              <div className="bg-white/50 rounded-xl p-4 space-y-2">
                {source === 'sermon' && (
                  <>
                    {item.series && (
                      <div>
                        <span className="text-xs text-ink/50">Series:</span>
                        <div className="text-sm font-medium text-ink">{item.series}</div>
                      </div>
                    )}
                    {item.primary_text && (
                      <div>
                        <span className="text-xs text-ink/50">Primary Text:</span>
                        <div className="text-sm font-medium text-ink">{item.primary_text}</div>
                      </div>
                    )}
                    {item.preacher && (
                      <div>
                        <span className="text-xs text-ink/50">Preacher:</span>
                        <div className="text-sm font-medium text-ink">{item.preacher}</div>
                      </div>
                    )}
                    {item.sermon_date && (
                      <div>
                        <span className="text-xs text-ink/50">Date:</span>
                        <div className="text-sm font-medium text-ink">
                          {new Date(item.sermon_date).toLocaleDateString('en-US', {
                            weekday: 'long',
                            year: 'numeric',
                            month: 'long',
                            day: 'numeric'
                          })}
                        </div>
                      </div>
                    )}
                    {item.notes && (
                      <div>
                        <span className="text-xs text-ink/50">Notes:</span>
                        <div className="text-sm text-ink">{item.notes}</div>
                      </div>
                    )}
                  </>
                )}

                {source === 'devotion' && (
                  <>
                    {item.title && (
                      <div>
                        <span className="text-xs text-ink/50">Title:</span>
                        <div className="text-sm font-medium text-ink">{item.title}</div>
                      </div>
                    )}
                    {item.week_lesson && (
                      <div>
                        <span className="text-xs text-ink/50">Week Lesson:</span>
                        <div className="text-sm font-medium text-ink">{item.week_lesson}</div>
                      </div>
                    )}
                    {item.last_taught && (
                      <div>
                        <span className="text-xs text-ink/50">Completed:</span>
                        <div className="text-sm font-medium text-ink">
                          {new Date(item.last_taught).toLocaleDateString()}
                        </div>
                      </div>
                    )}
                  </>
                )}
              </div>

              {/* Prepared Toggle (Devotions only) */}
              {source === 'devotion' && (
                <div className="flex items-center justify-between bg-white/50 rounded-xl p-4">
                  <div>
                    <div className="text-sm font-medium text-ink">Prepared to Teach</div>
                    <div className="text-xs text-ink/50">Mark when lesson is ready</div>
                  </div>
                  <button
                    onClick={handleTogglePrepared}
                    disabled={togglingPrepared}
                    className={`
                      relative w-12 h-6 rounded-full transition-colors
                      ${isPrepared ? 'bg-amber-500' : 'bg-slate-200'}
                      ${togglingPrepared ? 'opacity-50' : ''}
                    `}
                  >
                    <span
                      className={`
                        absolute top-0.5 w-5 h-5 rounded-full bg-white shadow-sm transition-transform
                        ${isPrepared ? 'left-6' : 'left-0.5'}
                      `}
                    />
                  </button>
                </div>
              )}

              {/* Status Section (Sermons) */}
              {source === 'sermon' && (
                <div className="bg-white/50 rounded-xl p-4">
                  <div className="text-sm font-medium text-ink mb-2">Status</div>
                  <select
                    value={localStatus}
                    onChange={(e) => handleStatusChange(e.target.value)}
                    disabled={updatingStatus}
                    className={`w-full input-glass text-sm ${updatingStatus ? 'opacity-50' : ''}`}
                  >
                    <option value="Draft">Draft</option>
                    <option value="In Progress">In Progress</option>
                    <option value="Ready to Preach">Ready to Preach</option>
                    <option value="Complete">Complete</option>
                    <option value="Archive">Archive</option>
                  </select>
                </div>
              )}

              {/* Mark Complete Section (Devotions only) */}
              {source === 'devotion' && (
                <div className="bg-white/50 rounded-xl p-4">
                  <div className="text-sm font-medium text-ink mb-2">Mark as Complete</div>
                  <div className="flex gap-2">
                    <input
                      type="date"
                      value={completionDate}
                      onChange={(e) => setCompletionDate(e.target.value)}
                      className="flex-1 input-glass text-sm"
                    />
                    <button
                      onClick={handleMarkComplete}
                      disabled={markingComplete}
                      className="px-4 py-2 btn-themed text-sm disabled:opacity-50"
                    >
                      {markingComplete ? 'Saving...' : 'Complete'}
                    </button>
                  </div>
                </div>
              )}

              {/* Error Message */}
              {error && (
                <div className="bg-red-50 text-red-700 rounded-xl p-4 text-sm">
                  {error}
                </div>
              )}

              {/* Action Buttons */}
              <div className="flex flex-col gap-2 pt-2">
                {/* Open in Craft Link */}
                {craftDeepLink && (
                  <a
                    href={craftDeepLink}
                    className={`flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium rounded-full transition-all
                      bg-gradient-to-r ${source === 'sermon' ? 'from-sage-100 to-sage-50 text-sage-700 hover:from-sage-200 hover:to-sage-100' : 'from-amber-100 to-amber-50 text-amber-700 hover:from-amber-200 hover:to-amber-100'}
                    `}
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                    </svg>
                    Open in Craft
                  </a>
                )}
                <div className="flex gap-3">
                  <button
                    onClick={onClose}
                    className="flex-1 px-4 py-2.5 btn-glass text-sm"
                  >
                    Close
                  </button>
                  <button
                    onClick={() => onEdit?.(item, source)}
                    className="flex-1 px-4 py-2.5 btn-themed text-sm"
                  >
                    Edit Details
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Loading Indicator */}
      <LoadingIndicator
        isLoading={togglingPrepared || markingComplete || updatingStatus}
        colorClass={colorClass}
        message={markingComplete ? 'Marking complete...' : updatingStatus ? 'Updating status...' : 'Updating...'}
      />
    </div>
  );
}
