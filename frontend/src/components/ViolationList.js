import React, { useState, useEffect, useCallback, useRef } from 'react';
import { 
  Table, Card, Form, Button, Badge, InputGroup, Row, Col, 
  Spinner, Alert, Modal 
} from 'react-bootstrap';
import { 
  FaSync, FaUpload, FaEye, FaSearch, FaFilter, 
  FaExclamationTriangle, FaEdit, FaTrash, FaTimes, FaSave,
  FaChevronLeft, FaChevronRight, FaBell
} from 'react-icons/fa';
import { violationsAPI } from '../api/api';
import { getFineAmount } from '../utils/trafficFines';
import './ViolationList.css';

// SAVED violations key - MUST match exactly with AuthorityUploadViolation
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
  
  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;
  
  // Real-time update notification
  const [showUpdateNotification, setShowUpdateNotification] = useState(false);
  const [newViolationsCount, setNewViolationsCount] = useState(0);
  
  // View JSON Modal
  const [showViewModal, setShowViewModal] = useState(false);
  const [selectedViolation, setSelectedViolation] = useState(null);
  
  // Edit Modal
  const [showEditModal, setShowEditModal] = useState(false);
  const [editViolation, setEditViolation] = useState(null);
  const [editFormData, setEditFormData] = useState({});
  const [editLoading, setEditLoading] = useState(false);
  
  // Delete Confirmation
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteViolationId, setDeleteViolationId] = useState(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  
  const userRole = localStorage.getItem('userRole') || 'viewer';
  const user = JSON.parse(localStorage.getItem('user') || '{}');
  
  // Ref to track if component is mounted
  const isMounted = useRef(true);
  // Ref to store the last localStorage state for comparison
  const lastLocalStorageState = useRef('');

  // ===== FUNCTION TO ADD NEW VIOLATIONS DIRECTLY TO STATE =====
  const addViolationsToState = useCallback((newViolations) => {
    if (!newViolations || !Array.isArray(newViolations)) return;
    
    console.log('📥 Adding violations directly to state:', newViolations.length);
    
    setViolations(prevViolations => {
      const updatedViolations = [...prevViolations];
      let addedCount = 0;
      
      newViolations.forEach(newViolation => {
        // Check if this violation already exists
        const exists = updatedViolations.find(v => 
          (v.vehicleNumber === newViolation.vehicleNumber || 
           v.vehicleNumber === newViolation.violationData?.vehicleNumber) && 
          v.type === (newViolation.type || newViolation.violationData?.type) &&
          Math.abs(
            new Date(v.timestamp || v.createdAt || v.savedAt) - 
            new Date(newViolation.savedAt || newViolation.timestamp || newViolation.createdAt)
          ) < 5000 // Within 5 seconds
        );
        
        if (!exists) {
          // Create a properly formatted violation object
          const formattedViolation = {
            _id: newViolation._id || `local_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            violationId: newViolation.violationId || `LOC-${Date.now()}`,
            vehicleNumber: newViolation.vehicleNumber || newViolation.violationData?.vehicleNumber || 'Unknown',
            type: newViolation.type || newViolation.violationData?.type || 'Unknown',
            violationType: newViolation.type || newViolation.violationData?.type || 'Unknown',
            fineAmount: newViolation.fineAmount || newViolation.fine || newViolation.violationData?.fineAmount || 
                       getFineAmount(newViolation.type || newViolation.violationData?.type) || 1000,
            fine: newViolation.fineAmount || newViolation.fine || newViolation.violationData?.fineAmount || 
                  getFineAmount(newViolation.type || newViolation.violationData?.type) || 1000,
            confidence: newViolation.confidence || 0.85,
            status: newViolation.status || 'detected',
            timestamp: newViolation.savedAt || newViolation.timestamp || newViolation.createdAt || new Date().toISOString(),
            createdAt: newViolation.savedAt || newViolation.createdAt || new Date().toISOString(),
            description: newViolation.description || newViolation.violationData?.description || '',
            severity: newViolation.severity || 'medium',
            saved: true,
            isSaved: true,
            source: 'local_saved',
            isNew: true // Mark as new for UI highlighting
          };
          
          // Apply viewer filter if needed
          if (userRole === 'viewer' && user.vehicleNumber) {
            if (formattedViolation.vehicleNumber.toUpperCase() === user.vehicleNumber.toUpperCase()) {
              updatedViolations.push(formattedViolation);
              addedCount++;
            }
          } else {
            updatedViolations.push(formattedViolation);
            addedCount++;
          }
        }
      });
      
      if (addedCount > 0) {
        console.log(`✅ Added ${addedCount} new violations to state`);
        setNewViolationsCount(addedCount);
        setShowUpdateNotification(true);
        
        // Hide notification after 5 seconds
        setTimeout(() => {
          if (isMounted.current) {
            setShowUpdateNotification(false);
            // Remove 'isNew' flag after notification disappears
            setViolations(prev => prev.map(v => ({ ...v, isNew: false })));
          }
        }, 5000);
      }
      
      return updatedViolations;
    });
  }, [userRole, user.vehicleNumber]);

  // ===== FETCH VIOLATIONS - Reads from API AND localStorage =====
  const fetchViolations = useCallback(async (silent = false) => {
    try {
      if (!silent) setLoading(true);
      console.log('📋 Fetching violations for ViolationList...');
      let allViolations = [];
      
      // Try API first
      try {
        const params = { page: 1, limit: 1000 };
        if (filterType !== 'all') params.type = filterType;
        if (filterStatus !== 'all') params.status = filterStatus;
        const response = await violationsAPI.getAll(params);
        if (response && response.success) {
          const apiData = ensureArray(response.violations || response.data || response);
          allViolations = [...apiData];
          console.log('✅ API violations found:', allViolations.length);
        }
      } catch (apiErr) {
        console.warn('API fetch failed, will use localStorage:', apiErr.message);
      }
      
      // ALWAYS add SAVED violations from localStorage
      try {
        const savedViolations = JSON.parse(localStorage.getItem(SAVED_VIOLATIONS_KEY) || '[]');
        const localSaved = ensureArray(savedViolations);
        console.log('💾 LocalStorage saved violations:', localSaved.length);
        
        // Update the last known state for comparison
        lastLocalStorageState.current = JSON.stringify(localSaved);
        
        localSaved.forEach(v => {
          const exists = allViolations.find(av => 
            (av.vehicleNumber === v.vehicleNumber || av.vehicleNumber === v.violationData?.vehicleNumber) && 
            av.type === v.type &&
            Math.abs(new Date(av.timestamp || av.createdAt) - new Date(v.savedAt || v.timestamp)) < 10000
          );
          
          if (!exists) {
            console.log('➕ Adding local violation:', v.type, v.vehicleNumber);
            allViolations.push({
              _id: v._id || `local_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
              violationId: v.violationId || `LOC-${Date.now()}`,
              vehicleNumber: v.vehicleNumber || v.violationData?.vehicleNumber || 'Unknown',
              type: v.type || v.violationData?.type || 'Unknown',
              violationType: v.type || v.violationData?.type || 'Unknown',
              fineAmount: v.fineAmount || v.fine || v.violationData?.fineAmount || 1000,
              fine: v.fineAmount || v.fine || v.violationData?.fineAmount || 1000,
              confidence: v.confidence || 0.85,
              status: v.status || 'detected',
              timestamp: v.savedAt || v.timestamp || new Date().toISOString(),
              createdAt: v.savedAt || v.createdAt || new Date().toISOString(),
              description: v.description || v.violationData?.description || '',
              severity: v.severity || 'medium',
              saved: true,
              isSaved: true,
              source: 'local_saved'
            });
          }
        });
      } catch (localErr) {
        console.warn('Local storage read failed:', localErr.message);
      }
      
      // Filter for viewer role
      if (userRole === 'viewer' && user.vehicleNumber) {
        allViolations = allViolations.filter(v => 
          (v.vehicleNumber || '').toUpperCase() === (user.vehicleNumber || '').toUpperCase()
        );
      }
      
      // Filter for past 1 week
      const oneWeekAgo = new Date();
      oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
      allViolations = allViolations.filter(v => {
        const vDate = new Date(v.timestamp || v.createdAt || v.savedAt);
        return vDate >= oneWeekAgo;
      });
      
      console.log('📊 Total violations after merge:', allViolations.length);
      setViolations(allViolations);
      if (!silent) setCurrentPage(1);
      setError('');
    } catch (err) {
      setError('Failed to load violations');
      console.error('Fetch error:', err);
    } finally {
      if (!silent) setLoading(false);
    }
  }, [filterType, filterStatus, userRole, user.vehicleNumber]);

  // Initial fetch
  useEffect(() => { 
    fetchViolations(); 
    return () => {
      isMounted.current = false;
    };
  }, [fetchViolations]);

  // ===== REAL-TIME LOCALSTORAGE POLLING =====
  useEffect(() => {
    // Check localStorage every 2 seconds for changes
    const pollInterval = setInterval(() => {
      try {
        const currentState = localStorage.getItem(SAVED_VIOLATIONS_KEY);
        
        // If localStorage hasn't changed, skip
        if (currentState === lastLocalStorageState.current) {
          return;
        }
        
        console.log('🔍 Detected localStorage change, checking for new violations...');
        lastLocalStorageState.current = currentState;
        
        const savedViolations = JSON.parse(currentState || '[]');
        const localSaved = ensureArray(savedViolations);
        
        // Find violations that aren't already in our state
        const newOnes = [];
        setViolations(prevViolations => {
          localSaved.forEach(v => {
            const exists = prevViolations.find(pv => 
              (pv.vehicleNumber === v.vehicleNumber || pv.vehicleNumber === v.violationData?.vehicleNumber) && 
              pv.type === v.type &&
              Math.abs(
                new Date(pv.timestamp || pv.createdAt) - 
                new Date(v.savedAt || v.timestamp)
              ) < 10000
            );
            
            if (!exists) {
              newOnes.push(v);
            }
          });
          
          if (newOnes.length > 0) {
            console.log(`🆕 Found ${newOnes.length} new violations via polling`);
            // Use the addViolationsToState function to add them
            addViolationsToState(newOnes);
          }
          
          return prevViolations; // Don't modify here, addViolationsToState will handle it
        });
        
      } catch (e) {
        // Ignore polling errors
      }
    }, 2000); // Poll every 2 seconds
    
    return () => clearInterval(pollInterval);
  }, [addViolationsToState]);

  // ===== LISTEN FOR SAVE EVENTS FROM AUTHORITY UPLOAD PAGE =====
  useEffect(() => {
    // Immediate handler for violationSaved event
    const handleViolationSaved = (event) => {
      console.log('🔔 ViolationList: violationSaved event received!', event.detail);
      
      if (event.detail) {
        // If event has violation data, add it directly
        const violations = Array.isArray(event.detail) ? event.detail : [event.detail];
        addViolationsToState(violations);
      } else {
        // If no data in event, check localStorage
        try {
          const savedViolations = JSON.parse(localStorage.getItem(SAVED_VIOLATIONS_KEY) || '[]');
          if (savedViolations.length > 0) {
            // Get the most recently added violation (last one)
            const latestViolation = savedViolations[savedViolations.length - 1];
            addViolationsToState([latestViolation]);
          }
        } catch (e) {
          console.warn('Error reading localStorage in event handler:', e);
        }
      }
    };
    
    // Handler for batch saves
    const handleBatchSaved = (event) => {
      console.log('🔔 ViolationList: violationsBatchSaved event received!', event.detail);
      
      if (event.detail && Array.isArray(event.detail)) {
        addViolationsToState(event.detail);
      } else {
        // Fallback: refresh from localStorage
        fetchViolations(true); // Silent refresh
      }
    };
    
    // Handler for general updates
    const handleUpdate = () => {
      console.log('🔔 ViolationList: violationsUpdated event received!');
      fetchViolations(true); // Silent refresh
    };
    
    // Handler for localStorage changes from other tabs
    const handleStorageChange = (e) => {
      if (e.key === SAVED_VIOLATIONS_KEY) {
        console.log('🔔 ViolationList: localStorage changed from another tab!');
        
        if (e.newValue) {
          try {
            const newData = JSON.parse(e.newValue);
            const oldData = JSON.parse(e.oldValue || '[]');
            
            // Find newly added violations
            const addedViolations = newData.filter(newV => 
              !oldData.find(oldV => 
                oldV._id === newV._id || 
                oldV.violationId === newV.violationId
              )
            );
            
            if (addedViolations.length > 0) {
              console.log(`📥 ${addedViolations.length} violations added from another tab`);
              addViolationsToState(addedViolations);
            }
          } catch (e) {
            fetchViolations(true);
          }
        } else {
          fetchViolations(true);
        }
      }
    };
    
    window.addEventListener('violationSaved', handleViolationSaved);
    window.addEventListener('violationsBatchSaved', handleBatchSaved);
    window.addEventListener('violationsUpdated', handleUpdate);
    window.addEventListener('storage', handleStorageChange);
    
    return () => {
      window.removeEventListener('violationSaved', handleViolationSaved);
      window.removeEventListener('violationsBatchSaved', handleBatchSaved);
      window.removeEventListener('violationsUpdated', handleUpdate);
      window.removeEventListener('storage', handleStorageChange);
    };
  }, [addViolationsToState, fetchViolations]);

  // Client-side filtering with search
  useEffect(() => {
    let filtered = ensureArray(violations);
    if (search.trim()) {
      const s = search.toLowerCase();
      filtered = filtered.filter(v => 
        (v.vehicleNumber || '').toLowerCase().includes(s) || 
        (v.violationId || '').toLowerCase().includes(s) || 
        (v._id || '').toLowerCase().includes(s)
      );
    }
    setFilteredViolations(filtered);
    setCurrentPage(1); // Reset to first page when search changes
  }, [violations, search]);

  // Pagination helpers
  const totalPages = Math.ceil(filteredViolations.length / itemsPerPage) || 1;
  const paginatedViolations = filteredViolations.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  const handlePrevPage = () => {
    setCurrentPage(prev => Math.max(prev - 1, 1));
  };

  const handleNextPage = () => {
    setCurrentPage(prev => Math.min(prev + 1, totalPages));
  };

  // ===== VIEW ACTION (Show JSON) =====
  const handleViewViolation = (violation) => {
    setSelectedViolation(violation);
    setShowViewModal(true);
  };

  // ===== EDIT ACTIONS =====
  const handleEditViolation = (violation) => {
    setEditViolation(violation);
    setEditFormData({
      vehicleNumber: violation.vehicleNumber || '',
      type: violation.type || violation.violationType || 'no_helmet',
      status: violation.status || 'detected',
      fineAmount: violation.fineAmount || violation.fine || 0,
      description: violation.description || '',
      severity: violation.severity || 'medium'
    });
    setShowEditModal(true);
  };

  const handleEditSubmit = async () => {
    if (!editViolation) return;
    setEditLoading(true);
    
    try {
      const id = editViolation._id || editViolation.violationId;
      
      try {
        await violationsAPI.update(id, editFormData);
      } catch (apiErr) {
        console.warn('API update failed:', apiErr.message);
      }
      
      if (editViolation.isSaved || editViolation.source === 'local_saved') {
        const savedViolations = JSON.parse(localStorage.getItem(SAVED_VIOLATIONS_KEY) || '[]');
        const updated = savedViolations.map(v => {
          if (v._id === id || v.violationId === id) {
            return { 
              ...v, 
              vehicleNumber: editFormData.vehicleNumber,
              type: editFormData.type,
              status: editFormData.status,
              fineAmount: editFormData.fineAmount,
              fine: editFormData.fineAmount,
              description: editFormData.description,
              severity: editFormData.severity
            };
          }
          return v;
        });
        localStorage.setItem(SAVED_VIOLATIONS_KEY, JSON.stringify(updated));
      }
      
      setViolations(prev => prev.map(v => {
        if ((v._id || v.violationId) === id) {
          return { 
            ...v, 
            vehicleNumber: editFormData.vehicleNumber,
            type: editFormData.type,
            violationType: editFormData.type,
            status: editFormData.status,
            fineAmount: editFormData.fineAmount,
            fine: editFormData.fineAmount,
            description: editFormData.description,
            severity: editFormData.severity
          };
        }
        return v;
      }));
      
      window.dispatchEvent(new CustomEvent('violationsUpdated'));
      setShowEditModal(false);
      setEditViolation(null);
      alert('✅ Violation updated successfully!');
    } catch (err) {
      alert('Failed to update violation');
    } finally {
      setEditLoading(false);
    }
  };

  // ===== DELETE ACTION =====
  const handleDeleteClick = (id) => {
    setDeleteViolationId(id);
    setShowDeleteModal(true);
  };

  const handleDeleteConfirm = async () => {
    if (!deleteViolationId) return;
    setDeleteLoading(true);
    
    try {
      try {
        await violationsAPI.delete(deleteViolationId);
      } catch (apiErr) {
        console.warn('API delete failed:', apiErr.message);
      }
      
      const savedViolations = JSON.parse(localStorage.getItem(SAVED_VIOLATIONS_KEY) || '[]');
      const filtered = savedViolations.filter(v => 
        v._id !== deleteViolationId && v.violationId !== deleteViolationId
      );
      localStorage.setItem(SAVED_VIOLATIONS_KEY, JSON.stringify(filtered));
      
      setViolations(prev => prev.filter(v => 
        v._id !== deleteViolationId && v.violationId !== deleteViolationId
      ));
      
      window.dispatchEvent(new CustomEvent('violationsUpdated'));
      setShowDeleteModal(false);
      setDeleteViolationId(null);
      alert('✅ Violation deleted successfully!');
    } catch (err) {
      alert('Failed to delete violation');
    } finally {
      setDeleteLoading(false);
    }
  };

  // ===== HELPERS =====
  const getDisplayFineAmount = (v) => {
    return v.fineAmount || v.fine || v.violationData?.fineAmount || v.fine_amount || getFineAmount(v.type || v.violationType) || 0;
  };
  
  const getDisplayType = (v) => {
    return v.type || v.violationType || v.violationData?.type || 'Unknown';
  };
  
  const getDisplayVehicleNumber = (v) => {
    return v.vehicleNumber || v.violationData?.vehicleNumber || 'N/A';
  };
  
  const handleRefresh = () => fetchViolations();
  
  const handleFilterTypeChange = (e) => { 
    setFilterType(e.target.value); 
  };
  
  const handleFilterStatusChange = (e) => { 
    setFilterStatus(e.target.value); 
  };

  const getStatusBadge = (status) => {
    const colors = { 
      detected: 'warning', reviewed: 'info', fined: 'success', 
      appealed: 'danger', dismissed: 'secondary', pending: 'warning', 
      saved: 'info', resolved: 'success' 
    };
    return <Badge bg={colors[status?.toLowerCase()] || 'secondary'}>{(status || 'detected').toUpperCase()}</Badge>;
  };

  const getTypeBadgeVariant = (type) => {
    const variants = { 
      signal_violation: 'danger', overspeeding: 'warning', no_seatbelt: 'info', 
      triple_riding: 'warning', wrong_route: 'primary', no_helmet: 'dark', 
      overloading: 'danger'
    };
    return variants[type] || 'secondary';
  };

  const formatViolationType = (type) => {
    if (!type) return 'Unknown';
    return type.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
  };

  const formatDate = (dateString) => {
    if (!dateString) return 'N/A';
    try { 
      return new Date(dateString).toLocaleDateString('en-IN', { 
        day: 'numeric', month: 'short', year: 'numeric' 
      }) + ' ' + new Date(dateString).toLocaleTimeString('en-IN', { 
        hour: '2-digit', minute: '2-digit' 
      }); 
    }
    catch (e) { return dateString; }
  };

  const getViolationId = (v) => v._id || v.violationId || '';

  if (loading && violations.length === 0) {
    return (
      <div className="text-center mt-5">
        <Spinner animation="border" variant="primary" />
        <p className="mt-3">Loading violations...</p>
      </div>
    );
  }

  return (
    <div className="violation-list-container">
      <h2 className="mb-4">
        <FaExclamationTriangle className="me-2 text-warning" />
        Violations List (Past 7 Days)
        {userRole === 'viewer' && user.vehicleNumber && (
          <small className="text-muted ms-3">
            Showing for: <strong>{user.vehicleNumber}</strong>
          </small>
        )}
      </h2>
      
      {error && <Alert variant="danger">{error}</Alert>}
      
      {/* Real-time Update Notification */}
      {showUpdateNotification && (
        <Alert variant="success" className="d-flex align-items-center animate__animated animate__fadeInDown">
          <FaBell className="me-2" />
          <span>
            <strong>{newViolationsCount} new violation(s)</strong> added in real-time!
          </span>
          <Button 
            variant="outline-success" 
            size="sm" 
            className="ms-auto"
            onClick={() => setShowUpdateNotification(false)}
          >
            <FaTimes />
          </Button>
        </Alert>
      )}

      {/* Stats Row */}
      <Row className="mb-3">
        <Col md={3}>
          <Card className="text-center bg-light shadow-sm">
            <Card.Body>
              <h6 className="text-muted">Total (7 days)</h6>
              <h3>{violations.length}</h3>
            </Card.Body>
          </Card>
        </Col>
        <Col md={3}>
          <Card className="text-center bg-light shadow-sm">
            <Card.Body>
              <h6 className="text-muted">Filtered</h6>
              <h3>{filteredViolations.length}</h3>
            </Card.Body>
          </Card>
        </Col>
        <Col md={3}>
          <Card className="text-center bg-light shadow-sm">
            <Card.Body>
              <h6 className="text-muted">Page</h6>
              <h3>{totalPages > 0 ? currentPage : 0} / {totalPages}</h3>
            </Card.Body>
          </Card>
        </Col>
        <Col md={3}>
          <Card className="bg-light shadow-sm h-100">
            <Card.Body className="d-flex align-items-center justify-content-center">
              <Button variant="outline-primary" size="sm" onClick={handleRefresh} disabled={loading}>
                {loading ? <Spinner size="sm" className="me-1" /> : <FaSync className="me-1" />} Refresh
              </Button>
            </Card.Body>
          </Card>
        </Col>
      </Row>
      
      {/* Filters */}
      <Card className="mb-4 shadow-sm">
        <Card.Body>
          <Card.Title><FaFilter className="me-2" />Filters</Card.Title>
          <Row>
            <Col md={3}>
              <Form.Group className="mb-3 mb-md-0">
                <Form.Label>Violation Type</Form.Label>
                <Form.Select value={filterType} onChange={handleFilterTypeChange}>
                  <option value="all">All Types</option>
                  <option value="overloading">Overloading</option>
                  <option value="triple_riding">Triple Riding</option>
                  <option value="no_helmet">No Helmet</option>
                </Form.Select>
              </Form.Group>
            </Col>
            <Col md={3}>
              <Form.Group className="mb-3 mb-md-0">
                <Form.Label>Status</Form.Label>
                <Form.Select value={filterStatus} onChange={handleFilterStatusChange}>
                  <option value="all">All Statuses</option>
                  <option value="detected">Detected</option>
                  <option value="fined">Fined</option>
                  <option value="reviewed">Reviewed</option>
                  <option value="dismissed">Dismissed</option>
                </Form.Select>
              </Form.Group>
            </Col>
            <Col md={6}>
              <Form.Group>
                <Form.Label><FaSearch className="me-1" />Search</Form.Label>
                <InputGroup>
                  <Form.Control 
                    type="text" 
                    placeholder="Search by Vehicle Number or ID..." 
                    value={search} 
                    onChange={(e) => setSearch(e.target.value)} 
                  />
                  {search && (
                    <Button variant="outline-secondary" onClick={() => setSearch('')}>
                      <FaTimes />
                    </Button>
                  )}
                </InputGroup>
              </Form.Group>
            </Col>
          </Row>
        </Card.Body>
      </Card>

      {/* Violations Table */}
      <Card className="shadow-sm">
        <Card.Body>
          <Card.Title className="d-flex justify-content-between align-items-center">
            <span>Violations ({filteredViolations.length})</span>
            {userRole === 'admin' && (
              <Button variant="primary" size="sm" href="/upload">
                <FaUpload className="me-1" /> Upload New
              </Button>
            )}
          </Card.Title>
          
          <div className="table-responsive">
            <Table hover className="align-middle">
              <thead className="table-light">
                <tr>
                  <th>ID</th>
                  <th>Type</th>
                  <th>Vehicle</th>
                  <th>Date & Time</th>
                  <th>Confidence</th>
                  <th>Status</th>
                  <th>Fine</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {paginatedViolations.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="text-center py-5">
                      <FaExclamationTriangle style={{fontSize: '2rem', color: '#adb5bd'}} />
                      <p className="mt-2 text-muted">No violations found in the past 7 days</p>
                    </td>
                  </tr>
                ) : (
                  paginatedViolations.map((v, i) => (
                    <tr 
                      key={getViolationId(v) || i}
                      className={v.isNew ? 'table-success animate__animated animate__fadeIn' : ''}
                      style={v.isNew ? { 
                        animation: 'highlightNew 2s ease-in-out',
                        backgroundColor: 'rgba(25, 135, 84, 0.1)'
                      } : {}}
                    >
                      <td>
                        <small className="text-muted font-monospace">
                          #{(getViolationId(v) || `LOCAL-${i}`).toString().slice(-8)}
                        </small>
                        {v.isSaved && (
                          <Badge bg="info" className="ms-1" style={{fontSize:'0.6rem'}}>SAVED</Badge>
                        )}
                        {v.isNew && (
                          <Badge bg="success" className="ms-1" style={{fontSize:'0.6rem'}}>NEW</Badge>
                        )}
                      </td>
                      <td>
                        <Badge bg={getTypeBadgeVariant(getDisplayType(v))}>
                          {formatViolationType(getDisplayType(v))}
                        </Badge>
                      </td>
                      <td><strong>{getDisplayVehicleNumber(v)}</strong></td>
                      <td><small>{formatDate(v.timestamp || v.createdAt || v.savedAt)}</small></td>
                      <td>
                        <div className="d-flex align-items-center gap-2">
                          <div className="progress flex-grow-1" style={{height:'6px', maxWidth:'60px'}}>
                            <div 
                              className={`progress-bar bg-${(v.confidence||0.85)>0.8?'success':'warning'}`} 
                              style={{width:`${(v.confidence||0.85)*100}%`}} 
                            />
                          </div>
                          <small>{Math.round((v.confidence||0.85)*100)}%</small>
                        </div>
                      </td>
                      <td>{getStatusBadge(v.status || 'detected')}</td>
                      <td>
                        <strong className="text-success">
                          ₹{getDisplayFineAmount(v).toLocaleString('en-IN')}
                        </strong>
                      </td>
                      <td>
                        <div className="d-flex gap-1">
                          <Button 
                            size="sm" 
                            variant="outline-primary"
                            onClick={() => handleViewViolation(v)}
                            title="View Details (JSON)"
                          >
                            <FaEye />
                          </Button>
                          <Button 
                            size="sm" 
                            variant="outline-warning"
                            onClick={() => handleEditViolation(v)}
                            title="Edit Violation"
                          >
                            <FaEdit />
                          </Button>
                          <Button 
                            size="sm" 
                            variant="outline-danger"
                            onClick={() => handleDeleteClick(getViolationId(v))}
                            title="Delete Violation"
                          >
                            <FaTrash />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </Table>
          </div>
          
          {/* Pagination Controls */}
          {filteredViolations.length > 0 && (
            <div className="d-flex justify-content-between align-items-center mt-3 pt-3 border-top">
              <div>
                <small className="text-muted">
                  Showing {((currentPage - 1) * itemsPerPage) + 1} - {Math.min(currentPage * itemsPerPage, filteredViolations.length)} of {filteredViolations.length} violations
                </small>
              </div>
              <div className="d-flex align-items-center gap-2">
                <Button 
                  variant="outline-primary" 
                  size="sm" 
                  onClick={handlePrevPage}
                  disabled={currentPage === 1}
                >
                  <FaChevronLeft className="me-1" /> Previous
                </Button>
                <span className="text-muted mx-2">
                  Page <strong>{currentPage}</strong> of <strong>{totalPages}</strong>
                </span>
                <Button 
                  variant="outline-primary" 
                  size="sm" 
                  onClick={handleNextPage}
                  disabled={currentPage === totalPages}
                >
                  Next <FaChevronRight className="ms-1" />
                </Button>
              </div>
            </div>
          )}
        </Card.Body>
      </Card>

      {/* VIEW MODAL - Shows JSON Object */}
      <Modal show={showViewModal} onHide={() => setShowViewModal(false)} size="lg" centered>
        <Modal.Header closeButton>
          <Modal.Title>
            <FaEye className="me-2" />
            Violation Details (JSON)
          </Modal.Title>
        </Modal.Header>
        <Modal.Body>
          {selectedViolation && (
            <div>
              <div className="mb-3">
                <h6>Violation Summary:</h6>
                <div className="d-flex gap-2 flex-wrap">
                  <Badge bg={getTypeBadgeVariant(getDisplayType(selectedViolation))}>
                    {formatViolationType(getDisplayType(selectedViolation))}
                  </Badge>
                  <span>Vehicle: <strong>{getDisplayVehicleNumber(selectedViolation)}</strong></span>
                  <span>Status: {getStatusBadge(selectedViolation.status || 'detected')}</span>
                  <span>Fine: <strong>₹{getDisplayFineAmount(selectedViolation).toLocaleString('en-IN')}</strong></span>
                </div>
              </div>
              <h6>Complete JSON Object:</h6>
              <pre style={{
                background: '#1e1e1e',
                color: '#d4d4d4',
                padding: '20px',
                borderRadius: '8px',
                maxHeight: '400px',
                overflow: 'auto',
                fontSize: '13px',
                lineHeight: '1.6',
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word'
              }}>
                {JSON.stringify(selectedViolation, null, 2)}
              </pre>
            </div>
          )}
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={() => setShowViewModal(false)}>
            <FaTimes className="me-1" /> Close
          </Button>
          <Button 
            variant="primary" 
            onClick={() => {
              navigator.clipboard.writeText(JSON.stringify(selectedViolation, null, 2));
              alert('✅ JSON copied to clipboard!');
            }}
          >
            📋 Copy JSON
          </Button>
        </Modal.Footer>
      </Modal>

      {/* EDIT MODAL */}
      <Modal show={showEditModal} onHide={() => setShowEditModal(false)} centered>
        <Modal.Header closeButton>
          <Modal.Title>
            <FaEdit className="me-2" />
            Edit Violation
          </Modal.Title>
        </Modal.Header>
        <Modal.Body>
          {editViolation && (
            <Form>
              <Form.Group className="mb-3">
                <Form.Label>Vehicle Number</Form.Label>
                <Form.Control
                  type="text"
                  value={editFormData.vehicleNumber}
                  onChange={(e) => setEditFormData({...editFormData, vehicleNumber: e.target.value.toUpperCase()})}
                  placeholder="Enter vehicle number"
                />
              </Form.Group>
              
              <Form.Group className="mb-3">
                <Form.Label>Violation Type</Form.Label>
                <Form.Select
                  value={editFormData.type}
                  onChange={(e) => setEditFormData({...editFormData, type: e.target.value})}
                >
                  <option value="no_helmet">No Helmet</option>
                  <option value="triple_riding">Triple Riding</option>
                  <option value="overloading">Overloading</option>
                </Form.Select>
              </Form.Group>
              
              <Form.Group className="mb-3">
                <Form.Label>Status</Form.Label>
                <Form.Select
                  value={editFormData.status}
                  onChange={(e) => setEditFormData({...editFormData, status: e.target.value})}
                >
                  <option value="detected">Detected</option>
                  <option value="reviewed">Reviewed</option>
                  <option value="fined">Fined</option>
                  <option value="appealed">Appealed</option>
                  <option value="dismissed">Dismissed</option>
                  <option value="resolved">Resolved</option>
                </Form.Select>
              </Form.Group>
              
              <Form.Group className="mb-3">
                <Form.Label>Fine Amount (₹)</Form.Label>
                <Form.Control
                  type="number"
                  value={editFormData.fineAmount}
                  onChange={(e) => setEditFormData({...editFormData, fineAmount: parseInt(e.target.value) || 0})}
                  min="0"
                />
              </Form.Group>
              
              <Form.Group className="mb-3">
                <Form.Label>Description</Form.Label>
                <Form.Control
                  as="textarea"
                  rows={3}
                  value={editFormData.description}
                  onChange={(e) => setEditFormData({...editFormData, description: e.target.value})}
                  placeholder="Enter description"
                />
              </Form.Group>
              
              <Form.Group className="mb-3">
                <Form.Label>Severity</Form.Label>
                <Form.Select
                  value={editFormData.severity}
                  onChange={(e) => setEditFormData({...editFormData, severity: e.target.value})}
                >
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                </Form.Select>
              </Form.Group>
            </Form>
          )}
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={() => setShowEditModal(false)}>
            <FaTimes className="me-1" /> Cancel
          </Button>
          <Button variant="primary" onClick={handleEditSubmit} disabled={editLoading}>
            {editLoading ? <Spinner size="sm" className="me-1" /> : <FaSave className="me-1" />} 
            Save Changes
          </Button>
        </Modal.Footer>
      </Modal>

      {/* DELETE MODAL */}
      <Modal show={showDeleteModal} onHide={() => setShowDeleteModal(false)} centered>
        <Modal.Header closeButton className="bg-danger text-white">
          <Modal.Title>
            <FaTrash className="me-2" />
            Confirm Delete
          </Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <div className="text-center py-3">
            <FaExclamationTriangle style={{fontSize: '3rem', color: '#dc3545'}} />
            <h5 className="mt-3">Are you sure?</h5>
            <p className="text-muted">This action cannot be undone.</p>
            <p className="mb-0"><strong>ID:</strong> <code>{deleteViolationId}</code></p>
          </div>
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={() => setShowDeleteModal(false)}>
            <FaTimes className="me-1" /> Cancel
          </Button>
          <Button variant="danger" onClick={handleDeleteConfirm} disabled={deleteLoading}>
            {deleteLoading ? <Spinner size="sm" className="me-1" /> : <FaTrash className="me-1" />} 
            Delete Permanently
          </Button>
        </Modal.Footer>
      </Modal>

      {/* Add CSS for animations */}
      <style jsx>{`
        @keyframes highlightNew {
          0% { background-color: rgba(25, 135, 84, 0.4); }
          100% { background-color: transparent; }
        }
      `}</style>
    </div>
  );
};

export default ViolationList;