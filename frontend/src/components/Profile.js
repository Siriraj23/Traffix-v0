import React, { useEffect, useState, useCallback } from 'react';
import { Container, Row, Col, Card, Button, Form, Spinner, Badge } from 'react-bootstrap';
import { FaUser, FaCar, FaExclamationTriangle, FaCheckCircle, FaClock, FaEdit, FaSave, FaTimes } from 'react-icons/fa';
import { violationsAPI } from '../api/api';
import { getFineAmount } from '../utils/trafficFines';
import './Profile.css';

// MUST match exactly with AuthorityUploadViolation
const SAVED_VIOLATIONS_KEY = 'traffic_saved_violations';

const ensureArray = (data) => Array.isArray(data) ? data : [];

const Profile = () => {
  const [user, setUser] = useState({});
  const [violations, setViolations] = useState([]);
  const [vehicleNumber, setVehicleNumber] = useState('');
  const [saving, setSaving] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [loading, setLoading] = useState(true);

  const userRole = localStorage.getItem('userRole');
  const isAdmin = userRole === 'admin';

  // ===== FETCH VIOLATIONS - Reads from API AND localStorage =====
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const fetchUserViolations = useCallback(async (vehicleNo, adminStatus) => {
    try {
      const targetVehicle = vehicleNo || user?.vehicleNumber;
      console.log('👤 Profile: Fetching violations for vehicle:', targetVehicle);
      let allViolations = [];
      
      // Try API first
      try {
        const response = await violationsAPI.getAll({ limit: 100 });
        if (response && response.success) {
          allViolations = ensureArray(response.violations || response.data || response);
          console.log('✅ Profile: API violations found:', allViolations.length);
        }
      } catch (apiErr) {
        console.warn('Profile: API fetch failed:', apiErr.message);
      }
      
      // ALWAYS add SAVED violations from localStorage
      try {
        const savedViolations = JSON.parse(localStorage.getItem(SAVED_VIOLATIONS_KEY) || '[]');
        const localSaved = ensureArray(savedViolations);
        console.log('💾 Profile: LocalStorage saved violations:', localSaved.length);
        
        localSaved.forEach(v => {
          const exists = allViolations.find(av => 
            (av.vehicleNumber || '').toUpperCase() === (v.vehicleNumber || '').toUpperCase() && 
            av.type === v.type &&
            Math.abs(new Date(av.timestamp || av.createdAt) - new Date(v.savedAt || v.timestamp)) < 10000
          );
          
          if (!exists) {
            console.log('➕ Profile: Adding local violation:', v.type, v.vehicleNumber);
            allViolations.push({
              _id: v._id || `local_${Date.now()}`,
              violationId: v.violationId || `LOC-${Date.now()}`,
              vehicleNumber: v.vehicleNumber || v.violationData?.vehicleNumber || 'Unknown',
              type: v.type || v.violationData?.type || 'Unknown',
              violationType: v.type || v.violationData?.type || 'Unknown',
              fineAmount: v.fineAmount || v.fine || v.violationData?.fineAmount || 1000,
              confidence: v.confidence || 0.85,
              status: v.status || 'detected',
              timestamp: v.savedAt || v.timestamp || new Date().toISOString(),
              createdAt: v.savedAt || v.createdAt || new Date().toISOString(),
              description: v.description || '',
              severity: v.severity || 'medium',
              isSaved: true
            });
          }
        });
      } catch (localErr) {
        console.warn('Profile: Local storage read failed:', localErr.message);
      }
      
      // Filter for non-admin users by vehicle number
      if (!adminStatus && targetVehicle) {
        allViolations = allViolations.filter(v => 
          (v.vehicleNumber || '').toUpperCase() === (targetVehicle || '').toUpperCase()
        );
        console.log('🔍 Profile: Filtered for vehicle', targetVehicle, '- found:', allViolations.length);
      }
      
      setViolations(allViolations);
    } catch (err) {
      console.error('Profile: Fetch error:', err);
      setViolations([]);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Initial load
  useEffect(() => {
    const userData = JSON.parse(localStorage.getItem('user') || '{}');
    if (userData) {
      setUser(userData);
      setVehicleNumber(userData.vehicleNumber || '');
      fetchUserViolations(userData.vehicleNumber, userData.role === 'admin');
    }
    setLoading(false);
  }, [fetchUserViolations]);

  // ===== LISTEN FOR SAVE EVENTS FROM AUTHORITY UPLOAD PAGE =====
  useEffect(() => {
    const currentUser = JSON.parse(localStorage.getItem('user') || '{}');
    const currentVehicleNo = currentUser?.vehicleNumber;
    const currentIsAdmin = currentUser?.role === 'admin';
    
    const refreshViolations = () => {
      console.log('🔔 Profile: Event received, refreshing violations...');
      fetchUserViolations(currentVehicleNo, currentIsAdmin);
    };
    
    // Also check for storage changes from other tabs
    const handleStorageChange = (e) => {
      if (e.key === SAVED_VIOLATIONS_KEY) {
        console.log('🔔 Profile: localStorage changed from another tab!');
        refreshViolations();
      }
    };
    
    window.addEventListener('violationSaved', refreshViolations);
    window.addEventListener('violationsBatchSaved', refreshViolations);
    window.addEventListener('violationsUpdated', refreshViolations);
    window.addEventListener('storage', handleStorageChange);
    
    return () => {
      window.removeEventListener('violationSaved', refreshViolations);
      window.removeEventListener('violationsBatchSaved', refreshViolations);
      window.removeEventListener('violationsUpdated', refreshViolations);
      window.removeEventListener('storage', handleStorageChange);
    };
  }, [fetchUserViolations]);

  const handleUpdateVehicle = () => {
    if (!vehicleNumber.trim()) { 
      alert("Please enter vehicle number"); 
      return; 
    }
    setSaving(true);
    setTimeout(() => {
      const updatedUser = { ...user, vehicleNumber: vehicleNumber.trim().toUpperCase() };
      localStorage.setItem('user', JSON.stringify(updatedUser));
      setUser(updatedUser);
      fetchUserViolations(vehicleNumber.trim().toUpperCase(), updatedUser.role === 'admin');
      setSaving(false);
      setIsEditing(false);
      alert("Vehicle number updated successfully!");
    }, 500);
  };

  const getViolationFine = (violation) => {
    if (!violation) return 0;
    return violation.fineAmount || violation.fine || violation.violationData?.fineAmount || violation.fine_amount || getFineAmount(violation.type || violation.violationType) || 0;
  };

  const violationsList = ensureArray(violations);
  const totalViolations = violationsList.length;
  const pendingViolations = violationsList.filter(v => 
    (v.status || '').toLowerCase() !== 'fined' && 
    (v.status || '').toLowerCase() !== 'paid' && 
    (v.status || '').toLowerCase() !== 'resolved'
  );
  const resolvedViolations = violationsList.filter(v => 
    (v.status || '').toLowerCase() === 'fined' || 
    (v.status || '').toLowerCase() === 'paid' || 
    (v.status || '').toLowerCase() === 'resolved'
  );
  const pendingFines = isAdmin ? 0 : pendingViolations.reduce((sum, v) => sum + getViolationFine(v), 0);
  const paidFines = isAdmin ? 0 : resolvedViolations.reduce((sum, v) => sum + getViolationFine(v), 0);

  const formatDate = (dateString) => {
    if (!dateString) return 'N/A';
    try { 
      return new Date(dateString).toLocaleDateString('en-IN', { 
        year: 'numeric', month: 'short', day: 'numeric' 
      }); 
    }
    catch (e) { return dateString; }
  };

  if (loading) {
    return (
      <div className="text-center py-5">
        <Spinner animation="border" variant="primary" />
        <p className="mt-3">Loading profile...</p>
      </div>
    );
  }

  return (
    <div className="profile-page">
      <Container fluid className="py-4">
        <div className="profile-header mb-4 d-flex align-items-center justify-content-between">
          <div className="d-flex align-items-center">
            <div className="profile-avatar me-3" style={{
              width: '60px', height: '60px', borderRadius: '50%',
              background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: 'white', fontSize: '1.5rem', fontWeight: 'bold'
            }}>
              {(user.username || 'U').charAt(0).toUpperCase()}
            </div>
            <div>
              <h2 className="profile-title mb-1">
                {isAdmin ? 'Administrator Dashboard' : `Welcome, ${user.username || 'User'}`}
              </h2>
              <p className="profile-subtitle text-muted mb-0">
                {isAdmin ? 'System Management & Overview' : 'Manage your profile and track violations'}
              </p>
            </div>
          </div>
          <Badge bg={isAdmin ? 'danger' : 'primary'} className="fs-6">
            {isAdmin ? 'Administrator' : 'Citizen User'}
          </Badge>
        </div>

        <Row className="g-4">
          <Col lg={12}>
            <Row className="g-3 mb-4">
              <Col md={4}>
                <Card className="stat-card shadow-sm border-0 h-100">
                  <Card.Body className="d-flex align-items-center">
                    <div className="stat-icon-wrapper me-3" style={{
                      width: '50px', height: '50px', borderRadius: '12px',
                      background: 'rgba(13, 110, 253, 0.1)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      color: '#0d6efd', fontSize: '1.5rem'
                    }}>
                      <FaExclamationTriangle />
                    </div>
                    <div>
                      <h3 className="stat-value mb-0">{totalViolations}</h3>
                      <p className="stat-label text-muted mb-0">Total Violations</p>
                    </div>
                  </Card.Body>
                </Card>
              </Col>
              
              {!isAdmin && (
                <>
                  <Col md={4}>
                    <Card className="stat-card shadow-sm border-0 h-100">
                      <Card.Body className="d-flex align-items-center">
                        <div className="stat-icon-wrapper me-3" style={{
                          width: '50px', height: '50px', borderRadius: '12px',
                          background: 'rgba(255, 193, 7, 0.1)',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          color: '#ffc107', fontSize: '1.5rem'
                        }}>
                          <FaClock />
                        </div>
                        <div>
                          <h3 className="stat-value mb-0">₹{pendingFines.toLocaleString('en-IN')}</h3>
                          <p className="stat-label text-muted mb-0">Pending Fines</p>
                          <small className="text-muted">({pendingViolations.length} pending)</small>
                        </div>
                      </Card.Body>
                    </Card>
                  </Col>
                  
                  <Col md={4}>
                    <Card className="stat-card shadow-sm border-0 h-100">
                      <Card.Body className="d-flex align-items-center">
                        <div className="stat-icon-wrapper me-3" style={{
                          width: '50px', height: '50px', borderRadius: '12px',
                          background: 'rgba(25, 135, 84, 0.1)',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          color: '#198754', fontSize: '1.5rem'
                        }}>
                          <FaCheckCircle />
                        </div>
                        <div>
                          <h3 className="stat-value mb-0">₹{paidFines.toLocaleString('en-IN')}</h3>
                          <p className="stat-label text-muted mb-0">Paid Fines</p>
                          <small className="text-muted">({resolvedViolations.length} resolved)</small>
                        </div>
                      </Card.Body>
                    </Card>
                  </Col>
                </>
              )}
              
              {isAdmin && (
                <>
                  <Col md={4}>
                    <Card className="stat-card shadow-sm border-0 h-100">
                      <Card.Body className="d-flex align-items-center">
                        <div className="stat-icon-wrapper me-3" style={{
                          width: '50px', height: '50px', borderRadius: '12px',
                          background: 'rgba(255, 193, 7, 0.1)',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          color: '#ffc107', fontSize: '1.5rem'
                        }}>
                          <FaClock />
                        </div>
                        <div>
                          <h3 className="stat-value mb-0">{pendingViolations.length}</h3>
                          <p className="stat-label text-muted mb-0">Pending Cases</p>
                        </div>
                      </Card.Body>
                    </Card>
                  </Col>
                  
                  <Col md={4}>
                    <Card className="stat-card shadow-sm border-0 h-100">
                      <Card.Body className="d-flex align-items-center">
                        <div className="stat-icon-wrapper me-3" style={{
                          width: '50px', height: '50px', borderRadius: '12px',
                          background: 'rgba(25, 135, 84, 0.1)',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          color: '#198754', fontSize: '1.5rem'
                        }}>
                          <FaCheckCircle />
                        </div>
                        <div>
                          <h3 className="stat-value mb-0">{resolvedViolations.length}</h3>
                          <p className="stat-label text-muted mb-0">Resolved Cases</p>
                        </div>
                      </Card.Body>
                    </Card>
                  </Col>
                </>
              )}
            </Row>
          </Col>

          <Col lg={5}>
            <Card className="profile-info-card shadow-sm">
              <Card.Header className="bg-white">
                <h5 className="mb-0"><FaUser className="me-2" />Personal Information</h5>
              </Card.Header>
              <Card.Body>
                <div className="info-group mb-3">
                  <label className="info-label text-muted small">Username</label>
                  <p className="info-value fw-bold">{user.username || 'N/A'}</p>
                </div>
                <div className="info-group mb-3">
                  <label className="info-label text-muted small">Email</label>
                  <p className="info-value">{user.email || 'N/A'}</p>
                </div>
                <div className="info-group mb-3">
                  <label className="info-label text-muted small">Phone</label>
                  <p className="info-value">{user.phone || 'Not provided'}</p>
                </div>
                
                {!isAdmin && (
                  <div className="vehicle-section mt-4 pt-3 border-top">
                    <div className="d-flex align-items-center justify-content-between mb-3">
                      <label className="info-label mb-0 fw-bold">
                        <FaCar className="me-2" />Vehicle
                      </label>
                      {!isEditing && (
                        <Button variant="link" size="sm" onClick={() => setIsEditing(true)}>
                          <FaEdit className="me-1" /> Edit
                        </Button>
                      )}
                    </div>
                    
                    {isEditing ? (
                      <div className="vehicle-edit">
                        <Form.Group>
                          <Form.Control 
                            type="text" 
                            value={vehicleNumber} 
                            onChange={(e) => setVehicleNumber(e.target.value.toUpperCase())} 
                            placeholder="Enter vehicle number (e.g., MH02AB1234)"
                          />
                        </Form.Group>
                        <div className="d-flex gap-2 mt-3">
                          <Button variant="primary" size="sm" onClick={handleUpdateVehicle} disabled={saving}>
                            {saving ? <Spinner size="sm" className="me-1" /> : <FaSave className="me-1" />} Save
                          </Button>
                          <Button variant="outline-secondary" size="sm" onClick={() => { setIsEditing(false); setVehicleNumber(user.vehicleNumber || ''); }}>
                            <FaTimes className="me-1" /> Cancel
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <div className="vehicle-display">
                        {vehicleNumber ? (
                          <div className="p-3 bg-light rounded text-center">
                            <h4 className="mb-0 font-monospace">{vehicleNumber}</h4>
                          </div>
                        ) : (
                          <p className="text-muted">No vehicle registered</p>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </Card.Body>
            </Card>
          </Col>

          <Col lg={7}>
            <Card className="activity-card shadow-sm">
              <Card.Header className="bg-white">
                <h5 className="mb-0">
                  <FaExclamationTriangle className="me-2 text-warning" />
                  Recent Violations ({totalViolations} total)
                </h5>
              </Card.Header>
              <Card.Body>
                {violationsList.length > 0 ? (
                  <div className="violations-list">
                    {violationsList.slice(0, 10).map((violation, index) => {
                      const fineAmount = getViolationFine(violation);
                      const violationType = (violation.type || violation.violationType || 'Unknown');
                      
                      return (
                        <div key={violation._id || violation.violationId || index} 
                          className="violation-item d-flex align-items-start p-3 mb-2 border rounded">
                          <div className="violation-icon me-3 text-warning" style={{fontSize: '1.5rem'}}>
                            <FaExclamationTriangle />
                          </div>
                          <div className="violation-details flex-grow-1">
                            <div className="d-flex justify-content-between align-items-center mb-2">
                              <span className="fw-bold">
                                {violationType.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')}
                              </span>
                              <Badge bg={
                                (violation.status || 'detected').toLowerCase() === 'fined' ? 'success' : 
                                (violation.status || 'detected').toLowerCase() === 'resolved' ? 'success' : 'warning'
                              }>
                                {violation.status || 'Detected'}
                              </Badge>
                            </div>
                            <div className="d-flex flex-wrap gap-3 small text-muted">
                              <span>🚗 Vehicle: <strong>{violation.vehicleNumber || 'N/A'}</strong></span>
                              <span>📅 Date: {formatDate(violation.timestamp || violation.createdAt || violation.savedAt)}</span>
                              <span>💰 Fine: <strong className="text-danger">₹{fineAmount.toLocaleString('en-IN')}</strong></span>
                            </div>
                            {violation.isSaved && (
                              <Badge bg="info" className="mt-1" style={{fontSize: '0.7rem'}}>Saved from Detection</Badge>
                            )}
                          </div>
                        </div>
                      );
                    })}
                    {violationsList.length > 10 && (
                      <div className="text-center mt-3">
                        <small className="text-muted">+ {violationsList.length - 10} more violations</small>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="text-center py-5">
                    <FaCheckCircle style={{fontSize: '3rem', color: '#198754'}} />
                    <p className="mt-3 fw-bold">No violations found</p>
                    <p className="text-muted">Your driving record is clean!</p>
                  </div>
                )}
              </Card.Body>
            </Card>
          </Col>
        </Row>
      </Container>
    </div>
  );
};

export default Profile;