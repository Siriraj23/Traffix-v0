const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
require('dotenv').config();

async function resetDemoUsers() {
    try {
        await mongoose.connect('mongodb://localhost:27017/traffic_violation');
        console.log('Connected to MongoDB');
        
        // Define User schema
        const UserSchema = new mongoose.Schema({
            username: String,
            email: String,
            password: String,
            role: String,
            fullName: String,
            phone: String,
            emailVerified: Boolean
        });
        
        const User = mongoose.model('User', UserSchema);
        
        // Delete existing demo users if any
        await User.deleteMany({ email: { $in: ['admin@traffic.com', 'public@example.com'] } });
        console.log('Removed existing demo users');
        
        // Create admin user
        const hashedAdminPassword = await bcrypt.hash('admin123', 10);
        const adminUser = new User({
            username: 'admin',
            email: 'admin@traffic.com',
            password: hashedAdminPassword,
            role: 'admin',
            fullName: 'System Administrator',
            phone: '+91 9876543210',
            emailVerified: true
        });
        await adminUser.save();
        console.log('✅ Admin user created: admin@traffic.com / admin123');
        
        // Create public user
        const hashedPublicPassword = await bcrypt.hash('public123', 10);
        const publicUser = new User({
            username: 'publicuser',
            email: 'public@example.com',
            password: hashedPublicPassword,
            role: 'viewer',
            fullName: 'Demo Public User',
            phone: '+91 1234567890',
            emailVerified: true
        });
        await publicUser.save();
        console.log('✅ Public user created: public@example.com / public123');
        
        // Verify users were created
        const users = await User.find({});
        console.log('\n📊 All users in database:');
        users.forEach(user => {
            console.log(`   - ${user.email} (${user.role})`);
        });
        
        await mongoose.disconnect();
        console.log('\n✅ Demo users reset successfully!');
        
    } catch (error) {
        console.error('Error:', error);
    }
}

resetDemoUsers();