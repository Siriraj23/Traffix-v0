import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Card, Button, Spinner, Alert, Row, Col, Badge, Container } from 'react-bootstrap';
import { violationsAPI } from '../api/api';

const ViolationChallan = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [violation, setViolation] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const fetchViolation = async () => {
      setLoading(true);
      setError('');
      try {
        const response = await violationsAPI.getById(id);
        if (response.success) {
          const violationData = { ...response };
          delete violationData.success;
          setViolation(violationData);
        } else {
          setError(response.error || 'Violation not found');
        }
      } catch (err) {
        setError(err.message || 'Failed to load violation');
      } finally {
        setLoading(false);
      }
    };

    fetchViolation();
  }, [id]);

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(amount || 0);
  };

  const formatDate = (dateString) => {
    if (!dateString) return 'N/A';
    try {
      const date = new Date(dateString);
      return date.toLocaleDateString() + ' ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } catch (e) {
      return dateString;
    }
  };

  const calculateDueDate = () => {
    if (!violation?.timestamp) return 'N/A';
    const date = new Date(violation.timestamp);
    date.setDate(date.getDate() + 15);
    return date.toLocaleDateString();
  };

  const printChallan = () => {
    window.print();
  };

  const downloadChallan = () => {
    if (!violation) return;

    const content = `TraffiX Traffic Violation Challan\n\n` +
      `Challan ID: ${violation.violationId || violation._id}\n` +
      `Violation Type: ${formatType(violation.type)}\n` +
      `Vehicle Number: ${violation.vehicleNumber || 'N/A'}\n` +
      `Vehicle Type: ${violation.vehicleType || 'N/A'}\n` +
      `Location: ${violation.location?.address || 'N/A'}\n` +
      `Date: ${formatDate(violation.timestamp || violation.createdAt)}\n` +
      `Status: ${violation.status || 'N/A'}\n` +
      `Fine Amount: ${formatCurrency(violation.fineAmount)}\n` +
      `Due Date: ${calculateDueDate()}\n\n` +
      `Description: ${violation.description || 'N/A'}\n`;

    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `challan_${violation.violationId || violation._id}.txt`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const formatType = (type) => {
    if (!type) return 'Unknown';
    return type.split('_').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
  };

  if (loading) {
    return (
      <div className="text-center mt-5">
        <Spinner animation="border" variant="primary" />
        <p className="mt-3">Loading challan...</p>
      </div>
    );
  }

  if (error) {
    return (
      <Container className="py-4">
        <Alert variant="danger">{error}</Alert>
        <Button variant="secondary" onClick={() => navigate('/violations')}>Back to Violations</Button>
      </Container>
    );
  }

  return (
    <Container className="py-4">
      <Card className="shadow-sm">
        <Card.Body>
          <div className="d-flex justify-content-between align-items-start mb-4">
            <div>
              <h3>Traffic Violation Challan</h3>
              <p className="text-muted mb-0">Challan for official traffic enforcement</p>
            </div>
            <div className="d-flex gap-2">
              <Button variant="outline-primary" onClick={printChallan}>Print Challan</Button>
              <Button variant="outline-secondary" onClick={downloadChallan}>Download Challan</Button>
            </div>
          </div>

          <Row className="mb-4">
            <Col md={6}>
              <Card className="mb-3">
                <Card.Body>
                  <Card.Title>Violation Info</Card.Title>
                  <p><strong>Challan ID:</strong> {violation.violationId || violation._id}</p>
                  <p><strong>Violation Type:</strong> {formatType(violation.type)}</p>
                  <p><strong>Status:</strong> <Badge bg={violation.status === 'fined' ? 'success' : 'warning'}>{violation.status || 'N/A'}</Badge></p>
                  <p><strong>Date:</strong> {formatDate(violation.timestamp || violation.createdAt)}</p>
                </Card.Body>
              </Card>
            </Col>
            <Col md={6}>
              <Card className="mb-3">
                <Card.Body>
                  <Card.Title>Vehicle Details</Card.Title>
                  <p><strong>Vehicle Number:</strong> {violation.vehicleNumber || 'N/A'}</p>
                  <p><strong>Vehicle Type:</strong> {violation.vehicleType || 'N/A'}</p>
                  <p><strong>Location:</strong> {violation.location?.address || 'N/A'}</p>
                  <p><strong>Due Date:</strong> {calculateDueDate()}</p>
                </Card.Body>
              </Card>
            </Col>
          </Row>

          <Row>
            <Col md={12}>
              <Card className="mb-3">
                <Card.Body>
                  <Card.Title>Fine Summary</Card.Title>
                  <p><strong>Fine Amount:</strong> {formatCurrency(violation.fineAmount)}</p>
                  <p><strong>Description:</strong> {violation.description || 'Traffic violation recorded by system'}</p>
                </Card.Body>
              </Card>
            </Col>
          </Row>

          {violation.evidenceImages?.length > 0 && (
            <Card className="mb-3">
              <Card.Body>
                <Card.Title>Evidence</Card.Title>
                <div className="d-flex flex-wrap gap-3">
                  {violation.evidenceImages.map((src, index) => (
                    <Card key={index} style={{ width: '150px' }}>
                      <Card.Img src={src.startsWith('http') ? src : `/${src}`} alt={`Evidence ${index + 1}`} />
                      <Card.Body className="p-2">
                        <small className="text-muted">Evidence {index + 1}</small>
                      </Card.Body>
                    </Card>
                  ))}
                </div>
              </Card.Body>
            </Card>
          )}

          <div className="d-flex justify-content-between">
            <Button variant="secondary" onClick={() => navigate('/violations')}>Back to Violations</Button>
            <Button variant="primary" onClick={printChallan}>Print Challan</Button>
          </div>
        </Card.Body>
      </Card>
    </Container>
  );
};

export default ViolationChallan;
