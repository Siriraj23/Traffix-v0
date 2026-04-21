const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const otpService = require('../services/otpService');

const JWT_SECRET = process.env.JWT_SECRET || 'traffic_secret';

/* =========================
   REGISTER
========================= */
router.post('/register', async (req, res) => {
    try {
        const {
            username,
            email,
            password,
            role,
            fullName,
            phone,
            vehicleNumber,
            emailVerified
        } = req.body;

        const existing = await User.findOne({
            $or: [{ email }, { username }]
        });

        if (existing) {
            return res.status(400).json({ error: 'User already exists' });
        }

        if (!emailVerified) {
            return res.status(400).json({ error: 'Please verify your email address first' });
        }

        if (password.length < 6) {
            return res.status(400).json({ error: 'Password must be at least 6 characters' });
        }

        const user = new User({
            username,
            email,
            password,
            role: role === 'admin' ? 'admin' : 'viewer',
            fullName: fullName || username,
            phone: phone || '',
            vehicleNumber: vehicleNumber || '',
            emailVerified: true
        });

        await user.save();

        const token = jwt.sign(
            {
                id: user._id,
                role: user.role,
                email: user.email,
                username: user.username
            },
            JWT_SECRET,
            { expiresIn: '24h' }
        );

        res.status(201).json({
            success: true,
            token,
            user: {
                id: user._id,
                username: user.username,
                email: user.email,
                role: user.role,
                fullName: user.fullName,
                phone: user.phone,
                vehicleNumber: user.vehicleNumber
            }
        });

    } catch (error) {
        console.error('Registration error:', error);
        res.status(500).json({ error: error.message });
    }
});


/* =========================
   LOGIN
========================= */
router.post('/login', async (req, res) => {
    try {
        const { email, password } = req.body;

        const user = await User.findOne({ email });
        if (!user) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        const isValid = await user.comparePassword(password);
        if (!isValid) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        if (!user.isActive) {
            return res.status(401).json({ error: 'Account is deactivated. Contact administrator.' });
        }

        const token = jwt.sign(
            {
                id: user._id,
                role: user.role,
                email: user.email,
                username: user.username
            },
            JWT_SECRET,
            { expiresIn: '24h' }
        );

        res.json({
            success: true,
            token,
            user: {
                id: user._id,
                username: user.username,
                email: user.email,
                role: user.role,
                fullName: user.fullName || user.username,
                phone: user.phone || '',
                vehicleNumber: user.vehicleNumber || ''
            }
        });

    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ error: error.message });
    }
});


/* =========================
   SEND OTP
========================= */
router.post('/send-otp', async (req, res) => {
    try {
        const { email, phone, method } = req.body;

        if (!email) {
            return res.status(400).json({ error: 'Email is required' });
        }

        const result = await otpService.sendVerificationOTP(email, phone, method);

        res.json({
            success: true,
            message: result.message,
            demoOtp: result.otp
        });

    } catch (error) {
        console.error('Send OTP error:', error);
        res.status(500).json({ error: error.message });
    }
});


/* =========================
   VERIFY OTP
========================= */
router.post('/verify-otp', async (req, res) => {
    try {
        const { email, otp } = req.body;

        if (!email || !otp) {
            return res.status(400).json({ error: 'Email and OTP are required' });
        }

        const result = await otpService.verifyOTP(email, otp);

        if (result.success) {
            res.json({
                success: true,
                message: result.message,
                verified: true
            });
        } else {
            res.status(400).json({ error: result.message });
        }

    } catch (error) {
        console.error('Verify OTP error:', error);
        res.status(500).json({ error: error.message });
    }
});


/* =========================
   GET CURRENT USER
========================= */
router.get('/me', async (req, res) => {
    try {
        const token = req.headers.authorization?.split(' ')[1];

        if (!token) {
            return res.status(401).json({ error: 'No token provided' });
        }

        const decoded = jwt.verify(token, JWT_SECRET);

        const user = await User.findById(decoded.id).select('-password');

        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        res.json({ success: true, user });

    } catch (error) {
        console.error('Get user error:', error);
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;