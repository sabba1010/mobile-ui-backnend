const mongoose = require('mongoose');

const productSchema = new mongoose.Schema({
  name: { type: String, required: true },
  price: { type: Number, required: true },
  days: { type: Number, required: true },
  daily: { type: Number, required: true },
  total: { type: Number, required: true },
  active: { type: Boolean, default: true },
  badge: { type: String, default: '' },
  image: { type: String, default: 'https://images.unsplash.com/photo-1596766487920-56d11a2fdfcf?q=80&w=200&auto=format&fit=crop' }
}, { timestamps: true });

module.exports = mongoose.model('Product', productSchema);
