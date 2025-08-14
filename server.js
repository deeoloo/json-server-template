const jsonServer = require('json-server');
const express = require('express');
const cors = require('cors');
const path = require('path');
const nodemailer = require('nodemailer');

const server = jsonServer.create();
const router = jsonServer.router(path.join(__dirname, 'db.json'));
const middlewares = jsonServer.defaults();

server.use(cors());
server.use(express.json());
server.use('/images', express.static(path.join(__dirname, 'images')));
server.get('/health', (_req, res) => res.json({status:'ok'}));

server.post('/send-order-email', async (req, res) => {
  try {
    const { order } = req.body;
    if (!order) return res.status(400).json({ error: 'Missing order' });

    const transporter = nodemailer.createTransport({
      host: 'smtp.gmail.com',
      port: 465,
      secure: true,
      auth: {
        user: process.env.GMAIL_USER,
        pass: process.env.GMAIL_PASS
      }
    });

    // 1. HTML TEMPLATE FOR OWNER
    const ownerHtml = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #d4a017;">New Order ${order.id ? `#${order.id}` : ""}</h2>
        <p><strong>Date:</strong> ${new Date(order.createdAt).toLocaleString()}</p>
        
        <h3 style="margin-top: 20px;">Customer Details</h3>
        <p>${order.customer.firstName} ${order.customer.lastName}</p>
        <p>Phone: ${order.customer.phone}</p>
        <p>Email: ${order.customer.email || "Not provided"}</p>
        <p>Address: ${order.customer.address}, ${order.customer.city}</p>
        
        <h3 style="margin-top: 20px;">Order Summary</h3>
        <table style="width: 100%; border-collapse: collapse;">
          <tr>
            <th style="text-align: left; padding: 8px; border-bottom: 1px solid #ddd;">Item</th>
            <th style="text-align: left; padding: 8px; border-bottom: 1px solid #ddd;">Image</th>
            <th style="text-align: left; padding: 8px; border-bottom: 1px solid #ddd;">Qty</th>
            <th style="text-align: left; padding: 8px; border-bottom: 1px solid #ddd;">Price</th>
          </tr>
          ${order.items.map(item => `
            <tr>
              <td style="padding: 8px; border-bottom: 1px solid #ddd;">${item.name}</td>
              <td style="padding: 8px; border-bottom: 1px solid #ddd;">
                <img src="${apiUrl}/images/${item.image}" alt="${item.name}" width="60" style="display: block;">
              </td>
              <td style="padding: 8px; border-bottom: 1px solid #ddd;">${item.quantity}</td>
              <td style="padding: 8px; border-bottom: 1px solid #ddd;">Ksh ${item.price}</td>
            </tr>
          `).join('')}
        </table>
        
        <div style="margin-top: 20px;">
          <p><strong>Subtotal:</strong> Ksh ${order.pricing.subtotal}</p>
          <p><strong>Shipping:</strong> ${order.shippingMethod?.name} (Ksh ${order.pricing.shipping})</p>
          <p><strong>Total:</strong> Ksh ${order.pricing.total}</p>
        </div>
        
        <div style="margin-top: 20px;">
          <h3>Payment Details</h3>
          <p>M-Pesa Pochi: ${order.payment.pochiNumber}</p>
          <p>Transaction Code: ${order.payment.mpesaCode}</p>
        </div>
        
        ${order.note ? `<p><strong>Customer Note:</strong> ${order.note}</p>` : ''}
      </div>
    `;

    // 2. HTML TEMPLATE FOR CUSTOMER
    const customerHtml = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #d4a017;">Thank you for your order!</h2>
        <p>Your order ${order.id ? `#${order.id}` : ""} has been received.</p>
        
        <h3 style="margin-top: 20px;">Order Summary</h3>
        <table style="width: 100%; border-collapse: collapse;">
          ${order.items.map(item => `
            <tr>
              <td style="padding: 8px; border-bottom: 1px solid #ddd;">
                <img src="${apiUrl}/images/${item.image}" alt="${item.name}" width="60" style="display: block;">
              </td>
              <td style="padding: 8px; border-bottom: 1px solid #ddd;">
                <p><strong>${item.name}</strong></p>
                <p>Qty: ${item.quantity}</p>
                <p>Ksh ${item.price} each</p>
              </td>
            </tr>
          `).join('')}
        </table>
        
        <div style="margin-top: 20px; background: #f8f8f8; padding: 15px;">
          <p><strong>Subtotal:</strong> Ksh ${order.pricing.subtotal}</p>
          <p><strong>Shipping:</strong> Ksh ${order.pricing.shipping}</p>
          <p><strong>Total:</strong> Ksh ${order.pricing.total}</p>
        </div>
        
        <div style="margin-top: 20px;">
          <h3>Shipping To</h3>
          <p>${order.customer.firstName} ${order.customer.lastName}</p>
          <p>${order.customer.address}, ${order.customer.city}</p>
          <p>Phone: ${order.customer.phone}</p>
        </div>
        
        <p style="margin-top: 20px;">We'll notify you when your order ships. For questions, reply to this email.</p>
        
        <p style="margin-top: 30px; color: #888;">
          <small>Yarnly Chic Team</small>
        </p>
      </div>
    `;

    // Send to owner
    await transporter.sendMail({
      from: process.env.GMAIL_USER,
      to: process.env.OWNER_EMAIL || 'dorineoloo100@gmail.com',
      subject: `New Order ${order.id ? `#${order.id}` : ""}`,
      html: ownerHtml,
      text: "Please view this email in HTML format" // Fallback text
    });

    // Send to customer (if email provided)
    if (order.customer.email) {
      await transporter.sendMail({
        from: `Yarnly Chic <${process.env.GMAIL_USER}>`,
        to: order.customer.email,
        subject: `Your Order Confirmation ${order.id ? `#${order.id}` : ""}`,
        html: customerHtml,
        text: "Please view this email in HTML format" // Fallback text
      });
    }

    res.json({ ok: true });
  } catch (e) {
    console.error("Email error:", e);
    res.status(500).json({ error: "Email failed" });
  }
});

server.use(middlewares);
server.use(router);

const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => console.log(`JSON Server running on ${PORT}`));
