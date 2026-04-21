const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const Violation = require('./models/Violation');

class CCTVProcessor {
    constructor() {
        this.activeStreams = new Map();
        this.violationThreshold = 0.7;
        this.frameInterval = 2000; // Process every 2 seconds
        this.useANPR = true; // Enable ANPR
        this.useYOLO = true; // Enable YOLO detection
    }

    // Process live CCTV stream with AI
    async processStream(streamUrl, cameraId, location) {
        console.log(`🎥 Starting CCTV processing for camera: ${cameraId}`);
        
        // Store stream info
        this.activeStreams.set(cameraId, {
            url: streamUrl,
            location,
            isProcessing: true,
            violations: [],
            frames: [],
            lastProcessed: Date.now()
        });

        // Start real processing if URL is real
        if (streamUrl.startsWith('rtsp://') || streamUrl.startsWith('http://')) {
            this.startRealProcessing(cameraId, location);
        } else {
            // Fallback to simulation
            this.simulateProcessing(cameraId, location);
        }
        
        return {
            success: true,
            cameraId,
            message: `CCTV processing started for ${cameraId}`,
            mode: streamUrl.startsWith('rtsp://') ? 'realtime' : 'simulation'
        };
    }

    // Real processing with Python AI (YOLO + ANPR)
    startRealProcessing(cameraId, location) {
        console.log(`🤖 Starting real AI processing for camera: ${cameraId}`);
        
        const interval = setInterval(async () => {
            const stream = this.activeStreams.get(cameraId);
            if (!stream || !stream.isProcessing) {
                clearInterval(interval);
                return;
            }

            // In real implementation, you would capture frame from RTSP stream
            // For now, simulate frame capture
            const framePath = await this.captureFrame(cameraId);
            
            if (framePath) {
                // Run YOLO + ANPR detection
                const detection = await this.runAIDetection(framePath);
                
                if (detection && detection.violations && detection.violations.length > 0) {
                    for (const violation of detection.violations) {
                        const savedViolation = await this.saveViolation({
                            ...violation,
                            cameraId,
                            location
                        });
                        
                        if (savedViolation) {
                            stream.violations.push(savedViolation);
                            console.log(`🚨 ${violation.type} detected on camera ${cameraId}`);
                            
                            // Emit to Socket.IO
                            this.emitViolation(savedViolation);
                        }
                    }
                }
                
                // Clean up frame
                if (fs.existsSync(framePath)) {
                    fs.unlinkSync(framePath);
                }
            }
        }, this.frameInterval);
        
        // Store interval for cleanup
        const stream = this.activeStreams.get(cameraId);
        if (stream) {
            stream.interval = interval;
        }
    }

    // Simulate real-time violation detection (fallback)
    simulateProcessing(cameraId, location) {
        const interval = setInterval(async () => {
            const stream = this.activeStreams.get(cameraId);
            if (!stream || !stream.isProcessing) {
                clearInterval(interval);
                return;
            }

            // Simulate random violation detection
            if (Math.random() > 0.7) {
                const violation = await this.detectViolation(cameraId, location);
                if (violation) {
                    stream.violations.push(violation);
                    console.log(`🚨 [SIMULATED] Violation detected on camera ${cameraId}: ${violation.type}`);
                    
                    // Emit to connected clients
                    this.emitViolation(violation);
                }
            }
        }, this.frameInterval);
        
        const stream = this.activeStreams.get(cameraId);
        if (stream) {
            stream.interval = interval;
        }
    }

    // Run AI detection with YOLO + ANPR
    async runAIDetection(imagePath) {
        return new Promise((resolve) => {
            const pythonProcess = spawn('python', [
                path.join(__dirname, '../ai_models/run_detection.py'),
                imagePath
            ]);
            
            let result = '';
            let error = '';
            
            pythonProcess.stdout.on('data', (data) => {
                result += data.toString();
            });
            
            pythonProcess.stderr.on('data', (data) => {
                error += data.toString();
                if (error.includes('Error')) {
                    console.error('AI Detection Error:', error);
                }
            });
            
            pythonProcess.on('close', (code) => {
                try {
                    if (result) {
                        const detection = JSON.parse(result);
                        resolve(detection);
                    } else {
                        resolve({ violations: [], plates: [] });
                    }
                } catch (e) {
                    console.error('Parse error:', e);
                    resolve({ violations: [], plates: [] });
                }
            });
            
            pythonProcess.on('error', (err) => {
                console.error('Failed to start AI process:', err);
                resolve({ violations: [], plates: [] });
            });
        });
    }

    // Capture frame from stream (simulated for now)
    async captureFrame(cameraId) {
        // In real implementation, use FFmpeg or OpenCV to capture frame
        // For now, create a placeholder
        const tempPath = path.join(__dirname, 'uploads', `frame_${cameraId}_${Date.now()}.jpg`);
        
        // Simulate frame capture (create empty file for testing)
        if (!fs.existsSync(tempPath)) {
            fs.writeFileSync(tempPath, 'Placeholder for captured frame');
        }
        
        return tempPath;
    }

    // Detect violations with ANPR (enhanced version)
    async detectViolation(cameraId, location) {
        const violationTypes = [
            'signal_violation',
            'overspeeding',
            'no_seatbelt',
            'triple_riding',
            'wrong_route',
            'no_helmet'
        ];

        const randomType = violationTypes[Math.floor(Math.random() * violationTypes.length)];
        const confidence = 0.7 + Math.random() * 0.25;

        if (confidence > this.violationThreshold) {
            const vehicleTypes = ['car', 'bike', 'truck', 'bus', 'auto'];
            const vehicleType = vehicleTypes[Math.floor(Math.random() * vehicleTypes.length)];
            
            // Generate realistic Indian number plate
            const vehicleNumber = this.generateRealisticNumberPlate();
            
            const violationData = {
                violationId: `CCTV-${cameraId}-${Date.now()}`,
                type: randomType,
                vehicleNumber: vehicleNumber,
                vehicleType: vehicleType,
                location: {
                    address: location,
                    cameraId: cameraId
                },
                confidence: parseFloat(confidence.toFixed(2)),
                status: 'detected',
                fineAmount: this.getFineAmount(randomType),
                description: this.getViolationDescription(randomType, vehicleNumber),
                evidenceImages: [`/cctv/${cameraId}/${Date.now()}.jpg`],
                timestamp: new Date(),
                // ANPR metadata
                anpr_detected: true,
                anpr_confidence: 0.85 + Math.random() * 0.1,
                anpr_raw_text: vehicleNumber,
                source: 'cctv_ai'
            };

            if (randomType === 'overspeeding') {
                violationData.speed = 60 + Math.floor(Math.random() * 40);
                violationData.speedLimit = 60;
            }

            return await this.saveViolation(violationData);
        }

        return null;
    }

    // Generate realistic Indian number plate
    generateRealisticNumberPlate() {
        const states = ['MH', 'DL', 'KA', 'TN', 'GJ', 'AP', 'UP', 'RJ', 'WB', 'PB', 'HR', 'MP', 'BR', 'OR'];
        const state = states[Math.floor(Math.random() * states.length)];
        const district = Math.floor(Math.random() * 90 + 10);
        const letters = String.fromCharCode(65 + Math.floor(Math.random() * 26)) + 
                        String.fromCharCode(65 + Math.floor(Math.random() * 26));
        const number = Math.floor(Math.random() * 9000 + 1000);
        
        return `${state}${district}${letters}${number}`;
    }

    // Save violation to database
    async saveViolation(violationData) {
        try {
            const violation = new Violation(violationData);
            await violation.save();
            return violation.toObject();
        } catch (error) {
            console.error('Error saving violation:', error);
            return null;
        }
    }

    getFineAmount(violationType) {
        const fines = {
            signal_violation: 2000,
            overspeeding: 1500,
            no_seatbelt: 1000,
            triple_riding: 500,
            wrong_route: 3000,
            no_helmet: 500
        };
        return fines[violationType] || 1000;
    }

    getViolationDescription(type, vehicleNumber) {
        const descriptions = {
            signal_violation: `Red light violation detected for ${vehicleNumber}`,
            overspeeding: `Vehicle ${vehicleNumber} exceeding speed limit`,
            no_seatbelt: `Driver of ${vehicleNumber} not wearing seatbelt`,
            triple_riding: `Three persons on bike ${vehicleNumber}`,
            wrong_route: `Vehicle ${vehicleNumber} in restricted zone`,
            no_helmet: `Rider without helmet on ${vehicleNumber}`
        };
        return descriptions[type] || `Traffic violation detected for ${vehicleNumber}`;
    }

    // Emit violation to WebSocket clients
    emitViolation(violation) {
        // This will be connected to Socket.IO
        if (global.io) {
            global.io.emit('new_violation', violation);
        }
        console.log(`📡 Violation emitted: ${violation.type} - ${violation.vehicleNumber}`);
    }

    // Stop CCTV processing
    stopStream(cameraId) {
        const stream = this.activeStreams.get(cameraId);
        if (stream) {
            stream.isProcessing = false;
            if (stream.interval) {
                clearInterval(stream.interval);
            }
            this.activeStreams.delete(cameraId);
            console.log(`🛑 Stopped CCTV processing for camera: ${cameraId}`);
        }
    }

    // Get active streams
    getActiveStreams() {
        return Array.from(this.activeStreams.entries()).map(([cameraId, data]) => ({
            cameraId,
            location: data.location,
            violations: data.violations.length,
            isProcessing: data.isProcessing,
            lastProcessed: data.lastProcessed
        }));
    }

    // Process recorded video file with AI
    async processVideoFile(filePath, cameraId, location) {
        console.log(`🎬 Processing video file: ${filePath}`);
        
        // Run AI detection on video
        const detection = await this.runAIDetection(filePath);
        
        // Save all detected violations
        const savedViolations = [];
        for (const violation of detection.violations) {
            const saved = await this.saveViolation({
                ...violation,
                cameraId,
                location,
                source: 'video_upload'
            });
            if (saved) {
                savedViolations.push(saved);
            }
        }
        
        return {
            success: true,
            filePath,
            cameraId,
            violations: savedViolations,
            plates: detection.plates,
            totalFrames: detection.frames_processed || 0,
            violationsDetected: savedViolations.length
        };
    }

    // Get ANPR statistics
    async getANPRStats() {
        try {
            const stats = await Violation.aggregate([
                { $match: { anpr_detected: true } },
                {
                    $group: {
                        _id: null,
                        total: { $sum: 1 },
                        avgConfidence: { $avg: '$anpr_confidence' }
                    }
                }
            ]);
            
            return {
                success: true,
                anpr_enabled: this.useANPR,
                total_anpr_detections: stats[0]?.total || 0,
                avg_confidence: stats[0]?.avgConfidence || 0
            };
        } catch (error) {
            return { success: false, error: error.message };
        }
    }
}

module.exports = new CCTVProcessor();