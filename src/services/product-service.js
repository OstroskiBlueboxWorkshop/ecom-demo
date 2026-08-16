'use strict';

/**
 * Product Service - manages the product catalog
 */

const products = [
  {
    id: 'tshirt-classic-white',
    name: 'Classic White T-Shirt',
    description: 'A timeless white cotton t-shirt. Soft, breathable, and perfect for any occasion.',
    price: 24.99,
    category: 'tshirts',
    image: '👕',
    sizes: ['S', 'M', 'L', 'XL'],
    colors: ['White'],
    inStock: true,
    stockCount: 150,
  },
  {
    id: 'tshirt-black-premium',
    name: 'Premium Black T-Shirt',
    description: 'Premium quality black t-shirt made from organic cotton.',
    price: 34.99,
    category: 'tshirts',
    image: '👕',
    sizes: ['S', 'M', 'L', 'XL', 'XXL'],
    colors: ['Black'],
    inStock: true,
    stockCount: 89,
  },
  {
    id: 'tshirt-navy-vneck',
    name: 'Navy V-Neck T-Shirt',
    description: 'Stylish v-neck in navy blue. Slim fit for a modern look.',
    price: 29.99,
    category: 'tshirts',
    image: '👕',
    sizes: ['S', 'M', 'L', 'XL'],
    colors: ['Navy'],
    inStock: true,
    stockCount: 64,
  },
  {
    id: 'socks-athletic-3pack',
    name: 'Athletic Socks (3-Pack)',
    description: 'Cushioned athletic socks with arch support. Moisture-wicking material.',
    price: 14.99,
    category: 'socks',
    image: '🧦',
    sizes: ['S', 'M', 'L'],
    colors: ['White', 'Black', 'Gray'],
    inStock: true,
    stockCount: 230,
  },
  {
    id: 'socks-wool-cozy',
    name: 'Cozy Wool Socks',
    description: 'Warm merino wool socks perfect for cold days. Extra thick and comfortable.',
    price: 19.99,
    category: 'socks',
    image: '🧦',
    sizes: ['S', 'M', 'L'],
    colors: ['Burgundy', 'Forest Green', 'Charcoal'],
    inStock: true,
    stockCount: 45,
  },
  {
    id: 'socks-novelty-pizza',
    name: 'Pizza Pattern Fun Socks',
    description: 'Show off your personality with these fun pizza-patterned socks!',
    price: 12.99,
    category: 'socks',
    image: '🧦',
    sizes: ['M', 'L'],
    colors: ['Multi'],
    inStock: true,
    stockCount: 78,
  },
  {
    id: 'hoodie-gray-zip',
    name: 'Gray Zip-Up Hoodie',
    description: 'Comfortable full-zip hoodie in heather gray. Fleece-lined for warmth.',
    price: 54.99,
    category: 'hoodies',
    image: '🧥',
    sizes: ['S', 'M', 'L', 'XL', 'XXL'],
    colors: ['Heather Gray'],
    inStock: true,
    stockCount: 33,
  },
  {
    id: 'hoodie-blue-pullover',
    name: 'Ocean Blue Pullover Hoodie',
    description: 'Relaxed-fit pullover hoodie with kangaroo pocket. Great for layering.',
    price: 49.99,
    category: 'hoodies',
    image: '🧥',
    sizes: ['S', 'M', 'L', 'XL'],
    colors: ['Ocean Blue'],
    inStock: false,
    stockCount: 0,
  },
];

class ProductService {
  /**
   * Get all products, optionally filtered by category
   */
  async getAllProducts(category = null) {
    // Simulate DB latency
    await this._simulateLatency(20, 80);

    if (category) {
      return products.filter((p) => p.category === category);
    }
    return [...products];
  }

  /**
   * Get a single product by ID
   */
  async getProductById(productId) {
    await this._simulateLatency(10, 50);

    const product = products.find((p) => p.id === productId);
    if (!product) {
      const error = new Error(`Product not found: ${productId}`);
      error.statusCode = 404;
      throw error;
    }
    return { ...product };
  }

  /**
   * Check stock availability
   */
  async checkStock(productId, quantity = 1) {
    await this._simulateLatency(10, 40);

    const product = products.find((p) => p.id === productId);
    if (!product) {
      throw new Error(`Product not found: ${productId}`);
    }

    return {
      productId,
      available: product.inStock && product.stockCount >= quantity,
      stockCount: product.stockCount,
      requested: quantity,
    };
  }

  /**
   * Get available categories
   */
  async getCategories() {
    await this._simulateLatency(5, 20);
    const categories = [...new Set(products.map((p) => p.category))];
    return categories.map((c) => ({
      id: c,
      name: c.charAt(0).toUpperCase() + c.slice(1),
      count: products.filter((p) => p.category === c).length,
    }));
  }

  /**
   * Simulate variable latency (like a real DB call)
   */
  async _simulateLatency(minMs, maxMs) {
    const delay = Math.floor(Math.random() * (maxMs - minMs + 1)) + minMs;
    return new Promise((resolve) => setTimeout(resolve, delay));
  }
}

module.exports = new ProductService();
