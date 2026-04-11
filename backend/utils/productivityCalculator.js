
// backend/utils/productivityCalculator.js

const calculateWorkerProductivity = (productivityParameters) => {
  const {
    attendanceData,
    fromDate,
    toDate,
    options = {},
    worker,
    leaveData = []
  } = productivityParameters;

  const {
    considerOvertime = false,
    deductSalary = true,
    permissionTimeMinutes = 15,
    salaryDeductionPerBreak = 10,
    batches = [],
    intervals = [],
    fiteredBatch = 'Full Time',
    isLunchConsider = false,
    holidays = [],
    advancedLeaveDeduction = null
  } = options;

  let currentMonthMissedCount = 0;
  let lastMonthIdx = -1;

  const timeToMinutes = (timeStr) => {
    if (!timeStr) return 0;
    const parts = timeStr.split(':').map(Number);
    const hours = parts[0] || 0;
    const minutes = parts[1] || 0;
    const seconds = parts[2] || 0;
    return hours * 60 + minutes + seconds / 60;
  };

  const minutesToTime = (totalMinutes) => {
    const totalSeconds = Math.round(totalMinutes * 60);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  };

  const parseAttendanceTime = (timeStr) => {
    if (!timeStr) return 0;
    const [time, period] = timeStr.split(' ');
    const [hours, minutes, seconds = 0] = time.split(':').map(Number);

    let totalSeconds = seconds + (minutes * 60) + (hours * 3600);

    if (period === 'AM') {
      if (hours === 12) totalSeconds -= 12 * 3600;
    } else if (period === 'PM') {
      if (hours !== 12) totalSeconds += 12 * 3600;
    }

    return totalSeconds / 60;
  };

  const formatTime = (minutes) => {
    const hours = Math.floor(minutes / 60);
    const mins = Math.floor(minutes % 60);
    const period = hours >= 12 ? 'PM' : 'AM';
    const displayHours = hours > 12 ? hours - 12 : hours === 0 ? 12 : hours;
    return `${displayHours.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')} ${period}`;
  };

  const formatCurrency = (amount) => {
    return `₹${amount.toFixed(2)}`;
  };

  const formatDate = (dateStr) => {
    const date = new Date(dateStr);
    const day = date.getDate();
    const month = date.toLocaleString('default', { month: 'long' });
    return `${day.toString().padStart(2, '0')} ${month}`;
  };

  const isSunday = (date) => {
    const day = new Date(date);
    return day.getDay() === 0;
  };

  const isHoliday = (date) => {
    if (!holidays || holidays.length === 0) return null;
    const dateStr = new Date(date).toISOString().split('T')[0];
    const holiday = holidays.find(h => {
      const holidayDate = new Date(h.date).toISOString().split('T')[0];
      return holidayDate === dateStr;
    });
    return holiday || null;
  };

  // NEW FUNCTION: Check if a holiday applies to a specific worker
  const isHolidayForWorker = (date, workerId) => {
    if (!holidays || holidays.length === 0) return null;
    const dateStr = new Date(date).toISOString().split('T')[0];
    const holiday = holidays.find(h => {
      const holidayDate = new Date(h.date).toISOString().split('T')[0];
      // Check if dates match
      if (holidayDate !== dateStr) return false;

      // If it's a company-wide holiday (appliesTo: 'all'), it applies to all workers
      if (h.appliesTo === 'all') return true;

      // If it's a specific holiday, check if the worker is in the workers array
      if (h.appliesTo === 'specific' && h.workers) {
        // Handle both string IDs and object IDs
        return h.workers.some(w => {
          // Convert both values to strings for comparison
          const workerIdStr = workerId.toString ? workerId.toString() : String(workerId);
          if (typeof w === 'string') {
            return w === workerIdStr;
          } else if (w && typeof w === 'object') {
            const wIdStr = (w._id || w).toString ? (w._id || w).toString() : String(w._id || w);
            return wIdStr === workerIdStr;
          }
          return false;
        });
      }

      return false;
    });
    return holiday || null;
  };

  const getLeaveForDay = (date) => {
    if (!leaveData || leaveData.length === 0) return null;
    const dateStr = new Date(date).toISOString().split('T')[0];

    return leaveData.find(l => {
      // Must be approved or pending
      if (l.status !== 'Approved' && l.status !== 'Pending') return false;

      const start = new Date(l.startDate).toISOString().split('T')[0];
      const end = new Date(l.endDate).toISOString().split('T')[0];

      return (dateStr >= start && dateStr <= end);
    });
  };

  const generateDateRange = (fromDate, toDate) => {
    const dates = [];
    const currentDate = new Date(fromDate);
    const endDate = new Date(toDate);
    while (currentDate <= endDate) {
      dates.push(new Date(currentDate));
      currentDate.setDate(currentDate.getDate() + 1);
    }
    return dates;
  };

  const countSundaysInRange = (fromDate, toDate) => {
    const dates = generateDateRange(fromDate, toDate);
    return dates.filter(date => isSunday(date)).length;
  };

  // Function to pair IN and OUT punches correctly
  const pairPunches = (punches, workEnd, workEndTime, workStart) => {
    const pairs = [];
    let i = 0;

    while (i < punches.length) {
      // If current punch is OUT, it's an orphaned OUT punch
      if (!punches[i].record.presence) {
        // For an orphaned OUT punch, create a pair representing a full day absent
        // We'll treat this as if they should have worked the full day but didn't punch IN
        const pseudoInPunch = {
          time: workStart,
          originalTime: `MISSING PUNCH`,
          record: {
            ...punches[i].record,
            presence: true,
            isAutoGenerated: true,
            isOrphanedOut: true
          }
        };

        // Pair the pseudo IN with the actual OUT punch
        pairs.push({
          in: pseudoInPunch,
          out: punches[i],
          isAutoOut: false,
          isOrphanedOut: true
        });

        i++; // Move to next punch
        continue;
      }

      // Current punch is IN
      const inPunch = punches[i];
      let outPunch = null;
      let isAutoOut = false;

      // Look for the next immediate OUT punch (should be the very next punch)
      if (i + 1 < punches.length && !punches[i + 1].record.presence) {
        // The very next punch is an OUT punch, pair them
        outPunch = punches[i + 1];
        i += 2; // Move past both IN and OUT punches
      } else {
        // No immediate OUT punch found
        // For factory workers: don't auto-out at workEnd; skip this unmatched IN
        // For standard workers: create auto-out at workEnd if IN was before workEnd
        if (isFactoryWorkerToggle) {
          // Factory workers: skip unmatched IN punch, no auto-out generated
          i++;
          continue;
        } else if (inPunch.time <= workEnd) {
          const autoOutTime = workEnd;
          outPunch = {
            time: autoOutTime,
            originalTime: `AUTO-OUT (${workEndTime})`,
            record: {
              ...inPunch.record,
              presence: false,
              isAutoGenerated: true
            }
          };
          isAutoOut = true;
        } else {
          // IN punch was after work end time, skip it to avoid incorrect pairing
          i++; // Move to next punch without creating a pair
          continue;
        }
        i++; // Move to next punch
      }

      pairs.push({
        in: inPunch,
        out: outPunch,
        isAutoOut,
        isOrphanedOut: false
      });
    }

    return pairs;
  };

  // Calculate working time for a single IN-OUT pair
  const calculatePairWorkingTime = (inPunch, outPunch, workStart, workEnd, isOrphanedOut = false) => {
    // For orphaned OUT punches, we don't calculate working time as they represent
    // a day where the employee forgot to punch IN
    if (isOrphanedOut) {
      return { rawMinutes: 0, finalMinutes: 0, deductions: [] };
    }

    let intervalStart, intervalEnd, rawWorkingInterval, finalWorkingInterval;

    if (isFactoryWorkerToggle) {
      // Factory workers: use raw punch times directly without capping to shift boundaries
      intervalStart = inPunch.time;
      intervalEnd = outPunch.time;
      if (intervalEnd <= intervalStart) return { rawMinutes: 0, finalMinutes: 0, deductions: [] };
      rawWorkingInterval = intervalEnd - intervalStart;
      finalWorkingInterval = rawWorkingInterval;
      return {
        rawMinutes: rawWorkingInterval,
        finalMinutes: finalWorkingInterval,
        deductions: [],
        totalDeducted: 0
      };
    }

    // Standard worker: cap times to the shift window
    // Check if this pair is for punches that occurred after work end time
    // If both punches are after work end time, don't calculate working time
    if (inPunch.time > workEnd && outPunch.time > workEnd) {
      return { rawMinutes: 0, finalMinutes: 0, deductions: [] };
    }

    intervalStart = Math.max(inPunch.time, workStart);
    intervalEnd = Math.min(outPunch.time, workEnd);

    if (intervalEnd <= intervalStart) return { rawMinutes: 0, finalMinutes: 0, deductions: [] };

    rawWorkingInterval = intervalEnd - intervalStart;
    finalWorkingInterval = rawWorkingInterval;
    let intervalDeductions = [];

    if (!options.isLunchConsider && !selectedBatch?.isFactoryWorkerToggle) {
      const lunchStart = timeToMinutes(lunchFrom);
      const lunchEnd = timeToMinutes(lunchTo);
      if (intervalStart < lunchEnd && intervalEnd > lunchStart) {
        const lunchOverlap = Math.min(intervalEnd, lunchEnd) - Math.max(intervalStart, lunchStart);
        finalWorkingInterval -= Math.max(0, lunchOverlap);
        intervalDeductions.push({
          type: 'Lunch',
          deductedMinutes: lunchOverlap,
          reason: 'Lunch break deduction'
        });
      }
    }

    intervals.forEach(interval => {
      if (!interval.isBreakConsider) {
        const breakStart = timeToMinutes(interval.from);
        const breakEnd = timeToMinutes(interval.to);
        if (intervalStart < breakEnd && intervalEnd > breakStart) {
          const breakOverlap = Math.min(intervalEnd, breakEnd) - Math.max(intervalStart, breakStart);
          finalWorkingInterval -= Math.max(0, breakOverlap);
          intervalDeductions.push({
            type: `Break`,
            deductedMinutes: breakOverlap,
            reason: `Break interval ${interval.from} - ${interval.to}`
          });
        }
      }
    });

    return {
      rawMinutes: rawWorkingInterval,
      finalMinutes: Math.max(0, finalWorkingInterval),
      deductions: intervalDeductions,
      totalDeducted: rawWorkingInterval - Math.max(0, finalWorkingInterval)
    };
  };

  // Calculate delay time for a single IN-OUT pair
  const calculatePairDelayTime = (inPunch, outPunch, workStart, workEnd, allPairs, pairIndex, isOrphanedOut = false, isCrossDaySession = false) => {
    let delayDetails = [];
    let totalDelayMinutes = 0;
    let lateMinutes = 0; // Initialize here so it's available throughout the function

    // Check if this is the first session of the day
    const isFirstSession = pairIndex === 0;

    // For orphaned OUT punches, treat more conservatively
    if (isOrphanedOut) {
      // NEW LOGIC: Check if there are other actual working punches in the same day
      // If so, don't apply a full day deduction for the orphaned OUT punch
      const hasActualWorkingPunches = allPairs.some(pair => !pair.isOrphanedOut);

      if (hasActualWorkingPunches) {
        // If there are actual working punches, don't apply any deduction for the orphaned OUT
        // This is likely a cross-day session where the OUT punch belongs to the previous day
        // and should not be penalized on this day
        delayDetails.push({
          type: 'Orphaned OUT',
          minutes: 0,
          description: `0 mins (cross-day session OUT punch)`
        });
      } else {
        // For early day OUT punches with no actual working punches, treat as full day absent
        // Calculate unworked time for the full work day
        let unworkedMinutes = workEnd - workStart;

        // Exclude lunch time if applicable
        if (!isLunchConsider) {
          const lunchStart = timeToMinutes(lunchFrom);
          const lunchEnd = timeToMinutes(lunchTo);
          const lunchOverlapStart = Math.max(workStart, lunchStart);
          const lunchOverlapEnd = Math.min(workEnd, lunchEnd);
          if (lunchOverlapEnd > lunchOverlapStart) {
            unworkedMinutes -= (lunchOverlapEnd - lunchOverlapStart);
          }
        }

        if (unworkedMinutes > 0) {
          totalDelayMinutes += unworkedMinutes;
          delayDetails.push({
            type: 'Unworked Time',
            minutes: unworkedMinutes,
            description: `${Math.round(unworkedMinutes)} mins unworked time (orphaned OUT punch)`
          });
        }
      }

      return {
        totalDelayMinutes,
        delayDetails
      };
    }

    // Get lunch period
    const lunchStart = timeToMinutes(lunchFrom);
    const lunchEnd = timeToMinutes(lunchTo);

    // Calculate late arrival and other delays
    // Late arrival should happen regardless of auto-generated out status
    // Other delays (early departure, etc.) should only happen if OUT is not auto-generated
    if (inPunch.time > workStart && inPunch.time !== outPunch.time) {
      lateMinutes = 0; // Reset for this pair

      if (isFirstSession) {
        // Special handling for first session
        // If employee punches in during lunch time, don't calculate late arrival
        // Instead, treat it as missing the entire morning work period
        if (inPunch.time > lunchStart && inPunch.time < lunchEnd) {
          // Punched in during lunch time
          // Don't calculate late arrival penalty
          // Instead, calculate missed morning work period (from work start to lunch start)
          const missedMorningMinutes = lunchStart - workStart;
          if (missedMorningMinutes > 0) {
            totalDelayMinutes += missedMorningMinutes;
            delayDetails.push({
              type: 'Missed Morning Work',
              minutes: missedMorningMinutes,
              description: `${Math.round(missedMorningMinutes)} mins missed morning work`
            });
          }
        }
        // NEW: Special handling for first session after lunch
        else if (inPunch.time >= lunchEnd) {
          // For employees whose shift starts after lunch, compare to their actual shift start time
          // For employees whose shift starts before lunch, they should have returned to work at lunch end
          if (workStart >= lunchEnd) {
            // Employee's shift starts after lunch, so compare to their actual start time
            lateMinutes = inPunch.time - workStart;
          } else {
            // Employee's shift starts before lunch, so they should have returned at lunch end
            // Calculate missed morning work period (from work start to lunch start)
            const missedMorningMinutes = lunchStart - workStart;
            if (missedMorningMinutes > 0) {
              totalDelayMinutes += missedMorningMinutes;
              delayDetails.push({
                type: 'Missed Morning Work',
                minutes: missedMorningMinutes,
                description: `${Math.round(missedMorningMinutes)} mins missed morning work`
              });
            }

            // Also calculate late arrival after lunch (from lunch end to actual punch time)
            const lateAfterLunchMinutes = inPunch.time - lunchEnd;
            if (lateAfterLunchMinutes > 0) {
              lateMinutes = lateAfterLunchMinutes;
            }
          }
        } else {
          // Normal late arrival calculation (before lunch and not during lunch)
          lateMinutes = inPunch.time - workStart;
        }
      } else {
        // For subsequent sessions, we need to check if the first actual working session was during lunch
        // If so, we should not penalize for late arrival after lunch
        let isFirstSessionDuringLunch = false;

        // Check if the first actual working session of the day
        // (i.e., the first session that is not an orphaned OUT)
        for (let i = 0; i < allPairs.length; i++) {
          if (!allPairs[i].isOrphanedOut) {
            // This is the first actual working session
            const firstWorkingSessionInTime = allPairs[i].in.time;
            if (firstWorkingSessionInTime > lunchStart && firstWorkingSessionInTime < lunchEnd) {
              isFirstSessionDuringLunch = true;
            }
            break;
          }
        }

        // If first session was during lunch, don't penalize subsequent sessions for being late
        if (!isFirstSessionDuringLunch) {
          // Normal handling for subsequent sessions
          // Check if this is actually a continuation of work
          // after a previous session, not a late arrival for the afternoon shift

          // If there was a previous session that ended before lunch or during the work day,
          // then this session is a continuation, not a late arrival for the afternoon shift
          let isContinuation = false;
          if (pairIndex > 0) {
            const previousSession = allPairs[pairIndex - 1];
            // If the previous session was an orphaned OUT, it's not a continuation
            if (!previousSession.isOrphanedOut) {
              // If the previous session ended during work hours (not during lunch)
              if (previousSession.out.time < lunchStart || previousSession.out.time > lunchEnd) {
                isContinuation = true;
              }
            }
          }

          // Only apply late arrival penalty if this is not a continuation of work
          if (!isContinuation && inPunch.time > lunchEnd) {
            // For employees whose shift starts after lunch, this shouldn't apply
            // Only for employees whose shift starts before lunch
            if (workStart < lunchStart) {
              // Late for afternoon shift
              lateMinutes = inPunch.time - lunchEnd;
            }
          }
          // NEW: Also check for late arrival for morning shift in subsequent sessions
          // This handles cases where the first punch is an orphaned OUT and the actual first working session is late
          else if (!isContinuation && inPunch.time > workStart && inPunch.time <= lunchStart) {
            // Late for morning shift
            lateMinutes = inPunch.time - workStart;
          }
          // If they punched in at or before lunch end, or if this is a continuation, 
          // no late penalty (they're early, on time, or continuing work)

          // Only add positive late minutes
          if (lateMinutes > 0) {
            totalDelayMinutes += lateMinutes;
            delayDetails.push({
              type: 'Late Arrival',
              minutes: lateMinutes,
              description: `${Math.round(lateMinutes)} mins late arrival`
            });
          }
        }
      }
    }

    // Add late minutes for first session if it's a normal late arrival (not special case)
    // For special cases like during lunch or after lunch, delays were already added separately
    if (isFirstSession && lateMinutes > 0) {
      // Only add if not a special case where delay was already added to totalDelayMinutes
      const isSpecialCase = (inPunch.time > lunchStart && inPunch.time < lunchEnd) ||
        (inPunch.time >= lunchEnd && workStart < lunchEnd); // punching after lunch end

      if (!isSpecialCase) {
        totalDelayMinutes += lateMinutes;
        delayDetails.push({
          type: 'Late Arrival',
          minutes: lateMinutes,
          description: `${Math.round(lateMinutes)} mins late arrival`
        });
      }
    }

    // Early departure and other delays (only if OUT punch is not auto-generated)
    // Note: We don't deduct for leaving after work hours (overtime)
    // Also don't calculate if IN and OUT times are the same
    if (!outPunch.record.isAutoGenerated && outPunch.time < workEnd && inPunch.time !== outPunch.time) {
      // Check if there's a next session
      const hasNextSession = pairIndex < allPairs.length - 1;

      // FIRST: Calculate early departure penalty only for the LAST session of the day
      // If there's a next session, we don't calculate early departure for intermediate sessions
      let earlyMinutes = 0;

      // Only calculate early departure for the last session
      if (!hasNextSession) {
        // Check if this is the first actual working session of the day
        // (i.e., the first session that is not an orphaned OUT)
        let isFirstWorkingSessionDuringLunch = false;
        for (let i = 0; i < allPairs.length; i++) {
          if (!allPairs[i].isOrphanedOut) {
            // This is the first actual working session
            if (allPairs[i].in.time > lunchStart && allPairs[i].in.time < lunchEnd) {
              isFirstWorkingSessionDuringLunch = true;
            }
            break;
          }
        }

        // If the first actual working session was during lunch, don't calculate early departure
        // because they didn't work the full afternoon shift
        if (!isFirstWorkingSessionDuringLunch) {
          // Normal early departure calculation

          // If employee punched out before lunch start
          if (outPunch.time < lunchStart) {
            // Early departure from morning shift
            earlyMinutes = lunchStart - outPunch.time;
          }
          // If employee punched out during lunch period
          else if (outPunch.time >= lunchStart && outPunch.time <= lunchEnd) {
            // They punched out during lunch period
            // No early departure penalty since they're still within the work day
            // BUT if this is the last session of the day, we should treat it as unworked afternoon time
            const isLastSession = pairIndex === allPairs.length - 1;
            if (isLastSession) {
              // Employee left during lunch and didn't return
              // Deduct unworked time from lunch end to work end
              const unworkedAfternoonMinutes = workEnd - lunchEnd;
              if (unworkedAfternoonMinutes > 0) {
                totalDelayMinutes += unworkedAfternoonMinutes;
                delayDetails.push({
                  type: 'Unworked Afternoon',
                  minutes: unworkedAfternoonMinutes,
                  description: `${Math.round(unworkedAfternoonMinutes)} mins unworked afternoon`
                });
              }
            }
          }
          // If employee punched out after lunch end but before work end
          else if (outPunch.time > lunchEnd && outPunch.time < workEnd) {
            // Early departure from afternoon shift/full day
            earlyMinutes = workEnd - outPunch.time;
          }
          // If employee punched out after work end, no early departure penalty (overtime)

          // Only add positive early minutes
          if (earlyMinutes > 0) {
            totalDelayMinutes += earlyMinutes;
            delayDetails.push({
              type: 'Early Departure',
              minutes: earlyMinutes,
              description: `${Math.round(earlyMinutes)} mins early departure`
            });
          }
        }
      }
      // For intermediate sessions, we still need to check if they punched out during lunch
      // and if so, treat it as unworked afternoon time if it's the last actual working session
      else {
        // This is an intermediate session, check if they punched out during lunch
        if (outPunch.time >= lunchStart && outPunch.time <= lunchEnd) {
          // They punched out during lunch period
          // Check if this is actually the last actual working session of the day
          let isLastActualWorkingSession = true;
          for (let i = pairIndex + 1; i < allPairs.length; i++) {
            if (!allPairs[i].isOrphanedOut) {
              isLastActualWorkingSession = false;
              break;
            }
          }

          if (isLastActualWorkingSession) {
            // Employee left during lunch and didn't return for subsequent sessions
            // Deduct unworked time from lunch end to work end
            const unworkedAfternoonMinutes = workEnd - lunchEnd;
            if (unworkedAfternoonMinutes > 0) {
              totalDelayMinutes += unworkedAfternoonMinutes;
              delayDetails.push({
                type: 'Unworked Afternoon',
                minutes: unworkedAfternoonMinutes,
                description: `${Math.round(unworkedAfternoonMinutes)} mins unworked afternoon`
              });
            }
          }
        }
      }

      // SECOND: If there's a next session, calculate inter-work permission time
      if (hasNextSession) {
        // There is a next session, so calculate inter-work permission time
        const nextSession = allPairs[pairIndex + 1];

        // NEW LOGIC: If the next session has an auto-generated OUT and this session ends after lunch,
        // we should not calculate inter-work permission as it will be covered by the unworked time deduction
        const isNextSessionAutoGenerated = nextSession.out.record.isAutoGenerated;
        const doesCurrentSessionEndAfterLunch = outPunch.time > lunchEnd;

        // ALSO: If the first session was after lunch, don't calculate inter-work permission
        let isFirstSessionAfterLunch = false;
        let isFirstSessionDuringLunch = false;

        // Check if the first actual working session of the day
        // (i.e., the first session that is not an orphaned OUT)
        for (let i = 0; i < allPairs.length; i++) {
          if (!allPairs[i].isOrphanedOut) {
            // This is the first actual working session
            const firstWorkingSessionInTime = allPairs[i].in.time;
            if (firstWorkingSessionInTime >= lunchEnd) {
              isFirstSessionAfterLunch = true;
            }
            if (firstWorkingSessionInTime > lunchStart && firstWorkingSessionInTime < lunchEnd) {
              isFirstSessionDuringLunch = true;
            }
            break;
          }
        }

        if (isNextSessionAutoGenerated && doesCurrentSessionEndAfterLunch) {
          // Skip inter-work permission calculation as the unworked time will cover this
        } else if (isFirstSessionAfterLunch) {
          // Skip inter-work permission calculation when first session was after lunch
        } else if (isFirstSessionDuringLunch) {
          // Skip inter-work permission calculation when first session was during lunch
        }
        // If current session ends during lunch period, no inter-work permission is calculated
        // as lunch time is not considered working time
        else if (outPunch.time >= lunchStart && outPunch.time <= lunchEnd) {
          // No inter-work permission penalty since they punched out during lunch
        } else {
          // Calculate inter-work permission time only if not during lunch
          // FIXED: Properly account for lunch period when calculating inter-work permission time
          let interPermissionMinutes = 0;

          // The correct approach is to calculate permission time as the actual non-working time
          // between the end of this session and the start of the next session
          // But we should not count the lunch period as permission time

          // If the current session ends before lunch and the next session starts after lunch
          // then the permission time is from the end of current session to lunch start
          // because the lunch period itself is not permission time
          if (outPunch.time <= lunchStart && nextSession.in.time >= lunchEnd) {
            // Current session ends before or at lunch start, next session starts at or after lunch end
            // Permission time is from end of current session to lunch start
            interPermissionMinutes = lunchStart - outPunch.time;
          } else {
            // Either both times are before lunch, or both are after lunch, or there's some other overlap
            // Calculate normally but exclude lunch time if there's overlap
            const rawPermissionTime = nextSession.in.time - outPunch.time;

            // Check if the permission period overlaps with lunch
            if (outPunch.time < lunchEnd && nextSession.in.time > lunchStart) {
              // The permission period overlaps with lunch
              // Calculate the actual work time that should be penalized
              // This is the time before lunch plus the time after lunch
              // But not the lunch time itself

              // Time before lunch (if any)
              let timeBeforeLunch = 0;
              if (outPunch.time < lunchStart) {
                timeBeforeLunch = Math.min(lunchStart, nextSession.in.time) - outPunch.time;
              }

              // Time after lunch (if any)
              let timeAfterLunch = 0;
              if (nextSession.in.time > lunchEnd) {
                timeAfterLunch = nextSession.in.time - Math.max(lunchEnd, outPunch.time);
              }

              interPermissionMinutes = timeBeforeLunch + timeAfterLunch;
            } else {
              // No overlap with lunch, calculate normally
              interPermissionMinutes = rawPermissionTime;
            }
          }

          if (interPermissionMinutes > 0) {
            totalDelayMinutes += interPermissionMinutes;
            delayDetails.push({
              type: 'Inter-work Permission',
              minutes: interPermissionMinutes,
              description: `${Math.round(interPermissionMinutes)} mins inter-work permission`
            });
          }
        }
      }
    }

    // If it's an auto-generated OUT (missed punch), deduct for unworked time
    if (outPunch.record.isAutoGenerated) {
      // When an employee forgets to punch out, we need to calculate unworked time based on context:
      // 1. If there are no other punch pairs in the day, deduct full working day (540 min)
      // 2. If there are other punch pairs, it means this is part of a split session
      let unworkedMinutes = 0;

      // Check if this is the only actual working pair in the day
      // If the employee only had one IN punch and no other punches, deduct full day
      const actualWorkingPairs = allPairs.filter(pair => !pair.isOrphanedOut);

      // If there's only this one pair (the auto-out one) and no other working pairs, deduct full day
      if (actualWorkingPairs.length === 1) {
        // Calculate total work time excluding lunch
        let totalWorkTime = workEnd - workStart;

        // Exclude lunch time if applicable
        if (!isLunchConsider) {
          const lunchOverlapStart = Math.max(workStart, lunchStart);
          const lunchOverlapEnd = Math.min(workEnd, lunchEnd);
          if (lunchOverlapEnd > lunchOverlapStart) {
            totalWorkTime -= (lunchOverlapEnd - lunchOverlapStart);
          }
        }

        unworkedMinutes = totalWorkTime;
      } else {
        // This is part of a split session, calculate time from IN to end of shift
        // Only calculate the remaining time from the IN time to the end of shift
        let remainingShiftTime = workEnd - inPunch.time;

        // Adjust for lunch if the remaining time overlaps with lunch
        if (!isLunchConsider && inPunch.time < lunchEnd && workEnd > lunchStart) {
          // Calculate lunch overlap with the remaining shift time
          const lunchOverlapStart = Math.max(inPunch.time, lunchStart);
          const lunchOverlapEnd = Math.min(workEnd, lunchEnd);

          if (lunchOverlapEnd > lunchOverlapStart) {
            remainingShiftTime -= (lunchOverlapEnd - lunchOverlapStart);
          }
        }

        // Ensure we don't have negative time
        unworkedMinutes = Math.max(0, remainingShiftTime);
      }

      if (unworkedMinutes > 0) {
        totalDelayMinutes = unworkedMinutes; // Overwrite totalDelayMinutes instead of adding to avoid stacking
        delayDetails = [{
          type: 'Unworked Time',
          minutes: unworkedMinutes,
          description: `${Math.round(unworkedMinutes)} mins unworked time (forgot to punch out)`
        }];
      }
    }

    return {
      totalDelayMinutes,
      delayDetails
    };
  };

  const isSingleDay = new Date(fromDate).toDateString() === new Date(toDate).toDateString();
  const selectedBatch = batches.find(batch => batch.batchName === worker.batch);
  const workStartTime = selectedBatch ? selectedBatch.from : '09:00';
  const workEndTime = selectedBatch ? selectedBatch.to : '19:00';
  const workStart = timeToMinutes(workStartTime);
  const workEnd = timeToMinutes(workEndTime);

  // Use batch-specific lunch settings
  const isFactoryWorkerToggle = selectedBatch ? selectedBatch.isFactoryWorkerToggle : false;
  const requiredWorkingHours = selectedBatch ? selectedBatch.requiredWorkingHours || 8 : 8;
  const allowedFreeLunchHours = selectedBatch ? selectedBatch.allowedFreeLunchHours || 1 : 1;

  // Let factory workers skip regular lunch overlap deductions by considering lunch implicitly
  if (isFactoryWorkerToggle) {
    options.isLunchConsider = true;
  }

  const lunchFrom = selectedBatch ? selectedBatch.lunchFrom : '12:00';
  const lunchTo = selectedBatch ? selectedBatch.lunchTo : '13:00';
  const lunchStart = timeToMinutes(lunchFrom);
  const lunchEnd = timeToMinutes(lunchTo);

  let standardWorkingMinutes = workEnd - workStart;

  if (isFactoryWorkerToggle) {
    standardWorkingMinutes = requiredWorkingHours * 60;
  } else {
    if (!options.isLunchConsider) {
      // Only subtract lunch time if it overlaps with the work period
      const lunchOverlapStart = Math.max(workStart, lunchStart);
      const lunchOverlapEnd = Math.min(workEnd, lunchEnd);
      if (lunchOverlapEnd > lunchOverlapStart) {
        standardWorkingMinutes -= (lunchOverlapEnd - lunchOverlapStart);
      }
    }

    intervals.forEach(interval => {
      if (!interval.isBreakConsider) {
        const intervalStart = timeToMinutes(interval.from);
        const intervalEnd = timeToMinutes(interval.to);
        standardWorkingMinutes -= (intervalEnd - intervalStart);
      }
    });
  }

  const filteredData = attendanceData.filter(record => {
    const recordDate = new Date(record.date);
    const from = new Date(fromDate);
    const to = new Date(toDate);
    recordDate.setHours(0, 0, 0, 0);
    from.setHours(0, 0, 0, 0);
    to.setHours(0, 0, 0, 0);
    return recordDate >= from && recordDate <= to;
  });

  if (filteredData.length === 0 && isSingleDay) {
    return { ...emptyResponse() };
  }

  const originalSalary = worker.salary || 0;
  const allDates = generateDateRange(fromDate, toDate);
  const totalDaysInPeriod = allDates.length;
  const totalSundaysInPeriod = countSundaysInRange(fromDate, toDate);

  // Count holidays that apply to this specific worker
  const totalHolidaysInPeriod = allDates.filter(date => isHolidayForWorker(date, worker._id)).length;
  // FIXED: Working days should only exclude Sundays, not holidays
  // Holidays are paid days but still count as working days for per-day salary calculation
  const totalWorkingDaysInPeriod = totalDaysInPeriod - totalSundaysInPeriod;
  const perDaySalary = totalWorkingDaysInPeriod > 0 ? originalSalary / totalWorkingDaysInPeriod : 0;
  const perMinuteSalary = standardWorkingMinutes > 0 ? perDaySalary / standardWorkingMinutes : 0;
  const totalExpectedMinutes = totalWorkingDaysInPeriod * standardWorkingMinutes;
  let totalWorkingMinutes = 0;
  let totalPermissionMinutes = 0;
  let dailyBreakdown = [];
  let punctualityViolations = 0;
  let report = [];
  let totalAbsentDays = 0;
  let totalSundayCount = 0;
  let totalHolidayCount = 0;
  let totalLeaveDays = 0;
  let totalLeaveDeduction = 0;
  let totalAbsentDeduction = 0;
  let penalizedLeaveDays = 0;
  let penalizedLeaveDeduction = 0;
  let penalizedAbsentDays = 0;
  let penalizedAbsentDeduction = 0;

  const groupedByDate = {};
  filteredData.forEach(record => {
    // Parse the string date and convert to consistent YYYY-MM-DD format for grouping
    const recordDate = new Date(record.date);
    const dateKey = recordDate.toISOString().split('T')[0];
    if (!groupedByDate[dateKey]) groupedByDate[dateKey] = [];
    groupedByDate[dateKey].push(record);
  });

  const processDay = (punches, date) => {
    const dayData = {
      date,
      punchTime: punches.length === 1 ? punches[0].originalTime : `${punches[0].originalTime} - ${punches[punches.length - 1].originalTime}`,
      workingMinutes: 0,
      permissionMinutes: 0,
      salaryDeduction: 0,
      issues: [],
      detailedBreakdown: {
        intervals: [],
        deductions: [],
        permissionDetails: []
      }
    };

    // Sort punches by time
    const sortedPunches = punches.map(record => ({
      time: parseAttendanceTime(record.time),
      originalTime: record.time,
      record
    })).sort((a, b) => a.time - b.time);

    // Pair IN and OUT punches
    const pairs = pairPunches(sortedPunches, workEnd, workEndTime, workStart);

    let dayTotalWorkingMinutes = 0;
    let dayTotalPermissionMinutes = 0;
    let dayTotalDeduction = 0;
    let pairReports = [];
    let customTotalBreaks = 0;

    // Process each IN-OUT pair
    pairs.forEach((pair, index) => {
      const workingTimeResult = calculatePairWorkingTime(pair.in, pair.out, workStart, workEnd, pair.isOrphanedOut);
      let delayTimeResult = calculatePairDelayTime(pair.in, pair.out, workStart, workEnd, pairs, index, pair.isOrphanedOut);

      // Factory worker overrides
      if (isFactoryWorkerToggle) {
        // Reset delay calculations for factory per pair, as we aggregate at the day level instead
        delayTimeResult = { totalDelayMinutes: 0, delayDetails: [] };
        if (index < pairs.length - 1) {
          // calculate breaks between this OUT and next IN
          const nextPair = pairs[index + 1];
          if (!pair.isOrphanedOut && !nextPair.isOrphanedOut) {
            let breakTime = nextPair.in.time - pair.out.time;
            if (breakTime > 0) {
              customTotalBreaks += breakTime;
            }
          }
        }
      }

      // SPECIAL CASE: If this is an auto-generated OUT (forgot to punch out) and it's the only pair,
      // we should not add the working time but only the delay/deduction time
      if (pair.out.record.isAutoGenerated && pairs.length === 1 && !isFactoryWorkerToggle) {
        // When worker forgets to punch out, they get 0 working minutes
        dayTotalWorkingMinutes += 0;
        dayTotalPermissionMinutes += delayTimeResult.totalDelayMinutes;
      } else {
        dayTotalWorkingMinutes += workingTimeResult.finalMinutes;
        dayTotalPermissionMinutes += delayTimeResult.totalDelayMinutes;
      }

      const pairDeduction = delayTimeResult.totalDelayMinutes * perMinuteSalary;
      dayTotalDeduction += pairDeduction;

      // SPECIAL CASE: If this is an auto-generated OUT (forgot to punch out) and it's the only pair,
      // adjust the interval details to show 0 working minutes
      let intervalFinalMinutes = workingTimeResult.finalMinutes;
      let intervalRawMinutes = workingTimeResult.rawMinutes;
      let intervalDeductions = [...workingTimeResult.deductions];
      let intervalTotalDeducted = workingTimeResult.totalDeducted;

      if (pair.out.record.isAutoGenerated && pairs.length === 1 && !isFactoryWorkerToggle) {
        intervalFinalMinutes = 0;
        intervalRawMinutes = 0;
        intervalDeductions = [{
          type: 'No Punch Out',
          deductedMinutes: standardWorkingMinutes,
          reason: 'Forgot to punch out - full day deducted'
        }];
        intervalTotalDeducted = standardWorkingMinutes;
      }

      // Add to detailed breakdown
      dayData.detailedBreakdown.intervals.push({
        intervalNumber: index + 1,
        inTime: formatTime(pair.in.time),
        outTime: formatTime(pair.out.time),
        rawMinutes: intervalRawMinutes,
        finalMinutes: intervalFinalMinutes,
        deductions: intervalDeductions,
        totalDeducted: intervalTotalDeducted
      });

      // Add interval-specific deductions for consistency
      dayData.detailedBreakdown.deductions.push(...intervalDeductions);

      delayTimeResult.delayDetails.forEach(detail => {
        dayData.detailedBreakdown.permissionDetails.push({
          type: detail.type,
          totalMinutes: detail.minutes,
          description: detail.description
        });

        dayData.issues.push(`${detail.type}: ${Math.round(detail.minutes)} minutes`);
      });
    });

    // Factory Worker Day Level Calculation
    if (isFactoryWorkerToggle) {
      let unworkedMinutes = 0;
      if (dayTotalWorkingMinutes < standardWorkingMinutes) {
        unworkedMinutes = standardWorkingMinutes - dayTotalWorkingMinutes;
      }

      const allowedFreeLunchMinutes = allowedFreeLunchHours * 60;
      let excessBreakMinutes = 0;

      if (customTotalBreaks > allowedFreeLunchMinutes) {
        excessBreakMinutes = customTotalBreaks - allowedFreeLunchMinutes;
      }

      // The worker is ONLY penalized for missing total working hours.
      // We ensure `dayTotalPermissionMinutes` accurately reflects missing time to trigger deductions.
      dayTotalPermissionMinutes = unworkedMinutes;

      dayTotalDeduction = dayTotalPermissionMinutes * perMinuteSalary;

      if (unworkedMinutes > 0) {
        dayData.issues.push(`Short on Working Hours: ${Math.round(unworkedMinutes)} minutes.`);
      }
      if (excessBreakMinutes > 0) {
        dayData.issues.push(`Excess Break Time: ${Math.round(excessBreakMinutes)} minutes.`);
      }
    }

    // Calculate the day's final salary after all deductions
    const dayFinalSalary = Math.max(0, perDaySalary - dayTotalDeduction);

    // Now create the report entries with the correct total salary
    pairs.forEach((pair, index) => {
      let delayTimeResult = calculatePairDelayTime(pair.in, pair.out, workStart, workEnd, pairs, index, pair.isOrphanedOut);
      let pairDeduction = delayTimeResult.totalDelayMinutes * perMinuteSalary;
      let delayTimeString = `${Math.round(delayTimeResult.totalDelayMinutes)} mins`;
      let delayTypeString = delayTimeResult.delayDetails.map(d => d.description).join(', ');

      // Factory workers use day-level calculations entirely.
      // We attribute the day's deduction completely to the final pair so the totals match the table.
      if (isFactoryWorkerToggle) {
        if (index === pairs.length - 1) {
          pairDeduction = dayTotalDeduction;
          delayTimeString = `${Math.round(dayTotalPermissionMinutes)} mins`;
          const issuesArray = [];
          if (dayTotalPermissionMinutes > 0) issuesArray.push('Short on Working Hours');
          if (pairs.some(p => p.out.record.isAutoGenerated)) issuesArray.push('Auto-Out Used');
          delayTypeString = issuesArray.length > 0 ? issuesArray.join(', ') : 'None';
        } else {
          pairDeduction = 0;
          delayTimeString = `0 mins`;
          delayTypeString = 'N/A';
        }
      }

      // Add to report only if it's not an orphaned OUT punch that should be hidden
      // OR if it's an orphaned OUT punch but there are no other working punches in the day
      const hasActualWorkingPunches = pairs.some(p => !p.isOrphanedOut);
      const shouldShowOrphanedOut = pair.isOrphanedOut && !hasActualWorkingPunches;
      const shouldHideOrphanedOut = pair.isOrphanedOut && hasActualWorkingPunches;

      // Only add to report if it's not a hidden orphaned OUT punch
      if (!shouldHideOrphanedOut) {
        // Add to report
        const dateFormatted = formatDate(date);
        pairReports.push({
          date: dateFormatted,
          inTime: pair.isOrphanedOut ? 'Absent' : (pair.in.record.isAutoGenerated ? 'Absent' : formatTime(pair.in.time)),
          outTime: pair.out.originalTime,
          delayTime: delayTimeString,
          delayType: delayTypeString,
          deductionAmount: formatCurrency(pairDeduction),
          // For the total salary, we show the day's final salary after all deductions
          totalSalary: formatCurrency(dayFinalSalary),
          status: pair.isOrphanedOut ? 'Absent' : (pair.out.record.isAutoGenerated ? 'Auto-Out' : 'Present')
        });
      }
    });

    dayData.workingMinutes = dayTotalWorkingMinutes;
    dayData.permissionMinutes = dayTotalPermissionMinutes;
    dayData.salaryDeduction = dayTotalDeduction;

    // Add all pair reports to main report
    report.push(...pairReports);

    totalWorkingMinutes += dayData.workingMinutes;
    totalPermissionMinutes += dayData.permissionMinutes;
    dailyBreakdown.push(dayData);
  };

  const processMissedDay = (date) => {
    const dateString = date.toISOString().split('T')[0];
    const isSundayDay = isSunday(date);
    // NEW: Check if holiday applies to this specific worker
    const holidayInfo = isHolidayForWorker(date, worker._id);

    if (isSundayDay) {
      totalSundayCount++;
      const dayData = {
        date: dateString,
        punchTime: '-',
        workingMinutes: 0,
        permissionMinutes: 0,
        salaryDeduction: 0,
        issues: ['Sunday - Weekly off'],
        detailedBreakdown: { intervals: [], deductions: [], permissionDetails: [] }
      };
      const reportEntry = {
        date: formatDate(dateString),
        outTime: '-',
        inTime: '-',
        delayTime: '-',
        delayType: 'Sunday - Weekly off',
        deductionAmount: formatCurrency(0),
        totalSalary: formatCurrency(0), // Show 0 for Sundays
        status: 'Sunday'
      };
      report.push(reportEntry);
      dailyBreakdown.push(dayData);
    } else if (holidayInfo) {
      totalHolidayCount++;
      const dayData = {
        date: dateString,
        punchTime: '-',
        workingMinutes: 0,
        permissionMinutes: 0,
        salaryDeduction: 0,
        issues: [`Holiday - ${holidayInfo.holidayDesc || 'Public Holiday'}`],
        detailedBreakdown: { intervals: [], deductions: [], permissionDetails: [] }
      };
      const reportEntry = {
        date: formatDate(dateString),
        outTime: '-',
        inTime: '-',
        delayTime: '-',
        delayType: `Holiday - ${holidayInfo.holidayDesc || 'Public Holiday'}`,
        deductionAmount: formatCurrency(0),
        totalSalary: formatCurrency(perDaySalary),
        status: 'Holiday'
      };
      report.push(reportEntry);
      dailyBreakdown.push(dayData);
    } else {
      const leaveInfo = getLeaveForDay(date);
      if (leaveInfo) {
        totalLeaveDays++;
        currentMonthMissedCount++;

        let dynamicFactor = 1;
        // Apply 2X penalty for leaves if monthly limit exceeded dynamically
        if (advancedLeaveDeduction && advancedLeaveDeduction.monthlyLimitRuleEnabled) {
          const limit = advancedLeaveDeduction.monthlyLimit || 0;
          if (currentMonthMissedCount > limit) {
            dynamicFactor = 2;
          }
        }

        const factor = Math.max(leaveInfo.deductionFactor || 1, dynamicFactor);
        const deductionAmount = perDaySalary * factor;
        totalLeaveDeduction += deductionAmount;

        if (factor > 1) {
          penalizedLeaveDays++;
          penalizedLeaveDeduction += deductionAmount;
        }

        const dayData = {
          date: dateString,
          punchTime: 'Leave',
          workingMinutes: 0,
          permissionMinutes: 0,
          salaryDeduction: deductionAmount,
          issues: [`${leaveInfo.leaveType}${factor > 1 ? ` (${factor}X Penalty)` : ''}`],
          detailedBreakdown: { intervals: [], deductions: [], permissionDetails: [] }
        };
        const reportEntry = {
          date: formatDate(dateString),
          outTime: 'Leave',
          inTime: 'Leave',
          delayTime: factor > 1 ? `${factor} Days` : '1 Day',
          delayType: `${leaveInfo.leaveType}${factor > 1 ? ` (${factor}X)` : ''}`,
          deductionAmount: formatCurrency(deductionAmount),
          totalSalary: formatCurrency(0),
          status: 'Leave'
        };
        report.push(reportEntry);
        dailyBreakdown.push(dayData);
      } else {
        totalAbsentDays++;
        currentMonthMissedCount++;

        let factor = 1;
        // Apply 2X penalty for absences if monthly limit exceeded
        if (advancedLeaveDeduction && advancedLeaveDeduction.monthlyLimitRuleEnabled) {
          const limit = advancedLeaveDeduction.monthlyLimit || 0;
          if (currentMonthMissedCount > limit) {
            factor = 2;
          }
        }

        const deductionAmount = perDaySalary * factor;
        const dayData = {
          date: dateString,
          punchTime: 'Absent',
          workingMinutes: 0,
          permissionMinutes: 0,
          salaryDeduction: deductionAmount,
          issues: [`Absent - ${factor}X salary deducted`],
          detailedBreakdown: { intervals: [], deductions: [], permissionDetails: [] }
        };
        const reportEntry = {
          date: formatDate(dateString),
          outTime: 'Absent',
          inTime: 'Absent',
          delayTime: factor > 1 ? `${factor} Days` : 'Full Day',
          delayType: `Absent - ${factor}X deduction`,
          deductionAmount: formatCurrency(deductionAmount),
          totalSalary: formatCurrency(0),
          status: 'Absent'
        };
        totalAbsentDeduction += deductionAmount;
        if (factor > 1) {
          penalizedAbsentDays++;
          penalizedAbsentDeduction += deductionAmount;
        }
        report.push(reportEntry);
        dailyBreakdown.push(dayData);
      }
    }
  };

  allDates.forEach(date => {
    // Check if month has changed to reset missed count
    const monthIdx = date.getMonth();
    if (monthIdx !== lastMonthIdx) {
      currentMonthMissedCount = 0;
      lastMonthIdx = monthIdx;
    }

    // Use consistent date format (YYYY-MM-DD) for matching to match groupedByDate keys
    const dateKey = date.toISOString().split('T')[0];
    const dateString = date.toISOString().split('T')[0];
    if (groupedByDate[dateKey]) {
      const punches = groupedByDate[dateKey];
      if (punches.length > 0) {
        processDay(punches, dateString);
      }
    } else {
      processMissedDay(date);
    }
  });

  const totalDays = dailyBreakdown.length;
  // Actual working days are days when the worker was physically present (subtract both absences and leaves)
  const actualWorkingDays = totalWorkingDaysInPeriod - totalAbsentDays - totalLeaveDays;
  const productivityPercentage = totalExpectedMinutes > 0 ? (totalWorkingMinutes / totalExpectedMinutes) * 100 : 0;
  const averageWorkingHours = actualWorkingDays > 0 ? (totalWorkingMinutes / actualWorkingDays) / 60 : 0;
  const punctualityScore = actualWorkingDays > 0 ? ((actualWorkingDays - punctualityViolations) / actualWorkingDays) * 100 : 0;
  const attendanceRate = totalWorkingDaysInPeriod > 0 ? (actualWorkingDays / totalWorkingDaysInPeriod) * 100 : 0;
  const salaryFromWorkingMinutes = totalWorkingMinutes * perMinuteSalary;
  // totalAbsentDeduction is now calculated incrementally in processMissedDay

  // Calculate permission deduction by summing only non-absent and non-leave entries
  // Exclude absent/leave days which are already accounted for separately
  const totalPermissionDeduction = report.reduce((sum, entry) => {
    // Skip absent/leave day entries to avoid double counting
    if ((entry.status === 'Absent' || entry.status === 'Leave') && (entry.delayTime === 'Full Day' || entry.delayTime.includes('Day'))) {
      return sum;
    }
    const deduction = parseFloat(entry.deductionAmount.replace('₹', ''));
    return sum + (isNaN(deduction) ? 0 : deduction);
  }, 0);

  const totalSalaryDeduction = totalAbsentDeduction + totalPermissionDeduction + totalLeaveDeduction;
  const finalSalary = Math.max(0, originalSalary - totalSalaryDeduction);
  const finalSummary = {
    "Total Days in Period": totalDaysInPeriod,
    "Total Working Days": totalWorkingDaysInPeriod,
    "Total Sundays": totalSundaysInPeriod,
    "Total Holidays": totalHolidayCount,
    "Total Absent Days": totalAbsentDays,
    "Total Leave Days": totalLeaveDays,
    "Actual Working Days": actualWorkingDays,
    "Total Working Hours": `${(totalWorkingMinutes / 60).toFixed(2)} hours`,
    "Total Permission Time": `${Math.round(totalPermissionMinutes)} minutes`,
    "Absent Deduction": formatCurrency(totalAbsentDeduction),
    "Leave Deduction": formatCurrency(totalLeaveDeduction),
    "Permission Deduction": formatCurrency(totalPermissionDeduction),
    "Total Salary Deductions": formatCurrency(totalSalaryDeduction),
    "Attendance Rate": `${attendanceRate.toFixed(1)}%`,
    "Final Salary": formatCurrency(finalSalary)
  };
  console.log(finalSummary);
  return {
    totalDays,
    workingDays: actualWorkingDays,
    totalWorkingHours: totalWorkingMinutes / 60,
    averageWorkingHours,
    totalPermissionTime: parseFloat(totalPermissionMinutes.toFixed(2)),
    totalSalaryDeduction,
    totalAbsentDays,
    penalizedLeaveDays,
    penalizedLeaveDeduction,
    penalizedAbsentDays,
    penalizedAbsentDeduction,
    totalSundayCount: totalSundaysInPeriod,
    totalHolidayCount,
    productivityPercentage,
    dailyBreakdown: dailyBreakdown.map(day => ({
      ...day,
      workingHours: day.workingMinutes / 60,
      permissionTime: day.permissionMinutes,
      workingTimeDisplay: day.workingMinutes > 0 ? minutesToTime(day.workingMinutes) : '-',
      permissionTimeDisplay: day.permissionMinutes > 0 ? minutesToTime(day.permissionMinutes) : '-',
      daySalaryFromMinutes: day.workingMinutes * perMinuteSalary,
      expectedDaySalary: perDaySalary
    })),
    summary: {
      punctualityScore,
      attendanceRate,
      finalSalary,
      originalSalary,
      originalSalaryForPeriod: originalSalary,
      salaryFromWorkingMinutes,
      perMinuteSalary,
      perDaySalary,
      totalWorkingDaysInPeriod,
      totalDaysInPeriod,
      totalSundaysInPeriod,
      totalHolidaysInPeriod,
      totalAbsentDays,
      totalLeaveDays,
      actualWorkingDays,
      absentDeduction: totalAbsentDeduction,
      leaveDeduction: totalLeaveDeduction,
      permissionDeduction: totalPermissionDeduction,
      penalizedLeaveDays,
      penalizedLeaveDeduction,
      penalizedAbsentDays,
      penalizedAbsentDeduction,
      worker: {
        name: worker.name || '',
        username: worker.username || '',
        rfid: worker.rfid || '',
        department: worker.department || '',
        email: worker.email || '',
        salary: worker.salary || 0
      }
    },
    configuration: {
      considerOvertime,
      deductSalary,
      workStartTime,
      workEndTime,
      lunchStartTime: lunchFrom,
      lunchEndTime: lunchTo,
      permissionTimeMinutes,
      salaryDeductionPerBreak,
      standardWorkingMinutesPerDay: standardWorkingMinutes
    },
    finalSummary,
    report: report.sort((a, b) => {
      // Sort by date first, then by time
      const dateA = new Date(a.date);
      const dateB = new Date(b.date);
      if (dateA.getTime() !== dateB.getTime()) {
        return dateA - dateB;
      }
      // If same date, sort by inTime chronologically
      // Convert time strings to minutes for proper comparison
      const timeToMinutes = (timeStr) => {
        if (!timeStr || timeStr === 'Absent') return 0;
        const [time, period] = timeStr.split(' ');
        const [hours, minutes] = time.split(':').map(Number);

        let totalMinutes = hours * 60 + minutes;

        if (period === 'AM') {
          if (hours === 12) totalMinutes -= 12 * 60;
        } else if (period === 'PM') {
          if (hours !== 12) totalMinutes += 12 * 60;
        }

        return totalMinutes;
      };

      const timeA = timeToMinutes(a.inTime);
      const timeB = timeToMinutes(b.inTime);

      return timeA - timeB;
    })
  };
};

function emptyResponse() {
  return {
    totalDays: 0,
    workingDays: 0,
    totalWorkingHours: 0,
    averageWorkingHours: 0,
    totalPermissionTime: 0,
    totalSalaryDeduction: 0,
    totalAbsentDays: 0,
    totalSundayCount: 0,
    totalHolidayCount: 0,
    productivityPercentage: 0,
    dailyBreakdown: [],
    summary: {
      punctualityScore: 0,
      attendanceRate: 0,
      finalSalary: 0,
      originalSalary: 0,
      perMinuteSalary: 0,
      totalWorkingDaysInPeriod: 0,
      totalDaysInPeriod: 0,
      totalSundaysInPeriod: 0,
      totalHolidaysInPeriod: 0,
      totalAbsentDays: 0,
      actualWorkingDays: 0,
      absentDeduction: 0,
      permissionDeduction: 0,
      worker: {
        name: '',
        username: '',
        rfid: '',
        department: '',
        email: '',
        salary: 0
      }
    },
    configuration: {},
    finalSummary: {
      "Total Days in Period": 0,
      "Total Working Days": 0,
      "Total Sundays": 0,
      "Total Holidays": 0,
      "Total Absent Days": 0,
      "Actual Working Days": 0,
      "Total Working Hours": "0 hours",
      "Total Permission Time": "0 minutes",
      "Absent Deduction": "₹0.00",
      "Permission Deduction": "₹0.00",
      "Total Salary Deductions": "₹0.00",
      "Attendance Rate": "0%",
      "Final Salary": "₹0.00"
    },
    report: []
  };
}

module.exports = {
  calculateWorkerProductivity
};