from ultralytics import YOLO
import cv2
import time
import os

# Load models
helmet_model = YOLO("../runs/detect/train/weights/best.pt")
plate_model = YOLO("../runs/detect/train10/weights/best.pt")

# Input video
cap = cv2.VideoCapture("test_video1.mp4")

os.makedirs("violations", exist_ok=True)

last_saved_time = 0
cooldown = 5

while True:
    ret, frame = cap.read()
    if not ret:
        break

    # Helmet detection
    results = helmet_model(frame)
    annotated_frame = results[0].plot()

    has_bike = False
    has_no_helmet = False

    if results[0].boxes is not None:
        for box in results[0].boxes:
            cls_id = int(box.cls[0])
            class_name = helmet_model.names[cls_id].lower()

            if class_name == "bike":
                has_bike = True

            if class_name in ["no-helmet", "without helmet"]:
                has_no_helmet = True

    # 🚨 VIOLATION CONDITION
    if has_bike and has_no_helmet:
        current_time = time.time()

        if current_time - last_saved_time > cooldown:
            timestamp = time.strftime("%Y%m%d_%H%M%S")

            filename = f"violations/video_{timestamp}.jpg"
            cv2.imwrite(filename, annotated_frame)

            print("🚨 Violation Detected!")

            # Plate detection
            plate_results = plate_model(frame)

            for box in plate_results[0].boxes:
                x1, y1, x2, y2 = map(int, box.xyxy[0])

                plate_crop = frame[y1:y2, x1:x2]
                plate_file = f"violations/plate_{timestamp}.jpg"

                cv2.imwrite(plate_file, plate_crop)
                print("Plate saved:", plate_file)

            last_saved_time = current_time

    cv2.imshow("Video Detection", annotated_frame)

    if cv2.waitKey(1) & 0xFF == ord('q'):
        break

cap.release()
cv2.destroyAllWindows()