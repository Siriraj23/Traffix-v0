const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const http = require('http');
const socketIO = require('socket.io');
const fs = require('fs');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
require('dotenv').config();

const User = require('./models/User');

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

/* ================= MIDDLEWARE ================= */
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use('/uploads', express.static('uploads'));

/* ================= CREATE UPLOADS FOLDER ================= */
if (!fs.existsSync('./uploads')) {
    fs.mkdirSync('./uploads');
}

/* ================= DATABASE ================= */
mongoose.connect('mongodb://127.0.0.1:27017/traffic_violation')
    .then(async () => {
        console.log('✅ MongoDB Connected');

        // create default admin if not exists
        try {
            const adminEmail = 'admin@traffic.com';
            const adminUser = await User.findOne({ email: adminEmail });

            if (!adminUser) {
                await User.create({
                    username: 'admin',
                    email: adminEmail,
                    password: 'admin123',
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
const Violation = require('./models/Violation');

app.use('/api/auth', authRoutes);
app.use('/api/violations', violationRoutes);
app.use('/api/upload', uploadRoutes);

/* ================= HEALTH CHECK ================= */
app.get('/', (req, res) => {
    res.json({
        message: "🚦 TraffiX Backend Running",
        status: "OK",
        version: "2.0"
    });
});

app.get('/api/health', (req, res) => {
    res.json({
        status: "healthy",
        database: mongoose.connection.readyState === 1 ? "connected" : "disconnected"
    });
});

app.get('/api', (req, res) => {
    res.json({
        success: true,
        message: "🚦 TraffiX API is running",
        routes: [
            "/api/auth",
            "/api/violations",
            "/api/upload",
            "/api/dashboard/stats",
            "/api/health"
        ]
    });
});

app.get('/api/dashboard/stats', async (req, res) => {
    try {
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const totalViolations = await Violation.countDocuments();
        const todayViolations = await Violation.countDocuments({
            timestamp: { $gte: today }
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

/* ================= SOCKET.IO ================= */
io.on('connection', (socket) => {
    console.log('🔌 Client connected:', socket.id);

    socket.on('disconnect', () => {
        console.log('❌ Client disconnected:', socket.id);
    });
});

/* ================= START SERVER ================= */
const PORT = process.env.PORT || 5001;

server.listen(PORT, () => {
    console.log(`\n🚀 Server running on http://localhost:${PORT}`);
    console.log(`🔌 Socket.IO enabled`);
    console.log(`📡 API Base: http://localhost:${PORT}/api`);
    console.log(`🔥 TraffiX AI System Ready`);
});