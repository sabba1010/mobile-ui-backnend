const Announcement = require('../models/Announcement');

const seedAnnouncements = async () => {
  try {
    const count = await Announcement.countDocuments();
    if (count > 0) return;

    await Announcement.insertMany([
      { title: "New VIP 6 Plan Launched!", message: "Earn GHS 704 daily with our new premium plan.", published: true },
      { title: "Referral Bonus Increased", message: "Level 1 commission raised to 20% for July 2026!", published: true },
      { title: "Maintenance Scheduled", message: "Platform maintenance July 5th, 2–4AM UTC.", published: false },
    ]);
    console.log('Seeded announcements successfully.');
  } catch (err) {
    console.error('Error seeding announcements:', err);
  }
};

module.exports = seedAnnouncements;
