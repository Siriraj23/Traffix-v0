from ultralytics import YOLO
import cv2
import time
import os

# Load model
model = YOLO("../runs/detect/train/weights/best.pt")

# Create folder
os.makedirs("violations", exist_ok=True)

# Start webcam
cap = cv2.VideoCapture(0)

last_saved_time = 0
cooldown = 5  # seconds

while True:
    ret, frame = cap.read()
    if not ret:
        break

    results = model(frame)

    # ❌ REMOVE default plotting
    # annotated_frame = results[0].plot()

    # ✅ Create blank frame copy
    annotated_frame = frame.copy()

    has_bike = False
    has_no_helmet = False

    # Check detections
    if results[0].boxes is not None:
        for box in results[0].boxes:
            cls_id = int(box.cls[0])
            class_name = model.names[cls_id].lower()

            print("Detected:", class_name)

            x1, y1, x2, y2 = map(int, box.xyxy[0])

            # Track bike
            if class_name == "bike":
                has_bike = True

            # 🔴 Draw only NO HELMET
            if class_name in ["no-helmet", "without helmet"]:
                has_no_helmet = True

                cv2.rectangle(annotated_frame, (x1, y1), (x2, y2), (0, 0, 255), 2)
                cv2.putText(annotated_frame, "NO HELMET", (x1, y1 - 10),
                            cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 0, 255), 2)

            # 🟢 Draw helmet (optional)
            if class_name == "helmet":
                cv2.rectangle(annotated_frame, (x1, y1), (x2, y2), (0, 255, 0), 2)
                cv2.putText(annotated_frame, "HELMET", (x1, y1 - 10),
                            cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 255, 0), 2)

    # ✅ Final condition
    violation_detected = has_bike and has_no_helmet

    # Save only real violation
    if violation_detected:
        current_time = time.time()

        if current_time - last_saved_time > cooldown:
            timestamp = time.strftime("%Y%m%d_%H%M%S")
            filename = f"violations/live_{timestamp}.jpg"

            cv2.imwrite(filename, annotated_frame)

            print("🚨 Helmet Violation Detected!")
            print(f"Saved: {filename}")

            last_saved_time = current_time

    # Show output
    cv2.imshow("Helmet Detection Only", annotated_frame)

    # Exit
    if cv2.waitKey(1) & 0xFF == ord('q'):
        break

cap.release()
cv2.destroyAllWindows()