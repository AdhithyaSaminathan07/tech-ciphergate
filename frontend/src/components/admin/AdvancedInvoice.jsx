import React, { useState, useRef, useEffect, useContext } from 'react';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { toast } from 'react-toastify';
import QRCode from 'qrcode';
import api from '../../services/api';
import appContext from '../../context/AppContext';
import { getNextInvoiceNo, sendInvoiceWhatsApp, createInvoice, updateInvoice } from '../../services/invoiceService';
import CustomDatePicker from '../common/CustomDatePicker';

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
    mobile: '7667792779',
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
  paymentRecords: []
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
      paymentRecords: data.paymentRecords || []
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

  // Fetch tenant Payment & Bank Details from Settings if creating new
  useEffect(() => {
    const fetchPaymentSettings = async () => {
      if (initialData?._id) return;
      try {
        const targetSubdomain = contextSubdomain || localStorage.getItem('subdomain') || 'tech-vaseegrah';
        let res;
        try {
          res = await api.get(`/settings/${targetSubdomain}`);
        } catch (subErr) {
          res = await api.get(`/settings/public/${targetSubdomain}`);
        }
        if (res.data && res.data.paymentDetails) {
          const { bankName, accountNumber, ifscCode, upiId, companyName } = res.data.paymentDetails;
          setInvoiceData(prev => ({
            ...prev,
            bankName: bankName || prev.bankName,
            accountName: companyName || prev.accountName,
            accountNumber: accountNumber || prev.accountNumber,
            ifscCode: ifscCode || prev.ifscCode,
            upiId: upiId || prev.upiId
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
        const upiId = invoiceData.upiId || 'techvaseegrah.ibz@icici';
        const companyName = invoiceData.accountName || invoiceData.fromSection?.company || 'TECH VASEEGRAH';
        const amount = totals.grandTotal ? totals.grandTotal.toFixed(2) : '0.00';
        const note = `Invoice ${invoiceData.invoiceNo || ''}`;
        const upiString = `upi://pay?pa=${upiId}&pn=${encodeURIComponent(companyName)}&am=${amount}&cu=INR&tn=${encodeURIComponent(note)}`;
        const qrUrl = await QRCode.toDataURL(upiString, { margin: 1, width: 150 });
        setUpiQrCodeUrl(qrUrl);
      } catch (err) {
        console.error('Error generating UPI QR code:', err);
      }
    };
    generateUpiQr();
  }, [invoiceData.upiId, invoiceData.accountName, invoiceData.invoiceNo, invoiceData.items, invoiceData.gstEnabled, invoiceData.saleType]);

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

      // PROFORMA INVOICE Title (Right)
      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(22);
      pdf.setTextColor(11, 102, 59);
      const titleText = invoiceData.invoiceType || "PROFORMA INVOICE";
      const titleWidth = pdf.getTextWidth(titleText);
      pdf.text(titleText, pageWidth - marginRight - titleWidth, marginTop + 12);

      if (invoiceData.isPaid) {
        pdf.setFontSize(12);
        pdf.setTextColor(16, 185, 129);
        pdf.text("PAID", pageWidth - marginRight - titleWidth - 18, marginTop + 12);
      }

      let yPos = marginTop + 26;

      // 3-Column Info Section
      const col1X = marginLeft;
      const col2X = marginLeft + 65;
      const col3X = marginLeft + 120;

      // Column 1: BILL TO & ADDRESS
      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(9);
      pdf.setTextColor(11, 102, 59);
      pdf.text("BILL TO", col1X, yPos);

      pdf.setFontSize(10);
      pdf.setTextColor(17, 24, 39);
      pdf.text(invoiceData.customerName || 'Customer Name', col1X, yPos + 5);

      pdf.setFontSize(9);
      pdf.setTextColor(11, 102, 59);
      pdf.text("ADDRESS", col1X, yPos + 12);

      pdf.setFont("helvetica", "normal");
      pdf.setFontSize(8.5);
      pdf.setTextColor(55, 65, 81);
      const addrLines = pdf.splitTextToSize(invoiceData.customerAddress || 'Customer Address', 55);
      pdf.text(addrLines, col1X, yPos + 16);

      // Column 2: INVOICE DETAILS
      pdf.setFont("helvetica", "normal");
      pdf.setFontSize(8);
      pdf.setTextColor(107, 114, 128);
      pdf.text("Invoice No.", col2X, yPos);
      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(9);
      pdf.setTextColor(17, 24, 39);
      pdf.text(invoiceData.invoiceNo || 'TV000', col2X, yPos + 4.5);

      pdf.setFont("helvetica", "normal");
      pdf.setFontSize(8);
      pdf.setTextColor(107, 114, 128);
      pdf.text("Invoice Date", col2X, yPos + 11);
      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(9);
      pdf.setTextColor(17, 24, 39);
      pdf.text(invoiceData.invoiceDate || formattedDate, col2X, yPos + 15.5);

      pdf.setFont("helvetica", "normal");
      pdf.setFontSize(8);
      pdf.setTextColor(107, 114, 128);
      pdf.text("Due Date", col2X, yPos + 22);
      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(9);
      pdf.setTextColor(17, 24, 39);
      pdf.text(invoiceData.dueDate || invoiceData.invoiceDate || formattedDate, col2X, yPos + 26.5);

      // Column 3: FROM Details
      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(9);
      pdf.setTextColor(11, 102, 59);
      pdf.text("FROM", col3X, yPos);

      pdf.setFontSize(9.5);
      pdf.setTextColor(17, 24, 39);
      pdf.text(invoiceData.fromSection?.company || "TECH VASEEGRAH", col3X, yPos + 4.5);

      pdf.setFont("helvetica", "normal");
      pdf.setFontSize(8);
      pdf.setTextColor(55, 65, 81);
      const fromLines = [
        `${invoiceData.fromSection?.addressLine1 || ''} ${invoiceData.fromSection?.addressLine2 || ''}`,
        `${invoiceData.fromSection?.addressLine3 || ''} ${invoiceData.fromSection?.cityZip || ''}`,
        `Tel: ${invoiceData.fromSection?.mobile || '7667792779'}`,
        `Email: ${invoiceData.fromSection?.email || 'techvaseegrah@gmail.com'}`,
        `GSTIN: ${invoiceData.fromSection?.gstin || '33KYGPS1983E1Z1'}`
      ];
      let fromY = yPos + 8.5;
      fromLines.forEach(fl => {
        if (fl.trim()) {
          pdf.text(fl, col3X, fromY);
          fromY += 4;
        }
      });

      // Table of Items
      const tableStartY = Math.max(yPos + 32, fromY + 4);
      const tableColumns = ['NO', 'DESCRIPTION', 'HSN/SAC', 'GST (%)', 'QTY', 'PRICE (Rs.)', 'TOTAL (Rs.)'];
      const tableRows = invoiceData.items.map((item, idx) => [
        (idx + 1).toString(),
        item.description || '',
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
        margin: { left: marginLeft, right: marginRight, bottom: 15 },
        styles: { fontSize: 8.5, cellPadding: 2.5, overflow: 'linebreak' },
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

      // Totals & Amount In Words Section
      pdf.setFillColor(11, 102, 59);
      pdf.roundedRect(marginLeft, currentY, 44, 6.5, 1.5, 1.5, 'F');
      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(8);
      pdf.setTextColor(255, 255, 255);
      pdf.text("AMOUNT IN WORDS", marginLeft + 4, currentY + 4.5);

      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(8.5);
      pdf.setTextColor(31, 41, 55);
      const wordsLines = pdf.splitTextToSize(totals.totalInWords, 90);
      pdf.text(wordsLines, marginLeft, currentY + 11.5);

      // Right Totals Table
      const totalsRightX = pageWidth - marginRight;
      const boxWidth = 78;
      const boxLeft = totalsRightX - boxWidth;
      const labelEndX = totalsRightX - 38;
      const colonX = totalsRightX - 35;
      const valueEndX = totalsRightX - 4;
      let totY = currentY;

      const printTotRow = (lbl, val, isGrand = false) => {
        const formattedVal = `Rs. ${Number(val).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`;
        if (isGrand) {
          pdf.setFillColor(11, 102, 59);
          pdf.roundedRect(boxLeft, totY - 1, boxWidth, 8, 1.5, 1.5, 'F');
          pdf.setFont("helvetica", "bold");
          pdf.setFontSize(9.5);
          pdf.setTextColor(255, 255, 255);
          pdf.text(lbl, labelEndX, totY + 4.5, { align: 'right' });
          pdf.text(':', colonX, totY + 4.5);
          pdf.text(formattedVal, valueEndX, totY + 4.5, { align: 'right' });
        } else {
          pdf.setFont("helvetica", "normal");
          pdf.setFontSize(8.5);
          pdf.setTextColor(75, 85, 99);
          pdf.text(lbl, labelEndX, totY + 3.5, { align: 'right' });
          pdf.text(':', colonX, totY + 3.5);
          pdf.setFont("helvetica", "bold");
          pdf.setTextColor(17, 24, 39);
          pdf.text(formattedVal, valueEndX, totY + 3.5, { align: 'right' });
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
      totY += 1;
      printTotRow("GRAND TOTAL", totals.grandTotal.toFixed(2), true);

      // Payment Details & QR Code & Features Section
      currentY = Math.max(currentY + 20, totY + 12);
      if (currentY > pageHeight - 75) {
        pdf.addPage();
        currentY = marginTop + 5;
      }

      // Dotted Divider
      pdf.setDrawColor(209, 213, 219);
      pdf.setLineDashPattern([1, 1], 0);
      pdf.line(marginLeft, currentY, pageWidth - marginRight, currentY);
      pdf.setLineDashPattern([], 0);
      currentY += 6;

      // 3 Columns in Payment Row:
      pdf.setFillColor(11, 102, 59);
      pdf.roundedRect(marginLeft, currentY, 44, 6.5, 1.5, 1.5, 'F');
      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(8);
      pdf.setTextColor(255, 255, 255);
      pdf.text("PAYMENT METHOD", marginLeft + 4, currentY + 4.5);

      let bankY = currentY + 11;
      const bankDetails = [
        ['Bank Name', invoiceData.bankName || 'ICICI Bank'],
        ['Account Name', invoiceData.accountName || 'TECH VASEEGRAH'],
        ['Account Number', invoiceData.accountNumber || '612805036053'],
        ['IFSC Code', invoiceData.ifscCode || 'ICIC0006128'],
        ['UPI Number', invoiceData.upiNumber || '7667792779']
      ];

      bankDetails.forEach(([bLabel, bVal]) => {
        pdf.setFont("helvetica", "normal");
        pdf.setFontSize(8);
        pdf.setTextColor(75, 85, 99);
        pdf.text(bLabel, marginLeft, bankY);
        pdf.text(":", marginLeft + 26, bankY);
        pdf.setFont("helvetica", bLabel === 'UPI Number' ? "bold" : "normal");
        pdf.setTextColor(bLabel === 'UPI Number' ? 11 : 17, bLabel === 'UPI Number' ? 102 : 24, bLabel === 'UPI Number' ? 59 : 39);
        pdf.text(bVal, marginLeft + 29, bankY);
        bankY += 4.5;
      });

      // Column B: QR Code
      const qrColX = marginLeft + 68;
      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(8.5);
      pdf.setTextColor(11, 102, 59);
      pdf.text("SCAN & PAY", qrColX + 10, currentY + 3, { align: 'center' });
      pdf.setFont("helvetica", "normal");
      pdf.setFontSize(7);
      pdf.setTextColor(107, 114, 128);
      pdf.text("UPI / ICICI / Any UPI App", qrColX + 10, currentY + 6.5, { align: 'center' });

      if (upiQrCodeUrl) {
        try {
          pdf.addImage(upiQrCodeUrl, "PNG", qrColX - 2, currentY + 8, 24, 24);
        } catch (e) {
          console.error("QR Code add error:", e);
        }
      }
      pdf.setFontSize(6.5);
      pdf.setTextColor(55, 65, 81);
      pdf.text(`UPI ID: ${invoiceData.upiId || 'techvaseegrah.ibz@icici'}`, qrColX + 10, currentY + 34.5, { align: 'center' });

      // Column C: Security & Help Bullets
      const bulletsX = marginLeft + 120;
      let bulletY = currentY + 6;
      const bullets = [
        "Make payments securely using any UPI App",
        "Please share payment screenshot after payment",
        "For any queries +91 76677 92779"
      ];
      bullets.forEach(b => {
        pdf.setFont("helvetica", "bold");
        pdf.setFontSize(7.5);
        pdf.setTextColor(11, 102, 59);
        pdf.text("✓", bulletsX, bulletY);
        pdf.setFont("helvetica", "normal");
        pdf.setFontSize(7.5);
        pdf.setTextColor(55, 65, 81);
        const bLines = pdf.splitTextToSize(b, 55);
        pdf.text(bLines, bulletsX + 4, bulletY);
        bulletY += bLines.length * 3.8 + 2;
      });

      // Notes & Signature Section
      let notesY = currentY + 38;
      if (notesY > pageHeight - 35) {
        pdf.addPage();
        notesY = marginTop + 5;
      }

      // Notes Box
      pdf.setDrawColor(229, 231, 235);
      pdf.setFillColor(249, 250, 251);
      pdf.roundedRect(marginLeft, notesY, 80, 22, 2, 2, 'FD');

      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(8);
      pdf.setTextColor(11, 102, 59);
      pdf.text("NOTES", marginLeft + 4, notesY + 5);

      pdf.setFont("helvetica", "normal");
      pdf.setFontSize(7.5);
      pdf.setTextColor(75, 85, 99);
      const noteLines = pdf.splitTextToSize(invoiceData.notes || 'Thank you for your business.\nWe appreciate your trust in us.', 72);
      pdf.text(noteLines, marginLeft + 4, notesY + 10);

      // Seal and Signature (Right)
      const sigX = pageWidth - marginRight - 40;
      try {
        const sealImg = sealPreview || '/stamp.png';
        if (sealImg) {
          pdf.addImage(sealImg, "PNG", sigX - 25, notesY - 4, 24, 24);
        }
      } catch (e) {
        console.error("Seal embed error:", e);
      }

      if (signaturePreview) {
        try {
          pdf.addImage(signaturePreview, "PNG", sigX - 2, notesY - 2, 34, 15);
        } catch (e) {
          console.error("Signature embed error:", e);
        }
      }

      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(8);
      pdf.setTextColor(17, 24, 39);
      pdf.text("Authorized Signature", sigX + 15, notesY + 15, { align: 'center' });
      pdf.setFontSize(8);
      pdf.setTextColor(11, 102, 59);
      pdf.text(invoiceData.fromSection?.company || "TECH VASEEGRAH", sigX + 15, notesY + 19, { align: 'center' });

      // Footer Banner
      const footerY = pageHeight - 16;
      pdf.setFillColor(11, 102, 59);
      pdf.rect(marginLeft, footerY, pageWidth - marginLeft - marginRight, 6, 'F');

      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(7.5);
      pdf.setTextColor(255, 255, 255);
      pdf.text("✔  Reliable Solutions", marginLeft + 15, footerY + 4);
      pdf.text("⚡  On-time Delivery", marginLeft + 75, footerY + 4);
      pdf.text("👥  Dedicated Support", marginLeft + 135, footerY + 4);

      pdf.setFont("helvetica", "normal");
      pdf.setFontSize(7.5);
      pdf.setTextColor(11, 102, 59);
      pdf.text("Thank you for choosing TECH VASEEGRAH!", pageWidth / 2, pageHeight - 6, { align: 'center' });

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
      if (onInvoiceSave) {
        await onInvoiceSave({ ...invoiceData, signature: signaturePreview, _id: initialData?._id, gstEnabled: true });
      } else {
        if (initialData?._id) {
          await updateInvoice(initialData._id, { ...invoiceData, signature: signaturePreview, gstEnabled: true });
        } else {
          await createInvoice({ ...invoiceData, signature: signaturePreview, gstEnabled: true });
        }
      }
      toast.success('Invoice saved successfully!');
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
      let savedInvoice = null;
      if (onInvoiceSave) {
        savedInvoice = await onInvoiceSave({ ...invoiceData, signature: signaturePreview, _id: initialData?._id, gstEnabled: true });
      } else {
        let res;
        if (initialData?._id) {
          res = await updateInvoice(initialData._id, { ...invoiceData, signature: signaturePreview, gstEnabled: true });
        } else {
          res = await createInvoice({ ...invoiceData, signature: signaturePreview, gstEnabled: true });
        }
        if (res.success) {
          savedInvoice = res.data;
        }
      }

      const targetId = savedInvoice?._id || savedInvoice?.mongoId || initialData?._id;
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
                  <span style="display:inline-block; width:16px; height:16px; background:#e8f5e9; border-radius:50%; text-align:center; line-height:16px; font-size:10px;">👤</span>
                  BILL TO
                </div>
                <div class="customer-name">${invoiceData.customerName || 'N/A'}</div>
                <div style="margin-top: 10px;">
                  <div class="section-label">
                    <span style="display:inline-block; width:16px; height:16px; background:#e8f5e9; border-radius:50%; text-align:center; line-height:16px; font-size:10px;">📍</span>
                    ADDRESS
                  </div>
                  <div style="color: #4b5563; font-size: 12px; line-height: 1.45;">${invoiceData.customerAddress || 'N/A'}</div>
                </div>
              </div>

              <!-- Column 2: INVOICE META -->
              <div>
                <div class="meta-item">
                  <div class="meta-lbl">🧾 Invoice No.</div>
                  <div class="meta-val">${invoiceData.invoiceNo}</div>
                </div>
                <div class="meta-item">
                  <div class="meta-lbl">📅 Invoice Date</div>
                  <div class="meta-val">${invoiceData.invoiceDate}</div>
                </div>
                <div class="meta-item">
                  <div class="meta-lbl">⏰ Due Date</div>
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
                  <div style="margin-top: 4px;">📞 ${invoiceData.fromSection?.mobile}</div>
                  <div>✉ ${invoiceData.fromSection?.email || 'techvaseegrah@gmail.com'}</div>
                  <div>🌐 GSTIN: ${invoiceData.fromSection?.gstin}</div>
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
                <div class="pill-badge">📋 AMOUNT IN WORDS</div>
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
                <div class="pill-badge">💳 PAYMENT METHOD</div>
                <div style="font-size: 11.5px; color: #374151; line-height: 1.6; margin-top: 4px;">
                  <div><span style="color: #6b7280;">Bank Name</span> : <strong>${invoiceData.bankName}</strong></div>
                  <div><span style="color: #6b7280;">Account Name</span> : <strong>${invoiceData.accountName}</strong></div>
                  <div><span style="color: #6b7280;">Account Number</span> : <strong>${invoiceData.accountNumber}</strong></div>
                  <div><span style="color: #6b7280;">IFSC Code</span> : <strong>${invoiceData.ifscCode}</strong></div>
                  <div><span style="color: #6b7280;">UPI Number</span> : <strong style="color: #0b663b;">${invoiceData.upiNumber}</strong></div>
                </div>
              </div>

              <!-- QR Code -->
              <div class="qr-box">
                <div style="font-size: 11px; font-weight: 700; color: #0b663b;">SCAN & PAY</div>
                <div style="font-size: 9.5px; color: #9ca3af; margin-bottom: 4px;">UPI / ICICI / Any UPI App</div>
                ${upiQrCodeUrl ? `<img src="${upiQrCodeUrl}" style="width: 80px; height: 80px; display: inline-block;" />` : ''}
                <div style="font-size: 9.5px; color: #374151; margin-top: 2px;">UPI ID: ${invoiceData.upiId}</div>
              </div>

              <!-- Security Points -->
              <div style="display: flex; flex-direction: column; justify-content: center; gap: 8px; font-size: 11px; color: #374151;">
                <div style="display: flex; align-items: center; gap: 6px;">
                  <span style="color: #0b663b; font-weight: bold;">✔</span> Make payments securely using any UPI App
                </div>
                <div style="display: flex; align-items: center; gap: 6px;">
                  <span style="color: #0b663b; font-weight: bold;">✔</span> Please share payment screenshot after payment
                </div>
                <div style="display: flex; align-items: center; gap: 6px;">
                  <span style="color: #0b663b; font-weight: bold;">✔</span> For any queries +91 76677 92779
                </div>
              </div>
            </div>

            <!-- Notes & Signature -->
            <div style="display: flex; justify-content: space-between; align-items: flex-end; margin-bottom: 20px;">
              <div style="background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 8px; padding: 10px 14px; width: 45%;">
                <div style="font-size: 11px; font-weight: 700; color: #0b663b; margin-bottom: 4px;">📝 NOTES</div>
                <div style="font-size: 11.5px; color: #4b5563; white-space: pre-line;">${invoiceData.notes}</div>
              </div>

              <div style="display: flex; align-items: center; gap: 20px;">
                ${sealPreview ? `<img src="${sealPreview}" style="height: 65px; object-fit: contain;" />` : ''}
                <div style="text-align: center;">
                  ${signaturePreview ? (
                    `<img src="${signaturePreview}" style="height: 40px; max-width: 110px; object-fit: contain; margin: 0 auto 4px auto; display: block;" />`
                  ) : (
                    `<svg width="100" height="30" viewBox="0 0 100 30" fill="none" style="margin: 0 auto;">
                      <path d="M10 20C25 8 35 25 50 12C60 4 75 16 90 10" stroke="#1e40af" stroke-width="2" stroke-linecap="round"/>
                      <line x1="15" y1="24" x2="85" y2="24" stroke="#1e40af" stroke-width="1.5" stroke-linecap="round"/>
                    </svg>`
                  )}
                  <div style="font-size: 11px; font-weight: 700; color: #111827;">Authorized Signature</div>
                  <div style="font-size: 10.5px; font-weight: 700; color: #0b663b;">${invoiceData.fromSection?.company}</div>
                </div>
              </div>
            </div>

            <!-- Footer Bar -->
            <div class="footer-bar">
              <div>✔ Reliable Solutions</div>
              <div>⚡ On-time Delivery</div>
              <div>👥 Dedicated Support</div>
            </div>
            <div class="footer-tagline">Thank you for choosing TECH VASEEGRAH! 💚</div>
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
                    <span className="w-6 h-6 rounded-full bg-[#0b663b] text-white flex items-center justify-center text-xs shadow-2xs">👤</span>
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
                </div>

                <div>
                  <div className="flex items-center gap-2 text-[#0b663b] font-bold text-xs uppercase tracking-wider mb-1.5">
                    <span className="w-6 h-6 rounded-full bg-[#0b663b] text-white flex items-center justify-center text-xs shadow-2xs">📍</span>
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
                  <div className="w-9 h-9 rounded-lg bg-emerald-50 border border-emerald-200 flex items-center justify-center text-base shrink-0">
                    🧾
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
                  <div className="w-9 h-9 rounded-lg bg-emerald-50 border border-emerald-200 flex items-center justify-center text-base shrink-0">
                    📅
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
                  <div className="w-9 h-9 rounded-lg bg-emerald-50 border border-emerald-200 flex items-center justify-center text-base shrink-0">
                    ⏰
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
                  <div className="flex items-center gap-1.5 text-gray-700 pt-1.5">
                    <span className="text-[#0b663b]">📞</span>
                    <input
                      type="text"
                      value={invoiceData.fromSection?.mobile}
                      onChange={(e) => handleFromSectionChange('mobile', e.target.value)}
                      className="w-full bg-transparent border-b border-transparent hover:border-gray-200 focus:border-emerald-400 focus:outline-none font-medium"
                      placeholder="Phone"
                    />
                  </div>
                  <div className="flex items-center gap-1.5 text-gray-700">
                    <span className="text-[#0b663b]">✉</span>
                    <input
                      type="text"
                      value={invoiceData.fromSection?.email || 'techvaseegrah@gmail.com'}
                      onChange={(e) => handleFromSectionChange('email', e.target.value)}
                      className="w-full bg-transparent border-b border-transparent hover:border-gray-200 focus:border-emerald-400 focus:outline-none font-medium"
                      placeholder="Email"
                    />
                  </div>
                  <div className="flex items-center gap-1.5 text-gray-700">
                    <span className="text-[#0b663b]">🌐</span>
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
                <div className="inline-flex items-center gap-1.5 bg-[#0b663b] text-white text-xs font-bold px-3 py-1 rounded-full uppercase tracking-wider mb-2">
                  <span>📋</span> AMOUNT IN WORDS
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

            {/* Payment Method, QR Code, Security Features (3 columns) */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6 text-xs text-gray-700 items-start">
              {/* Column 1: Payment Method */}
              <div>
                <div className="inline-flex items-center gap-1.5 bg-[#0b663b] text-white text-xs font-bold px-3 py-1 rounded-full uppercase tracking-wider mb-3">
                  <span>💳</span> PAYMENT METHOD
                </div>
                <div className="space-y-1.5 pl-1">
                  <div className="flex">
                    <span className="text-gray-500 w-28">Bank Name</span>
                    <span className="font-bold text-gray-900">: {invoiceData.bankName}</span>
                  </div>
                  <div className="flex">
                    <span className="text-gray-500 w-28">Account Name</span>
                    <span className="font-bold text-gray-900">: {invoiceData.accountName}</span>
                  </div>
                  <div className="flex">
                    <span className="text-gray-500 w-28">Account Number</span>
                    <span className="font-bold text-gray-900">: {invoiceData.accountNumber}</span>
                  </div>
                  <div className="flex">
                    <span className="text-gray-500 w-28">IFSC Code</span>
                    <span className="font-bold text-gray-900">: {invoiceData.ifscCode}</span>
                  </div>
                  <div className="flex">
                    <span className="text-gray-500 w-28">UPI Number</span>
                    <span className="font-bold text-[#0b663b]">: {invoiceData.upiNumber}</span>
                  </div>
                </div>
              </div>

              {/* Column 2: QR Code */}
              <div className="text-center bg-gray-50/70 p-3 rounded-xl border border-gray-200 flex flex-col items-center justify-center">
                <div className="text-xs font-bold text-[#0b663b] uppercase">SCAN & PAY</div>
                <div className="text-[10px] text-gray-400 mb-2">UPI / ICICI / Any UPI App</div>
                {upiQrCodeUrl && (
                  <img
                    src={upiQrCodeUrl}
                    alt="UPI QR"
                    className="w-24 h-24 bg-white p-1 rounded-lg border border-gray-200 shadow-2xs"
                  />
                )}
                <div className="text-[10px] text-gray-600 font-mono mt-1.5">UPI ID: {invoiceData.upiId}</div>
              </div>

              {/* Column 3: Secure Points */}
              <div className="space-y-2.5 justify-center flex flex-col pt-2">
                <div className="flex items-center gap-2">
                  <span className="w-5 h-5 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center font-bold text-xs">✓</span>
                  <span className="text-gray-700 font-medium">Make payments securely using any UPI App</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-5 h-5 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center font-bold text-xs">✓</span>
                  <span className="text-gray-700 font-medium">Please share payment screenshot after payment</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-5 h-5 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center font-bold text-xs">✓</span>
                  <span className="text-gray-700 font-medium">For any queries +91 76677 92779</span>
                </div>
              </div>
            </div>

            {/* Notes & Signature Section */}
            <div className="flex flex-col md:flex-row justify-between items-end gap-6 mb-6">
              <div className="w-full md:w-1/2 bg-gray-50/70 p-3 rounded-xl border border-gray-200">
                <div className="flex items-center gap-1 text-xs font-bold text-[#0b663b] mb-1">
                  <span>📝</span> NOTES
                </div>
                <textarea
                  name="notes"
                  value={invoiceData.notes}
                  onChange={handleInputChange}
                  rows="2"
                  className="w-full text-xs text-gray-600 bg-transparent border-0 focus:ring-0 p-0 resize-none font-medium"
                />
              </div>

              <div className="flex items-center gap-6">
                <img
                  src={sealPreview || '/stamp.png'}
                  alt="Seal"
                  className="h-16 object-contain"
                  onError={(e) => { e.target.style.display = 'none'; }}
                />
                <div className="text-center min-w-[120px]">
                  {signaturePreview ? (
                    <img
                      src={signaturePreview}
                      alt="Signature"
                      className="h-12 max-w-[140px] object-contain mx-auto mb-1"
                    />
                  ) : (
                    <svg width="100" height="30" viewBox="0 0 100 30" fill="none" className="mx-auto mb-1">
                      <path d="M10 20C25 8 35 25 50 12C60 4 75 16 90 10" stroke="#1e40af" strokeWidth="2" strokeLinecap="round" />
                      <line x1="15" y1="24" x2="85" y2="24" stroke="#1e40af" strokeWidth="1.5" strokeLinecap="round" />
                    </svg>
                  )}
                  <div className="text-xs font-bold text-gray-800">Authorized Signature</div>
                  <div className="text-xs font-bold text-[#0b663b]">{invoiceData.fromSection?.company}</div>
                </div>
              </div>
            </div>

            {/* Branded Footer Bar */}
            <div className="bg-[#0b663b] text-white py-2 px-4 rounded-lg flex justify-around text-xs font-semibold tracking-wide mb-2 shadow-xs">
              <div className="flex items-center gap-1.5"><span>✔</span> Reliable Solutions</div>
              <div className="flex items-center gap-1.5"><span>⚡</span> On-time Delivery</div>
              <div className="flex items-center gap-1.5"><span>👥</span> Dedicated Support</div>
            </div>
            <div className="text-center text-xs font-bold text-[#0b663b]">
              Thank you for choosing TECH VASEEGRAH! 💚
            </div>
          </div>
        </div>

        {/* Extra Settings & Asset Upload (Seal & Signature) */}
        {!isPreviewMode && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
            <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-200">
              <h3 className="font-bold text-gray-800 text-sm mb-3">Company Assets (Seal & Signature)</h3>
              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Upload Company Seal / Stamp</label>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleSealUpload}
                    className="w-full text-xs text-gray-500 file:mr-3 file:py-1.5 file:px-3 file:rounded-md file:border-0 file:text-xs file:font-semibold file:bg-emerald-50 file:text-emerald-700 hover:file:bg-emerald-100"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Upload Authorized Signature</label>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleSignatureUpload}
                    className="w-full text-xs text-gray-500 file:mr-3 file:py-1.5 file:px-3 file:rounded-md file:border-0 file:text-xs file:font-semibold file:bg-emerald-50 file:text-emerald-700 hover:file:bg-emerald-100"
                  />
                  {signaturePreview && (
                    <div className="mt-2 flex items-center gap-2">
                      <span className="text-[11px] text-gray-500">Current signature:</span>
                      <img src={signaturePreview} alt="Signature Preview" className="h-8 object-contain border p-1 rounded bg-gray-50" />
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
        )}
      </fieldset>
    </div>
  );
};

export default AdvancedInvoice;