/**
 * Mail sender with two delivery paths:
 *
 *  1. HTTP API (Brevo) — used whenever BREVO_API_KEY is set. This talks to
 *     https://api.brevo.com over HTTPS/443, which is NOT affected by
 *     Render's outbound network restrictions on raw SMTP ports (25/465/587).
 *     This is the path Render (and most free-tier PaaS hosts) needs.
 *
 *  2. SMTP (Gmail via Nodemailer) — used as a fallback when no API key is
 *     configured. This works fine on localhost/home networks, which is why
 *     it "worked on localhost" — but Render's free tier blocks/throttles
 *     outbound SMTP, which is exactly what produced your ETIMEDOUT error.
 *
 * If neither is configured, OTPs are logged to the console so local dev
 * never hard-fails.
 *
 * Why Brevo specifically: free tier (300 emails/day), no credit card
 * required, plain REST API, sender verification is a one-time step in
 * their dashboard. Swap the fetch call below for Resend/SendGrid/Mailgun's
 * API if you prefer — the pattern (HTTPS POST instead of SMTP socket) is
 * the actual fix, not the specific provider.
 */

const nodemailer = require('nodemailer');

const BREVO_API_KEY = process.env.BREVO_API_KEY;
const MAIL_FROM_EMAIL = process.env.MAIL_FROM_EMAIL || process.env.SMTP_USER || 'no-reply@sanatan-gyan.local';
const MAIL_FROM_NAME = process.env.MAIL_FROM_NAME || 'Sanatan Gyan';

// ------------------- Path 1: Brevo HTTP API (use this on Render) -------------------
async function sendViaBrevo(toEmail, subject, text, html) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000); // fail fast, don't hang the request

  try {
    const res = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: {
        'api-key': BREVO_API_KEY,
        'Content-Type': 'application/json',
        Accept: 'application/json'
      },
      body: JSON.stringify({
        sender: { name: MAIL_FROM_NAME, email: MAIL_FROM_EMAIL },
        to: [{ email: toEmail }],
        subject,
        textContent: text,
        htmlContent: html
      }),
      signal: controller.signal
    });

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`Brevo API error ${res.status}: ${body}`);
    }

    return { delivered: true, provider: 'brevo' };
  } finally {
    clearTimeout(timeout);
  }
}

// ------------------- Path 2: SMTP via Nodemailer (local dev fallback) -------------------
let transporter = null;

function getTransporter() {
  if (transporter) return transporter;

  if (!process.env.SMTP_USER || !process.env.SMTP_PASS) {
    return null;
  }

  transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'smtp.gmail.com',
    port: Number(process.env.SMTP_PORT) || 587,
    secure: false, // 587 = STARTTLS, not implicit TLS — must be false here
    requireTLS: true,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS
    },
    // Fail fast instead of hanging for Node's default (which is what
    // turned into your multi-minute 500). Tune down further if you want
    // the request to fail even quicker.
    connectionTimeout: 8_000,
    greetingTimeout: 8_000,
    socketTimeout: 8_000
  });

  return transporter;
}

async function sendViaSmtp(toEmail, subject, text, html) {
  const t = getTransporter();
  if (!t) return null;

  let fromHeader = MAIL_FROM_EMAIL;
  if (!fromHeader.includes('<')) {
    fromHeader = `"${MAIL_FROM_NAME}" <${fromHeader}>`;
  }

  await t.sendMail({ from: fromHeader, to: toEmail, subject, text, html });
  return { delivered: true, provider: 'smtp' };
}

// ------------------- Public API -------------------
async function sendOtpEmail(toEmail, otp) {
  const subject = 'Your Sanatan Gyan verification code';
  const text = `Your verification code is ${otp}. It expires in 10 minutes. If you didn't request this, you can ignore this email.`;
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto; padding: 20px; border: 1px solid #eee; border-radius: 8px;">
      <h2 style="color:#c74a02;">Verify your email</h2>
      <p>Use the code below to verify your email address and finish creating your Sanatan Gyan account:</p>
      <p style="font-size: 28px; font-weight: bold; letter-spacing: 4px; color:#333; margin: 20px 0;">${otp}</p>
      <p style="color:#666; font-size: 14px;">This code expires in 10 minutes. If you didn't request this, you can safely ignore this email.</p>
    </div>
  `;

  if (BREVO_API_KEY) {
    return sendViaBrevo(toEmail, subject, text, html);
  }

  const smtpResult = await sendViaSmtp(toEmail, subject, text, html);
  if (smtpResult) return smtpResult;

  console.warn('⚠️ No BREVO_API_KEY and no SMTP_USER/SMTP_PASS set — OTP emails will not send.');
  console.log(`📧 [DEV] OTP for ${toEmail}: ${otp}`);
  return { delivered: false, provider: 'none' };
}

module.exports = { sendOtpEmail };