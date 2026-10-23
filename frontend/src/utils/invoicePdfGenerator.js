import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import QRCode from 'qrcode';

// Convert number to words in Indian numbering system
export const numberToWords = (num) => {
  const ones = [
    '', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine',
    'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen',
    'Seventeen', 'Eighteen', 'Nineteen'
  ];
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

// Calculate Subtotal, Tax/GST breakdowns, and Grand Total
export const calculateInvoiceTotals = (invoiceData = {}) => {
  const items = invoiceData.items || [];
  const gstEnabled = invoiceData.gstEnabled !== false; // default true
  const saleType = invoiceData.saleType || 'Intrastate';

  const subtotal = items.reduce((sum, item) => {
    if (item.isTotalOverridden) return sum + Number(item.total || 0);
    return sum + (Number(item.qty || 0) * Number(item.rate || 0));
  }, 0);

  const gstTotal = gstEnabled
    ? items.reduce((sum, item) => {
        const itemSub = item.isTotalOverridden
          ? Number(item.total || 0)
          : (Number(item.qty || 0) * Number(item.rate || 0));
        return sum + (itemSub * Number(item.gst || 0) / 100);
      }, 0)
    : 0;

  const grandTotal = subtotal + gstTotal;
  const cgstTotal = (gstEnabled && saleType === 'Intrastate') ? gstTotal / 2 : 0;
  const sgstTotal = (gstEnabled && saleType === 'Intrastate') ? gstTotal / 2 : 0;
  const igstTotal = (gstEnabled && saleType === 'Interstate') ? gstTotal : 0;

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

// In-memory cache for static assets (logo, stamp) to avoid redundant network fetch and FileReader conversion
const imageCache = new Map();

// Helper: load an image as Data URL and optionally downscale large raster images for fast PDF compression
const loadImageAsDataUrl = async (url, maxDimension = 650) => {
  if (!url) return null;
  const cacheKey = `${url}_${maxDimension}`;
  if (imageCache.has(cacheKey)) return imageCache.get(cacheKey);

  try {
    let rawDataUrl = url;
    if (!url.startsWith('data:')) {
      const res = await fetch(url);
      if (!res.ok) return null;
      const blob = await res.blob();
      rawDataUrl = await new Promise((resolve) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result);
        reader.readAsDataURL(blob);
      });
    }

    if (!rawDataUrl) return null;

    let optimizedDataUrl = rawDataUrl;
    if (typeof window !== 'undefined' && typeof document !== 'undefined') {
      optimizedDataUrl = await new Promise((resolve) => {
        const img = new Image();
        img.onload = () => {
          let { naturalWidth: width, naturalHeight: height } = img;
          if (!width || !height || (width <= maxDimension && height <= maxDimension)) {
            return resolve(rawDataUrl);
          }
          if (width > height) {
            if (width > maxDimension) {
              height = Math.round((height * maxDimension) / width);
              width = maxDimension;
            }
          } else {
            if (height > maxDimension) {
              width = Math.round((width * maxDimension) / height);
              height = maxDimension;
            }
          }
          try {
            const canvas = document.createElement('canvas');
            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext('2d');
            if (!ctx) return resolve(rawDataUrl);
            ctx.drawImage(img, 0, 0, width, height);
            const downscaled = canvas.toDataURL('image/png');
            resolve(downscaled || rawDataUrl);
          } catch (err) {
            resolve(rawDataUrl);
          }
        };
        img.onerror = () => resolve(rawDataUrl);
        img.src = rawDataUrl;
      });
    }

    imageCache.set(cacheKey, optimizedDataUrl);
    return optimizedDataUrl;
  } catch (err) {
    return null;
  }
};

/**
 * Generate PDF Document using jsPDF + autoTable matching the company layout
 * @param {Object} invoiceData The invoice data object
 * @param {Object} options Optional settings: sealUrl, upiQrCodeUrl, totals
 * @returns {Promise<jsPDF>}
 */
export const generateInvoicePdfDoc = async (invoiceData = {}, options = {}) => {
  const pdf = new jsPDF({
    orientation: 'p',
    unit: 'mm',
    format: 'a4',
    compress: true
  });
  const marginLeft = 15;
  const marginTop = 12;
  const marginRight = 15;
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();

  const formattedDate = new Date().toLocaleDateString('en-IN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric'
  });

  const totals = options.totals || calculateInvoiceTotals(invoiceData);

  // Top Header: Logo
  try {
    const logoPath = `${window.location.origin}/Invoicelogo.png`;
    const logoData = await loadImageAsDataUrl(logoPath, 650);
    if (logoData) {
      const logoProps = pdf.getImageProperties(logoData);
      const fixedLogoWidth = 55;
      const fixedLogoHeight = (logoProps.height / logoProps.width) * fixedLogoWidth;
      pdf.addImage(logoData, "PNG", marginLeft, marginTop, fixedLogoWidth, fixedLogoHeight, undefined, 'FAST');
    } else {
      throw new Error("Logo load skipped");
    }
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

  const yPos = marginTop + 26;

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

  const addrY = Math.max(currentC1Y + 1, yPos + 14);
  drawPinBadge(col1X, addrY);
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(8.5);
  pdf.setTextColor(11, 102, 59);
  pdf.text("ADDRESS", col1X + 6.2, addrY);

  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(8);
  pdf.setTextColor(55, 65, 81);
  const addrLines = pdf.splitTextToSize(invoiceData.customerAddress || 'Customer full address', 52);
  pdf.text(addrLines, col1X, addrY + 4.5);

  // Column 2: INVOICE DETAILS
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

  // Column 3: FROM Details
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

  // Phone
  drawPhoneIcon(col3X, fromCurrY);
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(7.8);
  pdf.setTextColor(55, 65, 81);
  pdf.text(invoiceData.fromSection?.mobile || '9047484484', col3X + 3.8, fromCurrY);
  fromCurrY += 4.4;

  // Email
  drawEmailIcon(col3X, fromCurrY);
  pdf.text(invoiceData.fromSection?.email || 'techvaseegrah@gmail.com', col3X + 3.8, fromCurrY);
  fromCurrY += 4.4;

  // GSTIN
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
  const items = invoiceData.items && invoiceData.items.length > 0 ? invoiceData.items : [{ description: 'General Services', qty: 1, rate: 0, total: 0, gst: 18 }];
  const tableRows = items.map((item, idx) => [
    (idx + 1).toString(),
    item.description || 'Item or service description',
    item.hsn || '',
    Number(item.gst || 0).toFixed(2),
    item.qty ? item.qty.toString() : '1',
    Number(item.rate || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 }),
    Number(item.total || (item.qty * item.rate) || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })
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

  const currentY = pdf.lastAutoTable.finalY + 5;

  // Totals & Amount In Words Section
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

  // Right Totals Container
  const totalsRightX = pageWidth - marginRight;
  const boxWidth = 80;
  const boxLeft = totalsRightX - boxWidth;
  const colonX = totalsRightX - 31;
  const valueEndX = totalsRightX - 4;

  const gstRowsCount = invoiceData.gstEnabled !== false ? (invoiceData.saleType === 'Intrastate' ? 2 : 1) : 0;
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
  if (invoiceData.gstEnabled !== false) {
    if (invoiceData.saleType === 'Intrastate' || !invoiceData.saleType) {
      printTotRow(`CGST (${totals.halfGst}%)`, totals.cgstTotal.toFixed(2));
      printTotRow(`SGST (${totals.halfGst}%)`, totals.sgstTotal.toFixed(2));
    } else {
      printTotRow(`IGST (${totals.fullGst}%)`, totals.igstTotal.toFixed(2));
    }
  }
  totY += 1.5;
  printTotRow("GRAND TOTAL", totals.grandTotal.toFixed(2), true);

  // Section Positioning
  const totalsBottomY = currentY + cardHeight;
  const targetFooterY = pageHeight - 21;

  let payStartY;
  if (totalsBottomY + 85 <= targetFooterY) {
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
    pdf.circle(cx, cy - 0.2, 1.8, 'S');
    pdf.setFillColor(255, 255, 255);
    pdf.rect(cx - 2.5, cy - 0.2, 5.0, 2.5, 'F');
    pdf.setFillColor(11, 102, 59);
    pdf.roundedRect(cx - 2.0, cy - 0.8, 0.9, 1.8, 0.3, 0.3, 'F');
    pdf.roundedRect(cx + 1.1, cy - 0.8, 0.9, 1.8, 0.3, 0.3, 'F');
    pdf.setLineWidth(0.3);
    pdf.line(cx + 1.1, cy + 0.6, cx + 0.3, cy + 1.2);
    pdf.circle(cx + 0.2, cy + 1.2, 0.25, 'F');
  };

  const qrColX = marginLeft + 68;
  const bulletsDividerX = marginLeft + 114;
  const bulletsX = marginLeft + 121;

  pdf.setDrawColor(229, 231, 235);
  pdf.setLineWidth(0.3);
  pdf.line(qrColX - 3, paymentY - 2, qrColX - 3, paymentY + 36);
  pdf.line(bulletsDividerX, paymentY - 2, bulletsDividerX, paymentY + 36);

  // Column 1: Payment Method
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

  // Column 2: QR Code
  const qrCenter = qrColX + 20;
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(8.5);
  pdf.setTextColor(11, 102, 59);
  pdf.text("SCAN & PAY", qrCenter, paymentY, { align: 'center' });

  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(6.8);
  pdf.setTextColor(107, 114, 128);
  pdf.text("UPI / ICICI / Any UPI App", qrCenter, paymentY + 3.8, { align: 'center' });

  const qrBoxSize = 25;
  const qrBoxX = qrCenter - (qrBoxSize / 2);
  const qrBoxY = paymentY + 5.5;
  pdf.setFillColor(255, 255, 255);
  pdf.setDrawColor(16, 185, 129);
  pdf.setLineWidth(0.5);
  pdf.roundedRect(qrBoxX, qrBoxY, qrBoxSize, qrBoxSize, 1.8, 1.8, 'FD');

  let upiQrUrl = options.upiQrCodeUrl;
  if (!upiQrUrl) {
    try {
      const companyName = invoiceData.accountName || invoiceData.fromSection?.company || 'TECH VASEEGRAH';
      const amount = totals.grandTotal ? Number(totals.grandTotal).toFixed(2) : '0.00';
      const note = `Invoice ${invoiceData.invoiceNo || ''}`;
      const upiString = `upi://pay?pa=${encodeURIComponent(displayUpiId)}&pn=${encodeURIComponent(companyName)}&am=${amount}&cu=INR&tn=${encodeURIComponent(note)}`;
      upiQrUrl = await QRCode.toDataURL(upiString, {
        margin: 1,
        width: 140,
        color: { dark: '#000000', light: '#ffffff' }
      });
    } catch (e) {
      console.warn("QR code generation error:", e);
    }
  }

  if (upiQrUrl) {
    try {
      pdf.addImage(upiQrUrl, "PNG", qrBoxX + 1.2, qrBoxY + 1.2, qrBoxSize - 2.4, qrBoxSize - 2.4, undefined, 'FAST');
    } catch (e) {
      console.error("QR Code add error:", e);
    }
  }

  const upiIdLabel = `UPI ID: ${displayUpiId}`;
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(7.8);
  const upiTextW = pdf.getTextWidth(upiIdLabel);

  pdf.setFillColor(243, 244, 246);
  pdf.roundedRect(qrCenter - (upiTextW / 2) - 2, qrBoxY + qrBoxSize + 1.8, upiTextW + 4, 4.6, 1.2, 1.2, 'F');

  pdf.setTextColor(11, 102, 59);
  pdf.text(upiIdLabel, qrCenter, qrBoxY + qrBoxSize + 5.2, { align: 'center' });

  // Column 3: Security & Help Bullets
  let bulletY = paymentY + 1.5;

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

  bulletY += 10.5;
  drawReceiptIcon(bulletsX + 2, bulletY + 1.5);
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(7.5);
  pdf.setTextColor(55, 65, 81);
  pdf.text("Please share payment", bulletsX + 7, bulletY + 0.5);
  pdf.setFont("helvetica", "normal");
  pdf.text("screenshot after payment", bulletsX + 7, bulletY + 3.8);

  bulletY += 10.5;
  drawHeadsetIcon(bulletsX + 2, bulletY + 1.5);
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(7.5);
  pdf.setTextColor(55, 65, 81);
  pdf.text("For any queries", bulletsX + 7, bulletY + 0.5);
  pdf.setFont("helvetica", "bold");
  pdf.setTextColor(11, 102, 59);
  pdf.text(`+91 ${invoiceData.fromSection?.mobile || '7667792779'}`, bulletsX + 7, bulletY + 3.8);

  // Notes & Seal Section
  const footerY = Math.max(paymentY + 42, targetFooterY);
  const notesHeight = 24;
  const notesY = footerY - notesHeight - 5;

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

  // Seal
  const sealSize = 48;
  const sealX = pageWidth - marginRight - sealSize - 2;
  const sealY = footerY - sealSize - 2;
  try {
    const sealSource = options.sealUrl || invoiceData.seal || '/stamp.png';
    const sealData = await loadImageAsDataUrl(sealSource, 550);
    if (sealData) {
      pdf.addImage(sealData, "PNG", sealX, sealY, sealSize, sealSize, undefined, 'FAST');
    }
  } catch (e) {
    console.error("Seal embed error:", e);
  }

  // Footer Banner
  const footerWidth = pageWidth - marginLeft - marginRight;
  pdf.setFillColor(11, 102, 59);
  pdf.roundedRect(marginLeft, footerY, footerWidth, 6.5, 1, 1, 'F');

  pdf.setDrawColor(255, 255, 255);
  pdf.setLineWidth(0.2);
  pdf.line(marginLeft + (footerWidth / 3), footerY + 1, marginLeft + (footerWidth / 3), footerY + 5.5);
  pdf.line(marginLeft + (2 * footerWidth / 3), footerY + 1, marginLeft + (2 * footerWidth / 3), footerY + 5.5);

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
};

/**
 * Generate PDF Document as a Blob URL with cleanup function
 * @param {Object} invoiceData The invoice data object
 * @param {Object} options Optional settings: sealUrl, upiQrCodeUrl, totals
 * @returns {Promise<{ pdf: jsPDF, blob: Blob, blobUrl: string, cleanup: Function }>}
 */
export const generateInvoicePdfBlobUrl = async (invoiceData = {}, options = {}) => {
  const pdf = await generateInvoicePdfDoc(invoiceData, options);
  if (!pdf) return null;
  const blob = pdf.output('blob');
  const blobUrl = URL.createObjectURL(blob);
  return {
    pdf,
    blob,
    blobUrl,
    cleanup: () => {
      try {
        URL.revokeObjectURL(blobUrl);
      } catch (e) {
        // ignore
      }
    }
  };
};

export default {
  numberToWords,
  calculateInvoiceTotals,
  generateInvoicePdfDoc,
  generateInvoicePdfBlobUrl
};
