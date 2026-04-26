import React, { useState, useRef, useEffect, useCallback } from "react";
import {
  Form,
  Button,
  Card,
  Alert,
  ProgressBar,
  Container,
  Spinner,
  Badge,
  Row,
  Col,
  Modal
} from "react-bootstrap";
import { 
  FaUpload, 
  FaShieldAlt, 
  FaCheckCircle, 
  FaFileImage, 
  FaSave, 
  FaCamera,
  FaVideo,
  FaExclamationTriangle,
  FaCheck,
  FaTimes,
  FaIdCard,
  FaUserFriends,
  FaClock,
  FaSearch,
  FaStop,
  FaPlay,
  FaRedo,
  FaBroadcastTower
} from "react-icons/fa";

import { uploadAPI, violationsAPI } from "../api/api";
import "./UploadViolation.css";

// CCTV Stream Manager - handles continuous polling
const useCCTVStream = () => {
  const [streamId, setStreamId] = useState(null);
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamStats, setStreamStats] = useState(null);
  const [streamPreview, setStreamPreview] = useState(null);
  const [streamViolations, setStreamViolations] = useState({ no_helmet: 0, triple_riding: 0, overloading: 0 });
  const [streamTotalFine, setStreamTotalFine] = useState(0);
  const pollingRef = useRef(null);
  const previewIntervalRef = useRef(null);

  const startStream = async (source) => {
    try {
      const id = `cctv_${Date.now()}`;
      const response = await fetch('http://localhost:8000/cctv/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stream_id: id, source: source })
      });
      
      const data = await response.json();
      if (data.success) {
        setStreamId(id);
        setIsStreaming(true);
        return { success: true, streamId: id };
      } else {
        return { success: false, error: data.message };
      }
    } catch (err) {
      return { success: false, error: 'Cannot connect to AI server on port 8000' };
    }
  };

  const stopStream = useCallback(async () => {
    if (!streamId) return;
    
    try {
      await fetch('http://localhost:8000/cctv/stop', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stream_id: streamId })
      });
    } catch (err) {
      console.error('Stop stream error:', err);
    }
    
    setIsStreaming(false);
    setStreamId(null);
    
    if (pollingRef.current) clearInterval(pollingRef.current);
    if (previewIntervalRef.current) clearInterval(previewIntervalRef.current);
  }, [streamId]);

  // Poll stats every 2 seconds
  useEffect(() => {
    if (!isStreaming || !streamId) return;

    pollingRef.current = setInterval(async () => {
      try {
        const res = await fetch(`http://localhost:8000/cctv/violations?stream_id=${streamId}`);
        const data = await res.json();
        
        if (data.stats) {
          setStreamStats(data.stats);
          setStreamViolations({
            no_helmet: data.stats.violations?.no_helmet || 0,
            triple_riding: data.stats.violations?.triple_riding || 0,
            overloading: data.stats.violations?.overloading || 0
          });
          setStreamTotalFine(data.total_fine || 0);
        }
      } catch (err) {
        console.error('Poll stats error:', err);
      }
    }, 2000);

    // Update preview every 1 second
    previewIntervalRef.current = setInterval(async () => {
      try {
        const res = await fetch(`http://localhost:8000/cctv/preview?stream_id=${streamId}`);
        const data = await res.json();
        if (data.image) {
          setStreamPreview(data.image);
        }
      } catch (err) {
        console.error('Preview error:', err);
      }
    }, 1000);

    return () => {
      if (pollingRef.current) clearInterval(pollingRef.current);
      if (previewIntervalRef.current) clearInterval(previewIntervalRef.current);
    };
  }, [isStreaming, streamId]);

  return {
    streamId,
    isStreaming,
    streamStats,
    streamPreview,
    streamViolations,
    streamTotalFine,
    startStream,
    stopStream
  };
};

const AuthorityUploadViolation = () => {
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [detectedPlates, setDetectedPlates] = useState([]);
  const [violations, setViolations] = useState([]);
  const [plateConfirmed, setPlateConfirmed] = useState(false);
  const [editedPlateNumber, setEditedPlateNumber] = useState("");
  const [vehicleInfo, setVehicleInfo] = useState(null);
  const [processingTime, setProcessingTime] = useState(null);
  const [detectionMessages, setDetectionMessages] = useState([]);
  const [annotatedImage, setAnnotatedImage] = useState(null);
  const [mediaType, setMediaType] = useState(null);
  
  const [cameraActive, setCameraActive] = useState(false);
  const [cameraError, setCameraError] = useState("");
  const [dragActive, setDragActive] = useState(false);
  
  // CCTV live streaming state
  const [cctvMode, setCctvMode] = useState(false); // 'file' or 'cctv'
  const [cctvSource, setCctvSource] = useState("");
  const [showCctvModal, setShowCctvModal] = useState(false);

  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const fileInputRef = useRef(null);
  const progressIntervalRef = useRef(null);

  const {
    streamId,
    isStreaming,
    streamStats,
    streamPreview,
    streamViolations,
    streamTotalFine,
    startStream,
    stopStream
  } = useCCTVStream();

  useEffect(() => {
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
      }
      if (progressIntervalRef.current) {
        clearInterval(progressIntervalRef.current);
      }
      if (isStreaming) {
        stopStream();
      }
    };
  }, []);

  useEffect(() => {
    if (cameraActive && streamRef.current && videoRef.current) {
      videoRef.current.srcObject = streamRef.current;
    }
  }, [cameraActive]);

  // ===== PROCESS DETECTION RESPONSE =====
  const processDetectionResponse = (response) => {
    console.log('🔍 Processing detection response:', response);
    
    const report = response.report || response;
    
    // Use violation_counts from response (new format)
    const counts = response.violation_counts || report.summary || {};
    
    // Set detection messages
    if (response.detection_messages && response.detection_messages.length > 0) {
      setDetectionMessages(response.detection_messages);
    } else {
      const messages = [];
      const total = counts.total || counts.total_violations || 0;
      
      if (total > 0) {
        messages.push(`🚨 Found ${total} traffic violation(s)`);
        if ((counts.no_helmet || counts.no_helmet_cases) > 0) 
          messages.push(`🪖 ${counts.no_helmet || counts.no_helmet_cases} No Helmet - Fine: ₹1,000`);
        if ((counts.triple_riding || counts.triple_riding_cases) > 0) 
          messages.push(`🏍️ ${counts.triple_riding || counts.triple_riding_cases} Triple Riding - Fine: ₹2,000`);
        if ((counts.overloading || counts.overloading_cases) > 0) 
          messages.push(`🚛 ${counts.overloading || counts.overloading_cases} Overloading - Fine: ₹5,000`);
      } else {
        messages.push('✅ No violations detected');
      }
      
      const vehicleCount = counts.total_vehicles || report.all_vehicles?.length || 0;
      const plateCount = (report.plates || []).length;
      
      messages.push(`🚗 ${vehicleCount} vehicles detected`);
      if (plateCount > 0) messages.push(`📝 ${plateCount} plates recognized`);
      
      setDetectionMessages(messages);
    }
    
    // Extract violations from response
    const violationsData = response.violations || report.violations || {};
    const violationsList = [];
    
    // Process no_helmet
    (violationsData.no_helmet || []).forEach(v => {
      violationsList.push({
        type: 'no_helmet',
        confidence: v.confidence || 0.85,
        description: v.message || 'No helmet detected',
        fine_amount: v.fine_amount || 1000,
        confirmed: false,
        saved: false,
        severity: 'high'
      });
    });
    
    // Process triple_riding
    (violationsData.triple_riding || []).forEach(v => {
      violationsList.push({
        type: 'triple_riding',
        confidence: v.confidence || 0.85,
        description: v.message || `Triple riding detected (${v.count || 3} persons)`,
        fine_amount: v.fine_amount || 2000,
        confirmed: false,
        saved: false,
        severity: 'high'
      });
    });
    
    // Process overloading
    (violationsData.overloading || []).forEach(v => {
      violationsList.push({
        type: 'overloading',
        confidence: v.confidence || 0.80,
        description: v.message || `Overloading detected (${v.count || 'multiple'} persons)`,
        fine_amount: v.fine_amount || 5000,
        confirmed: false,
        saved: false,
        severity: 'medium'
      });
    });
    
    // If no violations from structured data, check violation_messages
    if (violationsList.length === 0 && report.violation_messages) {
      report.violation_messages.forEach(msg => {
        violationsList.push({
          type: msg.type,
          confidence: msg.confidence || 0.75,
          description: msg.message || `Violation: ${msg.type}`,
          fine_amount: msg.fine_amount || 1000,
          confirmed: false,
          saved: false,
          severity: 'medium'
        });
      });
    }
    
    setViolations(violationsList);
    
    // Extract plates
    const plates = [];
    if (report.plates) {
      report.plates.forEach(p => {
        if (p.text) {
          plates.push({
            number: p.text,
            confidence: p.confidence || 0,
            vehicle_type: p.vehicle_type
          });
        }
      });
    }
    setDetectedPlates(plates);
    setPlateConfirmed(false);
    setEditedPlateNumber(plates[0]?.number || "");
    
    if (response.processing_time) {
      setProcessingTime(response.processing_time);
    }
    
    setMediaType(response.media_type || (file?.type?.startsWith('video/') ? 'video' : 'image'));
    
    // Annotated image
    if (response.annotated_image || report.annotated_image) {
      setAnnotatedImage(`data:image/jpeg;base64,${response.annotated_image || report.annotated_image}`);
    }
    
    // Vehicle info
    const vehicles = report.all_vehicles || report.vehicles || [];
    setVehicleInfo({
      bikes: vehicles.filter(v => v.type === 'bike').length,
      cars: vehicles.filter(v => v.type === 'car').length,
      autos: vehicles.filter(v => v.type === 'auto').length,
      trucks: vehicles.filter(v => v.type === 'truck').length,
      total: vehicles.length
    });
    
    // Success message
    if (violationsList.length > 0) {
      const helmetCount = violationsList.filter(v => v.type === 'no_helmet').length;
      const tripleCount = violationsList.filter(v => v.type === 'triple_riding').length;
      const overloadCount = violationsList.filter(v => v.type === 'overloading').length;
      
      const parts = [];
      if (helmetCount > 0) parts.push(`${helmetCount} helmet`);
      if (tripleCount > 0) parts.push(`${tripleCount} triple riding`);
      if (overloadCount > 0) parts.push(`${overloadCount} overloading`);
      
      setSuccess(`✅ Detection complete! Found ${violationsList.length} violation(s): ${parts.join(', ')}. Review and confirm to save.`);
    } else {
      setSuccess('✅ Analysis complete. No violations detected in the uploaded media.');
    }
  };

  // ===== CAMERA (SINGLE FRAME CAPTURE) =====
  const openCamera = async () => {
    setCameraError("");
    setCctvMode(false);
    
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setCameraError("Camera access is not supported in this browser.");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment" },
        audio: false
      });
      streamRef.current = stream;
      setCameraActive(true);
    } catch (err) {
      setCameraError("Unable to access camera. Please allow camera access or use file upload.");
    }
  };

  const closeCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    setCameraActive(false);
    setCctvMode(false);
  };

  const captureLiveFrame = async () => {
    if (!videoRef.current) return null;
    const video = videoRef.current;
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    return new Promise((resolve) => {
      canvas.toBlob((blob) => {
        resolve(blob);
      }, "image/jpeg", 0.95);
    });
  };

  const handleLiveDetect = async () => {
    if (!videoRef.current) {
      setCameraError("Camera is not ready.");
      return;
    }
    
    // If in CCTV mode, start continuous streaming
    if (cctvMode) {
      await handleStartCCTV();
      return;
    }
    
    // Single frame capture
    const blob = await captureLiveFrame();
    if (!blob) {
      setCameraError("Unable to capture frame.");
      return;
    }
    const tempFile = new File([blob], `live-capture-${Date.now()}.jpg`, { type: "image/jpeg" });
    setFile(tempFile);
    setPreview(URL.createObjectURL(tempFile));
    
    // Auto-detect
    const formData = new FormData();
    formData.append("file", tempFile);
    
    setError("");
    setSuccess("");
    setLoading(true);
    setProgress(10);

    try {
      const response = await uploadAPI.uploadMedia(formData);
      setProgress(100);
      if (!response.success) {
        setError(response.error || "Detection failed.");
        return;
      }
      processDetectionResponse(response);
    } catch (err) {
      setError("Unable to connect to backend.");
    } finally {
      setLoading(false);
    }
  };

  // ===== CCTV CONTINUOUS STREAMING =====
  const handleStartCCTV = async () => {
    // Default to webcam 0 if no source specified
    const source = cctvSource || "0";
    
    setError("");
    setSuccess(`📡 Starting CCTV continuous analysis on source: ${source}...`);
    setLoading(true);
    
    const result = await startStream(source);
    
    setLoading(false);
    
    if (result.success) {
      setSuccess(`📡 CCTV Live Analysis Active! Stream ID: ${result.streamId}. Violations detected in real-time.`);
      setShowCctvModal(false);
    } else {
      setError(result.error || "Failed to start CCTV stream");
    }
  };

  const handleStopCCTV = async () => {
    setLoading(true);
    await stopStream();
    setLoading(false);
    setSuccess("📡 CCTV stream stopped. Final results below.");
  };

  // ===== FILE HANDLING =====
  const handleDrag = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const droppedFile = e.dataTransfer.files[0];
      if (droppedFile.type.startsWith('image/') || droppedFile.type.startsWith('video/')) {
        setFile(droppedFile);
        resetState();
        setPreview(URL.createObjectURL(droppedFile));
      } else {
        setError("Please upload an image or video file.");
      }
    }
  };

  const handleFileChange = (e) => {
    const selected = e.target.files[0];
    if (!selected) return;
    setFile(selected);
    resetState();
    setPreview(URL.createObjectURL(selected));
  };

  const resetState = () => {
    setError("");
    setSuccess("");
    setDetectedPlates([]);
    setViolations([]);
    setVehicleInfo(null);
    setProcessingTime(null);
    setDetectionMessages([]);
    setAnnotatedImage(null);
    setMediaType(null);
    setPlateConfirmed(false);
    setEditedPlateNumber("");
  };

  const handleUpload = async () => {
    if (!file) {
      setError("Please attach a file first.");
      return;
    }

    resetState();
    const formData = new FormData();
    formData.append("file", file);
    const isVideo = file.type.startsWith('video/');
    
    try {
      setLoading(true);
      setProgress(5);
      
      if (isVideo) {
        setSuccess("⏳ Processing video... This may take several minutes.");
      }

      if (progressIntervalRef.current) {
        clearInterval(progressIntervalRef.current);
      }

      progressIntervalRef.current = setInterval(() => {
        setProgress((current) => {
          if (current < 30) return current + 1;
          if (current < 60) return current + 0.5;
          if (current < 85) return current + 0.2;
          return current;
        });
      }, isVideo ? 2000 : 220);

      const response = await uploadAPI.uploadMedia(formData);
      
      if (progressIntervalRef.current) {
        clearInterval(progressIntervalRef.current);
      }
      
      setProgress(100);

      if (!response.success) {
        setError(response.error || "Detection failed.");
        return;
      }

      processDetectionResponse(response);
    } catch (err) {
      console.error("Upload error:", err);
      if (progressIntervalRef.current) {
        clearInterval(progressIntervalRef.current);
      }
      setError("Connection failed. Check if backend server is running on port 5001.");
    } finally {
      setLoading(false);
    }
  };

  const clearFile = () => {
    setFile(null);
    setPreview(null);
    resetState();
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  // ===== VIOLATION ACTIONS =====
  const toggleConfirm = (index) => {
    setViolations((prev) =>
      prev.map((item, idx) =>
        idx === index ? { ...item, confirmed: !item.confirmed } : item
      )
    );
  };

  const saveViolation = async (index) => {
    const violation = violations[index];
    if (!violation.confirmed) {
      setError("Please confirm the violation before saving.");
      return;
    }
    try {
      const vehicleNumber = plateConfirmed ? editedPlateNumber : 
        (detectedPlates[0]?.number || 'UNKNOWN');
      
      const payload = {
        type: violation.type,
        confidence: violation.confidence,
        description: violation.description,
        vehicleNumber: vehicleNumber,
        status: "detected",
        fineAmount: violation.fine_amount || 1000,
        timestamp: new Date().toISOString(),
        severity: violation.severity || 'medium'
      };

      const res = await violationsAPI.create(payload);
      if (res.success) {
        setSuccess(`✅ Violation saved: ${violation.type.replace(/_/g, ' ')}`);
        setViolations((prev) =>
          prev.map((item, idx) =>
            idx === index ? { ...item, saved: true } : item
          )
        );
      } else {
        setError(res.error || "Failed to save violation");
      }
    } catch (err) {
      setError("Unable to save violation.");
    }
  };

  const saveAllViolations = async () => {
    const toSave = violations.filter((item) => item.confirmed && !item.saved);
    if (!toSave.length) {
      setError("Confirm violations first before saving.");
      return;
    }
    let totalSaved = 0;
    const vehicleNumber = plateConfirmed ? editedPlateNumber : 
      (detectedPlates[0]?.number || 'UNKNOWN');

    for (const violation of toSave) {
      try {
        const payload = {
          type: violation.type,
          confidence: violation.confidence,
          description: violation.description,
          vehicleNumber: vehicleNumber,
          status: "detected",
          fineAmount: violation.fine_amount || 1000,
          timestamp: new Date().toISOString(),
          severity: violation.severity || 'medium'
        };
        const res = await violationsAPI.create(payload);
        if (res.success) totalSaved += 1;
      } catch (err) {
        console.error("Save error", err);
      }
    }

    if (totalSaved > 0) {
      setSuccess(`✅ ${totalSaved} violation(s) saved successfully!`);
      setViolations((prev) =>
        prev.map((item) =>
          item.confirmed ? { ...item, saved: true } : item
        )
      );
      window.dispatchEvent(new CustomEvent('violationsUpdated'));
    } else {
      setError("No violations were saved.");
    }
  };

  const fileTypeLabel = file?.type?.startsWith("video/") ? "video" : "image";
  const confirmedCount = violations.filter(v => v.confirmed).length;
  const savedCount = violations.filter(v => v.saved).length;

  // ===== RENDER =====
  return (
    <div className="authority-upload-violation">
      <Container fluid className="py-4 px-lg-5">
        {/* Header */}
        <div className="page-header mb-4">
          <div className="d-flex flex-column flex-md-row align-items-start justify-content-between">
            <div>
              <h1 className="page-title">
                <FaShieldAlt className="me-2" />
                Traffic Violation Detection & Processing
              </h1>
              <p className="page-subtitle">
                Upload evidence or connect CCTV for real-time AI violation detection
              </p>
            </div>
            <Badge className="authority-badge mt-2 mt-md-0">
              <FaShieldAlt className="me-1" /> Authority Portal
            </Badge>
          </div>
        </div>

        {/* CCTV LIVE STREAMING BANNER */}
        {isStreaming && (
          <Alert variant="info" className="cctv-live-banner">
            <div className="d-flex align-items-center justify-content-between">
              <div>
                <FaBroadcastTower className="me-2 pulse-animation" />
                <strong>CCTV Live Analysis Active</strong> - Stream ID: {streamId}
                <br />
                <small>
                  Real-time violations: 🪖{streamViolations.no_helmet} 🏍️{streamViolations.triple_riding} 🚛{streamViolations.overloading} | 
                  Fine: ₹{streamTotalFine.toLocaleString('en-IN')} | 
                  Frames: {streamStats?.frames_processed || 0}
                </small>
              </div>
              <Button variant="danger" size="sm" onClick={handleStopCCTV} disabled={loading}>
                <FaStop className="me-1" /> Stop CCTV
              </Button>
            </div>
          </Alert>
        )}

        <Row className="g-4">
          {/* Left Column */}
          <Col lg={7}>
            <Card className="upload-card">
              <Card.Body>
                <div className="card-header-custom">
                  <div className="header-icon"><FaUpload /></div>
                  <div>
                    <h3 className="card-title">Evidence Submission</h3>
                    <p className="card-subtitle">Upload image/video or connect CCTV for live detection</p>
                  </div>
                </div>

                {/* Drag & Drop */}
                <div
                  className={`drag-drop-zone ${dragActive ? 'active' : ''} ${file ? 'has-file' : ''}`}
                  onDragEnter={handleDrag}
                  onDragLeave={handleDrag}
                  onDragOver={handleDrag}
                  onDrop={handleDrop}
                  onClick={() => fileInputRef.current?.click()}
                >
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*,video/*"
                    onChange={handleFileChange}
                    style={{ display: 'none' }}
                  />
                  
                  {!file ? (
                    <div className="drop-zone-content">
                      <div className="upload-icon-wrapper">
                        <FaFileImage className="upload-icon" />
                      </div>
                      <h4>Drag & Drop Evidence Here</h4>
                      <p>or <span className="browse-link">browse files</span></p>
                      <small className="file-types">Supports: JPG, PNG, MP4, MOV, AVI</small>
                    </div>
                  ) : (
                    <div className="file-selected-content">
                      {fileTypeLabel === 'video' ? (
                        <FaVideo className="file-type-icon" />
                      ) : (
                        <FaFileImage className="file-type-icon" />
                      )}
                      <div className="file-info">
                        <p className="file-name">{file.name}</p>
                        <small className="file-size">{(file.size / (1024 * 1024)).toFixed(2)} MB</small>
                      </div>
                      <Button variant="link" className="clear-file-btn" onClick={(e) => { e.stopPropagation(); clearFile(); }}>
                        <FaTimes />
                      </Button>
                    </div>
                  )}
                </div>

                {/* Action Buttons */}
                <div className="action-buttons">
                  <Button
                    variant="primary"
                    className="action-btn analyze-btn"
                    onClick={handleUpload}
                    disabled={loading || !file}
                  >
                    {loading ? (
                      <><Spinner animation="border" size="sm" className="me-2" />Processing...</>
                    ) : (
                      <><FaSearch className="me-2" />{file?.type?.startsWith('video/') ? 'Process Video' : 'Analyze Evidence'}</>
                    )}
                  </Button>

                  <Button
                    variant={cameraActive ? "danger" : "outline-secondary"}
                    className="action-btn camera-btn"
                    onClick={cameraActive ? closeCamera : openCamera}
                    disabled={loading || isStreaming}
                  >
                    <FaCamera className="me-2" />
                    {cameraActive ? "Stop Camera" : "Single Capture"}
                  </Button>

                  <Button
                    variant="info"
                    className="action-btn cctv-btn"
                    onClick={() => setShowCctvModal(true)}
                    disabled={loading || isStreaming}
                  >
                    <FaBroadcastTower className="me-2" />
                    {isStreaming ? 'CCTV Active...' : 'Live CCTV Stream'}
                  </Button>

                  <Button
                    variant="success"
                    className="action-btn save-all-btn"
                    onClick={saveAllViolations}
                    disabled={confirmedCount === 0 || loading}
                  >
                    <FaSave className="me-2" />
                    Save All ({confirmedCount})
                  </Button>
                </div>

                {/* CCTV Live Preview */}
                {isStreaming && streamPreview && (
                  <div className="cctv-live-preview mt-3">
                    <h5><FaBroadcastTower className="me-2 pulse-animation" style={{color: '#ff4444'}} />Live CCTV Feed</h5>
                    <div className="preview-container">
                      <img 
                        src={`data:image/jpeg;base64,${streamPreview}`} 
                        alt="Live CCTV" 
                        className="preview-media"
                        style={{ border: '2px solid #ff4444' }}
                      />
                      <div className="camera-overlay">
                        <div className="scan-line"></div>
                        <Badge bg="danger" className="live-badge">● LIVE</Badge>
                      </div>
                    </div>
                    {/* Live Stats Overlay */}
                    <div className="live-stats-overlay">
                      <Badge bg="danger">🪖 {streamViolations.no_helmet}</Badge>
                      <Badge bg="warning">🏍️ {streamViolations.triple_riding}</Badge>
                      <Badge bg="purple" style={{background:'#6a1b9a'}}>🚛 {streamViolations.overloading}</Badge>
                      <Badge bg="dark">₹{streamTotalFine.toLocaleString('en-IN')}</Badge>
                    </div>
                  </div>
                )}

                {/* Camera Section (Single Frame) */}
                {cameraActive && !isStreaming && (
                  <div className="camera-section">
                    <div className="camera-preview-container">
                      <video ref={videoRef} autoPlay playsInline muted className="camera-feed" />
                      <div className="camera-overlay"><div className="scan-line"></div></div>
                    </div>
                    <div className="camera-controls">
                      <Button variant="primary" className="capture-btn" onClick={handleLiveDetect} disabled={loading}>
                        <FaCamera className="me-2" /> Capture & Detect
                      </Button>
                      <Button variant="outline-secondary" onClick={closeCamera}>Close Camera</Button>
                      <Form.Check 
                        type="switch"
                        id="cctv-mode-switch"
                        label="CCTV Mode"
                        checked={cctvMode}
                        onChange={(e) => setCctvMode(e.target.checked)}
                        className="ms-3"
                      />
                    </div>
                    {cameraError && (
                      <Alert variant="warning" className="mt-3">
                        <FaExclamationTriangle className="me-2" />{cameraError}
                      </Alert>
                    )}
                  </div>
                )}

                {/* Progress */}
                {loading && (
                  <div className="progress-section">
                    <ProgressBar animated now={progress} className="custom-progress" />
                    <p className="progress-text">
                      {isStreaming ? 'CCTV stream active...' : `Analyzing... ${Math.round(progress)}%`}
                    </p>
                  </div>
                )}
                
                {/* Alerts */}
                {error && (
                  <Alert variant="danger" className="custom-alert">
                    <FaExclamationTriangle className="me-2" />{error}
                  </Alert>
                )}
                
                {success && (
                  <Alert variant="success" className="custom-alert">
                    <FaCheckCircle className="me-2" />{success}
                  </Alert>
                )}

                {/* Detection Messages */}
                {detectionMessages.length > 0 && (
                  <div className="detection-messages mt-3">
                    <h5><FaSearch className="me-2" />Detection Results</h5>
                    {detectionMessages.map((msg, idx) => (
                      <div key={idx} className="detection-message-item">{msg}</div>
                    ))}
                  </div>
                )}

                {/* Processing Time */}
                {processingTime && (
                  <Badge bg="info" className="mt-2">
                    <FaClock className="me-1" /> Processed in {processingTime}s
                  </Badge>
                )}

                {/* Preview */}
                {preview && !cameraActive && !isStreaming && (
                  <div className="preview-section">
                    <h4 className="preview-title">
                      {mediaType === 'video' ? 'Video Preview' : 'Evidence Preview'}
                    </h4>
                    <div className="preview-container">
                      {annotatedImage ? (
                        <img src={annotatedImage} alt="Detection result" className="preview-media" />
                      ) : fileTypeLabel === "video" ? (
                        <video controls src={preview} className="preview-media" />
                      ) : (
                        <img src={preview} alt="Evidence preview" className="preview-media" />
                      )}
                    </div>
                  </div>
                )}
              </Card.Body>
            </Card>

            {/* Summary Card */}
            <Card className="summary-card mt-4">
              <Card.Body>
                <div className="card-header-custom">
                  <div className="header-icon"><FaIdCard /></div>
                  <div>
                    <h3 className="card-title">Detection Summary</h3>
                    <p className="card-subtitle">AI analysis results & plate recognition</p>
                  </div>
                </div>

                {/* Stats Grid */}
                <Row className="stats-grid g-3 mb-4">
                  <Col xs={6} sm={3}>
                    <div className="stat-card">
                      <div className="stat-value">{violations.length}</div>
                      <div className="stat-label">Violations</div>
                    </div>
                  </Col>
                  <Col xs={6} sm={3}>
                    <div className="stat-card stat-warning">
                      <div className="stat-value">{violations.filter(v => v.type === 'no_helmet').length}</div>
                      <div className="stat-label">No Helmet</div>
                    </div>
                  </Col>
                  <Col xs={6} sm={3}>
                    <div className="stat-card stat-danger">
                      <div className="stat-value">{violations.filter(v => v.type === 'triple_riding').length}</div>
                      <div className="stat-label">Triple Riding</div>
                    </div>
                  </Col>
                  <Col xs={6} sm={3}>
                    <div className="stat-card stat-purple">
                      <div className="stat-value">{violations.filter(v => v.type === 'overloading').length}</div>
                      <div className="stat-label">Overloading</div>
                    </div>
                  </Col>
                </Row>

                {/* Vehicle Info */}
                {vehicleInfo && (
                  <div className="vehicle-info-section mb-4">
                    <h4 className="section-title"><FaUserFriends className="me-2" />Vehicles Detected</h4>
                    <div className="vehicle-stats">
                      {vehicleInfo.bikes > 0 && <Badge bg="primary" className="vehicle-badge">🏍️ Bikes: {vehicleInfo.bikes}</Badge>}
                      {vehicleInfo.cars > 0 && <Badge bg="success" className="vehicle-badge">🚗 Cars: {vehicleInfo.cars}</Badge>}
                      {vehicleInfo.autos > 0 && <Badge bg="warning" className="vehicle-badge">🛺 Autos: {vehicleInfo.autos}</Badge>}
                      {vehicleInfo.trucks > 0 && <Badge bg="secondary" className="vehicle-badge">🚛 Trucks: {vehicleInfo.trucks}</Badge>}
                      <Badge bg="dark" className="vehicle-badge">Total: {vehicleInfo.total}</Badge>
                    </div>
                  </div>
                )}

                {/* Plate Section */}
                {detectedPlates.length > 0 && (
                  <div className="plate-section">
                    <h4 className="section-title">License Plate Recognition (OCR)</h4>
                    {detectedPlates.map((plate, idx) => (
                      <div key={idx} className="plate-display">
                        <div className="plate-number recognized">
                          <FaIdCard className="plate-icon" />
                          <span>{plate.number}</span>
                        </div>
                        <Badge className="confidence-badge">
                          OCR: {((plate.confidence || 0) * 100).toFixed(0)}%
                        </Badge>
                      </div>
                    ))}
                    <div className="plate-confirmation mt-3">
                      <label>Confirm or Edit Plate Number</label>
                      <div className="plate-input-group">
                        <Form.Control
                          type="text"
                          value={editedPlateNumber}
                          onChange={(e) => { setEditedPlateNumber(e.target.value.toUpperCase()); setPlateConfirmed(false); }}
                          placeholder="Enter plate number"
                          className="plate-input"
                        />
                        <Button
                          variant={plateConfirmed ? "success" : "primary"}
                          onClick={() => {
                            if (!editedPlateNumber) { setError('Enter plate number.'); return; }
                            setPlateConfirmed(true);
                            setSuccess(`✅ Plate confirmed: ${editedPlateNumber}`);
                          }}
                        >
                          {plateConfirmed ? <><FaCheck /> Confirmed</> : 'Confirm'}
                        </Button>
                      </div>
                    </div>
                  </div>
                )}
              </Card.Body>
            </Card>
          </Col>

          {/* Right Column - Violations */}
          <Col lg={5}>
            <Card className="violations-card">
              <Card.Body>
                <div className="card-header-custom">
                  <div className="header-icon"><FaExclamationTriangle /></div>
                  <div>
                    <h3 className="card-title">Detected Violations</h3>
                    <p className="card-subtitle">
                      {violations.length > 0 
                        ? `Review and confirm (${confirmedCount} confirmed, ${savedCount} saved)` 
                        : 'Upload evidence or start CCTV to detect violations'}
                    </p>
                  </div>
                </div>

                {violations.length === 0 ? (
                  <div className="empty-state">
                    <div className="empty-icon"><FaFileImage /></div>
                    <h4>No Violations Detected</h4>
                    <p>Upload an image/video or start CCTV live analysis</p>
                  </div>
                ) : (
                  <div className="violations-list">
                    {violations.map((violation, index) => (
                      <div 
                        key={index} 
                        className={`violation-item ${violation.confirmed ? 'confirmed' : ''} ${violation.saved ? 'saved' : ''}`}
                      >
                        <div className="violation-header">
                          <h5 className="violation-type">
                            {violation.type === 'no_helmet' ? '🪖 No Helmet' : 
                             violation.type === 'triple_riding' ? '🏍️ Triple Riding' : 
                             violation.type === 'overloading' ? '🚛 Overloading' : 
                             violation.type.replace(/_/g, ' ')}
                          </h5>
                          <div className="violation-badges">
                            {violation.severity === 'high' && <Badge bg="danger">HIGH</Badge>}
                            {violation.confirmed && <Badge bg="success"><FaCheck /> Confirmed</Badge>}
                            {violation.saved && <Badge bg="info"><FaSave /> Saved</Badge>}
                          </div>
                        </div>
                        <p className="violation-description">{violation.description}</p>
                        <div className="violation-meta">
                          <div className="confidence-indicator">
                            <div className="confidence-bar">
                              <div className="confidence-fill" style={{ width: `${violation.confidence * 100}%` }}></div>
                            </div>
                            <span>AI Confidence: {(violation.confidence * 100).toFixed(0)}%</span>
                          </div>
                          {violation.fine_amount && (
                            <Badge bg="warning" text="dark" className="mt-1">
                              Fine: ₹{violation.fine_amount.toLocaleString('en-IN')}
                            </Badge>
                          )}
                        </div>
                        <div className="violation-actions mt-2">
                          <Button
                            variant={violation.confirmed ? "success" : "outline-primary"}
                            size="sm"
                            onClick={() => toggleConfirm(index)}
                            disabled={violation.saved}
                          >
                            {violation.confirmed ? <><FaCheck /> Confirmed</> : 'Confirm'}
                          </Button>
                          <Button
                            variant="outline-success"
                            size="sm"
                            className="ms-2"
                            onClick={() => saveViolation(index)}
                            disabled={!violation.confirmed || violation.saved}
                          >
                            <FaSave /> {violation.saved ? 'Saved' : 'Save'}
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </Card.Body>
            </Card>

            {/* Guidelines */}
            <Card className="guidelines-card mt-4">
              <Card.Body>
                <h5>📋 Violation Guidelines</h5>
                <div className="guideline-item">
                  <strong>🪖 No Helmet</strong> - ₹1,000 fine per offense
                </div>
                <div className="guideline-item">
                  <strong>🏍️ Triple Riding</strong> - ₹2,000 + License suspension
                </div>
                <div className="guideline-item">
                  <strong>🚛 Overloading</strong> - ₹2,000-₹5,000 per violation
                </div>
              </Card.Body>
            </Card>
          </Col>
        </Row>

        {/* CCTV Modal */}
        <Modal show={showCctvModal} onHide={() => setShowCctvModal(false)} centered>
          <Modal.Header closeButton style={{background: '#0d1b3e', color: '#e0e0e0', borderBottom: '1px solid #1a3a6b'}}>
            <Modal.Title><FaBroadcastTower className="me-2" />Start CCTV Live Analysis</Modal.Title>
          </Modal.Header>
          <Modal.Body style={{background: '#111936', color: '#e0e0e0'}}>
            <p>Enter CCTV source to start continuous real-time violation detection:</p>
            <Form.Group className="mb-3">
              <Form.Label>RTSP URL or Camera Index</Form.Label>
              <Form.Control
                type="text"
                value={cctvSource}
                onChange={(e) => setCctvSource(e.target.value)}
                placeholder="e.g., rtsp://192.168.1.100:554/stream OR 0 for webcam"
                style={{background: '#0a0e27', color: '#e0e0e0', border: '1px solid #1e2d50'}}
              />
              <Form.Text style={{color: '#888'}}>
                Use "0" for built-in webcam, "1" for external camera, or enter RTSP URL for IP camera
              </Form.Text>
            </Form.Group>
            <Alert variant="info" style={{background: '#0d1b3e', border: '1px solid #1a3a6b', color: '#e0e0e0'}}>
              <FaBroadcastTower className="me-2" />
              CCTV mode continuously analyzes every 0.5 seconds and tracks violations in real-time.
              Press Stop when done.
            </Alert>
          </Modal.Body>
          <Modal.Footer style={{background: '#111936', borderTop: '1px solid #1a3a6b'}}>
            <Button variant="secondary" onClick={() => setShowCctvModal(false)}>
              Cancel
            </Button>
            <Button variant="primary" onClick={handleStartCCTV}>
              <FaPlay className="me-1" /> Start CCTV Analysis
            </Button>
          </Modal.Footer>
        </Modal>
      </Container>
    </div>
  );
};

export default AuthorityUploadViolation;