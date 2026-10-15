const nodemailer = require('nodemailer');

/**
 * Sends an email with attachments.
 * @param {Object} options - Email options (to, subject, text, html, attachments)
 */
const sendEmail = async (options) => {
  try {
    const user = (process.env.EMAIL_USER || '').replace(/"/g, '').trim();
    const pass = (process.env.EMAIL_PASS || '').replace(/"/g, '').replace(/\s/g, '');

    if (!user || !pass) {
      console.warn('Email credentials not configured in environment');
      return { success: false, error: 'Email service credentials not configured on server' };
    }

    const host = (process.env.EMAIL_HOST || 'smtp.gmail.com').replace(/"/g, '').trim();
    const port = parseInt((process.env.EMAIL_PORT || '587').replace(/"/g, '').trim(), 10);
    const secure = (process.env.EMAIL_SECURE || 'false').replace(/"/g, '').trim() === 'true';

    // Create a transporter
    const transporter = nodemailer.createTransport({
      host,
      port,
      secure,
      auth: { user, pass },
    });

    const cleanFromAddress = (process.env.EMAIL_FROM_ADDRESS || user).replace(/"/g, '').trim();
    const cleanFromName = (process.env.EMAIL_FROM_NAME || 'Tech Vaseegrah').replace(/"/g, '').trim();

    // Define email options
    const mailOptions = {
      from: `"${cleanFromName}" <${cleanFromAddress}>`,
      to: options.to,
      subject: options.subject,
      text: options.text,
      html: options.html,
      attachments: options.attachments,
    };

    // Send the email
    const info = await transporter.sendMail(mailOptions);
    console.log('Email sent: %s', info.messageId);
    return { success: true, messageId: info.messageId };
  } catch (error) {
    console.error('Error sending email:', error);
    return { success: false, error: error.message };
  }
};

module.exports = { sendEmail };
