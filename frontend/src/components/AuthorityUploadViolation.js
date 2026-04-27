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
  FaInfoCircle,
  FaSync
} from "react-icons/fa";

import { uploadAPI, violationsAPI } from "../api/api";
import "./UploadViolation.css";

// Storage keys
 // Used by other components, kept for consistency
const UPLOAD_STATE_KEY = 'traffic_upload_state';
const PENDING_VIOLATIONS_KEY = 'traffic_pending_violations';

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
    return true;
  } catch (err) {
    console.error('Error saving to storage:', err);
    return false;
  }
};

// ==================== CCTV STREAM HOOK ====================
const useCCTVStream = () => {
  const [streamId, setStreamId] = useState(null);
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamPreview, setStreamPreview] = useState(null);
  const [streamViolations, setStreamViolations] = useState({ no_helmet: 0, triple_riding: 0, overloading: 0 });
  const [streamTotalFine, setStreamTotalFine] = useState(0);
  const [elapsedTime, setElapsedTime] = useState(0);
  const [startTime, setStartTime] = useState(null);
  const [cctvDuration, setCctvDuration] = useState(300);
  const [activeSource, setActiveSource] = useState(null);
  const [selectedCamera, setSelectedCamera] = useState(null);
  
  const pollingRef = useRef(null);
  const previewIntervalRef = useRef(null);
  const timerRef = useRef(null);

  const API_BASE = process.env.REACT_APP_API_URL || 'http://localhost:5001';

  const startStream = useCallback(async (source, cameraName, maxDuration = 300) => {
    try {
      const id = `cctv_${Date.now()}`;
      setCctvDuration(maxDuration);
      setActiveSource(source);
      setSelectedCamera(cameraName);
      
      console.log(`🔌 Starting CCTV stream - ID: ${id}, Source: ${source}, Camera: ${cameraName}`);
      
      const response = await fetch(`${API_BASE}/cctv/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          stream_id: id, 
          source: source,
          max_duration: maxDuration 
        })
      });
      
      const data = await response.json();
      console.log('📡 CCTV start response:', data);
      
      if (data.success) {
        setStreamId(id);
        setIsStreaming(true);
        setStartTime(Date.now());
        setElapsedTime(0);
        return { success: true, streamId: id };
      } else {
        return { success: false, error: data.message || 'Failed to start stream' };
      }
    } catch (err) {
      console.error('Start stream error:', err);
      return { success: false, error: 'Cannot connect to AI server' };
    }
  }, [API_BASE]);

  const stopStream = useCallback(async () => {
    if (!streamId) return null;
    
    try {
      console.log(`🛑 Stopping CCTV stream: ${streamId}`);
      const response = await fetch(`${API_BASE}/cctv/stop`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stream_id: streamId })
      });
      const data = await response.json();
      
      setIsStreaming(false);
      setStreamId(null);
      setStartTime(null);
      setActiveSource(null);
      setSelectedCamera(null);
      
      if (pollingRef.current) clearInterval(pollingRef.current);
      if (previewIntervalRef.current) clearInterval(previewIntervalRef.current);
      if (timerRef.current) clearInterval(timerRef.current);
      
      return data.final_report || data;
    } catch (err) {
      console.error('Stop stream error:', err);
      setIsStreaming(false);
      setStreamId(null);
      setActiveSource(null);
      setSelectedCamera(null);
      return null;
    }
  }, [streamId, API_BASE]);

  useEffect(() => {
    if (!isStreaming || !startTime) return;
    timerRef.current = setInterval(() => {
      const elapsed = Math.floor((Date.now() - startTime) / 1000);
      setElapsedTime(elapsed);
      if (elapsed >= cctvDuration) {
        console.log('⏰ Max duration reached, stopping stream');
        stopStream();
      }
    }, 1000);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [isStreaming, startTime, cctvDuration, stopStream]);

  useEffect(() => {
    if (!isStreaming || !streamId) return;

    pollingRef.current = setInterval(async () => {
      try {
        const res = await fetch(`${API_BASE}/cctv/violations?stream_id=${streamId}`);
        const data = await res.json();
        if (data.stats) {
          setStreamViolations({
            no_helmet: data.stats.violations?.no_helmet || 0,
            triple_riding: data.stats.violations?.triple_riding || 0,
            overloading: data.stats.violations?.overloading || 0
          });
          setStreamTotalFine(data.total_fine || 0);
        }
      } catch (err) {
        // Silent fail for polling
      }
    }, 2000);

    previewIntervalRef.current = setInterval(async () => {
      try {
        const res = await fetch(`${API_BASE}/cctv/preview?stream_id=${streamId}`);
        const data = await res.json();
        if (data.image) setStreamPreview(data.image);
      } catch (err) {
        // Silent fail for preview
      }
    }, 1000);

    return () => {
      if (pollingRef.current) clearInterval(pollingRef.current);
      if (previewIntervalRef.current) clearInterval(previewIntervalRef.current);
    };
  }, [isStreaming, streamId, API_BASE]);

  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return {
    streamId, isStreaming, streamPreview,
    streamViolations, streamTotalFine, elapsedTime, cctvDuration,
    activeSource, selectedCamera, formatTime, startStream, stopStream
  };
};

// ==================== MAIN COMPONENT ====================
const AuthorityUploadViolation = () => {
  // Load initial state from localStorage
  const savedState = loadFromStorage(UPLOAD_STATE_KEY, null);
  
  const [file, setFile] = useState(savedState?.fileData ? (() => {
    // Reconstruct file from saved data
    if (savedState.fileData && savedState.fileName) {
      const byteCharacters = atob(savedState.fileData.split(',')[1]);
      const byteNumbers = new Array(byteCharacters.length);
      for (let i = 0; i < byteCharacters.length; i++) {
        byteNumbers[i] = byteCharacters.charCodeAt(i);
      }
      const byteArray = new Uint8Array(byteNumbers);
      const blob = new Blob([byteArray], { type: savedState.fileType });
      return new File([blob], savedState.fileName, { type: savedState.fileType });
    }
    return null;
  })() : null);
  
  const [preview, setPreview] = useState(savedState?.preview || null);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [detectedPlates, setDetectedPlates] = useState(savedState?.detectedPlates || []);
  const [violations, setViolations] = useState(savedState?.violations || []);
  const [plateConfirmed, setPlateConfirmed] = useState(savedState?.plateConfirmed || false);
  const [editedPlateNumber, setEditedPlateNumber] = useState(savedState?.editedPlateNumber || "");
  const [vehicleInfo, setVehicleInfo] = useState(savedState?.vehicleInfo || null);
  const [processingTime, setProcessingTime] = useState(savedState?.processingTime || null);
  const [detectionMessages, setDetectionMessages] = useState(savedState?.detectionMessages || []);
  const [annotatedImage, setAnnotatedImage] = useState(savedState?.annotatedImage || null);
  const [mediaType, setMediaType] = useState(savedState?.mediaType || null);
  const [syncingPending, setSyncingPending] = useState(false);
  const [pendingViolations, setPendingViolations] = useState([]);
  
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
    activeSource, selectedCamera: cctvCamera, formatTime, startStream, stopStream
  } = useCCTVStream();

  // Load pending violations on mount
  useEffect(() => {
    const pending = loadFromStorage(PENDING_VIOLATIONS_KEY, []);
    setPendingViolations(pending);
  }, []);

  // Save state to localStorage whenever relevant data changes
  const saveCurrentState = useCallback(() => {
    const stateToSave = {
      fileName: file?.name || null,
      fileType: file?.type || null,
      fileData: savedState?.fileData || null,
      preview: preview,
      detectedPlates: detectedPlates,
      violations: violations,
      plateConfirmed: plateConfirmed,
      editedPlateNumber: editedPlateNumber,
      vehicleInfo: vehicleInfo,
      processingTime: processingTime,
      detectionMessages: detectionMessages,
      annotatedImage: annotatedImage,
      mediaType: mediaType,
      savedAt: new Date().toISOString()
    };
    
    saveToStorage(UPLOAD_STATE_KEY, stateToSave);
  }, [file, preview, detectedPlates, violations, plateConfirmed, editedPlateNumber, vehicleInfo, processingTime, detectionMessages, annotatedImage, mediaType, savedState]);

  // Save state on every relevant change
  useEffect(() => {
    if (!loading) {
      saveCurrentState();
    }
  }, [saveCurrentState, loading]);

  // Store file as base64 when file is first set
  useEffect(() => {
    if (file && !savedState?.fileData) {
      const reader = new FileReader();
      reader.onloadend = () => {
        const stateToSave = {
          fileName: file.name,
          fileType: file.type,
          fileData: reader.result,
          preview: preview,
          detectedPlates: detectedPlates,
          violations: violations,
          plateConfirmed: plateConfirmed,
          editedPlateNumber: editedPlateNumber,
          vehicleInfo: vehicleInfo,
          processingTime: processingTime,
          detectionMessages: detectionMessages,
          annotatedImage: annotatedImage,
          mediaType: mediaType,
          savedAt: new Date().toISOString()
        };
        saveToStorage(UPLOAD_STATE_KEY, stateToSave);
      };
      reader.readAsDataURL(file);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [file]);

  // Load violations from backend
  const loadViolationsFromBackend = useCallback(async () => {
    try {
      const result = await violationsAPI.getAll();
      if (result.success && result.violations) {
        console.log(`📋 Loaded ${result.violations.length} violations from backend`);
      }
    } catch (err) {
      console.error('Failed to load violations from backend:', err);
    }
  }, []);

  // Sync pending violations with backend
  const syncPendingViolations = useCallback(async () => {
    const pending = loadFromStorage(PENDING_VIOLATIONS_KEY, []);
    if (pending.length === 0) return;
    
    setSyncingPending(true);
    console.log(`🔄 Syncing ${pending.length} pending violations...`);
    
    const syncedViolations = [];
    const failedViolations = [];
    
    for (const violation of pending) {
      // Remove local fields before sending
      const { localId, createdAt: pendingCreatedAt, ...cleanViolation } = violation;
      
      try {
        const result = await violationsAPI.create(cleanViolation);
        if (result.success) {
          syncedViolations.push(violation);
          console.log(`✅ Synced violation: ${violation.type} for ${violation.vehicleNumber}`);
        } else {
          failedViolations.push(violation);
          console.error(`❌ Failed to sync violation: ${result.error}`);
        }
      } catch (err) {
        failedViolations.push(violation);
        console.error(`❌ Sync error: ${err.message}`);
      }
      
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    
    if (failedViolations.length > 0) {
      saveToStorage(PENDING_VIOLATIONS_KEY, failedViolations);
      setPendingViolations(failedViolations);
    } else {
      saveToStorage(PENDING_VIOLATIONS_KEY, []);
      setPendingViolations([]);
    }
    
    if (syncedViolations.length > 0) {
      setSuccess(`✅ Synced ${syncedViolations.length} violation(s) to backend!`);
      await loadViolationsFromBackend();
      window.dispatchEvent(new CustomEvent('violationsUpdated'));
      setTimeout(() => setSuccess(""), 3000);
    }
    
    setSyncingPending(false);
  }, [loadViolationsFromBackend]);

  // Auto-sync on mount and periodically
  useEffect(() => {
    syncPendingViolations();
    const interval = setInterval(syncPendingViolations, 30000);
    return () => clearInterval(interval);
  }, [syncPendingViolations]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (streamRef.current) streamRef.current.getTracks().forEach(t => t.stop());
      if (previewStreamRef.current) previewStreamRef.current.getTracks().forEach(t => t.stop());
      if (progressIntervalRef.current) clearInterval(progressIntervalRef.current);
    };
  }, []);

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
      
      console.log('📷 Found video devices:', videoDevices.length);
      
      for (let i = 0; i < videoDevices.length; i++) {
        const device = videoDevices[i];
        cameras.push({
          id: `webcam_${i}`,
          name: device.label || `USB Camera ${i + 1}`,
          source: String(i),
          type: 'usb',
          deviceId: device.deviceId
        });
      }
    } catch (err) {
      console.error('Camera detection error:', err);
    }
    
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

  // ===== CAMERA PREVIEW =====
  const startCameraPreview = async (camera) => {
    if (previewStreamRef.current) {
      previewStreamRef.current.getTracks().forEach(t => t.stop());
      previewStreamRef.current = null;
    }
    
    try {
      const constraints = {
        video: camera.deviceId 
          ? { deviceId: { exact: camera.deviceId }, width: { ideal: 640 }, height: { ideal: 480 } }
          : { width: { ideal: 640 }, height: { ideal: 480 } },
        audio: false
      };
      
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      previewStreamRef.current = stream;
      
      setTimeout(() => {
        if (previewVideoRef.current) {
          previewVideoRef.current.srcObject = stream;
          previewVideoRef.current.play().catch(e => console.error('Preview play error:', e));
        }
      }, 300);
      
      setPreviewStreamActive(true);
    } catch (err) {
      console.error('Preview error:', err);
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { width: { ideal: 640 }, height: { ideal: 480 } },
          audio: false
        });
        previewStreamRef.current = stream;
        setTimeout(() => {
          if (previewVideoRef.current) {
            previewVideoRef.current.srcObject = stream;
            previewVideoRef.current.play().catch(e => console.error('Fallback play error:', e));
          }
        }, 300);
        setPreviewStreamActive(true);
      } catch (err2) {
        setPreviewStreamActive(false);
      }
    }
  };

  const stopCameraPreview = () => {
    if (previewStreamRef.current) {
      previewStreamRef.current.getTracks().forEach(t => t.stop());
      previewStreamRef.current = null;
    }
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
      if ((counts.no_helmet || counts.no_helmet_cases) > 0) 
        messages.push(`🪖 ${counts.no_helmet || counts.no_helmet_cases} No Helmet - ₹1,000 each`);
      if ((counts.triple_riding || counts.triple_riding_cases) > 0) 
        messages.push(`🏍️ ${counts.triple_riding || counts.triple_riding_cases} Triple Riding - ₹2,000 each`);
      if ((counts.overloading || counts.overloading_cases) > 0) 
        messages.push(`🚛 ${counts.overloading || counts.overloading_cases} Overloading - ₹5,000 each`);
    } else {
      messages.push('✅ No violations detected');
    }
    messages.push(`🚗 ${counts.total_vehicles || report.all_vehicles?.length || 0} vehicles detected`);
    setDetectionMessages(messages);
    
    const violationsData = response.violations || report.violations || {};
    const violationsList = [];
    
    (violationsData.no_helmet || []).forEach(v => violationsList.push({
      type: 'no_helmet', 
      confidence: v.confidence || 0.85,
      description: v.message || 'Rider without helmet detected',
      fine_amount: v.fine_amount || 1000, 
      confirmed: false, 
      saved: false, 
      severity: 'high'
    }));
    (violationsData.triple_riding || []).forEach(v => violationsList.push({
      type: 'triple_riding', 
      confidence: v.confidence || 0.85,
      description: v.message || 'Three persons on two-wheeler',
      fine_amount: v.fine_amount || 2000, 
      confirmed: false, 
      saved: false, 
      severity: 'high'
    }));
    (violationsData.overloading || []).forEach(v => violationsList.push({
      type: 'overloading', 
      confidence: v.confidence || 0.80,
      description: v.message || 'Vehicle carrying excess passengers',
      fine_amount: v.fine_amount || 5000, 
      confirmed: false, 
      saved: false, 
      severity: 'medium'
    }));
    
    setViolations(violationsList);
    
    const plates = (report.plates || []).filter(p => p.text).map(p => ({
      number: p.text, confidence: p.confidence || 0
    }));
    setDetectedPlates(plates);
    setPlateConfirmed(false);
    setEditedPlateNumber(plates[0]?.number || "");
    
    if (response.processing_time) setProcessingTime(response.processing_time);
    setMediaType(response.media_type || (file?.type?.startsWith('video/') ? 'video' : 'image'));
    if (response.annotated_image) setAnnotatedImage(`data:image/jpeg;base64,${response.annotated_image}`);
    
    const vehicles = report.all_vehicles || report.vehicles || [];
    setVehicleInfo({
      bikes: vehicles.filter(v => v.type === 'bike').length,
      cars: vehicles.filter(v => v.type === 'car').length,
      autos: vehicles.filter(v => v.type === 'auto').length,
      trucks: vehicles.filter(v => v.type === 'truck').length,
      total: vehicles.length
    });
    
    const vCount = violationsList.length;
    if (vCount > 0) {
      const h = violationsList.filter(v => v.type === 'no_helmet').length;
      const t = violationsList.filter(v => v.type === 'triple_riding').length;
      const o = violationsList.filter(v => v.type === 'overloading').length;
      const parts = [];
      if (h > 0) parts.push(`${h} helmet`);
      if (t > 0) parts.push(`${t} triple`);
      if (o > 0) parts.push(`${o} overload`);
      setSuccess(`✅ ${vCount} violation(s): ${parts.join(', ')}`);
    } else {
      setSuccess('✅ No violations detected.');
    }
  };

  // ===== CAMERA =====
  const openCamera = async () => {
    setCameraError("");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment", width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setCameraActive(true);
    } catch (err) {
      setCameraError("Cannot access camera. Please check permissions.");
    }
  };

  const closeCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
    if (videoRef.current) videoRef.current.srcObject = null;
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
    setFile(tempFile); 
    setPreview(URL.createObjectURL(tempFile));
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
        setError(response.error || "Failed."); 
        return; 
      }
      processDetectionResponse(response);
    } catch (err) { 
      setError("Connection failed."); 
    } finally { 
      setLoading(false); 
    }
  };

  // ===== CCTV =====
  const handleSelectCamera = (camera) => {
    setSelectedCamera(camera);
    if (camera.type === 'custom') {
      setCustomSource('');
      stopCameraPreview();
    } else if (camera.type === 'usb') {
      startCameraPreview(camera);
    } else {
      stopCameraPreview();
    }
  };

  const handleStartCCTV = async () => {
    if (!selectedCamera) { setError("Please select a camera first."); return; }
    
    let source;
    if (selectedCamera.type === 'custom') {
      if (!customSource.trim()) { setError("Please enter a camera URL."); return; }
      source = customSource.trim();
    } else if (selectedCamera.type === 'usb') {
      source = selectedCamera.source;
    } else {
      source = selectedCamera.source;
    }
    
    stopCameraPreview();
    setError("");
    setSuccess(`📡 Starting CCTV with ${selectedCamera.name}...`);
    setLoading(true);
    
    const result = await startStream(source, selectedCamera.name, cctvDuration * 60);
    setLoading(false);
    
    if (result.success) {
      setSuccess(`📡 CCTV Live! Camera: ${selectedCamera.name} | Analyzing for ${cctvDuration} min.`);
      setShowCctvModal(false);
    } else {
      setError(result.error || "Failed to start CCTV stream.");
    }
  };

  const handleStopCCTV = async () => {
    setLoading(true);
    const report = await stopStream();
    setLoading(false);
    
    if (report) {
      const vd = report.violations || {};
      const list = [];
      (vd.no_helmet || []).forEach(v => list.push({
        type: 'no_helmet', confidence: v.confidence || 0.85,
        description: v.message || 'No helmet', fine_amount: v.fine_amount || 1000,
        confirmed: false, saved: false, severity: 'high'
      }));
      (vd.triple_riding || []).forEach(v => list.push({
        type: 'triple_riding', confidence: v.confidence || 0.85,
        description: v.message || 'Triple riding', fine_amount: v.fine_amount || 2000,
        confirmed: false, saved: false, severity: 'high'
      }));
      (vd.overloading || []).forEach(v => list.push({
        type: 'overloading', confidence: v.confidence || 0.80,
        description: v.message || 'Overloading', fine_amount: v.fine_amount || 5000,
        confirmed: false, saved: false, severity: 'medium'
      }));
      setViolations(list);
      setSuccess(`📡 CCTV stopped. ${list.length} violation(s) found.`);
    } else {
      setSuccess('📡 CCTV stopped.');
    }
  };

  // ===== FILE HANDLING =====
  const handleDrag = (e) => {
    e.preventDefault(); e.stopPropagation();
    setDragActive(e.type === "dragenter" || e.type === "dragover");
  };

  const handleDrop = (e) => {
    e.preventDefault(); e.stopPropagation(); setDragActive(false);
    const f = e.dataTransfer.files?.[0];
    if (f && (f.type.startsWith('image/') || f.type.startsWith('video/'))) {
      setFile(f); resetState(); setPreview(URL.createObjectURL(f));
    } else setError("Upload image/video only.");
  };

  const handleFileChange = (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setFile(f); resetState(); setPreview(URL.createObjectURL(f));
  };

  const resetState = () => {
    setError(""); setSuccess(""); setDetectedPlates([]); setViolations([]);
    setVehicleInfo(null); setProcessingTime(null); setDetectionMessages([]);
    setAnnotatedImage(null); setMediaType(null);
    setPlateConfirmed(false); setEditedPlateNumber("");
  };

  const handleUpload = async () => {
    if (!file) { setError("Attach a file."); return; }
    resetState();
    const formData = new FormData(); 
    formData.append("file", file);
    const isVideo = file.type.startsWith('video/');
    try {
      setLoading(true); 
      setProgress(5);
      if (isVideo) setSuccess("⏳ Processing video...");
      progressIntervalRef.current = setInterval(() => {
        setProgress(c => c < 30 ? c + 1 : c < 60 ? c + 0.5 : c < 85 ? c + 0.2 : c);
      }, isVideo ? 2000 : 220);
      const response = await uploadAPI.uploadMedia(formData);
      clearInterval(progressIntervalRef.current); 
      setProgress(100);
      if (!response.success) { 
        setError(response.error || "Failed."); 
        return; 
      }
      processDetectionResponse(response);
    } catch (err) {
      clearInterval(progressIntervalRef.current);
      setError("Connection failed. Check if backend is running.");
    } finally { 
      setLoading(false); 
    }
  };

  const clearFile = () => {
    setFile(null); 
    setPreview(null); 
    resetState();
    if (fileInputRef.current) fileInputRef.current.value = "";
    saveToStorage(UPLOAD_STATE_KEY, null);
  };

  // ===== VIOLATION ACTIONS WITH BACKEND SAVE =====
  const toggleConfirm = (i) => setViolations(prev => prev.map((v, idx) => idx === i ? { ...v, confirmed: !v.confirmed } : v));

  const saveViolation = async (i) => {
    const v = violations[i];
    if (!v.confirmed) { 
      setError("Please confirm the violation first."); 
      return; 
    }
    
    const vehicleNum = plateConfirmed ? editedPlateNumber : (detectedPlates[0]?.number || 'UNKNOWN');
    
    setLoading(true);
    
    // Send confidence as decimal (0-1) and remove source field
    const violationData = {
      type: v.type,
      confidence: v.confidence, // Send as decimal (e.g., 0.85) not percentage
      description: v.description,
      vehicleNumber: vehicleNum,
      status: "detected",
      fineAmount: v.fine_amount,
      timestamp: new Date().toISOString(),
      severity: v.severity,
      mediaType: mediaType || (file?.type?.startsWith('video/') ? 'video' : 'image')
      // REMOVED: source field - let the model use default
    };
    
    console.log('💾 Saving violation to backend:', violationData);
    
    try {
      const result = await violationsAPI.create(violationData);
      
      if (result.success) {
        console.log('✅ Violation saved to backend:', result.data);
        
        setViolations(prev => prev.map((item, idx) => 
          idx === i ? { ...item, saved: true, confirmed: true, backendId: result.data?._id } : item
        ));
        
        setSuccess(`✅ Violation saved: ${v.type.replace(/_/g, ' ')} for ${vehicleNum}`);
        
        window.dispatchEvent(new CustomEvent('violationSaved', { 
          detail: { violation: violationData, backendId: result.data?._id }
        }));
        window.dispatchEvent(new CustomEvent('violationsUpdated'));
        
        setTimeout(() => setSuccess(""), 3000);
      } else {
        console.warn('Backend save failed, adding to pending queue:', result.error);
        
        const pendingViolation = {
          ...violationData,
          localId: `pending_${Date.now()}_${i}`,
          createdAt: new Date().toISOString()
        };
        
        const existingPending = loadFromStorage(PENDING_VIOLATIONS_KEY, []);
        existingPending.push(pendingViolation);
        saveToStorage(PENDING_VIOLATIONS_KEY, existingPending);
        setPendingViolations(existingPending);
        
        setViolations(prev => prev.map((item, idx) => 
          idx === i ? { ...item, saved: true, confirmed: true, pending: true } : item
        ));
        
        setSuccess(`⚠️ Violation saved locally (will sync when backend available): ${v.type.replace(/_/g, ' ')} for ${vehicleNum}`);
      }
    } catch (err) {
      console.error('Save error:', err);
      setError("Failed to save violation: " + (err.message || "Unknown error"));
    } finally {
      setLoading(false);
    }
  };

  const saveAllViolations = async () => {
    const toSave = violations.filter(v => v.confirmed && !v.saved);
    if (!toSave.length) { 
      setError("Please confirm violations first before saving."); 
      return; 
    }
    
    setLoading(true);
    let savedCount = 0;
    let pendingCount = 0;
    const vehicleNum = plateConfirmed ? editedPlateNumber : (detectedPlates[0]?.number || 'UNKNOWN');
    const newPendingViolations = [];
    
    for (let idx = 0; idx < toSave.length; idx++) {
      const v = toSave[idx];
      const originalIndex = violations.findIndex(vi => vi === v);
      
      // Send confidence as decimal (0-1) and remove source field
      const violationData = {
        type: v.type,
        confidence: v.confidence, // Send as decimal (e.g., 0.85) not percentage
        description: v.description,
        vehicleNumber: vehicleNum,
        status: "detected",
        fineAmount: v.fine_amount,
        timestamp: new Date().toISOString(),
        severity: v.severity,
        mediaType: mediaType || (file?.type?.startsWith('video/') ? 'video' : 'image')
        // REMOVED: source field - let the model use default
      };
      
      try {
        const result = await violationsAPI.create(violationData);
        
        if (result.success) {
          savedCount++;
          setViolations(prev => prev.map((item, i) => 
            i === originalIndex ? { ...item, saved: true, confirmed: true, backendId: result.data?._id } : item
          ));
        } else {
          pendingCount++;
          newPendingViolations.push({
            ...violationData,
            localId: `pending_${Date.now()}_${idx}`,
            createdAt: new Date().toISOString()
          });
          setViolations(prev => prev.map((item, i) => 
            i === originalIndex ? { ...item, saved: true, confirmed: true, pending: true } : item
          ));
        }
      } catch (err) {
        pendingCount++;
        newPendingViolations.push({
          ...violationData,
          localId: `pending_${Date.now()}_${idx}`,
          createdAt: new Date().toISOString()
        });
        setViolations(prev => prev.map((item, i) => 
          i === originalIndex ? { ...item, saved: true, confirmed: true, pending: true } : item
        ));
      }
      
      await new Promise(resolve => setTimeout(resolve, 300));
    }
    
    if (newPendingViolations.length > 0) {
      const existingPending = loadFromStorage(PENDING_VIOLATIONS_KEY, []);
      saveToStorage(PENDING_VIOLATIONS_KEY, [...existingPending, ...newPendingViolations]);
      setPendingViolations([...existingPending, ...newPendingViolations]);
    }
    
    setLoading(false);
    
    if (savedCount > 0) {
      setSuccess(`✅ ${savedCount} violation(s) saved to backend!${pendingCount > 0 ? ` ⚠️ ${pendingCount} saved locally (will sync later)` : ''}`);
    } else if (pendingCount > 0) {
      setSuccess(`⚠️ ${pendingCount} violation(s) saved locally (will sync when backend is available)`);
    }
    
    window.dispatchEvent(new CustomEvent('violationsBatchSaved', { 
      detail: { savedCount, pendingCount, vehicleNumber: vehicleNum }
    }));
    window.dispatchEvent(new CustomEvent('violationsUpdated'));
    
    setTimeout(() => setSuccess(""), 4000);
  };

  const fileTypeLabel = file?.type?.startsWith("video/") ? "video" : "image";
  const confirmedCount = violations.filter(v => v.confirmed).length;
  const savedCount = violations.filter(v => v.saved).length;
  const totalFine = violations.reduce((s, v) => s + (v.fine_amount || 0), 0);
  const pendingSyncCount = pendingViolations.length;

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
            <div className="d-flex gap-2 mt-2 mt-md-0">
              {pendingSyncCount > 0 && (
                <Button 
                  variant="warning" 
                  size="sm" 
                  onClick={syncPendingViolations}
                  disabled={syncingPending}
                  className="d-flex align-items-center gap-1"
                >
                  {syncingPending ? <Spinner size="sm" /> : <FaSync />}
                  <span>Sync ({pendingSyncCount})</span>
                </Button>
              )}
              <Badge className="authority-badge" bg="dark">
                <FaShieldAlt className="me-1" /> Authority Portal
              </Badge>
            </div>
          </div>
        </div>

        {/* CCTV LIVE BANNER */}
        {isStreaming && (
          <Alert className="mb-4" style={{
            background: 'linear-gradient(135deg, #1a0033, #0d1b3e)', 
            border: '2px solid #ff4444', 
            borderRadius: '12px', 
            color: '#eee'
          }}>
            <div className="d-flex align-items-center justify-content-between flex-wrap">
              <div>
                <FaBroadcastTower className="me-2" style={{color: '#ff4444', animation: 'pulse 1.5s infinite'}} />
                <strong style={{color: '#ff4444', fontSize: '1rem'}}>● CCTV LIVE</strong>
                {cctvCamera && <span style={{fontSize: '0.95rem'}}> - {cctvCamera}</span>}
                <br />
                <small style={{fontSize: '0.85rem'}}>
                  Source: {activeSource?.substring(0, 30)}... | 
                  🪖{streamViolations.no_helmet} 🏍️{streamViolations.triple_riding} 🚛{streamViolations.overloading} | 
                  Fine: ₹{streamTotalFine.toLocaleString('en-IN')} | 
                  ⏱️ {formatTime(elapsedTime)} / {formatTime(streamDuration * 60)}
                </small>
              </div>
              <Button variant="danger" size="sm" onClick={handleStopCCTV} disabled={loading} style={{fontWeight: '600'}}>
                <FaStop className="me-1" /> Stop CCTV
              </Button>
            </div>
          </Alert>
        )}

        <Row className="g-4">
          <Col lg={7}>
            {/* UPLOAD CARD */}
            <Card className="upload-card shadow-sm">
              <Card.Body>
                <div className="card-header-custom mb-3">
                  <div className="header-icon"><FaUpload /></div>
                  <div>
                    <h3 className="card-title mb-1">Evidence Submission</h3>
                    <p className="card-subtitle text-muted mb-0">Upload media or connect camera for analysis</p>
                  </div>
                </div>

                <div 
                  className={`drag-drop-zone ${dragActive ? 'active' : ''} ${file ? 'has-file' : ''}`}
                  onDragEnter={handleDrag} onDragLeave={handleDrag} onDragOver={handleDrag} onDrop={handleDrop}
                  onClick={() => fileInputRef.current?.click()}
                >
                  <input ref={fileInputRef} type="file" accept="image/*,video/*" onChange={handleFileChange} style={{display:'none'}} />
                  {!file ? (
                    <div className="drop-zone-content text-center p-4">
                      <FaFileImage className="mb-3" style={{fontSize: '3rem', color: '#6c757d'}} />
                      <h4>Drag & Drop Evidence</h4>
                      <p>or <span className="browse-link text-primary" style={{cursor:'pointer'}}>browse files</span></p>
                      <small className="text-muted">Supported: JPG, PNG, MP4, MOV, AVI</small>
                    </div>
                  ) : (
                    <div className="file-selected-content d-flex align-items-center p-3">
                      {fileTypeLabel === 'video' ? <FaVideo className="me-3" style={{fontSize: '2rem'}} /> : <FaFileImage className="me-3" style={{fontSize: '2rem'}} />}
                      <div className="flex-grow-1">
                        <p className="file-name mb-1 fw-bold">{file.name}</p>
                        <small className="text-muted">{(file.size/1048576).toFixed(2)} MB • {fileTypeLabel.toUpperCase()}</small>
                      </div>
                      <Button variant="link" className="text-danger" onClick={e => {e.stopPropagation(); clearFile();}}>
                        <FaTimes />
                      </Button>
                    </div>
                  )}
                </div>

                <div className="action-buttons d-flex flex-wrap gap-2 mt-3">
                  <Button variant="primary" onClick={handleUpload} disabled={loading || !file}>
                    {loading ? <Spinner size="sm" className="me-1" /> : <FaSearch className="me-1" />}
                    {file?.type?.startsWith('video/') ? 'Process Video' : 'Analyze Image'}
                  </Button>
                  <Button variant="outline-secondary" onClick={cameraActive ? closeCamera : openCamera} disabled={loading || isStreaming}>
                    <FaCamera className="me-1" /> {cameraActive ? 'Close Camera' : 'Single Capture'}
                  </Button>
                  <Button variant="info" onClick={() => { detectCameras(); setShowCctvModal(true); }} disabled={loading || isStreaming}>
                    <FaBroadcastTower className="me-1" /> {isStreaming ? 'CCTV Active...' : 'Live CCTV'}
                  </Button>
                  <Button variant="success" onClick={saveAllViolations} disabled={confirmedCount === 0 || loading}>
                    <FaSave className="me-1" /> Save All ({confirmedCount})
                  </Button>
                </div>

                {/* Camera section */}
                {cameraActive && !isStreaming && (
                  <div className="camera-section mt-3">
                    <div style={{position: 'relative', borderRadius: '8px', overflow: 'hidden', border: '2px solid #dee2e6'}}>
                      <video ref={videoRef} autoPlay playsInline muted className="w-100" style={{display: 'block', backgroundColor: '#000'}} />
                    </div>
                    <div className="d-flex gap-2 mt-2">
                      <Button variant="primary" onClick={handleLiveDetect} disabled={loading}><FaCamera className="me-1" /> Capture & Detect</Button>
                      <Button variant="outline-secondary" onClick={closeCamera}><FaTimes className="me-1" /> Close</Button>
                    </div>
                    {cameraError && <Alert variant="warning" className="mt-2">{cameraError}</Alert>}
                  </div>
                )}

                {/* CCTV Live Preview */}
                {isStreaming && streamPreview && (
                  <div className="cctv-live-preview mt-3">
                    <h5><FaBroadcastTower className="me-2" style={{color:'#ff4444'}} />Live Feed <Badge bg="danger">● LIVE</Badge></h5>
                    <div style={{position:'relative', borderRadius: '8px', overflow: 'hidden', border: '2px solid #ff4444'}}>
                      <img src={`data:image/jpeg;base64,${streamPreview}`} alt="Live CCTV Feed" className="w-100" style={{display: 'block'}} />
                      <div style={{position:'absolute', top:10, right:10, display:'flex', gap:5}}>
                        <Badge bg="danger">🪖{streamViolations.no_helmet}</Badge>
                        <Badge bg="warning">🏍️{streamViolations.triple_riding}</Badge>
                        <Badge style={{background:'#6a1b9a', color:'white'}}>🚛{streamViolations.overloading}</Badge>
                      </div>
                    </div>
                  </div>
                )}

                {/* Progress */}
                {loading && !isStreaming && (
                  <div className="mt-3">
                    <ProgressBar animated now={progress} />
                    <p className="text-center mt-2">Processing... {Math.round(progress)}%</p>
                  </div>
                )}

                {/* Alerts */}
                {error && <Alert variant="danger" className="mt-3"><FaExclamationTriangle className="me-2" />{error}</Alert>}
                {success && <Alert variant="success" className="mt-3"><FaCheckCircle className="me-2" />{success}</Alert>}

                {/* Detection Messages */}
                {detectionMessages.length > 0 && (
                  <div className="mt-3 p-3" style={{background: '#f8f9fa', borderRadius: '12px', border: '1px solid #e0e0e0'}}>
                    <h5 className="mb-2" style={{fontSize: '1.05rem', fontWeight: '700', color: '#1a237e'}}>
                      <FaSearch className="me-2" />Detection Results
                    </h5>
                    {detectionMessages.map((m, i) => (
                      <div key={i} className="mb-1" style={{fontSize: '0.9rem', color: '#333', fontWeight: '500'}}>{m}</div>
                    ))}
                    {processingTime && <Badge bg="info" className="mt-2"><FaClock className="me-1" /> Processed in {processingTime}s</Badge>}
                  </div>
                )}

                {/* Preview */}
                {preview && !cameraActive && !isStreaming && (
                  <div className="preview-section mt-3">
                    <h5>{mediaType === 'video' ? '🎬 Video' : '📷 Image'} Preview</h5>
                    <div style={{borderRadius: '8px', overflow: 'hidden'}}>
                      {annotatedImage ? 
                        <img src={annotatedImage} alt="Detection Result" className="w-100" /> :
                        fileTypeLabel === 'video' ? 
                          <video controls src={preview} className="w-100" /> :
                          <img src={preview} alt="Preview" className="w-100" />
                      }
                    </div>
                  </div>
                )}
              </Card.Body>
            </Card>

            {/* SUMMARY CARD */}
            <Card className="mt-3 shadow-sm">
              <Card.Body>
                <div className="card-header-custom mb-3">
                  <div className="header-icon"><FaClipboardList /></div>
                  <div>
                    <h3 className="card-title mb-1">Detection Summary</h3>
                    <p className="card-subtitle text-muted mb-0">Violation breakdown & vehicle information</p>
                  </div>
                </div>
                <Row className="g-2 mb-3">
                  <Col xs={3}>
                    <div className="text-center p-2 bg-light rounded">
                      <div className="fw-bold fs-4">{violations.length}</div>
                      <div className="small text-muted">Total</div>
                    </div>
                  </Col>
                  <Col xs={3}>
                    <div className="text-center p-2 bg-warning bg-opacity-10 rounded">
                      <div className="fw-bold fs-4">{violations.filter(v=>v.type==='no_helmet').length}</div>
                      <div className="small text-muted">🪖 Helmet</div>
                    </div>
                  </Col>
                  <Col xs={3}>
                    <div className="text-center p-2 bg-danger bg-opacity-10 rounded">
                      <div className="fw-bold fs-4">{violations.filter(v=>v.type==='triple_riding').length}</div>
                      <div className="small text-muted">🏍️ Triple</div>
                    </div>
                  </Col>
                  <Col xs={3}>
                    <div className="text-center p-2 rounded" style={{background: 'rgba(106, 27, 154, 0.1)'}}>
                      <div className="fw-bold fs-4">{violations.filter(v=>v.type==='overloading').length}</div>
                      <div className="small text-muted">🚛 Overload</div>
                    </div>
                  </Col>
                </Row>
                <div className="d-flex justify-content-between align-items-center mb-3">
                  <h5><FaMoneyBillWave className="me-2" />Total Fine</h5>
                  <span style={{color:'#ff5252', fontSize:'1.3rem', fontWeight:'700'}}>₹{totalFine.toLocaleString('en-IN')}</span>
                </div>
                <div className="d-flex gap-2 mb-3">
                  <Badge bg="success">✓ {confirmedCount} Confirmed</Badge>
                  <Badge bg="info">💾 {savedCount} Saved</Badge>
                  {pendingSyncCount > 0 && <Badge bg="warning">⏳ {pendingSyncCount} Pending Sync</Badge>}
                </div>
                {vehicleInfo && (
                  <div className="mb-3">
                    <h6><FaIdCard className="me-2" />Vehicles Detected</h6>
                    <div className="d-flex flex-wrap gap-2">
                      {vehicleInfo.bikes > 0 && <Badge bg="primary">🏍️ {vehicleInfo.bikes} Bikes</Badge>}
                      {vehicleInfo.cars > 0 && <Badge bg="success">🚗 {vehicleInfo.cars} Cars</Badge>}
                      {vehicleInfo.autos > 0 && <Badge bg="warning">🛺 {vehicleInfo.autos} Autos</Badge>}
                      {vehicleInfo.trucks > 0 && <Badge bg="secondary">🚛 {vehicleInfo.trucks} Trucks</Badge>}
                    </div>
                  </div>
                )}
                {detectedPlates.length > 0 && (
                  <div>
                    <h6><FaIdCard className="me-2" />License Plate</h6>
                    <div className="d-flex align-items-center gap-2 mb-2">
                      <div className={`p-2 rounded ${plateConfirmed ? 'bg-success bg-opacity-10' : 'bg-warning bg-opacity-10'}`}>
                        <FaIdCard className="me-2" /><span className="fw-bold">{detectedPlates[0].number}</span>
                      </div>
                      <Badge>{(detectedPlates[0].confidence * 100).toFixed(0)}%</Badge>
                    </div>
                    <div className="d-flex gap-2">
                      <Form.Control 
                        value={editedPlateNumber} 
                        onChange={e => {setEditedPlateNumber(e.target.value.toUpperCase()); setPlateConfirmed(false);}} 
                        placeholder="Edit plate number"
                        size="sm"
                      />
                      <Button 
                        size="sm"
                        variant={plateConfirmed ? "success" : "primary"} 
                        onClick={() => {if(editedPlateNumber.trim()) {setPlateConfirmed(true); setSuccess('✅ Plate confirmed!');}}}
                      >
                        {plateConfirmed ? <><FaCheck /> Confirmed</> : 'Confirm'}
                      </Button>
                    </div>
                  </div>
                )}
              </Card.Body>
            </Card>
          </Col>

          <Col lg={5}>
            {/* VIOLATIONS CARD */}
            <Card className="shadow-sm">
              <Card.Body>
                <div className="card-header-custom mb-3">
                  <div className="header-icon"><FaExclamationTriangle /></div>
                  <div>
                    <h3 className="card-title mb-1">Detected Violations</h3>
                    <p className="card-subtitle text-muted mb-0">
                      {violations.length > 0 ? `${violations.length} detected • ${confirmedCount} confirmed • ${savedCount} saved` : 'Upload or start CCTV'}
                    </p>
                  </div>
                </div>
                {violations.length === 0 ? (
                  <div className="text-center py-4 text-muted">
                    <FaFileImage style={{fontSize: '3rem'}} />
                    <p className="mt-2">No violations detected yet</p>
                  </div>
                ) : (
                  <div>
                    {violations.map((v, i) => (
                      <div key={i} className={`p-3 mb-2 rounded border ${v.confirmed ? 'border-success bg-success bg-opacity-10' : ''} ${v.saved ? 'border-info bg-info bg-opacity-10' : ''} ${v.pending ? 'border-warning bg-warning bg-opacity-10' : ''}`}>
                        <div className="d-flex justify-content-between align-items-start mb-2">
                          <h6 className="mb-0">
                            {v.type === 'no_helmet' ? '🪖 No Helmet' : v.type === 'triple_riding' ? '🏍️ Triple Riding' : '🚛 Overloading'}
                          </h6>
                          <div className="d-flex gap-1">
                            <Badge bg={v.severity === 'high' ? 'danger' : 'warning'}>{v.severity?.toUpperCase()}</Badge>
                            {v.confirmed && <Badge bg="success"><FaCheck /></Badge>}
                            {v.saved && !v.pending && <Badge bg="info"><FaSave /></Badge>}
                            {v.pending && <Badge bg="warning">⏳ Pending</Badge>}
                          </div>
                        </div>
                        <p className="small mb-2">{v.description}</p>
                        <div className="mb-2" style={{height:'6px', background:'#e9ecef', borderRadius:'3px'}}>
                          <div style={{width:`${v.confidence*100}%`, height:'100%', background:'#28a745', borderRadius:'3px'}} />
                        </div>
                        <small className="text-muted">
                          {(v.confidence*100).toFixed(0)}% confidence | Fine: <strong style={{color:'#e65100'}}>₹{v.fine_amount?.toLocaleString('en-IN')}</strong>
                        </small>
                        <div className="mt-2 d-flex gap-2">
                          <Button size="sm" variant={v.confirmed?"success":"outline-primary"} onClick={()=>toggleConfirm(i)} disabled={v.saved}>
                            {v.confirmed ? <><FaCheck /> Confirmed</> : 'Confirm'}
                          </Button>
                          <Button size="sm" variant="outline-success" onClick={()=>saveViolation(i)} disabled={!v.confirmed || v.saved}>
                            <FaSave className="me-1" /> {v.saved ? (v.pending ? 'Pending Sync' : 'Saved') : 'Save'}
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </Card.Body>
            </Card>

            {/* GUIDELINES CARD */}
            <Card className="mt-3 shadow-sm">
              <Card.Body>
                <h6 className="mb-3"><FaInfoCircle className="me-2" />Fine Guidelines</h6>
                <div className="mb-2">🪖 <strong>No Helmet:</strong> ₹1,000 • Section 129</div>
                <div className="mb-2">🏍️ <strong>Triple Riding:</strong> ₹2,000 • Section 128</div>
                <div className="mb-2">🚛 <strong>Overloading:</strong> ₹5,000 • Section 113</div>
                <div className="mt-3 p-2 bg-info bg-opacity-10 rounded">
                  <small><strong>Note:</strong> Confirm then Save violations to add them to records. If backend is unavailable, violations will be saved locally and synced automatically.</small>
                </div>
              </Card.Body>
            </Card>
          </Col>
        </Row>

        {/* ==================== CCTV MODAL ==================== */}
        <Modal show={showCctvModal} onHide={() => { stopCameraPreview(); setShowCctvModal(false); }} size="lg" centered>
          <Modal.Header closeButton style={{background:'#0d1b3e', color:'#e0e0e0', borderBottom:'1px solid #1a3a6b'}}>
            <Modal.Title><FaBroadcastTower className="me-2" />Start CCTV Live Analysis</Modal.Title>
          </Modal.Header>
          <Modal.Body style={{background:'#111936', color:'#e0e0e0', maxHeight: '60vh', overflowY: 'auto'}}>
            {/* USB Cameras */}
            <h6 className="mb-2"><FaUsb className="me-2" />USB / Webcam</h6>
            {detectingCameras ? (
              <div className="text-center py-3"><Spinner size="sm" /> Detecting cameras...</div>
            ) : availableCameras.filter(c => c.type === 'usb').length > 0 ? (
              <div style={{display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(200px, 1fr))', gap:8, marginBottom:16}}>
                {availableCameras.filter(c => c.type === 'usb').map(camera => (
                  <div key={camera.id} onClick={() => handleSelectCamera(camera)}
                    style={{
                      padding:12, cursor:'pointer', borderRadius:8,
                      background: selectedCamera?.id === camera.id ? '#1a3a6b' : '#0d1b3e',
                      border: selectedCamera?.id === camera.id ? '2px solid #4fc3f7' : '1px solid #1e2d50',
                    }}>
                    <div className="d-flex align-items-center gap-2">
                      <FaUsb color={selectedCamera?.id === camera.id ? '#4fc3f7' : '#888'} />
                      <div style={{flex:1}}>
                        <div style={{fontWeight:'bold', fontSize:13}}>{camera.name}</div>
                        <small style={{color:'#888'}}>Source: <code style={{color:'#4fc3f7'}}>{camera.source}</code></small>
                      </div>
                    </div>
                    {selectedCamera?.id === camera.id && <Badge bg="success" className="mt-1">✓ Selected</Badge>}
                  </div>
                ))}
              </div>
            ) : (
              <Alert style={{background:'#0d1b3e', borderColor:'#1a3a6b', color:'#e0e0e0'}}>
                No USB cameras found. Check browser permissions.
              </Alert>
            )}
            <Button variant="outline-info" size="sm" onClick={detectCameras} disabled={detectingCameras} className="mb-3">
              {detectingCameras ? <Spinner size="sm" /> : <FaRedo className="me-1" />} Refresh Cameras
            </Button>

            {/* Camera Preview */}
            {previewStreamActive && (
              <div className="mb-3" style={{position:'relative', borderRadius:8, overflow:'hidden', border:'2px solid #4fc3f7'}}>
                <video ref={previewVideoRef} autoPlay playsInline muted 
                  style={{width:'100%', maxHeight:'250px', background:'#000', display:'block'}} />
                <div style={{position:'absolute', top:8, left:8, background:'rgba(0,0,0,0.7)', padding:'4px 12px', borderRadius:16, fontSize:12, color:'#4fc3f7'}}>
                  ● LIVE PREVIEW - {selectedCamera?.name}
                </div>
                <Button variant="danger" size="sm" style={{position:'absolute', top:8, right:8, borderRadius:'50%', width:28, height:28, padding:0}}
                  onClick={stopCameraPreview}><FaTimes /></Button>
              </div>
            )}

            {/* IP Cameras */}
            <h6 className="mt-3 mb-2"><FaNetworkWired className="me-2" />Network / IP Cameras</h6>
            <div style={{display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(200px, 1fr))', gap:8}}>
              {availableCameras.filter(c => c.type === 'ip' || c.type === 'custom').map(camera => (
                <div key={camera.id} onClick={() => handleSelectCamera(camera)}
                  style={{
                    padding:12, cursor:'pointer', borderRadius:8,
                    background: selectedCamera?.id === camera.id ? '#1a3a6b' : '#0d1b3e',
                    border: selectedCamera?.id === camera.id ? '2px solid #4fc3f7' : '1px solid #1e2d50',
                  }}>
                  <div className="d-flex align-items-center gap-2">
                    <FaNetworkWired color={selectedCamera?.id === camera.id ? '#4fc3f7' : '#888'} />
                    <div style={{flex:1}}>
                      <div style={{fontWeight:'bold', fontSize:13}}>{camera.name}</div>
                      <small style={{color:'#888'}}>{camera.description || 'IP Camera'}</small>
                    </div>
                  </div>
                  {selectedCamera?.id === camera.id && <Badge bg="warning" className="mt-1">✓ Selected</Badge>}
                </div>
              ))}
            </div>

            {/* Custom URL */}
            {selectedCamera?.type === 'custom' && (
              <Form.Group className="mt-3">
                <Form.Label>Enter RTSP/HTTP URL:</Form.Label>
                <Form.Control type="text" value={customSource} onChange={e => setCustomSource(e.target.value)}
                  placeholder="rtsp://192.168.x.x:554/stream1"
                  style={{background:'#0d1b3e', color:'#e0e0e0', border:'1px solid #1e2d50'}} />
              </Form.Group>
            )}

            {/* Duration */}
            <h6 className="mt-3 mb-2"><FaClock className="me-2" />Duration</h6>
            <div className="d-flex gap-1 flex-wrap">
              {[1,2,3,4,5].map(min => (
                <Button key={min} size="sm" variant={cctvDuration===min?'primary':'outline-secondary'}
                  onClick={()=>setCctvDuration(min)}>{min} min</Button>
              ))}
            </div>
          </Modal.Body>
          <Modal.Footer style={{background:'#111936', borderTop:'1px solid #1a3a6b'}}>
            <Button variant="secondary" onClick={() => { stopCameraPreview(); setShowCctvModal(false); }}>Cancel</Button>
            <Button variant="primary" onClick={handleStartCCTV}
              disabled={!selectedCamera || (selectedCamera.type==='custom' && !customSource.trim())}>
              <FaPlay className="me-1" /> Start CCTV ({cctvDuration} min)
            </Button>
          </Modal.Footer>
        </Modal>
      </Container>
    </div>
  );
};

export default AuthorityUploadViolation;