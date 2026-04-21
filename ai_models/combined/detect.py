from fastapi import FastAPI, File, UploadFile, HTTPException
import numpy as np
import cv2
import uvicorn
import os
import tempfile
from typing import Optional
from ultralytics import YOLO
import easyocr
import re

app = FastAPI()

# ================= LOAD MODELS =================
helmet_model = YOLO("../helmet_dataset/best.pt")
plate_model = YOLO("../plate_dataset/best.pt")
vehicle_model = YOLO("../vehicle_detection/best.pt")

reader = easyocr.Reader(['en'])


# ================= OCR =================
def read_plate(frame, bbox):
    x1, y1, x2, y2 = bbox
    h, w = frame.shape[:2]

    x1, y1 = max(0, x1), max(0, y1)
    x2, y2 = min(w, x2), min(h, y2)

    crop = frame[y1:y2, x1:x2]

    if crop.size == 0:
        return None, 0

    gray = cv2.cvtColor(crop, cv2.COLOR_BGR2GRAY)
    gray = cv2.equalizeHist(gray)
    gray = cv2.bilateralFilter(gray, 11, 17, 17)

    _, thresh = cv2.threshold(gray, 150, 255, cv2.THRESH_BINARY)

    result = reader.readtext(thresh)

    if result:
        text = result[0][1]
        conf = float(result[0][2])

        text = text.upper().replace(" ", "")
        text = re.sub(r'[^A-Z0-9]', '', text)

        if len(text) < 5 or conf < 0.3:
            return None, 0

        return text, conf

    return None, 0


# ================= CORE PROCESS =================
def process(frame):

    # Resize for performance
    frame = cv2.resize(frame, (640, 384))

    metadata = {
        "detected_plates": [],
        "vehicles": [],
        "violations": []
    }

    # ================= VEHICLE =================
    vehicle_results = vehicle_model(frame, conf=0.25)

    if vehicle_results[0].boxes:
        for box in vehicle_results[0].boxes:
            conf = float(box.conf[0])
            cls = int(box.cls[0])
            name = vehicle_model.names[cls].lower()

            x1, y1, x2, y2 = map(int, box.xyxy[0])

            if conf > 0.25:
                metadata["vehicles"].append({
                    "label": name,
                    "type": "bike" if "bike" in name else "car",
                    "confidence": conf,
                    "bbox": [x1, y1, x2, y2]
                })

    # ================= HELMET =================
    helmet_results = helmet_model(frame, conf=0.25)

    helmet = 0
    no_helmet = 0

    if helmet_results[0].boxes:
        for box in helmet_results[0].boxes:
            conf = float(box.conf[0])
            cls = int(box.cls[0])
            name = helmet_model.names[cls].lower()

            if "no" in name:
                no_helmet += 1
                metadata["violations"].append({
                    "type": "no_helmet",
                    "confidence": conf,
                    "description": "Rider not wearing helmet"
                })
            else:
                helmet += 1

    # ================= PLATE =================
    plate_results = plate_model(frame, conf=0.15)

    if plate_results[0].boxes:
        for box in plate_results[0].boxes:
            x1, y1, x2, y2 = map(int, box.xyxy[0])

            plate_text, plate_conf = read_plate(frame, (x1, y1, x2, y2))

            metadata["detected_plates"].append({
                "number": plate_text if plate_text else "UNKNOWN",
                "confidence": plate_conf,
                "bbox": [x1, y1, x2, y2]
            })

    # ================= RIDER COUNT =================
    bike_count = sum(1 for v in metadata["vehicles"] if v["type"] == "bike")
    car_count = sum(1 for v in metadata["vehicles"] if v["type"] == "car")

    riders = helmet + no_helmet

    # ================= TRIPLE RIDING =================
    if bike_count > 0 and riders >= 3:
        metadata["violations"].append({
            "type": "triple_riding",
            "confidence": 0.9,
            "description": f"{riders} people on bike (allowed: 2)"
        })

    # ================= OVERLOADING =================
    # Bike
    if bike_count > 0 and riders > 2:
        metadata["violations"].append({
            "type": "overloading",
            "confidence": 0.9,
            "description": f"{riders} people on bike (overloading)"
        })

    # Car
    if car_count > 0 and riders > 5:
        metadata["violations"].append({
            "type": "overloading",
            "confidence": 0.9,
            "description": f"{riders} people in car (overloading)"
        })

    return metadata


# ================= VIDEO =================
def process_video(path):
    cap = cv2.VideoCapture(path)

    all_plates = []
    all_violations = []
    frame_count = 0

    while cap.isOpened():
        ret, frame = cap.read()
        if not ret:
            break

        frame_count += 1

        # Process every 5th frame
        if frame_count % 5 != 0:
            continue

        result = process(frame)

        all_plates.extend(result["detected_plates"])
        all_violations.extend(result["violations"])

    cap.release()

    # Remove duplicate plates
    unique_plates = {
        p["number"]: p for p in all_plates if p["number"] != "UNKNOWN"
    }

    return {
        "detected_plates": list(unique_plates.values()),
        "violations": all_violations
    }


# ================= LIVE =================
def live_detection():
    cap = cv2.VideoCapture(0)

    print("🔥 Live detection started... Press 'q' to stop")

    all_plates = []
    all_violations = []

    while True:
        ret, frame = cap.read()
        if not ret:
            break

        result = process(frame)

        all_plates.extend(result["detected_plates"])
        all_violations.extend(result["violations"])

        cv2.imshow("Live Detection", frame)

        if cv2.waitKey(1) & 0xFF == ord('q'):
            break

    cap.release()
    cv2.destroyAllWindows()

    return {
        "detected_plates": all_plates,
        "violations": all_violations
    }


# ================= HELPERS =================
def is_video(filename: str):
    return os.path.splitext(filename)[1].lower() in [".mp4", ".avi", ".mov", ".mkv"]


# ================= API =================
@app.get("/")
def home():
    return {"message": "AI Server Running 🚀"}


@app.get("/live")
def live():
    return live_detection()


@app.post("/detect")
async def detect(
    image: Optional[UploadFile] = File(default=None),
    file: Optional[UploadFile] = File(default=None)
):
    upload = image or file

    if not upload:
        raise HTTPException(status_code=422, detail="No file provided")

    contents = await upload.read()

    # VIDEO
    if is_video(upload.filename):
        temp = tempfile.NamedTemporaryFile(delete=False, suffix=".mp4")
        try:
            temp.write(contents)
            temp.close()
            return process_video(temp.name)
        finally:
            os.remove(temp.name)

    # IMAGE
    np_arr = np.frombuffer(contents, np.uint8)
    frame = cv2.imdecode(np_arr, cv2.IMREAD_COLOR)

    if frame is None:
        raise HTTPException(status_code=400, detail="Invalid image")

    return process(frame)


# ================= RUN =================
if __name__ == "__main__":
    uvicorn.run("detect:app", host="0.0.0.0", port=8000, reload=True)