import React, { useState, useEffect, useCallback } from 'react';
import { Row, Col, Card, Button, Spinner, Alert, Badge, Table } from 'react-bootstrap';
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
import './Dashboard.css';

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
  const [retryCount, setRetryCount] = useState(0);

  // Fetch dashboard data from backend
  const fetchDashboardData = useCallback(async () => {
    try {
      setLoading(true);
      setError('');
      
      console.log(`📊 Fetching dashboard data... (Attempt ${retryCount + 1})`);
      
      const response = await dashboardAPI.getStats();
      console.log('✅ API Response:', response);
      
      if (response && response.success) {
        // Handle both response formats
        const responseData = response.data || response;
        
        setStats({
          totalViolations: responseData.stats?.totalViolations || 0,
          todayViolations: responseData.stats?.todayViolations || 0,
          pendingReview: responseData.stats?.pendingReview || 0,
          totalFines: responseData.stats?.totalFines || 0
        });
        
        setByType(responseData.byType || []);
        
        // Fetch recent violations separately
        const recentResponse = await dashboardAPI.getRecentViolations(10);
        if (recentResponse.success) {
          const recentData = recentResponse.data?.data || recentResponse.data || [];
          setRecentViolations(Array.isArray(recentData) ? recentData : []);
          generateDailyData(Array.isArray(recentData) ? recentData : []);
        }
        
        // Dispatch event for other components
        window.dispatchEvent(new CustomEvent('dashboardDataLoaded', { 
          detail: responseData 
        }));
        
      } else {
        throw new Error(response?.error || 'Failed to load dashboard data');
      }
    } catch (err) {
      console.error('❌ Dashboard Error:', err);
      
      if (err.code === 'ERR_NETWORK' || err.message.includes('Network Error')) {
        setError('Cannot connect to server. Please ensure backend is running on port 5001.');
      } else if (err.response?.status === 500) {
        setError('Server error occurred. Please check server logs.');
      } else {
        setError(err.message || 'Failed to load dashboard data');
      }
    } finally {
      setLoading(false);
    }
  }, [retryCount]);

  // Generate daily trend data
  const generateDailyData = (violations) => {
    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const today = new Date();
    const last7Days = [];
    
    for (let i = 6; i >= 0; i--) {
      const date = new Date(today);
      date.setDate(date.getDate() - i);
      last7Days.push({
        day: days[date.getDay()],
        date: date.toDateString(),
        count: 0
      });
    }
    
    violations.forEach(v => {
      const vDate = new Date(v.timestamp || v.createdAt);
      const vDateStr = vDate.toDateString();
      const dayData = last7Days.find(d => d.date === vDateStr);
      if (dayData) dayData.count++;
    });
    
    setDailyData(last7Days);
  };

  // Load data on component mount
  useEffect(() => {
    fetchDashboardData();
    
    // Auto-refresh every 30 seconds
    const interval = setInterval(fetchDashboardData, 30000);
    
    // Listen for violation updates
    const handleViolationsUpdate = () => {
      console.log('🔄 Violations updated, refreshing...');
      fetchDashboardData();
    };
    
    window.addEventListener('violationsUpdated', handleViolationsUpdate);
    
    return () => {
      clearInterval(interval);
      window.removeEventListener('violationsUpdated', handleViolationsUpdate);
    };
  }, [fetchDashboardData]);

  // Retry handler
  const handleRetry = () => {
    setRetryCount(prev => prev + 1);
  };

  // Prepare chart data
  const violationTypeLabels = {
    no_helmet: 'No Helmet',
    triple_riding: 'Triple Riding',
    overloading: 'Overloading',
    signal_violation: 'Signal Jump',
    overspeeding: 'Overspeeding',
    no_seatbelt: 'No Seatbelt',
    wrong_route: 'Wrong Route',
    wrong_parking: 'Wrong Parking'
  };

  const violationsChartData = {
    labels: byType.map(item => violationTypeLabels[item._id] || item._id?.replace(/_/g, ' ') || 'Unknown'),
    datasets: [{
      label: 'Number of Violations',
      data: byType.map(item => item.count || 0),
      backgroundColor: [
        'rgba(231, 76, 60, 0.7)',
        'rgba(52, 152, 219, 0.7)',
        'rgba(241, 196, 15, 0.7)',
        'rgba(46, 204, 113, 0.7)',
        'rgba(155, 89, 182, 0.7)',
        'rgba(230, 126, 34, 0.7)',
      ],
      borderColor: [
        'rgba(231, 76, 60, 1)',
        'rgba(52, 152, 219, 1)',
        'rgba(241, 196, 15, 1)',
        'rgba(46, 204, 113, 1)',
        'rgba(155, 89, 182, 1)',
        'rgba(230, 126, 34, 1)',
      ],
      borderWidth: 2,
      borderRadius: 8,
    }],
  };

  const dailyChartData = {
    labels: dailyData.map(d => d.day),
    datasets: [{
      label: 'Violations',
      data: dailyData.map(d => d.count),
      borderColor: 'rgb(59, 130, 246)',
      backgroundColor: 'rgba(59, 130, 246, 0.1)',
      tension: 0.4,
      fill: true,
      pointBackgroundColor: 'rgb(59, 130, 246)',
      pointBorderColor: '#fff',
      pointBorderWidth: 2,
      pointRadius: 6,
      pointHoverRadius: 8,
    }],
  };

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        display: true,
        position: 'bottom',
        labels: {
          usePointStyle: true,
          padding: 20,
        }
      },
      tooltip: {
        backgroundColor: 'rgba(0, 0, 0, 0.8)',
        padding: 12,
        cornerRadius: 8,
      }
    },
    scales: {
      y: {
        beginAtZero: true,
        ticks: { stepSize: 1 },
        grid: { color: 'rgba(0, 0, 0, 0.05)' }
      },
      x: {
        grid: { display: false }
      }
    }
  };

  // Formatters
  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(amount || 0);
  };

  const formatNumber = (num) => {
    return new Intl.NumberFormat('en-IN').format(num || 0);
  };

  const getTypeBadge = (type) => {
    const colors = {
      no_helmet: 'danger',
      triple_riding: 'warning',
      overloading: 'info',
      signal_violation: 'primary',
      overspeeding: 'secondary',
      no_seatbelt: 'dark',
      wrong_route: 'success'
    };
    return colors[type] || 'secondary';
  };

  const formatViolationType = (type) => {
    if (!type) return 'Unknown';
    return type.split('_').map(word => 
      word.charAt(0).toUpperCase() + word.slice(1)
    ).join(' ');
  };

  const getStatusColor = (status) => {
    switch(status?.toLowerCase()) {
      case 'detected': return 'warning';
      case 'fined': return 'success';
      case 'reviewed': return 'info';
      case 'appealed': return 'danger';
      case 'dismissed': return 'secondary';
      case 'pending': return 'primary';
      default: return 'light';
    }
  };

  const formatDate = (dateString) => {
    if (!dateString) return 'N/A';
    try {
      const date = new Date(dateString);
      const now = new Date();
      const diffTime = Math.abs(now - date);
      const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
      
      if (diffDays === 0) {
        const diffHours = Math.floor(diffTime / (1000 * 60 * 60));
        if (diffHours === 0) {
          const diffMins = Math.floor(diffTime / (1000 * 60));
          return diffMins <= 1 ? 'Just now' : `${diffMins} mins ago`;
        }
        return `${diffHours} hours ago`;
      } else if (diffDays === 1) {
        return 'Yesterday';
      } else if (diffDays < 7) {
        return `${diffDays} days ago`;
      }
      return date.toLocaleDateString('en-IN', { 
        day: 'numeric', 
        month: 'short', 
        year: 'numeric' 
      });
    } catch (e) {
      return dateString;
    }
  };

  const formatTime = (dateString) => {
    if (!dateString) return '';
    try {
      return new Date(dateString).toLocaleTimeString('en-IN', { 
        hour: '2-digit', 
        minute: '2-digit' 
      });
    } catch {
      return '';
    }
  };

  // Loading State
  if (loading && stats.totalViolations === 0) {
    return (
      <div className="dashboard-loading">
        <div className="loading-container">
          <Spinner animation="border" variant="primary" className="loading-spinner" />
          <h4 className="mt-4">Loading Dashboard</h4>
          <p className="text-muted">Fetching latest traffic violation data...</p>
          <div className="loading-dots">
            <span></span><span></span><span></span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="dashboard-container">
      {/* Header */}
      <div className="dashboard-header">
        <div className="header-left">
          <h2 className="dashboard-title">
            {userRole === 'admin' ? '🚔 Traffic Control Dashboard' : '📊 Violation Dashboard'}
          </h2>
          <p className="dashboard-subtitle">
            Welcome back, <strong>{user.fullName || user.username || 'User'}</strong>
            {userRole === 'admin' && (
              <Badge bg="danger" className="ms-2 admin-badge">ADMIN</Badge>
            )}
          </p>
        </div>
        <div className="header-actions">
          <Button 
            variant="outline-primary" 
            onClick={handleRetry}
            disabled={loading}
            className="refresh-btn"
          >
            {loading ? (
              <>
                <Spinner animation="border" size="sm" className="me-2" />
                Refreshing...
              </>
            ) : (
              <>
                <i className="bi bi-arrow-clockwise me-2"></i>
                Refresh
              </>
            )}
          </Button>
          {userRole === 'admin' && (
            <Button 
              variant="primary" 
              onClick={() => navigate('/upload')}
              className="ms-2"
            >
              <i className="bi bi-cloud-upload me-2"></i>
              New Upload
            </Button>
          )}
        </div>
      </div>

      {/* Error Alert */}
      {error && (
        <Alert variant="danger" className="dashboard-alert animate__animated animate__shakeX">
          <div className="d-flex align-items-center">
            <i className="bi bi-exclamation-triangle-fill me-3 fs-4"></i>
            <div className="flex-grow-1">
              <Alert.Heading className="mb-1">Connection Error</Alert.Heading>
              <p className="mb-2">{error}</p>
              <small className="text-muted">
                Make sure backend server is running on <code>http://localhost:5001</code>
              </small>
            </div>
            <Button variant="outline-danger" size="sm" onClick={handleRetry}>
              Retry
            </Button>
          </div>
        </Alert>
      )}

      {/* Stats Cards */}
      <Row className="stats-row">
        <Col xl={3} md={6} className="mb-4">
          <Card className="stat-card stat-card-total">
            <Card.Body>
              <div className="stat-icon">
                <i className="bi bi-exclamation-triangle"></i>
              </div>
              <div className="stat-info">
                <Card.Title className="stat-label">Total Violations</Card.Title>
                <h2 className="stat-value">{formatNumber(stats.totalViolations)}</h2>
                <small className="stat-footer">All time records</small>
              </div>
            </Card.Body>
          </Card>
        </Col>
        <Col xl={3} md={6} className="mb-4">
          <Card className="stat-card stat-card-today">
            <Card.Body>
              <div className="stat-icon">
                <i className="bi bi-calendar-check"></i>
              </div>
              <div className="stat-info">
                <Card.Title className="stat-label">Today's Violations</Card.Title>
                <h2 className="stat-value">{formatNumber(stats.todayViolations)}</h2>
                <small className="stat-footer">Last 24 hours</small>
              </div>
            </Card.Body>
          </Card>
        </Col>
        <Col xl={3} md={6} className="mb-4">
          <Card className="stat-card stat-card-pending">
            <Card.Body>
              <div className="stat-icon">
                <i className="bi bi-hourglass-split"></i>
              </div>
              <div className="stat-info">
                <Card.Title className="stat-label">Pending Review</Card.Title>
                <h2 className="stat-value">{formatNumber(stats.pendingReview)}</h2>
                <small className="stat-footer">Awaiting action</small>
              </div>
            </Card.Body>
          </Card>
        </Col>
        <Col xl={3} md={6} className="mb-4">
          <Card className="stat-card stat-card-fines">
            <Card.Body>
              <div className="stat-icon">
                <i className="bi bi-cash-stack"></i>
              </div>
              <div className="stat-info">
                <Card.Title className="stat-label">Total Fines</Card.Title>
                <h2 className="stat-value">{formatCurrency(stats.totalFines)}</h2>
                <small className="stat-footer">Amount collected</small>
              </div>
            </Card.Body>
          </Card>
        </Col>
      </Row>

      {/* Charts */}
      <Row className="charts-row">
        <Col lg={6} className="mb-4">
          <Card className="chart-card">
            <Card.Header className="chart-header">
              <h5 className="mb-0">
                <i className="bi bi-bar-chart-fill me-2"></i>
                Violations by Type
              </h5>
            </Card.Header>
            <Card.Body>
              <div className="chart-container">
                {byType.length > 0 ? (
                  <Bar data={violationsChartData} options={chartOptions} />
                ) : (
                  <div className="chart-empty">
                    <i className="bi bi-bar-chart"></i>
                    <p>No violation data available</p>
                  </div>
                )}
              </div>
            </Card.Body>
          </Card>
        </Col>
        <Col lg={6} className="mb-4">
          <Card className="chart-card">
            <Card.Header className="chart-header">
              <h5 className="mb-0">
                <i className="bi bi-graph-up me-2"></i>
                Daily Trend (7 Days)
              </h5>
            </Card.Header>
            <Card.Body>
              <div className="chart-container">
                {dailyData.some(d => d.count > 0) ? (
                  <Line data={dailyChartData} options={chartOptions} />
                ) : (
                  <div className="chart-empty">
                    <i className="bi bi-graph-up"></i>
                    <p>No data for last 7 days</p>
                  </div>
                )}
              </div>
            </Card.Body>
          </Card>
        </Col>
      </Row>

      {/* Recent Violations Table */}
      <Card className="table-card">
        <Card.Header className="table-header">
          <div className="d-flex justify-content-between align-items-center">
            <h5 className="mb-0">
              <i className="bi bi-list-ul me-2"></i>
              Recent Violations
            </h5>
            <div>
              <Button 
                variant="outline-primary" 
                size="sm" 
                onClick={() => navigate('/violations')}
                className="me-2"
              >
                View All
              </Button>
              <Button 
                variant="outline-secondary" 
                size="sm" 
                onClick={handleRetry}
              >
                <i className="bi bi-arrow-repeat"></i>
              </Button>
            </div>
          </div>
        </Card.Header>
        <Card.Body className="p-0">
          <div className="table-responsive">
            <Table hover className="violations-table mb-0">
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Type</th>
                  <th>Vehicle</th>
                  <th>Confidence</th>
                  <th>Status</th>
                  <th>Date</th>
                  <th>Time</th>
                  <th>Fine</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {recentViolations.length > 0 ? (
                  recentViolations.slice(0, 8).map((violation, index) => (
                    <tr key={violation._id || violation.violationId || index}>
                      <td>
                        <small className="text-muted font-monospace">
                          #{(violation._id || violation.violationId || '').slice(-6)}
                        </small>
                      </td>
                      <td>
                        <Badge bg={getTypeBadge(violation.type)} className="violation-badge">
                          {formatViolationType(violation.type)}
                        </Badge>
                      </td>
                      <td>
                        <div className="fw-semibold">
                          {violation.vehicleNumber || violation.vehicleId || 'N/A'}
                        </div>
                        <small className="text-muted">
                          {violation.vehicleType || violation.details?.vehicleType || ''}
                        </small>
                      </td>
                      <td>
                        <div className="confidence-bar">
                          <div 
                            className="confidence-fill"
                            style={{ width: `${(violation.confidence || 0) * 100}%` }}
                          ></div>
                        </div>
                        <small className="text-muted">
                          {((violation.confidence || 0) * 100).toFixed(0)}%
                        </small>
                      </td>
                      <td>
                        <Badge bg={getStatusColor(violation.status)} className="status-badge">
                          {violation.status || 'Detected'}
                        </Badge>
                      </td>
                      <td>
                        <small>{formatDate(violation.timestamp || violation.createdAt)}</small>
                      </td>
                      <td>
                        <small className="text-muted">{formatTime(violation.timestamp || violation.createdAt)}</small>
                      </td>
                      <td>
                        <span className="fine-amount">
                          ₹{(violation.fineAmount || 0).toLocaleString('en-IN')}
                        </span>
                      </td>
                      <td>
                        <Button 
                          variant="outline-primary" 
                          size="sm"
                          onClick={() => navigate(`/violations/${violation._id || violation.violationId}`)}
                          className="action-btn"
                        >
                          <i className="bi bi-eye"></i>
                        </Button>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan="9">
                      <div className="empty-state">
                        <i className="bi bi-inbox"></i>
                        <h5>No Violations Yet</h5>
                        <p className="text-muted">Traffic violations will appear here once detected</p>
                        {userRole === 'admin' && (
                          <Button 
                            variant="primary" 
                            size="sm"
                            onClick={() => navigate('/upload')}
                            className="mt-2"
                          >
                            <i className="bi bi-cloud-upload me-2"></i>
                            Upload Media for Detection
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
            </Table>
          </div>
        </Card.Body>
      </Card>
    </div>
  );
};

export default Dashboard;