require('dotenv').config();
const mongoose = require('mongoose');
const User = require('./models/User');
const Product = require('./models/Product');
const Transaction = require('./models/Transaction');

mongoose.connect(process.env.MONGODB_URI).then(async () => {
  console.log('--- TEST CRON JOB: Running Daily Yield Distribution ---');
  try {
    const users = await User.find({ plan: { $ne: 'None' } });
    const products = await Product.find();
    
    let yieldsProcessed = 0;
    
    for (const user of users) {
      if (user.planExpireDate && new Date() > user.planExpireDate) {
        console.log(`User ${user.phoneNumber} plan (${user.plan}) has expired.`);
        user.plan = 'None';
        user.planExpireDate = null;
        await user.save();
        continue;
      }
      
      const product = products.find(p => p.name === user.plan);
      if (product && product.daily > 0) {
        user.balance += product.daily;
        await user.save();
        
        const yieldTransaction = new Transaction({
          userId: user._id,
          userPhone: user.phoneNumber,
          type: 'income',
          amount: product.daily,
          status: 'completed',
          description: `${user.plan} Daily Yield`
        });
        await yieldTransaction.save();
        yieldsProcessed++;
      }
    }
    
    console.log(`--- TEST CRON JOB COMPLETED: Processed ${yieldsProcessed} yields ---`);
  } catch (error) {
    console.error(error);
  }
  process.exit(0);
});
