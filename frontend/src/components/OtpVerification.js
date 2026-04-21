import React, { useState } from 'react';
import { Modal, Form, Button, Alert, Spinner } from 'react-bootstrap';
import { FaEnvelope, FaPhone, FaCheck } from 'react-icons/fa';

const OTPVerification = ({ show, onClose, email, phone, onVerified }) => {
    const [otp, setOtp] = useState('');
    const [method, setMethod] = useState('email');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');
    const [otpSent, setOtpSent] = useState(false);
    const [countdown, setCountdown] = useState(0);
    const [verified, setVerified] = useState(false);
    const [demoOtp, setDemoOtp] = useState('');

    const handleSendOTP = async () => {
        setLoading(true);
        setError('');
        setDemoOtp('');

        try {
            const response = await fetch('http://localhost:5000/api/auth/send-otp', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    email,
                    phone: method === 'phone' ? phone : undefined,
                    method
                })
            });

            const data = await response.json();

            if (response.ok) {
                setOtpSent(true);
                setSuccess(`OTP sent to your ${method}`);

                if (data.demoOtp) {
                    setDemoOtp(data.demoOtp);
                }

                let timer = 60;
                const interval = setInterval(() => {
                    timer--;
                    setCountdown(timer);
                    if (timer <= 0) {
                        clearInterval(interval);
                        setCountdown(0);
                    }
                }, 1000);
            } else {
                setError(data.error || 'Failed to send OTP');
            }
        } catch {
            setError('Network error. Please try again.');
        } finally {
            setLoading(false);
        }
    };

    const handleVerifyOTP = async () => {
        if (!otp || otp.length !== 6) {
            setError('Enter valid 6-digit OTP');
            return;
        }

        setLoading(true);
        setError('');

        try {
            const response = await fetch('http://localhost:5000/api/auth/verify-otp', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, otp })
            });

            const data = await response.json();

            if (response.ok) {
                setVerified(true);
                setSuccess('OTP verified successfully!');

                // 🔥 IMPORTANT FIX: Only call parent
                setTimeout(() => {
                    onVerified(method);
                }, 1200);

            } else {
                setError(data.error || 'Invalid OTP');
            }
        } catch {
            setError('Network error');
        } finally {
            setLoading(false);
        }
    };

    return (
        <Modal show={show} onHide={onClose} centered>
            <Modal.Header closeButton>
                <Modal.Title>Verify Your Identity</Modal.Title>
            </Modal.Header>

            <Modal.Body>
                {!verified ? (
                    <>
                        <Alert variant="info">
                            Verify your identity to continue
                        </Alert>

                        <div className="mb-3">
                            <Form.Label>Method</Form.Label>
                            <div className="d-flex gap-2">
                                <Button
                                    variant={method === 'email' ? 'primary' : 'outline-primary'}
                                    onClick={() => setMethod('email')}
                                >
                                    <FaEnvelope /> Email
                                </Button>

                                <Button
                                    variant={method === 'phone' ? 'primary' : 'outline-primary'}
                                    onClick={() => setMethod('phone')}
                                    disabled={!phone}
                                >
                                    <FaPhone /> Phone
                                </Button>
                            </div>
                        </div>

                        <Button
                            className="w-100 mb-3"
                            onClick={handleSendOTP}
                            disabled={loading || countdown > 0}
                        >
                            {loading ? <Spinner size="sm" /> : 'Send OTP'}
                            {countdown > 0 && ` (${countdown}s)`}
                        </Button>

                        {demoOtp && (
                            <Alert variant="warning">
                                Demo OTP: <strong>{demoOtp}</strong>
                            </Alert>
                        )}

                        {otpSent && (
                            <Form.Control
                                placeholder="Enter OTP"
                                value={otp}
                                onChange={(e) => setOtp(e.target.value)}
                                maxLength={6}
                                className="mb-3"
                            />
                        )}

                        {error && <Alert variant="danger">{error}</Alert>}
                        {success && <Alert variant="success">{success}</Alert>}
                    </>
                ) : (
                    <div className="text-center">
                        <FaCheck size={50} className="text-success mb-2" />
                        <h5>Verified</h5>
                    </div>
                )}
            </Modal.Body>

            <Modal.Footer>
                <Button variant="secondary" onClick={onClose}>
                    Cancel
                </Button>

                {otpSent && !verified && (
                    <Button onClick={handleVerifyOTP}>
                        Verify OTP
                    </Button>
                )}
            </Modal.Footer>
        </Modal>
    );
};

export default OTPVerification;