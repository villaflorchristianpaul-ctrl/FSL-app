import base64
import json
import os
import threading
from collections import deque

import cv2
import mediapipe as mp
import numpy as np
import tensorflow as tf
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from passlib.context import CryptContext
from pydantic import BaseModel
from supabase import Client, create_client
import gdown

MODEL_PATH = "/app/models/signbridge_model_v2.h5"

if not os.path.exists(MODEL_PATH):
    os.makedirs("/app/models", exist_ok=True)
    gdown.download(
        "https://drive.google.com/uc?id=1zh5R0GXlR96OUSOw-ujnCrl_Zpl2Qrl4",
        MODEL_PATH,
        quiet=False
    )

try:
    from dotenv import load_dotenv
except ImportError:
    load_dotenv = None

from sign_config import (
    FEATURE_SIZE,
    LABELS_PATH as CONFIG_LABELS_PATH,
    MODEL_PATH as CONFIG_MODEL_PATH,
    SEQUENCE_LENGTH as CONFIG_SEQUENCE_LENGTH,
    SIGNS as CONFIG_SIGNS,
)
from sign_features import (
    KeypointSmoother,
    calculate_motion_magnitude,
    classify_gesture_type,
    extract_keypoints,
    hand_detection_confidence,
    has_detected_hand,
    normalize_sequence_length,
)

app = FastAPI()

if load_dotenv is not None:
    load_dotenv(os.path.join(os.path.dirname(__file__), ".env"))

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# ---- Config ----
BASE_DIR = os.path.dirname(__file__)
DEFAULT_MODEL_DIRS = [
    os.path.join(BASE_DIR, "models"),
    os.path.join(BASE_DIR, "signbridge-plus"),
    os.path.join(BASE_DIR, "..", "signbridge-plus"),
    os.path.join(BASE_DIR, "..", "..", "signbridge-plus"),
]


def resolve_model_dir():
    env_model_dir = os.getenv("SIGNBRIDGE_MODEL_DIR")
    candidates = [env_model_dir] if env_model_dir else []
    candidates.extend(DEFAULT_MODEL_DIRS)

    def normalize_candidate(path):
        if os.path.isabs(path):
            return os.path.abspath(os.path.normpath(path))
        return os.path.abspath(os.path.normpath(os.path.join(BASE_DIR, path)))

    for candidate in candidates:
        if not candidate:
            continue
        model_dir = normalize_candidate(candidate)
        if os.path.exists(os.path.join(model_dir, CONFIG_MODEL_PATH)):
            return model_dir

    searched = "\n".join(
        f"- {normalize_candidate(path)}"
        for path in candidates
        if path
    )
    raise FileNotFoundError(
        f"Could not find {CONFIG_MODEL_PATH}. Put the model in backend/models, "
        f"a signbridge-plus folder near the project, or set SIGNBRIDGE_MODEL_DIR.\n"
        f"Searched:\n{searched}"
    )


MODEL_DIR = resolve_model_dir()
MODEL_PATH = os.path.join(MODEL_DIR, CONFIG_MODEL_PATH)
LABELS_PATH = os.path.join(MODEL_DIR, CONFIG_LABELS_PATH)

SEQUENCE_LENGTH = CONFIG_SEQUENCE_LENGTH
KEYPOINT_COUNT = FEATURE_SIZE
MIN_SEQUENCE_FRAMES = 4
MIN_HAND_DETECTION_CONFIDENCE = 0.42
MIN_TRACKING_HAND_CONFIDENCE = 0.18
TRANSLATION_THRESHOLD = 0.40
TEMPORAL_SMOOTHING = 1
MAX_IMAGE_WIDTH = 512
MAX_MISSED_HAND_FRAMES = 2
KEYPOINT_SMOOTHING_ALPHA = 0.8
TOP_K_TO_RETURN = 3
DYNAMIC_SIGN_LABELS = {"j", "z"}
QUICK_STATIC_FRAMES = 3
QUICK_STATIC_THRESHOLD = 0.48
QUICK_STATIC_DURING_MOTION_THRESHOLD = 0.62
STATIC_MOTION_THRESHOLD = 0.006
STATIC_SETTLE_FRAMES = 1
DYNAMIC_MOTION_THRESHOLD = 0.010
DYNAMIC_START_FRAMES = 2
DYNAMIC_IDLE_FRAMES = 2
MIN_DYNAMIC_FRAMES = 6
MAX_DYNAMIC_FRAMES = 36
DYNAMIC_MAX_MISSED_FRAMES = 8
DYNAMIC_TRANSLATION_THRESHOLD = 0.35

SIGNS = list(CONFIG_SIGNS)


# ---- Supabase ----
SUPABASE_URL = os.getenv("SUPABASE_URL", "https://enebhhljiuoepqumrxqf.supabase.co")
SUPABASE_KEY = os.getenv("SUPABASE_KEY", "sb_publishable_5BmmXhsbiAjxRDUcvf3GUg_oVAc6UMQ")
supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


# ---- MediaPipe ----
mp_hands = mp.solutions.hands
mp_pose = mp.solutions.pose
mp_lock = threading.Lock()
model_lock = threading.Lock()

hands = mp_hands.Hands(
    static_image_mode=False,
    max_num_hands=2,
    model_complexity=0,
    min_detection_confidence=0.6,
    min_tracking_confidence=0.6,
)
pose = mp_pose.Pose(
    static_image_mode=False,
    model_complexity=0,
    enable_segmentation=False,
    min_detection_confidence=0.5,
    min_tracking_confidence=0.5,
)


# ---- Model ----
print(f"Loading SignBridge v2 model from {MODEL_PATH}...")
model = tf.keras.models.load_model(MODEL_PATH, compile=False)

model_input_shape = model.input_shape[0] if isinstance(model.input_shape, list) else model.input_shape
if len(model_input_shape) >= 3:
    SEQUENCE_LENGTH = int(model_input_shape[1] or SEQUENCE_LENGTH)
    KEYPOINT_COUNT = int(model_input_shape[2] or KEYPOINT_COUNT)

model_output_shape = model.output_shape[0] if isinstance(model.output_shape, list) else model.output_shape
MODEL_OUTPUT_COUNT = int(model_output_shape[-1])

if os.path.exists(LABELS_PATH):
    with open(LABELS_PATH, "r", encoding="utf-8") as labels_file:
        SIGNS = json.load(labels_file)

if len(SIGNS) != MODEL_OUTPUT_COUNT:
    print(
        f"Warning: label count {len(SIGNS)} does not match model output "
        f"{MODEL_OUTPUT_COUNT}. Adjusting labels for runtime."
    )
    if len(SIGNS) > MODEL_OUTPUT_COUNT:
        SIGNS = SIGNS[:MODEL_OUTPUT_COUNT]
    else:
        SIGNS = SIGNS + [f"class_{i}" for i in range(len(SIGNS), MODEL_OUTPUT_COUNT)]

MIN_SEQUENCE_FRAMES = min(MIN_SEQUENCE_FRAMES, SEQUENCE_LENGTH)
print(f"SignBridge v2 model loaded: input=({SEQUENCE_LENGTH}, {KEYPOINT_COUNT}), labels={SIGNS}")


# ---- Sequence buffers ----
frame_sequence: deque = deque(maxlen=SEQUENCE_LENGTH)
prediction_history: deque = deque(maxlen=TEMPORAL_SMOOTHING)
dynamic_sequence = []
sequence_lock = threading.Lock()
keypoint_smoother = KeypointSmoother(alpha=KEYPOINT_SMOOTHING_ALPHA)
missed_hand_frames = 0
dynamic_active = False
dynamic_idle_frames = 0
dynamic_motion_streak = 0
stable_static_frames = 0


# ---- Pydantic models ----
class UserRegister(BaseModel):
    username: str
    email: str
    password: str


class UserLogin(BaseModel):
    email: str
    password: str


class TranslateRequest(BaseModel):
    image_base64: str
    facing: str = "front"
    include_landmarks: bool = False


# ---- Helpers ----
def decode_image(image_base64: str):
    try:
        image_data = base64.b64decode(image_base64)
        image_array = np.frombuffer(image_data, dtype=np.uint8)
        image = cv2.imdecode(image_array, cv2.IMREAD_COLOR)
        if image is None:
            raise ValueError("Invalid image data")
        return image
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Invalid image data: {e}")


def resize_for_inference(image):
    height, width = image.shape[:2]
    if width <= MAX_IMAGE_WIDTH:
        return image

    scale = MAX_IMAGE_WIDTH / width
    target_size = (MAX_IMAGE_WIDTH, max(1, int(height * scale)))
    return cv2.resize(image, target_size, interpolation=cv2.INTER_AREA)


def get_landmarks_for_drawing(hand_res, pose_res):
    result = {"hands": [], "pose": []}

    if hand_res and hand_res.multi_hand_landmarks:
        for hl in hand_res.multi_hand_landmarks:
            result["hands"].append([{"x": lm.x, "y": lm.y} for lm in hl.landmark])

    if pose_res and pose_res.pose_landmarks:
        upper_body_indices = [11, 12, 13, 14, 15, 16, 23, 24]
        lms = pose_res.pose_landmarks.landmark
        result["pose"] = [
            {"x": lms[i].x, "y": lms[i].y, "visibility": lms[i].visibility}
            for i in upper_body_indices
        ]

    return result


def build_top_predictions(prediction: np.ndarray):
    top_indices = np.argsort(prediction)[-TOP_K_TO_RETURN:][::-1]
    top = []
    for idx in top_indices:
        if idx < len(SIGNS):
            top.append({"sign": SIGNS[idx], "confidence": round(float(prediction[idx]) * 100, 1)})
    return top


def reset_dynamic_state():
    global dynamic_active, dynamic_idle_frames, dynamic_motion_streak, stable_static_frames
    dynamic_sequence.clear()
    dynamic_active = False
    dynamic_idle_frames = 0
    dynamic_motion_streak = 0
    stable_static_frames = 0


def is_dynamic_label(sign: str) -> bool:
    return sign.lower() in DYNAMIC_SIGN_LABELS


def try_quick_static_prediction(sequence_array, landmarks, motion, hand_confidence, threshold):
    if len(sequence_array) < QUICK_STATIC_FRAMES:
        return None

    try:
        normalized = normalize_sequence_length(sequence_array, target_length=SEQUENCE_LENGTH)
    except ValueError:
        return None

    if normalized.shape != (SEQUENCE_LENGTH, KEYPOINT_COUNT):
        return None

    with model_lock:
        prediction = model.predict(np.expand_dims(normalized, axis=0), verbose=0)[0]

    if len(prediction) != len(SIGNS):
        return None

    index = int(np.argmax(prediction))
    confidence = float(prediction[index])
    candidate = SIGNS[index]

    if is_dynamic_label(candidate) or confidence < threshold:
        return None

    with sequence_lock:
        prediction_history.clear()
        prediction_history.append(prediction.copy())
        reset_dynamic_state()

    return {
        "translation": candidate,
        "candidate": candidate,
        "candidate_confidence": confidence,
        "confidence": confidence,
        "buffering": False,
        "message": "OK",
        "landmarks": landmarks,
        "top_predictions": build_top_predictions(prediction),
        "gesture_type": "static",
        "motion": motion,
        "hand_confidence": hand_confidence,
        "quick_static": True,
    }


def predict_sequence(sequence_array, landmarks, motion, hand_confidence, gesture_type):
    sequence_array = normalize_sequence_length(sequence_array, target_length=SEQUENCE_LENGTH)
    if sequence_array.shape != (SEQUENCE_LENGTH, KEYPOINT_COUNT):
        with sequence_lock:
            frame_sequence.clear()
            prediction_history.clear()
            keypoint_smoother.reset()
            reset_dynamic_state()
        return empty_translate_response("Resetting sign reader", landmarks=landmarks)

    with model_lock:
        prediction = model.predict(np.expand_dims(sequence_array, axis=0), verbose=0)[0]

    if len(prediction) != len(SIGNS):
        return {
            **empty_translate_response("Model output size mismatch", landmarks=landmarks),
            "error": True,
            "model_outputs": len(prediction),
            "labels": len(SIGNS),
        }

    if gesture_type == "dynamic":
        smoothed = prediction
        threshold = DYNAMIC_TRANSLATION_THRESHOLD
    else:
        with sequence_lock:
            prediction_history.append(prediction.copy())
            smoothed = np.mean(list(prediction_history), axis=0)
        threshold = TRANSLATION_THRESHOLD

    index = int(np.argmax(smoothed))
    confidence = float(smoothed[index])
    candidate = SIGNS[index]
    translation = candidate if confidence >= threshold else ""
    top_predictions = build_top_predictions(smoothed)

    if translation:
        message = "OK"
    elif gesture_type == "dynamic":
        message = f"Try the moving sign again: {candidate}"
    else:
        message = f"Hold sign steady: {candidate}"

    if gesture_type == "dynamic":
        with sequence_lock:
            frame_sequence.clear()
            prediction_history.clear()

    return {
        "translation": translation,
        "candidate": candidate,
        "candidate_confidence": confidence,
        "confidence": confidence,
        "buffering": False,
        "message": message,
        "landmarks": landmarks,
        "top_predictions": top_predictions,
        "gesture_type": gesture_type,
        "motion": motion,
        "hand_confidence": hand_confidence,
    }


def empty_translate_response(message: str, landmarks=None, buffering=False, progress=0, total=None):
    return {
        "translation": "",
        "candidate": "",
        "confidence": 0.0,
        "buffering": buffering,
        "buffer_progress": progress,
        "buffer_total": total or MIN_SEQUENCE_FRAMES,
        "message": message,
        "landmarks": landmarks or {"hands": [], "pose": []},
        "top_predictions": [],
    }


# ---- Endpoints ----
@app.get("/model")
def get_vrm_model():
    vrm_path = os.path.join(BASE_DIR, "girl-virtual-tutor.vrm")
    if not os.path.exists(vrm_path):
        raise HTTPException(
            status_code=404,
            detail="VRM model file not found. Place girl-virtual-tutor.vrm next to main.py",
        )
    return FileResponse(
        vrm_path,
        media_type="application/octet-stream",
        filename="girl-virtual-tutor.vrm",
    )


@app.post("/translate")
def translate_image(request: TranslateRequest):
    try:
        return translate_image_frame(request)
    except HTTPException:
        raise
    except Exception as e:
        print(f"Translate frame skipped: {type(e).__name__}: {e}")
        return empty_translate_response("Frame skipped. Keep your hand visible and try again.")


def translate_image_frame(request: TranslateRequest):
    global missed_hand_frames, dynamic_active, dynamic_idle_frames, dynamic_motion_streak, stable_static_frames

    image = decode_image(request.image_base64)
    image = resize_for_inference(image)

    if request.facing.lower() == "front":
        image = cv2.flip(image, 1)

    rgb = cv2.cvtColor(image, cv2.COLOR_BGR2RGB)
    rgb.flags.writeable = False

    with mp_lock:
        hand_res = hands.process(rgb)
        pose_res = pose.process(rgb)

    landmarks = get_landmarks_for_drawing(hand_res, pose_res) if request.include_landmarks else {"hands": [], "pose": []}
    hand_confidence = hand_detection_confidence(hand_res)

    if not has_detected_hand(hand_res) or hand_confidence < MIN_TRACKING_HAND_CONFIDENCE:
        with sequence_lock:
            missed_hand_frames += 1
            capturing_dynamic = len(dynamic_sequence) > 0
            dynamic_progress = len(dynamic_sequence)
            should_predict_dynamic = (
                capturing_dynamic
                and dynamic_progress >= MIN_DYNAMIC_FRAMES
                and missed_hand_frames >= DYNAMIC_IDLE_FRAMES
            )

            if should_predict_dynamic:
                dynamic_sequence_array = np.asarray(dynamic_sequence, dtype=np.float32)
                reset_dynamic_state()
            else:
                dynamic_sequence_array = None

            if (
                not capturing_dynamic
                and missed_hand_frames >= MAX_MISSED_HAND_FRAMES
            ) or (
                capturing_dynamic
                and missed_hand_frames >= DYNAMIC_MAX_MISSED_FRAMES
            ):
                frame_sequence.clear()
                prediction_history.clear()
                keypoint_smoother.reset()
                reset_dynamic_state()
            buffered = len(frame_sequence)

        if dynamic_sequence_array is not None:
            return predict_sequence(
                dynamic_sequence_array,
                landmarks=landmarks,
                motion=0.0,
                hand_confidence=hand_confidence,
                gesture_type="dynamic",
            )

        if capturing_dynamic and missed_hand_frames < DYNAMIC_MAX_MISSED_FRAMES:
            return empty_translate_response(
                "Capturing moving sign...",
                landmarks=landmarks,
                buffering=True,
                progress=min(dynamic_progress, MIN_DYNAMIC_FRAMES),
                total=MIN_DYNAMIC_FRAMES,
            )

        return empty_translate_response(
            "Show your hand clearly in the camera",
            landmarks=landmarks,
            buffering=buffered < MIN_SEQUENCE_FRAMES,
            progress=buffered,
        )

    keypoints = extract_keypoints(hand_res, pose_res)
    if keypoints.shape[0] != KEYPOINT_COUNT:
        with sequence_lock:
            frame_sequence.clear()
            prediction_history.clear()
            keypoint_smoother.reset()
        return empty_translate_response("Resetting sign reader")

    with sequence_lock:
        missed_hand_frames = 0
        previous_keypoints = frame_sequence[-1] if frame_sequence else None
        smoothed_keypoints = keypoint_smoother.smooth(keypoints)
        motion = calculate_motion_magnitude(previous_keypoints, smoothed_keypoints)
        frame_sequence.append(smoothed_keypoints)
        buffered = len(frame_sequence)
        static_sequence_array = np.asarray(list(frame_sequence), dtype=np.float32)
        if motion <= STATIC_MOTION_THRESHOLD:
            stable_static_frames += 1
        else:
            stable_static_frames = 0

        if motion >= DYNAMIC_MOTION_THRESHOLD:
            if dynamic_motion_streak == 0 and not dynamic_active:
                dynamic_sequence.clear()
            dynamic_motion_streak += 1
            dynamic_idle_frames = 0
            dynamic_sequence.append(smoothed_keypoints.copy())
            if dynamic_motion_streak >= DYNAMIC_START_FRAMES:
                dynamic_active = True
        else:
            dynamic_motion_streak = 0
            if dynamic_active:
                dynamic_idle_frames += 1
                dynamic_sequence.append(smoothed_keypoints.copy())
            else:
                dynamic_sequence.clear()

        dynamic_ready = (
            dynamic_active
            and len(dynamic_sequence) >= MIN_DYNAMIC_FRAMES
            and (
                dynamic_idle_frames >= DYNAMIC_IDLE_FRAMES
                or len(dynamic_sequence) >= MAX_DYNAMIC_FRAMES
            )
        )
        dynamic_progress = len(dynamic_sequence)
        if dynamic_ready:
            dynamic_sequence_array = np.asarray(dynamic_sequence, dtype=np.float32)
            reset_dynamic_state()
        else:
            dynamic_sequence_array = None

        can_try_quick_static = (
            stable_static_frames >= STATIC_SETTLE_FRAMES
            and buffered >= QUICK_STATIC_FRAMES
            and hand_confidence >= MIN_HAND_DETECTION_CONFIDENCE
        )
        quick_static_threshold = (
            QUICK_STATIC_DURING_MOTION_THRESHOLD
            if dynamic_active
            else QUICK_STATIC_THRESHOLD
        )

    if dynamic_sequence_array is not None:
        return predict_sequence(
            dynamic_sequence_array,
            landmarks=landmarks,
            motion=motion,
            hand_confidence=hand_confidence,
            gesture_type="dynamic",
        )

    if can_try_quick_static:
        quick_static = try_quick_static_prediction(
            static_sequence_array,
            landmarks=landmarks,
            motion=motion,
            hand_confidence=hand_confidence,
            threshold=quick_static_threshold,
        )
        if quick_static is not None:
            return quick_static

    if dynamic_active:
        return empty_translate_response(
            "Capturing moving sign...",
            landmarks=landmarks,
            buffering=True,
            progress=min(dynamic_progress, MIN_DYNAMIC_FRAMES),
            total=MIN_DYNAMIC_FRAMES,
        )

    if buffered < MIN_SEQUENCE_FRAMES:
        return empty_translate_response(
            f"Reading sign ({buffered}/{MIN_SEQUENCE_FRAMES})",
            landmarks=landmarks,
            buffering=True,
            progress=buffered,
        )

    return predict_sequence(
        static_sequence_array,
        landmarks=landmarks,
        motion=motion,
        hand_confidence=hand_confidence,
        gesture_type=classify_gesture_type(static_sequence_array),
    )


@app.post("/reset-sequence")
def reset_sequence():
    global missed_hand_frames
    with sequence_lock:
        frame_sequence.clear()
        prediction_history.clear()
        keypoint_smoother.reset()
        reset_dynamic_state()
        missed_hand_frames = 0
    return {"status": "reset"}


@app.post("/register")
def register_user(user: UserRegister):
    if len(user.password.encode("utf-8")) > 72:
        raise HTTPException(status_code=400, detail="Password must be 72 characters or less")

    existing = supabase.table("users").select("email").eq("email", user.email).execute()
    if existing.data:
        raise HTTPException(status_code=400, detail="Email already registered")

    hashed = pwd_context.hash(user.password)
    supabase.table("users").insert({
        "username": user.username,
        "email": user.email,
        "password_hash": hashed,
    }).execute()

    return {"message": "User registered successfully"}


@app.post("/login")
def login_user(user: UserLogin):
    result = supabase.table("users").select("*").eq("email", user.email).execute()
    if not result.data:
        raise HTTPException(status_code=401, detail="Invalid email or password")

    db_user = result.data[0]
    if not pwd_context.verify(user.password, db_user["password_hash"]):
        raise HTTPException(status_code=401, detail="Invalid email or password")

    return {"message": "Login successful", "username": db_user["username"]}


@app.get("/")
def root():
    return {
        "message": "SignBridge+ API is running!",
        "model": "signbridge_model_v2.h5",
        "labels": SIGNS,
        "sequence_length": SEQUENCE_LENGTH,
        "feature_size": KEYPOINT_COUNT,
    }


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="192.168.137.70", port=8000)
