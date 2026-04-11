import React, { useState, useRef, useEffect, useContext } from 'react';
import { FaUpload, FaDownload, FaPen } from 'react-icons/fa';
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';
import axios from 'axios';
import { toast } from 'react-toastify';
import CertificateHistory from './CertificateHistory';
import Modal from '../common/Modal';
import { getWorkers } from '../../services/workerService';
import appContext from '../../context/AppContext';

// Styled fonts and global styles
const styleTag = document.createElement("style");
styleTag.innerHTML = `
  @import url('https://fonts.googleapis.com/css2?family=Montserrat:wght@300;400;500;600;700;800&display=swap');
  
  :root {
    --theme-green: #4a9d2d; 
    --text-dark: #1f2937;
  }

  .relieving-container {
    font-family: 'Montserrat', sans-serif;
    color: var(--text-dark);
    line-height: 1.6;
  }

  .relieving-input {
    background: transparent;
    border: none;
    outline: none;
    padding: 1px;
    font-family: inherit;
    color: inherit;
    width: 100%;
    resize: none;
  }
  
  /* Hover effect to show where to edit */
  .relieving-input:hover, .editable-area:hover {
    background: rgba(74, 157, 45, 0.1); 
    border-radius: 2px;
    cursor: text;
    position: relative;
  }
  
  /* A4 Paper Styles */
  .a4-size {
    width: 210mm;
    min-height: 297mm;
    background: white;
    margin: 0 auto;
    box-shadow: 0 4px 15px rgba(0,0,0,0.1);
    position: relative;
    display: flex;
    flex-direction: column;
  }

  .page-content {
    padding: 40px 50px; 
    flex-grow: 1;
  }

  /* --- HEADER BORDER STYLES --- */
  .header-separator-container {
    position: relative;
    width: 100%;
    margin: 10px 0 20px 0;
    height: 4px;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .header-thin-line {
    position: absolute;
    width: 100%;
    height: 1px;
    background-color: #9ca3af;
    z-index: 1;
  }

  .header-thick-line {
    position: relative;
    width: 40%;
    height: 4px;
    background-color: var(--theme-green);
    z-index: 2;
  }
  /* --------------------------- */

  /* Header Contact Info Text */
  .header-contact-info {
    font-size: 8px;
    color: var(--theme-green);
    font-weight: 700;
    line-height: 1.5;
    text-align: right;
  }

  .green-footer-stripe {
    height: 15px;
    background-color: var(--theme-green);
    width: 100%;
    position: absolute;
    bottom: 0;
    left: 0;
  }

  /* Custom Scrollbar for Action Bar */
  .action-bar-container {
    backdrop-filter: blur(10px);
    background: rgba(255, 255, 255, 0.9);
  }
`;
document.head.appendChild(styleTag);

const RelievingLetter = () => {
  const { subdomain } = useContext(appContext);
  const [formData, setFormData] = useState({
    // Header Info
    headerLine1: 'Regd. Office : 11, Vijaya Street, Srinivasapuram, Thanjavur - 613009',
    headerLine2: 'Phone Number : +91 85240 89733',
    headerLine3: 'Email : techvaseegrah@gmail.com  Website : www.techvaseegrah.com',

    date: 'Date : 04-11-2025',

    // Recipient Details
    recipientName: '',
    employeeId: '',
    designation: '',

    subject: 'Official Relieving Letter',

    // Body Content
    salutation: 'Dear (Name),',
    para1: 'This is to formally confirm that your resignation letter dated 04-10-2025 has been accepted by the management. You have been relieved from your duties with Tech Vaseegrah at the close of business on 04-11-2025, after completion of your notice period from 04-10-2025 to 04-11-2025.',
    para2: 'We hereby acknowledge that you have completed all required handover and clearance formalities. Your full and final settlement will be processed as per company policy.',
    para3: 'We sincerely thank you for your contributions during your tenure with us and wish you success in all your future professional endeavors.',

    // Signatory
    forCompany: 'For Tech Vaseegrah,',
    signatoryName: 'Sreekarrthikeyan M',
    signatoryTitle: 'Founder & CEO',
  });

  const [signatures, setSignatures] = useState({ signature: null });
  const [logoSelection, setLogoSelection] = useState('tech');
  const [isGenerating, setIsGenerating] = useState(false);

  // History States
  const [currentCertId, setCurrentCertId] = useState(null);
  const [refreshHistory, setRefreshHistory] = useState(0);
  const [isViewMode, setIsViewMode] = useState(false);
  const [showHistoryModal, setShowHistoryModal] = useState(false);

  const letterRef = useRef();

  const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';

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



  const downloadPDF = async () => {
    if (!isViewMode) {
      await saveCertificate();
    }

    setIsGenerating(true);
    const editableAreas = document.querySelectorAll('.editable-area');
    editableAreas.forEach(inp => {
      inp.style.backgroundColor = 'transparent';
      // Remove border for inputs during capture to clear text obstruction
      if (inp.tagName === 'INPUT') {
        inp.style.borderBottom = 'none';
      }
    });

    html2canvas(letterRef.current, {
      scale: 2.5,
      useCORS: true,
      scrollY: -window.scrollY,
      onclone: (clonedDoc) => {
        const input = clonedDoc.getElementById('recipientNameInput');
        if (input) {
          const div = clonedDoc.createElement('div');
          div.className = 'font-medium text-gray-900';
          div.style.fontFamily = 'Montserrat, sans-serif'; // Ensure font consistency
          div.innerText = input.value;
          input.parentNode.replaceChild(div, input);
        }

        // Hide any open dropdowns in the clone
        const dropdowns = clonedDoc.querySelectorAll('ul.absolute');
        dropdowns.forEach(el => el.style.display = 'none');
      }
    }).then((canvas) => {
      const imgData = canvas.toDataURL('image/png');
      const pdf = new jsPDF('p', 'mm', 'a4');
      const pdfWidth = 210;
      const pdfHeight = 297;
      pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfHeight);
      pdf.save(`Relieving_Letter_${formData.recipientName.replace(/\s+/g, '_')}.pdf`);
      setIsGenerating(false);

      // Restore styles
      editableAreas.forEach(inp => {
        if (inp.tagName === 'INPUT') {
          inp.style.borderBottom = '';
        }
      });
    }).catch(err => {
      console.error("PDF Error:", err);
      setIsGenerating(false);
      // Restore styles on error too
      editableAreas.forEach(inp => {
        if (inp.tagName === 'INPUT') {
          inp.style.borderBottom = '';
        }
      });
    });
  };

  const handleEdit = (field, value) => {
    if (isViewMode) return;
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleView = (cert) => {
    loadCertificateData(cert);
    setIsViewMode(true);
    setCurrentCertId(cert._id);
    setShowHistoryModal(false);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleEditHistory = (cert) => {
    loadCertificateData(cert);
    setIsViewMode(false);
    setCurrentCertId(cert._id);
    setShowHistoryModal(false); // Close modal
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleHistoryDownload = (cert) => {
    loadCertificateData(cert);
    setIsViewMode(true);
    setShowHistoryModal(false); // Close modal
    window.scrollTo({ top: 0, behavior: 'smooth' });
    setTimeout(() => {
      if (window.confirm('Certificate data loaded. Ready to download?')) {
        downloadPDF();
      }
    }, 500);
  };

  const loadCertificateData = (cert) => {
    const content = cert.content;
    setFormData(content.formData);
    setSignatures(content.signatures);
    setLogoSelection(content.logoSelection);
  };

  /* New State for Employee Search */
  const [workers, setWorkers] = useState([]);
  const [filteredWorkers, setFilteredWorkers] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [showDropdown, setShowDropdown] = useState(false);
  const [selectedWorkerId, setSelectedWorkerId] = useState(null);

  // Fetch workers on mount
  useEffect(() => {
    const fetchWorkers = async () => {
      try {
        // console.log("Fetching workers for subdomain:", subdomain);
        const response = await getWorkers({ subdomain });
        // Assuming getWorkers handles the API call. 
        // If response is array:
        if (Array.isArray(response)) {
          setWorkers(response.filter(w => w.status !== 'Relieved'));
        } else if (response && response.users) { // fallback if structure is { users: [] }
          setWorkers(response.users.filter(w => w.status !== 'Relieved'));
        }
      } catch (e) {
        console.error("Error fetching workers:", e);
      }
    };
    if (subdomain) {
      fetchWorkers();
    }
  }, [subdomain]);

  // ... existing code ...

  const handleSearchChange = (e) => {
    const value = e.target.value;
    setSearchTerm(value);
    setFormData(prev => ({ ...prev, recipientName: value }));

    if (value.trim() === '') {
      // Show all active workers if search is empty? Or just 10?
      setFilteredWorkers(workers.slice(0, 10)); // Show top 10
      setShowDropdown(true);
      return;
    }

    const filtered = workers.filter(w =>
      w.name.toLowerCase().includes(value.toLowerCase())
    );
    setFilteredWorkers(filtered);
    setShowDropdown(true);
  };

  const handleFocus = () => {
    // On focus, show list even if empty search
    if (searchTerm.trim() === '') {
      setFilteredWorkers(workers.slice(0, 10));
      setShowDropdown(true);
    } else {
      setShowDropdown(true);
    }
  };

  const selectWorker = (worker) => {
    setFormData(prev => ({
      ...prev,
      recipientName: worker.name,
      employeeId: worker.rfid || worker.username, // Use RFID or Username as ID
      designation: worker.designation || 'Employee', // Assuming designation exists, or default
    }));
    setSearchTerm(worker.name);
    setSelectedWorkerId(worker._id);
    setShowDropdown(false);
  };

  const handleNew = () => {
    // ... existing reset logic ...
    setFormData({
      headerLine1: 'Regd. Office : 11, Vijaya Street, Srinivasapuram, Thanjavur - 613009',
      headerLine2: 'Phone Number : +91 85240 89733',
      headerLine3: 'Email : techvaseegrah@gmail.com  Website : www.techvaseegrah.com',
      date: `Date : ${new Date().toLocaleDateString('en-GB')}`, // Dynamic date
      recipientName: '', // Empty for search
      employeeId: '',
      designation: '',
      subject: 'Official Relieving Letter',
      salutation: 'Dear (Name),',
      para1: 'This is to formally confirm that your resignation letter dated DA-TE-YEAR has been accepted by the management. You have been relieved from your duties with Tech Vaseegrah at the close of business on DA-TE-YEAR, after completion of your notice period from DA-TE-YEAR to DA-TE-YEAR.',
      para2: 'We hereby acknowledge that you have completed all required handover and clearance formalities. Your full and final settlement will be processed as per company policy.',
      para3: 'We sincerely thank you for your contributions during your tenure with us and wish you success in all your future professional endeavors.',
      forCompany: 'For Tech Vaseegrah,',
      signatoryName: 'Sreekarrthikeyan M',
      signatoryTitle: 'Founder & CEO',
    });
    setSignatures({ signature: null });
    setLogoSelection('tech');
    setCurrentCertId(null);
    setIsViewMode(false);
    setSelectedWorkerId(null);
    setSearchTerm('');
  };

  // Modified saveCertificate
  const saveCertificate = async () => {
    if (!currentCertId && selectedWorkerId) {
      if (!window.confirm("Are you sure you want to mark this employee as relieved? This action cannot be undone.")) {
        return;
      }
    }

    try {
      const payload = {
        name: formData.recipientName || 'Untitled Relieving Letter',
        type: 'Relieving',
        content: {
          formData,
          signatures,
          logoSelection
        },
        workerId: selectedWorkerId // Add workerId to payload
      };

      const token = localStorage.getItem('token');
      const config = { headers: { Authorization: `Bearer ${token}` } };

      if (currentCertId) {
        await axios.put(`${API_URL}/certificates/${currentCertId}`, payload, config);
        // Updating existing certificate doesn't need to re-trigger relieving logic usually, 
        // but back-end could handle it.
      } else {
        const res = await axios.post(`${API_URL}/certificates`, payload, config);
        setCurrentCertId(res.data._id);
        toast.success("Certificate Saved & Employee Marked as Relieved (if applicable)");
      }
      setRefreshHistory(prev => prev + 1);
    } catch (error) {
      console.error('Error saving certificate:', error);
      toast.error('Failed to save details');
    }
  };

  return (
    <div className="min-h-screen bg-gray-100 py-8 flex flex-col items-center font-sans">

      {/* 0. Mode Indicator / New Button */}
      <div className="fixed top-4 right-4 z-50 flex flex-col md:flex-row gap-2 items-end">
        {currentCertId && (
          <div className={`px-4 py-2 rounded shadow font-bold text-white ${isViewMode ? 'bg-blue-600' : 'bg-yellow-600'}`}>
            {isViewMode ? 'VIEW MODE' : 'EDIT MODE'}
          </div>
        )}
        <button
          onClick={() => setShowHistoryModal(true)}
          className="bg-blue-800 text-white px-4 py-2 rounded shadow hover:bg-blue-900 transition"
        >
          History
        </button>
        <button
          onClick={handleNew}
          className="bg-gray-800 text-white px-4 py-2 rounded shadow hover:bg-black transition"
        >
          New Certificate
        </button>
      </div>

      {/* Helper Text */}
      <div className="flex items-center gap-2 mb-4 text-gray-500 bg-white px-4 py-2 rounded-full shadow-sm text-sm">
        <FaPen className="text-[#4a9d2d] w-3 h-3" />
        <span>Tip: Click directly on any text inside the letter to edit it.</span>
      </div>

      {/* --- A4 DOCUMENT --- */}
      <div className="w-full overflow-hidden flex justify-center md:block md:w-auto md:overflow-visible my-4 md:my-0">
        <div className="transform origin-top scale-[0.45] sm:scale-[0.6] md:scale-100">
          <div ref={letterRef} className={`relieving-container a4-size ${isViewMode ? 'pointer-events-none' : ''}`}>
            <div className="page-content flex flex-col h-full relative">

              {/* 1. Header Section (Logo Left, Contact Right) */}
              <div className="flex justify-between items-end mb-2">
                {/* Left: Logo */}
                <div className="flex items-center">
                  {logoSelection === 'tech' ? (
                    <div className="flex items-center gap-2">
                      <img src="/Invoicelogo.png" alt="Logo" className="h-12 object-contain" />
                    </div>
                  ) : (
                    <img src="/vaseveda.png" alt="Veda Logo" className="h-14 object-contain" />
                  )}
                </div>

                {/* Right: Contact Info (Moved from Footer) */}
                <div className="header-contact-info flex flex-col items-end">
                  <div
                    contentEditable={!isViewMode}
                    className="editable-area outline-none whitespace-nowrap"
                    onBlur={(e) => handleEdit('headerLine1', e.target.innerText)}
                    suppressContentEditableWarning={true}
                  >
                    {formData.headerLine1}
                  </div>
                  <div
                    contentEditable={!isViewMode}
                    className="editable-area outline-none whitespace-nowrap"
                    onBlur={(e) => handleEdit('headerLine2', e.target.innerText)}
                    suppressContentEditableWarning={true}
                  >
                    {formData.headerLine2}
                  </div>
                  <div
                    contentEditable={!isViewMode}
                    className="editable-area outline-none whitespace-nowrap"
                    onBlur={(e) => handleEdit('headerLine3', e.target.innerText)}
                    suppressContentEditableWarning={true}
                  >
                    {formData.headerLine3}
                  </div>
                </div>
              </div>

              {/* 2. Header Separator */}
              <div className="header-separator-container">
                <div className="header-thin-line"></div>
                <div className="header-thick-line"></div>
              </div>

              {/* 3. Date (Right Aligned, Green) */}
              <div className="text-right mb-8">
                <div
                  contentEditable={!isViewMode}
                  className="text-[#4a9d2d] font-bold text-sm tracking-wide editable-area outline-none inline-block"
                  onBlur={(e) => handleEdit('date', e.target.innerText)}
                  suppressContentEditableWarning={true}
                >
                  {formData.date}
                </div>
              </div>

              {/* 4. Title (Centered, Green, Underlined) */}
              <div className="text-center mb-10">
                <h1 className="text-[#4a9d2d] font-bold text-lg underline underline-offset-4 decoration-2">
                  Relieving Letter
                </h1>
              </div>

              {/* 5. Content Block */}
              <div className="flex flex-col gap-6 text-sm text-gray-800">

                {/* Recipient Details */}
                <div className="space-y-1">
                  <div className="font-bold text-gray-900">To</div>
                  <div className="relative">
                    {!isViewMode ? (
                      <>
                        <input
                          id="recipientNameInput"
                          type="text"
                          value={formData.recipientName}
                          onChange={handleSearchChange}
                          onFocus={handleFocus}
                          placeholder="Search Employee..."
                          className="font-medium text-gray-900 editable-area outline-none bg-transparent w-full placeholder-gray-400 border-b border-gray-300 focus:border-green-500 transition-colors"
                        />
                        {showDropdown && (
                          <ul className="absolute z-50 bg-white border border-gray-300 shadow-lg w-full max-h-48 overflow-y-auto mt-1 rounded text-left left-0">
                            {filteredWorkers.length > 0 ? (
                              filteredWorkers.map(worker => (
                                <li
                                  key={worker._id}
                                  onClick={() => selectWorker(worker)}
                                  className="px-3 py-2 hover:bg-green-50 cursor-pointer text-sm text-gray-700 border-b last:border-0"
                                >
                                  <div className="font-semibold">{worker.name}</div>
                                  <div className="text-xs text-gray-500">{worker.designation || 'Employee'}</div>
                                </li>
                              ))
                            ) : (
                              <li className="px-3 py-2 text-sm text-gray-500 italic">No employees found</li>
                            )}
                          </ul>
                        )}
                      </>
                    ) : (
                      <div className="font-medium text-gray-900">
                        {formData.recipientName}
                      </div>
                    )}
                  </div>
                  <div
                    contentEditable={!isViewMode}
                    className="font-medium text-gray-800 editable-area outline-none"
                    onBlur={(e) => handleEdit('employeeId', e.target.innerText)}
                    suppressContentEditableWarning={true}
                  >
                    {formData.employeeId}
                  </div>
                  <div
                    contentEditable={!isViewMode}
                    className="font-medium text-gray-800 editable-area outline-none"
                    onBlur={(e) => handleEdit('designation', e.target.innerText)}
                    suppressContentEditableWarning={true}
                  >
                    {formData.designation}
                  </div>
                </div>

                {/* Subject */}
                <div className="mt-4">
                  <span className="font-bold text-gray-900">Subject: </span>
                  <span
                    contentEditable={!isViewMode}
                    className="text-gray-900 editable-area outline-none"
                    onBlur={(e) => handleEdit('subject', e.target.innerText)}
                    suppressContentEditableWarning={true}
                  >
                    {formData.subject}
                  </span>
                </div>

                {/* Paragraphs */}
                <div className="space-y-6 text-justify leading-7">
                  <div
                    contentEditable={!isViewMode}
                    className="editable-area outline-none font-medium"
                    onBlur={(e) => handleEdit('salutation', e.target.innerText)}
                    suppressContentEditableWarning={true}
                  >
                    {formData.salutation}
                  </div>

                  <div
                    contentEditable={!isViewMode}
                    className="editable-area outline-none"
                    onBlur={(e) => handleEdit('para1', e.target.innerText)}
                    suppressContentEditableWarning={true}
                  >
                    {formData.para1}
                  </div>

                  <div
                    contentEditable={!isViewMode}
                    className="editable-area outline-none"
                    onBlur={(e) => handleEdit('para2', e.target.innerText)}
                    suppressContentEditableWarning={true}
                  >
                    {formData.para2}
                  </div>

                  <div
                    contentEditable={!isViewMode}
                    className="editable-area outline-none"
                    onBlur={(e) => handleEdit('para3', e.target.innerText)}
                    suppressContentEditableWarning={true}
                  >
                    {formData.para3}
                  </div>
                </div>

                {/* Signatory Section (Left Aligned) */}
                <div className="mt-12">
                  <div
                    contentEditable={!isViewMode}
                    className="text-gray-900 font-medium mb-8 editable-area outline-none"
                    onBlur={(e) => handleEdit('forCompany', e.target.innerText)}
                    suppressContentEditableWarning={true}
                  >
                    {formData.forCompany}
                  </div>

                  {/* Signature Image Area - Increased Height and Max Width */}
                  <div className="h-28 mb-2 flex items-center">
                    {signatures.signature && (
                      <img src={signatures.signature} alt="Sign" className="max-h-full max-w-[300px] object-contain" />
                    )}
                  </div>

                  <div
                    contentEditable={!isViewMode}
                    className="text-[#4a9d2d] font-bold text-sm editable-area outline-none"
                    onBlur={(e) => handleEdit('signatoryName', e.target.innerText)}
                    suppressContentEditableWarning={true}
                  >
                    {formData.signatoryName}
                  </div>
                  <div
                    contentEditable={!isViewMode}
                    className="text-[#4a9d2d] font-bold text-sm editable-area outline-none"
                    onBlur={(e) => handleEdit('signatoryTitle', e.target.innerText)}
                    suppressContentEditableWarning={true}
                  >
                    {formData.signatoryTitle}
                  </div>
                </div>

              </div>
            </div>

            {/* 6. Footer (Empty Green Stripe) */}
            <div className="relative pb-4">
              {/* The image shows no text in footer, just clean space. 
               We keep the green stripe for branding consistency */}
              <div className="green-footer-stripe"></div>
            </div>
          </div>
        </div>
      </div>

      {/* --- BOTTOM ACTION BAR (UNCHANGED) --- */}
      <div className="w-full max-w-[90%] md:max-w-[210mm] mt-8 mb-12 action-bar-container bg-white border border-gray-200 rounded-xl shadow-lg p-5 flex flex-col md:flex-row items-center justify-between gap-6 transition-all">

        {/* Header Options */}
        <div className={`flex flex-col gap-2 w-full md:w-auto ${isViewMode ? 'opacity-50 pointer-events-none' : ''}`}>
          <span className="text-gray-500 font-bold text-[10px] tracking-widest uppercase">SELECT HEADER:</span>
          <div className="flex gap-4">
            <label className={`cursor-pointer flex items-center gap-2 px-3 py-2 rounded-lg border transition-all ${logoSelection === 'tech' ? 'border-[#4a9d2d] bg-green-50' : 'border-gray-200 hover:bg-gray-50'}`}>
              <input type="radio" name="logo" checked={logoSelection === 'tech'} onChange={() => setLogoSelection('tech')} className="hidden" />
              <div className={`w-3 h-3 rounded-full border flex items-center justify-center ${logoSelection === 'tech' ? 'border-[#4a9d2d]' : 'border-gray-400'}`}>
                {logoSelection === 'tech' && <div className="w-1.5 h-1.5 rounded-full bg-[#4a9d2d]"></div>}
              </div>
              <span className={`text-sm font-semibold ${logoSelection === 'tech' ? 'text-[#4a9d2d]' : 'text-gray-600'}`}>Tech Vaseegrah</span>
            </label>

            <label className={`cursor-pointer flex items-center gap-2 px-3 py-2 rounded-lg border transition-all ${logoSelection === 'veda' ? 'border-[#4a9d2d] bg-green-50' : 'border-gray-200 hover:bg-gray-50'}`}>
              <input type="radio" name="logo" checked={logoSelection === 'veda'} onChange={() => setLogoSelection('veda')} className="hidden" />
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
        title="Relieving Letter History"
        onClose={() => setShowHistoryModal(false)}
        size="xl"
      >
        <div className="w-full">
          <CertificateHistory
            type="Relieving"
            onView={handleView}
            onEdit={handleEditHistory}
            onDelete={() => handleNew()}
            onDownload={handleHistoryDownload}
            refreshTrigger={refreshHistory}
          />
        </div>
      </Modal>

    </div>
  );
};

export default RelievingLetter;