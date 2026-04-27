const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const http = require('http');
const socketIO = require('socket.io');
const fs = require('fs');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const axios = require('axios');
const FormData = require('form-data');
require('dotenv').config();

const User = require('./models/User');
const Violation = require('./models/Violation');

const app = express();
const server = http.createServer(app);

/* ================= SOCKET.IO ================= */
const io = socketIO(server, {
    cors: {
        origin: "http://localhost:3000",
        methods: ["GET", "POST"]
    }
});

global.io = io;

/* ================= CONFIGURATION ================= */
const AI_MODEL_URL = process.env.AI_MODEL_URL || 'http://localhost:8000';
const AI_MODEL_ENABLED = process.env.AI_MODEL_ENABLED !== 'false';
const JWT_SECRET = process.env.JWT_SECRET || 'traffix-secret-key-change-in-production-2024';
const PORT = process.env.PORT || 5001;

/* ================= MIDDLEWARE ================= */
app.use(cors({
    origin: 'http://localhost:3000',
    credentials: true
}));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));
app.use('/uploads', express.static('uploads'));

/* ================= AUTH MIDDLEWARE ================= */
const authMiddleware = async (req, res, next) => {
    try {
        const token = req.headers.authorization?.split(' ')[1];
        
        if (!token) {
            return res.status(401).json({ 
                success: false,
                error: 'Access denied. No token provided.' 
            });
        }
        
        const decoded = jwt.verify(token, JWT_SECRET);
        const user = await User.findById(decoded.userId).select('-password');
        
        if (!user) {
            return res.status(401).json({ 
                success: false,
                error: 'Invalid token. User not found.' 
            });
        }
        
        if (!user.isActive) {
            return res.status(401).json({ 
                success: false,
                error: 'Account is deactivated.' 
            });
        }
        
        req.user = user;
        next();
    } catch (error) {
        if (error.name === 'JsonWebTokenError') {
            return res.status(401).json({ 
                success: false,
                error: 'Invalid token.' 
            });
        }
        if (error.name === 'TokenExpiredError') {
            return res.status(401).json({ 
                success: false,
                error: 'Token expired.' 
            });
        }
        return res.status(500).json({ 
            success: false,
            error: 'Internal server error.' 
        });
    }
};

/* ================= CREATE UPLOADS FOLDER ================= */
if (!fs.existsSync('./uploads')) {
    fs.mkdirSync('./uploads', { recursive: true });
}

/* ================= MULTER CONFIG ================= */
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, './uploads');
    },
    filename: function (req, file, cb) {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, uniqueSuffix + '-' + file.originalname);
    }
});

const upload = multer({ 
    storage: storage,
    limits: {
        fileSize: 500 * 1024 * 1024 // 500MB
    }
});

/* ================= AUTH ROUTES ================= */

// POST /api/auth/login - User Login
app.post('/api/auth/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        
        console.log('🔑 Login attempt:', email);
        
        // Validate input
        if (!email || !password) {
            return res.status(400).json({ 
                success: false,
                detail: 'Email and password are required' 
            });
        }
        
        // Find user
        const user = await User.findOne({ email: email.toLowerCase() });
        
        if (!user) {
            console.log('❌ User not found:', email);
            return res.status(401).json({ 
                success: false,
                detail: 'Invalid email or password' 
            });
        }
        
        // Check if user is active
        if (!user.isActive) {
            return res.status(401).json({ 
                success: false,
                detail: 'Account is deactivated. Contact administrator.' 
            });
        }
        
        // Check if Google user trying to login with password
        if (user.provider === 'google' && !password.startsWith('google_')) {
            return res.status(401).json({ 
                success: false,
                detail: 'Please login with Google for this account' 
            });
        }
        
        // Verify password using model method
        const isMatch = await user.comparePassword(password);
        
        if (!isMatch) {
            console.log('❌ Invalid password for:', email);
            return res.status(401).json({ 
                success: false,
                detail: 'Invalid email or password' 
            });
        }
        
        // Generate JWT token
        const token = jwt.sign(
            { 
                userId: user._id, 
                role: user.role,
                email: user.email 
            },
            JWT_SECRET,
            { expiresIn: '7d' }
        );
        
        // Prepare user data (exclude sensitive info)
        const userData = {
            id: user._id,
            username: user.username,
            email: user.email,
            fullName: user.fullName,
            role: user.role,
            phone: user.phone,
            vehicleNumber: user.vehicleNumber,
            displayName: user.displayName,
            userType: user.userType,
            emailVerified: user.emailVerified,
            phoneVerified: user.phoneVerified
        };
        
        console.log('✅ Login successful:', email, 'Role:', user.role);
        
        res.json({
            success: true,
            token,
            user: userData,
            message: 'Login successful'
        });
        
    } catch (error) {
        console.error('❌ Login error:', error);
        res.status(500).json({ 
            success: false,
            detail: 'Server error during login' 
        });
    }
});

// POST /api/auth/register - User Registration
app.post('/api/auth/register', async (req, res) => {
    try {
        const { 
            username, 
            email, 
            password, 
            fullName, 
            phone, 
            role,
            provider,
            googleId,
            emailVerified,
            phoneVerified 
        } = req.body;
        
        console.log('📝 Register attempt:', email);
        
        // Validate required fields
        if (!email || !password || !username) {
            return res.status(400).json({ 
                success: false,
                detail: 'Email, password, and username are required' 
            });
        }
        
        // Validate email format
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
            return res.status(400).json({ 
                success: false,
                detail: 'Invalid email format' 
            });
        }
        
        // Validate password strength
        if (password.length < 6) {
            return res.status(400).json({ 
                success: false,
                detail: 'Password must be at least 6 characters' 
            });
        }
        
        // Validate username
        if (username.length < 3) {
            return res.status(400).json({ 
                success: false,
                detail: 'Username must be at least 3 characters' 
            });
        }
        
        // Check if user already exists
        const existingUser = await User.findOne({ 
            $or: [
                { email: email.toLowerCase() },
                { username: username.toLowerCase() }
            ] 
        });
        
        if (existingUser) {
            if (existingUser.email === email.toLowerCase()) {
                return res.status(400).json({ 
                    success: false,
                    detail: 'Email already registered' 
                });
            }
            return res.status(400).json({ 
                success: false,
                detail: 'Username already taken' 
            });
        }
        
        // Create user - password will be hashed by pre-save hook
        const user = new User({
            username: username.toLowerCase(),
            email: email.toLowerCase(),
            password: password, // Plain password - hook will hash it
            fullName: fullName || username,
            phone: phone || '',
            role: role || 'viewer',
            provider: provider || 'email',
            googleId: googleId || null,
            emailVerified: emailVerified || false,
            phoneVerified: phoneVerified || false
        });
        
        await user.save();
        
        console.log('✅ User registered:', email);
        
        // Return success (don't include password)
        res.status(201).json({
            success: true,
            message: 'Registration successful',
            user: {
                id: user._id,
                username: user.username,
                email: user.email,
                role: user.role,
                displayName: user.displayName
            }
        });
        
    } catch (error) {
        console.error('❌ Registration error:', error);
        
        // Handle duplicate key error
        if (error.code === 11000) {
            const field = Object.keys(error.keyPattern)[0];
            return res.status(400).json({ 
                success: false,
                detail: `${field.charAt(0).toUpperCase() + field.slice(1)} already exists` 
            });
        }
        
        // Handle validation errors
        if (error.name === 'ValidationError') {
            const messages = Object.values(error.errors).map(err => err.message);
            return res.status(400).json({ 
                success: false,
                detail: messages.join(', ') 
            });
        }
        
        res.status(500).json({ 
            success: false,
            detail: 'Server error during registration' 
        });
    }
});

// GET /api/auth/me - Get Current User
app.get('/api/auth/me', authMiddleware, async (req, res) => {
    try {
        const user = await User.findById(req.user._id).select('-password');
        res.json({ 
            success: true,
            user 
        });
    } catch (error) {
        console.error('Error fetching user:', error);
        res.status(500).json({ 
            success: false,
            detail: 'Error fetching user data' 
        });
    }
});

// PUT /api/auth/profile - Update Profile
app.put('/api/auth/profile', authMiddleware, async (req, res) => {
    try {
        const { fullName, phone, vehicleNumber } = req.body;
        const updates = {};
        
        if (fullName) updates.fullName = fullName;
        if (phone) updates.phone = phone;
        if (vehicleNumber) updates.vehicleNumber = vehicleNumber;
        
        const user = await User.findByIdAndUpdate(
            req.user._id,
            { $set: updates },
            { new: true, runValidators: true }
        ).select('-password');
        
        res.json({ 
            success: true,
            user,
            message: 'Profile updated successfully' 
        });
    } catch (error) {
        console.error('Error updating profile:', error);
        res.status(500).json({ 
            success: false,
            detail: 'Error updating profile' 
        });
    }
});

/* ================= DATABASE CONNECTION ================= */
mongoose.connect(process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/traffic_violation')
    .then(async () => {
        console.log('✅ MongoDB Connected');
        
        // Create default users if they don't exist
        try {
            // Default Admin
            const adminEmail = 'admin@traffic.com';
            const adminUser = await User.findOne({ email: adminEmail });
            
            if (!adminUser) {
                await User.create({
                    username: 'admin',
                    email: adminEmail,
                    password: 'admin123', // Will be hashed by pre-save hook
                    fullName: 'Administrator',
                    role: 'admin',
                    emailVerified: true,
                    phoneVerified: true
                });
                console.log('✅ Default admin created: admin@traffic.com / admin123');
            } else {
                console.log('ℹ️ Admin user already exists');
            }
            
            // Default Public User
            const publicEmail = 'public@example.com';
            const publicUser = await User.findOne({ email: publicEmail });
            
            if (!publicUser) {
                await User.create({
                    username: 'public',
                    email: publicEmail,
                    password: 'public123', // Will be hashed by pre-save hook
                    fullName: 'Public User',
                    role: 'viewer',
                    emailVerified: true,
                    phoneVerified: true
                });
                console.log('✅ Default public user created: public@example.com / public123');
            } else {
                console.log('ℹ️ Public user already exists');
            }
            
            // Default Operator
            const operatorEmail = 'operator@traffic.com';
            const operatorUser = await User.findOne({ email: operatorEmail });
            
            if (!operatorUser) {
                await User.create({
                    username: 'operator',
                    email: operatorEmail,
                    password: 'operator123', // Will be hashed by pre-save hook
                    fullName: 'Traffic Operator',
                    role: 'operator',
                    emailVerified: true,
                    phoneVerified: true
                });
                console.log('✅ Default operator created: operator@traffic.com / operator123');
            } else {
                console.log('ℹ️ Operator user already exists');
            }
            
        } catch (err) {
            console.error('⚠️ User seed error:', err.message);
        }
    })
    .catch(err => {
        console.error('❌ MongoDB Connection Error:', err.message);
        process.exit(1);
    });

/* ================= VIOLATIONS ROUTES ================= */

// GET /api/violations - Get all violations
app.get('/api/violations', async (req, res) => {
    try {
        console.log('🔍 Fetching violations with query:', req.query);
        const limit = parseInt(req.query.limit) || 100;
        const page = parseInt(req.query.page) || 1;
        const skip = (page - 1) * limit;
        
        const violations = await Violation.find()
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit);
        
        const total = await Violation.countDocuments();
        
        console.log(`✅ Found ${violations.length} violations`);
        res.json({
            success: true,
            violations: violations,
            data: violations,
            pagination: {
                total,
                page,
                pages: Math.ceil(total / limit),
                limit
            }
        });
    } catch (error) {
        console.error('❌ Error fetching violations:', error);
        res.status(500).json({ 
            success: false, 
            error: error.message 
        });
    }
});

// GET /api/violations/stats - Get violation statistics
app.get('/api/violations/stats', async (req, res) => {
    try {
        const total = await Violation.countDocuments();
        const byType = await Violation.aggregate([
            { $group: { _id: '$type', count: { $sum: 1 } } }
        ]);
        const totalFine = await Violation.aggregate([
            { $group: { _id: null, total: { $sum: '$fineAmount' } } }
        ]);
        const byStatus = await Violation.aggregate([
            { $group: { _id: '$status', count: { $sum: 1 } } }
        ]);
        
        res.json({
            success: true,
            data: {
                total,
                byType,
                byStatus,
                totalFine: totalFine[0]?.total || 0
            }
        });
    } catch (error) {
        console.error('❌ Error fetching stats:', error);
        res.status(500).json({ 
            success: false,
            error: error.message 
        });
    }
});

// GET /api/violations/stats/all - Detailed statistics
app.get('/api/violations/stats/all', async (req, res) => {
    try {
        const total = await Violation.countDocuments();
        const byType = await Violation.aggregate([
            { $group: { _id: '$type', count: { $sum: 1 } } }
        ]);
        const totalFine = await Violation.aggregate([
            { $group: { _id: null, total: { $sum: '$fineAmount' } } }
        ]);
        const byStatus = await Violation.aggregate([
            { $group: { _id: '$status', count: { $sum: 1 } } }
        ]);
        const bySeverity = await Violation.aggregate([
            { $group: { _id: '$severity', count: { $sum: 1 } } }
        ]);
        
        res.json({
            success: true,
            data: {
                total,
                byType,
                byStatus,
                bySeverity,
                totalFine: totalFine[0]?.total || 0
            }
        });
    } catch (error) {
        console.error('❌ Error fetching detailed stats:', error);
        res.status(500).json({ 
            success: false,
            error: error.message 
        });
    }
});

// GET /api/violations/:id - Get single violation
app.get('/api/violations/:id', async (req, res) => {
    try {
        let violation;
        
        // Try to find by MongoDB _id first
        if (req.params.id.match(/^[0-9a-fA-F]{24}$/)) {
            violation = await Violation.findById(req.params.id);
        }
        
        // If not found, try by violationId
        if (!violation) {
            violation = await Violation.findOne({ violationId: req.params.id });
        }
        
        if (!violation) {
            return res.status(404).json({ 
                success: false, 
                error: 'Violation not found' 
            });
        }
        
        res.json({ 
            success: true, 
            data: violation, 
            violation: violation 
        });
    } catch (error) {
        console.error('❌ Error fetching violation:', error);
        res.status(500).json({ 
            success: false, 
            error: error.message 
        });
    }
});

// POST /api/violations - Create violation
app.post('/api/violations', async (req, res) => {
    try {
        console.log('📝 Creating violation with data:', req.body);
        
        const count = await Violation.countDocuments();
        
        const { 
            type, 
            confidence, 
            description,
            vehicleNumber, 
            status, 
            fineAmount, 
            severity,
            source,
            mediaType,
            vehicleId,
            location,
            timestamp
        } = req.body;
        
        // Generate violationId
        const violationId = `VIO-${Date.now()}-${Math.floor(Math.random() * 1000)}-${count + 1}`;
        
        const newViolation = new Violation({
            violationId: violationId,
            type: type,
            vehicleNumber: vehicleNumber || 'UNKNOWN',
            vehicleId: vehicleId || `MANUAL_${Date.now()}`,
            confidence: confidence,
            description: description || `${type} violation detected`,
            status: status || 'detected',
            fineAmount: fineAmount || (type === 'no_helmet' ? 1000 : type === 'triple_riding' ? 2000 : 5000),
            severity: severity || 'medium',
            location: location || 'Manual Upload',
            source: source || 'manual_upload',
            mediaType: mediaType || 'image',
            timestamp: timestamp || new Date(),
            details: {
                timestamp: new Date().toISOString(),
                source: source || 'manual_upload',
                confidence: confidence
            }
        });
        
        const savedViolation = await newViolation.save();
        console.log(`✅ Violation saved: ${savedViolation.violationId} (${savedViolation._id})`);
        
        // Emit socket event
        if (global.io) {
            global.io.emit('new_violation', savedViolation);
            console.log('📢 Emitted new_violation event');
        }
        
        res.status(201).json({
            success: true,
            data: savedViolation,
            violation: savedViolation,
            message: 'Violation saved successfully'
        });
        
    } catch (error) {
        console.error('❌ Error creating violation:', error);
        res.status(500).json({ 
            success: false, 
            error: error.message,
            details: error.errors 
        });
    }
});

// PUT /api/violations/:id - Update violation
app.put('/api/violations/:id', async (req, res) => {
    try {
        console.log(`✏️ Updating violation ${req.params.id}:`, req.body);
        
        let violation;
        
        // Try to find by MongoDB _id first
        if (req.params.id.match(/^[0-9a-fA-F]{24}$/)) {
            violation = await Violation.findById(req.params.id);
        }
        
        // If not found, try by violationId
        if (!violation) {
            violation = await Violation.findOne({ violationId: req.params.id });
        }
        
        if (!violation) {
            return res.status(404).json({ 
                success: false, 
                error: 'Violation not found' 
            });
        }
        
        Object.assign(violation, req.body);
        violation.updatedAt = new Date();
        await violation.save();
        
        console.log(`✅ Violation updated: ${violation._id}`);
        res.json({ 
            success: true, 
            data: violation, 
            violation: violation 
        });
    } catch (error) {
        console.error('❌ Error updating violation:', error);
        res.status(500).json({ 
            success: false, 
            error: error.message 
        });
    }
});

// DELETE /api/violations/:id - Delete violation
app.delete('/api/violations/:id', async (req, res) => {
    try {
        let violation;
        
        // Try to find by MongoDB _id first
        if (req.params.id.match(/^[0-9a-fA-F]{24}$/)) {
            violation = await Violation.findByIdAndDelete(req.params.id);
        }
        
        // If not found, try by violationId
        if (!violation) {
            violation = await Violation.findOneAndDelete({ violationId: req.params.id });
        }
        
        if (!violation) {
            return res.status(404).json({ 
                success: false, 
                error: 'Violation not found' 
            });
        }
        
        console.log(`✅ Violation deleted: ${req.params.id}`);
        res.json({ 
            success: true, 
            message: 'Violation deleted successfully' 
        });
    } catch (error) {
        console.error('❌ Error deleting violation:', error);
        res.status(500).json({ 
            success: false, 
            error: error.message 
        });
    }
});

// POST /api/violations/:id/pay - Pay fine for violation
app.post('/api/violations/:id/pay', async (req, res) => {
    try {
        let violation;
        
        // Try to find by MongoDB _id first
        if (req.params.id.match(/^[0-9a-fA-F]{24}$/)) {
            violation = await Violation.findById(req.params.id);
        }
        
        // If not found, try by violationId
        if (!violation) {
            violation = await Violation.findOne({ violationId: req.params.id });
        }
        
        if (!violation) {
            return res.status(404).json({ 
                success: false, 
                error: 'Violation not found' 
            });
        }
        
        violation.status = 'paid';
        violation.paidAt = new Date();
        violation.paymentDetails = {
            transactionId: req.body.transactionId || `TXN_${Date.now()}`,
            paymentMethod: req.body.paymentMethod || 'online',
            paidAmount: violation.fineAmount,
            paidAt: new Date()
        };
        await violation.save();
        
        console.log(`💰 Violation paid: ${violation._id}`);
        res.json({ 
            success: true, 
            data: violation,
            message: 'Payment processed successfully'
        });
    } catch (error) {
        console.error('❌ Error processing payment:', error);
        res.status(500).json({ 
            success: false,
            error: error.message 
        });
    }
});

/* ================= AI DETECTION ENDPOINT ================= */
app.post('/api/detect', upload.single('file'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({
                success: false,
                error: 'No file uploaded'
            });
        }

        console.log(`📤 Processing file: ${req.file.originalname}`);
        console.log(`📁 File path: ${req.file.path}`);

        if (AI_MODEL_ENABLED) {
            try {
                const formData = new FormData();
                formData.append('file', fs.createReadStream(req.file.path), {
                    filename: req.file.originalname,
                    contentType: req.file.mimetype
                });

                console.log(`🤖 Calling AI Model at: ${AI_MODEL_URL}/detect`);
                
                const aiResponse = await axios.post(`${AI_MODEL_URL}/detect`, formData, {
                    headers: {
                        ...formData.getHeaders(),
                    },
                    timeout: 600000,
                    maxContentLength: Infinity,
                    maxBodyLength: Infinity,
                });

                console.log('✅ AI Detection completed');

                const report = aiResponse.data.report;
                const savedViolations = [];
                
                if (report && report.violations) {
                    const count = await Violation.countDocuments();
                    
                    // Save no_helmet violations
                    for (const violation of report.violations.no_helmet || []) {
                        const violationId = `VIO-${Date.now()}-${Math.floor(Math.random() * 1000)}-${count + savedViolations.length + 1}`;
                        const newViolation = new Violation({
                            violationId: violationId,
                            type: 'no_helmet',
                            vehicleId: violation.vehicle_id || `AI_${Date.now()}`,
                            vehicleNumber: violation.plate_number || 'UNKNOWN',
                            confidence: (violation.confidence || 0.85) * 100,
                            status: 'detected',
                            location: 'AI Detection',
                            fineAmount: 1000,
                            source: 'ai_detection',
                            details: {
                                firstFrame: violation.first_frame,
                                lastFrame: violation.last_frame,
                                maxWithoutHelmet: violation.max_without_helmet,
                                fileName: req.file.originalname
                            }
                        });
                        await newViolation.save();
                        savedViolations.push(newViolation);
                        console.log(`✅ Saved no_helmet violation: ${newViolation.violationId}`);
                    }

                    // Save triple_riding violations
                    for (const violation of report.violations.triple_riding || []) {
                        const violationId = `VIO-${Date.now()}-${Math.floor(Math.random() * 1000)}-${count + savedViolations.length + 1}`;
                        const newViolation = new Violation({
                            violationId: violationId,
                            type: 'triple_riding',
                            vehicleId: violation.vehicle_id || `AI_${Date.now()}`,
                            vehicleNumber: violation.plate_number || 'UNKNOWN',
                            confidence: (violation.confidence || 0.85) * 100,
                            status: 'detected',
                            location: 'AI Detection',
                            fineAmount: 2000,
                            source: 'ai_detection',
                            details: {
                                firstFrame: violation.first_frame,
                                lastFrame: violation.last_frame,
                                maxRiders: violation.max_riders,
                                fileName: req.file.originalname
                            }
                        });
                        await newViolation.save();
                        savedViolations.push(newViolation);
                        console.log(`✅ Saved triple_riding violation: ${newViolation.violationId}`);
                    }

                    // Save overloading violations
                    for (const violation of report.violations.overloading || []) {
                        const violationId = `VIO-${Date.now()}-${Math.floor(Math.random() * 1000)}-${count + savedViolations.length + 1}`;
                        const newViolation = new Violation({
                            violationId: violationId,
                            type: 'overloading',
                            vehicleId: violation.vehicle_id || `AI_${Date.now()}`,
                            vehicleNumber: violation.plate_number || 'UNKNOWN',
                            confidence: (violation.confidence || 0.80) * 100,
                            status: 'detected',
                            location: 'AI Detection',
                            fineAmount: 5000,
                            source: 'ai_detection',
                            details: {
                                firstFrame: violation.first_frame,
                                lastFrame: violation.last_frame,
                                maxRiders: violation.max_riders,
                                vehicleType: violation.vehicle_type,
                                capacityLimit: violation.capacity_limit,
                                fileName: req.file.originalname
                            }
                        });
                        await newViolation.save();
                        savedViolations.push(newViolation);
                        console.log(`✅ Saved overloading violation: ${newViolation.violationId}`);
                    }

                    if (savedViolations.length > 0) {
                        if (global.io) {
                            global.io.emit('new_violations', {
                                count: savedViolations.length,
                                violations: savedViolations
                            });
                            console.log(`📢 Emitted ${savedViolations.length} new violations via Socket.IO`);
                        }
                    }
                }

                return res.json({
                    success: true,
                    ...aiResponse.data,
                    saved_violations: savedViolations.length,
                    file_path: req.file.path
                });

            } catch (aiError) {
                console.error('❌ AI Model Connection Error:', aiError.message);
                
                if (aiError.code === 'ECONNREFUSED') {
                    return res.status(503).json({
                        success: false,
                        error: 'AI Detection Service is not running. Please start the AI model on port 8000.'
                    });
                }

                if (aiError.code === 'ECONNABORTED') {
                    return res.status(504).json({
                        success: false,
                        error: 'AI Detection request timed out.'
                    });
                }

                return res.status(500).json({
                    success: false,
                    error: 'AI Detection failed: ' + aiError.message,
                    file_path: req.file.path
                });
            }
        } else {
            console.log('⚠️ AI Model disabled, skipping detection');
            return res.json({
                success: true,
                message: 'File uploaded but AI detection is disabled',
                file_path: req.file.path
            });
        }
    } catch (error) {
        console.error('❌ Upload Error:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/* ================= DASHBOARD ENDPOINTS ================= */

// GET /api/dashboard/stats
app.get('/api/dashboard/stats', async (req, res) => {
    try {
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const totalViolations = await Violation.countDocuments();
        const todayViolations = await Violation.countDocuments({
            createdAt: { $gte: today }
        });
        const pendingReview = await Violation.countDocuments({
            status: { $in: ['detected', 'pending'] }
        });
        const totalFinesAgg = await Violation.aggregate([
            { $group: { _id: null, total: { $sum: { $ifNull: ["$fineAmount", 0] } } } }
        ]);
        const totalFines = totalFinesAgg[0]?.total || 0;
        
        const byType = await Violation.aggregate([
            { $group: { _id: '$type', count: { $sum: 1 } } },
            { $sort: { count: -1 } }
        ]);
        
        const recent = await Violation.find()
            .sort({ createdAt: -1 })
            .limit(5)
            .lean();

        res.json({
            success: true,
            stats: {
                totalViolations,
                todayViolations,
                pendingReview,
                totalFines
            },
            byType,
            recent
        });
    } catch (error) {
        console.error('❌ Dashboard stats error:', error);
        res.status(500).json({ 
            success: false, 
            error: error.message 
        });
    }
});

// GET /api/dashboard/recent-violations
app.get('/api/dashboard/recent-violations', async (req, res) => {
    try {
        const limit = parseInt(req.query.limit) || 10;
        const violations = await Violation.find()
            .sort({ createdAt: -1 })
            .limit(limit)
            .lean();
        
        res.json({
            success: true,
            data: violations
        });
    } catch (error) {
        console.error('❌ Recent violations error:', error);
        res.status(500).json({ 
            success: false, 
            error: error.message 
        });
    }
});

// GET /api/dashboard/violation-trends
app.get('/api/dashboard/violation-trends', async (req, res) => {
    try {
        const period = req.query.period || 'weekly';
        const days = period === 'monthly' ? 30 : period === 'weekly' ? 7 : 1;
        
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - days);
        
        const trends = await Violation.aggregate([
            { 
                $match: { 
                    createdAt: { $gte: startDate } 
                } 
            },
            {
                $group: {
                    _id: {
                        type: '$type',
                        date: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } }
                    },
                    count: { $sum: 1 }
                }
            },
            { $sort: { '_id.date': 1 } }
        ]);
        
        res.json({
            success: true,
            period: period,
            data: trends
        });
    } catch (error) {
        console.error('❌ Violation trends error:', error);
        res.status(500).json({ 
            success: false, 
            error: error.message 
        });
    }
});

// GET /api/dashboard/vehicle-stats
app.get('/api/dashboard/vehicle-stats', async (req, res) => {
    try {
        const stats = await Violation.aggregate([
            {
                $group: {
                    _id: '$details.vehicleType',
                    count: { $sum: 1 }
                }
            }
        ]);
        
        const vehicleStats = {};
        stats.forEach(s => {
            vehicleStats[s._id || 'unknown'] = s.count;
        });
        
        res.json({
            success: true,
            data: vehicleStats
        });
    } catch (error) {
        console.error('❌ Vehicle stats error:', error);
        res.status(500).json({ 
            success: false, 
            error: error.message 
        });
    }
});

/* ================= HEALTH CHECK ================= */
app.get('/', (req, res) => {
    res.json({
        message: "🚦 TraffiX Backend Running",
        status: "OK",
        version: "2.0",
        timestamp: new Date().toISOString()
    });
});

app.get('/api/health', async (req, res) => {
    let aiHealth = { status: 'not_configured' };
    
    if (AI_MODEL_ENABLED) {
        try {
            const response = await axios.get(`${AI_MODEL_URL}/health`, { timeout: 5000 });
            aiHealth = response.data;
        } catch (error) {
            aiHealth = { 
                status: 'unreachable', 
                error: error.message 
            };
        }
    }

    res.json({
        status: "healthy",
        database: mongoose.connection.readyState === 1 ? "connected" : "disconnected",
        ai_model: aiHealth,
        timestamp: new Date().toISOString()
    });
});

/* ================= RESULTS ENDPOINT ================= */
app.get('/api/results', async (req, res) => {
    try {
        const violations = await Violation.find()
            .sort({ createdAt: -1 })
            .limit(50)
            .lean();
        
        res.json({
            success: true,
            data: violations,
            count: violations.length
        });
    } catch (error) {
        console.error('❌ Results error:', error);
        res.status(500).json({ 
            success: false, 
            error: error.message 
        });
    }
});

/* ================= SOCKET.IO ================= */
io.on('connection', (socket) => {
    console.log('🔌 Client connected:', socket.id);
    
    socket.on('disconnect', () => {
        console.log('❌ Client disconnected:', socket.id);
    });
    
    socket.on('error', (error) => {
        console.error('Socket error:', error);
    });
});

/* ================= ERROR HANDLING ================= */
app.use((err, req, res, next) => {
    console.error('❌ Server Error:', err);
    
    if (err.type === 'entity.too.large') {
        return res.status(413).json({
            success: false,
            error: 'Request entity too large. Maximum size is 500MB.'
        });
    }
    
    if (err instanceof multer.MulterError) {
        if (err.code === 'LIMIT_FILE_SIZE') {
            return res.status(413).json({
                success: false,
                error: 'File too large. Maximum size is 500MB.'
            });
        }
    }
    
    res.status(500).json({
        success: false,
        error: 'Internal server error',
        message: process.env.NODE_ENV === 'development' ? err.message : 'Something went wrong'
    });
});

// Handle 404 routes
app.use('*', (req, res) => {
    res.status(404).json({
        success: false,
        error: 'Route not found',
        path: req.originalUrl
    });
});

/* ================= START SERVER ================= */
server.listen(PORT, () => {
    console.log('\n' + '='.repeat(60));
    console.log('🚀 TraffiX Backend Server Started');
    console.log('='.repeat(60));
    console.log(`📍 Server URL:        http://localhost:${PORT}`);
    console.log(`🔌 Socket.IO:         Enabled`);
    console.log(`📡 API Base URL:      http://localhost:${PORT}/api`);
    console.log(`🤖 AI Model URL:      ${AI_MODEL_URL}`);
    console.log(`🤖 AI Model Status:   ${AI_MODEL_ENABLED ? 'Enabled' : 'Disabled'}`);
    console.log('='.repeat(60));
    console.log('✅ Auth Endpoints:');
    console.log(`   POST   /api/auth/login       - Login user`);
    console.log(`   POST   /api/auth/register    - Register user`);
    console.log(`   GET    /api/auth/me          - Get current user`);
    console.log(`   PUT    /api/auth/profile     - Update profile`);
    console.log('='.repeat(60));
    console.log('✅ Violation Endpoints:');
    console.log(`   POST   /api/violations        - Create violation`);
    console.log(`   GET    /api/violations        - Get all violations`);
    console.log(`   GET    /api/violations/stats  - Get statistics`);
    console.log(`   GET    /api/violations/:id    - Get one violation`);
    console.log(`   PUT    /api/violations/:id    - Update violation`);
    console.log(`   DELETE /api/violations/:id    - Delete violation`);
    console.log(`   POST   /api/violations/:id/pay - Pay fine`);
    console.log('='.repeat(60));
    console.log('✅ Other Endpoints:');
    console.log(`   POST   /api/detect           - Upload & detect violations`);
    console.log(`   GET    /api/dashboard/stats  - Dashboard statistics`);
    console.log(`   GET    /api/health           - Health check`);
    console.log(`   GET    /api/results          - Get results`);
    console.log('='.repeat(60));
    console.log('📋 Default Users:');
    console.log('   Admin:    admin@traffic.com / admin123');
    console.log('   Public:   public@example.com / public123');
    console.log('   Operator: operator@traffic.com / operator123');
    console.log('='.repeat(60) + '\n');
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (err) => {
    console.error('❌ Unhandled Promise Rejection:', err);
});

// Handle uncaught exceptions
process.on('uncaughtException', (err) => {
    console.error('❌ Uncaught Exception:', err);
    process.exit(1);
});

module.exports = app;