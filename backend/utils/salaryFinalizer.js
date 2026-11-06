/**
 * Authoritative Salary Finalizer Utility
 * Centralized calculation logic for Tech Ciphergate payroll.
 *
 * Ensures mathematical parity and strict numeric safety across:
 * - Main Salary Management table (/admin/salary)
 * - Bulk Salary modal report & summary
 * - All Employees Single PDF & Separate PDFs
 * - Bulk Summary PDF
 * - NEFT Excel & General Excel exports
 * - Individual Salary Report & Final Settlement
 * - Scheduled & On-Demand WhatsApp Salary Dispatches
 */

const finalizeSalaryCalculation = ({
  finalSalaryWithAdjustment = 0,
  payrollRecord = null,
  taskPenalty = 0,
  totalUnauthorizedPenalty = 0,
  totalExtra4XPenalty = null,
  totalNormal1XAmount = 0,
  normal1XLeaveAmount = 0,
  normal1XPermissionAmount = 0,
  leaveDeduction = 0,
  permissionDeduction = 0,
  toggles = {
    taskDeduction: true,
    unauthorizedDeduction: true,
    leaveDeduction: true,
    permissionDeduction: true
  }
} = {}) => {
  // 1. Sanitize base attendance salary input
  const safeBaseSalary = (!isNaN(Number(finalSalaryWithAdjustment)) && Number(finalSalaryWithAdjustment) >= 0)
    ? Number(finalSalaryWithAdjustment)
    : 0;

  // 2. Determine Attendance Salary with strict Snapshot Protection
  let attendanceSalary = safeBaseSalary;
  let snapshotProtected = false;
  let snapshotCorrupt = false;

  if (payrollRecord && ['Locked', 'Paid'].includes(payrollRecord.status)) {
    const rawSnapshot = payrollRecord.attendanceSalarySnapshot;
    if (rawSnapshot !== null && rawSnapshot !== undefined && !isNaN(Number(rawSnapshot)) && Number(rawSnapshot) >= 0) {
      attendanceSalary = Number(rawSnapshot);
      snapshotProtected = true;
    } else {
      // Corrupt or missing snapshot on locked record: do not produce NaN, log warning, fallback to calculated
      attendanceSalary = safeBaseSalary;
      snapshotCorrupt = true;
      console.warn(`[SalaryFinalizer] Warning: Corrupted or missing attendanceSalarySnapshot for locked payrollRecord ${payrollRecord._id || 'unknown'}. Safe fallback applied.`);
    }
  }

  // 2b. If not snapshot-protected, apply attendance deduction toggles
  const unauthToggle = toggles?.unauthorizedDeduction !== false;
  const leaveToggle = toggles?.leaveDeduction !== false;
  const permToggle = toggles?.permissionDeduction !== false;

  if (!snapshotProtected) {
    const safeTotalUnauth = (!isNaN(Number(totalUnauthorizedPenalty)) && Number(totalUnauthorizedPenalty) > 0)
      ? Number(totalUnauthorizedPenalty)
      : 0;

    const safeExtra4X = (totalExtra4XPenalty !== null && !isNaN(Number(totalExtra4XPenalty)))
      ? Number(totalExtra4XPenalty)
      : (safeTotalUnauth > 0 ? safeTotalUnauth * 0.8 : 0);

    const safe1XBase = Math.max(0, safeTotalUnauth - safeExtra4X);

    const safe1XLeave = (!isNaN(Number(normal1XLeaveAmount)) && Number(normal1XLeaveAmount) > 0)
      ? Number(normal1XLeaveAmount)
      : (safe1XBase > 0 ? safe1XBase : 0);

    const safe1XPerm = (!isNaN(Number(normal1XPermissionAmount)) && Number(normal1XPermissionAmount) > 0)
      ? Number(normal1XPermissionAmount)
      : 0;

    // Required Policy:
    // 1. When Unauthorized (5X) is ON (unauthToggle === true):
    //    - 5X penalty is applied (already deducted in finalSalaryWithAdjustment).
    //    - Normal 1X deduction for the same date/time was waived (never 6X double deduction).
    // 2. When Unauthorized (5X) is OFF (unauthToggle === false):
    //    - Do not apply the 5X penalty.
    //    - Restore the corresponding normal 1X LOP or permission deduction.
    //    - Do not make unauthorized absence/permission periods completely deduction-free.
    //    - Therefore: refund ONLY the extra 4X penalty surcharge (5X - 1X = 4X).
    if (!unauthToggle && safeTotalUnauth > 0) {
      attendanceSalary += safeExtra4X;
    }

    // 3. Normal Leave Toggle:
    //    - Governs normal 1X leave/LOP deductions.
    //    - If leaveToggle is OFF: refund regular leave deductions.
    //    - If unauthorizedDeduction is ALSO OFF: refund the restored 1X LOP for unauthorized absences.
    if (!leaveToggle) {
      if (Number(leaveDeduction) > 0) {
        attendanceSalary += Number(leaveDeduction);
      }
      if (!unauthToggle && safe1XLeave > 0) {
        attendanceSalary += safe1XLeave;
      }
    }

    // 4. Normal Permission Toggle:
    //    - Governs normal 1X permission/delay deductions.
    //    - If permToggle is OFF: refund regular permission deductions.
    //    - If unauthorizedDeduction is ALSO OFF: refund the restored 1X permission for unauthorized permissions.
    if (!permToggle) {
      if (Number(permissionDeduction) > 0) {
        attendanceSalary += Number(permissionDeduction);
      }
      if (!unauthToggle && safe1XPerm > 0) {
        attendanceSalary += safe1XPerm;
      }
    }
  }

  attendanceSalary = parseFloat(attendanceSalary.toFixed(2));

  // 3. Process Enterprise Payroll Adjustments with strict numeric safety
  let totalAdditions = 0;
  let totalDeductions = 0;

  if (payrollRecord && Array.isArray(payrollRecord.adjustments)) {
    payrollRecord.adjustments.forEach(adj => {
      if (adj && !adj.isDeleted) {
        const amt = Number(adj.amount);
        if (!isNaN(amt) && amt > 0) {
          if (adj.type === 'addition') {
            totalAdditions += amt;
          } else if (adj.type === 'deduction') {
            totalDeductions += amt;
          }
        }
      }
    });
  }

  // Round additions/deductions to 2 decimal places to avoid IEEE-754 float drift
  totalAdditions = parseFloat(totalAdditions.toFixed(2));
  totalDeductions = parseFloat(totalDeductions.toFixed(2));

  // 4. Calculate Gross Payable Salary (before task penalties)
  const rawPayableSalary = attendanceSalary + totalAdditions - totalDeductions;
  const payableSalary = parseFloat(Math.max(0, rawPayableSalary).toFixed(2));

  // 5. Sanitize Task Penalty
  const taskToggle = toggles?.taskDeduction !== false;
  const safeTaskPenalty = (taskToggle && !isNaN(Number(taskPenalty)) && Number(taskPenalty) > 0)
    ? parseFloat(Number(taskPenalty).toFixed(2))
    : 0;

  // 6. Central Company Policy: Deduct task penalties if taskToggle is active
  const rawFinalPayable = payableSalary - safeTaskPenalty;
  const finalPayableSalary = parseFloat(Math.max(0, rawFinalPayable).toFixed(2));

  return {
    attendanceSalary,
    totalAdditions,
    totalDeductions,
    taskPenalty: safeTaskPenalty,
    payableSalary,
    finalPayableSalary,
    appliedPenaltyPolicy: taskToggle ? 'Deducted' : 'Waived',
    snapshotProtected,
    snapshotCorrupt
  };
};

module.exports = {
  finalizeSalaryCalculation
};

