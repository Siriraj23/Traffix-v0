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
  FaArrowRight, FaShieldAlt, FaCar, FaUser,
  FaUserShield, FaCheckCircle, FaUserPlus,
  FaSignInAlt, FaPhone
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

  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);

  const [selectedRole, setSelectedRole] = useState('public');
  const [isLoginMode, setIsLoginMode] = useState(true);

  // OTP
  const [showOTPModal, setShowOTPModal] = useState(false);
  const [tempUserData, setTempUserData] = useState(null);

  const navigate = useNavigate();

  // ================= LOGIN =================
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

      const response = await authAPI.login(email, password);

      if (response.success) {
        const userRole = response.user.role;

        if (selectedRole === 'authority' && userRole !== 'admin') {
          setError('Use Public Login for this account');
          setLoading(false);
          return;
        }

        if (selectedRole === 'public' && userRole === 'admin') {
          setError('Use Authority Login for this account');
          setLoading(false);
          return;
        }

        localStorage.setItem('token', response.token);
        localStorage.setItem('user', JSON.stringify(response.user));
        localStorage.setItem('userRole', response.user.role);

        if (rememberMe) {
          localStorage.setItem('rememberEmail', email);
        }

        setSuccess('Login successful!');
        setTimeout(() => navigate('/'), 1000);

      } else {
        setError(response.error || 'Invalid credentials');
      }

    } catch {
      setError('Server error');
    }

    setLoading(false);
  };

  // ================= REGISTER =================
  const handleRegister = (e) => {
    e.preventDefault();

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
      role: selectedRole === 'authority' ? 'admin' : 'viewer'
    });

    setShowOTPModal(true);
  };

  // ================= OTP VERIFIED =================
  const handleOTPVerified = async (method) => {
    try {
      const response = await authAPI.register({
        ...tempUserData,
        emailVerified: method === 'email',
        phoneVerified: method === 'phone'
      });

      if (response.success) {
        setSuccess('Account created! Please login.');
        setShowOTPModal(false);
        setIsLoginMode(true);
      } else {
        setError(response.error);
      }

    } catch {
      setError('Registration failed');
    }
  };

  // ================= LOAD EMAIL =================
  useEffect(() => {
    const saved = localStorage.getItem('rememberEmail');
    if (saved) {
      setEmail(saved);
      setRememberMe(true);
    }
  }, []);

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
              </div>

              {/* ROLE */}
              <div className="role-selector">
                <div className="role-buttons">
                  <button
                    className={`role-btn ${selectedRole === 'public' ? 'active' : ''}`}
                    onClick={() => setSelectedRole('public')}
                  >
                    <FaUser /> Public
                  </button>
                  <button
                    className={`role-btn ${selectedRole === 'authority' ? 'active' : ''}`}
                    onClick={() => setSelectedRole('authority')}
                  >
                    <FaUserShield /> Authority
                  </button>
                </div>
              </div>

              {/* MODE */}
              <div className="mode-selector">
                <button
                  className={`mode-btn ${isLoginMode ? 'active' : ''}`}
                  onClick={() => setIsLoginMode(true)}
                >
                  Login
                </button>
                <button
                  className={`mode-btn ${!isLoginMode ? 'active' : ''}`}
                  onClick={() => setIsLoginMode(false)}
                >
                  Create Account
                </button>
              </div>

              {error && <Alert variant="danger">{error}</Alert>}
              {success && <Alert variant="success">{success}</Alert>}

              {isLoginMode ? (
                <Form onSubmit={handleLogin}>

                  <InputGroup className="mb-3">
                    <InputGroup.Text><FaEnvelope /></InputGroup.Text>
                    <Form.Control
                      type="email"
                      placeholder="Email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                    />
                  </InputGroup>

                  <InputGroup className="mb-3">
                    <InputGroup.Text><FaLock /></InputGroup.Text>
                    <Form.Control
                      type={showPassword ? 'text' : 'password'}
                      placeholder="Password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                    />
                    <InputGroup.Text onClick={() => setShowPassword(!showPassword)}>
                      {showPassword ? <FaEyeSlash /> : <FaEye />}
                    </InputGroup.Text>
                  </InputGroup>

                  <Button className="login-button" type="submit" disabled={loading}>
                    {loading ? <Spinner size="sm" /> : 'Login'}
                  </Button>

                </Form>
              ) : (
                <Form onSubmit={handleRegister}>

                  <Form.Control placeholder="Full Name" className="mb-2" onChange={(e) => setFullName(e.target.value)} />
                  <Form.Control placeholder="Username" className="mb-2" onChange={(e) => setUsername(e.target.value)} />
                  <Form.Control placeholder="Email" className="mb-2" onChange={(e) => setEmail(e.target.value)} />
                  <Form.Control placeholder="Phone" className="mb-2" onChange={(e) => setPhone(e.target.value)} />
                  <Form.Control type="password" placeholder="Password" className="mb-2" onChange={(e) => setPassword(e.target.value)} />

                  <Button className="login-button" type="submit">
                    Create Account
                  </Button>

                </Form>
              )}

              {/* GOOGLE */}
              <Button className="google-button mt-3">
                <FaGoogle /> Google Login
              </Button>

              {/* DEMO */}
              <Card className="demo-card mt-3">
                <Badge>Demo</Badge>
                <p>admin@traffic.com / admin123</p>
                <p>public@example.com / public123</p>
              </Card>

            </Card>
          </Col>
        </Row>
      </Container>

      {/* OTP */}
      {showOTPModal && (
        <OTPVerification
          show={showOTPModal}
          email={tempUserData?.email}
          phone={tempUserData?.phone}
          onVerified={handleOTPVerified}
          onClose={() => setShowOTPModal(false)}
        />
      )}
    </div>
  );
};

export default Login;