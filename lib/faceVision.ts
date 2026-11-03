import { FaceLandmarker, FilesetResolver, type FaceLandmarkerResult } from "@mediapipe/tasks-vision";
import cv from "@techstark/opencv-js";
import { OVAL, type Zone } from "./styleDna";

const FACE_MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task";
const WASM_URL = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.0.1/wasm";

let landmarkerPromise: Promise<FaceLandmarker> | null = null;
let openCvPromise: Promise<typeof cv> | null = null;

function loadFaceLandmarker(): Promise<FaceLandmarker> {
  if (!landmarkerPromise) {
    landmarkerPromise = FilesetResolver.forVisionTasks(WASM_URL)
      .then((vision) => {
        const create = (delegate: "GPU" | "CPU") =>
          FaceLandmarker.createFromOptions(vision, {
            baseOptions: { modelAssetPath: FACE_MODEL_URL, delegate },
            runningMode: "IMAGE",
            numFaces: 1,
            minFaceDetectionConfidence: 0.55,
            minFacePresenceConfidence: 0.55,
            minTrackingConfidence: 0.55,
          });
        // Not every device exposes WebGL to the GPU delegate; fall back to CPU.
        return create("GPU").catch(() => create("CPU"));
      })
      .catch((err) => {
        // Don't cache a failed load (e.g. offline) — let the next capture retry.
        landmarkerPromise = null;
        throw err;
      });
  }
  return landmarkerPromise;
}

function loadOpenCv(): Promise<typeof cv> {
  if (!openCvPromise) {
    // The package exports either a Promise of the module or a module that is
    // still initializing its WASM runtime; wait for whichever applies.
    const mod = cv as unknown as typeof cv | Promise<typeof cv>;
    openCvPromise = (
      mod instanceof Promise
        ? mod
        : mod.Mat
          ? Promise.resolve(mod)
          : new Promise<typeof cv>((resolve) => {
              (mod as typeof cv & { onRuntimeInitialized?: () => void }).onRuntimeInitialized = () => resolve(mod);
            })
    ).catch((err) => {
      openCvPromise = null;
      throw err;
    });
  }
  return openCvPromise;
}

export interface FaceZones {
  lips: Zone;
  cheekL: Zone;
  cheekR: Zone;
  eyeL: Zone;
  eyeR: Zone;
  forehead: Zone;
}

type Point = { x: number; y: number };
type Landmark = { x: number; y: number };

function point(landmarks: Landmark[], index: number): Point {
  const p = landmarks[index];
  return p ? { x: p.x, y: p.y } : { x: OVAL.cx, y: OVAL.cy };
}

function bounds(landmarks: Landmark[], indices: number[], padX: number, padY: number): Zone {
  const points = indices.map((index) => point(landmarks, index));
  const minX = Math.min(...points.map((p) => p.x));
  const maxX = Math.max(...points.map((p) => p.x));
  const minY = Math.min(...points.map((p) => p.y));
  const maxY = Math.max(...points.map((p) => p.y));
  const hw = Math.max((maxX - minX) / 2 + padX, 0.012);
  const hh = Math.max((maxY - minY) / 2 + padY, 0.012);
  return { cx: (minX + maxX) / 2, cy: (minY + maxY) / 2, hw, hh };
}

export function faceZones(result: FaceLandmarkerResult): FaceZones | null {
  const landmarks = result.faceLandmarks[0] as Landmark[] | undefined;
  if (!landmarks) return null;

  // MediaPipe's canonical face mesh indices provide stable regions even when
  // the subject is not centered inside the original guide oval.
  return {
    lips: bounds(landmarks, [61, 291, 13, 14, 78, 308], 0.018, 0.012),
    cheekL: bounds(landmarks, [50, 101, 118, 205], 0.025, 0.035),
    cheekR: bounds(landmarks, [280, 330, 347, 425], 0.025, 0.035),
    eyeL: bounds(landmarks, [33, 133, 159, 145], 0.018, 0.018),
    eyeR: bounds(landmarks, [362, 263, 386, 374], 0.018, 0.018),
    forehead: bounds(landmarks, [10, 151, 103, 332], 0.04, 0.025),
  };
}

export async function detectFaceZones(canvas: HTMLCanvasElement): Promise<FaceZones | null> {
  const landmarker = await loadFaceLandmarker();
  return faceZones(landmarker.detect(canvas));
}

export async function normalizeWithOpenCv(canvas: HTMLCanvasElement): Promise<void> {
  const loaded = await loadOpenCv();
  const source = loaded.imread(canvas);
  const rgb = new loaded.Mat();
  const lab = new loaded.Mat();
  const channels = new loaded.MatVector();
  const enhanced = new loaded.Mat();
  try {
    loaded.cvtColor(source, rgb, loaded.COLOR_RGBA2RGB);
    loaded.cvtColor(rgb, lab, loaded.COLOR_RGB2Lab);
    loaded.split(lab, channels);
    // MatVector.get() returns a new Mat handle each call; free it explicitly.
    const lightness = channels.get(0);
    try {
      loaded.equalizeHist(lightness, lightness);
    } finally {
      lightness.delete();
    }
    loaded.merge(channels, lab);
    loaded.cvtColor(lab, enhanced, loaded.COLOR_Lab2RGB);
    loaded.imshow(canvas, enhanced);
  } finally {
    source.delete();
    rgb.delete();
    lab.delete();
    channels.delete();
    enhanced.delete();
  }
}

export async function prepareVision(): Promise<void> {
  await Promise.all([loadFaceLandmarker(), loadOpenCv()]);
}

export function hasFace(result: FaceLandmarkerResult | null): result is FaceLandmarkerResult {
  return Boolean(result?.faceLandmarks.length);
}

export { FACE_MODEL_URL };