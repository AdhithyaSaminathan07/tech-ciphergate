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

  const calculatePageTotals = (pageIdx) => {
    const page = pages[pageIdx];
    const earningsSum = page.earnings.reduce((acc, curr) => acc + (parseFloat(curr.value.replace(/[^0-9.]/g, '')) || 0), 0);
    const deductionsSum = page.deductions.reduce((acc, curr) => acc + (parseFloat(curr.value.replace(/[^0-9.]/g, '')) || 0), 0);
    const net = earningsSum - deductionsSum;

    const updatedPages = [...pages];
    updatedPages[pageIdx] = {
      ...page,
      totalEarnings: earningsSum.toString(),
      totalDeductions: deductionsSum.toString(),
      netPay: net.toString(),
      amountInWords: numberToWords(Math.round(net))
    };
    setPages(updatedPages);
  };

  const handleEdit = (pageIdx, field, value) => {
    if (isViewMode) return;
    const updatedPages = [...pages];
    updatedPages[pageIdx] = { ...updatedPages[pageIdx], [field]: value };
    setPages(updatedPages);
  };

  const handleTableEdit = (pageIdx, tableType, rowIdx, field, value) => {
    if (isViewMode) return;
    const updatedPages = [...pages];
    updatedPages[pageIdx][tableType][rowIdx][field] = value;
    setPages(updatedPages);
    calculatePageTotals(pageIdx);
  };

  const addNewPage = () => {
    if (isViewMode) return;
    const currentPage = pages[currentPageIndex] || pages[0];
    const newPage = {
      ...currentPage,
      id: Date.now(),
      payPeriod: 'Next Month 2026',
    };
    setPages([...pages, newPage]);
    setCurrentPageIndex(pages.length);
  };

  const duplicateCurrentPage = () => {
    if (isViewMode) return;
    const currentPage = pages[currentPageIndex] || pages[0];
    const duplicatedPage = { ...currentPage, id: Date.now() };
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
      setCurrentPageIndex(i);
      // Wait for re-render
      await new Promise(resolve => setTimeout(resolve, 300));

      const canvas = await html2canvas(documentRef.current, {
        scale: 2,
        useCORS: true,
        logging: false
      });

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
                <div className="text-[#4a9d2d] font-bold text-2xl uppercase tracking-widest border-b-2 border-gray-800 pb-1 px-4">
                  MONTHLY PAYSLIP
                </div>
              </div>

              {/* 2. Employee Details Grid */}
              <div className="grid grid-cols-2 gap-y-3 text-sm mb-8 px-2">
                <div className="flex items-center gap-2">
                  <span className="font-bold min-w-[120px]">Date of Joining</span>
                  <span>:</span>
                  <div contentEditable={!isViewMode} onBlur={(e) => handleEdit(currentPageIndex, 'dateOfJoining', e.target.innerText)} className="editable-area px-1 outline-none min-w-[100px]" suppressContentEditableWarning>{currentPage.dateOfJoining}</div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="font-bold min-w-[120px]">Employee Name</span>
                  <span>:</span>
                  <div contentEditable={!isViewMode} onBlur={(e) => handleEdit(currentPageIndex, 'employeeName', e.target.innerText)} className="editable-area px-1 font-bold outline-none flex-1" suppressContentEditableWarning>{currentPage.employeeName}</div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="font-bold min-w-[120px]">Pay Period</span>
                  <span>:</span>
                  <div contentEditable={!isViewMode} onBlur={(e) => handleEdit(currentPageIndex, 'payPeriod', e.target.innerText)} className="editable-area px-1 outline-none min-w-[100px]" suppressContentEditableWarning>{currentPage.payPeriod}</div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="font-bold min-w-[120px]">Employee ID</span>
                  <span>:</span>
                  <div contentEditable={!isViewMode} onBlur={(e) => handleEdit(currentPageIndex, 'employeeId', e.target.innerText)} className="editable-area px-1 outline-none min-w-[100px]" suppressContentEditableWarning>{currentPage.employeeId}</div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="font-bold min-w-[120px]">Worked Days</span>
                  <span>:</span>
                  <div contentEditable={!isViewMode} onBlur={(e) => handleEdit(currentPageIndex, 'workedDays', e.target.innerText)} className="editable-area px-1 outline-none min-w-[100px]" suppressContentEditableWarning>{currentPage.workedDays}</div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="font-bold min-w-[120px]">Designation</span>
                  <span>:</span>
                  <div contentEditable={!isViewMode} onBlur={(e) => handleEdit(currentPageIndex, 'designation', e.target.innerText)} className="editable-area px-1 outline-none min-w-[100px]" suppressContentEditableWarning>{currentPage.designation}</div>
                </div>
                <div className="flex items-center gap-2">
                  {/* Empty for spacing */}
                </div>
                <div className="flex items-center gap-2">
                  <span className="font-bold min-w-[120px]">Department</span>
                  <span>:</span>
                  <div contentEditable={!isViewMode} onBlur={(e) => handleEdit(currentPageIndex, 'department', e.target.innerText)} className="editable-area px-1 outline-none min-w-[100px]" suppressContentEditableWarning>{currentPage.department}</div>
                </div>
              </div>

              {/* 3. Earnings and Deductions Table */}
              <table className="payslip-table">
                <thead>
                  <tr>
                    <th className="w-1/4">EARNINGS</th>
                    <th className="w-[15%] text-center">AMOUNT</th>
                    <th className="w-1/4">DEDUCTIONS</th>
                    <th className="w-[15%] text-center">AMOUNT</th>
                  </tr>
                </thead>
                <tbody>
                  {[0, 1, 2, 3].map(rowIdx => (
                    <tr key={rowIdx}>
                      <td>
                        <div contentEditable={!isViewMode} onBlur={(e) => handleTableEdit(currentPageIndex, 'earnings', rowIdx, 'label', e.target.innerText)} className="editable-area outline-none font-bold" suppressContentEditableWarning>
                          {currentPage.earnings[rowIdx]?.label}
                        </div>
                      </td>
                      <td className="text-center font-bold">
                        <div contentEditable={!isViewMode} onBlur={(e) => handleTableEdit(currentPageIndex, 'earnings', rowIdx, 'value', e.target.innerText)} className="editable-area outline-none" suppressContentEditableWarning>
                          {currentPage.earnings[rowIdx]?.value}
                        </div>
                      </td>
                      <td>
                        <div contentEditable={!isViewMode} onBlur={(e) => handleTableEdit(currentPageIndex, 'deductions', rowIdx, 'label', e.target.innerText)} className="editable-area outline-none font-bold" suppressContentEditableWarning>
                          {currentPage.deductions[rowIdx]?.label}
                        </div>
                      </td>
                      <td className="text-center font-bold">
                        <div contentEditable={!isViewMode} onBlur={(e) => handleTableEdit(currentPageIndex, 'deductions', rowIdx, 'value', e.target.innerText)} className="editable-area outline-none" suppressContentEditableWarning>
                          {currentPage.deductions[rowIdx]?.value}
                        </div>
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
                  <div className="border-t-2 border-gray-800 w-48 text-center pt-2 font-extrabold text-sm uppercase">
                    Employer Signature
                  </div>
                </div>
                <div className="flex flex-col items-center justify-end pb-0">
                  <div className="border-t-2 border-gray-800 w-48 text-center pt-2 font-extrabold text-sm uppercase">
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
          <span className="text-gray-500 font-bold text-[10px] tracking-widest uppercase">SELECT HEADER:</span>
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
