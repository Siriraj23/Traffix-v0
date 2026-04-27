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

/* ================= AI MODEL CONFIG ================= */
const AI_MODEL_URL = process.env.AI_MODEL_URL || 'http://localhost:8000';
const AI_MODEL_ENABLED = process.env.AI_MODEL_ENABLED !== 'false';

/* ================= MIDDLEWARE ================= */
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));
app.use('/uploads', express.static('uploads'));

/* ================= CREATE UPLOADS FOLDER ================= */
if (!fs.existsSync('./uploads')) {
    fs.mkdirSync('./uploads');
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
        fileSize: 500 * 1024 * 1024
    }
});

/* ================= DATABASE ================= */
mongoose.connect(process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/traffic_violation')
    .then(async () => {
        console.log('✅ MongoDB Connected');

        // Create default admin if not exists
        try {
            const adminEmail = 'admin@traffic.com';
            const adminUser = await User.findOne({ email: adminEmail });

            if (!adminUser) {
                const hashedPassword = await bcrypt.hash('admin123', 10);
                await User.create({
                    username: 'admin',
                    email: adminEmail,
                    password: hashedPassword,
                    role: 'admin'
                });
                console.log('✅ Default admin created: admin@traffic.com / admin123');
            }
        } catch (err) {
            console.error('⚠️ Admin seed error:', err.message);
        }
    })
    .catch(err => console.log('❌ MongoDB Error:', err.message));

/* ================= VIOLATIONS ROUTES ================= */

// GET all violations
app.get('/api/violations', async (req, res) => {
    try {
        console.log('🔍 Fetching violations with query:', req.query);
        const limit = parseInt(req.query.limit) || 100;
        const violations = await Violation.find()
            .sort({ createdAt: -1 })
            .limit(limit);
        
        console.log(`✅ Found ${violations.length} violations`);
        res.json({
            success: true,
            violations: violations,
            data: violations
        });
    } catch (error) {
        console.error('❌ Error fetching violations:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// GET single violation by ID
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
            return res.status(404).json({ success: false, error: 'Violation not found' });
        }
        
        res.json({ success: true, data: violation, violation: violation });
    } catch (error) {
        console.error('❌ Error fetching violation:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// CREATE violation
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

// UPDATE violation
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
            return res.status(404).json({ success: false, error: 'Violation not found' });
        }
        
        Object.assign(violation, req.body);
        violation.updatedAt = new Date();
        await violation.save();
        
        console.log(`✅ Violation updated: ${violation._id}`);
        res.json({ success: true, data: violation, violation: violation });
    } catch (error) {
        console.error('❌ Error updating violation:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// DELETE violation
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
            return res.status(404).json({ success: false, error: 'Violation not found' });
        }
        
        console.log(`✅ Violation deleted: ${req.params.id}`);
        res.json({ success: true, message: 'Violation deleted successfully' });
    } catch (error) {
        console.error('❌ Error deleting violation:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// GET violation stats
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
        console.error('Error fetching stats:', error);
        res.status(500).json({ error: error.message });
    }
});

// Payment endpoint
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
            return res.status(404).json({ success: false, error: 'Violation not found' });
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
        res.json({ success: true, data: violation });
    } catch (error) {
        console.error('Error processing payment:', error);
        res.status(500).json({ error: error.message });
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
        console.error('Dashboard stats error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

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
        console.error('Recent violations error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

app.get('/api/dashboard/violation-trends', async (req, res) => {
    try {
        const period = req.query.period || 'weekly';
        const days = period === 'monthly' ? 30 : 7;
        
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
        console.error('Violation trends error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

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
        console.error('Vehicle stats error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

/* ================= HEALTH CHECK ================= */
app.get('/', (req, res) => {
    res.json({
        message: "🚦 TraffiX Backend Running",
        status: "OK",
        version: "2.0"
    });
});

app.get('/api/health', async (req, res) => {
    let aiHealth = { status: 'not_configured' };
    
    if (AI_MODEL_ENABLED) {
        try {
            const response = await axios.get(`${AI_MODEL_URL}/health`, { timeout: 5000 });
            aiHealth = response.data;
        } catch (error) {
            aiHealth = { status: 'unreachable', error: error.message };
        }
    }

    res.json({
        status: "healthy",
        database: mongoose.connection.readyState === 1 ? "connected" : "disconnected",
        ai_model: aiHealth,
        timestamp: new Date().toISOString()
    });
});

/* ================= SOCKET.IO ================= */
io.on('connection', (socket) => {
    console.log('🔌 Client connected:', socket.id);
    socket.on('disconnect', () => {
        console.log('❌ Client disconnected:', socket.id);
    });
});

/* ================= ERROR HANDLING ================= */
app.use((err, req, res, next) => {
    console.error('❌ Server Error:', err);
    if (err.type === 'entity.too.large') {
        return res.status(413).json({
            success: false,
            error: 'Request entity too large'
        });
    }
    res.status(500).json({
        success: false,
        error: 'Internal server error',
        message: err.message
    });
});

/* ================= START SERVER ================= */
const PORT = process.env.PORT || 5001;

server.listen(PORT, () => {
    console.log('='.repeat(60));
    console.log('🚀 TraffiX Backend Server');
    console.log('='.repeat(60));
    console.log(`📍 Server running on: http://localhost:${PORT}`);
    console.log(`🔌 Socket.IO enabled`);
    console.log(`📡 API Base: http://localhost:${PORT}/api`);
    console.log(`🤖 AI Model: ${AI_MODEL_URL}`);
    console.log(`📁 Upload endpoint: http://localhost:${PORT}/api/detect`);
    console.log(`📊 Dashboard: http://localhost:${PORT}/api/dashboard/stats`);
    console.log('='.repeat(60));
    console.log('✅ Violation API endpoints:');
    console.log('   POST   /api/violations     - Create violation');
    console.log('   GET    /api/violations     - Get all violations');
    console.log('   GET    /api/violations/:id - Get one violation');
    console.log('   PUT    /api/violations/:id - Update violation');
    console.log('   DELETE /api/violations/:id - Delete violation');
    console.log('='.repeat(60));
});