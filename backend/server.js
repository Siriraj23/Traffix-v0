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

// ==================== AUTH ROUTES ====================

// POST /api/auth/login
app.post('/api/auth/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        
        console.log('🔑 Login attempt:', email);
        
        if (!email || !password) {
            return res.status(400).json({ 
                success: false,
                detail: 'Email and password are required' 
            });
        }
        
        // Find user by email (case insensitive)
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
        
        // Verify password using the model's comparePassword method
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

// POST /api/auth/register
app.post('/api/auth/register', async (req, res) => {
    try {
        const { 
            username, 
            email, 
            password, 
            fullName, 
            phone, 
            role 
        } = req.body;
        
        console.log('📝 Register attempt:', email);
        
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
            password: password,
            fullName: fullName || username,
            phone: phone || '',
            role: role || 'viewer'
        });
        
        await user.save();
        
        console.log('✅ User registered:', email);
        
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
        
        if (error.code === 11000) {
            const field = Object.keys(error.keyPattern)[0];
            return res.status(400).json({ 
                success: false,
                detail: `${field.charAt(0).toUpperCase() + field.slice(1)} already exists` 
            });
        }
        
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

// ==================== DATABASE CONNECTION ====================
mongoose.connect(process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/traffic_violation')
    .then(async () => {
        console.log('✅ MongoDB Connected');
        
        // Create default users if they don't exist
        try {
            const adminEmail = 'admin@traffic.com';
            const adminUser = await User.findOne({ email: adminEmail });
            
            if (!adminUser) {
                await User.create({
                    username: 'admin',
                    email: adminEmail,
                    password: 'admin123',
                    fullName: 'Administrator',
                    role: 'admin',
                    emailVerified: true,
                    phoneVerified: true
                });
                console.log('✅ Default admin created: admin@traffic.com / admin123');
            } else {
                console.log('ℹ️ Admin user already exists');
            }
            
            const publicEmail = 'public@example.com';
            const publicUser = await User.findOne({ email: publicEmail });
            
            if (!publicUser) {
                await User.create({
                    username: 'public',
                    email: publicEmail,
                    password: 'public123',
                    fullName: 'Public User',
                    role: 'viewer',
                    emailVerified: true,
                    phoneVerified: true
                });
                console.log('✅ Default public user created: public@example.com / public123');
            } else {
                console.log('ℹ️ Public user already exists');
            }
            
            const operatorEmail = 'operator@traffic.com';
            const operatorUser = await User.findOne({ email: operatorEmail });
            
            if (!operatorUser) {
                await User.create({
                    username: 'operator',
                    email: operatorEmail,
                    password: 'operator123',
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

// ==================== VIOLATIONS ROUTES ====================

// GET /api/violations
app.get('/api/violations', async (req, res) => {
    try {
        const limit = parseInt(req.query.limit) || 100;
        const page = parseInt(req.query.page) || 1;
        const skip = (page - 1) * limit;
        
        const violations = await Violation.find()
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit);
        
        const total = await Violation.countDocuments();
        
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

// GET /api/violations/stats
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

// GET /api/violations/:id
app.get('/api/violations/:id', async (req, res) => {
    try {
        let violation;
        
        if (req.params.id.match(/^[0-9a-fA-F]{24}$/)) {
            violation = await Violation.findById(req.params.id);
        }
        
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

// POST /api/violations
app.post('/api/violations', async (req, res) => {
    try {
        console.log('📝 Creating violation:', req.body.type);
        
        const count = await Violation.countDocuments();
        
        const violationId = `VIO-${Date.now()}-${Math.floor(Math.random() * 1000)}-${count + 1}`;
        
        const newViolation = new Violation({
            violationId: violationId,
            type: req.body.type,
            vehicleNumber: req.body.vehicleNumber || 'UNKNOWN',
            vehicleId: req.body.vehicleId || `MANUAL_${Date.now()}`,
            confidence: req.body.confidence,
            description: req.body.description || `${req.body.type} violation detected`,
            status: req.body.status || 'detected',
            fineAmount: req.body.fineAmount || (req.body.type === 'no_helmet' ? 1000 : req.body.type === 'triple_riding' ? 2000 : 5000),
            severity: req.body.severity || 'medium',
            location: req.body.location || 'Manual Upload',
            source: req.body.source || 'manual_upload',
            mediaType: req.body.mediaType || 'image',
            timestamp: req.body.timestamp || new Date()
        });
        
        const savedViolation = await newViolation.save();
        console.log(`✅ Violation saved: ${savedViolation.violationId}`);
        
        if (global.io) {
            global.io.emit('new_violation', savedViolation);
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
            error: error.message 
        });
    }
});

// PUT /api/violations/:id
app.put('/api/violations/:id', async (req, res) => {
    try {
        let violation;
        
        if (req.params.id.match(/^[0-9a-fA-F]{24}$/)) {
            violation = await Violation.findById(req.params.id);
        }
        
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

// DELETE /api/violations/:id
app.delete('/api/violations/:id', async (req, res) => {
    try {
        let violation;
        
        if (req.params.id.match(/^[0-9a-fA-F]{24}$/)) {
            violation = await Violation.findByIdAndDelete(req.params.id);
        }
        
        if (!violation) {
            violation = await Violation.findOneAndDelete({ violationId: req.params.id });
        }
        
        if (!violation) {
            return res.status(404).json({ 
                success: false, 
                error: 'Violation not found' 
            });
        }
        
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

// POST /api/violations/:id/pay
app.post('/api/violations/:id/pay', async (req, res) => {
    try {
        let violation;
        
        if (req.params.id.match(/^[0-9a-fA-F]{24}$/)) {
            violation = await Violation.findById(req.params.id);
        }
        
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

// ==================== AI DETECTION ENDPOINT ====================
app.post('/api/detect', upload.single('file'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({
                success: false,
                error: 'No file uploaded'
            });
        }

        console.log(`📤 Processing file: ${req.file.originalname}`);

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

                // Save violations from AI response
                const violations = aiResponse.data.violations || {};
                const savedViolations = [];
                const count = await Violation.countDocuments();
                
                // Save no_helmet violations
                for (const v of violations.no_helmet || []) {
                    const newViolation = new Violation({
                        violationId: `VIO-${Date.now()}-${Math.floor(Math.random() * 1000)}-${count + savedViolations.length + 1}`,
                        type: 'no_helmet',
                        vehicleNumber: 'UNKNOWN',
                        confidence: (v.confidence || 0.85) * 100,
                        status: 'detected',
                        location: 'AI Detection',
                        fineAmount: 1000,
                        source: 'ai_detection'
                    });
                    await newViolation.save();
                    savedViolations.push(newViolation);
                }
                
                // Save triple_riding violations
                for (const v of violations.triple_riding || []) {
                    const newViolation = new Violation({
                        violationId: `VIO-${Date.now()}-${Math.floor(Math.random() * 1000)}-${count + savedViolations.length + 1}`,
                        type: 'triple_riding',
                        vehicleNumber: 'UNKNOWN',
                        confidence: (v.confidence || 0.85) * 100,
                        status: 'detected',
                        location: 'AI Detection',
                        fineAmount: 2000,
                        source: 'ai_detection'
                    });
                    await newViolation.save();
                    savedViolations.push(newViolation);
                }
                
                // Save overloading violations
                for (const v of violations.overloading || []) {
                    const newViolation = new Violation({
                        violationId: `VIO-${Date.now()}-${Math.floor(Math.random() * 1000)}-${count + savedViolations.length + 1}`,
                        type: 'overloading',
                        vehicleNumber: 'UNKNOWN',
                        confidence: (v.confidence || 0.80) * 100,
                        status: 'detected',
                        location: 'AI Detection',
                        fineAmount: 5000,
                        source: 'ai_detection'
                    });
                    await newViolation.save();
                    savedViolations.push(newViolation);
                }

                if (savedViolations.length > 0 && global.io) {
                    global.io.emit('new_violations', {
                        count: savedViolations.length,
                        violations: savedViolations
                    });
                }

                return res.json({
                    success: true,
                    ...aiResponse.data,
                    saved_violations: savedViolations.length,
                    file_path: req.file.path
                });

            } catch (aiError) {
                console.error('❌ AI Model Error:', aiError.message);
                
                if (aiError.code === 'ECONNREFUSED') {
                    return res.status(503).json({
                        success: false,
                        error: 'AI Detection Service is not running. Please start detect.py on port 8000.'
                    });
                }

                return res.status(500).json({
                    success: false,
                    error: 'AI Detection failed: ' + aiError.message
                });
            }
        } else {
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

// ==================== CCTV ROUTES ====================

// POST /api/cctv/start
app.post('/api/cctv/start', async (req, res) => {
    try {
        const { stream_id, source, max_duration } = req.body;
        
        if (!stream_id || !source) {
            return res.status(400).json({
                success: false,
                error: 'stream_id and source are required'
            });
        }

        console.log(`📡 Starting CCTV: ${stream_id} -> ${source}`);

        const response = await axios.post(`${AI_MODEL_URL}/cctv/start`, {
            stream_id,
            source: String(source),
            max_duration: max_duration || 300
        }, {
            timeout: 10000
        });

        console.log(`✅ CCTV started: ${stream_id}`);
        return res.json(response.data);
        
    } catch (error) {
        console.error('❌ CCTV start error:', error.message);
        
        if (error.code === 'ECONNREFUSED') {
            return res.status(503).json({
                success: false,
                error: 'AI Detection Service is not running on port 8000.'
            });
        }

        return res.status(500).json({
            success: false,
            error: error.response?.data?.message || error.message
        });
    }
});

// POST /api/cctv/stop
app.post('/api/cctv/stop', async (req, res) => {
    try {
        const { stream_id } = req.body;
        
        if (!stream_id) {
            return res.status(400).json({
                success: false,
                error: 'stream_id is required'
            });
        }

        console.log(`🛑 Stopping CCTV: ${stream_id}`);

        const response = await axios.post(`${AI_MODEL_URL}/cctv/stop`, {
            stream_id
        }, {
            timeout: 10000
        });

        console.log(`✅ CCTV stopped: ${stream_id}`);
        return res.json(response.data);
        
    } catch (error) {
        console.error('❌ CCTV stop error:', error.message);
        return res.status(500).json({
            success: false,
            error: error.response?.data?.message || error.message
        });
    }
});

// GET /api/cctv/status
app.get('/api/cctv/status', async (req, res) => {
    try {
        const { stream_id } = req.query;
        
        const url = stream_id 
            ? `${AI_MODEL_URL}/cctv/status?stream_id=${stream_id}`
            : `${AI_MODEL_URL}/cctv/status`;

        const response = await axios.get(url, { timeout: 5000 });
        return res.json(response.data);
        
    } catch (error) {
        console.error('❌ CCTV status error:', error.message);
        
        if (error.code === 'ECONNREFUSED') {
            return res.json({
                active_streams: 0,
                streams: {}
            });
        }

        return res.json({
            active_streams: 0,
            streams: {}
        });
    }
});

// GET /api/cctv/violations
app.get('/api/cctv/violations', async (req, res) => {
    try {
        const { stream_id } = req.query;
        
        if (!stream_id) {
            return res.status(400).json({
                success: false,
                error: 'stream_id is required'
            });
        }

        const response = await axios.get(
            `${AI_MODEL_URL}/cctv/violations?stream_id=${stream_id}`,
            { timeout: 5000 }
        );

        return res.json(response.data);
        
    } catch (error) {
        console.error('❌ CCTV violations error:', error.message);
        return res.json({
            stats: { 
                violations: { no_helmet: 0, triple_riding: 0, overloading: 0 } 
            },
            total_fine: 0
        });
    }
});

// GET /api/cctv/preview
app.get('/api/cctv/preview', async (req, res) => {
    try {
        const { stream_id } = req.query;
        
        if (!stream_id) {
            return res.status(400).json({
                success: false,
                error: 'stream_id is required'
            });
        }

        const response = await axios.get(
            `${AI_MODEL_URL}/cctv/preview?stream_id=${stream_id}`,
            { timeout: 5000 }
        );

        return res.json(response.data);
        
    } catch (error) {
        console.error('❌ CCTV preview error:', error.message);
        return res.json({
            stream_id: req.query.stream_id,
            image: null,
            message: 'No frame available'
        });
    }
});

// ==================== DASHBOARD ENDPOINTS ====================
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
        
        const recent = await Violation.find()
            .sort({ createdAt: -1 })
            .limit(5)
            .lean();

        res.json({
            success: true,
            stats: {
                totalViolations,
                todayViolations,
                pendingReview
            },
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

// ==================== HEALTH CHECK ====================
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

// ==================== SOCKET.IO ====================
io.on('connection', (socket) => {
    console.log('🔌 Client connected:', socket.id);
    
    socket.on('disconnect', () => {
        console.log('❌ Client disconnected:', socket.id);
    });
});

// ==================== ERROR HANDLING ====================
app.use((err, req, res, next) => {
    console.error('❌ Server Error:', err);
    res.status(500).json({
        success: false,
        error: 'Internal server error'
    });
});

// ==================== START SERVER ====================
server.listen(PORT, () => {
    console.log('\n' + '='.repeat(60));
    console.log('🚀 TraffiX Backend Server Started');
    console.log('='.repeat(60));
    console.log(`📍 Server:      http://localhost:${PORT}`);
    console.log(`🤖 AI Model:    ${AI_MODEL_URL}`);
    console.log('='.repeat(60));
    console.log('✅ Auth Endpoints:');
    console.log('   POST /api/auth/login');
    console.log('   POST /api/auth/register');
    console.log('   GET  /api/auth/me');
    console.log('✅ CCTV Endpoints:');
    console.log('   POST /api/cctv/start');
    console.log('   POST /api/cctv/stop');
    console.log('   GET  /api/cctv/status');
    console.log('   GET  /api/cctv/violations');
    console.log('   GET  /api/cctv/preview');
    console.log('='.repeat(60));
    console.log('📋 Default Users:');
    console.log('   Admin:    admin@traffic.com / admin123');
    console.log('   Public:   public@example.com / public123');
    console.log('   Operator: operator@traffic.com / operator123');
    console.log('='.repeat(60) + '\n');
});

module.exports = app;