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
  FaFileImage, 
  FaSave, 
  FaCamera,
  FaVideo,
  FaExclamationTriangle,
  FaCheck,
  FaTimes,
  FaIdCard,
  FaClock,
  FaSearch,
  FaStop,
  FaPlay,
  FaRedo,
  FaBroadcastTower,
  FaUsb,
  FaNetworkWired,
  FaCheckCircle,
  FaClipboardList,
  FaMoneyBillWave,
  FaInfoCircle
} from "react-icons/fa";

import { uploadAPI, violationsAPI } from "../api/api";
import "./UploadViolation.css";

// Only store DETECTED violations locally (NOT saved ones)
const DETECTED_VIOLATIONS_KEY = 'traffic_authority_violations';
// Saved violations go to this key that Profile/Manage pages read
const SAVED_VIOLATIONS_KEY = 'traffic_saved_violations';

const loadFromStorage = (key, defaultValue = null) => {
  try {
    const data = localStorage.getItem(key);
    return data ? JSON.parse(data) : defaultValue;
  } catch (err) {
    return defaultValue;
  }
};

const saveToStorage = (key, value) => {
  try {
    if (value === null || value === undefined) {
      localStorage.removeItem(key);
    } else {
      localStorage.setItem(key, JSON.stringify(value));
    }
  } catch (err) {}
};

// ==================== CCTV STREAM HOOK (unchanged) ====================
const useCCTVStream = () => {
  const [streamId, setStreamId] = useState(null);
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamStats, setStreamStats] = useState(null);
  const [streamPreview, setStreamPreview] = useState(null);
  const [streamViolations, setStreamViolations] = useState({ no_helmet: 0, triple_riding: 0, overloading: 0 });
  const [streamTotalFine, setStreamTotalFine] = useState(0);
  const [elapsedTime, setElapsedTime] = useState(0);
  const [startTime, setStartTime] = useState(null);
  const [cctvDuration, setCctvDuration] = useState(300);
  const [activeSource, setActiveSource] = useState(null);
  
  const pollingRef = useRef(null);
  const previewIntervalRef = useRef(null);
  const timerRef = useRef(null);

  const startStream = async (source, maxDuration = 300) => {
    try {
      const id = `cctv_${Date.now()}`;
      setCctvDuration(maxDuration);
      setActiveSource(source);
      const response = await fetch('http://localhost:8000/cctv/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stream_id: id, source: source, max_duration: maxDuration })
      });
      const data = await response.json();
      if (data.success) {
        setStreamId(id);
        setIsStreaming(true);
        setStartTime(Date.now());
        setElapsedTime(0);
        return { success: true, streamId: id };
      }
      return { success: false, error: data.message };
    } catch (err) {
      return { success: false, error: 'Cannot connect to AI server on port 8000' };
    }
  };

  const stopStream = useCallback(async () => {
    if (!streamId) return null;
    try {
      const response = await fetch('http://localhost:8000/cctv/stop', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stream_id: streamId })
      });
      const data = await response.json();
      setIsStreaming(false);
      setStreamId(null);
      setStartTime(null);
      setActiveSource(null);
      if (pollingRef.current) clearInterval(pollingRef.current);
      if (previewIntervalRef.current) clearInterval(previewIntervalRef.current);
      if (timerRef.current) clearInterval(timerRef.current);
      return data.final_report || data;
    } catch (err) {
      setIsStreaming(false);
      setStreamId(null);
      setActiveSource(null);
      return null;
    }
  }, [streamId]);

  useEffect(() => {
    if (!isStreaming || !startTime) return;
    timerRef.current = setInterval(() => {
      const elapsed = Math.floor((Date.now() - startTime) / 1000);
      setElapsedTime(elapsed);
      if (elapsed >= cctvDuration) stopStream();
    }, 1000);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [isStreaming, startTime, cctvDuration, stopStream]);

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
      } catch (err) {}
    }, 2000);

    previewIntervalRef.current = setInterval(async () => {
      try {
        const res = await fetch(`http://localhost:8000/cctv/preview?stream_id=${streamId}`);
        const data = await res.json();
        if (data.image) setStreamPreview(data.image);
      } catch (err) {}
    }, 1000);

    return () => {
      if (pollingRef.current) clearInterval(pollingRef.current);
      if (previewIntervalRef.current) clearInterval(previewIntervalRef.current);
    };
  }, [isStreaming, streamId]);

  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return {
    isStreaming, streamPreview,
    streamViolations, streamTotalFine, elapsedTime, cctvDuration,
    activeSource, formatTime, startStream, stopStream
  };
};

// ==================== MAIN COMPONENT ====================
const AuthorityUploadViolation = () => {
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [detectedPlates, setDetectedPlates] = useState([]);
  const [violations, setViolations] = useState(() => loadFromStorage(DETECTED_VIOLATIONS_KEY, []));
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
  
  const [showCctvModal, setShowCctvModal] = useState(false);
  const [selectedCamera, setSelectedCamera] = useState(null);
  const [customSource, setCustomSource] = useState("");
  const [cctvDuration, setCctvDuration] = useState(5);
  
  const [previewStreamActive, setPreviewStreamActive] = useState(false);
  const previewVideoRef = useRef(null);
  const previewStreamRef = useRef(null);
  
  const [availableCameras, setAvailableCameras] = useState([]);
  const [detectingCameras, setDetectingCameras] = useState(false);

  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const fileInputRef = useRef(null);
  const progressIntervalRef = useRef(null);

  const {
    isStreaming, streamPreview,
    streamViolations, streamTotalFine, elapsedTime, cctvDuration: streamDuration,
    activeSource, formatTime, startStream, stopStream
  } = useCCTVStream();

  // ===== PERSIST DETECTED VIOLATIONS TO LOCAL STORAGE =====
  useEffect(() => {
    if (violations.length > 0) {
      saveToStorage(DETECTED_VIOLATIONS_KEY, violations);
    }
  }, [violations]);

  // ===== CLEANUP =====
  useEffect(() => {
    return () => {
      if (violations.length > 0) saveToStorage(DETECTED_VIOLATIONS_KEY, violations);
      if (streamRef.current) streamRef.current.getTracks().forEach(t => t.stop());
      if (previewStreamRef.current) previewStreamRef.current.getTracks().forEach(t => t.stop());
      if (progressIntervalRef.current) clearInterval(progressIntervalRef.current);
    };
  }, [violations]);

  useEffect(() => {
    if (cameraActive && streamRef.current && videoRef.current) {
      videoRef.current.srcObject = streamRef.current;
    }
  }, [cameraActive]);

  // ===== DETECT CAMERAS =====
  const detectCameras = useCallback(async () => {
    setDetectingCameras(true);
    const cameras = [];
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const videoDevices = devices.filter(d => d.kind === 'videoinput');
      for (let i = 0; i < videoDevices.length; i++) {
        cameras.push({ id: `webcam_${i}`, name: videoDevices[i].label || `Camera ${i + 1}`, source: String(i), type: 'usb', deviceId: videoDevices[i].deviceId });
      }
    } catch (err) {}
    const ipPresets = [
      { id: 'ip_front_gate', name: 'Front Gate IP Camera', source: 'rtsp://192.168.1.100:554/stream1', type: 'ip', description: 'Main entrance' },
      { id: 'ip_parking', name: 'Parking Lot Camera', source: 'rtsp://192.168.1.101:554/stream1', type: 'ip', description: 'Parking area' },
      { id: 'ip_highway', name: 'Highway Camera', source: 'rtsp://192.168.1.102:554/stream1', type: 'ip', description: 'Highway monitoring' },
      { id: 'custom', name: 'Custom RTSP/URL', source: '', type: 'custom', description: 'Enter custom URL' }
    ];
    setAvailableCameras([...cameras, ...ipPresets]);
    setDetectingCameras(false);
  }, []);

  useEffect(() => { detectCameras(); }, [detectCameras]);

  const startCameraPreview = async (camera) => {
    if (previewStreamRef.current) { previewStreamRef.current.getTracks().forEach(t => t.stop()); previewStreamRef.current = null; }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: camera.deviceId ? { deviceId: { exact: camera.deviceId }, width: { ideal: 640 }, height: { ideal: 480 } } : { width: { ideal: 640 }, height: { ideal: 480 } },
        audio: false
      });
      previewStreamRef.current = stream;
      setTimeout(() => { if (previewVideoRef.current) previewVideoRef.current.srcObject = stream; }, 200);
      setPreviewStreamActive(true);
    } catch (err) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: { width: { ideal: 640 }, height: { ideal: 480 } }, audio: false });
        previewStreamRef.current = stream;
        setTimeout(() => { if (previewVideoRef.current) previewVideoRef.current.srcObject = stream; }, 200);
        setPreviewStreamActive(true);
      } catch (err2) { setPreviewStreamActive(false); }
    }
  };

  const stopCameraPreview = () => {
    if (previewStreamRef.current) { previewStreamRef.current.getTracks().forEach(t => t.stop()); previewStreamRef.current = null; }
    setPreviewStreamActive(false);
  };

  // ===== PROCESS DETECTION =====
  const processDetectionResponse = (response) => {
    const report = response.report || response;
    const counts = response.violation_counts || report.summary || {};
    const messages = [];
    const total = counts.total || counts.total_violations || 0;
    if (total > 0) {
      messages.push(`🚨 Found ${total} violation(s)`);
      if ((counts.no_helmet || counts.no_helmet_cases) > 0) messages.push(`🪖 ${counts.no_helmet || counts.no_helmet_cases} No Helmet - ₹1,000 each`);
      if ((counts.triple_riding || counts.triple_riding_cases) > 0) messages.push(`🏍️ ${counts.triple_riding || counts.triple_riding_cases} Triple Riding - ₹2,000 each`);
      if ((counts.overloading || counts.overloading_cases) > 0) messages.push(`🚛 ${counts.overloading || counts.overloading_cases} Overloading - ₹5,000 each`);
    } else {
      messages.push('✅ No violations detected');
    }
    messages.push(`🚗 ${counts.total_vehicles || report.all_vehicles?.length || 0} vehicles detected`);
    setDetectionMessages(messages);
    
    const violationsData = response.violations || report.violations || {};
    const violationsList = [];
    (violationsData.no_helmet || []).forEach(v => violationsList.push({ type: 'no_helmet', confidence: v.confidence || 0.85, description: v.message || 'Rider without helmet detected', fine_amount: v.fine_amount || 1000, confirmed: false, saved: false, severity: 'high' }));
    (violationsData.triple_riding || []).forEach(v => violationsList.push({ type: 'triple_riding', confidence: v.confidence || 0.85, description: v.message || 'Three persons on two-wheeler', fine_amount: v.fine_amount || 2000, confirmed: false, saved: false, severity: 'high' }));
    (violationsData.overloading || []).forEach(v => violationsList.push({ type: 'overloading', confidence: v.confidence || 0.80, description: v.message || 'Vehicle carrying excess passengers', fine_amount: v.fine_amount || 5000, confirmed: false, saved: false, severity: 'medium' }));
    setViolations(violationsList);
    
    const plates = (report.plates || []).filter(p => p.text).map(p => ({ number: p.text, confidence: p.confidence || 0 }));
    setDetectedPlates(plates);
    setPlateConfirmed(false);
    setEditedPlateNumber(plates[0]?.number || "");
    
    if (response.processing_time) setProcessingTime(response.processing_time);
    setMediaType(response.media_type || (file?.type?.startsWith('video/') ? 'video' : 'image'));
    if (response.annotated_image) setAnnotatedImage(`data:image/jpeg;base64,${response.annotated_image}`);
    
    const vehicles = report.all_vehicles || report.vehicles || [];
    setVehicleInfo({ bikes: vehicles.filter(v => v.type === 'bike').length, cars: vehicles.filter(v => v.type === 'car').length, autos: vehicles.filter(v => v.type === 'auto').length, trucks: vehicles.filter(v => v.type === 'truck').length, total: vehicles.length });
    setSuccess(`Detection complete: ${violationsList.length} violation(s) found`);
  };

  // ===== CAMERA =====
  const openCamera = async () => {
    setCameraError("");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" }, audio: false });
      streamRef.current = stream;
      setCameraActive(true);
    } catch (err) { setCameraError("Cannot access camera."); }
  };

  const closeCamera = () => {
    if (streamRef.current) { streamRef.current.getTracks().forEach(t => t.stop()); streamRef.current = null; }
    setCameraActive(false);
  };

  const captureLiveFrame = async () => {
    if (!videoRef.current) return null;
    const canvas = document.createElement("canvas");
    canvas.width = videoRef.current.videoWidth;
    canvas.height = videoRef.current.videoHeight;
    canvas.getContext("2d").drawImage(videoRef.current, 0, 0);
    return new Promise(r => canvas.toBlob(r, "image/jpeg", 0.95));
  };

  const handleLiveDetect = async () => {
    if (!videoRef.current) { setCameraError("Camera not ready."); return; }
    const blob = await captureLiveFrame();
    if (!blob) { setCameraError("Cannot capture."); return; }
    const tempFile = new File([blob], `capture-${Date.now()}.jpg`, { type: "image/jpeg" });
    setFile(tempFile); setPreview(URL.createObjectURL(tempFile));
    const formData = new FormData(); formData.append("file", tempFile);
    setError(""); setSuccess(""); setLoading(true); setProgress(10);
    try {
      const response = await uploadAPI.uploadMedia(formData);
      setProgress(100);
      if (!response.success) { setError(response.error || "Failed."); return; }
      processDetectionResponse(response);
    } catch (err) { setError("Connection failed."); }
    finally { setLoading(false); }
  };

  // ===== CCTV =====
  const handleSelectCamera = (camera) => {
    setSelectedCamera(camera);
    if (camera.type === 'custom') { setCustomSource(''); stopCameraPreview(); }
    else if (camera.type === 'usb') { startCameraPreview(camera); }
    else { stopCameraPreview(); }
  };

  const handleStartCCTV = async () => {
    if (!selectedCamera) { setError("Please select a camera first."); return; }
    let source = selectedCamera.type === 'custom' ? customSource : selectedCamera.source;
    if (selectedCamera.type === 'custom' && !source) { setError("Please enter a camera URL."); return; }
    stopCameraPreview();
    setError(""); setSuccess(`📡 Starting CCTV with ${selectedCamera.name}...`); setLoading(true);
    const result = await startStream(source, cctvDuration * 60);
    setLoading(false);
    if (result.success) { setSuccess(`📡 CCTV Live! Analyzing for ${cctvDuration} min.`); setShowCctvModal(false); }
    else { setError(result.error || "Failed to start CCTV stream."); }
  };

  const handleStopCCTV = async () => {
    setLoading(true);
    const report = await stopStream();
    setLoading(false);
    if (report) {
      const vd = report.violations || {};
      const list = [];
      (vd.no_helmet || []).forEach(v => list.push({ type: 'no_helmet', confidence: v.confidence || 0.85, description: v.message || 'No helmet', fine_amount: v.fine_amount || 1000, confirmed: false, saved: false, severity: 'high' }));
      (vd.triple_riding || []).forEach(v => list.push({ type: 'triple_riding', confidence: v.confidence || 0.85, description: v.message || 'Triple riding', fine_amount: v.fine_amount || 2000, confirmed: false, saved: false, severity: 'high' }));
      (vd.overloading || []).forEach(v => list.push({ type: 'overloading', confidence: v.confidence || 0.80, description: v.message || 'Overloading', fine_amount: v.fine_amount || 5000, confirmed: false, saved: false, severity: 'medium' }));
      setViolations(list);
      setSuccess(`📡 CCTV stopped. ${list.length} violation(s) found.`);
    } else { setSuccess('📡 CCTV stopped.'); }
  };

  // ===== FILE HANDLING =====
  const handleDrag = (e) => { e.preventDefault(); e.stopPropagation(); setDragActive(e.type === "dragenter" || e.type === "dragover"); };

  const handleDrop = (e) => {
    e.preventDefault(); e.stopPropagation(); setDragActive(false);
    const f = e.dataTransfer.files?.[0];
    if (f && (f.type.startsWith('image/') || f.type.startsWith('video/'))) { setFile(f); resetState(); setPreview(URL.createObjectURL(f)); }
    else setError("Upload image/video only.");
  };

  const handleFileChange = (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setFile(f); resetState(); setPreview(URL.createObjectURL(f));
  };

  const resetState = () => {
    setError(""); setSuccess(""); setDetectedPlates([]); setViolations([]);
    setVehicleInfo(null); setProcessingTime(null); setDetectionMessages([]);
    setAnnotatedImage(null); setMediaType(null); setPlateConfirmed(false); setEditedPlateNumber("");
    localStorage.removeItem(DETECTED_VIOLATIONS_KEY);
  };

  const handleUpload = async () => {
    if (!file) { setError("Attach a file."); return; }
    resetState();
    const formData = new FormData(); formData.append("file", file);
    const isVideo = file.type.startsWith('video/');
    try {
      setLoading(true); setProgress(5);
      if (isVideo) setSuccess("⏳ Processing video...");
      progressIntervalRef.current = setInterval(() => { setProgress(c => c < 30 ? c + 1 : c < 60 ? c + 0.5 : c < 85 ? c + 0.2 : c); }, isVideo ? 2000 : 220);
      const response = await uploadAPI.uploadMedia(formData);
      clearInterval(progressIntervalRef.current); setProgress(100);
      if (!response.success) { setError(response.error || "Failed."); return; }
      processDetectionResponse(response);
    } catch (err) { clearInterval(progressIntervalRef.current); setError("Connection failed."); }
    finally { setLoading(false); }
  };

  const clearFile = () => { setFile(null); setPreview(null); resetState(); if (fileInputRef.current) fileInputRef.current.value = ""; };

  // ===== VIOLATION ACTIONS - ONLY SAVE WHEN CONFIRMED =====
  const toggleConfirm = (i) => {
    setViolations(prev => {
      const updated = prev.map((v, idx) => idx === i ? { ...v, confirmed: !v.confirmed } : v);
      return updated;
    });
  };

  const saveViolation = async (i) => {
    const v = violations[i];
    if (!v.confirmed) { setError("Please confirm the violation first."); return; }
    try {
      const violationData = {
        type: v.type, confidence: v.confidence, description: v.description,
        vehicleNumber: plateConfirmed ? editedPlateNumber : (detectedPlates[0]?.number || 'UNKNOWN'),
        status: "detected", fineAmount: v.fine_amount || 1000,
        timestamp: new Date().toISOString(), severity: v.severity || 'medium'
      };
      
      // Try to save via API
      let apiSaved = false;
      try {
        const res = await violationsAPI.create(violationData);
        apiSaved = res.success;
      } catch (apiErr) {
        console.warn('API save failed, saving locally:', apiErr.message);
      }
      
      // Create saved violation object
      const savedViolation = {
        ...v,
        saved: true,
        confirmed: true,
        savedAt: new Date().toISOString(),
        violationData,
        vehicleNumber: violationData.vehicleNumber,
        fineAmount: violationData.fineAmount,
        status: 'detected',
        apiSaved
      };
      
      // Update current violations list
      const updated = violations.map((item, idx) => idx === i ? { ...item, saved: true, confirmed: true } : item);
      setViolations(updated);
      
      // SAVE TO SHARED STORAGE (for Profile & Manage pages)
      const existingSaved = loadFromStorage(SAVED_VIOLATIONS_KEY, []);
      // Check for duplicates
      const duplicateIndex = existingSaved.findIndex(sv => 
        sv.type === savedViolation.type && 
        sv.vehicleNumber === savedViolation.vehicleNumber &&
        sv.savedAt === savedViolation.savedAt
      );
      if (duplicateIndex === -1) {
        existingSaved.push(savedViolation);
        saveToStorage(SAVED_VIOLATIONS_KEY, existingSaved);
      }
      
      // Dispatch event so other pages refresh
      window.dispatchEvent(new CustomEvent('violationSaved', { 
        detail: { violation: savedViolation } 
      }));
      
      setSuccess(`✅ Violation saved: ${v.type.replace(/_/g, ' ')}`);
    } catch (err) { 
      setError("Cannot save violation."); 
    }
  };

  const saveAllViolations = async () => {
    const toSave = violations.filter(v => v.confirmed && !v.saved);
    if (!toSave.length) { setError("Please confirm violations first before saving."); return; }
    setLoading(true);
    let savedCount = 0;
    const savedViolations = [];
    
    for (const v of toSave) {
      try {
        const violationData = {
          type: v.type, confidence: v.confidence, description: v.description,
          vehicleNumber: plateConfirmed ? editedPlateNumber : (detectedPlates[0]?.number || 'UNKNOWN'),
          status: "detected", fineAmount: v.fine_amount || 1000,
          timestamp: new Date().toISOString(), severity: v.severity || 'medium'
        };
        
        let apiSaved = false;
        try {
          const res = await violationsAPI.create(violationData);
          apiSaved = res.success;
        } catch (apiErr) {}
        
        savedCount++;
        savedViolations.push({
          ...v,
          saved: true,
          confirmed: true,
          savedAt: new Date().toISOString(),
          violationData,
          vehicleNumber: violationData.vehicleNumber,
          fineAmount: violationData.fineAmount,
          status: 'detected',
          apiSaved
        });
      } catch (err) {}
    }
    
    setLoading(false);
    
    if (savedCount > 0) {
      const updated = violations.map(v => v.confirmed && !v.saved ? { ...v, saved: true, confirmed: true } : v);
      setViolations(updated);
      
      // SAVE TO SHARED STORAGE
      const existingSaved = loadFromStorage(SAVED_VIOLATIONS_KEY, []);
      savedViolations.forEach(sv => {
        const duplicateIndex = existingSaved.findIndex(esv => 
          esv.type === sv.type && esv.vehicleNumber === sv.vehicleNumber && esv.savedAt === sv.savedAt
        );
        if (duplicateIndex === -1) {
          existingSaved.push(sv);
        }
      });
      saveToStorage(SAVED_VIOLATIONS_KEY, existingSaved);
      
      window.dispatchEvent(new CustomEvent('violationsBatchSaved', { 
        detail: { savedCount, savedViolations } 
      }));
      
      setSuccess(`✅ ${savedCount} violation(s) saved successfully!`);
    } else {
      setError("Failed to save violations.");
    }
  };

  const fileTypeLabel = file?.type?.startsWith("video/") ? "video" : "image";
  const confirmedCount = violations.filter(v => v.confirmed).length;
  const savedCount = violations.filter(v => v.saved).length;
  const totalFine = violations.reduce((s, v) => s + (v.fine_amount || 0), 0);

  // ==================== RENDER ====================
  return (
    <div className="authority-upload-violation">
      <Container fluid className="py-4 px-lg-5">
        {/* HEADER */}
        <div className="page-header mb-4">
          <div className="d-flex flex-column flex-md-row align-items-start justify-content-between">
            <div>
              <h1 className="page-title"><FaShieldAlt className="me-2" />Traffic Violation Detection</h1>
              <p className="page-subtitle">Upload evidence or connect CCTV cameras for AI-powered detection</p>
            </div>
            <Badge className="authority-badge mt-2 mt-md-0"><FaShieldAlt className="me-1" /> Authority Portal</Badge>
          </div>
        </div>

        {/* CCTV LIVE BANNER */}
        {isStreaming && (
          <Alert className="cctv-live-banner mb-4" style={{background: 'linear-gradient(135deg, #1a0033, #0d1b3e)', border: '2px solid #ff4444', borderRadius: '12px', color: '#eee'}}>
            <div className="d-flex align-items-center justify-content-between flex-wrap">
              <div>
                <FaBroadcastTower className="me-2 pulse-animation" style={{color: '#ff4444'}} />
                <strong style={{color: '#ff4444', fontSize: '1rem'}}>● CCTV LIVE</strong>
                {selectedCamera && <span style={{fontSize: '0.95rem'}}> - {selectedCamera.name}</span>}
                <br /><small style={{fontSize: '0.85rem'}}>Source: {activeSource} | 🪖{streamViolations.no_helmet} 🏍️{streamViolations.triple_riding} 🚛{streamViolations.overloading} | Fine: ₹{streamTotalFine.toLocaleString('en-IN')} | ⏱️ {formatTime(elapsedTime)} / {formatTime(streamDuration * 60)}</small>
              </div>
              <Button variant="danger" size="sm" onClick={handleStopCCTV} disabled={loading} style={{fontWeight: '600'}}><FaStop className="me-1" /> Stop CCTV</Button>
            </div>
          </Alert>
        )}

        <Row className="g-4">
          <Col lg={7}>
            {/* UPLOAD CARD */}
            <Card className="upload-card">
              <Card.Body>
                <div className="card-header-custom">
                  <div className="header-icon"><FaUpload /></div>
                  <div><h3 className="card-title">Evidence Submission</h3><p className="card-subtitle">Upload media or connect camera for analysis</p></div>
                </div>

                <div className={`drag-drop-zone ${dragActive ? 'active' : ''} ${file ? 'has-file' : ''}`}
                  onDragEnter={handleDrag} onDragLeave={handleDrag} onDragOver={handleDrag} onDrop={handleDrop}
                  onClick={() => fileInputRef.current?.click()}>
                  <input ref={fileInputRef} type="file" accept="image/*,video/*" onChange={handleFileChange} style={{display:'none'}} />
                  {!file ? (
                    <div className="drop-zone-content">
                      <div className="upload-icon-wrapper"><FaFileImage className="upload-icon" /></div>
                      <h4>Drag & Drop Evidence</h4>
                      <p>or <span className="browse-link">browse files</span></p>
                      <small className="file-types">Supported: JPG, PNG, MP4, MOV, AVI</small>
                    </div>
                  ) : (
                    <div className="file-selected-content">
                      {fileTypeLabel === 'video' ? <FaVideo className="file-type-icon" /> : <FaFileImage className="file-type-icon" />}
                      <div className="file-info"><p className="file-name">{file.name}</p><small className="file-size">{(file.size/1048576).toFixed(2)} MB • {fileTypeLabel.toUpperCase()}</small></div>
                      <Button variant="link" className="clear-file-btn" onClick={e => {e.stopPropagation(); clearFile();}}><FaTimes /></Button>
                    </div>
                  )}
                </div>

                <div className="action-buttons">
                  <Button className="action-btn analyze-btn" onClick={handleUpload} disabled={loading || !file}>
                    {loading ? <Spinner size="sm" /> : <FaSearch />} <span>{file?.type?.startsWith('video/') ? 'Process Video' : 'Analyze Image'}</span>
                  </Button>
                  <Button className="action-btn camera-btn" variant="outline-secondary" onClick={cameraActive ? closeCamera : openCamera} disabled={loading || isStreaming}>
                    <FaCamera /> <span>{cameraActive ? 'Close Camera' : 'Single Capture'}</span>
                  </Button>
                  <Button className="action-btn" variant="info" onClick={() => { detectCameras(); setShowCctvModal(true); }} disabled={loading || isStreaming}>
                    <FaBroadcastTower /> <span>{isStreaming ? 'CCTV Active...' : 'Live CCTV'}</span>
                  </Button>
                  <Button className="action-btn save-all-btn" onClick={saveAllViolations} disabled={confirmedCount === 0 || loading}>
                    <FaSave /> <span>Save All ({confirmedCount})</span>
                  </Button>
                </div>

                {cameraActive && !isStreaming && (
                  <div className="camera-section">
                    <div className="camera-preview-container">
                      <video ref={videoRef} autoPlay playsInline muted className="camera-feed" />
                      <div className="camera-overlay"><div className="scan-line" /></div>
                    </div>
                    <div className="camera-controls">
                      <Button className="capture-btn" onClick={handleLiveDetect} disabled={loading}><FaCamera className="me-1" /> Capture & Detect</Button>
                      <Button variant="outline-secondary" onClick={closeCamera}><FaTimes className="me-1" /> Close</Button>
                    </div>
                    {cameraError && <Alert variant="warning" className="mt-2 custom-alert">{cameraError}</Alert>}
                  </div>
                )}

                {isStreaming && streamPreview && (
                  <div className="cctv-live-preview mt-3">
                    <h5 className="preview-title"><FaBroadcastTower className="me-2" style={{color:'#ff4444'}} />Live Feed <Badge bg="danger">● LIVE</Badge></h5>
                    <div className="preview-container" style={{position:'relative'}}>
                      <img src={`data:image/jpeg;base64,${streamPreview}`} alt="Live" className="preview-media" />
                      <div style={{position:'absolute', top:10, right:10, display:'flex', gap:5}}>
                        <Badge bg="danger" style={{fontSize:'0.8rem'}}>🪖{streamViolations.no_helmet}</Badge>
                        <Badge bg="warning" style={{fontSize:'0.8rem'}}>🏍️{streamViolations.triple_riding}</Badge>
                        <Badge style={{background:'#6a1b9a', color:'white', fontSize:'0.8rem'}}>🚛{streamViolations.overloading}</Badge>
                      </div>
                    </div>
                  </div>
                )}

                {loading && !isStreaming && (
                  <div className="progress-section">
                    <ProgressBar animated now={progress} className="custom-progress" />
                    <p className="progress-text">Processing... {Math.round(progress)}%</p>
                  </div>
                )}

                {error && <Alert variant="danger" className="custom-alert"><FaExclamationTriangle className="me-2" />{error}</Alert>}
                {success && <Alert variant="success" className="custom-alert"><FaCheckCircle className="me-2" />{success}</Alert>}

                {detectionMessages.length > 0 && (
                  <div className="mt-3 p-3" style={{background: '#f8f9fa', borderRadius: '12px', border: '1px solid #e0e0e0'}}>
                    <h5 className="mb-2" style={{fontSize: '1.05rem', fontWeight: '700', color: '#1a237e'}}><FaSearch className="me-2" />Detection Results</h5>
                    {detectionMessages.map((m, i) => <div key={i} className="mb-1" style={{fontSize: '0.9rem', color: '#333', fontWeight: '500'}}>{m}</div>)}
                    {processingTime && <Badge bg="info" className="mt-2" style={{fontSize: '0.8rem'}}><FaClock className="me-1" /> Processed in {processingTime}s</Badge>}
                  </div>
                )}

                {preview && !cameraActive && !isStreaming && (
                  <div className="preview-section">
                    <h5 className="preview-title">{mediaType === 'video' ? '🎬 Video' : '📷 Image'} Preview</h5>
                    <div className="preview-container">
                      {annotatedImage ? <img src={annotatedImage} alt="Detection Result" className="preview-media" /> :
                       fileTypeLabel === 'video' ? <video controls src={preview} className="preview-media" /> :
                       <img src={preview} alt="Preview" className="preview-media" />}
                    </div>
                  </div>
                )}
              </Card.Body>
            </Card>

            {/* SUMMARY CARD */}
            <Card className="summary-card mt-3">
              <Card.Body>
                <div className="card-header-custom">
                  <div className="header-icon"><FaClipboardList /></div>
                  <div><h3 className="card-title">Detection Summary</h3><p className="card-subtitle">Violation breakdown & vehicle information</p></div>
                </div>
                <Row className="stats-grid">
                  <Col xs={3}><div className="stat-card"><div className="stat-value">{violations.length}</div><div className="stat-label">Total</div></div></Col>
                  <Col xs={3}><div className="stat-card stat-warning"><div className="stat-value">{violations.filter(v=>v.type==='no_helmet').length}</div><div className="stat-label">🪖 Helmet</div></div></Col>
                  <Col xs={3}><div className="stat-card stat-danger"><div className="stat-value">{violations.filter(v=>v.type==='triple_riding').length}</div><div className="stat-label">🏍️ Triple</div></div></Col>
                  <Col xs={3}><div className="stat-card stat-purple"><div className="stat-value">{violations.filter(v=>v.type==='overloading').length}</div><div className="stat-label">🚛 Overload</div></div></Col>
                </Row>
                <div className="d-flex justify-content-between align-items-center mb-3">
                  <h5><FaMoneyBillWave className="me-2" />Total Fine</h5>
                  <span style={{color:'#ff5252', fontSize:'1.3rem', fontWeight:'700'}}>₹{totalFine.toLocaleString('en-IN')}</span>
                </div>
                <div className="d-flex gap-2 mb-3">
                  <Badge bg="success">✓ {confirmedCount} Confirmed</Badge>
                  <Badge bg="info">💾 {savedCount} Saved</Badge>
                </div>
                {vehicleInfo && (
                  <div className="vehicle-info-section">
                    <h6 className="section-title"><FaIdCard className="me-2" />Vehicles Detected</h6>
                    <div className="vehicle-stats">
                      {vehicleInfo.bikes > 0 && <Badge bg="primary" className="vehicle-badge">🏍️ {vehicleInfo.bikes} Bikes</Badge>}
                      {vehicleInfo.cars > 0 && <Badge bg="success" className="vehicle-badge">🚗 {vehicleInfo.cars} Cars</Badge>}
                      {vehicleInfo.autos > 0 && <Badge bg="warning" className="vehicle-badge">🛺 {vehicleInfo.autos} Autos</Badge>}
                      {vehicleInfo.trucks > 0 && <Badge bg="secondary" className="vehicle-badge">🚛 {vehicleInfo.trucks} Trucks</Badge>}
                    </div>
                  </div>
                )}
                {detectedPlates.length > 0 && (
                  <div className="plate-section">
                    <h6 className="section-title"><FaIdCard className="me-2" />License Plate</h6>
                    <div className="plate-display">
                      <div className={`plate-number ${plateConfirmed ? 'recognized' : 'unclear'}`}>
                        <FaIdCard className="plate-icon" /><span>{detectedPlates[0].number}</span>
                      </div>
                      <Badge className="confidence-badge">{(detectedPlates[0].confidence * 100).toFixed(0)}%</Badge>
                    </div>
                    <div className="plate-confirmation">
                      <label className="form-label">Edit Plate Number</label>
                      <div className="plate-input-group">
                        <Form.Control className="plate-input" value={editedPlateNumber} onChange={e => {setEditedPlateNumber(e.target.value.toUpperCase()); setPlateConfirmed(false);}} />
                        <Button className="confirm-plate-btn" variant={plateConfirmed ? "success" : "primary"} onClick={() => {if(editedPlateNumber){setPlateConfirmed(true); setSuccess('✅ Plate confirmed!');}}}>
                          {plateConfirmed ? <><FaCheck /> Confirmed</> : 'Confirm'}
                        </Button>
                      </div>
                    </div>
                  </div>
                )}
              </Card.Body>
            </Card>
          </Col>

          <Col lg={5}>
            {/* VIOLATIONS CARD */}
            <Card className="violations-card">
              <Card.Body>
                <div className="card-header-custom">
                  <div className="header-icon"><FaExclamationTriangle /></div>
                  <div><h3 className="card-title">Detected Violations</h3><p className="card-subtitle">{violations.length > 0 ? `${violations.length} detected • ${confirmedCount} confirmed • ${savedCount} saved` : 'Upload or start CCTV'}</p></div>
                </div>
                {violations.length === 0 ? (
                  <div className="empty-state">
                    <div className="empty-icon"><FaFileImage /></div>
                    <h4>No Violations Detected</h4>
                    <p>Upload an image/video or connect CCTV to begin detection</p>
                  </div>
                ) : (
                  <div className="violations-list">
                    {violations.map((v, i) => (
                      <div key={i} className={`violation-item ${v.confirmed ? 'confirmed' : ''} ${v.saved ? 'saved' : ''} ${v.severity === 'high' ? 'high-priority' : ''}`}>
                        <div className="violation-header">
                          <h5 className="violation-type">
                            <span className="violation-icon">{v.type === 'no_helmet' ? '🪖' : v.type === 'triple_riding' ? '🏍️' : '🚛'}</span>
                            {v.type === 'no_helmet' ? 'No Helmet' : v.type === 'triple_riding' ? 'Triple Riding' : 'Overloading'}
                          </h5>
                          <div className="violation-badges">
                            <Badge bg={v.severity === 'high' ? 'danger' : 'warning'} className="severity-badge">{v.severity?.toUpperCase()}</Badge>
                            {v.confirmed && <Badge bg="success" className="status-badge"><FaCheck /> Confirmed</Badge>}
                            {v.saved && <Badge bg="info" className="status-badge"><FaSave /> Saved</Badge>}
                          </div>
                        </div>
                        <p className="violation-description">{v.description}</p>
                        <div className="violation-meta">
                          <div className="confidence-indicator">
                            <div className="confidence-bar"><div className="confidence-fill" style={{width: `${v.confidence * 100}%`}} /></div>
                            <span className="confidence-text">{(v.confidence * 100).toFixed(0)}%</span>
                          </div>
                          <small className="text-muted mt-1 d-block">Fine: <strong style={{color:'#e65100'}}>₹{v.fine_amount?.toLocaleString('en-IN')}</strong></small>
                        </div>
                        <div className="violation-actions">
                          <Button className="action-btn-small" variant={v.confirmed ? "success" : "outline-primary"} onClick={() => toggleConfirm(i)} disabled={v.saved}>
                            {v.confirmed ? <><FaCheck /> Confirmed</> : <><FaCheck /> Confirm</>}
                          </Button>
                          <Button className="action-btn-small" variant="outline-success" onClick={() => saveViolation(i)} disabled={!v.confirmed || v.saved}>
                            <FaSave /> {v.saved ? 'Saved' : 'Save'}
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </Card.Body>
            </Card>

            {/* GUIDELINES CARD */}
            <Card className="guidelines-card mt-3">
              <Card.Body>
                <div className="card-header-custom">
                  <div className="header-icon"><FaInfoCircle /></div>
                  <div><h3 className="card-title">Fine Guidelines</h3><p className="card-subtitle">Penalty breakdown</p></div>
                </div>
                <div className="guidelines-list">
                  <div className="guideline-item guideline-helmet"><div className="guideline-icon">🪖</div><div className="guideline-content"><h5>No Helmet</h5><p>₹1,000 fine • Section 129</p></div></div>
                  <div className="guideline-item guideline-triple"><div className="guideline-icon">🏍️</div><div className="guideline-content"><h5>Triple Riding</h5><p>₹2,000 fine • Section 128</p></div></div>
                  <div className="guideline-item guideline-overload"><div className="guideline-icon">🚛</div><div className="guideline-content"><h5>Overloading</h5><p>₹5,000 fine • Section 113</p></div></div>
                </div>
                <div className="processing-note">
                  <FaInfoCircle />
                  <div><strong>Note:</strong> Confirm then Save violations to add them to records.</div>
                </div>
              </Card.Body>
            </Card>
          </Col>
        </Row>

        {/* CCTV MODAL - kept same as before, omitted for brevity */}
        <Modal show={showCctvModal} onHide={() => { stopCameraPreview(); setShowCctvModal(false); }} size="lg" centered>
          <Modal.Header closeButton style={{background:'#0d1b3e', color:'#e0e0e0', borderBottom:'1px solid #1a3a6b'}}>
            <Modal.Title><FaBroadcastTower className="me-2" />Start CCTV Live Analysis</Modal.Title>
          </Modal.Header>
          <Modal.Body style={{background:'#111936', color:'#e0e0e0'}}>
            <h6><FaUsb className="me-2" />USB Cameras</h6>
            {detectingCameras ? <Spinner size="sm" /> : availableCameras.filter(c => c.type === 'usb').map(camera => (
              <div key={camera.id} onClick={() => handleSelectCamera(camera)} style={{padding:10, cursor:'pointer', background: selectedCamera?.id === camera.id ? '#1a3a6b' : '#0d1b3e', border: selectedCamera?.id === camera.id ? '2px solid #4fc3f7' : '1px solid #1e2d50', borderRadius:8, marginBottom:8}}>
                <FaUsb /> {camera.name} {selectedCamera?.id === camera.id && '✓'}
              </div>
            ))}
            <h6 className="mt-3"><FaNetworkWired className="me-2" />IP Cameras</h6>
            {availableCameras.filter(c => c.type === 'ip' || c.type === 'custom').map(camera => (
              <div key={camera.id} onClick={() => handleSelectCamera(camera)} style={{padding:10, cursor:'pointer', background: selectedCamera?.id === camera.id ? '#1a3a6b' : '#0d1b3e', border: selectedCamera?.id === camera.id ? '2px solid #4fc3f7' : '1px solid #1e2d50', borderRadius:8, marginBottom:8}}>
                <FaNetworkWired /> {camera.name} {selectedCamera?.id === camera.id && '✓'}
              </div>
            ))}
            <h6 className="mt-3"><FaClock className="me-2" />Duration</h6>
            {[1,2,3,4,5].map(min => <Button key={min} size="sm" variant={cctvDuration===min?'primary':'outline-secondary'} onClick={()=>setCctvDuration(min)} className="me-1">{min} min</Button>)}
          </Modal.Body>
          <Modal.Footer style={{background:'#111936', borderTop:'1px solid #1a3a6b'}}>
            <Button variant="secondary" onClick={() => { stopCameraPreview(); setShowCctvModal(false); }}>Cancel</Button>
            <Button variant="primary" onClick={handleStartCCTV}><FaPlay className="me-1" /> Start ({cctvDuration} min)</Button>
          </Modal.Footer>
        </Modal>
      </Container>
    </div>
  );
};

export default AuthorityUploadViolation;