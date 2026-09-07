/**
 * ============================================================
 *  CS-BOT BACKEND SERVER — Photobooth Email Service & Static Host
 * ============================================================
 */
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const nodemailer = require('nodemailer');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

// In-Memory & File Stats Counter
const STATS_FILE = path.join(__dirname, 'stats.json');
let photoStats = { total: 148, today: 36, lastUpdated: new Date().toISOString() };

try {
  if (fs.existsSync(STATS_FILE)) {
    const raw = fs.readFileSync(STATS_FILE, 'utf8');
    photoStats = { ...photoStats, ...JSON.parse(raw) };
  }
} catch (e) {
  console.warn('[Stats] Could not load stats file, starting fresh.');
}

function saveStats() {
  try {
    fs.writeFileSync(STATS_FILE, JSON.stringify(photoStats, null, 2));
  } catch (e) {
    console.error('[Stats] Error saving stats:', e);
  }
}

// Middleware
app.use(cors());
// Increased limit for base64 photo payloads (up to 25MB)
app.use(express.json({ limit: '25mb' }));
app.use(express.urlencoded({ extended: true, limit: '25mb' }));

// Serve static frontend files from workspace root
app.use(express.static(path.join(__dirname)));

/**
 * Configure Nodemailer Transport
 */
function createTransporter() {
  const host = process.env.SMTP_HOST;
  const port = parseInt(process.env.SMTP_PORT || '587', 10);
  const secure = process.env.SMTP_SECURE === 'true' || port === 465;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  if (!user || !pass || user.includes('your-email@') || pass.includes('your-app-password')) {
    return null; // SMTP credentials not yet customized
  }

  return nodemailer.createTransport({
    host: host || 'smtp.gmail.com',
    port: port,
    secure: secure,
    auth: {
      user: user,
      pass: pass
    },
    tls: {
      rejectUnauthorized: false
    }
  });
}

/**
 * Health check endpoint
 */
app.get('/api/health', (req, res) => {
  const hasSMTP = Boolean(
    process.env.SMTP_USER &&
    !process.env.SMTP_USER.includes('your-email@') &&
    process.env.SMTP_PASS &&
    !process.env.SMTP_PASS.includes('your-app-password')
  );

  res.json({
    status: 'ok',
    service: 'CS-BOT Photobooth Server',
    smtpConfigured: hasSMTP,
    timestamp: new Date().toISOString()
  });
});

/**
 * Live Stats Endpoint
 * GET /api/stats
 */
app.get('/api/stats', (req, res) => {
  res.json({
    success: true,
    totalPhotos: photoStats.total,
    todayPhotos: photoStats.today,
    chapter: 'IEEE ENIS Computer Society SBC'
  });
});

/**
 * Fun CS Puns & Quips
 */
const CS_QUIPS = [
  "\"There are 10 types of people in the world: those who understand binary, and those who don't!\"",
  "\"Why do programmers prefer dark mode? Because light attracts bugs!\"",
  "\"A SQL query walks into a bar, walks up to two tables and asks: 'Can I join you?'\"",
  "\"Hardware is what makes a machine fast; software is what makes a fast machine slow!\"",
  "\"Optimism is an occupational hazard of programming: feedback is the treatment.\""
];

/**
 * POST /api/send-photo
 * Body: { name, email, photoData, subject, eventName }
 */
app.post('/api/send-photo', async (req, res) => {
  try {
    const { name, email, photoData, subject, eventName } = req.body;

    // 1. Validation
    if (!email || typeof email !== 'string') {
      return res.status(400).json({ success: false, error: 'Email address is required.' });
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email.trim())) {
      return res.status(400).json({ success: false, error: 'Invalid email address format.' });
    }

    if (!photoData || typeof photoData !== 'string' || !photoData.startsWith('data:image/')) {
      return res.status(400).json({ success: false, error: 'Valid photo image data is required.' });
    }

    // 2. Parse Base64 Image
    const matches = photoData.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
    if (!matches || matches.length !== 3) {
      return res.status(400).json({ success: false, error: 'Invalid base64 image encoding.' });
    }

    const mimeType = matches[1];
    const base64Data = matches[2];
    const imageBuffer = Buffer.from(base64Data, 'base64');
    const extension = mimeType.includes('png') ? 'png' : 'jpg';
    const filename = `cs-enis-photobooth-${Date.now()}.${extension}`;

    // Increment Stats
    photoStats.total += 1;
    photoStats.today += 1;
    photoStats.lastUpdated = new Date().toISOString();
    saveStats();

    // 3. Create Transporter
    const transporter = createTransporter();

    const safeName = (name && typeof name === 'string' && name.trim()) ? name.trim() : 'Friend';
    const safeEvent = (eventName && typeof eventName === 'string' && eventName.trim()) ? eventName.trim() : 'IEEE ENIS CS SBC Event';
    const randomQuip = CS_QUIPS[Math.floor(Math.random() * CS_QUIPS.length)];

    // If SMTP is not configured, return dev response
    if (!transporter) {
      console.warn(`[Photobooth] SMTP credentials not configured in .env. Photo prepared for ${safeName} <${email}> (Size: ${(imageBuffer.length / 1024).toFixed(1)} KB).`);
      return res.status(200).json({
        success: true,
        devMode: true,
        message: 'Photo processed successfully! (Set real SMTP_USER and SMTP_PASS in .env to dispatch live emails).',
        recipient: email.trim(),
        name: safeName,
        totalPhotos: photoStats.total,
        filename: filename
      });
    }

    // 4. HTML Email Body with Inline Image & Rich Components
    const emailSubject = subject || process.env.EMAIL_SUBJECT || `📸 ${safeName}, your IEEE ENIS CS SBC Photobooth Souvenir!`;
    const fromAddress = process.env.SMTP_FROM || `IEEE ENIS Computer Society <${process.env.SMTP_USER}>`;

    const htmlContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #080812; color: #F0F0FF; margin: 0; padding: 20px 10px; }
          .container { max-width: 620px; margin: 0 auto; background: #0E0E1E; border-radius: 20px; border: 1.5px solid rgba(255, 122, 0, 0.35); overflow: hidden; box-shadow: 0 20px 50px rgba(0,0,0,0.8), 0 0 30px rgba(255, 122, 0, 0.15); }
          .header { background: linear-gradient(135deg, #FF7A00 0%, #FF3D00 100%); padding: 28px 24px; text-align: center; }
          .header h1 { margin: 0; color: #FFFFFF; font-size: 24px; font-weight: 800; letter-spacing: 0.5px; text-transform: uppercase; text-shadow: 0 2px 8px rgba(0,0,0,0.3); }
          .header p { margin: 6px 0 0 0; color: rgba(255,255,255,0.92); font-size: 13.5px; font-weight: 500; }
          .content { padding: 32px 24px 24px; text-align: center; }
          .badge { display: inline-block; padding: 6px 16px; background: rgba(255,122,0,0.12); border: 1px solid #FF7A00; border-radius: 30px; color: #FFAA55; font-size: 12px; font-weight: 700; letter-spacing: 0.05em; text-transform: uppercase; margin-bottom: 18px; }
          .greeting { font-size: 22px; font-weight: 700; color: #FFFFFF; margin-bottom: 10px; }
          .greeting span { color: #FF9A3C; }
          .text { font-size: 15px; line-height: 1.6; color: #B0B0D0; margin-bottom: 24px; }
          
          /* Inline Image Container */
          .photo-frame { margin: 24px auto; padding: 8px; background: #14142B; border: 1.5px solid rgba(255, 122, 0, 0.3); border-radius: 16px; box-shadow: 0 10px 30px rgba(0,0,0,0.6); max-width: 96%; }
          .photo-img { width: 100%; height: auto; border-radius: 10px; display: block; }
          
          /* Event Info Box */
          .event-card { background: #131326; border: 1px solid rgba(255,255,255,0.08); border-radius: 12px; padding: 16px; margin: 24px 0; text-align: left; }
          .event-title { font-size: 13px; font-weight: 700; color: #FFAA55; text-transform: uppercase; margin-bottom: 6px; }
          .event-desc { font-size: 13.5px; color: #C0C0E0; line-height: 1.5; margin: 0; }
          
          /* Fun Quip */
          .quip-box { background: rgba(255, 122, 0, 0.06); border-left: 3px solid #FF7A00; padding: 12px 16px; margin: 20px 0; text-align: left; font-style: italic; font-size: 13px; color: #E0E0FF; border-radius: 0 8px 8px 0; }
          .quip-author { font-style: normal; font-weight: 600; color: #FF9A3C; font-size: 12px; margin-top: 4px; }
          
          /* CTA Button */
          .cta-btn { display: inline-block; padding: 12px 28px; background: linear-gradient(135deg, #FF7A00, #FF3D00); color: #FFFFFF !important; text-decoration: none; font-weight: 700; font-size: 14px; border-radius: 30px; box-shadow: 0 4px 18px rgba(255,122,0,0.4); margin: 10px 0 20px; }
          
          /* Social Links */
          .social-block { margin-top: 24px; padding-top: 20px; border-top: 1px solid rgba(255,255,255,0.08); }
          .social-title { font-size: 12px; font-weight: 600; color: #8888AA; text-transform: uppercase; margin-bottom: 12px; letter-spacing: 0.05em; }
          .social-links a { display: inline-block; margin: 0 8px; color: #FF9A3C; text-decoration: none; font-size: 13px; font-weight: 600; }
          
          .footer { background: #070710; padding: 20px; text-align: center; font-size: 12px; color: #606080; border-top: 1px solid rgba(255,255,255,0.05); }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>IEEE ENIS CS SBC</h1>
            <p>Computer Society Student Branch Chapter · ENIS Sfax</p>
          </div>
          <div class="content">
            <div class="badge">📸 SOUVENIR MEMORY</div>
            <div class="greeting">Hey <span>${safeName}</span>! ⚡</div>
            <p class="text">
              Thank you for visiting <strong>CS-BOT</strong> at our event! Here is your exclusive interactive photo souvenir.
            </p>

            <!-- Inline Branded Photo -->
            <div class="photo-frame">
              <img src="cid:souvenir-photo-inline" alt="Your Souvenir Photo with CS-BOT" class="photo-img" />
            </div>

            <!-- Fun CS-BOT Quip -->
            <div class="quip-box">
              ${randomQuip}
              <div class="quip-author">🤖 CS-BOT Mascot AI</div>
            </div>

            <!-- Event Context -->
            <div class="event-card">
              <div class="event-title">📍 Event Highlights</div>
              <p class="event-desc">
                <strong>${safeEvent}</strong> · National Engineering School of Sfax (ENIS).
                Share your photo on social media with <strong>#IEEEENISCS</strong> and <strong>#CSPhotobooth</strong>!
              </p>
            </div>

            <a href="https://computer-enis.ieee.tn/?fbclid=IwY2xjawUKa0RwZG9mAWV4dG4DYWVtAjEwAGJyaWQRMU9xV1hvYjFoQ0hTQTNGRUVzcnRjBmFwcF9pZBAyMjIwMzkxNzg4MjAwODkyAAEezyHxVy0cYpqvov7P12PBYGWNJdpn94mCwQqBbylnX_uB27LStxGVkJRbYnI_aem_GyXw3r6rVDnRHwh9OSIwKw" class="cta-btn" target="_blank">🚀 Discover IEEE ENIS CS Activities</a>

            <!-- Social Links -->
            <div class="social-block">
              <div class="social-title">Connect with IEEE ENIS Computer Society</div>
              <div class="social-links">
                <a href="https://www.facebook.com/CSENISsbc" target="_blank">🌐 Facebook</a> ·
                <a href="https://www.linkedin.com/company/ieee-computer-society-enis-student-chapter/posts/" target="_blank">💼 LinkedIn</a> ·
                <a href="https://www.instagram.com/ieee_cs_enis_sbc/" target="_blank">📸 Instagram</a>
              </div>
            </div>
          </div>
          <div class="footer">
            <p>© ${new Date().getFullYear()} IEEE ENIS Computer Society Student Branch Chapter · All Rights Reserved.</p>
          </div>
        </div>
      </body>
      </html>
    `;

    // 5. Send Email with Inline CID Attachment & Downloadable File
    const mailOptions = {
      from: fromAddress,
      to: email.trim(),
      subject: emailSubject,
      html: htmlContent,
      attachments: [
        {
          filename: filename,
          content: imageBuffer,
          contentType: mimeType,
          cid: 'souvenir-photo-inline' // Inline CID image
        }
      ]
    };

    const info = await transporter.sendMail(mailOptions);
    console.log(`[Photobooth] Email successfully sent to ${safeName} <${email}>. MessageId: ${info.messageId}`);

    return res.status(200).json({
      success: true,
      message: 'Photo sent successfully!',
      messageId: info.messageId,
      recipient: email.trim(),
      name: safeName,
      totalPhotos: photoStats.total
    });

  } catch (error) {
    console.error('[Photobooth] Error sending email:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to send email. Please check server SMTP configuration or try again.'
    });
  }
});

// Start Server
app.listen(PORT, () => {
  const isConfigured = Boolean(
    process.env.SMTP_USER &&
    !process.env.SMTP_USER.includes('votre-email@') &&
    !process.env.SMTP_USER.includes('your-email@') &&
    process.env.SMTP_PASS &&
    !process.env.SMTP_PASS.includes('xxxx') &&
    !process.env.SMTP_PASS.includes('your-app-password')
  );

  console.log(`====================================================`);
  console.log(`🚀 CS-BOT Server is running on http://localhost:${PORT}`);
  console.log(`📸 Photobooth endpoint: http://localhost:${PORT}/api/send-photo`);
  console.log(`📊 Stats endpoint:      http://localhost:${PORT}/api/stats`);
  if (isConfigured) {
    console.log(`✉️  SMTP Configured: ACTIVE (${process.env.SMTP_USER})`);
  } else {
    console.log(`⚠️  SMTP Configured: PLACEHOLDER (Fill your Gmail in .env file)`);
  }
  console.log(`====================================================`);
});
