const nodemailer = require('nodemailer');

let transporter = null;

function getTransporter() {
  if (transporter) return transporter;

  if (!process.env.SMTP_USER || !process.env.SMTP_PASS) {
    console.warn(
      '⚠️ SMTP_USER / SMTP_PASS set nahi hain — OTP emails send nahi ho paayenge. ' +
      '.env.example dekho aur mail credentials set karo.'
    );
    return null;
  }

  transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS
    }
  });

  return transporter;
}

async function sendOtpEmail(toEmail, otp) {
  const t = getTransporter();

  if (!t) {
    console.log(`📧 [DEV] OTP for ${toEmail}: ${otp}`);
    return { delivered: false };
  }

  let fromHeader = process.env.MAIL_FROM || process.env.SMTP_USER || 'no-reply@sanatan-gyan.local';
  if (!fromHeader.includes('<')) {
    fromHeader = `"Sanatan Gyan" <${fromHeader}>`;
  }

  await t.sendMail({
    from: fromHeader,
    to: toEmail,
    subject: 'Your Sanatan Gyan verification code',
    text: `Your verification code is ${otp}. It expires in 10 minutes. If you didn't request this, you can ignore this email.`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto; padding: 20px; border: 1px solid #eee; border-radius: 8px;">
        <h2 style="color:#c74a02;">Verify your email</h2>
        <p>Use the code below to verify your email address and finish creating your Sanatan Gyan account:</p>
        <p style="font-size: 28px; font-weight: bold; letter-spacing: 4px; color:#333; margin: 20px 0;">${otp}</p>
        <p style="color:#666; font-size: 14px;">This code expires in 10 minutes. If you didn't request this, you can safely ignore this email.</p>
      </div>
    `
  });

  return { delivered: true };
}

module.exports = { sendOtpEmail };