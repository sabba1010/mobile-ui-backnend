require('dotenv').config({ path: '../.env' });
const mongoose = require('mongoose');
const Product = require('../models/Product');

async function updateImages() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB.');

    const products = await Product.find().sort({ price: 1 });
    
    for (let i = 0; i < products.length; i++) {
      const url = i % 2 === 0 
        ? "https://i.ibb.co.com/CqbjZKz/1-2.png" 
        : "https://i.ibb.co.com/4ZgZf5gW/2.png";
      
      products[i].image = url;
      await products[i].save();
    }
    
    console.log('Successfully updated all product images!');
    process.exit(0);
  } catch (error) {
    console.error('Error updating images:', error);
    process.exit(1);
  }
}

updateImages();
