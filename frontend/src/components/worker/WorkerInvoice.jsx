import React, { useState, useRef, useEffect } from 'react';
import { jsPDF } from 'jspdf';
import html2canvas from 'html2canvas';
import autoTable from 'jspdf-autotable';
import { toast } from 'react-toastify';

const WorkerInvoice = ({ onInvoiceSave, initialData }) => {
  // Auto-generate invoice number and date
  const today = new Date();
  const formattedDate = today.toLocaleDateString('en-IN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric'
  }).split('/').join('-');

  const [invoiceData, setInvoiceData] = useState({
    invoiceNo: initialData?.invoiceNo || 'TV0000000',
    invoiceDate: initialData?.invoiceDate || formattedDate,
    customerName: initialData?.customerName || '',
    customerContact: initialData?.customerContact || '',
    salesPerson: initialData?.salesPerson || '',
    terms: initialData?.terms || '',
    dueDate: initialData?.dueDate || '',
    // Add fromSection data
    fromSection: {
      company: 'TECH VASEEGRAH',
      addressLine1: 'No.11, VIJAYANAGAR,',
      addressLine2: 'REDDIPALAYAM ROAD,',
      addressLine3: 'SRINIVASAPURAM,',
      cityZip: 'THANJAVUR - 613009',
      mobile: 'Mobile: 7667792779',
      gstin: 'GSTIN: 33KYGPS1983E1Z1'
    },
    items: initialData?.items || [
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
    bankName: initialData?.bankName || 'ICICI',
    accountNumber: initialData?.accountNumber || '612805036053',
    ifscCode: initialData?.ifscCode || 'ICIC0006128',
    upiId: initialData?.upiId || 'techvaseegrah.ibz@icici',
    gstEnabled: initialData?.gstEnabled || false,
    saleType: initialData?.saleType || 'Intrastate', // Intrastate or Interstate
    customerGst: initialData?.customerGst || '',
    invoiceType: initialData?.invoiceType || 'INVOICE' // INVOICE, PROFORMA INVOICE, TAX INVOICE
  });

  // Checkbox states for including fields in PDF
  const [includeFields, setIncludeFields] = useState({
    customerName: true,
    customerContact: true,
    salesPerson: true,
    terms: true,
    dueDate: true,
    bankDetails: true,
    customerGst: true,
    consignerDetails: true  // Add this new field for From address
    // consignerDetails removed, it's now tied to gstEnabled
  });

  // State for company seal (logo upload removed)
  const [sealPreview, setSealPreview] = useState(null);
  
  // Set default seal image on component mount
  useEffect(() => {
    // Set default stamp.png as seal preview
    setSealPreview('/stamp.png');
  }, []);

  const invoiceRef = useRef();

  // Update invoice data when initialData changes
  useEffect(() => {
    if (initialData) {
      setInvoiceData({
        invoiceNo: initialData.invoiceNo || 'TV0000000',
        invoiceDate: initialData.invoiceDate || formattedDate,
        customerName: initialData.customerName || '',
        customerContact: initialData.customerContact || '',
        salesPerson: initialData.salesPerson || '',
        terms: initialData.terms || '',
        dueDate: initialData.dueDate || '',
        // Add fromSection data
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
        bankName: initialData.bankName || 'ICICI',
        accountNumber: initialData.accountNumber || '612805036053',
        ifscCode: initialData.ifscCode || 'ICIC0006128',
        upiId: initialData.upiId || 'techvaseegrah.ibz@icici',
        gstEnabled: initialData.gstEnabled || false,
        saleType: initialData.saleType || 'Intrastate',
        customerGst: initialData.customerGst || '',
        invoiceType: initialData.invoiceType || 'INVOICE'
      });
    }
  }, [initialData]);

  // Convert number to words
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

    if (num >= 10000000) {
      return 'Amount too large';
    }

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

  // Calculate totals
  const calculateTotals = () => {
    const subtotal = invoiceData.items.reduce((sum, item) => 
      sum + (item.isTotalOverridden ? item.total : (item.qty * item.rate)), 0);
    
    // Total GST (combining all items)
    const gstTotal = (invoiceData.gstEnabled) ? // Condition simplified
      invoiceData.items.reduce((sum, item) => 
        sum + (item.isTotalOverridden ? (item.total * item.gst / 100) : (item.qty * item.rate * item.gst / 100)), 0) : 0;
    
    const grandTotal = subtotal + gstTotal;

    // Split GST based on saleType
    const cgstTotal = (invoiceData.gstEnabled && invoiceData.saleType === 'Intrastate') ? gstTotal / 2 : 0;
    const sgstTotal = (invoiceData.gstEnabled && invoiceData.saleType === 'Intrastate') ? gstTotal / 2 : 0;
    const igstTotal = (invoiceData.gstEnabled && invoiceData.saleType === 'Interstate') ? gstTotal : 0;
    
    return {
      subtotal,
      gstTotal, // Total GST amount
      cgstTotal,
      sgstTotal,
      igstTotal,
      totalInWords: `Indian Rupee: ${numberToWords(Math.round(grandTotal))} Only`,
      grandTotal
    };
  };

  const totals = calculateTotals();
  
  // Define minimum number of rows for the table
  const minTableRows = 1;
  const numRowsToDisplay = Math.max(minTableRows, invoiceData.items.length);

  // Handle input changes
  const handleInputChange = (e) => {
    const { name, value, type, checked } = e.target;
    if (type === 'checkbox') {
      const { name, checked } = e.target;
      setInvoiceData(prev => {
         const updatedData = {
          ...prev,
          [name]: checked
        };
        
        // If GST is enabled, automatically set invoice type to TAX INVOICE
        if (name === 'gstEnabled' && checked) {
          updatedData.invoiceType = 'TAX INVOICE';
        }
        // If GST is disabled, reset saleType to default
        if (name === 'gstEnabled' && !checked) {
          updatedData.saleType = 'Intrastate';
          updatedData.invoiceType = 'INVOICE'; // Reset invoice type if GST is unchecked
        }
        
        return updatedData;
      });
    } else {
      setInvoiceData(prev => ({
        ...prev,
        [name]: value
      }));
    }
  };

  // Handle invoice type change
  const handleInvoiceTypeChange = (e) => {
    const value = e.target.value;
    setInvoiceData(prev => {
      const updatedData = {
        ...prev,
        invoiceType: value
      };
      
      // If selecting TAX INVOICE, enable GST
      if (value === 'TAX INVOICE') {
        updatedData.gstEnabled = true;
      }
      
      return updatedData;
    });
  };

  // Handle item changes
  const handleItemChange = (id, field, value) => {
    setInvoiceData(prev => {
      const updatedItems = prev.items.map(item => {
        if (item.id === id) {
          const updatedItem = { 
            ...item, 
            [field]: field === 'qty' || field === 'rate' || field === 'total' || field === 'gst' ? 
                     parseFloat(value) || 0 : value 
          };
          
          // If changing qty or rate and total is not overridden, recalculate total
          if ((field === 'qty' || field === 'rate') && !item.isTotalOverridden) {
            updatedItem.total = updatedItem.qty * updatedItem.rate;
          }
          
          // If changing total manually, mark as overridden
          if (field === 'total') {
            updatedItem.isTotalOverridden = true;
          }
          
          return updatedItem;
        }
        return item;
      });
      
      return { ...prev, items: updatedItems };
    });
  };

  // Add new item
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
    setInvoiceData(prev => ({
      ...prev,
      items: [...prev.items, newItem]
    }));
  };

  // Remove item
  const removeItem = (id) => {
    if (invoiceData.items.length > 1) {
      setInvoiceData(prev => ({
        ...prev,
        items: prev.items.filter(item => item.id !== id)
      }));
    }
  };

  // Handle checkbox changes
  const handleCheckboxChange = (field) => {
    setIncludeFields(prev => ({
      ...prev,
      [field]: !prev[field]
    }));
  };

  // Handle file upload for seal (logo upload removed)
  const handleSealUpload = (e) => {
    const file = e.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (e) => {
        setSealPreview(e.target.result);
      };
      reader.readAsDataURL(file);
    }
  };

  // Export to PDF
  const exportToPDF = async () => {
    // Validate that all items have descriptions before saving
    const hasEmptyDescriptions = invoiceData.items.some(item => !item.description || item.description.trim() === '');
    if (hasEmptyDescriptions) {
      alert('Please fill in descriptions for all items before exporting to PDF.');
      return;
    }
    
    // Save invoice to backend before exporting
    if (onInvoiceSave) {
      onInvoiceSave({ ...invoiceData, _id: initialData?._id, createdAt: new Date().toISOString() });
    }
    
    try {
      // Create a new jsPDF instance with A4 size
      const pdf = new jsPDF('p', 'mm', 'a4');
      
      // Set up margins (in mm) - 20-25px uniform margins on all sides
      const marginLeft = 20;
      const marginTop = 20;
      const marginRight = 20;
      const marginBottom = 20;
      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();
      const contentWidth = pageWidth - marginLeft - marginRight;
      
      // Add company logo
      const logoImg = new Image();
      logoImg.src = '/Invoicelogo.png';
      
      // Wait for image to load
      await new Promise((resolve, reject) => {
        logoImg.onload = resolve;
        logoImg.onerror = reject;
      });
      
      // Add logo to the top left
      const logoWidth = 40;
      const logoHeight = 20;
      pdf.addImage(logoImg, 'PNG', marginLeft, marginTop, logoWidth, logoHeight);
      
      // Enhance the divider line under company logo to make it more prominent
      // 15% width in green color (#8cc63f) and 85% width in light gray color with better visibility
      const dividerYPosition = marginTop + logoHeight + 2; // Position below the logo
      const totalWidth = pageWidth - marginLeft - marginRight;
      const greenLineWidth = totalWidth * 0.15;
      const grayLineWidth = totalWidth * 0.85;
      
      // Draw green line (15%) with increased thickness
      pdf.setFillColor(140, 198, 63); // #8cc63f
      pdf.rect(marginLeft, dividerYPosition, greenLineWidth, 0.7, 'F');
      
      // Draw gray line (85%) with increased thickness
      pdf.setFillColor(209, 213, 219); // bg-gray-200 equivalent
      pdf.rect(marginLeft + greenLineWidth, dividerYPosition, grayLineWidth, 0.7, 'F');
      
      // Add header content
      pdf.setFontSize(10);
      pdf.setTextColor(51, 51, 51);
      
      // Company name and invoice type (right aligned)
      pdf.setFont(undefined, 'bold');
      pdf.setFontSize(20);
      pdf.setTextColor(0, 132, 61); // Green color
      const invoiceTypeText = invoiceData.invoiceType;
      const invoiceTypeWidth = pdf.getTextWidth(invoiceTypeText);
      pdf.text(invoiceTypeText, pageWidth - marginRight - invoiceTypeWidth, marginTop + 15);
      
      // Reset color and font
      pdf.setFontSize(10);
      pdf.setTextColor(51, 51, 51);
      pdf.setFont(undefined, 'normal');
      
      // Customer details and invoice info
      let yPosition = marginTop + 30;
      
      // Customer name
      if (includeFields.customerName && invoiceData.customerName) {
        pdf.setFont(undefined, 'bold');
        pdf.text('Invoice to :', marginLeft, yPosition);
        pdf.setFont(undefined, 'normal');
        pdf.text(invoiceData.customerName, marginLeft + 25, yPosition);
        yPosition += 7;
      }
      
      // Invoice number and date (right aligned) - smaller font and proper alignment
      pdf.setFontSize(10); // Reduced font size
      let rightColX = pageWidth - marginRight - 60; // As per specification
      pdf.setFont(undefined, 'bold');
      pdf.text('Invoice No :', rightColX, yPosition);
      pdf.text('Invoice Date :', rightColX, yPosition + 5);
      pdf.setFont(undefined, 'normal');
      // Adjust positioning to ensure values stay within margins
      const invoiceValueX = pageWidth - marginRight - 5; // Position values within right margin
      pdf.text(invoiceData.invoiceNo, invoiceValueX, yPosition, { align: 'right' });
      pdf.text(invoiceData.invoiceDate, invoiceValueX, yPosition + 5, { align: 'right' });
      
      // Sales person
      if (includeFields.salesPerson && invoiceData.salesPerson) {
        yPosition += 10;
        pdf.setFont(undefined, 'bold');
        pdf.text('Sales person :', rightColX, yPosition);
        pdf.setFont(undefined, 'normal');
        pdf.text(invoiceData.salesPerson, invoiceValueX, yPosition, { align: 'right' });
      }
      
      yPosition += 15;
      
      // Reset font size for the rest of the document
      pdf.setFontSize(10);
      
      // Customer contact/address and From section side by side
      if (includeFields.customerContact && invoiceData.customerContact) {
        // Calculate positions for side-by-side layout
        const leftColumnX = marginLeft;
        const rightColumnX = pageWidth / 2; // Start right column at middle of page
        const sectionWidth = (pageWidth - marginLeft - marginRight) / 2 - 10; // Width for each section
        
        // Customer contact/address (left side) - smaller font
        pdf.setFont(undefined, 'bold');
        pdf.setFontSize(10); // Smaller font size
        pdf.text(`${invoiceData.gstEnabled ? 'Address' : 'Contact'} :`, leftColumnX, yPosition);
        pdf.setFont(undefined, 'normal');
        pdf.setFontSize(10); // Even smaller for details
        
        // Split address into lines
        const addressLines = pdf.splitTextToSize(invoiceData.customerContact, sectionWidth);
        pdf.text(addressLines, leftColumnX, yPosition + 5);
        
        // From section (right side) - show for both GST and non-GST invoices if checkbox is enabled
        if (includeFields.consignerDetails) {
          pdf.setFont(undefined, 'bold');
          pdf.setFontSize(10); // Smaller font size
          pdf.text('From:', rightColumnX, yPosition);
          pdf.setFont(undefined, 'normal');
          pdf.setFontSize(10); // Even smaller for details
          
          // From section details with proper line breaking
          const fromDetails = [
            'TECH VASEEGRAH',
            'No.11, VIJAYANAGAR,',
            'REDDIPALAYAM ROAD,', 
            'SRINIVASAPURAM,',
            'THANJAVUR - 613009',
            'Mobile: 7667792779'
          ];
          
          // Add GSTIN only for GST invoices
          if (invoiceData.gstEnabled) {
            fromDetails.push('GSTIN: 33KYGPS1983E1Z1');
          }
          
          // Split each line to ensure it fits within the section width
          let currentY = yPosition + 5;
          fromDetails.forEach((line, index) => {
            const splitLines = pdf.splitTextToSize(line, sectionWidth);
            pdf.text(splitLines, rightColumnX, currentY);
            currentY += splitLines.length * 5; // Adjust Y position based on number of lines
          });
        }
        
        // Update yPosition based on the taller content
        const addressHeight = addressLines.length * 5;
        const fromHeight = includeFields.consignerDetails ? 7 * 5 : 0; // 7 lines for from details
        yPosition += Math.max(addressHeight, fromHeight) + 10;
      } else if (includeFields.consignerDetails) {
        // Only From section (right aligned) - smaller font
        const rightColumnX = pageWidth / 2;
        const sectionWidth = (pageWidth - marginLeft - marginRight) / 2 - 10; // Width for each section
        
        pdf.setFont(undefined, 'bold');
        pdf.setFontSize(10); // Smaller font size
        pdf.text('From:', rightColumnX, yPosition);
        pdf.setFont(undefined, 'normal');
        pdf.setFontSize(10); // Even smaller for details
        
        // From section details with proper line breaking
        const fromDetails = [
          'TECH VASEEGRAH',
          'No.11, VIJAYANAGAR,',
          'REDDIPALAYAM ROAD,', 
          'SRINIVASAPURAM,',
          'THANJAVUR - 613009',
          'Mobile: 7667792779'
        ];
        
        // Add GSTIN only for GST invoices
        if (invoiceData.gstEnabled) {
          fromDetails.push('GSTIN: 33KYGPS1983E1Z1');
        }
        
        // Split each line to ensure it fits within the section width
        let currentY = yPosition + 5;
        fromDetails.forEach((line, index) => {
          const splitLines = pdf.splitTextToSize(line, sectionWidth);
          pdf.text(splitLines, rightColumnX, currentY);
          currentY += splitLines.length * 5; // Adjust Y position based on number of lines
        });
        
        yPosition += fromDetails.length * 5 + 10; // Adjust based on number of lines
      }
      
      // Reset font size for the rest of the document
      pdf.setFontSize(10);
      
      // Prepare table data
      const tableColumn = ['NO', 'DESCRIPTION'];
      if (invoiceData.gstEnabled) {
        tableColumn.push('HSN/SAC', 'GST (%)');
      }
      tableColumn.push('QTY', 'PRICE', 'TOTAL');
      
      const tableRows = invoiceData.items.map((item, index) => {
        const row = [
          (index + 1).toString(),
          item.description
        ];
        
        if (invoiceData.gstEnabled) {
          row.push(item.hsn || '', item.gst.toFixed(2));
        }
        
        row.push(
          item.qty.toString(),
          item.rate.toFixed(2),
          item.total.toFixed(2)
        );
        
        return row;
      });
      
      // Add table with auto pagination - improved for multi-page support
      autoTable(pdf, {
        head: [tableColumn],
        body: tableRows,
        startY: yPosition,
        margin: { left: marginLeft, right: marginRight },
        styles: {
          fontSize: 10,
          cellPadding: 3,
          overflow: 'linebreak'
        },
        headStyles: {
          fillColor: [0, 132, 61], // Green header
          textColor: [255, 255, 255], // White text
          fontStyle: 'bold',
          halign: 'center' // Center align all header cells
        },
        alternateRowStyles: {
          fillColor: [233, 247, 236] // Light green for alternate rows
        },
        columnStyles: {
          0: { cellWidth: 15, halign: 'center' }, // NO
          1: { cellWidth: 'auto', halign: 'left' }, // DESCRIPTION
          ...(invoiceData.gstEnabled ? {
            2: { cellWidth: 25, halign: 'center' }, // HSN/SAC CENTER
            3: { cellWidth: 25, halign: 'center' }  // GST (%) CENTER
          } : {}),
          [invoiceData.gstEnabled ? 4 : 2]: { cellWidth: 20, halign: 'center' }, // QTY CENTER
          [invoiceData.gstEnabled ? 5 : 3]: { cellWidth: 25, halign: 'center' }, // PRICE CENTER
          [invoiceData.gstEnabled ? 6 : 4]: { cellWidth: 30, halign: 'center' }  // TOTAL CENTER
        },
        didParseCell: function(data) {
          // Handle long descriptions by allowing text wrapping
          if (data.section === 'body' && data.column.index === 1) { // DESCRIPTION column
            data.cell.styles.cellWidth = 'auto';
          }
        },
        // Ensure rows are not split across pages
        pageBreak: 'auto',
        rowPageBreak: 'avoid',
        // Repeat header on each page
        showHead: 'everyPage'
      });
      
      // Get final Y position after table
      let finalY = pdf.lastAutoTable.finalY + 10;
      
      // Check if there's enough space for the totals section
      const requiredSpaceForTotals = 60; // Estimate space needed for totals, Total in Words, and Payment details
      
      // If not enough space, move to next page
      if (finalY + requiredSpaceForTotals > pageHeight - marginBottom) {
        pdf.addPage();
        finalY = marginTop + 10; // Reset Y position to top of new page
      }
      
      // Add summary totals
      const summaryStartY = finalY;
      
      // Calculate column positions for consistent alignment
      const labelX = pageWidth - marginRight - 50;
      const valueX = pageWidth - marginRight - 5; // Add extra padding to ensure values stay within margins
      
      // Subtotal with background styling to match web interface
      pdf.setFont(undefined, 'normal');
      // Draw background for subtotal row (white background, black text)
      pdf.setFillColor(255, 255, 255); // White background
      pdf.rect(labelX - 5, summaryStartY - 5, (valueX - labelX) + 10, 7, 'F');
      pdf.text('Sub Total :', labelX, summaryStartY);
      pdf.text(`₹${totals.subtotal.toFixed(2)}`, valueX, summaryStartY, { align: 'right' });
      
      let summaryY = summaryStartY + 7;
      
      // GST totals with background styling
      if (invoiceData.gstEnabled) {
        if (invoiceData.saleType === 'Intrastate') {
          // Draw background for CGST row (white background, black text)
          pdf.setFillColor(255, 255, 255); // White background
          pdf.rect(labelX - 5, summaryY - 5, (valueX - labelX) + 10, 7, 'F');
          pdf.text('CGST Total :', labelX, summaryY);
          pdf.text(`₹${totals.cgstTotal.toFixed(2)}`, valueX, summaryY, { align: 'right' });
          summaryY += 7;
          
          // Draw background for SGST row (white background, black text)
          pdf.setFillColor(255, 255, 255); // White background
          pdf.rect(labelX - 5, summaryY - 5, (valueX - labelX) + 10, 7, 'F');
          pdf.text('SGST Total :', labelX, summaryY);
          pdf.text(`₹${totals.sgstTotal.toFixed(2)}`, valueX, summaryY, { align: 'right' });
          summaryY += 7;
        } else if (invoiceData.saleType === 'Interstate') {
          // Draw background for IGST row (white background, black text)
          pdf.setFillColor(255, 255, 255); // White background
          pdf.rect(labelX - 5, summaryY - 5, (valueX - labelX) + 10, 7, 'F');
          pdf.text('IGST Total :', labelX, summaryY);
          pdf.text(`₹${totals.igstTotal.toFixed(2)}`, valueX, summaryY, { align: 'right' });
          summaryY += 7;
        }
      }
      
      // Grand total with green background styling to match web interface
      pdf.setFont(undefined, 'bold');
      // Draw green background for grand total row
      pdf.setFillColor(0, 132, 61); // #00843d green background
      // Fix the width to ensure it doesn't extend beyond margins
      const maxWidth = pageWidth - marginRight - (labelX - 5);
      const grandTotalWidth = Math.min((valueX - labelX) + 10, maxWidth);
      pdf.rect(labelX - 5, summaryY - 5, grandTotalWidth, 7, 'F');
      pdf.setTextColor(255, 255, 255); // White text
      pdf.text('Grand Total :', labelX, summaryY);
      pdf.text(`₹${totals.grandTotal.toFixed(2)}`, valueX, summaryY, { align: 'right' });
      pdf.setTextColor(51, 51, 51); // Reset to default color
      pdf.setFont(undefined, 'normal');
      
      summaryY += 15; // Increased spacing below totals
      
      // Ensure payment section stays in footer
      // Calculate footer position (fixed at bottom of page)
      const footerY = pageHeight - marginBottom - 35; // 35mm reserved for footer
      
      // Total in words with green background
      pdf.setFont(undefined, 'bold');
      // Draw green background for "Total In Words" header within margins
      const totalInWordsHeaderWidth = pdf.getTextWidth('Total In Words') + 10;
      pdf.setFillColor(0, 132, 61); // Green color
      pdf.rect(marginLeft, footerY - 30, totalInWordsHeaderWidth, 10, 'F');
      pdf.setTextColor(255, 255, 255); // White text
      pdf.text('Total In Words', marginLeft + 5, footerY - 21);
      pdf.setTextColor(51, 51, 51); // Reset to default color
      pdf.setFont(undefined, 'normal');
      
      const totalInWordsLines = pdf.splitTextToSize(totals.totalInWords, contentWidth - 50);
      pdf.text(totalInWordsLines, marginLeft, footerY - 10); // Position below header
      
      // Payment details
      let paymentY = footerY;
      
      if (includeFields.bankDetails) {
        pdf.setFont(undefined, 'bold');
        // Draw green background for "Payment Method:" header within margins
        const paymentMethodHeaderWidth = pdf.getTextWidth('Payment Method:') + 10;
        pdf.setFillColor(0, 132, 61); // Green color
        pdf.rect(marginLeft, paymentY - 9, paymentMethodHeaderWidth, 10, 'F');
        pdf.setTextColor(255, 255, 255); // White text
        pdf.text('Payment Method:', marginLeft + 5, paymentY);
        pdf.setTextColor(51, 51, 51); // Reset to default color
        pdf.setFont(undefined, 'normal');
        
        paymentY += 7;
        pdf.setFontSize(10);
        if (invoiceData.bankName) {
          pdf.text(`Bank Name: ${invoiceData.bankName}`, marginLeft + 10, paymentY);
          paymentY += 5;
        }
        if (invoiceData.accountNumber) {
          pdf.text(`Account Number: ${invoiceData.accountNumber}`, marginLeft + 10, paymentY);
          paymentY += 5;
        }
        if (invoiceData.ifscCode) {
          pdf.text(`IFSC Code: ${invoiceData.ifscCode}`, marginLeft + 10, paymentY);
          paymentY += 5;
        }
        if (invoiceData.upiId) {
          pdf.text(`UPI ID: ${invoiceData.upiId}`, marginLeft + 10, paymentY);
          paymentY += 5;
        }
        pdf.setFontSize(10);
      }
      
      // Add company seal with exact same size and proportions as in the UI (40mm wide, 20mm high)
      // Position the seal aligned with the payment details
      // Use either the uploaded seal or the default stamp.png
      const sealToUse = sealPreview || '/stamp.png';
      if (sealToUse) {
        try {
          const sealImg = new Image();
          sealImg.src = sealToUse;
          // Position the seal on the right side
          const sealWidth = 40;  // 40mm wide to match UI
          const sealHeight = 20; // 20mm high to match UI
          const sealX = pageWidth - marginRight - sealWidth;
          pdf.addImage(sealImg, 'PNG', sealX, footerY - 25, sealWidth, sealHeight);
        } catch (error) {
          console.error('Error adding seal to PDF:', error);
        }
      }
      
      // Thank you message - centered
      pdf.setFont(undefined, 'bold');
      const thankYouText = 'Thank you for business with us!';
      const thankYouWidth = pdf.getTextWidth(thankYouText);
      const thankYouX = (pageWidth - thankYouWidth) / 2;
      pdf.text(thankYouText, thankYouX, footerY + 15);
      
      // Add divider lines below the thank you message
      const dividerY = footerY + 25;
      const dividerTotalWidth = pageWidth - marginLeft - marginRight;
      const thankYouGreenLineWidth = dividerTotalWidth * 0.15;
      const thankYouGrayLineWidth = dividerTotalWidth * 0.85;
      const greenLineX = marginLeft;
      const grayLineX = marginLeft + thankYouGreenLineWidth + (dividerTotalWidth - thankYouGreenLineWidth - thankYouGrayLineWidth) / 2;
      
      // Draw green line (15%)
      pdf.setFillColor(140, 198, 63); // #8cc63f
      pdf.rect(greenLineX, dividerY, thankYouGreenLineWidth, 0.5, 'F');
      
      // Draw gray line (85%)
      pdf.setFillColor(209, 213, 219); // bg-gray-200 equivalent
      pdf.rect(grayLineX, dividerY + 0.5, thankYouGrayLineWidth, 0.2, 'F');
      
      // Add a new page for Terms and Conditions
      pdf.addPage();
      
      // Add divider lines at the top of the Terms and Conditions page (matching first page style)
      const termsDividerYPosition = marginTop + 5; // Position below the top margin
      const termsTotalWidth = pageWidth - marginLeft - marginRight;
      const termsGreenLineWidth = termsTotalWidth * 0.15;
      const termsGrayLineWidth = termsTotalWidth * 0.85;
      
      // Draw green line (15%) with increased thickness
      pdf.setFillColor(140, 198, 63); // #8cc63f
      pdf.rect(marginLeft, termsDividerYPosition, termsGreenLineWidth, 0.7, 'F');
      
      // Draw gray line (85%) with increased thickness
      pdf.setFillColor(209, 213, 219); // bg-gray-200 equivalent
      pdf.rect(marginLeft + termsGreenLineWidth, termsDividerYPosition, termsGrayLineWidth, 0.7, 'F');
      
      // Add title for second page
      pdf.setFontSize(18);
      pdf.setTextColor(0, 132, 61); // Green color
      pdf.setFont(undefined, 'bold');
      pdf.text('TERMS AND CONDITIONS', marginLeft, marginTop + 15);
      
      // Add content with proper formatting and right margin
      pdf.setFontSize(10);
      pdf.setTextColor(51, 51, 51); // Dark gray color
      pdf.setFont(undefined, 'normal');
      
      // Terms and Conditions content
      const termsAndConditions = `TERMS AND CONDITIONS
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
[Your Company Name] or its developers. You may not copy, change, or share any part of the
app without our written permission.

6. PRIVACY POLICY Using the Inventory Management Module PWA means you agree to how
we collect and use your data, including customer information, appointment records, and
business analytics, as explained in our Privacy Policy.

7. SUPPORT HOURS
We provide support for the app from 10:00 AM to 7:00 PM, Monday to Saturday (except
public holidays). Any support requests outside these hours will be handled during the next
support period.`;

      // Split terms into lines and add them to the PDF with proper margins
      const lines = pdf.splitTextToSize(termsAndConditions, contentWidth);
      
      // Add content with proper pagination across multiple pages if needed
      let yPositionTerms = marginTop + 30; // Start below the title
      const lineHeight = 5;
      const maxLinesPerPage = 45; // Approximate number of lines that fit on a page
      
      for (let i = 0; i < lines.length; i++) {
        // Check if we need to add a new page
        if ((i % maxLinesPerPage === 0) && i !== 0) {
          pdf.addPage();
          yPositionTerms = marginTop + 15; // Reset Y position for new page
          pdf.setFontSize(10);
          pdf.setTextColor(51, 51, 51); // Dark gray color
          pdf.setFont(undefined, 'normal');
        }
        
        pdf.text(lines[i], marginLeft, yPositionTerms);
        yPositionTerms += lineHeight;
      }

      // Save the PDF
      pdf.save(`invoice-${invoiceData.invoiceNo}.pdf`);
    } catch (error) {
      console.error('Error generating PDF:', error);
      toast.error('An error occurred while generating the PDF. Please try again.');
    }
  };

  // Print invoice
  const printInvoice = () => {
    // Validate that all items have descriptions before saving
    const hasEmptyDescriptions = invoiceData.items.some(item => !item.description || item.description.trim() === '');
    if (hasEmptyDescriptions) {
      toast.error('Please fill in descriptions for all items before printing.');
      return;
    }
    
    // Save invoice to backend before printing
    if (onInvoiceSave) {
      onInvoiceSave({ ...invoiceData, _id: initialData?._id, createdAt: new Date().toISOString() });
    }
    
    // Clone the invoice content for printing
    const printElement = invoiceRef.current.cloneNode(true);
    
    // Hide checkboxes in the cloned element
    const checkboxes = printElement.querySelectorAll('input[type="checkbox"]');
    checkboxes.forEach(checkbox => {
      checkbox.style.display = 'none';
    });
    
    // Find and hide the GST checkbox container specifically
    // This targets the div containing the GST checkbox and label
    const gstContainer = printElement.querySelector('div.flex.items-center.justify-end.mt-2');
    if (gstContainer) {
      gstContainer.style.display = 'none';
    }
    
    // Process input fields - hide checkboxes and replace inputs with text
    const inputFields = printElement.querySelectorAll('input, textarea');
    inputFields.forEach(input => {
      const fieldName = input.name;
      const fieldValue = input.value;
      
      // Special handling for different field types
      if (fieldName === 'customerName' && (!includeFields.customerName || !fieldValue)) {
        input.style.display = 'none';
      } else if (fieldName === 'customerContact' && (!includeFields.customerContact || !fieldValue)) {
        input.style.display = 'none';
      } else if (input.tagName === 'TEXTAREA' && fieldName === 'customerContact' && fieldValue) {
        // Replace textarea with formatted text (preserving line breaks)
        const div = document.createElement('div');
        div.className = 'address-text';
        div.style.lineHeight = '1.2'; // Match the line height of the "From" section
        div.textContent = fieldValue;
        input.parentNode.replaceChild(div, input);
      } else if (input.type === 'text' || input.type === 'number') {
        // Replace input with its value for display
        if (fieldValue) {
          const textNode = document.createTextNode(fieldValue);
          input.parentNode.replaceChild(textNode, input);
        } else {
          // Hide empty input fields
          input.style.display = 'none';
        }
      }
    });
    
    // Hide dropdowns and replace with static text
    const dropdowns = printElement.querySelectorAll('select');
    dropdowns.forEach(dropdown => {
        if (dropdown.name === 'invoiceType') {
           const textNode = document.createTextNode(invoiceData.invoiceType);
           // Preserve the exact color based on invoice type
           const colorSpan = document.createElement('span');
           colorSpan.textContent = invoiceData.invoiceType;
           colorSpan.style.color = '#00843d'; // Green color for all invoice types
           colorSpan.style.fontSize = '30px'; // Match text-3xl size
           colorSpan.style.fontWeight = 'bold';
           colorSpan.style.textTransform = 'uppercase';
           dropdown.parentNode.replaceChild(colorSpan, dropdown);
        } else if (dropdown.name === 'saleType') {
           if (invoiceData.gstEnabled) {
             const textNode = document.createTextNode(invoiceData.saleType);
             dropdown.parentNode.replaceChild(textNode, dropdown);
           } else {
             dropdown.style.display = 'none';
           }
        }
    });
    
    const printContent = printElement.innerHTML;
    
    // Create a new window for printing with exact styling and larger margins
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
            }
            .invoice-container {
              max-width: 170mm;
              margin: 0 auto;
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
            th.right {
              text-align: right;
            }
            td {
              padding: 3mm;
              border-bottom: 0.5mm solid #d1d5db;
              font-size: 12px;
            }
            tr:nth-child(even) {
              background-color: #e9f7ec;
            }
            .summary {
              display: flex;
              justify-content: space-between;
              margin-bottom: 6mm;
            }
            .total-words {
              width: 50%;
            }
            .total-words-label {
              font-weight: bold;
              margin-bottom: 1mm;
              font-size: 12px;
            }
            .totals {
              width: 33%;
            }
            .totals-table {
              width: 100%;
            }
            .totals-table td {
              padding: 2mm 3mm;
              border-bottom: 0.5mm solid #d1d5db;
            }
            .grand-total {
              background-color: #00843d;
              color: white;
              font-weight: bold;
            }
            .payment-section {
              display: flex;
              justify-content: space-between;
              margin-bottom: 6mm;
            }
            .payment-method {
              width: 50%;
            }
            .payment-label {
              font-weight: bold;
              margin-bottom: 2mm;
              text-transform: uppercase;
              font-size: 12px;
            }
            .payment-details {
              margin-left: 6mm;
              font-size: 12px;
            }
            .payment-details div {
              margin-bottom: 1mm;
            }
            .seal-section {
              width: 50%;
              text-align: center;
            }
            .seal-image {
              height: 35mm;
              margin: 0 auto;
            }
            .seal-label {
              border-top: 1mm solid #9ca3af;
              padding-top: 2mm;
              margin-top: 2mm;
              font-weight: 500;
              color: #374151;
              font-size: 12px;
            }
            .thank-you {
              text-align: center;
              font-weight: bold;
              margin: 6mm 0;
              font-size: 12px;
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
          </style>
        </head>
        <body>
          <div class="invoice-container">
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
                    <div class="from-details">TECH VASEEGRAH</div>
                    <div class="from-details">No.11, VIJAYANAGAR,</div>
                    <div class="from-details">REDDIPALAYAM ROAD, SRINIVASAPURAM,</div>
                    <div class="from-details">THANJAVUR - 613009</div>
                    <div class="from-details">Mobile: 7667792779</div>
                    ${invoiceData.gstEnabled ? '<div class="from-details">GSTIN: 33KYGPS1983E1Z1</div>' : ''}
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
            
            <div class="summary">
              <div class="total-words">
                <div class="total-words-label">Total In Words</div>
                <div>${totals.totalInWords}</div>
              </div>
              <div class="totals">
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
            
            <div class="payment-section">
              <div class="payment-method">
                ${includeFields.bankDetails ? 
                  `<div class="payment-label">Payment Method:</div>
                   <div class="payment-details">
                     ${invoiceData.bankName ? `<div><span style="font-weight: 500;">Bank Name:</span> ${invoiceData.bankName}</div>` : ''}
                     ${invoiceData.accountNumber ? `<div><span style="font-weight: 500;">Account Number:</span> ${invoiceData.accountNumber}</div>` : ''}
                     ${invoiceData.ifscCode ? `<div><span style="font-weight: 500;">IFSC Code:</span> ${invoiceData.ifscCode}</div>` : ''}
                     ${invoiceData.upiId ? `<div><span style="font-weight: 500;">UPI ID:</span> ${invoiceData.upiId}</div>` : ''}
                   </div>` : ''}
              </div>
              <div class="seal-section">
                ${sealPreview ? 
                  `<img src="${sealPreview}" alt="Company Seal" class="seal-image" />
                   <div class="seal-label">Company Seal</div>` : 
                  `<div style="height: 35mm;"></div>
                   <div class="seal-label">Company Seal</div>`}
                <div class="thank-you">Thank you for business with us!</div>
              </div>
            </div>
            
            <div class="bottom-divider">
              <div class="bottom-divider-green"></div>
              <div class="bottom-divider-gray"></div>
            </div>
          </div>
        </body>
      </html>
    `);
    
    printWindow.document.close();
    printWindow.focus();
    
    // Wait for fonts to load before printing
    setTimeout(() => {
      printWindow.print();
      printWindow.close();
    }, 500);
  };

  // Get the display title based on invoice type and GST status
  const getDisplayTitle = () => {
    if (invoiceData.gstEnabled) {
      return 'TAX INVOICE';
    }
    return invoiceData.invoiceType;
  };

  return (
    <div className="max-w-6xl mx-auto p-4 bg-white font-sans">
      <div className="mb-6 flex justify-between items-center">
        <h1 className="text-xl font-bold text-gray-800">
          {initialData ? 'Edit Invoice' : 'Worker Invoice'}
        </h1>
        <div className="space-x-2 invoice-action-buttons">
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
          {/* Header */}
          <div className="flex justify-between items-start mb-4">
            <div className="flex items-start">
              {/* Fixed logo from public folder */}
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

          {/* Divider from image */}
          <div className="flex w-full h-1 mb-6">
            <div className="w-[15%]" style={{ backgroundColor: '#8cc63f' }}></div>
            <div className="w-[85%] h-[2px] bg-gray-200 self-center"></div>
          </div>

          {/* Customer Details & Invoice Details */}
          <div className="flex justify-between mb-8 text-sm">
            {/* Left Side: Customer */}
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
            {/* Right Side: Invoice Info */}
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
              
              {/* --- GST METHOD CONTROLS --- */}
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
              {/* --- END GST METHOD CONTROLS --- */}
              
              {/* Sales Person - Moved below GST checkbox */}
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
          
          {/* Address and From sections in a single row with perfect horizontal alignment */}
          <div className="flex justify-between mb-8">
            {/* Left Side: Customer Address */}
            <div className="w-1/2 pr-4">
              <div className="flex items-start">
                <input
                  type="checkbox"
                  checked={includeFields.customerContact}
                  onChange={() => handleCheckboxChange('customerContact')}
                  className="mr-2 h-4 w-4 text-green-600 rounded mt-1"
                />
                <label className="font-bold text-gray-700 mr-2">
                  {invoiceData.gstEnabled ? 'Address :' : 'Contact :'}
                </label>
              </div>
              <div className="ml-6">
                <textarea
                  name="customerContact"
                  value={invoiceData.customerContact}
                  onChange={handleInputChange}
                  placeholder={invoiceData.gstEnabled ? "Enter full address" : "Contact details"}
                  className="w-full px-1 py-0.5 border-b border-gray-300 focus:outline-none focus:border-green-500 text-sm font-normal resize-none"
                  rows="3"
                />
              </div>
            </div>

            {/* Right Side: From (Consigner Details) */}
            <div className="w-1/2 pl-4">
              <div className="flex items-center justify-end mb-1">
                <input
                  type="checkbox"
                  checked={includeFields.consignerDetails}
                  onChange={() => handleCheckboxChange('consignerDetails')}
                  className="mr-2 h-4 w-4 text-green-600 rounded"
                />
                <label className="font-bold text-gray-700 mr-2">From :</label>
              </div>
              <div className="ml-6 text-right">
                <p className="text-sm font-medium text-gray-800">TECH VASEEGRAH</p>
                <p className="text-sm text-gray-600">No.11, VIJAYANAGAR,</p>
                <p className="text-sm text-gray-600">REDDIPALAYAM ROAD,</p>
                <p className="text-sm text-gray-600">SRINIVASAPURAM,</p>
                <p className="text-sm text-gray-600">THANJAVUR - 613009</p>
                <p className="text-sm text-gray-600">Mobile: 7667792779</p>
                {invoiceData.gstEnabled && (
                  <>
                    <div className="flex items-center justify-end mt-1">
                      <input
                        type="checkbox"
                        checked={includeFields.customerGst}
                        onChange={() => handleCheckboxChange('customerGst')}
                        className="mr-2 h-4 w-4 text-green-600 rounded"
                      />
                      <label className="text-sm font-bold text-gray-700 mr-2">GSTIN:</label>
                      <input
                        type="text"
                        name="customerGst"
                        value={invoiceData.customerGst}
                        onChange={handleInputChange}
                        placeholder="GST Number"
                        className="px-1 py-0.5 border-b border-gray-300 focus:outline-none focus:border-green-500 text-sm font-normal text-right"
                      />
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
          
          {/* Invoice Details */}
          <div className="flex justify-between mb-8">
            <div className="w-1/2 pr-4">
              <div className="flex items-center">
                <input
                  type="checkbox"
                  checked={includeFields.invoiceNumber}
                  onChange={() => handleCheckboxChange('invoiceNumber')}
                  className="mr-2 h-4 w-4 text-green-600 rounded"
                />
                <label className="font-bold text-gray-700 mr-2">Invoice No.:</label>
              </div>
              <div className="ml-6">
                <input
                  type="text"
                  name="invoiceNumber"
                  value={invoiceData.invoiceNumber}
                  onChange={handleInputChange}
                  placeholder="Enter Invoice Number"
                  className="w-full px-1 py-0.5 border-b border-gray-300 focus:outline-none focus:border-green-500 text-sm font-normal"
                />
              </div>
            </div>
            <div className="w-1/2 pl-4">
              <div className="flex items-center justify-end">
                <input
                  type="checkbox"
                  checked={includeFields.invoiceDate}
                  onChange={() => handleCheckboxChange('invoiceDate')}
                  className="mr-2 h-4 w-4 text-green-600 rounded"
                />
                <label className="font-bold text-gray-700 mr-2">Invoice Date:</label>
              </div>
              <div className="ml-6 text-right">
                <input
                  type="date"
                  name="invoiceDate"
                  value={invoiceData.invoiceDate}
                  onChange={handleInputChange}
                  className="w-full px-1 py-0.5 border-b border-gray-300 focus:outline-none focus:border-green-500 text-sm font-normal"
                />
              </div>
            </div>
          </div>
          
          {/* Items Table */}
          <div className="mb-8">
            <div className="flex items-center justify-between mb-2">
              <input
                type="checkbox"
                checked={includeFields.itemsTable}
                onChange={() => handleCheckboxChange('itemsTable')}
                className="mr-2 h-4 w-4 text-green-600 rounded"
              />
              <label className="font-bold text-gray-700 mr-2">Items:</label>
            </div>
            <table className="w-full border-collapse">
              <thead>
                <tr>
                  <th className="border-b border-gray-300 px-2 py-1 text-left">Description</th>
                  <th className="border-b border-gray-300 px-2 py-1 text-right">Quantity</th>
                  <th className="border-b border-gray-300 px-2 py-1 text-right">Rate</th>
                  <th className="border-b border-gray-300 px-2 py-1 text-right">Amount</th>
                </tr>
              </thead>
              <tbody>
                {invoiceData.items.map((item, index) => (
                  <tr key={index}>
                    <td className="border-b border-gray-300 px-2 py-1 text-left">
                      <input
                        type="text"
                        name={`items[${index}].description`}
                        value={item.description}
                        onChange={handleInputChange}
                        placeholder="Description"
                        className="w-full px-1 py-0.5 border-b border-gray-300 focus:outline-none focus:border-green-500 text-sm font-normal"
                      />
                    </td>
                    <td className="border-b border-gray-300 px-2 py-1 text-right">
                      <input
                        type="number"
                        name={`items[${index}].quantity`}
                        value={item.quantity}
                        onChange={handleInputChange}
                        placeholder="Quantity"
                        className="w-full px-1 py-0.5 border-b border-gray-300 focus:outline-none focus:border-green-500 text-sm font-normal"
                      />
                    </td>
                    <td className="border-b border-gray-300 px-2 py-1 text-right">
                      <input
                        type="number"
                        name={`items[${index}].rate`}
                        value={item.rate}
                        onChange={handleInputChange}
                        placeholder="Rate"
                        className="w-full px-1 py-0.5 border-b border-gray-300 focus:outline-none focus:border-green-500 text-sm font-normal"
                      />
                    </td>
                    <td className="border-b border-gray-300 px-2 py-1 text-right">
                      <input
                        type="number"
                        name={`items[${index}].amount`}
                        value={item.amount}
                        onChange={handleInputChange}
                        placeholder="Amount"
                        className="w-full px-1 py-0.5 border-b border-gray-300 focus:outline-none focus:border-green-500 text-sm font-normal"
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          
          {/* Total Amount */}
          <div className="flex justify-between mb-8">
            <div className="w-1/2 pr-4">
              <div className="flex items-center">
                <input
                  type="checkbox"
                  checked={includeFields.totalAmount}
                  onChange={() => handleCheckboxChange('totalAmount')}
                  className="mr-2 h-4 w-4 text-green-600 rounded"
                />
                <label className="font-bold text-gray-700 mr-2">Total Amount:</label>
              </div>
              <div className="ml-6">
                <input
                  type="number"
                  name="totalAmount"
                  value={invoiceData.totalAmount}
                  onChange={handleInputChange}
                  placeholder="Enter Total Amount"
                  className="w-full px-1 py-0.5 border-b border-gray-300 focus:outline-none focus:border-green-500 text-sm font-normal"
                />
              </div>
            </div>
            <div className="w-1/2 pl-4">
              <div className="flex items-center justify-end">
                <input
                  type="checkbox"
                  checked={includeFields.totalWords}
                  onChange={() => handleCheckboxChange('totalWords')}
                  className="mr-2 h-4 w-4 text-green-600 rounded"
                />
                <label className="font-bold text-gray-700 mr-2">Total in Words:</label>
              </div>
              <div className="ml-6 text-right">
                <input
                  type="text"
                  name="totalWords"
                  value={invoiceData.totalWords}
                  onChange={handleInputChange}
                  placeholder="Enter Total in Words"
                  className="w-full px-1 py-0.5 border-b border-gray-300 focus:outline-none focus:border-green-500 text-sm font-normal"
                />
              </div>
            </div>
          </div>
          
          {/* Terms and Conditions */}
          <div className="mb-8">
            <div className="flex items-center justify-between mb-2">
              <input
                type="checkbox"
                checked={includeFields.termsAndConditions}
                onChange={() => handleCheckboxChange('termsAndConditions')}
                className="mr-2 h-4 w-4 text-green-600 rounded"
              />
              <label className="font-bold text-gray-700 mr-2">Terms & Conditions:</label>
            </div>
            <textarea
              name="termsAndConditions"
              value={invoiceData.termsAndConditions}
              onChange={handleInputChange}
              placeholder="Enter Terms & Conditions"
              className="w-full px-1 py-0.5 border-b border-gray-300 focus:outline-none focus:border-green-500 text-sm font-normal resize-none"
              rows="3"
            />
          </div>
          
          {/* Bank Details */}
          <div className="mb-8">
            <div className="flex items-center justify-between mb-2">
              <input
                type="checkbox"
                checked={includeFields.bankDetails}
                onChange={() => handleCheckboxChange('bankDetails')}
                className="mr-2 h-4 w-4 text-green-600 rounded"
              />
              <label className="font-bold text-gray-700 mr-2">Bank Details:</label>
            </div>
            <textarea
              name="bankDetails"
              value={invoiceData.bankDetails}
              onChange={handleInputChange}
              placeholder="Enter Bank Details"
              className="w-full px-1 py-0.5 border-b border-gray-300 focus:outline-none focus:border-green-500 text-sm font-normal resize-none"
              rows="3"
            />
          </div>
          
          {/* Signature */}
          <div className="mb-8">
            <div className="flex items-center justify-between mb-2">
              <input
                type="checkbox"
                checked={includeFields.signature}
                onChange={() => handleCheckboxChange('signature')}
                className="mr-2 h-4 w-4 text-green-600 rounded"
              />
              <label className="font-bold text-gray-700 mr-2">Signature:</label>
            </div>
            <div className="ml-6">
              <input
                type="text"
                name="signature"
                value={invoiceData.signature}
                onChange={handleInputChange}
                placeholder="Enter Signature"
                className="w-full px-1 py-0.5 border-b border-gray-300 focus:outline-none focus:border-green-500 text-sm font-normal"
              />
            </div>
          </div>
          
          {/* Footer */}
          <div className="mb-8">
            <div className="flex items-center justify-between mb-2">
              <input
                type="checkbox"
                checked={includeFields.footer}
                onChange={() => handleCheckboxChange('footer')}
                className="mr-2 h-4 w-4 text-green-600 rounded"
              />
              <label className="font-bold text-gray-700 mr-2">Footer:</label>
            </div>
            <div className="ml-6">
              <textarea
                name="footer"
                value={invoiceData.footer}
                onChange={handleInputChange}
                placeholder="Enter Footer Details"
                className="w-full px-1 py-0.5 border-b border-gray-300 focus:outline-none focus:border-green-500 text-sm font-normal resize-none"
                rows="2"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Table Header */}
          <div className="mb-2">
            <table className="w-full border-collapse">
              <thead>
                <tr className="bg-gray-100">
                  <th className="border border-gray-300 px-3 py-2 text-left text-sm font-semibold text-gray-700 w-10">S.No</th>
                  <th className="border border-gray-300 px-3 py-2 text-left text-sm font-semibold text-gray-700">Description of Goods</th>
                  {invoiceData.gstEnabled && (
                    <>
                      <th className="border border-gray-300 px-3 py-2 text-right text-sm font-semibold text-gray-700 w-20">HSN/SAC</th>
                      <th className="border border-gray-300 px-3 py-2 text-right text-sm font-semibold text-gray-700 w-16">GST%</th>
                    </>
                  )}
                  <th className="border border-gray-300 px-3 py-2 text-right text-sm font-semibold text-gray-700 w-16">QTY</th>
                  <th className="border border-gray-300 px-3 py-2 text-right text-sm font-semibold text-gray-700 w-20">RATE</th>
                  <th className="border border-gray-300 px-3 py-2 text-right text-sm font-semibold text-gray-700 w-24">TOTAL</th>
                </tr>
              </thead>
              <tbody>
                {/* Render table rows based on items or minimum rows */}
                {Array.from({ length: numRowsToDisplay }).map((_, index) => {
                  const item = invoiceData.items[index] || { 
                    id: index + 1, 
                    description: '', 
                    hsn: '', 
                    gst: 0, 
                    qty: 1, 
                    rate: 0, 
                    total: 0, 
                    isTotalOverridden: false 
                  };
                  
                  return (
                    <tr key={item.id} className={`${index % 2 === 0 ? 'bg-white' : 'bg-green-50'}`}>
                      <td className="border border-gray-300 px-3 py-2 text-sm text-gray-700 w-10">{index + 1}</td>
                      <td className="border border-gray-300 px-3 py-2 text-sm text-gray-700">
                        <input
                          type="text"
                          value={item.description}
                          onChange={(e) => handleItemChange(item.id, 'description', e.target.value)}
                          placeholder="Item description"
                          className="w-full px-1 py-0.5 border-b border-gray-300 focus:outline-none focus:border-green-500 text-sm font-normal"
                        />
                      </td>
                      {invoiceData.gstEnabled && (
                        <>
                          <td className="border border-gray-300 px-3 py-2 text-sm text-gray-700 text-right w-20">
                            <input
                              type="text"
                              value={item.hsn}
                              onChange={(e) => handleItemChange(item.id, 'hsn', e.target.value)}
                              placeholder="HSN/SAC"
                              className="w-full px-1 py-0.5 border-b border-gray-300 focus:outline-none focus:border-green-500 text-sm font-normal text-right"
                            />
                          </td>
                          <td className="border border-gray-300 px-3 py-2 text-sm text-gray-700 text-right w-16">
                            <input
                              type="number"
                              value={item.gst}
                              onChange={(e) => handleItemChange(item.id, 'gst', e.target.value)}
                              placeholder="GST %"
                              className="w-full px-1 py-0.5 border-b border-gray-300 focus:outline-none focus:border-green-500 text-sm font-normal text-right"
                              step="0.01"
                            />
                          </td>
                        </>
                      )}
                      <td className="border border-gray-300 px-3 py-2 text-sm text-gray-700 text-right w-16">
                        <input
                          type="number"
                          value={item.qty}
                          onChange={(e) => handleItemChange(item.id, 'qty', e.target.value)}
                          placeholder="Qty"
                          className="w-full px-1 py-0.5 border-b border-gray-300 focus:outline-none focus:border-green-500 text-sm font-normal text-right"
                          step="1"
                        />
                      </td>
                      <td className="border border-gray-300 px-3 py-2 text-sm text-gray-700 text-right w-20">
                        <input
                          type="number"
                          value={item.rate}
                          onChange={(e) => handleItemChange(item.id, 'rate', e.target.value)}
                          placeholder="Rate"
                          className="w-full px-1 py-0.5 border-b border-gray-300 focus:outline-none focus:border-green-500 text-sm font-normal text-right"
                          step="0.01"
                        />
                      </td>
                      <td className="border border-gray-300 px-3 py-2 text-sm text-gray-700 text-right w-24">
                        <input
                          type="number"
                          value={item.total}
                          onChange={(e) => handleItemChange(item.id, 'total', e.target.value)}
                          placeholder="Total"
                          className="w-full px-1 py-0.5 border-b border-gray-300 focus:outline-none focus:border-green-500 text-sm font-normal text-right"
                          step="0.01"
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Add Item Button */}
          <div className="mb-6">
            <button 
              onClick={addItem}
              className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-md transition duration-300 text-sm"
            >
              Add Item
            </button>
          </div>

          {/* Terms & Total Section */}
          <div className="flex justify-between mb-6">
            {/* Left Side: Terms & Conditions */}
            <div className="w-1/2 pr-4">
              <div className="flex items-center mb-2">
                <input
                  type="checkbox"
                  checked={includeFields.terms}
                  onChange={() => handleCheckboxChange('terms')}
                  className="mr-2 h-4 w-4 text-green-600 rounded"
                />
                <h3 className="font-bold text-sm text-gray-700 uppercase">Terms & Conditions:</h3>
              </div>
              <textarea
                name="terms"
                value={invoiceData.terms}
                onChange={handleInputChange}
                placeholder="Enter terms and conditions"
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-green-500 text-sm h-24 resize-none"
              />
              
              {/* Due Date */}
              <div className="flex items-center mt-3">
                <input
                  type="checkbox"
                  checked={includeFields.dueDate}
                  onChange={() => handleCheckboxChange('dueDate')}
                  className="mr-2 h-4 w-4 text-green-600 rounded"
                />
                <label className="font-bold text-sm text-gray-700 mr-2">Due Date:</label>
                <input
                  type="text"
                  name="dueDate"
                  value={invoiceData.dueDate}
                  onChange={handleInputChange}
                  placeholder="Due Date"
                  className="px-2 py-1 border-b border-gray-300 focus:outline-none focus:border-green-500 text-sm font-normal"
                />
              </div>
              
              {/* Total in Words */}
              <div className="mt-3">
                <p className="text-sm font-medium text-gray-700 italic">{totals.totalInWords}</p>
              </div>
            </div>

            {/* Right Side: Totals */}
            <div className="w-1/2 pl-4">
              <table className="w-full border-collapse">
                <tbody>
                  <tr className="border-b border-gray-300">
                    <td className="py-2 px-3 text-sm text-right text-gray-700">Sub Total :</td>
                    <td className="py-2 px-3 text-sm font-medium text-right text-gray-800">₹{totals.subtotal.toFixed(2)}</td>
                  </tr>
                  
                  {/* --- GST TOTALS --- */}
                  {invoiceData.gstEnabled && (
                    <>
                      <tr className="border-b border-gray-300">
                        <td className="py-2 px-3 text-sm text-right text-gray-700">GST Total :</td>
                        <td className="py-2 px-3 text-sm font-medium text-right text-gray-800">₹{totals.gstTotal.toFixed(2)}</td>
                      </tr>
                      {invoiceData.saleType === 'Intrastate' && (
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
                      {invoiceData.saleType === 'Interstate' && (
                        <tr className="border-b border-gray-300">
                          <td className="py-2 px-3 text-sm text-right text-gray-700">IGST Total :</td>
                          <td className="py-2 px-3 text-sm font-medium text-right text-gray-800">₹{totals.igstTotal.toFixed(2)}</td>
                        </tr>
                      )}
                    </>
                  )}
                  {/* --- END GST TOTALS --- */}

                  <tr style={{ backgroundColor: '#00843d' }}>
                    <td className="py-2 px-3 font-bold text-sm text-right text-white uppercase">Grand Total :</td>
                    <td className="py-2 px-3 font-bold text-sm text-right text-white">₹{totals.grandTotal.toFixed(2)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {/* Payment Details & Footer */}
          <div className="mb-6 flex justify-between items-start">
            {/* Left Side: Payment & Thank you */}
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
                      className="ml-2 px-1 py-0.5 border-b border-gray-300 focus:outline-none focus:border-green-500 text-sm font-normal"
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
                      className="ml-2 px-1 py-0.5 border-b border-gray-300 focus:outline-none focus:border-green-500 text-sm font-normal"
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
                      className="ml-2 px-1 py-0.5 border-b border-gray-300 focus:outline-none focus:border-green-500 text-sm font-normal"
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
                      className="ml-2 px-1 py-0.5 border-b border-gray-300 focus:outline-none focus:border-green-500 text-sm font-normal"
                    />
                  </p>
                </div>
              </div>
            </div>

            {/* Right Side: Seal */}
            <div className="text-center">
              {/* Show either the uploaded seal or the default stamp.png */}
              <img 
                src={sealPreview || '/stamp.png'} 
                alt="Company Seal" 
                className="h-20 mx-auto" 
                onError={(e) => {
                  // If stamp.png doesn't exist, show placeholder
                  e.target.src = '/placeholder-seal.png';
                }}
              />
              <div className="border-t border-gray-400 pt-2 mt-2">
                <p className="text-gray-700 text-sm font-medium">Company Seal</p>
              </div>
              <p className="text-gray-700 font-bold text-sm mt-6 text-center">Thank you for business with us!</p>
            </div>
          </div>


          {/* Bottom green dividers - centered to match PDF (15% green, 85% gray) */}
          <div className="flex justify-center mt-8">
            <div className="w-3/12 border-b-2" style={{ borderColor: '#8cc63f' }}></div>
            <div className="w-9/12 border-b-2" style={{ borderColor: '#d1d5db' }}></div>
          </div>
        </div>
  );
};

export default WorkerInvoice;