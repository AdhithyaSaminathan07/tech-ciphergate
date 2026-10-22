import React, { useState, useRef, useEffect, useContext } from 'react';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { toast } from 'react-toastify';
import QRCode from 'qrcode';
import api from '../../services/api';
import appContext from '../../context/AppContext';
import { getNextInvoiceNo, sendInvoiceWhatsApp, createInvoice, updateInvoice } from '../../services/invoiceService';
import CustomDatePicker from '../common/CustomDatePicker';
import {
  FaFileAlt,
  FaCreditCard,
  FaCheckCircle,
  FaFileInvoiceDollar,
  FaHeadset,
  FaEdit,
  FaShieldAlt,
  FaRocket,
  FaUsers,
  FaHeart,
  FaFileInvoice,
  FaCalendarAlt,
  FaClock,
  FaPhoneAlt,
  FaEnvelope,
  FaGlobe,
  FaUser,
  FaMapMarkerAlt
} from 'react-icons/fa';

// Helper to normalize any date string to DD/MM/YYYY
const normalizeInvoiceDate = (dateStr) => {
  if (!dateStr) return '';
  dateStr = String(dateStr).trim();

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

// Helper to get fresh invoice default structure
const getFreshInvoiceData = (formattedDate = '') => ({
  invoiceNo: 'TV000000',
  invoiceDate: formattedDate,
  dueDate: formattedDate,
  customerName: '',
  customerContact: '',
  customerAddress: '',
  salesPerson: '',
  terms: '',
  notes: 'Thank you for your business.\nWe appreciate your trust in us.',
  signature: '',
  fromSection: {
    company: 'TECH VASEEGRAH',
    addressLine1: 'No.11, VIJAYANAGAR,',
    addressLine2: 'REDDIPALAYAM ROAD,',
    addressLine3: 'SRINIVASAPURAM,',
    cityZip: 'THANJAVUR - 613009',
    mobile: '9047484484',
    email: 'techvaseegrah@gmail.com',
    gstin: '33KYGPS1983E1Z1'
  },
  items: [
    {
      id: Date.now(),
      description: '',
      hsn: '',
      gst: 18,
      qty: 1,
      rate: 0,
      total: 0,
      isTotalOverridden: false
    }
  ],
  bankName: 'ICICI Bank',
  accountName: 'TECH VASEEGRAH',
  accountNumber: '612805036053',
  ifscCode: 'ICIC0006128',
  upiNumber: '7667792779',
  upiId: 'techvaseegrah.ibz@icici',
  gstEnabled: true,
  saleType: 'Intrastate',
  customerGst: '',
  invoiceType: 'PROFORMA INVOICE',
  status: 'Invoice',
  isPaid: false,
  paymentRecords: [],
  externalOrderId: ''
});

const AdvancedInvoice = ({ onInvoiceSave, initialData, isPreviewMode = false }) => {
  const today = new Date();
  const formattedDate = today.toLocaleDateString('en-IN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric'
  });

  const getPopulatedData = (data) => {
    if (!data) return getFreshInvoiceData(formattedDate);
    const hasPay = !!(data.paymentDetails && ((Array.isArray(data.paymentDetails.proofs) && data.paymentDetails.proofs.length > 0) || data.paymentDetails.proof));
    const effectiveType = (hasPay || data.invoiceType === 'TAX INVOICE') ? 'TAX INVOICE' : (data.invoiceType || 'PROFORMA INVOICE');
    return {
      _id: data._id,
      invoiceNo: data.invoiceNo || 'TV000000',
      invoiceDate: normalizeInvoiceDate(data.invoiceDate) || formattedDate,
      dueDate: normalizeInvoiceDate(data.dueDate) || normalizeInvoiceDate(data.invoiceDate) || formattedDate,
      customerName: data.customerName || '',
      customerContact: data.customerContact || '',
      customerAddress: data.customerAddress || '',
      salesPerson: data.salesPerson || '',
      terms: data.terms || '',
      notes: data.notes || 'Thank you for your business.\nWe appreciate your trust in us.',
      signature: data.signature || '',
      fromSection: {
        company: data.fromSection?.company || 'TECH VASEEGRAH',
        addressLine1: data.fromSection?.addressLine1 || 'No.11, VIJAYANAGAR,',
        addressLine2: data.fromSection?.addressLine2 || 'REDDIPALAYAM ROAD,',
        addressLine3: data.fromSection?.addressLine3 || 'SRINIVASAPURAM,',
        cityZip: data.fromSection?.cityZip || 'THANJAVUR - 613009',
        mobile: data.fromSection?.mobile?.replace(/^Mobile:\s*/i, '') || '7667792779',
        email: data.fromSection?.email || 'techvaseegrah@gmail.com',
        gstin: data.fromSection?.gstin?.replace(/^GSTIN:\s*/i, '') || '33KYGPS1983E1Z1'
      },
      items: (data.items && data.items.length > 0)
        ? data.items.map((it, idx) => ({
          ...it,
          id: it._id || it.id || Date.now() + idx,
          hsn: it.hsn ?? '',
          gst: it.gst !== undefined ? it.gst : 18
        }))
        : [
          { id: Date.now(), description: '', hsn: '', gst: 18, qty: 1, rate: 0, total: 0, isTotalOverridden: false }
        ],
      bankName: data.bankName || 'ICICI Bank',
      accountName: data.accountName || 'TECH VASEEGRAH',
      accountNumber: data.accountNumber || '612805036053',
      ifscCode: data.ifscCode || 'ICIC0006128',
      upiNumber: data.upiNumber || '7667792779',
      upiId: data.upiId || 'techvaseegrah.ibz@icici',
      gstEnabled: true,
      saleType: data.saleType || 'Intrastate',
      customerGst: data.customerGst || '',
      invoiceType: effectiveType,
      status: data.status || 'Invoice',
      isPaid: data.isPaid || false,
      paymentRecords: data.paymentRecords || [],
      externalOrderId: data.externalOrderId || ''
    };
  };

  const [invoiceData, setInvoiceData] = useState(() => getPopulatedData(initialData));
  const [upiQrCodeUrl, setUpiQrCodeUrl] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [sealPreview, setSealPreview] = useState('/stamp.png');
  const [signaturePreview, setSignaturePreview] = useState(initialData?.signature || null);

  const invoiceRef = useRef();
  const { subdomain: contextSubdomain } = useContext(appContext) || {};

  // Number to Words converter (Indian numbering system)
  const numberToWords = (num) => {
    const ones = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine',
      'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen',
      'Seventeen', 'Eighteen', 'Nineteen'];
    const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

    if (!num || num === 0) return 'Zero';

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

    return result.trim();
  };

  // Calculate Subtotal, GST, and Grand Total
  const calculateTotals = () => {
    const subtotal = invoiceData.items.reduce((sum, item) =>
      sum + (item.isTotalOverridden ? Number(item.total || 0) : (Number(item.qty || 0) * Number(item.rate || 0))), 0);

    const gstTotal = invoiceData.gstEnabled ?
      invoiceData.items.reduce((sum, item) => {
        const itemSub = item.isTotalOverridden ? Number(item.total || 0) : (Number(item.qty || 0) * Number(item.rate || 0));
        return sum + (itemSub * Number(item.gst || 0) / 100);
      }, 0) : 0;

    const grandTotal = subtotal + gstTotal;
    const cgstTotal = (invoiceData.gstEnabled && invoiceData.saleType === 'Intrastate') ? gstTotal / 2 : 0;
    const sgstTotal = (invoiceData.gstEnabled && invoiceData.saleType === 'Intrastate') ? gstTotal / 2 : 0;
    const igstTotal = (invoiceData.gstEnabled && invoiceData.saleType === 'Interstate') ? gstTotal : 0;

    const avgGst = subtotal > 0 ? (gstTotal / subtotal) * 100 : 18;
    const halfGst = (avgGst / 2).toFixed(avgGst % 2 === 0 ? 0 : 1);
    const fullGst = avgGst.toFixed(avgGst % 1 === 0 ? 0 : 1);

    return {
      subtotal,
      gstTotal,
      cgstTotal,
      sgstTotal,
      igstTotal,
      halfGst,
      fullGst,
      totalInWords: `Indian Rupee: ${numberToWords(Math.round(grandTotal))} Only`,
      grandTotal
    };
  };

  const totals = calculateTotals();

  // Populate data when initialData changes or reset when creating a new invoice
  useEffect(() => {
    if (initialData) {
      setInvoiceData(getPopulatedData(initialData));
      setSignaturePreview(initialData.signature || null);
    } else {
      setInvoiceData(getFreshInvoiceData(formattedDate));
      setSignaturePreview(null);
      getNextInvoiceNo()
        .then((res) => {
          if (res.success && res.data?.nextInvoiceNo) {
            setInvoiceData(prev => ({ ...prev, invoiceNo: res.data.nextInvoiceNo }));
          }
        })
        .catch((err) => {
          console.error('Could not fetch next invoice number:', err);
        });
    }
  }, [initialData]);

  // Fetch tenant Payment & Bank Details from Settings
  useEffect(() => {
    const fetchPaymentSettings = async () => {
      try {
        const targetSubdomain = contextSubdomain || localStorage.getItem('subdomain') || 'tech-vaseegrah';
        let res;
        try {
          res = await api.get(`/settings/${targetSubdomain}`);
        } catch (subErr) {
          res = await api.get(`/settings/public/${targetSubdomain}`);
        }
        if (res.data && res.data.paymentDetails) {
          const { bankName, accountNumber, ifscCode, upiId, upiNumber, companyName } = res.data.paymentDetails;
          setInvoiceData(prev => ({
            ...prev,
            bankName: (!initialData?._id ? bankName : prev.bankName) || bankName || prev.bankName,
            accountName: (!initialData?._id ? companyName : prev.accountName) || companyName || prev.accountName,
            accountNumber: (!initialData?._id ? accountNumber : prev.accountNumber) || accountNumber || prev.accountNumber,
            ifscCode: (!initialData?._id ? ifscCode : prev.ifscCode) || ifscCode || prev.ifscCode,
            upiId: (!initialData?._id ? upiId : (prev.upiId || upiId)) || upiId || prev.upiId,
            upiNumber: (!initialData?._id ? upiNumber : (prev.upiNumber || upiNumber)) || upiNumber || prev.upiNumber
          }));
        }
      } catch (err) {
        console.error('Error fetching tenant payment settings:', err);
      }
    };
    fetchPaymentSettings();
  }, [initialData, contextSubdomain]);

  // Generate UPI QR Code dynamically
  useEffect(() => {
    const generateUpiQr = async () => {
      try {
        const upiId = (invoiceData.upiId || '').trim();
        if (!upiId) {
          setUpiQrCodeUrl('');
          return;
        }
        const companyName = invoiceData.accountName || invoiceData.fromSection?.company || 'TECH VASEEGRAH';
        const amount = totals.grandTotal ? Number(totals.grandTotal).toFixed(2) : '0.00';
        const note = `Invoice ${invoiceData.invoiceNo || ''}`;
        const upiString = `upi://pay?pa=${encodeURIComponent(upiId)}&pn=${encodeURIComponent(companyName)}&am=${amount}&cu=INR&tn=${encodeURIComponent(note)}`;
        const qrUrl = await QRCode.toDataURL(upiString, {
          margin: 1,
          width: 200,
          color: {
            dark: '#000000',
            light: '#ffffff'
          }
        });
        setUpiQrCodeUrl(qrUrl);
      } catch (err) {
        console.error('Error generating UPI QR code:', err);
      }
    };
    generateUpiQr();
  }, [invoiceData.upiId, invoiceData.accountName, invoiceData.fromSection?.company, invoiceData.invoiceNo, totals.grandTotal]);

  const handleInputChange = (e) => {
    const { name, value, type, checked } = e.target;
    if (type === 'checkbox') {
      setInvoiceData(prev => ({ ...prev, [name]: checked }));
    } else if (name === 'customerContact') {
      const sanitized = value.replace(/\D/g, '').slice(0, 10);
      setInvoiceData(prev => ({ ...prev, [name]: sanitized }));
    } else {
      setInvoiceData(prev => ({ ...prev, [name]: value }));
    }
  };

  const handleFromSectionChange = (field, value) => {
    setInvoiceData(prev => ({
      ...prev,
      fromSection: { ...prev.fromSection, [field]: value }
    }));
  };

  const handleItemChange = (id, field, value) => {
    setInvoiceData(prev => {
      const updatedItems = prev.items.map(item => {
        if (item.id === id) {
          const updatedItem = {
            ...item,
            [field]: field === 'qty' || field === 'rate' || field === 'total' || field === 'gst' ?
              parseFloat(value) || 0 : value
          };
          if ((field === 'qty' || field === 'rate') && !item.isTotalOverridden) {
            updatedItem.total = (Number(updatedItem.qty) || 0) * (Number(updatedItem.rate) || 0);
          }
          if (field === 'total') updatedItem.isTotalOverridden = true;
          return updatedItem;
        }
        return item;
      });
      return { ...prev, items: updatedItems };
    });
  };

  const addItem = () => {
    const newItem = {
      id: Date.now(),
      description: '',
      hsn: '',
      gst: 18,
      qty: 1,
      rate: 0,
      total: 0,
      isTotalOverridden: false
    };
    setInvoiceData(prev => ({ ...prev, items: [...prev.items, newItem] }));
  };

  const removeItem = (id) => {
    if (invoiceData.items.length > 1) {
      setInvoiceData(prev => ({ ...prev, items: prev.items.filter(item => item.id !== id) }));
    }
  };

  const addPaymentRecord = () => {
    const newRecord = {
      tempId: Date.now(),
      amount: 0,
      dateReceived: formattedDate,
      transactionId: ''
    };
    setInvoiceData(prev => ({ ...prev, paymentRecords: [...(prev.paymentRecords || []), newRecord] }));
  };

  const removePaymentRecord = (index) => {
    setInvoiceData(prev => ({
      ...prev,
      paymentRecords: prev.paymentRecords.filter((_, i) => i !== index)
    }));
  };

  const updatePaymentRecord = (index, field, value) => {
    setInvoiceData(prev => {
      const updatedRecords = [...prev.paymentRecords];
      if (field === 'amount') {
        value = value === '' ? 0 : Number(value);
      }
      updatedRecords[index] = { ...updatedRecords[index], [field]: value };
      return { ...prev, paymentRecords: updatedRecords };
    });
  };

  const handleSealUpload = (e) => {
    const file = e.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (ev) => setSealPreview(ev.target.result);
      reader.readAsDataURL(file);
    }
  };

  const handleSignatureUpload = (e) => {
    const file = e.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (ev) => {
        setSignaturePreview(ev.target.result);
        setInvoiceData(prev => ({ ...prev, signature: ev.target.result }));
      };
      reader.readAsDataURL(file);
    }
  };

  // Generate PDF Document using jsPDF + autoTable matching the layout
  const generatePdfDoc = async () => {
    const hasEmptyDescriptions = invoiceData.items.some(item => !item.description || item.description.trim() === '');
    if (hasEmptyDescriptions) {
      toast.error('Please fill in descriptions for all items before generating PDF.');
      return null;
    }

    try {
      const pdf = new jsPDF('p', 'mm', 'a4');
      const marginLeft = 15;
      const marginTop = 12;
      const marginRight = 15;
      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();

      // Top Header: Logo
      try {
        const logoPath = `${window.location.origin}/Invoicelogo.png`;
        const logoData = await fetch(logoPath)
          .then(res => res.blob())
          .then(blob => new Promise((resolve) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result);
            reader.readAsDataURL(blob);
          }));

        const logoProps = pdf.getImageProperties(logoData);
        const fixedLogoWidth = 55;
        const fixedLogoHeight = (logoProps.height / logoProps.width) * fixedLogoWidth;
        pdf.addImage(logoData, "PNG", marginLeft, marginTop, fixedLogoWidth, fixedLogoHeight);
      } catch (e) {
        pdf.setFont("helvetica", "bold");
        pdf.setFontSize(16);
        pdf.setTextColor(11, 102, 59);
        pdf.text("TECH VASEEGRAH", marginLeft, marginTop + 8);
        pdf.setFontSize(9);
        pdf.setFont("helvetica", "normal");
        pdf.setTextColor(100, 100, 100);
        pdf.text("Technology. Solutions. Growth.", marginLeft, marginTop + 14);
      }

      // PROFORMA INVOICE Title (Right - Flush with right margin matching UI)
      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(22);
      pdf.setTextColor(11, 102, 59);
      const titleText = (invoiceData.invoiceType || "PROFORMA INVOICE").toUpperCase();
      pdf.text(titleText, pageWidth - marginRight, marginTop + 10, { align: 'right' });

      if (invoiceData.isPaid) {
        pdf.setFont("helvetica", "bold");
        pdf.setFontSize(10);
        pdf.setTextColor(16, 185, 129);
        pdf.text("● PAID", pageWidth - marginRight, marginTop + 16, { align: 'right' });
      }

      let yPos = marginTop + 26;

      // Vector Icon Drawing Helpers for Crisp, Native PDF Rendering
      const drawUserBadge = (x, y) => {
        pdf.setFillColor(11, 102, 59);
        pdf.circle(x + 2.2, y - 1.2, 2.3, 'F');
        pdf.setFillColor(255, 255, 255);
        pdf.circle(x + 2.2, y - 2.0, 0.75, 'F');
        pdf.ellipse(x + 2.2, y - 0.3, 1.3, 0.75, 'F');
      };

      const drawPinBadge = (x, y) => {
        pdf.setFillColor(11, 102, 59);
        pdf.circle(x + 2.2, y - 1.2, 2.3, 'F');
        pdf.setFillColor(255, 255, 255);
        pdf.circle(x + 2.2, y - 1.8, 0.85, 'F');
        pdf.triangle(x + 1.45, y - 1.5, x + 2.95, y - 1.5, x + 2.2, y + 0.4, 'F');
        pdf.setFillColor(11, 102, 59);
        pdf.circle(x + 2.2, y - 1.8, 0.35, 'F');
      };

      const drawFramedIcon = (x, y, type) => {
        pdf.setFillColor(236, 253, 245);
        pdf.setDrawColor(167, 243, 208);
        pdf.setLineWidth(0.3);
        pdf.roundedRect(x, y - 3.8, 7.5, 7.5, 1.2, 1.2, 'FD');

        if (type === 'invoice') {
          pdf.setDrawColor(11, 102, 59);
          pdf.setFillColor(255, 255, 255);
          pdf.setLineWidth(0.35);
          pdf.rect(x + 1.8, y - 2.4, 3.9, 4.8, 'FD');
          pdf.line(x + 2.6, y - 1.0, x + 4.8, y - 1.0);
          pdf.line(x + 2.6, y + 0.4, x + 4.8, y + 0.4);
          pdf.line(x + 2.6, y + 1.4, x + 4.2, y + 1.4);
        } else if (type === 'calendar') {
          pdf.setDrawColor(11, 102, 59);
          pdf.setFillColor(255, 255, 255);
          pdf.setLineWidth(0.35);
          pdf.rect(x + 1.6, y - 2.0, 4.3, 4.3, 'FD');
          pdf.setFillColor(11, 102, 59);
          pdf.rect(x + 1.6, y - 2.0, 4.3, 1.4, 'F');
          pdf.line(x + 2.5, y - 2.7, x + 2.5, y - 2.0);
          pdf.line(x + 5.0, y - 2.7, x + 5.0, y - 2.0);
        } else if (type === 'clock') {
          pdf.setDrawColor(11, 102, 59);
          pdf.setLineWidth(0.4);
          pdf.circle(x + 3.75, y, 2.3, 'S');
          pdf.line(x + 3.75, y, x + 3.75, y - 1.4);
          pdf.line(x + 3.75, y, x + 4.9, y);
        }
      };

      const drawPhoneIcon = (x, y) => {
        const cx = x + 1.2;
        const cy = y - 1.2;
        pdf.setFillColor(11, 102, 59);
        pdf.setDrawColor(11, 102, 59);
        pdf.roundedRect(cx - 0.9, cy - 1.3, 1.8, 2.6, 0.35, 0.35, 'F');
        pdf.setFillColor(255, 255, 255);
        pdf.rect(cx - 0.6, cy - 0.8, 1.2, 1.5, 'F');
        pdf.circle(cx, cy + 0.95, 0.12, 'F');
      };

      const drawEmailIcon = (x, y) => {
        const cx = x + 1.2;
        const cy = y - 1.2;
        pdf.setDrawColor(11, 102, 59);
        pdf.setFillColor(255, 255, 255);
        pdf.setLineWidth(0.35);
        pdf.roundedRect(cx - 1.4, cy - 1.0, 2.8, 2.0, 0.3, 0.3, 'FD');
        pdf.line(cx - 1.4, cy - 1.0, cx, cy + 0.05);
        pdf.line(cx + 1.4, cy - 1.0, cx, cy + 0.05);
      };

      const drawGlobeIcon = (x, y) => {
        const cx = x + 1.2;
        const cy = y - 1.2;
        pdf.setDrawColor(11, 102, 59);
        pdf.setLineWidth(0.35);
        pdf.circle(cx, cy, 1.2, 'S');
        pdf.line(cx - 1.2, cy, cx + 1.2, cy);
        pdf.line(cx, cy - 1.2, cx, cy + 1.2);
        pdf.ellipse(cx, cy, 0.55, 1.2, 'S');
      };

      const drawDocIconWhite = (x, y) => {
        pdf.setFillColor(255, 255, 255);
        pdf.setDrawColor(255, 255, 255);
        pdf.roundedRect(x, y - 2.2, 3.0, 3.8, 0.3, 0.3, 'F');
        pdf.setFillColor(11, 102, 59);
        pdf.rect(x + 0.6, y - 1.4, 1.8, 0.4, 'F');
        pdf.rect(x + 0.6, y - 0.4, 1.8, 0.4, 'F');
        pdf.rect(x + 0.6, y + 0.5, 1.2, 0.4, 'F');
      };

      const drawCardIconWhite = (x, y) => {
        pdf.setFillColor(255, 255, 255);
        pdf.roundedRect(x, y - 2.0, 3.8, 2.8, 0.4, 0.4, 'F');
        pdf.setFillColor(11, 102, 59);
        pdf.rect(x, y - 1.2, 3.8, 0.7, 'F');
      };

      const drawNoteIconGreen = (x, y) => {
        pdf.setDrawColor(11, 102, 59);
        pdf.setFillColor(255, 255, 255);
        pdf.setLineWidth(0.35);
        pdf.roundedRect(x, y - 2.2, 3.0, 3.8, 0.3, 0.3, 'FD');
        pdf.setFillColor(11, 102, 59);
        pdf.rect(x + 0.6, y - 1.3, 1.8, 0.4, 'F');
        pdf.rect(x + 0.6, y - 0.4, 1.8, 0.4, 'F');
        pdf.rect(x + 0.6, y + 0.5, 1.2, 0.4, 'F');
      };

      // 3-Column Info Section
      const col1X = marginLeft;
      const col2X = marginLeft + 62;
      const col3X = marginLeft + 118;

      // Column 1: BILL TO & ADDRESS
      drawUserBadge(col1X, yPos);
      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(8.5);
      pdf.setTextColor(11, 102, 59);
      pdf.text("BILL TO", col1X + 6.2, yPos);

      pdf.setFontSize(9.5);
      pdf.setTextColor(17, 24, 39);
      pdf.text(invoiceData.customerName || 'Customer Name', col1X, yPos + 5);

      let currentC1Y = yPos + 9;
      if (invoiceData.customerContact) {
        pdf.setFont("helvetica", "normal");
        pdf.setFontSize(7.8);
        pdf.setTextColor(75, 85, 99);
        pdf.text(invoiceData.customerContact, col1X, currentC1Y);
        currentC1Y += 3.8;
      }
      if (invoiceData.customerGst) {
        pdf.setFont("helvetica", "bold");
        pdf.setFontSize(7.8);
        pdf.setTextColor(11, 102, 59);
        pdf.text(`GSTIN: ${invoiceData.customerGst}`, col1X, currentC1Y);
        currentC1Y += 4.2;
      }

      let addrY = Math.max(currentC1Y + 1, yPos + 14);
      drawPinBadge(col1X, addrY);
      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(8.5);
      pdf.setTextColor(11, 102, 59);
      pdf.text("ADDRESS", col1X + 6.2, addrY);

      pdf.setFont("helvetica", "normal");
      pdf.setFontSize(8);
      pdf.setTextColor(55, 65, 81);
      const addrLines = pdf.splitTextToSize(invoiceData.customerAddress || 'Customer full address (Street, City, State, Pin code)', 52);
      pdf.text(addrLines, col1X, addrY + 4.5);

      // Column 2: INVOICE DETAILS (With crisp framed icons matching UI)
      drawFramedIcon(col2X, yPos + 1.2, 'invoice');
      pdf.setFont("helvetica", "normal");
      pdf.setFontSize(7.5);
      pdf.setTextColor(107, 114, 128);
      pdf.text("Invoice No.", col2X + 9.5, yPos);
      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(9);
      pdf.setTextColor(17, 24, 39);
      pdf.text(invoiceData.invoiceNo || 'TV000', col2X + 9.5, yPos + 4.5);

      drawFramedIcon(col2X, yPos + 12.2, 'calendar');
      pdf.setFont("helvetica", "normal");
      pdf.setFontSize(7.5);
      pdf.setTextColor(107, 114, 128);
      pdf.text("Invoice Date", col2X + 9.5, yPos + 11);
      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(9);
      pdf.setTextColor(17, 24, 39);
      pdf.text(invoiceData.invoiceDate || formattedDate, col2X + 9.5, yPos + 15.5);

      drawFramedIcon(col2X, yPos + 23.2, 'clock');
      pdf.setFont("helvetica", "normal");
      pdf.setFontSize(7.5);
      pdf.setTextColor(107, 114, 128);
      pdf.text("Due Date", col2X + 9.5, yPos + 22);
      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(9);
      pdf.setTextColor(17, 24, 39);
      pdf.text(invoiceData.dueDate || invoiceData.invoiceDate || formattedDate, col2X + 9.5, yPos + 26.5);

      // Column 3: FROM Details (Clean, elegant typography matching UI)
      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(8.5);
      pdf.setTextColor(11, 102, 59);
      pdf.text("FROM", col3X, yPos);

      pdf.setFontSize(9.5);
      pdf.setTextColor(17, 24, 39);
      pdf.text(invoiceData.fromSection?.company || "TECH VASEEGRAH", col3X, yPos + 5.2);

      pdf.setFont("helvetica", "normal");
      pdf.setFontSize(7.8);
      pdf.setTextColor(55, 65, 81);

      // Clean address segments to prevent duplicate commas (e.g. ',,')
      const cleanAddr = (str) => String(str || '').trim().replace(/,\s*$/, '');
      const addrPart1 = cleanAddr(invoiceData.fromSection?.addressLine1);
      const addrPart2 = cleanAddr(invoiceData.fromSection?.addressLine2);
      const addrPart3 = cleanAddr(invoiceData.fromSection?.addressLine3);
      const addrPart4 = cleanAddr(invoiceData.fromSection?.cityZip);

      const fromLine1 = [addrPart1, addrPart2].filter(Boolean).join(', ');
      const fromLine2 = [addrPart3, addrPart4].filter(Boolean).join(', ');
      const fromAddressLines = [fromLine1, fromLine2].filter(Boolean);

      let fromCurrY = yPos + 9.5;
      if (fromAddressLines.length > 0) {
        fromAddressLines.forEach(lineText => {
          const splitLines = pdf.splitTextToSize(lineText, 58);
          pdf.text(splitLines, col3X, fromCurrY);
          fromCurrY += (splitLines.length * 3.7);
        });
        fromCurrY += 1.8;
      } else {
        const defaultLines = pdf.splitTextToSize('No.11, VIJAYANAGAR, REDDIPALAYAM ROAD, SRINIVASAPURAM, THANJAVUR - 613009', 58);
        pdf.text(defaultLines, col3X, fromCurrY);
        fromCurrY += (defaultLines.length * 3.7) + 1.8;
      }

      // Phone (Icon + number aligned)
      drawPhoneIcon(col3X, fromCurrY);
      pdf.setFont("helvetica", "normal");
      pdf.setFontSize(7.8);
      pdf.setTextColor(55, 65, 81);
      pdf.text(invoiceData.fromSection?.mobile || '9047484484', col3X + 3.8, fromCurrY);
      fromCurrY += 4.4;

      // Email (Icon + email aligned)
      drawEmailIcon(col3X, fromCurrY);
      pdf.text(invoiceData.fromSection?.email || 'techvaseegrah@gmail.com', col3X + 3.8, fromCurrY);
      fromCurrY += 4.4;

      // GSTIN (Icon + GSTIN aligned)
      drawGlobeIcon(col3X, fromCurrY);
      pdf.text(`GSTIN: ${invoiceData.fromSection?.gstin || '33KYGPS1983E1Z1'}`, col3X + 3.8, fromCurrY);
      fromCurrY += 4.2;

      // Table of Items
      const tableStartY = Math.max(yPos + 34, fromCurrY + 4, addrY + (addrLines.length * 4) + 5);

      // Vertical subtle dividers matching UI
      pdf.setDrawColor(229, 231, 235);
      pdf.setLineWidth(0.3);
      pdf.line(col2X - 4, yPos - 2, col2X - 4, tableStartY - 3);
      pdf.line(col3X - 4, yPos - 2, col3X - 4, tableStartY - 3);

      const tableColumns = ['NO', 'DESCRIPTION', 'HSN/SAC', 'GST (%)', 'QTY', 'PRICE (Rs.)', 'TOTAL (Rs.)'];
      const tableRows = invoiceData.items.map((item, idx) => [
        (idx + 1).toString(),
        item.description || 'Item or service description',
        item.hsn || '',
        Number(item.gst || 0).toFixed(2),
        item.qty.toString(),
        Number(item.rate || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 }),
        Number(item.total || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })
      ]);

      autoTable(pdf, {
        head: [tableColumns],
        body: tableRows,
        startY: tableStartY,
        theme: 'grid',
        margin: { left: marginLeft, right: marginRight, bottom: 20 },
        styles: { fontSize: 8.5, cellPadding: 3.2, overflow: 'linebreak' },
        headStyles: {
          fillColor: [11, 102, 59],
          textColor: [255, 255, 255],
          fontStyle: 'bold',
          halign: 'center'
        },
        columnStyles: {
          0: { cellWidth: 10, halign: 'center' },
          1: { cellWidth: 'auto', halign: 'left' },
          2: { cellWidth: 22, halign: 'center' },
          3: { cellWidth: 18, halign: 'center' },
          4: { cellWidth: 14, halign: 'center' },
          5: { cellWidth: 26, halign: 'right' },
          6: { cellWidth: 28, halign: 'right' }
        },
        alternateRowStyles: { fillColor: [248, 250, 252] }
      });

      let currentY = pdf.lastAutoTable.finalY + 5;

      // Totals & Amount In Words Section (with doc icon)
      pdf.setFillColor(11, 102, 59);
      pdf.roundedRect(marginLeft, currentY, 46, 6.5, 1.5, 1.5, 'F');
      drawDocIconWhite(marginLeft + 2.5, currentY + 3.5);
      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(8);
      pdf.setTextColor(255, 255, 255);
      pdf.text("AMOUNT IN WORDS", marginLeft + 7.5, currentY + 4.5);

      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(8.5);
      pdf.setTextColor(31, 41, 55);
      const wordsLines = pdf.splitTextToSize(totals.totalInWords, 90);
      pdf.text(wordsLines, marginLeft, currentY + 11.5);

      // Right Totals Container (Matching UI preview card)
      const totalsRightX = pageWidth - marginRight;
      const boxWidth = 80;
      const boxLeft = totalsRightX - boxWidth;
      const colonX = totalsRightX - 31;
      const valueEndX = totalsRightX - 4;
      
      const gstRowsCount = invoiceData.gstEnabled ? (invoiceData.saleType === 'Intrastate' ? 2 : 1) : 0;
      const cardHeight = 15 + (gstRowsCount * 5.5) + 11;
      
      pdf.setFillColor(249, 250, 251);
      pdf.setDrawColor(229, 231, 235);
      pdf.setLineWidth(0.3);
      pdf.roundedRect(boxLeft, currentY, boxWidth, cardHeight, 2, 2, 'FD');

      let totY = currentY + 4.5;

      const printTotRow = (lbl, val, isGrand = false) => {
        const formattedVal = `Rs. ${Number(val).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`;
        if (isGrand) {
          pdf.setFillColor(11, 102, 59);
          pdf.roundedRect(boxLeft + 2, totY, boxWidth - 4, 7.5, 1.5, 1.5, 'F');
          pdf.setFont("helvetica", "bold");
          pdf.setFontSize(8.5);
          pdf.setTextColor(255, 255, 255);
          pdf.text(lbl, boxLeft + 4, totY + 4.8);
          pdf.text(':', colonX, totY + 4.8);
          pdf.text(formattedVal, valueEndX - 2, totY + 4.8, { align: 'right' });
        } else {
          pdf.setFont("helvetica", "normal");
          pdf.setFontSize(8);
          pdf.setTextColor(75, 85, 99);
          pdf.text(lbl, boxLeft + 4, totY + 3.5);
          pdf.text(':', colonX, totY + 3.5);
          pdf.setFont("helvetica", "bold");
          pdf.setTextColor(17, 24, 39);
          pdf.text(formattedVal, valueEndX - 2, totY + 3.5, { align: 'right' });
          totY += 5.5;
        }
      };

      printTotRow("Sub Total", totals.subtotal.toFixed(2));
      if (invoiceData.gstEnabled) {
        if (invoiceData.saleType === 'Intrastate') {
          printTotRow(`CGST (${totals.halfGst}%)`, totals.cgstTotal.toFixed(2));
          printTotRow(`SGST (${totals.halfGst}%)`, totals.sgstTotal.toFixed(2));
        } else {
          printTotRow(`IGST (${totals.fullGst}%)`, totals.igstTotal.toFixed(2));
        }
      }
      totY += 1.5;
      printTotRow("GRAND TOTAL", totals.grandTotal.toFixed(2), true);

      // Section Positioning: Dynamic full-page fill ensuring NO blank bottom void
      const totalsBottomY = currentY + cardHeight;
      const targetFooterY = pageHeight - 21;
      const targetTaglineY = pageHeight - 12;

      // Check if content fits in 1 page or requires next page
      let payStartY;
      if (totalsBottomY + 85 <= targetFooterY) {
        // Comfortably fits in single page - distribute proportionally to fill page
        payStartY = Math.max(totalsBottomY + 7, (totalsBottomY + targetFooterY - 78) / 2);
      } else if (totalsBottomY + 75 > pageHeight - 20) {
        pdf.addPage();
        payStartY = marginTop + 6;
      } else {
        payStartY = totalsBottomY + 5;
      }

      // Dotted Divider
      pdf.setDrawColor(209, 213, 219);
      pdf.setLineDashPattern([1, 1], 0);
      pdf.line(marginLeft, payStartY, pageWidth - marginRight, payStartY);
      pdf.setLineDashPattern([], 0);

      const paymentY = payStartY + 5;

      // Helper Icons for Payment & Bullets
      const drawCardBadge = (x, y) => {
        pdf.setFillColor(11, 102, 59);
        pdf.circle(x + 2.2, y - 1.2, 2.3, 'F');
        pdf.setFillColor(255, 255, 255);
        pdf.roundedRect(x + 0.5, y - 2.2, 3.4, 2.4, 0.3, 0.3, 'F');
        pdf.setFillColor(11, 102, 59);
        pdf.rect(x + 0.5, y - 1.5, 3.4, 0.6, 'F');
      };

      const drawReceiptIcon = (x, y) => {
        pdf.setDrawColor(11, 102, 59);
        pdf.setFillColor(255, 255, 255);
        pdf.setLineWidth(0.4);
        pdf.roundedRect(x - 1.8, y - 3.2, 3.8, 5.0, 0.4, 0.4, 'FD');
        pdf.setFillColor(11, 102, 59);
        pdf.rect(x - 1.1, y - 2.0, 2.4, 0.4, 'F');
        pdf.rect(x - 1.1, y - 0.9, 2.4, 0.4, 'F');
        pdf.rect(x - 1.1, y + 0.2, 1.6, 0.4, 'F');
      };

      const drawHeadsetIcon = (x, y) => {
        const cx = x + 1.2;
        const cy = y - 1.1;
        pdf.setDrawColor(11, 102, 59);
        pdf.setFillColor(11, 102, 59);
        pdf.setLineWidth(0.4);
        // Headband arc
        pdf.circle(cx, cy - 0.2, 1.8, 'S');
        // Clear lower half
        pdf.setFillColor(255, 255, 255);
        pdf.rect(cx - 2.5, cy - 0.2, 5.0, 2.5, 'F');
        // Earcups
        pdf.setFillColor(11, 102, 59);
        pdf.roundedRect(cx - 2.0, cy - 0.8, 0.9, 1.8, 0.3, 0.3, 'F');
        pdf.roundedRect(cx + 1.1, cy - 0.8, 0.9, 1.8, 0.3, 0.3, 'F');
        // Mic boom
        pdf.setLineWidth(0.3);
        pdf.line(cx + 1.1, cy + 0.6, cx + 0.3, cy + 1.2);
        pdf.circle(cx + 0.2, cy + 1.2, 0.25, 'F');
      };

      // 3 Columns in Payment Row
      const qrColX = marginLeft + 68;
      const bulletsDividerX = marginLeft + 114;
      const bulletsX = marginLeft + 121;

      // Vertical dividers between the 3 payment columns
      pdf.setDrawColor(229, 231, 235);
      pdf.setLineWidth(0.3);
      pdf.line(qrColX - 3, paymentY - 2, qrColX - 3, paymentY + 36);
      pdf.line(bulletsDividerX, paymentY - 2, bulletsDividerX, paymentY + 36);

      // Column 1: Payment Method (Green Circle + Bold Green Text)
      drawCardBadge(marginLeft, paymentY);
      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(8.5);
      pdf.setTextColor(11, 102, 59);
      pdf.text("PAYMENT METHOD", marginLeft + 6.2, paymentY);

      let bankY = paymentY + 5.5;
      const displayUpiId = (invoiceData.upiId || '').trim() || 'techvaseegrah.ibz@icici';

      const bankDetails = [
        ['Bank Name', invoiceData.bankName || 'ICICI Bank'],
        ['Account Name', invoiceData.accountName || 'TECH VASEEGRAH'],
        ['Account Number', invoiceData.accountNumber || '612805036053'],
        ['IFSC Code', invoiceData.ifscCode || 'ICIC0006128']
      ];

      const col1LabelWidth = 24;
      const col1ValX = marginLeft + col1LabelWidth + 3;

      bankDetails.forEach(([bLabel, bVal]) => {
        pdf.setFont("helvetica", "normal");
        pdf.setFontSize(7.8);
        pdf.setTextColor(75, 85, 99);
        pdf.text(bLabel, marginLeft, bankY);
        pdf.text(":", marginLeft + col1LabelWidth, bankY);
        pdf.setFont("helvetica", "bold");
        pdf.setTextColor(17, 24, 39);
        pdf.text(bVal, col1ValX, bankY);
        bankY += 4.8;
      });

      // Column 2: QR Code (Framed in emerald border with centered labels)
      const qrCenter = qrColX + 20;
      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(8.5);
      pdf.setTextColor(11, 102, 59);
      pdf.text("SCAN & PAY", qrCenter, paymentY, { align: 'center' });

      pdf.setFont("helvetica", "normal");
      pdf.setFontSize(6.8);
      pdf.setTextColor(107, 114, 128);
      pdf.text("UPI / ICICI / Any UPI App", qrCenter, paymentY + 3.8, { align: 'center' });

      // Emerald rounded border around QR Code
      const qrBoxSize = 25;
      const qrBoxX = qrCenter - (qrBoxSize / 2);
      const qrBoxY = paymentY + 5.5;
      pdf.setFillColor(255, 255, 255);
      pdf.setDrawColor(16, 185, 129);
      pdf.setLineWidth(0.5);
      pdf.roundedRect(qrBoxX, qrBoxY, qrBoxSize, qrBoxSize, 1.8, 1.8, 'FD');

      if (upiQrCodeUrl) {
        try {
          pdf.addImage(upiQrCodeUrl, "PNG", qrBoxX + 1.2, qrBoxY + 1.2, qrBoxSize - 2.4, qrBoxSize - 2.4);
        } catch (e) {
          console.error("QR Code add error:", e);
        }
      }

      // UPI ID below QR Code - Bold, prominent, and high-contrast
      const upiIdLabel = `UPI ID: ${displayUpiId}`;
      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(7.8);
      const upiTextW = pdf.getTextWidth(upiIdLabel);

      // Light rounded pill behind text for crisp readability
      pdf.setFillColor(243, 244, 246);
      pdf.roundedRect(qrCenter - (upiTextW / 2) - 2, qrBoxY + qrBoxSize + 1.8, upiTextW + 4, 4.6, 1.2, 1.2, 'F');

      pdf.setTextColor(11, 102, 59);
      pdf.text(upiIdLabel, qrCenter, qrBoxY + qrBoxSize + 5.2, { align: 'center' });

      // Column 3: Security & Help Bullets (Positioned with comfortable rightward padding)
      let bulletY = paymentY + 1.5;

      // Bullet 1: Checkmark
      pdf.setFillColor(11, 102, 59);
      pdf.circle(bulletsX + 2, bulletY + 1.5, 2.2, 'F');
      pdf.setDrawColor(255, 255, 255);
      pdf.setLineWidth(0.45);
      pdf.line(bulletsX + 1.0, bulletY + 1.5, bulletsX + 1.7, bulletY + 2.2);
      pdf.line(bulletsX + 1.7, bulletY + 2.2, bulletsX + 2.9, bulletY + 0.8);

      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(7.5);
      pdf.setTextColor(55, 65, 81);
      pdf.text("Make payments securely", bulletsX + 7, bulletY + 0.5);
      pdf.setFont("helvetica", "normal");
      pdf.text("using any UPI App", bulletsX + 7, bulletY + 3.8);

      // Bullet 2: Receipt Icon
      bulletY += 10.5;
      drawReceiptIcon(bulletsX + 2, bulletY + 1.5);
      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(7.5);
      pdf.setTextColor(55, 65, 81);
      pdf.text("Please share payment", bulletsX + 7, bulletY + 0.5);
      pdf.setFont("helvetica", "normal");
      pdf.text("screenshot after payment", bulletsX + 7, bulletY + 3.8);

      // Bullet 3: Headset Support Icon
      bulletY += 10.5;
      drawHeadsetIcon(bulletsX + 2, bulletY + 1.5);
      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(7.5);
      pdf.setTextColor(55, 65, 81);
      pdf.text("For any queries", bulletsX + 7, bulletY + 0.5);
      pdf.setFont("helvetica", "bold");
      pdf.setTextColor(11, 102, 59);
      pdf.text(`+91 ${invoiceData.fromSection?.mobile || '7667792779'}`, bulletsX + 7, bulletY + 3.8);

      // Notes & Big Company Seal Section (Positioned directly above footer to eliminate empty bottom space)
      const footerY = Math.max(paymentY + 42, targetFooterY);
      const notesHeight = 24;
      const notesY = footerY - notesHeight - 5;

      // Notes Box (Light subtle mint background matching UI)
      const notesWidth = 92;
      pdf.setDrawColor(209, 250, 229);
      pdf.setFillColor(244, 251, 247);
      pdf.roundedRect(marginLeft, notesY, notesWidth, notesHeight, 2, 2, 'FD');

      drawNoteIconGreen(marginLeft + 3.5, notesY + 4.2);
      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(8);
      pdf.setTextColor(11, 102, 59);
      pdf.text("NOTES", marginLeft + 8, notesY + 4.5);

      pdf.setFont("helvetica", "normal");
      pdf.setFontSize(7.5);
      pdf.setTextColor(75, 85, 99);
      const noteLines = pdf.splitTextToSize(invoiceData.notes || 'Thank you for your business.\nWe appreciate your trust in us.', 84);
      pdf.text(noteLines, marginLeft + 4, notesY + 9);

      // Prominent Big Company Seal (Right - flush right above footer)
      const sealSize = 48;
      const sealX = pageWidth - marginRight - sealSize - 2;
      const sealY = footerY - sealSize - 2;
      try {
        const sealImg = sealPreview || '/stamp.png';
        if (sealImg) {
          pdf.addImage(sealImg, "PNG", sealX, sealY, sealSize, sealSize);
        }
      } catch (e) {
        console.error("Seal embed error:", e);
      }

      // Footer Banner directly at the bottom of the page
      const footerWidth = pageWidth - marginLeft - marginRight;
      pdf.setFillColor(11, 102, 59);
      pdf.roundedRect(marginLeft, footerY, footerWidth, 6.5, 1, 1, 'F');

      // Thin dividers inside footer banner
      pdf.setDrawColor(255, 255, 255);
      pdf.setLineWidth(0.2);
      pdf.line(marginLeft + (footerWidth / 3), footerY + 1, marginLeft + (footerWidth / 3), footerY + 5.5);
      pdf.line(marginLeft + (2 * footerWidth / 3), footerY + 1, marginLeft + (2 * footerWidth / 3), footerY + 5.5);

      // Helper vector shapes for footer
      const drawShield = (x, y) => {
        pdf.setDrawColor(255, 255, 255);
        pdf.setLineWidth(0.4);
        pdf.line(x - 1.2, y - 1.5, x + 1.2, y - 1.5);
        pdf.line(x + 1.2, y - 1.5, x + 1.2, y - 0.3);
        pdf.line(x + 1.2, y - 0.3, x, y + 1.3);
        pdf.line(x, y + 1.3, x - 1.2, y - 0.3);
        pdf.line(x - 1.2, y - 0.3, x - 1.2, y - 1.5);
      };

      const drawRocket = (x, y) => {
        pdf.setDrawColor(255, 255, 255);
        pdf.setFillColor(255, 255, 255);
        pdf.setLineWidth(0.35);
        pdf.line(x - 0.8, y + 1.2, x + 0.8, y - 1.2);
        pdf.triangle(x + 0.4, y - 1.4, x + 1.4, y - 0.4, x + 1.6, y - 1.6, 'F');
      };

      const drawUsers = (x, y) => {
        pdf.setFillColor(255, 255, 255);
        pdf.circle(x - 0.8, y - 0.8, 0.55, 'F');
        pdf.ellipse(x - 0.8, y + 0.6, 1.0, 0.55, 'F');
        pdf.circle(x + 0.8, y - 0.8, 0.55, 'F');
        pdf.ellipse(x + 0.8, y + 0.6, 1.0, 0.55, 'F');
      };

      const drawHeartIcon = (hx, hy) => {
        pdf.setFillColor(11, 102, 59);
        pdf.circle(hx - 0.7, hy - 0.3, 0.75, 'F');
        pdf.circle(hx + 0.7, hy - 0.3, 0.75, 'F');
        pdf.triangle(hx - 1.35, hy - 0.1, hx + 1.35, hy - 0.1, hx, hy + 1.5, 'F');
      };

      const colW = footerWidth / 3;
      drawShield(marginLeft + 10, footerY + 3.4);
      drawRocket(marginLeft + colW + 10, footerY + 3.4);
      drawUsers(marginLeft + (2 * colW) + 10, footerY + 3.4);

      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(7.5);
      pdf.setTextColor(255, 255, 255);
      pdf.text("Reliable Solutions", marginLeft + 14, footerY + 4.2);
      pdf.text("On-time Delivery", marginLeft + colW + 14, footerY + 4.2);
      pdf.text("Dedicated Support", marginLeft + (2 * colW) + 14, footerY + 4.2);

      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(7.5);
      pdf.setTextColor(11, 102, 59);
      const taglineText = "Thank you for choosing TECH VASEEGRAH!";
      const taglineWidth = pdf.getTextWidth(taglineText);
      const tagX = (pageWidth - taglineWidth) / 2;
      const taglineY = footerY + 9.5;
      pdf.text(taglineText, tagX, taglineY);
      drawHeartIcon(tagX + taglineWidth + 3, taglineY - 1.5);

      return pdf;
    } catch (error) {
      console.error('Error generating PDF:', error);
      toast.error('An error occurred while generating PDF: ' + error.message);
      return null;
    }
  };

  const generatePdfBase64 = async () => {
    const pdf = await generatePdfDoc();
    if (!pdf) return null;
    return pdf.output('datauristring');
  };

  const downloadPdf = async () => {
    const pdf = await generatePdfDoc();
    if (pdf) {
      pdf.save(`Invoice-${invoiceData.invoiceNo || 'TV000'}.pdf`);
      toast.success('PDF downloaded successfully!');
    }
  };

  const handleSaveInvoice = async () => {
    if (!invoiceData.customerName || !invoiceData.customerName.trim()) {
      toast.error('Please enter customer name.');
      return;
    }

    try {
      setIsSaving(true);
      const effectiveId = invoiceData._id || initialData?._id;
      let savedInvoice = null;
      if (onInvoiceSave) {
        savedInvoice = await onInvoiceSave({ ...invoiceData, signature: signaturePreview, _id: effectiveId, gstEnabled: true });
      } else {
        let res;
        if (effectiveId) {
          res = await updateInvoice(effectiveId, { ...invoiceData, signature: signaturePreview, gstEnabled: true });
        } else {
          res = await createInvoice({ ...invoiceData, signature: signaturePreview, gstEnabled: true });
        }
        if (res?.success) {
          savedInvoice = res.data;
        }
      }

      const targetId = savedInvoice?._id || savedInvoice?.mongoId || effectiveId;
      if (targetId && !invoiceData._id) {
        setInvoiceData(prev => ({ ...prev, _id: targetId }));
      }

      toast.success('Invoice saved successfully!');

      if (!effectiveId) {
        const nextRes = await getNextInvoiceNo().catch(() => null);
        if (nextRes?.success && nextRes.data?.nextInvoiceNo) {
          setInvoiceData({
            ...getFreshInvoiceData(formattedDate),
            invoiceNo: nextRes.data.nextInvoiceNo
          });
        }
      }
    } catch (err) {
      console.error('Error saving invoice:', err);
      toast.error('Error saving invoice: ' + (err.message || 'Unknown error'));
    } finally {
      setIsSaving(false);
    }
  };

  const handleSendInvoice = async () => {
    const hasEmptyDescriptions = invoiceData.items.some(item => !item.description || item.description.trim() === '');
    if (hasEmptyDescriptions) {
      toast.error('Please fill in descriptions for all items before sending.');
      return;
    }

    if (!invoiceData.customerName || !invoiceData.customerName.trim()) {
      toast.error('Please enter customer name.');
      return;
    }

    if (!invoiceData.customerContact || !invoiceData.customerContact.trim()) {
      toast.error('Please enter customer contact phone number.');
      return;
    }

    try {
      setIsSending(true);
      const effectiveId = invoiceData._id || initialData?._id;
      let savedInvoice = null;
      if (onInvoiceSave) {
        savedInvoice = await onInvoiceSave({ ...invoiceData, signature: signaturePreview, _id: effectiveId, gstEnabled: true });
      } else {
        let res;
        if (effectiveId) {
          res = await updateInvoice(effectiveId, { ...invoiceData, signature: signaturePreview, gstEnabled: true });
        } else {
          res = await createInvoice({ ...invoiceData, signature: signaturePreview, gstEnabled: true });
        }
        if (res?.success) {
          savedInvoice = res.data;
        }
      }

      const targetId = savedInvoice?._id || savedInvoice?.mongoId || effectiveId;
      if (targetId && !invoiceData._id) {
        setInvoiceData(prev => ({ ...prev, _id: targetId }));
      }

      const pdfBase64 = await generatePdfBase64();

      if (targetId && pdfBase64) {
        const waRes = await sendInvoiceWhatsApp(targetId, pdfBase64, invoiceData.customerContact);
        if (waRes?.whatsappSuccess || waRes?.whatsappResult?.templateRes?.success) {
          toast.success('Invoice saved and sent directly to customer via WhatsApp API!');
        } else {
          toast.info(waRes?.message || 'Invoice saved successfully!');
        }
      } else {
        toast.success('Invoice saved successfully!');
      }
    } catch (err) {
      console.error('Error sending invoice:', err);
      toast.error('Error sending invoice: ' + (err.message || 'Unknown error'));
    } finally {
      setIsSending(false);
    }
  };

  const printInvoice = () => {
    const hasEmptyDescriptions = invoiceData.items.some(item => !item.description || item.description.trim() === '');
    if (hasEmptyDescriptions) {
      toast.error('Please fill in descriptions for all items before printing.');
      return;
    }

    if (onInvoiceSave) {
      onInvoiceSave({ ...invoiceData, signature: signaturePreview, _id: initialData?._id });
    }

    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      toast.error('Popup blocked. Please allow popups for this site to print.');
      return;
    }

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Invoice - ${invoiceData.invoiceNo || 'Print'}</title>
          <style>
            @import url('https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700;800&display=swap');
            @page {
              size: A4;
              margin: 10mm;
            }
            * {
              box-sizing: border-box;
              margin: 0;
              padding: 0;
            }
            body {
              font-family: 'Outfit', sans-serif;
              color: #1f2937;
              background: white;
              padding: 15px;
              -webkit-print-color-adjust: exact;
              print-color-adjust: exact;
            }
            .invoice-wrapper {
              position: relative;
              max-width: 800px;
              margin: 0 auto;
              background: #ffffff;
            }
            .header-top {
              display: flex;
              justify-content: space-between;
              align-items: flex-start;
              margin-bottom: 25px;
              position: relative;
            }
            .wave-header {
              position: absolute;
              top: -15px;
              right: -15px;
              width: 260px;
              height: 95px;
              pointer-events: none;
            }
            .logo-img {
              height: 55px;
              object-fit: contain;
            }
            .invoice-title {
              font-size: 30px;
              font-weight: 800;
              color: #0b663b;
              text-transform: uppercase;
              letter-spacing: 0.5px;
              margin-top: 15px;
              text-align: right;
            }
            .info-grid {
              display: grid;
              grid-template-columns: 1.15fr 0.85fr 1fr;
              gap: 20px;
              margin-bottom: 25px;
              font-size: 13px;
            }
            .section-label {
              font-size: 11px;
              font-weight: 700;
              color: #0b663b;
              text-transform: uppercase;
              letter-spacing: 0.5px;
              display: flex;
              align-items: center;
              gap: 6px;
              margin-bottom: 4px;
            }
            .company-name, .customer-name {
              font-size: 14px;
              font-weight: 700;
              color: #111827;
              margin-bottom: 3px;
            }
            .meta-item {
              margin-bottom: 10px;
            }
            .meta-lbl {
              font-size: 11px;
              color: #6b7280;
              font-weight: 500;
              display: flex;
              align-items: center;
              gap: 4px;
            }
            .meta-val {
              font-size: 13.5px;
              font-weight: 700;
              color: #111827;
              margin-top: 1px;
            }
            table.items-table {
              width: 100%;
              border-collapse: collapse;
              margin-bottom: 20px;
              font-size: 12.5px;
            }
            table.items-table th {
              background-color: #0b663b;
              color: white;
              font-weight: 700;
              padding: 9px 10px;
              text-transform: uppercase;
              font-size: 11.5px;
              letter-spacing: 0.5px;
            }
            table.items-table th:first-child {
              border-top-left-radius: 6px;
              border-bottom-left-radius: 6px;
            }
            table.items-table th:last-child {
              border-top-right-radius: 6px;
              border-bottom-right-radius: 6px;
            }
            table.items-table td {
              padding: 9px 10px;
              border-bottom: 1px solid #f3f4f6;
              color: #374151;
            }
            .pill-badge {
              display: inline-flex;
              align-items: center;
              gap: 6px;
              background: #0b663b;
              color: white;
              font-size: 11px;
              font-weight: 700;
              padding: 4px 12px;
              border-radius: 9999px;
              text-transform: uppercase;
              margin-bottom: 8px;
            }
            .totals-section {
              display: flex;
              justify-content: space-between;
              align-items: flex-start;
              gap: 20px;
              margin-bottom: 25px;
            }
            .totals-table {
              width: 270px;
              font-size: 13px;
            }
            .totals-table td {
              padding: 4px 0;
            }
            .grand-total-pill {
              background: #0b663b;
              color: white;
              font-size: 14px;
              font-weight: 700;
              padding: 8px 14px;
              border-radius: 6px;
              display: flex;
              justify-content: space-between;
              margin-top: 6px;
            }
            .dashed-sep {
              border-top: 1.5px dashed #d1d5db;
              margin: 20px 0;
            }
            .payment-grid {
              display: grid;
              grid-template-columns: 1.2fr 0.9fr 1.1fr;
              gap: 15px;
              margin-bottom: 20px;
              font-size: 12px;
            }
            .qr-box {
              text-align: center;
              border: 1px solid #e5e7eb;
              border-radius: 8px;
              padding: 8px;
              background: #fafafa;
            }
            .footer-bar {
              background: #0b663b;
              color: white;
              padding: 8px 15px;
              border-radius: 4px;
              display: flex;
              justify-content: space-around;
              font-size: 11.5px;
              font-weight: 600;
              margin-bottom: 8px;
            }
            .footer-tagline {
              text-align: center;
              font-size: 12px;
              font-weight: 600;
              color: #0b663b;
            }
          </style>
        </head>
        <body>
          <div class="invoice-wrapper">
            <!-- Header Top Section -->
            <div class="header-top">
              <div>
                <img src="/Invoicelogo.png" alt="Tech Vaseegrah" class="logo-img" />
              </div>
              <div style="text-align: right;">
                <div class="invoice-title">${invoiceData.invoiceType}</div>
                ${invoiceData.isPaid ? `<div style="text-align: right; color: #10b981; font-weight: 700; font-size: 13px; margin-top: 4px;">PAID</div>` : ''}
              </div>
            </div>

            <!-- 3 Column Info Section -->
            <div class="info-grid">
              <!-- Column 1: BILL TO & ADDRESS -->
              <div>
                <div class="section-label">
                  BILL TO
                </div>
                <div class="customer-name">${invoiceData.customerName || 'N/A'}</div>
                ${invoiceData.customerGst ? `<div style="font-size: 11px; color: #0b663b; font-weight: 600; margin-top: 2px;">GSTIN: ${invoiceData.customerGst}</div>` : ''}
                <div style="margin-top: 8px;">
                  <div class="section-label">
                    ADDRESS
                  </div>
                  <div style="color: #4b5563; font-size: 12px; line-height: 1.45;">${invoiceData.customerAddress || 'N/A'}</div>
                </div>
              </div>

              <!-- Column 2: INVOICE META -->
              <div>
                <div class="meta-item">
                  <div class="meta-lbl">Invoice No.</div>
                  <div class="meta-val">${invoiceData.invoiceNo}</div>
                </div>
                <div class="meta-item">
                  <div class="meta-lbl">Invoice Date</div>
                  <div class="meta-val">${invoiceData.invoiceDate}</div>
                </div>
                <div class="meta-item">
                  <div class="meta-lbl">Due Date</div>
                  <div class="meta-val">${invoiceData.dueDate || invoiceData.invoiceDate}</div>
                </div>
              </div>

              <!-- Column 3: FROM -->
              <div>
                <div class="section-label">FROM</div>
                <div class="company-name">${invoiceData.fromSection?.company}</div>
                <div style="color: #4b5563; font-size: 11.5px; line-height: 1.4;">
                  <div>${invoiceData.fromSection?.addressLine1} ${invoiceData.fromSection?.addressLine2}</div>
                  <div>${invoiceData.fromSection?.addressLine3} ${invoiceData.fromSection?.cityZip}</div>
                  <div style="margin-top: 4px; display: flex; align-items: center; gap: 4px;">
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#0b663b" stroke-width="2"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"></path></svg>
                    <span>${invoiceData.fromSection?.mobile}</span>
                  </div>
                  <div style="display: flex; align-items: center; gap: 4px;">
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#0b663b" stroke-width="2"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"></path><polyline points="22,6 12,13 2,6"></polyline></svg>
                    <span>${invoiceData.fromSection?.email || 'techvaseegrah@gmail.com'}</span>
                  </div>
                  <div style="display: flex; align-items: center; gap: 4px;">
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#0b663b" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><line x1="2" y1="12" x2="22" y2="12"></line><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"></path></svg>
                    <span>GSTIN: ${invoiceData.fromSection?.gstin}</span>
                  </div>
                </div>
              </div>
            </div>

            <!-- Items Table -->
            <table class="items-table">
              <thead>
                <tr>
                  <th style="width: 6%; text-align: center;">NO</th>
                  <th style="width: 42%; text-align: left;">DESCRIPTION</th>
                  <th style="width: 14%; text-align: center;">HSN/SAC</th>
                  <th style="width: 10%; text-align: center;">GST (%)</th>
                  <th style="width: 8%; text-align: center;">QTY</th>
                  <th style="width: 10%; text-align: right;">PRICE (₹)</th>
                  <th style="width: 10%; text-align: right;">TOTAL (₹)</th>
                </tr>
              </thead>
              <tbody>
                ${invoiceData.items.map((item, index) => `
                  <tr style="background: ${index % 2 === 0 ? '#ffffff' : '#f9fafb'};">
                    <td style="text-align: center; font-weight: 500;">${index + 1}</td>
                    <td style="font-weight: 500;">${item.description || '-'}</td>
                    <td style="text-align: center; color: #6b7280;">${item.hsn || ''}</td>
                    <td style="text-align: center;">${Number(item.gst || 0).toFixed(2)}</td>
                    <td style="text-align: center;">${item.qty}</td>
                    <td style="text-align: right;">${Number(item.rate || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                    <td style="text-align: right; font-weight: 600;">${Number(item.total || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>

            <!-- Amount in Words & Totals -->
            <div class="totals-section">
              <div style="flex: 1;">
                <div class="pill-badge" style="display: inline-flex; align-items: center; gap: 4px;">
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line></svg>
                  <span>AMOUNT IN WORDS</span>
                </div>
                <div style="font-size: 13px; font-weight: 600; color: #111827; margin-top: 4px; line-height: 1.4;">
                  ${totals.totalInWords}
                </div>
              </div>

              <div class="totals-table">
                <table style="width: 100%;">
                  <tr>
                    <td style="color: #6b7280; text-align: right;">Sub Total :</td>
                    <td style="text-align: right; font-weight: 600;">₹ ${totals.subtotal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                  </tr>
                  ${invoiceData.gstEnabled && invoiceData.saleType === 'Intrastate' ? `
                    <tr>
                      <td style="color: #6b7280; text-align: right;">CGST (${totals.halfGst}%) :</td>
                      <td style="text-align: right; font-weight: 600;">₹ ${totals.cgstTotal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                    </tr>
                    <tr>
                      <td style="color: #6b7280; text-align: right;">SGST (${totals.halfGst}%) :</td>
                      <td style="text-align: right; font-weight: 600;">₹ ${totals.sgstTotal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                    </tr>
                  ` : ''}
                  ${invoiceData.gstEnabled && invoiceData.saleType === 'Interstate' ? `
                    <tr>
                      <td style="color: #6b7280; text-align: right;">IGST (${totals.fullGst}%) :</td>
                      <td style="text-align: right; font-weight: 600;">₹ ${totals.igstTotal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                    </tr>
                  ` : ''}
                </table>
                <div class="grand-total-pill">
                  <span>GRAND TOTAL :</span>
                  <span>₹ ${totals.grandTotal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                </div>
              </div>
            </div>

            <div class="dashed-sep"></div>

            <!-- Payment Grid (3 columns) -->
            <div class="payment-grid">
              <!-- Bank Details -->
              <div>
                <div class="pill-badge" style="display: inline-flex; align-items: center; gap: 4px;">
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="1" y="4" width="22" height="16" rx="2" ry="2"></rect><line x1="1" y1="10" x2="23" y2="10"></line></svg>
                  <span>PAYMENT METHOD</span>
                </div>
                <div style="font-size: 11.5px; color: #374151; line-height: 1.6; margin-top: 4px;">
                  <div><span style="color: #6b7280;">Bank Name</span> : <strong>${invoiceData.bankName}</strong></div>
                  <div><span style="color: #6b7280;">Account Name</span> : <strong>${invoiceData.accountName}</strong></div>
                  <div><span style="color: #6b7280;">Account Number</span> : <strong>${invoiceData.accountNumber}</strong></div>
                  <div><span style="color: #6b7280;">IFSC Code</span> : <strong>${invoiceData.ifscCode}</strong></div>
                </div>
              </div>

              <!-- QR Code -->
              <div class="qr-box">
                <div style="font-size: 11px; font-weight: 700; color: #0b663b;">SCAN & PAY</div>
                <div style="font-size: 9.5px; color: #9ca3af; margin-bottom: 4px;">UPI / ICICI / Any UPI App</div>
                ${upiQrCodeUrl ? `<img src="${upiQrCodeUrl}" style="width: 85px; height: 85px; display: inline-block;" />` : ''}
                <div style="font-size: 10px; font-weight: 700; color: #0b663b; margin-top: 4px;">UPI ID: ${invoiceData.upiId || 'techvaseegrah.ibz@icici'}</div>
              </div>

              <!-- Security Points -->
              <div style="display: flex; flex-direction: column; justify-content: center; gap: 8px; font-size: 11px; color: #374151;">
                <div style="display: flex; align-items: center; gap: 6px;">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#0b663b" stroke-width="2.5"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>
                  <span>Make payments securely using any UPI App</span>
                </div>
                <div style="display: flex; align-items: center; gap: 6px;">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#0b663b" stroke-width="2.5"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line></svg>
                  <span>Please share payment screenshot after payment</span>
                </div>
                <div style="display: flex; align-items: center; gap: 6px;">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#0b663b" stroke-width="2.5"><path d="M3 18v-6a9 9 0 0 1 18 0v6"></path><path d="M21 19a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3zM3 19a2 2 0 0 0 2 2h1a2 2 0 0 0 2-2v-3a2 2 0 0 0-2-2H3z"></path></svg>
                  <span>For any queries +91 ${invoiceData.fromSection?.mobile || '9047484484'}</span>
                </div>
              </div>
            </div>

            <!-- Notes & Seal -->
            <div style="display: flex; justify-content: space-between; align-items: flex-end; margin-bottom: 20px;">
              <div style="background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 8px; padding: 10px 14px; width: 48%;">
                <div style="font-size: 11px; font-weight: 700; color: #0b663b; margin-bottom: 4px; display: flex; align-items: center; gap: 4px;">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#0b663b" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
                  <span>NOTES</span>
                </div>
                <div style="font-size: 11.5px; color: #4b5563; white-space: pre-line;">${invoiceData.notes}</div>
              </div>

              <div>
                ${sealPreview ? `<img src="${sealPreview}" style="height: 165px; width: 165px; object-fit: contain; display: block;" />` : ''}
              </div>
            </div>

            <!-- Footer Bar -->
            <div class="footer-bar">
              <div style="display: flex; align-items: center; justify-content: center; gap: 4px;">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path></svg>
                <span>Reliable Solutions</span>
              </div>
              <div style="display: flex; align-items: center; justify-content: center; gap: 4px;">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m12 15-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2z"></path></svg>
                <span>On-time Delivery</span>
              </div>
              <div style="display: flex; align-items: center; justify-content: center; gap: 4px;">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M22 21v-2a4 4 0 0 0-3-3.87"></path></svg>
                <span>Dedicated Support</span>
              </div>
            </div>
            <div class="footer-tagline" style="display: flex; align-items: center; justify-content: center; gap: 4px;">
              <span>Thank you for choosing TECH VASEEGRAH!</span>
              <svg width="11" height="11" viewBox="0 0 24 24" fill="#0b663b" stroke="#0b663b"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path></svg>
            </div>
          </div>
        </body>
      </html>
    `);

    printWindow.document.close();
    printWindow.focus();
    setTimeout(() => {
      printWindow.print();
      printWindow.close();
    }, 500);
  };

  return (
    <div className="max-w-6xl mx-auto p-2 sm:p-4 bg-gray-50 font-sans min-h-screen">
      {/* Top Action Header */}
      <div className="mb-6 flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-4 rounded-xl shadow-sm border border-gray-200">
        <div>
          <h1 className="text-xl font-bold text-gray-800 flex items-center gap-2">
            {isPreviewMode ? (
              <span className="flex items-center gap-2 text-emerald-700">
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                </svg>
                Viewing Invoice {invoiceData.invoiceNo}
                <span className="text-xs font-semibold bg-emerald-100 text-emerald-800 px-2.5 py-0.5 rounded-full">Read Only</span>
              </span>
            ) : initialData ? (
              <span className="flex items-center gap-2 text-amber-600">
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                </svg>
                Edit Invoice ({invoiceData.invoiceNo})
                <span className="text-xs font-semibold bg-amber-100 text-amber-800 border border-amber-200 px-2.5 py-0.5 rounded-full">Edited</span>
              </span>
            ) : (
              'Create Proforma Invoice'
            )}
          </h1>
          <p className="text-xs text-gray-500 mt-0.5">Professional Green Theme • Auto GST & Calculations</p>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-wrap items-center gap-2">
          {!isPreviewMode && (
            <button
              type="button"
              onClick={handleSendInvoice}
              disabled={isSending}
              className="flex items-center gap-1.5 bg-[#25D366] hover:bg-[#128C7E] text-white px-4 py-2 rounded-lg text-sm font-semibold transition shadow-sm disabled:opacity-50"
            >
              {isSending ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                  Sending...
                </>
              ) : (
                <>
                  <svg className="w-4 h-4 fill-current" viewBox="0 0 24 24">
                    <path d="M.057 24l1.687-6.163c-1.041-1.804-1.588-3.849-1.587-5.946.003-6.556 5.338-11.891 11.893-11.891 3.181.001 6.167 1.24 8.413 3.488 2.245 2.248 3.481 5.236 3.48 8.414-.003 6.557-5.338 11.892-11.893 11.892-1.99-.001-3.951-.5-5.688-1.448l-6.705 1.754zm6.597-3.807c1.676.995 3.276 1.591 5.392 1.592 5.448 0 9.886-4.434 9.889-9.885.002-5.462-4.415-9.89-9.881-9.892-5.452 0-9.887 4.434-9.889 9.884-.001 2.225.651 3.891 1.746 5.634l-.999 3.648 3.742-.981zm11.387-5.464c-.074-.124-.272-.198-.57-.347-.297-.149-1.758-.868-2.031-.967-.272-.099-.47-.149-.669.149-.198.297-.768.967-.941 1.165-.173.198-.347.223-.644.074-.297-.149-1.255-.462-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.297-.347.446-.521.151-.172.2-.296.3-.495.099-.198.05-.372-.025-.521-.075-.148-.669-1.611-.916-2.206-.242-.579-.487-.501-.669-.51l-.57-.01c-.198 0-.52.074-.792.372s-1.04 1.016-1.04 2.479 1.065 2.876 1.213 3.074c.149.198 2.095 3.2 5.076 4.487.709.306 1.263.489 1.694.626.712.226 1.36.194 1.872.118.571-.085 1.758-.719 2.006-1.413.248-.695.248-1.29.173-1.414z" />
                  </svg>
                  Send Invoice
                </>
              )}
            </button>
          )}
        </div>
      </div>

      {/* Main Invoice Layout Container */}
      <fieldset disabled={isPreviewMode} className="contents">
        <div className="overflow-x-auto pb-4">
          <div
            ref={invoiceRef}
            className="min-w-[760px] max-w-4xl mx-auto relative bg-white rounded-2xl shadow-md border border-gray-200 overflow-hidden p-6 sm:p-10 mb-6"
            style={{ fontFamily: "'Outfit', sans-serif" }}
          >
            {/* Header: Logo & Title */}
            <div className="relative z-10 flex justify-between items-start mb-8 pt-2">
              <div>
                <img
                  src="/Invoicelogo.png"
                  alt="TECH VASEEGRAH"
                  className="h-16 object-contain"
                  onError={(e) => {
                    e.target.style.display = 'none';
                    if (e.target.nextSibling) e.target.nextSibling.style.display = 'block';
                  }}
                />
                <div style={{ display: 'none' }}>
                  <h2 className="text-2xl font-extrabold tracking-tight text-[#0b663b]">TECH VASEEGRAH</h2>
                  <p className="text-xs text-gray-500 font-medium">Technology. Solutions. Growth.</p>
                </div>
              </div>

              <div className="text-right pt-2 pr-1">
                <div className="relative inline-block">
                  {!isPreviewMode ? (
                    <select
                      name="invoiceType"
                      value={invoiceData.invoiceType}
                      onChange={handleInputChange}
                      className="text-3xl font-extrabold text-[#0b663b] bg-transparent border-b-2 border-transparent hover:border-emerald-300 focus:outline-none cursor-pointer tracking-tight uppercase text-right"
                    >
                      <option value="PROFORMA INVOICE">PROFORMA INVOICE</option>
                      <option value="TAX INVOICE">TAX INVOICE</option>
                      <option value="INVOICE">INVOICE</option>
                    </select>
                  ) : (
                    <h1 className="text-3xl font-extrabold text-[#0b663b] uppercase tracking-tight">{invoiceData.invoiceType}</h1>
                  )}
                </div>
                {invoiceData.isPaid && (
                  <div className="text-sm font-bold text-emerald-600 uppercase tracking-widest mt-1">● PAID</div>
                )}
              </div>
            </div>

            {/* 3 Column Top Section: BILL TO | INVOICE DETAILS | FROM (with vertical dividers) */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-0 mb-8 text-sm relative z-10">
              {/* Column 1: BILL TO & ADDRESS */}
              <div className="space-y-4 pr-5">
                <div>
                  <div className="flex items-center gap-2 text-[#0b663b] font-bold text-xs uppercase tracking-wider mb-1.5">
                    <span className="w-6 h-6 rounded-full bg-[#0b663b] text-white flex items-center justify-center text-xs shadow-2xs">
                      <FaUser className="w-2.5 h-2.5" />
                    </span>
                    BILL TO
                  </div>
                  <input
                    type="text"
                    name="customerName"
                    value={invoiceData.customerName}
                    onChange={handleInputChange}
                    placeholder="Customer / Company Name"
                    className="w-full text-base font-bold text-gray-900 bg-transparent border-b border-gray-300 hover:border-emerald-400 focus:border-[#0b663b] focus:outline-none pb-0.5"
                  />
                  <input
                    type="tel"
                    name="customerContact"
                    value={invoiceData.customerContact}
                    onChange={handleInputChange}
                    placeholder="Mobile Number (10 digits)"
                    maxLength={10}
                    className="w-full text-xs text-gray-600 bg-transparent border-b border-transparent hover:border-gray-300 focus:border-emerald-400 focus:outline-none mt-1"
                  />
                  <div className="flex items-center gap-1.5 mt-1.5">
                    <span className="text-[11px] font-bold text-gray-500">GSTIN:</span>
                    <input
                      type="text"
                      name="customerGst"
                      value={invoiceData.customerGst}
                      onChange={handleInputChange}
                      placeholder="Customer GST Number (Optional)"
                      className="w-full text-xs font-semibold text-gray-800 uppercase bg-transparent border-b border-gray-200 hover:border-emerald-400 focus:border-[#0b663b] focus:outline-none"
                    />
                  </div>
                </div>

                <div>
                  <div className="flex items-center gap-2 text-[#0b663b] font-bold text-xs uppercase tracking-wider mb-1.5">
                    <span className="w-6 h-6 rounded-full bg-[#0b663b] text-white flex items-center justify-center text-xs shadow-2xs">
                      <FaMapMarkerAlt className="w-2.5 h-2.5" />
                    </span>
                    ADDRESS
                  </div>
                  <textarea
                    name="customerAddress"
                    value={invoiceData.customerAddress}
                    onChange={handleInputChange}
                    placeholder="Customer full address (Street, City, State, Pin code)"
                    rows="3"
                    className="w-full text-xs text-gray-700 bg-transparent border-b border-gray-200 hover:border-emerald-400 focus:border-[#0b663b] focus:outline-none resize-none leading-relaxed"
                  />
                </div>
              </div>

              {/* Column 2: INVOICE DETAILS (Framed icons with vertical divider) */}
              <div className="border-t md:border-t-0 md:border-l border-gray-200 pt-4 md:pt-0 md:pl-6 md:pr-4 space-y-4">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-lg bg-emerald-50 border border-emerald-200 flex items-center justify-center text-[#0b663b] shrink-0">
                    <FaFileInvoice className="w-4 h-4" />
                  </div>
                  <div className="flex-1">
                    <div className="text-[11px] font-medium text-gray-500">Invoice No.</div>
                    <input
                      type="text"
                      name="invoiceNo"
                      value={invoiceData.invoiceNo}
                      onChange={handleInputChange}
                      className="w-full text-sm font-bold text-gray-900 bg-transparent border-b border-gray-200 hover:border-emerald-400 focus:border-[#0b663b] focus:outline-none"
                    />
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-lg bg-emerald-50 border border-emerald-200 flex items-center justify-center text-[#0b663b] shrink-0">
                    <FaCalendarAlt className="w-4 h-4" />
                  </div>
                  <div className="flex-1">
                    <div className="text-[11px] font-medium text-gray-500 mb-0.5">Invoice Date</div>
                    <CustomDatePicker
                      value={invoiceData.invoiceDate}
                      onChange={(val) => handleInputChange({ target: { name: 'invoiceDate', value: val } })}
                      format="DMY"
                      placeholder="DD/MM/YYYY"
                      className="w-full"
                      inputClassName="py-0.5 px-0 border-0 border-b border-gray-200 hover:border-emerald-400 focus:border-[#0b663b] rounded-none text-sm font-bold text-gray-900 bg-transparent shadow-none"
                      showIcon={false}
                    />
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-lg bg-emerald-50 border border-emerald-200 flex items-center justify-center text-[#0b663b] shrink-0">
                    <FaClock className="w-4 h-4" />
                  </div>
                  <div className="flex-1">
                    <div className="text-[11px] font-medium text-gray-500 mb-0.5">Due Date</div>
                    <CustomDatePicker
                      value={invoiceData.dueDate || invoiceData.invoiceDate}
                      onChange={(val) => handleInputChange({ target: { name: 'dueDate', value: val } })}
                      format="DMY"
                      placeholder="DD/MM/YYYY"
                      className="w-full"
                      inputClassName="py-0.5 px-0 border-0 border-b border-gray-200 hover:border-emerald-400 focus:border-[#0b663b] rounded-none text-sm font-bold text-gray-900 bg-transparent shadow-none"
                      showIcon={false}
                    />
                  </div>
                </div>

                {!isPreviewMode && (
                  <div className="pt-1">
                    <label className="text-[10px] font-bold text-gray-400 uppercase block mb-0.5">Sale Type</label>
                    <select
                      name="saleType"
                      value={invoiceData.saleType}
                      onChange={handleInputChange}
                      className="text-xs bg-white border border-gray-300 rounded px-2 py-1 w-full text-gray-700 focus:outline-none focus:border-emerald-500"
                    >
                      <option value="Intrastate">Intrastate (CGST + SGST)</option>
                      <option value="Interstate">Interstate (IGST)</option>
                    </select>
                  </div>
                )}
              </div>

              {/* Column 3: FROM (Company Info with vertical divider) */}
              <div className="border-t md:border-t-0 md:border-l border-gray-200 pt-4 md:pt-0 md:pl-6 space-y-1">
                <div className="text-[#0b663b] font-bold text-xs uppercase tracking-wider mb-1">
                  FROM
                </div>
                <input
                  type="text"
                  value={invoiceData.fromSection?.company}
                  onChange={(e) => handleFromSectionChange('company', e.target.value)}
                  className="w-full text-sm font-extrabold text-gray-900 bg-transparent border-b border-transparent hover:border-gray-300 focus:border-emerald-400 focus:outline-none mb-1 uppercase"
                />
                <div className="text-xs text-gray-600 space-y-0.5">
                  <input
                    type="text"
                    value={invoiceData.fromSection?.addressLine1}
                    onChange={(e) => handleFromSectionChange('addressLine1', e.target.value)}
                    className="w-full bg-transparent border-b border-transparent hover:border-gray-200 focus:border-emerald-400 focus:outline-none"
                    placeholder="Address Line 1"
                  />
                  <input
                    type="text"
                    value={invoiceData.fromSection?.addressLine2}
                    onChange={(e) => handleFromSectionChange('addressLine2', e.target.value)}
                    className="w-full bg-transparent border-b border-transparent hover:border-gray-200 focus:border-emerald-400 focus:outline-none"
                    placeholder="Address Line 2"
                  />
                  <input
                    type="text"
                    value={invoiceData.fromSection?.addressLine3}
                    onChange={(e) => handleFromSectionChange('addressLine3', e.target.value)}
                    className="w-full bg-transparent border-b border-transparent hover:border-gray-200 focus:border-emerald-400 focus:outline-none"
                    placeholder="Address Line 3"
                  />
                  <input
                    type="text"
                    value={invoiceData.fromSection?.cityZip}
                    onChange={(e) => handleFromSectionChange('cityZip', e.target.value)}
                    className="w-full bg-transparent border-b border-transparent hover:border-gray-200 focus:border-emerald-400 focus:outline-none"
                    placeholder="City - Zip"
                  />
                  <div className="flex items-center gap-2 text-gray-700 pt-1.5">
                    <FaPhoneAlt className="text-[#0b663b] w-3 h-3 shrink-0" />
                    <input
                      type="text"
                      value={invoiceData.fromSection?.mobile}
                      onChange={(e) => handleFromSectionChange('mobile', e.target.value)}
                      className="w-full bg-transparent border-b border-transparent hover:border-gray-200 focus:border-emerald-400 focus:outline-none font-medium"
                      placeholder="Phone"
                    />
                  </div>
                  <div className="flex items-center gap-2 text-gray-700">
                    <FaEnvelope className="text-[#0b663b] w-3 h-3 shrink-0" />
                    <input
                      type="text"
                      value={invoiceData.fromSection?.email || 'techvaseegrah@gmail.com'}
                      onChange={(e) => handleFromSectionChange('email', e.target.value)}
                      className="w-full bg-transparent border-b border-transparent hover:border-gray-200 focus:border-emerald-400 focus:outline-none font-medium"
                      placeholder="Email"
                    />
                  </div>
                  <div className="flex items-center gap-2 text-gray-700">
                    <FaGlobe className="text-[#0b663b] w-3 h-3 shrink-0" />
                    <span className="font-semibold text-gray-600">GSTIN:</span>
                    <input
                      type="text"
                      value={invoiceData.fromSection?.gstin}
                      onChange={(e) => handleFromSectionChange('gstin', e.target.value)}
                      className="w-full bg-transparent border-b border-transparent hover:border-gray-200 focus:border-emerald-400 focus:outline-none uppercase font-medium"
                      placeholder="GSTIN"
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Table of Items */}
            <div className="mb-6 overflow-hidden rounded-lg border border-gray-200">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-[#0b663b] text-white text-xs font-bold uppercase tracking-wider">
                    <th className="py-3 px-3 text-center w-12">NO</th>
                    <th className="py-3 px-3 text-left">DESCRIPTION</th>
                    <th className="py-3 px-3 text-center w-24">HSN/SAC</th>
                    <th className="py-3 px-3 text-center w-20">GST (%)</th>
                    <th className="py-3 px-3 text-center w-16">QTY</th>
                    <th className="py-3 px-3 text-right w-24">PRICE (₹)</th>
                    <th className="py-3 px-3 text-right w-28">TOTAL (₹)</th>
                    {!isPreviewMode && <th className="py-3 px-2 text-center w-10"></th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 text-sm">
                  {invoiceData.items.map((item, index) => (
                    <tr key={item.id} className={index % 2 === 0 ? 'bg-white hover:bg-gray-50' : 'bg-[#f8fafc] hover:bg-gray-50'}>
                      <td className="py-2.5 px-3 text-center text-gray-500 font-medium">{index + 1}</td>
                      <td className="py-2.5 px-3">
                        <textarea
                          value={item.description}
                          onChange={(e) => handleItemChange(item.id, 'description', e.target.value)}
                          placeholder="Item or service description"
                          rows="2"
                          className="w-full bg-transparent border-0 focus:ring-1 focus:ring-emerald-500 rounded p-1 text-sm text-gray-900 resize-none font-medium"
                        />
                      </td>
                      <td className="py-2.5 px-3 text-center">
                        <input
                          type="text"
                          value={item.hsn ?? ''}
                          onChange={(e) => handleItemChange(item.id, 'hsn', e.target.value)}
                          placeholder="HSN/SAC"
                          className="w-full text-center bg-transparent border-0 focus:ring-1 focus:ring-emerald-500 rounded p-1 text-xs text-gray-600 font-mono"
                        />
                      </td>
                      <td className="py-2.5 px-3 text-center">
                        <input
                          type="number"
                          step="0.01"
                          value={item.gst}
                          onChange={(e) => handleItemChange(item.id, 'gst', e.target.value)}
                          className="w-full text-center bg-transparent border-0 focus:ring-1 focus:ring-emerald-500 rounded p-1 text-sm text-gray-700"
                        />
                      </td>
                      <td className="py-2.5 px-3 text-center">
                        <input
                          type="number"
                          min="1"
                          value={item.qty}
                          onChange={(e) => handleItemChange(item.id, 'qty', e.target.value)}
                          className="w-full text-center bg-transparent border-0 focus:ring-1 focus:ring-emerald-500 rounded p-1 text-sm text-gray-700 font-semibold"
                        />
                      </td>
                      <td className="py-2.5 px-3 text-right">
                        <input
                          type="number"
                          step="0.01"
                          value={item.rate}
                          onChange={(e) => handleItemChange(item.id, 'rate', e.target.value)}
                          className="w-full text-right bg-transparent border-0 focus:ring-1 focus:ring-emerald-500 rounded p-1 text-sm text-gray-700"
                        />
                      </td>
                      <td className="py-2.5 px-3 text-right font-bold text-gray-900">
                        <input
                          type="number"
                          step="0.01"
                          value={item.total}
                          onChange={(e) => handleItemChange(item.id, 'total', e.target.value)}
                          className="w-full text-right bg-transparent border-0 focus:ring-1 focus:ring-emerald-500 rounded p-1 text-sm font-bold text-gray-900"
                        />
                      </td>
                      {!isPreviewMode && (
                        <td className="py-2.5 px-2 text-center">
                          {invoiceData.items.length > 1 && (
                            <button
                              type="button"
                              onClick={() => removeItem(item.id)}
                              className="text-gray-400 hover:text-red-500 transition p-1"
                              title="Delete Item"
                            >
                              ✕
                            </button>
                          )}
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
              {!isPreviewMode && (
                <div className="bg-gray-50 px-4 py-2 flex justify-end border-t border-gray-100">
                  <button
                    type="button"
                    onClick={addItem}
                    className="flex items-center gap-1 text-xs font-bold text-[#0b663b] hover:text-emerald-800 bg-white border border-emerald-300 hover:border-emerald-500 px-3 py-1.5 rounded-md transition shadow-2xs"
                  >
                    + Add Item Line
                  </button>
                </div>
              )}
            </div>

            {/* Totals & Amount in Words */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6 items-start">
              <div>
                <div className="inline-flex items-center gap-2 bg-[#0b663b] text-white text-xs font-bold px-3 py-1 rounded-full uppercase tracking-wider mb-2">
                  <FaFileAlt className="w-3.5 h-3.5 text-white shrink-0" /> AMOUNT IN WORDS
                </div>
                <p className="text-sm font-bold text-gray-900 leading-relaxed pl-1">
                  {totals.totalInWords}
                </p>
              </div>

              <div className="bg-gray-50/70 p-4 rounded-xl border border-gray-200 text-sm space-y-2">
                <div className="flex justify-between text-gray-600">
                  <span>Sub Total :</span>
                  <span className="font-semibold text-gray-900">₹ {totals.subtotal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                </div>
                {invoiceData.gstEnabled && invoiceData.saleType === 'Intrastate' && (
                  <>
                    <div className="flex justify-between text-gray-600">
                      <span>CGST ({totals.halfGst}%) :</span>
                      <span className="font-semibold text-gray-900">₹ {totals.cgstTotal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                    </div>
                    <div className="flex justify-between text-gray-600">
                      <span>SGST ({totals.halfGst}%) :</span>
                      <span className="font-semibold text-gray-900">₹ {totals.sgstTotal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                    </div>
                  </>
                )}
                {invoiceData.gstEnabled && invoiceData.saleType === 'Interstate' && (
                  <div className="flex justify-between text-gray-600">
                    <span>IGST ({totals.fullGst}%) :</span>
                    <span className="font-semibold text-gray-900">₹ {totals.igstTotal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                  </div>
                )}
                <div className="bg-[#0b663b] text-white p-3 rounded-lg flex justify-between items-center font-bold text-base shadow-sm mt-3">
                  <span className="uppercase tracking-wider">GRAND TOTAL :</span>
                  <span>₹ {totals.grandTotal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                </div>
              </div>
            </div>

            {/* Dotted Divider */}
            <div className="border-t-2 border-dashed border-gray-200 my-6"></div>

            {/* Payment Method, QR Code, Security Features (3 columns with dividers) */}
            <div className="grid grid-cols-1 md:grid-cols-[1.35fr_1fr_1.25fr] gap-0 mb-6 text-xs text-gray-700 items-start">
              {/* Column 1: Payment Method */}
              <div className="pr-5">
                <div className="flex items-center gap-2 text-[#0b663b] font-bold text-xs uppercase tracking-wider mb-2.5">
                  <span className="w-5 h-5 rounded-full bg-[#0b663b] text-white flex items-center justify-center text-[10px] shadow-2xs">
                    <FaCreditCard className="w-2.5 h-2.5" />
                  </span>
                  PAYMENT METHOD
                </div>
                <div className="space-y-1.5 pl-1">
                  <div className="flex items-center">
                    <span className="text-gray-500 w-28 shrink-0 font-medium">Bank Name</span>
                    <span className="text-gray-400 mr-2">:</span>
                    <input
                      type="text"
                      name="bankName"
                      value={invoiceData.bankName}
                      onChange={handleInputChange}
                      className="font-bold text-gray-900 bg-transparent border-b border-transparent hover:border-gray-300 focus:border-emerald-400 focus:outline-none flex-1 py-0.5"
                    />
                  </div>
                  <div className="flex items-center">
                    <span className="text-gray-500 w-28 shrink-0 font-medium">Account Name</span>
                    <span className="text-gray-400 mr-2">:</span>
                    <input
                      type="text"
                      name="accountName"
                      value={invoiceData.accountName}
                      onChange={handleInputChange}
                      className="font-bold text-gray-900 bg-transparent border-b border-transparent hover:border-gray-300 focus:border-emerald-400 focus:outline-none flex-1 py-0.5"
                    />
                  </div>
                  <div className="flex items-center">
                    <span className="text-gray-500 w-28 shrink-0 font-medium">Account Number</span>
                    <span className="text-gray-400 mr-2">:</span>
                    <input
                      type="text"
                      name="accountNumber"
                      value={invoiceData.accountNumber}
                      onChange={handleInputChange}
                      className="font-bold text-gray-900 bg-transparent border-b border-transparent hover:border-gray-300 focus:border-emerald-400 focus:outline-none flex-1 py-0.5"
                    />
                  </div>
                  <div className="flex items-center">
                    <span className="text-gray-500 w-28 shrink-0 font-medium">IFSC Code</span>
                    <span className="text-gray-400 mr-2">:</span>
                    <input
                      type="text"
                      name="ifscCode"
                      value={invoiceData.ifscCode}
                      onChange={handleInputChange}
                      className="font-bold text-gray-900 bg-transparent border-b border-transparent hover:border-gray-300 focus:border-emerald-400 focus:outline-none flex-1 uppercase py-0.5"
                    />
                  </div>
                </div>
              </div>

              {/* Column 2: QR Code (Framed in emerald border with centered labels) */}
              <div className="border-t md:border-t-0 md:border-l border-gray-200 pt-4 md:pt-0 md:px-5 flex flex-col items-center justify-center text-center">
                <div className="text-xs font-bold text-[#0b663b] uppercase tracking-wide">SCAN & PAY</div>
                <div className="text-[10px] text-gray-400 mb-2">UPI / ICICI / Any UPI App</div>
                <div className="border-2 border-emerald-500 rounded-xl p-1 bg-white shadow-2xs inline-block">
                  {upiQrCodeUrl ? (
                    <img
                      src={upiQrCodeUrl}
                      alt="UPI QR"
                      className="w-24 h-24 object-contain"
                    />
                  ) : (
                    <div className="w-24 h-24 bg-gray-50 rounded-lg flex items-center justify-center text-[10px] text-gray-400 text-center px-1">
                      Enter UPI ID to generate QR
                    </div>
                  )}
                </div>
                <div className="text-[10px] font-bold text-gray-700 mt-1.5 flex items-center justify-center gap-1 w-full max-w-[200px]">
                  <span className="shrink-0">UPI ID:</span>
                  <input
                    type="text"
                    name="upiId"
                    value={invoiceData.upiId || ''}
                    onChange={handleInputChange}
                    placeholder="Enter UPI ID"
                    className="text-[10px] font-bold text-gray-800 bg-transparent border-b border-transparent hover:border-gray-300 focus:border-emerald-400 focus:outline-none text-center w-full"
                  />
                </div>
              </div>

              {/* Column 3: Secure Points & Support */}
              <div className="border-t md:border-t-0 md:border-l border-gray-200 pt-4 md:pt-0 md:pl-5 space-y-3 justify-center flex flex-col">
                <div className="flex items-start gap-2.5">
                  <FaCheckCircle className="text-[#0b663b] w-4 h-4 shrink-0 mt-0.5" />
                  <div>
                    <div className="text-gray-800 font-bold text-xs">Make payments securely</div>
                    <div className="text-gray-500 text-[11px]">using any UPI App</div>
                  </div>
                </div>
                <div className="flex items-start gap-2.5">
                  <FaFileInvoiceDollar className="text-[#0b663b] w-4 h-4 shrink-0 mt-0.5" />
                  <div>
                    <div className="text-gray-800 font-bold text-xs">Please share payment</div>
                    <div className="text-gray-500 text-[11px]">screenshot after payment</div>
                  </div>
                </div>
                <div className="flex items-start gap-2.5">
                  <FaHeadset className="text-[#0b663b] w-4 h-4 shrink-0 mt-0.5" />
                  <div>
                    <div className="text-gray-800 font-bold text-xs">For any queries</div>
                    <div className="text-[#0b663b] font-bold text-xs">+91 {invoiceData.fromSection?.mobile || '7667792779'}</div>
                  </div>
                </div>
              </div>
            </div>

            {/* Notes & Big Company Seal Section */}
            <div className="flex flex-col md:flex-row justify-between items-center gap-6 mb-6">
              {/* Notes Box */}
              <div className="flex-1 w-full bg-emerald-50/30 p-3.5 rounded-xl border border-emerald-100">
                <div className="flex items-center gap-1.5 text-xs font-bold text-[#0b663b] mb-1.5">
                  <FaEdit className="w-3.5 h-3.5 shrink-0" /> NOTES
                </div>
                <textarea
                  name="notes"
                  value={invoiceData.notes}
                  onChange={handleInputChange}
                  rows="2"
                  className="w-full text-xs text-gray-600 bg-transparent border-0 focus:ring-0 p-0 resize-none font-medium"
                />
              </div>

              {/* Big Company Seal */}
              <div className="flex items-center justify-end shrink-0">
                <img
                  src={sealPreview || '/stamp.png'}
                  alt="Seal"
                  className="h-44 w-44 md:h-48 md:w-48 object-contain shrink-0 drop-shadow-sm"
                  onError={(e) => { e.target.style.display = 'none'; }}
                />
              </div>
            </div>

            {/* Branded Footer Bar with Divided 3 Columns */}
            <div className="bg-[#0b663b] text-white py-2 px-4 rounded-lg grid grid-cols-3 divide-x divide-white/20 text-center text-xs font-semibold tracking-wide mb-2 shadow-xs">
              <div className="flex items-center justify-center gap-2"><FaShieldAlt className="w-3.5 h-3.5" /> Reliable Solutions</div>
              <div className="flex items-center justify-center gap-2"><FaRocket className="w-3.5 h-3.5" /> On-time Delivery</div>
              <div className="flex items-center justify-center gap-2"><FaUsers className="w-3.5 h-3.5" /> Dedicated Support</div>
            </div>
            <div className="text-center text-xs font-bold text-[#0b663b] flex items-center justify-center gap-1">
              Thank you for choosing TECH VASEEGRAH! <FaHeart className="w-3 h-3 text-[#0b663b] fill-current" />
            </div>
          </div>
        </div>

        {/* Extra Settings & Asset Upload (Seal & Payment Status) */}
        {!isPreviewMode && (
          <div className="space-y-4 mb-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-200">
                <h3 className="font-bold text-gray-800 text-sm mb-3">Company Seal</h3>
                <div className="space-y-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Upload Company Seal / Stamp</label>
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handleSealUpload}
                      className="w-full text-xs text-gray-500 file:mr-3 file:py-1.5 file:px-3 file:rounded-md file:border-0 file:text-xs file:font-semibold file:bg-emerald-50 file:text-emerald-700 hover:file:bg-emerald-100"
                    />
                    {sealPreview && (
                      <div className="mt-2 flex items-center gap-2">
                        <span className="text-[11px] text-gray-500">Current seal:</span>
                        <img src={sealPreview} alt="Seal Preview" className="h-10 w-10 object-contain border p-1 rounded bg-gray-50" />
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-200">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="font-bold text-gray-800 text-sm">Payment Status</h3>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      name="isPaid"
                      checked={invoiceData.isPaid || false}
                      onChange={(e) => setInvoiceData(prev => ({ ...prev, isPaid: e.target.checked }))}
                      className="w-4 h-4 text-emerald-600 rounded focus:ring-emerald-500"
                    />
                    <span className="text-xs font-bold text-gray-700">Mark as Paid</span>
                  </label>
                </div>

                {invoiceData.paymentRecords && invoiceData.paymentRecords.length > 0 && (
                  <div className="space-y-2 mb-2">
                    {invoiceData.paymentRecords.map((rec, idx) => (
                      <div key={rec._id || rec.tempId || idx} className="flex items-center gap-2 text-xs bg-gray-50 p-2 rounded">
                        <input
                          type="number"
                          placeholder="Amount"
                          value={rec.amount}
                          onChange={(e) => updatePaymentRecord(idx, 'amount', e.target.value)}
                          className="w-20 px-1.5 py-1 border rounded"
                        />
                        <CustomDatePicker
                          value={rec.dateReceived}
                          onChange={(val) => updatePaymentRecord(idx, 'dateReceived', val)}
                          format="YMD"
                          placeholder="Date"
                          className="w-36"
                          inputClassName="py-1 px-2 text-xs border rounded bg-white"
                          showIcon={false}
                        />
                        <input
                          type="text"
                          placeholder="Txn ID"
                          value={rec.transactionId}
                          onChange={(e) => updatePaymentRecord(idx, 'transactionId', e.target.value)}
                          className="flex-1 px-1.5 py-1 border rounded"
                        />
                        <button
                          type="button"
                          onClick={() => removePaymentRecord(idx)}
                          className="text-red-500 font-bold px-1"
                        >
                          ✕
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                <button
                  type="button"
                  onClick={addPaymentRecord}
                  className="text-xs font-semibold text-emerald-700 hover:text-emerald-800 flex items-center gap-1"
                >
                  + Add Partial Payment Record
                </button>
              </div>
            </div>
          </div>
        )}
      </fieldset>
    </div>
  );
};

export default AdvancedInvoice;