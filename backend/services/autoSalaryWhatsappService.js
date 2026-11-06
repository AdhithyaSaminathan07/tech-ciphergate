const path = require('path');
const fs = require('fs');
const { jsPDF } = require('jspdf');
const autoTableMod = require('jspdf-autotable');
const autoTable = autoTableMod.default || autoTableMod;
const ExcelJS = require('exceljs');
const Settings = require('../models/Settings');
const GowhatsConfig = require('../models/GowhatsConfig');
const Worker = require('../models/Worker');
const Attendance = require('../models/Attendance');
const Leave = require('../models/Leave');
const Holiday = require('../models/Holiday');
const SalaryProject = require('../models/SalaryProject');
const Ticket = require('../models/ticketModel');
const PayrollRecord = require('../models/PayrollRecord');
const ProjectPaymentLedger = require('../models/ProjectPaymentLedger');
const mongoose = require('mongoose');
const { calculateWorkerProductivity, calculateUnauthorizedAbsencePenalty, getValidatedEmploymentDates, toIndiaDateString } = require('../utils/productivityCalculator');
const { calculateTaskPenalties } = require('../utils/salaryPenaltyCalculator');
const { finalizeSalaryCalculation } = require('../utils/salaryFinalizer');
const whatsappService = require('./whatsappService');

/**
 * Helper to determine if a worker is currently active based on employment status & relievedAt timestamp
 */
const isWorkerCurrentlyActive = (worker, workerHistory = [], fromDateStr, toDateStr) => {
  if (!worker) return false;
  const s = String(worker.status || '').trim().toLowerCase();
  const isExplicitlyActive = s === 'active';
  const isRelievedOrInactive = s === 'relieved' || s === 'deleted' || s === 'inactive' || s === 'resigned' || s === 'terminated';
  if (!isExplicitlyActive || isRelievedOrInactive) return false;

  // If worker has relievedAt, check if a valid rejoining event occurred
  if (worker.relievedAt) {
    if (typeof getValidatedEmploymentDates === 'function') {
      const { relievedDateStr } = getValidatedEmploymentDates(worker, fromDateStr, toDateStr, { employeeHistory: workerHistory });
      if (relievedDateStr && fromDateStr && relievedDateStr < fromDateStr) {
        return false;
      }
    } else {
      return false;
    }
  }
  return true;
};

/**
 * Filter an array of workers strictly to currently active employees
 */
const filterActiveWorkers = (workers, allEmployeeHistory = [], fromDateStr, toDateStr) => {
  return (workers || []).filter(w => {
    const wHistory = (allEmployeeHistory || []).filter(h => (h.employee?._id || h.employee)?.toString() === (w._id || w.id)?.toString());
    return isWorkerCurrentlyActive(w, wHistory, fromDateStr, toDateStr);
  });
};

/**
 * Sanitize error message to ensure zero exposure of tokens, secrets, or credentials
 */
const sanitizeErrorMessage = (msg) => {
  if (!msg || typeof msg !== 'string') return 'Unknown provider error';
  return msg
    .replace(/Bearer\s+[A-Za-z0-9_\-.]+/gi, 'Bearer [REDACTED]')
    .replace(/(?:access_token|token|apiKey|api_key|password|secret)[=:]\s*["']?[A-Za-z0-9_\-.]+["']?/gi, '$1=[REDACTED]')
    .replace(/EA[A-Za-z0-9]+/g, '[REDACTED_TOKEN]')
    .trim();
};

/**
 * Mask phone number for safe non-sensitive reporting
 */
const maskPhoneNumber = (phone) => {
  const str = String(phone || '').replace(/\D/g, '');
  if (str.length <= 4) return '****';
  return str.slice(0, 2) + '****' + str.slice(-4);
};

/**
 * Helper to generate Single PDF for all employees on backend
 */
const generateAllEmployeesPdfBuffer = async (reportsData, monthName, year) => {
  const doc = new jsPDF('portrait', 'mm', 'a4');
  const formatCurr = (val) => {
    if (typeof val === 'string') {
      const num = parseFloat(val.replace(/[â‚¹Rs,\s]/g, ''));
      return isNaN(num) ? 'Rs. 0.00' : `Rs. ${num.toFixed(2)}`;
    }
    return `Rs. ${Number(val || 0).toFixed(2)}`;
  };

  reportsData.forEach((item, empIndex) => {
    if (empIndex > 0) doc.addPage();

    const worker = item.worker;
    const reportObj = item.fullReport;
    const summary = reportObj?.report?.summary || {};
    const reportList = reportObj?.report?.report || [];
    const deptName = item.department || (typeof worker.department === 'object' ? worker.department?.name : worker.department) || 'N/A';
    const rfid = worker.rfid || 'N/A';
    const name = worker.name || item.name || 'Developer';

    const grossSalary = summary.originalSalary || worker.salary || 0;
    const workingDaysCount = summary.totalWorkingDaysInPeriod || summary.totalDaysInPeriod || 30;
    const perDaySalary = summary.perDaySalary || (workingDaysCount ? grossSalary / workingDaysCount : 0);
    const actualWorked = summary.actualWorkingDays || 0;
    const earnedAttendanceSalary = summary.earnedAttendanceSalary || (actualWorked * perDaySalary);
    const netPayout = item.finalPayableSalary !== undefined
      ? item.finalPayableSalary
      : (item.payableSalary ?? item.totalFinalSalary ?? reportObj.finalSalaryWithFines ?? summary.finalSalary ?? 0);

    const pageWidth = doc.internal.pageSize.getWidth();

    // Header banner
    doc.setFillColor(24, 43, 73);
    doc.rect(0, 0, pageWidth, 15, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(10.5);
    doc.setFont('helvetica', 'bold');
    doc.text(`${empIndex + 1}. SALARY & ATTENDANCE SLIP â€” ${name}`, 10, 10.5);

    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    const headerRightText = `Period: ${monthName} ${year}  |  Dept: ${deptName}  |  ID: ${rfid}`;
    doc.text(headerRightText, pageWidth - 10, 10.5, { align: 'right' });
    doc.setTextColor(0, 0, 0);

    // Summary grid table
    const summaryGridHead = [
      [
        { content: 'Payroll & Earnings Details', styles: { fillColor: [44, 62, 80], textColor: [255, 255, 255], fontStyle: 'bold' } },
        { content: 'Amount', styles: { fillColor: [44, 62, 80], textColor: [255, 255, 255], fontStyle: 'bold' } },
        { content: 'Attendance Statistics', styles: { fillColor: [44, 62, 80], textColor: [255, 255, 255], fontStyle: 'bold' } },
        { content: 'Count / Info', styles: { fillColor: [44, 62, 80], textColor: [255, 255, 255], fontStyle: 'bold' } }
      ]
    ];

    const b = worker.bankDetails || {};
    const bankSummary = b.accountNumber ? `${b.bankName || 'Bank'}: ${b.accountNumber} (${b.ifscCode || ''})` : 'N/A';

    const summaryGridBody = [
      ['Employee Name', name, 'Total Days in Month', String(summary.totalDaysInPeriod || 30)],
      ['Employee ID / RFID', rfid, 'Working Days', String(workingDaysCount)],
      ['Department', deptName, 'Present Days', String(actualWorked)],
      ['Mobile / Phone', worker.phoneNumber || worker.phone || worker.mobile || 'N/A', 'Absent / Leave Days', `${summary.totalAbsentDays || 0} Abs / ${summary.totalLeaveDays || 0} Lve`],
      ['Bank Account', bankSummary, 'Holidays & Sundays', `${summary.totalHolidaysInPeriod || 0} Hol / ${summary.totalSundaysInPeriod || 0} Sun`],
      ['Gross Base Salary', formatCurr(grossSalary), 'Total Working Hours', `${Number(reportObj.report?.totalWorkingHours || summary.totalWorkingHours || 0).toFixed(2)} hrs`],
      ['Earned Attendance Salary', formatCurr(earnedAttendanceSalary), 'Permission Time Used', `${reportObj.report?.totalPermissionTime || summary.totalPermissionTime || 0} mins`],
      ['Total Deductions', formatCurr(summary.totalSalaryDeductions || 0), 'Advance Pending', 'Rs. 0.00'],
      [
        { content: 'NET PAYOUT AMOUNT', styles: { fontStyle: 'bold', textColor: [217, 119, 6] } },
        { content: formatCurr(netPayout), styles: { fontStyle: 'bold', textColor: [217, 119, 6] } },
        'Attendance Rate',
        `${Number(summary.attendanceRate || 0).toFixed(1)}%`
      ]
    ];

    autoTable(doc, {
      startY: 18,
      head: summaryGridHead,
      body: summaryGridBody,
      theme: 'grid',
      margin: { left: 8, right: 8 },
      styles: { fontSize: 7.2, font: 'helvetica', cellPadding: 1.1, lineColor: [220, 224, 230], lineWidth: 0.15 },
      columnStyles: {
        0: { cellWidth: 46, fontStyle: 'bold', textColor: [60, 64, 67] },
        1: { cellWidth: 46, textColor: [30, 30, 30] },
        2: { cellWidth: 48, fontStyle: 'bold', textColor: [60, 64, 67] },
        3: { cellWidth: 54, textColor: [30, 30, 30] }
      }
    });

    const summaryEndY = doc.lastAutoTable?.finalY || 68;

    doc.setFontSize(8.5);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(217, 119, 6);
    doc.text(`Daily Attendance & Salary Breakdown (${monthName} ${year})`, 8, summaryEndY + 4);
    doc.setTextColor(0, 0, 0);

    const breakdownHead = [['Date', 'Status', 'In Time', 'Out Time', 'Delay', 'Deduction', 'Earned Salary']];
    const breakdownBody = (Array.isArray(reportList) ? reportList : []).map(row => {
      let formattedDate = row.date || '';
      try {
        const d = new Date(row.date);
        if (!isNaN(d.getTime())) {
          const day = String(d.getDate()).padStart(2, '0');
          const mName = d.toLocaleString('en-US', { month: 'short' });
          formattedDate = `${day} ${mName}`;
        }
      } catch (e) {
        formattedDate = row.date;
      }
      return [
        formattedDate,
        row.status || '-',
        row.inTime || '-',
        row.outTime || '-',
        row.delayTime || '-',
        String(row.deductionAmount || 'Rs. 0.00').replace('â‚¹', 'Rs. '),
        String(row.totalSalary || 'Rs. 0.00').replace('â‚¹', 'Rs. ')
      ];
    });

    autoTable(doc, {
      startY: summaryEndY + 6,
      head: breakdownHead,
      body: breakdownBody,
      theme: 'grid',
      margin: { left: 8, right: 8 },
      headStyles: { fillColor: [44, 62, 80], textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 7.2, cellPadding: 1.1 },
      styles: { fontSize: 6.5, font: 'helvetica', cellPadding: 0.9, lineColor: [235, 238, 242], lineWidth: 0.15 },
      columnStyles: {
        0: { cellWidth: 20 },
        1: { cellWidth: 26, fontStyle: 'bold' },
        2: { cellWidth: 28 },
        3: { cellWidth: 32 },
        4: { cellWidth: 28 },
        5: { cellWidth: 30, textColor: [185, 28, 28] },
        6: { cellWidth: 30, fontStyle: 'bold', textColor: [15, 118, 110] }
      },
      didParseCell: function (data) {
        if (data.section === 'body' && data.row.index % 2 === 1) {
          data.cell.styles.fillColor = [248, 250, 252];
        }
      }
    });
  });

  return Buffer.from(doc.output('arraybuffer'));
};

/**
 * Helper to generate Standard Corporate Bank Bulk NEFT XLSX Buffer on backend
 */
const generateBankStatementXlsxBuffer = async (reportsData, monthName, year) => {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet(`Bank_Payment_${monthName}_${year}`);

  // 13 Standard Corporate Bank Bulk NEFT Upload Columns
  worksheet.columns = [
    { header: 'PYMT_PROD_TYPE_CODE', key: 'pymtProdTypeCode', width: 22 },
    { header: 'PYMT_MODE', key: 'pymtMode', width: 14 },
    { header: 'DEBIT_ACC_NO', key: 'debitAccNo', width: 18 },
    { header: 'BNF_NAME', key: 'bnfName', width: 28 },
    { header: 'BENE_ACC_NO', key: 'beneAccNo', width: 20 },
    { header: 'BENE_IFSC', key: 'beneIfsc', width: 16 },
    { header: 'AMOUNT', key: 'amount', width: 15 },
    { header: 'CREDIT_NARR', key: 'creditNarr', width: 16 },
    { header: 'PYMT_DATE', key: 'pymtDate', width: 14 },
    { header: 'MOBILE_NUM', key: 'mobileNum', width: 16 },
    { header: 'EMAIL_ID', key: 'emailId', width: 25 },
    { header: 'REMARK', key: 'remark', width: 16 },
    { header: 'REF_NO', key: 'refNo', width: 20 }
  ];

  const now = new Date();
  const indiaDateFormatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric', month: '2-digit', day: '2-digit'
  });
  const todayParts = indiaDateFormatter.format(now).split('-'); // [YYYY, MM, DD]
  const formattedToday = `${todayParts[2]}-${todayParts[1]}-${todayParts[0]}`; // DD-MM-YYYY
  const dateNumStr = `${todayParts[0]}${todayParts[1]}${todayParts[2]}`; // YYYYMMDD
  const shortMonth = typeof monthName === 'string' ? monthName.substring(0, 3) : 'Sal';

  reportsData.forEach((item, index) => {
    const w = item.worker || {};
    const b = w.bankDetails || {};
    const netSalary = item.finalPayableSalary !== undefined
      ? item.finalPayableSalary
      : (item.payableSalary !== undefined
        ? item.payableSalary
        : (item.totalFinalSalary || item.fullReport?.finalSalaryWithFines || 0));
    const seq = String(index + 1).padStart(3, '0');
    const refNo = `SAL${dateNumStr}${seq}`;

    // Prefer employee real name, then bank account holder name
    const employeeName = (w.name || b.accountHolderName || 'EMPLOYEE').toUpperCase();
    const bankAccNo = b.accountNumber ? String(b.accountNumber).trim() : '';
    const ifscCode = b.ifscCode ? String(b.ifscCode).trim().toUpperCase() : '';
    const phoneNo = w.phoneNumber || w.phone || w.mobile || '';

    worksheet.addRow({
      pymtProdTypeCode: 'PAB_VENDOR',
      pymtMode: 'NEFT',
      debitAccNo: '612805036053',
      bnfName: employeeName,
      beneAccNo: bankAccNo,
      beneIfsc: ifscCode,
      amount: parseFloat(Number(netSalary).toFixed(2)),
      creditNarr: `${shortMonth} Salary`,
      pymtDate: formattedToday,
      mobileNum: phoneNo,
      emailId: w.email || '',
      remark: '',
      refNo: refNo
    });
  });

  // Style header row
  worksheet.getRow(1).font = { bold: true, color: { argb: '000000' } };
  worksheet.getRow(1).alignment = { vertical: 'middle', horizontal: 'center' };

  const buffer = await workbook.xlsx.writeBuffer();
  return buffer;
};

/**
 * Core Dispatch Function: Calculates previous month salary data, generates PDF + XLSX, and dispatches via WhatsApp
 */
const executeSalaryWhatsappDispatch = async (subdomain, targetPhoneNumbers = null, customMonth = null, customYear = null) => {
  try {
    let tenantSubdomain = (subdomain && subdomain !== 'main' && subdomain !== 'undefined') ? subdomain : null;
    let settings = null;
    if (tenantSubdomain) {
      settings = await Settings.findOne({ subdomain: tenantSubdomain });
    }
    if (!settings) {
      settings = await Settings.findOne({ subdomain: 'tech-vaseegrah' }) || await Settings.findOne({});
      if (settings) {
        tenantSubdomain = settings.subdomain;
      }
    }
    if (!settings) {
      throw new Error(`Settings not found for tenant: ${subdomain || 'default'}`);
    }

    const config = settings.autoSalaryWhatsappConfig || {};
    const recipientPhonesStr = targetPhoneNumbers || config.phoneNumbers || '';
    let phoneList = recipientPhonesStr
      .split(',')
      .map(p => p.trim())
      .filter(p => p.length > 0);

    // If no numbers specified in salary config, automatically use the Leave Request admin numbers from GowhatsConfig
    if (phoneList.length === 0) {
      let gowhatsConfig = await GowhatsConfig.findOne({ subdomain: tenantSubdomain });
      if (!gowhatsConfig) {
        gowhatsConfig = await GowhatsConfig.findOne({});
      }
      if (gowhatsConfig && Array.isArray(gowhatsConfig.adminWhatsappNumbers) && gowhatsConfig.adminWhatsappNumbers.length > 0) {
        phoneList = gowhatsConfig.adminWhatsappNumbers.map(p => String(p).trim()).filter(p => p.length > 0);
        console.log(`â„¹ï¸ [WhatsApp Salary Dispatch] Using ${phoneList.length} leave request admin WhatsApp numbers from GoWhats config.`);
      }
    }

    if (phoneList.length === 0) {
      throw new Error('No WhatsApp admin phone numbers configured. Please add admin numbers in GoWhats Integration or WhatsApp Salary Settings.');
    }

    // Determine target month & year (Previous month relative to now, or customMonth/customYear if specified)
    const now = new Date();
    let targetMonth = (typeof customMonth === 'number' && customMonth >= 1 && customMonth <= 12) ? customMonth : now.getMonth(); // 0-indexed: current month - 1 = previous month
    let targetYear = (typeof customYear === 'number' && customYear > 2000) ? customYear : now.getFullYear();
    if (!customMonth && targetMonth === 0) {
      targetMonth = 12;
      targetYear -= 1;
    }

    const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
    const monthName = MONTH_NAMES[targetMonth - 1];

    // Deterministic local calendar dates without UTC toISOString() boundary bleed
    const pad2 = (n) => String(n).padStart(2, '0');
    const lastDayNum = new Date(targetYear, targetMonth, 0).getDate();
    const fromDateStr = `${targetYear}-${pad2(targetMonth)}-01`;
    const toDateStr = `${targetYear}-${pad2(targetMonth)}-${pad2(lastDayNum)}`;
    const fromDateObj = new Date(targetYear, targetMonth - 1, 1, 0, 0, 0, 0);
    const toDateObj = new Date(targetYear, targetMonth - 1, lastDayNum, 23, 59, 59, 999);

    // Fetch all active workers strictly for this tenant
    const activeWorkerQuery = {
      subdomain: tenantSubdomain,
      status: { $in: ['Active', 'active'] }
    };

    let workers = await Worker.find(activeWorkerQuery)
      .populate('department')
      .lean();

    const EmployeeHistory = require('../models/EmployeeHistory');
    const isValidObjectId = (val) => mongoose.isValidObjectId ? mongoose.isValidObjectId(val) : /^[0-9a-fA-F]{24}$/.test(String(val));
    const validWorkerObjectIds = workers.map(w => w._id).filter(id => isValidObjectId(id));
    let allEmployeeHistory = [];
    if (validWorkerObjectIds.length > 0) {
      try {
        allEmployeeHistory = await EmployeeHistory.find({
          employee: { $in: validWorkerObjectIds },
          actionType: { $in: ['Restored', 'Reactivated', 'Relieved', 'Created', 'Updated', 'Rejoined'] }
        }).lean();
      } catch (e) {
        allEmployeeHistory = [];
      }
    }

    // Secondary in-memory defense-in-depth filter using strict employment-status rule and rejoining validation
    workers = filterActiveWorkers(workers, allEmployeeHistory, fromDateStr, toDateStr);

    if (workers.length === 0) {
      throw new Error('No active employees found to generate monthly salary report');
    }

    // Parallelize data fetching for the subdomain
    const [
      allAttendanceData,
      allLeaveData,
      holidays,
      allSalaryProjects,
      allTickets,
      allPayrollRecords,
      allPastLedgers
    ] = await Promise.all([
      Attendance.find({
        subdomain: tenantSubdomain || subdomain,
        date: { $gte: fromDateStr, $lte: toDateStr }
      }).lean(),
      Leave.find({ subdomain: tenantSubdomain || subdomain }).lean(),
      Holiday.find({}).lean(),
      SalaryProject.find({
        subdomain: tenantSubdomain || subdomain,
        $or: [{ startDate: { $lte: toDateObj }, endDate: { $gte: fromDateObj } }]
      }).populate('developers', 'name rfid').lean(),
      Ticket.find({ subdomain: tenantSubdomain || subdomain, isDeleted: { $ne: true } }).lean(),
      PayrollRecord.find({
        subdomain: tenantSubdomain || subdomain,
        month: targetMonth,
        year: targetYear
      }).populate('adjustments.addedBy', 'name').lean().catch(() => []),
      ProjectPaymentLedger.find({
        subdomain: tenantSubdomain || subdomain,
        isSettled: true,
        $or: [{ year: { $lt: targetYear } }, { year: targetYear, month: { $lt: targetMonth } }]
      }).lean().catch(() => [])
    ]);

    const batches = settings.batches || [];

    // Helper for past project reconciliations (ProjectPaymentLedger)
    const uniqueProjectIdsForLedgers = [...new Set((allPastLedgers || []).map(l => l.projectId?.toString()).filter(Boolean))];
    const allPastProjects = uniqueProjectIdsForLedgers.length > 0
      ? await SalaryProject.find({ _id: { $in: uniqueProjectIdsForLedgers } }).populate('developers', 'name rfid').lean().catch(() => [])
      : [];
    const pastProjectsMap = {};
    (allPastProjects || []).forEach(p => {
      if (p?._id) pastProjectsMap[p._id.toString()] = p;
    });

    const calculateProjectAdjustmentsOptimized = (wId) => {
      const workerLedgers = (allPastLedgers || []).filter(l => l.employeeId?.toString() === wId.toString());
      if (workerLedgers.length === 0) return { totalAdjustment: 0, adjustmentDetails: [] };

      const projectMap = {};
      workerLedgers.forEach(entry => {
        const pStr = entry.projectId?.toString();
        if (pStr && pastProjectsMap[pStr] && !projectMap[pStr]) {
          const project = pastProjectsMap[pStr];
          const devCount = project.developers?.length || 1;
          const share = (project.projectProfit || 0) / devCount;
          const start = new Date(project.startDate);
          const end = new Date(project.endDate);
          let workingDays = 0;
          const cur = new Date(start);
          while (cur <= end) {
            if (cur.getDay() !== 0) workingDays++;
            cur.setDate(cur.getDate() + 1);
          }
          projectMap[pStr] = {
            projectName: project.projectName,
            currentTotalWorkingDays: workingDays,
            currentPerDayValue: workingDays > 0 ? share / workingDays : 0
          };
        }
      });

      let totalAdjustment = 0;
      const adjustmentDetails = [];
      for (const entry of workerLedgers) {
        const project = projectMap[entry.projectId?.toString()];
        if (!project) continue;
        const currentEntitlement = (entry.paidWorkingDays || 0) * project.currentPerDayValue;
        const adjustment = currentEntitlement - (entry.paidAmount || 0);

        totalAdjustment += adjustment;
        adjustmentDetails.push({
          projectId: entry.projectId,
          projectName: project.projectName,
          month: entry.month,
          year: entry.year,
          paidAmount: entry.paidAmount,
          paidPerDayValue: entry.paidPerDayValue,
          paidWorkingDays: entry.paidWorkingDays,
          currentPerDayValue: project.currentPerDayValue,
          currentEntitlement,
          adjustment,
          originalTotalDays: entry.projectTotalWorkingDaysAtPayment,
          currentTotalDays: project.currentTotalWorkingDays
        });
      }
      return { totalAdjustment, adjustmentDetails };
    };

    const reportsData = [];
    for (const worker of workers) {
      const workerId = worker._id.toString();
      const workerAttendance = allAttendanceData.filter(r => (r.worker?._id ? r.worker._id.toString() : r.worker?.toString()) === workerId);
      const workerLeaves = allLeaveData.filter(l => (l.worker?._id ? l.worker._id.toString() : l.worker?.toString()) === workerId);
      const workerProjects = allSalaryProjects.filter(p => Array.isArray(p.developers) && p.developers.some(d => (d?._id ? d._id.toString() : d?.toString()) === workerId));

      const enrichedProjects = workerProjects.map(p => {
        const devCount = p.developers.length || 1;
        const share = p.projectProfit / devCount;
        const start = new Date(p.startDate);
        const end = new Date(p.endDate);
        let workingDays = 0;
        const cur = new Date(start);
        while (cur <= end) {
          if (cur.getDay() !== 0) workingDays++;
          cur.setDate(cur.getDate() + 1);
        }
        return { ...p, perDeveloperShare: share, totalWorkingDays: workingDays, perDayValue: workingDays > 0 ? share / workingDays : 0 };
      });

      const workerHistory = (allEmployeeHistory || []).filter(h => (h.employee?._id || h.employee)?.toString() === workerId);

      const enableUnauthorizedLeavePenalty = settings?.advancedLeaveDeduction?.enableUnauthorizedLeavePenalty !== false;
      const enableUnauthorizedPermissionPenalty = settings?.advancedLeaveDeduction?.enableUnauthorizedPermissionPenalty === true;
      const {
        penalties: unauthorizedAbsencePenalties,
        totalUnauthorizedPenalty,
        totalNormal1XAmount,
        totalExtra4XPenalty,
        normal1XLeaveAmount,
        normal1XPermissionAmount,
        unauthorizedDates,
        unauthorizedPermissions
      } = (enableUnauthorizedLeavePenalty || enableUnauthorizedPermissionPenalty)
        ? calculateUnauthorizedAbsencePenalty(
          worker, fromDateStr, toDateStr, workerLeaves, workerAttendance, holidays, { ...settings, employeeHistory: workerHistory }
        )
        : {
          penalties: [],
          totalUnauthorizedPenalty: 0,
          totalNormal1XAmount: 0,
          totalExtra4XPenalty: 0,
          normal1XLeaveAmount: 0,
          normal1XPermissionAmount: 0,
          unauthorizedDates: new Set(),
          unauthorizedPermissions: []
        };

      const report = calculateWorkerProductivity({
        worker,
        attendanceData: workerAttendance,
        fromDate: fromDateStr,
        toDate: toDateStr,
        leaveData: workerLeaves.filter(l => l.status === 'Approved' || l.leaveType === 'Paid Leave'),
        projects: enrichedProjects,
        options: {
          batches,
          holidays,
          permissionTimeMinutes: settings.permissionTimeMinutes || 15,
          deductSalary: settings.deductSalary !== false,
          intervals: settings.intervals || [],
          advancedLeaveDeduction: settings.advancedLeaveDeduction || null,
          includePermission: settings.includePermission || false,
          paidLeaveConfig: settings.paidLeaveConfig || null,
          unauthorizedAbsenceDates: unauthorizedDates,
          unauthorizedPermissions,
          employeeHistory: workerHistory
        }
      });

      const totalBonusAmount = (worker.bonuses || [])
        .filter(b => new Date(b.fromDate) <= toDateObj && new Date(b.toDate) >= fromDateObj)
        .reduce((sum, b) => sum + b.amount, 0);

      const totalFinesAmount = (worker.fines || [])
        .filter(f => {
          const fDate = new Date(f.date);
          return fDate >= fromDateObj && fDate <= toDateObj;
        })
        .reduce((sum, f) => sum + (f.amount || 0), 0);

      const finalSalaryWithBonus = (report.summary?.finalSalary || 0) + totalBonusAmount;
      const finalSalaryWithFines = Math.max(0, finalSalaryWithBonus - totalFinesAmount);

      const finalSalaryAfterUnauthorizedPenalty = Math.max(0, finalSalaryWithFines - totalUnauthorizedPenalty);

      // Project Adjustments (prior month project reconciliations)
      const { totalAdjustment: projectAdjustment, adjustmentDetails: projectAdjustmentDetails } = calculateProjectAdjustmentsOptimized(workerId);
      const finalSalaryWithAdjustment = Math.max(0, finalSalaryAfterUnauthorizedPenalty + projectAdjustment);

      // Task Penalty Calculation
      const workerTickets = (allTickets || []).filter(task => {
        return (task.assignee?._id ? task.assignee._id.toString() : task.assignee?.toString()) === workerId ||
          (Array.isArray(task.assignees) && task.assignees.some(a => (a?._id ? a._id.toString() : a?.toString()) === workerId));
      });

      const { taskPenalties: delayedTasks, totalTaskPenalty: rawTaskPenalty } = calculateTaskPenalties({
        worker,
        tickets: workerTickets,
        report,
        fromDate: fromDateStr,
        toDate: toDateStr
      });

      // Enterprise Payroll Module: Authoritative calculation via finalizeSalaryCalculation
      const payrollRecord = (allPayrollRecords || []).find(pr => pr.workerId?.toString() === workerId);
      const finalized = finalizeSalaryCalculation({
        finalSalaryWithAdjustment,
        payrollRecord,
        taskPenalty: rawTaskPenalty,
        totalUnauthorizedPenalty,
        totalExtra4XPenalty,
        totalNormal1XAmount,
        normal1XLeaveAmount,
        normal1XPermissionAmount,
        leaveDeduction: report.summary?.leaveDeduction || 0,
        permissionDeduction: report.summary?.permissionDeduction || 0
      });

      reportsData.push({
        worker,
        workerId,
        name: worker.name,
        rfid: worker.rfid,
        department: worker.department?.name || 'N/A',
        totalFinalSalary: finalized.attendanceSalary,
        payableSalary: finalized.payableSalary,
        finalPayableSalary: finalized.finalPayableSalary,
        attendanceSalary: finalized.attendanceSalary,
        taskPenalty: finalized.taskPenalty,
        appliedPenaltyPolicy: finalized.appliedPenaltyPolicy,
        projectAdjustment,
        totalAdditions: finalized.totalAdditions,
        totalDeductions: finalized.totalDeductions,
        payrollRecord: payrollRecord || null,
        fullReport: {
          report,
          totalBonusAmount,
          totalFinesAmount,
          finalSalaryWithBonus,
          finalSalaryWithFines: finalized.finalPayableSalary,
          projectAdjustment,
          projectAdjustmentDetails,
          totalUnauthorizedPenalty,
          unauthorizedAbsencePenalties,
          payableSalary: finalized.payableSalary,
          finalPayableSalary: finalized.finalPayableSalary,
          attendanceSalary: finalized.attendanceSalary,
          taskPenalty: finalized.taskPenalty,
          appliedPenaltyPolicy: finalized.appliedPenaltyPolicy,
          delayedTasks,
          worker
        }
      });
    }

    // Generate PDF & XLSX Buffers
    const pdfBuffer = await generateAllEmployeesPdfBuffer(reportsData, monthName, targetYear);
    const xlsxBuffer = await generateBankStatementXlsxBuffer(reportsData, monthName, targetYear);

    // Save files to uploads/reports/ directory
    const reportsDir = path.join(__dirname, '..', 'uploads', 'reports');
    if (!fs.existsSync(reportsDir)) {
      fs.mkdirSync(reportsDir, { recursive: true });
    }

    const timestamp = Date.now();
    const xlsxFilename = `Bank_Statement_NEFT_${monthName}_${targetYear}.xlsx`;
    const pdfFilename = `All_Employees_Salary_Report_${monthName}_${targetYear}.pdf`;

    const pdfPath = path.join(reportsDir, pdfFilename);
    const xlsxPath = path.join(reportsDir, xlsxFilename);

    fs.writeFileSync(pdfPath, pdfBuffer);
    fs.writeFileSync(xlsxPath, xlsxBuffer);

    // Build public URLs for WhatsApp attachments
    const baseUrl = process.env.BACKEND_URL || process.env.SERVER_URL || 'http://localhost:5002';
    const pdfUrl = `${baseUrl}/uploads/reports/${pdfFilename}`;
    const xlsxUrl = `${baseUrl}/uploads/reports/${xlsxFilename}`;

    const dispatchResults = [];
    const generatedOnStr = new Date().toLocaleString('en-IN', {
      timeZone: 'Asia/Kolkata',
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true
    });

    for (const phone of phoneList) {
      // 1. Send Bank NEFT Statement (XLSX) attached directly with the Meta Approved Template
      const templatePayload = {
        type: 'template',
        templateName: 'monthly_salary_report',
        languageCode: 'en',
        filePath: xlsxPath,
        filename: xlsxFilename,
        components: [
          {
            type: 'header',
            parameters: [
              {
                type: 'document',
                document: {
                  filename: xlsxFilename
                }
              }
            ]
          },
          {
            type: 'body',
            parameters: [
              { type: 'text', text: `${monthName} ${targetYear}` },
              { type: 'text', text: String(reportsData.length) },
              { type: 'text', text: generatedOnStr }
            ]
          }
        ]
      };

      console.log(`[WhatsApp Salary Dispatch] Sending template monthly_salary_report (Bank NEFT Statement) to ${phone}...`);
      let templateRes = await whatsappService.sendWhatsApp(subdomain, phone, templatePayload);

      // If template fails (e.g. template review or param mismatch), fallback to direct text + XLSX & PDF
      let textRes = null;
      let xlsxRes = templateRes;
      if (!templateRes.success) {
        console.warn(`[WhatsApp Salary Dispatch] Template send failed (${templateRes.error}). Falling back to direct message & documents...`);
        const textMsg = `ðŸ“Š *MONTHLY SALARY REPORT & BANK NEFT STATEMENT*\n\n` +
          `â€¢ *Period:* ${monthName} ${targetYear}\n` +
          `â€¢ *Total Employees:* ${reportsData.length}\n` +
          `â€¢ *Generated On:* ${generatedOnStr}\n\n` +
          `Attached below are your **Corporate Bank NEFT Upload Statement (XLSX)** and **All Employees Salary Report PDF**.`;

        textRes = await whatsappService.sendWhatsApp(subdomain, phone, { type: 'text', text: textMsg });

        xlsxRes = await whatsappService.sendWhatsApp(subdomain, phone, {
          type: 'document',
          link: xlsxUrl,
          filePath: xlsxPath,
          filename: xlsxFilename,
          caption: `ðŸ“Š Bank NEFT Statement XLSX (${monthName} ${targetYear})`
        });
      }

      // 2. Also Send All Employees Single PDF Salary Report Document
      const pdfRes = await whatsappService.sendWhatsApp(subdomain, phone, {
        type: 'document',
        link: pdfUrl,
        filePath: pdfPath,
        filename: pdfFilename,
        caption: `ðŸ“„ All Employees Salary Report PDF (${monthName} ${targetYear})`
      });

      dispatchResults.push({ phone, templateRes, textRes, xlsxRes, pdfRes });
    }

    // Evaluate provider acceptance for each recipient across the two required deliverables:
    // Deliverable 1: Corporate Bank Bulk NEFT Statement (XLSX via template or fallback document)
    // Deliverable 2: All Employees Salary Report (PDF document)
    const recipientOutcomes = dispatchResults.map(item => {
      const masked = maskPhoneNumber(item.phone);

      const xlsxAccepted = Boolean((item.templateRes && item.templateRes.success) || (item.xlsxRes && item.xlsxRes.success));
      const pdfAccepted = Boolean(item.pdfRes && item.pdfRes.success);
      const textAccepted = item.textRes ? Boolean(item.textRes.success) : null;

      const allDeliverablesAccepted = xlsxAccepted && pdfAccepted;
      const anyDeliverableAccepted = xlsxAccepted || pdfAccepted;

      const failureReasons = [];
      if (item.templateRes && !item.templateRes.success) {
        failureReasons.push(`Template: ${sanitizeErrorMessage(item.templateRes.error)}`);
      }
      if (item.textRes && !item.textRes.success) {
        failureReasons.push(`Text Notice: ${sanitizeErrorMessage(item.textRes.error)}`);
      }
      if (item.xlsxRes && !item.xlsxRes.success && (!item.templateRes || !item.templateRes.success)) {
        failureReasons.push(`XLSX: ${sanitizeErrorMessage(item.xlsxRes.error)}`);
      }
      if (item.pdfRes && !item.pdfRes.success) {
        failureReasons.push(`PDF: ${sanitizeErrorMessage(item.pdfRes.error)}`);
      }

      return {
        phone: masked,
        rawPhone: item.phone,
        xlsxAccepted,
        pdfAccepted,
        textAccepted,
        allDeliverablesAccepted,
        anyDeliverableAccepted,
        failureReasons
      };
    });

    const totalRecipients = recipientOutcomes.length;
    const fullySuccessfulRecipients = recipientOutcomes.filter(r => r.allDeliverablesAccepted);
    const partiallySuccessfulRecipients = recipientOutcomes.filter(r => !r.allDeliverablesAccepted && r.anyDeliverableAccepted);
    const completelyFailedRecipients = recipientOutcomes.filter(r => !r.anyDeliverableAccepted);

    // Scenario A: Total Failure â€” All attempted message types failed across all recipients
    if (fullySuccessfulRecipients.length === 0 && partiallySuccessfulRecipients.length === 0) {
      const failureSummary = recipientOutcomes
        .map(r => `${r.phone} (${r.failureReasons.join('; ') || 'Provider rejected request'})`)
        .join(' | ');

      return {
        success: false,
        error: `WhatsApp salary dispatch failed. Provider rejected all attempted deliverables: ${failureSummary}`,
        pdfUrl,
        xlsxUrl,
        monthName,
        year: targetYear,
        totalEmployees: reportsData.length,
        dispatchResults,
        recipientOutcomes
      };
    }

    // Scenario B: Success or Partial Acceptance â€” At least some deliverables were accepted by Meta Cloud
    // Update settings lastDispatchedAt ONLY when at least one recipient received all required deliverables
    if (fullySuccessfulRecipients.length > 0 && settings && typeof settings.save === 'function') {
      if (settings.autoSalaryWhatsappConfig) {
        settings.autoSalaryWhatsappConfig.lastDispatchedAt = new Date();
      }
      await settings.save();
    }

    const isAllFullyAccepted = fullySuccessfulRecipients.length === totalRecipients;
    const partialSummary = isAllFullyAccepted
      ? `Salary reports successfully accepted for dispatch to ${totalRecipients} phone number${totalRecipients > 1 ? 's' : ''}`
      : `âš ï¸ Partial dispatch: ${fullySuccessfulRecipients.length} of ${totalRecipients} recipients accepted all deliverables` +
        (partiallySuccessfulRecipients.length > 0 ? `, ${partiallySuccessfulRecipients.length} partially accepted` : '') +
        (completelyFailedRecipients.length > 0 ? `, ${completelyFailedRecipients.length} failed` : '');

    return {
      success: true,
      partial: !isAllFullyAccepted,
      message: partialSummary,
      pdfUrl,
      xlsxUrl,
      monthName,
      year: targetYear,
      totalEmployees: reportsData.length,
      dispatchResults,
      recipientOutcomes
    };

  } catch (error) {
    console.error('[Auto WhatsApp Salary Dispatch Error]:', error);
    return {
      success: false,
      error: error.message || 'Failed to dispatch salary report via WhatsApp'
    };
  }
};

module.exports = {
  executeSalaryWhatsappDispatch,
  generateAllEmployeesPdfBuffer,
  generateBankStatementXlsxBuffer,
  isWorkerCurrentlyActive,
  filterActiveWorkers,
  sanitizeErrorMessage,
  maskPhoneNumber
};
