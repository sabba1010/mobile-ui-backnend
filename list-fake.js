require('dotenv').config();
const mongoose = require('mongoose');
const Transaction = require('./models/Transaction');

mongoose.connect(process.env.MONGODB_URI).then(async () => {
  const transactions = await Transaction.find({ type: { $in: ['income', 'purchase'] } });
  console.log(transactions);
  process.exit(0);
}).catch(console.error);
