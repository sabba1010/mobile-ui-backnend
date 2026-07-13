require('dotenv').config();
const mongoose = require('mongoose');
const Transaction = require('./models/Transaction');

mongoose.connect(process.env.MONGODB_URI).then(async () => {
  const res = await Transaction.deleteMany({
    description: { $in: ['Deposit via Mobile Money', 'Withdrawal to Mobile Money', 'VIP 2 Plan Purchase', 'VIP 1 Plan Purchase', 'VIP 2 Daily Yield', 'VIP 1 Daily Yield'] }
  });
  console.log('Deleted fake transactions:', res.deletedCount);
  process.exit(0);
}).catch(console.error);
