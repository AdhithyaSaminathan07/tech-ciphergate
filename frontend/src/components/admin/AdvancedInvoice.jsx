import React, { useState, useRef, useEffect } from 'react';
import { jsPDF } from 'jspdf';
import html2canvas from 'html2canvas';
import autoTable from 'jspdf-autotable';
import { toast } from 'react-toastify';

const AdvancedInvoice = ({ onInvoiceSave, initialData, isPreviewMode = false }) => {
  // Auto-generate invoice number and date
  const today = new Date();
  const formattedDate = today.toLocaleDateString('en-IN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric'
  }).split('/').join('-');


  const {
    invoiceNo = 'TV000',
    invoiceDate = formattedDate,
    customerName = '',
    customerContact = '',
    salesPerson = '',
    terms = '',
    dueDate = '',
    fromSection = {
      company: 'TECH VASEEGRAH',
      addressLine1: 'No.11, VIJAYANAGAR,',
      addressLine2: 'REDDIPALAYAM ROAD,',
      addressLine3: 'SRINIVASAPURAM,',
      cityZip: 'THANJAVUR - 613009',
      mobile: 'Mobile: 7667792779',
      gstin: 'GSTIN: 33KYGPS1983E1Z1'
    },
    items = [
      {
        id: 1,
        description: '',
        hsn: '',
        gst: 0,
        qty: 1,
        rate: 0,
        total: 0,
        isTotalOverridden: false
      }
    ],
    bankName = 'ICICI',
    accountNumber = '612805036053',
    ifscCode = 'ICIC0006128',
    upiId = 'techvaseegrah.ibz@icici',
    gstEnabled = false,
    saleType = 'Intrastate',
    customerGst = '',
    invoiceType = 'INVOICE',
    status = 'Invoice'
  } = initialData || {};

  const [invoiceData, setInvoiceData] = useState({
    invoiceNo,
    invoiceDate,
    customerName,
    customerContact,
    salesPerson,
    terms,
    dueDate,
    fromSection,
    items,
    bankName,
    accountNumber,
    ifscCode,
    upiId,
    gstEnabled,
    saleType,
    customerGst,
    invoiceType,
    status
  });

  const [includeFields, setIncludeFields] = useState({
    customerName: true,
    customerContact: true,
    salesPerson: true,
    terms: true,
    dueDate: true,
    bankDetails: true,
    customerGst: true,
    invoiceNo: true,
    invoiceDate: true,
    consignerDetails: true
  });

  const [sealPreview, setSealPreview] = useState(null);

  useEffect(() => {
    setSealPreview('/stamp.png');
  }, []);

  const invoiceRef = useRef();

  useEffect(() => {
    if (initialData) {
      setInvoiceData({
        ...initialData,
        fromSection: initialData.fromSection || {
          company: 'TECH VASEEGRAH',
          addressLine1: 'No.11, VIJAYANAGAR,',
          addressLine2: 'REDDIPALAYAM ROAD,',
          addressLine3: 'SRINIVASAPURAM,',
          cityZip: 'THANJAVUR - 613009',
          mobile: 'Mobile: 7667792779',
          gstin: 'GSTIN: 33KYGPS1983E1Z1'
        },
        items: initialData.items || [
          { id: 1, description: '', hsn: '', gst: 0, qty: 1, rate: 0, total: 0, isTotalOverridden: false }
        ]
      });
    }
  }, [initialData]);

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

    return result.trim();
  };

  const calculateTotals = () => {
    const subtotal = invoiceData.items.reduce((sum, item) =>
      sum + (item.isTotalOverridden ? item.total : (item.qty * item.rate)), 0);

    const gstTotal = (invoiceData.gstEnabled) ?
      invoiceData.items.reduce((sum, item) =>
        sum + (item.isTotalOverridden ? (item.total * item.gst / 100) : (item.qty * item.rate * item.gst / 100)), 0) : 0;

    const grandTotal = subtotal + gstTotal;
    const cgstTotal = (invoiceData.gstEnabled && invoiceData.saleType === 'Intrastate') ? gstTotal / 2 : 0;
    const sgstTotal = (invoiceData.gstEnabled && invoiceData.saleType === 'Intrastate') ? gstTotal / 2 : 0;
    const igstTotal = (invoiceData.gstEnabled && invoiceData.saleType === 'Interstate') ? gstTotal : 0;

    return {
      subtotal,
      gstTotal,
      cgstTotal,
      sgstTotal,
      igstTotal,
      totalInWords: `Indian Rupee: ${numberToWords(Math.round(grandTotal))} Only`,
      grandTotal
    };
  };

  const totals = calculateTotals();
  const minTableRows = 1;
  const numRowsToDisplay = Math.max(minTableRows, invoiceData.items.length);

  const handleInputChange = (e) => {
    const { name, value, type, checked } = e.target;
    if (type === 'checkbox') {
      const { name, checked } = e.target;
      setInvoiceData(prev => {
        const updatedData = { ...prev, [name]: checked };
        if (name === 'gstEnabled' && checked) updatedData.invoiceType = 'TAX INVOICE';
        if (name === 'gstEnabled' && !checked) {
          updatedData.saleType = 'Intrastate';
          updatedData.invoiceType = 'INVOICE';
        }
        return updatedData;
      });
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

  const handleInvoiceTypeChange = (e) => {
    const value = e.target.value;
    setInvoiceData(prev => {
      const updatedData = { ...prev, invoiceType: value };
      if (value === 'TAX INVOICE') updatedData.gstEnabled = true;
      return updatedData;
    });
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
            updatedItem.total = updatedItem.qty * updatedItem.rate;
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
      id: invoiceData.items.length + 1,
      description: '',
      hsn: '',
      gst: 0,
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

  const handleCheckboxChange = (field) => {
    setIncludeFields(prev => ({ ...prev, [field]: !prev[field] }));
  };

  const handleSealUpload = (e) => {
    const file = e.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (e) => setSealPreview(e.target.result);
      reader.readAsDataURL(file);
    }
  };

  // Export to PDF
  const exportToPDF = async () => {
    const hasEmptyDescriptions = invoiceData.items.some(item => !item.description || item.description.trim() === '');
    if (hasEmptyDescriptions) {
      toast.error('Please fill in descriptions for all items before exporting to PDF.');
      return;
    }

    if (onInvoiceSave) {
      onInvoiceSave({ ...invoiceData, _id: initialData?._id, createdAt: new Date().toISOString() });
    }

    try {
      const pdf = new jsPDF('p', 'mm', 'a4');
      const marginLeft = 20;
      const marginTop = 10;
      const marginRight = 20;
      const marginBottom = 15; // Bottom margin for the page
      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();

      const logoPath = `${window.location.origin}/Invoicelogo.png`;
      const logoData = await fetch(logoPath)
        .then(res => res.blob())
        .then(blob => new Promise((resolve) => {
          const reader = new FileReader();
          reader.onloadend = () => resolve(reader.result);
          reader.readAsDataURL(blob);
        }));

      const logoProps = pdf.getImageProperties(logoData);
      const fixedLogoWidth = 50;
      const fixedLogoHeight = (logoProps.height / logoProps.width) * fixedLogoWidth;

      pdf.addImage(logoData, "PNG", marginLeft, marginTop, fixedLogoWidth, fixedLogoHeight);

      const dividerYPosition = marginTop + fixedLogoHeight + 2;
      const totalWidth = pageWidth - marginLeft - marginRight;
      const greenLineWidth = totalWidth * 0.15;
      const grayLineWidth = totalWidth * 0.85;

      pdf.setFillColor(140, 198, 63);
      pdf.rect(marginLeft, dividerYPosition, greenLineWidth, 0.5, 'F');
      pdf.setFillColor(209, 213, 219);
      pdf.rect(marginLeft + greenLineWidth, dividerYPosition + 0.5, grayLineWidth, 0.2, 'F');

      pdf.setFontSize(10);
      pdf.setTextColor(51, 51, 51);
      pdf.setFont(undefined, 'bold');
      pdf.setFontSize(20);
      pdf.setTextColor(0, 132, 61);
      const invoiceTypeText = invoiceData.invoiceType;
      const invoiceTypeWidth = pdf.getTextWidth(invoiceTypeText);
      pdf.text(invoiceTypeText, pageWidth - marginRight - invoiceTypeWidth, marginTop + 15);

      pdf.setFontSize(10);
      pdf.setTextColor(51, 51, 51);
      pdf.setFont(undefined, 'normal');

      let yPosition = marginTop + 25;
      let rightColX = pageWidth - marginRight - 60;

      if (includeFields.customerName && invoiceData.customerName) {
        pdf.setFont(undefined, 'bold');
        const labelText = 'Invoice to:';
        const labelWidth = pdf.getTextWidth(labelText);
        pdf.text(labelText, marginLeft, yPosition);
        pdf.setFont(undefined, 'normal');
        pdf.text(invoiceData.customerName, marginLeft + labelWidth + 1, yPosition);
      }

      pdf.setFont(undefined, 'bold');
      const invoiceNoLabelText = 'Invoice No:';
      const invoiceNoLabelWidth = pdf.getTextWidth(invoiceNoLabelText);
      pdf.text(invoiceNoLabelText, rightColX, yPosition);
      pdf.setFont(undefined, 'normal');
      pdf.text(invoiceData.invoiceNo, rightColX + invoiceNoLabelWidth + 1, yPosition);

      yPosition += 7;

      pdf.setFont(undefined, 'bold');
      const invoiceDateLabelText = 'Invoice Date:';
      const invoiceDateLabelWidth = pdf.getTextWidth(invoiceDateLabelText);
      pdf.text(invoiceDateLabelText, rightColX, yPosition);
      pdf.setFont(undefined, 'normal');
      pdf.text(invoiceData.invoiceDate, rightColX + invoiceDateLabelWidth + 1, yPosition);

      if (includeFields.salesPerson && invoiceData.salesPerson) {
        pdf.setFont(undefined, 'bold');
        const salesPersonLabelText = 'Sales person:';
        const salesPersonLabelWidth = pdf.getTextWidth(salesPersonLabelText);
        pdf.text(salesPersonLabelText, marginLeft, yPosition);
        pdf.setFont(undefined, 'normal');
        pdf.text(invoiceData.salesPerson, marginLeft + salesPersonLabelWidth + 1, yPosition);
      }

      yPosition += 10;
      pdf.setFontSize(10);

      if (includeFields.customerContact && invoiceData.customerContact) {
        const leftColumnX = marginLeft;
        const rightColumnX = pageWidth - marginRight - 60;
        const sectionWidth = 80;

        pdf.setFont(undefined, 'bold');
        const addressLabelText = 'Address:';
        const addressLabelWidth = pdf.getTextWidth(addressLabelText);
        pdf.text(addressLabelText, leftColumnX, yPosition);
        pdf.setFont(undefined, 'normal');

        const addressLines = pdf.splitTextToSize(invoiceData.customerContact, (pageWidth - marginLeft - marginRight) / 2 - 15);
        pdf.text(addressLines, leftColumnX + addressLabelWidth + 1, yPosition);

        if (includeFields.consignerDetails) {
          pdf.setFont(undefined, 'bold');
          const fromLabelText = 'From:';
          pdf.text(fromLabelText, rightColumnX, yPosition);
          pdf.setFont(undefined, 'normal');

          const fromDetails = [
            invoiceData.fromSection.company,
            invoiceData.fromSection.addressLine1,
            invoiceData.fromSection.addressLine2,
            invoiceData.fromSection.addressLine3,
            invoiceData.fromSection.cityZip,
            invoiceData.fromSection.mobile
          ];

          if (invoiceData.gstEnabled) fromDetails.push(invoiceData.fromSection.gstin);

          let currentY = yPosition;
          fromDetails.forEach((line) => {
            const splitLines = pdf.splitTextToSize(line, sectionWidth);
            pdf.text(splitLines, rightColumnX + pdf.getTextWidth('From:') + 1, currentY);
            currentY += splitLines.length * 4;
          });
        }

        const addressHeight = addressLines.length * 4;
        const fromHeight = includeFields.consignerDetails ? 7 * 4 : 0;
        yPosition += Math.max(addressHeight, fromHeight) + 2;

      } else if (includeFields.consignerDetails) {
        const rightColumnX = pageWidth - marginRight - 60;
        const sectionWidth = 80;

        pdf.setFont(undefined, 'bold');
        const fromLabelText = 'From:';
        pdf.text(fromLabelText, rightColumnX, yPosition);
        pdf.setFont(undefined, 'normal');

        const fromDetails = [
          invoiceData.fromSection.company,
          invoiceData.fromSection.addressLine1,
          invoiceData.fromSection.addressLine2,
          invoiceData.fromSection.addressLine3,
          invoiceData.fromSection.cityZip,
          invoiceData.fromSection.mobile
        ];

        if (invoiceData.gstEnabled) fromDetails.push(invoiceData.fromSection.gstin);

        let currentY = yPosition;
        fromDetails.forEach((line) => {
          const splitLines = pdf.splitTextToSize(line, sectionWidth);
          pdf.text(splitLines, rightColumnX + pdf.getTextWidth('From:') + 1, currentY);
          currentY += splitLines.length * 4;
        });
        yPosition += fromDetails.length * 4 + 2;
      }

      pdf.setFontSize(10);

      const tableColumn = ['NO', 'DESCRIPTION'];
      if (invoiceData.gstEnabled) tableColumn.push('HSN/SAC', 'GST (%)');
      tableColumn.push('QTY', 'PRICE', 'TOTAL');

      const tableRows = invoiceData.items.map((item, index) => {
        const row = [(index + 1).toString(), item.description];
        if (invoiceData.gstEnabled) row.push(item.hsn || '', item.gst.toFixed(2));
        row.push(item.qty.toString(), item.rate.toFixed(2), item.total.toFixed(2));
        return row;
      });

      // Render Table with strict margin bottom to allow it to go low on first page
      autoTable(pdf, {
        head: [tableColumn],
        body: tableRows,
        startY: yPosition,
        theme: "grid",
        margin: { left: marginLeft, right: marginRight, bottom: 15 }, // FIXED: Reduced bottom margin so table goes lower on page 1
        styles: { fontSize: 10, cellPadding: 2, overflow: 'linebreak' },
        headStyles: {
          fillColor: [0, 132, 61],
          textColor: [255, 255, 255],
          fontStyle: 'bold',
          halign: 'center'
        },
        alternateRowStyles: { fillColor: [233, 247, 236] },
        columnStyles: {
          0: { cellWidth: 15, halign: 'center' },
          1: { cellWidth: 'auto', halign: 'left' },
          ...(invoiceData.gstEnabled ? {
            2: { cellWidth: 25, halign: 'center' },
            3: { cellWidth: 25, halign: 'center' }
          } : {}),
          [invoiceData.gstEnabled ? 4 : 2]: { cellWidth: 20, halign: 'center' },
          [invoiceData.gstEnabled ? 5 : 3]: { cellWidth: 25, halign: 'center' },
          [invoiceData.gstEnabled ? 6 : 4]: { cellWidth: 30, halign: 'center' }
        },
        pageBreak: 'auto',
        rowPageBreak: 'avoid',
        showHead: 'everyPage'
      });

      // Calculate finalY after table
      let finalY = pdf.lastAutoTable.finalY + 3; // Light gap after table

      // --- FOOTER CONFIGURATION ---
      // This height encompasses: Payment Method + Seal + Thank You + Lines
      const footerHeight = 60;

      // --- TOTALS SECTION ---
      // Estimate height needed for Totals section (Words + Table)
      const totalsHeight = 35;

      // Check space available on current page
      // We need space for BOTH Totals AND Footer to print on this page
      const spaceNeeded = totalsHeight + footerHeight;
      const spaceAvailable = pageHeight - marginBottom - finalY;

      if (spaceAvailable < spaceNeeded) {
        // Not enough space for BOTH.
        // Check if there is space for JUST the totals?
        if (spaceAvailable > totalsHeight) {
          // Yes, print Totals here, then add page for Footer
          // (Standard flow, no action needed yet, we draw totals then check footer)
        } else {
          // No, not even space for totals. Push Totals to next page.
          pdf.addPage();
          finalY = marginTop + 10;
        }
      }

      // Draw Totals Section
      const leftColumnX = marginLeft;
      const sectionWidth = (pageWidth - marginLeft - marginRight) / 2 - 15;

      let y = finalY + 4;
      const lineH = 7;

      // Left: Words
      pdf.setFont("helvetica", "bold");
      const totalInWordsTextWidth = pdf.getStringUnitWidth("Total In Words") * pdf.getFontSize() / pdf.internal.scaleFactor;
      const totalInWordsHeaderWidth = totalInWordsTextWidth + 10;

      pdf.setFillColor(0, 132, 61);
      pdf.rect(leftColumnX, y - 5, totalInWordsHeaderWidth, 7, 'F');

      pdf.setTextColor(255, 255, 255);
      const centeredXWords = leftColumnX + (totalInWordsHeaderWidth - totalInWordsTextWidth) / 2;
      pdf.text("Total In Words", centeredXWords, y);
      pdf.setTextColor(51, 51, 51);

      pdf.setFont("helvetica", "normal");
      const words = pdf.splitTextToSize(totals.totalInWords, sectionWidth);
      pdf.text(words, leftColumnX, y + 8);

      // Right: Numbers
      const rightMarginX = pageWidth - marginRight;
      let totalsY = y;

      pdf.setFont("helvetica", "normal");
      pdf.setFontSize(11);

      const printRow = (label, value, background = null, bold = false) => {
        const formattedValue = "Rs. " + Number(value).toLocaleString("en-IN", { minimumFractionDigits: 2 }) + " /-";
        const fullText = `${label} ${formattedValue}`;

        pdf.setFont("helvetica", bold ? "bold" : "normal");
        pdf.setFontSize(11);
        const textWidth = pdf.getTextWidth(fullText);

        if (background) {
          pdf.setFillColor(...background);
          const boxPadding = 6;
          const boxWidth = textWidth + boxPadding;
          const boxX = rightMarginX - boxWidth;
          pdf.rect(boxX, totalsY - 5, boxWidth, 7.5, "F");
          pdf.setTextColor(255, 255, 255);
          const textX = boxX + (boxWidth - textWidth) / 2;
          pdf.text(fullText, textX, totalsY);
        } else {
          pdf.setTextColor(51, 51, 51);
          const textX = rightMarginX - textWidth;
          pdf.text(fullText, textX, totalsY);
        }
        pdf.setTextColor(51, 51, 51);
        totalsY += lineH;
      };

      printRow("Sub Total:", totals.subtotal.toFixed(2));
      if (invoiceData.gstEnabled) {
        if (invoiceData.saleType === "Intrastate") {
          printRow("CGST Total:", totals.cgstTotal.toFixed(2));
          printRow("SGST Total:", totals.sgstTotal.toFixed(2));
        } else {
          printRow("IGST Total:", totals.igstTotal.toFixed(2));
        }
      }
      printRow("Grand Total:", totals.grandTotal.toFixed(2), [0, 132, 61], true);

      // --- STICKY FOOTER SECTION ---
      // Check if the footer overlaps with the just-drawn totals
      let currentYAfterTotals = Math.max(y + 8 + (words.length * 5), totalsY);

      // Calculate where the footer MUST start to align with bottom
      const footerStartY = pageHeight - marginBottom - footerHeight;

      if (currentYAfterTotals > footerStartY) {
        // Overlap detected! Footer needs a new page.
        pdf.addPage();
      }

      // Draw footer at the absolute bottom
      let blockY = footerStartY + 10;
      const paymentLeftX = marginLeft;
      const paymentRightX = pageWidth - marginRight - 45;

      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(10);
      const paymentText = "Payment Method:";
      const paymentTextWidth = pdf.getStringUnitWidth(paymentText) * pdf.getFontSize() / pdf.internal.scaleFactor;
      const paymentMethodHeaderWidth = paymentTextWidth + 8;

      pdf.setFillColor(0, 132, 61);
      pdf.rect(paymentLeftX, blockY - 5, paymentMethodHeaderWidth, 7, 'F');

      pdf.setTextColor(255, 255, 255);
      const centeredXPayment = paymentLeftX + (paymentMethodHeaderWidth - paymentTextWidth) / 2;
      pdf.text(paymentText, centeredXPayment, blockY);
      pdf.setTextColor(51, 51, 51);

      let payDetailsY = blockY + 6;
      pdf.setFont("helvetica", "normal");
      pdf.setFontSize(10);
      const paymentLineHeight = 4.5;

      if (includeFields.bankDetails) {
        if (invoiceData.bankName) {
          pdf.text(`Bank Name: ${invoiceData.bankName}`, paymentLeftX, payDetailsY);
          payDetailsY += paymentLineHeight;
        }
        if (invoiceData.accountNumber) {
          pdf.text(`Account Number: ${invoiceData.accountNumber}`, paymentLeftX, payDetailsY);
          payDetailsY += paymentLineHeight;
        }
        if (invoiceData.ifscCode) {
          pdf.text(`IFSC Code: ${invoiceData.ifscCode}`, paymentLeftX, payDetailsY);
          payDetailsY += paymentLineHeight;
        }
        if (invoiceData.upiId) {
          pdf.text(`UPI ID: ${invoiceData.upiId}`, paymentLeftX, payDetailsY);
          payDetailsY += paymentLineHeight;
        }
      }

      try {
        const sealToUse = sealPreview || '/stamp.png';
        if (sealToUse) {
          const sealWidth = 35;
          const sealHeight = 30;
          pdf.addImage(sealToUse, "PNG", paymentRightX, blockY, sealWidth, sealHeight);
        }
      } catch (error) {
        console.error('Error adding seal:', error);
      }

      const thankYouY = pageHeight - marginBottom - 10;
      pdf.setFont("helvetica", "bold");
      const thankYouText = 'Thank you for business with us!';
      const thankYouWidth = pdf.getTextWidth(thankYouText);
      const thankYouX = (pageWidth - thankYouWidth) / 2;
      pdf.text(thankYouText, thankYouX, thankYouY);

      const dividerY = thankYouY - 10;
      pdf.setFillColor(140, 198, 63);
      pdf.rect(marginLeft, dividerY, greenLineWidth, 0.5, 'F');
      pdf.setFillColor(209, 213, 219);
      pdf.rect(marginLeft + greenLineWidth, dividerY + 0.5, grayLineWidth, 0.2, 'F');

      // Add Terms and Conditions only if Common or Web Development checkbox is selected
      if (invoiceData.terms === 'Common' || invoiceData.terms === 'Web Development') {
        pdf.addPage();

        const termsDividerYPosition = marginTop + 5;
        pdf.setFillColor(140, 198, 63);
        pdf.rect(marginLeft, termsDividerYPosition, greenLineWidth, 0.7, 'F');
        pdf.setFillColor(209, 213, 219);
        pdf.rect(marginLeft + greenLineWidth, termsDividerYPosition, grayLineWidth, 0.7, 'F');

        pdf.setFontSize(18);
        pdf.setTextColor(0, 132, 61);
        pdf.setFont(undefined, 'bold');

        const termsTitle = 'TERMS AND CONDITIONS';
        const termsTitleWidth = pdf.getTextWidth(termsTitle);
        const termsTitleX = (pageWidth - termsTitleWidth) / 2;

        pdf.text(termsTitle, termsTitleX, marginTop + 15);

        pdf.setFontSize(10);
        pdf.setTextColor(51, 51, 51);
        pdf.setFont(undefined, 'normal');

        let termsAndConditions = '';
        if (invoiceData.terms === 'Common') {
          termsAndConditions = `TERMS AND CONDITIONS
1. ACCEPTANCE OF TERMS
By using the Inventory Management Module Progressive Web App (PWA) and related
services, you agree to follow these Terms and our Privacy Policy. If you do not agree, please
do not use the app or services.

2. CHANGES TO TERMS
We may update these Terms at any time. Changes will be posted here with a new "Last
Updated" date. If you keep using the app or services after changes, it means you accept the
updated Terms.

3. USE OF THE APP
The Inventory Management Module PWA is a custom-built application designed to help
manage business operations, including appointment scheduling, customer management,
service tracking, billing, inventory management, staff performance monitoring, and financial
reporting. You agree to use the app lawfully and provide accurate and up-to-date
information when managing appointments, customer data, and business operations.

4. CUSTOMIZATION AND ADD-ONS
We offer customization to fit the app to your specific needs, such as adding new categories,
modifying workflows, integrating payment systems, or creating custom reports. Any extra
features or changes beyond the standard app will have additional costs, which we will
discuss and agree on before starting the work.

5. OWNERSHIP AND RIGHTS
All parts of the app, including text, designs, logos, code, and custom features, belong to
Tech Vaseegrah or its developers. You may not copy, change, or share any part of the
app without our written permission.

6. PRIVACY POLICY Using the Inventory Management Module PWA means you agree to how
we collect and use your data, including customer information, appointment records, and
business analytics, as explained in our Privacy Policy.

7. SUPPORT HOURS
We provide support for the app from 10:00 AM to 7:00 PM, Monday to Saturday (except
public holidays). Any support requests outside these hours will be handled during the next
support period.

8. MONTHLY SERVER FEES
The app requires hosting, maintenance, and data backup services, which are billed
monthly. Using the app means you agree to these recurring fees.

9. RULES FOR USING THE APP
You agree not to misuse the app, including:
Breaking any laws or harming others' rights
Disrupting how the app works or compromising data security
Sharing harmful, illegal, or inappropriate content
Attempting unauthorized access to customer data or system functions
Using the app for purposes other than legitimate business management

10. DATA SECURITY AND CUSTOMER INFORMATION
You are responsible for maintaining the confidentiality of customer information
accessed through the app. You agree to comply with applicable data protection laws
and use customer data only for legitimate business purposes.

11. LIMITATION OF LIABILITY Tech Vaseegrah and its developers are not responsible for
any business losses, data loss, or damages from using or not being able to use the app,
even if we're told such issues might happen. This includes losses related to missed
operations, billing errors, or system downtime.

12. INDEMNIFICATION
You agree to protect Tech Vaseegrah, its developers, and their teams from any claims or
damages caused by your misuse of the app, violation of these Terms, or mishandling of
customer data.

13. SERVICE INTERRUPTIONS
While we strive for continuous service, scheduled maintenance and updates may
temporarily interrupt app availability. We will provide advance notice when possible.`;
        } else if (invoiceData.terms === 'Web Development') {
          termsAndConditions = `TERMS AND CONDITIONS
1. Full Payment to Begin the Project The project will officially start only after the full payment has been received. Once the full payment is made, we ensure the work will be completed diligently within the stipulated timeframe, as agreed with the client.
2. Submission of Required Documents for Web Development Customers are kindly requested to provide all essential documents and details related to the web development project before work begins. These materials may include content, images, brand guidelines, specific requirements, and other necessary assets. Providing these items ensures a seamless and efficient development process.
3. Five-Day Grace Period for Document Submission Upon receipt of the initial payment, customers are granted a grace period of five (10) days to organize and submit the required documents. This period is intended to give sufficient time for preparation. Delayed submission of these materials may affect the project timeline.
4. Commencement of Development Work After Document Submission Once the required documents have been submitted, our team will review them and promptly begin the development process. The project timeline will officially commence on the day we receive all necessary materials in full. Development will proceed according to the agreed-upon specifications and schedule.
5. Completion of Development Work Within Five Days From the official start date of development, we commit to completing the project within five (5) business days, provided all required documentation and details have been submitted on time. This ensures a timely launch of the website in accordance with the agreed timeline.
6. Full Development Cost for Delays in Document Submission Should the customer fail to provide the required documents within the five-day grace period, the full development cost will apply. Delayed submissions can impact the project schedule, and the additional cost reflects the resources and time allocated to the project.
7. Hosting on Our Web Server for Optimal Performance For enhanced performance, security, and reliability, we require that all customer websites be hosted on our web server. This arrangement allows us to maintain a secure hosting environment and offer consistent support and monitoring.
8. Restrictions on Customer-Managed Servers To ensure security and performance, we are unable to permit customers to host their websites on independently managed servers. Our servers are equipped with state-of-the-art security features to safeguard customer data and maintain optimal website functionality.
9. Optional Use of Customer-Owned Servers (With Conditions) If a customer prefers to use their own server, we are happy to accommodate this request. However, please note that we cannot assume responsibility for any issues arising from the use of an independently managed server. Customers who choose this option will bear full responsibility for the management, security, and reliability of their hosting environment.
10. Fixed Costs for Development, Hosting, and Maintenance All agreed-upon costs for development, server hosting, and maintenance are fixed and non-negotiable. These fees are determined based on the scope of the project and the services provided. Adjustments or discounts will not be offered once terms are finalized. We appreciate your understanding and cooperation in adhering to these terms, which are designed to ensure a successful and efficient project experience for both parties. Thank you for choosing us for your web development needs!!`;
        }

        const lines = pdf.splitTextToSize(termsAndConditions, pageWidth - marginLeft - marginRight);

        let yPositionTerms = marginTop + 30;
        const lineHeight = 5;
        const maxLinesPerPage = 45;

        for (let i = 0; i < lines.length; i++) {
          if ((i % maxLinesPerPage === 0) && i !== 0) {
            pdf.addPage();
            yPositionTerms = marginTop + 15;
            pdf.setFontSize(10);
            pdf.setTextColor(51, 51, 51);
            pdf.setFont(undefined, 'normal');
          }
          pdf.text(lines[i], marginLeft, yPositionTerms);
          yPositionTerms += lineHeight;
        }
      }

      pdf.save(`invoice-${invoiceData.invoiceNo}.pdf`);
    } catch (error) {
      console.error('Error generating PDF:', error);
      toast.error('An error occurred while generating the PDF. Please try again.');
    }
  };

  const printInvoice = () => {
    const hasEmptyDescriptions = invoiceData.items.some(item => !item.description || item.description.trim() === '');
    if (hasEmptyDescriptions) {
      toast.error('Please fill in descriptions for all items before printing.');
      return;
    }

    if (onInvoiceSave) {
      onInvoiceSave({ ...invoiceData, _id: initialData?._id, createdAt: new Date().toISOString() });
    }

    const printWindow = window.open('', '_blank');
    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Invoice Print</title>
          <style>
            @import url('https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600;700&display=swap');
            @media print {
              @page {
                size: A4;
                margin: 20mm;
              }
              body {
                -webkit-print-color-adjust: exact;
              }
              .footer-container {
                 page-break-inside: avoid;
              }
              /* Mobile Invoice Scaling for Print */
              @media (max-width: 768px) {
                .mobile-invoice-container {
                  transform-origin: top center;
                  transform: scale(0.8);
                  width: 125%;
                  margin-left: -12.5%;
                }
              }
              
              @media (max-width: 480px) {
                .mobile-invoice-container {
                  transform: scale(0.65);
                  width: 154%;
                  margin-left: -27%;
                }
              }
            }
            body {
              font-family: 'Poppins', sans-serif;
              color: #333;
              margin: 0;
              padding: 20mm;
              background: white;
              box-sizing: border-box;
              font-size: 12px;
              min-height: 100vh;
              display: flex;
              flex-direction: column;
            }
            .invoice-container {
              flex: 1;
              display: flex;
              flex-direction: column;
            }
            .header {
              display: flex;
              justify-content: space-between;
              align-items: flex-start;
              margin-bottom: 4mm;
            }
            .logo {
              height: 20mm;
              object-fit: contain;
            }
            .invoice-type {
              font-size: 24px;
              font-weight: bold;
              color: #00843d;
              text-transform: uppercase;
            }
            .divider {
              display: flex;
              width: 100%;
              height: 1mm;
              margin-bottom: 6mm;
            }
            .divider-green {
              background-color: #8cb23f;
              width: 15%;
            }
            .divider-gray {
              background-color: #d1d5db;
              width: 85%;
            }
            .invoice-details {
              display: flex;
              justify-content: space-between;
              margin-bottom: 10mm;
            }
            .invoice-details .left {
              width: 45%;
            }
            .invoice-details .right {
              width: 45%;
              text-align: right;
            }
            .invoice-details .right .label {
              font-weight: bold;
            }
            .invoice-details .right .value {
              margin-left: 10px;
            }
            .customer-details {
              margin-bottom: 10mm;
            }
            .customer-details .label {
              font-weight: bold;
            }
            .customer-details .value {
              margin-left: 10px;
            }
            .table-container {
              width: 100%;
              border-collapse: collapse;
              margin-bottom: 10mm;
            }
            .table-container th, .table-container td {
              border: 1px solid #d1d5db;
              padding: 4px;
              text-align: center;
            }
            .table-container th {
              background-color: #00843d;
              color: white;
              font-weight: bold;
            }
            .table-container .total-row {
              font-weight: bold;
            }
            .table-container .total-row td {
              background-color: #e9f7ec;
            }
            .footer-container {
              display: flex;
              justify-content: space-between;
              align-items: flex-end;
              margin-top: auto;
            }
            .footer-container .payment-method {
              width: 45%;
            }
            .footer-container .payment-method .label {
              font-weight: bold;
            }
            .footer-container .payment-method .value {
              margin-left: 10px;
            }
            .footer-container .seal {
              width: 45%;
              text-align: right;
            }
            .footer-container .seal img {
              width: 35mm;
              height: 30mm;
              object-fit: contain;
            }
            .thank-you {
              text-align: center;
              margin-top: 10mm;
              font-weight: bold;
            }
            .thank-you .divider-green {
              background-color: #8cb23f;
              width: 15%;
            }
            .thank-you .divider-gray {
              background-color: #d1d5db;
              width: 85%;
            }
              width: 15%;
              background-color: #8cc63f;
            }
            .divider-gray {
              width: 85%;
              background-color: #d1d5db;
              height: 0.5mm;
              align-self: flex-end;
            }
            .customer-details {
              display: flex;
              justify-content: space-between;
              margin-bottom: 8mm;
              font-size: 12px;
            }
            .customer-name {
              font-weight: bold;
              margin-bottom: 7px;
            }
            .invoice-info {
              text-align: right;
              font-size: 12px;
            }
            .invoice-info div {
              margin-bottom: 5px;
            }
            .invoice-label {
              font-weight: bold;
              display: inline-block;
              width: 35mm;
            }
            .address-section {
              display: flex;
              justify-content: space-between;
              margin-bottom: 8mm;
            }
            .address-container {
              width: 50%;
              padding-right: 4mm;
            }
            .address-label {
              font-weight: bold;
              margin-bottom: 2mm;
              font-size: 12px; 
            }
            .address-text {
              white-space: pre-line;

              line-height: 1.2;
              font-size: 12px; 
            }
            .from-section {
              width: 50%;
              padding-left: 4mm;
              text-align: right;
            }
            .from-container {
              background-color: #f9fafb;
              padding: 2mm;
              text-align: left;
              font-size: 12px; 
            }
            .from-title {
              font-weight: 600;
              font-size: 12px; 
              margin-bottom: 1mm;
              color: #4b5563;
              text-transform: uppercase;
            }
            .from-details {
              font-size: 12px; 
              color: #374151;
            }
            table {
              width: 100%;
              border-collapse: collapse;
              margin-bottom: 5mm;
              font-size: 12px;
            }
            th {
              background-color: #00843d;
              color: white;
              font-weight: bold;
              padding: 3mm;
              text-align: center;
              font-size: 12px;
            }
            th.description {
              text-align: left;
            }
            td {
              padding: 3mm;
              border-bottom: 0.5mm solid #d1d5db;
              font-size: 12px;
            }
            .content-spacer {
                flex-grow: 1;
            }
            .footer-container {
                margin-top: auto;
                break-inside: avoid;
            }
            .summary {
              margin-top: 10mm;
              margin-bottom: 10mm;
            }
            .summary-label {
              font-weight: bold;
              display: inline-block;
              width: 35mm;
            }
            .total-words-label {
                background-color: #00843d;
                color: white;
                font-weight: bold;
                padding: 5px 10px;
                display: inline-block;
                margin-bottom: 5px;
            }
            .payment-label {
                background-color: #00843d;
                color: white;
                font-weight: bold;
                padding: 5px 10px;
                display: inline-block;
                margin-bottom: 5px;
            }
            .totals-table {
                width: 100%;
            }
            .totals-table td {
                padding: 5px;
            }
            .grand-total {
                background-color: #00843d;
                color: white;
                font-weight: bold;
            }
            .seal-image {
              width: 40mm;
              height: 35mm;
            }
            .seal-label {
              margin-top: 5mm;
              font-size: 12px;
            }
            .thank-you {
              margin-top: 15mm;
              text-align: center;
              font-weight: bold;
            }
            .bottom-divider {
              display: flex;
              justify-content: center;
              margin-top: 8mm;
            }
            .bottom-divider-green {
              width: 25%;
              border-bottom: 2mm solid #8cc63f;
            }
            .bottom-divider-gray {
              width: 75%;
              border-bottom: 2mm solid #d1d5db;
            }
            .payment-flex {
                display: flex;
                justify-content: space-between;
                align-items: flex-start;
            }
          </style>
        </head>
        <body>
          <div class="invoice-container mobile-invoice-container">
            <div>
                <div class="header">
                <img src="/Invoicelogo.png" alt="Company Logo" class="logo" />
                <div class="invoice-type">${invoiceData.invoiceType}</div>
                </div>
                
                <div class="divider">
                <div class="divider-green"></div>
                <div class="divider-gray"></div>
                </div>
                
                <div class="customer-details">
                <div>
                    ${includeFields.customerName && invoiceData.customerName ?
        `<div class="customer-name">Invoice to : ${invoiceData.customerName}</div>` : ''}
                </div>
                <div class="invoice-info">
                    <div><span class="invoice-label">Invoice No :</span> ${invoiceData.invoiceNo}</div>
                    <div><span class="invoice-label">Invoice Date :</span> ${invoiceData.invoiceDate}</div>
                    ${includeFields.salesPerson && invoiceData.salesPerson ?
        `<div><span class="invoice-label">Sales person :</span> ${invoiceData.salesPerson}</div>` : ''}
                </div>
                </div>
                
                <div class="address-section">
                <div class="address-container">
                    ${includeFields.customerContact && invoiceData.customerContact ?
        `<div class="address-label">${invoiceData.gstEnabled ? 'Address' : 'Contact'} :</div>
                    <div class="address-text">${invoiceData.customerContact}</div>` : ''}
                </div>
                ${includeFields.consignerDetails ?
        `<div class="from-section">
                    <div class="from-container">
                        <div class="from-title">From:</div>
                        <div class="from-details">${invoiceData.fromSection.company}</div>
                        <div class="from-details">${invoiceData.fromSection.addressLine1}</div>
                        <div class="from-details">${invoiceData.fromSection.addressLine2} ${invoiceData.fromSection.addressLine3}</div>
                        <div class="from-details">${invoiceData.fromSection.cityZip}</div>
                        <div class="from-details">${invoiceData.fromSection.mobile}</div>
                        ${invoiceData.gstEnabled ? `<div class="from-details">${invoiceData.fromSection.gstin}</div>` : ''}
                    </div>
                    </div>` : ''}
                </div>
                
                <table>
                <thead>
                    <tr>
                    <th style="width: 15mm;">NO</th>
                    <th class="description">DESCRIPTION</th>
                    ${invoiceData.gstEnabled ?
        `<th style="width: 25mm; text-align: left;">HSN/SAC</th>
                        <th style="width: 25mm; text-align: right;">GST (%)</th>` : ''}
                    <th style="width: 20mm; text-align: right;">QTY</th>
                    <th style="width: 25mm; text-align: right;">PRICE</th>
                    <th style="width: 30mm; text-align: right;">TOTAL</th>
                    </tr>
                </thead>
                <tbody>
                    ${invoiceData.items.map((item, index) => `
                    <tr>
                        <td style="text-align: center;">${index + 1}</td>
                        <td>${item.description}</td>
                        ${invoiceData.gstEnabled ?
            `<td>${item.hsn || ''}</td>
                        <td style="text-align: right;">${item.gst.toFixed(2)}</td>` : ''}
                        <td style="text-align: right;">${item.qty}</td>
                        <td style="text-align: right;">${item.rate.toFixed(2)}</td>
                        <td style="text-align: right;">${item.total.toFixed(2)}</td>
                    </tr>
                    `).join('')}
                </tbody>
                </table>
            </div>

            <div class="content-spacer"></div>

            <div class="footer-container">
                <div class="summary">
                    <div style="display: flex; justify-content: space-between; align-items: flex-start;">
                        <div style="width: 50%;">
                            <div class="total-words-label">Total In Words</div>
                            <div>${totals.totalInWords}</div>
                        </div>
                        <div style="width: 40%;">
                            <table class="totals-table">
                            <tr>
                                <td style="text-align: right;">Sub Total :</td>
                                <td style="text-align: right; font-weight: 500;">₹${totals.subtotal.toFixed(2)}</td>
                            </tr>
                            ${invoiceData.gstEnabled && invoiceData.saleType === 'Intrastate' ?
        `<tr>
                                <td style="text-align: right;">CGST Total :</td>
                                <td style="text-align: right; font-weight: 500;">₹${totals.cgstTotal.toFixed(2)}</td>
                                </tr>
                                <tr>
                                <td style="text-align: right;">SGST Total :</td>
                                <td style="text-align: right; font-weight: 500;">₹${totals.sgstTotal.toFixed(2)}</td>
                                </tr>` : ''}
                            ${invoiceData.gstEnabled && invoiceData.saleType === 'Interstate' ?
        `<tr>
                                <td style="text-align: right;">IGST Total :</td>
                                <td style="text-align: right; font-weight: 500;">₹${totals.igstTotal.toFixed(2)}</td>
                                </tr>` : ''}
                            <tr class="grand-total">
                                <td style="text-align: right; text-transform: uppercase;">Grand Total :</td>
                                <td style="text-align: right;">₹${totals.grandTotal.toFixed(2)}</td>
                            </tr>
                            </table>
                        </div>
                    </div>
                </div>
                
                <div class="payment-section">
                    <div class="payment-flex">
                        <div style="width: 50%;">
                            ${includeFields.bankDetails ?
        `<div class="payment-label">Payment Method:</div>
                            <div class="payment-details">
                                ${invoiceData.bankName ? `<div><span style="font-weight: 500;">Bank Name:</span> ${invoiceData.bankName}</div>` : ''}
                                ${invoiceData.accountNumber ? `<div><span style="font-weight: 500;">Account Number:</span> ${invoiceData.accountNumber}</div>` : ''}
                                ${invoiceData.ifscCode ? `<div><span style="font-weight: 500;">IFSC Code:</span> ${invoiceData.ifscCode}</div>` : ''}
                                ${invoiceData.upiId ? `<div><span style="font-weight: 500;">UPI ID:</span> ${invoiceData.upiId}</div>` : ''}
                            </div>` : ''}
                        </div>
                        <div style="text-align: center;">
                            ${sealPreview ?
        `<img src="${sealPreview}" alt="Company Seal" class="seal-image" />
                            <div class="seal-label">Company Seal</div>` :
        `<div style="height: 35mm;"></div>
                            <div class="seal-label">Company Seal</div>`}
                        </div>
                    </div>
                    <div class="thank-you">Thank you for business with us!</div>
                </div>
                
                <div class="bottom-divider">
                <div class="bottom-divider-green"></div>
                <div class="bottom-divider-gray"></div>
                </div>
            </div>
          </div>
          
          <!-- Terms and Conditions Section (conditionally added) -->
          <script>
            // Add Terms and Conditions only if Common or Web Development checkbox is selected
            var terms = "{invoiceData.terms}";
            if (terms === 'Common' || terms === 'Web Development') {
              document.write('<div style="page-break-before: always;"></div>');
              
              // Add divider
              document.write('<div style="display: flex; width: 100%; height: 1mm; margin-top: 5mm; margin-bottom: 5mm;">');
              document.write('<div style="width: 15%; background-color: #8cc63f;"></div>');
              document.write('<div style="width: 85%; height: 0.7mm; background-color: #d1d5db; align-self: flex-end;"></div>');
              document.write('</div>');
              
              // Add title
              document.write('<h2 style="text-align: center; font-size: 18px; color: #00843d; font-weight: bold; margin-bottom: 10mm;">TERMS AND CONDITIONS</h2>');
              
              // Add terms content based on selection
              var termsAndConditions = '';
              if (terms === 'Common') {
                termsAndConditions = '1. ACCEPTANCE OF TERMS\nBy using the Inventory Management Module Progressive Web App (PWA) and related\nservices, you agree to follow these Terms and our Privacy Policy. If you do not agree, please\ndo not use the app or services.\n\n2. CHANGES TO TERMS\nWe may update these Terms at any time. Changes will be posted here with a new \"Last\nUpdated\" date. If you keep using the app or services after changes, it means you accept the\nupdated Terms.\n\n3. USE OF THE APP\nThe Inventory Management Module PWA is a custom-built application designed to help\nmanage business operations, including appointment scheduling, customer management,\nservice tracking, billing, inventory management, staff performance monitoring, and financial\nreporting. You agree to use the app lawfully and provide accurate and up-to-date\ninformation when managing appointments, customer data, and business operations.\n\n4. CUSTOMIZATION AND ADD-ONS\nWe offer customization to fit the app to your specific needs, such as adding new categories,\nmodifying workflows, integrating payment systems, or creating custom reports. Any extra\nfeatures or changes beyond the standard app will have additional costs, which we will\ndiscuss and agree on before starting the work.\n\n5. OWNERSHIP AND RIGHTS\nAll parts of the app, including text, designs, logos, code, and custom features, belong to\n[Your Company Name] or its developers. You may not copy, change, or share any part of the\napp without our written permission.\n\n6. PRIVACY POLICY Using the Inventory Management Module PWA means you agree to how\nwe collect and use your data, including customer information, appointment records, and\nbusiness analytics, as explained in our Privacy Policy.\n\n7. SUPPORT HOURS\nWe provide support for the app from 10:00 AM to 7:00 PM, Monday to Saturday (except\npublic holidays). Any support requests outside these hours will be handled during the next\nsupport period.\n\n8. MONTHLY SERVER FEES\nThe app requires hosting, maintenance, and data backup services, which are billed\nmonthly. Using the app means you agree to these recurring fees.\n\n9. RULES FOR USING THE APP\nYou agree not to misuse the app, including:\nBreaking any laws or harming others\' rights\nDisrupting how the app works or compromising data security\nSharing harmful, illegal, or inappropriate content\nAttempting unauthorized access to customer data or system functions\nUsing the app for purposes other than legitimate business management\n\n10. DATA SECURITY AND CUSTOMER INFORMATION\nYou are responsible for maintaining the confidentiality of customer information\naccessed through the app. You agree to comply with applicable data protection laws\nand use customer data only for legitimate business purposes.\n\n11. LIMITATION OF LIABILITY Tech Vaseegrah and its developers are not responsible for\nany business losses, data loss, or damages from using or not being able to use the app,\neven if we\'re told such issues might happen. This includes losses related to missed\noperations, billing errors, or system downtime.\n\n12. INDEMNIFICATION\nYou agree to protect Tech Vaseegrah, its developers, and their teams from any claims or\ndamages caused by your misuse of the app, violation of these Terms, or mishandling of\ncustomer data.\n\n13. SERVICE INTERRUPTIONS\nWhile we strive for continuous service, scheduled maintenance and updates may\ntemporarily interrupt app availability. We will provide advance notice when possible.';
              } else if (terms === 'Web Development') {
                termsAndConditions = '1. Full Payment to Begin the Project The project will officially start only after the full payment has been received. Once the full payment is made, we ensure the work will be completed diligently within the stipulated timeframe, as agreed with the client.\n2. Submission of Required Documents for Web Development Customers are kindly requested to provide all essential documents and details related to the web development project before work begins. These materials may include content, images, brand guidelines, specific requirements, and other necessary assets. Providing these items ensures a seamless and efficient development process.\n3. Five-Day Grace Period for Document Submission Upon receipt of the initial payment, customers are granted a grace period of five (10) days to organize and submit the required documents. This period is intended to give sufficient time for preparation. Delayed submission of these materials may affect the project timeline.\n4. Commencement of Development Work After Document Submission Once the required documents have been submitted, our team will review them and promptly begin the development process. The project timeline will officially commence on the day we receive all necessary materials in full. Development will proceed according to the agreed-upon specifications and schedule.\n5. Completion of Development Work Within Five Days From the official start date of development, we commit to completing the project within five (5) business days, provided all required documentation and details have been submitted on time. This ensures a timely launch of the website in accordance with the agreed timeline.\n6. Full Development Cost for Delays in Document Submission Should the customer fail to provide the required documents within the five-day grace period, the full development cost will apply. Delayed submissions can impact the project schedule, and the additional cost reflects the resources and time allocated to the project.\n7. Hosting on Our Web Server for Optimal Performance For enhanced performance, security, and reliability, we require that all customer websites be hosted on our web server. This arrangement allows us to maintain a secure hosting environment and offer consistent support and monitoring.\n8. Restrictions on Customer-Managed Servers To ensure security and performance, we are unable to permit customers to host their websites on independently managed servers. Our servers are equipped with state-of-the-art security features to safeguard customer data and maintain optimal website functionality.\n9. Optional Use of Customer-Owned Servers (With Conditions) If a customer prefers to use their own server, we are happy to accommodate this request. However, please note that we cannot assume responsibility for any issues arising from the use of an independently managed server. Customers who choose this option will bear full responsibility for the management, security, and reliability of their hosting environment.\n10. Fixed Costs for Development, Hosting, and Maintenance All agreed-upon costs for development, server hosting, and maintenance are fixed and non-negotiable. These fees are determined based on the scope of the project and the services provided. Adjustments or discounts will not be offered once terms are finalized. We appreciate your understanding and cooperation in adhering to these terms, which are designed to ensure a successful and efficient project experience for both parties. Thank you for choosing us for your web development needs!!';
              }
              
              // Add terms content with proper formatting
              document.write('<div style="white-space: pre-line; font-size: 10px; color: #333; line-height: 1.5;">');
              document.write(termsAndConditions);
              document.write('</div>');
            }
          </script>
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
    <div className="max-w-6xl mx-auto p-4 bg-white font-sans">
      <div className="mb-6 flex justify-between items-center">
        <h1 className="text-xl font-bold text-gray-800">
          {initialData ? 'Edit Invoice' : 'Advanced Invoice Creator'}
        </h1>
        <div className="space-x-2 invoice-action-buttons">
          {!isPreviewMode && (
            <button
              onClick={() => {
                // Validate that all items have descriptions before saving
                const hasEmptyDescriptions = invoiceData.items.some(item => !item.description || item.description.trim() === '');
                if (hasEmptyDescriptions) {
                  toast.error('Please fill in descriptions for all items before saving.');
                  return;
                }

                // Save invoice to backend
                if (onInvoiceSave) {
                  onInvoiceSave({ ...invoiceData, _id: initialData?._id });
                }
              }}
              className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-md transition duration-300 text-sm"
            >
              Save Invoice
            </button>
          )}
          <button
            onClick={printInvoice}
            className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-md transition duration-300 text-sm"
          >
            Print
          </button>
          <button
            onClick={exportToPDF}
            className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-md transition duration-300 text-sm"
          >
            Download PDF
          </button>
        </div>
      </div>

      {/* Invoice Preview - Added mobile-responsive container with scaling */}
      <fieldset disabled={isPreviewMode} className="contents">
        <div className="bg-white p-6 border border-gray-300 rounded-lg mb-6">
          <div
            ref={invoiceRef}
            className="max-w-4xl mx-auto bg-white mobile-invoice-container"
            style={{
              fontFamily: 'Poppins, sans-serif',
              color: '#333',
              padding: '30px'
            }}
          >
            <div className="flex justify-between items-start mb-4">
              <div className="flex items-start">
                <img src="/Invoicelogo.png" alt="Company Logo" className="h-15 object-contain" />
              </div>
              <div className="text-right">
                <select
                  name="invoiceType"
                  value={invoiceData.invoiceType}
                  onChange={handleInvoiceTypeChange}
                  className="text-3xl font-bold uppercase"
                  style={{ color: '#00843d', background: 'white', border: 'none', outline: 'none' }}
                >
                  <option value="INVOICE">INVOICE</option>
                  <option value="PROFORMA INVOICE">PROFORMA INVOICE</option>
                  <option value="TAX INVOICE">TAX INVOICE</option>
                </select>
              </div>
            </div>

            <div className="flex w-full h-1 mb-6">
              <div className="w-[15%]" style={{ backgroundColor: '#8cc63f' }}></div>
              <div className="w-[85%] h-[2px] bg-gray-200 self-center"></div>
            </div>

            <div className="flex justify-between mb-8 text-sm">
              <div>
                <div className="flex items-center mb-1">
                  <input
                    type="checkbox"
                    checked={includeFields.customerName}
                    onChange={() => handleCheckboxChange('customerName')}
                    className="mr-2 h-4 w-4 text-green-600 rounded"
                  />
                  <label className="font-bold text-gray-700 mr-2">Invoice to :</label>
                  <input
                    type="text"
                    name="customerName"
                    value={invoiceData.customerName}
                    onChange={handleInputChange}
                    placeholder="Customer Name"
                    className="px-1 py-0.5 border-b border-gray-300 focus:outline-none focus:border-green-500 text-sm font-normal"
                  />
                </div>
              </div>
              <div className="text-right">
                <div className="flex items-center justify-end mb-1">
                  <input
                    type="checkbox"
                    checked={includeFields.invoiceNo}
                    onChange={() => handleCheckboxChange('invoiceNo')}
                    className="mr-2 h-4 w-4 text-green-600 rounded"
                  />
                  <label className="font-bold text-gray-700 mr-2">Invoice No :</label>
                  <input
                    type="text"
                    name="invoiceNo"
                    value={invoiceData.invoiceNo}
                    onChange={handleInputChange}
                    className="px-1 py-0.5 border-b border-gray-300 focus:outline-none focus:border-green-500 text-sm font-normal"
                  />
                </div>
                <div className="flex items-center justify-end">
                  <input
                    type="checkbox"
                    checked={includeFields.invoiceDate}
                    onChange={() => handleCheckboxChange('invoiceDate')}
                    className="mr-2 h-4 w-4 text-green-600 rounded"
                  />
                  <label className="font-bold text-gray-700 mr-2">Invoice Date :</label>
                  <input
                    type="text"
                    name="invoiceDate"
                    value={invoiceData.invoiceDate}
                    onChange={handleInputChange}
                    className="px-1 py-0.5 border-b border-gray-300 focus:outline-none focus:border-green-500 text-sm font-normal"
                  />
                </div>

                <div className="flex items-center justify-end mt-2">
                  <input
                    type="checkbox"
                    name="gstEnabled"
                    checked={invoiceData.gstEnabled}
                    onChange={handleInputChange}
                    className="mr-2 h-4 w-4 text-green-600 rounded"
                  />
                  <label className="text-sm font-bold text-gray-700 mr-2">GST</label>
                  {invoiceData.gstEnabled && (
                    <select

                      name="saleType"
                      value={invoiceData.saleType}
                      onChange={handleInputChange}
                      className="px-1 py-0.5 border-b border-gray-300 focus:outline-none focus:border-green-500 text-sm font-normal"
                    >
                      <option value="Intrastate">Intrastate</option>
                      <option value="Interstate">Interstate</option>
                    </select>
                  )}
                </div>

                <div className="flex items-center justify-end mt-2">
                  <input
                    type="checkbox"
                    checked={includeFields.salesPerson}
                    onChange={() => handleCheckboxChange('salesPerson')}
                    className="mr-2 h-4 w-4 text-green-600 rounded"
                  />
                  <label className="text-sm font-bold text-gray-700 mr-2">Sales person :</label>
                  <input
                    type="text"
                    name="salesPerson"
                    value={invoiceData.salesPerson}
                    onChange={handleInputChange}
                    placeholder="Sales Person"
                    className="px-1 py-0.5 border-b border-gray-300 focus:outline-none focus:border-green-500 text-sm font-normal"
                  />
                </div>
              </div>
            </div>

            <div className="flex justify-between mb-8">
              <div className="w-1/2 pr-4">
                <div className="flex items-start">
                  <input
                    type="checkbox"
                    checked={includeFields.customerContact}
                    onChange={() => handleCheckboxChange('customerContact')}
                    className="mr-2 h-4 w-4 text-green-600 rounded mt-1"
                  />
                  <div className="flex-1">
                    <label className="font-bold text-gray-700 mr-2">Address :</label>
                    <textarea
                      name="customerContact"
                      value={invoiceData.customerContact}
                      onChange={handleInputChange}
                      placeholder="Enter full address"
                      className="px-1 py-0.5 border-b border-gray-300 focus:outline-none focus:border-green-500 text-sm font-normal w-full h-24 resize-none"
                      rows="4"
                    />
                  </div>
                </div>
              </div>

              <div className="w-1/2 pl-4">
                <div className="flex justify-end mb-2">
                  <input
                    type="checkbox"
                    checked={includeFields.consignerDetails}
                    onChange={() => handleCheckboxChange('consignerDetails')}
                    className="mr-2 h-4 w-4 text-green-600 rounded mt-1"
                  />
                  <div className="flex items-center">
                    <label className="font-bold text-gray-700">From :</label>
                  </div>
                </div>
                <div className="p-2 bg-gray-50 rounded text-left">
                  <input
                    type="text"
                    value={invoiceData.fromSection.company}
                    onChange={(e) => handleFromSectionChange('company', e.target.value)}
                    className="w-full text-sm text-gray-800 font-bold bg-transparent border-b border-transparent hover:border-gray-300 focus:border-green-500 focus:outline-none mb-0.5"
                    placeholder="Company Name"
                  />
                  <input
                    type="text"
                    value={invoiceData.fromSection.addressLine1}
                    onChange={(e) => handleFromSectionChange('addressLine1', e.target.value)}
                    className="w-full text-xs text-gray-700 bg-transparent border-b border-transparent hover:border-gray-300 focus:border-green-500 focus:outline-none"
                    placeholder="Address Line 1"
                  />
                  <input
                    type="text"
                    value={invoiceData.fromSection.addressLine2}
                    onChange={(e) => handleFromSectionChange('addressLine2', e.target.value)}
                    className="w-full text-xs text-gray-700 bg-transparent border-b border-transparent hover:border-gray-300 focus:border-green-500 focus:outline-none"
                    placeholder="Address Line 2"
                  />
                  <input
                    type="text"
                    value={invoiceData.fromSection.addressLine3}
                    onChange={(e) => handleFromSectionChange('addressLine3', e.target.value)}
                    className="w-full text-xs text-gray-700 bg-transparent border-b border-transparent hover:border-gray-300 focus:border-green-500 focus:outline-none"
                    placeholder="Address Line 3"
                  />
                  <input
                    type="text"
                    value={invoiceData.fromSection.cityZip}
                    onChange={(e) => handleFromSectionChange('cityZip', e.target.value)}
                    className="w-full text-xs text-gray-700 bg-transparent border-b border-transparent hover:border-gray-300 focus:border-green-500 focus:outline-none"
                    placeholder="City & Zip"
                  />
                  <input
                    type="text"
                    value={invoiceData.fromSection.mobile}
                    onChange={(e) => handleFromSectionChange('mobile', e.target.value)}
                    className="w-full text-xs text-gray-700 bg-transparent border-b border-transparent hover:border-gray-300 focus:border-green-500 focus:outline-none"
                    placeholder="Mobile"
                  />
                  {invoiceData.gstEnabled && (
                    <input
                      type="text"
                      value={invoiceData.fromSection.gstin}
                      onChange={(e) => handleFromSectionChange('gstin', e.target.value)}
                      className="w-full text-xs text-gray-700 bg-transparent border-b border-transparent hover:border-gray-300 focus:border-green-500 focus:outline-none"
                      placeholder="GSTIN"
                    />
                  )}
                </div>
              </div>
            </div>

            <div className="mb-5">
              <table className="w-full border-collapse border border-gray-300">
                <thead>
                  <tr style={{ backgroundColor: '#00843d' }}>
                    <th className="py-2 px-3 border-r border-gray-300 text-center text-white text-xs font-bold uppercase">NO</th>
                    <th className="py-2 px-3 border-r border-gray-300 text-left text-white text-xs font-bold uppercase">DESCRIPTION</th>
                    {invoiceData.gstEnabled && (
                      <>
                        <th className="py-2 px-3 border-r border-gray-300 text-left text-white text-xs font-bold uppercase">HSN/SAC</th>
                        <th className="py-2 px-3 border-r border-gray-300 text-right text-white text-xs font-bold uppercase">GST (%)</th>
                      </>
                    )}
                    <th className="py-2 px-3 border-r border-gray-300 text-right text-white text-xs font-bold uppercase">QTY</th>
                    <th className="py-2 px-3 border-r border-gray-300 text-right text-white text-xs font-bold uppercase">PRICE</th>
                    <th className="py-2 px-3 text-right text-white text-xs font-bold uppercase">TOTAL</th>
                  </tr>
                </thead>
                <tbody>
                  {[...Array(numRowsToDisplay)].map((_, index) => {
                    const item = invoiceData.items[index];
                    const rowBackgroundColor = index % 2 === 0 ? '#FFFFFF' : '#E9F7EC';

                    if (item) {
                      return (
                        <tr key={item.id} className="border-b border-gray-300" style={{ backgroundColor: rowBackgroundColor }}>
                          <td className="py-2 px-3 border-r border-gray-300 text-sm text-center">{index + 1}</td>
                          <td className="py-2 px-3 border-r border-gray-300">
                            <input
                              type="text"
                              value={item.description}
                              onChange={(e) => handleItemChange(item.id, 'description', e.target.value)}
                              className="w-full px-1 py-1 focus:outline-none focus:bg-gray-100 text-sm font-normal"
                              placeholder="Item description"
                            />
                          </td>
                          {invoiceData.gstEnabled && (
                            <>
                              <td className="py-2 px-3 border-r border-gray-300">
                                <input
                                  type="text"
                                  value={item.hsn}
                                  onChange={(e) => handleItemChange(item.id, 'hsn', e.target.value)}
                                  className="w-full px-1 py-1 focus:outline-none focus:bg-gray-100 text-sm font-normal"
                                  placeholder="HSN/SAC"
                                />
                              </td>
                              <td className="py-2 px-3 border-r border-gray-300">
                                <input
                                  type="text"
                                  min="0"
                                  step="0.01"
                                  value={item.gst}
                                  onChange={(e) => handleItemChange(item.id, 'gst', e.target.value)}
                                  className="w-full px-1 py-1 text-right focus:outline-none focus:bg-gray-100 text-sm font-normal"
                                />
                              </td>
                            </>
                          )}
                          <td className="py-2 px-3 border-r border-gray-300">
                            <input
                              type="number"
                              min="1"
                              value={item.qty}
                              onChange={(e) => handleItemChange(item.id, 'qty', e.target.value)}
                              className="w-full px-1 py-1 text-right focus:outline-none focus:bg-gray-100 text-sm font-normal"
                            />
                          </td>
                          <td className="py-2 px-3 border-r border-gray-300">
                            <input
                              type="number"
                              min="0"
                              step="0.01"
                              value={item.rate}
                              onChange={(e) => handleItemChange(item.id, 'rate', e.target.value)}
                              className="w-full px-1 py-1 text-right focus:outline-none focus:bg-gray-100 text-sm font-normal"
                            />
                          </td>
                          <td className="py-2 px-3 text-right font-medium">
                            <input
                              type="number"
                              min="0"
                              step="0.01"
                              value={item.total}
                              onChange={(e) => handleItemChange(item.id, 'total', e.target.value)}
                              className="w-full px-1 py-1 text-right focus:outline-none focus:bg-gray-100 text-sm font-normal"
                            />
                          </td>
                        </tr>
                      );
                    } else {
                      return (
                        <tr key={`empty-${index}`} className="border-b border-gray-300" style={{ backgroundColor: rowBackgroundColor }}>
                          <td className="py-2 px-3 border-r border-gray-300 text-sm text-center">&nbsp;</td>
                          <td className="py-2 px-3 border-r border-gray-300">&nbsp;</td>
                          {invoiceData.gstEnabled && (
                            <>
                              <td className="py-2 px-3 border-r border-gray-300">&nbsp;</td>
                              <td className="py-2 px-3 border-r border-gray-300">&nbsp;</td>
                            </>
                          )}
                          <td className="py-2 px-3 border-r border-gray-300">&nbsp;</td>
                          <td className="py-2 px-3 border-r border-gray-300">&nbsp;</td>
                          <td className="py-2 px-3">&nbsp;</td>
                        </tr>
                      );
                    }
                  })}
                </tbody>
                <tfoot>
                  <tr className="bg-white">
                    <td colSpan={invoiceData.gstEnabled ? 7 : 5} className="py-2 px-3 text-right">
                      <button
                        onClick={addItem}
                        className="bg-green-600 hover:bg-green-700 text-white px-3 py-1 rounded-md transition duration-300 text-xs"
                      >
                        Add Item
                      </button>
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>

            <div className="mb-6 flex justify-between items-start">
              <div className="w-1/2">
                <h3 className="font-bold text-gray-700 text-sm mb-1">Total In Words</h3>
                <p className="text-gray-800 text-sm">{totals.totalInWords}</p>
              </div>

              <div className="w-1/3">
                <table className="w-full">
                  <tbody>
                    <tr className="border-b border-gray-300">
                      <td className="py-2 px-3 text-sm text-right text-gray-700">Sub Total :</td>
                      <td className="py-2 px-3 text-sm font-medium text-right text-gray-800">₹{totals.subtotal.toFixed(2)}</td>
                    </tr>

                    {invoiceData.gstEnabled && invoiceData.saleType === 'Intrastate' && (
                      <>
                        <tr className="border-b border-gray-300">
                          <td className="py-2 px-3 text-sm text-right text-gray-700">CGST Total :</td>
                          <td className="py-2 px-3 text-sm font-medium text-right text-gray-800">₹{totals.cgstTotal.toFixed(2)}</td>
                        </tr>
                        <tr className="border-b border-gray-300">
                          <td className="py-2 px-3 text-sm text-right text-gray-700">SGST Total :</td>
                          <td className="py-2 px-3 text-sm font-medium text-right text-gray-800">₹{totals.sgstTotal.toFixed(2)}</td>
                        </tr>
                      </>
                    )}
                    {invoiceData.gstEnabled && invoiceData.saleType === 'Interstate' && (
                      <tr className="border-b border-gray-300">
                        <td className="py-2 px-3 text-sm text-right text-gray-700">IGST Total :</td>
                        <td className="py-2 px-3 text-sm font-medium text-right text-gray-800">₹{totals.igstTotal.toFixed(2)}</td>
                      </tr>
                    )}

                    <tr style={{ backgroundColor: '#00843d' }}>
                      <td className="py-2 px-3 font-bold text-sm text-right text-white uppercase">Grand Total :</td>
                      <td className="py-2 px-3 font-bold text-sm text-right text-white">₹{totals.grandTotal.toFixed(2)}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

            <div className="mb-6 flex justify-between items-start">
              <div>
                <div className="flex items-center mb-2">
                  <input
                    type="checkbox"
                    checked={includeFields.bankDetails}
                    onChange={() => handleCheckboxChange('bankDetails')}
                    className="mr-2 h-4 w-4 text-green-600 rounded"
                  />
                  <h3 className="font-bold text-sm text-gray-700 uppercase">Payment Method:</h3>
                </div>
                <div className="grid grid-cols-1 gap-1 ml-6 text-sm">
                  <div>
                    <p className="text-gray-800"><span className="font-medium text-gray-600">Bank Name:</span>
                      <input
                        type="text"
                        name="bankName"
                        value={invoiceData.bankName}
                        onChange={handleInputChange}
                        readOnly
                        className="ml-2 px-1 py-0.5 border-b border-gray-300 bg-gray-50 focus:outline-none text-sm font-normal cursor-not-allowed"
                      />
                    </p>
                  </div>
                  <div>
                    <p className="text-gray-800"><span className="font-medium text-gray-600">Account Number:</span>
                      <input
                        type="text"
                        name="accountNumber"
                        value={invoiceData.accountNumber}
                        onChange={handleInputChange}
                        readOnly
                        className="ml-2 px-1 py-0.5 border-b border-gray-300 bg-gray-50 focus:outline-none text-sm font-normal cursor-not-allowed"
                      />
                    </p>
                  </div>
                  <div>
                    <p className="text-gray-800"><span className="font-medium text-gray-600">IFSC Code:</span>
                      <input
                        type="text"
                        name="ifscCode"
                        value={invoiceData.ifscCode}
                        onChange={handleInputChange}
                        readOnly
                        className="ml-2 px-1 py-0.5 border-b border-gray-300 bg-gray-50 focus:outline-none text-sm font-normal cursor-not-allowed"
                      />
                    </p>
                  </div>
                  <div>
                    <p className="text-gray-800"><span className="font-medium text-gray-600">UPI ID:</span>
                      <input
                        type="text"
                        name="upiId"
                        value={invoiceData.upiId}
                        onChange={handleInputChange}
                        readOnly
                        className="ml-2 px-1 py-0.5 border-b border-gray-300 bg-gray-50 focus:outline-none text-sm font-normal cursor-not-allowed"
                      />
                    </p>
                  </div>
                </div>
              </div>

              <div className="text-center">
                <img
                  src={sealPreview || '/stamp.png'}
                  alt="Company Seal"
                  className="h-20 mx-auto"
                  onError={(e) => {
                    e.target.src = '/placeholder-seal.png';
                  }}
                />
                <div className="border-t border-gray-400 pt-2 mt-2">
                  <p className="text-gray-700 text-sm font-medium">Company Seal</p>
                </div>
                <p className="text-gray-700 font-bold text-sm mt-6 text-center">Thank you for business with us!</p>
              </div>
            </div>


            <div className="flex justify-center mt-8">
              <div className="w-3/12 border-b-2" style={{ borderColor: '#8cc63f' }}></div>
              <div className="w-9/12 border-b-2" style={{ borderColor: '#d1d5db' }}></div>
            </div>
          </div>
        </div>

        {!isPreviewMode && (
          <div className="mb-6 p-3 bg-gray-50 rounded-lg">
            <h2 className="text-lg font-semibold mb-3">Upload Company Assets</h2>
            <div className="grid grid-cols-1 md:grid-cols-1 gap-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Company Seal</label>
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleSealUpload}
                  className="w-full px-2 py-1 border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-green-500 text-sm"
                />
                <div className="mt-1">
                  <img
                    src={sealPreview || '/stamp.png'}
                    alt="Seal Preview"
                    className="h-16"
                    onError={(e) => {
                      e.target.src = '/placeholder-seal.png';
                    }}
                  />
                </div>
              </div>
            </div>
          </div>
        )
        }

        {/* Terms and Conditions Section */}
        <div className="mb-6 p-3 bg-gray-50 rounded-lg">
          <h2 className="text-lg font-semibold mb-3">Terms and Conditions</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="flex items-center">
              <input
                type="checkbox"
                id="commonTerms"
                name="commonTerms"
                checked={invoiceData.terms === 'Common'}
                onChange={(e) => handleInputChange({ target: { name: 'terms', value: e.target.checked ? 'Common' : '' } })}
                className="h-4 w-4 text-green-600 rounded mr-2"
              />
              <label htmlFor="commonTerms" className="text-sm font-medium text-gray-700">Common</label>
            </div>
            <div className="flex items-center">
              <input
                type="checkbox"
                id="webDevelopmentTerms"
                name="webDevelopmentTerms"
                checked={invoiceData.terms === 'Web Development'}
                onChange={(e) => handleInputChange({ target: { name: 'terms', value: e.target.checked ? 'Web Development' : '' } })}
                className="h-4 w-4 text-green-600 rounded mr-2"
              />
              <label htmlFor="webDevelopmentTerms" className="text-sm font-medium text-gray-700">Web Development</label>
            </div>
          </div>
        </div>
      </fieldset >
    </div >
  );
};

export default AdvancedInvoice;