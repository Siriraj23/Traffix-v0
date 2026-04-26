import React, { useEffect, useState, useCallback } from 'react';
import { Container, Row, Col, Card, Button, Form, Spinner, Badge } from 'react-bootstrap';
import { FaUser, FaCar, FaExclamationTriangle, FaCheckCircle, FaClock, FaEdit, FaSave } from 'react-icons/fa';
import { violationsAPI } from '../api/api';
import { getFineAmount } from '../utils/trafficFines';
import './Profile.css';

// ONLY read SAVED violations (confirmed AND saved)
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

  const fetchUserViolations = useCallback(async (vehicleNo) => {
    try {
      let allViolations = [];
      
      // Try API first
      try {
        const response = await violationsAPI.getAll({ limit: 100 });
        if (response && response.success) {
          allViolations = ensureArray(response.violations || response.data);
        }
      } catch (apiErr) {
        console.warn('API fetch failed');
      }
      
      // Add SAVED violations from localStorage
      try {
        const savedViolations = JSON.parse(localStorage.getItem(SAVED_VIOLATIONS_KEY) || '[]');
        const localSaved = ensureArray(savedViolations);
        
        localSaved.forEach(v => {
          const exists = allViolations.find(av => 
            av.vehicleNumber === v.vehicleNumber && av.type === v.type
          );
          if (!exists) {
            allViolations.push({
              ...v,
              vehicleNumber: v.vehicleNumber || v.violationData?.vehicleNumber || 'Unknown',
              type: v.type || v.violationData?.type || 'Unknown',
              fineAmount: v.fineAmount || v.violationData?.fineAmount || 1000,
              confidence: v.confidence || 0.85,
              status: v.status || 'detected',
              timestamp: v.savedAt || v.timestamp || new Date().toISOString(),
              isSaved: true
            });
          }
        });
      } catch (localErr) {}
      
      // Filter for non-admin
      if (!isAdmin && vehicleNo) {
        allViolations = allViolations.filter(v => v.vehicleNumber === vehicleNo);
      }
      
      setViolations(allViolations);
    } catch (err) {
      setViolations([]);
    }
  }, [isAdmin]);

  useEffect(() => {
    const userData = JSON.parse(localStorage.getItem('user') || '{}');
    if (userData) {
      setUser(userData);
      setVehicleNumber(userData.vehicleNumber || '');
      fetchUserViolations(userData.vehicleNumber);
    }
    setLoading(false);
  }, [fetchUserViolations]);

  // Listen for NEW SAVED violations
  useEffect(() => {
    const handler = () => {
      const userData = JSON.parse(localStorage.getItem('user') || '{}');
      if (userData) fetchUserViolations(userData.vehicleNumber);
    };
    window.addEventListener('violationSaved', handler);
    window.addEventListener('violationsBatchSaved', handler);
    return () => {
      window.removeEventListener('violationSaved', handler);
      window.removeEventListener('violationsBatchSaved', handler);
    };
  }, [fetchUserViolations]);

  const handleUpdateVehicle = () => {
    if (!vehicleNumber.trim()) { alert("Please enter vehicle number"); return; }
    setSaving(true);
    setTimeout(() => {
      const updatedUser = { ...user, vehicleNumber };
      localStorage.setItem('user', JSON.stringify(updatedUser));
      setUser(updatedUser);
      fetchUserViolations(vehicleNumber);
      setSaving(false);
      setIsEditing(false);
      alert("Vehicle number updated successfully!");
    }, 500);
  };

  const getViolationFine = (violation) => {
    if (!violation) return 0;
    return violation.fineAmount || violation.fine || violation.violationData?.fineAmount || violation.fine_amount || 0;
  };

  const violationsList = ensureArray(violations);
  const totalViolations = violationsList.length;
  const pendingViolations = violationsList.filter(v => (v.status || '').toLowerCase() !== 'fined' && (v.status || '').toLowerCase() !== 'paid' && (v.status || '').toLowerCase() !== 'resolved');
  const resolvedViolations = violationsList.filter(v => (v.status || '').toLowerCase() === 'fined' || (v.status || '').toLowerCase() === 'paid' || (v.status || '').toLowerCase() === 'resolved');
  const pendingFines = isAdmin ? 0 : pendingViolations.reduce((sum, v) => sum + getViolationFine(v), 0);
  const paidFines = isAdmin ? 0 : resolvedViolations.reduce((sum, v) => sum + getViolationFine(v), 0);

  const formatDate = (dateString) => {
    if (!dateString) return 'N/A';
    try { return new Date(dateString).toLocaleDateString('en-IN', { year: 'numeric', month: 'short', day: 'numeric' }); }
    catch (e) { return dateString; }
  };

  if (loading) return <div className="profile-loading"><Spinner animation="border" variant="primary" /><p>Loading profile...</p></div>;

  return (
    <div className="profile-page">
      <Container fluid className="py-4">
        <div className="profile-header mb-4">
          <div className="d-flex align-items-center">
            <div className="profile-avatar">{user.username?.charAt(0).toUpperCase() || 'U'}</div>
            <div className="ms-3">
              <h2 className="profile-title mb-0">{isAdmin ? 'Administrator Dashboard' : `Welcome back, ${user.username || 'User'}`}</h2>
              <p className="profile-subtitle mb-0">{isAdmin ? 'System Management & Overview' : 'Manage your profile and track violations'}</p>
            </div>
          </div>
          <Badge bg={isAdmin ? 'danger' : 'primary'} className="role-badge">{isAdmin ? 'Administrator' : 'Citizen User'}</Badge>
        </div>

        <Row className="g-4">
          <Col lg={12}>
            <Row className="g-3">
              <Col md={4}><Card className="stat-card"><Card.Body><div className="stat-icon-wrapper blue"><FaExclamationTriangle /></div><div className="stat-content"><h3 className="stat-value">{totalViolations}</h3><p className="stat-label">Total Violations</p></div></Card.Body></Card></Col>
              {!isAdmin && <><Col md={4}><Card className="stat-card"><Card.Body><div className="stat-icon-wrapper orange"><FaClock /></div><div className="stat-content"><h3 className="stat-value">₹{pendingFines.toLocaleString()}</h3><p className="stat-label">Pending Fines</p><small>({pendingViolations.length} pending)</small></div></Card.Body></Card></Col>
              <Col md={4}><Card className="stat-card"><Card.Body><div className="stat-icon-wrapper green"><FaCheckCircle /></div><div className="stat-content"><h3 className="stat-value">₹{paidFines.toLocaleString()}</h3><p className="stat-label">Paid Fines</p><small>({resolvedViolations.length} resolved)</small></div></Card.Body></Card></Col></>}
              {isAdmin && <><Col md={4}><Card className="stat-card"><Card.Body><div className="stat-icon-wrapper orange"><FaClock /></div><div className="stat-content"><h3 className="stat-value">{pendingViolations.length}</h3><p className="stat-label">Pending Cases</p></div></Card.Body></Card></Col>
              <Col md={4}><Card className="stat-card"><Card.Body><div className="stat-icon-wrapper green"><FaCheckCircle /></div><div className="stat-content"><h3 className="stat-value">{resolvedViolations.length}</h3><p className="stat-label">Resolved Cases</p></div></Card.Body></Card></Col></>}
            </Row>
          </Col>

          <Col lg={5}>
            <Card className="profile-info-card">
              <Card.Header className="card-header-custom"><h5 className="mb-0"><FaUser className="me-2" />Personal Information</h5></Card.Header>
              <Card.Body>
                <div className="info-group"><label className="info-label">Username</label><p className="info-value">{user.username || 'N/A'}</p></div>
                <div className="info-group"><label className="info-label">Email</label><p className="info-value">{user.email || 'N/A'}</p></div>
                <div className="info-group"><label className="info-label">Phone</label><p className="info-value">{user.phone || 'Not provided'}</p></div>
                {!isAdmin && <div className="vehicle-section mt-4">
                  <div className="d-flex align-items-center justify-content-between mb-3"><label className="info-label mb-0"><FaCar className="me-2" />Vehicle</label>{!isEditing && <Button variant="link" onClick={() => setIsEditing(true)}><FaEdit /> Edit</Button>}</div>
                  {isEditing ? <div className="vehicle-edit"><Form.Group><Form.Control type="text" value={vehicleNumber} onChange={(e) => setVehicleNumber(e.target.value.toUpperCase())} placeholder="Enter vehicle number" className="vehicle-input" /></Form.Group>
                    <div className="button-group mt-3"><Button variant="primary" onClick={handleUpdateVehicle} disabled={saving}>{saving ? <Spinner size="sm" /> : <><FaSave /> Save</>}</Button><Button variant="outline-secondary" onClick={() => { setIsEditing(false); setVehicleNumber(user.vehicleNumber || ''); }}>Cancel</Button></div></div>
                    : <div className="vehicle-display">{vehicleNumber ? <div className="vehicle-number-badge">{vehicleNumber}</div> : <p className="text-muted">No vehicle registered</p>}</div>}
                </div>}
              </Card.Body>
            </Card>
          </Col>

          <Col lg={7}>
            <Card className="activity-card">
              <Card.Header className="card-header-custom"><h5 className="mb-0"><FaExclamationTriangle className="me-2" />Recent Violations ({totalViolations} total)</h5></Card.Header>
              <Card.Body>
                {violationsList.length > 0 ? <div className="violations-list">
                  {violationsList.slice(0, 10).map((violation, index) => {
                    const fineAmount = getViolationFine(violation);
                    const violationType = (violation.type || violation.violationType || 'Unknown');
                    return (
                      <div key={index} className="violation-item">
                        <div className="violation-icon"><FaExclamationTriangle /></div>
                        <div className="violation-details">
                          <div className="violation-header">
                            <span className="violation-type">{violationType.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')}</span>
                            <Badge bg={(violation.status || 'detected').toLowerCase() === 'fined' ? 'success' : 'warning'} className="status-badge">{violation.status || 'Detected'}</Badge>
                          </div>
                          <div className="violation-meta">
                            <span>Vehicle: {violation.vehicleNumber || 'N/A'}</span>
                            <span>Date: {formatDate(violation.timestamp || violation.createdAt || violation.savedAt)}</span>
                            <span>Fine: ₹{fineAmount.toLocaleString()}</span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                  {violationsList.length > 10 && <div className="text-center mt-3"><small className="text-muted">+ {violationsList.length - 10} more</small></div>}
                </div> : <div className="empty-state"><FaCheckCircle className="empty-icon" /><p className="empty-text">No violations found</p><p className="empty-subtext">Your driving record is clean!</p></div>}
              </Card.Body>
            </Card>
          </Col>
        </Row>
      </Container>
    </div>
  );
};

export default Profile;