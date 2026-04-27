const mongoose = require('mongoose');

const violationSchema = new mongoose.Schema({
    violationId: {
        type: String,
        required: true,
        unique: true
    },
    type: {
        type: String,
        required: true,
        enum: ['no_helmet', 'triple_riding', 'overloading', 'speeding', 'wrong_side', 'other']
    },
    vehicleNumber: {
        type: String,
        required: true,
        trim: true,
        uppercase: true
    },
    vehicleId: {
        type: String,
        default: ''
    },
    confidence: {
        type: Number,
        min: 0,
        max: 100,
        default: 85
    },
    description: {
        type: String,
        default: ''
    },
    status: {
        type: String,
        enum: ['detected', 'pending', 'reviewed', 'paid', 'disputed', 'cancelled'],
        default: 'detected'
    },
    fineAmount: {
        type: Number,
        required: true,
        default: 1000
    },
    severity: {
        type: String,
        enum: ['low', 'medium', 'high'],
        default: 'medium'
    },
    location: {
        type: {
            type: String,
            enum: ['Point'],
            default: 'Point'
        },
        coordinates: {
            type: [Number],
            default: [0, 0]
        },
        address: {
            type: String,
            default: ''
        }
    },
    timestamp: {
        type: Date,
        default: Date.now
    },
    createdAt: {
        type: Date,
        default: Date.now
    },
    updatedAt: {
        type: Date,
        default: Date.now
    },
    evidenceImages: [{
        type: String
    }],
    details: {
        type: mongoose.Schema.Types.Mixed,
        default: {}
    },
    source: {
        type: String,
        enum: ['ai_detection', 'cctv', 'manual', 'manual_upload', 'user_report', 'admin', 'web_upload'],
        default: 'ai_detection'
    },
    mediaType: {
        type: String,
        enum: ['image', 'video', 'cctv'],
        default: 'image'
    },
    paidAt: {
        type: Date
    },
    paymentDetails: {
        type: mongoose.Schema.Types.Mixed
    }
});

// Create index for better query performance
violationSchema.index({ createdAt: -1 });
violationSchema.index({ vehicleNumber: 1 });
violationSchema.index({ status: 1 });
violationSchema.index({ type: 1 });
violationSchema.index({ timestamp: -1 });
violationSchema.index({ violationId: 1 });

// Update the updatedAt field on save
violationSchema.pre('save', function(next) {
    this.updatedAt = new Date();
    next();
});

module.exports = mongoose.model('Violation', violationSchema);