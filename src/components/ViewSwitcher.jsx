import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { VIEWS, VIEW_ORDER } from '../viewConfig';

export default function ViewSwitcher({ currentView, onViewChange }) {
  const [isOpen, setIsOpen] = useState(false);
  const [popoverPosition, setPopoverPosition] = useState({ top: 0, left: 0 });
  const popoverRef = useRef(null);
  const buttonRef = useRef(null);

  const current = VIEWS[currentView];

  // Calculate popover position when opening
  useEffect(() => {
    if (isOpen && buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect();
      setPopoverPosition({
        top: rect.bottom + 8,
        left: rect.left
      });
    }
  }, [isOpen]);

  // Close popover when clicking outside
  useEffect(() => {
    function handleClickOutside(event) {
      if (
        popoverRef.current &&
        !popoverRef.current.contains(event.target) &&
        buttonRef.current &&
        !buttonRef.current.contains(event.target)
      ) {
        setIsOpen(false);
      }
    }

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [isOpen]);

  // Close on escape key
  useEffect(() => {
    function handleEscape(event) {
      if (event.key === 'Escape') {
        setIsOpen(false);
      }
    }

    if (isOpen) {
      document.addEventListener('keydown', handleEscape);
      return () => document.removeEventListener('keydown', handleEscape);
    }
  }, [isOpen]);

  // Close on scroll
  useEffect(() => {
    function handleScroll() {
      setIsOpen(false);
    }

    if (isOpen) {
      window.addEventListener('scroll', handleScroll, true);
      return () => window.removeEventListener('scroll', handleScroll, true);
    }
  }, [isOpen]);

  const handleSelect = (viewId) => {
    onViewChange(viewId);
    setIsOpen(false);
  };

  // Render dropdown in a portal at document.body level
  const dropdown = isOpen && createPortal(
    <div
      ref={popoverRef}
      className="view-switcher-popover min-w-[260px]"
      style={{
        position: 'fixed',
        top: popoverPosition.top,
        left: popoverPosition.left,
        zIndex: 9999
      }}
      role="listbox"
      aria-activedescendant={currentView}
    >
      {VIEW_ORDER.map((viewId) => {
        const view = VIEWS[viewId];
        const isActive = viewId === currentView;

        return (
          <div
            key={viewId}
            role="option"
            aria-selected={isActive}
            className={`view-switcher-item ${isActive ? 'active' : ''}`}
            onClick={() => handleSelect(viewId)}
          >
            <span className="text-lg">{view.icon}</span>
            <span className="flex-1 font-medium text-ink">{view.name}</span>
            {isActive && (
              <svg className="w-4 h-4 text-ink/70" fill="currentColor" viewBox="0 0 20 20">
                <path
                  fillRule="evenodd"
                  d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                  clipRule="evenodd"
                />
              </svg>
            )}
          </div>
        );
      })}
    </div>,
    document.body
  );

  return (
    <>
      {/* Trigger Button */}
      <button
        ref={buttonRef}
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 px-3 py-2 rounded-xl transition-all duration-200 hover:bg-white/30"
        aria-expanded={isOpen}
        aria-haspopup="listbox"
      >
        <span className="text-xl">{current.icon}</span>
        <span className="font-semibold text-ink">{current.name}</span>
        <svg
          className={`w-4 h-4 text-ink/60 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* Dropdown rendered via portal */}
      {dropdown}
    </>
  );
}
