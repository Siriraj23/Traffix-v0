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
                        vehicleNumber: item.plate || "N/A",  // Add vehicleNumber
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
        const { type, status, startDate, endDate, page = 1, limit = 100 } = req.query;

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

        const skip = (parseInt(page) - 1) * parseInt(limit);

        const violations = await Violation.find(query)
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(parseInt(limit));

        const total = await Violation.countDocuments(query);

        console.log(`✅ Found ${violations.length} violations (Total: ${total})`);

        res.json({
            success: true,
            violations: violations,
            data: violations,  // For compatibility with frontend
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
   GET SINGLE VIOLATION (by MongoDB _id OR violationId)
========================================================= */
router.get('/:id', async (req, res) => {
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

        const currentUser = await getCurrentUser(req);

        if (currentUser && currentUser.role === 'viewer') {
            if (violation.vehicleNumber !== currentUser.vehicleNumber) {
                return res.status(403).json({ error: 'Access denied' });
            }
        }

        res.json({ success: true, data: violation, violation: violation });

    } catch (error) {
        console.error('Error fetching violation:', error);
        res.status(500).json({ error: error.message });
    }
});

/* =========================================================
   CREATE VIOLATION (Admin only, but allow for manual uploads)
========================================================= */
router.post('/', async (req, res) => {
    try {
        console.log('📝 Creating violation with data:', req.body);
        
        const currentUser = await getCurrentUser(req);

        // Allow creation if user is admin OR if it's a manual upload
        // For manual uploads, we still want to save even without admin
        const isManualUpload = req.body.source === 'manual_upload' || !currentUser;
        
        if (!isManualUpload && (!currentUser || currentUser.role !== 'admin')) {
            return res.status(403).json({ success: false, error: 'Admin access required' });
        }

        const count = await Violation.countDocuments();
        
        const violationData = {
            violationId: `VIO-${Date.now()}-${count + 1}`,
            type: req.body.type,
            confidence: req.body.confidence || 85,
            description: req.body.description || `${req.body.type} violation detected`,
            vehicleNumber: req.body.vehicleNumber || req.body.vehicleNumber || 'UNKNOWN',
            vehicleType: req.body.vehicleType || 'unknown',
            plateNumber: req.body.vehicleNumber || req.body.plateNumber || 'UNKNOWN',
            status: req.body.status || 'detected',
            fineAmount: req.body.fineAmount || (req.body.type === 'no_helmet' ? 1000 : req.body.type === 'triple_riding' ? 2000 : 5000),
            timestamp: req.body.timestamp || new Date(),
            location: req.body.location || { address: 'Manual Upload' },
            severity: req.body.severity || 'medium',
            source: req.body.source || 'manual_upload',
            mediaType: req.body.mediaType || 'image',
            details: {
                ...req.body.details,
                uploadedAt: new Date().toISOString(),
                userAgent: req.headers['user-agent']
            }
        };

        const violation = new Violation(violationData);
        await violation.save();
        
        console.log(`✅ Violation saved: ${violation._id} - ${violation.violationId}`);

        // Emit socket event if io is available
        if (global.io) {
            global.io.emit('new_violation', violation);
            console.log('📢 Emitted new_violation event');
        }

        res.status(201).json({ 
            success: true, 
            data: violation,
            violation: violation,
            message: 'Violation created successfully'
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

/* =========================================================
   UPDATE VIOLATION (ADMIN ONLY)
========================================================= */
router.put('/:id', async (req, res) => {
    try {
        const currentUser = await getCurrentUser(req);

        if (!currentUser || currentUser.role !== 'admin') {
            return res.status(403).json({ error: 'Admin access required' });
        }

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
            return res.status(404).json({ error: 'Violation not found' });
        }

        Object.assign(violation, req.body);
        violation.updatedAt = new Date();
        await violation.save();

        console.log(`✅ Violation updated: ${violation._id}`);
        res.json({ success: true, data: violation, violation: violation });

    } catch (error) {
        console.error('Error updating violation:', error);
        res.status(500).json({ error: error.message });
    }
});

/* =========================================================
   DELETE VIOLATION (ADMIN ONLY)
========================================================= */
router.delete('/:id', async (req, res) => {
    try {
        const currentUser = await getCurrentUser(req);

        if (!currentUser || currentUser.role !== 'admin') {
            return res.status(403).json({ error: 'Admin access required' });
        }

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
            return res.status(404).json({ error: 'Violation not found' });
        }

        console.log(`✅ Violation deleted: ${req.params.id}`);
        res.json({ success: true, message: 'Violation deleted successfully' });

    } catch (error) {
        console.error('Error deleting violation:', error);
        res.status(500).json({ error: error.message });
    }
});

/* =========================================================
   GET VIOLATION STATS
========================================================= */
router.get('/stats/all', async (req, res) => {
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

/* =========================================================
   PAYMENT ENDPOINT
========================================================= */
router.post('/:id/pay', async (req, res) => {
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

module.exports = router;