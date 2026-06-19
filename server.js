const express = require('express');
const cors = require('cors');
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json());

// Initialize Supabase Client
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;

let supabase;
let logoPublicUrl = ''; // Global public logo URL holder

async function setupPublicAssets() {
    if (!supabase) return;
    try {
        // 1. Check if public-assets bucket exists, create if not
        const { data: buckets, error: getBucketsError } = await supabase.storage.listBuckets();
        if (getBucketsError) throw getBucketsError;

        const bucketExists = buckets.some(b => b.name === 'public-assets');
        if (!bucketExists) {
            const { error: createError } = await supabase.storage.createBucket('public-assets', {
                public: true,
                allowedMimeTypes: ['image/png', 'image/jpeg'],
                fileSizeLimit: 2097152 // 2MB
            });
            if (createError) throw createError;
            console.log("Created public-assets storage bucket on Supabase.");
        }

        // 2. Read logo.png from filesystem and upload to bucket
        let logoPath = path.join(__dirname, 'public', 'images', 'logo.png');
        if (!fs.existsSync(logoPath)) {
            logoPath = path.join(__dirname, 'images', 'logo.png');
        }
        if (fs.existsSync(logoPath)) {
            const fileBuffer = fs.readFileSync(logoPath);
            const { error: uploadError } = await supabase.storage
                .from('public-assets')
                .upload('logo.png', fileBuffer, {
                    contentType: 'image/png',
                    upsert: true
                });
            if (uploadError) throw uploadError;

            // 3. Get Public URL
            const { data } = supabase.storage.from('public-assets').getPublicUrl('logo.png');
            logoPublicUrl = data.publicUrl;
            console.log("Uploaded logo.png to Supabase Storage. Public URL:", logoPublicUrl);
        } else {
            console.warn("WARNING: logo.png not found at", logoPath);
        }
    } catch (err) {
        console.warn("Supabase Storage setup warning (using text fallback for logo):", err.message);
    }
}

if (supabaseUrl && supabaseAnonKey) {
    supabase = createClient(supabaseUrl, supabaseAnonKey);
    console.log("Supabase Client initialized successfully.");
    setupPublicAssets();
} else {
    console.warn("WARNING: Supabase URL and Anon Key are not configured in environment variables.");
}

// Initialize Razorpay Client
const Razorpay = require('razorpay');
const razorpayKeyId = process.env.RAZORPAY_KEY_ID;
const razorpayKeySecret = process.env.RAZORPAY_KEY_SECRET;

let razorpay;
if (razorpayKeyId && razorpayKeySecret) {
    razorpay = new Razorpay({
        key_id: razorpayKeyId,
        key_secret: razorpayKeySecret
    });
    console.log("Razorpay Client initialized with Key ID starting with: " + razorpayKeyId.substring(0, 8));
} else {
    console.warn("WARNING: Razorpay Key ID and Secret are not configured in environment variables.");
}

// Serve static frontend files
app.use(express.static('.'));
app.use(express.static('public'));

// ==========================================================================
// BREVO (SENDINBLUE) EMAIL API HELPER
// ==========================================================================
async function sendEmail(toEmail, toName, subject, htmlContent) {
    const apiKey = process.env.BREVO_API_KEY;
    const senderEmail = process.env.BREVO_SENDER_EMAIL || 'orders@sreshtanutrimithai.com';
    const senderName = process.env.BREVO_SENDER_NAME || 'Sreshta Nutri Mithai';
    const replyToEmail = process.env.BREVO_REPLY_TO_EMAIL;

    if (!apiKey) {
        console.warn("WARNING: Brevo API key is missing. Skipping email send.");
        return { success: false, message: "Brevo API Key is missing." };
    }

    try {
        const payload = {
            sender: { name: senderName, email: senderEmail },
            to: [{ email: toEmail, name: toName }],
            subject: subject,
            htmlContent: htmlContent
        };

        if (replyToEmail) {
            payload.replyTo = { name: senderName, email: replyToEmail };
        }

        const response = await fetch('https://api.brevo.com/v3/smtp/email', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'api-key': apiKey
            },
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            const errData = await response.json();
            throw new Error(errData.message || 'Error response from Brevo API');
        }

        console.log(`Email sent successfully to ${toEmail} | Subject: ${subject}`);
        return { success: true };
    } catch (error) {
        console.error("Error sending email via Brevo:", error.message);
        return { success: false, error: error.message };
    }
}

// ==========================================================================
// WHATSAPP NOTIFICATION HELPER
// ==========================================================================
async function sendWhatsApp(toPhone, messageText) {
    const serviceUrl = process.env.WHATSAPP_SERVICE_URL;
    const apiKey = process.env.WHATSAPP_SERVICE_KEY || 'Vikirthan@WhatsApp2026';

    if (!serviceUrl) {
        console.warn("WARNING: WhatsApp Service URL is not configured. Skipping WhatsApp send.");
        return { success: false, message: "WhatsApp Service URL is missing." };
    }

    try {
        const response = await fetch(`${serviceUrl}/api/send`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-API-Key': apiKey
            },
            body: JSON.stringify({
                phone: toPhone,
                message: messageText
            })
        });

        if (!response.ok) {
            const errData = await response.json();
            throw new Error(errData.error || 'Error response from WhatsApp API');
        }

        console.log(`WhatsApp message dispatched successfully to: ${toPhone}`);
        return { success: true };
    } catch (error) {
        console.error("Error sending WhatsApp notification:", error.message);
        return { success: false, error: error.message };
    }
}

// ==========================================================================
// WHATSAPP TEXT TEMPLATE GENERATORS
// ==========================================================================
function getWhatsAppPaymentRequest(order) {
    return `Hello ${order.customer_name},

Thank you for placing your order with Sreshta Nutri Mithai!

Order ID: #${order.id}
Total Amount: ₹${order.grand_total}.00

To initiate preparation, please complete your online payment using GPay/PhonePe/Paytm to our UPI ID: 8190022020@upi.

Please reply to this chat with your payment screenshot to confirm. We will start preparing your fresh batch immediately!`;
}

function getWhatsAppPaymentConfirmed(order) {
    return `Hello ${order.customer_name},

Great news! We have successfully verified your payment of ₹${order.grand_total}.00 for Order #${order.id}.

Your order has been Accepted and our kitchen chefs have started preparing your fresh sweets handcrafted with pure A2 cow ghee! We will notify you as soon as they are packed.`;
}

function getWhatsAppOrderPacked(order) {
    return `Hello ${order.customer_name},

Your Sreshta Nutri Mithai order #${order.id} has been freshly prepared, quality-checked, and packed securely!

We are handing it over to our delivery partner shortly, and will share your tracking details as soon as they are generated.`;
}

function getWhatsAppOrderDispatched(order) {
    const trackingId = order.tracking_id || "N/A";
    const courierName = order.courier_name || "Our Delivery Partner";
    const trackingLink = order.tracking_link ? `\nTracking Link: ${order.tracking_link}` : "";

    return `Hello ${order.customer_name},

Sweets are on the way! Your order #${order.id} has been Dispatched.

Courier Partner: ${courierName}
Tracking ID: ${trackingId}${trackingLink}

You can track your package transit in real time. Thank you for choosing Sreshta!`;
}

function getWhatsAppOrderDelivered(order) {
    return `Hello ${order.customer_name},

Your Sreshta Nutri Mithai order #${order.id} has been Delivered successfully!

We hope you love your healthy, handcrafted treats.

🎁 Never run out of sweets! Reply to this chat if you would like to subscribe to our Monthly Sweet Delivery plan for fresh monthly boxes at special rates. Enjoy!`;
}

// ==========================================================================
// EMAIL HTML TEMPLATES (SPECIALIZED DESIGNS)
// ==========================================================================

const primaryColor = "#3E2718";
const accentColor = "#C38B31";
const bgWarm = "#FAF4E6";

// Wrapper for all Sreshta emails to maintain premium visual consistency
function getEmailLayout(title, subtitle, bodyHtml) {
    const logoHtml = logoPublicUrl 
        ? `<img src="${logoPublicUrl}" alt="Sreshta Nutri Mithai Logo" style="height: 70px; width: 70px; border-radius: 50%; margin-bottom: 12px; border: 2px solid ${accentColor}; background-color: #FFFFFF; display: inline-block;">`
        : '';

    return `
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <style>
            body { font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; background-color: ${bgWarm}; color: #261C14; margin: 0; padding: 20px; -webkit-font-smoothing: antialiased; }
            .wrapper { max-width: 600px; margin: 0 auto; background-color: #FFFFFF; border-radius: 16px; border: 1px solid #E6DFD5; overflow: hidden; box-shadow: 0 10px 30px rgba(62,39,24,0.05); }
            .header { background-color: ${primaryColor}; padding: 40px 30px; text-align: center; color: ${bgWarm}; border-bottom: 4px solid ${accentColor}; }
            .header h1 { font-family: Georgia, serif; font-size: 26px; margin: 0; font-weight: normal; letter-spacing: 0.05em; }
            .header p { font-size: 13px; margin: 8px 0 0 0; text-transform: uppercase; letter-spacing: 0.1em; color: ${accentColor}; font-weight: bold; }
            .content-body { padding: 40px 30px; line-height: 1.6; }
            .section-title { font-family: Georgia, serif; font-size: 20px; color: ${primaryColor}; border-bottom: 1px solid #E5E7EB; padding-bottom: 8px; margin-top: 0; margin-bottom: 20px; }
            .btn { display: inline-flex; align-items: center; justify-content: center; background-color: ${accentColor}; color: #FFFFFF !important; padding: 14px 28px; border-radius: 8px; text-decoration: none; font-weight: bold; font-size: 15px; text-transform: uppercase; letter-spacing: 0.05em; margin: 20px 0; box-shadow: 0 4px 12px rgba(195, 139, 49, 0.25); }
            .btn-wa { background-color: #25D366; box-shadow: 0 4px 12px rgba(37, 211, 102, 0.25); }
            .footer { background-color: ${bgWarm}; padding: 30px; text-align: center; font-size: 12px; color: #807166; border-top: 1px solid #E6DFD5; }
            .footer p { margin: 4px 0; }
            .order-summary-box { background-color: ${bgWarm}; border: 1px solid #E6DFD5; border-radius: 8px; padding: 20px; margin: 20px 0; }
            .item-row { display: flex; justify-content: space-between; margin-bottom: 10px; font-size: 14px; border-bottom: 1px dashed #E5E7EB; padding-bottom: 8px; }
            .item-row:last-child { border-bottom: none; padding-bottom: 0; margin-bottom: 0; }
            .total-row { font-weight: bold; font-size: 16px; color: ${primaryColor}; border-top: 1px solid #C7BEB1; padding-top: 12px; margin-top: 12px; display: flex; justify-content: space-between; }
        </style>
    </head>
    <body>
        <div class="wrapper">
            <div class="header">
                ${logoHtml}
                <h1>${title}</h1>
                <p>${subtitle}</p>
            </div>
            <div class="content-body">
                ${bodyHtml}
            </div>
            <div class="footer">
                <p><strong>Sreshta Nutri Mithai</strong></p>
                <p>Hyderabad, Telangana, India | +91 81900 22020</p>
                <p>Pure traditional delicacies handcrafted naturally with organic jaggery, nuts, & A2 ghee.</p>
            </div>
        </div>
    </body>
    </html>
    `;
}

// Generate UPI QR Code URL
function getUPIQRCodeURL(orderId, amount) {
    const upiId = process.env.UPI_ID || '8190022020@upi';
    const payeeName = encodeURIComponent('Sreshta Nutri Mithai');
    const note = encodeURIComponent(`Order_${orderId}`);
    
    // Standard UPI deep link format
    const upiLink = `upi://pay?pa=${upiId}&pn=${payeeName}&am=${amount}&cu=INR&tn=${note}`;
    
    // Encoded UPI link inside qrserver API
    return `https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${encodeURIComponent(upiLink)}`;
}

// Compile order list items HTML
function getItemsListHtml(items) {
    let html = '<div class="order-summary-box">';
    items.forEach(item => {
        html += `
            <div class="item-row">
                <span><strong>${item.name}</strong> (${item.weight}) x ${item.quantity}</span>
                <span>₹${item.price * item.quantity}.00</span>
            </div>
        `;
    });
    return html;
}

// ==========================================================================
// INDIVIDUAL EMAIL TEMPLATE CONTENT GENERATORS
// ==========================================================================

// 1. Payment Request Email
function getPaymentRequestTemplate(order, itemsHtml) {
    const qrUrl = getUPIQRCodeURL(order.id, order.grand_total);
    const body = `
        <h3 class="section-title">Order Received - ID #${order.id}</h3>
        <p>Hi <strong>${order.customer_name}</strong>,</p>
        <p>Thank you for placing your order with Sreshta Nutri Mithai. Your order has been recorded in our system. To initiate preparation, please complete your online payment using the QR code below:</p>
        
        <div style="text-align: center; margin: 30px 0; padding: 20px; border: 1px solid var(--color-border-warm); border-radius: 12px; background-color: #FFFFFF;">
            <img src="${qrUrl}" alt="Payment UPI QR Code" style="width: 200px; height: 200px; display: inline-block;">
            <p style="margin-top: 12px; font-size: 14px; font-weight: bold; color: ${primaryColor};">UPI ID: 8190022020@upi</p>
            <p style="font-size: 12px; color: var(--color-text-muted); margin: 4px 0 0 0;">Amount: <strong>₹${order.grand_total}.00</strong></p>
        </div>

        <h4 style="color: ${primaryColor}; margin-bottom: 8px;">Payment Instructions:</h4>
        <ol style="font-size: 14px; margin-top: 0; padding-left: 20px; line-height: 1.6;">
            <li>Scan the QR code above using any UPI app (GPay, PhonePe, Paytm, BHIM, etc.).</li>
            <li>Verify the payment amount is exactly <strong>₹${order.grand_total}.00</strong>.</li>
            <li>Take a screenshot of the successful transaction.</li>
            <li>Reply to our WhatsApp message or send the screenshot directly to <strong>+91 81900 22020</strong> to confirm.</li>
        </ol>

        ${itemsHtml}
            <div class="total-row">
                <span>Grand Total:</span>
                <span>₹${order.grand_total}.00</span>
            </div>
        </div>
        
        <p>Your order details are also sent to your WhatsApp. Click below if you want to chat directly with us on WhatsApp:</p>
        <div style="text-align: center;">
            <a href="https://wa.me/918190022020" class="btn btn-wa">Chat on WhatsApp</a>
        </div>
    `;
    return getEmailLayout("Sreshta Nutri Mithai", "Payment Request & Order Confirmation", body);
}

// 2. Payment Reminder Email
function getPaymentReminderTemplate(order, itemsHtml) {
    const qrUrl = getUPIQRCodeURL(order.id, order.grand_total);
    const body = `
        <h3 class="section-title">Payment Reminder - Order #${order.id}</h3>
        <p>Hi <strong>${order.customer_name}</strong>,</p>
        <p>This is a friendly reminder that we are waiting for payment confirmation for your Sreshta Nutri Mithai order (ID: #${order.id}).</p>
        <p>Since we prepare all sweets fresh upon order receipt, please scan the QR code below to complete your payment so we can start making your treats:</p>
        
        <div style="text-align: center; margin: 30px 0; padding: 20px; border: 1px solid var(--color-border-warm); border-radius: 12px; background-color: #FFFFFF;">
            <img src="${qrUrl}" alt="Payment UPI QR Code" style="width: 200px; height: 200px; display: inline-block;">
            <p style="margin-top: 12px; font-size: 14px; font-weight: bold; color: ${primaryColor};">UPI ID: 8190022020@upi</p>
            <p style="font-size: 12px; color: var(--color-text-muted); margin: 4px 0 0 0;">Amount: <strong>₹${order.grand_total}.00</strong></p>
        </div>

        <p>Once paid, kindly share the screenshot on WhatsApp (+91 81900 22020). If you have already completed payment, please disregard this email.</p>
        
        ${itemsHtml}
            <div class="total-row">
                <span>Grand Total:</span>
                <span>₹${order.grand_total}.00</span>
            </div>
        </div>
        
        <div style="text-align: center;">
            <a href="https://wa.me/918190022020" class="btn btn-wa">Share Payment Screenshot</a>
        </div>
    `;
    return getEmailLayout("Sreshta Nutri Mithai", "Friendly Payment Reminder", body);
}

// 3. Payment Confirmed / Order Accepted
function getPaymentConfirmedTemplate(order, itemsHtml) {
    const body = `
        <h3 class="section-title">Payment Confirmed & Order Accepted!</h3>
        <p>Hi <strong>${order.customer_name}</strong>,</p>
        <p>Fantastic news! We have successfully verified your payment of <strong>₹${order.grand_total}.00</strong> for Order <strong>#${order.id}</strong>.</p>
        <p>Your order is now <strong>Accepted</strong>, and our kitchen chefs have started preparing your fresh sweets! We handcraft every batch with pure cow ghee and natural ingredients. We will notify you by email as soon as your order is packed and dispatched.</p>
        
        ${itemsHtml}
            <div class="total-row">
                <span>Grand Total:</span>
                <span>₹${order.grand_total}.00</span>
            </div>
        </div>
    `;
    return getEmailLayout("Sreshta Nutri Mithai", "Payment Verified & Sweets in Preparation", body);
}

// 4. Order Packed
function getOrderPackedTemplate(order, itemsHtml) {
    const body = `
        <h3 class="section-title">Order Packed & Ready for Transit!</h3>
        <p>Hi <strong>${order.customer_name}</strong>,</p>
        <p>Your Sreshta Nutri Mithai order (ID: #${order.id}) has been freshly prepared, quality-checked, and <strong>Packed</strong> securely! </p>
        <p>Our delivery partner is scheduled to pick up your package shortly. We will share your shipment tracking details and links as soon as they are generated.</p>
        
        ${itemsHtml}
            <div class="total-row">
                <span>Grand Total:</span>
                <span>₹${order.grand_total}.00</span>
            </div>
        </div>
    `;
    return getEmailLayout("Sreshta Nutri Mithai", "Fresh Batch Packed & Sealed", body);
}

// 5. Order Dispatched (Out for Delivery)
function getOrderDispatchedTemplate(order, itemsHtml) {
    const trackingId = order.tracking_id || "N/A";
    const courierName = order.courier_name || "Our Delivery Partner";
    const trackingLink = order.tracking_link || "#";

    const body = `
        <h3 class="section-title">Your Order Has Been Dispatched!</h3>
        <p>Hi <strong>${order.customer_name}</strong>,</p>
        <p>Sweets are on the way! Your order <strong>#${order.id}</strong> has been <strong>Dispatched</strong> and is out for delivery.</p>
        
        <div style="background-color: ${bgWarm}; border: 1px solid #E6DFD5; border-radius: 8px; padding: 20px; margin: 20px 0;">
            <h4 style="color: ${primaryColor}; margin-top:0; margin-bottom: 10px;">Shipment Details:</h4>
            <p style="margin: 4px 0; font-size:14px;"><strong>Courier Partner:</strong> ${courierName}</p>
            <p style="margin: 4px 0; font-size:14px;"><strong>Tracking ID:</strong> ${trackingId}</p>
        </div>

        <p>You can track your package transit status in real time by clicking the button below:</p>
        <div style="text-align: center;">
            <a href="${trackingLink}" class="btn" target="_blank">Track Delivery Status</a>
        </div>
        
        ${itemsHtml}
            <div class="total-row">
                <span>Grand Total:</span>
                <span>₹${order.grand_total}.00</span>
            </div>
        </div>
    `;
    return getEmailLayout("Sreshta Nutri Mithai", "Sweets in Transit (Shipped)", body);
}

// 6. Order Delivered / Subscription CTA
function getOrderDeliveredTemplate(order) {
    const subscriptionMessage = encodeURIComponent(
        `Hello Sreshta Nutri Mithai, I am interested in your Monthly Sweet Subscription plan. Please share the details!`
    );
    const subscriptionUrl = `https://wa.me/918190022020?text=${subscriptionMessage}`;

    const body = `
        <h3 class="section-title">Delivered! Enjoy Your Healthy Treats</h3>
        <p>Hi <strong>${order.customer_name}</strong>,</p>
        <p>Your Sreshta Nutri Mithai order (ID: #${order.id}) has been <strong>Delivered</strong> successfully!</p>
        <p>We hope you love the taste and the pure, traditional ingredients. Because our sweets are handcrafted without artificial preservatives or refined sugars, they satisfy your sweet tooth while nourishing your body.</p>
        
        <div style="background-color: rgba(226, 114, 37, 0.05); border: 2px dashed ${accentColor}; border-radius: 12px; padding: 25px; margin: 30px 0; text-align: center;">
            <h4 style="color: ${accentColor}; margin-top: 0; font-size: 18px; font-family: Georgia, serif;">🎁 Never Run Out of Healthy Sweets!</h4>
            <p style="font-size: 14px; color: var(--color-text-dark); margin: 8px 0 16px 0; line-height: 1.5;">Join our <strong>Monthly Sweet Subscription</strong> plan. Receive your favorite Nutri Ladoos and Halwas fresh at your doorstep every month at special discounted rates.</p>
            <a href="${subscriptionUrl}" class="btn btn-primary" style="margin: 0; background-color: ${primaryColor}; border: 1px solid #D4AF37;">Subscribe for Monthly Delivery</a>
        </div>

        <p>Thank you for supporting Sreshta Nutri Mithai. We'd love to hear your feedback on WhatsApp!</p>
        <div style="text-align: center;">
            <a href="https://wa.me/918190022020" class="btn btn-wa">Share Feedback on WhatsApp</a>
        </div>
    `;
    return getEmailLayout("Sreshta Nutri Mithai", "Order Delivered - Thank You!", body);
}

// Admin Notification Email
function getAdminNotificationTemplate(order, itemsHtml) {
    const body = `
        <h3 class="section-title">New Order Registered - ID #${order.id}</h3>
        <p>Hello Admin,</p>
        <p>A new order has been received from the e-commerce store. Below are the details:</p>
        
        <div style="background-color: ${bgWarm}; border: 1px solid #E6DFD5; border-radius: 8px; padding: 20px; margin: 20px 0;">
            <h4 style="color: ${primaryColor}; margin-top:0; margin-bottom: 10px;">Customer Details:</h4>
            <p style="margin: 4px 0; font-size: 14px;"><strong>Name:</strong> ${order.customer_name}</p>
            <p style="margin: 4px 0; font-size: 14px;"><strong>Phone:</strong> ${order.customer_phone}</p>
            <p style="margin: 4px 0; font-size: 14px;"><strong>Address:</strong> ${order.customer_address} - ${order.customer_pincode}</p>
        </div>

        ${itemsHtml}
            <div class="total-row">
                <span>Total Amount:</span>
                <span>₹${order.grand_total}.00</span>
            </div>
        </div>
        
        <p>Please check your Admin Dashboard to manage this order and verify payments.</p>
        <div style="text-align: center;">
            <a href="http://localhost:5000/admin/" class="btn" style="background-color: ${primaryColor};">Open Admin Portal</a>
        </div>
    `;
    return getEmailLayout("Sreshta Admin Portal", "New Order Notification", body);
}


// ==========================================================================
// API ENDPOINTS
// ==========================================================================

// 1. Submit New Order (Customer Checkout)
app.post('/api/orders', async (req, res) => {
    if (!supabase) {
        return res.status(500).json({ error: "Database not configured." });
    }

    const { name, email, phone, address, pincode, items, subtotal, shippingFee, grandTotal } = req.body;

    if (!name || !phone || !address || !pincode || !items || items.length === 0) {
        return res.status(400).json({ error: "Missing required order details." });
    }

    try {
        // Insert record into Supabase orders table
        const { data, error } = await supabase
            .from('orders')
            .insert([
                {
                    customer_name: name,
                    customer_email: email,
                    customer_phone: phone,
                    customer_address: address,
                    customer_pincode: pincode,
                    items: items,
                    subtotal: subtotal,
                    shipping_fee: shippingFee,
                    grand_total: grandTotal,
                    order_status: 'received'
                }
            ])
            .select();

        if (error) throw error;
        
        const order = data[0];
        console.log(`New order created in DB with ID: #${order.id}`);

        // Prepare email variables
        const itemsHtml = getItemsListHtml(items);
        const recipientEmail = email || 'customer@example.com';

        // Email 1: Send payment request to customer
        if (email) {
            const customerSubject = `Sreshta Nutri Mithai - Payment Request for Order #${order.id}`;
            const customerEmailBody = getPaymentRequestTemplate(order, itemsHtml);
            await sendEmail(recipientEmail, name, customerSubject, customerEmailBody);
        }

        // WhatsApp 1: Send payment request to customer
        if (phone) {
            const waBody = getWhatsAppPaymentRequest(order);
            await sendWhatsApp(phone, waBody);
        }

        // Email 2: Send alert notification to Admin
        const adminNotificationEmail = process.env.BREVO_SENDER_EMAIL || 'orders@sreshtanutrimithai.com';
        const adminSubject = `🚨 Sreshta Alert: New Order Received (#${order.id})`;
        const adminEmailBody = getAdminNotificationTemplate(order, itemsHtml);
        await sendEmail(adminNotificationEmail, "Sreshta Admin", adminSubject, adminEmailBody);

        res.status(201).json({ success: true, orderId: order.id });
    } catch (err) {
        console.error("Database Insert Error:", err.message);
        res.status(500).json({ error: "Failed to record order details." });
    }
});

// 1b. Create Razorpay Payment Order
app.post('/api/create-order', async (req, res) => {
    if (!supabase) {
        return res.status(500).json({ error: "Database not configured." });
    }

    const { name, email, phone, address, pincode, items, subtotal, shippingFee, grandTotal, isTestOrder } = req.body;

    if (!name || !phone || !address || !pincode || !items || items.length === 0) {
        return res.status(400).json({ error: "Missing required order details." });
    }

    const amountInPaise = Math.round((grandTotal || 0) * 100);
    if (amountInPaise < 100) {
        return res.status(400).json({ error: "Invalid amount. Minimum amount is 100 paise (₹1)." });
    }

    const initialStatus = isTestOrder ? 'preparing' : 'pending_payment';

    try {
        // Insert order record into Supabase
        const { data, error } = await supabase
            .from('orders')
            .insert([
                {
                    customer_name: name,
                    customer_email: email,
                    customer_phone: phone,
                    customer_address: address,
                    customer_pincode: pincode,
                    items: items,
                    subtotal: subtotal,
                    shipping_fee: shippingFee,
                    grand_total: grandTotal,
                    order_status: initialStatus
                }
            ])
            .select();

        if (error) throw error;
        
        const order = data[0];
        console.log(`Created local order #${order.id} (Test Mode: ${isTestOrder})`);

        if (isTestOrder) {
            // Trigger confirmation email
            const itemsHtml = getItemsListHtml(order.items);
            const customerEmail = order.customer_email;
            if (customerEmail && customerEmail !== 'customer@example.com') {
                const subject = `Sreshta Nutri Mithai - Payment Confirmed! (Order #${order.id})`;
                const emailBody = getPaymentConfirmedTemplate(order, itemsHtml);
                await sendEmail(customerEmail, order.customer_name, subject, emailBody);
            }

            // Trigger WhatsApp confirmation
            if (order.customer_phone) {
                const waBody = getWhatsAppPaymentConfirmed(order);
                await sendWhatsApp(order.customer_phone, waBody);
            }

            // Trigger admin notification email
            const adminNotificationEmail = process.env.BREVO_SENDER_EMAIL || 'orders@sreshtanutrimithai.com';
            const adminSubject = `🚨 Sreshta Alert: MOCK TEST Order Received (#${order.id})`;
            const adminEmailBody = getAdminNotificationTemplate(order, itemsHtml);
            await sendEmail(adminNotificationEmail, "Sreshta Admin", adminSubject, adminEmailBody);

            return res.status(201).json({
                success: true,
                is_test: true,
                local_order_id: order.id
            });
        }

        // --- Razorpay Order Flow (for real/test gateway payments) ---
        if (!razorpay) {
            return res.status(401).json({ error: "Razorpay credentials are missing or invalid." });
        }

        const options = {
            amount: amountInPaise,
            currency: 'INR',
            receipt: `order_${order.id}`
        };

        const razorpayOrder = await razorpay.orders.create(options);
        console.log(`Razorpay order ${razorpayOrder.id} created for local order #${order.id}`);

        res.status(201).json({
            success: true,
            order_id: razorpayOrder.id,
            amount: razorpayOrder.amount,
            currency: razorpayOrder.currency,
            local_order_id: order.id,
            key_id: razorpayKeyId
        });
    } catch (err) {
        console.error("Create Order Error:", err);
        if (err.statusCode === 401 || (err.error && err.error.code === 'BAD_REQUEST_ERROR' && /api key/i.test(err.error.description || ''))) {
            return res.status(401).json({ error: "Razorpay authentication failed." });
        }
        res.status(500).json({ error: "Failed to create payment order." });
    }
});

// 1c. Verify Razorpay Payment Signature
app.post('/api/verify-payment', async (req, res) => {
    if (!supabase) {
        return res.status(500).json({ error: "Database not configured." });
    }

    const { razorpay_payment_id, razorpay_order_id, razorpay_signature, local_order_id } = req.body;

    if (!razorpay_payment_id || !razorpay_order_id || !razorpay_signature || !local_order_id) {
        return res.status(400).json({ error: "Missing required payment verification fields." });
    }

    try {
        // Verify payment signature
        const crypto = require('crypto');
        const generated_signature = crypto
            .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
            .update(razorpay_order_id + "|" + razorpay_payment_id)
            .digest('hex');

        if (generated_signature !== razorpay_signature) {
            console.warn(`Signature verification failed for order #${local_order_id}`);
            return res.status(400).json({ error: "Signature mismatch. Payment not verified." });
        }

        console.log(`Payment signature verified successfully for order #${local_order_id}`);

        // Update database order_status to 'preparing' (which represents paid status)
        const { data, error } = await supabase
            .from('orders')
            .update({ order_status: 'preparing' })
            .eq('id', local_order_id)
            .select();

        if (error) throw error;
        if (data.length === 0) {
            return res.status(404).json({ error: "Order not found." });
        }

        const order = data[0];

        // Send payment confirmation email to client
        const customerEmail = order.customer_email;
        if (customerEmail && customerEmail !== 'customer@example.com') {
            const itemsHtml = getItemsListHtml(order.items);
            const subject = `Sreshta Nutri Mithai - Payment Confirmed! (Order #${order.id})`;
            const emailBody = getPaymentConfirmedTemplate(order, itemsHtml);
            await sendEmail(customerEmail, order.customer_name, subject, emailBody);
        }

        // Trigger WhatsApp confirmation
        if (order.customer_phone) {
            const waBody = getWhatsAppPaymentConfirmed(order);
            await sendWhatsApp(order.customer_phone, waBody);
        }

        // Send alert notification to Admin
        const itemsHtml = getItemsListHtml(order.items);
        const adminNotificationEmail = process.env.BREVO_SENDER_EMAIL || 'orders@sreshtanutrimithai.com';
        const adminSubject = `🚨 Sreshta Alert: PAID Order Received (#${order.id})`;
        const adminEmailBody = getAdminNotificationTemplate(order, itemsHtml);
        await sendEmail(adminNotificationEmail, "Sreshta Admin", adminSubject, adminEmailBody);

        res.json({ success: true, message: "Payment verified successfully." });
    } catch (err) {
        console.error("Verify Payment Error:", err.message);
        res.status(500).json({ error: "Failed to verify payment." });
    }
});

// 2. Admin Dashboard Login
app.post('/api/admin/login', (req, res) => {
    const { password } = req.body;
    const adminPassword = process.env.ADMIN_PASSWORD || 'SreshtaAdmin2026';

    if (password === adminPassword) {
        res.json({ success: true, token: "sreshta-admin-authenticated-session" });
    } else {
        res.status(401).json({ error: "Invalid admin password." });
    }
});

// 3. Fetch All Orders (Admin check)
app.get('/api/admin/orders', async (req, res) => {
    if (!supabase) {
        return res.status(500).json({ error: "Database not configured." });
    }

    const authHeader = req.headers.authorization;
    if (authHeader !== "Bearer sreshta-admin-authenticated-session") {
        return res.status(403).json({ error: "Access Denied." });
    }

    try {
        const { data, error } = await supabase
            .from('orders')
            .select('*')
            .order('created_at', { ascending: false });

        if (error) throw error;

        res.json({ success: true, orders: data });
    } catch (err) {
        console.error("Database Select Error:", err.message);
        res.status(500).json({ error: "Failed to fetch order list." });
    }
});

// 4. Confirm Payment (Admin button)
app.post('/api/admin/orders/:id/confirm-payment', async (req, res) => {
    if (!supabase) {
        return res.status(500).json({ error: "Database not configured." });
    }

    const authHeader = req.headers.authorization;
    if (authHeader !== "Bearer sreshta-admin-authenticated-session") {
        return res.status(403).json({ error: "Access Denied." });
    }

    const orderId = req.params.id;
    const { email } = req.body;

    try {
        // Update order status in Supabase to 'preparing' (payment verified)
        const { data, error } = await supabase
            .from('orders')
            .update({ order_status: 'preparing' })
            .eq('id', orderId)
            .select();

        if (error) throw error;
        if (data.length === 0) {
            return res.status(404).json({ error: "Order not found." });
        }

        const order = data[0];
        console.log(`Payment confirmed for Order #${orderId}`);

        // Trigger Payment Confirmed Email to customer
        const customerEmail = order.customer_email || email;
        if (customerEmail && customerEmail !== 'customer@example.com') {
            const itemsHtml = getItemsListHtml(order.items);
            const subject = `Sreshta Nutri Mithai - Payment Confirmed! (Order #${order.id})`;
            const emailBody = getPaymentConfirmedTemplate(order, itemsHtml);
            await sendEmail(customerEmail, order.customer_name, subject, emailBody);
        }

        // Trigger WhatsApp confirmation
        if (order.customer_phone) {
            const waBody = getWhatsAppPaymentConfirmed(order);
            await sendWhatsApp(order.customer_phone, waBody);
        }

        res.json({ success: true, order: order });
    } catch (err) {
        console.error("Payment Confirmation Error:", err.message);
        res.status(500).json({ error: "Failed to confirm payment on database." });
    }
});

// 5. Send Payment Reminder Email (Admin button)
app.post('/api/admin/orders/:id/send-reminder', async (req, res) => {
    if (!supabase) {
        return res.status(500).json({ error: "Database not configured." });
    }

    const authHeader = req.headers.authorization;
    if (authHeader !== "Bearer sreshta-admin-authenticated-session") {
        return res.status(403).json({ error: "Access Denied." });
    }

    const orderId = req.params.id;
    const { email } = req.body;

    try {
        // Fetch order details
        const { data, error } = await supabase
            .from('orders')
            .select('*')
            .eq('id', orderId);

        if (error) throw error;
        if (data.length === 0) {
            return res.status(404).json({ error: "Order not found." });
        }

        const order = data[0];
        console.log(`Sending payment reminder email for Order #${orderId}`);

        // Send email
        const customerEmail = order.customer_email || email;
        if (customerEmail && customerEmail !== 'customer@example.com') {
            const itemsHtml = getItemsListHtml(order.items);
            const subject = `⚠️ Sreshta Nutri Mithai - Payment Action Required (Order #${order.id})`;
            const emailBody = getPaymentReminderTemplate(order, itemsHtml);
            await sendEmail(customerEmail, order.customer_name, subject, emailBody);
        }

        // Trigger WhatsApp reminder
        if (order.customer_phone) {
            const waBody = getWhatsAppPaymentRequest(order);
            await sendWhatsApp(order.customer_phone, waBody);
        }

        res.json({ success: true, message: "Reminder email sent." });
    } catch (err) {
        console.error("Reminder trigger Error:", err.message);
        res.status(500).json({ error: "Failed to trigger reminder email." });
    }
});

// 6. Dispatch Order with Tracking Details (Admin trigger)
app.post('/api/admin/orders/:id/dispatch', async (req, res) => {
    if (!supabase) {
        return res.status(500).json({ error: "Database not configured." });
    }

    const authHeader = req.headers.authorization;
    if (authHeader !== "Bearer sreshta-admin-authenticated-session") {
        return res.status(403).json({ error: "Access Denied." });
    }

    const orderId = req.params.id;
    const { trackingId, courierName, trackingLink, email } = req.body;

    if (!trackingId || !courierName) {
        return res.status(400).json({ error: "Tracking ID and Courier Name are required." });
    }

    try {
        // Update database with status 'dispatched' and shipping tracking details
        const { data, error } = await supabase
            .from('orders')
            .update({
                order_status: 'dispatched',
                tracking_id: trackingId,
                courier_name: courierName,
                tracking_link: trackingLink || ""
            })
            .eq('id', orderId)
            .select();

        if (error) throw error;
        if (data.length === 0) {
            return res.status(404).json({ error: "Order not found." });
        }

        const order = data[0];
        console.log(`Order #${orderId} Dispatched. Tracking ID: ${trackingId}`);

        // Trigger Dispatch email to customer
        const customerEmail = order.customer_email || email;
        if (customerEmail && customerEmail !== 'customer@example.com') {
            const itemsHtml = getItemsListHtml(order.items);
            const subject = `🚚 Sweets on the Way! Sreshta Order #${order.id} Dispatched`;
            const emailBody = getOrderDispatchedTemplate(order, itemsHtml);
            await sendEmail(customerEmail, order.customer_name, subject, emailBody);
        }

        // Trigger WhatsApp dispatch details
        if (order.customer_phone) {
            const waBody = getWhatsAppOrderDispatched(order);
            await sendWhatsApp(order.customer_phone, waBody);
        }

        res.json({ success: true, order: order });
    } catch (err) {
        console.error("Dispatch Error:", err.message);
        res.status(500).json({ error: "Failed to dispatch order on database." });
    }
});

// 7. General Dropdown Update Status Endpoint (Admin panel)
// Handles other changes like 'packed' or 'delivered'
app.patch('/api/admin/orders/:id/status', async (req, res) => {
    if (!supabase) {
        return res.status(500).json({ error: "Database not configured." });
    }

    const authHeader = req.headers.authorization;
    if (authHeader !== "Bearer sreshta-admin-authenticated-session") {
        return res.status(403).json({ error: "Access Denied." });
    }

    const orderId = req.params.id;
    const { status, email } = req.body;

    try {
        const { data, error } = await supabase
            .from('orders')
            .update({ order_status: status })
            .eq('id', orderId)
            .select();

        if (error) throw error;
        if (data.length === 0) {
            return res.status(404).json({ error: "Order not found." });
        }

        const order = data[0];
        console.log(`Order #${orderId} status updated to: ${status}`);

        // Trigger specific status emails
        const customerEmail = order.customer_email || email;
        if (customerEmail && customerEmail !== 'customer@example.com') {
            const itemsHtml = getItemsListHtml(order.items);
            
            if (status === 'preparing') {
                const subject = `Sreshta Nutri Mithai - Payment Confirmed! (Order #${order.id})`;
                const emailBody = getPaymentConfirmedTemplate(order, itemsHtml);
                await sendEmail(customerEmail, order.customer_name, subject, emailBody);
            } else if (status === 'packed') {
                const subject = `📦 Fresh Batch Packed! Sreshta Order #${order.id}`;
                const emailBody = getOrderPackedTemplate(order, itemsHtml);
                await sendEmail(customerEmail, order.customer_name, subject, emailBody);
            } else if (status === 'delivered') {
                const subject = `🎉 Order Delivered Successfully! (Sreshta Order #${order.id})`;
                const emailBody = getOrderDeliveredTemplate(order);
                await sendEmail(customerEmail, order.customer_name, subject, emailBody);
            }
        }

        // Trigger WhatsApp status updates
        if (order.customer_phone) {
            let waBody = '';
            if (status === 'preparing') waBody = getWhatsAppPaymentConfirmed(order);
            else if (status === 'packed') waBody = getWhatsAppOrderPacked(order);
            else if (status === 'delivered') waBody = getWhatsAppOrderDelivered(order);
            
            if (waBody) {
                await sendWhatsApp(order.customer_phone, waBody);
            }
        }

        res.json({ success: true, order: order });
    } catch (err) {
        console.error("Database Update Error:", err.message);
        res.status(500).json({ error: "Failed to update order status." });
    }
});

// 8. Manually Send Status Notification Email (Admin trigger)
app.post('/api/admin/orders/:id/notify', async (req, res) => {
    if (!supabase) {
        return res.status(500).json({ error: "Database not configured." });
    }

    const authHeader = req.headers.authorization;
    if (authHeader !== "Bearer sreshta-admin-authenticated-session") {
        return res.status(403).json({ error: "Access Denied." });
    }

    const orderId = req.params.id;
    const { email } = req.body;

    try {
        // Fetch order details
        const { data, error } = await supabase
            .from('orders')
            .select('*')
            .eq('id', orderId);

        if (error) throw error;
        if (data.length === 0) {
            return res.status(404).json({ error: "Order not found." });
        }

        const order = data[0];
        const status = order.order_status;
        const customerEmail = order.customer_email || email;

        if (!customerEmail || customerEmail === 'customer@example.com') {
            return res.status(400).json({ error: "Valid customer email is not available for this order." });
        }

        console.log(`Manually triggering status notification email for Order #${orderId} | Status: ${status}`);

        const itemsHtml = getItemsListHtml(order.items);
        let subject = '';
        let emailBody = '';
        let successMessage = '';

        if (status === 'received' || status === 'pending_payment') {
            subject = `Sreshta Nutri Mithai - Payment Request for Order #${order.id}`;
            emailBody = getPaymentRequestTemplate(order, itemsHtml);
            successMessage = `Payment request email successfully sent to: ${customerEmail}`;
        } else if (status === 'preparing') {
            subject = `Sreshta Nutri Mithai - Payment Confirmed! (Order #${order.id})`;
            emailBody = getPaymentConfirmedTemplate(order, itemsHtml);
            successMessage = `Payment confirmation email successfully sent to: ${customerEmail}`;
        } else if (status === 'packed') {
            subject = `📦 Fresh Batch Packed! Sreshta Order #${order.id}`;
            emailBody = getOrderPackedTemplate(order, itemsHtml);
            successMessage = `Order packed notification email successfully sent to: ${customerEmail}`;
        } else if (status === 'dispatched') {
            subject = `🚚 Sweets on the Way! Sreshta Order #${order.id} Dispatched`;
            emailBody = getOrderDispatchedTemplate(order, itemsHtml);
            successMessage = `Order dispatched notification email successfully sent to: ${customerEmail}`;
        } else if (status === 'delivered') {
            subject = `🎉 Order Delivered Successfully! (Sreshta Order #${order.id})`;
            emailBody = getOrderDeliveredTemplate(order);
            successMessage = `Order delivered notification email successfully sent to: ${customerEmail}`;
        } else {
            return res.status(400).json({ error: `Cannot send email for current order status: ${status}` });
        }

        const emailResult = await sendEmail(customerEmail, order.customer_name, subject, emailBody);
        if (!emailResult.success) {
            throw new Error(emailResult.error || "Email helper failed to send email.");
        }

        // Trigger manual status WhatsApp notification in parallel
        if (order.customer_phone) {
            let waBody = '';
            if (status === 'received' || status === 'pending_payment') {
                waBody = getWhatsAppPaymentRequest(order);
            } else if (status === 'preparing') {
                waBody = getWhatsAppPaymentConfirmed(order);
            } else if (status === 'packed') {
                waBody = getWhatsAppOrderPacked(order);
            } else if (status === 'dispatched') {
                waBody = getWhatsAppOrderDispatched(order);
            } else if (status === 'delivered') {
                waBody = getWhatsAppOrderDelivered(order);
            }
            if (waBody) {
                await sendWhatsApp(order.customer_phone, waBody);
            }
        }

        res.json({ success: true, message: successMessage + " (WhatsApp status alert also sent)." });
    } catch (err) {
        console.error("Notify trigger Error:", err.message);
        res.status(500).json({ error: `Failed to trigger notification email: ${err.message}` });
    }
});

// 9. Delete Order (Admin trigger)
app.delete('/api/admin/orders/:id', async (req, res) => {
    if (!supabase) {
        return res.status(500).json({ error: "Database not configured." });
    }

    const authHeader = req.headers.authorization;
    if (authHeader !== "Bearer sreshta-admin-authenticated-session") {
        return res.status(403).json({ error: "Access Denied." });
    }

    const orderId = req.params.id;

    try {
        const { data, error } = await supabase
            .from('orders')
            .delete()
            .eq('id', orderId)
            .select();

        if (error) throw error;
        if (data.length === 0) {
            return res.status(404).json({ error: "Order not found." });
        }

        console.log(`Order #${orderId} deleted from database by admin.`);
        res.json({ success: true, message: `Order #${orderId} deleted successfully.` });
    } catch (err) {
        console.error("Delete Order Error:", err.message);
        res.status(500).json({ error: "Failed to delete order from database." });
    }
});

// 10. Bulk Delete Orders (Admin trigger)
app.post('/api/admin/orders/bulk-delete', async (req, res) => {
    if (!supabase) {
        return res.status(500).json({ error: "Database not configured." });
    }

    const authHeader = req.headers.authorization;
    if (authHeader !== "Bearer sreshta-admin-authenticated-session") {
        return res.status(403).json({ error: "Access Denied." });
    }

    const { ids } = req.body;
    if (!ids || !Array.isArray(ids) || ids.length === 0) {
        return res.status(400).json({ error: "No order IDs specified." });
    }

    try {
        const { data, error } = await supabase
            .from('orders')
            .delete()
            .in('id', ids)
            .select();

        if (error) throw error;

        console.log(`Successfully deleted ${data.length} orders from database.`);
        res.json({ success: true, message: `Successfully deleted ${data.length} orders.` });
    } catch (err) {
        console.error("Bulk Delete Orders Error:", err.message);
        res.status(500).json({ error: "Failed to delete selected orders from database." });
    }
});

// Start server
app.listen(PORT, () => {
    console.log(`Server is running locally on http://localhost:${PORT}`);
});
