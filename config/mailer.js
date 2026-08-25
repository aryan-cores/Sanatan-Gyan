const nodemailer = require('nodemailer');

// SMTP transporter — env vars se configure hota hai (.env.example dekho).
// Works with Gmail (App Password), SendGrid SMTP, Mailtrap, etc.
let transporter = null;

function getTransporter() {
  if (transporter) return transporter;

  if (!process.env.SMTP_HOST || !process.env.SMTP_USER || !process.env.SMTP_PASS) {
    console.warn(
      '⚠️  SMTP_HOST / SMTP_USER / SMTP_PASS set nahi hain — OTP emails send nahi ho paayenge. ' +
      '.env.example dekho aur mail credentials set karo.'
    );
    return null;
  }

  transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT) || 465,
    secure: true, // true for 465, false for other ports
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS
    }
  });

  return transporter;
}

async function sendOtpEmail(toEmail, otp) {
  const t = getTransporter();
  const fromAddress = process.env.MAIL_FROM || process.env.SMTP_USER || 'no-reply@sanatan-gyan.local';

  if (!t) {
    // Mail configured nahi hai (e.g. local dev) — console mein OTP print kar do
    // taaki development flow block na ho.
    console.log(`📧 [DEV] OTP for ${toEmail}: ${otp}`);
    return { delivered: false };
  }

  await t.sendMail({
    from: `"Sanatan Gyan" <${fromAddress}>`,
    to: toEmail,
    subject: 'Your Sanatan Gyan verification code',
    text: `Your verification code is ${otp}. It expires in 10 minutes. If you didn't request this, you can ignore this email.`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto;">
        <h2 style="color:#c74a02;">Verify your email</h2>
        <p>Use the code below to verify your email address and finish creating your Sanatan Gyan account:</p>
        <p style="font-size: 28px; font-weight: bold; letter-spacing: 4px; color:#333;">${otp}</p>
        <p style="color:#666;">This code expires in 10 minutes. If you didn't request this, you can safely ignore this email.</p>
      </div>
    `
  });

  return { delivered: true };
}

module.exports = { sendOtpEmail };
