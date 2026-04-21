from ultralytics import YOLO
import cv2
model = YOLO("../../runs/detect/train10/weights/best.pt")

img = cv2.imread("test.jpg")

results = model(img)

results[0].show()