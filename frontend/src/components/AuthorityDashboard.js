import React, { useState, useEffect } from 'react';
import { 
  Container, Row, Col, Card, Button, Table, Badge, 
  Spinner, Alert, ProgressBar, Nav, Tab 
} from 'react-bootstrap';
import { useNavigate } from 'react-router-dom';
import { dashboardAPI } from '../api/api';
import { 
  FaCar, FaMoneyBillWave, FaCamera, 
  FaChartLine, FaExclamationTriangle,
  FaClock, FaDownload
} from 'react-icons/fa';
import { Bar, Line, Pie } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  PointElement,
  LineElement,
  ArcElement,
  Title,
  Tooltip,
  Legend,
  Filler
} from 'chart.js';

ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  PointElement,
  LineElement,
  ArcElement,
  Title,
  Tooltip,
  Legend,
  Filler
);

const AuthorityDashboard = () => {
  const navigate = useNavigate();

  const [stats, setStats] = useState({
    totalViolations: 0,
    todayViolations: 0,
    pendingReview: 0,
    totalFines: 0
  });

  const [recentViolations, setRecentViolations] = useState([]);
  const [byType, setByType] = useState([]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [activeTab, setActiveTab] = useState('overview');

  // ✅ AUTH CHECK + DATA FETCH
  useEffect(() => {
    const user = JSON.parse(localStorage.getItem('user'));

    // 🔒 Restrict to admin
    if (!user || user.role !== 'admin') {
      navigate('/');
      return;
    }

    fetchData();

    const interval = setInterval(fetchData, 30000);
    return () => clearInterval(interval);
  }, []);

  // ✅ FETCH DATA
  const fetchData = async () => {
    try {
      setLoading(true);

      const response = await dashboardAPI.getStats();

      if (response.success) {
        setStats(response.stats || {});
        setByType(response.byType || []);
        setRecentViolations(response.recent || []);
      } else {
        setError('Failed to load dashboard data');
      }

    } catch (err) {
      console.error(err);
      setError('Server error while fetching data');
    } finally {
      setLoading(false);
    }
  };

  // ✅ VIOLATION TYPES
  const violationTypes = {
    signal_violation: { label: 'Signal Violation', color: 'danger', icon: '🚦' },
    overspeeding: { label: 'Overspeeding', color: 'warning', icon: '⚡' },
    no_seatbelt: { label: 'No Seatbelt', color: 'info', icon: '🪑' },
    triple_riding: { label: 'Triple Riding', color: 'secondary', icon: '🏍️' },
    wrong_route: { label: 'Wrong Route', color: 'primary', icon: '🔄' },
    no_helmet: { label: 'No Helmet', color: 'dark', icon: '🪖' }
  };

  // ✅ COLORS
  const getColor = (type) => {
    const colors = {
      signal_violation: '220, 53, 69',
      overspeeding: '255, 193, 7',
      no_seatbelt: '23, 162, 184',
      triple_riding: '108, 117, 125',
      wrong_route: '0, 123, 255',
      no_helmet: '52, 58, 64'
    };
    return colors[type] || '102, 126, 234';
  };

  // ✅ CHART DATA
  const chartData = {
    labels: byType.map(item => violationTypes[item._id]?.label || item._id),
    datasets: [{
      label: 'Violations',
      data: byType.map(item => item.count),
      backgroundColor: byType.map(item => `rgba(${getColor(item._id)}, 0.7)`),
      borderColor: byType.map(item => `rgba(${getColor(item._id)}, 1)`),
      borderWidth: 1
    }]
  };

  // ✅ LOADING
  if (loading) {
    return (
      <div className="text-center mt-5">
        <Spinner animation="border" />
        <p className="mt-3">Loading Authority Dashboard...</p>
      </div>
    );
  }

  return (
    <Container fluid className="authority-dashboard">
      
      {/* HEADER */}
      <div className="mb-4 d-flex justify-content-between align-items-center">
        <div>
          <h2>👮 Authority Dashboard</h2>
          <p className="text-muted">Monitor and manage traffic violations</p>
        </div>

        <div>
          <Button variant="outline-primary" className="me-2" onClick={fetchData}>
            <FaChartLine className="me-2" /> Refresh
          </Button>

          <Button variant="primary" onClick={() => navigate('/upload')}>
            <FaCamera className="me-2" /> New Detection
          </Button>
        </div>
      </div>

      {error && <Alert variant="danger">{error}</Alert>}

      {/* STATS */}
      <Row className="mb-4">
        <Col md={3}>
          <Card className="p-3 text-center">
            <FaCar size={30} />
            <h3>{stats.totalViolations || 0}</h3>
            <p>Total Violations</p>
          </Card>
        </Col>

        <Col md={3}>
          <Card className="p-3 text-center">
            <FaClock size={30} />
            <h3>{stats.todayViolations || 0}</h3>
            <p>Today's Violations</p>
          </Card>
        </Col>

        <Col md={3}>
          <Card className="p-3 text-center">
            <FaExclamationTriangle size={30} />
            <h3>{stats.pendingReview || 0}</h3>
            <p>Pending Review</p>
          </Card>
        </Col>

        <Col md={3}>
          <Card className="p-3 text-center">
            <FaMoneyBillWave size={30} />
            <h3>₹{(stats.totalFines || 0).toLocaleString()}</h3>
            <p>Total Fines</p>
          </Card>
        </Col>
      </Row>

      {/* TABS */}
      <Tab.Container activeKey={activeTab} onSelect={(k) => setActiveTab(k)}>
        <Nav variant="tabs">
          <Nav.Item>
            <Nav.Link eventKey="overview">Overview</Nav.Link>
          </Nav.Item>
          <Nav.Item>
            <Nav.Link eventKey="violations">Violations</Nav.Link>
          </Nav.Item>
          <Nav.Item>
            <Nav.Link eventKey="analytics">Analytics</Nav.Link>
          </Nav.Item>
        </Nav>

        <Tab.Content className="mt-3">

          {/* OVERVIEW */}
          <Tab.Pane eventKey="overview">
            <Row>
              <Col md={6}>
                <Card className="p-3">
                  <h5>Violations by Type</h5>
                  {byType.length > 0 ? <Bar data={chartData} /> : <p>No Data</p>}
                </Card>
              </Col>

              <Col md={6}>
                <Card className="p-3">
                  <h5>Recent Activity</h5>

                  {recentViolations.length === 0 && <p>No recent data</p>}

                  {recentViolations.slice(0, 5).map((v, i) => (
                    <div key={i} className="mb-2 border-bottom pb-2">
                      <strong>{v.vehicleNumber}</strong> - {v.type}
                      <br />
                      <small>{new Date(v.timestamp).toLocaleString()}</small>
                    </div>
                  ))}
                </Card>
              </Col>
            </Row>
          </Tab.Pane>

          {/* VIOLATIONS */}
          <Tab.Pane eventKey="violations">
            <Card className="p-3">
              <h5>Recent Violations</h5>

              <Table hover responsive>
                <thead>
                  <tr>
                    <th>ID</th>
                    <th>Vehicle</th>
                    <th>Type</th>
                    <th>Time</th>
                    <th>Status</th>
                    <th>Fine</th>
                  </tr>
                </thead>

                <tbody>
                  {recentViolations.map(v => (
                    <tr key={v._id}>
                      <td>{v.violationId?.slice(0, 8)}</td>
                      <td>{v.vehicleNumber}</td>
                      <td>{v.type}</td>
                      <td>{new Date(v.timestamp).toLocaleString()}</td>
                      <td>
                        <Badge bg={v.status === 'detected' ? 'warning' : 'success'}>
                          {v.status}
                        </Badge>
                      </td>
                      <td>₹{v.fineAmount}</td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            </Card>
          </Tab.Pane>

          {/* ANALYTICS */}
          <Tab.Pane eventKey="analytics">
            <Row>
              <Col md={6}>
                <Card className="p-3">
                  <h5>Trend</h5>
                  <Line data={chartData} />
                </Card>
              </Col>

              <Col md={6}>
                <Card className="p-3">
                  <h5>Distribution</h5>
                  <Pie data={chartData} />
                </Card>
              </Col>
            </Row>
          </Tab.Pane>

        </Tab.Content>
      </Tab.Container>
    </Container>
  );
};

export default AuthorityDashboard;