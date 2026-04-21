import React, { useState, useEffect, useCallback } from 'react';
import { Row, Col, Card, Button, Spinner, Alert } from 'react-bootstrap';
import { Bar, Line } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler
} from 'chart.js';
import { dashboardAPI } from '../api/api';
import { useNavigate } from 'react-router-dom';

ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler
);

const Dashboard = () => {
  const navigate = useNavigate();
  const userRole = localStorage.getItem('userRole') || 'viewer';
  const user = JSON.parse(localStorage.getItem('user') || '{}');
  
  const [stats, setStats] = useState({
    totalViolations: 0,
    todayViolations: 0,
    pendingReview: 0,
    totalFines: 0
  });
  const [byType, setByType] = useState([]);
  const [recentViolations, setRecentViolations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [dailyData, setDailyData] = useState([]);

  // Fetch real data from backend
  const fetchDashboardData = useCallback(async () => {
    try {
      setLoading(true);
      setError('');
      
      console.log('Fetching dashboard data from API...');
      const response = await dashboardAPI.getStats();
      console.log('API Response:', response);
      
      if (response && response.success) {
        setStats(response.stats || {
          totalViolations: 0,
          todayViolations: 0,
          pendingReview: 0,
          totalFines: 0
        });
        setByType(response.byType || []);
        
        if (response.recent && response.recent.length > 0) {
          setRecentViolations(response.recent);
          generateDailyData(response.recent);
        }
      } else {
        setError('Failed to load dashboard data');
      }
    } catch (err) {
      console.error('Dashboard error details:', err);
      setError('Error connecting to server');
    } finally {
      setLoading(false);
    }
  }, []);

  // Generate daily trend data from actual violations
  const generateDailyData = (violations) => {
    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const today = new Date();
    const last7Days = [];
    
    // Create array of last 7 days
    for (let i = 6; i >= 0; i--) {
      const date = new Date(today);
      date.setDate(date.getDate() - i);
      last7Days.push({
        day: days[date.getDay()],
        date: date.toDateString(),
        count: 0
      });
    }
    
    // Count violations per day
    violations.forEach(v => {
      const vDate = new Date(v.timestamp || v.createdAt);
      const vDateStr = vDate.toDateString();
      
      const dayData = last7Days.find(d => d.date === vDateStr);
      if (dayData) {
        dayData.count++;
      }
    });
    
    setDailyData(last7Days);
  };

  // Load data on component mount
  useEffect(() => {
    fetchDashboardData();
    
    // Refresh every 30 seconds
    const interval = setInterval(fetchDashboardData, 30000);
    
    // Listen for violation updates
    const handleViolationsUpdate = () => {
      console.log('🔄 Violations updated, refreshing dashboard...');
      fetchDashboardData();
    };
    
    window.addEventListener('violationsUpdated', handleViolationsUpdate);
    
    return () => {
      clearInterval(interval);
      window.removeEventListener('violationsUpdated', handleViolationsUpdate);
    };
  }, [fetchDashboardData]);

  // Prepare chart data from real statistics
  const violationLabels = {
    signal_violation: 'Signal',
    overspeeding: 'Overspeed',
    no_seatbelt: 'No Seatbelt',
    triple_riding: 'Triple Riding',
    wrong_route: 'Wrong Route',
    no_helmet: 'No Helmet'
  };

  // Create data for violations by type chart
  const violationsChartData = {
    labels: byType.map(item => violationLabels[item._id] || item._id),
    datasets: [
      {
        label: 'Number of Violations',
        data: byType.map(item => item.count || 0),
        backgroundColor: [
          'rgba(255, 99, 132, 0.7)',
          'rgba(54, 162, 235, 0.7)',
          'rgba(255, 206, 86, 0.7)',
          'rgba(75, 192, 192, 0.7)',
          'rgba(153, 102, 255, 0.7)',
          'rgba(255, 159, 64, 0.7)',
        ],
        borderColor: [
          'rgba(255, 99, 132, 1)',
          'rgba(54, 162, 235, 1)',
          'rgba(255, 206, 86, 1)',
          'rgba(75, 192, 192, 1)',
          'rgba(153, 102, 255, 1)',
          'rgba(255, 159, 64, 1)',
        ],
        borderWidth: 1,
      },
    ],
  };

  // Create data for daily trend chart
  const dailyChartData = {
    labels: dailyData.map(d => d.day),
    datasets: [
      {
        label: 'Violations',
        data: dailyData.map(d => d.count),
        borderColor: 'rgb(75, 192, 192)',
        backgroundColor: 'rgba(75, 192, 192, 0.2)',
        tension: 0.4,
        fill: true,
        pointBackgroundColor: 'rgb(75, 192, 192)',
        pointBorderColor: '#fff',
        pointBorderWidth: 2,
        pointRadius: 4,
      },
    ],
  };

  // Format currency
  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(amount || 0);
  };

  // Format number with commas
  const formatNumber = (num) => {
    return new Intl.NumberFormat('en-IN').format(num || 0);
  };

  // Get badge color for violation type
  const getTypeBadge = (type) => {
    const colors = {
      signal_violation: 'danger',
      overspeeding: 'warning',
      no_seatbelt: 'info',
      triple_riding: 'secondary',
      wrong_route: 'primary',
      no_helmet: 'dark'
    };
    return colors[type] || 'secondary';
  };

  // Format violation type for display
  const formatViolationType = (type) => {
    if (!type) return 'Unknown';
    return type.split('_').map(word => 
      word.charAt(0).toUpperCase() + word.slice(1)
    ).join(' ');
  };

  // Get status badge color
  const getStatusColor = (status) => {
    switch(status?.toLowerCase()) {
      case 'detected': return 'warning';
      case 'fined': return 'success';
      case 'reviewed': return 'info';
      case 'appealed': return 'danger';
      case 'dismissed': return 'secondary';
      default: return 'secondary';
    }
  };

  // Format date
  const formatDate = (dateString) => {
    if (!dateString) return 'N/A';
    try {
      const date = new Date(dateString);
      const now = new Date();
      const diffTime = Math.abs(now - date);
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      
      if (diffDays === 0) {
        return 'Today ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      } else if (diffDays === 1) {
        return 'Yesterday ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      } else {
        return date.toLocaleDateString() + ' ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      }
    } catch (e) {
      return dateString;
    }
  };

  if (loading && stats.totalViolations === 0) {
    return (
      <div className="text-center mt-5">
        <Spinner animation="border" variant="primary" />
        <p className="mt-3">Loading dashboard data...</p>
        <p className="text-muted small">Make sure backend server is running on port 5001</p>
      </div>
    );
  }

  return (
    <div>
      <div className="d-flex justify-content-between align-items-center mb-4">
        <div>
          <h2 className="mb-0">
            {userRole === 'admin' ? '👮 Traffic Authority Dashboard' : '👤 Public Dashboard'}
          </h2>
          <p className="text-muted">
            Welcome back, {user.fullName || user.username}
          </p>
        </div>
        <Button 
          variant="outline-primary" 
          onClick={fetchDashboardData}
          disabled={loading}
        >
          {loading ? 'Refreshing...' : '↻ Refresh'}
        </Button>
      </div>
      
      {error && (
        <Alert variant="danger">
          <Alert.Heading>Connection Error</Alert.Heading>
          <p>{error}</p>
          <hr />
          <div className="d-flex justify-content-between">
            <p className="mb-0">Make sure backend server is running on http://localhost:5001</p>
            <Button variant="outline-danger" size="sm" onClick={fetchDashboardData}>
              Retry Connection
            </Button>
          </div>
        </Alert>
      )}

      {/* Stats Cards */}
      <Row className="mb-4">
        <Col md={3}>
          <Card className="border-primary border-top border-top-4 h-100">
            <Card.Body>
              <Card.Title className="text-muted small text-uppercase">Total Violations</Card.Title>
              <h2 className="text-primary display-6">{formatNumber(stats.totalViolations)}</h2>
              <small className="text-muted">All time</small>
            </Card.Body>
          </Card>
        </Col>
        <Col md={3}>
          <Card className="border-success border-top border-top-4 h-100">
            <Card.Body>
              <Card.Title className="text-muted small text-uppercase">Today's Violations</Card.Title>
              <h2 className="text-success display-6">{formatNumber(stats.todayViolations)}</h2>
              <small className="text-muted">Last 24 hours</small>
            </Card.Body>
          </Card>
        </Col>
        <Col md={3}>
          <Card className="border-warning border-top border-top-4 h-100">
            <Card.Body>
              <Card.Title className="text-muted small text-uppercase">Pending Review</Card.Title>
              <h2 className="text-warning display-6">{formatNumber(stats.pendingReview)}</h2>
              <small className="text-muted">Need verification</small>
            </Card.Body>
          </Card>
        </Col>
        <Col md={3}>
          <Card className="border-info border-top border-top-4 h-100">
            <Card.Body>
              <Card.Title className="text-muted small text-uppercase">Total Fines</Card.Title>
              <h2 className="text-info display-6">{formatCurrency(stats.totalFines)}</h2>
              <small className="text-muted">Collected amount</small>
            </Card.Body>
          </Card>
        </Col>
      </Row>

      {/* Charts */}
      <Row className="mb-4">
        <Col md={6}>
          <Card className="h-100">
            <Card.Body>
              <Card.Title>Violations by Type</Card.Title>
              {byType.length > 0 ? (
                <Bar 
                  data={violationsChartData} 
                  options={{
                    responsive: true,
                    plugins: {
                      legend: { display: false },
                      tooltip: { 
                        callbacks: {
                          label: (context) => `Count: ${context.raw}`
                        }
                      }
                    }
                  }}
                />
              ) : (
                <div className="text-center py-5">
                  <p className="text-muted">No violation data available</p>
                </div>
              )}
            </Card.Body>
          </Card>
        </Col>
        <Col md={6}>
          <Card className="h-100">
            <Card.Body>
              <Card.Title>Daily Trend (Last 7 Days)</Card.Title>
              {dailyData.some(d => d.count > 0) ? (
                <Line 
                  data={dailyChartData}
                  options={{
                    responsive: true,
                    plugins: {
                      tooltip: {
                        callbacks: {
                          label: (context) => `Violations: ${context.raw}`
                        }
                      }
                    },
                    scales: {
                      y: {
                        beginAtZero: true,
                        ticks: { stepSize: 1 }
                      }
                    }
                  }}
                />
              ) : (
                <div className="text-center py-5">
                  <p className="text-muted">No data for last 7 days</p>
                </div>
              )}
            </Card.Body>
          </Card>
        </Col>
      </Row>

      {/* Recent Violations */}
      <Card>
        <Card.Body>
          <Card.Title className="d-flex justify-content-between align-items-center">
            <span>Recent Violations</span>
            <div>
              <Button 
                variant="outline-primary" 
                size="sm" 
                onClick={() => navigate('/violations')}
                className="me-2"
              >
                View All
              </Button>
              {userRole === 'admin' && (
                <Button 
                  variant="primary" 
                  size="sm" 
                  onClick={() => navigate('/upload')}
                >
                  Upload New
                </Button>
              )}
            </div>
          </Card.Title>
          
          <div className="table-responsive">
            <table className="table table-hover">
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Type</th>
                  <th>Vehicle</th>
                  <th>Location</th>
                  <th>Status</th>
                  <th>Time</th>
                  <th>Fine</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {recentViolations.length > 0 ? (
                  recentViolations.slice(0, 5).map((violation) => (
                    <tr key={violation._id || violation.violationId || Math.random()}>
                      <td>
                        <small className="text-muted">
                          {(violation.violationId || violation._id || '').slice(0, 8)}...
                        </small>
                      </td>
                      <td>
                        <span className={`badge bg-${getTypeBadge(violation.type)}`}>
                          {formatViolationType(violation.type)}
                        </span>
                      </td>
                      <td>
                        <div>{violation.vehicleNumber || 'N/A'}</div>
                        <small className="text-muted">{violation.vehicleType || ''}</small>
                      </td>
                      <td>
                        <small>{violation.location?.address || violation.location || 'N/A'}</small>
                      </td>
                      <td>
                        <span className={`badge bg-${getStatusColor(violation.status)}`}>
                          {violation.status || 'Detected'}
                        </span>
                      </td>
                      <td>
                        <small>{formatDate(violation.timestamp || violation.createdAt)}</small>
                      </td>
                      <td>
                        <strong className="text-success">₹{violation.fineAmount?.toLocaleString() || '0'}</strong>
                      </td>
                      <td>
                        <Button 
                          variant="outline-primary" 
                          size="sm"
                          onClick={() => navigate(`/violations/${violation.violationId || violation._id}`)}
                        >
                          View
                        </Button>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan="8" className="text-center py-4">
                      <p className="text-muted mb-2">No violations recorded yet</p>
                      {userRole === 'admin' && (
                        <Button variant="primary" size="sm" onClick={() => navigate('/upload')}>
                          Upload Your First Violation
                        </Button>
                      )}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </Card.Body>
      </Card>
    </div>
  );
};

export default Dashboard;