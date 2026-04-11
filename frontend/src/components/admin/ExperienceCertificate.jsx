import React, { useState, useRef } from 'react';
import { FaUpload, FaDownload, FaPen } from 'react-icons/fa';
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';
import axios from 'axios';
import CertificateHistory from './CertificateHistory';
import Modal from '../common/Modal';

// Styled fonts and global styles
const styleTag = document.createElement("style");
styleTag.innerHTML = `
  @import url('https://fonts.googleapis.com/css2?family=Montserrat:wght@300;400;500;600;700;800&display=swap');
  
  :root {
    --theme-green: #4a9d2d; 
    --text-dark: #1f2937;
  }

  .experience-container {
    font-family: 'Montserrat', sans-serif;
    color: var(--text-dark);
    line-height: 2; /* Increased line height for the certificate look */
  }

  .experience-input {
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
  .experience-input:hover, .editable-area:hover {
    background: rgba(74, 157, 45, 0.1); 
    border-radius: 2px;
    cursor: text;
    position: relative;
    z-index: 20;
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
    overflow: hidden; /* For watermark clipping */
  }

  .page-content {
    padding: 40px 50px; 
    flex-grow: 1;
    position: relative;
    z-index: 10;
  }

  /* --- HEADER BORDER STYLES --- */
  .header-separator-container {
    position: relative;
    width: 100%;
    margin: 15px 0 30px 0;
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
    width: 100%;
    height: 2px;
    background-color: var(--theme-green);
    z-index: 2;
  }
  /* --------------------------- */

  .green-footer-stripe {
    height: 10px;
    background-color: var(--theme-green);
    width: 100%;
    position: absolute;
    bottom: 0;
    left: 0;
  }

  /* Footer Text */
  .footer-text {
    font-size: 9px;
    color: #4b5563; /* Gray text */
    text-align: center;
    line-height: 1.5;
  }
  
  .footer-text span {
    color: var(--theme-green);
    font-weight: 600;
  }

  /* Watermark */
  .watermark-container {
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    width: 350px;
    height: 350px;
    opacity: 0.08;
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

  /* Custom Scrollbar for Action Bar */
  .action-bar-container {
    backdrop-filter: blur(10px);
    background: rgba(255, 255, 255, 0.9);
  }
`;
document.head.appendChild(styleTag);

const ExperienceCertificate = () => {
  const [formData, setFormData] = useState({
    // Header
    companyName: 'TECH VASEEGRAH',
    date: '15 DECEMBER 2025',
    title: 'TO WHOMSOEVER IT MAY CONCERN',

    // Body Paragraphs
    para1: 'This is to certify that Mr. Parthasarathi T was employed at Tech Vaseegrah as a Product Designer from 10th February 2025 to 15th December 2025.',
    para2: 'During his tenure, he provided effective design support across projects, contributing positively to both development workflows and client deliverables. His performance and conduct were consistently satisfactory throughout the employment period.',
    para3: 'We wish him continued success in all his future professional endeavors.',

    // Signatory
    closing: 'For Tech Vaseegrah',
    signatoryName: 'Sreekarrthikeyan M',
    signatoryTitle: 'Founder & CEO',

    // Footer
    footerAddress: 'Regd. Office : 11, Vijaya Street, Srinivasapuram, Thanjavur - 613009',
    footerPhone: 'Phone Number : +91 85240 89733',
    footerEmail: 'Email : techvaseegrah@gmail.com',
    footerWeb: 'Website : www.techvaseegrah.com'
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

  const saveCertificate = async () => {
    try {
      // Try to extract name from para1 if possible, or give a default
      let name = 'Untitled Experience Certificate';
      const match = formData.para1.match(/(?:Mr\.|Ms\.|Mrs\.)\s+([A-Za-z\s]+)(?:\s+was)/);
      if (match && match[1]) {
        name = match[1].trim();
      }

      const payload = {
        name: name,
        type: 'Experience',
        content: {
          formData,
          signatures,
          logoSelection
        }
      };

      const token = localStorage.getItem('token');
      const config = { headers: { Authorization: `Bearer ${token}` } };

      if (currentCertId) {
        await axios.put(`${API_URL}/certificates/${currentCertId}`, payload, config);
      } else {
        const res = await axios.post(`${API_URL}/certificates`, payload, config);
        setCurrentCertId(res.data._id);
      }
      setRefreshHistory(prev => prev + 1);
    } catch (error) {
      console.error('Error saving certificate:', error);
    }
  };

  const downloadPDF = async () => {
    if (!isViewMode) {
      await saveCertificate();
    }

    setIsGenerating(true);
    const editableAreas = document.querySelectorAll('.editable-area');
    editableAreas.forEach(inp => inp.style.backgroundColor = 'transparent');

    html2canvas(letterRef.current, {
      scale: 2.5,
      useCORS: true,
      scrollY: -window.scrollY
    }).then((canvas) => {
      const imgData = canvas.toDataURL('image/png');
      const pdf = new jsPDF('p', 'mm', 'a4');
      const pdfWidth = 210;
      const pdfHeight = 297;
      pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfHeight);
      pdf.save(`Experience_Certificate.pdf`);
      setIsGenerating(false);
    }).catch(err => {
      console.error("PDF Error:", err);
      setIsGenerating(false);
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
    setShowHistoryModal(false);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleHistoryDownload = (cert) => {
    loadCertificateData(cert);
    setIsViewMode(true);
    setShowHistoryModal(false);
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

  const handleNew = () => {
    setFormData({
      companyName: 'TECH VASEEGRAH',
      date: '15 DECEMBER 2025',
      title: 'TO WHOMSOEVER IT MAY CONCERN',
      para1: 'This is to certify that Mr. Parthasarathi T was employed at Tech Vaseegrah as a Product Designer from 10th February 2025 to 15th December 2025.',
      para2: 'During his tenure, he provided effective design support across projects, contributing positively to both development workflows and client deliverables. His performance and conduct were consistently satisfactory throughout the employment period.',
      para3: 'We wish him continued success in all his future professional endeavors.',
      closing: 'For Tech Vaseegrah',
      signatoryName: 'Sreekarrthikeyan M',
      signatoryTitle: 'Founder & CEO',
      footerAddress: 'Regd. Office : 11, Vijaya Street, Srinivasapuram, Thanjavur - 613009',
      footerPhone: 'Phone Number : +91 85240 89733',
      footerEmail: 'Email : techvaseegrah@gmail.com',
      footerWeb: 'Website : www.techvaseegrah.com'
    });
    setSignatures({ signature: null });
    setLogoSelection('tech');
    setCurrentCertId(null);
    setIsViewMode(false);
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
          <div ref={letterRef} className={`experience-container a4-size ${isViewMode ? 'pointer-events-none' : ''}`}>

            {/* Background Watermark */}
            <div className="watermark-container">
              {logoSelection === 'tech' ? (
                <img src="/Invoicelogo.png" alt="Watermark" className="watermark-img" />
              ) : (
                <img src="/vaseveda.png" alt="Watermark" className="watermark-img" />
              )}
            </div>

            <div className="page-content flex flex-col h-full relative">

              {/* 1. Header Section */}
              <div className="flex justify-between items-center mb-1">
                {/* Logo + Text */}
                <div className="flex items-center gap-3">
                  {logoSelection === 'tech' ? (
                    <div className="flex items-center gap-2">
                      <img src="/Invoicelogo.png" alt="Logo" className="h-12 object-contain" />
                      <div className="text-[#4a9d2d] font-bold text-xl uppercase tracking-wide">
                        {/* Removed Heading Text as per previous request */}
                      </div>
                    </div>
                  ) : (
                    <img src="/vaseveda.png" alt="Veda Logo" className="h-14 object-contain" />
                  )}
                </div>
              </div>

              {/* 2. Header Line Separator */}
              <div className="w-full h-[2px] bg-[#9ca3af] my-4"></div>

              {/* 3. Date (Right Aligned) */}
              <div className="text-right mb-12">
                <div
                  contentEditable={!isViewMode}
                  className="text-[#4a9d2d] font-bold text-sm uppercase tracking-wide editable-area outline-none inline-block"
                  onBlur={(e) => handleEdit('date', e.target.innerText)}
                  suppressContentEditableWarning={true}
                >
                  {formData.date}
                </div>
              </div>

              {/* 4. Title (Centered) */}
              <div className="text-center mb-12">
                <h1
                  contentEditable={!isViewMode}
                  className="text-[#4a9d2d] font-bold text-lg uppercase tracking-wide editable-area outline-none inline-block"
                  onBlur={(e) => handleEdit('title', e.target.innerText)}
                  suppressContentEditableWarning={true}
                >
                  {formData.title}
                </h1>
              </div>

              {/* 5. Body Content */}
              <div className="flex flex-col gap-6 text-[15px] text-gray-800 tracking-wide text-justify">

                <div
                  contentEditable={!isViewMode}
                  className="editable-area outline-none leading-8"
                  onBlur={(e) => handleEdit('para1', e.target.innerText)}
                  suppressContentEditableWarning={true}
                  dangerouslySetInnerHTML={{ __html: formData.para1.replace(/Mr\. Parthasarathi T/g, '<b>Mr. Parthasarathi T</b>').replace(/Product Designer/g, '<b>Product Designer</b>') }}
                />

                <div
                  contentEditable={!isViewMode}
                  className="editable-area outline-none leading-8"
                  onBlur={(e) => handleEdit('para2', e.target.innerText)}
                  suppressContentEditableWarning={true}
                >
                  {formData.para2}
                </div>

                <div
                  contentEditable={!isViewMode}
                  className="editable-area outline-none leading-8"
                  onBlur={(e) => handleEdit('para3', e.target.innerText)}
                  suppressContentEditableWarning={true}
                >
                  {formData.para3}
                </div>

                {/* Signatory Section (Left Aligned) */}
                <div className="mt-16">
                  <div
                    contentEditable={!isViewMode}
                    className="text-[#4a9d2d] font-bold mb-10 editable-area outline-none"
                    onBlur={(e) => handleEdit('closing', e.target.innerText)}
                    suppressContentEditableWarning={true}
                  >
                    {formData.closing}
                  </div>

                  {/* Signature Image Area - Increased size for larger appearance */}
                  <div className="h-32 mb-2 flex items-center">
                    {signatures.signature && (
                      <img src={signatures.signature} alt="Sign" className="max-h-full max-w-[350px] object-contain" />
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

            {/* 6. Footer (Centered Address + Green Stripe) */}
            <div className="relative pb-6 pt-4">
              <div className="w-[90%] mx-auto border-t border-[#4a9d2d] mb-3"></div>
              <div className="flex flex-col items-center justify-center footer-text">
                <div className="flex flex-wrap justify-center gap-1">
                  <span className="text-[#4a9d2d] font-bold">{formData.footerAddress.split(':')[0]} :</span>
                  <span contentEditable={!isViewMode} onBlur={(e) => handleEdit('footerAddress', e.target.innerText)} className="editable-area outline-none text-gray-600" suppressContentEditableWarning={true}>
                    {formData.footerAddress.split(':')[1]}
                  </span>
                  <span className="mx-1">|</span>
                  <span className="text-[#4a9d2d] font-bold">{formData.footerPhone.split(':')[0]} :</span>
                  <span contentEditable={!isViewMode} onBlur={(e) => handleEdit('footerPhone', e.target.innerText)} className="editable-area outline-none text-gray-600" suppressContentEditableWarning={true}>
                    {formData.footerPhone.split(':')[1]}
                  </span>
                </div>
                <div className="flex flex-wrap justify-center gap-1 mt-1">
                  <span className="text-[#4a9d2d] font-bold">{formData.footerEmail.split(':')[0]} :</span>
                  <span contentEditable={!isViewMode} onBlur={(e) => handleEdit('footerEmail', e.target.innerText)} className="editable-area outline-none text-gray-600" suppressContentEditableWarning={true}>
                    {formData.footerEmail.split(':')[1]}
                  </span>
                  <span className="mx-1">|</span>
                  <span className="text-[#4a9d2d] font-bold">{formData.footerWeb.split(':')[0]} :</span>
                  <span contentEditable={!isViewMode} onBlur={(e) => handleEdit('footerWeb', e.target.innerText)} className="editable-area outline-none text-gray-600" suppressContentEditableWarning={true}>
                    {formData.footerWeb.split(':')[1]}
                  </span>
                </div>
              </div>
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
            {/* Option 1 */}
            <label className={`cursor-pointer flex items-center gap-2 px-3 py-2 rounded-lg border transition-all ${logoSelection === 'tech' ? 'border-[#4a9d2d] bg-green-50' : 'border-gray-200 hover:bg-gray-50'}`}>
              <input type="radio" name="logo" checked={logoSelection === 'tech'} onChange={() => setLogoSelection('tech')} className="hidden" />
              <div className={`w-3 h-3 rounded-full border flex items-center justify-center ${logoSelection === 'tech' ? 'border-[#4a9d2d]' : 'border-gray-400'}`}>
                {logoSelection === 'tech' && <div className="w-1.5 h-1.5 rounded-full bg-[#4a9d2d]"></div>}
              </div>
              <span className={`text-sm font-semibold ${logoSelection === 'tech' ? 'text-[#4a9d2d]' : 'text-gray-600'}`}>Tech Vaseegrah</span>
            </label>

            {/* Option 2 */}
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
        title="Experience Certificate History"
        onClose={() => setShowHistoryModal(false)}
        size="xl"
      >
        <div className="w-full">
          <CertificateHistory
            type="Experience"
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

export default ExperienceCertificate;