import React, { useEffect, useState } from 'react';
import { Container, Row, Col, Card, Button, Form } from 'react-bootstrap';
import { violationsAPI } from '../api/api';

const Profile = () => {
  const [user, setUser] = useState({});
  const [violations, setViolations] = useState([]);
  const [vehicleNumber, setVehicleNumber] = useState('');
  const [saving, setSaving] = useState(false);

  const userRole = localStorage.getItem('userRole');
  const isAdmin = userRole === 'admin';

  useEffect(() => {
    const userData = JSON.parse(localStorage.getItem('user'));

    if (userData) {
      setUser(userData);
      setVehicleNumber(userData.vehicleNumber || '');
      fetchUserViolations(userData.vehicleNumber);
    }
  }, []);

  // ✅ FETCH ONLY USER VEHICLE VIOLATIONS
  const fetchUserViolations = async (vehicleNo) => {
    try {
      const response = await violationsAPI.getAll();

      if (response.success) {
        let allViolations = response.violations || [];

        // 🔥 FILTER FOR PUBLIC USER
        if (!isAdmin && vehicleNo) {
          allViolations = allViolations.filter(
            v => v.vehicleNumber === vehicleNo
          );
        }

        setViolations(allViolations);
      } else {
        setViolations([]);
      }
    } catch (err) {
      console.error('Error fetching violations:', err);
      setViolations([]);
    }
  };

  // ✅ UPDATE VEHICLE NUMBER
  const handleUpdateVehicle = () => {
    if (!vehicleNumber.trim()) {
      alert("Please enter vehicle number");
      return;
    }

    setSaving(true);

    // Simulate save (or replace with backend API)
    setTimeout(() => {
      const updatedUser = { ...user, vehicleNumber };
      localStorage.setItem('user', JSON.stringify(updatedUser));
      setUser(updatedUser);

      // 🔥 REFETCH violations
      fetchUserViolations(vehicleNumber);

      setSaving(false);
      alert("Vehicle number updated!");
    }, 500);
  };

  // ✅ CALCULATIONS
  const totalViolations = violations.length;

  const pendingFines = isAdmin
    ? 0
    : violations
        .filter(v => v.status !== 'fined')
        .reduce((sum, v) => sum + (v.fineAmount || 0), 0);

  const paidFines = isAdmin
    ? 0
    : violations
        .filter(v => v.status === 'fined')
        .reduce((sum, v) => sum + (v.fineAmount || 0), 0);

  return (
    <Container className="py-4">
      <h2 className="mb-4">
        {isAdmin ? '👮 Admin Profile' : '👤 My Profile'}
      </h2>

      <Row>
        {/* LEFT CARD */}
        <Col md={4}>
          <Card className="text-center p-4 shadow">
            <h4>{user.username}</h4>
            <p className="text-muted">{user.email}</p>

            <span
              className={`badge mb-3 ${
                isAdmin ? 'bg-danger' : 'bg-info'
              }`}
            >
              {isAdmin ? '👮 Admin' : '👤 Public User'}
            </span>

            <hr />

            <h3>{totalViolations}</h3>
            <p>Total Violations</p>

            {!isAdmin && (
              <>
                <p className="text-danger fw-bold">
                  ₹{pendingFines.toLocaleString()}
                </p>
                <p>Pending Fines</p>

                <p className="text-success fw-bold">
                  ₹{paidFines.toLocaleString()}
                </p>
                <p>Paid Fines</p>
              </>
            )}

            {isAdmin && (
              <p className="text-muted">
                Admins can view and manage all violations
              </p>
            )}
          </Card>
        </Col>

        {/* RIGHT CARD */}
        <Col md={8}>
          <Card className="p-4 shadow">
            <h5 className="mb-3">Personal Information</h5>

            <p><strong>Username:</strong> {user.username}</p>
            <p><strong>Email:</strong> {user.email}</p>
            <p><strong>Phone:</strong> {user.phone || 'N/A'}</p>

            {/* 🔥 PUBLIC USER VEHICLE INPUT */}
            {!isAdmin && (
              <>
                <Form.Group className="mt-3">
                  <Form.Label><strong>Vehicle Number</strong></Form.Label>
                  <Form.Control
                    type="text"
                    value={vehicleNumber}
                    onChange={(e) => setVehicleNumber(e.target.value.toUpperCase())}
                    placeholder="Enter vehicle number (e.g. TN01AB1234)"
                  />
                </Form.Group>

                <Button
                  className="mt-2"
                  onClick={handleUpdateVehicle}
                  disabled={saving}
                >
                  {saving ? "Saving..." : "Update Vehicle"}
                </Button>
              </>
            )}

            {isAdmin && (
              <p className="text-muted">
                Vehicle information not applicable for admin
              </p>
            )}
          </Card>
        </Col>
      </Row>
    </Container>
  );
};

export default Profile;