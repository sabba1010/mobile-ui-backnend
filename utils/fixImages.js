require('dotenv').config();
const mongoose = require('mongoose');
const Product = require('../models/Product');

async function fix() {
  await mongoose.connect(process.env.MONGODB_URI || "mongodb+srv://admin:admin@cluster0.abcde.mongodb.net/vip-platform");
  await Product.updateMany({}, { image: 'https://i.ibb.co.com/4ZgZf5gW/2.png' });
  console.log('Images updated successfully');
  process.exit(0);
}

fix().catch(console.error);
