from flask import Flask, request, jsonify
from flask_cors import CORS
from cctv_detector import CCTVViolationDetector
import cv2
import numpy as np
import base64
import json

app = Flask(__name__)
CORS(app)

detector = CCTVViolationDetector()

@app.route('/health', methods=['GET'])
def health():
    return jsonify({"status": "healthy", "model_loaded": detector.model is not None})

@app.route('/process_image', methods=['POST'])
def process_image():
    try:
        data = request.json
        if 'image' in data:
            # Decode base64 image
            image_data = base64.b64decode(data['image'])
            nparr = np.frombuffer(image_data, np.uint8)
            frame = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
            
            violations = detector.process_frame(frame)
            
            return jsonify({
                "success": True,
                "violations": violations,
                "count": len(violations)
            })
        else:
            return jsonify({"error": "No image provided"}), 400
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/process_rtsp', methods=['POST'])
def process_rtsp():
    try:
        data = request.json
        stream_url = data.get('stream_url')
        duration = data.get('duration', 30)
        
        if not stream_url:
            return jsonify({"error": "No stream URL provided"}), 400
        
        result = detector.process_rtsp_stream(stream_url, duration)
        
        return jsonify(result)
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/process_video', methods=['POST'])
def process_video():
    try:
        if 'video' not in request.files:
            return jsonify({"error": "No video file provided"}), 400
        
        video_file = request.files['video']
        video_path = f"temp_{video_file.filename}"
        video_file.save(video_path)
        
        result = detector.process_video_file(video_path)
        
        # Clean up
        import os
        if os.path.exists(video_path):
            os.remove(video_path)
        
        return jsonify(result)
    except Exception as e:
        return jsonify({"error": str(e)}), 500

if __name__ == '__main__':
    print("🚀 Starting AI Processing Server on port 5001")
    app.run(host='0.0.0.0', port=5001, debug=True)