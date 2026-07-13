const mongoose = require('mongoose');

const SettingsSchema = new mongoose.Schema({
  minDeposit: {
    type: Number,
    default: 50
  },
  depositInstructions: {
    type: String,
    default: "Please transfer exact amount to our MOMO number."
  },
  minWithdrawal: {
    type: Number,
    default: 30
  },
  withdrawFee: {
    type: Number,
    default: 5
  },
  commissionRateL1: {
    type: Number,
    default: 20
  },
  commissionRateL2: {
    type: Number,
    default: 3
  },
  commissionRateL3: {
    type: Number,
    default: 2
  }
}, { timestamps: true });

module.exports = mongoose.model('Settings', SettingsSchema);
