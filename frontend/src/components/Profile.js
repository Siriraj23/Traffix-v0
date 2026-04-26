import React, { useEffect, useState, useCallback } from 'react';
import { Container, Row, Col, Card, Button, Form, Spinner, Badge } from 'react-bootstrap';
import { FaUser, FaCar, FaExclamationTriangle, FaCheckCircle, FaClock, FaEdit, FaSave } from 'react-icons/fa';
import { violationsAPI } from '../api/api';
import { getFineAmount } from '../utils/trafficFines';
import './Profile.css';

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
      console.log('📊 Fetching all violations for profile...');
      
      const response = await violationsAPI.getAllWithoutPagination();

      if (response.success) {
        let allViolations = response.violations || [];
        
        console.log(`📊 Total violations fetched: ${allViolations.length}`);

        if (!isAdmin && vehicleNo) {
          allViolations = allViolations.filter(
            v => v.vehicleNumber === vehicleNo
          );
          console.log(`📊 Filtered for vehicle ${vehicleNo}: ${allViolations.length} violations`);
        }

        setViolations(allViolations);
        
        if (allViolations.length > 0) {
          console.log('📊 Sample violation:', allViolations[0]);
        }
      } else {
        console.error('❌ Failed to fetch violations:', response.error);
        setViolations([]);
      }
    } catch (err) {
      console.error('❌ Error fetching violations:', err);
      setViolations([]);
    }
  }, [isAdmin]);

  useEffect(() => {
    const userData = JSON.parse(localStorage.getItem('user'));

    if (userData) {
      setUser(userData);
      setVehicleNumber(userData.vehicleNumber || '');
      fetchUserViolations(userData.vehicleNumber);
    }
    setLoading(false);
  }, [fetchUserViolations]);

  const handleUpdateVehicle = () => {
    if (!vehicleNumber.trim()) {
      alert("Please enter vehicle number");
      return;
    }

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
    if (violation.fineAmount) return violation.fineAmount;
    if (violation.fine) return violation.fine;
    if (violation.amount) return violation.amount;
    
    const violationType = violation.type || violation.violationType;
    return getFineAmount(violationType);
  };

  const totalViolations = violations.length;
  
  const pendingViolations = violations.filter(v => {
    const status = (v.status || '').toLowerCase();
    return status !== 'fined' && status !== 'paid' && status !== 'resolved';
  });
  
  const resolvedViolations = violations.filter(v => {
    const status = (v.status || '').toLowerCase();
    return status === 'fined' || status === 'paid' || status === 'resolved';
  });

  const pendingFines = isAdmin
    ? 0
    : pendingViolations.reduce((sum, v) => sum + getViolationFine(v), 0);

  const paidFines = isAdmin
    ? 0
    : resolvedViolations.reduce((sum, v) => sum + getViolationFine(v), 0);

  console.log('📊 Profile Stats:', {
    totalViolations,
    pendingCount: pendingViolations.length,
    resolvedCount: resolvedViolations.length,
    pendingFines,
    paidFines
  });

  const formatDate = (dateString) => {
    if (!dateString) return 'N/A';
    try {
      return new Date(dateString).toLocaleDateString('en-IN', {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
      });
    } catch (e) {
      return dateString;
    }
  };

  if (loading) {
    return (
      <div className="profile-loading">
        <Spinner animation="border" variant="primary" />
        <p>Loading profile...</p>
      </div>
    );
  }

  return (
    <div className="profile-page">
      <Container fluid className="py-4">
        <div className="profile-header mb-4">
          <div className="d-flex align-items-center">
            <div className="profile-avatar">
              {user.username?.charAt(0).toUpperCase()}
            </div>
            <div className="ms-3">
              <h2 className="profile-title mb-0">
                {isAdmin ? 'Administrator Dashboard' : `Welcome back, ${user.username}`}
              </h2>
              <p className="profile-subtitle mb-0">
                {isAdmin ? 'System Management & Overview' : 'Manage your profile and track violations'}
              </p>
            </div>
          </div>
          <Badge 
            bg={isAdmin ? 'danger' : 'primary'} 
            className="role-badge"
          >
            {isAdmin ? 'Administrator' : 'Citizen User'}
          </Badge>
        </div>

        <Row className="g-4">
          <Col lg={12}>
            <Row className="g-3">
              <Col md={4}>
                <Card className="stat-card">
                  <Card.Body>
                    <div className="stat-icon-wrapper blue">
                      <FaExclamationTriangle />
                    </div>
                    <div className="stat-content">
                      <h3 className="stat-value">{totalViolations}</h3>
                      <p className="stat-label">Total Violations</p>
                    </div>
                  </Card.Body>
                </Card>
              </Col>

              {!isAdmin && (
                <>
                  <Col md={4}>
                    <Card className="stat-card">
                      <Card.Body>
                        <div className="stat-icon-wrapper orange">
                          <FaClock />
                        </div>
                        <div className="stat-content">
                          <h3 className="stat-value">₹{pendingFines.toLocaleString()}</h3>
                          <p className="stat-label">Pending Fines</p>
                          <small className="text-muted">
                            ({pendingViolations.length} pending)
                          </small>
                        </div>
                      </Card.Body>
                    </Card>
                  </Col>

                  <Col md={4}>
                    <Card className="stat-card">
                      <Card.Body>
                        <div className="stat-icon-wrapper green">
                          <FaCheckCircle />
                        </div>
                        <div className="stat-content">
                          <h3 className="stat-value">₹{paidFines.toLocaleString()}</h3>
                          <p className="stat-label">Paid Fines</p>
                          <small className="text-muted">
                            ({resolvedViolations.length} resolved)
                          </small>
                        </div>
                      </Card.Body>
                    </Card>
                  </Col>
                </>
              )}

              {isAdmin && (
                <>
                  <Col md={4}>
                    <Card className="stat-card">
                      <Card.Body>
                        <div className="stat-icon-wrapper orange">
                          <FaClock />
                        </div>
                        <div className="stat-content">
                          <h3 className="stat-value">{pendingViolations.length}</h3>
                          <p className="stat-label">Pending Cases</p>
                        </div>
                      </Card.Body>
                    </Card>
                  </Col>

                  <Col md={4}>
                    <Card className="stat-card">
                      <Card.Body>
                        <div className="stat-icon-wrapper green">
                          <FaCheckCircle />
                        </div>
                        <div className="stat-content">
                          <h3 className="stat-value">{resolvedViolations.length}</h3>
                          <p className="stat-label">Resolved Cases</p>
                        </div>
                      </Card.Body>
                    </Card>
                  </Col>
                </>
              )}
            </Row>
          </Col>

          <Col lg={5}>
            <Card className="profile-info-card">
              <Card.Header className="card-header-custom">
                <h5 className="mb-0">
                  <FaUser className="me-2" />
                  Personal Information
                </h5>
              </Card.Header>
              <Card.Body>
                <div className="info-group">
                  <label className="info-label">Username</label>
                  <p className="info-value">{user.username}</p>
                </div>

                <div className="info-group">
                  <label className="info-label">Email Address</label>
                  <p className="info-value">{user.email}</p>
                </div>

                <div className="info-group">
                  <label className="info-label">Phone Number</label>
                  <p className="info-value">{user.phone || 'Not provided'}</p>
                </div>

                {!isAdmin && (
                  <div className="vehicle-section mt-4">
                    <div className="d-flex align-items-center justify-content-between mb-3">
                      <label className="info-label mb-0">
                        <FaCar className="me-2" />
                        Registered Vehicle
                      </label>
                      {!isEditing && (
                        <Button 
                          variant="link" 
                          className="edit-btn p-0"
                          onClick={() => setIsEditing(true)}
                        >
                          <FaEdit /> Edit
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
                            placeholder="Enter vehicle number (e.g., TN01AB1234)"
                            className="vehicle-input"
                          />
                          <div className="input-hint">
                            Format: State Code + District + Series + Number
                          </div>
                        </Form.Group>
                        <div className="button-group mt-3">
                          <Button
                            variant="primary"
                            onClick={handleUpdateVehicle}
                            disabled={saving}
                            className="save-btn"
                          >
                            {saving ? (
                              <>
                                <Spinner size="sm" animation="border" className="me-2" />
                                Saving...
                              </>
                            ) : (
                              <>
                                <FaSave className="me-2" />
                                Save Changes
                              </>
                            )}
                          </Button>
                          <Button
                            variant="outline-secondary"
                            onClick={() => {
                              setIsEditing(false);
                              setVehicleNumber(user.vehicleNumber || '');
                            }}
                            className="cancel-btn"
                          >
                            Cancel
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <div className="vehicle-display">
                        {vehicleNumber ? (
                          <div className="vehicle-number-badge">
                            {vehicleNumber}
                          </div>
                        ) : (
                          <p className="text-muted">No vehicle registered</p>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {isAdmin && (
                  <div className="admin-note mt-4">
                    <div className="info-message">
                      <FaCheckCircle className="me-2 text-success" />
                      Administrator accounts have full system access and management capabilities.
                    </div>
                  </div>
                )}
              </Card.Body>
            </Card>
          </Col>

          <Col lg={7}>
            <Card className="activity-card">
              <Card.Header className="card-header-custom">
                <h5 className="mb-0">
                  <FaExclamationTriangle className="me-2" />
                  Recent Violations ({totalViolations} total)
                </h5>
              </Card.Header>
              <Card.Body>
                {violations.length > 0 ? (
                  <div className="violations-list">
                    {violations.slice(0, 10).map((violation, index) => {
                      const fineAmount = getViolationFine(violation);
                      const violationType = violation.type || violation.violationType || 'Unknown';
                      const status = (violation.status || 'pending').toLowerCase();
                      
                      return (
                        <div key={index} className="violation-item">
                          <div className="violation-icon">
                            <FaExclamationTriangle />
                          </div>
                          <div className="violation-details">
                            <div className="violation-header">
                              <span className="violation-type">
                                {violationType.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')}
                              </span>
                              <Badge 
                                bg={status === 'fined' || status === 'paid' ? 'success' : 'warning'}
                                className="status-badge"
                              >
                                {violation.status || 'Pending'}
                              </Badge>
                            </div>
                            <div className="violation-meta">
                              <span>Vehicle: {violation.vehicleNumber}</span>
                              <span>Date: {formatDate(violation.timestamp || violation.createdAt || violation.date)}</span>
                              <span>Fine: ₹{fineAmount.toLocaleString()}</span>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                    {violations.length > 10 && (
                      <div className="text-center mt-3">
                        <small className="text-muted">
                          + {violations.length - 10} more violations
                        </small>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="empty-state">
                    <FaCheckCircle className="empty-icon" />
                    <p className="empty-text">No violations found</p>
                    <p className="empty-subtext">Your driving record is clean!</p>
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