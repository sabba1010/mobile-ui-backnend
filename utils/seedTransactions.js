const User = require('../models/User');
const Transaction = require('../models/Transaction');

const seedTransactions = async () => {
  try {
    // Clear the transaction collection for a clean database re-sync
    await Transaction.deleteMany({});
    console.log('Cleared existing transactions.');

    const users = await User.find({});
    if (users.length === 0) return;

    const seedData = [];
    const now = new Date();

    for (const user of users) {
      // 1. Seed a Deposit (Credit)
      const depositDate = new Date();
      depositDate.setDate(now.getDate() - 5);
      seedData.push({
        userId: user._id,
        userPhone: user.phoneNumber,
        type: 'deposit',
        amount: user.plan === 'VIP 2' ? 500 : 160,
        status: 'approved',
        description: 'Deposit via Mobile Money',
        createdAt: depositDate,
        updatedAt: depositDate
      });

      // 2. Seed a Purchase (Debit) if they have a plan
      if (user.plan && user.plan !== 'None') {
        const purchaseDate = new Date();
        purchaseDate.setDate(now.getDate() - 4);
        const price = user.plan === 'VIP 2' ? 160 : 80;
        seedData.push({
          userId: user._id,
          userPhone: user.phoneNumber,
          type: 'purchase',
          amount: -price,
          status: 'completed',
          description: `${user.plan} Plan Purchase`,
          createdAt: purchaseDate,
          updatedAt: purchaseDate
        });

        // 3. Seed some yields/incomes (Credit)
        const dailyYield = user.plan === 'VIP 2' ? 41 : 20;
        for (let i = 1; i <= 3; i++) {
          const yieldDate = new Date();
          yieldDate.setDate(now.getDate() - i);
          yieldDate.setHours(14, 0, 0, 0);
          seedData.push({
            userId: user._id,
            userPhone: user.phoneNumber,
            type: 'income',
            amount: dailyYield,
            status: 'completed',
            description: `${user.plan} Daily Yield`,
            createdAt: yieldDate,
            updatedAt: yieldDate
          });
        }
      }

      // 4. Seed a withdrawal (Debit, stored as negative)
      const withdrawDate = new Date();
      withdrawDate.setDate(now.getDate() - 1);
      seedData.push({
        userId: user._id,
        userPhone: user.phoneNumber,
        type: 'withdraw',
        amount: -50,
        status: 'approved',
        description: 'Withdrawal to Mobile Money',
        createdAt: withdrawDate,
        updatedAt: withdrawDate
      });
    }

    if (seedData.length > 0) {
      await Transaction.insertMany(seedData);
      console.log(`Seeded ${seedData.length} transactions successfully.`);
    }
  } catch (err) {
    console.error('Error seeding transactions:', err);
  }
};

module.exports = seedTransactions;
