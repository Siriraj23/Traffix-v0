import cv2
import numpy as np
import tensorflow as tf
from tensorflow import keras
from datetime import datetime
import json

class TrafficViolationDetector:
    def __init__(self):
        self.signal_light_model = self.load_signal_light_model()
        self.helmet_detector = self.load_helmet_detector()
        self.seatbelt_detector = self.load_seatbelt_detector()
        self.vehicle_classifier = self.load_vehicle_classifier()
        self.speed_estimator = self.load_speed_estimator()
        
    def load_signal_light_model(self):
        # Load pre-trained traffic light detection model
        try:
            model = tf.keras.models.load_model('models/traffic_light_model.h5')
            return model
        except:
            print("Traffic light model not found, using default detection")
            return None
    
    def load_helmet_detector(self):
        # Load helmet detection model
        try:
            model = tf.keras.models.load_model('models/helmet_detector.h5')
            return model
        except:
            print("Helmet detector not found")
            return None
    
    def load_seatbelt_detector(self):
        # Load seatbelt detection model
        try:
            model = tf.keras.models.load_model('models/seatbelt_detector.h5')
            return model
        except:
            print("Seatbelt detector not found")
            return None
    
    def detect_traffic_light_violation(self, image):
        """Detect if vehicle is violating traffic signal"""
        violations = []
        
        # Convert to HSV for color detection
        hsv = cv2.cvtColor(image, cv2.COLOR_BGR2HSV)
        
        # Red color range
        red_lower = np.array([0, 120, 70])
        red_upper = np.array([10, 255, 255])
        
        # Green color range
        green_lower = np.array([40, 40, 40])
        green_upper = np.array([90, 255, 255])
        
        # Detect red and green lights
        red_mask = cv2.inRange(hsv, red_lower, red_upper)
        green_mask = cv2.inRange(hsv, green_lower, green_upper)
        
        # Find contours
        red_contours, _ = cv2.findContours(red_mask, cv2.RETR_TREE, cv2.CHAIN_APPROX_SIMPLE)
        green_contours, _ = cv2.findContours(green_mask, cv2.RETR_TREE, cv2.CHAIN_APPROX_SIMPLE)
        
        # Check if red light is on and vehicle is moving
        if len(red_contours) > 0 and self.is_vehicle_moving(image):
            violations.append({
                'type': 'signal_violation',
                'confidence': 0.85,
                'description': 'Vehicle passed during red signal'
            })
        
        return violations
    
    def detect_triple_riding(self, image):
        """Detect triple riding on bikes"""
        violations = []
        
        # Use YOLO or similar model for person detection
        # For demo, using simple contour detection
        gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
        
        # Detect people-like contours
        contours, _ = cv2.findContours(gray, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        
        person_count = 0
        for contour in contours:
            area = cv2.contourArea(contour)
            if 1000 < area < 10000:  # Approximate person area range
                person_count += 1
        
        if person_count >= 3:
            violations.append({
                'type': 'triple_riding',
                'confidence': 0.75,
                'person_count': person_count,
                'description': f'Detected {person_count} persons on bike'
            })
        
        return violations
    
    def detect_no_seatbelt(self, image):
        """Detect if driver is not wearing seatbelt"""
        violations = []
        
        # Convert to grayscale
        gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
        
        # Apply edge detection
        edges = cv2.Canny(gray, 50, 150)
        
        # Detect diagonal lines (seatbelt characteristic)
        lines = cv2.HoughLinesP(edges, 1, np.pi/180, threshold=50, minLineLength=30, maxLineGap=10)
        
        seatbelt_detected = False
        if lines is not None:
            for line in lines:
                x1, y1, x2, y2 = line[0]
                angle = np.arctan2(y2 - y1, x2 - x1) * 180 / np.pi
                
                # Seatbelt lines are typically diagonal
                if 30 < abs(angle) < 60:
                    seatbelt_detected = True
                    break
        
        if not seatbelt_detected:
            violations.append({
                'type': 'no_seatbelt',
                'confidence': 0.70,
                'description': 'Driver not wearing seatbelt'
            })
        
        return violations
    
    def estimate_speed(self, frame1, frame2, fps=30):
        """Estimate vehicle speed from consecutive frames"""
        # Convert to grayscale
        gray1 = cv2.cvtColor(frame1, cv2.COLOR_BGR2GRAY)
        gray2 = cv2.cvtColor(frame2, cv2.COLOR_BGR2GRAY)
        
        # Calculate optical flow
        flow = cv2.calcOpticalFlowFarneback(gray1, gray2, None, 0.5, 3, 15, 3, 5, 1.2, 0)
        
        # Calculate magnitude of flow vectors
        magnitude = np.sqrt(flow[..., 0]**2 + flow[..., 1]**2)
        
        # Average magnitude as speed indicator
        avg_speed = np.mean(magnitude) * fps * 3.6  # Convert to km/h
        
        return avg_speed
    
    def detect_overspeeding(self, frames, speed_limit=60):
        """Detect if vehicle is overspeeding"""
        violations = []
        
        if len(frames) < 2:
            return violations
        
        # Estimate speed from consecutive frames
        speeds = []
        for i in range(len(frames) - 1):
            speed = self.estimate_speed(frames[i], frames[i + 1])
            speeds.append(speed)
        
        avg_speed = np.mean(speeds) if speeds else 0
        
        if avg_speed > speed_limit:
            violations.append({
                'type': 'overspeeding',
                'confidence': 0.80,
                'speed': round(avg_speed, 2),
                'speed_limit': speed_limit,
                'description': f'Vehicle speed {avg_speed:.2f} km/h exceeds limit {speed_limit} km/h'
            })
        
        return violations
    
    def detect_wrong_route(self, image, allowed_routes=['main_road']):
        """Detect if vehicle is in wrong route (basic implementation)"""
        violations = []
        
        # For demo, check vehicle position relative to lane markers
        gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
        
        # Detect edges for lane markers
        edges = cv2.Canny(gray, 50, 150)
        
        # Detect lines (lane markers)
        lines = cv2.HoughLinesP(edges, 1, np.pi/180, threshold=50, minLineLength=30, maxLineGap=10)
        
        if lines is not None:
            # Analyze lane position
            # This is simplified - real implementation would track vehicle position
            # relative to lane markers over time
            
            # Check if vehicle appears to be crossing lane markers
            # (Basic check for demonstration)
            crossing_lines = 0
            for line in lines:
                x1, y1, x2, y2 = line[0]
                # Check if line is near vehicle center
                if 300 < x1 < 500:  # Assuming center of 800px wide image
                    crossing_lines += 1
            
            if crossing_lines > 2:
                violations.append({
                    'type': 'wrong_route',
                    'confidence': 0.65,
                    'description': 'Vehicle appears to be in wrong lane/route'
                })
        
        return violations
    
    def is_vehicle_moving(self, image):
        """Check if vehicle is moving (basic implementation)"""
        # This would compare with previous frames
        # For demo, return True
        return True
    
    def process_image(self, image_path):
        """Main function to process image and detect violations"""
        violations = []
        
        # Load image
        image = cv2.imread(image_path)
        if image is None:
            return {"error": "Could not load image"}
        
        # Resize for processing
        image = cv2.resize(image, (800, 600))
        
        # Detect all types of violations
        violations.extend(self.detect_traffic_light_violation(image))
        violations.extend(self.detect_triple_riding(image))
        violations.extend(self.detect_no_seatbelt(image))
        violations.extend(self.detect_wrong_route(image))
        
        return {
            "success": True,
            "violations": violations,
            "timestamp": datetime.now().isoformat()
        }
    
    def process_video(self, video_path, speed_limit=60):
        """Process video for violations"""
        all_violations = []
        frames = []
        
        cap = cv2.VideoCapture(video_path)
        fps = cap.get(cv2.CAP_PROP_FPS)
        
        frame_count = 0
        while cap.isOpened():
            ret, frame = cap.read()
            if not ret:
                break
            
            frame_count += 1
            # Process every 10th frame for speed
            if frame_count % 10 == 0:
                frames.append(cv2.resize(frame, (800, 600)))
                
                # Process single frame violations
                frame_violations = self.process_image_from_frame(frame)
                all_violations.extend(frame_violations)
        
        cap.release()
        
        # Check for overspeeding using collected frames
        if len(frames) >= 2:
            overspeeding_violations = self.detect_overspeeding(frames, speed_limit)
            all_violations.extend(overspeeding_violations)
        
        return {
            "success": True,
            "violations": all_violations,
            "frames_processed": frame_count,
            "timestamp": datetime.now().isoformat()
        }
    
    def process_image_from_frame(self, frame):
        """Process a single frame for violations"""
        violations = []
        
        # Convert frame to image format
        frame = cv2.resize(frame, (800, 600))
        
        # Detect violations (excluding speed as it needs multiple frames)
        violations.extend(self.detect_traffic_light_violation(frame))
        violations.extend(self.detect_triple_riding(frame))
        violations.extend(self.detect_no_seatbelt(frame))
        violations.extend(self.detect_wrong_route(frame))
        
        return violations

if __name__ == "__main__":
    detector = TrafficViolationDetector()
    
    # Test with sample image
    result = detector.process_image("sample_traffic.jpg")
    print(json.dumps(result, indent=2))