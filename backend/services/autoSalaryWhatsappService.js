const path = require('path');
const fs = require('fs');
const { jsPDF } = require('jspdf');
require('jspdf-autotable');
const ExcelJS = require('exceljs');
const Settings = require('../models/Settings');
const Worker = require('../models/Worker');
const Attendance = require('../models/Attendance');
const Leave = require('../models/Leave');
const Holiday = require('../models/Holiday');
const SalaryProject = require('../models/SalaryProject');
const Ticket = require('../models/ticketModel');
const { calculateWorkerProductivity, calculateUnauthorizedAbsencePenalty } = require('../utils/productivityCalculator');
const { sendWhatsApp } = require('./whatsappService');

/**
 * Helper to generate Single PDF for all employees on backend
 */
const generateAllEmployeesPdfBuffer = async (reportsData, monthName, year) => {
  const doc = new jsPDF('portrait', 'mm', 'a4');
  const formatCurr = (val) => {
    if (typeof val === 'string') {
      const num = parseFloat(val.replace(/[₹Rs,\s]/g, ''));
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
    const netPayout = reportObj.finalSalaryWithFines ?? item.totalFinalSalary ?? summary.finalSalary ?? 0;

    const pageWidth = doc.internal.pageSize.getWidth();

    // Header banner
    doc.setFillColor(24, 43, 73);
    doc.rect(0, 0, pageWidth, 15, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(10.5);
    doc.setFont('helvetica', 'bold');
    doc.text(`${empIndex + 1}. SALARY & ATTENDANCE SLIP — ${name}`, 10, 10.5);

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

    const summaryGridBody = [
      ['Employee Name', name, 'Total Days in Month', String(summary.totalDaysInPeriod || 30)],
      ['Employee ID', rfid, 'Working Days', String(workingDaysCount)],
      ['Department', deptName, 'Present Days', String(actualWorked)],
      ['Gross Base Salary', formatCurr(grossSalary), 'Absent / Leave Days', `${summary.totalAbsentDays || 0} Abs / ${summary.totalLeaveDays || 0} Lve`],
      ['Per Day Salary Rate', formatCurr(perDaySalary), 'Holidays & Sundays', `${summary.totalHolidaysInPeriod || 0} Hol / ${summary.totalSundaysInPeriod || 0} Sun`],
      ['Earned Attendance Salary', formatCurr(earnedAttendanceSalary), 'Total Working Hours', `${Number(reportObj.report?.totalWorkingHours || summary.totalWorkingHours || 0).toFixed(2)} hrs`],
      ['PF / ESI Deductions', 'Rs. 0.00', 'Permission Time Used', `${reportObj.report?.totalPermissionTime || summary.totalPermissionTime || 0} mins`],
      ['Advance Loan Deduction', 'Rs. 0.00', 'Advance Pending', 'Rs. 0.00'],
      [
        { content: 'NET PAYOUT AMOUNT', styles: { fontStyle: 'bold', textColor: [217, 119, 6] } },
        { content: formatCurr(netPayout), styles: { fontStyle: 'bold', textColor: [217, 119, 6] } },
        'Attendance Rate',
        `${Number(summary.attendanceRate || 0).toFixed(1)}%`
      ]
    ];

    doc.autoTable({
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

    const summaryEndY = doc.lastAutoTable.finalY || 68;

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
        String(row.deductionAmount || 'Rs. 0.00').replace('₹', 'Rs. '),
        String(row.totalSalary || 'Rs. 0.00').replace('₹', 'Rs. ')
      ];
    });

    doc.autoTable({
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
 * Helper to generate Bank Statement XLSX Buffer on backend
 */
const generateBankStatementXlsxBuffer = async (reportsData, monthName, year) => {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet(`Bank Statement ${monthName} ${year}`);

  worksheet.columns = [
    { header: 'S.No', key: 'sno', width: 8 },
    { header: 'Employee Name', key: 'name', width: 25 },
    { header: 'Employee ID / RFID', key: 'rfid', width: 18 },
    { header: 'Department', key: 'dept', width: 20 },
    { header: 'Bank Name', key: 'bankName', width: 22 },
    { header: 'Account Number', key: 'accountNumber', width: 22 },
    { header: 'IFSC Code', key: 'ifscCode', width: 15 },
    { header: 'Net Salary Payable (INR)', key: 'netSalary', width: 22 }
  ];

  reportsData.forEach((item, index) => {
    const w = item.worker;
    const b = w.bankDetails || {};
    const netSalary = item.totalFinalSalary || item.fullReport?.finalSalaryWithFines || 0;

    worksheet.addRow({
      sno: index + 1,
      name: w.name || 'N/A',
      rfid: w.rfid || 'N/A',
      dept: item.department || 'N/A',
      bankName: b.bankName || 'N/A',
      accountNumber: b.accountNumber || 'N/A',
      ifscCode: b.ifscCode || 'N/A',
      netSalary: parseFloat(Number(netSalary).toFixed(2))
    });
  });

  // Style header row
  worksheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFF' } };
  worksheet.getRow(1).fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: '182B49' }
  };

  const buffer = await workbook.xlsx.writeBuffer();
  return buffer;
};

/**
 * Core Dispatch Function: Calculates previous month salary data, generates PDF + XLSX, and dispatches via WhatsApp
 */
const executeSalaryWhatsappDispatch = async (subdomain, targetPhoneNumbers = null) => {
  try {
    const settings = await Settings.findOne({ subdomain });
    if (!settings) {
      throw new Error(`Settings not found for tenant: ${subdomain}`);
    }

    const config = settings.autoSalaryWhatsappConfig || {};
    const recipientPhonesStr = targetPhoneNumbers || config.phoneNumbers || '';
    const phoneList = recipientPhonesStr
      .split(',')
      .map(p => p.trim())
      .filter(p => p.length > 0);

    if (phoneList.length === 0) {
      throw new Error('No target WhatsApp phone numbers configured');
    }

    // Determine target month & year (Previous month relative to now)
    const now = new Date();
    let targetMonth = now.getMonth(); // 0-indexed: current month - 1 = previous month
    let targetYear = now.getFullYear();
    if (targetMonth === 0) {
      targetMonth = 12;
      targetYear -= 1;
    }

    const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
    const monthName = MONTH_NAMES[targetMonth - 1];

    const fromDateObj = new Date(targetYear, targetMonth - 1, 1, 0, 0, 0, 0);
    const toDateObj = new Date(targetYear, targetMonth, 0, 23, 59, 59, 999);
    const fromDateStr = fromDateObj.toISOString().split('T')[0];
    const toDateStr = toDateObj.toISOString().split('T')[0];

    // Fetch all active workers
    const workers = await Worker.find({ subdomain, status: { $ne: 'Relieved' } })
      .populate('department')
      .lean();

    if (workers.length === 0) {
      throw new Error('No workers found to calculate salary report');
    }

    // Calculate report data for all workers
    const allAttendanceData = await Attendance.find({
      subdomain,
      date: { $gte: fromDateStr, $lte: toDateStr }
    }).lean();

    const allLeaveData = await Leave.find({ subdomain }).lean();
    const holidays = await Holiday.find({}).lean();
    const batches = settings.batches || [];
    const allSalaryProjects = await SalaryProject.find({
      subdomain,
      $or: [{ startDate: { $lte: toDateObj }, endDate: { $gte: fromDateObj } }]
    }).populate('developers', 'name rfid').lean();

    const allTickets = await Ticket.find({ subdomain, isDeleted: { $ne: true } }).lean();

    const reportsData = [];
    for (const worker of workers) {
      const workerId = worker._id.toString();
      const workerAttendance = allAttendanceData.filter(r => r.worker.toString() === workerId);
      const workerLeaves = allLeaveData.filter(l => l.worker.toString() === workerId);
      const workerProjects = allSalaryProjects.filter(p => p.developers.some(d => d._id.toString() === workerId));

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
          advancedLeaveDeduction: settings.advancedLeaveDeduction || null
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

      const finalSalaryWithBonus = (report.summary.finalSalary || 0) + totalBonusAmount;
      const finalSalaryWithFines = Math.max(0, finalSalaryWithBonus - totalFinesAmount);

      const { totalUnauthorizedPenalty } = calculateUnauthorizedAbsencePenalty(
        worker, fromDateStr, toDateStr, workerLeaves, workerAttendance, holidays, settings
      );

      const totalFinalSalary = Math.max(0, finalSalaryWithFines - totalUnauthorizedPenalty);

      reportsData.push({
        worker,
        workerId,
        name: worker.name,
        rfid: worker.rfid,
        department: worker.department?.name || 'N/A',
        totalFinalSalary,
        fullReport: {
          report,
          totalBonusAmount,
          totalFinesAmount,
          finalSalaryWithFines: totalFinalSalary,
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
    const pdfFilename = `All_Employees_Salary_Report_${monthName}_${targetYear}_${timestamp}.pdf`;
    const xlsxFilename = `Bank_Statement_${monthName}_${targetYear}_${timestamp}.xlsx`;

    const pdfPath = path.join(reportsDir, pdfFilename);
    const xlsxPath = path.join(reportsDir, xlsxFilename);

    fs.writeFileSync(pdfPath, pdfBuffer);
    fs.writeFileSync(xlsxPath, xlsxBuffer);

    // Build public URLs for WhatsApp attachments
    const baseUrl = process.env.BACKEND_URL || process.env.SERVER_URL || 'http://localhost:5002';
    const pdfUrl = `${baseUrl}/uploads/reports/${pdfFilename}`;
    const xlsxUrl = `${baseUrl}/uploads/reports/${xlsxFilename}`;

    const dispatchResults = [];

    for (const phone of phoneList) {
      // 1. Send Text Notification
      const textMsg = `📊 *MONTHLY SALARY REPORT DISPATCH*\n\n` +
        `• *Period:* ${monthName} ${targetYear}\n` +
        `• *Total Employees:* ${reportsData.length}\n` +
        `• *Generated On:* ${new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}\n\n` +
        `Attached below are your **All Employees Single PDF Salary Report** and **Bank Statement XLSX Sheet**.`;

      await sendWhatsApp(subdomain, phone, { type: 'text', text: textMsg });

      // 2. Send PDF Document
      const pdfRes = await sendWhatsApp(subdomain, phone, {
        type: 'document',
        link: pdfUrl,
        filename: pdfFilename,
        caption: `📄 All Employees Salary Report PDF (${monthName} ${targetYear})`
      });

      // 3. Send XLSX Document
      const xlsxRes = await sendWhatsApp(subdomain, phone, {
        type: 'document',
        link: xlsxUrl,
        filename: xlsxFilename,
        caption: `📊 Bank Statement XLSX Sheet (${monthName} ${targetYear})`
      });

      dispatchResults.push({ phone, pdfRes, xlsxRes });
    }

    // Update settings lastDispatchedAt
    settings.autoSalaryWhatsappConfig.lastDispatchedAt = new Date();
    await settings.save();

    return {
      success: true,
      message: `Salary reports successfully dispatched to ${phoneList.length} phone numbers`,
      pdfUrl,
      xlsxUrl,
      monthName,
      year: targetYear,
      totalEmployees: reportsData.length,
      dispatchResults
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
  executeSalaryWhatsappDispatch
};
