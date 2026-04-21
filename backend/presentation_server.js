const express = require('express');
const cors = require('cors');
const { sampleCCTVFeeds, sampleViolations } = require('./sample_cctv_data');
const path = require('path');
const fs = require('fs');

const app = express();
app.use(cors());
app.use(express.json());

// Create uploads directory if it doesn't exist
if (!fs.existsSync('uploads')) {
    fs.mkdirSync('uploads');
}

// Create sample images for presentation
const createSampleImages = () => {
    const sampleImages = [
        { name: 'signal_violation_1.jpg', description: 'Red light violation' },
        { name: 'overspeeding_1.jpg', description: 'Overspeeding vehicle' },
        { name: 'triple_riding_1.jpg', description: 'Three persons on bike' },
        { name: 'no_seatbelt_1.jpg', description: 'Driver without seatbelt' },
        { name: 'wrong_route_1.jpg', description: 'Vehicle in wrong lane' }
    ];
    
    // In real presentation, you would have actual images
    // For demo, we'll create placeholder files
    sampleImages.forEach(img => {
        const filePath = path.join('uploads', img.name);
        if (!fs.existsSync(filePath)) {
            // Create a simple text file as placeholder
            fs.writeFileSync(filePath, `Placeholder for: ${img.description}`);
        }
    });
};

// Routes for presentation
app.get('/api/presentation/cctv-feeds', (req, res) => {
    res.json({
        success: true,
        feeds: sampleCCTVFeeds,
        totalActive: sampleCCTVFeeds.filter(f => f.status === 'active').length,
        totalViolationsToday: 47
    });
});

app.get('/api/presentation/violations', (req, res) => {
    res.json({
        success: true,
        violations: sampleViolations,
        stats: {
            total: sampleViolations.length,
            byType: {
                signal_violation: sampleViolations.filter(v => v.type === 'signal_violation').length,
                overspeeding: sampleViolations.filter(v => v.type === 'overspeeding').length,
                triple_riding: sampleViolations.filter(v => v.type === 'triple_riding').length,
                no_seatbelt: sampleViolations.filter(v => v.type === 'no_seatbelt').length
            }
        }
    });
});

app.post('/api/presentation/start-cctv', (req, res) => {
    const { cameraId } = req.body;
    const camera = sampleCCTVFeeds.find(c => c.id === cameraId);
    
    if (!camera) {
        return res.status(404).json({ error: 'Camera not found' });
    }
    
    // Simulate CCTV stream starting
    setTimeout(() => {
        res.json({
            success: true,
            message: `CCTV stream ${cameraId} started successfully`,
            camera: camera,
            streamUrl: `ws://localhost:5000/cctv/${cameraId}`,
            aiProcessing: 'enabled'
        });
    }, 1000);
});

app.post('/api/presentation/simulate-violation', (req, res) => {
    const { cameraId, violationType } = req.body;
    
    const violationTypes = [
        'signal_violation',
        'overspeeding',
        'triple_riding',
        'no_seatbelt',
        'wrong_route',
        'no_helmet'
    ];
    
    const selectedType = violationType || violationTypes[Math.floor(Math.random() * violationTypes.length)];
    
    const newViolation = {
        id: `VIO-${Date.now()}`,
        cameraId: cameraId || 'CAM-001',
        type: selectedType,
        vehicleNumber: generateVehicleNumber(),
        vehicleType: ['car', 'bike', 'truck'][Math.floor(Math.random() * 3)],
        timestamp: new Date(),
        confidence: 0.7 + Math.random() * 0.25,
        fineAmount: getFineAmount(selectedType),
        status: 'detected',
        evidenceImage: `/uploads/${selectedType}_1.jpg`,
        description: getViolationDescription(selectedType)
    };
    
    // Add speed data for overspeeding
    if (selectedType === 'overspeeding') {
        newViolation.speed = 60 + Math.floor(Math.random() * 40);
        newViolation.speedLimit = 60;
    }
    
    res.json({
        success: true,
        violation: newViolation,
        message: 'Violation simulated successfully',
        alert: `🚨 New ${selectedType.replace('_', ' ')} detected!`
    });
});

app.get('/api/presentation/stats', (req, res) => {
    const stats = {
        totalCameras: sampleCCTVFeeds.length,
        activeCameras: sampleCCTVFeeds.filter(f => f.status === 'active').length,
        violationsToday: 47,
        violationsThisWeek: 289,
        totalFines: 125400,
        detectionAccuracy: '92.5%',
        commonViolations: [
            { type: 'signal_violation', count: 18, percentage: 38 },
            { type: 'overspeeding', count: 12, percentage: 26 },
            { type: 'no_seatbelt', count: 8, percentage: 17 },
            { type: 'triple_riding', count: 6, percentage: 13 },
            { type: 'wrong_route', count: 3, percentage: 6 }
        ]
    };
    
    res.json({ success: true, stats });
});

// Helper functions
function generateVehicleNumber() {
    const states = ['MH', 'DL', 'KA', 'TN', 'GJ', 'AP', 'UP', 'RJ'];
    const state = states[Math.floor(Math.random() * states.length)];
    const number = Math.floor(Math.random() * 90 + 10);
    const letters = String.fromCharCode(65 + Math.floor(Math.random() * 26)) + 
                   String.fromCharCode(65 + Math.floor(Math.random() * 26));
    const finalNumber = Math.floor(Math.random() * 9000 + 1000);
    
    return `${state}${number}${letters}${finalNumber}`;
}

function getFineAmount(violationType) {
    const fines = {
        signal_violation: 2000,
        overspeeding: 1500,
        no_seatbelt: 1000,
        triple_riding: 500,
        wrong_route: 3000,
        no_helmet: 500
    };
    return fines[violationType] || 1000;
}

function getViolationDescription(type) {
    const descriptions = {
        signal_violation: 'Red light violation detected',
        overspeeding: 'Vehicle exceeding speed limit',
        no_seatbelt: 'Driver not wearing seatbelt',
        triple_riding: 'Three persons on two-wheeler',
        wrong_route: 'Vehicle in restricted lane',
        no_helmet: 'Rider without helmet'
    };
    return descriptions[type] || 'Traffic violation detected';
}

// Create sample images on startup
createSampleImages();

// Start presentation server
const PORT = 5002;
app.listen(PORT, () => {
    console.log(`
🎬 PRESENTATION SERVER READY 🎬

📍 URL: http://localhost:${PORT}
📊 Dashboard: http://localhost:${PORT}/api/presentation/stats
🎥 CCTV Feeds: http://localhost:${PORT}/api/presentation/cctv-feeds
🚨 Violations: http://localhost:${PORT}/api/presentation/violations

⚡ Quick Test Commands:
curl http://localhost:${PORT}/api/presentation/stats
curl -X POST http://localhost:${PORT}/api/presentation/simulate-violation

✅ Ready for presentation!
`);
});