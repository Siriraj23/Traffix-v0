import React, { useState, useEffect, useCallback } from 'react';
import { Table, Card, Form, Button, Badge, InputGroup, Row, Col, Spinner, Alert } from 'react-bootstrap';
import { FaSync, FaUpload, FaEye, FaCheck, FaSearch, FaFilter, FaExclamationTriangle } from 'react-icons/fa';
import { violationsAPI } from '../api/api';
import { getFineAmount, getFineDescription } from '../utils/trafficFines';
import './ViolationList.css';

// ONLY read SAVED violations
const SAVED_VIOLATIONS_KEY = 'traffic_saved_violations';

const ensureArray = (data) => Array.isArray(data) ? data : [];

const ViolationList = () => {
  const [violations, setViolations] = useState([]);
  const [filteredViolations, setFilteredViolations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filterType, setFilterType] = useState('all');
  const [filterStatus, setFilterStatus] = useState('all');
  const [search, setSearch] = useState('');
  const [pagination, setPagination] = useState({ page: 1, limit: 10, total: 0, pages: 1 });
  
  const userRole = localStorage.getItem('userRole') || 'viewer';
  const user = JSON.parse(localStorage.getItem('user') || '{}');

  const fetchViolations = useCallback(async () => {
    try {
      setLoading(true);
      let allViolations = [];
      
      // Try API
      try {
        const params = { page: pagination.page, limit: pagination.limit };
        if (filterType !== 'all') params.type = filterType;
        if (filterStatus !== 'all') params.status = filterStatus;
        const response = await violationsAPI.getAll(params);
        if (response && response.success) {
          allViolations = ensureArray(response.violations || response.data);
        }
      } catch (apiErr) {}
      
      // Add SAVED violations from localStorage
      try {
        const savedViolations = JSON.parse(localStorage.getItem(SAVED_VIOLATIONS_KEY) || '[]');
        const localSaved = ensureArray(savedViolations);
        localSaved.forEach(v => {
          const exists = allViolations.find(av => av.vehicleNumber === v.vehicleNumber && av.type === v.type);
          if (!exists) {
            allViolations.push({
              ...v,
              vehicleNumber: v.vehicleNumber || v.violationData?.vehicleNumber || 'Unknown',
              type: v.type || v.violationData?.type || 'Unknown',
              fineAmount: v.fineAmount || v.violationData?.fineAmount || 1000,
              confidence: v.confidence || 0.85,
              status: v.status || 'detected',
              timestamp: v.savedAt || new Date().toISOString(),
              isSaved: true
            });
          }
        });
      } catch (localErr) {}
      
      if (userRole === 'viewer' && user.vehicleNumber) {
        allViolations = allViolations.filter(v => v.vehicleNumber === user.vehicleNumber);
      }
      
      setViolations(allViolations);
      setFilteredViolations(allViolations);
      setPagination(prev => ({ ...prev, total: allViolations.length, pages: Math.ceil(allViolations.length / prev.limit) || 1 }));
      setError('');
    } catch (err) {
      setError('Failed to load violations');
    } finally {
      setLoading(false);
    }
  }, [pagination.page, pagination.limit, filterType, filterStatus, userRole, user.vehicleNumber]);

  useEffect(() => { fetchViolations(); }, [fetchViolations]);

  useEffect(() => {
    const handler = () => fetchViolations();
    window.addEventListener('violationSaved', handler);
    window.addEventListener('violationsBatchSaved', handler);
    return () => {
      window.removeEventListener('violationSaved', handler);
      window.removeEventListener('violationsBatchSaved', handler);
    };
  }, [fetchViolations]);

  useEffect(() => {
    let filtered = ensureArray(violations);
    if (search.trim()) {
      const s = search.toLowerCase();
      filtered = filtered.filter(v => (v.vehicleNumber || '').toLowerCase().includes(s) || (v.violationId || '').toLowerCase().includes(s) || (v._id || '').toLowerCase().includes(s));
    }
    setFilteredViolations(filtered);
  }, [violations, search]);

  const updateStatus = async (id, newStatus) => {
    if (userRole !== 'admin') { alert('Only Traffic Authorities can update violation status'); return; }
    try {
      const response = await violationsAPI.update(id, { status: newStatus });
      if (response.success) {
        setViolations(violations.map(v => (v.violationId === id || v._id === id) ? { ...v, status: newStatus } : v));
        window.dispatchEvent(new CustomEvent('violationsUpdated'));
        alert(`Status updated to ${newStatus}`);
      }
    } catch (error) { alert('Failed to update status'); }
  };

  const getDisplayFineAmount = (v) => v.fineAmount || v.fine || v.violationData?.fineAmount || v.fine_amount || getFineAmount(v.type || v.violationType) || 0;
  const getDisplayType = (v) => v.type || v.violationType || v.violationData?.type || 'Unknown';
  const getDisplayVehicleNumber = (v) => v.vehicleNumber || v.violationData?.vehicleNumber || 'N/A';

  const handlePageChange = (newPage) => setPagination(prev => ({ ...prev, page: newPage }));
  const handleFilterTypeChange = (e) => { setFilterType(e.target.value); setPagination(prev => ({ ...prev, page: 1 })); };
  const handleFilterStatusChange = (e) => { setFilterStatus(e.target.value); setPagination(prev => ({ ...prev, page: 1 })); };
  const handleRefresh = () => fetchViolations();

  const getStatusBadge = (status) => {
    const colors = { detected: 'warning', reviewed: 'info', fined: 'success', appealed: 'danger', dismissed: 'secondary', pending: 'warning', saved: 'info' };
    return <Badge bg={colors[status] || 'secondary'}>{(status || 'detected').toUpperCase()}</Badge>;
  };

  const getTypeBadge = (type) => {
    const colors = { signal_violation: 'danger', overspeeding: 'warning', no_seatbelt: 'info', triple_riding: 'secondary', wrong_route: 'primary', no_helmet: 'dark', overloading: 'purple' };
    const label = type ? type.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ') : 'Unknown';
    return <Badge bg={colors[type] || 'secondary'}>{label}</Badge>;
  };

  const formatDate = (dateString) => {
    if (!dateString) return 'N/A';
    try { return new Date(dateString).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) + ' ' + new Date(dateString).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }); }
    catch (e) { return dateString; }
  };

  if (loading && violations.length === 0) return <div className="text-center mt-5"><Spinner animation="border" variant="primary" /><p className="mt-3">Loading violations...</p></div>;

  return (
    <div>
      <h2 className="mb-4"><FaExclamationTriangle className="me-2 text-warning" />Violations List{userRole === 'viewer' && user.vehicleNumber && <small className="text-muted ms-3">Showing for: <strong>{user.vehicleNumber}</strong></small>}</h2>
      {error && <Alert variant="danger">{error}</Alert>}

      <Row className="mb-3">
        <Col md={3}><Card className="text-center bg-light"><Card.Body><h5>Total</h5><h3>{violations.length}</h3></Card.Body></Card></Col>
        <Col md={3}><Card className="text-center bg-light"><Card.Body><h5>Displaying</h5><h3>{filteredViolations.length}</h3></Card.Body></Card></Col>
        <Col md={6}><Card className="bg-light"><Card.Body><div className="d-flex justify-content-between"><span>Page {pagination.page} of {pagination.pages || 1}</span><Button variant="outline-primary" size="sm" onClick={handleRefresh} disabled={loading}>{loading ? <Spinner size="sm" /> : <><FaSync /> Refresh</>}</Button></div></Card.Body></Card></Col>
      </Row>
      
      <Card className="mb-4"><Card.Body><Card.Title><FaFilter className="me-2" />Filters</Card.Title>
        <Row>
          <Col md={3}><Form.Group><Form.Label>Type</Form.Label><Form.Select value={filterType} onChange={handleFilterTypeChange}><option value="all">All</option><option value="overloading">Overloading</option><option value="triple_riding">Triple Riding</option><option value="no_helmet">No Helmet</option></Form.Select></Form.Group></Col>
          <Col md={3}><Form.Group><Form.Label>Status</Form.Label><Form.Select value={filterStatus} onChange={handleFilterStatusChange}><option value="all">All</option><option value="detected">Detected</option><option value="fined">Fined</option><option value="dismissed">Dismissed</option></Form.Select></Form.Group></Col>
          <Col md={6}><Form.Group><Form.Label><FaSearch /> Search</Form.Label><InputGroup><Form.Control type="text" placeholder="Vehicle Number or ID..." value={search} onChange={(e) => setSearch(e.target.value)} />{search && <Button variant="outline-secondary" onClick={() => setSearch('')}>Clear</Button>}</InputGroup></Form.Group></Col>
        </Row>
      </Card.Body></Card>

      <Card><Card.Body>
        <Card.Title className="d-flex justify-content-between"><span>Violations ({filteredViolations.length})</span>{userRole === 'admin' && <Button variant="primary" href="/upload"><FaUpload /> Upload New</Button>}</Card.Title>
        <div className="table-responsive"><Table hover>
          <thead><tr><th>ID</th><th>Type</th><th>Vehicle</th><th>Date</th><th>Confidence</th><th>Status</th><th>Fine</th>{userRole === 'admin' && <th>Actions</th>}</tr></thead>
          <tbody>
            {filteredViolations.length === 0 ? <tr><td colSpan={userRole === 'admin' ? 8 : 7} className="text-center py-4">No violations found</td></tr> :
              filteredViolations.map((v, i) => (
                <tr key={v._id || v.violationId || i}>
                  <td><small>{(v.violationId || v._id || `LOCAL-${i}`).toString().slice(0, 8)}...</small>{v.isSaved && <Badge bg="info" className="ms-1" style={{fontSize:'0.6rem'}}>SAVED</Badge>}</td>
                  <td>{getTypeBadge(getDisplayType(v))}</td>
                  <td><strong>{getDisplayVehicleNumber(v)}</strong></td>
                  <td><small>{formatDate(v.timestamp || v.createdAt || v.savedAt)}</small></td>
                  <td><div className="progress" style={{height:'6px',width:'60px'}}><div className={`progress-bar bg-${(v.confidence||0.85)>0.8?'success':'warning'}`} style={{width:`${(v.confidence||0.85)*100}%`}} /></div><small>{Math.round((v.confidence||0.85)*100)}%</small></td>
                  <td>{getStatusBadge(v.status || 'detected')}</td>
                  <td><strong className="text-success">₹{getDisplayFineAmount(v).toLocaleString()}</strong></td>
                  {userRole === 'admin' && <td><Button size="sm" variant="outline-primary"><FaEye /></Button>{(v.status !== 'fined') && <Button size="sm" variant="outline-success" className="ms-1" onClick={() => updateStatus(v.violationId || v._id, 'fined')}><FaCheck /></Button>}</td>}
                </tr>
              ))
            }
          </tbody>
        </Table></div>
        {pagination.pages > 1 && <div className="d-flex justify-content-center mt-3"><Button variant="outline-primary" size="sm" disabled={pagination.page===1} onClick={() => handlePageChange(pagination.page-1)}>Previous</Button><span className="mx-3">Page {pagination.page} of {pagination.pages}</span><Button variant="outline-primary" size="sm" disabled={pagination.page===pagination.pages} onClick={() => handlePageChange(pagination.page+1)}>Next</Button></div>}
      </Card.Body></Card>
    </div>
  );
};

export default ViolationList;