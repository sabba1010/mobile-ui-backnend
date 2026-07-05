const User = require('../models/User');

const seedSuperAdmin = async () => {
  try {
    const adminPhone = process.env.SUPER_ADMIN_PHONE;
    const adminPassword = process.env.SUPER_ADMIN_PASSWORD;

    if (!adminPhone || !adminPassword) {
      console.log('Super admin credentials missing in .env. Skipping admin seed.');
      return;
    }

    const adminExists = await User.findOne({ phoneNumber: adminPhone });
    if (!adminExists) {
      await User.create({
        phoneNumber: adminPhone,
        password: adminPassword,
        role: 'super_admin'
      });
      console.log('Super Admin account created successfully.');
    } else {
      console.log('Super Admin account already exists.');
    }
  } catch (error) {
    console.error('Error seeding super admin:', error);
  }
};

module.exports = seedSuperAdmin;
