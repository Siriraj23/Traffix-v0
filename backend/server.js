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
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
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
        fileSize: 500 * 1024 * 1024 // 500MB max file size
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

/* ================= ROUTES ================= */
const authRoutes = require('./routes/auth');
const violationRoutes = require('./routes/violations');
const uploadRoutes = require('./routes/upload');

app.use('/api/auth', authRoutes);
app.use('/api/violations', violationRoutes);
app.use('/api/upload', uploadRoutes);

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
                
                if (report && report.violations) {
                    const savedViolations = [];
                    
                    // Save helmet violations
                    for (const violation of report.violations.no_helmet || []) {
                        const newViolation = await Violation.create({
                            type: 'no_helmet',
                            vehicleId: violation.vehicle_id,
                            confidence: violation.confidence,
                            status: 'detected',
                            location: 'AI Detection',
                            fineAmount: 1000,
                            details: {
                                firstFrame: violation.first_frame,
                                lastFrame: violation.last_frame,
                                maxWithoutHelmet: violation.max_without_helmet,
                                fileName: req.file.originalname
                            }
                        });
                        savedViolations.push(newViolation);
                    }

                    // Save triple riding violations
                    for (const violation of report.violations.triple_riding || []) {
                        const newViolation = await Violation.create({
                            type: 'triple_riding',
                            vehicleId: violation.vehicle_id,
                            confidence: violation.confidence,
                            status: 'detected',
                            location: 'AI Detection',
                            fineAmount: 2000,
                            details: {
                                firstFrame: violation.first_frame,
                                lastFrame: violation.last_frame,
                                maxRiders: violation.max_riders,
                                fileName: req.file.originalname
                            }
                        });
                        savedViolations.push(newViolation);
                    }

                    // Save overloading violations
                    for (const violation of report.violations.overloading || []) {
                        const newViolation = await Violation.create({
                            type: 'overloading',
                            vehicleId: violation.vehicle_id,
                            confidence: violation.confidence,
                            status: 'detected',
                            location: 'AI Detection',
                            fineAmount: 5000,
                            details: {
                                firstFrame: violation.first_frame,
                                lastFrame: violation.last_frame,
                                maxRiders: violation.max_riders,
                                vehicleType: violation.vehicle_type,
                                capacityLimit: violation.capacity_limit,
                                fileName: req.file.originalname
                            }
                        });
                        savedViolations.push(newViolation);
                    }

                    if (savedViolations.length > 0) {
                        io.emit('new_violations', {
                            count: savedViolations.length,
                            violations: savedViolations
                        });
                        console.log(`📢 Emitted ${savedViolations.length} new violations via Socket.IO`);
                    }

                    aiResponse.data.saved_violations = savedViolations.length;
                }

                return res.json({
                    success: true,
                    ...aiResponse.data,
                    file_path: req.file.path
                });

            } catch (aiError) {
                console.error('❌ AI Model Connection Error:', aiError.message);
                
                if (aiError.code === 'ECONNREFUSED') {
                    return res.status(503).json({
                        success: false,
                        error: 'AI Detection Service is not running. Please start the AI model on port 8000.',
                        details: {
                            ai_model_url: AI_MODEL_URL,
                            suggestion: 'Run "python detect.py" to start AI service'
                        }
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

/* ================= HEALTH CHECK ================= */
app.get('/', (req, res) => {
    res.json({
        message: "🚦 TraffiX Backend Running",
        status: "OK",
        version: "2.0",
        services: {
            ai_model: AI_MODEL_URL,
            ai_enabled: AI_MODEL_ENABLED
        }
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

app.get('/api', (req, res) => {
    res.json({
        success: true,
        message: "🚦 TraffiX API is running",
        version: "2.0",
        endpoints: [
            "/api/auth",
            "/api/violations",
            "/api/upload",
            "/api/detect",
            "/api/dashboard/stats",
            "/api/dashboard/recent-violations",
            "/api/dashboard/violation-trends",
            "/api/dashboard/vehicle-stats",
            "/api/health"
        ]
    });
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
    res.status(500).json({
        success: false,
        error: 'Internal server error',
        message: err.message
    });
});

/* ================= 404 HANDLER ================= */
app.use('*', (req, res) => {
    res.status(404).json({
        success: false,
        error: 'Route not found',
        path: req.originalUrl
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
});