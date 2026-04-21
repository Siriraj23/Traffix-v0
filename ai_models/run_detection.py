import sys
import json
import cv2
from anpr_detector import ANPRDetector
from cctv_detector_yolov8 import YOLOv8ViolationDetector

def detect_violations_with_anpr(image_path):
    """
    Run complete detection pipeline
    """
    detector = YOLOv8ViolationDetector()
    anpr = ANPRDetector()
    
    # Read image
    frame = cv2.imread(image_path)
    
    # YOLO detection
    violations = detector.process_frame(frame)
    
    # ANPR detection
    plates = anpr.detect_plates(image_path)
    
    # Combine results
    for violation in violations:
        if plates:
            # Try to match plate with vehicle
            violation['vehicleNumber'] = plates[0]['number']
            violation['plate_confidence'] = plates[0]['confidence']
    
    return {
        'violations': violations,
        'plates': plates
    }

if __name__ == "__main__":
    if len(sys.argv) > 1:
        image_path = sys.argv[1]
        result = detect_violations_with_anpr(image_path)
        print(json.dumps(result))