import React, { useState, useEffect, useMemo } from 'react';
import Card from '../common/Card';
import { deleteInvoice, updateInvoice, triggerInvoiceJobIntake, getInvoiceJobIntakePreview } from '../../services/invoiceService';
import { toast } from 'react-toastify';
import StageProofModal from './StageProofModal';
import SequentialRenumberModal from './SequentialRenumberModal';
import EditInvoiceNoModal from './EditInvoiceNoModal';

// Helper to normalize any date string to DD/MM/YYYY
const normalizeInvoiceDate = (dateStr) => {
  if (!dateStr) return '';
  dateStr = dateStr.trim();

  // Case 1: YYYY-MM-DD
  const ymdRegex = /^(\d{4})[-/](\d{2})[-/](\d{2})$/;
  let match = dateStr.match(ymdRegex);
  if (match) {
    const [_, yyyy, mm, dd] = match;
    return `${dd}/${mm}/${yyyy}`;
  }

  // Case 2: DD-MM-YYYY or DD/MM/YYYY
  const dmyRegex = /^(\d{2})[-/](\d{2})[-/](\d{4})$/;
  match = dateStr.match(dmyRegex);
  if (match) {
    const [_, dd, mm, yyyy] = match;
    return `${dd}/${mm}/${yyyy}`;
  }

  // Fallback: parse as standard date
  const parsedDate = new Date(dateStr);
  if (!isNaN(parsedDate.getTime())) {
    const dd = String(parsedDate.getDate()).padStart(2, '0');
    const mm = String(parsedDate.getMonth() + 1).padStart(2, '0');
    const yyyy = parsedDate.getFullYear();
    return `${dd}/${mm}/${yyyy}`;
  }

  return dateStr;
};

// Parse DD/MM/YYYY string to Date object for comparison
const parseDateForFilter = (dateStr) => {
  if (!dateStr) return null;
  const normalized = normalizeInvoiceDate(dateStr);
  const parts = normalized.split('/');
  if (parts.length === 3) {
    return new Date(parseInt(parts[2]), parseInt(parts[1]) - 1, parseInt(parts[0]));
  }
  return null;
};

const STAGES = ['Invoice', 'Payment Received', 'Work completion', 'Closure agreement'];

// Helper to determine if an invoice has been edited
const isInvoiceEdited = (invoice) => {
  if (!invoice) return false;
  if (invoice.isEdited) return true;
  if (!invoice.createdAt || !invoice.updatedAt) return false;
  const created = new Date(invoice.createdAt).getTime();
  const updated = new Date(invoice.updatedAt).getTime();
  return updated - created > 2000;
};

const InvoiceHistory = ({ invoices = [], onEditInvoice, onViewInvoice, onDeleteInvoice, onStatusUpdate, onRefresh }) => {
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [invoiceToDelete, setInvoiceToDelete] = useState(null);
  const [localInvoices, setLocalInvoices] = useState(invoices);
  const [isRenumberModalOpen, setIsRenumberModalOpen] = useState(false);
  const [invoiceForNoEdit, setInvoiceForNoEdit] = useState(null);

  // Search & Filter states
  const [searchQuery, setSearchQuery] = useState('');
  const [minPrice, setMinPrice] = useState('');
  const [maxPrice, setMaxPrice] = useState('');
  const [customerFilter, setCustomerFilter] = useState('');
  const [startDateFilter, setStartDateFilter] = useState('');
  const [endDateFilter, setEndDateFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [showFilters, setShowFilters] = useState(false);

  // Stage proof modal state
  const [isStageModalOpen, setIsStageModalOpen] = useState(false);
  const [selectedInvoiceForStage, setSelectedInvoiceForStage] = useState(null);
  const [targetStage, setTargetStage] = useState(null);

  // Image Preview Modal - supports gallery with multiple proofs
  const [previewGallery, setPreviewGallery] = useState(null);

  // Job Intake modal & processing states
  const [selectedInvoiceForIntake, setSelectedInvoiceForIntake] = useState(null);
  const [isJobIntakeModalOpen, setIsJobIntakeModalOpen] = useState(false);
  const [processingIntakeId, setProcessingIntakeId] = useState(null);
  const [intakeResultInfo, setIntakeResultInfo] = useState(null);
  const [intakeClassification, setIntakeClassification] = useState(null);
  const [isLoadingClassification, setIsLoadingClassification] = useState(false);
  const [intakeDepartments, setIntakeDepartments] = useState([]);
  const [selectedDepartmentId, setSelectedDepartmentId] = useState('');
  const [assignmentMode, setAssignmentMode] = useState('Individual'); // 'Individual' | 'Team' | 'Both'
  const [selectedMemberId, setSelectedMemberId] = useState('');
  const [selectedMemberIds, setSelectedMemberIds] = useState([]);
  const [teamSize, setTeamSize] = useState('');

  // Helper: get all proofs from a stage detail field
  const getProofs = (details) => {
    if (!details) return [];
    if (details.proofs && details.proofs.length > 0) return details.proofs.filter(p => (p.url || p.proof || (typeof p === 'string' && p.trim() !== '')));
    if (details.proof && String(details.proof).trim().length > 0) return [{ date: details.date, url: details.proof }];
    return [];
  };

  // Helper: determine effective invoice type (proof for new ones, preserves TAX INVOICE for old ones)
  const getEffectiveInvoiceType = (invoice) => {
    if (!invoice) return 'PROFORMA INVOICE';
    const paymentProofs = getProofs(invoice.paymentDetails);
    if (paymentProofs.length > 0 || invoice.invoiceType === 'TAX INVOICE' || invoice.isPaid) {
      return 'TAX INVOICE';
    }
    return invoice.invoiceType || 'PROFORMA INVOICE';
  };

  const openGallery = (images, title) => {
    if (images.length > 0) {
      setPreviewGallery({ images, currentIndex: 0, title });
    }
  };

  // Update local state when invoices prop changes
  useEffect(() => {
    setLocalInvoices(invoices);
  }, [invoices]);

  // Get unique customer names for filter dropdown
  const uniqueCustomers = useMemo(() => {
    const names = localInvoices
      .map(inv => inv.customerName)
      .filter(name => name && name.trim() !== '')
      .filter((name, index, self) => self.indexOf(name) === index)
      .sort();
    return names;
  }, [localInvoices]);

  // Format date for display
  const formatDate = (dateString) => {
    if (!dateString) return 'N/A';
    const date = new Date(dateString);
    return date.toLocaleDateString('en-IN', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric'
    });
  };

  // Helper to parse invoice date to a comparable Date object
  const getInvoiceDateObj = (invoice) => {
    if (invoice.actualDate) return new Date(invoice.actualDate);
    if (invoice.invoiceDate) {
      const str = String(invoice.invoiceDate).trim();
      const dmy = str.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/);
      if (dmy) {
        return new Date(parseInt(dmy[3], 10), parseInt(dmy[2], 10) - 1, parseInt(dmy[1], 10));
      }
      const ymd = str.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/);
      if (ymd) {
        return new Date(parseInt(ymd[1], 10), parseInt(ymd[2], 10) - 1, parseInt(ymd[3], 10));
      }
      const parsed = new Date(str);
      if (!isNaN(parsed.getTime())) return parsed;
    }
    if (invoice.createdAt) return new Date(invoice.createdAt);
    return new Date();
  };

  // Calculate total amount for an invoice
  const calculateTotal = (invoice) => {
    const subtotal = invoice.items.reduce((sum, item) =>
      sum + (item.isTotalOverridden ? item.total : (item.qty * item.rate)), 0);

    const gstTotal = (invoice.gstEnabled) ?
      invoice.items.reduce((sum, item) =>
        sum + (item.isTotalOverridden ? (item.total * item.gst / 100) : (item.qty * item.rate * item.gst / 100)), 0) : 0;

    return subtotal + gstTotal;
  };

  // Filtered invoices based on search, date, customer, price, and status
  const filteredInvoices = useMemo(() => {
    return localInvoices.filter(invoice => {
      // Search query filter (invoice number, customer name, customer contact)
      if (searchQuery) {
        const query = searchQuery.toLowerCase().trim();
        const matchesInvoiceNo = invoice.invoiceNo?.toLowerCase().includes(query);
        const matchesCustomer = invoice.customerName?.toLowerCase().includes(query);
        const matchesContact = invoice.customerContact?.toLowerCase().includes(query);
        if (!matchesInvoiceNo && !matchesCustomer && !matchesContact) return false;
      }

      // Customer filter
      if (customerFilter && invoice.customerName !== customerFilter) {
        return false;
      }

      // Status filter
      if (statusFilter && getEffectiveStatus(invoice) !== statusFilter) {
        return false;
      }

      // Date range filter
      if (startDateFilter || endDateFilter) {
        const invDate = getInvoiceDateObj(invoice);
        if (startDateFilter) {
          const start = new Date(startDateFilter);
          start.setHours(0, 0, 0, 0);
          if (invDate < start) return false;
        }
        if (endDateFilter) {
          const end = new Date(endDateFilter);
          end.setHours(23, 59, 59, 999);
          if (invDate > end) return false;
        }
      }

      // Price range filter
      const total = calculateTotal(invoice);
      if (minPrice !== '' && total < parseFloat(minPrice)) return false;
      if (maxPrice !== '' && total > parseFloat(maxPrice)) return false;

      return true;
    });
  }, [localInvoices, searchQuery, customerFilter, statusFilter, startDateFilter, endDateFilter, minPrice, maxPrice]);

  // Handle delete invoice - show confirmation modal
  const handleDeleteClick = (invoiceId) => {
    setInvoiceToDelete(invoiceId);
    setShowDeleteModal(true);
  };

  // Confirm delete
  const confirmDelete = async () => {
    if (!invoiceToDelete) return;

    try {
      const response = await deleteInvoice(invoiceToDelete);
      if (response.success) {
        setLocalInvoices(prevInvoices =>
          prevInvoices.filter(invoice => invoice._id !== invoiceToDelete)
        );

        if (onDeleteInvoice) {
          onDeleteInvoice(invoiceToDelete);
        }
      } else {
        alert('Failed to delete invoice: ' + response.message);
      }
    } catch (error) {
      console.error('Error deleting invoice:', error);
      alert('Error deleting invoice: ' + (error.message || 'Unknown error'));
    } finally {
      setShowDeleteModal(false);
      setInvoiceToDelete(null);
    }
  };

  // Cancel delete
  const cancelDelete = () => {
    setShowDeleteModal(false);
    setInvoiceToDelete(null);
  };

  // Handle status update
  const handleStatusUpdate = async (invoiceId, newStatus) => {
    const proofStages = ['Payment Received', 'Work completion', 'Closure agreement'];
    
    if (proofStages.includes(newStatus)) {
      const invoice = localInvoices.find(inv => inv._id === invoiceId);
      setSelectedInvoiceForStage(invoice);
      setTargetStage(newStatus);
      setIsStageModalOpen(true);
      return;
    }

    await performStatusUpdate(invoiceId, { status: newStatus });
  };

  const performStatusUpdate = async (invoiceId, updateData) => {
    try {
      const response = await updateInvoice(invoiceId, updateData);
      if (response.success) {
        setLocalInvoices(prev => prev.map(inv => 
          inv._id === invoiceId ? { ...inv, ...updateData } : inv
        ));

        if (onStatusUpdate) {
          onStatusUpdate(invoiceId, updateData);
        }
        
        toast.success(`Status updated successfully`);
        return true;
      }
    } catch (error) {
      console.error('Error updating status:', error);
      toast.error('Failed to update status');
      return false;
    }
  };

  const handleStageConfirm = async (stageData) => {
    if (!selectedInvoiceForStage || !targetStage) return;
    
    const stageFieldMap = {
      'Payment Received': 'paymentDetails',
      'Work completion': 'workDetails',
      'Closure agreement': 'closureDetails'
    };

    let newStatus = targetStage;
    let newStageData = stageData;

    if (!stageData || (!stageData.proof && (!stageData.proofs || stageData.proofs.length === 0))) {
      newStageData = null;
      if (targetStage === 'Payment Received') {
        newStatus = 'Invoice';
      } else if (targetStage === 'Work completion') {
        newStatus = 'Payment Received';
      } else if (targetStage === 'Closure agreement') {
        newStatus = 'Work completion';
      }
    }

    const paymentInfo = targetStage === 'Payment Received' ? newStageData : selectedInvoiceForStage.paymentDetails;
    const hasPaymentProof = !!(paymentInfo && ((Array.isArray(paymentInfo.proofs) && paymentInfo.proofs.length > 0) || paymentInfo.proof));

    const updateData = {
      status: newStatus,
      [stageFieldMap[targetStage]]: newStageData,
      invoiceType: hasPaymentProof ? 'TAX INVOICE' : (selectedInvoiceForStage.invoiceType || 'PROFORMA INVOICE')
    };

    const success = await performStatusUpdate(selectedInvoiceForStage._id, updateData);

    if (success) {
      setIsStageModalOpen(false);
      setSelectedInvoiceForStage(null);
      setTargetStage(null);
    }
  };

  // Check if an invoice has completed authorized payment verification
  const isInvoiceEligibleForJobIntake = (invoice) => {
    if (!invoice) return false;
    const paymentProofs = getProofs(invoice.paymentDetails);
    const hasPaymentProof = paymentProofs.length > 0 || !!(invoice.paymentDetails && invoice.paymentDetails.proof);

    // Status must be Payment Received, Work completion, Closure agreement, isPaid, or TAX INVOICE
    const isVerifiedStatus = (
      invoice.status === 'Payment Received' ||
      invoice.status === 'Work completion' ||
      invoice.status === 'Closure agreement' ||
      invoice.isPaid ||
      invoice.invoiceType === 'TAX INVOICE'
    );

    return Boolean(hasPaymentProof && isVerifiedStatus);
  };

  const handleJobIntakeClick = async (invoice) => {
    setSelectedInvoiceForIntake(invoice);
    setIntakeResultInfo(null);
    setIntakeClassification(null);
    setIntakeDepartments([]);
    setSelectedDepartmentId('');
    setAssignmentMode('Individual');
    setSelectedMemberId('');
    setSelectedMemberIds([]);
    setTeamSize('');
    setIsLoadingClassification(true);
    setIsJobIntakeModalOpen(true);

    try {
      const res = await getInvoiceJobIntakePreview(invoice._id);
      if (res && res.success && res.data) {
        setIntakeClassification(res.data);
        const depts = Array.isArray(res.data.departments) ? res.data.departments : [];
        setIntakeDepartments(depts);

        if (depts.length > 0) {
          const defaultDeptId = res.data.suggestedDepartmentId || depts[0]._id;
          setSelectedDepartmentId(defaultDeptId);
          const dept = depts.find(d => d._id === defaultDeptId) || depts[0];
          if (dept && Array.isArray(dept.members) && dept.members.length > 0) {
            const firstEligible = dept.members.find(m => m.isEligible !== false) || dept.members[0];
            setSelectedMemberId(firstEligible._id);
            setSelectedMemberIds([firstEligible._id]);
          }
        }
      }
    } catch (err) {
      console.warn('Could not fetch preview job intake classification:', err);
    } finally {
      setIsLoadingClassification(false);
    }
  };

  const handleIntakeDepartmentChange = (deptId) => {
    setSelectedDepartmentId(deptId);
    setTeamSize('');
    const dept = intakeDepartments.find(d => d._id === deptId);
    const members = dept?.members || [];
    const firstEligible = members.find(m => m.isEligible !== false) || members[0];
    if (firstEligible) {
      setSelectedMemberId(firstEligible._id);
      setSelectedMemberIds([firstEligible._id]);
    } else {
      setSelectedMemberId('');
      setSelectedMemberIds([]);
    }
  };

  const handleIntakeAssignmentModeChange = (mode) => {
    setAssignmentMode(mode);
    setTeamSize('');
    const dept = intakeDepartments.find(d => d._id === selectedDepartmentId);
    const members = dept?.members || [];
    const firstEligible = members.find(m => m.isEligible !== false) || members[0];
    if (firstEligible) {
      setSelectedMemberId(firstEligible._id);
      setSelectedMemberIds([firstEligible._id]);
    } else {
      setSelectedMemberId('');
      setSelectedMemberIds([]);
    }
  };

  const handleSelectAllMembers = () => {
    const dept = intakeDepartments.find(d => d._id === selectedDepartmentId);
    const members = dept?.members || [];
    const allIds = members.map(m => m._id);
    setSelectedMemberIds(allIds);
    if (!selectedMemberId && allIds.length > 0) {
      setSelectedMemberId(allIds[0]);
    }
  };

  const handleClearMemberSelection = () => {
    setSelectedMemberIds([]);
    setSelectedMemberId('');
  };

  const handleToggleIntakeMember = (memberId) => {
    setSelectedMemberIds(prev => {
      const exists = prev.includes(memberId);
      const next = exists ? prev.filter(id => id !== memberId) : [...prev, memberId];
      if (!exists && !selectedMemberId) {
        setSelectedMemberId(memberId);
      } else if (exists && selectedMemberId === memberId) {
        setSelectedMemberId(next[0] || '');
      }
      return next;
    });
  };

  // Lock background body scrolling when Job Intake modal is active
  useEffect(() => {
    if (isJobIntakeModalOpen) {
      const originalOverflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      const handleKeyDown = (e) => {
        if (e.key === 'Escape' && processingIntakeId !== selectedInvoiceForIntake?._id) {
          setIsJobIntakeModalOpen(false);
          setSelectedInvoiceForIntake(null);
          setIntakeResultInfo(null);
        }
      };
      window.addEventListener('keydown', handleKeyDown);
      return () => {
        document.body.style.overflow = originalOverflow;
        window.removeEventListener('keydown', handleKeyDown);
      };
    }
  }, [isJobIntakeModalOpen, processingIntakeId, selectedInvoiceForIntake]);

  const handleConfirmJobIntake = async () => {
    if (!selectedInvoiceForIntake) return;
    const currentDept = intakeDepartments.find(d => d._id === selectedDepartmentId);
    const deptMembers = currentDept?.members || [];
    const eligibleMembers = deptMembers.filter(m => m.isEligible !== false);
    const eligibleCount = currentDept?.eligibleMemberCount ?? eligibleMembers.length;

    if (intakeDepartments.length > 0 && (!currentDept || deptMembers.length === 0)) {
      toast.error(`Selected department '${currentDept?.name || ''}' has no active members.`);
      return;
    }

    if (eligibleCount === 0) {
      toast.error(`Selected department '${currentDept?.name || ''}' has no eligible active members (all on leave or at capacity).`);
      return;
    }

    let parsedTeamSize = null;

    if (assignmentMode === 'Individual') {
      if (!selectedMemberId) {
        toast.error('Please select an active member to assign.');
        return;
      }
      const chosenWorker = deptMembers.find(m => m._id === selectedMemberId);
      if (chosenWorker && chosenWorker.isEligible === false) {
        toast.error(`Selected employee ${chosenWorker.name} is ineligible: ${chosenWorker.ineligibilityReason || 'Unavailable'}.`);
        return;
      }
    } else if (assignmentMode === 'Team') {
      if (!teamSize || String(teamSize).trim() === '') {
        toast.error('Please enter the Number of Team Members.');
        return;
      }
      parsedTeamSize = parseInt(teamSize, 10);
      if (!Number.isInteger(parsedTeamSize) || parsedTeamSize <= 0) {
        toast.error('Number of Team Members must be a positive integer.');
        return;
      }
      if (parsedTeamSize > eligibleCount) {
        toast.error(`Requested team size (${parsedTeamSize}) exceeds the number of eligible employees (${eligibleCount}) in department '${currentDept?.name}'.`);
        return;
      }
    } else if (assignmentMode === 'Both') {
      if (!selectedMemberId) {
        toast.error('Please designate a primary lead member for Both assignment mode.');
        return;
      }
      const leadWorker = deptMembers.find(m => m._id === selectedMemberId);
      if (leadWorker && leadWorker.isEligible === false) {
        toast.error(`Designated lead ${leadWorker.name} is ineligible: ${leadWorker.ineligibilityReason || 'Unavailable'}. Please select an eligible lead.`);
        return;
      }
      if (!teamSize || String(teamSize).trim() === '') {
        toast.error('Please enter the Number of Team Members (must be at least 2).');
        return;
      }
      parsedTeamSize = parseInt(teamSize, 10);
      if (!Number.isInteger(parsedTeamSize) || parsedTeamSize < 2) {
        toast.error('In Both mode, team size must be at least 2 (lead + 1 or more members).');
        return;
      }
      if (parsedTeamSize > eligibleCount) {
        toast.error(`Requested team size (${parsedTeamSize}) exceeds the number of eligible employees (${eligibleCount}) in department '${currentDept?.name}'.`);
        return;
      }
    }

    try {
      setProcessingIntakeId(selectedInvoiceForIntake._id);
      const res = await triggerInvoiceJobIntake(selectedInvoiceForIntake._id, {
        departmentId: currentDept?._id,
        departmentName: currentDept?.name,
        assignmentMode,
        teamSize: parsedTeamSize,
        requiredMembersCount: parsedTeamSize,
        selectedMemberId: assignmentMode === 'Individual'
          ? selectedMemberId
          : (assignmentMode === 'Both' ? selectedMemberId : null),
        selectedMemberIds: assignmentMode === 'Individual'
          ? [selectedMemberId]
          : [],
        selectedJobType: currentDept?.name || 'Website Development'
      });

      if (res.success) {
        setIntakeResultInfo(res.data);
        if (res.data?.isRecovered) {
          toast.success(res.message || 'Job ticket was successfully recovered for this invoice!');
        } else if (res.data?.isDuplicate) {
          toast.info(res.message || 'Job intake updated for this invoice.');
        } else {
          toast.success(res.message || 'Job intake processed and ticket created successfully!');
        }
        if (onRefresh) {
          onRefresh();
        }
      }
    } catch (err) {
      console.error('Error triggering job intake:', err);
      toast.error(err.message || 'Failed to trigger job intake');
    } finally {
      setProcessingIntakeId(null);
    }
  };

  const getEffectiveStatus = (invoice) => {
    if (!invoice) return 'Invoice';
    const status = invoice.status || 'Invoice';
    const explicitIdx = STAGES.indexOf(status);

    const hasClosure = !!(invoice.closureDetails && (getProofs(invoice.closureDetails).length > 0 || invoice.closureDetails.proof));
    if (hasClosure || explicitIdx >= 3) return 'Closure agreement';

    const hasWork = !!(invoice.workDetails && (getProofs(invoice.workDetails).length > 0 || invoice.workDetails.proof));
    if (hasWork || explicitIdx >= 2) return 'Work completion';

    // Payment proof or legacy paid/TAX INVOICE status for old records
    const paymentProofs = getProofs(invoice.paymentDetails);
    const hasPayment = paymentProofs.length > 0;
    const isLegacyPaid = invoice.invoiceType === 'TAX INVOICE' || invoice.status === 'Payment Received' || invoice.isPaid || explicitIdx >= 1;
    if (hasPayment || isLegacyPaid) return 'Payment Received';

    return 'Invoice';
  };

  const getStatusIndex = (statusOrInvoice) => {
    if (typeof statusOrInvoice === 'object' && statusOrInvoice !== null) {
      const effectiveStatus = getEffectiveStatus(statusOrInvoice);
      return STAGES.indexOf(effectiveStatus);
    }
    const index = STAGES.indexOf(statusOrInvoice);
    return index === -1 ? 0 : index;
  };

  const clearFilters = () => {
    setSearchQuery('');
    setMinPrice('');
    setMaxPrice('');
    setCustomerFilter('');
    setStartDateFilter('');
    setEndDateFilter('');
    setStatusFilter('');
  };

  const applyQuickDate = (preset) => {
    const now = new Date();
    if (preset === 'today') {
      const d = now.toISOString().split('T')[0];
      setStartDateFilter(d);
      setEndDateFilter(d);
    } else if (preset === 'week') {
      const start = new Date(now);
      start.setDate(now.getDate() - now.getDay());
      const end = new Date(start);
      end.setDate(start.getDate() + 6);
      setStartDateFilter(start.toISOString().split('T')[0]);
      setEndDateFilter(end.toISOString().split('T')[0]);
    } else if (preset === 'month') {
      const start = new Date(now.getFullYear(), now.getMonth(), 1);
      const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
      setStartDateFilter(start.toISOString().split('T')[0]);
      setEndDateFilter(end.toISOString().split('T')[0]);
    } else {
      setStartDateFilter('');
      setEndDateFilter('');
    }
  };

  const hasActiveFilters = searchQuery || minPrice || maxPrice || customerFilter || startDateFilter || endDateFilter || statusFilter;

  // Stage progress component (shared between table and card views)
  const StageProgress = ({ invoice }) => {
    const effectiveStatus = getEffectiveStatus(invoice);
    const currentIdx = getStatusIndex(effectiveStatus);
    return (
      <div className="flex flex-col gap-1.5">
        <div className="flex items-center gap-0">
          {STAGES.map((stage, index) => {
            const isCompleted = index < currentIdx;
            const isCurrent = index === currentIdx;
            return (
              <div key={stage} className="flex items-center">
                <button
                  onClick={() => handleStatusUpdate(invoice._id, stage)}
                  title={stage}
                  className={`rounded-full transition-all duration-200 flex-shrink-0 ${ isCurrent ? 'w-4 h-4 bg-[#0d9488] ring-[3px] ring-teal-100 shadow-sm' : isCompleted ? 'w-3 h-3 bg-teal-500' : 'w-3 h-3 bg-gray-200 hover:bg-gray-300' }`}
                />
                {index < STAGES.length - 1 && (
                  <div className={`w-5 h-[2px] flex-shrink-0 ${ index < currentIdx ? 'bg-teal-500' : 'bg-gray-200' }`} />
                )}
              </div>
            );
          })}
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-bold text-[#0d9488] tracking-wider leading-none">
            {effectiveStatus}
          </span>
          <ProofIcons invoice={invoice} />
        </div>
      </div>
    );
  };

  // Proof icons component
  const ProofIcons = ({ invoice }) => {
    const paymentProofs = getProofs(invoice.paymentDetails);
    const workProofs = getProofs(invoice.workDetails);
    const closureProofs = getProofs(invoice.closureDetails);

    return (
      <div className="flex items-center gap-1">
        {paymentProofs.length > 0 && (
          <button
            onClick={() => openGallery(paymentProofs, 'Payment Proof')}
            className="relative inline-flex items-center justify-center w-5 h-5 bg-teal-50 hover:bg-teal-100 rounded transition-colors"
            title={`Payment Proof${paymentProofs.length > 1 ? `s (${paymentProofs.length})` : ''}`}
          >
            <svg className="w-3.5 h-3.5 text-teal-600 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            {paymentProofs.length > 1 && (
              <span className="absolute -top-1 -right-1 bg-[#0d9488] text-white text-[7px] font-bold rounded-full min-w-[12px] h-[12px] flex items-center justify-center px-0.5 leading-none">{paymentProofs.length}</span>
            )}
          </button>
        )}
        {workProofs.length > 0 && (
          <button
            onClick={() => openGallery(workProofs, 'Work Completion Proof')}
            className="relative inline-flex items-center justify-center w-5 h-5 bg-green-50 hover:bg-green-100 rounded transition-colors"
            title={`Work Proof${workProofs.length > 1 ? `s (${workProofs.length})` : ''}`}
          >
            <svg className="w-3.5 h-3.5 text-green-500 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            {workProofs.length > 1 && (
              <span className="absolute -top-1 -right-1 bg-green-600 text-white text-[7px] font-bold rounded-full min-w-[12px] h-[12px] flex items-center justify-center px-0.5 leading-none">{workProofs.length}</span>
            )}
          </button>
        )}
        {closureProofs.length > 0 && (
          <button
            onClick={() => openGallery(closureProofs, 'Closure Proof')}
            className="relative inline-flex items-center justify-center w-5 h-5 bg-purple-50 hover:bg-purple-100 rounded transition-colors"
            title={`Closure Proof${closureProofs.length > 1 ? `s (${closureProofs.length})` : ''}`}
          >
            <svg className="w-3.5 h-3.5 text-purple-500 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
            {closureProofs.length > 1 && (
              <span className="absolute -top-1 -right-1 bg-purple-600 text-white text-[7px] font-bold rounded-full min-w-[12px] h-[12px] flex items-center justify-center px-0.5 leading-none">{closureProofs.length}</span>
            )}
          </button>
        )}
      </div>
    );
  };

  return (
    <div className="w-full bg-white font-sans">
      {/* Search & Filter Bar */}
      <div className="mb-4 space-y-3">
        {/* Search row */}
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by invoice number or customer name..."
              className="w-full pl-10 pr-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-400 transition-all bg-gray-50/50"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            )}
          </div>
          <button
            onClick={() => setIsRenumberModalOpen(true)}
            className="flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl text-sm font-bold bg-[#f0fdf4] text-[#166534] hover:bg-[#dcfce7] border border-[#bbf7d0] transition-all shadow-xs whitespace-nowrap"
            title="Batch Sequential Renumber Invoices"
          >
            <span className="text-base leading-none">🔢</span>
            Sequential Renumber
          </button>
          <button
            onClick={() => setShowFilters(!showFilters)}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium border transition-all whitespace-nowrap ${
              showFilters || hasActiveFilters
                ? 'bg-teal-50 text-[#0d9488] border-teal-200'
                : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
            }`}
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
            </svg>
            Filters
            {hasActiveFilters && (
              <span className="w-2 h-2 bg-[#0d9488] rounded-full"></span>
            )}
          </button>
        </div>

        {/* Expandable filter row */}
        {showFilters && (
          <div className="p-4 bg-gray-50/90 rounded-2xl border border-gray-200/80 shadow-inner space-y-3.5 animate-in slide-in-from-top-2 duration-200">
            {/* Quick date presets */}
            <div className="flex flex-wrap items-center gap-2 pb-2 border-b border-gray-200/60">
              <span className="text-xs font-bold text-gray-500 mr-1">Quick Date:</span>
              {[
                { id: 'all', label: 'All Time' },
                { id: 'today', label: 'Today' },
                { id: 'week', label: 'This Week' },
                { id: 'month', label: 'This Month' }
              ].map(preset => (
                <button
                  key={preset.id}
                  onClick={() => applyQuickDate(preset.id)}
                  className="px-3 py-1 bg-white hover:bg-teal-50 hover:text-teal-700 text-xs font-semibold text-gray-600 rounded-lg border border-gray-200 transition-colors shadow-xs"
                >
                  {preset.label}
                </button>
              ))}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
              {/* Date range */}
              <div className="space-y-1">
                <label className="block text-xs font-bold text-gray-600">Date Range</label>
                <div className="flex items-center gap-1.5">
                  <input
                    type="date"
                    value={startDateFilter}
                    onChange={(e) => setStartDateFilter(e.target.value)}
                    className="w-full px-2.5 py-2 border border-gray-200 rounded-lg text-xs font-medium focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 bg-white"
                  />
                  <span className="text-gray-400 text-xs">to</span>
                  <input
                    type="date"
                    value={endDateFilter}
                    onChange={(e) => setEndDateFilter(e.target.value)}
                    className="w-full px-2.5 py-2 border border-gray-200 rounded-lg text-xs font-medium focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 bg-white"
                  />
                </div>
              </div>

              {/* Customer filter */}
              <div className="space-y-1">
                <label className="block text-xs font-bold text-gray-600">Customer</label>
                <select
                  value={customerFilter}
                  onChange={(e) => setCustomerFilter(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-xs font-medium focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 bg-white"
                >
                  <option value="">All Customers ({uniqueCustomers.length})</option>
                  {uniqueCustomers.map(name => (
                    <option key={name} value={name}>{name}</option>
                  ))}
                </select>
              </div>

              {/* Price range */}
              <div className="space-y-1">
                <label className="block text-xs font-bold text-gray-600">Price Range (₹)</label>
                <div className="flex items-center gap-1.5">
                  <input
                    type="number"
                    value={minPrice}
                    onChange={(e) => setMinPrice(e.target.value)}
                    placeholder="Min ₹"
                    className="w-full px-2.5 py-2 border border-gray-200 rounded-lg text-xs font-medium focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 bg-white"
                  />
                  <span className="text-gray-400 text-xs">to</span>
                  <input
                    type="number"
                    value={maxPrice}
                    onChange={(e) => setMaxPrice(e.target.value)}
                    placeholder="Max ₹"
                    className="w-full px-2.5 py-2 border border-gray-200 rounded-lg text-xs font-medium focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 bg-white"
                  />
                </div>
              </div>

              {/* Status / Stage Filter */}
              <div className="space-y-1">
                <label className="block text-xs font-bold text-gray-600">Stage / Status</label>
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-xs font-medium focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 bg-white"
                >
                  <option value="">All Stages</option>
                  {STAGES.map(st => (
                    <option key={st} value={st}>{st}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Clear filters row */}
            {hasActiveFilters && (
              <div className="flex items-center justify-between pt-2 border-t border-gray-200/60">
                <div className="flex flex-wrap gap-1.5 items-center text-xs">
                  <span className="text-gray-400 font-medium mr-1">Active:</span>
                  {searchQuery && (
                    <span className="inline-flex items-center gap-1 bg-teal-50 text-teal-700 px-2 py-0.5 rounded-md font-medium text-[11px] border border-teal-200">
                      Query: "{searchQuery}"
                      <button onClick={() => setSearchQuery('')} className="hover:text-teal-900 ml-0.5">×</button>
                    </span>
                  )}
                  {customerFilter && (
                    <span className="inline-flex items-center gap-1 bg-blue-50 text-blue-700 px-2 py-0.5 rounded-md font-medium text-[11px] border border-blue-200">
                      Customer: {customerFilter}
                      <button onClick={() => setCustomerFilter('')} className="hover:text-blue-900 ml-0.5">×</button>
                    </span>
                  )}
                  {(startDateFilter || endDateFilter) && (
                    <span className="inline-flex items-center gap-1 bg-purple-50 text-purple-700 px-2 py-0.5 rounded-md font-medium text-[11px] border border-purple-200">
                      Date: {startDateFilter || '...'} to {endDateFilter || '...'}
                      <button onClick={() => { setStartDateFilter(''); setEndDateFilter(''); }} className="hover:text-purple-900 ml-0.5">×</button>
                    </span>
                  )}
                  {(minPrice || maxPrice) && (
                    <span className="inline-flex items-center gap-1 bg-amber-50 text-amber-700 px-2 py-0.5 rounded-md font-medium text-[11px] border border-amber-200">
                      Price: ₹{minPrice || '0'} - ₹{maxPrice || '∞'}
                      <button onClick={() => { setMinPrice(''); setMaxPrice(''); }} className="hover:text-amber-900 ml-0.5">×</button>
                    </span>
                  )}
                  {statusFilter && (
                    <span className="inline-flex items-center gap-1 bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded-md font-medium text-[11px] border border-emerald-200">
                      Stage: {statusFilter}
                      <button onClick={() => setStatusFilter('')} className="hover:text-emerald-900 ml-0.5">×</button>
                    </span>
                  )}
                </div>
                <button
                  onClick={clearFilters}
                  className="text-xs font-bold text-red-600 hover:text-red-800 hover:underline transition-colors flex items-center gap-1 flex-shrink-0 ml-auto"
                >
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                  Clear All Filters
                </button>
              </div>
            )}
          </div>
        )}

        {/* Results count */}
        {hasActiveFilters && (
          <div className="text-xs text-gray-500 font-medium">
            Showing {filteredInvoices.length} of {localInvoices.length} invoices
          </div>
        )}
      </div>

      {filteredInvoices.length === 0 ? (
        <Card className="p-12 text-center border-dashed border-2 border-gray-200">
           <div className="flex flex-col items-center">
            <div className="bg-gray-100 p-4 rounded-full mb-4">
                <svg className="h-12 w-12 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
            </div>
            <h3 className="text-lg font-medium text-gray-900 mb-1">
              {hasActiveFilters ? 'No invoices match your filters' : 'No invoices found'}
            </h3>
            <p className="text-gray-500">
              {hasActiveFilters ? 'Try adjusting your search or filter criteria.' : 'Create your first invoice to see it here.'}
            </p>
            {hasActiveFilters && (
              <button onClick={clearFilters} className="mt-3 text-sm text-[#0d9488] font-semibold hover:underline">
                Clear all filters
              </button>
            )}
          </div>
        </Card>
      ) : (
        <>
          {/* Desktop Table View */}
          <div className="hidden md:block w-full rounded-xl border border-gray-200 shadow-sm overflow-hidden">
            <table className="w-full table-fixed">
              <colgroup>
                <col style={{ width: '11%' }} />
                <col style={{ width: '10%' }} />
                <col style={{ width: '14%' }} />
                <col style={{ width: '9%' }} />
                <col style={{ width: '10%' }} />
                <col style={{ width: '28%' }} />
                <col style={{ width: '18%' }} />
              </colgroup>
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  <th className="py-3.5 px-4 text-left text-xs font-bold text-gray-500 tracking-wider">Invoice No</th>
                  <th className="py-3.5 px-4 text-left text-xs font-bold text-gray-500 tracking-wider">Date</th>
                  <th className="py-3.5 px-4 text-left text-xs font-bold text-gray-500 tracking-wider">Customer</th>
                  <th className="py-3.5 px-4 text-center text-xs font-bold text-gray-500 tracking-wider">Type</th>
                  <th className="py-3.5 px-4 text-right text-xs font-bold text-gray-500 tracking-wider">Amount</th>
                  <th className="py-3.5 px-4 text-left text-xs font-bold text-gray-500 tracking-wider">Stage Progress</th>
                  <th className="py-3.5 px-4 text-center text-xs font-bold text-gray-500 tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filteredInvoices.map((invoice) => (
                  <tr key={invoice._id} className="hover:bg-teal-50/20 transition-colors">
                    <td className="py-3.5 px-4 text-sm font-semibold text-gray-900 group">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="truncate">{invoice.invoiceNo}</span>
                        <button
                          onClick={() => setInvoiceForNoEdit(invoice)}
                          className="opacity-0 group-hover:opacity-100 hover:!opacity-100 text-gray-400 hover:text-[#0d9488] transition-opacity p-0.5 rounded"
                          title="Change this invoice number"
                        >
                          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                          </svg>
                        </button>
                        {isInvoiceEdited(invoice) && (
                          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-300 shadow-sm" title={`Edited on ${invoice.updatedAt ? new Date(invoice.updatedAt).toLocaleString('en-IN') : 'Unknown'}`}>
                            <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                            </svg>
                            Edited
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="py-3.5 px-4 text-sm text-gray-500">{normalizeInvoiceDate(invoice.invoiceDate) || formatDate(invoice.createdAt)}</td>
                    <td className="py-3.5 px-4 text-sm">
                      <div className="font-medium text-gray-800 truncate">{invoice.customerName || 'N/A'}</div>
                      {invoice.customerContact && <div className="text-xs text-gray-400 truncate">{invoice.customerContact}</div>}
                    </td>
                    <td className="py-3.5 px-4 text-center">
                      <span className={`inline-block px-2.5 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider ${
                        getEffectiveInvoiceType(invoice) === 'TAX INVOICE'
                          ? 'bg-amber-100 text-amber-800 border border-amber-200'
                          : 'bg-sky-50 text-sky-700 border border-sky-200'
                      }`}>
                        {getEffectiveInvoiceType(invoice)}
                      </span>
                    </td>
                    <td className="py-3.5 px-4 text-sm font-bold text-gray-900 text-right whitespace-nowrap">
                      <div className="flex items-center justify-end gap-2">
                        {invoice.isPaid && (
                          <div className="w-2.5 h-2.5 rounded-full bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.6)]" title="Paid"></div>
                        )}
                        <span>₹{calculateTotal(invoice).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                      </div>
                    </td>
                    <td className="py-3.5 px-4">
                      <StageProgress invoice={invoice} />
                    </td>
                    <td className="py-3.5 px-4 text-center">
                      <div className="flex justify-center items-center gap-2">
                        {onViewInvoice && (
                          <>
                            <button
                              onClick={() => onViewInvoice(invoice)}
                              className="text-blue-500 hover:text-blue-700 text-sm font-semibold transition-colors"
                              title="View invoice without editing"
                            >
                              View
                            </button>
                            <span className="text-gray-200">|</span>
                          </>
                        )}
                        <button
                          onClick={() => onEditInvoice(invoice)}
                          className="text-amber-600 hover:text-amber-700 text-sm font-semibold transition-colors"
                        >
                          Edit
                        </button>
                        <span className="text-gray-200">|</span>
                        <button
                          onClick={() => handleDeleteClick(invoice._id)}
                          className="text-red-500 hover:text-red-700 text-sm font-semibold transition-colors"
                        >
                          Delete
                        </button>
                        {isInvoiceEligibleForJobIntake(invoice) && (
                          <>
                            <span className="text-gray-200">|</span>
                            <button
                              onClick={() => handleJobIntakeClick(invoice)}
                              disabled={processingIntakeId === invoice._id}
                              className="text-emerald-600 hover:text-emerald-800 text-sm font-semibold transition-colors disabled:opacity-50 flex items-center gap-1"
                              title="Register Job Intake and create Work Allocation ticket"
                            >
                              {processingIntakeId === invoice._id ? 'Processing...' : 'Job Intake'}
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile Card View */}
          <div className="md:hidden space-y-3">
            {filteredInvoices.map((invoice) => (
              <div key={invoice._id} className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden hover:shadow-md transition-shadow">
                {/* Card Header */}
                <div className="flex items-center justify-between px-4 py-3 bg-gray-50/80 border-b border-gray-100">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-bold text-gray-900">{invoice.invoiceNo}</span>
                    <button
                      onClick={() => setInvoiceForNoEdit(invoice)}
                      className="text-gray-400 hover:text-[#0d9488] p-0.5 rounded"
                      title="Change invoice number"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                      </svg>
                    </button>
                    {isInvoiceEdited(invoice) && (
                      <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[9px] font-bold bg-amber-100 text-amber-800 border border-amber-300">
                        Edited
                      </span>
                    )}
                    <span className={`inline-block px-2 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider ${
                      getEffectiveInvoiceType(invoice) === 'TAX INVOICE'
                        ? 'bg-amber-100 text-amber-800'
                        : 'bg-sky-50 text-sky-700'
                    }`}>
                      {getEffectiveInvoiceType(invoice) === 'TAX INVOICE' ? 'TAX' : 'PROFORMA'}
                    </span>
                    {invoice.isPaid && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[9px] font-bold uppercase bg-green-50 text-green-700">
                        <div className="w-1.5 h-1.5 rounded-full bg-green-500"></div>
                        Paid
                      </span>
                    )}
                  </div>
                  <span className="text-sm text-gray-500">{normalizeInvoiceDate(invoice.invoiceDate) || formatDate(invoice.createdAt)}</span>
                </div>

                {/* Card Body */}
                <div className="px-4 py-3 space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-xs text-gray-400 font-medium">Customer</div>
                      <div className="text-sm font-semibold text-gray-800">{invoice.customerName || 'N/A'}</div>
                      {invoice.customerContact && (
                        <div className="text-xs text-gray-400">{invoice.customerContact}</div>
                      )}
                    </div>
                    <div className="text-right">
                      <div className="text-xs text-gray-400 font-medium">Amount</div>
                      <div className="text-lg font-bold text-gray-900">
                        ₹{calculateTotal(invoice).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                      </div>
                    </div>
                  </div>

                  {/* Stage Progress */}
                  <div className="pt-1">
                    <StageProgress invoice={invoice} />
                  </div>
                </div>

                {/* Card Actions */}
                <div className="flex border-t border-gray-100 divide-x divide-gray-100">
                  {onViewInvoice && (
                    <button
                      onClick={() => onViewInvoice(invoice)}
                      className="flex-1 py-2.5 text-sm font-semibold text-blue-500 hover:bg-blue-50 transition-colors flex items-center justify-center gap-1.5"
                    >
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                      </svg>
                      View
                    </button>
                  )}
                  <button
                    onClick={() => onEditInvoice(invoice)}
                    className="flex-1 py-2.5 text-sm font-semibold text-amber-600 hover:bg-amber-50 transition-colors flex items-center justify-center gap-1.5"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                    </svg>
                    Edit
                  </button>
                  <button
                    onClick={() => handleDeleteClick(invoice._id)}
                    className="flex-1 py-2.5 text-sm font-semibold text-red-500 hover:bg-red-50 transition-colors flex items-center justify-center gap-1.5"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                    Delete
                  </button>
                  {isInvoiceEligibleForJobIntake(invoice) && (
                    <button
                      onClick={() => handleJobIntakeClick(invoice)}
                      disabled={processingIntakeId === invoice._id}
                      className="flex-1 py-2.5 text-sm font-semibold text-emerald-600 hover:bg-emerald-50 transition-colors flex items-center justify-center gap-1.5 disabled:opacity-50"
                    >
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                      </svg>
                      {processingIntakeId === invoice._id ? 'Processing...' : 'Job Intake'}
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {/* Stage Proof Modal */}
      <StageProofModal
        isOpen={isStageModalOpen}
        onClose={() => setIsStageModalOpen(false)}
        onConfirm={handleStageConfirm}
        invoiceNo={selectedInvoiceForStage?.invoiceNo}
        stage={targetStage}
        existingDetails={selectedInvoiceForStage ? selectedInvoiceForStage[
          targetStage === 'Payment Received' ? 'paymentDetails' :
          targetStage === 'Work completion' ? 'workDetails' : 'closureDetails'
        ] : null}
      />

      {/* Image Gallery Preview Modal */}
      {previewGallery && (
        <div className="fixed inset-0 bg-gray-900/80 backdrop-blur-sm flex items-center justify-center z-[110] p-4 animate-in fade-in duration-200" onClick={() => setPreviewGallery(null)}>
          <div className="relative max-w-4xl w-full bg-white rounded-2xl overflow-hidden shadow-2xl animate-in zoom-in-95 duration-200" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-center p-4 border-b">
              <h3 className="font-bold text-gray-900">{previewGallery.title}</h3>
              <div className="flex items-center gap-3">
                {previewGallery.images.length > 1 && (
                  <span className="text-xs font-bold text-gray-500">
                    {previewGallery.currentIndex + 1} of {previewGallery.images.length}
                  </span>
                )}
                <button onClick={() => setPreviewGallery(null)} className="text-gray-500 hover:text-gray-700">
                  <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>
            <div className="relative p-2 flex items-center justify-center">
              {previewGallery.images.length > 1 && (
                <button
                  onClick={() => setPreviewGallery(prev => ({ ...prev, currentIndex: prev.currentIndex > 0 ? prev.currentIndex - 1 : prev.images.length - 1 }))}
                  className="absolute left-2 z-10 bg-black/40 hover:bg-black/60 text-white p-2 rounded-full transition-colors"
                >
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                  </svg>
                </button>
              )}
              {(() => {
                const currentProof = previewGallery.images[previewGallery.currentIndex]?.url || previewGallery.images[previewGallery.currentIndex]?.proof || '';
                const isPdf = currentProof.toLowerCase().endsWith('.pdf') || currentProof.includes('.pdf');
                if (isPdf) {
                  return (
                    <div className="w-full h-[70vh] flex flex-col items-center justify-center p-2">
                      <iframe 
                        src={currentProof} 
                        title="PDF Proof" 
                        className="w-full h-full rounded-xl bg-white border border-gray-200"
                      />
                      <a 
                        href={currentProof} 
                        target="_blank" 
                        rel="noopener noreferrer" 
                        className="mt-2 text-xs font-bold text-[#0d9488] hover:underline flex items-center gap-1"
                      >
                        Open PDF in New Window ↗
                      </a>
                    </div>
                  );
                }
                return (
                  <img 
                    src={currentProof} 
                    alt="Proof" 
                    className="w-full h-auto max-h-[80vh] object-contain rounded-lg shadow-sm" 
                  />
                );
              })()}
              {previewGallery.images.length > 1 && (
                <button
                  onClick={() => setPreviewGallery(prev => ({ ...prev, currentIndex: prev.currentIndex < prev.images.length - 1 ? prev.currentIndex + 1 : 0 }))}
                  className="absolute right-2 z-10 bg-black/40 hover:bg-black/60 text-white p-2 rounded-full transition-colors"
                >
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </button>
              )}
            </div>
            {previewGallery.images[previewGallery.currentIndex]?.date && (
              <div className="text-center pb-3 text-xs text-gray-500 font-medium">
                {new Date(previewGallery.images[previewGallery.currentIndex].date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {showDeleteModal && (
        <div className="fixed inset-0 bg-gray-900/50 backdrop-blur-sm flex items-center justify-center z-50 animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl p-8 w-full max-w-md shadow-2xl animate-in zoom-in-95 duration-200 mx-4">
             <div className="bg-red-100 w-12 h-12 rounded-full flex items-center justify-center mb-6">
                <svg className="h-6 w-6 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
            </div>
            <h3 className="text-xl font-bold text-gray-900 mb-2">Confirm Deletion</h3>
            <p className="text-gray-500 mb-8">
              Are you sure you want to delete this invoice? This action is permanent and cannot be reversed.
            </p>
            <div className="flex gap-3">
              <button
                onClick={cancelDelete}
                className="flex-1 px-4 py-3 border border-gray-200 rounded-xl text-gray-600 font-bold hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={confirmDelete}
                className="flex-1 px-4 py-3 bg-red-600 text-white rounded-xl font-bold hover:bg-red-700 transition-colors shadow-lg shadow-red-200"
              >
                Delete Invoice
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Sequential Renumber Modal */}
      <SequentialRenumberModal
        isOpen={isRenumberModalOpen}
        onClose={() => setIsRenumberModalOpen(false)}
        invoices={localInvoices}
        onSuccess={onRefresh}
      />

      {/* Quick Edit Single Invoice Number Modal */}
      <EditInvoiceNoModal
        isOpen={!!invoiceForNoEdit}
        onClose={() => setInvoiceForNoEdit(null)}
        invoice={invoiceForNoEdit}
        onSuccess={onRefresh}
      />

      {/* Job Intake Confirmation & References Modal */}
      {isJobIntakeModalOpen && selectedInvoiceForIntake && (
        <div
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 md:p-6 overflow-hidden animate-fadeIn"
          onClick={(e) => {
            if (e.target === e.currentTarget && processingIntakeId !== selectedInvoiceForIntake._id) {
              setIsJobIntakeModalOpen(false);
              setSelectedInvoiceForIntake(null);
              setIntakeResultInfo(null);
            }
          }}
        >
          <div
            className="relative bg-white rounded-2xl max-w-xl w-full shadow-2xl border border-gray-100 flex flex-col max-h-[90vh] max-h-[90dvh] sm:max-h-[85vh] sm:max-h-[85dvh] overflow-hidden my-auto"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header - Fixed at top */}
            <div className="flex items-center justify-between px-5 sm:px-6 py-4 border-b border-gray-100 flex-shrink-0 bg-white sticky top-0 z-10">
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center font-bold flex-shrink-0">
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                  </svg>
                </div>
                <div>
                  <h3 className="text-lg font-bold text-gray-900 leading-snug">Confirm Job Intake</h3>
                  <p className="text-xs text-gray-500">Invoice History Verification Trigger</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setIsJobIntakeModalOpen(false);
                  setSelectedInvoiceForIntake(null);
                  setIntakeResultInfo(null);
                }}
                disabled={processingIntakeId === selectedInvoiceForIntake._id}
                className="text-gray-400 hover:text-gray-600 p-1.5 rounded-lg hover:bg-gray-100 transition-colors"
                title="Close dialog"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Modal Body - Internally scrollable */}
            <div className="px-5 sm:px-6 py-4 space-y-4 overflow-y-auto flex-1 min-h-0 overscroll-contain">
              <div className="bg-gray-50 rounded-xl p-4 border border-gray-200/70 space-y-2.5">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-500 font-medium">Invoice Number:</span>
                  <span className="font-bold text-gray-900 font-mono">{selectedInvoiceForIntake.invoiceNo}</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-500 font-medium">Customer:</span>
                  <span className="font-semibold text-gray-800">{selectedInvoiceForIntake.customerName || 'N/A'}</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-500 font-medium">Contact:</span>
                  <span className="text-gray-700">{selectedInvoiceForIntake.customerContact || 'N/A'}</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-500 font-medium">Amount:</span>
                  <span className="font-bold text-emerald-700">₹{calculateTotal(selectedInvoiceForIntake).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-500 font-medium">Payment Verification:</span>
                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-600"></span>
                    Verified & Approved
                  </span>
                </div>
              </div>

              {/* Department & Member Selection Controls */}
              {!intakeResultInfo && (
                <div className="bg-slate-50/90 rounded-xl p-4 border border-slate-200/80 space-y-4">
                  {/* Department Selector */}
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between gap-2">
                      <label className="text-xs font-bold text-gray-700 uppercase tracking-wider">
                        Department / Team
                      </label>
                      {isLoadingClassification && (
                        <span className="text-[11px] text-gray-500 animate-pulse flex items-center gap-1 font-medium">
                          <span className="w-3 h-3 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
                          Loading departments...
                        </span>
                      )}
                    </div>
                    <select
                      value={selectedDepartmentId}
                      onChange={(e) => handleIntakeDepartmentChange(e.target.value)}
                      disabled={processingIntakeId === selectedInvoiceForIntake._id || isLoadingClassification}
                      className="w-full text-xs font-semibold bg-white border border-gray-300 rounded-lg px-3 py-2 text-gray-800 focus:outline-none focus:ring-2 focus:ring-emerald-500 shadow-2xs cursor-pointer"
                    >
                      {intakeDepartments.length === 0 ? (
                        <option value="">No departments available</option>
                      ) : (
                        intakeDepartments.map(dept => (
                          <option key={dept._id} value={dept._id}>
                            {dept.name} ({dept.activeMemberCount || 0} active {dept.activeMemberCount === 1 ? 'member' : 'members'})
                          </option>
                        ))
                      )}
                    </select>
                  </div>

                  {/* Assignment Mode Selector: Individual, Team, Both */}
                  <div className="space-y-1.5">
                    <span className="text-xs font-bold text-gray-700 uppercase tracking-wider block">
                      Assignment Mode
                    </span>
                    <div className="flex gap-1 p-1 bg-slate-200/70 rounded-xl border border-slate-300/60">
                      {['Individual', 'Team', 'Both'].map((mode) => (
                        <button
                          key={mode}
                          type="button"
                          onClick={() => handleIntakeAssignmentModeChange(mode)}
                          className={`flex-1 py-1.5 text-xs font-bold rounded-lg transition-all ${
                            assignmentMode === mode
                              ? 'bg-white text-emerald-700 shadow-xs border border-slate-200/80'
                              : 'text-gray-500 hover:text-gray-800'
                          }`}
                        >
                          {mode}
                        </button>
                      ))}
                    </div>
                    <p className="text-[11px] text-gray-500">
                      {assignmentMode === 'Individual' && 'Assigns this job to one specific active team member.'}
                      {assignmentMode === 'Team' && 'Assigns this job to selected active team members of the department.'}
                      {assignmentMode === 'Both' && 'Assigns this job to selected team members and designates a primary lead.'}
                    </p>
                  </div>

                  {/* Active Members & Team Size Selection */}
                  {(() => {
                    const currentDept = intakeDepartments.find(d => d._id === selectedDepartmentId);
                    const members = currentDept?.members || [];
                    const eligibleMembers = members.filter(m => m.isEligible !== false);
                    const eligibleCount = currentDept?.eligibleMemberCount ?? eligibleMembers.length;
                    const totalCount = currentDept?.totalMemberCount ?? members.length;

                    if (members.length === 0) {
                      return (
                        <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-amber-800 text-xs flex items-start gap-2">
                          <span className="font-bold text-amber-600">⚠️</span>
                          <span>No active employees currently belong to <strong>{currentDept?.name || 'this department'}</strong>. Please select another department.</span>
                        </div>
                      );
                    }

                    return (
                      <div className="space-y-3">
                        {/* Department Pool Eligibility Status */}
                        <div className="flex items-center justify-between text-xs bg-slate-50 border border-slate-200 rounded-lg p-2.5">
                          <div>
                            <span className="font-semibold text-gray-700">Department Pool:</span>{' '}
                            <span className="text-emerald-700 font-bold">{eligibleCount} eligible</span>
                            {totalCount > eligibleCount && (
                              <span className="text-amber-700 font-medium"> ({totalCount - eligibleCount} unavailable on leave/workload)</span>
                            )}
                            <span className="text-gray-500"> out of {totalCount} total members</span>
                          </div>
                        </div>

                        {assignmentMode === 'Individual' && (
                          <div className="space-y-1.5">
                            <label className="text-xs font-bold text-gray-700 uppercase tracking-wider block">
                              Select Assignee
                            </label>
                            <select
                              value={selectedMemberId}
                              onChange={(e) => setSelectedMemberId(e.target.value)}
                              disabled={processingIntakeId === selectedInvoiceForIntake._id}
                              className="w-full text-xs font-semibold bg-white border border-gray-300 rounded-lg px-3 py-2 text-gray-800 focus:outline-none focus:ring-2 focus:ring-emerald-500 shadow-2xs cursor-pointer"
                            >
                              {members.map(m => (
                                <option key={m._id} value={m._id} disabled={m.isEligible === false}>
                                  {m.name} — {m.designation || m.role || 'Developer'} {m.isEligible === false ? `[Ineligible: ${m.ineligibilityReason || 'Unavailable'}]` : ''}
                                </option>
                              ))}
                            </select>
                            <p className="text-[11px] text-gray-500">
                              Assigns this job to one eligible employee.
                            </p>
                          </div>
                        )}

                        {assignmentMode === 'Team' && (
                          <div className="space-y-3">
                            <div className="space-y-1.5">
                              <label htmlFor="team-size-input" className="text-xs font-bold text-gray-700 uppercase tracking-wider block">
                                Number of Team Members
                              </label>
                              <div className="flex items-center gap-2">
                                <input
                                  id="team-size-input"
                                  type="number"
                                  min="1"
                                  max={eligibleCount}
                                  value={teamSize}
                                  onChange={(e) => setTeamSize(e.target.value)}
                                  placeholder={`e.g. 3 (Max: ${eligibleCount})`}
                                  disabled={processingIntakeId === selectedInvoiceForIntake._id || eligibleCount === 0}
                                  className="w-44 text-xs font-semibold bg-white border border-gray-300 rounded-lg px-3 py-2 text-gray-800 focus:outline-none focus:ring-2 focus:ring-emerald-500 shadow-2xs"
                                />
                                <span className="text-xs text-gray-500 font-medium">
                                  out of {eligibleCount} eligible employees
                                </span>
                              </div>
                              <p className="text-[11px] text-emerald-800 bg-emerald-50 border border-emerald-200 p-2 rounded-lg">
                                ✨ <strong>System 3 KPI Ranking:</strong> Evaluates OTCR, FTAR, performance points, and active workload to automatically select the top {teamSize && parseInt(teamSize, 10) > 0 ? parseInt(teamSize, 10) : 'requested'} eligible team members.
                              </p>
                            </div>

                            {/* Candidate pool list */}
                            <div className="space-y-1">
                              <span className="text-xs font-semibold text-gray-600 block">Department Candidates:</span>
                              <div className="space-y-1 max-h-36 overflow-y-auto p-2 bg-white rounded-lg border border-gray-200 divide-y divide-gray-100 text-xs">
                                {members.map(m => (
                                  <div key={m._id} className="flex items-center justify-between py-1 px-1">
                                    <div className="flex items-center gap-2">
                                      <span className={m.isEligible !== false ? 'font-medium text-gray-800' : 'text-gray-400 line-through'}>
                                        {m.name}
                                      </span>
                                      <span className="text-[10px] text-gray-400">({m.designation || 'Developer'})</span>
                                    </div>
                                    <div>
                                      {m.isEligible !== false ? (
                                        <span className="text-[10px] text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded font-semibold border border-emerald-200">
                                          Eligible
                                        </span>
                                      ) : (
                                        <span className="text-[10px] text-amber-700 bg-amber-50 px-2 py-0.5 rounded font-medium border border-amber-200">
                                          {m.ineligibilityReason || 'Unavailable'}
                                        </span>
                                      )}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          </div>
                        )}

                        {assignmentMode === 'Both' && (
                          <div className="space-y-3">
                            <div className="space-y-1.5">
                              <label className="text-xs font-bold text-gray-700 uppercase tracking-wider block">
                                Designate Primary Lead Member:
                              </label>
                              <select
                                value={selectedMemberId}
                                onChange={(e) => setSelectedMemberId(e.target.value)}
                                disabled={processingIntakeId === selectedInvoiceForIntake._id || eligibleMembers.length === 0}
                                className="w-full text-xs font-semibold bg-white border border-gray-300 rounded-lg px-3 py-2 text-gray-800 focus:outline-none focus:ring-2 focus:ring-purple-500 shadow-2xs cursor-pointer disabled:bg-gray-100 disabled:cursor-not-allowed"
                              >
                                {members.map(m => (
                                  <option key={m._id} value={m._id} disabled={m.isEligible === false}>
                                    {m.name} — {m.designation || m.role || 'Lead'} {m.isEligible === false ? `[Ineligible: ${m.ineligibilityReason || 'Unavailable'}]` : ''}
                                  </option>
                                ))}
                              </select>
                            </div>

                            <div className="space-y-1.5">
                              <label htmlFor="team-size-input-both" className="text-xs font-bold text-gray-700 uppercase tracking-wider block">
                                Number of Team Members
                              </label>
                              <div className="flex items-center gap-2">
                                <input
                                  id="team-size-input-both"
                                  type="number"
                                  min="2"
                                  max={eligibleCount}
                                  value={teamSize}
                                  onChange={(e) => setTeamSize(e.target.value)}
                                  placeholder={`e.g. 3 (Min: 2, Max: ${eligibleCount})`}
                                  disabled={processingIntakeId === selectedInvoiceForIntake._id || eligibleCount < 2}
                                  className="w-44 text-xs font-semibold bg-white border border-gray-300 rounded-lg px-3 py-2 text-gray-800 focus:outline-none focus:ring-2 focus:ring-purple-500 shadow-2xs"
                                />
                                <span className="text-xs text-gray-500 font-medium">
                                  total members including lead (out of {eligibleCount} eligible)
                                </span>
                              </div>
                              <p className="text-[11px] text-purple-800 bg-purple-50 border border-purple-200 p-2 rounded-lg">
                                ✨ <strong>Both Mode:</strong> Preserves the designated lead and uses System 3 KPI ranking to select the remaining {teamSize && parseInt(teamSize, 10) > 1 ? parseInt(teamSize, 10) - 1 : 'N - 1'} highest-scoring eligible team members.
                              </p>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })()}

                  {/* Confirmation Step Recap Display */}
                  {(() => {
                    const currentDept = intakeDepartments.find(d => d._id === selectedDepartmentId);
                    const members = currentDept?.members || [];
                    const eligibleMembers = members.filter(m => m.isEligible !== false);
                    const eligibleCount = currentDept?.eligibleMemberCount ?? eligibleMembers.length;
                    let assignedDisplay = 'None';
                    if (assignmentMode === 'Individual') {
                      const m = members.find(mem => mem._id === selectedMemberId);
                      assignedDisplay = m ? m.name : 'None selected (required)';
                    } else if (assignmentMode === 'Team') {
                      assignedDisplay = teamSize
                        ? `System 3 will rank and select the top ${teamSize} candidates from ${eligibleCount} eligible employees`
                        : 'Please enter Number of Team Members';
                    } else if (assignmentMode === 'Both') {
                      const lead = members.find(mem => mem._id === selectedMemberId);
                      assignedDisplay = teamSize && lead
                        ? `Lead: ${lead.name} + top ${parseInt(teamSize, 10) - 1} members selected via System 3 ranking (Total: ${teamSize})`
                        : 'Please designate lead and enter Number of Team Members';
                    }

                    return (
                      <div className="bg-emerald-50/70 border border-emerald-200/80 rounded-xl p-3 text-xs space-y-1.5">
                        <div className="font-bold text-emerald-900 flex items-center justify-between">
                          <span>Confirmation Summary</span>
                          <span className="px-2 py-0.5 rounded-md bg-emerald-200/80 text-emerald-900 font-mono text-[11px] font-semibold">
                            {assignmentMode} Mode
                          </span>
                        </div>
                        <div className="text-gray-700">
                          <strong>Department:</strong> {currentDept?.name || 'None selected'}
                        </div>
                        <div className="text-gray-700">
                          <strong>Assignment Plan:</strong> {assignedDisplay}
                        </div>
                      </div>
                    );
                  })()}
                </div>
              )}

              {/* Existing, Recovered or Newly Created Intake References */}
              {intakeResultInfo ? (
                <div className={`p-4 rounded-xl border ${
                  intakeResultInfo.isRecovered
                    ? 'bg-blue-50 border-blue-200 text-blue-900'
                    : intakeResultInfo.isDuplicate
                      ? 'bg-amber-50 border-amber-200 text-amber-900'
                      : 'bg-emerald-50 border-emerald-200 text-emerald-900'
                } space-y-2 text-sm`}>
                  <div className="flex items-center gap-2 font-bold">
                    <svg className="w-5 h-5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    <span>
                      {intakeResultInfo.isRecovered
                        ? (intakeResultInfo.recoveredAction === 'restored'
                            ? 'Job Ticket Successfully Restored'
                            : 'Job Ticket Successfully Recreated')
                        : intakeResultInfo.isDuplicate
                          ? 'Existing Job Intake Record Updated'
                          : 'Job Ticket Successfully Generated'}
                    </span>
                  </div>
                  <div className="text-xs space-y-1 font-mono pt-1">
                    <div><strong>Order Ref:</strong> {intakeResultInfo.orderId}</div>
                    <div><strong>Ticket ID:</strong> {intakeResultInfo.ticketId}</div>
                    <div><strong>Invoice No:</strong> {intakeResultInfo.invoiceNo}</div>
                    {intakeResultInfo.department && (
                      <div><strong>Assigned Department:</strong> {intakeResultInfo.department}</div>
                    )}
                    {intakeResultInfo.assignmentMode && (
                      <div><strong>Assignment Mode:</strong> {intakeResultInfo.assignmentMode}</div>
                    )}
                    <div><strong>Ticket Status:</strong> To Do</div>
                    {intakeResultInfo.isRecovered && (
                      <div className="text-blue-700 font-sans text-[11px] pt-1">
                        {intakeResultInfo.recoveredAction === 'restored'
                          ? 'The deleted ticket was safely restored and relinked.'
                          : 'A replacement ticket was created and relinked.'}
                      </div>
                    )}
                  </div>

                  {/* System 3 Selected Members and Score Explanations */}
                  {Array.isArray(intakeResultInfo.selectedMembers) && intakeResultInfo.selectedMembers.length > 0 && (
                    <div className="mt-3 pt-2.5 border-t border-emerald-200/80 space-y-1.5 font-sans">
                      <div className="font-bold text-xs text-emerald-950 flex items-center justify-between">
                        <span>Assigned Team Members ({intakeResultInfo.selectedMembers.length}):</span>
                        <span className="text-[10px] text-emerald-700 font-normal">Ranked via System 3 KPI Analysis</span>
                      </div>
                      <div className="space-y-1 max-h-44 overflow-y-auto">
                        {intakeResultInfo.selectedMembers.map((sm, idx) => (
                          <div key={sm._id || idx} className="bg-white/90 p-2 rounded-lg border border-emerald-200/60 flex items-center justify-between text-xs shadow-2xs">
                            <div className="min-w-0 pr-2">
                              <div className="flex items-center gap-1.5">
                                <span className="font-bold text-gray-900 truncate">{sm.name}</span>
                                <span className="text-[10px] text-gray-500">({sm.designation || 'Developer'})</span>
                              </div>
                              {sm.explanation && (
                                <div className="text-[10px] text-emerald-800 font-medium truncate mt-0.5">{sm.explanation}</div>
                              )}
                            </div>
                            <div className="text-right flex-shrink-0">
                              {sm.totalScore !== undefined && (
                                <span className="font-bold text-emerald-800 text-[11px] bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200">
                                  {sm.totalScore} pts
                                </span>
                              )}
                              {sm.kpiScore !== null && sm.kpiScore !== undefined && (
                                <span className="text-[10px] text-gray-500 block mt-0.5">KPI: {sm.kpiScore}%</span>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <p className="text-sm text-gray-600 leading-relaxed">
                  Proceed with Job Intake registration for invoice <strong className="text-gray-900">{selectedInvoiceForIntake.invoiceNo}</strong> ({selectedInvoiceForIntake.customerName || 'Customer'})?
                  This will link this verified invoice to a Job Intake record and assign the selected department members.
                </p>
              )}
            </div>

            {/* Modal Footer - Fixed at bottom */}
            <div className="flex items-center justify-end gap-3 px-5 sm:px-6 py-3.5 border-t border-gray-100 flex-shrink-0 bg-gray-50/90 sticky bottom-0 z-10">
              <button
                type="button"
                onClick={() => {
                  setIsJobIntakeModalOpen(false);
                  setSelectedInvoiceForIntake(null);
                  setIntakeResultInfo(null);
                }}
                disabled={processingIntakeId === selectedInvoiceForIntake._id}
                className="px-4 py-2 text-sm font-semibold text-gray-600 hover:text-gray-800 hover:bg-gray-200/60 rounded-lg transition-colors cursor-pointer"
              >
                {intakeResultInfo ? 'Close' : 'Cancel'}
              </button>

              {!intakeResultInfo && (
                <button
                  type="button"
                  onClick={handleConfirmJobIntake}
                  disabled={
                    processingIntakeId === selectedInvoiceForIntake._id ||
                    !selectedDepartmentId ||
                    (intakeDepartments.find(d => d._id === selectedDepartmentId)?.members?.length === 0) ||
                    (assignmentMode === 'Individual' && !selectedMemberId) ||
                    (assignmentMode === 'Team' && selectedMemberIds.length === 0) ||
                    (assignmentMode === 'Both' && (selectedMemberIds.length === 0 || !selectedMemberId))
                  }
                  className="px-5 py-2 text-sm font-semibold text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg shadow-sm transition-all flex items-center gap-2 cursor-pointer"
                >
                  {processingIntakeId === selectedInvoiceForIntake._id ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      <span>Processing...</span>
                    </>
                  ) : (
                    <span>Confirm Job Intake</span>
                  )}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default InvoiceHistory;