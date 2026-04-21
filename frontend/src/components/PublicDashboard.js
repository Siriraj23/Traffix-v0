import React, { useState, useEffect } from 'react';
import { 
  Container, Row, Col, Card, Button, Table, Badge, 
  Spinner, Alert, Modal
} from 'react-bootstrap';
import { useNavigate } from 'react-router-dom';
import { violationsAPI } from '../api/api';
import { 
  FaCar, FaEye, FaMoneyBillWave, 
  FaCheckCircle, FaClock, FaExclamationTriangle,
  FaDownload, FaPrint
} from 'react-icons/fa';

const PublicDashboard = () => {
  const navigate = useNavigate();

  const [violations, setViolations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [selectedViolation, setSelectedViolation] = useState(null);
  const [paymentSuccess, setPaymentSuccess] = useState(false);
  const [user, setUser] = useState({});

  // ✅ LOAD USER + THEIR VIOLATIONS
  useEffect(() => {
    const userData = JSON.parse(localStorage.getItem('user') || '{}');

    if (userData) {
      setUser(userData);
      fetchMyViolations();
    }
  }, []);

  const fetchMyViolations = async () => {
    try {
      setLoading(true);
      setError('');

      const response = await violationsAPI.getAll();

      if (response.success) {
        setViolations(response.violations || []);
      } else {
        setError('Failed to fetch violations');
        setViolations([]);
      }
    } catch (err) {
      console.error(err);
      setError('Error fetching violations');
      setViolations([]);
    } finally {
      setLoading(false);
    }
  };

  // ✅ PAYMENT
  const handlePayment = (violation) => {
    setSelectedViolation(violation);
    setShowPaymentModal(true);
  };

  const processPayment = () => {
    setPaymentSuccess(true);

    setTimeout(() => {
      setShowPaymentModal(false);
      setPaymentSuccess(false);
      alert('Payment successful! Fine has been paid.');
    }, 2000);
  };

  // ✅ HELPERS
  const getStatusBadge = (status) => {
    const colors = {
      detected: 'warning',
      fined: 'success',
      reviewed: 'info',
      appealed: 'danger'
    };
    return <Badge bg={colors[status] || 'secondary'}>{status}</Badge>;
  };

  const getTypeBadge = (type) => {
    const colors = {
      signal_violation: 'danger',
      overspeeding: 'warning',
      no_seatbelt: 'info',
      triple_riding: 'secondary',
      wrong_route: 'primary',
      no_helmet: 'dark'
    };
    return (
      <Badge bg={colors[type] || 'secondary'}>
        {type?.replace('_', ' ')}
      </Badge>
    );
  };

  const calculateTotalFine = () => {
    return violations.reduce((sum, v) => sum + (v.fineAmount || 0), 0);
  };

  const getPendingFines = () => {
    return violations.filter(v => v.status !== 'fined').length;
  };

  const getPaidFines = () => {
    return violations.filter(v => v.status === 'fined').length;
  };

  // ✅ LOADING UI
  if (loading) {
    return (
      <div className="text-center mt-5">
        <Spinner animation="border" />
        <p>Loading your violations...</p>
      </div>
    );
  }

  return (
    <Container className="py-4">

      {/* HEADER */}
      <div className="dashboard-header mb-4">
        <div className="d-flex justify-content-between align-items-center">
          <div>
            <h2>👤 Welcome, {user.username || 'User'}</h2>
            <p className="text-muted">Your traffic violations & payments</p>
          </div>
          <Button variant="outline-primary" onClick={() => navigate('/awareness')}>
            <FaEye className="me-2" /> Safety Awareness
          </Button>
        </div>
      </div>

      {/* VEHICLE INFO */}
      <Row className="mb-4">
        <Col md={8} className="mx-auto">
          <Card className="text-center">
            <Card.Body>
              <Card.Title>Your Registered Vehicle</Card.Title>
              <h4 className="text-primary mt-3">
                🚗 {user.vehicleNumber || 'Not Assigned'}
              </h4>
            </Card.Body>
          </Card>
        </Col>
      </Row>

      {error && <Alert variant="danger">{error}</Alert>}

      {/* NO DATA */}
      {violations.length === 0 && !error && (
        <Alert variant="info">
          No violations found for your vehicle.
        </Alert>
      )}

      {/* DATA */}
      {violations.length > 0 && (
        <>
          {/* STATS */}
          <Row className="mb-4">
            <Col md={4}>
              <Card className="border-danger text-center">
                <Card.Body>
                  <FaExclamationTriangle size={30} className="text-danger mb-2" />
                  <h3>{violations.length}</h3>
                  <p>Total Violations</p>
                </Card.Body>
              </Card>
            </Col>

            <Col md={4}>
              <Card className="border-warning text-center">
                <Card.Body>
                  <FaClock size={30} className="text-warning mb-2" />
                  <h3>{getPendingFines()}</h3>
                  <p>Pending</p>
                </Card.Body>
              </Card>
            </Col>

            <Col md={4}>
              <Card className="border-success text-center">
                <Card.Body>
                  <FaCheckCircle size={30} className="text-success mb-2" />
                  <h3>₹{calculateTotalFine().toLocaleString()}</h3>
                  <p>Total Fine</p>
                </Card.Body>
              </Card>
            </Col>
          </Row>

          {/* TABLE */}
          <Card>
            <Card.Body>
              <Card.Title>Your Violations</Card.Title>

              <div className="table-responsive mt-3">
                <Table hover>
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Type</th>
                      <th>Location</th>
                      <th>Fine</th>
                      <th>Status</th>
                      <th>Action</th>
                    </tr>
                  </thead>

                  <tbody>
                    {violations.map((v) => (
                      <tr key={v._id}>
                        <td>{new Date(v.timestamp).toLocaleDateString()}</td>
                        <td>{getTypeBadge(v.type)}</td>
                        <td>{v.location?.address || 'N/A'}</td>
                        <td className="text-danger fw-bold">
                          ₹{v.fineAmount?.toLocaleString()}
                        </td>
                        <td>{getStatusBadge(v.status)}</td>
                        <td>
                          {v.status !== 'fined' ? (
                            <Button 
                              size="sm" 
                              variant="success"
                              onClick={() => handlePayment(v)}
                            >
                              <FaMoneyBillWave /> Pay
                            </Button>
                          ) : (
                            <Badge bg="success">Paid</Badge>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </Table>
              </div>
            </Card.Body>
          </Card>
        </>
      )}

      {/* PAYMENT MODAL */}
      <Modal show={showPaymentModal} onHide={() => setShowPaymentModal(false)} centered>
        <Modal.Header closeButton>
          <Modal.Title>Pay Fine</Modal.Title>
        </Modal.Header>

        <Modal.Body>
          {!paymentSuccess ? (
            <>
              <h5 className="text-center mb-3">Fine Details</h5>

              <p><strong>Violation:</strong> {selectedViolation?.type}</p>
              <p><strong>Vehicle:</strong> {selectedViolation?.vehicleNumber}</p>
              <p className="text-danger">
                <strong>Amount:</strong> ₹{selectedViolation?.fineAmount}
              </p>

              <Button className="w-100" variant="success" onClick={processPayment}>
                Pay Now
              </Button>
            </>
          ) : (
            <div className="text-center">
              <FaCheckCircle size={60} className="text-success mb-3" />
              <h5>Payment Successful!</h5>
            </div>
          )}
        </Modal.Body>
      </Modal>

    </Container>
  );
};

export default PublicDashboard;