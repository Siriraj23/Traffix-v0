import React, { useState, useEffect } from 'react';
import { 
  Form, Button, Card, Alert, Container, Row, Col,
  InputGroup, Spinner, Badge
} from 'react-bootstrap';
import { useNavigate } from 'react-router-dom';
import { authAPI } from '../api/api';
import OTPVerification from './OtpVerification';
import { 
  FaGoogle, FaEnvelope, FaLock, FaEye, FaEyeSlash,
  FaCar, FaUser, FaUserShield, FaUserPlus, FaPhone
} from 'react-icons/fa';
import './Login.css';

const Login = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [username, setUsername] = useState('');
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');

  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);

  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);

  const [selectedRole, setSelectedRole] = useState('public');
  const [isLoginMode, setIsLoginMode] = useState(true);

  const [showOTPModal, setShowOTPModal] = useState(false);
  const [tempUserData, setTempUserData] = useState(null);

  const navigate = useNavigate();

  // ================= Load Google Script =================
  useEffect(() => {
    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.defer = true;
    document.head.appendChild(script);

    return () => {
      // Cleanup
      const existingScript = document.querySelector('script[src*="accounts.google.com"]');
      if (existingScript) {
        existingScript.remove();
      }
    };
  }, []);

  // ================= Decode Google Token =================
  const decodeGoogleToken = (credential) => {
    try {
      const base64Url = credential.split('.')[1];
      const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
      const jsonPayload = decodeURIComponent(
        atob(base64)
          .split('')
          .map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
          .join('')
      );
      return JSON.parse(jsonPayload);
    } catch (e) {
      console.error('Token decode error:', e);
      return null;
    }
  };

  // ================= Handle Google Response =================
  const handleGoogleResponse = async (response) => {
    setGoogleLoading(true);
    setError('');

    const userInfo = decodeGoogleToken(response.credential);
    
    if (!userInfo) {
      setError('Failed to get Google account info');
      setGoogleLoading(false);
      return;
    }

    console.log('Google User:', userInfo.email, userInfo.name);

    if (isLoginMode) {
      // Google Login - Try to login with Google email
      const result = await authAPI.login({
        email: userInfo.email,
        password: 'google_' + userInfo.sub
      });

      console.log('Google Login result:', result);

      if (result.success) {
        // Get user from localStorage (saved by authAPI.login)
        const user = JSON.parse(localStorage.getItem('user'));
        const userRole = user?.role;

        // Check role
        if (selectedRole === 'authority' && userRole !== 'admin') {
          setError('This Google account is not an authority account');
          authAPI.logout();
          setGoogleLoading(false);
          return;
        }

        if (selectedRole === 'public' && userRole === 'admin') {
          setError('Use Authority Login for this account');
          authAPI.logout();
          setGoogleLoading(false);
          return;
        }

        setSuccess('Google login successful!');
        setTimeout(() => navigate('/'), 1000);
      } else {
        // Login failed - probably no account exists
        setError('No account found with this Google email. Please sign up first.');
        // Switch to register mode and pre-fill
        setIsLoginMode(false);
        setFullName(userInfo.name || '');
        setEmail(userInfo.email || '');
        setUsername(userInfo.email ? userInfo.email.split('@')[0] : '');
        // Don't set password for Google users
      }
    } else {
      // Google Register - Skip OTP and register directly
      setGoogleLoading(true);
      
      const userData = {
        username: userInfo.email ? userInfo.email.split('@')[0] : '',
        email: userInfo.email,
        password: 'google_' + userInfo.sub,
        fullName: userInfo.name,
        phone: phone || '',
        role: selectedRole === 'authority' ? 'admin' : 'viewer',
        emailVerified: true, // Google emails are pre-verified
        phoneVerified: false,
        provider: 'google',
        googleId: userInfo.sub
      };

      console.log('Registering Google user:', userData);

      const result = await authAPI.register(userData);

      if (result.success) {
        setSuccess('Account created successfully! You can now login.');
        setIsLoginMode(true);
        // Clear form
        setPassword('');
        setPhone('');
      } else {
        setError(result.error || 'Registration failed. Please try again.');
        // Pre-fill form so user can try manually
        setFullName(userInfo.name || '');
        setEmail(userInfo.email || '');
        setUsername(userInfo.email ? userInfo.email.split('@')[0] : '');
      }
    }

    setGoogleLoading(false);
  };

  // ================= Start Google Sign-In =================
  const handleGoogleLogin = () => {
    setError('');
    setSuccess('');
    
    if (window.google && window.google.accounts) {
      window.google.accounts.id.initialize({
        client_id: '817471968262-i3g6iujlu0id0k7gjiim1hg38t4nhikf.apps.googleusercontent.com',
        callback: handleGoogleResponse,
      });
      
      window.google.accounts.id.prompt((notification) => {
        if (notification.isNotDisplayed()) {
          setError('Google Sign-In not available. Please use email/password.');
        }
      });
    } else {
      setError('Google Sign-In is loading. Please try again in a moment.');
    }
  };

  const handleGoogleRegister = () => {
    setError('');
    setSuccess('');
    handleGoogleLogin(); // Same flow
  };

  // ================= Handle Regular Login =================
  const handleLogin = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setSuccess('');

    try {
      if (!email || !password) {
        setError('Please enter email and password');
        setLoading(false);
        return;
      }

      const response = await authAPI.login({ email, password });

      console.log('Login response:', response);

      if (response.success) {
        // Get user from localStorage (saved by authAPI.login)
        const user = JSON.parse(localStorage.getItem('user'));
        const userRole = user?.role;

        if (selectedRole === 'authority' && userRole !== 'admin') {
          setError('Use Public Login for this account');
          authAPI.logout();
          setLoading(false);
          return;
        }

        if (selectedRole === 'public' && userRole === 'admin') {
          setError('Use Authority Login for this account');
          authAPI.logout();
          setLoading(false);
          return;
        }

        if (rememberMe) {
          localStorage.setItem('rememberEmail', email);
        }

        setSuccess('Login successful!');
        setTimeout(() => navigate('/'), 1000);
      } else {
        setError(response.error || 'Invalid credentials');
      }
    } catch (err) {
      console.error('Login error:', err);
      setError('Server error. Please check if backend is running.');
    }

    setLoading(false);
  };

  // ================= Handle Regular Register =================
  const handleRegister = (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    if (!username || !email || !password || !fullName) {
      setError('All fields are required');
      return;
    }

    setTempUserData({
      username,
      email,
      password,
      fullName,
      phone,
      role: selectedRole === 'authority' ? 'admin' : 'viewer',
      provider: 'email'
    });

    setShowOTPModal(true);
  };

  // ================= OTP Verified =================
  const handleOTPVerified = async (method) => {
    try {
      const userData = {
        ...tempUserData,
        emailVerified: method === 'email',
        phoneVerified: method === 'phone'
      };

      console.log('Registering user:', userData);

      const response = await authAPI.register(userData);

      console.log('Register response:', response);

      if (response.success) {
        setSuccess('Account created! Please login.');
        setShowOTPModal(false);
        setIsLoginMode(true);
        setTempUserData(null);
        // Clear form
        setPassword('');
        setPhone('');
        setUsername('');
        setFullName('');
      } else {
        setError(response.error || 'Registration failed');
        setShowOTPModal(false);
      }
    } catch (err) {
      console.error('Registration error:', err);
      setError('Registration failed. Server error.');
      setShowOTPModal(false);
    }
  };

  // ================= Load Remembered Email =================
  useEffect(() => {
    const saved = localStorage.getItem('rememberEmail');
    if (saved) {
      setEmail(saved);
      setRememberMe(true);
    }
  }, []);

  // ================= RENDER =================
  return (
    <div className="login-page">
      <Container className="login-container">
        <Row className="justify-content-center align-items-center min-vh-100">
          <Col md={6} lg={5}>
            <Card className="login-card">

              {/* BRAND */}
              <div className="login-brand">
                <div className="brand-icon">
                  {selectedRole === 'authority' ? <FaUserShield /> : <FaCar />}
                </div>
                <h2 className="brand-title">
                  {isLoginMode ? 'Welcome Back' : 'Create Account'}
                </h2>
                <p className="brand-subtitle">
                  Traffic Violation Detection System
                </p>
              </div>

              {/* ROLE */}
              <div className="role-selector">
                <div className="role-buttons">
                  <button
                    className={`role-btn ${selectedRole === 'public' ? 'active' : ''}`}
                    onClick={() => setSelectedRole('public')}
                    type="button"
                  >
                    <FaUser /> Public
                  </button>
                  <button
                    className={`role-btn ${selectedRole === 'authority' ? 'active' : ''}`}
                    onClick={() => setSelectedRole('authority')}
                    type="button"
                  >
                    <FaUserShield /> Authority
                  </button>
                </div>
              </div>

              {/* MODE */}
              <div className="mode-selector">
                <button
                  className={`mode-btn ${isLoginMode ? 'active' : ''}`}
                  onClick={() => { setIsLoginMode(true); setError(''); setSuccess(''); }}
                  type="button"
                >
                  Login
                </button>
                <button
                  className={`mode-btn ${!isLoginMode ? 'active' : ''}`}
                  onClick={() => { setIsLoginMode(false); setError(''); setSuccess(''); }}
                  type="button"
                >
                  Create Account
                </button>
              </div>

              {error && (
                <Alert variant="danger" dismissible onClose={() => setError('')}>
                  {error}
                </Alert>
              )}
              
              {success && (
                <Alert variant="success" dismissible onClose={() => setSuccess('')}>
                  {success}
                </Alert>
              )}

              {isLoginMode ? (
                <Form onSubmit={handleLogin}>
                  <InputGroup className="mb-3">
                    <InputGroup.Text><FaEnvelope /></InputGroup.Text>
                    <Form.Control
                      type="email"
                      placeholder="Email address"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                    />
                  </InputGroup>

                  <InputGroup className="mb-3">
                    <InputGroup.Text><FaLock /></InputGroup.Text>
                    <Form.Control
                      type={showPassword ? 'text' : 'password'}
                      placeholder="Password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                    />
                    <InputGroup.Text 
                      onClick={() => setShowPassword(!showPassword)}
                      style={{ cursor: 'pointer' }}
                    >
                      {showPassword ? <FaEyeSlash /> : <FaEye />}
                    </InputGroup.Text>
                  </InputGroup>

                  <Form.Check
                    type="checkbox"
                    label="Remember me"
                    checked={rememberMe}
                    onChange={(e) => setRememberMe(e.target.checked)}
                    className="mb-3"
                  />

                  <Button 
                    className="login-button w-100 mb-3" 
                    type="submit" 
                    disabled={loading}
                  >
                    {loading ? (
                      <>
                        <Spinner size="sm" animation="border" /> Logging in...
                      </>
                    ) : (
                      'Login'
                    )}
                  </Button>

                  <div className="divider">
                    <span>or continue with</span>
                  </div>

                  <Button 
                    className="google-btn w-100" 
                    variant="light"
                    onClick={handleGoogleLogin}
                    disabled={googleLoading}
                    type="button"
                  >
                    {googleLoading ? (
                      <>
                        <Spinner size="sm" animation="border" /> Connecting...
                      </>
                    ) : (
                      <>
                        <FaGoogle /> Google
                      </>
                    )}
                  </Button>
                </Form>
              ) : (
                <Form onSubmit={handleRegister}>
                  <InputGroup className="mb-2">
                    <InputGroup.Text><FaUser /></InputGroup.Text>
                    <Form.Control 
                      placeholder="Full Name" 
                      value={fullName} 
                      onChange={(e) => setFullName(e.target.value)} 
                      required 
                    />
                  </InputGroup>

                  <InputGroup className="mb-2">
                    <InputGroup.Text><FaUser /></InputGroup.Text>
                    <Form.Control 
                      placeholder="Username" 
                      value={username} 
                      onChange={(e) => setUsername(e.target.value)} 
                      required 
                    />
                  </InputGroup>

                  <InputGroup className="mb-2">
                    <InputGroup.Text><FaEnvelope /></InputGroup.Text>
                    <Form.Control 
                      type="email" 
                      placeholder="Email address" 
                      value={email} 
                      onChange={(e) => setEmail(e.target.value)} 
                      required 
                    />
                  </InputGroup>

                  <InputGroup className="mb-2">
                    <InputGroup.Text><FaPhone /></InputGroup.Text>
                    <Form.Control 
                      placeholder="Phone (optional)" 
                      value={phone} 
                      onChange={(e) => setPhone(e.target.value)} 
                    />
                  </InputGroup>

                  <InputGroup className="mb-3">
                    <InputGroup.Text><FaLock /></InputGroup.Text>
                    <Form.Control 
                      type={showPassword ? 'text' : 'password'}
                      placeholder="Password" 
                      value={password} 
                      onChange={(e) => setPassword(e.target.value)} 
                      required 
                    />
                    <InputGroup.Text 
                      onClick={() => setShowPassword(!showPassword)}
                      style={{ cursor: 'pointer' }}
                    >
                      {showPassword ? <FaEyeSlash /> : <FaEye />}
                    </InputGroup.Text>
                  </InputGroup>

                  <Button 
                    className="login-button w-100 mb-3" 
                    type="submit"
                  >
                    <FaUserPlus /> Create Account
                  </Button>

                  <div className="divider">
                    <span>or continue with</span>
                  </div>

                  <Button 
                    className="google-btn w-100" 
                    variant="light"
                    onClick={handleGoogleRegister}
                    disabled={googleLoading}
                    type="button"
                  >
                    {googleLoading ? (
                      <>
                        <Spinner size="sm" animation="border" /> Connecting...
                      </>
                    ) : (
                      <>
                        <FaGoogle /> Google
                      </>
                    )}
                  </Button>
                </Form>
              )}

              <Card className="demo-card mt-3">
                <Badge bg="warning" text="dark">Demo Credentials</Badge>
                <p className="mb-1 mt-2"><strong>Admin:</strong> admin@traffic.com / admin123</p>
                <p className="mb-0"><strong>Public:</strong> public@example.com / public123</p>
              </Card>
            </Card>
          </Col>
        </Row>
      </Container>

      {/* OTP Modal - Only for email registration */}
      {showOTPModal && tempUserData && (
        <OTPVerification
          show={showOTPModal}
          email={tempUserData?.email}
          phone={tempUserData?.phone}
          onVerified={handleOTPVerified}
          onClose={() => {
            setShowOTPModal(false);
            setTempUserData(null);
          }}
        />
      )}
    </div>
  );
};

export default Login;