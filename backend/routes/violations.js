const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const Violation = require('../models/Violation');
const User = require('../models/User');
const multer = require('multer');
const { spawn } = require('child_process');
const path = require('path');

/* =======================
   MULTER CONFIG
======================= */
const upload = multer({ dest: 'uploads/' });

/* =========================================================
   GET CURRENT USER FROM TOKEN
========================================================= */
const getCurrentUser = async (req) => {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return null;

    try {
        const decoded = jwt.verify(
            token,
            process.env.JWT_SECRET || 'traffic_secret'
        );
        return await User.findById(decoded.id);
    } catch (e) {
        return null;
    }
};

/* =========================================================
   AI DETECTION ROUTE (PYTHON INTEGRATION)
========================================================= */
router.post('/detect', upload.single('video'), async (req, res) => {
    try {
        const videoPath = req.file.path;

        console.log("📹 Video received:", videoPath);

        const pythonProcess = spawn('python', [
            path.join(__dirname, '../../ai_models/detect.py'),
            videoPath
        ]);

        let outputData = "";

        pythonProcess.stdout.on('data', (data) => {
            outputData += data.toString();
        });

        pythonProcess.stderr.on('data', (data) => {
            console.error("Python Error:", data.toString());
        });

        pythonProcess.on('close', async () => {
            try {
                const results = JSON.parse(outputData);

                const savedViolations = [];

                for (let item of results) {
                    const count = await Violation.countDocuments();

                    const violation = new Violation({
                        violationId: `VIO-${Date.now()}-${count + 1}`,
                        type: item.violation || "Unknown",
                        plateNumber: item.plate || "N/A",
                        vehicleType: item.vehicleType || 'car',
                        confidence: item.confidence || 0,
                        status: item.status || "pending",
                        timestamp: item.timestamp
                            ? new Date(item.timestamp)
                            : new Date(),
                        location:
                            typeof item.location === 'object'
                                ? item.location
                                : { address: item.location || "Unknown" },
                        evidenceImages: item.evidenceImages
                            ? Array.isArray(item.evidenceImages)
                                ? item.evidenceImages
                                : [item.evidenceImages]
                            : [],
                        fineAmount: item.fineAmount || 0
                    });

                    await violation.save();
                    savedViolations.push(violation);
                }

                res.json({
                    success: true,
                    message: "Violations detected and saved",
                    data: savedViolations
                });

            } catch (err) {
                console.error(err);
                res.status(500).json({
                    success: false,
                    error: "Failed to parse AI output",
                    raw: outputData
                });
            }
        });

    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

/* =========================================================
   GET ALL VIOLATIONS (ROLE BASED)
========================================================= */
router.get('/', async (req, res) => {
    try {
        const { type, status, startDate, endDate, page = 1, limit = 10 } = req.query;

        const currentUser = await getCurrentUser(req);

        const query = {};

        if (type) query.type = type;
        if (status) query.status = status;

        if (startDate || endDate) {
            query.timestamp = {};
            if (startDate) query.timestamp.$gte = new Date(startDate);
            if (endDate) query.timestamp.$lte = new Date(endDate);
        }

        /* ---------------------------
           ROLE-BASED FILTERING
        --------------------------- */
        if (currentUser && currentUser.role === 'viewer') {
            if (currentUser.vehicleNumber) {
                query.vehicleNumber = currentUser.vehicleNumber;
                console.log(`🔒 Viewer access: ${currentUser.vehicleNumber}`);
            } else {
                return res.json({
                    success: true,
                    violations: [],
                    pagination: { page: 1, limit: 10, total: 0, pages: 0 }
                });
            }
        }

        const skip = (page - 1) * limit;

        const violations = await Violation.find(query)
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(parseInt(limit));

        const total = await Violation.countDocuments(query);

        res.json({
            success: true,
            violations,
            pagination: {
                page: parseInt(page),
                limit: parseInt(limit),
                total,
                pages: Math.ceil(total / limit)
            },
            role: currentUser?.role || 'guest'
        });

    } catch (error) {
        console.error('Error fetching violations:', error);
        res.status(500).json({ error: error.message });
    }
});

/* =========================================================
   GET SINGLE VIOLATION
========================================================= */
router.get('/:id', async (req, res) => {
    try {
        const violation = await Violation.findOne({
            violationId: req.params.id
        });

        if (!violation) {
            return res.status(404).json({ error: 'Violation not found' });
        }

        const currentUser = await getCurrentUser(req);

        if (currentUser && currentUser.role === 'viewer') {
            if (violation.vehicleNumber !== currentUser.vehicleNumber) {
                return res.status(403).json({ error: 'Access denied' });
            }
        }

        res.json({ success: true, violation });

    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

/* =========================================================
   CREATE VIOLATION (ADMIN ONLY)
========================================================= */
router.post('/', async (req, res) => {
    try {
        const currentUser = await getCurrentUser(req);

        if (!currentUser || currentUser.role !== 'admin') {
            return res.status(403).json({ error: 'Admin access required' });
        }

        const data = req.body;
        data.violationId = `VIO-${Date.now()}-${Math.floor(Math.random() * 1000)}`;

        const violation = new Violation(data);
        await violation.save();

        res.status(201).json({ success: true, violation });

    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

/* =========================================================
   UPDATE VIOLATION (ADMIN ONLY)
========================================================= */
router.put('/:id', async (req, res) => {
    try {
        const currentUser = await getCurrentUser(req);

        if (!currentUser || currentUser.role !== 'admin') {
            return res.status(403).json({ error: 'Admin access required' });
        }

        const violation = await Violation.findOne({
            violationId: req.params.id
        });

        if (!violation) {
            return res.status(404).json({ error: 'Violation not found' });
        }

        Object.assign(violation, req.body);
        await violation.save();

        res.json({ success: true, violation });

    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;