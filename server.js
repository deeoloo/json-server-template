// server.js
require('dotenv').config();

const jsonServer  = require('json-server');
const express     = require('express');
const cors        = require('cors');
const path        = require('path');

const server = jsonServer.create();
const router = jsonServer.router(path.join(__dirname, 'db.json'));
const middlewares = jsonServer.defaults();

// ---- Basic server & static assets ----
server.use(cors({
  origin: '*',
  methods: ['GET','POST','PUT','PATCH','DELETE'],
  allowedHeaders: ['Content-Type','Authorization']
}));
server.use(express.json());
server.use('/images', express.static(path.join(__dirname, 'images')));

// root + health check
server.get('/', (_req, res) => res.send('OK'));
server.get('/health', (_req, res) => res.json({ status: 'ok' }));

const {
  MAILTRAP_API_TOKEN,     // Mailtrap → Email Sending → API tokens
  FROM_EMAIL,             
  OWNER_EMAIL,
  API_URL,
  PORT = 3000,
} = process.env;

// ---- Minimal fetch guard (Node 18+ has global fetch) ----
if (typeof fetch !== 'function') {
  throw new Error('Global fetch is not available. Please run on Node 18+ or 20+.');
}

// ---- Helpers ----
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

// ---- Mail sender (Mailtrap Email API over HTTPS) ----
async function sendEmail({ from, to, subject, html, text, name = 'Yarnly Chic' }) {
  if (!MAILTRAP_API_TOKEN) {
    throw new Error('MAILTRAP_API_TOKEN missing. Set it in environment variables.');
  }

  const payload = {
    from: { email: from, name },
    to: (Array.isArray(to) ? to : [to]).map(e => ({ email: e })),
    subject,
    html,
    text
  };

  const resp = await fetch('https://send.api.mailtrap.io/api/send', {
    method: 'POST',
    headers: {
      'Authorization': `Api-Token ${MAILTRAP_API_TOKEN}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  });

  if (!resp.ok) {
    const body = await resp.text().catch(() => '');
    throw new Error(`Mailtrap API error ${resp.status}: ${body}`);
  }
}

// ---- Email endpoint ----
server.post('/send-order-email', async (req, res) => {
  try {
    const { order } = req.body || {};
    if (!order) return res.status(400).json({ error: 'Missing order' });

    const hostUrl = getHostUrl(req);

    // rows for owner email
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

    // rows for customer email
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

    // ---- Send emails via Mailtrap API ----
    const fromAddr = FROM_EMAIL || 'no-reply@yarnlychic.test';
    const ownerTo  = (OWNER_EMAIL && /@/.test(OWNER_EMAIL)) ? OWNER_EMAIL : fromAddr;

    // Owner notification
    await sendEmail({
      from: fromAddr,
      to: ownerTo,
      subject: `New Order ${order.id ? `#${order.id}` : ''}`,
      html: ownerHtml,
      text: 'Please view this email in HTML format.'
    });

    // Customer confirmation
    if (order.customer?.email) {
      await sendEmail({
        from: fromAddr,
        to: order.customer.email,
        subject: `Your Order Confirmation ${order.id ? `#${order.id}` : ''}`,
        html: customerHtml,
        text: 'Please view this email in HTML format.'
      });
    }

    res.json({ ok: true });
  } catch (e) {
    console.error('Email error:', e);
    res.status(500).json({ error: 'Email failed', details: String(e.message || e) });
  }
});

server.use(middlewares);
server.use(router);

// start
server.listen(PORT, '0.0.0.0', () => {
  console.log(`JSON Server running on ${PORT}`);
});
