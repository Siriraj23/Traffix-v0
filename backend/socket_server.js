const socketIO = require('socket.io');
const CCTVProcessor = require('./cctv_processor');

function setupSocket(server) {
    const io = socketIO(server, {
        cors: {
            origin: "http://localhost:3000",
            methods: ["GET", "POST"]
        }
    });

    io.on('connection', (socket) => {
        console.log('🔌 New client connected:', socket.id);

        // Get active CCTV streams
        socket.on('get_active_streams', () => {
            const streams = CCTVProcessor.getActiveStreams();
            socket.emit('active_streams', streams);
        });

        // Start CCTV stream
        socket.on('start_cctv', (data) => {
            const { streamUrl, cameraId, location } = data;
            CCTVProcessor.processStream(streamUrl, cameraId, location)
                .then(result => {
                    socket.emit('cctv_started', result);
                    
                    // Send real-time violations
                    const interval = setInterval(() => {
                        const stream = CCTVProcessor.activeStreams.get(cameraId);
                        if (stream && stream.violations.length > 0) {
                            const newViolations = stream.violations.slice();
                            stream.violations = []; // Clear after sending
                            socket.emit('new_violations', {
                                cameraId,
                                violations: newViolations
                            });
                        }
                    }, 2000);

                    // Store interval for cleanup
                    socket.cctvIntervals = socket.cctvIntervals || {};
                    socket.cctvIntervals[cameraId] = interval;
                })
                .catch(error => {
                    socket.emit('cctv_error', { error: error.message });
                });
        });

        // Stop CCTV stream
        socket.on('stop_cctv', (cameraId) => {
            CCTVProcessor.stopStream(cameraId);
            socket.emit('cctv_stopped', { cameraId });
            
            // Clear interval
            if (socket.cctvIntervals && socket.cctvIntervals[cameraId]) {
                clearInterval(socket.cctvIntervals[cameraId]);
                delete socket.cctvIntervals[cameraId];
            }
        });

        // Process video file
        socket.on('process_video', async (data) => {
            const { filePath, cameraId, location } = data;
            try {
                const result = await CCTVProcessor.processVideoFile(filePath, cameraId, location);
                socket.emit('video_processed', result);
            } catch (error) {
                socket.emit('video_error', { error: error.message });
            }
        });

        // Disconnect
        socket.on('disconnect', () => {
            console.log('Client disconnected:', socket.id);
            // Clean up intervals
            if (socket.cctvIntervals) {
                Object.values(socket.cctvIntervals).forEach(interval => {
                    clearInterval(interval);
                });
            }
        });
    });

    return io;
}

module.exports = setupSocket;