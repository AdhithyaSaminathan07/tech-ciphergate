import React, { useState, useRef, useEffect } from 'react';
import { FaUpload, FaDownload } from 'react-icons/fa';
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';
import axios from 'axios';
import CertificateHistory from './CertificateHistory';
import Modal from '../common/Modal';

// Styled fonts and global styles
const styleTag = document.createElement("style");
styleTag.innerHTML = `
  @import url('https://fonts.googleapis.com/css2?family=Dancing+Script:wght@400;500;600&family=EB+Garamond:ital,wght@0,400;0,500;0,600;0,700;1,400;1,500&family=Cinzel:wght@400;500;700&family=Montserrat:wght@300;400&display=swap');
  
  .cert-input {
    background: transparent;
    border: none;
    outline: none;
    text-align: center;
    width: 100%;
    padding: 2px;
    font-family: inherit;
    color: inherit;
    transition: background 0.2s;
  }
  .cert-input:hover {
    background: rgba(166, 124, 82, 0.05);
  }
  .cert-input:disabled {
    background: transparent;
    color: #555;
    cursor: not-allowed;
  }
  .certificate-outer {
    background-color: #fdfaf5;
    border: 15px solid #a67c52;
    padding: 6px;
    box-shadow: 0 20px 50px rgba(0,0,0,0.15);
  }
  .certificate-inner {
    border: 2px solid #a67c52;
    height: 100%;
    width: 100%;
    position: relative;
    padding: 20px;
    display: flex;
    flex-direction: column;
    align-items: center;
  }
  /* Custom radio button style */
  .logo-option input[type="radio"] {
    accent-color: #a67c52;
    cursor: pointer;
  }
`;
document.head.appendChild(styleTag);

// Corner Image Component
const CornerImage = ({ className }) => (
  <img
    src="/border.png"
    alt="decoration"
    className={`absolute w-28 h-28 object-contain pointer-events-none ${className}`}
    crossOrigin="anonymous"
  />
);

const InternCertificate = () => {
  const [formData, setFormData] = useState({
    fullName: 'YOUR NAME HERE',
    registerNumber: '24PCS5308',
    collegeName: 'Raja Serfoji Government College',
    courseDegree: 'Master of Science in Computer Science',
    fromDate: '19-05-2025',
    toDate: '28-05-2025',
  });

  // State for editable signatories
  const [signatories, setSignatories] = useState({
    sig1Name: 'Vijaya Mahadevan',
    sig1Title: 'Proprietrix',
    sig2Name: 'Sreekarrthikeyan',
    sig2Title: 'Program Director'
  });

  const [signatures, setSignatures] = useState({ sig1: null, sig2: null });
  // Default to 'tech' or 'veda'
  const [logoSelection, setLogoSelection] = useState('tech');
  const [isGenerating, setIsGenerating] = useState(false);

  // History Feature States
  const [currentCertId, setCurrentCertId] = useState(null);
  const [refreshHistory, setRefreshHistory] = useState(0);
  const [isViewMode, setIsViewMode] = useState(false);
  const [showHistoryModal, setShowHistoryModal] = useState(false);

  const certificateRef = useRef();

  // Use deployed backend URL or localhost
  const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';

  const handleInputChange = (e) => {
    if (isViewMode) return;
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  // Handler for changing signatory text
  const handleSignatoryChange = (e) => {
    if (isViewMode) return;
    const { name, value } = e.target;
    setSignatories(prev => ({ ...prev, [name]: value }));
  };

  const handleSignatureUpload = (e, key) => {
    if (isViewMode) return;
    const file = e.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => setSignatures(prev => ({ ...prev, [key]: reader.result }));
      reader.readAsDataURL(file);
    }
  };

  const saveCertificate = async () => {
    try {
      const payload = {
        name: formData.fullName, // Use applicant name as certificate name
        type: 'Intern',
        content: {
          formData,
          signatories,
          signatures,
          logoSelection
        }
      };

      const token = localStorage.getItem('token');
      const config = { headers: { Authorization: `Bearer ${token}` } };

      if (currentCertId) {
        // Update existing
        await axios.put(`${API_URL}/certificates/${currentCertId}`, payload, config);
      } else {
        // Create new
        const res = await axios.post(`${API_URL}/certificates`, payload, config);
        setCurrentCertId(res.data._id);
      }
      setRefreshHistory(prev => prev + 1);
    } catch (error) {
      console.error('Error saving certificate:', error);
    }
  };

  const downloadPDF = async () => {
    // Save before download
    if (!isViewMode) {
      await saveCertificate();
    }

    const input = certificateRef.current;
    setIsGenerating(true);

    await document.fonts.ready;

    html2canvas(input, {
      scale: 3,
      useCORS: true,
      allowTaint: true,
      backgroundColor: '#fdfaf5',
      scrollY: -window.scrollY,
      onclone: (clonedDoc) => {
        // Convert Inputs to Spans for perfect PDF rendering
        const inputs = clonedDoc.querySelectorAll('input');
        inputs.forEach((inp) => {
          const span = clonedDoc.createElement('span');
          span.innerText = inp.value;
          const computedStyle = window.getComputedStyle(inp);
          span.style.fontFamily = computedStyle.fontFamily;
          span.style.fontSize = computedStyle.fontSize;
          span.style.fontWeight = computedStyle.fontWeight;
          span.style.color = computedStyle.color;
          span.style.letterSpacing = computedStyle.letterSpacing;
          span.style.width = computedStyle.width;
          span.style.textAlign = 'center';
          span.style.display = 'inline-block';
          if (inp.parentNode) {
            inp.parentNode.replaceChild(span, inp);
          }
        });
      }
    }).then((canvas) => {
      const imgData = canvas.toDataURL('image/png');
      const pdfWidth = 210;
      const pdfHeight = 297;
      const pdf = new jsPDF('p', 'mm', 'a4');
      pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfHeight);
      pdf.save(`Internship_Certificate_${formData.registerNumber}.pdf`);
      setIsGenerating(false);
    }).catch(err => {
      console.error("PDF Generation Error:", err);
      setIsGenerating(false);
    });
  };

  // History Actions
  const handleView = (cert) => {
    loadCertificateData(cert);
    setIsViewMode(true);
    setCurrentCertId(cert._id);
    setShowHistoryModal(false); // Close modal
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleEdit = (cert) => {
    loadCertificateData(cert);
    setIsViewMode(false);
    setCurrentCertId(cert._id);
    setShowHistoryModal(false); // Close modal
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleHistoryDownload = (cert) => {
    loadCertificateData(cert);
    setIsViewMode(true); // Download should be safe in view mode
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
    setSignatories(content.signatories);
    setSignatures(content.signatures);
    setLogoSelection(content.logoSelection);
  };

  const handleNew = () => {
    // Reset to default
    setFormData({
      fullName: 'YOUR NAME HERE',
      registerNumber: '24PCS5308',
      collegeName: 'Raja Serfoji Government College',
      courseDegree: 'Master of Science in Computer Science',
      fromDate: '19-05-2025',
      toDate: '28-05-2025',
    });
    setSignatories({
      sig1Name: 'Vijaya Mahadevan',
      sig1Title: 'Proprietrix',
      sig2Name: 'Sreekarrthikeyan',
      sig2Title: 'Program Director'
    });
    setSignatures({ sig1: null, sig2: null });
    setLogoSelection('tech');
    setCurrentCertId(null);
    setIsViewMode(false);
  };

  return (
    <div className="min-h-screen bg-gray-300 py-12 flex flex-col items-center">

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

      {/* 1. Main Certificate Content */}
      <div className="w-full overflow-hidden flex justify-center md:block md:w-auto md:overflow-visible my-4 md:my-0">
        <div className="transform origin-top scale-[0.45] sm:scale-[0.6] md:scale-100">
          <div className={`shadow-2xl ${isViewMode ? 'pointer-events-none opacity-90' : ''}`}>
            <div ref={certificateRef} className="certificate-outer w-[210mm] h-[297mm] box-border mx-auto bg-[#fdfaf5]">
              <div className="certificate-inner">

                {/* Corner Ornaments */}
                <CornerImage className="top-0 left-0" />
                <CornerImage className="top-0 right-0 rotate-90" />
                <CornerImage className="bottom-0 left-0 -rotate-90" />
                <CornerImage className="bottom-0 right-0 rotate-180" />

                {/* Logo Section - Lightly Big Size */}
                <div className="mt-10 mb-2 h-32 flex items-center justify-center">
                  {logoSelection === 'tech' && (
                    <img
                      src="/Invoicelogo.png"
                      alt="Tech Vaseegrah"
                      className="h-24 w-auto object-contain"
                      crossOrigin="anonymous"
                    />
                  )}
                  {logoSelection === 'veda' && (
                    <img
                      src="/vaseveda.png"
                      alt="Vaseegrah Veda"
                      className="h-28 w-auto object-contain"
                      crossOrigin="anonymous"
                    />
                  )}
                </div>

                {/* Main Labels */}
                <h3 className="mt-2 text-2xl tracking-[0.4em] font-semibold text-gray-800" style={{ fontFamily: 'Cinzel, serif' }}>
                  INTERNSHIP
                </h3>

                <h1 className="text-[78px] mt-2 mb-6 text-gray-900 leading-tight" style={{ fontFamily: 'Dancing Script, cursive', fontWeight: 500 }}>
                  Certificate of Completion
                </h1>

                <p className="text-xl text-gray-700 mb-6 italic" style={{ fontFamily: 'EB Garamond, serif', letterSpacing: '0.05em' }}>
                  This certificate is proudly awarded to
                </p>

                {/* Name Field */}
                <div className="w-[85%] border-b border-[#a67c52] mb-8">
                  <input
                    name="fullName"
                    value={formData.fullName}
                    onChange={handleInputChange}
                    className="cert-input text-5xl font-medium py-3 tracking-wide"
                    style={{ fontFamily: 'EB Garamond, serif' }}
                    disabled={isViewMode}
                  />
                </div>

                {/* Details Section */}
                <div className="text-center space-y-3 text-gray-800 max-w-[90%] text-xl" style={{ fontFamily: 'EB Garamond, serif' }}>

                  <p className="font-bold text-lg mb-2 italic whitespace-nowrap">
                    (REG NO <input name="registerNumber" value={formData.registerNumber} onChange={handleInputChange} className="cert-input font-bold inline-block text-center" style={{ width: '160px' }} disabled={isViewMode} />)
                  </p>

                  <p className="italic text-2xl">
                    A student of <input name="collegeName" value={formData.collegeName} onChange={handleInputChange} className="cert-input inline-block w-auto px-1 italic" style={{ width: '380px' }} disabled={isViewMode} />, pursuing
                  </p>

                  <div className="font-bold text-3xl py-1">
                    <input name="courseDegree" value={formData.courseDegree} onChange={handleInputChange} className="cert-input font-bold" disabled={isViewMode} />
                  </div>

                  {/* DYNAMIC COMPANY NAME BASED ON SELECTION */}
                  <p className="pt-2 text-2xl">
                    Successfully completed their internship at {logoSelection === 'tech' ? 'Tech Vaseegrah' : 'Vaseegrah Veda'}
                  </p>

                  <p className="italic pt-6 text-xl font-medium" style={{ fontFamily: 'EB Garamond, serif' }}>Period</p>

                  <div className="flex items-center justify-center gap-2 text-2xl mt-1" style={{ fontStyle: 'italic' }}>
                    <input name="fromDate" value={formData.fromDate} onChange={handleInputChange} className="cert-input w-32" disabled={isViewMode} />
                    <span className="text-lg normal-case">to</span>
                    <input name="toDate" value={formData.toDate} onChange={handleInputChange} className="cert-input w-32" disabled={isViewMode} />
                  </div>
                </div>

                {/* Footer Signatories (EDITABLE) */}
                <div className="absolute bottom-20 w-full px-20 flex justify-between">

                  {/* Left Signatory */}
                  <div className="text-center w-64">
                    <div className="h-24 flex items-end justify-center pb-2">
                      {signatures.sig1 ? (
                        <img src={signatures.sig1} alt="Sig" className="h-20 object-contain" />
                      ) : null}
                    </div>
                    <div className="border-t-2 border-gray-900 pt-3">
                      {/* Editable Name */}
                      <input
                        name="sig1Name"
                        value={signatories.sig1Name}
                        onChange={handleSignatoryChange}
                        className="cert-input font-bold text-xl text-gray-900"
                        style={{ fontFamily: 'EB Garamond, serif' }}
                        disabled={isViewMode}
                      />
                      {/* Editable Title */}
                      <input
                        name="sig1Title"
                        value={signatories.sig1Title}
                        onChange={handleSignatoryChange}
                        className="cert-input text-base text-gray-700 italic font-medium"
                        disabled={isViewMode}
                      />
                    </div>
                  </div>

                  {/* Right Signatory */}
                  <div className="text-center w-64">
                    <div className="h-24 flex items-end justify-center pb-2">
                      {signatures.sig2 ? (
                        <img src={signatures.sig2} alt="Sig" className="h-20 object-contain" />
                      ) : null}
                    </div>
                    <div className="border-t-2 border-gray-900 pt-3">
                      {/* Editable Name */}
                      <input
                        name="sig2Name"
                        value={signatories.sig2Name}
                        onChange={handleSignatoryChange}
                        className="cert-input font-bold text-xl text-gray-900"
                        style={{ fontFamily: 'EB Garamond, serif' }}
                        disabled={isViewMode}
                      />
                      {/* Editable Title */}
                      <input
                        name="sig2Title"
                        value={signatories.sig2Title}
                        onChange={handleSignatoryChange}
                        className="cert-input text-base text-gray-700 italic font-medium"
                        disabled={isViewMode}
                      />
                    </div>
                  </div>

                </div>
              </div>
            </div>
          </div>
        </div>
      </div>


      {/* 2. Bottom Controls Bar */}
      <div className="w-full max-w-full px-4 md:px-0 md:w-[210mm] flex flex-wrap justify-between items-center mt-8 gap-4">

        {/* Signatures Upload */}
        <div className={`flex gap-3 ${isViewMode ? 'opacity-50 pointer-events-none' : ''}`}>
          <label className="cursor-pointer bg-white px-3 py-2 rounded shadow-sm border hover:bg-gray-50 flex items-center gap-2 text-xs font-bold text-gray-700 transition-colors">
            <FaUpload className="text-amber-700" /> Proprietrix
            <input type="file" className="hidden" onChange={(e) => handleSignatureUpload(e, 'sig1')} accept="image/*" />
          </label>
          <label className="cursor-pointer bg-white px-3 py-2 rounded shadow-sm border hover:bg-gray-50 flex items-center gap-2 text-xs font-bold text-gray-700 transition-colors">
            <FaUpload className="text-amber-700" /> Program Director
            <input type="file" className="hidden" onChange={(e) => handleSignatureUpload(e, 'sig2')} accept="image/*" />
          </label>
        </div>

        {/* LOGO SELECTION CONTROLS */}
        <div className={`flex items-center gap-3 bg-white px-4 py-2 rounded shadow-sm border text-gray-800 text-xs font-bold ${isViewMode ? 'opacity-50 pointer-events-none' : ''}`}>
          <span className="text-amber-700">SELECT LOGO:</span>

          <label className="logo-option flex items-center gap-1 cursor-pointer hover:text-amber-800">
            <input
              type="radio"
              name="logoChoice"
              checked={logoSelection === 'tech'}
              onChange={() => setLogoSelection('tech')}
            />
            TECH VASEEGRAH
          </label>

          <div className="w-[1px] h-4 bg-gray-300"></div>

          <label className="logo-option flex items-center gap-1 cursor-pointer hover:text-amber-800">
            <input
              type="radio"
              name="logoChoice"
              checked={logoSelection === 'veda'}
              onChange={() => setLogoSelection('veda')}
            />
            VASEEGRAH VEDA
          </label>
        </div>

        {/* Download Button */}
        <button
          onClick={downloadPDF}
          disabled={isGenerating}
          className="bg-amber-700 hover:bg-amber-800 text-white px-6 py-2 rounded shadow-sm flex items-center gap-2 text-sm font-bold transition-colors disabled:bg-gray-400"
        >
          {isGenerating ? 'GENERATING...' : (
            <>
              <FaDownload /> {isViewMode ? 'DOWNLOAD STORED PDF' : 'SAVE & DOWNLOAD PDF'}
            </>
          )}
        </button>
      </div>

      {/* 3. Certificate History Modal */}
      <Modal
        isOpen={showHistoryModal}
        title="Internship Certificate History"
        onClose={() => setShowHistoryModal(false)}
        size="xl"
      >
        <div className="w-full">
          <CertificateHistory
            type="Intern"
            onView={handleView}
            onEdit={handleEdit}
            onDelete={() => handleNew()} // Clear selection if deleted
            onDownload={handleHistoryDownload}
            refreshTrigger={refreshHistory}
          />
        </div>
      </Modal>

    </div >
  );
};

export default InternCertificate;