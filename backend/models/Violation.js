const mongoose = require('mongoose');
const { v4: uuidv4 } = require('uuid');

const ViolationSchema = new mongoose.Schema({
  // ✅ AUTO-GENERATED ID (IMPORTANT FIX)
  violationId: {
    type: String,
    unique: true,
    default: () => `VIO-${Date.now()}-${Math.floor(Math.random() * 1000)}`
  },

  type: {
    type: String,
    enum: [
      'signal_violation',
      'triple_riding',
      'no_seatbelt',
      'overspeeding',
      'wrong_route',
      'no_helmet',
      'overloading',
      'illegal_parking'
    ],
    required: true
  },

  vehicleNumber: {
    type: String,
    required: true,
    default: "UNKNOWN"
  },

  // ✅ FIX: remove required (or set default)
  vehicleType: {
    type: String,
    enum: ['car', 'bike', 'truck', 'bus', 'auto'],
    default: 'bike'
  },

  location: {
    address: String,
    latitude: Number,
    longitude: Number,
    cameraId: String
  },

  timestamp: {
    type: Date,
    default: Date.now
  },

  evidenceImages: [String],

  speed: Number,
  speedLimit: Number,

  confidence: {
    type: Number,
    min: 0,
    max: 1,
    default: 0
  },

  status: {
    type: String,
    enum: ['detected', 'reviewed', 'fined', 'appealed', 'dismissed'],
    default: 'detected'
  },

  fineAmount: Number,
  description: {
    type: String,
    default: "Auto-detected violation"
  },

  createdAt: {
    type: Date,
    default: Date.now
  },

  // ================= ANPR =================
  anpr_detected: {
    type: Boolean,
    default: false
  },

  anpr_confidence: {
    type: Number,
    min: 0,
    max: 1,
    default: 0
  },

  anpr_raw_text: String,
  plate_bbox: [Number],
  plate_region_image: String,

  // ================= YOLO =================
  yolo_detections: {
    type: Array,
    default: []
  },

  vehicle_bbox: [Number],

  // ================= SOURCE =================
  source: {
    type: String,
    enum: ['upload', 'cctv', 'simulation', 'api'],
    default: 'upload'
  },

  cameraId: String,

  // ================= PROCESSING =================
  processing_time_ms: Number,

  ai_model_version: {
    type: String,
    default: 'yolov8n'
  },

  // ================= VERIFICATION =================
  verified_at: Date,
  verification_notes: String

}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});


// ================= INDEXES =================
ViolationSchema.index({ vehicleNumber: 1 });
ViolationSchema.index({ type: 1 });
ViolationSchema.index({ status: 1 });
ViolationSchema.index({ timestamp: -1 });
ViolationSchema.index({ anpr_detected: 1 });
ViolationSchema.index({ source: 1 });
ViolationSchema.index({ cameraId: 1 });


// ================= VIRTUALS =================
ViolationSchema.virtual('isAnprVerified').get(function () {
  return this.anpr_detected && this.anpr_confidence > 0.8;
});

ViolationSchema.virtual('displayVehicleNumber').get(function () {
  if (this.anpr_detected) {
    return `${this.vehicleNumber} (ANPR: ${(this.anpr_confidence * 100).toFixed(0)}%)`;
  }
  return this.vehicleNumber;
});


// ================= METHODS =================
ViolationSchema.methods.markVerified = async function (notes) {
  this.status = 'reviewed';
  this.verified_at = new Date();
  this.verification_notes = notes;
  return this.save();
};

ViolationSchema.methods.markFined = async function (amount) {
  this.status = 'fined';
  this.fineAmount = amount;
  return this.save();
};


module.exports = mongoose.model('Violation', ViolationSchema);