const express = require("express");
const router = express.Router();
const multer = require("multer");
const fs = require("fs");
const axios = require("axios");
const FormData = require("form-data");
const path = require("path");

// ================= FOLDER SETUP =================
const uploadDir = path.join(__dirname, "../../uploads");

if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// ================= MULTER CONFIG =================
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const uniqueName = Date.now() + "-" + file.originalname.replace(/\s/g, "_");
    cb(null, uniqueName);
  }
});

const upload = multer({ storage });

// ================= UPLOAD ROUTE =================
router.post("/", upload.single("file"), async (req, res) => {
  let filePath = null;

  try {
    // ✅ Check file
    if (!req.file) {
      return res.status(400).json({
        success: false,
        error: "No file uploaded"
      });
    }

    filePath = req.file.path;

    console.log("📁 File received:", req.file.originalname);

    // ================= SEND FILE TO AI SERVER =================
    const formData = new FormData();
    formData.append("file", fs.createReadStream(filePath));

    const aiResponse = await axios.post(
      "http://localhost:8000/detect",
      formData,
      {
        headers: formData.getHeaders(),
        maxContentLength: Infinity,
        maxBodyLength: Infinity,
        timeout: 120000 // ⬆ increase timeout for video
      }
    );

    // ================= HANDLE AI RESPONSE =================
    let data;

    try {
      data =
        typeof aiResponse.data === "string"
          ? JSON.parse(aiResponse.data)
          : aiResponse.data;
    } catch (parseErr) {
      console.error("❌ JSON Parse Error:", aiResponse.data);
      return res.status(500).json({
        success: false,
        error: "Invalid JSON from AI server"
      });
    }

    // ================= NORMALIZE RESPONSE =================
    const plates = data.detected_plates || data.plates || [];
    const violations = data.violations || [];

    console.log(`🔍 Plates detected: ${plates.length}`);
    console.log(`🚨 Violations detected: ${violations.length}`);

    // ================= SEND RESPONSE =================
    return res.json({
      success: true,
      detected_plates: plates,
      violations: violations
    });

  } catch (err) {
    console.error("❌ UPLOAD ERROR:", err.message);

    if (err.response) {
      console.error("⚠️ AI SERVER ERROR:", err.response.data);
    }

    return res.status(500).json({
      success: false,
      error: err.response?.data || err.message || "Processing failed"
    });

  } finally {
    // ================= CLEANUP =================
    if (filePath && fs.existsSync(filePath)) {
      fs.unlink(filePath, (err) => {
        if (err) console.warn("⚠️ Cleanup failed:", err.message);
      });
    }
  }
});

module.exports = router;