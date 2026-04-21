import React, { useEffect, useState } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { Container, Navbar, Nav } from 'react-bootstrap';
import 'bootstrap/dist/css/bootstrap.min.css';
import './App.css';

// Import components
import Dashboard from './components/Dashboard';
import Login from './components/Login';
import AuthorityUploadViolation from './components/AuthorityUploadViolation';
import ViolationList from './components/ViolationList';
import AwarenessSection from './components/AwarenessSection';
import Profile from './components/Profile';
import PrivateRoute from './components/PrivateRoute';

function App() {
  const [userRole, setUserRole] = useState(localStorage.getItem('userRole') || null);
  const [user, setUser] = useState(JSON.parse(localStorage.getItem('user') || '{}'));

  useEffect(() => {
    const token = localStorage.getItem('token');
    const role = localStorage.getItem('userRole');
    const userData = localStorage.getItem('user');
    
    if (token && role) {
      setUserRole(role);
      setUser(JSON.parse(userData || '{}'));
    }
  }, []);

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('userRole');
    localStorage.removeItem('user');
    localStorage.removeItem('authMethod');
    localStorage.removeItem('rememberEmail');
    setUserRole(null);
    setUser({});
    window.location.href = '/login';
  };

  return (
    <Router>
      <div className="App">
        <Navbar bg="primary" variant="dark" expand="lg">
          <Container>
            <Navbar.Brand href="/">
              🚦 TraffiX Violation System
            </Navbar.Brand>
            <Navbar.Toggle aria-controls="basic-navbar-nav" />
            <Navbar.Collapse id="basic-navbar-nav">
              <Nav className="me-auto">
                {/* Dashboard - always visible */}
                <Nav.Link href="/">Dashboard</Nav.Link>
                
                {/* Public Routes */}
                <Nav.Link href="/awareness">Awareness</Nav.Link>
                
                {/* Profile - accessible to all logged-in users */}
                <Nav.Link href="/profile">Profile</Nav.Link>
                
                {/* Authority Only Routes */}
                {userRole === 'admin' && (
                  <>
                    <Nav.Link href="/upload">Upload Violation</Nav.Link>
                    <Nav.Link href="/violations">Manage Violations</Nav.Link>
                  </>
                )}
              </Nav>
              
              <Nav>
                {userRole ? (
                  <>
                    <Navbar.Text className="me-3">
                      <strong>{user.username || 'User'}</strong>
                      {userRole === 'admin' && (
                        <span className="ms-2 badge bg-warning text-dark">Authority</span>
                      )}
                      {userRole === 'viewer' && (
                        <span className="ms-2 badge bg-info">Public</span>
                      )}
                    </Navbar.Text>
                    <Nav.Link onClick={handleLogout}>Logout</Nav.Link>
                  </>
                ) : (
                  <Nav.Link href="/login">Login</Nav.Link>
                )}
              </Nav>
            </Navbar.Collapse>
          </Container>
        </Navbar>

        <Container fluid className="mt-4">
          <Routes>
            {/* Public Routes */}
            <Route path="/login" element={<Login />} />
            <Route path="/awareness" element={<AwarenessSection />} />
            
            {/* Protected Routes - Accessible to all logged-in users */}
            <Route path="/" element={
              <PrivateRoute requiredRole="viewer">
                <Dashboard />
              </PrivateRoute>
            } />
            
            <Route path="/profile" element={
              <PrivateRoute requiredRole="viewer">
                <Profile />
              </PrivateRoute>
            } />
            
            {/* Authority Only Routes */}
            <Route path="/upload" element={
              <PrivateRoute requiredRole="authority">
                <AuthorityUploadViolation />
              </PrivateRoute>
            } />
            
            <Route path="/violations" element={
              <PrivateRoute requiredRole="authority">
                <ViolationList />
              </PrivateRoute>
            } />
            
            {/* Catch all - redirect to dashboard */}
            <Route path="*" element={<Navigate to="/" />} />
          </Routes>
        </Container>
      </div>
    </Router>
  );
}

export default App;