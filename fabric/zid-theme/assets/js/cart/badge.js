/**
 * Cart Badge Module
 *
 * Updates cart count badge in header/nav
 */

/**
 * Update all cart badges on the page
 * @param {Object} cart - Optional cart data (if not provided, will fetch)
 */
export async function refreshBadge(cart) {
  try {
    if (!window.zid) return;

    // Use provided cart data or fetch if not provided
    const cartData = cart || (await window.zid.cart.get());
    const count = cartData?.cart_items_quantity ?? cartData?.products_count ?? 0;

    document.querySelectorAll("[data-cart-badge]").forEach((el) => {
      el.textContent = count;
      el.hidden = count === 0;
    });
  } catch (err) {
    console.error("[Cart] Refresh badge failed:", err);
  }
}
