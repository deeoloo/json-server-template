// server.js
require('dotenv').config();

const jsonServer = require('json-server');
const express   = require('express');
const cors      = require('cors');
const path      = require('path');
const nodemailer = require('nodemailer');

const server = jsonServer.create();
const router = jsonServer.router(path.join(__dirname, 'db.json'));
const middlewares = jsonServer.defaults();

// ---- Basic server & static assets ----
server.use(cors());
server.use(express.json());
server.use('/images', express.static(path.join(__dirname, 'images')));

// health check
server.get('/health', (_req, res) => res.json({ status: 'ok' }));


const {
  GMAIL_USER,
  GMAIL_PASS,
  OWNER_EMAIL,
  API_URL,
  PORT = 3000,
} = process.env;


let transporter = null;
if (GMAIL_USER && GMAIL_PASS) {
  transporter = nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 465,
    secure: true,
    auth: { user: GMAIL_USER, pass: GMAIL_PASS },
  });

  transporter.verify()
    .then(() => console.log('SMTP: ready'))
    .catch(err => console.error('SMTP: failed to verify', err));
} else {
  console.warn('⚠️  Email not configured: set GMAIL_USER and GMAIL_PASS in .env');
}


function getHostUrl(req) {
  
  if (API_URL && API_URL.trim()) return API_URL.trim();
  return `${req.protocol}://${req.get('host')}`;
}


function buildImageSrc(image, hostUrl) {
  if (!image) return '';
  const s = String(image);
  
  if (/^https?:\/\//i.test(s)) return s;

  
  const file = s.replace(/^\/?images\/?/i, ''); 
  return `${hostUrl}/images/${file}`;
}

// ---- Email endpoint ----
server.post('/send-order-email', async (req, res) => {
  try {
    const { order } = req.body || {};
    if (!order) return res.status(400).json({ error: 'Missing order' });

    if (!transporter) {
      return res.status(500).json({ error: 'Email not configured on server' });
    }

    const hostUrl = getHostUrl(req);

    // Compose rows for the emails
    const rowsOwner = (order.items || []).map(item => `
      <tr>
        <td style="padding:8px;border-bottom:1px solid #ddd;">${item.name}</td>
        <td style="padding:8px;border-bottom:1px solid #ddd;">
          ${item.image ? `<img src="${buildImageSrc(item.image, hostUrl)}" alt="${item.name}" width="60" style="display:block;">` : ''}
        </td>
        <td style="padding:8px;border-bottom:1px solid #ddd;">${Number(item.quantity ?? 1)}</td>
        <td style="padding:8px;border-bottom:1px solid #ddd;">Ksh ${Number(item.price ?? 0)}</td>
      </tr>
    `).join('');

    const rowsCustomer = (order.items || []).map(item => `
      <tr>
        <td style="padding:8px;border-bottom:1px solid #ddd;">
          ${item.image ? `<img src="${buildImageSrc(item.image, hostUrl)}" alt="${item.name}" width="60" style="display:block;">` : ''}
        </td>
        <td style="padding:8px;border-bottom:1px solid #ddd;">
          <p><strong>${item.name}</strong></p>
          <p>Qty: ${Number(item.quantity ?? 1)}</p>
          <p>Ksh ${Number(item.price ?? 0)} each</p>
        </td>
      </tr>
    `).join('');

    // ---- HTML templates ----
    const ownerHtml = `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;">
        <h2 style="color:#d4a017;">New Order ${order.id ? `#${order.id}` : ''}</h2>
        <p><strong>Date:</strong> ${new Date(order.createdAt || Date.now()).toLocaleString()}</p>

        <h3 style="margin-top:20px;">Customer Details</h3>
        <p>${order.customer?.firstName || ''} ${order.customer?.lastName || ''}</p>
        <p>Phone: ${order.customer?.phone || ''}</p>
        <p>Email: ${order.customer?.email || 'Not provided'}</p>
        <p>Address: ${order.customer?.address || ''}, ${order.customer?.city || ''}</p>

        <h3 style="margin-top:20px;">Order Summary</h3>
        <table style="width:100%;border-collapse:collapse;">
          <tr>
            <th style="text-align:left;padding:8px;border-bottom:1px solid #ddd;">Item</th>
            <th style="text-align:left;padding:8px;border-bottom:1px solid #ddd;">Image</th>
            <th style="text-align:left;padding:8px;border-bottom:1px solid #ddd;">Qty</th>
            <th style="text-align:left;padding:8px;border-bottom:1px solid #ddd;">Price</th>
          </tr>
          ${rowsOwner}
        </table>

        <div style="margin-top:20px;">
          <p><strong>Subtotal:</strong> Ksh ${order.pricing?.subtotal ?? 0}</p>
          <p><strong>Shipping:</strong> ${order.shippingMethod?.name || ''} (Ksh ${order.pricing?.shipping ?? 0})</p>
          <p><strong>Total:</strong> Ksh ${order.pricing?.total ?? 0}</p>
        </div>

        <div style="margin-top:20px;">
          <h3>Payment Details</h3>
          <p>M-Pesa Pochi: ${order.payment?.pochiNumber || ''}</p>
          <p>Transaction Code: ${order.payment?.mpesaCode || ''}</p>
        </div>

        ${order.note ? `<p><strong>Customer Note:</strong> ${order.note}</p>` : ''}
      </div>
    `;

    const customerHtml = `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;">
        <h2 style="color:#d4a017;">Thank you for your order!</h2>
        <p>Your order ${order.id ? `#${order.id}` : ''} has been received.</p>

        <h3 style="margin-top:20px;">Order Summary</h3>
        <table style="width:100%;border-collapse:collapse;">
          ${rowsCustomer}
        </table>

        <div style="margin-top:20px;background:#f8f8f8;padding:15px;">
          <p><strong>Subtotal:</strong> Ksh ${order.pricing?.subtotal ?? 0}</p>
          <p><strong>Shipping:</strong> Ksh ${order.pricing?.shipping ?? 0}</p>
          <p><strong>Total:</strong> Ksh ${order.pricing?.total ?? 0}</p>
        </div>

        <div style="margin-top:20px;">
          <h3>Shipping To</h3>
          <p>${order.customer?.firstName || ''} ${order.customer?.lastName || ''}</p>
          <p>${order.customer?.address || ''}, ${order.customer?.city || ''}</p>
          <p>Phone: ${order.customer?.phone || ''}</p>
        </div>

        <p style="margin-top:20px;">We'll notify you when your order ships. For questions, reply to this email.</p>
        <p style="margin-top:30px;color:#888;"><small>Yarnly Chic Team</small></p>
      </div>
    `;

    // ---- Send emails ----
    const ownerTo = (OWNER_EMAIL && /@/.test(OWNER_EMAIL)) ? OWNER_EMAIL : GMAIL_USER;

    await transporter.sendMail({
      from: GMAIL_USER,
      to: ownerTo,
      subject: `New Order ${order.id ? `#${order.id}` : ''}`,
      html: ownerHtml,
      text: 'Please view this email in HTML format.'
    });

    if (order.customer?.email) {
      await transporter.sendMail({
        from: `Yarnly Chic <${GMAIL_USER}>`,
        to: order.customer.email,
        subject: `Your Order Confirmation ${order.id ? `#${order.id}` : ''}`,
        html: customerHtml,
        text: 'Please view this email in HTML format.'
      });
    }

    res.json({ ok: true });
  } catch (e) {
    console.error('Email error:', e);
    res.status(500).json({ error: 'Email failed' });
  }
});


server.use(middlewares);
server.use(router);

// start
server.listen(PORT, '0.0.0.0', () => {
  console.log(`JSON Server running on ${PORT}`);
});
