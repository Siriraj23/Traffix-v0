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
import { dashboardAPI, violationsAPI } from '../api/api';
import { useNavigate } from 'react-router-dom';
import { 
  FaExclamationTriangle, 
  FaCalendarCheck, 
  FaHourglassHalf, 
  FaMoneyBillWave,
  FaEye,
  FaEdit,
  FaTrash,
  FaSync,
  FaCloudUploadAlt,
  FaChartBar,
  FaChartLine,
  FaListUl,
  FaInbox,
  FaChevronLeft,
  FaChevronRight
} from 'react-icons/fa';
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

// Storage key for saved violations
const SAVED_VIOLATIONS_KEY = 'traffic_saved_violations';

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

  // ---- Pagination state ----
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 5;
  // -------------------------

  // Fetch dashboard data from backend
  const fetchDashboardData = useCallback(async () => {
    try {
      setLoading(true);
      setError('');
      
      const excludedTypes = ['overspeeding', 'no_seatbelt', 'signal_violation'];
      
      console.log(`📊 Fetching dashboard data... (Attempt ${retryCount + 1})`);
      
      const response = await dashboardAPI.getStats();
      console.log('✅ API Response:', response);
      
      if (response && response.success) {
        const responseData = response.data || response;
        
        setStats({
          totalViolations: responseData.stats?.totalViolations || 0,
          todayViolations: responseData.stats?.todayViolations || 0,
          pendingReview: responseData.stats?.pendingReview || 0,
          totalFines: responseData.stats?.totalFines || 0
        });
        
        const filteredTypes = (responseData.byType || []).filter(
          item => !excludedTypes.includes(item._id)
        );
        setByType(filteredTypes);
        
        // Fetch recent violations
        const recentResponse = await dashboardAPI.getRecentViolations(10);
        let recentData = [];
        
        if (recentResponse.success) {
          recentData = recentResponse.data?.data || recentResponse.data || [];
          if (!Array.isArray(recentData)) {
            recentData = recentResponse.data?.violations || [];
          }
        }
        
        // Add saved violations from localStorage
        try {
          const savedViolations = JSON.parse(localStorage.getItem(SAVED_VIOLATIONS_KEY) || '[]');
          savedViolations.forEach(v => {
            const exists = recentData.find(rv => 
              (rv.vehicleNumber === v.vehicleNumber) && 
              (rv.type === v.type)
            );
            if (!exists) {
              recentData.push({
                _id: v._id || `local_${Date.now()}`,
                violationId: v.violationId || `LOC-${Date.now()}`,
                type: v.type,
                vehicleNumber: v.vehicleNumber,
                fineAmount: v.fineAmount || v.fine || 1000,
                confidence: v.confidence || 0.85,
                status: v.status || 'detected',
                timestamp: v.savedAt || v.timestamp || new Date().toISOString(),
                createdAt: v.savedAt || new Date().toISOString(),
                isSaved: true
              });
            }
          });
        } catch (e) {
          console.warn('Error reading saved violations:', e);
        }
        
        setRecentViolations(Array.isArray(recentData) ? recentData : []);
        setCurrentPage(1); // reset to first page on new data
        generateDailyData(Array.isArray(recentData) ? recentData : []);
        
        window.dispatchEvent(new CustomEvent('dashboardDataLoaded', { 
          detail: responseData 
        }));
        
      } else {
        throw new Error(response?.error || 'Failed to load dashboard data');
      }
    } catch (err) {
      console.error('❌ Dashboard Error:', err);
      
      if (err.code === 'ERR_NETWORK' || err.message?.includes('Network Error')) {
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
      const vDate = new Date(v.timestamp || v.createdAt || v.savedAt);
      const vDateStr = vDate.toDateString();
      const dayData = last7Days.find(d => d.date === vDateStr);
      if (dayData) dayData.count++;
    });
    
    setDailyData(last7Days);
  };

  // Load data on component mount
  useEffect(() => {
    fetchDashboardData();
    
    const interval = setInterval(fetchDashboardData, 30000);
    
    const handleViolationsUpdate = () => {
      console.log('🔄 Violations updated, refreshing dashboard...');
      fetchDashboardData();
    };
    
    window.addEventListener('violationsUpdated', handleViolationsUpdate);
    window.addEventListener('violationSaved', handleViolationsUpdate);
    window.addEventListener('violationsBatchSaved', handleViolationsUpdate);
    
    return () => {
      clearInterval(interval);
      window.removeEventListener('violationsUpdated', handleViolationsUpdate);
      window.removeEventListener('violationSaved', handleViolationsUpdate);
      window.removeEventListener('violationsBatchSaved', handleViolationsUpdate);
    };
  }, [fetchDashboardData]);

  // Retry handler
  const handleRetry = () => {
    setRetryCount(prev => prev + 1);
  };

  // Action handlers for table
  const handleViewViolation = (id) => {
    if (id) {
      navigate(`/violations?view=${id}`);
    }
  };

  const handleEditViolation = (id) => {
    if (id) {
      navigate(`/violations?edit=${id}`);
    }
  };

  const handleDeleteViolation = async (id) => {
    if (!id) return;
    
    if (window.confirm('Are you sure you want to delete this violation?')) {
      try {
        // Try API delete
        try {
          await violationsAPI.delete(id);
        } catch (apiErr) {
          console.warn('API delete failed:', apiErr.message);
        }
        
        // Remove from localStorage
        const savedViolations = JSON.parse(localStorage.getItem(SAVED_VIOLATIONS_KEY) || '[]');
        const filtered = savedViolations.filter(v => 
          v._id !== id && v.violationId !== id
        );
        localStorage.setItem(SAVED_VIOLATIONS_KEY, JSON.stringify(filtered));
        
        // Update state
        setRecentViolations(prev => prev.filter(v => 
          v._id !== id && v.violationId !== id
        ));
        
        window.dispatchEvent(new CustomEvent('violationsUpdated'));
        alert('✅ Violation deleted successfully!');
        fetchDashboardData();
      } catch (err) {
        console.error('Delete error:', err);
        alert('Failed to delete violation');
      }
    }
  };

  // Pagination helpers
  const totalPages = Math.ceil(recentViolations.length / itemsPerPage);
  const paginatedViolations = recentViolations.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  const handlePrevPage = () => {
    setCurrentPage(prev => Math.max(prev - 1, 1));
  };

  const handleNextPage = () => {
    setCurrentPage(prev => Math.min(prev + 1, totalPages));
  };

  // Prepare chart data
  const violationTypeLabels = {
    no_helmet: 'No Helmet',
    triple_riding: 'Triple Riding',
    overloading: 'Overloading',
    wrong_route: 'Wrong Route',
    wrong_parking: 'Wrong Parking'
  };

  const chartColors = [
    'rgba(231, 76, 60, 0.7)',
    'rgba(52, 152, 219, 0.7)',
    'rgba(241, 196, 15, 0.7)',
    'rgba(46, 204, 113, 0.7)',
    'rgba(155, 89, 182, 0.7)',
  ];

  const chartBorderColors = [
    'rgba(231, 76, 60, 1)',
    'rgba(52, 152, 219, 1)',
    'rgba(241, 196, 15, 1)',
    'rgba(46, 204, 113, 1)',
    'rgba(155, 89, 182, 1)',
  ];

  const violationsChartData = {
    labels: byType.map(item => violationTypeLabels[item._id] || item._id?.replace(/_/g, ' ') || 'Unknown'),
    datasets: [{
      label: 'Number of Violations',
      data: byType.map(item => item.count || 0),
      backgroundColor: chartColors.slice(0, byType.length),
      borderColor: chartBorderColors.slice(0, byType.length),
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
      wrong_route: 'success',
      wrong_parking: 'primary'
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
      <div className="dashboard-loading text-center py-5">
        <Spinner animation="border" variant="primary" style={{width: '3rem', height: '3rem'}} />
        <h4 className="mt-4">Loading Dashboard</h4>
        <p className="text-muted">Fetching latest traffic violation data...</p>
      </div>
    );
  }

  return (
    <div className="dashboard-container">
      {/* Header */}
      <div className="dashboard-header d-flex justify-content-between align-items-center mb-4">
        <div>
          <h2 className="dashboard-title mb-1">
            {userRole === 'admin' ? '🚔 Traffic Control Dashboard' : '📊 Violation Dashboard'}
          </h2>
          <p className="dashboard-subtitle text-muted mb-0">
            Welcome back, <strong>{user.fullName || user.username || 'User'}</strong>
            {userRole === 'admin' && (
              <Badge bg="danger" className="ms-2">ADMIN</Badge>
            )}
          </p>
        </div>
        <div className="d-flex gap-2">
          <Button 
            variant="outline-primary" 
            onClick={handleRetry}
            disabled={loading}
          >
            {loading ? <Spinner animation="border" size="sm" className="me-1" /> : <FaSync className="me-1" />}
            Refresh
          </Button>
          {userRole === 'admin' && (
            <Button 
              variant="primary" 
              onClick={() => navigate('/upload')}
            >
              <FaCloudUploadAlt className="me-1" />
              New Upload
            </Button>
          )}
        </div>
      </div>

      {/* Error Alert */}
      {error && (
        <Alert variant="danger" className="mb-4">
          <div className="d-flex align-items-center">
            <FaExclamationTriangle className="me-3 fs-4" />
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
      <Row className="g-3 mb-4">
        <Col xl={3} md={6}>
          <Card className="stat-card border-0 shadow-sm h-100">
            <Card.Body className="d-flex align-items-center">
              <div className="stat-icon me-3" style={{fontSize: '2rem', color: '#dc3545'}}>
                <FaExclamationTriangle />
              </div>
              <div>
                <Card.Title className="stat-label text-muted small mb-1">Total Violations</Card.Title>
                <h2 className="stat-value mb-0">{formatNumber(stats.totalViolations)}</h2>
                <small className="text-muted">All time records</small>
              </div>
            </Card.Body>
          </Card>
        </Col>
        <Col xl={3} md={6}>
          <Card className="stat-card border-0 shadow-sm h-100">
            <Card.Body className="d-flex align-items-center">
              <div className="stat-icon me-3" style={{fontSize: '2rem', color: '#0d6efd'}}>
                <FaCalendarCheck />
              </div>
              <div>
                <Card.Title className="stat-label text-muted small mb-1">Today's Violations</Card.Title>
                <h2 className="stat-value mb-0">{formatNumber(stats.todayViolations)}</h2>
                <small className="text-muted">Last 24 hours</small>
              </div>
            </Card.Body>
          </Card>
        </Col>
        <Col xl={3} md={6}>
          <Card className="stat-card border-0 shadow-sm h-100">
            <Card.Body className="d-flex align-items-center">
              <div className="stat-icon me-3" style={{fontSize: '2rem', color: '#ffc107'}}>
                <FaHourglassHalf />
              </div>
              <div>
                <Card.Title className="stat-label text-muted small mb-1">Pending Review</Card.Title>
                <h2 className="stat-value mb-0">{formatNumber(stats.pendingReview)}</h2>
                <small className="text-muted">Awaiting action</small>
              </div>
            </Card.Body>
          </Card>
        </Col>
        <Col xl={3} md={6}>
          <Card className="stat-card border-0 shadow-sm h-100">
            <Card.Body className="d-flex align-items-center">
              <div className="stat-icon me-3" style={{fontSize: '2rem', color: '#198754'}}>
                <FaMoneyBillWave />
              </div>
              <div>
                <Card.Title className="stat-label text-muted small mb-1">Total Fines</Card.Title>
                <h2 className="stat-value mb-0">{formatCurrency(stats.totalFines)}</h2>
                <small className="text-muted">Amount collected</small>
              </div>
            </Card.Body>
          </Card>
        </Col>
      </Row>

      {/* Charts */}
      <Row className="g-3 mb-4">
        <Col lg={6}>
          <Card className="chart-card shadow-sm h-100">
            <Card.Header className="bg-white">
              <h5 className="mb-0"><FaChartBar className="me-2" />Violations by Type</h5>
            </Card.Header>
            <Card.Body>
              <div style={{height: '300px'}}>
                {byType.length > 0 ? (
                  <Bar data={violationsChartData} options={chartOptions} />
                ) : (
                  <div className="text-center py-5 text-muted">
                    <FaChartBar size={40} />
                    <p>No violation data available</p>
                  </div>
                )}
              </div>
            </Card.Body>
          </Card>
        </Col>
        <Col lg={6}>
          <Card className="chart-card shadow-sm h-100">
            <Card.Header className="bg-white">
              <h5 className="mb-0"><FaChartLine className="me-2" />Daily Trend (7 Days)</h5>
            </Card.Header>
            <Card.Body>
              <div style={{height: '300px'}}>
                {dailyData.some(d => d.count > 0) ? (
                  <Line data={dailyChartData} options={chartOptions} />
                ) : (
                  <div className="text-center py-5 text-muted">
                    <FaChartLine size={40} />
                    <p>No data for last 7 days</p>
                  </div>
                )}
              </div>
            </Card.Body>
          </Card>
        </Col>
      </Row>

      {/* Recent Violations Table with Pagination */}
      <Card className="shadow-sm">
        <Card.Header className="bg-white d-flex justify-content-between align-items-center">
          <h5 className="mb-0"><FaListUl className="me-2" />Recent Violations</h5>
          <div className="d-flex gap-2">
            <Button variant="outline-primary" size="sm" onClick={() => navigate('/violations')}>
              View All
            </Button>
            <Button variant="outline-secondary" size="sm" onClick={handleRetry}>
              <FaSync />
            </Button>
          </div>
        </Card.Header>
        <Card.Body className="p-0">
          <div className="table-responsive">
            <Table hover className="violations-table mb-0">
              <thead className="table-light">
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
                {paginatedViolations.length > 0 ? (
                  paginatedViolations.map((violation, index) => {
                    const vid = violation._id || violation.violationId || `idx-${index}`;
                    return (
                      <tr key={vid}>
                        <td>
                          <small className="text-muted font-monospace">
                            #{(vid).toString().slice(-6)}
                          </small>
                          {violation.isSaved && (
                            <Badge bg="info" className="ms-1" style={{fontSize:'0.6rem'}}>SAVED</Badge>
                          )}
                        </td>
                        <td>
                          <Badge bg={getTypeBadge(violation.type)}>
                            {formatViolationType(violation.type)}
                          </Badge>
                        </td>
                        <td>
                          <div className="fw-semibold">
                            {violation.vehicleNumber || 'N/A'}
                          </div>
                        </td>
                        <td>
                          <div className="d-flex align-items-center gap-2">
                            <div className="progress flex-grow-1" style={{height:'6px', maxWidth:'60px'}}>
                              <div 
                                className={`progress-bar bg-${(violation.confidence||0.85)>0.8?'success':'warning'}`}
                                style={{width:`${(violation.confidence||0.85)*100}%`}}
                              />
                            </div>
                            <small>{Math.round((violation.confidence||0.85)*100)}%</small>
                          </div>
                        </td>
                        <td>
                          <Badge bg={getStatusColor(violation.status)}>
                            {violation.status || 'Detected'}
                          </Badge>
                        </td>
                        <td><small>{formatDate(violation.timestamp || violation.createdAt)}</small></td>
                        <td><small className="text-muted">{formatTime(violation.timestamp || violation.createdAt)}</small></td>
                        <td>
                          <span className="fw-bold text-success">
                            ₹{(violation.fineAmount || 0).toLocaleString('en-IN')}
                          </span>
                        </td>
                        <td>
                          <div className="d-flex gap-1">
                            <Button 
                              variant="outline-primary" 
                              size="sm"
                              onClick={() => handleViewViolation(vid)}
                              title="View Details"
                            >
                              <FaEye />
                            </Button>
                            <Button 
                              variant="outline-warning" 
                              size="sm"
                              onClick={() => handleEditViolation(vid)}
                              title="Edit"
                            >
                              <FaEdit />
                            </Button>
                            <Button 
                              variant="outline-danger" 
                              size="sm"
                              onClick={() => handleDeleteViolation(vid)}
                              title="Delete"
                            >
                              <FaTrash />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                ) : (
                  <tr>
                    <td colSpan={9}>
                      <div className="text-center py-5">
                        <FaInbox size={50} className="text-muted" />
                        <h5 className="mt-3">No Violations Yet</h5>
                        <p className="text-muted">Traffic violations will appear here once detected</p>
                        {userRole === 'admin' && (
                          <Button variant="primary" onClick={() => navigate('/upload')}>
                            <FaCloudUploadAlt className="me-2" />
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

          {/* Pagination controls */}
          {recentViolations.length > 0 && (
            <div className="d-flex justify-content-between align-items-center p-3 border-top">
              <Button 
                variant="outline-secondary" 
                size="sm"
                onClick={handlePrevPage}
                disabled={currentPage === 1}
              >
                <FaChevronLeft className="me-1" /> Previous
              </Button>
              <span className="text-muted">
                Page {currentPage} of {totalPages}
              </span>
              <Button 
                variant="outline-secondary" 
                size="sm"
                onClick={handleNextPage}
                disabled={currentPage === totalPages}
              >
                Next <FaChevronRight className="ms-1" />
              </Button>
            </div>
          )}
        </Card.Body>
      </Card>
    </div>
  );
};

export default Dashboard;