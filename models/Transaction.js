const mongoose = require('mongoose');

const transactionSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  userPhone: {
    type: String,
    required: true
  },
  type: {
    type: String,
    enum: ['deposit', 'withdraw', 'purchase', 'income'],
    required: true
  },
  amount: {
    type: Number,
    required: true
  },
  status: {
    type: String,
    enum: ['pending', 'approved', 'rejected', 'completed'],
    default: 'completed'
  },
  description: {
    type: String,
    default: ''
  },
  trxId: {
    type: String,
    default: ''
  },
  image: {
    type: String,
    default: ''
  }
}, { timestamps: true });

module.exports = mongoose.model('Transaction', transactionSchema);
