'use strict';

// --- State ---
let cartId = null;
let cartItems = [];
let cartData = null;
let currentFilter = null;

const API_BASE = '/api';

// --- Init ---
document.addEventListener('DOMContentLoaded', async () => {
  await initCart();
  await loadProducts();
});

// --- API Helpers ---
async function apiGet(path) {
  const res = await fetch(`${API_BASE}${path}`);
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || `Request failed: ${res.status}`);
  }
  return res.json();
}

async function apiPost(path, body) {
  const res = await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || `Request failed: ${res.status}`);
  }
  return res.json();
}

async function apiPut(path, body) {
  const res = await fetch(`${API_BASE}${path}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || `Request failed: ${res.status}`);
  }
  return res.json();
}

async function apiDelete(path) {
  const res = await fetch(`${API_BASE}${path}`, { method: 'DELETE' });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || `Request failed: ${res.status}`);
  }
  return res.json();
}

// --- Cart ---
async function initCart() {
  // Try to restore cart from localStorage
  const savedCartId = localStorage.getItem('cartId');
  if (savedCartId) {
    try {
      const data = await apiGet(`/cart/${savedCartId}`);
      cartId = savedCartId;
      cartData = data.cart;
      cartItems = data.cart.items;
      updateCartBadge();
      return;
    } catch (e) {
      // Cart expired or invalid, create a new one
      localStorage.removeItem('cartId');
    }
  }
  // Create new cart
  const data = await apiPost('/cart', {});
  cartId = data.cart.id;
  localStorage.setItem('cartId', cartId);
  cartData = data.cart;
  cartItems = [];
}

function updateCartBadge() {
  const badge = document.getElementById('cart-badge');
  const count = cartItems.reduce((sum, item) => sum + item.quantity, 0);
  badge.textContent = count;
  badge.classList.toggle('hidden', count === 0);
}

async function addToCart(productId) {
  const sizeSelect = document.getElementById(`size-${productId}`);
  const size = sizeSelect ? sizeSelect.value : 'M';

  try {
    const data = await apiPost(`/cart/${cartId}/items`, { productId, quantity: 1, size });
    cartData = data.cart;
    cartItems = data.cart.items;
    updateCartBadge();
    showToast(`Added to cart!`, 'success');
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function updateCartItemQty(itemId, delta) {
  const item = cartItems.find((i) => i.id === itemId);
  if (!item) return;

  const newQty = item.quantity + delta;
  try {
    if (newQty <= 0) {
      const data = await apiDelete(`/cart/${cartId}/items/${itemId}`);
      cartData = data.cart;
      cartItems = data.cart.items;
    } else {
      const data = await apiPut(`/cart/${cartId}/items/${itemId}`, { quantity: newQty });
      cartData = data.cart;
      cartItems = data.cart.items;
    }
    updateCartBadge();
    renderCart();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function removeCartItem(itemId) {
  try {
    const data = await apiDelete(`/cart/${cartId}/items/${itemId}`);
    cartData = data.cart;
    cartItems = data.cart.items;
    updateCartBadge();
    renderCart();
    showToast('Item removed', 'success');
  } catch (err) {
    showToast(err.message, 'error');
  }
}

// --- Products ---
async function loadProducts(category = null) {
  const grid = document.getElementById('products-grid');
  grid.innerHTML = '<div class="loading">Loading products...</div>';

  try {
    const url = category ? `/products?category=${category}` : '/products';
    const data = await apiGet(url);
    renderProducts(data.products);
  } catch (err) {
    grid.innerHTML = `<div class="loading">Error loading products: ${err.message}</div>`;
  }
}

function renderProducts(products) {
  const grid = document.getElementById('products-grid');

  if (products.length === 0) {
    grid.innerHTML = '<div class="loading">No products found.</div>';
    return;
  }

  grid.innerHTML = products
    .map(
      (p) => `
    <div class="product-card">
      <div class="product-image">${p.image}</div>
      <div class="product-name">${p.name}</div>
      <div class="product-description">${p.description}</div>
      <div class="product-meta">
        <span class="product-price">$${p.price.toFixed(2)}</span>
        <span class="product-stock ${p.inStock ? 'in-stock' : 'out-of-stock'}">
          ${p.inStock ? '✓ In Stock' : '✗ Out of Stock'}
        </span>
      </div>
      <div class="product-options">
        <select id="size-${p.id}">
          ${p.sizes.map((s) => `<option value="${s}">${s}</option>`).join('')}
        </select>
      </div>
      <button class="btn btn-primary" onclick="addToCart('${p.id}')" ${!p.inStock ? 'disabled' : ''}>
        ${p.inStock ? 'Add to Cart' : 'Sold Out'}
      </button>
    </div>
  `
    )
    .join('');
}

function filterProducts(category) {
  currentFilter = category;
  // Update filter buttons
  document.querySelectorAll('.filter-btn').forEach((btn) => {
    btn.classList.toggle('active', 
      (category === null && btn.textContent.trim() === 'All') ||
      btn.onclick.toString().includes(`'${category}'`)
    );
  });
  loadProducts(category);
}

// --- Cart Render ---
function renderCart() {
  const content = document.getElementById('cart-content');

  if (cartItems.length === 0) {
    content.innerHTML = `
      <div class="cart-empty">
        <div class="emoji">🛒</div>
        <h3>Your cart is empty</h3>
        <p>Add some items to get started!</p>
        <button class="btn btn-primary" style="margin-top: 20px" onclick="showPage('shop')">
          Continue Shopping
        </button>
      </div>
    `;
    return;
  }

  const itemsHtml = cartItems
    .map(
      (item) => `
    <div class="cart-item">
      <div class="cart-item-image">${item.image}</div>
      <div class="cart-item-details">
        <div class="cart-item-name">${item.name}</div>
        <div class="cart-item-variant">Size: ${item.size} | Color: ${item.color}</div>
        <div class="cart-item-price">$${(item.price * item.quantity).toFixed(2)}</div>
      </div>
      <div class="cart-item-controls">
        <button class="qty-btn" onclick="updateCartItemQty('${item.id}', -1)">−</button>
        <span class="cart-item-qty">${item.quantity}</span>
        <button class="qty-btn" onclick="updateCartItemQty('${item.id}', 1)">+</button>
      </div>
      <button class="cart-item-remove" onclick="removeCartItem('${item.id}')" title="Remove">🗑️</button>
    </div>
  `
    )
    .join('');

  const summaryHtml = `
    <div class="cart-summary">
      <div class="summary-row">
        <span>Subtotal (${cartData.itemCount} items)</span>
        <span>$${cartData.subtotal.toFixed(2)}</span>
      </div>
      <div class="summary-row">
        <span>Shipping</span>
        <span>${cartData.shipping === 0 ? '<span class="free-shipping">FREE</span>' : '$' + cartData.shipping.toFixed(2)}</span>
      </div>
      <div class="summary-row">
        <span>Tax</span>
        <span>$${cartData.tax.toFixed(2)}</span>
      </div>
      <div class="summary-row total">
        <span>Total</span>
        <span>$${cartData.total.toFixed(2)}</span>
      </div>
      <div class="cart-actions">
        <button class="btn btn-secondary" onclick="showPage('shop')">Continue Shopping</button>
        <button class="btn btn-primary" onclick="showPage('checkout')">Proceed to Checkout</button>
      </div>
    </div>
  `;

  content.innerHTML = `
    <div class="cart-items">${itemsHtml}</div>
    ${summaryHtml}
  `;
}

// --- Checkout ---
function renderCheckoutSummary() {
  const container = document.getElementById('checkout-summary');
  if (!cartData || cartItems.length === 0) {
    container.innerHTML = '<p>No items in cart.</p>';
    return;
  }

  container.innerHTML = `
    <div class="summary-row">
      <span>Items (${cartData.itemCount})</span>
      <span>$${cartData.subtotal.toFixed(2)}</span>
    </div>
    <div class="summary-row">
      <span>Shipping</span>
      <span>${cartData.shipping === 0 ? '<span class="free-shipping">FREE</span>' : '$' + cartData.shipping.toFixed(2)}</span>
    </div>
    <div class="summary-row">
      <span>Tax</span>
      <span>$${cartData.tax.toFixed(2)}</span>
    </div>
    <div class="summary-row total">
      <span>Total</span>
      <span>$${cartData.total.toFixed(2)}</span>
    </div>
  `;
}

async function submitOrder(event) {
  event.preventDefault();

  const btn = document.getElementById('place-order-btn');
  btn.disabled = true;
  btn.textContent = 'Processing...';

  const customer = {
    name: document.getElementById('customer-name').value,
    email: document.getElementById('customer-email').value,
    address: document.getElementById('customer-address').value,
  };

  try {
    const data = await apiPost('/orders', { cartId, customer });
    const order = data.order;

    // Reset cart
    const newCart = await apiPost('/cart', {});
    cartId = newCart.cart.id;
    localStorage.setItem('cartId', cartId);
    cartData = newCart.cart;
    cartItems = [];
    updateCartBadge();

    // Show confirmation
    showConfirmation(order);
  } catch (err) {
    showToast(err.message, 'error');
    btn.disabled = false;
    btn.textContent = 'Place Order';
  }
}

function showConfirmation(order) {
  const content = document.getElementById('confirmation-content');
  content.innerHTML = `
    <div class="confirmation-box">
      <div class="emoji">🎉</div>
      <h2>Order Confirmed!</h2>
      <p>Thank you for your purchase.</p>
      <div class="confirmation-details">
        <p><strong>Order ID:</strong> ${order.id}</p>
        <p><strong>Status:</strong> ${order.status}</p>
        <p><strong>Total:</strong> $${order.total.toFixed(2)}</p>
        <p><strong>Transaction:</strong> ${order.payment.transactionId}</p>
        <p><strong>Est. Delivery:</strong> ${order.estimatedDelivery}</p>
      </div>
      <button class="btn btn-primary btn-large" onclick="showPage('shop')">Continue Shopping</button>
    </div>
  `;
  showPage('confirmation');
}

// --- Orders ---
async function loadOrders() {
  const content = document.getElementById('orders-content');
  content.innerHTML = '<div class="loading">Loading orders...</div>';

  try {
    const data = await apiGet('/orders');
    if (data.orders.length === 0) {
      content.innerHTML = `
        <div class="orders-empty">
          <div class="emoji">📦</div>
          <h3>No orders yet</h3>
          <p>Your order history will appear here.</p>
          <button class="btn btn-primary" style="margin-top: 20px" onclick="showPage('shop')">Start Shopping</button>
        </div>
      `;
      return;
    }

    content.innerHTML = data.orders
      .map(
        (order) => `
      <div class="order-card">
        <div class="order-header">
          <span class="order-id">${order.id}</span>
          <span class="order-status ${order.status}">${order.status.toUpperCase()}</span>
        </div>
        <ul class="order-items-list">
          ${order.items.map((item) => `<li>${item.image} ${item.name} × ${item.quantity} — $${(item.price * item.quantity).toFixed(2)}</li>`).join('')}
        </ul>
        <div class="order-footer">
          <span>Ordered: ${new Date(order.createdAt).toLocaleDateString()}</span>
          <span class="order-total">$${order.total.toFixed(2)}</span>
        </div>
      </div>
    `
      )
      .join('');
  } catch (err) {
    content.innerHTML = `<div class="loading">Error: ${err.message}</div>`;
  }
}

// --- Navigation ---
function showPage(pageId) {
  // Hide all pages
  document.querySelectorAll('.page').forEach((p) => p.classList.remove('active'));

  // Show target page
  const page = document.getElementById(`page-${pageId}`);
  if (page) page.classList.add('active');

  // Update nav buttons
  document.querySelectorAll('.nav-btn').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.page === pageId);
  });

  // Page-specific loading
  if (pageId === 'cart') renderCart();
  if (pageId === 'checkout') renderCheckoutSummary();
  if (pageId === 'orders') loadOrders();
}

// --- Toast ---
function showToast(message, type = 'info') {
  const toast = document.getElementById('toast');
  toast.textContent = message;
  toast.className = `toast ${type}`;
  setTimeout(() => {
    toast.classList.add('hidden');
  }, 3000);
}
