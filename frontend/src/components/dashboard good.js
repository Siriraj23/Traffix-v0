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
  const [recentViolations, setRecentViolations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [retryCount, setRetryCount] = useState(0);
  
  // Violations data for charts - calculated from ALL violations
  const [violationsChartData, setViolationsChartData] = useState({
    labels: ['Helmet Violation', 'Triple Riding', 'Overloading'],
    datasets: [{
      label: 'Number of Violations',
      data: [0, 0, 0],
      backgroundColor: [
        'rgba(255, 99, 132, 0.7)',
        'rgba(54, 162, 235, 0.7)',
        'rgba(255, 206, 86, 0.7)'
      ],
      borderColor: [
        'rgba(255, 99, 132, 1)',
        'rgba(54, 162, 235, 1)',
        'rgba(255, 206, 86, 1)'
      ],
      borderWidth: 2,
      borderRadius: 8,
    }]
  });

  // 24-hour trend data
  const [trendChartData, setTrendChartData] = useState({
    labels: [],
    datasets: [
      {
        label: 'Helmet Violations',
        data: [],
        borderColor: 'rgb(255, 99, 132)',
        backgroundColor: 'rgba(255, 99, 132, 0.1)',
        tension: 0.4,
        fill: false,
        pointRadius: 4,
        pointHoverRadius: 6,
        borderWidth: 2,
      },
      {
        label: 'Triple Riding',
        data: [],
        borderColor: 'rgb(54, 162, 235)',
        backgroundColor: 'rgba(54, 162, 235, 0.1)',
        tension: 0.4,
        fill: false,
        pointRadius: 4,
        pointHoverRadius: 6,
        borderWidth: 2,
      },
      {
        label: 'Overloading',
        data: [],
        borderColor: 'rgb(255, 206, 86)',
        backgroundColor: 'rgba(255, 206, 86, 0.1)',
        tension: 0.4,
        fill: false,
        pointRadius: 4,
        pointHoverRadius: 6,
        borderWidth: 2,
      }
    ]
  });

  // ---- Pagination state ----
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 5;
  // -------------------------

  // Function to calculate total fines from ALL violations
  const calculateTotalFines = (violations) => {
    if (!violations || !Array.isArray(violations)) return 0;
    return violations.reduce((total, v) => {
      return total + (v.fineAmount || v.fine || 0);
    }, 0);
  };

  // Function to count violations by type from ALL violations
  const countViolationsByType = (violations) => {
    if (!violations || !Array.isArray(violations)) {
      return { no_helmet: 0, triple_riding: 0, overloading: 0 };
    }
    
    const counts = {
      no_helmet: 0,
      triple_riding: 0,
      overloading: 0
    };
    
    violations.forEach(v => {
      const type = v.type?.toLowerCase();
      if (type === 'no_helmet') counts.no_helmet++;
      if (type === 'triple_riding') counts.triple_riding++;
      if (type === 'overloading') counts.overloading++;
    });
    
    return counts;
  };

  // Function to process violations data for 24-hour trend chart
  const processViolationsTrend = (violations) => {
    if (!violations || !Array.isArray(violations)) return;
    
    const now = new Date();
    const last24Hours = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    
    // Create hourly intervals for last 24 hours
    const hourlyData = [];
    for (let i = 23; i >= 0; i--) {
      const hourDate = new Date(now.getTime() - i * 60 * 60 * 1000);
      hourlyData.push({
        hour: hourDate.getHours(),
        label: `${String(hourDate.getHours()).padStart(2, '0')}:00`,
        timestamp: hourDate,
        helmet: 0,
        tripleRiding: 0,
        overloading: 0
      });
    }
    
    // Process violations into hourly buckets
    violations.forEach(v => {
      const vDate = new Date(v.timestamp || v.createdAt || v.savedAt);
      if (vDate >= last24Hours) {
        const hourIndex = hourlyData.findIndex(h => {
          const hDate = new Date(h.timestamp);
          return vDate.getHours() === hDate.getHours() && 
                 vDate.getDate() === hDate.getDate() &&
                 vDate.getMonth() === hDate.getMonth();
        });
        
        if (hourIndex !== -1) {
          const type = v.type?.toLowerCase();
          if (type === 'no_helmet') hourlyData[hourIndex].helmet++;
          else if (type === 'triple_riding') hourlyData[hourIndex].tripleRiding++;
          else if (type === 'overloading') hourlyData[hourIndex].overloading++;
        }
      }
    });
    
    setTrendChartData({
      labels: hourlyData.map(h => h.label),
      datasets: [
        {
          label: 'Helmet Violations',
          data: hourlyData.map(h => h.helmet),
          borderColor: 'rgb(255, 99, 132)',
          backgroundColor: 'rgba(255, 99, 132, 0.1)',
          tension: 0.4,
          fill: false,
          pointRadius: 4,
          pointHoverRadius: 6,
          borderWidth: 2,
        },
        {
          label: 'Triple Riding',
          data: hourlyData.map(h => h.tripleRiding),
          borderColor: 'rgb(54, 162, 235)',
          backgroundColor: 'rgba(54, 162, 235, 0.1)',
          tension: 0.4,
          fill: false,
          pointRadius: 4,
          pointHoverRadius: 6,
          borderWidth: 2,
        },
        {
          label: 'Overloading',
          data: hourlyData.map(h => h.overloading),
          borderColor: 'rgb(255, 206, 86)',
          backgroundColor: 'rgba(255, 206, 86, 0.1)',
          tension: 0.4,
          fill: false,
          pointRadius: 4,
          pointHoverRadius: 6,
          borderWidth: 2,
        }
      ]
    });
  };

  // Fetch ALL violations from API and localStorage
  const fetchAllViolations = useCallback(async () => {
    try {
      let allViolationsArray = [];
      
      // Fetch from API - try to get all violations
      try {
        const response = await violationsAPI.getAll({ limit: 10000 });
        if (response.success) {
          allViolationsArray = response.data?.data || response.data?.violations || response.data || [];
          if (!Array.isArray(allViolationsArray)) {
            allViolationsArray = [];
          }
        }
      } catch (apiErr) {
        console.warn('API fetch for all violations failed:', apiErr.message);
      }
      
      // Add saved violations from localStorage
      try {
        const savedViolations = JSON.parse(localStorage.getItem(SAVED_VIOLATIONS_KEY) || '[]');
        if (Array.isArray(savedViolations)) {
          savedViolations.forEach(v => {
            const exists = allViolationsArray.find(rv => 
              (rv.vehicleNumber === v.vehicleNumber) && 
              (rv.type === v.type) &&
              (rv.timestamp === v.savedAt || rv.createdAt === v.savedAt)
            );
            if (!exists) {
              allViolationsArray.push({
                _id: v._id || `local_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
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
        }
      } catch (e) {
        console.warn('Error reading saved violations:', e);
      }
      
      console.log(`📊 Total violations fetched: ${allViolationsArray.length}`);
      
      // Calculate total fines from ALL violations
      const totalFines = calculateTotalFines(allViolationsArray);
      
      // Count violations by type for bar chart
      const typeCounts = countViolationsByType(allViolationsArray);
      
      // Update bar chart data with real counts from ALL violations
      setViolationsChartData({
        labels: ['Helmet Violation', 'Triple Riding', 'Overloading'],
        datasets: [{
          label: 'Number of Violations',
          data: [typeCounts.no_helmet, typeCounts.triple_riding, typeCounts.overloading],
          backgroundColor: [
            'rgba(255, 99, 132, 0.7)',
            'rgba(54, 162, 235, 0.7)',
            'rgba(255, 206, 86, 0.7)'
          ],
          borderColor: [
            'rgba(255, 99, 132, 1)',
            'rgba(54, 162, 235, 1)',
            'rgba(255, 206, 86, 1)'
          ],
          borderWidth: 2,
          borderRadius: 8,
        }]
      });
      
      // Process 24-hour trend data
      processViolationsTrend(allViolationsArray);
      
      // Update stats with calculated values
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);
      const todayViolations = allViolationsArray.filter(v => {
        const vDate = new Date(v.timestamp || v.createdAt || v.savedAt);
        return vDate >= todayStart;
      }).length;
      
      const pendingReview = allViolationsArray.filter(v => 
        v.status?.toLowerCase() === 'pending' || v.status?.toLowerCase() === 'detected'
      ).length;
      
      setStats(prev => ({
        totalViolations: allViolationsArray.length,
        todayViolations: todayViolations,
        pendingReview: pendingReview,
        totalFines: totalFines
      }));
      
      return allViolationsArray;
    } catch (err) {
      console.error('Error in fetchAllViolations:', err);
      return [];
    }
  }, []);

  // Fetch dashboard data from backend
  const fetchDashboardData = useCallback(async () => {
    try {
      setLoading(true);
      setError('');
      
      console.log(`📊 Fetching dashboard data... (Attempt ${retryCount + 1})`);
      
      const response = await dashboardAPI.getStats();
      console.log('✅ API Response:', response);
      
      if (response && response.success) {
        const responseData = response.data || response;
        
        setStats(prev => ({
          totalViolations: responseData.stats?.totalViolations || prev.totalViolations,
          todayViolations: responseData.stats?.todayViolations || prev.todayViolations,
          pendingReview: responseData.stats?.pendingReview || prev.pendingReview,
          totalFines: prev.totalFines // Will be updated by fetchAllViolations
        }));
        
        // Fetch recent violations for table display
        const recentResponse = await dashboardAPI.getRecentViolations(10);
        let recentData = [];
        
        if (recentResponse.success) {
          recentData = recentResponse.data?.data || recentResponse.data || [];
          if (!Array.isArray(recentData)) {
            recentData = recentResponse.data?.violations || [];
          }
        }
        
        // Add saved violations from localStorage for recent data
        try {
          const savedViolations = JSON.parse(localStorage.getItem(SAVED_VIOLATIONS_KEY) || '[]');
          if (Array.isArray(savedViolations)) {
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
          }
        } catch (e) {
          console.warn('Error reading saved violations:', e);
        }
        
        setRecentViolations(Array.isArray(recentData) ? recentData : []);
        setCurrentPage(1);
        
        // Fetch ALL violations for calculations and chart data
        await fetchAllViolations();
        
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
  }, [retryCount, fetchAllViolations]);

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
    if (!status) return 'light';
    switch(status.toLowerCase()) {
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
                <small className="text-muted">From all violations</small>
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
              <h5 className="mb-0"><FaChartBar className="me-2" />Violations by Type (All Violations)</h5>
            </Card.Header>
            <Card.Body>
              <div style={{height: '300px'}}>
                <Bar data={violationsChartData} options={chartOptions} />
              </div>
              <div className="mt-2 text-muted small text-center">
                Total: Helmet ({violationsChartData.datasets[0].data[0]}) | 
                Triple Riding ({violationsChartData.datasets[0].data[1]}) | 
                Overloading ({violationsChartData.datasets[0].data[2]})
              </div>
            </Card.Body>
          </Card>
        </Col>
        <Col lg={6}>
          <Card className="chart-card shadow-sm h-100">
            <Card.Header className="bg-white">
              <h5 className="mb-0"><FaChartLine className="me-2" />Violations Trend (24 Hours)</h5>
            </Card.Header>
            <Card.Body>
              <div style={{height: '300px'}}>
                {trendChartData.labels && trendChartData.labels.length > 0 ? (
                  <Line data={trendChartData} options={chartOptions} />
                ) : (
                  <div className="text-center py-5 text-muted">
                    <FaChartLine size={40} />
                    <p>No trend data available</p>
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