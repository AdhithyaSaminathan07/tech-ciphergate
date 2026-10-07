import React, { useState, useRef, useEffect } from 'react';
import Calendar from 'react-calendar';
import './CustomDatePicker.css';

// Helper to format Date object to YYYY-MM-DD
export const formatDateToYMD = (date) => {
  if (!date || isNaN(new Date(date).getTime())) return '';
  const d = new Date(date);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

// Helper to format Date or string to DD/MM/YYYY for friendly display
export const formatDateToDisplay = (dateStr) => {
  if (!dateStr) return '';
  const parts = String(dateStr).split(/[-/]/);
  if (parts.length === 3) {
    if (parts[0].length === 4) {
      // YYYY-MM-DD
      return `${parts[2]}/${parts[1]}/${parts[0]}`;
    }
    // DD-MM-YYYY or DD/MM/YYYY
    return `${parts[0]}/${parts[1]}/${parts[2]}`;
  }
  const d = new Date(dateStr);
  if (!isNaN(d.getTime())) {
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const year = d.getFullYear();
    return `${day}/${month}/${year}`;
  }
  return dateStr;
};

// Helper to parse any date string to Date object
const parseToDate = (dateVal) => {
  if (!dateVal) return new Date();
  if (dateVal instanceof Date) return dateVal;
  const str = String(dateVal).trim();
  const parts = str.split(/[-/]/);
  if (parts.length === 3) {
    if (parts[0].length === 4) {
      // YYYY-MM-DD
      return new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
    } else {
      // DD-MM-YYYY
      return new Date(parseInt(parts[2]), parseInt(parts[1]) - 1, parseInt(parts[0]));
    }
  }
  const parsed = new Date(str);
  return isNaN(parsed.getTime()) ? new Date() : parsed;
};

const CustomDatePicker = ({
  value,
  onChange,
  name,
  id,
  placeholder = 'Select date',
  className = '',
  inputClassName = '',
  disabled = false,
  required = false,
  minDate,
  maxDate,
  format = 'YMD', // 'YMD' returns YYYY-MM-DD, 'DMY' returns DD/MM/YYYY
  showIcon = true
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef(null);

  const selectedDate = value ? parseToDate(value) : null;

  // Close when clicking outside
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

  const notifyChange = (val) => {
    if (!onChange) return;
    const syntheticEvent = {
      target: {
        name: name || '',
        value: val
      }
    };
    // Call with val, but also pass syntheticEvent
    onChange(val, syntheticEvent);
  };

  const handleDateChange = (date) => {
    let result = '';
    if (format === 'DMY') {
      const day = String(date.getDate()).padStart(2, '0');
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const year = date.getFullYear();
      result = `${day}/${month}/${year}`;
    } else {
      result = formatDateToYMD(date);
    }
    notifyChange(result);
    setIsOpen(false);
  };

  const handleClear = (e) => {
    e.stopPropagation();
    notifyChange('');
  };

  const handleToday = () => {
    handleDateChange(new Date());
  };

  return (
    <div ref={containerRef} className={`relative inline-block ${className}`}>
      {/* Date Trigger Field */}
      <div
        onClick={() => !disabled && setIsOpen(!isOpen)}
        className={`flex items-center justify-between gap-2 px-3 py-1.5 bg-white border border-gray-200 rounded-lg text-sm transition-all cursor-pointer select-none hover:border-teal-400 focus-within:ring-2 focus-within:ring-teal-500/20 ${
          disabled ? 'opacity-50 cursor-not-allowed bg-gray-50' : ''
        } ${isOpen ? 'border-teal-500 ring-2 ring-teal-500/20' : ''} ${inputClassName}`}
      >
        <div className="flex items-center gap-2 overflow-hidden">
          {showIcon && (
            <svg className="w-4 h-4 text-teal-600 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
          )}
          <span className={`text-sm truncate ${value ? 'text-gray-800 font-medium' : 'text-gray-400'}`}>
            {value ? formatDateToDisplay(value) : placeholder}
          </span>
        </div>

        {value && !disabled && (
          <button
            type="button"
            onClick={handleClear}
            className="text-gray-400 hover:text-gray-600 p-0.5 rounded-full hover:bg-gray-100 transition-colors"
            title="Clear date"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        )}
      </div>

      {/* Calendar Popover */}
      {isOpen && (
        <div className="absolute top-full left-0 mt-1.5 z-50 animate-in fade-in zoom-in-95 duration-150">
          <div className="bg-white rounded-xl shadow-xl border border-gray-200 p-1.5 overflow-hidden">
            <Calendar
              onChange={handleDateChange}
              value={selectedDate || new Date()}
              minDate={minDate}
              maxDate={maxDate}
              className="custom-react-calendar"
              prev2Label={null}
              next2Label={null}
            />
            <div className="flex items-center justify-between pt-1.5 px-1 border-t border-gray-100 mt-1">
              <button
                type="button"
                onClick={handleToday}
                className="text-[11px] font-bold text-teal-600 hover:text-teal-800 transition-colors py-0.5 px-2 rounded hover:bg-teal-50"
              >
                Today
              </button>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="text-[11px] font-bold text-gray-500 hover:text-gray-700 transition-colors py-0.5 px-2 rounded hover:bg-gray-100"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default CustomDatePicker;
