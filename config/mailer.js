const nodemailer = require('nodemailer');

// ── IMPORTANT ──────────────────────────────────────────────────────────
// Render ke free-tier web services 26 Sep 2025 se outbound SMTP ports
// (25, 465, 587) block kar dete hain. Isliye raw SMTP (nodemailer transport)
// sirf LOCAL DEV mein kaam karega — Render pe deploy karte hi
// "Connection timeout" milega, chahe credentials bilkul sahi hon.
//
// Fix: production mein email HTTP API (Brevo) ke through bhejo — wo normal
// HTTPS (port 443) use karta hai jo block nahi hota. Local dev mein agar
// SMTP_HOST set hai to wahi use hoga (backward compatible), warna Brevo
// API try hoga (agar BREVO_API_KEY set hai), warna console mein OTP print
// hoga taaki dev flow block na ho.
//
// Brevo free tier: 300 emails/day, koi domain verification zaroori nahi.
// Sign up: https://app.brevo.com -> Settings -> SMTP & API -> API Keys

let transporter = null;

function getSmtpTransporter() {
  if (transporter) return transporter;

  if (!process.env.SMTP_HOST || !process.env.SMTP_USER || !process.env.SMTP_PASS) {
    return null;
  }

  transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT) || 587,
    secure: Number(process.env.SMTP_PORT) === 465, // true for 465, false for other ports
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS
    }
  });

  return transporter;
}

async function sendViaBrevoApi({ toEmail, fromAddress, subject, text, html }) {
  const res = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: {
      'api-key': process.env.BREVO_API_KEY,
      'Content-Type': 'application/json',
      Accept: 'application/json'
    },
    body: JSON.stringify({
      sender: { name: 'Sanatan Gyan', email: fromAddress },
      to: [{ email: toEmail }],
      subject,
      textContent: text,
      htmlContent: html
    })
  });

  if (!res.ok) {
    const errBody = await res.text().catch(() => '');
    throw new Error(`Brevo API error (${res.status}): ${errBody}`);
  }
}

async function sendOtpEmail(toEmail, otp) {
  const fromAddress = process.env.MAIL_FROM || process.env.SMTP_USER || 'no-reply@sanatan-gyan.local';
  const subject = 'Your Sanatan Gyan verification code';
  const text = `Your verification code is ${otp}. It expires in 10 minutes. If you didn't request this, you can ignore this email.`;
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto;">
      <h2 style="color:#c74a02;">Verify your email</h2>
      <p>Use the code below to verify your email address and finish creating your Sanatan Gyan account:</p>
      <p style="font-size: 28px; font-weight: bold; letter-spacing: 4px; color:#333;">${otp}</p>
      <p style="color:#666;">This code expires in 10 minutes. If you didn't request this, you can safely ignore this email.</p>
    </div>
  `;

  // 1) Agar BREVO_API_KEY set hai, usi se bhejo (Render pe yehi chalega).
  if (process.env.BREVO_API_KEY) {
    await sendViaBrevoApi({ toEmail, fromAddress, subject, text, html });
    return { delivered: true, via: 'brevo-api' };
  }

  // 2) Warna agar SMTP configured hai, wo try karo (local dev ke liye).
  const t = getSmtpTransporter();
  if (t) {
    await t.sendMail({ from: `"Sanatan Gyan" <${fromAddress}>`, to: toEmail, subject, text, html });
    return { delivered: true, via: 'smtp' };
  }

  // 3) Kuch bhi configured nahi — console mein OTP print kar do taaki dev
  // flow block na ho.
  console.warn(
    '⚠️  BREVO_API_KEY (production) ya SMTP_HOST/SMTP_USER/SMTP_PASS (local) set nahi hain — ' +
    'OTP emails send nahi ho paayenge.'
  );
  console.log(`📧 [DEV] OTP for ${toEmail}: ${otp}`);
  return { delivered: false };
}

module.exports = { sendOtpEmail };
