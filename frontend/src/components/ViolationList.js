import React, { useState, useEffect, useCallback } from 'react';
import { 
  Table, 
  Card, 
  Form, 
  Button, 
  Badge, 
  InputGroup,
  Row,
  Col,
  Spinner,
  Alert 
} from 'react-bootstrap';
import { violationsAPI } from '../api/api';
import { getFineAmount, getFineDescription } from '../utils/trafficFines';
import './ViolationList.css'; // ✅ ADD THIS LINE - Import the CSS

const ViolationList = () => {
  const [violations, setViolations] = useState([]);
  const [filteredViolations, setFilteredViolations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filterType, setFilterType] = useState('all');
  const [filterStatus, setFilterStatus] = useState('all');
  const [search, setSearch] = useState('');
  const [pagination, setPagination] = useState({
    page: 1,
    limit: 10,
    total: 0,
    pages: 1
  });
  
  const userRole = localStorage.getItem('userRole') || 'viewer';
  const user = JSON.parse(localStorage.getItem('user') || '{}');

  const fetchViolations = useCallback(async () => {
    try {
      setLoading(true);
      
      const params = {
        page: pagination.page,
        limit: pagination.limit
      };
      
      if (filterType !== 'all') params.type = filterType;
      if (filterStatus !== 'all') params.status = filterStatus;
      
      console.log('Fetching violations with params:', params);
      
      const response = await violationsAPI.getAll(params);
      
      if (response.success) {
        let fetchedViolations = response.violations || [];
        
        if (userRole === 'viewer' && user.vehicleNumber) {
          fetchedViolations = fetchedViolations.filter(
            v => v.vehicleNumber === user.vehicleNumber
          );
        }
        
        setViolations(fetchedViolations);
        setFilteredViolations(fetchedViolations);
        
        if (userRole === 'viewer' && user.vehicleNumber) {
          const totalFiltered = fetchedViolations.length;
          setPagination({
            ...response.pagination,
            total: totalFiltered,
            pages: Math.ceil(totalFiltered / pagination.limit)
          });
        } else {
          setPagination(response.pagination || {
            page: 1,
            limit: 10,
            total: fetchedViolations.length,
            pages: Math.ceil(fetchedViolations.length / pagination.limit)
          });
        }
        
        setError('');
        console.log(`✅ Loaded ${fetchedViolations.length} violations`);
      } else {
        setError('Failed to load violations');
      }
    } catch (err) {
      setError('Error connecting to server');
      console.error('Error fetching violations:', err);
    } finally {
      setLoading(false);
    }
  }, [pagination.page, pagination.limit, filterType, filterStatus, userRole, user.vehicleNumber]);

  useEffect(() => {
    fetchViolations();
  }, [fetchViolations]);

  useEffect(() => {
    const handleViolationsUpdate = () => {
      console.log('🔄 Violations updated, refreshing list...');
      setPagination(prev => ({ ...prev, page: 1 }));
      fetchViolations();
    };
    
    window.addEventListener('violationsUpdated', handleViolationsUpdate);
    return () => window.removeEventListener('violationsUpdated', handleViolationsUpdate);
  }, [fetchViolations]);

  useEffect(() => {
    let filtered = [...violations];
    
    if (search.trim()) {
      const searchLower = search.toLowerCase();
      filtered = filtered.filter(v => 
        (v.vehicleNumber && v.vehicleNumber.toLowerCase().includes(searchLower)) ||
        (v.violationId && v.violationId.toLowerCase().includes(searchLower)) ||
        (v._id && v._id.toLowerCase().includes(searchLower))
      );
    }
    
    setFilteredViolations(filtered);
  }, [violations, search]);

  const updateStatus = async (id, newStatus) => {
    if (userRole !== 'admin') {
      alert('Only Traffic Authorities can update violation status');
      return;
    }
    
    try {
      const response = await violationsAPI.update(id, { status: newStatus });
      
      if (response.success) {
        const updatedViolations = violations.map(v => 
          (v.violationId === id || v._id === id) ? { ...v, status: newStatus } : v
        );
        setViolations(updatedViolations);
        window.dispatchEvent(new CustomEvent('violationsUpdated'));
        alert(`Status updated to ${newStatus}`);
      } else {
        alert('Failed to update status');
      }
    } catch (error) {
      console.error('Error updating status:', error);
      alert('Failed to update status');
    }
  };

  const getDisplayFineAmount = (violation) => {
    if (violation.fineAmount) return violation.fineAmount;
    if (violation.fine) return violation.fine;
    if (violation.amount) return violation.amount;
    
    const violationType = violation.type || violation.violationType || violation.violation_type;
    return getFineAmount(violationType);
  };

  const handlePageChange = (newPage) => {
    setPagination(prev => ({
      ...prev,
      page: newPage
    }));
  };

  const handleFilterTypeChange = (e) => {
    setFilterType(e.target.value);
    setPagination(prev => ({ ...prev, page: 1 }));
  };

  const handleFilterStatusChange = (e) => {
    setFilterStatus(e.target.value);
    setPagination(prev => ({ ...prev, page: 1 }));
  };

  const handleRefresh = () => {
    fetchViolations();
  };

  const getStatusBadge = (status) => {
    const colors = {
      detected: 'warning',
      reviewed: 'info',
      fined: 'success',
      appealed: 'danger',
      dismissed: 'secondary',
      pending: 'warning'
    };
    return <Badge bg={colors[status] || 'secondary'}>{status ? status.toUpperCase() : 'DETECTED'}</Badge>;
  };

  const getTypeBadge = (type) => {
    const colors = {
      signal_violation: 'danger',
      overspeeding: 'warning',
      no_seatbelt: 'info',
      triple_riding: 'secondary',
      wrong_route: 'primary',
      no_helmet: 'dark',
      driving_without_licence: 'danger',
      driving_without_license: 'danger',
      driving_without_insurance: 'warning',
      mobile_phone_usage: 'info',
      drunk_driving: 'danger',
      dangerous_driving: 'danger',
      wrong_parking: 'secondary',
      no_puc: 'info'
    };
    const label = type ? type.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ') : 'Unknown';
    return <Badge bg={colors[type] || 'secondary'}>{label}</Badge>;
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

  if (loading && violations.length === 0) {
    return (
      <div className="text-center mt-5">
        <Spinner animation="border" variant="primary" />
        <p className="mt-3">Loading violations...</p>
      </div>
    );
  }

  return (
    <div>
      <h2 className="mb-4">
        Violations List
        {userRole === 'viewer' && user.vehicleNumber && (
          <small className="text-muted ms-3">
            Showing violations for: {user.vehicleNumber}
          </small>
        )}
      </h2>
      
      {error && <Alert variant="danger">{error}</Alert>}

      <Row className="mb-3">
        <Col md={3}>
          <Card className="text-center bg-light">
            <Card.Body>
              <h5>Total Violations</h5>
              <h3>{pagination.total}</h3>
            </Card.Body>
          </Card>
        </Col>
        <Col md={3}>
          <Card className="text-center bg-light">
            <Card.Body>
              <h5>Displaying</h5>
              <h3>{filteredViolations.length}</h3>
            </Card.Body>
          </Card>
        </Col>
        <Col md={6}>
          <Card className="bg-light">
            <Card.Body>
              <div className="d-flex justify-content-between align-items-center">
                <span>Page {pagination.page} of {pagination.pages || 1}</span>
                <Button 
                  variant="outline-primary" 
                  size="sm"
                  onClick={handleRefresh}
                  disabled={loading}
                >
                  {loading ? (
                    <>
                      <Spinner size="sm" animation="border" className="me-2" />
                      Loading...
                    </>
                  ) : (
                    '↻ Refresh'
                  )}
                </Button>
              </div>
            </Card.Body>
          </Card>
        </Col>
      </Row>
      
      <Card className="mb-4">
        <Card.Body>
          <Card.Title>Filters</Card.Title>
          <Row>
            <Col md={3}>
              <Form.Group>
                <Form.Label>Violation Type</Form.Label>
                <Form.Select 
                  value={filterType} 
                  onChange={handleFilterTypeChange}
                >
                  <option value="all">All Types</option>
                  <option value="signal_violation">Overloading</option>
                  <option value="triple_riding">Triple Riding</option>
                  <option value="no_helmet">No Helmet</option>
                </Form.Select>
              </Form.Group>
            </Col>
            <Col md={3}>
              <Form.Group>
                <Form.Label>Status</Form.Label>
                <Form.Select 
                  value={filterStatus} 
                  onChange={handleFilterStatusChange}
                >
                  <option value="all">All Status</option>
                  <option value="detected">Detected</option>
                  <option value="reviewed">Reviewed</option>
                  <option value="fined">Fined</option>
                  <option value="appealed">Appealed</option>
                  <option value="dismissed">Dismissed</option>
                </Form.Select>
              </Form.Group>
            </Col>
            <Col md={6}>
              <Form.Group>
                <Form.Label>Search</Form.Label>
                <InputGroup>
                  <Form.Control
                    type="text"
                    placeholder="Search by Vehicle Number or ID..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                  {search && (
                    <Button variant="outline-secondary" onClick={() => setSearch('')}>
                      Clear
                    </Button>
                  )}
                </InputGroup>
              </Form.Group>
            </Col>
          </Row>
          <Row className="mt-2">
            <Col>
              <small className="text-muted">
                {filteredViolations.length} violation(s) found
                {(filterType !== 'all' || filterStatus !== 'all' || search) && 
                  ` (filtered from ${violations.length} total)`}
              </small>
            </Col>
          </Row>
        </Card.Body>
      </Card>

      <Card>
        <Card.Body>
          <Card.Title className="d-flex justify-content-between align-items-center">
            <span>Violations ({filteredViolations.length})</span>
            {userRole === 'admin' && (
              <Button variant="primary" onClick={() => window.location.href = '/upload'}>
                + Upload New
              </Button>
            )}
          </Card.Title>
          
          <div className="table-responsive">
            <Table hover>
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Type</th>
                  <th>Vehicle</th>
                  <th>Location</th>
                  <th>Date & Time</th>
                  <th>Confidence</th>
                  <th>Status</th>
                  <th>Fine</th>
                  {userRole === 'admin' && <th>Actions</th>}
                </tr>
              </thead>
              <tbody>
                {filteredViolations.length === 0 ? (
                  <tr>
                    <td colSpan={userRole === 'admin' ? 9 : 8} className="text-center py-4">
                      <p className="text-muted mb-2">No violations found</p>
                      {violations.length > 0 ? (
                        <p className="text-muted small">Try clearing filters or search</p>
                      ) : userRole === 'viewer' ? (
                        <p className="text-muted small">No violations found for your vehicle number</p>
                      ) : (
                        <Button variant="primary" size="sm" href="/upload">
                          Upload your first violation
                        </Button>
                      )}
                    </td>
                  </tr>
                ) : (
                  filteredViolations.map((violation) => {
                    const fineAmount = getDisplayFineAmount(violation);
                    const violationType = violation.type || violation.violationType || 'Unknown';
                    
                    return (
                      <tr key={violation._id || violation.violationId || Math.random()}>
                        <td>
                          <small className="text-muted">
                            {(violation.violationId || violation._id || '').slice(0, 8)}...
                          </small>
                        </td>
                        <td>
                          {getTypeBadge(violationType)}
                          <small 
                            className="d-block text-muted mt-1" 
                            style={{ fontSize: '10px' }}
                            title={getFineDescription(violationType)}
                          >
                            {getFineDescription(violationType).split('-')[0].trim()}
                          </small>
                        </td>
                        <td>
                          <div><strong>{violation.vehicleNumber || 'N/A'}</strong></div>
                          <small className="text-muted">{violation.vehicleType || 'Unknown'}</small>
                        </td>
                        <td>
                          <small>{violation.location?.address || violation.location || 'N/A'}</small>
                        </td>
                        <td>
                          <small>{formatDate(violation.timestamp || violation.createdAt)}</small>
                        </td>
                        <td>
                          <div className="d-flex align-items-center">
                            <div className="progress flex-grow-1 me-2" style={{ height: '6px', width: '60px' }}>
                              <div 
                                className={`progress-bar bg-${(violation.confidence || 0.8) > 0.8 ? 'success' : 'warning'}`}
                                style={{ width: `${(violation.confidence || 0.8) * 100}%` }}
                              />
                            </div>
                            <small>{Math.round((violation.confidence || 0.8) * 100)}%</small>
                          </div>
                        </td>
                        <td>{getStatusBadge(violation.status)}</td>
                        <td>
                          <strong className="text-success">
                            ₹{fineAmount.toLocaleString()}
                          </strong>
                        </td>
                        {userRole === 'admin' && (
                          <td>
                            <div className="btn-group">
                              <Button 
                                size="sm" 
                                variant="outline-primary" 
                                onClick={() => console.log(violation)}
                              >
                                View
                              </Button>
                              {violation.status !== 'fined' && (
                                <Button 
                                  size="sm" 
                                  variant="outline-success"
                                  onClick={() => updateStatus(violation.violationId || violation._id, 'fined')}
                                >
                                  Mark Fined
                                </Button>
                              )}
                            </div>
                          </td>
                        )}
                      </tr>
                    );
                  })
                )}
              </tbody>
            </Table>
          </div>

          {pagination.pages > 1 && (
            <div className="d-flex justify-content-center align-items-center mt-3">
              <Button
                variant="outline-primary"
                size="sm"
                disabled={pagination.page === 1 || loading}
                onClick={() => handlePageChange(pagination.page - 1)}
                className="me-2"
              >
                Previous
              </Button>
              <span className="mx-3">
                Page {pagination.page} of {pagination.pages}
              </span>
              <Button
                variant="outline-primary"
                size="sm"
                disabled={pagination.page === pagination.pages || loading}
                onClick={() => handlePageChange(pagination.page + 1)}
                className="ms-2"
              >
                Next
              </Button>
            </div>
          )}
        </Card.Body>
      </Card>
    </div>
  );
};

export default ViolationList;