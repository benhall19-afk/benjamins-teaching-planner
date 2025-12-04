import React from 'react';
import { isSermonPrepared, isDevotionPrepared, getDevotionDisplayTitle } from '../viewConfig';

export default function EventCard({ event, source, onClick, compact = false }) {
  const isPrepared = source === 'sermon'
    ? isSermonPrepared(event)
    : isDevotionPrepared(event);

  const displayTitle = source === 'sermon'
    ? (event.title || 'Untitled')
    : getDevotionDisplayTitle(event);

  const colorClass = source === 'sermon' ? 'event-card-sage' : 'event-card-amber';

  if (compact) {
    return (
      <div
        onClick={() => onClick?.(event, source)}
        className={`
          relative p-1.5 rounded cursor-pointer transition-all hover:scale-[1.02]
          ${colorClass}
        `}
      >
        {isPrepared && <span className="star-indicator" title="Prepared" />}
        <div className="text-[10px] font-medium text-ink/80 truncate pr-3">
          {displayTitle}
        </div>
      </div>
    );
  }

  return (
    <div
      onClick={() => onClick?.(event, source)}
      className={`
        relative p-2.5 rounded-lg cursor-pointer transition-all hover:scale-[1.02] hover:shadow-md
        ${colorClass}
      `}
    >
      {/* Star Indicator */}
      {isPrepared && (
        <span className="star-indicator" title="Prepared" />
      )}

      {/* Title */}
      <div className="text-sm font-medium text-ink/90 truncate pr-4">
        {displayTitle}
      </div>

      {/* Additional Info */}
      {source === 'sermon' && (
        <>
          {event.primary_text && (
            <div className="text-xs text-ink/60 mt-0.5 truncate">
              {event.primary_text}
            </div>
          )}
          {event.preacher && (
            <div className="text-xs text-ink/50 mt-0.5">
              {event.preacher}
            </div>
          )}
        </>
      )}

      {source === 'devotion' && (
        <>
          {event.title && event.week_lesson && (
            <div className="text-xs text-ink/60 mt-0.5 truncate">
              {event.title}
            </div>
          )}
        </>
      )}

      {/* Status Badge */}
      <div className="mt-1.5 flex items-center gap-1.5">
        {source === 'sermon' && event.status && (
          <span className={`
            text-[10px] px-1.5 py-0.5 rounded-full
            ${event.status === 'Complete' || event.status === 'Ready to Preach'
              ? 'bg-sage-100 text-sage-700'
              : event.status === 'in progress'
              ? 'bg-amber-100 text-amber-700'
              : 'bg-slate-100 text-slate-600'
            }
          `}>
            {event.status}
          </span>
        )}

        {source === 'devotion' && event.last_taught && (
          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700">
            Completed
          </span>
        )}
      </div>
    </div>
  );
}
