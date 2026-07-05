const Settings = require('../models/Settings');

const seedSettings = async () => {
  try {
    const count = await Settings.countDocuments();
    if (count === 0) {
      const defaultSettings = new Settings();
      await defaultSettings.save();
      console.log('Default platform settings seeded successfully.');
    }
  } catch (err) {
    console.error('Error seeding settings:', err);
  }
};

module.exports = seedSettings;
