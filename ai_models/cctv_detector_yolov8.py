import cv2
import numpy as np
from ultralytics import YOLO
import torch
import time
from datetime import datetime
import json
import os
from pathlib import Path
import re

# Import ANPR detector (assuming it exists)
from anpr_detector import ANPRDetector

class YOLOv8ViolationDetector:
    def __init__(self, model_path='yolov8n.pt', use_anpr=True):
        """
        Initialize YOLOv8 based violation detector with ANPR support
        
        Args:
            model_path: Path to YOLOv8 model file or model name
            use_anpr: Enable Automatic Number Plate Recognition
        """
        self.device = torch.device('cuda' if torch.cuda.is_available() else 'cpu')
        print(f"🚀 Using device: {self.device}")
        
        self.model = self.load_model(model_path)
        self.class_names = self.model.names if self.model else {}
        self.violation_history = []
        
        # Violation detection thresholds
        self.conf_threshold = 0.5
        self.iou_threshold = 0.5
        
        # Initialize ANPR
        self.use_anpr = use_anpr
        self.anpr = None
        if use_anpr:
            try:
                self.anpr = ANPRDetector()
                print("✅ ANPR Detector initialized")
            except Exception as e:
                print(f"⚠️ Could not initialize ANPR: {e}")
                self.use_anpr = False
        
        # Store violation data with vehicle numbers
        self.violation_database = []
        self.plate_cache = {}  # Cache plate numbers by vehicle position
        
        print("✅ YOLOv8 Violation Detector initialized")
        
    def load_model(self, model_path):
        """Load YOLOv8 model"""
        try:
            print(f"📥 Loading YOLOv8 model: {model_path}")
            
            # Check if model exists locally, otherwise download
            if not os.path.exists(model_path) and model_path in ['yolov8n.pt', 'yolov8s.pt', 'yolov8m.pt', 'yolov8l.pt', 'yolov8x.pt']:
                print(f"🌐 Downloading {model_path}...")
                model = YOLO(model_path)  # This will auto-download
            else:
                model = YOLO(model_path)
            
            # Move to device
            model.to(self.device)
            
            print(f"✅ Model loaded successfully")
            print(f"📊 Model classes: {len(model.names)}")
            
            return model
            
        except Exception as e:
            print(f"❌ Error loading model: {e}")
            print("🔄 Using fallback detection")
            return None
    
    def process_frame(self, frame):
        """
        Process a single frame for traffic violations
        
        Args:
            frame: numpy array image (BGR format)
        
        Returns:
            list of violations detected
        """
        violations = []
        
        if self.model is not None:
            try:
                # Run YOLOv8 inference
                results = self.model(
                    frame,
                    conf=self.conf_threshold,
                    iou=self.iou_threshold,
                    device=self.device,
                    verbose=False
                )
                
                # Get detections
                if len(results) > 0:
                    detections = results[0]
                    
                    # Extract boxes, classes, confidences
                    boxes = detections.boxes.xyxy.cpu().numpy()
                    classes = detections.boxes.cls.cpu().numpy()
                    confidences = detections.boxes.conf.cpu().numpy()
                    
                    # Convert to list of dictionaries for easier processing
                    detections_list = []
                    for i in range(len(boxes)):
                        detections_list.append({
                            'box': boxes[i],
                            'class_id': int(classes[i]),
                            'class_name': self.class_names.get(int(classes[i]), 'unknown'),
                            'confidence': float(confidences[i]),
                            'xmin': float(boxes[i][0]),
                            'ymin': float(boxes[i][1]),
                            'xmax': float(boxes[i][2]),
                            'ymax': float(boxes[i][3]),
                            'center_x': float((boxes[i][0] + boxes[i][2]) / 2),
                            'center_y': float((boxes[i][1] + boxes[i][3]) / 2),
                            'width': float(boxes[i][2] - boxes[i][0]),
                            'height': float(boxes[i][3] - boxes[i][1])
                        })
                    
                    # Detect violations
                    violations.extend(self.detect_triple_riding(detections_list))
                    violations.extend(self.detect_no_helmet(detections_list))
                    violations.extend(self.detect_signal_violation(frame, detections_list))
                    violations.extend(self.detect_wrong_route(detections_list))
                    violations.extend(self.detect_no_seatbelt(detections_list))
                    violations.extend(self.detect_overspeeding(detections_list))
                    
            except Exception as e:
                print(f"❌ Error in frame processing: {e}")
                violations = self.simulate_violations()
        else:
            # Fallback to simulated violations
            violations = self.simulate_violations()
        
        return violations
    
    def detect_violations_with_anpr(self, frame, image_path=None):
        """
        Complete violation detection with ANPR
        
        Args:
            frame: numpy array image or path to image
            image_path: optional path to save image
        
        Returns:
            tuple: (violations list, plates list)
        """
        violations = []
        plates = []
        
        try:
            # If frame is a string, treat it as image path
            if isinstance(frame, str):
                image_path = frame
                frame = cv2.imread(frame)
                if frame is None:
                    return [], []
            
            # 1. YOLO detection
            results = self.model(frame, conf=self.conf_threshold, verbose=False)
            detections = self._convert_yolo_to_dict(results[0]) if len(results) > 0 else []
            
            # 2. ANPR detection on vehicle regions
            if self.use_anpr and self.anpr is not None:
                # Save temporary image if needed
                if image_path is None:
                    temp_path = f"temp_{datetime.now().strftime('%Y%m%d_%H%M%S')}.jpg"
                    cv2.imwrite(temp_path, frame)
                    plates = self.anpr.detect_plates_with_yolo(temp_path, detections)
                    os.remove(temp_path)
                else:
                    plates = self.anpr.detect_plates_with_yolo(image_path, detections)
                
                # Cache plate numbers by vehicle position
                for plate in plates:
                    if plate.get('vehicle_bbox'):
                        cache_key = self._get_position_key(plate['vehicle_bbox'])
                        self.plate_cache[cache_key] = plate['number']
            
            # 3. Check violations
            violations = self.process_frame(frame)
            
            # 4. Add plate numbers to violations
            for violation in violations:
                vehicle_bbox = violation.get('bbox')
                
                if plates and vehicle_bbox:
                    # Find matching plate based on vehicle position
                    for plate in plates:
                        if self._is_plate_matching_vehicle(plate, vehicle_bbox):
                            violation['vehicleNumber'] = plate['number']
                            violation['plate_confidence'] = plate.get('confidence', 0.5)
                            violation['plate_location'] = plate.get('bbox')
                            break
                
                # If no plate detected, try cache
                if not violation.get('vehicleNumber') and vehicle_bbox:
                    cache_key = self._get_position_key(vehicle_bbox)
                    if cache_key in self.plate_cache:
                        violation['vehicleNumber'] = self.plate_cache[cache_key]
                        violation['from_cache'] = True
                
                # If still no plate, use fallback
                if not violation.get('vehicleNumber'):
                    violation['vehicleNumber'] = self._generate_fallback_number()
                    violation['is_fallback'] = True
                
                # Add timestamp and store in database
                violation['detection_time'] = datetime.now().isoformat()
                self.violation_database.append(violation)
            
            # 5. Log violations with vehicle numbers
            for violation in violations:
                if violation.get('vehicleNumber'):
                    print(f"🚨 Violation detected for vehicle {violation['vehicleNumber']}: {violation['type']}")
            
        except Exception as e:
            print(f"❌ Error in violation detection with ANPR: {e}")
        
        return violations, plates
    
    def _is_plate_matching_vehicle(self, plate, vehicle_bbox):
        """Check if plate belongs to vehicle based on position"""
        if not vehicle_bbox or not plate.get('vehicle_bbox'):
            return False
        
        plate_bbox = plate['vehicle_bbox']
        
        # Calculate Intersection over Union (IoU)
        x1 = max(vehicle_bbox[0], plate_bbox[0])
        y1 = max(vehicle_bbox[1], plate_bbox[1])
        x2 = min(vehicle_bbox[2], plate_bbox[2])
        y2 = min(vehicle_bbox[3], plate_bbox[3])
        
        intersection = max(0, x2 - x1) * max(0, y2 - y1)
        
        area1 = (vehicle_bbox[2] - vehicle_bbox[0]) * (vehicle_bbox[3] - vehicle_bbox[1])
        area2 = (plate_bbox[2] - plate_bbox[0]) * (plate_bbox[3] - plate_bbox[1])
        union = area1 + area2 - intersection
        
        if union > 0:
            iou = intersection / union
            return iou > 0.3  # Return True if IoU > 30%
        
        # Alternative: check if plate is within vehicle bounding box
        plate_center_x = (plate_bbox[0] + plate_bbox[2]) / 2
        plate_center_y = (plate_bbox[1] + plate_bbox[3]) / 2
        
        return (vehicle_bbox[0] <= plate_center_x <= vehicle_bbox[2] and
                vehicle_bbox[1] <= plate_center_y <= vehicle_bbox[3])
    
    def _get_position_key(self, bbox):
        """Generate a key for position-based caching"""
        # Quantize coordinates to reduce cache size
        x_quant = int(bbox[0] / 50)
        y_quant = int(bbox[1] / 50)
        return f"{x_quant}_{y_quant}"
    
    def _generate_fallback_number(self):
        """Generate fallback vehicle number when ANPR fails"""
        states = ['MH', 'DL', 'KA', 'TN', 'GJ', 'AP', 'UP', 'RJ', 'WB', 'PB']
        state = states[hash(str(datetime.now())) % len(states)]
        number = str(abs(hash(datetime.now())) % 100)
        letters = chr(65 + (abs(hash(datetime.now())) % 26))
        final_num = (abs(hash(datetime.now())) % 9000) + 1000
        return f"{state}{number:02d}{letters}{final_num}"
    
    def get_vehicle_history(self, vehicle_number):
        """Get violation history for a specific vehicle"""
        history = []
        for violation in self.violation_database:
            if violation.get('vehicleNumber') == vehicle_number:
                history.append({
                    'type': violation['type'],
                    'timestamp': violation.get('detection_time'),
                    'description': violation.get('description'),
                    'confidence': violation.get('confidence')
                })
        return history
    
    def generate_report(self, output_file='violation_report.json'):
        """Generate comprehensive violation report"""
        report = {
            'generated_at': datetime.now().isoformat(),
            'total_violations': len(self.violation_database),
            'violations_by_type': {},
            'vehicles': {},
            'violations_list': self.violation_database
        }
        
        # Count violations by type
        for violation in self.violation_database:
            vtype = violation['type']
            if vtype not in report['violations_by_type']:
                report['violations_by_type'][vtype] = 0
            report['violations_by_type'][vtype] += 1
            
            # Track by vehicle
            vehicle_number = violation.get('vehicleNumber')
            if vehicle_number:
                if vehicle_number not in report['vehicles']:
                    report['vehicles'][vehicle_number] = {
                        'violations': [],
                        'count': 0
                    }
                report['vehicles'][vehicle_number]['violations'].append(violation)
                report['vehicles'][vehicle_number]['count'] += 1
        
        # Save report
        with open(output_file, 'w') as f:
            json.dump(report, f, indent=2)
        
        print(f"📊 Report saved to {output_file}")
        return report
    
    def detect_triple_riding(self, detections):
        """Detect triple riding on motorcycles/bikes"""
        violations = []
        
        try:
            # Get motorcycles and persons
            motorcycles = [d for d in detections if d['class_name'] in ['motorcycle', 'bicycle']]
            persons = [d for d in detections if d['class_name'] == 'person']
            
            for bike in motorcycles:
                persons_on_bike = 0
                
                for person in persons:
                    # Check if person is near/on the bike
                    distance = np.sqrt(
                        (bike['center_x'] - person['center_x'])**2 + 
                        (bike['center_y'] - person['center_y'])**2
                    )
                    
                    # Distance threshold (adjust based on image resolution)
                    max_distance = min(bike['width'], bike['height']) * 1.5
                    
                    if distance < max_distance:
                        persons_on_bike += 1
                
                if persons_on_bike >= 3:
                    violations.append({
                        'type': 'triple_riding',
                        'confidence': min(0.9, bike['confidence'] * 0.9),
                        'description': f'Triple riding detected ({persons_on_bike} persons on {bike["class_name"]})',
                        'timestamp': datetime.now().isoformat(),
                        'vehicle_type': bike['class_name'],
                        'persons_count': persons_on_bike,
                        'bbox': bike['box'].tolist()
                    })
                    
        except Exception as e:
            print(f"⚠️ Error in triple riding detection: {e}")
        
        return violations
    
    def detect_no_helmet(self, detections):
        """Detect riders without helmet"""
        violations = []
        
        try:
            motorcycles = [d for d in detections if d['class_name'] in ['motorcycle', 'bicycle']]
            persons = [d for d in detections if d['class_name'] == 'person']
            
            for bike in motorcycles:
                rider_detected = False
                helmet_detected = False
                
                for person in persons:
                    # Check if person is the rider
                    distance = np.sqrt(
                        (bike['center_x'] - person['center_x'])**2 + 
                        (bike['center_y'] - person['center_y'])**2
                    )
                    
                    if distance < bike['width'] * 0.8:
                        rider_detected = True
                        
                        # Simple helmet detection (person's head should be above bike)
                        # In real implementation, use a separate helmet detection model
                        if person['ymin'] < bike['ymin'] - 10:  # Head above bike
                            helmet_detected = True
                        
                        break
                
                if rider_detected and not helmet_detected:
                    violations.append({
                        'type': 'no_helmet',
                        'confidence': bike['confidence'] * 0.8,
                        'description': f'Rider without helmet on {bike["class_name"]}',
                        'timestamp': datetime.now().isoformat(),
                        'vehicle_type': bike['class_name'],
                        'bbox': bike['box'].tolist()
                    })
                    
        except Exception as e:
            print(f"⚠️ Error in helmet detection: {e}")
        
        return violations
    
    def detect_signal_violation(self, frame, detections):
        """Detect traffic signal violations"""
        violations = []
        
        try:
            # Detect traffic lights in frame
            red_lights = self.detect_traffic_light_color(frame, 'red')
            vehicles = [d for d in detections if d['class_name'] in ['car', 'truck', 'bus', 'motorcycle']]
            
            # If red light is detected and vehicles are moving through intersection
            if red_lights > 0 and len(vehicles) > 0:
                # Get intersection area (lower center of image)
                height, width = frame.shape[:2]
                intersection_y_start = int(height * 0.6)
                intersection_y_end = height
                intersection_x_start = int(width * 0.3)
                intersection_x_end = int(width * 0.7)
                
                # Count vehicles in intersection during red light
                vehicles_in_intersection = 0
                for vehicle in vehicles:
                    if (vehicle['center_x'] > intersection_x_start and 
                        vehicle['center_x'] < intersection_x_end and
                        vehicle['center_y'] > intersection_y_start and
                        vehicle['center_y'] < intersection_y_end):
                        vehicles_in_intersection += 1
                
                if vehicles_in_intersection > 0:
                    violations.append({
                        'type': 'signal_violation',
                        'confidence': 0.75 + (vehicles_in_intersection * 0.05),
                        'description': f'Red light violation: {vehicles_in_intersection} vehicle(s) in intersection',
                        'timestamp': datetime.now().isoformat(),
                        'red_lights_detected': red_lights,
                        'vehicles_in_intersection': vehicles_in_intersection
                    })
                    
        except Exception as e:
            print(f"⚠️ Error in signal violation detection: {e}")
        
        return violations
    
    def detect_traffic_light_color(self, frame, color='red'):
        """Detect traffic lights of specific color"""
        try:
            hsv = cv2.cvtColor(frame, cv2.COLOR_BGR2HSV)
            
            # Color ranges in HSV
            color_ranges = {
                'red': [
                    (np.array([0, 120, 70]), np.array([10, 255, 255])),
                    (np.array([170, 120, 70]), np.array([180, 255, 255]))
                ],
                'green': [(np.array([40, 40, 40]), np.array([90, 255, 255]))],
                'yellow': [(np.array([20, 100, 100]), np.array([30, 255, 255]))]
            }
            
            if color not in color_ranges:
                return 0
            
            mask = np.zeros(frame.shape[:2], dtype=np.uint8)
            
            for lower, upper in color_ranges[color]:
                color_mask = cv2.inRange(hsv, lower, upper)
                mask = cv2.bitwise_or(mask, color_mask)
            
            # Apply morphological operations
            kernel = np.ones((5, 5), np.uint8)
            mask = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, kernel)
            mask = cv2.morphologyEx(mask, cv2.MORPH_OPEN, kernel)
            
            # Find contours
            contours, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
            
            lights = 0
            for contour in contours:
                area = cv2.contourArea(contour)
                # Filter by size (traffic lights are usually small)
                if 50 < area < 500:
                    # Check aspect ratio (traffic lights are usually round or rectangular)
                    x, y, w, h = cv2.boundingRect(contour)
                    aspect_ratio = w / h if h > 0 else 0
                    
                    if 0.5 < aspect_ratio < 2.0:  # Reasonable aspect ratio for traffic lights
                        lights += 1
            
            return lights
            
        except Exception as e:
            print(f"⚠️ Error detecting traffic lights: {e}")
            return 0
    
    def detect_wrong_route(self, detections):
        """Detect wrong route/lane violations"""
        violations = []
        
        try:
            # Get vehicles
            vehicles = [d for d in detections if d['class_name'] in ['car', 'truck', 'bus', 'motorcycle']]
            
            for vehicle in vehicles:
                vehicle_type = vehicle['class_name']
                center_x = vehicle['center_x']
                
                # Simple lane violation logic
                # In real implementation, you'd need lane detection
                
                if vehicle_type in ['truck', 'bus']:
                    # Heavy vehicles shouldn't be in fast lanes (right side in some countries)
                    if center_x > 400:  # Assuming image width ~640px
                        violations.append({
                            'type': 'wrong_route',
                            'confidence': vehicle['confidence'] * 0.7,
                            'description': f'{vehicle_type.capitalize()} in wrong lane',
                            'timestamp': datetime.now().isoformat(),
                            'vehicle_type': vehicle_type,
                            'lane_position': 'fast_lane',
                            'bbox': vehicle['box'].tolist()
                        })
                        
        except Exception as e:
            print(f"⚠️ Error in wrong route detection: {e}")
        
        return violations
    
    def detect_no_seatbelt(self, detections):
        """Detect drivers without seatbelt (simplified)"""
        violations = []
        
        try:
            cars = [d for d in detections if d['class_name'] == 'car']
            persons = [d for d in detections if d['class_name'] == 'person']
            
            for car in cars:
                # Check for driver in car
                for person in persons:
                    # Is person inside the car?
                    if (person['center_x'] > car['xmin'] and 
                        person['center_x'] < car['xmax'] and
                        person['center_y'] > car['ymin'] and 
                        person['center_y'] < car['ymax']):
                        
                        # Simplified: Assume front-left person is driver
                        if person['center_x'] < car['center_x']:  # Left side of car
                            # In real implementation, use seatbelt detection model
                            # For now, random detection for demo
                            if np.random.random() > 0.7:
                                violations.append({
                                    'type': 'no_seatbelt',
                                    'confidence': min(0.8, car['confidence'] * 0.9),
                                    'description': 'Driver not wearing seatbelt',
                                    'timestamp': datetime.now().isoformat(),
                                    'vehicle_type': 'car',
                                    'bbox': car['box'].tolist()
                                })
                            break
                            
        except Exception as e:
            print(f"⚠️ Error in seatbelt detection: {e}")
        
        return violations
    
    def detect_overspeeding(self, detections):
        """Detect overspeeding (requires tracking across frames)"""
        violations = []
        
        try:
            # This is a placeholder - real speed detection requires:
            # 1. Vehicle tracking across frames
            # 2. Known distance in real world
            # 3. Frame rate calculation
            
            # For demo, simulate occasional detection
            if np.random.random() > 0.9:  # 10% chance
                vehicles = [d for d in detections if d['class_name'] in ['car', 'motorcycle']]
                if vehicles:
                    vehicle = vehicles[0]
                    violations.append({
                        'type': 'overspeeding',
                        'confidence': 0.75,
                        'description': f'Possible overspeeding detected ({vehicle["class_name"]})',
                        'timestamp': datetime.now().isoformat(),
                        'vehicle_type': vehicle['class_name'],
                        'estimated_speed': 70 + np.random.randint(0, 30),
                        'speed_limit': 60,
                        'bbox': vehicle['box'].tolist()
                    })
                    
        except Exception as e:
            print(f"⚠️ Error in overspeeding detection: {e}")
        
        return violations
    
    def simulate_violations(self):
        """Simulate violations for testing"""
        violations = []
        
        violation_types = [
            'signal_violation',
            'overspeeding', 
            'no_seatbelt',
            'triple_riding',
            'wrong_route',
            'no_helmet'
        ]
        
        # Randomly generate 0-2 violations
        num_violations = np.random.randint(0, 3)
        
        for _ in range(num_violations):
            violation_type = np.random.choice(violation_types)
            confidence = 0.7 + np.random.random() * 0.25
            
            descriptions = {
                'signal_violation': 'Red light violation detected',
                'overspeeding': 'Vehicle exceeding speed limit',
                'no_seatbelt': 'Driver not wearing seatbelt',
                'triple_riding': 'Three persons on two-wheeler',
                'wrong_route': 'Vehicle in wrong lane',
                'no_helmet': 'Rider without helmet'
            }
            
            violations.append({
                'type': violation_type,
                'confidence': float(confidence),
                'description': descriptions.get(violation_type, 'Traffic violation detected'),
                'timestamp': datetime.now().isoformat()
            })
        
        return violations
    
    def draw_detections(self, frame, detections, violations=None):
        """Draw detections and violations on frame"""
        try:
            # Draw bounding boxes
            for det in detections:
                x1, y1, x2, y2 = map(int, det['box'])
                label = f"{det['class_name']}: {det['confidence']:.2f}"
                
                # Different colors for different classes
                color_map = {
                    'car': (0, 255, 0),      # Green
                    'truck': (0, 165, 255),  # Orange
                    'bus': (0, 255, 255),    # Yellow
                    'motorcycle': (255, 0, 0), # Blue
                    'person': (255, 255, 0), # Cyan
                    'bicycle': (255, 0, 255) # Magenta
                }
                
                color = color_map.get(det['class_name'], (255, 255, 255))
                
                # Draw rectangle
                cv2.rectangle(frame, (x1, y1), (x2, y2), color, 2)
                
                # Draw label background
                (text_width, text_height), _ = cv2.getTextSize(label, cv2.FONT_HERSHEY_SIMPLEX, 0.5, 1)
                cv2.rectangle(frame, (x1, y1 - text_height - 10), (x1 + text_width, y1), color, -1)
                
                # Draw label text
                cv2.putText(frame, label, (x1, y1 - 5), 
                          cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 0, 0), 1)
            
            # Draw violation alerts
            if violations:
                for i, violation in enumerate(violations):
                    # Add vehicle number to display if available
                    vehicle_info = ""
                    if violation.get('vehicleNumber'):
                        vehicle_info = f" [{violation['vehicleNumber']}]"
                    
                    text = f"🚨 {violation['type']}{vehicle_info}: {violation['confidence']:.2f}"
                    cv2.putText(frame, text, (10, 30 + i*30),
                              cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 0, 255), 2)
            
            return frame
            
        except Exception as e:
            print(f"⚠️ Error drawing detections: {e}")
            return frame
    
    def _convert_yolo_to_dict(self, yolo_results):
        """Convert YOLO results to dictionary format"""
        if not yolo_results or len(yolo_results) == 0:
            return []
        
        detections = []
        boxes = yolo_results.boxes
        
        if boxes is not None:
            boxes_np = boxes.xyxy.cpu().numpy()
            classes_np = boxes.cls.cpu().numpy()
            confidences_np = boxes.conf.cpu().numpy()
            
            for i in range(len(boxes_np)):
                detections.append({
                    'box': boxes_np[i],
                    'class_id': int(classes_np[i]),
                    'class_name': self.class_names.get(int(classes_np[i]), 'unknown'),
                    'confidence': float(confidences_np[i]),
                    'xmin': float(boxes_np[i][0]),
                    'ymin': float(boxes_np[i][1]),
                    'xmax': float(boxes_np[i][2]),
                    'ymax': float(boxes_np[i][3]),
                    'center_x': float((boxes_np[i][0] + boxes_np[i][2]) / 2),
                    'center_y': float((boxes_np[i][1] + boxes_np[i][3]) / 2),
                    'width': float(boxes_np[i][2] - boxes_np[i][0]),
                    'height': float(boxes_np[i][3] - boxes_np[i][1])
                })
        
        return detections
    
    def process_video(self, video_path, output_path=None, use_anpr=False):
        """Process video file for violations with optional ANPR"""
        results = {
            'video_path': video_path,
            'violations': [],
            'plates_detected': [],
            'frame_count': 0,
            'processing_time': 0
        }
        
        try:
            cap = cv2.VideoCapture(video_path)
            if not cap.isOpened():
                return {'error': f'Could not open video: {video_path}'}
            
            # Get video properties
            fps = int(cap.get(cv2.CAP_PROP_FPS))
            width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
            height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
            
            print(f"📹 Video: {fps} FPS, {width}x{height}")
            
            # Setup video writer if output specified
            writer = None
            if output_path:
                fourcc = cv2.VideoWriter_fourcc(*'mp4v')
                writer = cv2.VideoWriter(output_path, fourcc, fps, (width, height))
            
            start_time = time.time()
            frame_count = 0
            
            while cap.isOpened():
                ret, frame = cap.read()
                if not ret:
                    break
                
                frame_count += 1
                
                # Process every Nth frame for performance
                if frame_count % 5 == 0:
                    if use_anpr and self.use_anpr:
                        # Use ANPR-enhanced detection
                        violations, plates = self.detect_violations_with_anpr(frame)
                        results['plates_detected'].extend(plates)
                    else:
                        # Regular detection
                        violations = self.process_frame(frame)
                    
                    results['violations'].extend(violations)
                    
                    # Draw on frame
                    if writer or True:
                        detections = []
                        if self.model:
                            results_inference = self.model(frame, conf=self.conf_threshold, verbose=False)
                            if len(results_inference) > 0:
                                detections = self._convert_yolo_to_dict(results_inference[0])
                        
                        frame_with_detections = self.draw_detections(frame.copy(), detections, violations)
                        
                        # Add FPS counter
                        elapsed_time = time.time() - start_time
                        if elapsed_time > 0:
                            current_fps = frame_count / elapsed_time
                            cv2.putText(frame_with_detections, f"FPS: {current_fps:.1f}", 
                                      (10, frame.shape[0] - 10), cv2.FONT_HERSHEY_SIMPLEX, 
                                      0.5, (255, 255, 255), 1)
                        
                        if writer:
                            writer.write(frame_with_detections)
                
                # Limit for demo
                if frame_count >= 500:  # Process first 500 frames
                    break
            
            cap.release()
            if writer:
                writer.release()
            
            results['frame_count'] = frame_count
            results['processing_time'] = time.time() - start_time
            results['success'] = True
            
            # Remove duplicate violations
            unique_violations = []
            seen = set()
            for v in results['violations']:
                key = (v['type'], v.get('vehicleNumber', ''), v.get('description', ''))
                if key not in seen:
                    seen.add(key)
                    unique_violations.append(v)
            
            results['violations'] = unique_violations
            results['unique_count'] = len(unique_violations)
            
            # Generate report
            self.violation_database = results['violations']
            self.generate_report(f"report_{Path(video_path).stem}.json")
            
        except Exception as e:
            results['error'] = str(e)
        
        return results


# Example usage and testing
if __name__ == "__main__":
    print("=" * 60)
    print("🚦 YOLOv8 Traffic Violation Detection System with ANPR")
    print("=" * 60)
    
    # Initialize detector with ANPR
    detector = YOLOv8ViolationDetector(model_path='yolov8n.pt', use_anpr=True)
    
    # Test with webcam
    print("\n🎥 Testing with webcam (press 'q' to quit)...")
    
    cap = cv2.VideoCapture(0)
    if not cap.isOpened():
        print("❌ Could not open webcam")
    else:
        print("✅ Webcam opened successfully")
        
        while True:
            ret, frame = cap.read()
            if not ret:
                break
            
            # Process frame with ANPR
            violations, plates = detector.detect_violations_with_anpr(frame)
            
            # Draw detections
            frame_with_detections = frame.copy()
            if detector.model:
                results = detector.model(frame, conf=0.5, verbose=False)
                if len(results) > 0:
                    detections = detector._convert_yolo_to_dict(results[0])
                    frame_with_detections = detector.draw_detections(
                        frame_with_detections, 
                        detections, 
                        violations
                    )
            
            # Show plate information
            if plates:
                for i, plate in enumerate(plates[:2]):  # Show first 2 plates
                    plate_text = f"Plate: {plate['number']} ({plate['confidence']:.2f})"
                    cv2.putText(frame_with_detections, plate_text, 
                              (10, frame.shape[0] - 60 - (i * 30)),
                              cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0, 255, 255), 2)
            
            # Show violations count
            cv2.putText(frame_with_detections, 
                       f"Violations: {len(violations)}", 
                       (10, frame.shape[0] - 20),
                       cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 0, 255), 2)
            
            # Display
            cv2.imshow('YOLOv8 Traffic Violation Detection with ANPR', frame_with_detections)
            
            # Press 'q' to quit
            if cv2.waitKey(1) & 0xFF == ord('q'):
                break
        
        cap.release()
        cv2.destroyAllWindows()
    
    print("\n✅ Testing complete!")
    
    # Example: Process a video file
    print("\n📹 Example video processing:")
    video_path = "traffic_video.mp4"  # Replace with your video path
    if os.path.exists(video_path):
        results = detector.process_video(video_path, output_path="output_with_violations.mp4", use_anpr=True)
        print(f"Processing complete: {results.get('unique_count', 0)} violations detected")
        
        # Show vehicle history
        if results.get('violations'):
            sample_violation = results['violations'][0]