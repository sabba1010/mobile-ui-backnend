const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
  phoneNumber: {
    type: String,
    required: true,
    unique: true
  },
  password: {
    type: String,
    required: true
  },
  role: {
    type: String,
    enum: ['user', 'admin', 'super_admin'],
    default: 'user'
  },
  avatar: {
    type: String,
    default: ''
  },
  balance: {
    type: Number,
    default: 30
  },
  plan: {
    type: String,
    default: 'None'
  },
  planExpireDate: {
    type: Date,
    default: null
  },
  referrals: {
    type: Number,
    default: 0
  },
  status: {
    type: String,
    enum: ['active', 'pending', 'suspended'],
    default: 'active'
  },
  inviteCode: {
    type: String,
    unique: true
  },
  referredBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  referralStatus: {
    type: String,
    enum: ['pending', 'completed'],
    default: 'pending'
  },
  certificate: {
    type: String,
    default: 'None'
  },
  weeklyIncentive: {
    type: Number,
    default: 0
  },
  wallets: [{
    type: { type: String, required: true },
    label: { type: String, required: true },
    number: { type: String, required: true },
    bankName: { type: String, default: '' },
    isDefault: { type: Boolean, default: false }
  }]
}, { timestamps: true });

// Pre-save hook to generate inviteCode and hash password
userSchema.pre('save', async function() {
  if (!this.inviteCode) {
    let code;
    let isUnique = false;
    let attempts = 0;
    while (!isUnique && attempts < 10) {
      code = '';
      const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
      for (let i = 0; i < 6; i++) {
        code += chars.charAt(Math.floor(Math.random() * chars.length));
      }
      const existingUser = await this.constructor.findOne({ inviteCode: code });
      if (!existingUser) {
        isUnique = true;
      }
      attempts++;
    }
    this.inviteCode = code;
  }

  if (this.isModified('password')) {
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
  }
});



// Compare password
userSchema.methods.matchPassword = async function(enteredPassword) {
  return await bcrypt.compare(enteredPassword, this.password);
};

module.exports = mongoose.model('User', userSchema);
