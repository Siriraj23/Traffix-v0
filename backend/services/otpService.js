const nodemailer = require('nodemailer');

// Configure email transporter
const emailTransporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
    }
});

// Temporary OTP storage for new users (pre-registration)
const tempOTPStore = new Map();

class OTPService {
    generateOTP() {
        return Math.floor(100000 + Math.random() * 900000).toString();
    }

    // Send OTP via Email
    async sendOTPByEmail(email, otp) {
        try {
            if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
                console.log(`\n⚠️ EMAIL NOT CONFIGURED!`);
                console.log(`📧 OTP for ${email}: ${otp}`);
                return false;
            }
            
            const mailOptions = {
                from: `"Traffic Violation System" <${process.env.EMAIL_USER}>`,
                to: email,
                subject: '🔐 Email Verification OTP - Traffic Violation System',
                html: `
                    <div style="font-family: Arial, sans-serif; max-width: 600px;">
                        <h2>Email Verification</h2>
                        <p>Your OTP is: <strong style="font-size: 24px;">${otp}</strong></p>
                        <p>Valid for 10 minutes.</p>
                    </div>
                `
            };
            
            await emailTransporter.sendMail(mailOptions);
            console.log(`✅ Email sent to ${email}`);
            return true;
        } catch (error) {
            console.error('Email sending failed:', error.message);
            return false;
        }
    }

    // Send OTP via SMS (Placeholder)
    async sendOTPBySMS(phone, otp) {
        console.log(`📱 OTP for ${phone}: ${otp}`);
        return true;
    }

    // Send verification OTP
    async sendVerificationOTP(email, phone, method) {
        const otp = this.generateOTP();
        const expiryTime = Date.now() + 10 * 60 * 1000;
        
        // Store in temporary map with email as key
        tempOTPStore.set(email, {
            otp: otp,
            expiry: expiryTime,
            attempts: 0,
            method: method,
            email: email,
            createdAt: new Date().toISOString()
        });
        
        console.log(`\n🔐 =========================================`);
        console.log(`📧 OTP STORED for ${email}`);
        console.log(`🔑 OTP Code: ${otp}`);
        console.log(`⏰ Expires in 10 minutes`);
        console.log(`📊 Total OTPs stored: ${tempOTPStore.size}`);
        console.log(`🔐 =========================================\n`);
        
        let sent = false;
        if (method === 'email') {
            sent = await this.sendOTPByEmail(email, otp);
        } else if (method === 'phone' && phone) {
            sent = await this.sendOTPBySMS(phone, otp);
        }
        
        return { 
            success: true, 
            message: sent ? `OTP sent to your ${method}` : `OTP generated (Check console)`,
            otp: otp
        };
    }

    // Verify OTP
    async verifyOTP(email, enteredOTP) {
        console.log(`\n🔍 Verifying OTP for email: ${email}`);
        console.log(`📝 Entered OTP: ${enteredOTP}`);
        
        // Get stored data
        const storedData = tempOTPStore.get(email);
        
        if (!storedData) {
            console.log(`❌ No OTP found for email: ${email}`);
            console.log(`📊 Available OTPs in store: ${Array.from(tempOTPStore.keys()).join(', ')}`);
            return { success: false, message: 'No OTP requested. Please request a new OTP.' };
        }
        
        console.log(`✅ Found stored OTP: ${storedData.otp}`);
        console.log(`⏰ Expires at: ${new Date(storedData.expiry).toLocaleTimeString()}`);
        
        if (storedData.attempts >= 5) {
            tempOTPStore.delete(email);
            return { success: false, message: 'Too many attempts. Please request a new OTP.' };
        }
        
        if (Date.now() > storedData.expiry) {
            tempOTPStore.delete(email);
            return { success: false, message: 'OTP has expired. Please request a new one.' };
        }
        
        if (storedData.otp !== enteredOTP) {
            storedData.attempts += 1;
            tempOTPStore.set(email, storedData);
            console.log(`❌ Invalid OTP. Attempts: ${storedData.attempts}/5`);
            return { success: false, message: `Invalid OTP. ${5 - storedData.attempts} attempts remaining.` };
        }
        
        // Clear OTP on success
        tempOTPStore.delete(email);
        console.log(`✅ OTP verified successfully for ${email}`);
        
        return { success: true, message: 'OTP verified successfully' };
    }

    // Resend OTP
    async resendOTP(email, phone, method) {
        tempOTPStore.delete(email);
        return await this.sendVerificationOTP(email, phone, method);
    }

    // Get all stored OTPs (for debugging)
    getAllStoredOTPs() {
        const otps = [];
        for (const [email, data] of tempOTPStore.entries()) {
            otps.push({
                email,
                otp: data.otp,
                expiry: new Date(data.expiry).toLocaleString(),
                attempts: data.attempts
            });
        }
        return otps;
    }
}

// Cleanup expired OTPs every minute
setInterval(() => {
    const otpService = new OTPService();
    const now = Date.now();
    let removed = 0;
    for (const [email, data] of tempOTPStore.entries()) {
        if (now > data.expiry) {
            tempOTPStore.delete(email);
            removed++;
        }
    }
    if (removed > 0) {
        console.log(`🧹 Cleaned up ${removed} expired OTPs`);
    }
}, 60 * 1000);

module.exports = new OTPService();