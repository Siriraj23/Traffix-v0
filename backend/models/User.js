const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
    // Basic Information
    username: {
        type: String,
        required: true,
        unique: true,
        trim: true
    },
    email: {
        type: String,
        required: true,
        unique: true,
        lowercase: true,
        trim: true
    },
    password: {
        type: String,
        required: true
    },
    
    // Role & Status
    role: {
        type: String,
        enum: ['admin', 'operator', 'viewer'],
        default: 'viewer'
    },
    isActive: {
        type: Boolean,
        default: true
    },
    
    // Personal Information
    fullName: {
        type: String,
        default: ''
    },
    phone: {
        type: String,
        default: ''
    },
    vehicleNumber: {
        type: String,
        default: ''
    },
    
    // Verification Fields
    emailVerified: {
        type: Boolean,
        default: false
    },
    phoneVerified: {
        type: Boolean,
        default: false
    },
    
    // OTP Fields
    otp: {
        type: String,
        default: null
    },
    otpExpiry: {
        type: Date,
        default: null
    },
    otpAttempts: {
        type: Number,
        default: 0
    },
    lastOtpSent: {
        type: Date,
        default: null
    },
    
    // Timestamps
    createdAt: {
        type: Date,
        default: Date.now
    },
    updatedAt: {
        type: Date,
        default: Date.now
    }
});

// Hash password before saving
userSchema.pre('save', async function(next) {
    this.updatedAt = Date.now();
    
    if (!this.isModified('password')) return next();
    
    try {
        const salt = await bcrypt.genSalt(10);
        this.password = await bcrypt.hash(this.password, salt);
        next();
    } catch (error) {
        next(error);
    }
});

// Compare password method
userSchema.methods.comparePassword = async function(candidatePassword) {
    return await bcrypt.compare(candidatePassword, this.password);
};

// Check if OTP is valid
userSchema.methods.isOtpValid = function(enteredOtp) {
    if (!this.otp || !this.otpExpiry) return false;
    if (this.otp !== enteredOtp) return false;
    if (Date.now() > this.otpExpiry) return false;
    return true;
};

// Clear OTP after use
userSchema.methods.clearOtp = function() {
    this.otp = null;
    this.otpExpiry = null;
    this.otpAttempts = 0;
    return this.save();
};

// Increment OTP attempts
userSchema.methods.incrementOtpAttempts = async function() {
    this.otpAttempts += 1;
    return this.save();
};

// Check if too many attempts
userSchema.methods.hasTooManyAttempts = function() {
    return this.otpAttempts >= 5;
};

// Virtual field for display name
userSchema.virtual('displayName').get(function() {
    return this.fullName || this.username;
});

// Virtual field for user type
userSchema.virtual('userType').get(function() {
    return this.role === 'admin' ? 'Authority' : 'Public User';
});

// Indexes for better query performance
userSchema.index({ email: 1 });
userSchema.index({ username: 1 });
userSchema.index({ vehicleNumber: 1 });
userSchema.index({ role: 1 });
userSchema.index({ isActive: 1 });

module.exports = mongoose.model('User', userSchema);