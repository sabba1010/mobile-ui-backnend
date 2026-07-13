const express = require('express');
const router = express.Router();
const Product = require('../models/Product');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const Transaction = require('../models/Transaction');
const Settings = require('../models/Settings');

// Middleware to authenticate token
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ message: 'No token provided, authorization denied now' });
  }

  try {
    const jwtSecret = process.env.JWT_SECRET || 'vip_invest_fallback_secret_key_123!';
    const decoded = jwt.verify(token, jwtSecret);
    req.user = decoded.user;
    next();
  } catch (error) {
    res.status(401).json({ message: 'Token is not valid' });
  }
};

// Middleware to check if admin
const isAdmin = (req, res, next) => {
  if (req.user && (req.user.role === 'admin' || req.user.role === 'super_admin')) {
    next();
  } else {
    res.status(403).json({ message: 'Access denied: Admin role required' });
  }
};

// Get all products (sorted by price ascending)
router.get('/', async (req, res) => {
  try {
    const products = await Product.find().sort({ price: 1 });
    res.json({ success: true, products });
  } catch (err) {
    console.error("Fetch products error:", err);
    res.status(500).json({ success: false, message: 'Server error fetching products' });
  }
});

// Create a new product (For admin)
router.post('/', authenticateToken, isAdmin, async (req, res) => {
  try {
    const product = new Product(req.body);
    await product.save();
    res.status(201).json({ success: true, product });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

// Update a product (For admin)
router.put('/:id', authenticateToken, isAdmin, async (req, res) => {
  try {
    const { name, price, days, daily, total, active, badge, image } = req.body;
    const updateData = {};
    if (name !== undefined) updateData.name = name;
    if (price !== undefined) updateData.price = price;
    if (days !== undefined) updateData.days = days;
    if (daily !== undefined) updateData.daily = daily;
    if (total !== undefined) updateData.total = total;
    if (active !== undefined) updateData.active = active;
    if (badge !== undefined) updateData.badge = badge;
    if (image !== undefined) updateData.image = image;

    const product = await Product.findByIdAndUpdate(
      req.params.id,
      { $set: updateData },
      { new: true }
    );

    if (!product) {
      return res.status(404).json({ success: false, message: 'Product not found' });
    }

    res.json({ success: true, product });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

// Delete a product (For admin)
router.delete('/:id', authenticateToken, isAdmin, async (req, res) => {
  try {
    const product = await Product.findByIdAndDelete(req.params.id);
    if (!product) {
      return res.status(404).json({ success: false, message: 'Product not found' });
    }
    res.json({ success: true, message: 'Product deleted successfully' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Seed initial products
router.post('/seed', async (req, res) => {
  try {
    const count = await Product.countDocuments();
    if (count > 0) return res.json({ success: true, message: 'Products already seeded' });

    const seedData = [
      { name: "VIP1", price: 80, days: 720, daily: 20, total: 14400, active: true },
      { name: "VIP2", price: 160, days: 720, daily: 41, total: 29520, active: true },
      { name: "VIP3", price: 320, days: 720, daily: 85, total: 61200, active: true },
      { name: "VIP4", price: 500, days: 720, daily: 160, total: 115200, active: true },
      { name: "VIP5", price: 1000, days: 720, daily: 320, total: 230400, active: true },
      { name: "VIP6", price: 2000, days: 720, daily: 650, total: 468000, active: true },
      { name: "VIP7", price: 4000, days: 720, daily: 1420, total: 1028160, active: false },
      { name: "VIP8", price: 8000, days: 720, daily: 3000, total: 2160000, active: false },
      { name: "VIP9", price: 16000, days: 720, daily: 6400, total: 4608000, active: false },
      { name: "VIP10", price: 20000, days: 720, daily: 9000, total: 6480000, active: false },
    ];

    await Product.insertMany(seedData);
    res.status(201).json({ success: true, message: 'Seeded initial products' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Purchase a VIP product
router.post('/purchase', authenticateToken, async (req, res) => {
  try {
    const { productId } = req.body;
    if (!productId) {
      return res.status(400).json({ success: false, message: 'Product ID is required' });
    }

    const product = await Product.findById(productId);
    if (!product) {
      return res.status(404).json({ success: false, message: 'Product not found' });
    }

    if (!product.active) {
      return res.status(400).json({ success: false, message: 'Product is not active/purchasable' });
    }

    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    if (user.balance < product.price) {
      return res.status(400).json({ success: false, message: 'Insufficient balance' });
    }

    user.plan = product.name;
    const expiryDate = new Date();
    expiryDate.setDate(expiryDate.getDate() + product.days);
    user.planExpireDate = expiryDate;
    user.balance -= product.price;
    user.referralStatus = 'completed';
    await user.save();

    // Log the purchase in Transactions records with negative amount
    const purchaseLog = new Transaction({
      userId: user._id,
      userPhone: user.phoneNumber,
      type: 'purchase',
      amount: -product.price,
      status: 'completed',
      description: `${product.name} Purchase`
    });
    await purchaseLog.save();

    // Helper to recalculate rank & certificate
    const recalculateRankAndIncentive = async (userId) => {
      try {
        const uNode = await User.findById(userId);
        if (!uNode) return;

        // Level 1
        const l1 = await User.find({ referredBy: userId });
        const l1Ids = l1.map(u => u._id);

        // Level 2
        let l2 = [];
        if (l1Ids.length > 0) {
          l2 = await User.find({ referredBy: { $in: l1Ids } });
        }
        const l2Ids = l2.map(u => u._id);

        // Level 3
        let l3 = [];
        if (l2Ids.length > 0) {
          l3 = await User.find({ referredBy: { $in: l2Ids } });
        }

        const allTeam = [...l1, ...l2, ...l3];
        const activeCount = allTeam.filter(u => u.plan && u.plan !== 'None').length;

        let cert = 'None';
        let incentive = 0;

        if (activeCount >= 150) {
          cert = 'Business Consultant';
          incentive = 250;
        } else if (activeCount >= 25) {
          cert = 'High Commissioner';
          incentive = 200;
        } else if (activeCount >= 10) {
          cert = 'Business Specialist';
          incentive = 150;
        }

        uNode.certificate = cert;
        uNode.weeklyIncentive = incentive;
        await uNode.save();
        console.log(`Updated rank for ${uNode.phoneNumber}: Cert=${cert}, ActiveCount=${activeCount}`);
      } catch (err) {
        console.error("Error recalculating rank:", err);
      }
    };

    // Process Referral Commissions (MLM)
    try {
      const settings = await Settings.findOne() || { commissionRateL1: 20, commissionRateL2: 3, commissionRateL3: 2 };
      
      // Level 1
      if (user.referredBy) {
        const l1Referrer = await User.findById(user.referredBy);
        if (l1Referrer) {
          const l1Comm = Number((product.price * (settings.commissionRateL1 / 100)).toFixed(2));
          l1Referrer.balance += l1Comm;
          await l1Referrer.save();

          const commLogL1 = new Transaction({
            userId: l1Referrer._id,
            userPhone: l1Referrer.phoneNumber,
            type: 'income',
            amount: l1Comm,
            status: 'completed',
            description: `Level 1 Commission from ${user.phoneNumber} (${product.name} Purchase)`
          });
          await commLogL1.save();
          await recalculateRankAndIncentive(l1Referrer._id);

          // Level 2
          if (l1Referrer.referredBy) {
            const l2Referrer = await User.findById(l1Referrer.referredBy);
            if (l2Referrer) {
              const l2Comm = Number((product.price * (settings.commissionRateL2 / 100)).toFixed(2));
              l2Referrer.balance += l2Comm;
              await l2Referrer.save();

              const commLogL2 = new Transaction({
                userId: l2Referrer._id,
                userPhone: l2Referrer.phoneNumber,
                type: 'income',
                amount: l2Comm,
                status: 'completed',
                description: `Level 2 Commission from ${user.phoneNumber} (${product.name} Purchase)`
              });
              await commLogL2.save();
              await recalculateRankAndIncentive(l2Referrer._id);

              // Level 3
              if (l2Referrer.referredBy) {
                const l3Referrer = await User.findById(l2Referrer.referredBy);
                if (l3Referrer) {
                  const l3Comm = Number((product.price * (settings.commissionRateL3 / 100)).toFixed(2));
                  l3Referrer.balance += l3Comm;
                  await l3Referrer.save();

                  const commLogL3 = new Transaction({
                    userId: l3Referrer._id,
                    userPhone: l3Referrer.phoneNumber,
                    type: 'income',
                    amount: l3Comm,
                    status: 'completed',
                    description: `Level 3 Commission from ${user.phoneNumber} (${product.name} Purchase)`
                  });
                  await commLogL3.save();
                  await recalculateRankAndIncentive(l3Referrer._id);
                }
              }
            }
          }
        }
      }
    } catch (mlmError) {
      console.error("Error distributing MLM commission:", mlmError);
    }

    res.json({
      success: true,
      message: 'Product purchased successfully!',
      user: {
        id: user._id,
        phoneNumber: user.phoneNumber,
        role: user.role,
        balance: user.balance,
        plan: user.plan
      }
    });
  } catch (error) {
    console.error('Purchase product error:', error);
    res.status(500).json({ success: false, message: 'Server Error' });
  }
});

module.exports = router;
