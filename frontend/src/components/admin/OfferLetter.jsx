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

  .offer-container {
    font-family: 'Montserrat', sans-serif;
    color: var(--text-dark);
    line-height: 1.6;
  }

  .offer-input {
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
  .offer-input:hover, .editable-area:hover {
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

  /* --- HEADER BORDER STYLES (UNCHANGED) --- */
  .header-separator-container {
    position: relative;
    width: 100%;
    margin: 15px 0 25px 0;
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

  .footer-bar {
    border-top: 2px solid #e5e7eb;
    margin-top: auto;
    padding-top: 10px;
    padding-bottom: 20px;
  }

  .green-footer-stripe {
    height: 15px;
    background-color: var(--theme-green);
    width: 100%;
    position: absolute;
    bottom: 0;
    left: 0;
  }

  .dashed-line {
    border-bottom: 2px dashed #9ca3af;
    display: inline-block;
    width: 100%;
    margin-top: 5px;
  }

  /* Custom Scrollbar for Action Bar if needed on mobile */
  .action-bar-container {
    backdrop-filter: blur(10px);
    background: rgba(255, 255, 255, 0.9);
  }
`;
document.head.appendChild(styleTag);

const OfferLetter = () => {
  const [formData, setFormData] = useState({
    recipientName: '',
    recipientAddress: '',
    date: '27 FEBRUARY 2025',
    subject: 'Offer of Employment as Junior MERN Stack Developer',
    salutation: 'Dear ,',
    para1: 'We are pleased to offer you the position of Junior MERN Stack Developer at Tech Vaseegrah, effective from 1st March 2025.',
    para2: 'We have evaluated your profile and appreciate your enthusiasm, learning attitude, and foundational skills that align with our development team\'s goals. We believe you will be a valuable addition to our organization and look forward to your contributions in upcoming projects.',
    salaryIntro: 'Your monthly salary will be Rs. 9,000, structured as follows:',
    salaryBasic: 'Basic Salary: Rs. 7,000',
    salaryAllowances: 'Allowances: Rs. 2,000',
    incentives: 'Incentives: Performance-based incentives may be provided from time to time, based on your contributions to the project and overall team goals.',
    responsibilities: 'You will work with our development team to build and maintain web applications, take on full-stack responsibilities, collaborate with the team, and integrate new technologies.',
    closing: 'Please sign and return this letter to confirm your acceptance. We look forward to a successful journey together.',
    signatoryName: 'Sreekarthikeyan',
    signatoryTitle: 'Founder & CEO | Tech Vaseegrah',
    phone: '+91 85240 89733',
    website: 'www.techvaseegrah.com',
    address: '11,Vijaya Street, Srinivasapuram, Thanjavur',
    companyName: 'Tech Vaseegrah' // Added missing default field
  });

  const [signatures, setSignatures] = useState({ signature: null });
  const [logoSelection, setLogoSelection] = useState('tech');
  const [isGenerating, setIsGenerating] = useState(false);

  // History States
  const [currentCertId, setCurrentCertId] = useState(null);
  const [refreshHistory, setRefreshHistory] = useState(0);
  const [isViewMode, setIsViewMode] = useState(false);
  const [showHistoryModal, setShowHistoryModal] = useState(false);

  const offerLetterRef = useRef();

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
      const payload = {
        name: formData.recipientName || 'Untitled Offer Letter',
        type: 'Offer',
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
    const editableAreas = document.querySelectorAll('.editable-area, .offer-input');
    editableAreas.forEach(inp => inp.style.backgroundColor = 'transparent');

    html2canvas(offerLetterRef.current, {
      scale: 2.5,
      useCORS: true,
      scrollY: -window.scrollY
    }).then((canvas) => {
      const imgData = canvas.toDataURL('image/png');
      const pdf = new jsPDF('p', 'mm', 'a4');
      const pdfWidth = 210;
      const pdfHeight = 297;
      pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfHeight);
      pdf.save(`Offer_Letter_${formData.recipientName.split(' ')[0]}.pdf`);
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
      recipientName: '',
      recipientAddress: '',
      date: '27 FEBRUARY 2025',
      subject: 'Offer of Employment as Junior MERN Stack Developer',
      salutation: 'Dear ,',
      para1: 'We are pleased to offer you the position of Junior MERN Stack Developer at Tech Vaseegrah, effective from 1st March 2025.',
      para2: 'We have evaluated your profile and appreciate your enthusiasm, learning attitude, and foundational skills that align with our development team\'s goals. We believe you will be a valuable addition to our organization and look forward to your contributions in upcoming projects.',
      salaryIntro: 'Your monthly salary will be Rs. 9,000, structured as follows:',
      salaryBasic: 'Basic Salary: Rs. 7,000',
      salaryAllowances: 'Allowances: Rs. 2,000',
      incentives: 'Incentives: Performance-based incentives may be provided from time to time, based on your contributions to the project and overall team goals.',
      responsibilities: 'You will work with our development team to build and maintain web applications, take on full-stack responsibilities, collaborate with the team, and integrate new technologies.',
      closing: 'Please sign and return this letter to confirm your acceptance. We look forward to a successful journey together.',
      signatoryName: 'Sreekarthikeyan',
      signatoryTitle: 'Founder & CEO | Tech Vaseegrah',
      phone: '+91 85240 89733',
      website: 'www.techvaseegrah.com',
      address: '11,Vijaya Street, Srinivasapuram, Thanjavur',
      companyName: 'Tech Vaseegrah'
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

      {/* Helper Text for User */}
      <div className="flex items-center gap-2 mb-4 text-gray-500 bg-white px-4 py-2 rounded-full shadow-sm text-sm">
        <FaPen className="text-[#4a9d2d] w-3 h-3" />
        <span>Tip: Click directly on any text inside the letter to edit it.</span>
      </div>

      {/* --- A4 DOCUMENT --- */}
      <div className="w-full overflow-hidden flex justify-center md:block md:w-auto md:overflow-visible my-4 md:my-0">
        <div className="transform origin-top scale-[0.45] sm:scale-[0.6] md:scale-100">
          <div ref={offerLetterRef} className={`offer-container a4-size ${isViewMode ? 'pointer-events-none' : ''}`}>
            <div className="page-content flex flex-col h-full relative">

              {/* Header */}
              <div className="flex justify-between items-end">
                <div className="flex items-center gap-3">
                  {logoSelection === 'tech' ? (
                    <div className="flex items-center gap-2">
                      <img src="/Invoicelogo.png" alt="Logo" className="h-12 object-contain" />
                      <div
                        contentEditable={!isViewMode}
                        className="text-[#4a9d2d] font-bold text-xl uppercase tracking-wide editable-area outline-none"
                        onBlur={(e) => handleEdit('companyName', e.target.innerText)}
                        suppressContentEditableWarning={true}
                      >
                        {formData.companyName}
                      </div>
                    </div>
                  ) : (
                    <img src="/vaseveda.png" alt="Veda Logo" className="h-14 object-contain" />
                  )}
                </div>
                <h1 className="text-[#4a9d2d] font-bold text-lg tracking-widest uppercase">
                  OFFER LETTER
                </h1>
              </div>

              {/* Border Separator */}
              <div className="header-separator-container">
                <div className="header-thin-line"></div>
                <div className="header-thick-line"></div>
              </div>

              {/* Date & Address */}
              <div className="flex flex-col gap-6">
                <div className="text-right">
                  <div
                    contentEditable={!isViewMode}
                    className="text-[#4a9d2d] font-bold text-sm tracking-wide editable-area outline-none inline-block"
                    onBlur={(e) => handleEdit('date', e.target.innerText)}
                    suppressContentEditableWarning={true}
                  >
                    {formData.date}
                  </div>
                </div>
                <div>
                  <div className="text-gray-500 font-bold text-sm mb-1 tracking-wide">TO :</div>
                  <div
                    contentEditable={!isViewMode}
                    className="font-bold text-gray-900 text-sm uppercase mb-1 editable-area outline-none"
                    onBlur={(e) => handleEdit('recipientName', e.target.innerText)}
                    suppressContentEditableWarning={true}
                  >
                    {formData.recipientName}
                  </div>
                  <div
                    contentEditable={!isViewMode}
                    className="text-gray-800 text-sm whitespace-pre-line editable-area outline-none w-1/2"
                    onBlur={(e) => handleEdit('recipientAddress', e.target.innerText)}
                    suppressContentEditableWarning={true}
                  >
                    {formData.recipientAddress}
                  </div>
                </div>
              </div>

              {/* Subject */}
              <div className="mt-6 mb-4">
                <span className="font-bold text-sm text-gray-900">Subject: </span>
                <span
                  contentEditable={!isViewMode}
                  className="text-gray-800 text-sm editable-area outline-none"
                  onBlur={(e) => handleEdit('subject', e.target.innerText)}
                  suppressContentEditableWarning={true}
                >
                  {formData.subject}
                </span>
              </div>

              {/* Body */}
              <div className="text-sm text-gray-800 space-y-4 text-justify">
                <div contentEditable={!isViewMode} className="editable-area outline-none" onBlur={(e) => handleEdit('salutation', e.target.innerText)} suppressContentEditableWarning={true}>
                  {formData.salutation}
                </div>
                <div contentEditable={!isViewMode} className="editable-area outline-none leading-relaxed" onBlur={(e) => handleEdit('para1', e.target.innerText)} suppressContentEditableWarning={true}>
                  {formData.para1}
                </div>
                <div contentEditable={!isViewMode} className="editable-area outline-none leading-relaxed" onBlur={(e) => handleEdit('para2', e.target.innerText)} suppressContentEditableWarning={true}>
                  {formData.para2}
                </div>
                <div>
                  <div className="font-semibold mb-1">Compensation,</div>
                  <div contentEditable={!isViewMode} className="editable-area outline-none mb-2" onBlur={(e) => handleEdit('salaryIntro', e.target.innerText)} suppressContentEditableWarning={true}>
                    {formData.salaryIntro}
                  </div>
                  <div className="pl-0 space-y-1">
                    <div contentEditable={!isViewMode} className="editable-area outline-none font-medium" onBlur={(e) => handleEdit('salaryBasic', e.target.innerText)} suppressContentEditableWarning={true}>
                      {formData.salaryBasic}
                    </div>
                    <div contentEditable={!isViewMode} className="editable-area outline-none font-medium" onBlur={(e) => handleEdit('salaryAllowances', e.target.innerText)} suppressContentEditableWarning={true}>
                      {formData.salaryAllowances}
                    </div>
                  </div>
                </div>
                <div contentEditable={!isViewMode} className="editable-area outline-none leading-relaxed" onBlur={(e) => handleEdit('incentives', e.target.innerText)} suppressContentEditableWarning={true}>
                  {formData.incentives}
                </div>
                <div contentEditable={!isViewMode} className="editable-area outline-none leading-relaxed" onBlur={(e) => handleEdit('responsibilities', e.target.innerText)} suppressContentEditableWarning={true}>
                  {formData.responsibilities}
                </div>
                <div contentEditable={!isViewMode} className="editable-area outline-none leading-relaxed" onBlur={(e) => handleEdit('closing', e.target.innerText)} suppressContentEditableWarning={true}>
                  {formData.closing}
                </div>
              </div>

              {/* Signatures */}
              <div className="mt-auto pt-10 pb-16 flex justify-between items-end">
                <div className="w-[40%]">
                  <p className="text-sm text-gray-800 mb-4">Warm regards,<br />For Tech Vaseegrah</p>

                  {/* Signature Image Area - Increased Size */}
                  <div className="h-28 mb-2 flex items-center">
                    {signatures.signature && (
                      <img src={signatures.signature} alt="Sign" className="max-h-full max-w-[300px] object-contain" />
                    )}
                  </div>

                  <div contentEditable={!isViewMode} className="font-bold text-sm text-gray-900 editable-area outline-none" onBlur={(e) => handleEdit('signatoryName', e.target.innerText)} suppressContentEditableWarning={true}>
                    {formData.signatoryName}
                  </div>
                  <div contentEditable={!isViewMode} className="text-xs text-gray-600 editable-area outline-none" onBlur={(e) => handleEdit('signatoryTitle', e.target.innerText)} suppressContentEditableWarning={true}>
                    {formData.signatoryTitle}
                  </div>
                </div>
                <div className="w-[45%]">
                  <p className="text-sm text-gray-800 mb-6 font-semibold">Accepted and Signed by:</p>
                  <div className="mb-4">
                    <span className="text-sm">Name: </span>
                    <span className="font-bold text-sm uppercase">{formData.recipientName}</span>
                  </div>
                  <div className="mb-4">
                    <span className="text-sm">Signature: </span>
                    <span className="dashed-line w-[150px]"></span>
                  </div>
                  <div>
                    <span className="text-sm">Date: </span>
                    <span className="dashed-line w-[180px]"></span>
                  </div>
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="relative pb-5">
              <div className="border-t border-gray-300 mx-12"></div>
              <div className="flex justify-between items-center px-12 py-2 text-[10px] font-medium text-gray-600">
                <div contentEditable={!isViewMode} onBlur={(e) => handleEdit('phone', e.target.innerText)} className="editable-area outline-none" suppressContentEditableWarning={true}>
                  {formData.phone}
                </div>
                <div contentEditable={!isViewMode} onBlur={(e) => handleEdit('website', e.target.innerText)} className="editable-area outline-none" suppressContentEditableWarning={true}>
                  {formData.website}
                </div>
                <div contentEditable={!isViewMode} onBlur={(e) => handleEdit('address', e.target.innerText)} className="editable-area outline-none text-right" suppressContentEditableWarning={true}>
                  {formData.address}
                </div>
              </div>
              <div className="green-footer-stripe"></div>
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
          {/* Upload Signature */}
          <label className={`cursor-pointer group flex items-center gap-2 px-5 py-2.5 bg-white border border-gray-300 rounded-lg hover:border-[#4a9d2d] hover:shadow-md transition-all ${isViewMode ? 'opacity-50 pointer-events-none' : ''}`}>
            <FaUpload className="text-gray-500 group-hover:text-[#4a9d2d] transition-colors" />
            <span className="text-sm font-bold text-gray-700 group-hover:text-[#4a9d2d]">SIGNATURE</span>
            <input type="file" className="hidden" onChange={handleSignatureUpload} accept="image/*" />
          </label>

          {/* Download PDF */}
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
        title="Offer Letter History"
        onClose={() => setShowHistoryModal(false)}
        size="xl"
      >
        <div className="w-full">
          <CertificateHistory
            type="Offer"
            onView={handleView}
            onEdit={handleEditHistory}
            onDelete={() => handleNew()}
            onDownload={handleHistoryDownload}
            refreshTrigger={refreshHistory}
          />
        </div>
      </Modal>

    </div >
  );
};

export default OfferLetter;