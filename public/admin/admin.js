// ==========================================================================
// ADMIN DASHBOARD STATE
// ==========================================================================
let orders = [];
let currentlyFilteredOrders = [];
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

    // Setup Export events
    const btnExportXlsx = document.getElementById("btn-export-xlsx");
    const btnExportNimbus = document.getElementById("btn-export-nimbus");
    const validationCloseBtn = document.getElementById("validation-close-btn");

    if (btnExportXlsx) {
        btnExportXlsx.addEventListener("click", exportToXLSX);
    }
    if (btnExportNimbus) {
        btnExportNimbus.addEventListener("click", exportToNimbusCSV);
    }
    if (validationCloseBtn) {
        validationCloseBtn.addEventListener("click", () => {
            const modal = document.getElementById("validation-modal");
            if (modal) modal.classList.add("hidden");
        });
    }

    // Setup Manual Order Modal events
    const btnAddManualOrder = document.getElementById("btn-add-manual-order");
    const btnCloseAddOrder = document.getElementById("btn-close-add-order");
    const btnAddItemRow = document.getElementById("btn-add-item-row");
    const addOrderForm = document.getElementById("add-order-form");
    const manualSubtotalInput = document.getElementById("manual-subtotal");
    const manualShippingInput = document.getElementById("manual-shipping");
    const manualGrandTotalInput = document.getElementById("manual-grandtotal");
    const manualItemsContainer = document.getElementById("manual-items-container");

    if (btnAddManualOrder) {
        btnAddManualOrder.addEventListener("click", () => {
            document.getElementById("add-order-form").reset();
            if (manualItemsContainer) {
                manualItemsContainer.innerHTML = "";
                // Add one initial empty item row
                addManualItemRow();
            }
            if (manualSubtotalInput) manualSubtotalInput.value = "0";
            if (manualShippingInput) manualShippingInput.value = "50"; // default shipping fee
            if (manualGrandTotalInput) manualGrandTotalInput.value = "50";
            document.getElementById("add-order-modal").classList.remove("hidden");
        });
    }

    if (btnCloseAddOrder) {
        btnCloseAddOrder.addEventListener("click", () => {
            const modal = document.getElementById("add-order-modal");
            if (modal) modal.classList.add("hidden");
        });
    }

    if (btnAddItemRow) {
        btnAddItemRow.addEventListener("click", () => addManualItemRow());
    }

    if (manualShippingInput) {
        manualShippingInput.addEventListener("input", calculateManualOrderTotals);
    }

    if (addOrderForm) {
        addOrderForm.addEventListener("submit", submitManualOrder);
    }

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

    currentlyFilteredOrders = filtered;

    // Update Export UI Labels
    const exportCurrentFilter = document.getElementById("export-current-filter");
    const exportOrdersFound = document.getElementById("export-orders-found");
    if (exportCurrentFilter) {
        const statusMap = {
            'all': 'All Orders',
            'received': 'Received',
            'preparing': 'Preparing',
            'dispatched': 'Dispatched',
            'delivered': 'Delivered'
        };
        exportCurrentFilter.textContent = statusMap[selectedStatus] || selectedStatus;
    }
    if (exportOrdersFound) {
        exportOrdersFound.textContent = filtered.length;
    }

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
        const itemsListHtml = (order.items || [])
            .filter(item => item.name !== "__payment_method__")
            .map(item => {
                return `
                    <li>${item.name} <span class="order-item-weight">${item.weight || ''}</span> x ${item.quantity || item.qty || 1}</li>
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

// ==========================================================================
// EXPORT & VALIDATION LOGIC
// ==========================================================================

const clientPincodeCache = {};

async function resolvePincodeClient(pincode) {
    if (clientPincodeCache[pincode]) {
        return clientPincodeCache[pincode];
    }
    try {
        const response = await fetch(`/api/admin/resolve-pincode/${pincode}`, {
            headers: {
                'Authorization': `Bearer ${sessionToken}`
            }
        });
        if (response.ok) {
            const data = await response.json();
            if (data && data.success) {
                clientPincodeCache[pincode] = { city: data.city, state: data.state };
                return clientPincodeCache[pincode];
            }
        }
    } catch (err) {
        console.error("Failed to resolve pincode:", pincode, err);
    }
    return { city: "Kothagudem", state: "Telangana" }; // Default fallback
}

function getOrderDimensions(order) {
    let totalWeight = 0;
    const items = (order.items || []).filter(item => item.name !== "__payment_method__");
    for (const item of items) {
        const qty = parseInt(item.quantity || item.qty || 1);
        const weightStr = String(item.weight || item.name || "").toLowerCase();
        if (weightStr.includes("1kg") || weightStr.includes("1000g") || weightStr.includes("1 kg")) {
            totalWeight += 1000 * qty;
        } else {
            totalWeight += 500 * qty;
        }
    }

    const weight = totalWeight <= 500 ? 500 : 1000;
    const length = weight === 500 ? 15 : 20;
    const breadth = weight === 500 ? 15 : 20;
    const height = weight === 500 ? 10 : 12;
    
    return { weight, length, height, breadth };
}

function escapeCSVValue(val) {
    if (val === null || val === undefined) return "";
    let str = String(val);
    
    // Prevent CSV Injection (sanitize characters =, +, -, @)
    if (str.startsWith("=") || str.startsWith("+") || str.startsWith("-") || str.startsWith("@")) {
        str = "'" + str;
    }
    
    // Wrap in quotes if it contains commas, double quotes, or newlines
    if (str.includes(",") || str.includes('"') || str.includes("\n") || str.includes("\r")) {
        str = '"' + str.replace(/"/g, '""') + '"';
    }
    return str;
}

// 1. General Excel Spreadsheet Export (.xlsx)
function exportToXLSX() {
    if (currentlyFilteredOrders.length === 0) {
        alert("No orders to export.");
        return;
    }

    const data = currentlyFilteredOrders.map(order => {
        const dateObj = new Date(order.created_at);
        const formattedDate = dateObj.toLocaleString('en-IN');
        const itemsList = order.items
            .filter(item => item.name !== "__payment_method__")
            .map(item => `${item.name} (${item.weight || ''}) x ${item.quantity || item.qty || 1}`)
            .join(', ');
        const email = order.customer_email || order.email || '';

        return {
            "Order ID": `#${order.id}`,
            "Date & Time": formattedDate,
            "Customer Name": order.customer_name,
            "Customer Phone": order.customer_phone,
            "Customer Email": email,
            "Delivery Address": order.customer_address,
            "Pincode": order.customer_pincode,
            "Ordered Sweets": itemsList,
            "Subtotal": order.subtotal,
            "Shipping Fee": order.shipping_fee,
            "Grand Total": order.grand_total,
            "Order Status": order.order_status,
            "Courier Name": order.courier_name || "",
            "Tracking ID": order.tracking_id || "",
            "Tracking Link": order.tracking_link || ""
        };
    });

    const worksheet = XLSX.utils.json_to_sheet(data);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Orders");
    
    const selectedStatus = statusFilter.value;
    const filename = `Sreshta_Orders_${selectedStatus}_${new Date().toISOString().slice(0,10)}.xlsx`;
    XLSX.writeFile(workbook, filename);
}

// 2. Dedicated NimbusPost CSV Export
async function exportToNimbusCSV() {
    if (currentlyFilteredOrders.length === 0) {
        alert("No orders to export.");
        return;
    }

    const btn = document.getElementById("btn-export-nimbus");
    let originalText = "";
    if (btn) {
        originalText = btn.innerHTML;
        btn.innerHTML = "⏳ Resolving Pincodes...";
        btn.disabled = true;
    }

    try {
        // 1. Resolve all pincodes in parallel
        const resolvedLocations = await Promise.all(
            currentlyFilteredOrders.map(order => resolvePincodeClient(order.customer_pincode))
        );

        // 2. Perform validations
        const validationErrors = [];
        for (let i = 0; i < currentlyFilteredOrders.length; i++) {
            const order = currentlyFilteredOrders[i];
            const loc = resolvedLocations[i];
            const missingFields = [];

            if (!order.customer_name || !order.customer_name.trim()) {
                missingFields.push("Customer Name");
            }
            if (!order.customer_phone || !order.customer_phone.trim()) {
                missingFields.push("Phone Number");
            }
            if (!order.customer_address || !order.customer_address.trim()) {
                missingFields.push("Address");
            }
            if (!loc.city || !loc.city.trim()) {
                missingFields.push("City");
            }
            if (!loc.state || !loc.state.trim()) {
                missingFields.push("State");
            }
            if (!order.customer_pincode || !order.customer_pincode.trim()) {
                missingFields.push("Pincode");
            }
            
            // Validate product details
            const cleanItems = (order.items || []).filter(item => item.name !== "__payment_method__");
            if (cleanItems.length === 0) {
                missingFields.push("Product Name");
            } else {
                const hasMissingName = cleanItems.some(item => !item.name || !item.name.trim());
                if (hasMissingName) {
                    missingFields.push("Product Name");
                }
            }

            if (missingFields.length > 0) {
                validationErrors.push(`Order #${order.id}: Missing ${missingFields.join(", ")}`);
            }
        }

        if (validationErrors.length > 0) {
            // Show modal dialog
            const listContainer = document.getElementById("validation-errors-list");
            if (listContainer) {
                listContainer.innerHTML = validationErrors.map(err => `<div>${err}</div>`).join("");
            }
            const modal = document.getElementById("validation-modal");
            if (modal) {
                modal.classList.remove("hidden");
            }
            return;
        }

        // 3. Find max products across orders to dynamically generate SKU/Product/Quantity/Price column sets
        let maxItemsCount = 1;
        currentlyFilteredOrders.forEach(order => {
            const cleanItems = (order.items || []).filter(item => item.name !== "__payment_method__");
            if (cleanItems.length > maxItemsCount) {
                maxItemsCount = cleanItems.length;
            }
        });

        // 4. Create headers
        const headers = [
            "Order ID*",
            "Payment Type*",
            "Collectable Amount",
            "Tags",
            "Shipping First Name*",
            "Shipping Last Name",
            "Shipping Company Name",
            "Shipping Address 1*",
            "Shipping Address 2",
            "Shipping Phone Number*",
            "Shipping City*",
            "Shipping State*",
            "Shipping Pincode*",
            "Weight(gm)",
            "Length(cm)",
            "Height(cm)",
            "Breadth(cm)"
        ];

        for (let k = 1; k <= maxItemsCount; k++) {
            if (k === 1) {
                headers.push("SKU(1)", "Product(1)*", "Quantity(1)*", "Price(1)*");
            } else {
                headers.push(`SKU(${k})`, `Product(${k})`, `Quantity(${k})`, `Price(${k})`);
            }
        }

        // 5. Construct rows
        const rows = [];
        for (let i = 0; i < currentlyFilteredOrders.length; i++) {
            const order = currentlyFilteredOrders[i];
            const loc = resolvedLocations[i];
            const dims = getOrderDimensions(order);

            // Split customer name
            let firstName = "";
            let lastName = "";
            if (order.customer_name) {
                const parts = order.customer_name.trim().split(/\s+/);
                firstName = parts[0] || "";
                lastName = parts.slice(1).join(" ") || "";
            }

            // Split address
            let address1 = order.customer_address || "";
            let address2 = "";
            if (address1.includes("\n")) {
                const lines = address1.split("\n");
                address1 = lines[0].trim();
                address2 = lines.slice(1).join(", ").trim();
            }

            // Payment type and COD Amount
            const paymentMethodItem = (order.items || []).find(item => item.name === "__payment_method__");
            const paymentMethodVal = paymentMethodItem ? paymentMethodItem.value : (order.payment_method || order.payment_type || "");
            const isCOD = String(paymentMethodVal).toUpperCase() === 'COD' || String(paymentMethodVal).toUpperCase().includes('COD');
            const paymentType = isCOD ? 'COD' : 'Prepaid';
            const collectableAmount = isCOD ? (order.grand_total || 0) : 0;

            const row = [
                escapeCSVValue(order.id),
                escapeCSVValue(paymentType),
                escapeCSVValue(collectableAmount),
                "", // Tags
                escapeCSVValue(firstName),
                escapeCSVValue(lastName),
                escapeCSVValue(order.company_name || order.company || ""),
                escapeCSVValue(address1),
                escapeCSVValue(address2),
                escapeCSVValue(order.customer_phone),
                escapeCSVValue(loc.city),
                escapeCSVValue(loc.state),
                escapeCSVValue(order.customer_pincode),
                escapeCSVValue(dims.weight),
                escapeCSVValue(dims.length),
                escapeCSVValue(dims.height),
                escapeCSVValue(dims.breadth)
            ];

            // Add item SKU/Product/Quantity/Price
            const cleanItems = (order.items || []).filter(item => item.name !== "__payment_method__");
            for (let j = 0; j < maxItemsCount; j++) {
                const item = cleanItems[j];
                if (item) {
                    const itemSKU = item.sku || `sku-${order.id}-${j}`;
                    row.push(
                        escapeCSVValue(itemSKU),
                        escapeCSVValue(item.name),
                        escapeCSVValue(item.quantity || item.qty || 1),
                        escapeCSVValue(item.price || Math.round(order.grand_total / (cleanItems.length || 1)))
                    );
                } else {
                    row.push("", "", "", "");
                }
            }

            rows.push(row);
        }

        // 6. Build CSV string
        const csvContent = [
            headers.join(","),
            ...rows.map(r => r.join(","))
        ].join("\n");

        // 7. Log export activity on server
        try {
            await fetch('/api/admin/logs/export', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${sessionToken}`
                },
                body: JSON.stringify({
                    adminName: 'Sreshta Admin',
                    selectedStatus: statusFilter.value,
                    ordersCount: currentlyFilteredOrders.length
                })
            });
        } catch (logErr) {
            console.error("Failed to write export log to backend database:", logErr);
        }

        // 8. Download the CSV file
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.setAttribute("href", url);
        const selectedStatus = statusFilter.value;
        const filename = `Sreshta_NimbusPost_Export_${selectedStatus}_${new Date().toISOString().slice(0,10)}.csv`;
        link.setAttribute("download", filename);
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);

    } catch (err) {
        console.error("Export failed:", err);
        alert("Export failed: " + err.message);
    } finally {
        if (btn) {
            btn.innerHTML = originalText;
            btn.disabled = false;
        }
    }
}

// ==========================================================================
// MANUAL ORDER CREATION LOGIC
// ==========================================================================

function addManualItemRow(name = "", weight = "", price = 0, quantity = 1) {
    const container = document.getElementById("manual-items-container");
    if (!container) return;

    const row = document.createElement("div");
    row.className = "manual-item-row";
    row.style.display = "grid";
    row.style.gridTemplateColumns = "2fr 1fr 1fr 1fr auto";
    row.style.gap = "8px";
    row.style.alignItems = "center";
    row.style.marginBottom = "8px";

    row.innerHTML = `
        <input type="text" class="item-name" required placeholder="Product Name" value="${name}" style="width: 100%; padding: 8px; border: 1px solid var(--color-border-warm); border-radius: 4px;">
        <input type="text" class="item-weight" placeholder="e.g. 500g" value="${weight}" style="width: 100%; padding: 8px; border: 1px solid var(--color-border-warm); border-radius: 4px;">
        <input type="number" class="item-price" required min="0" placeholder="Price" value="${price || ''}" style="width: 100%; padding: 8px; border: 1px solid var(--color-border-warm); border-radius: 4px;">
        <input type="number" class="item-qty" required min="1" value="${quantity}" style="width: 100%; padding: 8px; border: 1px solid var(--color-border-warm); border-radius: 4px;">
        <button type="button" class="btn-delete-row" style="background: none; border: none; color: var(--color-danger); cursor: pointer; font-size: 18px; padding: 0 4px;">✕</button>
    `;

    const priceInput = row.querySelector(".item-price");
    const qtyInput = row.querySelector(".item-qty");
    const deleteBtn = row.querySelector(".btn-delete-row");

    priceInput.addEventListener("input", calculateManualOrderTotals);
    qtyInput.addEventListener("input", calculateManualOrderTotals);
    
    deleteBtn.addEventListener("click", () => {
        const totalRows = container.querySelectorAll(".manual-item-row").length;
        if (totalRows > 1) {
            row.remove();
            calculateManualOrderTotals();
        } else {
            alert("An order must contain at least one product item.");
        }
    });

    container.appendChild(row);
    calculateManualOrderTotals();
}

function calculateManualOrderTotals() {
    const container = document.getElementById("manual-items-container");
    if (!container) return;

    let subtotal = 0;
    const rows = container.querySelectorAll(".manual-item-row");
    rows.forEach(row => {
        const price = parseFloat(row.querySelector(".item-price").value) || 0;
        const qty = parseInt(row.querySelector(".item-qty").value) || 0;
        subtotal += price * qty;
    });

    const subtotalInput = document.getElementById("manual-subtotal");
    const shippingInput = document.getElementById("manual-shipping");
    const grandtotalInput = document.getElementById("manual-grandtotal");

    const shipping = parseFloat(shippingInput ? shippingInput.value : 0) || 0;
    
    if (subtotalInput) subtotalInput.value = subtotal;
    if (grandtotalInput) grandtotalInput.value = subtotal + shipping;
}

async function submitManualOrder(e) {
    e.preventDefault();

    const name = document.getElementById("manual-cust-name").value.trim();
    const phone = document.getElementById("manual-cust-phone").value.trim();
    const email = document.getElementById("manual-cust-email").value.trim();
    const pincode = document.getElementById("manual-cust-pincode").value.trim();
    const address = document.getElementById("manual-cust-address").value.trim();
    
    const subtotal = parseFloat(document.getElementById("manual-subtotal").value) || 0;
    const shippingFee = parseFloat(document.getElementById("manual-shipping").value) || 0;
    const grandTotal = parseFloat(document.getElementById("manual-grandtotal").value) || 0;

    const paymentType = document.getElementById("manual-payment-type").value;
    const orderStatus = document.getElementById("manual-order-status").value;

    const items = [];
    const itemRows = document.querySelectorAll(".manual-item-row");
    itemRows.forEach((row, index) => {
        const itemName = row.querySelector(".item-name").value.trim();
        const itemWeight = row.querySelector(".item-weight").value.trim() || "500g";
        const itemPrice = parseFloat(row.querySelector(".item-price").value) || 0;
        const itemQty = parseInt(row.querySelector(".item-qty").value) || 1;

        items.push({
            name: itemName,
            weight: itemWeight,
            price: itemPrice,
            quantity: itemQty,
            sku: `sku-manual-${Date.now()}-${index}`
        });
    });

    if (items.length === 0) {
        alert("Please add at least one item to the order.");
        return;
    }

    const submitBtn = e.target.querySelector("button[type='submit']");
    const originalText = submitBtn.innerHTML;
    submitBtn.innerHTML = "⏳ Creating Order...";
    submitBtn.disabled = true;

    try {
        const response = await fetch('/api/admin/orders', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${sessionToken}`
            },
            body: JSON.stringify({
                name,
                email,
                phone,
                address,
                pincode,
                items,
                subtotal,
                shippingFee,
                grandTotal,
                paymentType,
                orderStatus
            })
        });

        const data = await response.json();
        if (response.ok && data.success) {
            alert(`Success! Manual Order #${data.orderId} created successfully.`);
            document.getElementById("add-order-modal").classList.add("hidden");
            fetchOrders();
        } else {
            alert(data.error || "Failed to create order.");
        }
    } catch (err) {
        console.error(err);
        alert("Server error occurred while creating order.");
    } finally {
        submitBtn.innerHTML = originalText;
        submitBtn.disabled = false;
    }
}

