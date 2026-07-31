import React, { useState, useRef, useEffect, useContext } from 'react';
import appContext from '../../context/AppContext';
import { FaUpload, FaDownload, FaPen, FaPlus, FaCopy, FaTrash, FaChevronLeft, FaChevronRight } from 'react-icons/fa';
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';
import axios from 'axios';
import CertificateHistory from './CertificateHistory';
import Modal from '../common/Modal';

// Styled fonts and global styles
const styleTag = document.createElement("style");
styleTag.innerHTML = `
  @import url('https://fonts.googleapis.com/css2?family=Montserrat:wght@300;400;500;600;700;800&display=swap');
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');
  
  .payslip-container {
    --theme-green: #4a9d2d; 
    --text-dark: #1f2937;
    --border-color: #e5e7eb;
    font-family: 'Inter', sans-serif;
    color: var(--text-dark);
  }

  .editable-area:hover {
    background: rgba(74, 157, 45, 0.1); 
    border-radius: 2px;
    cursor: text;
    outline: 1px dashed var(--theme-green);
  }

  .editable-area:focus {
    background: rgba(74, 157, 45, 0.05);
    outline: 2px solid var(--theme-green);
  }
  
  /* A4 Paper Styles */
  .a4-size {
    width: 210mm;
    min-height: 297mm;
    background: white;
    margin: 0 auto;
    box-shadow: 0 10px 25px rgba(0,0,0,0.1);
    position: relative;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  .page-content {
    padding: 30px 40px; 
    flex-grow: 1;
    position: relative;
    z-index: 10;
  }

  .payslip-table {
    width: 100%;
    border-collapse: collapse;
    margin-top: 20px;
  }

  .payslip-table th, .payslip-table td {
    border: 1.5px solid #000;
    padding: 10px;
    text-align: left;
  }

  .payslip-table th {
    background-color: #f9fafb;
    font-weight: 800;
    text-transform: uppercase;
    font-size: 14px;
  }

  .summary-table {
    width: 40%;
    margin-left: auto;
    border-collapse: collapse;
    margin-top: 20px;
  }

  .summary-table td {
    border: 1.5px solid #000;
    padding: 8px 12px;
  }

  .summary-table .label-cell {
    font-weight: 700;
    background-color: #f9fafb;
  }

  .summary-table .value-cell {
    text-align: right;
    font-weight: 800;
  }

  .watermark-container {
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    width: 400px;
    height: 400px;
    opacity: 0.05;
    z-index: 0;
    pointer-events: none;
    display: flex;
    justify-content: center;
    align-items: center;
  }

  .watermark-img {
    width: 100%;
    height: auto;
  }

  .action-bar-container {
    backdrop-filter: blur(10px);
    background: rgba(255, 255, 255, 0.9);
  }

  .page-indicator {
    position: absolute;
    top: 10px;
    right: 10px;
    font-size: 12px;
    color: #9ca3af;
  }
`;

const MonthlyPayslip = () => {
  useEffect(() => {
    document.head.appendChild(styleTag);
    return () => {
      if (document.head.contains(styleTag)) {
        document.head.removeChild(styleTag);
      }
    };
  }, []);


  const { subdomain } = useContext(appContext);
  const [pages, setPages] = useState([{
    id: Date.now(),
    dateOfJoining: 'DD-MM-YYYY',
    payPeriod: 'Month Year',
    workedDays: '00',
    employeeName: 'EMPLOYEE NAME',
    employeeId: 'EMP0000',
    designation: 'DESIGNATION',
    department: 'DEPARTMENT',
    earnings: [
      { label: 'Basic', value: '0000' },
      { label: 'House Rent Allowance', value: '0000' },
      { label: 'Conveyance Allowances', value: '0000' },
      { label: 'Incentive Pay', value: '0000' }
    ],
    deductions: [
      { label: 'Provident Fund', value: '-' },
      { label: 'Professional Tax', value: '-' },
      { label: 'Loan', value: '-' },
      { label: 'Loss of Pay', value: '000' }
    ],
    totalEarnings: '0000',
    totalDeductions: '000',
    netPay: '0000',
    amountInWords: 'Zero Only'
  }]);

  const [currentPageIndex, setCurrentPageIndex] = useState(0);
  const [signatures, setSignatures] = useState({ signature: null });
  const [logoSelection, setLogoSelection] = useState('tech');
  const [isGenerating, setIsGenerating] = useState(false);

  // History States
  const [currentDocId, setCurrentDocId] = useState(null);
  const [refreshHistory, setRefreshHistory] = useState(0);
  const [isViewMode, setIsViewMode] = useState(false);
  const [showHistoryModal, setShowHistoryModal] = useState(false);

  const documentRef = useRef();
  const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';

  const numberToWords = (num) => {
    const ones = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine',
      'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen',
      'Seventeen', 'Eighteen', 'Nineteen'];
    const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

    if (num === 0) return 'Zero';

    const convertHundreds = (n) => {
      let str = '';
      if (n > 99) {
        str += ones[Math.floor(n / 100)] + ' Hundred ';
        n %= 100;
      }
      if (n > 19) {
        str += tens[Math.floor(n / 10)] + ' ';
        n %= 10;
      }
      if (n > 0) {
        str += ones[n] + ' ';
      }
      return str;
    };

    if (num >= 10000000) return 'Amount too large';

    let result = '';
    if (num >= 100000) {
      result += convertHundreds(Math.floor(num / 100000)) + 'Lakh ';
      num %= 100000;
    }
    if (num >= 1000) {
      result += convertHundreds(Math.floor(num / 1000)) + 'Thousand ';
      num %= 1000;
    }
    if (num > 0) {
      result += convertHundreds(num);
    }

    return result.trim() + ' Only';
  };

  // calculatePageTotals now takes the already-updated pages array to avoid stale closure issue
  const calculatePageTotals = (updatedPages, pageIdx) => {
    const page = updatedPages[pageIdx];
    const earningsSum = page.earnings.reduce((acc, curr) => acc + (parseFloat(curr.value.replace(/[^0-9.]/g, '')) || 0), 0);
    const deductionsSum = page.deductions.reduce((acc, curr) => acc + (parseFloat(curr.value.replace(/[^0-9.]/g, '')) || 0), 0);
    const net = earningsSum - deductionsSum;
    const result = [...updatedPages];
    result[pageIdx] = {
      ...page,
      totalEarnings: earningsSum.toString(),
      totalDeductions: deductionsSum.toString(),
      netPay: net.toString(),
      amountInWords: numberToWords(Math.round(net))
    };
    return result;
  };

  const handleEdit = (pageIdx, field, value) => {
    if (isViewMode) return;
    const updatedPages = pages.map((p, i) =>
      i === pageIdx ? { ...p, [field]: value } : p
    );
    setPages(updatedPages);
  };

  const handleTableEdit = (pageIdx, tableType, rowIdx, field, value) => {
    if (isViewMode) return;
    // Immutable update — never mutate nested arrays directly
    const updatedPages = pages.map((page, idx) => {
      if (idx !== pageIdx) return page;
      return {
        ...page,
        [tableType]: page[tableType].map((row, rIdx) =>
          rIdx === rowIdx ? { ...row, [field]: value } : { ...row }
        )
      };
    });
    // Calculate totals inline using the already-updated pages (avoids stale state)
    const finalPages = calculatePageTotals(updatedPages, pageIdx);
    setPages(finalPages);
  };

  const addNewPage = () => {
    if (isViewMode) return;
    const currentPage = pages[currentPageIndex] || pages[0];
    const newPage = {
      id: Date.now(),
      dateOfJoining: currentPage.dateOfJoining,
      payPeriod: 'Next Month 2026',
      workedDays: '00',
      employeeName: currentPage.employeeName,
      employeeId: currentPage.employeeId,
      designation: currentPage.designation,
      department: currentPage.department,
      earnings: [
        { label: 'Basic', value: '0000' },
        { label: 'House Rent Allowance', value: '0000' },
        { label: 'Conveyance Allowances', value: '0000' },
        { label: 'Incentive Pay', value: '0000' }
      ],
      deductions: [
        { label: 'Provident Fund', value: '-' },
        { label: 'Professional Tax', value: '-' },
        { label: 'Loan', value: '-' },
        { label: 'Loss of Pay', value: '000' }
      ],
      totalEarnings: '0000',
      totalDeductions: '000',
      netPay: '0000',
      amountInWords: 'Zero Only'
    };
    setPages([...pages, newPage]);
    setCurrentPageIndex(pages.length);
  };

  const duplicateCurrentPage = () => {
    if (isViewMode) return;
    const currentPage = pages[currentPageIndex] || pages[0];
    // Deep-copy earnings and deductions so the duplicate page has its own independent arrays
    const duplicatedPage = {
      ...currentPage,
      id: Date.now(),
      earnings: currentPage.earnings.map(e => ({ ...e })),
      deductions: currentPage.deductions.map(d => ({ ...d }))
    };
    setPages([...pages, duplicatedPage]);
    setCurrentPageIndex(pages.length);
  };

  const removePage = (idx) => {
    if (isViewMode || pages.length <= 1) return;
    const updatedPages = pages.filter((_, i) => i !== idx);
    setPages(updatedPages);
    if (currentPageIndex >= updatedPages.length) {
      setCurrentPageIndex(updatedPages.length - 1);
    }
  };

  const handleSignatureUpload = (e) => {
    if (isViewMode) return;
    const file = e.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        setSignatures({ signature: event.target.result });
      };
      reader.readAsDataURL(file);
    }
  };

  const saveDocument = async () => {
    try {
      const name = `${pages[0].employeeName} - Payslip - ${pages[0].payPeriod}`;
      const payload = {
        name: name,
        type: 'Payslip',
        content: {
          pages,
          signatures,
          logoSelection
        },
        subdomain: subdomain
      };

      const token = localStorage.getItem('token');
      const config = { headers: { Authorization: `Bearer ${token}` } };

      if (currentDocId) {
        await axios.put(`${API_URL}/certificates/${currentDocId}`, payload, config);
      } else {
        const res = await axios.post(`${API_URL}/certificates`, payload, config);
        setCurrentDocId(res.data._id);
      }
      setRefreshHistory(prev => prev + 1);
    } catch (error) {
      console.error('Error saving document:', error);
      alert('Failed to save document. Please try again.');
    }
  };

  const downloadPDF = async () => {
    if (!isViewMode) {
      await saveDocument();
    }

    setIsGenerating(true);

    const pdf = new jsPDF('p', 'mm', 'a4');
    const pdfWidth = 210;
    const pdfHeight = 297;

    for (let i = 0; i < pages.length; i++) {
      // Render each page into a temporary off-screen container
      const tempContainer = document.createElement('div');
      tempContainer.style.position = 'fixed';
      tempContainer.style.top = '-9999px';
      tempContainer.style.left = '-9999px';
      tempContainer.style.width = '793px'; // A4 width at 96dpi
      tempContainer.style.height = '1122px';
      tempContainer.style.zIndex = '-1';
      tempContainer.style.background = 'white';
      document.body.appendChild(tempContainer);

      // Dynamically build the page HTML
      const page = pages[i];
      const logoSrc = logoSelection === 'tech' ? '/Invoicelogo.png' : '/vaseveda.png';

      tempContainer.innerHTML = `
        <div style="width:793px;min-height:1122px;background:white;position:relative;display:flex;flex-direction:column;font-family:Inter,sans-serif;color:#1f2937;padding:30px 40px;box-sizing:border-box;">
          <div style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);width:400px;height:400px;opacity:0.05;pointer-events:none;">
            <img src="${logoSrc}" style="width:100%;height:auto;" />
          </div>
          <div style="position:absolute;top:10px;right:10px;font-size:12px;color:#9ca3af;">Page ${i + 1}</div>
          <div style="display:flex;flex-direction:column;align-items:center;margin-bottom:32px;">
            <img src="${logoSrc}" style="height:64px;object-fit:contain;margin-bottom:8px;" />
            <div style="color:#4a9d2d;font-weight:700;font-size:24px;letter-spacing:0.15em;border-bottom:2px solid #1f2937;padding-bottom:4px;padding-left:16px;padding-right:16px;">MONTHLY PAYSLIP</div>
          </div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px 0;font-size:14px;margin-bottom:32px;padding:0 8px;">
            <div style="display:flex;gap:8px;"><span style="font-weight:700;min-width:120px;">Date of Joining</span><span>:</span><span style="padding-left:4px;">${page.dateOfJoining}</span></div>
            <div style="display:flex;gap:8px;"><span style="font-weight:700;min-width:120px;">Employee Name</span><span>:</span><span style="padding-left:4px;font-weight:700;">${page.employeeName}</span></div>
            <div style="display:flex;gap:8px;"><span style="font-weight:700;min-width:120px;">Pay Period</span><span>:</span><span style="padding-left:4px;">${page.payPeriod}</span></div>
            <div style="display:flex;gap:8px;"><span style="font-weight:700;min-width:120px;">Employee ID</span><span>:</span><span style="padding-left:4px;">${page.employeeId}</span></div>
            <div style="display:flex;gap:8px;"><span style="font-weight:700;min-width:120px;">Worked Days</span><span>:</span><span style="padding-left:4px;">${page.workedDays}</span></div>
            <div style="display:flex;gap:8px;"><span style="font-weight:700;min-width:120px;">Designation</span><span>:</span><span style="padding-left:4px;">${page.designation}</span></div>
            <div></div>
            <div style="display:flex;gap:8px;"><span style="font-weight:700;min-width:120px;">Department</span><span>:</span><span style="padding-left:4px;">${page.department}</span></div>
          </div>
          <table style="width:100%;border-collapse:collapse;margin-top:20px;">
            <thead>
              <tr>
                <th style="border:1.5px solid #000;padding:10px;text-align:left;background:#f9fafb;font-weight:800;text-transform:uppercase;font-size:14px;width:25%;">EARNINGS</th>
                <th style="border:1.5px solid #000;padding:10px;text-align:center;background:#f9fafb;font-weight:800;text-transform:uppercase;font-size:14px;width:15%;">AMOUNT</th>
                <th style="border:1.5px solid #000;padding:10px;text-align:left;background:#f9fafb;font-weight:800;text-transform:uppercase;font-size:14px;width:25%;">DEDUCTIONS</th>
                <th style="border:1.5px solid #000;padding:10px;text-align:center;background:#f9fafb;font-weight:800;text-transform:uppercase;font-size:14px;width:15%;">AMOUNT</th>
              </tr>
            </thead>
            <tbody>
              ${[0,1,2,3].map(rowIdx => `
              <tr>
                <td style="border:1.5px solid #000;padding:10px;font-weight:700;">${page.earnings[rowIdx]?.label || ''}</td>
                <td style="border:1.5px solid #000;padding:10px;text-align:center;font-weight:700;">${page.earnings[rowIdx]?.value || ''}</td>
                <td style="border:1.5px solid #000;padding:10px;font-weight:700;">${page.deductions[rowIdx]?.label || ''}</td>
                <td style="border:1.5px solid #000;padding:10px;text-align:center;font-weight:700;">${page.deductions[rowIdx]?.value || ''}</td>
              </tr>`).join('')}
            </tbody>
          </table>
          <table style="width:40%;margin-left:auto;border-collapse:collapse;margin-top:20px;">
            <tbody>
              <tr><td style="border:1.5px solid #000;padding:8px 12px;font-weight:700;background:#f9fafb;">Total Earnings</td><td style="border:1.5px solid #000;padding:8px 12px;text-align:right;font-weight:800;">${page.totalEarnings}</td></tr>
              <tr><td style="border:1.5px solid #000;padding:8px 12px;font-weight:700;background:#f9fafb;">Total Deductions</td><td style="border:1.5px solid #000;padding:8px 12px;text-align:right;font-weight:800;">${page.totalDeductions}</td></tr>
            </tbody>
          </table>
          <div style="display:flex;flex-direction:column;align-items:flex-end;margin-top:16px;padding:0 8px;">
            <div style="display:flex;gap:48px;align-items:baseline;"><span style="font-weight:700;font-size:18px;">Net Pay</span><span style="font-weight:800;font-size:20px;font-family:monospace;">&#8377;${page.netPay}</span></div>
            <div style="font-size:12px;font-style:italic;margin-top:4px;font-weight:700;color:#4b5563;">Amount In Words : <span style="color:#1f2937;">${page.amountInWords}</span></div>
          </div>
          <div style="margin-top:auto;padding-top:80px;display:flex;justify-content:space-between;padding-left:40px;padding-right:40px;padding-bottom:40px;">
            <div style="display:flex;flex-direction:column;align-items:center;">
              ${signatures.signature ? `<img src="${signatures.signature}" style="max-height:80px;max-width:200px;object-fit:contain;margin-bottom:4px;" />` : '<div style="height:80px;"></div>'}
              <div style="border-top:2px solid #1f2937;width:192px;text-align:center;padding-top:8px;font-weight:800;font-size:14px;">Employer Signature</div>
            </div>
            <div style="display:flex;flex-direction:column;align-items:center;justify-content:flex-end;">
              <div style="border-top:2px solid #1f2937;width:192px;text-align:center;padding-top:8px;font-weight:800;font-size:14px;">Employee Signature</div>
            </div>
          </div>
        </div>
      `;

      // Wait for images to load
      await Promise.all(
        Array.from(tempContainer.querySelectorAll('img')).map(
          img => new Promise(resolve => {
            if (img.complete) resolve();
            else { img.onload = resolve; img.onerror = resolve; }
          })
        )
      );

      const canvas = await html2canvas(tempContainer, {
        scale: 2,
        useCORS: true,
        logging: false,
        width: 793,
        height: 1122
      });

      document.body.removeChild(tempContainer);

      const imgData = canvas.toDataURL('image/png');
      if (i > 0) pdf.addPage();
      pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfHeight);
    }

    pdf.save(`Monthly_Payslip_${pages[0].employeeName}.pdf`);
    setIsGenerating(false);
  };

  const handleHistoryView = (doc) => {
    setPages(doc.content.pages);
    setSignatures(doc.content.signatures);
    setLogoSelection(doc.content.logoSelection);
    setIsViewMode(true);
    setCurrentDocId(doc._id);
    setShowHistoryModal(false);
    setCurrentPageIndex(0);
  };

  const handleHistoryEdit = (doc) => {
    setPages(doc.content.pages);
    setSignatures(doc.content.signatures);
    setLogoSelection(doc.content.logoSelection);
    setIsViewMode(false);
    setCurrentDocId(doc._id);
    setShowHistoryModal(false);
    setCurrentPageIndex(0);
  };

  const handleNew = () => {
    setPages([{
      id: Date.now(),
      dateOfJoining: 'DD-MM-YYYY',
      payPeriod: 'Month Year',
      workedDays: '00',
      employeeName: 'EMPLOYEE NAME',
      employeeId: 'EMP0000',
      designation: 'DESIGNATION',
      department: 'DEPARTMENT',
      earnings: [
        { label: 'Basic', value: '0000' },
        { label: 'House Rent Allowance', value: '0000' },
        { label: 'Conveyance Allowances', value: '0000' },
        { label: 'Incentive Pay', value: '0000' }
      ],
      deductions: [
        { label: 'Provident Fund', value: '-' },
        { label: 'Professional Tax', value: '-' },
        { label: 'Loan', value: '-' },
        { label: 'Loss of Pay', value: '000' }
      ],
      totalEarnings: '0000',
      totalDeductions: '000',
      netPay: '0000',
      amountInWords: 'Zero Only'
    }]);
    setSignatures({ signature: null });
    setLogoSelection('tech');
    setCurrentDocId(null);
    setIsViewMode(false);
    setCurrentPageIndex(0);
  };

  const currentPage = pages[currentPageIndex] || pages[0];

  return (
    <div className="min-h-screen bg-gray-100 py-8 flex flex-col items-center font-sans">
      
      {/* Action Bar / Controls - Moved from fixed to relative to avoid header overlap */}
      <div className="w-full max-w-[210mm] mb-6 flex flex-col md:flex-row gap-2 items-center justify-end px-4">
        {currentDocId && (
          <div className={`px-4 py-2 rounded shadow font-bold text-white text-xs ${isViewMode ? 'bg-blue-600' : 'bg-yellow-600'}`}>
            {isViewMode ? 'VIEW MODE' : 'EDIT MODE'}
          </div>
        )}
        <div className="flex gap-2">
          <button
            onClick={() => setShowHistoryModal(true)}
            className="bg-blue-800 text-white px-4 py-2 rounded shadow hover:bg-blue-900 transition flex items-center gap-2 text-sm"
          >
            <FaUpload size={14} /> History
          </button>
          <button
            onClick={handleNew}
            className="bg-gray-800 text-white px-4 py-2 rounded shadow hover:bg-black transition text-sm"
          >
            New Payslip
          </button>
        </div>
      </div>


      {/* Helper Text */}
      <div className="flex items-center gap-2 mb-4 text-gray-500 bg-white px-4 py-2 rounded-full shadow-sm text-sm">
        <FaPen className="text-[#4a9d2d] w-3 h-3" />
        <span>Tip: Click directly on any text inside the payslip to edit it.</span>
      </div>

      {/* Page Navigation */}
      <div className="flex items-center gap-4 mb-6">
        <button 
          disabled={currentPageIndex === 0}
          onClick={() => setCurrentPageIndex(prev => prev - 1)}
          className="p-2 bg-white rounded-full shadow hover:bg-gray-50 disabled:opacity-30"
        >
          <FaChevronLeft />
        </button>
        <span className="font-bold text-gray-700">Month {currentPageIndex + 1} of {pages.length}</span>
        <button 
          disabled={currentPageIndex === pages.length - 1}
          onClick={() => setCurrentPageIndex(prev => prev + 1)}
          className="p-2 bg-white rounded-full shadow hover:bg-gray-50 disabled:opacity-30"
        >
          <FaChevronRight />
        </button>
        {!isViewMode && (
          <div className="flex gap-2 ml-4">
             <button onClick={duplicateCurrentPage} title="Duplicate Current Page" className="p-2 bg-green-100 text-green-700 rounded-lg hover:bg-green-200 transition flex items-center gap-2 text-xs font-bold">
              <FaCopy /> Duplicate
            </button>
            <button onClick={addNewPage} title="Add New Month" className="p-2 bg-blue-100 text-blue-700 rounded-lg hover:bg-blue-200 transition flex items-center gap-2 text-xs font-bold">
              <FaPlus /> Add Month
            </button>
            {pages.length > 1 && (
              <button onClick={() => removePage(currentPageIndex)} className="p-2 bg-red-100 text-red-700 rounded-lg hover:bg-red-200 transition flex items-center gap-2 text-xs font-bold">
                <FaTrash /> Remove
              </button>
            )}
          </div>
        )}
      </div>

      {/* --- A4 DOCUMENT --- */}
      <div className="w-full overflow-hidden flex justify-center md:block md:w-auto md:overflow-visible my-4 md:my-0">
        <div className="transform origin-top scale-[0.45] sm:scale-[0.6] md:scale-100">
          <div ref={documentRef} className={`payslip-container a4-size ${isViewMode ? 'pointer-events-none' : ''}`}>
            
            {/* Background Watermark */}
            <div className="watermark-container">
              <img src={logoSelection === 'tech' ? "/Invoicelogo.png" : "/vaseveda.png"} alt="Watermark" className="watermark-img" />
            </div>

            <div className="page-content flex flex-col h-full relative">
              <div className="page-indicator">Page {currentPageIndex + 1}</div>

              {/* 1. Header Section */}
              <div className="flex flex-col items-center mb-8">
                <img src={logoSelection === 'tech' ? "/Invoicelogo.png" : "/vaseveda.png"} alt="Logo" className="h-16 object-contain mb-2" />
                <div className="text-[#4a9d2d] font-bold text-2xl tracking-widest border-b-2 border-gray-800 pb-1 px-4">
                  MONTHLY PAYSLIP
                </div>
              </div>

              {/* 2. Employee Details Grid - key forces full remount on page switch so contentEditable shows correct data */}
              <div key={`details-${currentPageIndex}`} className="grid grid-cols-2 gap-y-3 text-sm mb-8 px-2">
                <div className="flex items-center gap-2">
                  <span className="font-bold min-w-[120px]">Date of Joining</span>
                  <span>:</span>
                  <div contentEditable={!isViewMode} onBlur={(e) => handleEdit(currentPageIndex, 'dateOfJoining', e.target.innerText)} className="editable-area px-1 outline-none min-w-[100px]" suppressContentEditableWarning dangerouslySetInnerHTML={{ __html: currentPage.dateOfJoining }} />
                </div>
                <div className="flex items-center gap-2">
                  <span className="font-bold min-w-[120px]">Employee Name</span>
                  <span>:</span>
                  <div contentEditable={!isViewMode} onBlur={(e) => handleEdit(currentPageIndex, 'employeeName', e.target.innerText)} className="editable-area px-1 font-bold outline-none flex-1" suppressContentEditableWarning dangerouslySetInnerHTML={{ __html: currentPage.employeeName }} />
                </div>
                <div className="flex items-center gap-2">
                  <span className="font-bold min-w-[120px]">Pay Period</span>
                  <span>:</span>
                  <div contentEditable={!isViewMode} onBlur={(e) => handleEdit(currentPageIndex, 'payPeriod', e.target.innerText)} className="editable-area px-1 outline-none min-w-[100px]" suppressContentEditableWarning dangerouslySetInnerHTML={{ __html: currentPage.payPeriod }} />
                </div>
                <div className="flex items-center gap-2">
                  <span className="font-bold min-w-[120px]">Employee ID</span>
                  <span>:</span>
                  <div contentEditable={!isViewMode} onBlur={(e) => handleEdit(currentPageIndex, 'employeeId', e.target.innerText)} className="editable-area px-1 outline-none min-w-[100px]" suppressContentEditableWarning dangerouslySetInnerHTML={{ __html: currentPage.employeeId }} />
                </div>
                <div className="flex items-center gap-2">
                  <span className="font-bold min-w-[120px]">Worked Days</span>
                  <span>:</span>
                  <div contentEditable={!isViewMode} onBlur={(e) => handleEdit(currentPageIndex, 'workedDays', e.target.innerText)} className="editable-area px-1 outline-none min-w-[100px]" suppressContentEditableWarning dangerouslySetInnerHTML={{ __html: currentPage.workedDays }} />
                </div>
                <div className="flex items-center gap-2">
                  <span className="font-bold min-w-[120px]">Designation</span>
                  <span>:</span>
                  <div contentEditable={!isViewMode} onBlur={(e) => handleEdit(currentPageIndex, 'designation', e.target.innerText)} className="editable-area px-1 outline-none min-w-[100px]" suppressContentEditableWarning dangerouslySetInnerHTML={{ __html: currentPage.designation }} />
                </div>
                <div className="flex items-center gap-2">
                  {/* Empty for spacing */}
                </div>
                <div className="flex items-center gap-2">
                  <span className="font-bold min-w-[120px]">Department</span>
                  <span>:</span>
                  <div contentEditable={!isViewMode} onBlur={(e) => handleEdit(currentPageIndex, 'department', e.target.innerText)} className="editable-area px-1 outline-none min-w-[100px]" suppressContentEditableWarning dangerouslySetInnerHTML={{ __html: currentPage.department }} />
                </div>
              </div>

              {/* 3. Earnings and Deductions Table - tbody key forces full remount on page switch */}
              <table className="payslip-table">
                <thead>
                  <tr>
                    <th className="w-1/4">EARNINGS</th>
                    <th className="w-[15%] text-center">AMOUNT</th>
                    <th className="w-1/4">DEDUCTIONS</th>
                    <th className="w-[15%] text-center">AMOUNT</th>
                  </tr>
                </thead>
                <tbody key={currentPageIndex}>
                  {[0, 1, 2, 3].map(rowIdx => (
                    <tr key={rowIdx}>
                      <td>
                        <div
                          contentEditable={!isViewMode}
                          onBlur={(e) => handleTableEdit(currentPageIndex, 'earnings', rowIdx, 'label', e.target.innerText)}
                          className="editable-area outline-none font-bold"
                          suppressContentEditableWarning
                          dangerouslySetInnerHTML={{ __html: currentPage.earnings[rowIdx]?.label || '' }}
                        />
                      </td>
                      <td className="text-center font-bold">
                        <div
                          contentEditable={!isViewMode}
                          onBlur={(e) => handleTableEdit(currentPageIndex, 'earnings', rowIdx, 'value', e.target.innerText)}
                          className="editable-area outline-none"
                          suppressContentEditableWarning
                          dangerouslySetInnerHTML={{ __html: currentPage.earnings[rowIdx]?.value || '' }}
                        />
                      </td>
                      <td>
                        <div
                          contentEditable={!isViewMode}
                          onBlur={(e) => handleTableEdit(currentPageIndex, 'deductions', rowIdx, 'label', e.target.innerText)}
                          className="editable-area outline-none font-bold"
                          suppressContentEditableWarning
                          dangerouslySetInnerHTML={{ __html: currentPage.deductions[rowIdx]?.label || '' }}
                        />
                      </td>
                      <td className="text-center font-bold">
                        <div
                          contentEditable={!isViewMode}
                          onBlur={(e) => handleTableEdit(currentPageIndex, 'deductions', rowIdx, 'value', e.target.innerText)}
                          className="editable-area outline-none"
                          suppressContentEditableWarning
                          dangerouslySetInnerHTML={{ __html: currentPage.deductions[rowIdx]?.value || '' }}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {/* 4. Totals and Net Pay */}
              <table className="summary-table">
                <tbody>
                  <tr>
                    <td className="label-cell">Total Earnings</td>
                    <td className="value-cell">{currentPage.totalEarnings}</td>
                  </tr>
                  <tr>
                    <td className="label-cell">Total Deductions</td>
                    <td className="value-cell">{currentPage.totalDeductions}</td>
                  </tr>
                </tbody>
              </table>

              <div className="flex flex-col items-end mt-4 px-2">
                <div className="flex gap-12 items-baseline">
                  <span className="font-bold text-lg">Net Pay</span>
                  <span className="font-extrabold text-xl font-mono">₹{currentPage.netPay}</span>
                </div>
                <div className="text-[12px] italic mt-1 font-bold text-gray-600">
                  Amount In Words : <span className="text-gray-800">{currentPage.amountInWords}</span>
                </div>
              </div>

              {/* 5. Signature Section */}
              <div className="mt-auto pt-20 flex justify-between px-10 mb-10">
                <div className="flex flex-col items-center">
                  <div className="h-20 flex items-center justify-center">
                     {signatures.signature && <img src={signatures.signature} className="max-h-full max-w-[200px] object-contain" />}
                  </div>
                  <div className="border-t-2 border-gray-800 w-48 text-center pt-2 font-extrabold text-sm">
                    Employer Signature
                  </div>
                </div>
                <div className="flex flex-col items-center justify-end pb-0">
                  <div className="border-t-2 border-gray-800 w-48 text-center pt-2 font-extrabold text-sm">
                    Employee Signature
                  </div>
                </div>
              </div>

            </div>
          </div>
        </div>
      </div>

      {/* --- BOTTOM ACTION BAR --- */}
      <div className="w-full max-w-[90%] md:max-w-[210mm] mt-8 mb-12 action-bar-container bg-white border border-gray-200 rounded-xl shadow-lg p-5 flex flex-col md:flex-row items-center justify-between gap-6 transition-all">
        
        {/* Header Options */}
        <div className={`flex flex-col gap-2 w-full md:w-auto ${isViewMode ? 'opacity-50 pointer-events-none' : ''}`}>
          <span className="text-gray-500 font-bold text-[10px] tracking-widest">SELECT HEADER:</span>
          <div className="flex gap-4">
            <label className={`cursor-pointer flex items-center gap-2 px-3 py-2 rounded-lg border transition-all ${logoSelection === 'tech' ? 'border-[#4a9d2d] bg-green-50' : 'border-gray-200 hover:bg-gray-50'}`}>
              <input type="radio" checked={logoSelection === 'tech'} onChange={() => setLogoSelection('tech')} className="hidden" />
              <div className={`w-3 h-3 rounded-full border flex items-center justify-center ${logoSelection === 'tech' ? 'border-[#4a9d2d]' : 'border-gray-400'}`}>
                {logoSelection === 'tech' && <div className="w-1.5 h-1.5 rounded-full bg-[#4a9d2d]"></div>}
              </div>
              <span className={`text-sm font-semibold ${logoSelection === 'tech' ? 'text-[#4a9d2d]' : 'text-gray-600'}`}>Tech Vaseegrah</span>
            </label>
            <label className={`cursor-pointer flex items-center gap-2 px-3 py-2 rounded-lg border transition-all ${logoSelection === 'veda' ? 'border-[#4a9d2d] bg-green-50' : 'border-gray-200 hover:bg-gray-50'}`}>
              <input type="radio" checked={logoSelection === 'veda'} onChange={() => setLogoSelection('veda')} className="hidden" />
              <div className={`w-3 h-3 rounded-full border flex items-center justify-center ${logoSelection === 'veda' ? 'border-[#4a9d2d]' : 'border-gray-400'}`}>
                {logoSelection === 'veda' && <div className="w-1.5 h-1.5 rounded-full bg-[#4a9d2d]"></div>}
              </div>
              <span className={`text-sm font-semibold ${logoSelection === 'veda' ? 'text-[#4a9d2d]' : 'text-gray-600'}`}>Vaseegrah Veda</span>
            </label>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-3 w-full md:w-auto justify-end">
          <label className={`cursor-pointer group flex items-center gap-2 px-5 py-2.5 bg-white border border-gray-300 rounded-lg hover:border-[#4a9d2d] hover:shadow-md transition-all ${isViewMode ? 'opacity-50 pointer-events-none' : ''}`}>
            <FaUpload className="text-gray-500 group-hover:text-[#4a9d2d] transition-colors" />
            <span className="text-sm font-bold text-gray-700 group-hover:text-[#4a9d2d]">SIGNATURE</span>
            <input type="file" className="hidden" onChange={handleSignatureUpload} accept="image/*" />
          </label>

          <button
            onClick={downloadPDF}
            disabled={isGenerating}
            className="flex items-center gap-2 px-6 py-2.5 bg-[#4a9d2d] text-white rounded-lg shadow-md hover:bg-[#3d8524] hover:shadow-lg active:scale-95 transition-all disabled:opacity-70 disabled:active:scale-100"
          >
            {isGenerating ? (
              <span className="text-sm font-bold animate-pulse">GENERATING...</span>
            ) : (
              <>
                <FaDownload />
                <span className="text-sm font-bold">{isViewMode ? 'DOWNLOAD' : 'SAVE & DOWNLOAD'}</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* History Modal */}
      <Modal
        isOpen={showHistoryModal}
        title="Payslip History"
        onClose={() => setShowHistoryModal(false)}
        size="xl"
      >
        <div className="w-full">
          <CertificateHistory
            type="Payslip"
            onView={handleHistoryView}
            onEdit={handleHistoryEdit}
            onDelete={() => handleNew()}
            onDownload={(doc) => {
              handleHistoryView(doc);
              setTimeout(() => downloadPDF(), 500);
            }}
            refreshTrigger={refreshHistory}
          />
        </div>
      </Modal>

    </div>
  );
};

export default MonthlyPayslip;
