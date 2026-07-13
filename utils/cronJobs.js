const cron = require('node-cron');
const User = require('../models/User');
const Product = require('../models/Product');
const Transaction = require('../models/Transaction');

const initCronJobs = () => {
  // Run every day at midnight server time
  cron.schedule('0 0 * * *', async () => {
    console.log('--- CRON JOB: Running Daily Yield Distribution ---');
    try {
      // Find all users who have an active plan
      const users = await User.find({ plan: { $ne: 'None' } });
      const products = await Product.find();

      let yieldsProcessed = 0;
      let expiredPlans = 0;

      for (const user of users) {
        // Check if plan is expired
        if (user.planExpireDate && new Date() > user.planExpireDate) {
          console.log(`User ${user.phoneNumber} plan (${user.plan}) has expired.`);
          user.plan = 'None';
          user.planExpireDate = null;
          await user.save();
          expiredPlans++;
          continue;
        }

        // Find the product to determine the daily yield
        const product = products.find(p => p.name === user.plan);
        if (product && product.daily > 0) {
          // Add yield to balance
          user.balance += product.daily;
          await user.save();

          // Log the transaction
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

      console.log(`--- CRON JOB COMPLETED: Processed ${yieldsProcessed} yields, expired ${expiredPlans} plans ---`);
    } catch (error) {
      console.error('--- CRON JOB ERROR ---', error);
    }
  });

  console.log('Cron jobs initialized: Daily Yields distribution scheduled at 00:00.');
};

module.exports = initCronJobs;
