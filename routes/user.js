const express = require('express');
const router = express.Router();
const User = require('../models/User');
const Settings = require('../models/Settings');
const jwt = require('jsonwebtoken');

// Middleware to authenticate token
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ message: 'No token provided, authorization denied' });
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

// Helper for automated daily yield for referred team members
const checkAndApplyAutoYield = async (user) => {
  try {
    if (!user.referredBy || !user.plan || user.plan === 'None') return;

    const Product = require('../models/Product');
    const Transaction = require('../models/Transaction');
    const product = await Product.findOne({ name: user.plan });
    if (!product) return;

    // Find the last daily yield transaction
    const lastYield = await Transaction.findOne({
      userId: user._id,
      type: 'income',
      description: { $regex: 'Daily Yield' }
    }).sort({ createdAt: -1 });

    const now = new Date();
    let lastYieldDate = lastYield ? lastYield.createdAt : new Date(user.createdAt);

    const msDiff = now.getTime() - lastYieldDate.getTime();
    const hoursDiff = msDiff / (1000 * 60 * 60);

    if (hoursDiff >= 24) {
      const daysDue = Math.floor(hoursDiff / 24);
      // Limit to awarding up to 5 days at a time
      const awards = Math.min(daysDue, 5);

      for (let i = 1; i <= awards; i++) {
        const awardDate = new Date(lastYieldDate.getTime() + i * 24 * 60 * 60 * 1000);
        user.balance += product.daily;

        const autoYieldLog = new Transaction({
          userId: user._id,
          userPhone: user.phoneNumber,
          type: 'income',
          amount: product.daily,
          status: 'completed',
          description: `${user.plan} Daily Yield (Automated)`,
          createdAt: awardDate
        });
        await autoYieldLog.save();
      }
      await user.save();
      console.log(`Auto-credited ${awards} daily yields to team member ${user.phoneNumber}`);
    }
  } catch (err) {
    console.error("Auto-yield calculation error:", err);
  }
};

// @route   GET /api/user/me
// @desc    Get current user profile
router.get('/me', authenticateToken, async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Auto-yield check for team members
    if (user.referredBy && user.plan && user.plan !== 'None') {
      await checkAndApplyAutoYield(user);
    }

    const cleanUser = await User.findById(user._id).select('-password');
    res.json(cleanUser);
  } catch (error) {
    console.error('Error fetching user profile:', error);
    res.status(500).json({ message: 'Server Error' });
  }
});

// @route   PUT /api/user/avatar
// @desc    Update user avatar
router.put('/avatar', authenticateToken, async (req, res) => {
  try {
    const { avatar } = req.body;

    if (!avatar) {
      return res.status(400).json({ message: 'Avatar image is required' });
    }

    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    user.avatar = avatar;
    await user.save();

    res.json({ message: 'Avatar updated successfully', avatar: user.avatar });
  } catch (error) {
    console.error('Error updating avatar:', error);
    res.status(500).json({ message: 'Server Error' });
  }
});

// Middleware to check if user is admin or super admin
const isAdmin = (req, res, next) => {
  if (req.user && (req.user.role === 'admin' || req.user.role === 'super_admin')) {
    next();
  } else {
    res.status(403).json({ message: 'Access denied: Admin role required' });
  }
};

// @route   GET /api/user/all
// @desc    Get all users (Admin only)
router.get('/all', authenticateToken, isAdmin, async (req, res) => {
  try {
    const users = await User.find().select('-password').sort({ createdAt: -1 });
    res.json(users);
  } catch (error) {
    console.error('Error fetching all users:', error);
    res.status(500).json({ message: 'Server Error' });
  }
});

// @route   PUT /api/user/update/:id
// @desc    Update a user's details (Admin only)
router.put('/update/:id', authenticateToken, isAdmin, async (req, res) => {
  try {
    const { balance, plan, referrals, status } = req.body;
    const updateData = {};
    if (balance !== undefined) updateData.balance = Number(balance);
    if (plan !== undefined) updateData.plan = plan;
    if (referrals !== undefined) updateData.referrals = Number(referrals);
    if (status !== undefined) updateData.status = status;

    const user = await User.findByIdAndUpdate(
      req.params.id,
      { $set: updateData },
      { new: true }
    ).select('-password');

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    res.json({ message: 'User updated successfully', user });
  } catch (error) {
    console.error('Error updating user details:', error);
    res.status(500).json({ message: 'Server Error' });
  }
});

const Transaction = require('../models/Transaction');

// @route   GET /api/user/income
// @desc    Get all income records (Admin only)
router.get('/income', authenticateToken, isAdmin, async (req, res) => {
  try {
    const records = await Transaction.find({ type: 'income' }).sort({ createdAt: -1 });
    // Map description to source for backwards compatibility with the frontend
    const mapped = records.map(r => ({
      _id: r._id,
      userPhone: r.userPhone,
      source: r.description,
      amount: r.amount,
      createdAt: r.createdAt
    }));
    res.json(mapped);
  } catch (error) {
    console.error('Error fetching income records:', error);
    res.status(500).json({ message: 'Server Error' });
  }
});

// @route   GET /api/user/stats
// @desc    Get admin dashboard overview statistics (Admin only)
router.get('/stats', authenticateToken, isAdmin, async (req, res) => {
  try {
    const totalUsers = await User.countDocuments();
    const activePlans = await User.countDocuments({ plan: { $ne: 'None' } });

    // Calculate deposits (sum of type='deposit' and status='approved')
    const deposits = await Transaction.aggregate([
      { $match: { type: 'deposit', status: 'approved' } },
      { $group: { _id: null, total: { $sum: '$amount' } } }
    ]);
    const totalDeposits = deposits.length > 0 ? Math.abs(deposits[0].total) : 0;

    // Calculate withdrawals (sum of type='withdraw' and status='approved')
    const withdrawals = await Transaction.aggregate([
      { $match: { type: 'withdraw', status: 'approved' } },
      { $group: { _id: null, total: { $sum: '$amount' } } }
    ]);
    const totalWithdrawals = withdrawals.length > 0 ? Math.abs(withdrawals[0].total) : 0;

    // Calculate daily income (sum of yields today)
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const daily = await Transaction.aggregate([
      { $match: { type: 'income', createdAt: { $gte: today } } },
      { $group: { _id: null, total: { $sum: '$amount' } } }
    ]);
    const dailyIncome = daily.length > 0 ? daily[0].total : 0;

    const netRevenue = totalDeposits - totalWithdrawals;

    // Get 10 recent transactions
    const recentTransactions = await Transaction.find()
      .sort({ createdAt: -1 })
      .limit(10);

    res.json({
      success: true,
      stats: {
        totalUsers,
        totalDeposits,
        totalWithdrawals,
        dailyIncome,
        activePlans,
        netRevenue
      },
      recentTransactions
    });
  } catch (error) {
    console.error('Error fetching admin statistics:', error);
    res.status(500).json({ message: 'Server Error' });
  }
});

// @route   GET /api/user/transactions
// @desc    Get all transactions (Admin only)
router.get('/transactions', authenticateToken, isAdmin, async (req, res) => {
  try {
    const transactions = await Transaction.find().sort({ createdAt: -1 });
    res.json(transactions);
  } catch (error) {
    console.error('Error fetching transactions:', error);
    res.status(500).json({ message: 'Server Error' });
  }
});

// @route   GET /api/user/my-transactions
// @desc    Get logged-in user's transactions
router.get('/my-transactions', authenticateToken, async (req, res) => {
  try {
    const transactions = await Transaction.find({ userId: req.user.id }).sort({ createdAt: -1 });
    res.json(transactions);
  } catch (error) {
    console.error('Error fetching user transactions:', error);
    res.status(500).json({ message: 'Server Error' });
  }
});

// @route   GET /api/user/deposits
// @desc    Get all deposits (Admin only)
router.get('/deposits', authenticateToken, isAdmin, async (req, res) => {
  try {
    const list = await Transaction.find({ type: 'deposit' }).sort({ createdAt: -1 });
    res.json(list);
  } catch (error) {
    console.error('Error fetching deposits:', error);
    res.status(500).json({ message: 'Server Error' });
  }
});

// @route   PUT /api/user/deposit/:id
// @desc    Approve or reject a deposit request (Admin only)
router.put('/deposit/:id', authenticateToken, isAdmin, async (req, res) => {
  try {
    const { status } = req.body; // 'approved' or 'rejected'
    if (status !== 'approved' && status !== 'rejected') {
      return res.status(400).json({ success: false, message: 'Invalid status' });
    }

    const transaction = await Transaction.findById(req.params.id);
    if (!transaction) {
      return res.status(404).json({ success: false, message: 'Transaction not found' });
    }

    if (transaction.type !== 'deposit') {
      return res.status(400).json({ success: false, message: 'Transaction is not a deposit' });
    }

    if (transaction.status !== 'pending') {
      return res.status(400).json({ success: false, message: 'Deposit has already been processed' });
    }

    transaction.status = status;
    await transaction.save();

    // If approved, add the amount to user's balance
    if (status === 'approved') {
      const user = await User.findById(transaction.userId);
      if (user) {
        user.balance += transaction.amount;
        await user.save();
      }
    }

    res.json({ success: true, message: `Deposit request ${status} successfully!`, transaction });
  } catch (error) {
    console.error('Update deposit status error:', error);
    res.status(500).json({ success: false, message: 'Server Error' });
  }
});

// @route   POST /api/user/deposit
// @desc    Submit a deposit request (User)
router.post('/deposit', authenticateToken, async (req, res) => {
  try {
    const { amount, method, trxId } = req.body;
    if (!amount || isNaN(amount) || Number(amount) <= 0) {
      return res.status(400).json({ success: false, message: 'Invalid deposit amount' });
    }

    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    // Create a pending deposit transaction
    const depositTrx = new Transaction({
      userId: user._id,
      userPhone: user.phoneNumber,
      type: 'deposit',
      amount: Number(amount),
      status: 'pending',
      description: `Deposit - ${method || 'Bank Transfer'}`,
      trxId: trxId || ''
    });
    await depositTrx.save();

    res.status(201).json({
      success: true,
      message: 'Deposit request submitted successfully! Pending review.',
      transaction: depositTrx
    });
  } catch (error) {
    console.error('Submit deposit error:', error);
    res.status(500).json({ success: false, message: 'Server Error' });
  }
});

// @route   GET /api/user/my-deposits
// @desc    Get logged-in user's deposits
router.get('/my-deposits', authenticateToken, async (req, res) => {
  try {
    const list = await Transaction.find({ userId: req.user.id, type: 'deposit' }).sort({ createdAt: -1 });
    res.json(list);
  } catch (error) {
    console.error('Error fetching user deposits:', error);
    res.status(500).json({ message: 'Server Error' });
  }
});

// @route   GET /api/user/withdrawals
// @desc    Get all withdrawals (Admin only)
router.get('/withdrawals', authenticateToken, isAdmin, async (req, res) => {
  try {
    const list = await Transaction.find({ type: 'withdraw' }).sort({ createdAt: -1 });
    res.json(list);
  } catch (error) {
    console.error('Error fetching withdrawals:', error);
    res.status(500).json({ message: 'Server Error' });
  }
});

// @route   PUT /api/user/withdraw/:id
// @desc    Approve or reject a withdrawal request (Admin only)
router.put('/withdraw/:id', authenticateToken, isAdmin, async (req, res) => {
  try {
    const { status } = req.body; // 'approved' or 'rejected'
    if (status !== 'approved' && status !== 'rejected') {
      return res.status(400).json({ success: false, message: 'Invalid status' });
    }

    const transaction = await Transaction.findById(req.params.id);
    if (!transaction) {
      return res.status(404).json({ success: false, message: 'Transaction not found' });
    }

    if (transaction.type !== 'withdraw') {
      return res.status(400).json({ success: false, message: 'Transaction is not a withdrawal' });
    }

    if (transaction.status !== 'pending') {
      return res.status(400).json({ success: false, message: 'Withdrawal has already been processed' });
    }

    transaction.status = status;
    await transaction.save();

    // If rejected, refund the deducted amount back to user balance
    if (status === 'rejected') {
      const user = await User.findById(transaction.userId);
      if (user) {
        user.balance += Math.abs(transaction.amount);
        await user.save();
      }
    }

    res.json({ success: true, message: `Withdrawal request ${status} successfully!`, transaction });
  } catch (error) {
    console.error('Update withdrawal status error:', error);
    res.status(500).json({ success: false, message: 'Server Error' });
  }
});

// @route   POST /api/user/withdraw
// @desc    Submit a withdrawal request (User)
router.post('/withdraw', authenticateToken, async (req, res) => {
  try {
    const { amount, walletDetails } = req.body;
    if (!amount || isNaN(amount) || Number(amount) <= 0) {
      return res.status(400).json({ success: false, message: 'Invalid withdrawal amount' });
    }

    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    if (user.balance < Number(amount)) {
      return res.status(400).json({ success: false, message: 'Insufficient balance' });
    }

    // Deduct from balance immediately
    user.balance -= Number(amount);
    await user.save();

    // Create a pending withdrawal transaction (store as negative amount in ledger)
    const withdrawTrx = new Transaction({
      userId: user._id,
      userPhone: user.phoneNumber,
      type: 'withdraw',
      amount: -Number(amount),
      status: 'pending',
      description: walletDetails ? `Withdrawal Request - to ${walletDetails}` : 'Withdrawal Request'
    });
    await withdrawTrx.save();

    res.status(201).json({
      success: true,
      message: 'Withdrawal request submitted successfully! Pending review.',
      balance: user.balance
    });
  } catch (error) {
    console.error('Submit withdrawal error:', error);
    res.status(500).json({ success: false, message: 'Server Error' });
  }
});

// @route   GET /api/user/settings
// @desc    Get platform settings config (Public)
router.get('/settings', async (req, res) => {
  try {
    let settings = await Settings.findOne();
    if (!settings) {
      settings = new Settings();
      await settings.save();
    }
    res.json({ success: true, settings });
  } catch (error) {
    console.error('Error fetching settings:', error);
    res.status(500).json({ success: false, message: 'Server Error' });
  }
});

// @route   PUT /api/user/settings
// @desc    Update platform settings config (Admin only)
router.put('/settings', authenticateToken, isAdmin, async (req, res) => {
  try {
    const { minDeposit, depositInstructions, minWithdrawal, withdrawFee, commissionRateL1, commissionRateL2, commissionRateL3 } = req.body;
    let settings = await Settings.findOne();
    if (!settings) {
      settings = new Settings();
    }

    if (minDeposit !== undefined) settings.minDeposit = Number(minDeposit);
    if (depositInstructions !== undefined) settings.depositInstructions = depositInstructions;
    if (minWithdrawal !== undefined) settings.minWithdrawal = Number(minWithdrawal);
    if (withdrawFee !== undefined) settings.withdrawFee = Number(withdrawFee);
    if (commissionRateL1 !== undefined) settings.commissionRateL1 = Number(commissionRateL1);
    if (commissionRateL2 !== undefined) settings.commissionRateL2 = Number(commissionRateL2);
    if (commissionRateL3 !== undefined) settings.commissionRateL3 = Number(commissionRateL3);

    await settings.save();
    res.json({ success: true, message: 'Settings updated successfully!', settings });
  } catch (error) {
    console.error('Error updating settings:', error);
    res.status(500).json({ success: false, message: 'Server Error' });
  }
});

// @route   GET /api/user/team
// @desc    Get referral team details for logged-in user
router.get('/team', authenticateToken, async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });

    // Level 1
    const l1 = await User.find({ referredBy: user._id }).select('phoneNumber plan createdAt');
    const l1Ids = l1.map(u => u._id);

    // Level 2
    let l2 = [];
    if (l1Ids.length > 0) {
      l2 = await User.find({ referredBy: { $in: l1Ids } }).select('phoneNumber plan createdAt');
    }
    const l2Ids = l2.map(u => u._id);

    // Level 3
    let l3 = [];
    if (l2Ids.length > 0) {
      l3 = await User.find({ referredBy: { $in: l2Ids } }).select('phoneNumber plan createdAt');
    }

    // Load active settings to know rates
    const settings = await Settings.findOne() || { commissionRateL1: 20, commissionRateL2: 3, commissionRateL3: 2 };

    // Helper: calculate total commissions contributed by a list of user IDs for this user
    const commissions = await Transaction.find({
      userId: user._id,
      type: 'income',
      description: { $regex: 'Commission' }
    });

    const getContribution = (memberPhone) => {
      const matches = commissions.filter(c => c.description && c.description.includes(memberPhone));
      return matches.reduce((sum, c) => sum + c.amount, 0);
    };

    const formatMember = (u, level) => ({
      _id: u._id,
      phoneNumber: u.phoneNumber,
      plan: u.plan || 'None',
      createdAt: u.createdAt,
      level,
      isActive: u.plan && u.plan !== 'None',
      contribution: getContribution(u.phoneNumber)
    });

    const l1Members = l1.map(u => formatMember(u, 1));
    const l2Members = l2.map(u => formatMember(u, 2));
    const l3Members = l3.map(u => formatMember(u, 3));

    const totalMembersCount = l1.length + l2.length + l3.length;
    const activeL1 = l1Members.filter(m => m.isActive).length;
    const activeL2 = l2Members.filter(m => m.isActive).length;
    const activeL3 = l3Members.filter(m => m.isActive).length;
    const totalActiveCount = activeL1 + activeL2 + activeL3;

    const totalIncome = commissions.reduce((sum, c) => sum + c.amount, 0);

    res.json({
      success: true,
      inviteCode: user.inviteCode,
      certificate: user.certificate || 'None',
      weeklyIncentive: user.weeklyIncentive || 0,
      stats: {
        totalMembers: totalMembersCount,
        activeMembers: totalActiveCount,
        teamIncome: totalIncome,
        level1Count: l1.length,
        level2Count: l2.length,
        level3Count: l3.length,
        activeLevel1: activeL1,
        activeLevel2: activeL2,
        activeLevel3: activeL3
      },
      members: {
        level1: l1Members,
        level2: l2Members,
        level3: l3Members
      },
      commissionRates: {
        level1: settings.commissionRateL1 || 20,
        level2: settings.commissionRateL2 || 3,
        level3: settings.commissionRateL3 || 2
      }
    });
  } catch (error) {
    console.error('Error fetching team data:', error);
    res.status(500).json({ success: false, message: 'Server Error' });
  }
});

// @route   POST /api/user/daily-work
// @desc    Claim daily yield manually for standard users
router.post('/daily-work', authenticateToken, async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    if (!user.plan || user.plan === 'None') {
      return res.status(400).json({ success: false, message: 'You do not have an active VIP plan to work on.' });
    }

    // Team members cannot do work manually
    if (user.referredBy) {
      return res.status(403).json({
        success: false,
        isAutomated: true,
        message: 'Automated Team Account: You do not need to do manual work. Your earnings are credited automatically.'
      });
    }

    // Check if claimed in the last 24 hours
    const last24h = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const recentYield = await Transaction.findOne({
      userId: user._id,
      type: 'income',
      description: { $regex: 'Daily Yield' },
      createdAt: { $gte: last24h }
    });

    if (recentYield) {
      return res.status(400).json({ success: false, message: 'You have already collected your daily yield for today. Come back tomorrow!' });
    }

    // Fetch product details
    const Product = require('../models/Product');
    const product = await Product.findOne({ name: user.plan });
    if (!product) {
      return res.status(404).json({ success: false, message: 'Active plan product details not found.' });
    }

    // Award daily income
    user.balance += product.daily;
    await user.save();

    const yieldLog = new Transaction({
      userId: user._id,
      userPhone: user.phoneNumber,
      type: 'income',
      amount: product.daily,
      status: 'completed',
      description: `${user.plan} Daily Yield (Manual Claim)`
    });
    await yieldLog.save();

    res.json({
      success: true,
      message: `Daily yield of GHS ${product.daily} claimed successfully!`,
      balance: user.balance
    });
  } catch (error) {
    console.error('Manual claim yield error:', error);
    res.status(500).json({ success: false, message: 'Server Error' });
  }
});

// @route   GET /api/user/admin/teams
// @desc    Get all teams statistics (Admin only)
router.get('/admin/teams', authenticateToken, isAdmin, async (req, res) => {
  try {
    const users = await User.find({ role: 'user' });
    const teams = [];

    for (const u of users) {
      // Find L1
      const l1 = await User.find({ referredBy: u._id });
      if (l1.length === 0) continue; // No team

      const l1Ids = l1.map(x => x._id);

      // Find L2
      let l2 = [];
      if (l1Ids.length > 0) {
        l2 = await User.find({ referredBy: { $in: l1Ids } });
      }
      const l2Ids = l2.map(x => x._id);

      // Find L3
      let l3 = [];
      if (l2Ids.length > 0) {
        l3 = await User.find({ referredBy: { $in: l2Ids } });
      }

      const allTeam = [...l1, ...l2, ...l3];
      const activeMembers = allTeam.filter(x => x.plan && x.plan !== 'None').length;

      // Calculate commissions earned
      const commissions = await Transaction.find({
        userId: u._id,
        type: 'income',
        description: { $regex: 'Commission' }
      });
      const totalCommission = commissions.reduce((sum, c) => sum + c.amount, 0);

      // Create members detail list
      const members = allTeam.slice(0, 10).map(m => {
        const level = l1Ids.includes(m._id) ? 1 : l2Ids.includes(m._id) ? 2 : 3;
        return {
          phone: m.phoneNumber,
          level,
          plan: m.plan || 'None',
          contribution: commissions.filter(c => c.description && c.description.includes(m.phoneNumber)).reduce((s, c) => s + c.amount, 0)
        };
      });

      teams.push({
        id: u._id,
        inviteCode: u.inviteCode || 'N/A',
        phone: u.phoneNumber,
        joinDate: u.createdAt ? new Date(u.createdAt).toLocaleDateString('en-CA') : 'N/A',
        teamSize: allTeam.length,
        activeMembers,
        commission: totalCommission,
        status: u.status === 'suspended' ? 'Banned' : 'Active',
        banReason: u.status === 'suspended' ? 'Suspended by admin.' : '',
        teamDetails: { level1: l1.length, level2: l2.length, level3: l3.length },
        members
      });
    }

    res.json({ success: true, teams });
  } catch (error) {
    console.error('Error fetching admin teams stats:', error);
    res.status(500).json({ success: false, message: 'Server Error' });
  }
});

// ==========================================
// WALLET MANAGEMENT ENDPOINTS
// ==========================================

// @route   GET /api/user/wallets
// @desc    Get user's wallets list
router.get('/wallets', authenticateToken, async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });
    res.json({ success: true, wallets: user.wallets || [] });
  } catch (error) {
    console.error('Error fetching wallets:', error);
    res.status(500).json({ success: false, message: 'Server Error' });
  }
});

// @route   POST /api/user/wallets
// @desc    Add a new wallet account
router.post('/wallets', authenticateToken, async (req, res) => {
  try {
    const { type, label, number, bankName } = req.body;
    if (!type || !label || !number) {
      return res.status(400).json({ success: false, message: 'Please provide type, label, and number' });
    }

    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });

    // If first wallet, set as default
    const isDefault = user.wallets.length === 0;

    user.wallets.push({ type, label, number, bankName: bankName || '', isDefault });
    await user.save();

    res.status(201).json({ success: true, wallets: user.wallets });
  } catch (error) {
    console.error('Error adding wallet:', error);
    res.status(500).json({ success: false, message: 'Server Error' });
  }
});

// @route   DELETE /api/user/wallets/:id
// @desc    Delete a wallet account
router.delete('/wallets/:id', authenticateToken, async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });

    const walletToDelete = user.wallets.id(req.params.id);
    if (!walletToDelete) {
      return res.status(404).json({ success: false, message: 'Wallet not found' });
    }

    const wasDefault = walletToDelete.isDefault;
    user.wallets.pull({ _id: req.params.id });

    // If deleted the default wallet, set the first remaining one as default
    if (wasDefault && user.wallets.length > 0) {
      user.wallets[0].isDefault = true;
    }

    await user.save();
    res.json({ success: true, wallets: user.wallets });
  } catch (error) {
    console.error('Error deleting wallet:', error);
    res.status(500).json({ success: false, message: 'Server Error' });
  }
});

// @route   PUT /api/user/wallets/:id/default
// @desc    Set a wallet account as default
router.put('/wallets/:id/default', authenticateToken, async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });

    let found = false;
    user.wallets.forEach(w => {
      if (w._id.toString() === req.params.id) {
        w.isDefault = true;
        found = true;
      } else {
        w.isDefault = false;
      }
    });

    if (!found) {
      return res.status(404).json({ success: false, message: 'Wallet not found' });
    }

    await user.save();
    res.json({ success: true, wallets: user.wallets });
  } catch (error) {
    console.error('Error setting default wallet:', error);
    res.status(500).json({ success: false, message: 'Server Error' });
  }
});


// ==========================================
// SUPPORT TICKET ENDPOINTS
// ==========================================
const Ticket = require('../models/Ticket');

// @route   POST /api/user/ticket
// @desc    Submit deposit problem ticket (User)
router.post('/ticket', authenticateToken, async (req, res) => {
  try {
    const { date, time, userWallet, platformWallet, amount } = req.body;
    if (!date || !time || !userWallet || !platformWallet || !amount) {
      return res.status(400).json({ success: false, message: 'Please provide all required fields' });
    }

    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });

    const ticket = new Ticket({
      userId: user._id,
      userPhone: user.phoneNumber,
      date,
      time,
      userWallet,
      platformWallet,
      amount: Number(amount)
    });

    await ticket.save();
    res.status(201).json({ success: true, message: 'Deposit problem ticket submitted successfully', ticket });
  } catch (error) {
    console.error('Error submitting support ticket:', error);
    res.status(500).json({ success: false, message: 'Server Error' });
  }
});

// @route   GET /api/user/admin/tickets
// @desc    Get all support tickets (Admin only)
router.get('/admin/tickets', authenticateToken, isAdmin, async (req, res) => {
  try {
    const list = await Ticket.find().sort({ createdAt: -1 });
    res.json({ success: true, tickets: list });
  } catch (error) {
    console.error('Error fetching support tickets:', error);
    res.status(500).json({ success: false, message: 'Server Error' });
  }
});

// @route   PUT /api/user/admin/ticket/:id
// @desc    Mark support ticket as resolved (Admin only)
router.put('/admin/ticket/:id', authenticateToken, isAdmin, async (req, res) => {
  try {
    const { status } = req.body; // 'pending' or 'resolved'
    if (status !== 'pending' && status !== 'resolved') {
      return res.status(400).json({ success: false, message: 'Invalid status' });
    }

    const ticket = await Ticket.findById(req.params.id);
    if (!ticket) {
      return res.status(404).json({ success: false, message: 'Ticket not found' });
    }

    ticket.status = status;
    await ticket.save();

    res.json({ success: true, message: `Ticket status updated to ${status} successfully!`, ticket });
  } catch (error) {
    console.error('Error updating support ticket status:', error);
    res.status(500).json({ success: false, message: 'Server Error' });
  }
});

// @route   POST /api/user/admin/pay-weekly-incentives
// @desc    Distribute weekly incentives/salaries to leaders (Admin only)
router.post('/admin/pay-weekly-incentives', authenticateToken, isAdmin, async (req, res) => {
  try {
    const leaders = await User.find({ weeklyIncentive: { $gt: 0 } });
    if (leaders.length === 0) {
      return res.json({ success: true, message: 'No leaders qualified for weekly incentive payouts.' });
    }

    let totalPaid = 0;
    let usersCount = 0;

    for (const leader of leaders) {
      leader.balance += leader.weeklyIncentive;
      await leader.save();

      const incentiveLog = new Transaction({
        userId: leader._id,
        userPhone: leader.phoneNumber,
        type: 'income',
        amount: leader.weeklyIncentive,
        status: 'completed',
        description: `Weekly Leadership Incentive (${leader.certificate})`
      });
      await incentiveLog.save();

      totalPaid += leader.weeklyIncentive;
      usersCount++;
    }

    res.json({
      success: true,
      message: `Successfully distributed weekly incentive of GHS ${totalPaid} to ${usersCount} leaders.`,
      usersCount,
      totalPaid
    });
  } catch (error) {
    console.error('Error distributing weekly incentives:', error);
    res.status(500).json({ success: false, message: 'Server Error' });
  }
});

// @route   GET /api/user/admin/referrals
// @desc    Get all referral records and statistics (Admin only)
router.get('/admin/referrals', authenticateToken, isAdmin, async (req, res) => {
  try {
    const referredUsers = await User.find({ referredBy: { $ne: null } })
      .populate('referredBy', 'phoneNumber')
      .sort({ createdAt: -1 });

    // 1. Calculate stats
    const totalReferrals = referredUsers.length;
    const pendingInvites = referredUsers.filter(u => u.referralStatus === 'pending').length;

    // Sum all referral commission transactions
    const commissionTxs = await Transaction.find({
      type: 'income',
      description: { $regex: /Commission/i }
    });
    const totalRewardsPaid = commissionTxs.reduce((sum, tx) => sum + tx.amount, 0);

    // 2. Build detailed referral list
    const referralsList = [];
    for (const invitee of referredUsers) {
      if (!invitee.referredBy) continue;

      // Find all commissions paid to this inviter for this invitee
      const inviterId = invitee.referredBy._id;
      const escapedPhone = invitee.phoneNumber.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
      const txs = await Transaction.find({
        userId: inviterId,
        type: 'income',
        description: { $regex: new RegExp(escapedPhone, 'i') }
      });
      const rewardSum = txs.reduce((sum, tx) => sum + tx.amount, 0);

      referralsList.push({
        id: invitee._id,
        inviter: invitee.referredBy.phoneNumber,
        invitee: invitee.phoneNumber,
        date: invitee.createdAt ? new Date(invitee.createdAt).toISOString().split('T')[0] : "",
        reward: rewardSum,
        status: invitee.referralStatus || 'pending'
      });
    }

    res.json({
      success: true,
      stats: {
        totalReferrals,
        totalRewardsPaid,
        pendingInvites
      },
      referrals: referralsList
    });
  } catch (error) {
    console.error('Error fetching admin referrals stats:', error);
    res.status(500).json({ success: false, message: 'Server Error' });
  }
});

// @route   POST /api/user/admin/referrals/approve/:id
// @desc    Approve a pending referral and pay inviter a signup reward (Admin only)
router.post('/admin/referrals/approve/:id', authenticateToken, isAdmin, async (req, res) => {
  try {
    const invitee = await User.findById(req.params.id);
    if (!invitee) {
      return res.status(404).json({ success: false, message: 'Invitee user not found' });
    }

    if (invitee.referralStatus === 'completed') {
      return res.status(400).json({ success: false, message: 'Referral is already completed' });
    }

    if (!invitee.referredBy) {
      return res.status(400).json({ success: false, message: 'User was not referred by anyone' });
    }

    const inviter = await User.findById(invitee.referredBy);
    if (!inviter) {
      return res.status(404).json({ success: false, message: 'Inviter user not found' });
    }

    // 1. Mark referral complete
    invitee.referralStatus = 'completed';
    await invitee.save();

    // 2. Pay a flat signup commission reward (GHS 30) to inviter
    const referralReward = 30; // standard GHS 30 signup bonus
    inviter.balance += referralReward;
    await inviter.save();

    // 3. Log transaction
    const rewardLog = new Transaction({
      userId: inviter._id,
      userPhone: inviter.phoneNumber,
      type: 'income',
      amount: referralReward,
      status: 'completed',
      description: `Referral signup commission from ${invitee.phoneNumber} (Approved by Admin)`
    });
    await rewardLog.save();

    res.json({
      success: true,
      message: `Successfully approved referral. Paid GHS ${referralReward} to ${inviter.phoneNumber}.`
    });
  } catch (error) {
    console.error('Error approving referral:', error);
    res.status(500).json({ success: false, message: 'Server Error' });
  }
});

module.exports = router;
