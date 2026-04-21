import React, { useState, useEffect, useRef } from 'react';
import { Container, Row, Col, Card, Button, Form, Alert, Badge, Table } from 'react-bootstrap';
import { io } from 'socket.io-client';
import './CCTVMonitor.css';

const CCTVMonitor = () => {
    const [streams, setStreams] = useState([]);
    const [activeStreams, setActiveStreams] = useState([]);
    const [violations, setViolations] = useState([]);
    const [newViolation, setNewViolation] = useState(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [formData, setFormData] = useState({
        streamUrl: 'rtsp://demo:demo@ipvmdemo.dyndns.org:5541/onvif-media/media.amp',
        cameraId: 'CAM-001',
        location: 'Main Street Intersection'
    });
    
    const socketRef = useRef(null);
    const videoRef = useRef(null);

    // Connect to WebSocket
    useEffect(() => {
        socketRef.current = io('http://localhost:5000');
        
        socketRef.current.on('connect', () => {
            console.log('Connected to CCTV server');
            socketRef.current.emit('get_active_streams');
        });
        
        socketRef.current.on('active_streams', (data) => {
            setActiveStreams(data);
        });
        
        socketRef.current.on('new_violations', (data) => {
            setViolations(prev => [...data.violations, ...prev]);
            if (data.violations.length > 0) {
                setNewViolation(data.violations[0]);
                // Auto-hide notification after 5 seconds
                setTimeout(() => setNewViolation(null), 5000);
            }
        });
        
        socketRef.current.on('cctv_started', (data) => {
            setLoading(false);
            setError('');
            console.log('CCTV started:', data);
        });
        
        socketRef.current.on('cctv_error', (data) => {
            setLoading(false);
            setError(data.error);
        });
        
        return () => {
            if (socketRef.current) {
                socketRef.current.disconnect();
            }
        };
    }, []);

    // Sample CCTV streams
    const sampleStreams = [
        {
            id: 'CAM-001',
            name: 'Main Street Camera',
            location: 'Main Street Intersection',
            url: 'rtsp://demo:demo@ipvmdemo.dyndns.org:5541/onvif-media/media.amp',
            status: 'active'
        },
        {
            id: 'CAM-002',
            name: 'Highway Camera',
            location: 'Highway NH-48',
            url: 'rtsp://demo:demo@ipvmdemo.dyndns.org:5541/onvif-media/media.amp',
            status: 'inactive'
        },
        {
            id: 'CAM-003',
            name: 'School Zone Camera',
            location: 'School Road',
            url: 'rtsp://demo:demo@ipvmdemo.dyndns.org:5541/onvif-media/media.amp',
            status: 'active'
        }
    ];

    const handleStartStream = () => {
        setLoading(true);
        socketRef.current.emit('start_cctv', formData);
    };

    const handleStopStream = (cameraId) => {
        socketRef.current.emit('stop_cctv', cameraId);
    };

    const handleProcessVideo = () => {
        const fileInput = document.getElementById('videoFile');
        if (fileInput.files.length > 0) {
            const file = fileInput.files[0];
            const formData = new FormData();
            formData.append('video', file);
            
            // Upload and process video
            fetch('http://localhost:5000/api/upload-video', {
                method: 'POST',
                body: formData
            })
            .then(response => response.json())
            .then(data => {
                console.log('Video processed:', data);
                alert(`Detected ${data.violations.length} violations in video`);
            })
            .catch(error => {
                console.error('Error processing video:', error);
            });
        }
    };

    const getViolationBadge = (type) => {
        const colors = {
            signal_violation: 'danger',
            overspeeding: 'warning',
            no_seatbelt: 'info',
            triple_riding: 'secondary',
            wrong_route: 'primary',
            no_helmet: 'dark'
        };
        return <Badge bg={colors[type] || 'dark'}>{type.replace('_', ' ')}</Badge>;
    };

    return (
        <Container fluid>
            <h2 className="mb-4">🎥 CCTV Monitoring Dashboard</h2>
            
            {/* Real-time Alert */}
            {newViolation && (
                <Alert variant="danger" className="alert-pulse">
                    <h5>🚨 New Violation Detected!</h5>
                    <p><strong>Type:</strong> {newViolation.type.replace('_', ' ')}</p>
                    <p><strong>Vehicle:</strong> {newViolation.vehicleNumber}</p>
                    <p><strong>Location:</strong> {newViolation.location?.address}</p>
                </Alert>
            )}
            
            <Row className="mb-4">
                <Col md={8}>
                    {/* CCTV Stream Controls */}
                    <Card className="mb-4">
                        <Card.Body>
                            <Card.Title>Start CCTV Monitoring</Card.Title>
                            <Form>
                                <Row>
                                    <Col md={4}>
                                        <Form.Group className="mb-3">
                                            <Form.Label>Camera ID</Form.Label>
                                            <Form.Control
                                                type="text"
                                                value={formData.cameraId}
                                                onChange={(e) => setFormData({...formData, cameraId: e.target.value})}
                                                placeholder="CAM-001"
                                            />
                                        </Form.Group>
                                    </Col>
                                    <Col md={4}>
                                        <Form.Group className="mb-3">
                                            <Form.Label>Location</Form.Label>
                                            <Form.Control
                                                type="text"
                                                value={formData.location}
                                                onChange={(e) => setFormData({...formData, location: e.target.value})}
                                                placeholder="Main Street"
                                            />
                                        </Form.Group>
                                    </Col>
                                    <Col md={4}>
                                        <Form.Group className="mb-3">
                                            <Form.Label>Stream URL</Form.Label>
                                            <Form.Control
                                                type="text"
                                                value={formData.streamUrl}
                                                onChange={(e) => setFormData({...formData, streamUrl: e.target.value})}
                                                placeholder="RTSP URL"
                                            />
                                        </Form.Group>
                                    </Col>
                                </Row>
                                
                                <div className="d-flex gap-2">
                                    <Button 
                                        variant="primary" 
                                        onClick={handleStartStream}
                                        disabled={loading}
                                    >
                                        {loading ? 'Starting...' : 'Start Monitoring'}
                                    </Button>
                                    
                                    <Button 
                                        variant="secondary"
                                        onClick={handleProcessVideo}
                                    >
                                        Process Video File
                                    </Button>
                                    
                                    <input 
                                        type="file" 
                                        id="videoFile" 
                                        accept="video/*" 
                                        style={{ display: 'none' }}
                                        onChange={handleProcessVideo}
                                    />
                                </div>
                                
                                {error && <Alert variant="danger" className="mt-3">{error}</Alert>}
                            </Form>
                        </Card.Body>
                    </Card>
                    
                    {/* Live Feeds */}
                    <Card>
                        <Card.Body>
                            <Card.Title>Live CCTV Feeds</Card.Title>
                            <Row>
                                {sampleStreams.map(stream => (
                                    <Col md={6} key={stream.id} className="mb-3">
                                        <Card className="cctv-feed-card">
                                            <Card.Body>
                                                <div className="cctv-feed-header">
                                                    <h6>{stream.name}</h6>
                                                    <Badge bg={stream.status === 'active' ? 'success' : 'secondary'}>
                                                        {stream.status}
                                                    </Badge>
                                                </div>
                                                <p className="text-muted small">{stream.location}</p>
                                                
                                                {/* Video feed placeholder */}
                                                <div className="video-placeholder">
                                                    <div className="video-overlay">
                                                        <span className="live-indicator"></span> LIVE
                                                    </div>
                                                    <div className="video-stats">
                                                        <small>Detected: {Math.floor(Math.random() * 10)} violations</small>
                                                    </div>
                                                </div>
                                                
                                                <div className="mt-2">
                                                    <Button 
                                                        size="sm" 
                                                        variant={activeStreams.some(s => s.cameraId === stream.id) ? 'danger' : 'primary'}
                                                        onClick={() => activeStreams.some(s => s.cameraId === stream.id) 
                                                            ? handleStopStream(stream.id)
                                                            : handleStartStream()
                                                        }
                                                    >
                                                        {activeStreams.some(s => s.cameraId === stream.id) ? 'Stop' : 'Start'} Monitoring
                                                    </Button>
                                                </div>
                                            </Card.Body>
                                        </Card>
                                    </Col>
                                ))}
                            </Row>
                        </Card.Body>
                    </Card>
                </Col>
                
                <Col md={4}>
                    {/* Active Streams */}
                    <Card className="mb-4">
                        <Card.Body>
                            <Card.Title>Active Monitoring</Card.Title>
                            {activeStreams.length === 0 ? (
                                <p className="text-muted">No active CCTV monitoring</p>
                            ) : (
                                <div className="active-streams-list">
                                    {activeStreams.map(stream => (
                                        <div key={stream.cameraId} className="active-stream-item">
                                            <div className="stream-info">
                                                <strong>{stream.cameraId}</strong>
                                                <small className="text-muted d-block">{stream.location}</small>
                                            </div>
                                            <div className="stream-stats">
                                                <Badge bg="info">{stream.violations} violations</Badge>
                                            </div>
                                            <Button 
                                                size="sm" 
                                                variant="outline-danger"
                                                onClick={() => handleStopStream(stream.cameraId)}
                                            >
                                                Stop
                                            </Button>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </Card.Body>
                    </Card>
                    
                    {/* Recent Violations */}
                    <Card>
                        <Card.Body>
                            <Card.Title className="d-flex justify-content-between">
                                Recent Violations
                                <Badge bg="danger">{violations.length}</Badge>
                            </Card.Title>
                            
                            <div className="violations-list" style={{ maxHeight: '400px', overflowY: 'auto' }}>
                                {violations.length === 0 ? (
                                    <p className="text-muted">No violations detected yet</p>
                                ) : (
                                    violations.slice(0, 10).map((violation, index) => (
                                        <div key={index} className="violation-item mb-2 p-2 border rounded">
                                            <div className="d-flex justify-content-between align-items-start">
                                                <div>
                                                    {getViolationBadge(violation.type)}
                                                    <div className="small">
                                                        <strong>{violation.vehicleNumber}</strong>
                                                    </div>
                                                    <div className="text-muted small">
                                                        {violation.location?.address}
                                                    </div>
                                                </div>
                                                <div className="text-end">
                                                    <div className="small">
                                                        {new Date(violation.timestamp).toLocaleTimeString()}
                                                    </div>
                                                    <div className="text-success small">
                                                        Fine: ₹{violation.fineAmount}
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    ))
                                )}
                            </div>
                        </Card.Body>
                    </Card>
                </Col>
            </Row>
            
            {/* Violations Table */}
            <Card>
                <Card.Body>
                    <Card.Title>All CCTV Detected Violations</Card.Title>
                    <div className="table-responsive">
                        <Table striped hover>
                            <thead>
                                <tr>
                                    <th>Time</th>
                                    <th>Camera</th>
                                    <th>Violation</th>
                                    <th>Vehicle</th>
                                    <th>Location</th>
                                    <th>Confidence</th>
                                    <th>Fine</th>
                                    <th>Status</th>
                                </tr>
                            </thead>
                            <tbody>
                                {violations.slice(0, 20).map((violation, index) => (
                                    <tr key={index}>
                                        <td>{new Date(violation.timestamp).toLocaleTimeString()}</td>
                                        <td>
                                            <Badge bg="secondary">{violation.location?.cameraId || 'N/A'}</Badge>
                                        </td>
                                        <td>{getViolationBadge(violation.type)}</td>
                                        <td>
                                            <div>{violation.vehicleNumber}</div>
                                            <small className="text-muted">{violation.vehicleType}</small>
                                        </td>
                                        <td>{violation.location?.address}</td>
                                        <td>
                                            <div className="progress" style={{ height: '6px' }}>
                                                <div 
                                                    className="progress-bar bg-success" 
                                                    style={{ width: `${violation.confidence * 100}%` }}
                                                ></div>
                                            </div>
                                            <small>{(violation.confidence * 100).toFixed(1)}%</small>
                                        </td>
                                        <td className="text-success">₹{violation.fineAmount}</td>
                                        <td>
                                            <Badge bg="warning">{violation.status}</Badge>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </Table>
                    </div>
                </Card.Body>
            </Card>
        </Container>
    );
};

export default CCTVMonitor;