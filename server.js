// 🔑 ملف الخادم - استخدم مع Node.js و Stripe

require('dotenv').config(); // لتحميل المتغيرات من .env
const express = require('express');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const cors = require('cors');
const path = require('path');

const app = express();

// ⚙️ الإعدادات
app.use(cors({
    origin: ['http://localhost:3000', 'https://yourdomain.com'], // غيّر النطاق
    credentials: true
}));
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// 📋 تحديد المتغيرات
const DOMAIN = process.env.DOMAIN || 'http://localhost:3000';
const TAX_RATE = 0.10; // 10% ضريبة

// ✅ اختبار الخادم
app.get('/health', (req, res) => {
    res.json({ status: 'Server is running ✅' });
});

// 💳 إنشاء جلسة دفع Stripe
app.post('/create-checkout-session', async (req, res) => {
    try {
        const { items } = req.body;

        if (!items || items.length === 0) {
            return res.status(400).json({ error: 'No items in cart' });
        }

        // تحويل المنتجات إلى صيغة Stripe
        const lineItems = items.map(item => ({
            price_data: {
                currency: 'usd',
                product_data: {
                    name: item.name,
                    images: [item.image || 'https://via.placeholder.com/300'],
                },
                unit_amount: Math.round(item.price * 100), // Stripe يستخدم Cents
            },
            quantity: item.quantity,
        }));

        // حساب الضريبة
        const subtotal = items.reduce((sum, item) => sum + (item.price * item.quantity), 0);
        const taxAmount = Math.round(subtotal * TAX_RATE * 100);

        // إنشاء جلسة الدفع
        const session = await stripe.checkout.sessions.create({
            payment_method_types: ['card'],
            mode: 'payment',
            line_items: lineItems,
            
            // إضافة الضريبة
            shipping_options: [{
                shipping_rate_data: {
                    type: 'fixed_amount',
                    fixed_amount: {
                        amount: 0, // لا توجد رسوم شحن
                        currency: 'usd',
                    },
                    display_name: 'Free Shipping',
                },
            }],

            // صفحات النجاح والإلغاء
            success_url: `${DOMAIN}/success.html?session_id={CHECKOUT_SESSION_ID}`,
            cancel_url: `${DOMAIN}/cancel.html`,

            // معلومات العميل
            customer_email_collection: {
                enabled: true,
            },

            // معلومات الفاتورة
            billing_address_collection: 'auto',

            // الحد الأدنى للمعلومات المطلوبة
            consent_collection: {
                terms_of_service: 'required',
            },

            // البيانات المخصصة
            metadata: {
                order_id: Date.now(),
                item_count: items.length,
                subtotal: Math.round(subtotal * 100),
            },
        });

        // إرسال معرّف الجلسة للعميل
        res.json({
            success: true,
            sessionId: session.id,
            url: session.url, // يمكن استخدامه للتوجيه المباشر
        });

    } catch (error) {
        console.error('❌ Error creating session:', error.message);
        res.status(400).json({
            error: error.message,
            code: error.code,
        });
    }
});

// ✅ التحقق من حالة الدفع
app.get('/checkout-session/:sessionId', async (req, res) => {
    try {
        const session = await stripe.checkout.sessions.retrieve(req.params.sessionId);
        
        res.json({
            status: session.payment_status, // paid, unpaid, no_payment_required
            customer_email: session.customer_email,
            total: session.amount_total,
            payment_intent: session.payment_intent,
        });

    } catch (error) {
        console.error('❌ Error retrieving session:', error.message);
        res.status(400).json({ error: error.message });
    }
});

// 🪝 Webhook من Stripe (مهم جداً!)
app.post('/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
    const sig = req.headers['stripe-signature'];

    try {
        const event = stripe.webhooks.constructEvent(
            req.body,
            sig,
            process.env.STRIPE_WEBHOOK_SECRET
        );

        // معالجة الأحداث المختلفة
        switch (event.type) {
            case 'checkout.session.completed':
                const sessionCompleted = event.data.object;
                console.log('✅ Payment completed:', sessionCompleted.id);
                
                // احفظ الطلب في قاعدة البيانات
                await saveOrder({
                    sessionId: sessionCompleted.id,
                    email: sessionCompleted.customer_email,
                    amount: sessionCompleted.amount_total,
                    status: 'completed',
                });
                break;

            case 'charge.succeeded':
                console.log('💰 Charge succeeded:', event.data.object.id);
                break;

            case 'charge.failed':
                console.log('❌ Charge failed:', event.data.object.id);
                break;

            default:
                console.log(`Unhandled event type: ${event.type}`);
        }

        res.json({ received: true });

    } catch (error) {
        console.error('❌ Webhook error:', error.message);
        res.status(400).send(`Webhook Error: ${error.message}`);
    }
});

// 💾 دالة حفظ الطلب (استخدم قاعدة بيانات حقيقية)
async function saveOrder(orderData) {
    // TODO: اربطها بـ MongoDB أو Firebase أو أي قاعدة بيانات
    console.log('📝 Saving order:', orderData);

    // مثال مع Firebase:
    // const db = admin.firestore();
    // await db.collection('orders').add(orderData);
}

// 🔍 قائمة المنتجات (يمكنك استخدام قاعدة بيانات)
app.get('/products', (req, res) => {
    const products = [
        { id: 1, name: 'Cute Cat Sticker Pack', price: 0.99, emoji: '🐱' },
        { id: 2, name: 'Anime Girl Wallpaper', price: 1.99, emoji: '🎨' },
        { id: 3, name: 'Funny Meme Collection', price: 0.49, emoji: '😂' },
        { id: 4, name: 'Gaming Avatar Pack', price: 1.49, emoji: '🎮' },
        { id: 5, name: 'Music Playlist Cover', price: 0.79, emoji: '🎵' },
        { id: 6, name: 'Digital Art Brushes', price: 2.99, emoji: '🖌️' },
        { id: 7, name: 'Crypto Meme Pack', price: 0.99, emoji: '💎' },
        { id: 8, name: 'Motivational Posters', price: 1.29, emoji: '⭐' },
    ];
    res.json(products);
});

// 🚀 الاستماع على المنفذ
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`
╔═══════════════════════════════════════╗
║  🚀 Digital Store Server              ║
║  Server running on http://localhost:${PORT}   ║
║  Environment: ${process.env.NODE_ENV || 'development'}          ║
╚═══════════════════════════════════════╝
    `);
});

// معالجة الأخطاء العامة
process.on('unhandledRejection', (reason, promise) => {
    console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
});

process.on('uncaughtException', (error) => {
    console.error('❌ Uncaught Exception:', error);
});
