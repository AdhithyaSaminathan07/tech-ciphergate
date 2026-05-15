const nodemailer = require('nodemailer');

/**
 * Sends an email with attachments.
 * @param {Object} options - Email options (to, subject, text, html, attachments)
 */
const sendEmail = async (options) => {
  try {
    // Create a transporter
    // Note: In a production environment, these should come from environment variables or database settings
    const transporter = nodemailer.createTransport({
      host: (process.env.EMAIL_HOST || 'smtp.gmail.com').replace(/"/g, ''),
      port: parseInt((process.env.EMAIL_PORT || '587').replace(/"/g, ''), 10),
      secure: (process.env.EMAIL_SECURE || 'false').replace(/"/g, '') === 'true', 
      auth: {
        user: (process.env.EMAIL_USER || '').replace(/"/g, '').trim(),
        pass: (process.env.EMAIL_PASS || '').replace(/"/g, '').replace(/\s/g, ''),
      },
    });

    // Define email options
    const mailOptions = {
      from: `"${process.env.EMAIL_FROM_NAME || 'Tech Vaseegrah'}" <${process.env.EMAIL_FROM_ADDRESS || process.env.EMAIL_USER}>`,
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
