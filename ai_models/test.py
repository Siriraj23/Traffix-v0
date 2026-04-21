from ultralytics import YOLO
import cv2

# Load trained model
model = YOLO("../runs/detect/train/weights/best.pt")

# Load test image
img = cv2.imread("test1.jpg")  # make sure this image exists

# Run detection
results = model(img)

# Show result
results[0].show()