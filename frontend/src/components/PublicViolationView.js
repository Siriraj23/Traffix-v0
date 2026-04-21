import React, { useState } from 'react';
import { Container, Row, Col, Card, Form, Button, Table, Badge, Alert } from 'react-bootstrap';
import { violationsAPI } from '../api/api';

const PublicViolationView = () => {
  const [vehicleNumber, setVehicleNumber] = useState('');
  const [violations, setViolations] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [searched, setSearched] = useState(false);

  const searchViolations = async (e) => {
    e.preventDefault(); // ✅ prevent form reload

    if (!vehicleNumber.trim()) {
      setError('Please enter vehicle number');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const formattedVehicle = vehicleNumber.trim().toUpperCase();

      const response = await violationsAPI.getAll({
        vehicleNumber: formattedVehicle,
        limit: 50
      });

      if (response.success) {
        setViolations(response.violations || []);
      } else {
        setError('Failed to fetch violations');
        setViolations([]);
      }

    } catch (err) {
      console.error(err);
      setError('Error searching violations');
      setViolations([]);
    } finally {
      setLoading(false);
      setSearched(true);
    }
  };

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
    return <Badge bg={colors[type] || 'secondary'}>{type?.replace('_', ' ')}</Badge>;
  };

  const calculateTotalFine = () => {
    return violations.reduce((sum, v) => sum + (v.fineAmount || 0), 0);
  };

  return (
    <Container>
      <h2 className="mb-4">🚗 Check Your Violations</h2>

      <Row className="mb-4">
        <Col md={8} className="mx-auto">
          <Card>
            <Card.Body>
              <Card.Title>Enter Your Vehicle Number</Card.Title>

              {/* ✅ FIX: form submit handling */}
              <Form onSubmit={searchViolations}>
                <Form.Group className="mb-3">
                  <Form.Control
                    type="text"
                    placeholder="e.g., MH12AB1234"
                    value={vehicleNumber}
                    onChange={(e) => setVehicleNumber(e.target.value.toUpperCase())}
                  />
                  <Form.Text className="text-muted">
                    Enter your vehicle registration number to check violations
                  </Form.Text>
                </Form.Group>

                <Button
                  type="submit"
                  variant="primary"
                  disabled={loading}
                  className="w-100"
                >
                  {loading ? 'Searching...' : 'Search Violations'}
                </Button>
              </Form>

            </Card.Body>
          </Card>
        </Col>
      </Row>

      {error && <Alert variant="danger">{error}</Alert>}

      {searched && violations.length === 0 && !error && (
        <Alert variant="info">
          No violations found for vehicle number: {vehicleNumber}
        </Alert>
      )}

      {violations.length > 0 && (
        <>
          <Row className="mb-4">
            <Col md={4}>
              <Card className="text-center bg-warning">
                <Card.Body>
                  <h5>Total Violations</h5>
                  <h2>{violations.length}</h2>
                </Card.Body>
              </Card>
            </Col>

            <Col md={4}>
              <Card className="text-center bg-danger text-white">
                <Card.Body>
                  <h5>Total Fine</h5>
                  <h2>₹{calculateTotalFine().toLocaleString()}</h2>
                </Card.Body>
              </Card>
            </Col>

            <Col md={4}>
              <Card className="text-center bg-success text-white">
                <Card.Body>
                  <h5>Vehicle Number</h5>
                  <h4>{vehicleNumber}</h4>
                </Card.Body>
              </Card>
            </Col>
          </Row>

          <Card>
            <Card.Body>
              <Card.Title>Your Violation History</Card.Title>

              <div className="table-responsive">
                <Table striped hover>
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Violation Type</th>
                      <th>Location</th>
                      <th>Fine Amount</th>
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
                        <td>₹{v.fineAmount?.toLocaleString()}</td>
                        <td>{getStatusBadge(v.status)}</td>
                        <td>
                          {v.status !== 'fined' ? (
                            <Button size="sm" variant="success">
                              Pay Fine
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
    </Container>
  );
};

export default PublicViolationView;