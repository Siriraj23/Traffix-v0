import React, { useState } from "react";
import {
  Form,
  Button,
  Card,
  Alert,
  ProgressBar,
  Container,
  Spinner,
  Badge
} from "react-bootstrap";

import { uploadAPI, violationsAPI } from "../api/api";

const UploadViolation = () => {
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(null);

  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);

  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const normalizeMessage = (value) => {
    if (typeof value === 'string') return value;
    if (value == null) return '';
    if (value.message) return value.message;
    if (typeof value === 'object') return JSON.stringify(value);
    return String(value);
  };

  const [detectedPlates, setDetectedPlates] = useState([]);
  const [violations, setViolations] = useState([]);

  // ================= FILE =================
  const handleFileChange = (e) => {
    const selected = e.target.files[0];
    if (!selected) return;

    setFile(selected);
    setError("");
    setSuccess("");
    setDetectedPlates([]);
    setViolations([]);

    setPreview(URL.createObjectURL(selected));
  };

  // ================= SAVE VIOLATION =================
  const saveViolation = async (violation) => {
    try {
      const payload = {
        type: violation.type,
        confidence: violation.confidence,
        description: violation.description || "",
        vehicleNumber:
          detectedPlates.length > 0 ? detectedPlates[0].number : "UNKNOWN",
        status: "detected",
        timestamp: new Date().toISOString()
      };

      const res = await violationsAPI.create(payload);

      if (res.success) {
        setSuccess(`Violation saved: ${violation.type}`);
      } else {
        setError("Failed to save violation");
      }
    } catch (err) {
      setError("Error saving violation");
    }
  };

  // ================= UPLOAD =================
  const handleUpload = async () => {
    if (!file) {
      setError("Please select a file first");
      return;
    }

    const formData = new FormData();
    formData.append("file", file);

    try {
      setLoading(true);
      setProgress(10);

      const interval = setInterval(() => {
        setProgress((p) => (p < 90 ? p + 10 : p));
      }, 300);

      const response = await uploadAPI.uploadImage(formData);

      clearInterval(interval);
      setProgress(100);

      if (!response.success) {
        setError(normalizeMessage(response.error) || "Processing failed");
        return;
      }

      // ================= CLEAN DATA =================
      const plates = (response.detected_plates || []).filter(
        (p) => p.confidence > 0.6
      );

      const vios = (response.violations || []).filter(
        (v) => v.confidence > 0.6
      );

      setDetectedPlates(plates);
      setViolations(vios);

      setSuccess("Image processed successfully!");
    } catch (err) {
      console.error(err);
      setError(normalizeMessage(err) || "Network error: Backend not reachable");
    } finally {
      setLoading(false);
    }
  };

  // ================= UI =================
  return (
    <Container className="py-4">
      <h3 className="text-center mb-4">🚦 Traffic Violation Detection</h3>

      <Card className="p-3 shadow-sm">

        {/* FILE */}
        <Form.Group>
          <Form.Label>Upload Image</Form.Label>
          <Form.Control type="file" accept="image/*" onChange={handleFileChange} />
        </Form.Group>

        {/* PREVIEW */}
        {preview && (
          <div className="text-center mt-3">
            <img
              src={preview}
              alt="preview"
              style={{ maxHeight: 250, borderRadius: 10 }}
            />
          </div>
        )}

        {/* BUTTON */}
        <Button
          className="w-100 mt-3"
          onClick={handleUpload}
          disabled={loading}
        >
          {loading ? (
            <>
              <Spinner size="sm" /> Processing...
            </>
          ) : (
            "Upload & Detect"
          )}
        </Button>

        {/* PROGRESS */}
        {loading && <ProgressBar now={progress} className="mt-3" />}

        {/* ERROR */}
        {error && <Alert variant="danger" className="mt-3">{error}</Alert>}

        {/* SUCCESS */}
        {success && <Alert variant="success" className="mt-3">{success}</Alert>}

        {/* PLATES */}
        {detectedPlates.length > 0 && (
          <div className="mt-4">
            <h5>🔍 Detected Plates</h5>

            {detectedPlates.map((p, i) => (
              <Badge bg="dark" key={i} className="me-2 p-2">
                {p.number} ({(p.confidence * 100).toFixed(1)}%)
              </Badge>
            ))}
          </div>
        )}

        {/* VIOLATIONS */}
        {violations.length > 0 && (
          <div className="mt-4">
            <h5>🚨 Violations Detected</h5>

            {violations.map((v, i) => (
              <Card key={i} className="p-2 mb-2">
                <div>
                  <strong>{v.type.toUpperCase()}</strong>
                </div>

                <div>
                  Confidence: {(v.confidence * 100).toFixed(1)}%
                </div>

                {v.description && <div>{v.description}</div>}

                {/* SAVE BUTTON */}
                <Button
                  size="sm"
                  className="mt-2"
                  onClick={() => saveViolation(v)}
                >
                  Save Violation
                </Button>
              </Card>
            ))}
          </div>
        )}
      </Card>
    </Container>
  );
};

export default UploadViolation;