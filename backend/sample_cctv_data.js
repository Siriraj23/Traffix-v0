// Create this file in backend folder
const sampleCCTVFeeds = [
    {
        id: 'CAM-001',
        name: 'Main Street Camera',
        location: 'Main Street Intersection, Mumbai',
        streamUrl: 'demo://main_street',
        status: 'active',
        violationsPerHour: 8,
        lastViolation: '10 minutes ago',
        coordinates: { lat: 19.0760, lng: 72.8777 }
    },
    {
        id: 'CAM-002',
        name: 'Highway Speed Camera',
        location: 'Highway NH-48, Delhi',
        streamUrl: 'demo://highway',
        status: 'active',
        violationsPerHour: 12,
        lastViolation: '5 minutes ago',
        coordinates: { lat: 28.7041, lng: 77.1025 }
    },
    {
        id: 'CAM-003',
        name: 'School Zone Camera',
        location: 'School Road, Bangalore',
        streamUrl: 'demo://school_zone',
        status: 'active',
        violationsPerHour: 3,
        lastViolation: '15 minutes ago',
        coordinates: { lat: 12.9716, lng: 77.5946 }
    },
    {
        id: 'CAM-004',
        name: 'Commercial Street Camera',
        location: 'Commercial Street, Chennai',
        streamUrl: 'demo://commercial',
        status: 'inactive',
        violationsPerHour: 6,
        lastViolation: '1 hour ago',
        coordinates: { lat: 13.0827, lng: 80.2707 }
    }
];

const sampleViolations = [
    {
        id: 'VIO-20240124-001',
        cameraId: 'CAM-001',
        type: 'signal_violation',
        vehicleNumber: 'MH12AB1234',
        vehicleType: 'car',
        timestamp: new Date(),
        confidence: 0.92,
        fineAmount: 2000,
        status: 'detected',
        evidenceImage: '/uploads/signal_violation_1.jpg',
        description: 'Red light violation at Main Street intersection'
    },
    {
        id: 'VIO-20240124-002',
        cameraId: 'CAM-002',
        type: 'overspeeding',
        vehicleNumber: 'DL8CD5678',
        vehicleType: 'bike',
        timestamp: new Date(Date.now() - 300000), // 5 minutes ago
        speed: 85,
        speedLimit: 60,
        confidence: 0.95,
        fineAmount: 1500,
        status: 'fined',
        evidenceImage: '/uploads/overspeeding_1.jpg',
        description: 'Speed limit exceeded by 25 km/h'
    },
    {
        id: 'VIO-20240124-003',
        cameraId: 'CAM-003',
        type: 'triple_riding',
        vehicleNumber: 'KA09EF9012',
        vehicleType: 'bike',
        timestamp: new Date(Date.now() - 600000), // 10 minutes ago
        confidence: 0.81,
        fineAmount: 500,
        status: 'detected',
        evidenceImage: '/uploads/triple_riding_1.jpg',
        description: 'Three persons detected on two-wheeler'
    },
    {
        id: 'VIO-20240124-004',
        cameraId: 'CAM-001',
        type: 'no_seatbelt',
        vehicleNumber: 'TN22GH3456',
        vehicleType: 'car',
        timestamp: new Date(Date.now() - 900000), // 15 minutes ago
        confidence: 0.78,
        fineAmount: 1000,
        status: 'reviewed',
        evidenceImage: '/uploads/no_seatbelt_1.jpg',
        description: 'Driver not wearing seatbelt'
    }
];

module.exports = { sampleCCTVFeeds, sampleViolations };