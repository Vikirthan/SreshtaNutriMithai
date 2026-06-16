// ==========================================================================
// ADMIN DASHBOARD STATE
// ==========================================================================
let orders = [];
let sessionToken = localStorage.getItem("sreshta_admin_token") || "";

// DOM Elements
const loginOverlay = document.getElementById("login-overlay");
const loginForm = document.getElementById("admin-login-form");
const loginPass = document.getElementById("admin-pass");
const loginErrorMsg = document.getElementById("login-error-msg");
const logoutBtn = document.getElementById("admin-logout-btn");

const metricTotalOrders = document.getElementById("metric-total-orders");
const metricNewOrders = document.getElementById("metric-new-orders");
const metricPreparingOrders = document.getElementById("metric-preparing-orders");
const metricTotalRevenue = document.getElementById("metric-total-revenue");

const searchInput = document.getElementById("order-search-input");
const statusFilter = document.getElementById("status-filter");
const ordersListContainer = document.getElementById("orders-tbody-list");

// Tracking Modal Elements
const trackingModal = document.getElementById("tracking-modal");
const trackingForm = document.getElementById("tracking-form");
const trackingOrderIdInput = document.getElementById("tracking-order-id");
const trackingOrderEmailInput = document.getElementById("tracking-order-email");
const inputCourierName = document.getElementById("input-courier-name");
const inputTrackingId = document.getElementById("input-tracking-id");
const inputTrackingLink = document.getElementById("input-tracking-link");
const trackingCancelBtn = document.getElementById("tracking-cancel-btn");

// ==========================================================================
// INITIALIZATION & SESSION CONTROL
// ==========================================================================
document.addEventListener("DOMContentLoaded", () => {
    checkAuthentication();
    
    // Setup Search & Filter events
    searchInput.addEventListener("input", filterAndRenderTable);
    statusFilter.addEventListener("change", filterAndRenderTable);
    
    // Setup Tracking Modal events
    trackingCancelBtn.addEventListener("click", () => {
        trackingModal.classList.add("hidden");
        filterAndRenderTable(); // resets dropdown status visual
    });
    
    trackingForm.addEventListener("submit", (e) => {
        e.preventDefault();
        const orderId = trackingOrderIdInput.value;
        const email = trackingOrderEmailInput.value;
        const courier = inputCourierName.value.trim();
        const tracking = inputTrackingId.value.trim();
        const link = inputTrackingLink.value.trim();
        
        submitDispatchDetails(orderId, courier, tracking, link, email);
    });
});

function checkAuthentication() {
    if (sessionToken) {
        loginOverlay.classList.add("hidden");
        fetchOrders();
    } else {
        loginOverlay.classList.remove("hidden");
    }
}

// Intercept Login Form Submission
loginForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const password = loginPass.value.trim();
    loginErrorMsg.textContent = "";

    try {
        const response = await fetch('/api/admin/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ password })
        });

        const data = await response.json();
        
        if (response.ok && data.success) {
            sessionToken = data.token;
            localStorage.setItem("sreshta_admin_token", sessionToken);
            loginOverlay.classList.add("hidden");
            loginPass.value = "";
            fetchOrders();
        } else {
            loginErrorMsg.textContent = data.error || "Login failed.";
        }
    } catch (err) {
        console.error("Login request failed:", err);
        loginErrorMsg.textContent = "Server connection error.";
    }
});

// Logout Event
logoutBtn.addEventListener("click", () => {
    sessionToken = "";
    localStorage.removeItem("sreshta_admin_token");
    orders = [];
    ordersListContainer.innerHTML = "";
    loginOverlay.classList.remove("hidden");
});

// ==========================================================================
// API CALLS (GET, POST, PATCH)
// ==========================================================================
async function fetchOrders() {
    try {
        const response = await fetch('/api/admin/orders', {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${sessionToken}`
            }
        });

        if (response.status === 403 || response.status === 401) {
            localStorage.removeItem("sreshta_admin_token");
            sessionToken = "";
            loginOverlay.classList.remove("hidden");
            return;
        }

        const data = await response.json();
        if (response.ok && data.success) {
            orders = data.orders || [];
            updateMetrics();
            filterAndRenderTable();
        } else {
            alert(data.error || "Failed to retrieve orders.");
        }
    } catch (err) {
        console.error("Failed to load orders:", err);
        ordersListContainer.innerHTML = `
            <tr>
                <td colspan="8" class="text-center" style="color: var(--color-danger); padding: 40px; font-weight: 600;">
                    Error connecting to server. Please ensure the backend server is running and try again.
                </td>
            </tr>
        `;
    }
}

// 1. Confirm Payment Endpoint Trigger
async function confirmOrderPayment(orderId, email) {
    if (!confirm(`Are you sure you have verified the payment screenshot for Order #${orderId}?`)) {
        return;
    }
    
    try {
        const response = await fetch(`/api/admin/orders/${orderId}/confirm-payment`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${sessionToken}`
            },
            body: JSON.stringify({ email })
        });
        
        const data = await response.json();
        if (response.ok && data.success) {
            const index = orders.findIndex(o => o.id === parseInt(orderId));
            if (index > -1) {
                orders[index].order_status = 'preparing';
            }
            updateMetrics();
            filterAndRenderTable();
            alert(`Success! Payment confirmed for Order #${orderId}. System status updated and notification email sent.`);
        } else {
            alert(data.error || "Failed to confirm payment.");
        }
    } catch (err) {
        console.error(err);
        alert("Server communication issue. Failed to confirm payment.");
    }
}

// 2. Send Payment Reminder Trigger
async function sendPaymentReminder(orderId, email) {
    try {
        const response = await fetch(`/api/admin/orders/${orderId}/send-reminder`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${sessionToken}`
            },
            body: JSON.stringify({ email })
        });
        
        const data = await response.json();
        if (response.ok && data.success) {
            alert(`Reminder email with UPI QR code successfully sent to: ${email}`);
        } else {
            alert(data.error || "Failed to send reminder.");
        }
    } catch (err) {
        console.error(err);
        alert("Server error sending reminder.");
    }
}

// 3. Dispatch & Tracking Details Submit
async function submitDispatchDetails(orderId, courierName, trackingId, trackingLink, email) {
    try {
        const response = await fetch(`/api/admin/orders/${orderId}/dispatch`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${sessionToken}`
            },
            body: JSON.stringify({ courierName, trackingId, trackingLink, email })
        });
        
        const data = await response.json();
        if (response.ok && data.success) {
            const index = orders.findIndex(o => o.id === parseInt(orderId));
            if (index > -1) {
                orders[index].order_status = 'dispatched';
                orders[index].courier_name = courierName;
                orders[index].tracking_id = trackingId;
                orders[index].tracking_link = trackingLink;
            }
            updateMetrics();
            filterAndRenderTable();
            
            // Hide modal & reset form
            trackingModal.classList.add("hidden");
            inputCourierName.value = "";
            inputTrackingId.value = "";
            inputTrackingLink.value = "";
            
            alert(`Order #${orderId} marked as Dispatched. Customer has been notified with tracking details.`);
        } else {
            alert(data.error || "Failed to dispatch order.");
        }
    } catch (err) {
        console.error(err);
        alert("Server error submitting dispatch details.");
    }
}

// 4. Update General Status Endpoint (Packed / Delivered)
async function updateOrderStatus(orderId, newStatus, customerEmail) {
    try {
        const response = await fetch(`/api/admin/orders/${orderId}/status`, {
            method: 'PATCH',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${sessionToken}`
            },
            body: JSON.stringify({
                status: newStatus,
                email: customerEmail
            })
        });

        const data = await response.json();
        if (response.ok && data.success) {
            const index = orders.findIndex(o => o.id === parseInt(orderId));
            if (index > -1) {
                orders[index].order_status = newStatus;
            }
            updateMetrics();
            filterAndRenderTable();
            console.log(`Status synced for Order #${orderId} to: ${newStatus}`);
        } else {
            alert(data.error || "Failed to update order status.");
            fetchOrders();
        }
    } catch (err) {
        console.error("Failed to post status update:", err);
        alert("Server connection issue.");
        fetchOrders();
    }
}

// ==========================================================================
// CALCULATE & RENDER DASHBOARD KPI METRICS
// ==========================================================================
function updateMetrics() {
    let total = orders.length;
    let newCount = 0;
    let preparing = 0;
    let revenue = 0;

    orders.forEach(o => {
        if (o.order_status === 'received') newCount++;
        if (o.order_status === 'preparing') preparing++;
        
        // Sum gross value of all orders
        revenue += parseFloat(o.grand_total) || 0;
    });

    metricTotalOrders.textContent = total;
    metricNewOrders.textContent = newCount;
    metricPreparingOrders.textContent = preparing;
    metricTotalRevenue.textContent = `₹${revenue.toLocaleString('en-IN')}`;
}

// ==========================================================================
// FILTERING AND TABLE RENDERING
// ==========================================================================
function filterAndRenderTable() {
    const keyword = searchInput.value.toLowerCase().trim();
    const selectedStatus = statusFilter.value;

    const filtered = orders.filter(order => {
        // Status Filter
        if (selectedStatus !== 'all' && order.order_status !== selectedStatus) {
            return false;
        }

        // Search Keyword Filter
        if (keyword) {
            const matchesId = String(order.id).includes(keyword);
            const matchesName = order.customer_name.toLowerCase().includes(keyword);
            const matchesPhone = order.customer_phone.includes(keyword);
            const matchesAddress = order.customer_address.toLowerCase().includes(keyword);
            
            return matchesId || matchesName || matchesPhone || matchesAddress;
        }

        return true;
    });

    renderTableRows(filtered);
}

function renderTableRows(orderRecords) {
    if (orderRecords.length === 0) {
        ordersListContainer.innerHTML = `
            <tr>
                <td colspan="8" class="text-center" style="padding: 40px; color: var(--color-text-muted);">
                    No orders match your filter criteria.
                </td>
            </tr>
        `;
        return;
    }

    ordersListContainer.innerHTML = orderRecords.map(order => {
        // Format date string
        const dateObj = new Date(order.created_at);
        const formattedDate = dateObj.toLocaleDateString('en-IN', {
            day: '2-digit', month: 'short', year: 'numeric'
        }) + ' ' + dateObj.toLocaleTimeString('en-IN', {
            hour: '2-digit', minute: '2-digit'
        });

        // Format Items list details
        const itemsListHtml = order.items.map(item => {
            return `
                <li>${item.name} <span class="order-item-weight">${item.weight}</span> x ${item.quantity}</li>
            `;
        }).join('');

        // Extract customer email (if present in payload or fallback email)
        const email = order.customer_email || order.email || 'customer@example.com';

        // Dynamic Action buttons block
        let actionButtonsHtml = "";
        
        if (order.order_status === 'received') {
            actionButtonsHtml = `
                <button class="btn-action-confirm" onclick="confirmOrderPaymentHandler(${order.id}, '${email}')">
                    ✓ Confirm Pay
                </button>
                <button class="btn-action-reminder" onclick="sendPaymentReminderHandler(${order.id}, '${email}')">
                    🔔 Remind
                </button>
            `;
        }
        
        actionButtonsHtml += `
            <button class="btn-action-wa" onclick="contactCustomerWhatsApp('${order.customer_phone}', ${order.id})">
                💬 WhatsApp
            </button>
        `;

        return `
            <tr>
                <td class="order-id-col">#${order.id}</td>
                <td>${formattedDate}</td>
                <td>
                    <div class="customer-info-box">
                        <span class="cust-name">${order.customer_name}</span>
                        <span class="cust-phone">📞 ${order.customer_phone}</span>
                        <span class="cust-email">✉️ ${email}</span>
                    </div>
                </td>
                <td style="max-width: 200px; font-size: 13px; color: var(--color-text-dark);">${order.customer_address} - ${order.customer_pincode}</td>
                <td>
                    <ul class="order-items-list">
                        ${itemsListHtml}
                    </ul>
                </td>
                <td class="order-total-price">₹${order.grand_total}</td>
                <td>
                    <select 
                        class="status-selector" 
                        data-status="${order.order_status}" 
                        onchange="changeOrderStatusHandler(this, ${order.id}, '${email}')"
                    >
                        <option value="received" ${order.order_status === 'received' ? 'selected' : ''}>Received</option>
                        <option value="preparing" ${order.order_status === 'preparing' ? 'selected' : ''}>Preparing</option>
                        <option value="packed" ${order.order_status === 'packed' ? 'selected' : ''}>Packed</option>
                        <option value="dispatched" ${order.order_status === 'dispatched' ? 'selected' : ''}>Dispatched</option>
                        <option value="delivered" ${order.order_status === 'delivered' ? 'selected' : ''}>Delivered</option>
                    </select>
                </td>
                <td>
                    <div class="actions-cell-wrapper">
                        ${actionButtonsHtml}
                    </div>
                </td>
            </tr>
        `;
    }).join('');
}

// Dropdown change trigger
window.changeOrderStatusHandler = function(selectElement, orderId, email) {
    const newStatus = selectElement.value;
    
    if (newStatus === 'dispatched') {
        // Open tracking details modal overlay
        trackingOrderIdInput.value = orderId;
        trackingOrderEmailInput.value = email;
        trackingModal.classList.remove("hidden");
    } else {
        selectElement.setAttribute("data-status", newStatus); // updates visual badge class
        updateOrderStatus(orderId, newStatus, email);
    }
};

// Global handlers mapped to local action functions
window.confirmOrderPaymentHandler = function(orderId, email) {
    confirmOrderPayment(orderId, email);
};

window.sendPaymentReminderHandler = function(orderId, email) {
    sendPaymentReminder(orderId, email);
};

// WhatsApp contact helper
window.contactCustomerWhatsApp = function(phone, orderId) {
    let cleanPhone = phone.replace(/\D/g, "");
    if (cleanPhone.length === 10) {
        cleanPhone = "91" + cleanPhone; // India country code
    }
    const message = encodeURIComponent(`Hello, I am contacting you regarding your Sreshta Nutri Mithai Order #${orderId}.`);
    window.open(`https://wa.me/${cleanPhone}?text=${message}`, "_blank");
};
