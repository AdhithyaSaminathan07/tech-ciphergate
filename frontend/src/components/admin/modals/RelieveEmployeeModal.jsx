import React, { useState, useEffect, useRef, useContext } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  FaCalendarAlt, FaFileAlt, FaEdit, FaPaperPlane,
  FaCheckCircle, FaChevronRight, FaChevronLeft,
  FaEnvelope, FaWhatsapp, FaDownload, FaFilePdf
} from 'react-icons/fa';
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';
import { toast } from 'react-toastify';
import Modal from '../../common/Modal';
import Button from '../../common/Button';
import appContext from '../../../context/AppContext';
import { processRelieve } from '../../../services/exitManagementService';
import './RelieveEmployeeModal.css';

const RelieveEmployeeModal = ({ isOpen, onClose, worker, onComplete }) => {
  const { subdomain } = useContext(appContext);
  const [step, setStep] = useState(1);
  const [isLoading, setIsLoading] = useState(false);
  const captureRef = useRef(null);

  // --- STATE ---
  const [exitDetails, setExitDetails] = useState({
    joiningDate: worker?.joiningDate ? new Date(worker.joiningDate).toISOString().split('T')[0] : '',
    relievingDate: new Date().toISOString().split('T')[0],
    lastWorkingDay: new Date().toISOString().split('T')[0],
    reason: 'Personal Reasons',
    designation: worker?.designation || 'Employee',
    salary: worker?.salary || 0
  });

  const [selectedDocs, setSelectedDocs] = useState({
    'Offer Letter': false,
    'Acceptance Letter': false,
    'Relieving Letter': true,
    'Experience Certificate': true,
    'Monthly Payslip': true,
    'Intern Certificate': false
  });

  const [deliveryOptions, setDeliveryOptions] = useState({
    email: true,
    whatsapp: true,
    download: true
  });

  const [expandedDoc, setExpandedDoc] = useState(null);

  // Document specific data for editing
  const [docData, setDocData] = useState({});

  // --- EFFECTS ---
  useEffect(() => {
    if (isOpen && worker) {
      // Reset Modal State
      setStep(1);
      setIsLoading(false);
      setExpandedDoc(null);
      setGenProgress('');

      const jDate = (worker.joiningDate || worker.createdAt) 
        ? new Date(worker.joiningDate || worker.createdAt).toISOString().split('T')[0] 
        : new Date().toISOString().split('T')[0];
      const rDate = new Date().toISOString().split('T')[0];

      // Reset Exit Details
      setExitDetails({
        joiningDate: jDate,
        relievingDate: rDate,
        lastWorkingDay: rDate,
        reason: 'Personal Reasons',
        designation: worker.designation || 'Employee',
        salary: worker.salary || 0,
        email: worker.email || '',
        phoneNumber: worker.phoneNumber || ''
      });

      // Reset Selected Docs
      setSelectedDocs({
        'Offer Letter': false,
        'Acceptance Letter': false,
        'Relieving Letter': true,
        'Experience Certificate': true,
        'Monthly Payslip': true,
        'Intern Certificate': false
      });

      // Reset Delivery Options
      setDeliveryOptions({
        email: true,
        whatsapp: true,
        download: true
      });

      // Initialize Document specific data
      const years = calculateExperience(jDate, rDate);
      setDocData({
        'Relieving Letter': {
          para1: `This is to formally confirm that your resignation has been accepted by the management. You have been relieved from your duties with Tech Vaseegrah at the close of business on ${formatDate(rDate)}.`,
          para2: `We hereby acknowledge that you have completed all required handover and clearance formalities.`
        },
        'Experience Certificate': {
          para1: `This is to certify that **${worker.name}** was employed at Tech Vaseegrah as a **${worker.designation || 'Employee'}** from ${formatDate(jDate)} to ${formatDate(rDate)}.`,
          para2: `During the tenure of employment, they provided effective ${worker.designation || 'Employee'} support across projects, contributing positively to both development workflows and client deliverables. Their performance and conduct were consistently satisfactory throughout the employment period.`,
          para3: `We wish them continued success in all their future professional endeavors.`
        },
        'Monthly Payslip': [
          {
            period: `${new Date().toLocaleString('default', { month: 'long' })} ${new Date().getFullYear()}`,
            netSalary: worker.salary,
            earnings: [
              { label: 'Basic', value: worker.salary },
              { label: 'HRA', value: 0 },
              { label: 'Conveyance', value: 0 },
              { label: 'Incentive', value: 0 }
            ],
            deductions: [
              { label: 'Provident Fund', value: 0 },
              { label: 'Prof. Tax', value: 0 },
              { label: 'Loan', value: 0 },
              { label: 'Loss of Pay', value: 0 }
            ]
          }
        ]
      });
    }
  }, [isOpen, worker]);

  // Update doc data when exit details change
  useEffect(() => {
    if (!worker) return;
    const years = calculateExperience(exitDetails.joiningDate, exitDetails.relievingDate);
    setDocData(prev => ({
      ...prev,
      'Relieving Letter': {
        ...prev['Relieving Letter'],
        para1: `This is to formally confirm that your resignation has been accepted by the management. You have been relieved from your duties with Tech Vaseegrah at the close of business on ${formatDate(exitDetails.relievingDate)}.`
      },
      'Experience Certificate': {
        ...prev['Experience Certificate'],
        para1: `This is to certify that **${worker.name}** was employed at Tech Vaseegrah as a **${exitDetails.designation}** from ${formatDate(exitDetails.joiningDate)} to ${formatDate(exitDetails.relievingDate)}.`,
        para2: `During the tenure of employment, they provided effective ${exitDetails.designation} support across projects, contributing positively to both development workflows and client deliverables. Their performance and conduct were consistently satisfactory throughout the employment period.`,
        para3: `We wish them continued success in all their future professional endeavors.`
      }
    }));
  }, [exitDetails.relievingDate, exitDetails.joiningDate, exitDetails.designation]);

  // --- HELPERS ---
  const calculateExperience = (start, end) => {
    if (!start || !end) return { years: 0, months: 0 };
    const startDate = new Date(start);
    const endDate = new Date(end);
    let months = (endDate.getFullYear() - startDate.getFullYear()) * 12 + (endDate.getMonth() - startDate.getMonth());
    const years = Math.floor(months / 12);
    months = months % 12;
    return { years, months };
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return 'N/A';
    return new Date(dateStr).toLocaleDateString('en-GB', {
      day: '2-digit',
      month: 'long',
      year: 'numeric'
    });
  };

  const validateEmail = (email) => {
    return String(email)
      .toLowerCase()
      .match(
        /^(([^<>()[\]\\.,;:\s@"]+(\.[^<>()[\]\\.,;:\s@"]+)*)|(".+"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/
      );
  };

  const validateMobile = (mobile) => {
    return String(mobile).match(/^\+?[1-9]\d{1,14}$/);
  };

  const handleDocToggle = (doc) => {
    setSelectedDocs(prev => ({ ...prev, [doc]: !prev[doc] }));
  };

  const nextStep = () => setStep(prev => Math.min(prev + 1, 4));
  const prevStep = () => setStep(prev => Math.max(prev - 1, 1));

  const [genProgress, setGenProgress] = useState('');

  const generatePDFs = async () => {
    const docs = Object.keys(selectedDocs).filter(key => selectedDocs[key]);
    const generatedFiles = [];

    for (const docType of docs) {
      setGenProgress(`Capturing ${docType}...`);

      if (docType === 'Monthly Payslip') {
        const payslips = docData['Monthly Payslip'] || [];
        const pdf = new jsPDF('p', 'mm', 'a4', true); // Enable compression

        for (let i = 0; i < payslips.length; i++) {
          setGenProgress(`Capturing Payslip: Month ${i + 1}...`);
          const element = document.getElementById(`capture-Monthly-Payslip-${i}`);
          if (!element) continue;

          if (i > 0) pdf.addPage();
          const canvas = await html2canvas(element, {
            scale: 1.5, // Reduced scale for speed
            useCORS: true,
            logging: false,
            backgroundColor: '#ffffff'
          });
          const imgData = canvas.toDataURL('image/jpeg', 0.85); // Use JPEG with quality 0.85 for speed/size
          pdf.addImage(imgData, 'JPEG', 0, 0, 210, 297);
        }

        const fileName = `Monthly_Payslips_${worker.name.split(' ')[0]}.pdf`;
        if (deliveryOptions.download) pdf.save(fileName);

        generatedFiles.push({
          name: fileName,
          base64: pdf.output('datauristring'),
          type: docType
        });
      } else {
        const element = document.getElementById(`capture-${docType.replace(/\s+/g, '-')}`);
        if (!element) continue;

        const canvas = await html2canvas(element, {
          scale: 1.5, // Reduced scale for speed
          useCORS: true,
          logging: false,
          backgroundColor: '#ffffff'
        });
        const imgData = canvas.toDataURL('image/jpeg', 0.85);
        const pdf = new jsPDF('p', 'mm', 'a4', true); // Enable compression
        pdf.addImage(imgData, 'JPEG', 0, 0, 210, 297);

        const fileName = `${docType.replace(/\s+/g, '_')}_${worker.name.split(' ')[0]}.pdf`;
        if (deliveryOptions.download) pdf.save(fileName);

        generatedFiles.push({
          name: fileName,
          base64: pdf.output('datauristring'),
          type: docType
        });
      }
    }

    return generatedFiles;
  };

  const handleFinalSubmit = async () => {
    setIsLoading(true);
    try {
      const documentFiles = await generatePDFs();

      const payload = {
        workerId: worker._id,
        relievingDate: exitDetails.relievingDate,
        lastWorkingDay: exitDetails.lastWorkingDay,
        reason: exitDetails.reason,
        selectedDocuments: Object.keys(selectedDocs).filter(k => selectedDocs[k]),
        deliveryOptions,
        documentFiles,
        email: exitDetails.email,
        phoneNumber: exitDetails.phoneNumber
      };

      const response = await processRelieve(payload);

      if (response.deliveryStatus?.email?.sent || !deliveryOptions.email) {
        toast.success(response.message || 'Employee relieved and documents sent successfully!');
      } else {
        toast.warning(response.message || 'Employee relieved, but document delivery failed. Please check mail settings.');
      }

      onComplete();
      onClose();
    } catch (error) {
      toast.error(error.message || 'Failed to complete relieve process');
    } finally {
      setIsLoading(false);
    }
  };

  // --- RENDER ---
  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={`Relieve Employee: ${worker?.name}`}
      size="xl"
    >
      <div className="relieve-modal-container">
        {/* Step Indicator */}
        <div className="step-indicator">
          {[1, 2, 3, 4].map(s => (
            <div key={s} className={`step-item ${step === s ? 'active' : step > s ? 'completed' : ''}`}>
              {step > s ? <FaCheckCircle /> : s}
            </div>
          ))}
        </div>

        <div className="min-h-[400px]">
          <AnimatePresence mode="wait">
            {/* Step 1: Exit Details */}
            {step === 1 && (
              <motion.div
                key="step1"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="grid grid-cols-1 md:grid-cols-2 gap-6"
              >
                <div className="form-group">
                  <label className="block text-sm font-bold text-gray-700 mb-2">Joining Date</label>
                  <div className="relative">
                    <FaCalendarAlt className="absolute left-3 top-3 text-gray-400" />
                    <input
                      type="date"
                      className="w-full pl-10 pr-3 py-2 border border-gray-300 rounded-xl focus:ring-2 focus:ring-[#0d9488]"
                      value={exitDetails.joiningDate}
                      onChange={(e) => setExitDetails({ ...exitDetails, joiningDate: e.target.value })}
                    />
                  </div>
                </div>

                <div className="form-group">
                  <label className="block text-sm font-bold text-gray-700 mb-2">Relieving Date</label>
                  <div className="relative">
                    <FaCalendarAlt className="absolute left-3 top-3 text-gray-400" />
                    <input
                      type="date"
                      className="w-full pl-10 pr-3 py-2 border border-gray-300 rounded-xl focus:ring-2 focus:ring-[#0d9488]"
                      value={exitDetails.relievingDate}
                      onChange={(e) => setExitDetails({ ...exitDetails, relievingDate: e.target.value, lastWorkingDay: e.target.value })}
                    />
                  </div>
                </div>

                <div className="form-group">
                  <label className="block text-sm font-bold text-gray-700 mb-2">Designation</label>
                  <input
                    type="text"
                    className="w-full px-3 py-2 border border-gray-300 rounded-xl focus:ring-2 focus:ring-[#0d9488]"
                    value={exitDetails.designation}
                    onChange={(e) => setExitDetails({ ...exitDetails, designation: e.target.value })}
                  />
                </div>

                <div className="form-group">
                  <label className="block text-sm font-bold text-gray-700 mb-2">Reason for Leaving</label>
                  <select
                    className="w-full px-3 py-2 border border-gray-300 rounded-xl focus:ring-2 focus:ring-[#0d9488]"
                    value={exitDetails.reason}
                    onChange={(e) => setExitDetails({ ...exitDetails, reason: e.target.value })}
                  >
                    <option value="Personal Reasons">Personal Reasons</option>
                    <option value="Better Opportunity">Better Opportunity</option>
                    <option value="Health Issues">Health Issues</option>
                    <option value="Career Change">Career Change</option>
                    <option value="Termination">Termination</option>
                  </select>
                </div>
              </motion.div>
            )}

            {/* Step 2: Document Selection */}
            {step === 2 && (
              <motion.div
                key="step2"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4"
              >
                {Object.keys(selectedDocs).map(doc => (
                  <div
                    key={doc}
                    className={`doc-card ${selectedDocs[doc] ? 'selected' : ''}`}
                    onClick={() => handleDocToggle(doc)}
                  >
                    <div className={`p-3 rounded-xl ${selectedDocs[doc] ? 'bg-teal-100 text-teal-600' : 'bg-gray-100 text-gray-400'}`}>
                      <FaFileAlt size={20} />
                    </div>
                    <div className="flex-grow">
                      <h4 className="font-bold text-gray-800 text-sm">{doc}</h4>
                      <p className="text-xs text-gray-500">{selectedDocs[doc] ? 'Will be generated' : 'Skip'}</p>
                    </div>
                    {selectedDocs[doc] && <FaCheckCircle className="text-teal-500" />}
                  </div>
                ))}
              </motion.div>
            )}

            {/* Step 3: Edit Data */}
            {step === 3 && (
              <motion.div
                key="step3"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="space-y-4"
              >
                <div className="bg-teal-50 p-4 rounded-xl border border-teal-100 mb-6 flex items-center gap-3">
                  <div className="w-8 h-8 bg-teal-600 text-white rounded-lg flex items-center justify-center font-bold text-lg">!</div>
                  <p className="text-xs text-teal-800 font-bold uppercase tracking-tight">Review and customize details for each document below.</p>
                </div>

                <div className="space-y-3">
                  {Object.keys(selectedDocs).filter(k => selectedDocs[k]).map(doc => (
                    <div key={doc} className={`border rounded-2xl overflow-hidden transition-all ${expandedDoc === doc ? 'ring-2 ring-teal-500 border-teal-500 bg-white shadow-md' : 'border-gray-200 bg-gray-50'}`}>
                      <div
                        className="p-4 flex items-center justify-between cursor-pointer hover:bg-gray-100 transition-colors"
                        onClick={() => setExpandedDoc(expandedDoc === doc ? null : doc)}
                      >
                        <div className="flex items-center gap-3">
                          <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${expandedDoc === doc ? 'bg-teal-600 text-white' : 'bg-gray-200 text-gray-500'}`}>
                            <FaEdit size={14} />
                          </div>
                          <div>
                            <h4 className={`font-bold text-sm ${expandedDoc === doc ? 'text-teal-700' : 'text-gray-700'}`}>{doc} Details</h4>
                            <p className="text-[10px] text-gray-400 uppercase font-black">Click to {expandedDoc === doc ? 'collapse' : 'expand and edit'}</p>
                          </div>
                        </div>
                        <div className={`transition-transform duration-300 ${expandedDoc === doc ? 'rotate-180' : ''}`}>
                          <FaChevronRight className="text-gray-400" />
                        </div>
                      </div>

                      {expandedDoc === doc && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: 'auto', opacity: 1 }}
                          className="p-6 border-t border-gray-100 space-y-6"
                        >
                          {doc === 'Relieving Letter' && (
                            <div className="space-y-4">
                              <div className="form-group">
                                <label className="text-[10px] font-black text-gray-400 uppercase mb-1 block">Opening Statement</label>
                                <textarea
                                  className="w-full p-4 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-teal-500 outline-none"
                                  rows="3"
                                  value={docData[doc]?.para1}
                                  onChange={(e) => setDocData({ ...docData, [doc]: { ...docData[doc], para1: e.target.value } })}
                                />
                              </div>
                              <div className="form-group">
                                <label className="text-[10px] font-black text-gray-400 uppercase mb-1 block">Conclusion</label>
                                <textarea
                                  className="w-full p-4 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-teal-500 outline-none"
                                  rows="2"
                                  value={docData[doc]?.para2}
                                  onChange={(e) => setDocData({ ...docData, [doc]: { ...docData[doc], para2: e.target.value } })}
                                />
                              </div>
                            </div>
                          )}

                          {doc === 'Experience Certificate' && (
                            <div className="space-y-4">
                              <div className="form-group">
                                <label className="text-[10px] font-black text-gray-400 uppercase mb-1 block">Certification Statement</label>
                                <textarea
                                  className="w-full p-4 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-teal-500 outline-none"
                                  rows="3"
                                  value={docData[doc]?.para1}
                                  onChange={(e) => setDocData({ ...docData, [doc]: { ...docData[doc], para1: e.target.value } })}
                                />
                                <p className="text-[9px] text-gray-400 mt-1 italic">Note: Use **text** for bolding in the final PDF.</p>
                              </div>
                              <div className="form-group">
                                <label className="text-[10px] font-black text-gray-400 uppercase mb-1 block">Performance Acknowledgement</label>
                                <textarea
                                  className="w-full p-4 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-teal-500 outline-none"
                                  rows="3"
                                  value={docData[doc]?.para2}
                                  onChange={(e) => setDocData({ ...docData, [doc]: { ...docData[doc], para2: e.target.value } })}
                                />
                              </div>
                              <div className="form-group">
                                <label className="text-[10px] font-black text-gray-400 uppercase mb-1 block">Closing Wishes</label>
                                <textarea
                                  className="w-full p-4 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-teal-500 outline-none"
                                  rows="2"
                                  value={docData[doc]?.para3}
                                  onChange={(e) => setDocData({ ...docData, [doc]: { ...docData[doc], para3: e.target.value } })}
                                />
                              </div>
                            </div>
                          )}

                          {doc === 'Monthly Payslip' && (
                            <div className="space-y-6">
                              <div className="flex items-center justify-between bg-white p-3 rounded-xl border border-gray-100">
                                <div>
                                  <h5 className="text-xs font-bold text-gray-700">Multi-Month Payslips</h5>
                                  <p className="text-[10px] text-gray-400">Add up to 6 months of payslips to this document</p>
                                </div>
                                <div className="flex items-center gap-2">
                                  <button
                                    className="w-8 h-8 rounded-lg bg-rose-50 text-rose-600 flex items-center justify-center hover:bg-rose-100 disabled:opacity-30"
                                    disabled={(docData['Monthly Payslip'] || []).length <= 1}
                                    onClick={() => {
                                      const newPayslips = [...docData['Monthly Payslip']];
                                      newPayslips.pop();
                                      setDocData({ ...docData, 'Monthly Payslip': newPayslips });
                                    }}
                                  >
                                    -
                                  </button>
                                  <span className="font-bold text-teal-600 w-4 text-center">{(docData['Monthly Payslip'] || []).length}</span>
                                  <button
                                    className="w-8 h-8 rounded-lg bg-teal-50 text-teal-600 flex items-center justify-center hover:bg-teal-100 disabled:opacity-30"
                                    disabled={(docData['Monthly Payslip'] || []).length >= 6}
                                    onClick={() => {
                                      const current = docData['Monthly Payslip'] || [];
                                      const last = current[current.length - 1];
                                      const nextMonth = new Date();
                                      nextMonth.setMonth(nextMonth.getMonth() + current.length);
                                      const newMonth = {
                                        ...JSON.parse(JSON.stringify(last)), // Deep copy last month's data
                                        period: `${nextMonth.toLocaleString('default', { month: 'long' })} ${nextMonth.getFullYear()}`
                                      };
                                      setDocData({ ...docData, 'Monthly Payslip': [...current, newMonth] });
                                    }}
                                  >
                                    +
                                  </button>
                                </div>
                              </div>

                              {(docData['Monthly Payslip'] || []).map((payslip, pIdx) => (
                                <div key={pIdx} className="bg-white rounded-2xl border border-gray-100 p-6 space-y-6 relative">
                                  <div className="absolute -top-3 left-4 bg-teal-600 text-white text-[9px] font-black px-2 py-1 rounded uppercase tracking-widest">
                                    Month {pIdx + 1}
                                  </div>

                                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
                                    <div className="form-group">
                                      <label className="text-[10px] font-black text-gray-400 uppercase mb-1 block">Pay Period</label>
                                      <input
                                        type="text"
                                        className="w-full p-3 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-teal-500 outline-none"
                                        value={payslip.period}
                                        onChange={(e) => {
                                          const newPayslips = [...docData['Monthly Payslip']];
                                          newPayslips[pIdx].period = e.target.value;
                                          setDocData({ ...docData, 'Monthly Payslip': newPayslips });
                                        }}
                                      />
                                    </div>
                                    <div className="form-group">
                                      <label className="text-[10px] font-black text-gray-400 uppercase mb-1 block">Net Salary (Calculated)</label>
                                      <div className="w-full p-3 border border-gray-100 rounded-xl bg-teal-50 text-sm font-black text-teal-700 flex justify-between items-center">
                                        <span>Net Pay:</span>
                                        <span>₹{payslip.earnings?.reduce((sum, e) => sum + e.value, 0) - payslip.deductions?.reduce((sum, d) => sum + d.value, 0)}</span>
                                      </div>
                                    </div>
                                  </div>

                                  <div className="border-t border-gray-50 pt-4">
                                    <div className="grid grid-cols-2 gap-8">
                                      <div className="space-y-3">
                                        <label className="text-[9px] font-bold text-teal-600 uppercase">Earnings</label>
                                        <div className="space-y-2">
                                          {payslip.earnings?.map((item, idx) => (
                                            <div key={idx} className="flex items-center justify-between gap-4">
                                              <span className="text-xs text-gray-500 min-w-[80px]">{item.label}</span>
                                              <input
                                                type="number"
                                                value={item.value}
                                                onChange={(e) => {
                                                  const newPayslips = [...docData['Monthly Payslip']];
                                                  newPayslips[pIdx].earnings[idx].value = Number(e.target.value);
                                                  setDocData({ ...docData, 'Monthly Payslip': newPayslips });
                                                }}
                                                className="w-full p-1.5 border border-gray-100 rounded bg-white text-xs text-right"
                                              />
                                            </div>
                                          ))}
                                        </div>
                                      </div>
                                      <div className="space-y-3">
                                        <label className="text-[9px] font-bold text-rose-600 uppercase">Deductions</label>
                                        <div className="space-y-2">
                                          {payslip.deductions?.map((item, idx) => (
                                            <div key={idx} className="flex items-center justify-between gap-4">
                                              <span className="text-xs text-gray-500 min-w-[80px]">{item.label}</span>
                                              <input
                                                type="number"
                                                value={item.value}
                                                onChange={(e) => {
                                                  const newPayslips = [...docData['Monthly Payslip']];
                                                  newPayslips[pIdx].deductions[idx].value = Number(e.target.value);
                                                  setDocData({ ...docData, 'Monthly Payslip': newPayslips });
                                                }}
                                                className="w-full p-1.5 border border-gray-100 rounded bg-white text-xs text-right"
                                              />
                                            </div>
                                          ))}
                                        </div>
                                      </div>
                                    </div>
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}

                          {!['Relieving Letter', 'Experience Certificate', 'Monthly Payslip'].includes(doc) && (
                            <div className="p-4 bg-gray-50 rounded-xl border border-dashed border-gray-200 text-center">
                              <p className="text-xs text-gray-400 italic font-medium">Standard template will be used for this document. No additional details required.</p>
                            </div>
                          )}
                        </motion.div>
                      )}
                    </div>
                  ))}
                </div>
              </motion.div>
            )}

            {/* Step 4: Delivery */}
            {step === 4 && (
              <motion.div
                key="step4"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="space-y-8"
              >
                <div className="text-center">
                  <div className="w-16 h-16 bg-teal-100 text-teal-600 rounded-full flex items-center justify-center mx-auto mb-4">
                    <FaPaperPlane size={24} />
                  </div>
                  <h3 className="text-xl font-bold text-gray-900">Delivery Validation</h3>
                  <p className="text-gray-500 max-w-md mx-auto mt-2">Enter at least one contact method to proceed with document delivery.</p>
                </div>

                <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm space-y-6">
                  <h4 className="text-xs font-black text-gray-400 uppercase tracking-widest mb-4">Contact Details</h4>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="form-group">
                      <label className="block text-sm font-bold text-gray-700 mb-2">Employee Email Address</label>
                      <div className="relative">
                        <FaEnvelope className="absolute left-3 top-3 text-gray-400" />
                        <input
                          type="email"
                          placeholder="example@gmail.com"
                          className={`w-full pl-10 pr-3 py-2 border rounded-xl focus:ring-2 focus:ring-[#0d9488] outline-none transition-all ${exitDetails.email && !validateEmail(exitDetails.email) ? 'border-red-300 bg-red-50' : 'border-gray-300'}`}
                          value={exitDetails.email || ''}
                          onChange={(e) => setExitDetails({ ...exitDetails, email: e.target.value })}
                        />
                      </div>
                      {exitDetails.email && !validateEmail(exitDetails.email) && (
                        <p className="text-[10px] text-red-500 mt-1 font-bold">Please enter a valid email address</p>
                      )}
                    </div>

                    <div className="form-group">
                      <label className="block text-sm font-bold text-gray-700 mb-2">WhatsApp / Mobile Number</label>
                      <div className="relative">
                        <FaWhatsapp className="absolute left-3 top-3 text-gray-400" />
                        <input
                          type="tel"
                          placeholder="+91 9876543210"
                          className={`w-full pl-10 pr-3 py-2 border rounded-xl focus:ring-2 focus:ring-[#0d9488] outline-none transition-all ${exitDetails.phoneNumber && !validateMobile(exitDetails.phoneNumber) ? 'border-red-300 bg-red-50' : 'border-gray-300'}`}
                          value={exitDetails.phoneNumber || ''}
                          onChange={(e) => setExitDetails({ ...exitDetails, phoneNumber: e.target.value })}
                        />
                      </div>
                      <p className="text-[10px] text-gray-400 mt-1">Include country code (e.g., +91)</p>
                      {exitDetails.phoneNumber && !validateMobile(exitDetails.phoneNumber) && (
                        <p className="text-[10px] text-red-500 mt-1 font-bold">Please enter a valid number with country code</p>
                      )}
                    </div>
                  </div>

                  <div className={`p-3 rounded-lg flex items-center gap-3 ${(!exitDetails.email && !exitDetails.phoneNumber) ? 'bg-amber-50 text-amber-700' : 'bg-green-50 text-green-700'}`}>
                    <div className={`w-2 h-2 rounded-full ${(!exitDetails.email && !exitDetails.phoneNumber) ? 'bg-amber-500' : 'bg-green-500'}`}></div>
                    <span className="text-xs font-bold uppercase tracking-tight">
                      {(!exitDetails.email && !exitDetails.phoneNumber) ? 'At least one contact method is required' : 'Contact validation successful'}
                    </span>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                  <button
                    disabled={!exitDetails.email || !validateEmail(exitDetails.email)}
                    className={`p-4 border-2 rounded-2xl flex flex-col items-center gap-2 transition-all ${deliveryOptions.email && exitDetails.email ? 'border-teal-500 bg-teal-50 text-teal-700' : 'border-gray-100 text-gray-400 opacity-50'}`}
                    onClick={() => setDeliveryOptions({ ...deliveryOptions, email: !deliveryOptions.email })}
                  >
                    <FaEnvelope size={20} />
                    <span className="text-xs font-bold">Email</span>
                  </button>

                  <button
                    disabled={!exitDetails.phoneNumber || !validateMobile(exitDetails.phoneNumber)}
                    className={`p-4 border-2 rounded-2xl flex flex-col items-center gap-2 transition-all ${deliveryOptions.whatsapp && exitDetails.phoneNumber ? 'border-teal-500 bg-teal-50 text-teal-700' : 'border-gray-100 text-gray-400 opacity-50'}`}
                    onClick={() => setDeliveryOptions({ ...deliveryOptions, whatsapp: !deliveryOptions.whatsapp })}
                  >
                    <FaWhatsapp size={20} />
                    <span className="text-xs font-bold">WhatsApp</span>
                  </button>

                  <button
                    className={`p-4 border-2 rounded-2xl flex flex-col items-center gap-2 transition-all ${deliveryOptions.download ? 'border-teal-500 bg-teal-50 text-teal-700' : 'border-gray-100 text-gray-400'}`}
                    onClick={() => setDeliveryOptions({ ...deliveryOptions, download: !deliveryOptions.download })}
                  >
                    <FaDownload size={20} />
                    <span className="text-xs font-bold">Download</span>
                  </button>

                  <button
                    className={`p-4 border-2 rounded-2xl flex flex-col items-center gap-2 transition-all border-teal-500 bg-teal-50 text-teal-700 cursor-default`}
                  >
                    <FaCheckCircle size={20} />
                    <span className="text-xs font-bold">Save History</span>
                  </button>
                </div>

                {isLoading && (
                  <div className="flex flex-col items-center justify-center p-8 bg-gray-50 rounded-2xl border border-dashed border-gray-200">
                    <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-teal-600 mb-4"></div>
                    <p className="text-teal-800 font-bold">{genProgress || 'Generating & Dispatching PDFs...'}</p>
                    <p className="text-xs text-gray-500 mt-1">Processing multi-channel delivery. Please wait...</p>
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Action Buttons */}
        <div className="flex justify-between mt-10 pt-6 border-t border-gray-100">
          <Button
            variant="outline"
            onClick={step === 1 ? onClose : prevStep}
            disabled={isLoading}
          >
            {step === 1 ? 'Cancel' : <><FaChevronLeft className="mr-2" /> Back</>}
          </Button>

          {step < 4 ? (
            <Button variant="primary" onClick={nextStep}>
              Next <FaChevronRight className="ml-2" />
            </Button>
          ) : (
            <Button
              variant="primary"
              onClick={handleFinalSubmit}
              loading={isLoading}
              disabled={isLoading || (!exitDetails.email && !exitDetails.phoneNumber) || (exitDetails.email && !validateEmail(exitDetails.email)) || (exitDetails.phoneNumber && !validateMobile(exitDetails.phoneNumber))}
            >
              Confirm Relieve & Send <FaCheckCircle className="ml-2" />
            </Button>
          )}
        </div>
      </div>

      {/* --- HIDDEN CAPTURE AREA --- */}
      <div className="capture-container" ref={captureRef}>
        {/* Experience Certificate - EXACT FORMAT */}
        <div id="capture-Experience-Certificate" className="a4-preview">
          <div className="preview-badge">Experience Certificate</div>
          <div className="watermark-container">
            <img src="/Invoicelogo.png" alt="Watermark" className="watermark-img" />
          </div>
          <div className="page-content relative z-10">
            <div className="flex justify-between items-end mb-4">
              <img src="/Invoicelogo.png" alt="Logo" className="h-14" />
              <div className="text-right font-bold text-[#4a9d2d] text-xs">
                TECH VASEEGRAH
              </div>
            </div>
            <div className="header-separator-container">
              <div className="header-thin-line"></div>
              <div className="header-thick-line"></div>
            </div>
            <div className="text-right text-sm font-bold text-[#4a9d2d] mb-12">
              {formatDate(exitDetails.relievingDate).toUpperCase()}
            </div>
            <h1 className="text-center text-lg font-black text-[#4a9d2d] mb-16 uppercase tracking-widest">
              TO WHOMSOEVER IT MAY CONCERN
            </h1>
            <div className="text-md leading-relaxed text-justify font-medium text-gray-700 space-y-8">
              <p dangerouslySetInnerHTML={{
                __html: (docData['Experience Certificate']?.para1 || '')
                  .replace(/\*\*(.*?)\*\*/g, '<b class="text-black font-black">$1</b>')
              }} />

              <p>{docData['Experience Certificate']?.para2}</p>

              <p>{docData['Experience Certificate']?.para3}</p>
            </div>
            <div className="mt-24">
              <div className="font-bold text-[#4a9d2d] text-lg mb-12">For Tech Vaseegrah</div>
              <div className="mt-12">
                <div className="font-black text-gray-900">Sreekarthikeyan M</div>
                <div className="text-[#4a9d2d] font-bold text-sm">Founder & CEO</div>
              </div>
            </div>
          </div>
          <div className="footer-stripe"></div>
        </div>

        {/* Relieving Letter - EXACT FORMAT */}
        <div id="capture-Relieving-Letter" className="a4-preview">
          <div className="preview-badge">Relieving Letter</div>
          <div className="page-content relative z-10">
            <div className="flex justify-between items-end mb-2">
              <img src="/Invoicelogo.png" alt="Logo" className="h-12" />
              <div className="text-right text-[8px] text-[#4a9d2d] font-bold leading-tight">
                Regd. Office : 11, Vijaya Street, Srinivasapuram, Thanjavur - 613009<br />
                Phone Number : +91 85240 89733<br />
                Email : techvaseegrah@gmail.com
              </div>
            </div>
            <div className="header-separator-container">
              <div className="header-thin-line"></div>
              <div className="header-thick-line"></div>
            </div>
            <div className="text-right text-sm font-bold text-[#4a9d2d] mb-8">
              Date : {new Date(exitDetails.relievingDate).toLocaleDateString('en-GB')}
            </div>
            <h1 className="text-center text-lg font-bold text-[#4a9d2d] underline mb-10">Official Relieving Letter</h1>
            <div className="mb-10">
              <div className="font-bold">TO,</div>
              <div className="font-black text-xl uppercase">{worker?.name}</div>
              <div className="font-bold text-gray-600">{worker?.rfid || worker?.username}</div>
              <div className="font-bold text-gray-600">{exitDetails.designation}</div>
            </div>
            <div className="text-sm leading-relaxed text-justify space-y-6">
              <p className="font-bold">Dear {worker?.name.split(' ')[0]},</p>
              <p className="font-medium">{docData['Relieving Letter']?.para1}</p>
              <p className="font-medium">{docData['Relieving Letter']?.para2}</p>
              <p className="font-medium">We appreciate your services and wish you a bright future.</p>
            </div>
            <div className="mt-32">
              <div className="font-bold">For Tech Vaseegrah,</div>
              <div className="mt-20 font-black">Authorized Signatory</div>
            </div>
          </div>
          <div className="footer-stripe"></div>
        </div>        {/* Monthly Payslip - EXACT FORMAT (Dynamic loop) */}
        {(docData['Monthly Payslip'] || []).map((payslip, pIdx) => (
          <div key={pIdx} id={`capture-Monthly-Payslip-${pIdx}`} className="a4-preview">
            <div className="preview-badge">Salary Slip - {payslip.period}</div>
            <div className="watermark-container">
              <img src="/Invoicelogo.png" alt="Watermark" className="watermark-img" />
            </div>
            <div className="page-content relative z-10">
              <div className="text-center mb-8">
                <img src="/Invoicelogo.png" alt="Logo" className="h-16 mx-auto mb-2" />
                <h2 className="text-[#4a9d2d] text-2xl font-black border-b-2 border-gray-800 inline-block px-8 pb-1">MONTHLY PAYSLIP</h2>
                <p className="text-[10px] text-gray-500 font-bold mt-1 uppercase tracking-widest">{payslip.period}</p>
              </div>

              <div className="grid grid-cols-2 gap-y-2 text-[11px] mb-8 border-b border-gray-100 pb-4">
                <div className="flex gap-2"><span className="font-bold min-w-[100px]">Date of Joining</span>: {formatDate(exitDetails.joiningDate)}</div>
                <div className="flex gap-2"><span className="font-bold min-w-[100px]">Employee Name</span>: <span className="font-black">{worker?.name}</span></div>
                <div className="flex gap-2"><span className="font-bold min-w-[100px]">Pay Period</span>: {payslip.period}</div>
                <div className="flex gap-2"><span className="font-bold min-w-[100px]">Employee ID</span>: {worker?.rfid || worker?.username}</div>
                <div className="flex gap-2"><span className="font-bold min-w-[100px]">Designation</span>: {exitDetails.designation}</div>
              </div>

              <table className="payslip-table">
                <thead>
                  <tr>
                    <th>EARNINGS</th>
                    <th className="text-right">AMOUNT</th>
                    <th>DEDUCTIONS</th>
                    <th className="text-right">AMOUNT</th>
                  </tr>
                </thead>
                <tbody>
                  {[0, 1, 2, 3].map(i => (
                    <tr key={i}>
                      <td className="font-bold">{payslip.earnings?.[i]?.label || '-'}</td>
                      <td className="text-right">₹{payslip.earnings?.[i]?.value || 0}</td>
                      <td className="font-bold">{payslip.deductions?.[i]?.label || '-'}</td>
                      <td className="text-right">₹{payslip.deductions?.[i]?.value || 0}</td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <table className="summary-table">
                <tbody>
                  <tr>
                    <td className="label-cell">Total Earnings</td>
                    <td className="value-cell">₹{payslip.earnings?.reduce((sum, e) => sum + e.value, 0)}</td>
                  </tr>
                  <tr>
                    <td className="label-cell">Total Deductions</td>
                    <td className="value-cell">₹{payslip.deductions?.reduce((sum, d) => sum + d.value, 0)}</td>
                  </tr>
                </tbody>
              </table>

              <div className="mt-6 flex justify-end">
                <div className="text-right">
                  <div className="flex gap-8 items-baseline">
                    <span className="font-bold text-lg">Net Pay</span>
                    <span className="font-black text-2xl text-[#4a9d2d]">₹{payslip.earnings?.reduce((sum, e) => sum + e.value, 0) - payslip.deductions?.reduce((sum, d) => sum + d.value, 0)}</span>
                  </div>
                </div>
              </div>

              <div className="mt-32 flex justify-between px-4">
                <div className="text-center">
                  <div className="w-32 border-t-2 border-gray-800 pt-1 font-black text-[10px]">EMPLOYER SIGNATURE</div>
                </div>
                <div className="text-center">
                  <div className="w-32 border-t-2 border-gray-800 pt-1 font-black text-[10px]">EMPLOYEE SIGNATURE</div>
                </div>
              </div>
            </div>
            <div className="footer-stripe"></div>
          </div>
        ))}

        {/* Add more hidden captures for other docs if needed */}
      </div>
    </Modal>
  );
};

export default RelieveEmployeeModal;
