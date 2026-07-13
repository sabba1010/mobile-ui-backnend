require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const seedSuperAdmin = require('./utils/seedAdmin');
const seedTransactions = require('./utils/seedTransactions');
const seedAnnouncements = require('./utils/seedAnnouncements');
const seedSettings = require('./utils/seedSettings');

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// Database connection check middleware
app.use((req, res, next) => {
  if (!process.env.MONGODB_URI) {
    return res.status(500).json({
      success: false,
      message: 'MONGODB_URI is not defined in environment variables. Please add it to your Vercel project settings.'
    });
  }
  
  if (mongoose.connection.readyState === 0) {
    mongoose.connect(process.env.MONGODB_URI)
      .then(() => {
        console.log('Lazy connected to MongoDB Atlas successfully!');
      })
      .catch((err) => {
        console.error('Lazy connection error connecting to MongoDB:', err);
      });
  }
  next();
});

// Database connection
if (process.env.MONGODB_URI) {
  mongoose.connect(process.env.MONGODB_URI)
    .then(() => {
      console.log('Connected to MongoDB Atlas successfully!');
      seedSuperAdmin();
      // seedTransactions();
      seedAnnouncements();
      seedSettings();
    })
    .catch((err) => {
      console.error('Error connecting to MongoDB:', err);
    });
}

// Routes
const authRoutes = require('./routes/auth');
const userRoutes = require('./routes/user');
const productRoutes = require('./routes/products');
const announcementRoutes = require('./routes/announcements');

app.use('/api/auth', authRoutes);
app.use('/api/user', userRoutes);
app.use('/api/products', productRoutes);
app.use('/api/announcements', announcementRoutes);

// Basic route
app.get('/', (req, res) => {
  res.send('VIP Investment API is running...');
});

// Server listener (only if not running on Vercel)
if (process.env.NODE_ENV !== 'production') {
  app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
  });
}

module.exports = app;
