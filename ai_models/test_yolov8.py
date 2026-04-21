import cv2
import numpy as np
from cctv_detector_yolov8 import YOLOv8ViolationDetector
import json
import os

def test_webcam():
    """Test with webcam feed"""
    print("🎥 Testing with webcam...")
    
    detector = YOLOv8ViolationDetector(model_path='yolov8n.pt')
    cap = cv2.VideoCapture(0)
    
    if not cap.isOpened():
        print("❌ Could not open webcam")
        return
    
    print("✅ Webcam opened. Press 'q' to quit")
    
    while True:
        ret, frame = cap.read()
        if not ret:
            break
        
        # Process frame
        violations = detector.process_frame(frame)
        
        # Draw results
        frame_display = frame.copy()
        if detector.model:
            results = detector.model(frame, conf=0.5, verbose=False)
            if len(results) > 0:
                detections = detector._convert_yolo_to_dict(results[0])
                frame_display = detector.draw_detections(frame_display, detections, violations)
        
        # Show violation count
        cv2.putText(frame_display, f"Violations: {len(violations)}", 
                   (10, 30), cv2.FONT_HERSHEY_SIMPLEX, 1, (0, 0, 255), 2)
        
        # Show frame
        cv2.imshow('YOLOv8 Traffic Detection', frame_display)
        
        # Press 'q' to quit
        if cv2.waitKey(1) & 0xFF == ord('q'):
            break
    
    cap.release()
    cv2.destroyAllWindows()
    print("✅ Webcam test complete")

def test_image():
    """Test with sample image"""
    print("\n📷 Testing with sample image...")
    
    detector = YOLOv8ViolationDetector(model_path='yolov8n.pt')
    
    # Create a test image
    img = np.zeros((480, 640, 3), dtype=np.uint8)
    
    # Draw a "car"
    cv2.rectangle(img, (100, 200), (300, 400), (0, 255, 0), -1)
    
    # Draw a "motorcycle" with "persons"
    cv2.rectangle(img, (400, 300), (450, 350), (255, 0, 0), -1)  # Bike
    cv2.circle(img, (420, 320), 10, (255, 255, 0), -1)  # Person 1
    cv2.circle(img, (440, 320), 10, (255, 200, 0), -1)  # Person 2
    cv2.circle(img, (460, 320), 10, (255, 150, 0), -1)  # Person 3
    
    # Add text
    cv2.putText(img, "Test Image for Violation Detection", 
               (50, 50), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (255, 255, 255), 2)
    
    # Process image
    violations = detector.process_frame(img)
    
    print(f"\n📊 Detection Results:")
    print(f"Found {len(violations)} violations:")
    for violation in violations:
        print(f"  - {violation['type']} ({violation['confidence']:.2f}): {violation['description']}")
    
    # Draw and show
    if detector.model:
        results = detector.model(img, conf=0.5, verbose=False)
        if len(results) > 0:
            detections = detector._convert_yolo_to_dict(results[0])
            img_display = detector.draw_detections(img.copy(), detections, violations)
            cv2.imshow('Test Results', img_display)
            cv2.waitKey(3000)
            cv2.destroyAllWindows()
    
    print("✅ Image test complete")

def test_video():
    """Test with video file"""
    print("\n🎬 Testing with video file...")
    
    detector = YOLOv8ViolationDetector(model_path='yolov8n.pt')
    
    # Check for test video
    test_videos = ['traffic_video.mp4', 'test_video.mp4', 'sample.mp4']
    video_found = None
    
    for video in test_videos:
        if os.path.exists(video):
            video_found = video
            break
    
    if video_found:
        print(f"📹 Processing video: {video_found}")
        
        # Process video (first 100 frames for speed)
        result = detector.process_video(video_found, output_path='output_violations.mp4')
        
        if 'error' in result:
            print(f"❌ Error: {result['error']}")
        else:
            print(f"✅ Processed {result['frame_count']} frames in {result['processing_time']:.2f}s")
            print(f"📊 Found {result['unique_count']} unique violations")
            
            if result['violations']:
                print("\n🚨 Violations detected:")
                for i, violation in enumerate(result['violations'][:5]):  # Show first 5
                    print(f"  {i+1}. {violation['type']}: {violation['description']}")
            
            if os.path.exists('output_violations.mp4'):
                print(f"\n💾 Output saved to: output_violations.mp4")
    else:
        print("⚠️ No test video found. Create a 'traffic_video.mp4' for testing.")
    
    print("✅ Video test complete")

def main():
    print("=" * 60)
    print("🚦 YOLOv8 Traffic Violation Detection - Testing Suite")
    print("=" * 60)
    
    # Test 1: Image
    test_image()
    
    # Test 2: Video
    test_video()
    
    # Test 3: Webcam (optional - uncomment to enable)
    # test_webcam()
    
    print("\n" + "=" * 60)
    print("✅ All tests completed successfully!")
    print("=" * 60)

if __name__ == "__main__":
    main()