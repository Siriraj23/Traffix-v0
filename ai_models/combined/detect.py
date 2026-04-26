from __future__ import annotations

import os
import re
import tempfile
import time
import json
import base64
import threading
import asyncio
from collections import defaultdict
from typing import Any, Dict, List, Optional, Tuple
from datetime import datetime

import cv2
import easyocr
import numpy as np
import uvicorn
from fastapi import FastAPI, File, HTTPException, UploadFile, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse
from ultralytics import YOLO


CONFIG: Dict[str, Any] = {
    "max_dim": 1280,
    "min_dim": 320,
    
    # Detection confidence thresholds - LOWERED for better detection
    "vehicle_conf": 0.10,
    "helmet_conf": 0.10,
    "plate_conf": 0.10,
    "triple_conf": 0.10,
    "overload_conf": 0.08,     # Very low for overloading detection
    
    # Video processing
    "frame_stride": 3,
    "max_video_frames": 100,
    
    # Distance thresholds
    "bike_rider_distance": 350,
    "vehicle_match_distance": 300,
    "vehicle_merge_cell": 64,
    
    # Plate detection
    "min_plate_length": 4,
    "max_plate_length": 12,
    "plate_confidence_threshold": 0.3,
    
    # Area thresholds
    "min_object_area": 300,
    "min_vehicle_area": 1500,
    
    # Overloading detection - IMPROVED
    "overload_person_min_confidence": 0.10,
    "overload_group_distance": 250,
    "overload_min_persons_auto": 4,      # Auto rickshaw: 4+ persons
    "overload_min_persons_bike": 3,       # Bike: 3+ persons (already triple riding)
    "overload_min_persons_truck": 6,      # Truck: 6+ persons
    "overload_min_persons_car": 5,        # Car: 5+ persons
    "overload_vehicle_expansion": 60,     # Expand vehicle bbox by 60px for person counting
    "overload_use_counting": True,        # Enable person counting fallback
    "overload_iou_threshold": 0.3,        # IoU for merging overlapping overload detections
    "overload_merge_distance": 250,       # Distance for merging overload detections
    
    # Triple riding
    "triple_person_count": 3,
    "triple_proximity_threshold": 150,
    "triple_use_counting": True,
    
    # Deduplication
    "iou_dedup_threshold": 0.4,
    "position_dedup_distance": 150,
    "triple_iou_threshold": 0.3,
    "triple_merge_distance": 200,
    
    # CCTV specific
    "cctv_fps": 3,              # Process more frames for CCTV
    "cctv_reconnect_delay": 5,
    "cctv_max_reconnect_attempts": 20,
    "cctv_frame_timeout": 10,
    "cctv_analysis_interval": 0.5,  # Analyze every 0.5 seconds
}

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
MODEL_ROOT = os.path.abspath(os.path.join(BASE_DIR, ".."))

# Global state for CCTV streams
active_cctv_streams: Dict[str, Dict[str, Any]] = {}
cctv_lock = threading.Lock()

app = FastAPI(title="TraffiX AI Detection Service", version="6.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

BBox = List[int]


class ViolationTracker:
    """Tracks violations across frames to merge duplicates."""
    
    def __init__(self):
        self.tracked_violations: Dict[str, List[Dict]] = {
            "no_helmet": [],
            "triple_riding": [],
            "overloading": []
        }
        self.total_processed = 0
        self.start_time = time.time()
    
    def add_violation(self, violation_type: str, violation: Dict, frame_idx: int):
        """Add a violation if it's not a duplicate of existing ones."""
        violation = violation.copy()
        violation["frame_number"] = frame_idx
        
        for existing in self.tracked_violations[violation_type]:
            if self._is_duplicate(violation, existing):
                if violation["confidence"] > existing["confidence"]:
                    existing.update(violation)
                return False
        
        self.tracked_violations[violation_type].append(violation)
        return True
    
    def _is_duplicate(self, v1: Dict, v2: Dict) -> bool:
        bbox1 = v1.get("bbox", [0, 0, 0, 0])
        bbox2 = v2.get("bbox", [0, 0, 0, 0])
        
        iou = bbox_iou(bbox1, bbox2)
        if iou > CONFIG["iou_dedup_threshold"]:
            return True
        
        dist = bbox_distance(bbox1, bbox2)
        if dist < CONFIG["position_dedup_distance"]:
            return True
        
        return False
    
    def get_unique_violations(self) -> Dict[str, List[Dict]]:
        return {k: list(v) for k, v in self.tracked_violations.items()}
    
    def get_total_unique(self) -> int:
        return sum(len(v) for v in self.tracked_violations.values())
    
    def get_stats(self) -> Dict[str, Any]:
        elapsed = time.time() - self.start_time
        return {
            "total_processed": self.total_processed,
            "total_unique_violations": self.get_total_unique(),
            "violations": {
                "no_helmet": len(self.tracked_violations["no_helmet"]),
                "triple_riding": len(self.tracked_violations["triple_riding"]),
                "overloading": len(self.tracked_violations["overloading"])
            },
            "runtime_seconds": round(elapsed, 1),
            "fps": round(self.total_processed / elapsed, 2) if elapsed > 0 else 0
        }


class ImagePreprocessor:
    def __init__(self):
        self.clahe = cv2.createCLAHE(clipLimit=3.0, tileGridSize=(8, 8))
    
    def enhance_for_detection(self, frame: np.ndarray) -> np.ndarray:
        try:
            alpha, beta = 1.3, 10
            enhanced = cv2.convertScaleAbs(frame, alpha=alpha, beta=beta)
            lab = cv2.cvtColor(enhanced, cv2.COLOR_BGR2LAB)
            l, a, b = cv2.split(lab)
            l_enhanced = self.clahe.apply(l)
            enhanced = cv2.cvtColor(cv2.merge([l_enhanced, a, b]), cv2.COLOR_LAB2BGR)
            kernel = np.array([[0, -1, 0], [-1, 5, -1], [0, -1, 0]])
            return cv2.filter2D(enhanced, -1, kernel)
        except:
            return frame
    
    def enhance_for_ocr(self, plate_crop: np.ndarray) -> np.ndarray:
        if plate_crop.size == 0:
            return plate_crop
        try:
            h, w = plate_crop.shape[:2]
            if h < 30:
                plate_crop = cv2.resize(plate_crop, (int(w * 30/h), 30))
            gray = cv2.cvtColor(plate_crop, cv2.COLOR_BGR2GRAY)
            enhanced = self.clahe.apply(gray)
            enhanced = cv2.bilateralFilter(enhanced, 9, 75, 75)
            enhanced = cv2.adaptiveThreshold(enhanced, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C, cv2.THRESH_BINARY, 15, 3)
            return cv2.fastNlMeansDenoising(enhanced, None, 10, 7, 21)
        except:
            return plate_crop


preprocessor = ImagePreprocessor()


def model_path(folder_name: str) -> str:
    return os.path.join(MODEL_ROOT, folder_name, "best.pt")


def load_model(folder_name: str) -> YOLO:
    path = model_path(folder_name)
    if not os.path.exists(path):
        print(f"⚠️  Model not found: {path}")
        return None
    try:
        model = YOLO(path)
        print(f"✅ Loaded: {folder_name}")
        print(f"   Classes: {model.names}")
        return model
    except Exception as e:
        print(f"❌ Failed: {folder_name} - {e}")
        return None


print("\n" + "="*60)
print("🤖 Loading AI Models...")
print("="*60)

helmet_model = load_model("helmet_dataset")
plate_model = load_model("plate_dataset")
triple_model = load_model("triple_riding")
vehicle_model = load_model("vehicle_detection")
overload_model = load_model("overloading")

models_loaded = sum(1 for m in [helmet_model, plate_model, triple_model, vehicle_model, overload_model] if m is not None)
print(f"✅ Models: {models_loaded}/5\n")

try:
    ocr_reader = easyocr.Reader(["en"], gpu=False)
    print("✅ OCR ready\n")
except:
    ocr_reader = None
    print("⚠️  OCR unavailable\n")


def convert_numpy(obj):
    if isinstance(obj, (np.integer,)): return int(obj)
    if isinstance(obj, (np.floating,)): return float(obj)
    if isinstance(obj, np.ndarray): return obj.tolist()
    if isinstance(obj, dict): return {k: convert_numpy(v) for k, v in obj.items()}
    if isinstance(obj, (list, tuple)): return [convert_numpy(i) for i in obj]
    return obj


def contains_any(value: str, keywords: List[str]) -> bool:
    return any(kw.lower() in value.lower() for kw in keywords)


def resize_frame(frame: np.ndarray) -> np.ndarray:
    h, w = frame.shape[:2]
    if w < CONFIG["min_dim"] or h < CONFIG["min_dim"]:
        s = CONFIG["min_dim"] / min(w, h)
        return cv2.resize(frame, (int(w*s), int(h*s)))
    if max(h, w) > CONFIG["max_dim"]:
        s = CONFIG["max_dim"] / max(h, w)
        return cv2.resize(frame, (int(w*s), int(h*s)))
    return frame


def clamp_bbox(raw_box, frame_shape) -> Optional[BBox]:
    h, w = frame_shape[:2]
    x1, y1, x2, y2 = [int(v) for v in raw_box]
    x1, x2 = min(x1, x2), max(x1, x2)
    y1, y2 = min(y1, y2), max(y1, y2)
    x1, y1 = max(0, min(x1, w-1)), max(0, min(y1, h-1))
    x2, y2 = max(0, min(x2, w)), max(0, min(y2, h))
    if x2-x1 < 15 or y2-y1 < 15: return None
    return [x1, y1, x2, y2]


def bbox_center(box: BBox) -> Tuple[float, float]:
    return ((box[0]+box[2])/2.0, (box[1]+box[3])/2.0)


def bbox_distance(box1: BBox, box2: BBox) -> float:
    x1, y1 = bbox_center(box1)
    x2, y2 = bbox_center(box2)
    return float(np.hypot(x1-x2, y1-y2))


def bbox_iou(box1: BBox, box2: BBox) -> float:
    x1, y1 = max(box1[0], box2[0]), max(box1[1], box2[1])
    x2, y2 = min(box1[2], box2[2]), min(box1[3], box2[3])
    if x2 <= x1 or y2 <= y1: return 0.0
    inter = (x2-x1)*(y2-y1)
    a1 = (box1[2]-box1[0])*(box1[3]-box1[1])
    a2 = (box2[2]-box2[0])*(box2[3]-box2[1])
    return inter/(a1+a2-inter) if (a1+a2-inter) > 0 else 0.0


def bbox_area(box: BBox) -> float:
    return (box[2] - box[0]) * (box[3] - box[1])


def normalize_plate_text(text: str) -> Optional[str]:
    cleaned = re.sub(r"[^A-Za-z0-9]", "", text).upper()
    corrections = {'0':'O','1':'I','5':'S','8':'B'}
    result = [corrections.get(c, c) if c.isdigit() and c in corrections else c for c in cleaned]
    cleaned = ''.join(result)
    if CONFIG["min_plate_length"] <= len(cleaned) <= CONFIG["max_plate_length"]:
        return cleaned
    return cleaned if len(cleaned) >= 3 else None


def read_plate_text(frame: np.ndarray, box: BBox) -> Optional[str]:
    if ocr_reader is None: return None
    x1, y1, x2, y2 = box
    crop = frame[y1:y2, x1:x2]
    if crop.size == 0: return None
    enhanced = preprocessor.enhance_for_ocr(crop)
    try:
        results = ocr_reader.readtext(enhanced, detail=1)
    except:
        return None
    best_text, best_conf = None, 0.0
    for _, text, conf in results:
        if conf < CONFIG["plate_confidence_threshold"]: continue
        n = normalize_plate_text(text)
        if n and conf > best_conf:
            best_text, best_conf = n, conf
    return best_text


def predict_boxes(model, frame, conf, class_filter=None, verbose=False):
    """Run model prediction with optional class filtering."""
    detections = []
    if model is None: 
        return detections
    
    processed = preprocessor.enhance_for_detection(frame)
    try:
        results = model(processed, conf=conf, iou=0.5, verbose=False, max_det=300)
        if results and results[0].boxes is not None:
            for item in results[0].boxes:
                box = clamp_bbox(tuple(item.xyxy[0].tolist()), frame.shape)
                if box is None: 
                    continue
                
                class_name = str(model.names[int(item.cls[0])]).lower()
                confidence = round(float(item.conf[0]), 4)
                
                # Filter by class if specified
                if class_filter and not contains_any(class_name, class_filter):
                    continue
                
                if verbose:
                    print(f"     [DETECT] {class_name} | conf={confidence:.3f} | box={box}")
                
                detections.append({
                    "bbox": box,
                    "confidence": confidence,
                    "class_id": int(item.cls[0]),
                    "class_name": class_name,
                })
    except Exception as e:
        print(f"  Prediction error: {e}")
    
    return detections


def merge_nearby_detections(violations: List[Dict], iou_threshold: float, distance_threshold: float) -> List[Dict]:
    """Merge overlapping detection boxes into single detections."""
    if len(violations) <= 1:
        return violations
    
    merged = []
    used = set()
    
    for i, v1 in enumerate(violations):
        if i in used:
            continue
        
        group = [v1]
        used.add(i)
        
        for j, v2 in enumerate(violations):
            if j in used:
                continue
            
            iou = bbox_iou(v1["bbox"], v2["bbox"])
            dist = bbox_distance(v1["bbox"], v2["bbox"])
            
            if iou > iou_threshold or dist < distance_threshold:
                group.append(v2)
                used.add(j)
        
        if len(group) > 1:
            all_boxes = [v["bbox"] for v in group]
            x1 = min(b[0] for b in all_boxes)
            y1 = min(b[1] for b in all_boxes)
            x2 = max(b[2] for b in all_boxes)
            y2 = max(b[3] for b in all_boxes)
            max_conf = max(v["confidence"] for v in group)
            max_count = max(v.get("count", 0) for v in group)
            
            merged.append({
                **group[0],
                "bbox": [x1, y1, x2, y2],
                "confidence": max_conf,
                "count": max_count,
                "merged_from": len(group)
            })
        else:
            merged.append(v1)
    
    return merged


def detect_overloading(frame: np.ndarray, vehicles: List[Dict]) -> List[Dict]:
    """
    Enhanced overloading detection using:
    1. Dedicated overload model
    2. Person counting near overloadable vehicles
    3. Density estimation
    """
    violations = []
    
    # ===== METHOD 1: Overload model detection =====
    overload_dets = predict_boxes(
        overload_model, frame, CONFIG["overload_conf"],
        class_filter=["overload", "overloaded", "crowded", "overload_auto", 
                      "overcrowded", "over_crowd", "heavy", "congested"]
    )
    
    for det in overload_dets:
        violations.append({
            "type": "overloading",
            "bbox": det["bbox"],
            "confidence": det["confidence"],
            "count": 0,
            "message": "Vehicle overloading detected by AI model",
            "fine_amount": 5000,
            "detection_method": "model"
        })
    
    # ===== METHOD 2: Person counting near vehicles =====
    if CONFIG["overload_use_counting"]:
        # Get all overloadable vehicles
        overloadable = [v for v in vehicles 
                       if v["type"] in ["auto", "truck", "bus", "car", "bike"]]
        
        if overloadable:
            # Get ALL person detections from multiple models for better coverage
            person_dets = []
            
            # From vehicle model
            person_dets.extend(
                predict_boxes(vehicle_model, frame, CONFIG["overload_person_min_confidence"],
                            class_filter=["person", "rider", "pedestrian", "people", "driver"])
            )
            
            # From helmet model (riders with/without helmet are persons)
            person_dets.extend(
                predict_boxes(helmet_model, frame, CONFIG["overload_person_min_confidence"],
                            class_filter=["with", "helmet", "rider", "no_helmet", "without"])
            )
            
            # Deduplicate person detections
            person_dets = merge_nearby_detections(person_dets, 0.5, 50)
            
            for vehicle in overloadable:
                # Skip if already covered by model detection
                already_detected = False
                for v in violations:
                    if v.get("detection_method") == "model":
                        if bbox_iou(vehicle["bbox"], v["bbox"]) > 0.3:
                            already_detected = True
                            break
                
                if already_detected:
                    continue
                
                # Expand vehicle bbox for counting persons on/inside it
                vb = vehicle["bbox"]
                expansion = CONFIG["overload_vehicle_expansion"]
                expanded_bbox = [
                    max(0, vb[0] - expansion),
                    max(0, vb[1] - expansion),
                    min(frame.shape[1], vb[2] + expansion),
                    min(frame.shape[0], vb[3] + expansion)
                ]
                
                # Count persons inside expanded vehicle box
                nearby_persons = []
                for person in person_dets:
                    p_center = bbox_center(person["bbox"])
                    if (expanded_bbox[0] <= p_center[0] <= expanded_bbox[2] and
                        expanded_bbox[1] <= p_center[1] <= expanded_bbox[3]):
                        nearby_persons.append(person)
                
                # Determine minimum persons for overloading based on vehicle type
                vtype = vehicle["type"]
                if vtype == "auto":
                    min_persons = CONFIG["overload_min_persons_auto"]
                elif vtype == "bike":
                    min_persons = CONFIG["overload_min_persons_bike"]
                elif vtype == "truck":
                    min_persons = CONFIG["overload_min_persons_truck"]
                elif vtype == "car":
                    min_persons = CONFIG["overload_min_persons_car"]
                else:
                    min_persons = 4
                
                if len(nearby_persons) >= min_persons:
                    all_boxes = [vehicle["bbox"]] + [p["bbox"] for p in nearby_persons]
                    x1 = min(b[0] for b in all_boxes)
                    y1 = min(b[1] for b in all_boxes)
                    x2 = max(b[2] for b in all_boxes)
                    y2 = max(b[3] for b in all_boxes)
                    
                    confidence = min(0.85, 0.4 + len(nearby_persons) * 0.1)
                    
                    violations.append({
                        "type": "overloading",
                        "bbox": [x1, y1, x2, y2],
                        "confidence": confidence,
                        "count": len(nearby_persons),
                        "vehicle_type": vtype,
                        "message": f"Overloading detected - {len(nearby_persons)} persons in {vtype} (limit exceeded)",
                        "fine_amount": 5000,
                        "detection_method": "counting"
                    })
    
    # ===== METHOD 3: Crowd density check in vehicle regions =====
    # Check if any large vehicle has very high person density
    for vehicle in vehicles:
        if vehicle["type"] in ["truck", "bus"] and vehicle["confidence"] > 0.3:
            vb = vehicle["bbox"]
            vehicle_area = bbox_area(vb)
            
            if vehicle_area > CONFIG["min_vehicle_area"]:
                # Count persons inside this vehicle
                persons_inside = 0
                for person in person_dets if 'person_dets' in locals() else []:
                    p_center = bbox_center(person["bbox"])
                    if (vb[0] <= p_center[0] <= vb[2] and 
                        vb[1] <= p_center[1] <= vb[3]):
                        persons_inside += 1
                
                # Density check: many persons in vehicle area
                if persons_inside >= 4:
                    density = persons_inside / (vehicle_area / 10000)  # per 10000 sq pixels
                    if density > 0.5:  # High density
                        already_exists = any(
                            bbox_iou(vehicle["bbox"], v["bbox"]) > 0.4 
                            for v in violations
                        )
                        if not already_exists:
                            violations.append({
                                "type": "overloading",
                                "bbox": vehicle["bbox"],
                                "confidence": min(0.8, 0.5 + density),
                                "count": persons_inside,
                                "vehicle_type": vehicle["type"],
                                "message": f"High person density in {vehicle['type']} - possible overloading",
                                "fine_amount": 5000,
                                "detection_method": "density"
                            })
    
    # Merge overlapping detections
    violations = merge_nearby_detections(
        violations,
        CONFIG["overload_iou_threshold"],
        CONFIG["overload_merge_distance"]
    )
    
    # Limit to reasonable number per frame
    if len(violations) > 5:
        violations = sorted(violations, key=lambda x: x["confidence"], reverse=True)[:5]
    
    return violations


def detect_triple_riding(frame: np.ndarray, bike_boxes: List[BBox]) -> List[Dict]:
    """Detect triple riding using model and person counting."""
    triple_violations = []
    
    # Method 1: Triple model detection
    triple_detections = predict_boxes(triple_model, frame, CONFIG["triple_conf"])
    
    for det in triple_detections:
        triple_violations.append({
            "type": "triple_riding",
            "bbox": det["bbox"],
            "confidence": det["confidence"],
            "count": 3,
            "message": "Triple riding detected",
            "fine_amount": 2000,
            "detection_method": "model"
        })
    
    # Method 2: Person counting near bikes
    if CONFIG["triple_use_counting"] and bike_boxes:
        person_detections = predict_boxes(vehicle_model, frame, 0.10,
                                          class_filter=["person", "rider", "pedestrian"])
        
        for bike_box in bike_boxes:
            already_detected = False
            for tv in triple_violations:
                if tv.get("detection_method") == "model":
                    if bbox_iou(bike_box, tv["bbox"]) > 0.2 or bbox_distance(bike_box, tv["bbox"]) < 200:
                        already_detected = True
                        break
            
            if already_detected:
                continue
            
            bike_center = bbox_center(bike_box)
            nearby_persons = []
            
            for person in person_detections:
                person_center = bbox_center(person["bbox"])
                dist = float(np.hypot(bike_center[0]-person_center[0], 
                                     bike_center[1]-person_center[1]))
                if dist < CONFIG["triple_proximity_threshold"]:
                    nearby_persons.append(person)
            
            if len(nearby_persons) >= CONFIG["triple_person_count"]:
                all_boxes = [bike_box] + [p["bbox"] for p in nearby_persons]
                x1 = min(b[0] for b in all_boxes)
                y1 = min(b[1] for b in all_boxes)
                x2 = max(b[2] for b in all_boxes)
                y2 = max(b[3] for b in all_boxes)
                
                confidence = min(0.7, 0.5 + len(nearby_persons) * 0.1)
                
                triple_violations.append({
                    "type": "triple_riding",
                    "bbox": [x1, y1, x2, y2],
                    "confidence": confidence,
                    "count": len(nearby_persons),
                    "message": f"Triple riding detected ({len(nearby_persons)} persons on bike)",
                    "fine_amount": 2000,
                    "detection_method": "counting"
                })
    
    triple_violations = merge_nearby_detections(
        triple_violations,
        CONFIG["triple_iou_threshold"],
        CONFIG["triple_merge_distance"]
    )
    
    if len(triple_violations) > 3:
        triple_violations = sorted(triple_violations, key=lambda x: x["confidence"], reverse=True)[:3]
    
    return triple_violations


def analyze_frame(frame: np.ndarray, verbose: bool = False) -> Dict[str, Any]:
    """Complete frame analysis - detects all violation types."""
    frame = resize_frame(frame)
    h, w = frame.shape[:2]
    
    # ===== 1. VEHICLE DETECTION =====
    vehicles = []
    bike_boxes = []
    
    vehicle_dets = predict_boxes(vehicle_model, frame, CONFIG["vehicle_conf"], verbose=verbose)
    
    for det in vehicle_dets:
        name = det["class_name"]
        
        if contains_any(name, ["motor","bike","cycle","scooter","bicycle","motorcycle"]):
            vtype = "bike"
            bike_boxes.append(det["bbox"])
        elif contains_any(name, ["auto","rickshaw","tuktuk"]):
            vtype = "auto"
        elif contains_any(name, ["truck","lorry","pickup"]):
            vtype = "truck"
        elif contains_any(name, ["bus","minibus"]):
            vtype = "bus"
        elif contains_any(name, ["car","suv","sedan","hatchback","jeep"]):
            vtype = "car"
        elif contains_any(name, ["person","rider","pedestrian","people"]):
            vtype = "person"
        else:
            vtype = "vehicle"
        
        vehicles.append({
            "type": vtype,
            "bbox": det["bbox"],
            "confidence": det["confidence"],
            "class_name": name
        })
    
    if verbose:
        print(f"   🚗 Vehicles: {len(vehicles)} | "
              f"🏍️ Bikes: {len(bike_boxes)} | "
              f"🛺 Autos: {sum(1 for v in vehicles if v['type']=='auto')} | "
              f"🚛 Trucks: {sum(1 for v in vehicles if v['type']=='truck')}")
    
    # ===== 2. PLATE DETECTION =====
    plates = []
    for det in predict_boxes(plate_model, frame, CONFIG["plate_conf"]):
        text = read_plate_text(frame, det["bbox"])
        plates.append({"bbox": det["bbox"], "confidence": det["confidence"], "text": text})
    
    # Fallback plate detection
    if not plates:
        for region in [
            [int(w*0.05), int(h*0.5), int(w*0.95), int(h*0.75)],
            [int(w*0.1), int(h*0.4), int(w*0.9), int(h*0.8)]
        ]:
            text = read_plate_text(frame, region)
            if text:
                plates.append({"bbox": region, "confidence": 0.5, "text": text})
                break
    
    # ===== 3. HELMET DETECTION =====
    helmet_violations = []
    for det in predict_boxes(helmet_model, frame, CONFIG["helmet_conf"]):
        if contains_any(det["class_name"], ["no_helmet","no-helmet","without","withouthelmet","nohelmet"]):
            is_dup = False
            for existing in helmet_violations:
                if bbox_iou(det["bbox"], existing["bbox"]) > 0.5:
                    is_dup = True
                    if det["confidence"] > existing["confidence"]:
                        existing["confidence"] = det["confidence"]
                    break
            if not is_dup:
                helmet_violations.append({
                    "type": "no_helmet",
                    "bbox": det["bbox"],
                    "confidence": det["confidence"],
                    "message": "No helmet detected",
                    "fine_amount": 1000
                })
    
    # ===== 4. TRIPLE RIDING =====
    triple_violations = detect_triple_riding(frame, bike_boxes)
    
    if verbose and triple_violations:
        print(f"   ⚠️  Triple riding: {len(triple_violations)} instance(s)")
        for tv in triple_violations:
            print(f"      Method: {tv.get('detection_method', '?')} | "
                  f"Conf: {tv['confidence']:.3f} | "
                  f"Count: {tv.get('count', '?')}")
    
    # ===== 5. OVERLOADING (ENHANCED) =====
    overload_violations = detect_overloading(frame, vehicles)
    
    if verbose and overload_violations:
        print(f"   🚛 Overloading: {len(overload_violations)} instance(s)")
        for ov in overload_violations:
            print(f"      Method: {ov.get('detection_method', '?')} | "
                  f"Vehicle: {ov.get('vehicle_type', '?')} | "
                  f"Conf: {ov['confidence']:.3f} | "
                  f"Count: {ov.get('count', '?')}")
    
    total = len(helmet_violations) + len(triple_violations) + len(overload_violations)
    
    return {
        "frame_shape": [w, h],
        "vehicles": vehicles,
        "bike_count": len(bike_boxes),
        "plates": plates,
        "violations": {
            "no_helmet": helmet_violations,
            "triple_riding": triple_violations,
            "overloading": overload_violations
        },
        "violation_counts": {
            "no_helmet": len(helmet_violations),
            "triple_riding": len(triple_violations),
            "overloading": len(overload_violations),
            "total": total
        },
        "total_violations": total
    }


class CCTVStreamManager:
    """Manages CCTV stream connections and processing."""
    
    def __init__(self, stream_id: str, source: str, max_duration: int = 300):
        self.stream_id = stream_id
        self.source = source
        self.max_duration = max_duration
        self.is_running = False
        self.should_stop = False
        self.reconnect_attempts = 0
        self.tracker = ViolationTracker()
        self.cap = None
        self.thread = None
        self.last_frame_result = None
        self.last_annotated_frame = None
        self.frame_count = 0
        self.error_message = None
        self.start_epoch = time.time()
    
    def start(self):
        if self.is_running:
            return False
        
        self.is_running = True
        self.should_stop = False
        self.start_epoch = time.time()
        self.thread = threading.Thread(target=self._process_stream, daemon=True)
        self.thread.start()
        return True
    
    def stop(self):
        self.should_stop = True
        self.is_running = False
        if self.cap:
            self.cap.release()
    
    def _connect_stream(self) -> bool:
        try:
            if self.cap:
                self.cap.release()
            
            # Handle both numeric (webcam) and URL sources
            if self.source.isdigit():
                source = int(self.source)
                print(f"🔌 [{self.stream_id}] Connecting to webcam {source}")
            else:
                source = self.source
                print(f"🔌 [{self.stream_id}] Connecting to: {source}")
            
            self.cap = cv2.VideoCapture(source)
            self.cap.set(cv2.CAP_PROP_BUFFERSIZE, 2)
            
            if not self.cap.isOpened():
                raise Exception("Cannot open stream")
            
            fps = self.cap.get(cv2.CAP_PROP_FPS)
            width = self.cap.get(cv2.CAP_PROP_FRAME_WIDTH)
            height = self.cap.get(cv2.CAP_PROP_FRAME_HEIGHT)
            
            print(f"✅ [{self.stream_id}] Connected: {int(width)}x{int(height)} @ {fps:.1f}fps")
            self.reconnect_attempts = 0
            return True
        except Exception as e:
            print(f"❌ [{self.stream_id}] Connection failed: {e}")
            self.reconnect_attempts += 1
            return False
    
    def _draw_annotations(self, frame: np.ndarray, result: Dict) -> np.ndarray:
        """Draw detection boxes on frame."""
        annotated = frame.copy()
        
        for v in result.get("vehicles", []):
            b = v["bbox"]
            if v["type"] in ["bike", "auto", "truck", "bus"]:
                cv2.rectangle(annotated, (b[0],b[1]), (b[2],b[3]), (0,255,0), 2)
                cv2.putText(annotated, v["type"], (b[0],b[1]-5), 
                           cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0,255,0), 1)
        
        for v in result["violations"]["no_helmet"]:
            b = v["bbox"]
            cv2.rectangle(annotated, (b[0],b[1]), (b[2],b[3]), (0,0,255), 3)
            cv2.putText(annotated, "NO HELMET", (b[0],b[1]-10), 
                       cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0,0,255), 2)
        
        for v in result["violations"]["triple_riding"]:
            b = v["bbox"]
            cv2.rectangle(annotated, (b[0],b[1]), (b[2],b[3]), (0,165,255), 2)
            cv2.putText(annotated, f"TRIPLE ({v.get('count',3)})", (b[0],b[1]-10), 
                       cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0,165,255), 2)
        
        for v in result["violations"]["overloading"]:
            b = v["bbox"]
            cv2.rectangle(annotated, (b[0],b[1]), (b[2],b[3]), (255,0,255), 2)
            cv2.putText(annotated, f"OVERLOAD ({v.get('count','?')})", (b[0],b[1]-10), 
                       cv2.FONT_HERSHEY_SIMPLEX, 0.6, (255,0,255), 2)
        
        for p in result.get("plates", []):
            b = p["bbox"]
            cv2.rectangle(annotated, (b[0],b[1]), (b[2],b[3]), (0,255,255), 1)
            if p.get("text"):
                cv2.putText(annotated, p["text"], (b[0],b[1]-5), 
                           cv2.FONT_HERSHEY_SIMPLEX, 0.4, (0,255,255), 1)
        
        counts = result.get("violation_counts", {})
        stats_text = f"H:{counts.get('no_helmet',0)} T:{counts.get('triple_riding',0)} O:{counts.get('overloading',0)}"
        cv2.putText(annotated, stats_text, (10, 30), 
                   cv2.FONT_HERSHEY_SIMPLEX, 0.7, (255,255,255), 2)
        
        return annotated
    
    def _process_stream(self):
        print(f"🚀 [{self.stream_id}] Starting CCTV processing (max {self.max_duration}s)")
        
        if not self._connect_stream():
            self.error_message = "Failed to connect to CCTV stream"
            self.is_running = False
            return
        
        frame_skip_counter = 0
        last_analysis_time = time.time()
        
        while not self.should_stop:
            # Check max duration
            if time.time() - self.start_epoch > self.max_duration:
                print(f"⏰ [{self.stream_id}] Max duration reached ({self.max_duration}s)")
                break
            
            try:
                ret, frame = self.cap.read() if self.cap else (False, None)
                
                if not ret or frame is None:
                    print(f"⚠️  [{self.stream_id}] Lost connection, reconnecting...")
                    if self.reconnect_attempts < CONFIG["cctv_max_reconnect_attempts"]:
                        time.sleep(CONFIG["cctv_reconnect_delay"])
                        if not self._connect_stream():
                            continue
                        frame_skip_counter = 0
                    else:
                        self.error_message = "Max reconnect attempts reached"
                        break
                    continue
                
                frame_skip_counter += 1
                
                # Analyze at specified interval
                current_time = time.time()
                if current_time - last_analysis_time >= CONFIG["cctv_analysis_interval"]:
                    result = analyze_frame(frame)
                    result["frame_number"] = self.frame_count
                    result["timestamp"] = datetime.now().isoformat()
                    self.last_frame_result = result
                    
                    # Generate annotated frame
                    annotated = self._draw_annotations(frame, result)
                    _, buf = cv2.imencode('.jpg', annotated, [cv2.IMWRITE_JPEG_QUALITY, 70])
                    self.last_annotated_frame = base64.b64encode(buf).decode('utf-8')
                    
                    # Track violations
                    for v in result["violations"]["no_helmet"]:
                        self.tracker.add_violation("no_helmet", v, self.frame_count)
                    for v in result["violations"]["triple_riding"]:
                        self.tracker.add_violation("triple_riding", v, self.frame_count)
                    for v in result["violations"]["overloading"]:
                        self.tracker.add_violation("overloading", v, self.frame_count)
                    
                    self.tracker.total_processed += 1
                    last_analysis_time = current_time
                
                self.frame_count += 1
                
                if self.frame_count % 50 == 0:
                    stats = self.tracker.get_stats()
                    v = stats["violations"]
                    print(f"📊 [{self.stream_id}] Frame {self.frame_count} | "
                          f"H:{v['no_helmet']} T:{v['triple_riding']} O:{v['overloading']} | "
                          f"FPS: {stats['fps']}")
                
            except Exception as e:
                print(f"❌ [{self.stream_id}] Processing error: {e}")
                if self.should_stop:
                    break
                time.sleep(1)
        
        if self.cap:
            self.cap.release()
        print(f"🛑 [{self.stream_id}] CCTV processing stopped. "
              f"Total frames: {self.frame_count}, "
              f"Violations: {self.tracker.get_total_unique()}")
    
    def get_status(self) -> Dict[str, Any]:
        stats = self.tracker.get_stats()
        elapsed = time.time() - self.start_epoch
        return {
            "stream_id": self.stream_id,
            "source": self.source,
            "is_running": self.is_running,
            "reconnect_attempts": self.reconnect_attempts,
            "error_message": self.error_message,
            "stats": stats,
            "elapsed_seconds": round(elapsed, 1),
            "max_duration": self.max_duration,
            "last_frame": {
                "total_violations": self.last_frame_result["total_violations"] if self.last_frame_result else 0,
                "timestamp": self.last_frame_result["timestamp"] if self.last_frame_result else None
            } if self.last_frame_result else None
        }
    
    def get_violations(self) -> Dict[str, Any]:
        unique = self.tracker.get_unique_violations()
        stats = self.tracker.get_stats()
        
        return {
            "stream_id": self.stream_id,
            "stats": stats,
            "violations": unique,
            "total_fine": (
                len(unique["no_helmet"]) * 1000 +
                len(unique["triple_riding"]) * 2000 +
                len(unique["overloading"]) * 5000
            )
        }
    
    def get_preview_frame(self) -> Optional[str]:
        return self.last_annotated_frame


# ==================== API ENDPOINTS ====================

@app.get("/")
async def root():
    return {
        "service": "TraffiX AI Detection v6.0",
        "models_loaded": models_loaded,
        "ocr_available": ocr_reader is not None,
        "status": "running",
        "features": [
            "CCTV live stream",
            "Enhanced overloading detection",
            "Triple riding detection",
            "Helmet violation detection"
        ]
    }


@app.get("/health")
async def health():
    return {
        "status": "healthy",
        "models": models_loaded,
        "ocr": ocr_reader is not None,
        "active_streams": len(active_cctv_streams),
        "timestamp": datetime.now().isoformat()
    }


@app.post("/cctv/start")
async def start_cctv(request: Dict[str, Any]):
    stream_id = request.get("stream_id")
    source = request.get("source") or request.get("rtsp_url")  # Support both parameter names
    max_duration = request.get("max_duration", 300)  # Default 5 minutes
    
    if not stream_id or not source:
        raise HTTPException(status_code=400, detail="stream_id and source are required")
    
    with cctv_lock:
        if stream_id in active_cctv_streams:
            existing = active_cctv_streams[stream_id]
            if existing.is_running:
                return {
                    "success": False,
                    "message": f"Stream '{stream_id}' is already running",
                    "status": existing.get_status()
                }
        
        manager = CCTVStreamManager(stream_id, str(source), max_duration)
        if manager.start():
            active_cctv_streams[stream_id] = manager
            return {
                "success": True,
                "message": f"CCTV stream '{stream_id}' started",
                "stream_id": stream_id,
                "max_duration": max_duration,
                "status": manager.get_status()
            }
        else:
            return {
                "success": False,
                "message": f"Failed to start stream '{stream_id}'",
            }


@app.post("/cctv/stop")
async def stop_cctv(request: Dict[str, Any]):
    stream_id = request.get("stream_id")
    
    if not stream_id:
        raise HTTPException(status_code=400, detail="stream_id is required")
    
    with cctv_lock:
        if stream_id not in active_cctv_streams:
            return {
                "success": False,
                "message": f"Stream '{stream_id}' not found"
            }
        
        manager = active_cctv_streams[stream_id]
        violations = manager.get_violations()
        manager.stop()
        del active_cctv_streams[stream_id]
        
        return {
            "success": True,
            "message": f"CCTV stream '{stream_id}' stopped",
            "final_report": violations
        }


@app.get("/cctv/status")
async def cctv_status(stream_id: Optional[str] = None):
    with cctv_lock:
        if stream_id:
            if stream_id not in active_cctv_streams:
                raise HTTPException(status_code=404, detail=f"Stream '{stream_id}' not found")
            return active_cctv_streams[stream_id].get_status()
        
        return {
            "active_streams": len(active_cctv_streams),
            "streams": {sid: mgr.get_status() for sid, mgr in active_cctv_streams.items()}
        }


@app.get("/cctv/violations")
async def cctv_violations(stream_id: Optional[str] = None):
    with cctv_lock:
        if stream_id:
            if stream_id not in active_cctv_streams:
                raise HTTPException(status_code=404, detail=f"Stream '{stream_id}' not found")
            return active_cctv_streams[stream_id].get_violations()
        
        all_violations = {}
        for sid, mgr in active_cctv_streams.items():
            all_violations[sid] = mgr.get_violations()
        
        return {
            "total_active_streams": len(active_cctv_streams),
            "streams": all_violations
        }


@app.get("/cctv/preview")
async def cctv_preview(stream_id: str):
    with cctv_lock:
        if stream_id not in active_cctv_streams:
            raise HTTPException(status_code=404, detail=f"Stream '{stream_id}' not found")
        
        frame_b64 = active_cctv_streams[stream_id].get_preview_frame()
        if frame_b64:
            return {"stream_id": stream_id, "image": frame_b64}
        else:
            return {"stream_id": stream_id, "image": None, "message": "No frame available yet"}


@app.websocket("/cctv/live/{stream_id}")
async def cctv_websocket(websocket: WebSocket, stream_id: str):
    await websocket.accept()
    
    try:
        while True:
            with cctv_lock:
                if stream_id not in active_cctv_streams:
                    await websocket.send_json({"type": "error", "message": f"Stream '{stream_id}' not active"})
                    break
                
                manager = active_cctv_streams[stream_id]
                if not manager.is_running:
                    await websocket.send_json({"type": "stopped", "message": "Stream has stopped"})
                    break
                
                status = manager.get_status()
                if manager.last_frame_result:
                    status["latest_detection"] = {
                        "violations": manager.last_frame_result.get("violations", {}),
                        "violation_counts": manager.last_frame_result.get("violation_counts", {}),
                        "total_violations": manager.last_frame_result.get("total_violations", 0),
                        "timestamp": manager.last_frame_result.get("timestamp")
                    }
                
                await websocket.send_json({"type": "status", "data": status})
            
            await asyncio.sleep(1)
    
    except WebSocketDisconnect:
        print(f"🔌 WebSocket client disconnected from {stream_id}")
    except Exception as e:
        print(f"❌ WebSocket error for {stream_id}: {e}")


@app.post("/detect")
async def detect(file: UploadFile = File(...)):
    """Detect violations in uploaded image or video file."""
    contents = await file.read()
    if not contents:
        raise HTTPException(status_code=400, detail="Empty upload")

    filename = (file.filename or "upload").lower()
    is_video = filename.endswith((".mp4", ".avi", ".mov", ".mkv", ".webm"))

    print(f"\n{'='*60}")
    print(f"📤 {filename} | {len(contents)/1024/1024:.1f}MB | {'🎬 Video' if is_video else '📷 Image'}")
    print(f"{'='*60}")

    started = time.perf_counter()
    
    try:
        if is_video:
            result = process_video_file(contents, filename)
        else:
            result = process_image_file(contents)
        
        result["processing_time"] = round(time.perf_counter() - started, 2)
        result["filename"] = filename
        return result
        
    except HTTPException:
        raise
    except Exception as e:
        print(f"❌ Error: {e}")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))


def process_video_file(contents: bytes, filename: str) -> Dict[str, Any]:
    """Process uploaded video file."""
    suffix = os.path.splitext(filename)[1] or ".mp4"
    
    with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
        tmp.write(contents)
        tmp_path = tmp.name
    
    try:
        cap = cv2.VideoCapture(tmp_path)
        if not cap.isOpened():
            raise HTTPException(status_code=400, detail="Cannot open video")
        
        total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
        fps = cap.get(cv2.CAP_PROP_FPS)
        duration = total_frames / fps if fps > 0 else 0
        
        tracker = ViolationTracker()
        frame_index = 0
        processed_count = 0
        all_plates = []
        
        print(f"   📊 {total_frames} frames @ {fps:.1f}fps ({duration:.1f}s)")
        print(f"   🔍 Analyzing every {CONFIG['frame_stride']} frames (max {CONFIG['max_video_frames']})")
        
        while True:
            success, frame = cap.read()
            if not success:
                break
            
            frame_index += 1
            if frame_index % CONFIG["frame_stride"] != 0:
                continue
            
            verbose = (processed_count == 0)
            result = analyze_frame(frame, verbose=verbose)
            
            for v in result["violations"]["no_helmet"]:
                tracker.add_violation("no_helmet", v, frame_index)
            for v in result["violations"]["triple_riding"]:
                tracker.add_violation("triple_riding", v, frame_index)
            for v in result["violations"]["overloading"]:
                tracker.add_violation("overloading", v, frame_index)
            
            # Collect plates
            for p in result["plates"]:
                if p.get("text") and p["text"] not in [ep.get("text") for ep in all_plates]:
                    p["frame_number"] = frame_index
                    all_plates.append(p)
            
            tracker.total_processed += 1
            processed_count += 1
            
            if processed_count % 10 == 0:
                stats = tracker.get_stats()
                v = stats["violations"]
                print(f"   📍 Frame {frame_index}/{total_frames} | "
                      f"H:{v['no_helmet']} T:{v['triple_riding']} O:{v['overloading']}")
            
            if processed_count >= CONFIG["max_video_frames"]:
                print(f"   ⚠️  Reached max analysis frames ({CONFIG['max_video_frames']})")
                break
        
        cap.release()
        
        unique_violations = tracker.get_unique_violations()
        stats = tracker.get_stats()
        v = stats["violations"]
        
        print(f"\n✅ Video Complete!")
        print(f"   Helmet: {v['no_helmet']} | Triple: {v['triple_riding']} | Overload: {v['overloading']}")
        print(f"   Total Fine: ₹{tracker.get_total_unique() * 1000:,}")
        
        return convert_numpy({
            "success": True,
            "media_type": "video",
            "video_info": {
                "total_frames": total_frames,
                "frames_analyzed": processed_count,
                "fps": round(fps, 2),
                "duration_seconds": round(duration, 1)
            },
            "violations": unique_violations,
            "violation_counts": {
                "no_helmet": v["no_helmet"],
                "triple_riding": v["triple_riding"],
                "overloading": v["overloading"],
                "total": tracker.get_total_unique()
            },
            "plates": all_plates[:20],
            "total_fine": (
                v["no_helmet"] * 1000 +
                v["triple_riding"] * 2000 +
                v["overloading"] * 5000
            ),
            "detection_messages": generate_messages(v)
        })
    finally:
        if os.path.exists(tmp_path):
            os.remove(tmp_path)


def process_image_file(contents: bytes) -> Dict[str, Any]:
    """Process uploaded image file."""
    arr = np.frombuffer(contents, dtype=np.uint8)
    frame = cv2.imdecode(arr, cv2.IMREAD_COLOR)
    if frame is None:
        raise HTTPException(status_code=400, detail="Cannot decode image")
    
    print(f"   📐 {frame.shape[1]}x{frame.shape[0]} pixels")
    
    result = analyze_frame(frame, verbose=True)
    counts = result["violation_counts"]
    
    # Draw annotated image
    annotated = frame.copy()
    
    for v in result["vehicles"]:
        if v["type"] in ["bike", "auto", "truck", "bus"]:
            b = v["bbox"]
            cv2.rectangle(annotated, (b[0],b[1]), (b[2],b[3]), (0,255,0), 2)
            cv2.putText(annotated, v["type"], (b[0],b[1]-5), 
                       cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0,255,0), 1)
    
    for p in result["plates"]:
        b = p["bbox"]
        cv2.rectangle(annotated, (b[0],b[1]), (b[2],b[3]), (0,255,255), 2)
        if p.get("text"):
            cv2.putText(annotated, p["text"], (b[0],b[1]-5), 
                       cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0,255,255), 1)
    
    for v in result["violations"]["no_helmet"]:
        b = v["bbox"]
        cv2.rectangle(annotated, (b[0],b[1]), (b[2],b[3]), (0,0,255), 3)
        cv2.putText(annotated, "NO HELMET!", (b[0],b[1]-10), 
                   cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0,0,255), 2)
    
    for v in result["violations"]["triple_riding"]:
        b = v["bbox"]
        cv2.rectangle(annotated, (b[0],b[1]), (b[2],b[3]), (0,165,255), 2)
        label = f"TRIPLE ({v.get('count',3)}p)"
        cv2.putText(annotated, label, (b[0],b[1]-10), 
                   cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0,165,255), 2)
    
    for v in result["violations"]["overloading"]:
        b = v["bbox"]
        cv2.rectangle(annotated, (b[0],b[1]), (b[2],b[3]), (255,0,255), 2)
        label = f"OVERLOAD ({v.get('count','?')}p)"
        cv2.putText(annotated, label, (b[0],b[1]-10), 
                   cv2.FONT_HERSHEY_SIMPLEX, 0.6, (255,0,255), 2)
    
    # Info overlay
    overlay_text = f"H:{counts['no_helmet']} T:{counts['triple_riding']} O:{counts['overloading']}"
    cv2.putText(annotated, overlay_text, (10, 30), 
               cv2.FONT_HERSHEY_SIMPLEX, 0.8, (255,255,255), 2)
    
    _, buf = cv2.imencode('.jpg', annotated, [cv2.IMWRITE_JPEG_QUALITY, 85])
    annotated_b64 = base64.b64encode(buf).decode('utf-8')
    
    total_fine = (counts["no_helmet"] * 1000 + 
                  counts["triple_riding"] * 2000 + 
                  counts["overloading"] * 5000)
    
    print(f"\n✅ Image Complete!")
    print(f"   Helmet: {counts['no_helmet']} | Triple: {counts['triple_riding']} | Overload: {counts['overloading']}")
    print(f"   Total Fine: ₹{total_fine:,}")
    
    return convert_numpy({
        "success": True,
        "media_type": "image",
        "image_size": f"{frame.shape[1]}x{frame.shape[0]}",
        "violations": result["violations"],
        "violation_counts": counts,
        "vehicles_detected": len(result["vehicles"]),
        "plates": result["plates"],
        "total_fine": total_fine,
        "annotated_image": annotated_b64,
        "detection_messages": generate_messages(counts)
    })


def generate_messages(counts: Dict[str, int]) -> List[str]:
    """Generate human-readable detection messages."""
    messages = []
    total = counts.get("total", 0) or (
        counts.get("no_helmet", 0) + 
        counts.get("triple_riding", 0) + 
        counts.get("overloading", 0)
    )
    
    if total > 0:
        messages.append(f"🚨 Found {total} traffic violation(s)")
        if counts.get("no_helmet", 0) > 0:
            messages.append(f"🪖 {counts['no_helmet']} No Helmet - ₹1,000 each")
        if counts.get("triple_riding", 0) > 0:
            messages.append(f"🏍️ {counts['triple_riding']} Triple Riding - ₹2,000 each")
        if counts.get("overloading", 0) > 0:
            messages.append(f"🚛 {counts['overloading']} Overloading - ₹5,000 each")
    else:
        messages.append("✅ No violations detected")
    
    return messages


@app.get("/cctv/dashboard", response_class=HTMLResponse)
async def cctv_dashboard():
    """Simple HTML dashboard for CCTV monitoring."""
    return """
    <!DOCTYPE html>
    <html>
    <head>
        <title>TraffiX CCTV Dashboard</title>
        <style>
            body { font-family: Arial; margin: 20px; background: #1a1a2e; color: #eee; }
            .container { max-width: 1200px; margin: 0 auto; }
            .card { background: #16213e; padding: 20px; margin: 10px 0; border-radius: 10px; }
            .btn { padding: 10px 20px; border: none; border-radius: 5px; cursor: pointer; margin: 5px; }
            .btn-start { background: #0f3460; color: white; }
            .btn-stop { background: #e94560; color: white; }
            .btn-refresh { background: #533483; color: white; }
            input, select { padding: 10px; width: 300px; margin: 5px; border-radius: 5px; border: 1px solid #333; background: #0a0a1a; color: #eee; }
            h2 { color: #e94560; }
            .stream-status { display: flex; justify-content: space-between; align-items: center; }
            .active { color: #00ff88; }
            .inactive { color: #ff4444; }
            pre { background: #0a0a1a; padding: 10px; border-radius: 5px; overflow-x: auto; font-size: 12px; }
            .preview-img { max-width: 100%; border-radius: 8px; border: 2px solid #333; }
        </style>
    </head>
    <body>
        <div class="container">
            <h1>🚦 TraffiX CCTV Monitoring Dashboard</h1>
            
            <div class="card">
                <h2>Start CCTV Stream</h2>
                <input type="text" id="streamId" placeholder="Stream ID (e.g., camera1)" value="camera1">
                <input type="text" id="source" placeholder="Camera source (0 for webcam, or RTSP URL)" value="0">
                <select id="duration">
                    <option value="60">1 minute</option>
                    <option value="120">2 minutes</option>
                    <option value="180">3 minutes</option>
                    <option value="240">4 minutes</option>
                    <option value="300" selected>5 minutes</option>
                </select>
                <button class="btn btn-start" onclick="startStream()">▶ Start Stream</button>
            </div>
            
            <div class="card">
                <h2>Active Streams</h2>
                <button class="btn btn-refresh" onclick="refreshStatus()">🔄 Refresh</button>
                <div id="streamsList">Loading...</div>
            </div>
            
            <div class="card" id="violationsCard" style="display:none;">
                <h2>Violations</h2>
                <div id="violationsData"></div>
            </div>
            
            <div class="card" id="previewCard" style="display:none;">
                <h2>Live Preview</h2>
                <img id="previewImg" class="preview-img" alt="Live preview">
            </div>
        </div>
        
        <script>
            let previewInterval = null;
            
            async function startStream() {
                const streamId = document.getElementById('streamId').value;
                const source = document.getElementById('source').value;
                const duration = parseInt(document.getElementById('duration').value);
                
                if (!streamId || !source) {
                    alert('Please fill all fields');
                    return;
                }
                
                const response = await fetch('/cctv/start', {
                    method: 'POST',
                    headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify({
                        stream_id: streamId,
                        source: source,
                        max_duration: duration
                    })
                });
                
                const data = await response.json();
                alert(data.message);
                refreshStatus();
                
                // Start preview updates
                if (data.success) {
                    document.getElementById('previewCard').style.display = 'block';
                    previewInterval = setInterval(() => updatePreview(streamId), 1000);
                }
            }
            
            async function updatePreview(streamId) {
                try {
                    const response = await fetch(`/cctv/preview?stream_id=${streamId}`);
                    const data = await response.json();
                    if (data.image) {
                        document.getElementById('previewImg').src = 'data:image/jpeg;base64,' + data.image;
                    }
                } catch(e) {}
            }
            
            async function stopStream(streamId) {
                const response = await fetch('/cctv/stop', {
                    method: 'POST',
                    headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify({stream_id: streamId})
                });
                
                const data = await response.json();
                alert(data.message);
                if (previewInterval) clearInterval(previewInterval);
                document.getElementById('previewCard').style.display = 'none';
                refreshStatus();
                
                // Show final violations
                if (data.final_report) {
                    document.getElementById('violationsCard').style.display = 'block';
                    document.getElementById('violationsData').innerHTML = 
                        '<pre>' + JSON.stringify(data.final_report, null, 2) + '</pre>';
                }
            }
            
            async function getViolations(streamId) {
                const response = await fetch('/cctv/violations?stream_id=' + streamId);
                const data = await response.json();
                document.getElementById('violationsCard').style.display = 'block';
                document.getElementById('violationsData').innerHTML = 
                    '<pre>' + JSON.stringify(data, null, 2) + '</pre>';
            }
            
            async function refreshStatus() {
                const response = await fetch('/cctv/status');
                const data = await response.json();
                
                let html = '';
                if (data.active_streams === 0) {
                    html = '<p>No active streams</p>';
                } else {
                    for (const [id, status] of Object.entries(data.streams)) {
                        const v = status.stats?.violations || {};
                        html += `
                            <div class="card">
                                <div class="stream-status">
                                    <div>
                                        <strong>${id}</strong> - 
                                        <span class="${status.is_running ? 'active' : 'inactive'}">
                                            ${status.is_running ? '● Running' : '○ Stopped'}
                                        </span>
                                        <br><small>Source: ${status.source}</small>
                                        <br><small>H:${v.no_helmet||0} T:${v.triple_riding||0} O:${v.overloading||0} | 
                                        Frames: ${status.stats?.total_processed||0} | 
                                        Time: ${status.elapsed_seconds||0}s</small>
                                    </div>
                                    <div>
                                        <button class="btn btn-refresh" onclick="getViolations('${id}')">📊</button>
                                        ${status.is_running ? 
                                            `<button class="btn btn-stop" onclick="stopStream('${id}')">⏹ Stop</button>` : ''}
                                    </div>
                                </div>
                            </div>
                        `;
                    }
                }
                
                document.getElementById('streamsList').innerHTML = html;
            }
            
            setInterval(refreshStatus, 3000);
            refreshStatus();
        </script>
    </body>
    </html>
    """


if __name__ == "__main__":
    port = int(os.getenv("AI_MODEL_PORT", 8000))
    print("\n" + "="*60)
    print("🚀 TraffiX AI Detection v6.0 - Enhanced Overloading")
    print("="*60)
    print(f"📍 API: http://0.0.0.0:{port}")
    print(f"📊 Dashboard: http://localhost:{port}/cctv/dashboard")
    print(f"📚 API Docs: http://localhost:{port}/docs")
    print(f"💚 Health: http://localhost:{port}/health")
    print(f"✅ Models: {models_loaded}/5 | OCR: {'Yes' if ocr_reader else 'No'}")
    print(f"🚛 Overload: Model + Counting + Density | "
          f"Auto>{CONFIG['overload_min_persons_auto']}p | "
          f"Truck>{CONFIG['overload_min_persons_truck']}p")
    print(f"🏍️ Triple: Model + Counting | >{CONFIG['triple_person_count']} persons")
    print(f"📹 CCTV: Every {CONFIG['cctv_analysis_interval']}s | Max {CONFIG['cctv_max_reconnect_attempts']} reconnects")
    print("="*60 + "\n")
    uvicorn.run(app, host="0.0.0.0", port=port, reload=False)