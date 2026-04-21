import React, { useState, useRef, useEffect } from "react";
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
  Col
} from "react-bootstrap";
import { FaUpload, FaShieldAlt, FaCheckCircle, FaFileImage, FaSave, FaCamera } from "react-icons/fa";

import { uploadAPI, violationsAPI } from "../api/api";
import "./UploadViolation.css";

const AuthorityUploadViolation = () => {
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [detectedPlates, setDetectedPlates] = useState([]);
  const [violations, setViolations] = useState([]);
  const [savedCount, setSavedCount] = useState(0);
  const [plateConfirmed, setPlateConfirmed] = useState(false);
  const [editedPlateNumber, setEditedPlateNumber] = useState("");

  const normalizeMessage = (value) => {
    if (typeof value === 'string') return value;
    if (value == null) return '';
    if (value.message) return value.message;
    if (typeof value === 'object') return JSON.stringify(value);
    return String(value);
  };
  const [cameraActive, setCameraActive] = useState(false);
  const [cameraError, setCameraError] = useState("");

  const videoRef = useRef(null);
  const streamRef = useRef(null);

  useEffect(() => {
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
      }
    };
  }, []);

  useEffect(() => {
    if (cameraActive && streamRef.current && videoRef.current) {
      videoRef.current.srcObject = streamRef.current;
    }
  }, [cameraActive]);

  const openCamera = async () => {
    setCameraError("");

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
      setCameraError("Camera is not ready for live detection.");
      return;
    }

    const blob = await captureLiveFrame();
    if (!blob) {
      setCameraError("Unable to capture live frame.");
      return;
    }

    const tempFile = new File([blob], `live-capture-${Date.now()}.jpg`, {
      type: "image/jpeg"
    });

    setError("");
    setSuccess("");
    setSavedCount(0);
    setDetectedPlates([]);
    setViolations([]);
    setLoading(true);
    setProgress(8);

    const formData = new FormData();
    formData.append("file", tempFile);

    try {
      const interval = setInterval(() => {
        setProgress((current) => (current < 92 ? current + 6 : current));
      }, 220);

      const response = await uploadAPI.uploadMedia(formData);
      clearInterval(interval);
      setProgress(100);

      if (!response.success) {
        setError(normalizeMessage(response.error) || "Live detection failed.");
        return;
      }

      const plates = (response.detected_plates || response.plates || []).map((plate) => ({
        ...plate,
        number: plate.number || "UNKNOWN"
      }));
      const vios = (response.violations || []).map((violation) => ({
        ...violation,
        confirmed: false,
        saved: false
      }));

      setDetectedPlates(plates);
      setViolations(vios);
      setPlateConfirmed(false);
      setEditedPlateNumber(plates[0]?.number || "");
      setSuccess(
        vios.length > 0
          ? "Live frame analyzed. Confirm the detected plate and any violations below."
          : "Live frame analyzed. No violations detected. Confirm the detected plate if it is correct."
      );
    } catch (err) {
      console.error(err);
      setError(normalizeMessage(err) || "Unable to connect to backend. Check your server status.");
    } finally {
      setLoading(false);
    }
  };

  const handleFileChange = (e) => {
    const selected = e.target.files[0];
    if (!selected) return;

    setFile(selected);
    setError("");
    setSuccess("");
    setSavedCount(0);
    setDetectedPlates([]);
    setViolations([]);
    setPlateConfirmed(false);
    setEditedPlateNumber("");
    setPreview(URL.createObjectURL(selected));
  };

  const toggleConfirm = (index) => {
    setViolations((prev) =>
      prev.map((item, idx) =>
        idx === index ? { ...item, confirmed: !item.confirmed } : item
      )
    );
  };

  const getDefaultVehicleNumber = () => {
    return detectedPlates.length > 0 && detectedPlates[0].number !== "UNKNOWN"
      ? detectedPlates[0].number
      : "UNKNOWN";
  };

  const saveViolation = async (index) => {
    const violation = violations[index];
    if (!violation.confirmed) {
      setError("Please confirm the violation before saving.");
      return;
    }

    try {
      const payload = {
        type: violation.type,
        confidence: violation.confidence,
        description: violation.description || "Auto-detected violation",
        vehicleNumber: getDefaultVehicleNumber(),
        status: "detected",
        timestamp: new Date().toISOString()
      };

      const res = await violationsAPI.create(payload);
      if (res.success) {
        setSuccess(`Violation recorded: ${violation.type}`);
        setSavedCount((count) => count + 1);
        setViolations((prev) =>
          prev.map((item, idx) =>
            idx === index ? { ...item, saved: true } : item
          )
        );
      } else {
        setError(res.error || "Failed to save violation");
      }
    } catch (err) {
      setError("Unable to save violation. Please retry.");
    }
  };

  const saveAllViolations = async () => {
    const toSave = violations.filter((item) => item.confirmed && !item.saved);
    if (!toSave.length) {
      setError("Confirm violations first before saving.");
      return;
    }

    setError("");
    setSuccess("");
    let totalSaved = 0;

    for (const violation of toSave) {
      try {
        const payload = {
          type: violation.type,
          confidence: violation.confidence,
          description: violation.description || "Auto-detected violation",
          vehicleNumber: getDefaultVehicleNumber(),
          status: "detected",
          timestamp: new Date().toISOString()
        };
        const res = await violationsAPI.create(payload);
        if (res.success) totalSaved += 1;
      } catch (err) {
        console.error("Save error", err);
      }
    }

    if (totalSaved > 0) {
      setSuccess(`${totalSaved} violation(s) saved successfully`);
      setSavedCount((count) => count + totalSaved);
      setViolations((prev) =>
        prev.map((item) =>
          item.confirmed ? { ...item, saved: true } : item
        )
      );
    } else {
      setError("No violations were saved. Please try again.");
    }
  };

  const handleUpload = async () => {
    if (!file) {
      setError("Please attach a file first.");
      return;
    }

    setError("");
    setSuccess("");
    setSavedCount(0);

    const formData = new FormData();
    formData.append("file", file);

    try {
      setLoading(true);
      setProgress(8);

      const interval = setInterval(() => {
        setProgress((current) => (current < 92 ? current + 6 : current));
      }, 220);

      const response = await uploadAPI.uploadMedia(formData);
      clearInterval(interval);
      setProgress(100);

      if (!response.success) {
        setError(normalizeMessage(response.error) || "Violation detection failed.");
        return;
      }

      const plates = (response.detected_plates || response.plates || []).map((plate) => ({
        ...plate,
        number: plate.number || "UNKNOWN"
      }));
      const vios = (response.violations || []).map((violation) => ({
        ...violation,
        confirmed: false,
        saved: false
      }));

      setDetectedPlates(plates);
      setViolations(vios);
      setPlateConfirmed(false);
      setEditedPlateNumber(plates[0]?.number || "");
      setSuccess(
        vios.length > 0
          ? "Evidence analyzed. Confirm the detected plate and any violations below."
          : "Evidence analyzed. No violations detected. Confirm the detected plate if it is correct."
      );
    } catch (err) {
      console.error(err);
      setError(normalizeMessage(err) || "Unable to connect to backend. Check your server status.");
    } finally {
      setLoading(false);
    }
  };

  const fileTypeLabel = file?.type?.startsWith("video/") ? "video" : "image";
  const plate = detectedPlates[0] || null;
  const plateRecognized = plate && plate.number && plate.number !== "UNKNOWN";

  return (
    <Container className="py-4">
      <div className="d-flex flex-column flex-md-row align-items-start justify-content-between gap-3 mb-4">
        <div>
          <h2 className="mb-2">Authority Violation Upload</h2>
          <p className="text-muted mb-0">
            Upload evidence as an image or video, review AI detection, then confirm and save the violation.
          </p>
        </div>
        <Badge bg="warning" text="dark" className="py-2 px-3 badge-pill">
          Authority Only
        </Badge>
      </div>

      <Row className="g-4">
        <Col lg={7}>
          <Card className="panel-card shadow-sm">
            <Card.Body>
              <div className="d-flex align-items-center mb-4 gap-2">
                <FaUpload className="text-primary fs-4" />
                <div>
                  <Card.Title className="mb-0">Evidence Upload</Card.Title>
                  <small className="text-muted">Supported formats: JPG, PNG, MP4, MOV, AVI</small>
                </div>
              </div>

              <Form.Group className="mb-3">
                <Form.Label className="fw-semibold">Choose evidence file</Form.Label>
                <Form.Control
                  type="file"
                  name="file"
                  accept="image/*,video/*"
                  onChange={handleFileChange}
                  disabled={cameraActive}
                />
                {cameraActive && (
                  <Form.Text className="text-muted">
                    Live camera is active. File upload is disabled until you close the live stream.
                  </Form.Text>
                )}
              </Form.Group>

              <div className="d-flex flex-wrap gap-2 mb-3">
                {!cameraActive && (
                  <Button variant="primary" onClick={handleUpload} disabled={loading || !file}>
                    {loading ? (
                      <><Spinner animation="border" size="sm" /> Processing...</>
                    ) : (
                      <><FaFileImage className="me-2" /> Analyze Evidence</>
                    )}
                  </Button>
                )}
                <Button
                  variant={cameraActive ? "secondary" : "outline-secondary"}
                  onClick={cameraActive ? closeCamera : openCamera}
                  disabled={loading}
                >
                  <FaCamera className="me-2" /> {cameraActive ? "Stop Live Camera" : "Use Live Camera"}
                </Button>
                <Button variant="outline-secondary" onClick={saveAllViolations} disabled={!violations.some((item) => item.confirmed) || loading}>
                  <FaSave className="me-2" /> Save Confirmed
                </Button>
              </div>

              {cameraActive && (
                <div className="camera-preview mt-3">
                  <video
                    ref={videoRef}
                    autoPlay
                    playsInline
                    muted
                    className="preview-image"
                  />
                  <div className="d-flex gap-2 mt-2">
                    <Button size="sm" variant="primary" onClick={handleLiveDetect} disabled={loading}>
                      Detect Live
                    </Button>
                    <Button size="sm" variant="outline-secondary" onClick={closeCamera}>
                      Close Camera
                    </Button>
                  </div>
                  <Form.Text className="text-muted d-block mt-2">
                    Live mode automatically analyzes the current camera frame when you click Detect Live.
                  </Form.Text>
                  {cameraError && <Alert variant="warning" className="mt-3">{cameraError}</Alert>}
                </div>
              )}

              {loading && <ProgressBar animated now={progress} className="mb-3" />}
              {error && <Alert variant="danger">{error}</Alert>}
              {success && <Alert variant="success">{success}</Alert>}

              {file && (
                <Alert variant="info" className="mt-3">
                  Selected {fileTypeLabel} file: <strong>{file.name}</strong>
                </Alert>
              )}

              {preview && (
                <div className="preview-container mt-4">
                  {fileTypeLabel === "video" ? (
                    <video controls src={preview} className="preview-image" />
                  ) : (
                    <img src={preview} alt="Evidence preview" className="preview-image" />
                  )}
                </div>
              )}
            </Card.Body>
          </Card>

          <Card className="panel-card shadow-sm mt-4">
            <Card.Body>
              <div className="d-flex align-items-center mb-4 gap-2">
                <FaShieldAlt className="text-success fs-4" />
                <Card.Title className="mb-0">Detection Summary</Card.Title>
              </div>

              <Row className="gx-3 gy-3">
                <Col sm={4}>
                  <Card className="summary-card text-center p-3">
                    <h4 className="mb-1">{violations.length}</h4>
                    <small className="text-muted">Suggestions</small>
                  </Card>
                </Col>
                <Col sm={4}>
                  <Card className="summary-card text-center p-3">
                    <h4 className="mb-1">{detectedPlates.length}</h4>
                    <small className="text-muted">Plates found</small>
                  </Card>
                </Col>
                <Col sm={4}>
                  <Card className="summary-card text-center p-3">
                    <h4 className="mb-1">{savedCount}</h4>
                    <small className="text-muted">Saved records</small>
                  </Card>
                </Col>
              </Row>

              {plate && (
                <div className="mt-4">
                  <h6 className="mb-2">License Plate</h6>
                  <Badge bg={plateRecognized ? 'success' : 'warning'} className="p-2">
                    {plateRecognized ? plate.number : 'Couldn’t see number plate clearly'}
                  </Badge>
                  <p className="text-muted small mt-2">
                    {plateRecognized
                      ? `Recognition confidence ${(plate.confidence * 100).toFixed(1)}%`
                      : 'Try uploading a clearer image or use live capture.'}
                  </p>

                  <Form.Group className="mt-3">
                    <Form.Label className="fw-semibold">Confirm detected plate</Form.Label>
                    <div className="d-flex gap-2 align-items-center">
                      <Form.Control
                        type="text"
                        value={editedPlateNumber}
                        onChange={(e) => {
                          setEditedPlateNumber(e.target.value);
                          setPlateConfirmed(false);
                        }}
                        disabled={loading}
                      />
                      <Button
                        size="sm"
                        variant={plateConfirmed ? 'success' : 'outline-primary'}
                        onClick={() => {
                          if (!editedPlateNumber) {
                            setError('Enter the plate number to confirm.');
                            return;
                          }
                          setPlateConfirmed(true);
                          setSuccess(`Plate confirmed: ${editedPlateNumber}`);
                        }}
                      >
                        {plateConfirmed ? 'Plate Confirmed' : 'Confirm Plate'}
                      </Button>
                    </div>
                    {plateConfirmed && (
                      <p className="text-success small mt-2">
                        Plate number confirmed. You can now save confirmed violations.
                      </p>
                    )}
                  </Form.Group>
                </div>
              )}
            </Card.Body>
          </Card>
        </Col>

        <Col lg={5}>
          <Card className="panel-card shadow-sm">
            <Card.Body>
              <div className="d-flex align-items-center mb-4 gap-2">
                <FaCheckCircle className="text-info fs-4" />
                <Card.Title className="mb-0">Detected Violations</Card.Title>
              </div>
              <p className="text-muted small mb-3">
                Confirm each detected violation below, then save it to record the evidence.
              </p>

              {violations.length === 0 ? (
                <div className="text-center text-muted py-5">
                  Select an evidence file and click <strong>Analyze Evidence</strong> to begin.
                </div>
              ) : (
                violations.map((violation, index) => (
                  <Card key={index} className="detection-card mb-3 p-3">
                    <div className="d-flex flex-column gap-3 gap-md-0 flex-md-row justify-content-between align-items-start">
                      <div>
                        <h6 className="mb-1 text-capitalize">{violation.type.replace(/_/g, ' ')}</h6>
                        <p className="mb-1 text-muted small">
                          {violation.description || 'Detected violation candidate.'}
                        </p>
                        <div className="small text-secondary">
                          Confidence: {(violation.confidence * 100).toFixed(1)}%
                        </div>
                        <div className="mt-2">
                          Status: {violation.confirmed ? <Badge bg="success">Confirmed</Badge> : <Badge bg="secondary">Pending</Badge>}
                          {violation.saved && <Badge bg="info" className="ms-2">Saved</Badge>}
                        </div>
                      </div>
                      <div className="d-flex flex-wrap gap-2">
                        <Button size="sm" variant={violation.confirmed ? 'success' : 'outline-secondary'} onClick={() => toggleConfirm(index)}>
                          {violation.confirmed ? 'Confirmed' : 'Confirm'}
                        </Button>
                        <Button size="sm" variant="outline-primary" disabled={!violation.confirmed || violation.saved} onClick={() => saveViolation(index)}>
                          Save
                        </Button>
                      </div>
                    </div>
                  </Card>
                ))
              )}
            </Card.Body>
          </Card>

          <Card className="panel-card shadow-sm mt-4">
            <Card.Body>
              <div className="d-flex align-items-center mb-4 gap-2">
                <FaFileImage className="text-secondary fs-4" />
                <Card.Title className="mb-0">Upload Guidelines</Card.Title>
              </div>
              <ul className="ms-3 mb-0 upload-checklist">
                <li>Use a clear frame with visible vehicle plate and rider.</li>
                <li>Prefer stable, high-resolution captures for accurate OCR.</li>
                <li>Pause and use a still image if the video is too blurry.</li>
                <li>If the plate is unclear, save the violation as unverified.</li>
              </ul>
            </Card.Body>
          </Card>
        </Col>
      </Row>
    </Container>
  );
};

export default AuthorityUploadViolation;
