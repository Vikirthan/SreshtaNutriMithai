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

const selectAllCheckbox = document.getElementById("select-all-checkbox");
const bulkActionsBar = document.getElementById("bulk-actions-bar");
const selectedCountText = document.getElementById("selected-count-text");
const btnBulkDelete = document.getElementById("btn-bulk-delete");

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

    // Setup Selection & Bulk Action events
    if (selectAllCheckbox) {
        selectAllCheckbox.addEventListener("change", toggleSelectAll);
    }
    if (btnBulkDelete) {
        btnBulkDelete.addEventListener("click", deleteSelectedOrders);
    }
    if (ordersListContainer) {
        ordersListContainer.addEventListener("change", (e) => {
            if (e.target.classList.contains("order-select-checkbox")) {
                const totalVisibleCheckboxes = document.querySelectorAll(".order-select-checkbox").length;
                const totalCheckedCheckboxes = document.querySelectorAll(".order-select-checkbox:checked").length;
                
                if (selectAllCheckbox) {
                    selectAllCheckbox.checked = (totalVisibleCheckboxes === totalCheckedCheckboxes && totalVisibleCheckboxes > 0);
                }
                updateBulkActionsUI();
            }
        });
    }
    
    // Setup Tracking Modal events
    if (trackingCancelBtn) {
        trackingCancelBtn.addEventListener("click", () => {
            trackingModal.classList.add("hidden");
            resetDispatchModal();
            filterAndRenderTable(); // resets dropdown status visual
        });
    }

    trackingForm.addEventListener("submit", (e) => {
        e.preventDefault();
        const orderId = trackingOrderIdInput.value;
        const email = trackingOrderEmailInput.value;
        const courier = inputCourierName.value.trim();
        const tracking = inputTrackingId.value.trim();
        const link = inputTrackingLink.value.trim();
        
        submitDispatchDetails(orderId, courier, tracking, link, email);
    });

    // Setup automated real-time polling for new orders (every 12 seconds)
    setInterval(() => {
        if (sessionToken) {
            fetchOrders();
        }
    }, 12000);
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
            const newOrders = data.orders || [];
            // If this is NOT the first load, check for newly arrived orders
            if (orders.length > 0) {
                const existingIds = new Set(orders.map(o => o.id));
                const newlyAddedOrders = newOrders.filter(o => !existingIds.has(o.id));
                
                if (newlyAddedOrders.length > 0) {
                    newlyAddedOrders.forEach(order => {
                        showNewOrderAlert(order);
                    });
                }
            }
            orders = newOrders;
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

// 5. Send Status Notification Trigger
async function sendCustomerNotification(orderId, email) {
    try {
        const response = await fetch(`/api/admin/orders/${orderId}/notify`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${sessionToken}`
            },
            body: JSON.stringify({ email })
        });
        
        const data = await response.json();
        if (response.ok && data.success) {
            alert(data.message || "Customer successfully notified of the current order status.");
        } else {
            alert(data.error || "Failed to notify customer.");
        }
    } catch (err) {
        console.error(err);
        alert("Server error sending notification.");
    }
}

// 6. Delete Single Order
async function deleteOrder(orderId) {
    if (!confirm(`Are you sure you want to permanently delete Order #${orderId}? This action cannot be undone.`)) {
        return;
    }
    
    try {
        const response = await fetch(`/api/admin/orders/${orderId}`, {
            method: 'DELETE',
            headers: {
                'Authorization': `Bearer ${sessionToken}`
            }
        });
        
        const data = await response.json();
        if (response.ok && data.success) {
            orders = orders.filter(o => o.id !== parseInt(orderId));
            updateMetrics();
            filterAndRenderTable();
            alert(`Order #${orderId} deleted successfully.`);
        } else {
            alert(data.error || "Failed to delete order.");
        }
    } catch (err) {
        console.error(err);
        alert("Server error deleting order.");
    }
}

// 7. Delete Selected Orders (Bulk)
async function deleteSelectedOrders() {
    const checkedBoxes = document.querySelectorAll(".order-select-checkbox:checked");
    const ids = Array.from(checkedBoxes).map(cb => parseInt(cb.getAttribute("data-id")));
    
    if (ids.length === 0) return;
    
    if (!confirm(`Are you sure you want to permanently delete these ${ids.length} selected orders? This action cannot be undone.`)) {
        return;
    }
    
    try {
        const response = await fetch('/api/admin/orders/bulk-delete', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${sessionToken}`
            },
            body: JSON.stringify({ ids })
        });
        
        const data = await response.json();
        if (response.ok && data.success) {
            orders = orders.filter(o => !ids.includes(o.id));
            updateMetrics();
            filterAndRenderTable();
            alert(`Successfully deleted ${ids.length} orders.`);
        } else {
            alert(data.error || "Failed to delete selected orders.");
        }
    } catch (err) {
        console.error(err);
        alert("Server error during bulk delete.");
    }
}

// 8. Selection State Handlers
function toggleSelectAll(e) {
    const isChecked = e.target.checked;
    const rowCheckboxes = document.querySelectorAll(".order-select-checkbox");
    rowCheckboxes.forEach(cb => {
        cb.checked = isChecked;
    });
    updateBulkActionsUI();
}

function updateBulkActionsUI() {
    const checkedBoxes = document.querySelectorAll(".order-select-checkbox:checked");
    const count = checkedBoxes.length;
    
    if (count > 0) {
        bulkActionsBar.classList.remove("hidden");
        selectedCountText.textContent = `${count} order${count > 1 ? 's' : ''} selected`;
    } else {
        bulkActionsBar.classList.add("hidden");
        if (selectAllCheckbox) selectAllCheckbox.checked = false;
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
    // Reset selection checkboxes on filter
    if (selectAllCheckbox) selectAllCheckbox.checked = false;
    if (bulkActionsBar) bulkActionsBar.classList.add("hidden");

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
                <td colspan="9" class="text-center" style="padding: 40px; color: var(--color-text-muted);">
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
        
        if (order.order_status === 'received' || order.order_status === 'preparing' || order.order_status === 'packed') {
            actionButtonsHtml += `
                <button class="btn-action-nimbus" id="nimbus-btn-${order.id}" onclick="pushToNimbusHandler(${order.id})">
                    🚀 Push to Nimbus
                </button>
            `;
        }

        actionButtonsHtml += `
            <button class="btn-action-notify" onclick="sendCustomerNotificationHandler(${order.id}, '${email}')">
                ✉️ Notify
            </button>
            <button class="btn-action-wa" onclick="sendWhatsAppViaServerHandler(${order.id})">
                💬 WhatsApp
            </button>
            <button class="btn-action-delete" onclick="deleteOrderHandler(${order.id})">
                🗑️ Delete
            </button>
        `;

        return `
            <tr>
                <td><input type="checkbox" class="order-select-checkbox" data-id="${order.id}"></td>
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
                        data-original="${order.order_status}"
                        onchange="changeOrderStatusHandler(this, ${order.id}, '${email}')"
                    >
                        <option value="received" ${order.order_status === 'received' ? 'selected' : ''}>Received</option>
                        <option value="preparing" ${order.order_status === 'preparing' ? 'selected' : ''}>Preparing</option>
                        <option value="packed" ${order.order_status === 'packed' ? 'selected' : ''}>Packed</option>
                        <option value="dispatched" ${order.order_status === 'dispatched' ? 'selected' : ''}>Dispatched</option>
                        <option value="delivered" ${order.order_status === 'delivered' ? 'selected' : ''}>Delivered</option>
                    </select>
                    <button class="btn-send-update" id="send-update-${order.id}" onclick="sendStatusUpdateHandler(${order.id}, '${email}')">
                        📤 Send Update
                    </button>
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

// Dropdown change trigger — NOW only updates DB, does NOT send notifications
window.changeOrderStatusHandler = function(selectElement, orderId, email) {
    const newStatus = selectElement.value;
    
    if (newStatus === 'dispatched') {
        // Open tracking details modal overlay
        trackingOrderIdInput.value = orderId;
        trackingOrderEmailInput.value = email;
        trackingModal.classList.remove("hidden");
    } else {
        selectElement.setAttribute("data-status", newStatus);
        updateOrderStatus(orderId, newStatus, email);
        
        // Show the "Send Update" button below the dropdown
        const sendBtn = document.getElementById(`send-update-${orderId}`);
        if (sendBtn) {
            sendBtn.classList.remove("hidden");
        }
    }
};

// Send Update button handler — sends email + WhatsApp notification for current status
window.sendStatusUpdateHandler = async function(orderId, email) {
    if (!confirm(`Send email + WhatsApp notification to customer for Order #${orderId}?`)) {
        return;
    }
    
    try {
        const response = await fetch(`/api/admin/orders/${orderId}/notify`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${sessionToken}`
            },
            body: JSON.stringify({ email })
        });
        
        const data = await response.json();
        if (response.ok && data.success) {
            alert(data.message || `Customer notified for Order #${orderId}.`);
        } else {
            alert(data.error || "Failed to send notification.");
        }
    } catch (err) {
        console.error(err);
        alert("Server error sending notification.");
    }
};

// WhatsApp via Server API handler (replaces old wa.me web link)
window.sendWhatsAppViaServerHandler = async function(orderId) {
    if (!confirm(`Send WhatsApp status message to customer for Order #${orderId} via server?`)) {
        return;
    }
    
    try {
        const response = await fetch(`/api/admin/orders/${orderId}/whatsapp`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${sessionToken}`
            },
            body: JSON.stringify({})
        });
        
        const data = await response.json();
        if (response.ok && data.success) {
            alert(data.message || `WhatsApp sent for Order #${orderId}.`);
        } else {
            alert(data.error || "Failed to send WhatsApp.");
        }
    } catch (err) {
        console.error(err);
        alert("Server error sending WhatsApp.");
    }
};

async function pushToNimbus(orderId) {
    if (!confirm(`Are you sure you want to push Order #${orderId} to NimbusPost B2C Orders page? This will sync the order to the portal for manual courier allocation and fulfillment.`)) {
        return;
    }
    
    // Disable the button to prevent multiple clicks and show loading state
    const btn = document.getElementById(`nimbus-btn-${orderId}`);
    let originalText = "";
    if (btn) {
        originalText = btn.innerHTML;
        btn.innerHTML = "⏳ Pushing...";
        btn.disabled = true;
    }
    
    try {
        const response = await fetch(`/api/admin/orders/${orderId}/push-nimbus`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${sessionToken}`
            }
        });
        
        const data = await response.json();
        if (response.ok && data.success) {
            alert(`Success! Order #${orderId} has been successfully pushed to NimbusPost B2C Orders portal. You can allocate a courier and book the shipment from your NimbusPost Seller Panel.`);
            // Fetch fresh list to update status and layout
            fetchOrders();
        } else {
            alert(`NimbusPost Error: ${data.error || "Failed to push to NimbusPost."}`);
        }
    } catch (err) {
        console.error(err);
        alert("Server error pushing order to NimbusPost.");
    } finally {
        if (btn) {
            btn.innerHTML = originalText;
            btn.disabled = false;
        }
    }
}

// Global handlers mapped to local action functions
window.pushToNimbusHandler = function(orderId) {
    pushToNimbus(orderId);
};

window.confirmOrderPaymentHandler = function(orderId, email) {
    confirmOrderPayment(orderId, email);
};

window.sendPaymentReminderHandler = function(orderId, email) {
    sendPaymentReminder(orderId, email);
};

window.sendCustomerNotificationHandler = function(orderId, email) {
    sendCustomerNotification(orderId, email);
};

window.deleteOrderHandler = function(orderId) {
    deleteOrder(orderId);
};

// WhatsApp contact helper — kept as fallback but primary flow is via server now
window.contactCustomerWhatsApp = function(phone, orderId) {
    let cleanPhone = phone.replace(/\D/g, "");
    if (cleanPhone.length === 10) {
        cleanPhone = "91" + cleanPhone;
    }
    const message = encodeURIComponent(`Hello, I am contacting you regarding your Sreshta Nutri Mithai Order #${orderId}.`);
    window.open(`https://wa.me/${cleanPhone}?text=${message}`, "_blank");
};

// ==========================================================================
// DISPATCH MODAL LOGIC
// ==========================================================================

// Reset modal to default state
window.resetDispatchModal = function() {
    // Reset manual form fields
    inputCourierName.value = "";
    inputTrackingId.value = "";
    inputTrackingLink.value = "";
};

// Web Audio API notification chime generator
function playOrderChime() {
    try {
        const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        
        // Note 1: E5
        const osc1 = audioCtx.createOscillator();
        const gain1 = audioCtx.createGain();
        osc1.connect(gain1);
        gain1.connect(audioCtx.destination);
        osc1.frequency.setValueAtTime(659.25, audioCtx.currentTime); // E5
        gain1.gain.setValueAtTime(0, audioCtx.currentTime);
        gain1.gain.linearRampToValueAtTime(0.2, audioCtx.currentTime + 0.05);
        gain1.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.4);
        osc1.start(audioCtx.currentTime);
        osc1.stop(audioCtx.currentTime + 0.4);
        
        // Note 2: A5 (delayed slightly)
        setTimeout(() => {
            const osc2 = audioCtx.createOscillator();
            const gain2 = audioCtx.createGain();
            osc2.connect(gain2);
            gain2.connect(audioCtx.destination);
            osc2.frequency.setValueAtTime(880.00, audioCtx.currentTime); // A5
            gain2.gain.setValueAtTime(0, audioCtx.currentTime);
            gain2.gain.linearRampToValueAtTime(0.2, audioCtx.currentTime + 0.05);
            gain2.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.6);
            osc2.start(audioCtx.currentTime);
            osc2.stop(audioCtx.currentTime + 0.6);
        }, 120);
        
    } catch (e) {
        console.warn("Audio Context blocked or failed to play chime:", e);
    }
}

// Function to display a premium floating toast alert on new orders
function showNewOrderAlert(order) {
    playOrderChime();
    
    const toastContainer = document.getElementById("toast-container");
    if (!toastContainer) return;
    
    const toast = document.createElement("div");
    toast.className = "toast-alert";
    
    // Build toast internal structure
    toast.innerHTML = `
        <div class="toast-icon">🔔</div>
        <div class="toast-body">
            <div class="toast-header">
                <span class="toast-title">New Order Received!</span>
                <button class="toast-close-btn" onclick="this.parentElement.parentElement.parentElement.remove()">&times;</button>
            </div>
            <div class="toast-desc">
                Order <span class="toast-highlight">#${order.id}</span> placed by <span class="toast-highlight">${order.customer_name}</span>. Total: <span class="toast-highlight">₹${order.grand_total}</span>
            </div>
        </div>
    `;
    
    toastContainer.appendChild(toast);
    
    // Auto-remove toast after 8 seconds
    setTimeout(() => {
        toast.classList.add("fade-out");
        setTimeout(() => {
            toast.remove();
        }, 300);
    }, 8000);
}

