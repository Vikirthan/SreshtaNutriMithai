// ==========================================================================
// PRODUCT CATALOG CONFIGURATION
// ==========================================================================
const PRODUCTS = [
    {
        id: "nutri-ladoo",
        name: "Nutri Ladoo",
        image: "images/nutri_ladoo.png",
        rating: 4.9,
        reviewsCount: 148,
        desc: "High-protein, nutrient-rich seed balls sweetened naturally with premium dates and organic jaggery.",
        badge: "Best Seller",
        ingredients: "Organic Jaggery, Almonds, Cashews, Pistachios, Pumpkin seeds, Sunflower seeds, Flax seeds, A2 Ghee, Cardamom.",
        variants: {
            "500g": { price: 500, label: "500g (₹500)" },
            "1kg": { price: 1000, label: "1kg (₹1000)" }
        }
    },
    {
        id: "madugula-halwa",
        name: "Madugula Halwa",
        image: "images/madugula_halwa.png",
        rating: 4.8,
        reviewsCount: 98,
        desc: "Authentic, rich, dark wheat-milk halwa sweetened with organic jaggery and packed with whole roasted cashews.",
        badge: "Heritage Sweet",
        ingredients: "Fermented Wheat Milk Extraction (Godhuma Palu), Pure Cow Ghee, Organic Jaggery, Roasted Cashew Nuts, Cardamom.",
        variants: {
            "500g": { price: 500, label: "500g (₹500)" },
            "1kg": { price: 1000, label: "1kg (₹1000)" }
        }
    },
    {
        id: "pootharekulu",
        name: "Putha re Kulu",
        image: "images/pootharekulu.png",
        rating: 4.9,
        reviewsCount: 185,
        desc: "Atreyapuram heritage paper-thin rice starch wafer rolls stuffed with organic jaggery, pure ghee, and dry fruits.",
        badge: "Staff Pick",
        ingredients: "Thin Rice Starch Sheets, Pure Cow Ghee, Powdered Organic Jaggery, Crushed Cashews, Pistachios, Almonds.",
        variants: {
            "500g": { price: 500, label: "500g (₹500)" },
            "1kg": { price: 1000, label: "1kg (₹1000)" }
        }
    },
    {
        id: "choco-bites",
        name: "Choco Bites",
        image: "images/choco_bites.png",
        rating: 4.7,
        reviewsCount: 76,
        desc: "Premium cocoa energy squares blended with dry fruits, crunchy seeds, almond butter, and raw honey.",
        badge: "Antioxidant Rich",
        ingredients: "Dark Cocoa, Organic Honey, Rolled Oats, Almond Butter, Soft Dates, Sunflower Seeds, Chia Seeds, Pink Salt.",
        variants: {
            "500g": { price: 500, label: "500g (₹500)" },
            "1kg": { price: 1000, label: "1kg (₹1000)" }
        }
    }
];

const SHIPPING_THRESHOLD = 799;
const FLAT_SHIPPING_FEE = 60;
const CLIENT_WHATSAPP_NUMBER = "918190022020"; // standard format with country code (91 for India)

// ==========================================================================
// STATE MANAGEMENT
// ==========================================================================
let cart = [];

// Initialize Cart state on page load
function initCart() {
    const savedCart = localStorage.getItem("sreshta_cart");
    if (savedCart) {
        try {
            cart = JSON.parse(savedCart);
        } catch (e) {
            cart = [];
        }
    }
    updateCartUI();
}

function saveCart() {
    localStorage.setItem("sreshta_cart", JSON.stringify(cart));
    updateCartUI();
}

// ==========================================================================
// DOM ELEMENT SELECTORS
// ==========================================================================
const cartDrawer = document.getElementById("cart-drawer");
const cartTrigger = document.getElementById("cart-trigger");
const cartClose = document.getElementById("cart-close");
const pageOverlay = document.getElementById("page-overlay");

const checkoutModal = document.getElementById("checkout-modal");
const modalClose = document.getElementById("modal-close");
const checkoutTriggerBtn = document.getElementById("checkout-trigger-btn");
const cartContinueShopping = document.getElementById("cart-continue-shopping");

const checkoutForm = document.getElementById("order-checkout-form");
const checkoutItemsSummary = document.getElementById("checkout-items-summary");
const checkoutGrandTotalDisplay = document.getElementById("checkout-grandtotal-display");

// ==========================================================================
// UI DRAWERS & MODALS TOGGLERS
// ==========================================================================
function toggleCartDrawer(open) {
    if (open) {
        cartDrawer.classList.add("active");
        pageOverlay.classList.add("active");
        document.body.style.overflow = "hidden"; // Prevent background scroll
    } else {
        cartDrawer.classList.remove("active");
        if (!checkoutModal.classList.contains("active")) {
            pageOverlay.classList.remove("active");
            document.body.style.overflow = "";
        }
    }
}

function toggleCheckoutModal(open) {
    if (open) {
        populateCheckoutSummary();
        checkoutModal.classList.add("active");
        pageOverlay.classList.add("active");
        document.body.style.overflow = "hidden";
        // Close cart drawer to focus on form
        cartDrawer.classList.remove("active");
    } else {
        checkoutModal.classList.remove("active");
        pageOverlay.classList.remove("active");
        document.body.style.overflow = "";
    }
}

// Event Listeners for controls
cartTrigger.addEventListener("click", () => toggleCartDrawer(true));
cartClose.addEventListener("click", () => toggleCartDrawer(false));
cartContinueShopping.addEventListener("click", () => toggleCartDrawer(false));

checkoutTriggerBtn.addEventListener("click", () => {
    if (cart.length === 0) return;
    toggleCheckoutModal(true);
});

modalClose.addEventListener("click", () => toggleCheckoutModal(false));

pageOverlay.addEventListener("click", () => {
    toggleCartDrawer(false);
    toggleCheckoutModal(false);
});

// ==========================================================================
// PRODUCT LIST RENDERING & LOCAL INTERACTIONS
// ==========================================================================
function renderProducts() {
    const container = document.getElementById("product-list-container");
    if (!container) return;
    
    container.innerHTML = PRODUCTS.map(product => {
        // Default size is 500g, default qty is 1
        const defaultSize = "500g";
        const defaultPrice = product.variants[defaultSize].price;
        
        return `
            <div class="product-card" data-id="${product.id}">
                <div class="product-image-container">
                    <span class="product-badge">${product.badge}</span>
                    <img src="${product.image}" alt="${product.name}" class="product-card-img" onerror="this.src='images/hero_bg.png'">
                </div>
                
                <div class="product-details">
                    <div class="product-rating">
                        <span class="product-rating-stars">★★★★★</span>
                        <span class="product-reviews-count">(${product.reviewsCount} reviews)</span>
                    </div>
                    
                    <h3 class="product-name">${product.name}</h3>
                    <p class="product-description">${product.desc}</p>
                    
                    <!-- Variant Weight Selectors -->
                    <div class="product-variants">
                        <span class="variant-label">Choose Weight:</span>
                        <div class="variant-options-group">
                            <button type="button" class="variant-btn active" data-weight="500g" data-price="${product.variants['500g'].price}">500g</button>
                            <button type="button" class="variant-btn" data-weight="1kg" data-price="${product.variants['1kg'].price}">1kg</button>
                        </div>
                    </div>
                    
                    <!-- Ingredients accordian -->
                    <div class="product-ingredients-accordian">
                        <div class="ingredients-header" onclick="toggleIngredients(this)">
                            <span>\u{1F4CB} Ingredients & Health Benefits</span>
                            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg>
                        </div>
                        <div class="ingredients-body">
                            <p class="ingredients-list-items"><strong>Ingredients:</strong> ${product.ingredients}</p>
                        </div>
                    </div>
                    
                    <!-- Buy Controls -->
                    <div class="product-buy-row">
                        <div class="product-price-box">
                            <span class="product-price-display">₹${defaultPrice}</span>
                            <span class="product-price-weight" data-weight-label>for 500g</span>
                        </div>
                        
                        <div class="buy-action-controls">
                            <div class="quantity-selector">
                                <button type="button" class="qty-btn" onclick="adjustCardQuantity(this, -1)">-</button>
                                <input type="number" class="qty-input" value="1" min="1" max="10" readonly>
                                <button type="button" class="qty-btn" onclick="adjustCardQuantity(this, 1)">+</button>
                            </div>
                            
                            <button type="button" class="btn btn-primary btn-sm" onclick="addToCartHandler(this)">Add To Cart</button>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }).join('');

    // Setup variant button click listeners
    const cards = document.querySelectorAll(".product-card");
    cards.forEach(card => {
        const variantButtons = card.querySelectorAll(".variant-btn");
        variantButtons.forEach(btn => {
            btn.addEventListener("click", () => {
                // Remove active class from sibling buttons
                variantButtons.forEach(b => b.classList.remove("active"));
                btn.classList.add("active");
                
                // Update price display
                const selectedPrice = btn.getAttribute("data-price");
                const selectedWeight = btn.getAttribute("data-weight");
                
                const priceDisplay = card.querySelector(".product-price-display");
                const weightLabel = card.querySelector("[data-weight-label]");
                
                priceDisplay.textContent = `₹${selectedPrice}`;
                weightLabel.textContent = `for ${selectedWeight}`;
            });
        });
    });
}

// Global accordian toggle
window.toggleIngredients = function(headerElement) {
    headerElement.classList.toggle("active");
    const body = headerElement.nextElementSibling;
    body.classList.toggle("active");
};

// Quantity adjust buttons on the product card
window.adjustCardQuantity = function(btn, step) {
    const container = btn.closest(".quantity-selector");
    const input = container.querySelector(".qty-input");
    let val = parseInt(input.value) + step;
    if (val < 1) val = 1;
    if (val > 10) val = 10;
    input.value = val;
};

// Handler for adding to cart
window.addToCartHandler = function(btn) {
    const card = btn.closest(".product-card");
    const id = card.getAttribute("data-id");
    const name = card.querySelector(".product-name").textContent;
    const image = card.querySelector(".product-card-img").getAttribute("src");
    
    // Find active variant details
    const activeVariantBtn = card.querySelector(".variant-btn.active");
    const weight = activeVariantBtn.getAttribute("data-weight");
    const price = parseInt(activeVariantBtn.getAttribute("data-price"));
    
    // Get quantity value
    const qtyInput = card.querySelector(".qty-input");
    const quantity = parseInt(qtyInput.value);
    
    addToCart(id, name, weight, price, quantity, image);
    
    // Reset quantity input to 1
    qtyInput.value = 1;
};

// ==========================================================================
// CART OPERATIONS
// ==========================================================================
function addToCart(id, name, weight, price, quantity, image) {
    // Unique key: id + weight (since Nutri Ladoo 500g and Nutri Ladoo 1kg are separate items)
    const existingIndex = cart.findIndex(item => item.id === id && item.weight === weight);
    
    if (existingIndex > -1) {
        cart[existingIndex].quantity += quantity;
        if (cart[existingIndex].quantity > 15) {
            cart[existingIndex].quantity = 15; // Max limit per variant line
        }
    } else {
        cart.push({ id, name, weight, price, quantity, image });
    }
    
    saveCart();
    toggleCartDrawer(true);
}

window.adjustCartItemQuantity = function(index, step) {
    cart[index].quantity += step;
    if (cart[index].quantity < 1) {
        cart.splice(index, 1);
    }
    saveCart();
};

window.removeCartItem = function(index) {
    cart.splice(index, 1);
    saveCart();
};

// ==========================================================================
// UI UPDATE: BADGES, PROGRESS BARS, TOTALS
// ==========================================================================
function updateCartUI() {
    const cartBadge = document.getElementById("cart-badge");
    const cartTotalItems = document.getElementById("cart-total-items");
    const cartItemsContainer = document.getElementById("cart-items-container");
    const cartEmpty = document.getElementById("cart-empty");
    const cartSummaryFooter = document.getElementById("cart-summary-footer");
    
    const cartSubtotal = document.getElementById("cart-subtotal");
    const cartShipping = document.getElementById("cart-shipping");
    const cartGrandtotal = document.getElementById("cart-grandtotal");
    
    const trackerMsg = document.getElementById("shipping-tracker-msg");
    const progressBar = document.getElementById("shipping-progress");
    
    // Calculate totals
    let totalItems = 0;
    let subtotal = 0;
    
    cart.forEach(item => {
        totalItems += item.quantity;
        subtotal += item.price * item.quantity;
    });
    
    // Badges update
    cartBadge.textContent = totalItems;
    cartTotalItems.textContent = totalItems;
    
    if (cart.length === 0) {
        cartEmpty.style.display = "flex";
        cartSummaryFooter.style.display = "none";
        cartItemsContainer.innerHTML = "";
        
        // Shipping progress bar reset
        trackerMsg.innerHTML = `Add <strong>₹${SHIPPING_THRESHOLD}.00</strong> more to qualify for <strong>FREE Shipping!</strong>`;
        progressBar.style.width = "0%";
        return;
    }
    
    cartEmpty.style.display = "none";
    cartSummaryFooter.style.display = "block";
    
    // Render item rows
    cartItemsContainer.innerHTML = cart.map((item, index) => {
        return `
            <div class="cart-item">
                <div class="cart-item-img-box">
                    <img src="${item.image}" alt="${item.name}" class="cart-item-img" onerror="this.src='images/hero_bg.png'">
                </div>
                
                <div class="cart-item-details-box">
                    <h4 class="cart-item-name">${item.name}</h4>
                    <span class="cart-item-weight">${item.weight}</span>
                    
                    <div class="cart-item-controls">
                        <div class="quantity-selector">
                            <button type="button" class="qty-btn" onclick="adjustCartItemQuantity(${index}, -1)">-</button>
                            <input type="number" class="qty-input" value="${item.quantity}" readonly>
                            <button type="button" class="qty-btn" onclick="adjustCartItemQuantity(${index}, 1)">+</button>
                        </div>
                        
                        <div class="cart-item-price">₹${item.price * item.quantity}</div>
                    </div>
                </div>
                
                <button type="button" class="cart-item-remove-btn" onclick="removeCartItem(${index})" aria-label="Remove item">
                    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>
                </button>
            </div>
        `;
    }).join('');
    
    // Shipping Calculation & Progress Bar
    let shippingFee = FLAT_SHIPPING_FEE;
    if (subtotal >= SHIPPING_THRESHOLD) {
        shippingFee = 0;
        trackerMsg.innerHTML = `\u{1F389} Congratulations! You qualify for <strong>FREE Shipping!</strong>`;
        progressBar.style.width = "100%";
    } else {
        const remaining = SHIPPING_THRESHOLD - subtotal;
        const percent = Math.min((subtotal / SHIPPING_THRESHOLD) * 100, 100);
        trackerMsg.innerHTML = `You are only <strong>₹${remaining}.00</strong> away from <strong>FREE Shipping!</strong>`;
        progressBar.style.width = `${percent}%`;
    }
    
    const grandTotal = subtotal + shippingFee;
    
    // Apply texts
    cartSubtotal.textContent = `₹${subtotal}.00`;
    cartShipping.textContent = shippingFee === 0 ? "FREE" : `₹${shippingFee}.00`;
    cartGrandtotal.textContent = `₹${grandTotal}.00`;
}

// ==========================================================================
// CHECKOUT FORM POPULATE & WHATSAPP REDIRECT SYSTEM
// ==========================================================================
function populateCheckoutSummary() {
    let subtotal = 0;
    cart.forEach(item => {
        subtotal += item.price * item.quantity;
    });
    
    let shippingFee = subtotal >= SHIPPING_THRESHOLD ? 0 : FLAT_SHIPPING_FEE;
    let grandTotal = subtotal + shippingFee;
    
    // Render list in modal
    checkoutItemsSummary.innerHTML = cart.map(item => {
        return `
            <div class="summary-item-row">
                <span>${item.name} (${item.weight}) x ${item.quantity}</span>
                <span>₹${item.price * item.quantity}</span>
            </div>
        `;
    }).join('');
    
    // Add shipping cost row if applicable
    if (shippingFee > 0) {
        checkoutItemsSummary.innerHTML += `
            <div class="summary-item-row" style="color: var(--color-text-muted); font-style: italic;">
                <span>Flat Shipping Fee</span>
                <span>₹${shippingFee}</span>
            </div>
        `;
    } else {
        checkoutItemsSummary.innerHTML += `
            <div class="summary-item-row" style="color: var(--color-success); font-style: italic;">
                <span>Shipping Fee</span>
                <span>FREE</span>
            </div>
        `;
    }
    
    checkoutGrandTotalDisplay.textContent = `₹${grandTotal}.00`;
}

// Form Submission Event
checkoutForm.addEventListener("submit", (e) => {
    e.preventDefault();
    
    const name = document.getElementById("cust-name").value.trim();
    const email = document.getElementById("cust-email").value.trim();
    const phone = document.getElementById("cust-phone").value.trim();
    const pincode = document.getElementById("cust-pincode").value.trim();
    const address = document.getElementById("cust-address").value.trim();
    
    // Calculations for bill
    let subtotal = 0;
    cart.forEach(item => {
        subtotal += item.price * item.quantity;
    });
    let shippingFee = subtotal >= SHIPPING_THRESHOLD ? 0 : FLAT_SHIPPING_FEE;
    let grandTotal = subtotal + shippingFee;
    
    // Submit order details to the backend
    const orderData = {
        name,
        email,
        phone,
        pincode,
        address,
        items: cart,
        subtotal,
        shippingFee,
        grandTotal
    };

    const submitBtn = document.getElementById("checkout-submit-btn");
    const originalBtnText = submitBtn.innerHTML;
    submitBtn.disabled = true;
    submitBtn.innerHTML = "Initiating Secure Payment...";

    fetch('/api/create-order', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(orderData)
    })
    .then(res => {
        if (!res.ok) {
            throw new Error("Failed to create order on server.");
        }
        return res.json();
    })
    .then(data => {
        // Read public key ID from Vite client environment variable
        const keyId = import.meta.env.VITE_RAZORPAY_KEY_ID;
        if (!keyId) {
            throw new Error("VITE_RAZORPAY_KEY_ID environment variable is missing.");
        }

        const options = {
            key: keyId,
            amount: data.amount,
            currency: data.currency,
            name: "Sreshta Nutri Mithai",
            description: "Handcrafted Healthy Indian Sweets",
            image: "images/logo.png",
            order_id: data.order_id,
            handler: function (response) {
                // Verify payment signature on backend
                submitBtn.disabled = true;
                submitBtn.innerHTML = "Verifying Payment...";
                
                fetch('/api/verify-payment', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        razorpay_payment_id: response.razorpay_payment_id,
                        razorpay_order_id: response.razorpay_order_id,
                        razorpay_signature: response.razorpay_signature,
                        local_order_id: data.local_order_id
                    })
                })
                .then(verifyRes => {
                    if (!verifyRes.ok) {
                        throw new Error("Payment verification failed on server.");
                    }
                    return verifyRes.json();
                })
                .then(() => {
                    // Clear cart and clean state
                    cart = [];
                    saveCart();
                    
                    // Close modal
                    toggleCheckoutModal(false);
                    
                    // Show success confirmation message
                    alert(`Thank you! Your payment is successful and order #${data.local_order_id} has been placed.`);
                })
                .catch(verifyErr => {
                    console.error("Verification error:", verifyErr);
                    alert(`Payment was successful, but verification failed: ${verifyErr.message}. Please contact support with Payment ID: ${response.razorpay_payment_id}`);
                })
                .finally(() => {
                    submitBtn.disabled = false;
                    submitBtn.innerHTML = originalBtnText;
                });
            },
            prefill: {
                name: name,
                email: email,
                contact: phone
            },
            theme: {
                color: "#3E2718"
            },
            modal: {
                ondismiss: function () {
                    alert("Payment checkout was cancelled.");
                    submitBtn.disabled = false;
                    submitBtn.innerHTML = originalBtnText;
                }
            }
        };

        const rzp = new Razorpay(options);
        rzp.on('payment.failed', function (response) {
            alert(`Payment failed: ${response.error.description}`);
            submitBtn.disabled = false;
            submitBtn.innerHTML = originalBtnText;
        });
        rzp.open();
    })
    .catch(err => {
        console.error("Order creation failed:", err);
        alert(`Failed to initiate payment: ${err.message}`);
        submitBtn.disabled = false;
        submitBtn.innerHTML = originalBtnText;
    })
    .finally(() => {
        // Only reset if we didn't successfully launch Razorpay modal (since data.order_id launches asynchronous payment flow)
    });
});

// ==========================================================================
// APPLICATION INITIALIZATION
// ==========================================================================
document.addEventListener("DOMContentLoaded", () => {
    renderProducts();
    initCart();
});
