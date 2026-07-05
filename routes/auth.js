const express = require('express');
const router = express.Router();
const User = require('../models/User');
const jwt = require('jsonwebtoken');

// Register Route
router.post('/register', async (req, res) => {
  try {
    const { phoneNumber, password, inviteCode } = req.body;

    // Check if user exists
    let user = await User.findOne({ phoneNumber });
    if (user) {
      return res.status(400).json({ message: 'User already exists' });
    }

    let referredByUser = null;
    if (inviteCode) {
      referredByUser = await User.findOne({ inviteCode: inviteCode.trim().toUpperCase() });
    }

    // Create new user
    user = new User({
      phoneNumber,
      password,
      referredBy: referredByUser ? referredByUser._id : null
    });

    await user.save();

    if (referredByUser) {
      referredByUser.referrals = (referredByUser.referrals || 0) + 1;
      await referredByUser.save();
    }

    res.status(201).json({ message: 'User registered successfully' });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ message: 'Server error during registration' });
  }
});

// Login Route
router.post('/login', async (req, res) => {
  try {
    const { phoneNumber, password } = req.body;

    // Check if user exists
    const user = await User.findOne({ phoneNumber });
    if (!user) {
      return res.status(401).json({ message: 'Invalid phone number or password' });
    }

    // Check password
    const isMatch = await user.matchPassword(password);
    if (!isMatch) {
      return res.status(401).json({ message: 'Invalid phone number or password' });
    }

    // Create JWT payload
    const payload = {
      user: {
        id: user._id,
        role: user.role
      }
    };

    // Use a default secret if not provided in .env
    const jwtSecret = process.env.JWT_SECRET || 'vip_invest_fallback_secret_key_123!';

    // Sign Token
    jwt.sign(
      payload,
      jwtSecret,
      { expiresIn: '7d' },
      (err, token) => {
        if (err) throw err;
        res.json({
          token,
          user: {
            id: user._id,
            phoneNumber: user.phoneNumber,
            role: user.role
          }
        });
      }
    );
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ message: 'Server error during login' });
  }
});

module.exports = router;
