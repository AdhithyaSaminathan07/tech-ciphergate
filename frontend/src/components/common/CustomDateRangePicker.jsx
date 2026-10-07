import React, { useState, useRef, useEffect } from 'react';
import Calendar from 'react-calendar';
import './CustomDatePicker.css';
import { formatDateToYMD, formatDateToDisplay } from './CustomDatePicker';

const CustomDateRangePicker = ({
  startDate,
  endDate,
  onApply,
  onClear,
  className = ''
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [tempRange, setTempRange] = useState([
    startDate ? new Date(startDate) : null,
    endDate ? new Date(endDate) : null
  ]);

  const containerRef = useRef(null);

  useEffect(() => {
    setTempRange([
      startDate ? new Date(startDate) : null,
      endDate ? new Date(endDate) : null
    ]);
  }, [startDate, endDate]);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (containerRef.current && !containerRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
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

  return (
    <div ref={containerRef} className={`relative inline-block ${className}`}>
      {/* Trigger Button / Input Display */}
      <div
        onClick={() => setIsOpen(!isOpen)}
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

      {/* Popover Calendar */}
      {isOpen && (
        <div className="absolute top-full right-0 mt-1.5 z-50 animate-in fade-in zoom-in-95 duration-150">
          <div className="bg-white rounded-xl shadow-xl border border-gray-200 p-1.5 min-w-[265px] overflow-hidden">
            <div className="flex items-center justify-between pb-1.5 px-1 mb-1 border-b border-gray-100">
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

            <div className="flex items-center justify-between pt-1.5 px-1 border-t border-gray-100 mt-1">
              <button
                type="button"
                onClick={handleClearAll}
                className="text-[11px] font-semibold text-red-500 hover:text-red-700 transition-colors py-0.5 px-2 rounded hover:bg-red-50"
              >
                Clear
              </button>
              <div className="flex gap-1.5">
                <button
                  type="button"
                  onClick={() => setIsOpen(false)}
                  className="text-[11px] font-semibold text-gray-500 hover:text-gray-700 transition-colors py-0.5 px-2 rounded hover:bg-gray-100"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleApply}
                  disabled={!tempRange[0]}
                  className="text-[11px] font-bold bg-[#0d9488] hover:bg-[#0f766e] text-white py-0.5 px-2.5 rounded shadow-sm disabled:opacity-50 transition-colors"
                >
                  Apply
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default CustomDateRangePicker;
