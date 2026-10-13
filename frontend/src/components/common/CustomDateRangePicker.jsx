import React, { useState, useRef, useEffect, useLayoutEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import Calendar from 'react-calendar';
import './CustomDatePicker.css';
import { formatDateToYMD, formatDateToDisplay } from './CustomDatePicker';

// Calculates popover coordinates synchronously from trigger element
const calculatePosition = (el) => {
  if (!el) return null;
  const rect = el.getBoundingClientRect();
  const calendarHeight = 350;
  const calendarWidth = 280;
  const spaceBelow = window.innerHeight - rect.bottom;
  const spaceAbove = rect.top;

  const openUpwards = spaceBelow < calendarHeight && spaceAbove > spaceBelow;

  let top = 0;
  if (openUpwards) {
    top = Math.max(8, rect.top - calendarHeight - 6);
  } else {
    top = rect.bottom + 6;
    if (top + calendarHeight > window.innerHeight - 8) {
      top = Math.max(8, window.innerHeight - calendarHeight - 8);
    }
  }

  let left = rect.left;
  if (left + calendarWidth > window.innerWidth - 8) {
    left = Math.max(8, window.innerWidth - calendarWidth - 8);
  }
  if (left < 8) {
    left = 8;
  }

  return { top, left, openUpwards };
};

const CustomDateRangePicker = ({
  startDate,
  endDate,
  onApply,
  onClear,
  className = ''
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [coords, setCoords] = useState(null);
  const [tempRange, setTempRange] = useState([
    startDate ? new Date(startDate) : null,
    endDate ? new Date(endDate) : null
  ]);

  const containerRef = useRef(null);
  const triggerRef = useRef(null);
  const popoverRef = useRef(null);

  useEffect(() => {
    setTempRange([
      startDate ? new Date(startDate) : null,
      endDate ? new Date(endDate) : null
    ]);
  }, [startDate, endDate]);

  const updatePosition = useCallback(() => {
    const el = triggerRef.current || containerRef.current;
    if (!el) return;
    const newCoords = calculatePosition(el);
    if (newCoords) {
      setCoords((prev) => {
        if (
          prev &&
          prev.top === newCoords.top &&
          prev.left === newCoords.left &&
          prev.openUpwards === newCoords.openUpwards
        ) {
          return prev;
        }
        return newCoords;
      });
    }
  }, []);

  useLayoutEffect(() => {
    if (!isOpen) return;
    updatePosition();
  }, [isOpen, updatePosition]);

  useEffect(() => {
    if (!isOpen) return;

    const handleScrollOrResize = () => {
      updatePosition();
    };

    window.addEventListener('resize', handleScrollOrResize, { passive: true });
    window.addEventListener('scroll', handleScrollOrResize, { capture: true, passive: true });

    return () => {
      window.removeEventListener('resize', handleScrollOrResize);
      window.removeEventListener('scroll', handleScrollOrResize, { capture: true });
    };
  }, [isOpen, updatePosition]);

  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (event) => {
      const isInsideTrigger =
        (containerRef.current && containerRef.current.contains(event.target)) ||
        (triggerRef.current && triggerRef.current.contains(event.target));
      const isInsidePopover = popoverRef.current && popoverRef.current.contains(event.target);

      if (!isInsideTrigger && !isInsidePopover) {
        setIsOpen(false);
      }
    };

    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen]);

  const handleRangeChange = (value) => {
    if (Array.isArray(value)) {
      setTempRange(value);
    } else {
      setTempRange([value, value]);
    }
  };

  const handleApply = () => {
    if (tempRange && tempRange[0]) {
      const startStr = formatDateToYMD(tempRange[0]);
      const endStr = tempRange[1] ? formatDateToYMD(tempRange[1]) : startStr;
      onApply(startStr, endStr);
      setIsOpen(false);
    }
  };

  const handleClearAll = () => {
    setTempRange([null, null]);
    if (onClear) {
      onClear();
    }
    setIsOpen(false);
  };

  const isRangeSelected = startDate && endDate;

  const handleToggle = () => {
    if (!isOpen) {
      const el = triggerRef.current || containerRef.current;
      const initialCoords = calculatePosition(el);
      if (initialCoords) {
        setCoords(initialCoords);
      }
      setIsOpen(true);
    } else {
      setIsOpen(false);
    }
  };

  return (
    <div ref={containerRef} className={`relative inline-block ${className}`}>
      {/* Trigger Button / Input Display */}
      <div
        ref={triggerRef}
        onClick={handleToggle}
        className={`flex items-center gap-2 px-3 py-1.5 bg-white border border-gray-200 rounded-xl text-sm transition-all cursor-pointer shadow-sm hover:border-teal-400 select-none ${
          isOpen ? 'border-teal-500 ring-2 ring-teal-500/20' : ''
        }`}
      >
        <svg className="w-4 h-4 text-teal-600 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
        </svg>
        <span className="text-xs font-semibold text-gray-700">
          {isRangeSelected ? (
            `${formatDateToDisplay(startDate)} - ${formatDateToDisplay(endDate)}`
          ) : (
            'Select Custom Date Range'
          )}
        </span>
        <svg className="w-3.5 h-3.5 text-gray-400 ml-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </div>

      {/* Popover Calendar via Portal */}
      {isOpen && coords &&
        createPortal(
          <div
            ref={popoverRef}
            style={{
              position: 'fixed',
              top: `${coords.top}px`,
              left: `${coords.left}px`,
              zIndex: 99999,
              transition: 'none'
            }}
            className="animate-in fade-in zoom-in-95 duration-150 select-none shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="bg-white rounded-2xl shadow-2xl border border-gray-200 p-2 min-w-[275px] overflow-hidden ring-1 ring-black/10">
              <div className="flex items-center justify-between pb-2 px-1 mb-1 border-b border-gray-100">
                <span className="text-[11px] font-bold text-gray-700">Choose Date Range</span>
                {tempRange[0] && (
                  <span className="text-[11px] text-teal-600 font-semibold">
                    {formatDateToDisplay(tempRange[0])} {tempRange[1] ? `→ ${formatDateToDisplay(tempRange[1])}` : ''}
                  </span>
                )}
              </div>

              <Calendar
                selectRange={true}
                onChange={handleRangeChange}
                value={tempRange[0] ? tempRange : new Date()}
                className="custom-react-calendar"
                prev2Label={null}
                next2Label={null}
              />

              <div className="flex items-center justify-between pt-2 px-1 border-t border-gray-100 mt-1">
                <button
                  type="button"
                  onClick={handleClearAll}
                  className="text-[11px] font-bold text-rose-500 hover:text-rose-700 transition-colors py-1 px-2.5 rounded-lg hover:bg-rose-50"
                >
                  Clear
                </button>
                <div className="flex gap-1.5">
                  <button
                    type="button"
                    onClick={() => setIsOpen(false)}
                    className="text-[11px] font-bold text-gray-500 hover:text-gray-700 transition-colors py-1 px-2.5 rounded-lg hover:bg-gray-100"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleApply}
                    disabled={!tempRange[0]}
                    className="text-[11px] font-bold bg-[#0d9488] hover:bg-[#0f766e] text-white py-1 px-3 rounded-lg shadow-sm disabled:opacity-50 transition-colors"
                  >
                    Apply
                  </button>
                </div>
              </div>
            </div>
          </div>,
          document.body
        )}
    </div>
  );
};

export default CustomDateRangePicker;
