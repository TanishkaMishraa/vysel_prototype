"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  analyzeCanvas,
  drawDemoPortrait,
  CAPTURE_SIZE,
  OVAL,
  ZONES,
  type StyleDnaResult,
  type Swatch,
} from "@/lib/styleDna";
import { drawSoftEllipse } from "@/lib/makeupOverlay";
import type { FaceZones } from "@/lib/faceVision";
import shared from "./Shared.module.css";
import styles from "./StyleLab.module.css";

type RailStep = "capture" | "report" | "preview" | "recommend";
type MakeupKey = "lip" | "blush" | "eye";
type Selection = Record<MakeupKey, Swatch | null>;

const RAIL_STEPS: { key: RailStep; label: string }[] = [
  { key: "capture", label: "1 · Capture" },
  { key: "report", label: "2 · Style DNA" },
  { key: "preview", label: "3 · Makeup Preview" },
  { key: "recommend", label: "4 · Recommendations" },
];

interface UploadTransform {
  scale: number;
  tx: number;
  ty: number;
  naturalW: number;
  naturalH: number;
  dragging: boolean;
  lastX: number;
  lastY: number;
}

export default function StyleLab() {
  // -- capture refs -------------------------------------------------
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const captureCanvasRef = useRef<HTMLCanvasElement>(null); // holds the last analyzed 480x480 frame
  const previewCanvasRef = useRef<HTMLCanvasElement>(null); // visible canvas: base + makeup overlay
  const uploadImgRef = useRef<HTMLImageElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const upload = useRef<UploadTransform>({
    scale: 1,
    tx: 0,
    ty: 0,
    naturalW: 0,
    naturalH: 0,
    dragging: false,
    lastX: 0,
    lastY: 0,
  });

  // -- rail / scroll refs --------------------------------------------
  const captureRef = useRef<HTMLDivElement>(null);
  const reportRef = useRef<HTMLDivElement>(null);
  const previewRef = useRef<HTMLDivElement>(null);
  const recommendRef = useRef<HTMLDivElement>(null);
  const suppressObserver = useRef(false);

  // -- state -----------------------------------------------------------
  const [activeTab, setActiveTab] = useState<"camera" | "upload">("camera");
  const [cameraOn, setCameraOn] = useState(false);
  const [uploadReady, setUploadReady] = useState(false);
  const [camStatus, setCamStatus] = useState("Camera access hasn't been requested yet.");
  const [scanning, setScanning] = useState(false);
  const [result, setResult] = useState<StyleDnaResult | null>(null);
  const [tag, setTag] = useState("Sample scan");
  const [selection, setSelection] = useState<Selection>({ lip: null, blush: null, eye: null });
  const [faceZones, setFaceZones] = useState<FaceZones | null>(null);
  const [showAfter, setShowAfter] = useState(true);
  const [intensity, setIntensity] = useState(0.65);
  const [zoomValue, setZoomValue] = useState(100);
  const [activeStep, setActiveStep] = useState<RailStep>("capture");
  const [doneSteps, setDoneSteps] = useState<Set<RailStep>>(new Set());

  const captureEnabled = (activeTab === "camera" && cameraOn) || (activeTab === "upload" && uploadReady);

  // -- core pipeline: analyze whatever is currently in captureCanvasRef --
  const analyzeCurrent = useCallback((tagText: string, zones: FaceZones | null = null) => {
    const canvas = captureCanvasRef.current;
    if (!canvas) return;
    const res = analyzeCanvas(canvas, zones ?? undefined);
    setResult(res);
    setFaceZones(zones);
    setTag(tagText);
    setSelection({ lip: null, blush: null, eye: null });
    setDoneSteps((prev) => new Set(prev).add("capture").add("report"));
  }, []);

  // -- boot: run the pipeline once on a stylized demo portrait, so the
  //    report/preview/recommendations show real computed output before
  //    the visitor grants camera access or uploads anything ----------
  useEffect(() => {
    const canvas = captureCanvasRef.current;
    if (!canvas) return;
    drawDemoPortrait(canvas);
    analyzeCurrent("Sample scan");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // -- keep the preview canvas (base image + makeup overlay) in sync
  //    with the latest result / selection / toggle / intensity -------
  useEffect(() => {
    const canvas = previewCanvasRef.current;
    const base = captureCanvasRef.current;
    if (!canvas || !base || !result) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, CAPTURE_SIZE, CAPTURE_SIZE);
    ctx.drawImage(base, 0, 0);
    const makeupZones = faceZones ?? ZONES;
    if (showAfter) {
      if (selection.blush) {
        drawSoftEllipse(ctx, makeupZones.cheekL, selection.blush, 0.32 * intensity, "multiply");
        drawSoftEllipse(ctx, makeupZones.cheekR, selection.blush, 0.32 * intensity, "multiply");
      }
      if (selection.eye) {
        drawSoftEllipse(ctx, makeupZones.eyeL, selection.eye, 0.4 * intensity, "multiply");
        drawSoftEllipse(ctx, makeupZones.eyeR, selection.eye, 0.4 * intensity, "multiply");
      }
      if (selection.lip) {
        drawSoftEllipse(ctx, makeupZones.lips, selection.lip, 0.62 * intensity, "multiply");
      }
    }
  }, [result, faceZones, selection, showAfter, intensity]);

  // -- stage rail: IntersectionObserver keeps the active tab synced to
  //    whichever panel is actually in view while scrolling ------------
  useEffect(() => {
    const panels: [RailStep, HTMLDivElement | null][] = [
      ["capture", captureRef.current],
      ["report", reportRef.current],
      ["preview", previewRef.current],
      ["recommend", recommendRef.current],
    ];
    if (typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (suppressObserver.current) return;
        let best: IntersectionObserverEntry | null = null;
        entries.forEach((entry) => {
          if (entry.isIntersecting && (!best || entry.intersectionRatio > best.intersectionRatio)) best = entry;
        });
        if (best) {
          const match = panels.find(([, el]) => el === (best as IntersectionObserverEntry).target);
          if (match) setActiveStep(match[0]);
        }
      },
      { rootMargin: "-30% 0px -55% 0px", threshold: [0, 0.25, 0.5, 0.75, 1] }
    );
    panels.forEach(([, el]) => el && observer.observe(el));
    return () => observer.disconnect();
  }, []);

  // -- stop the camera stream on unmount --------------------------------
  useEffect(() => {
    return () => {
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  const goToStep = useCallback((step: RailStep) => {
    const refs: Record<RailStep, HTMLDivElement | null> = {
      capture: captureRef.current,
      report: reportRef.current,
      preview: previewRef.current,
      recommend: recommendRef.current,
    };
    const el = refs[step];
    if (!el) return;
    setActiveStep(step);
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    suppressObserver.current = true;
    el.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
    window.setTimeout(() => {
      suppressObserver.current = false;
    }, reduce ? 50 : 700);
  }, []);

  // -- camera -----------------------------------------------------------
  const startCamera = useCallback(async () => {
    if (!navigator.mediaDevices?.getUserMedia) {
      setCamStatus('Camera access isn’t available in this browser — use "Upload photo" instead.');
      return;
    }
    setCamStatus("Requesting camera access…");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: { ideal: 640 }, height: { ideal: 640 } },
        audio: false,
      });
      // Release any earlier stream so repeated clicks don't leave the camera held open.
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = stream;
      if (videoRef.current) videoRef.current.srcObject = stream;
      setCameraOn(true);
      setCamStatus("Camera live — align and capture when ready.");
    } catch {
      setCamStatus('Camera access was denied or unavailable — try "Upload photo" instead.');
    }
  }, []);

  const captureFromCamera = useCallback(() => {
    const video = videoRef.current;
    const canvas = captureCanvasRef.current;
    if (!video || !canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const vw = video.videoWidth || CAPTURE_SIZE;
    const vh = video.videoHeight || CAPTURE_SIZE;
    const side = Math.min(vw, vh);
    const sx = (vw - side) / 2;
    const sy = (vh - side) / 2;
    ctx.save();
    ctx.translate(CAPTURE_SIZE, 0);
    ctx.scale(-1, 1); // mirror for a natural selfie view
    ctx.drawImage(video, sx, sy, side, side, 0, 0, CAPTURE_SIZE, CAPTURE_SIZE);
    ctx.restore();
  }, []);

  // -- upload + drag/zoom crop -------------------------------------------
  const applyUploadTransform = useCallback(() => {
    const img = uploadImgRef.current;
    if (!img) return;
    const u = upload.current;
    img.style.transform = `translate(${u.tx}px,${u.ty}px) scale(${u.scale})`;
  }, []);

  const clampUploadTransform = useCallback(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const rect = stage.getBoundingClientRect();
    const u = upload.current;
    const maxOffsetX = (rect.width * (u.scale - 1)) / 2 + 40;
    const maxOffsetY = (rect.height * (u.scale - 1)) / 2 + 40;
    u.tx = Math.max(-maxOffsetX, Math.min(maxOffsetX, u.tx));
    u.ty = Math.max(-maxOffsetY, Math.min(maxOffsetY, u.ty));
  }, []);

  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    // Clear the input so picking the same file again still fires onChange.
    e.target.value = "";
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const img = uploadImgRef.current;
      if (!img) return;
      img.onload = () => {
        upload.current = { ...upload.current, scale: 1, tx: 0, ty: 0, naturalW: img.naturalWidth, naturalH: img.naturalHeight };
        setZoomValue(100);
        applyUploadTransform();
        setUploadReady(true);
        setCamStatus("Photo loaded — drag to reposition, then capture & analyze.");
      };
      img.src = ev.target?.result as string;
    };
    reader.readAsDataURL(file);
  }, [applyUploadTransform]);

  const handleZoomChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const value = Number(e.target.value);
      setZoomValue(value);
      upload.current.scale = value / 100;
      clampUploadTransform();
      applyUploadTransform();
    },
    [applyUploadTransform, clampUploadTransform]
  );

  const onStagePointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (activeTab !== "upload" || !uploadReady) return;
      upload.current.dragging = true;
      upload.current.lastX = e.clientX;
      upload.current.lastY = e.clientY;
      (e.target as Element).setPointerCapture?.(e.pointerId);
    },
    [activeTab, uploadReady]
  );
  const onStagePointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      const u = upload.current;
      if (!u.dragging) return;
      u.tx += e.clientX - u.lastX;
      u.ty += e.clientY - u.lastY;
      u.lastX = e.clientX;
      u.lastY = e.clientY;
      clampUploadTransform();
      applyUploadTransform();
    },
    [applyUploadTransform, clampUploadTransform]
  );
  const onStagePointerUp = useCallback(() => {
    upload.current.dragging = false;
  }, []);

  const captureFromUpload = useCallback(() => {
    const canvas = captureCanvasRef.current;
    const img = uploadImgRef.current;
    const stage = stageRef.current;
    if (!canvas || !img || !stage) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, CAPTURE_SIZE, CAPTURE_SIZE);
    const rect = stage.getBoundingClientRect();
    const u = upload.current;
    const dispScale = CAPTURE_SIZE / rect.width;
    const containScale = Math.max(rect.width / u.naturalW, rect.height / u.naturalH);
    const baseW = u.naturalW * containScale;
    const baseH = u.naturalH * containScale;
    const w = baseW * u.scale * dispScale;
    const h = baseH * u.scale * dispScale;
    const cx = CAPTURE_SIZE / 2 + u.tx * dispScale;
    const cy = CAPTURE_SIZE / 2 + u.ty * dispScale;
    ctx.drawImage(img, cx - w / 2, cy - h / 2, w, h);
  }, []);

  const handleCapture = useCallback(async () => {
    if (activeTab === "camera") captureFromCamera();
    else captureFromUpload();
    setScanning(true);
    const canvas = captureCanvasRef.current;
    let zones: FaceZones | null = null;
    try {
      const { detectFaceZones, normalizeWithOpenCv } = await import("@/lib/faceVision");
      if (canvas) zones = await detectFaceZones(canvas);
      if (canvas) await normalizeWithOpenCv(canvas);
      setCamStatus(
        zones
          ? "Face landmarks locked — makeup placement follows your eyes, cheeks and lips."
          : "Face landmarks were unavailable — using the guide regions instead."
      );
    } catch {
      setCamStatus("Advanced vision is unavailable — using the guide regions instead.");
    }
    window.setTimeout(() => {
      analyzeCurrent("Your scan", zones);
      setScanning(false);
      goToStep("report");
    }, 550);
  }, [activeTab, captureFromCamera, captureFromUpload, analyzeCurrent, goToStep]);

  const switchTab = useCallback(
    (tab: "camera" | "upload") => {
      setActiveTab(tab);
      if (tab === "upload" && !uploadReady) fileInputRef.current?.click();
    },
    [uploadReady]
  );

  const allMakeup = result ? [...result.makeup.lipstick, ...result.makeup.blush, ...result.makeup.eyeshadow] : [];

  return (
    <div>
      <section className={styles.hero}>
        <h1>Your Style DNA, read from a photo.</h1>
        <p>
          A working prototype of AuraFit&rsquo;s core pipeline: skin-tone extraction, undertone classification, a
          generated Style&nbsp;DNA report, a live virtual makeup preview, and a palette engine — all computed in
          your browser, from your own capture.
        </p>
        <div className={shared.note}>
          <span className={shared.noteDot} />
          Runs entirely client-side — nothing you capture leaves this page.
        </div>
        <div className={styles.statusLine}>
          <span className="eyebrow">{tag}</span>
        </div>
      </section>

      <div className={styles.rail}>
        {RAIL_STEPS.map((step) => (
          <button
            key={step.key}
            type="button"
            className={`${styles.railStep} ${activeStep === step.key ? styles.railStepActive : ""} ${
              doneSteps.has(step.key) ? styles.railStepDone : ""
            }`}
            onClick={() => goToStep(step.key)}
          >
            {step.label}
          </button>
        ))}
      </div>

      {/* ---------------------------------------------------------- capture */}
      <section className={shared.panel} ref={captureRef}>
        <div className={shared.panelHead}>
          <h2>Capture</h2>
          <span className="eyebrow">Step 1</span>
        </div>
        <p className={shared.panelSub}>
          Fit your face inside the guide oval, or upload a photo and drag/zoom it into place. AuraFit samples
          forehead and cheek tone from inside that guide — the same region a makeup artist would check first.
        </p>

        <div className={styles.tabs}>
          <button
            type="button"
            className={`${styles.tabBtn} ${activeTab === "camera" ? styles.tabBtnActive : ""}`}
            onClick={() => switchTab("camera")}
          >
            Use camera
          </button>
          <button
            type="button"
            className={`${styles.tabBtn} ${activeTab === "upload" ? styles.tabBtnActive : ""}`}
            onClick={() => switchTab("upload")}
          >
            Upload photo
          </button>
        </div>

        <div className={styles.captureGrid}>
          <div>
            <div
              className={styles.stage}
              ref={stageRef}
              onPointerDown={onStagePointerDown}
              onPointerMove={onStagePointerMove}
              onPointerUp={onStagePointerUp}
              onPointerCancel={onStagePointerUp}
            >
              {!captureEnabled && (
                <div className={styles.stageEmpty}>
                  {activeTab === "camera" ? "Camera not started" : "No photo selected"}
                </div>
              )}
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                className={styles.stageVideo}
                style={{ display: activeTab === "camera" && cameraOn ? "block" : "none" }}
              />
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                ref={uploadImgRef}
                alt="Uploaded photo for analysis"
                className={styles.stageImg}
                style={{ display: activeTab === "upload" && uploadReady ? "block" : "none" }}
              />
              {captureEnabled && (
                <div
                  className={styles.ovalGuide}
                  style={{
                    left: `${(OVAL.cx - OVAL.rx) * 100}%`,
                    top: `${(OVAL.cy - OVAL.ry) * 100}%`,
                    width: `${OVAL.rx * 2 * 100}%`,
                    height: `${OVAL.ry * 2 * 100}%`,
                  }}
                />
              )}
              {captureEnabled && <div className={styles.ovalHint}>Align face to guide</div>}
              {scanning && (
                <div className={styles.scanOverlay}>
                  <div className={styles.scanLine} />
                  <div className={styles.scanLabel}>Sampling tone…</div>
                </div>
              )}
            </div>
            {activeTab === "upload" && uploadReady && (
              <div>
                <div className={styles.uploadDrop}>Drag to reposition · use the slider to zoom</div>
                <div className={styles.zoomRow}>
                  <span>Zoom</span>
                  <input type="range" min={100} max={280} value={zoomValue} onChange={handleZoomChange} />
                </div>
              </div>
            )}
          </div>
          <div className={styles.capSide}>
            <p>{camStatus}</p>
            <ul>
              <li>Even, front-facing light works best.</li>
              <li>Analysis excludes eyes and lips — only skin zones are sampled.</li>
              <li>A stylized sample scan is loaded below so you can see the pipeline before using your own photo.</li>
            </ul>
            <div className={shared.btnRow}>
              <button type="button" className={`${shared.btn} ${shared.btnPrimary}`} onClick={startCamera}>
                Start camera
              </button>
              <button
                type="button"
                className={`${shared.btn} ${shared.btnGhost}`}
                disabled={!captureEnabled}
                onClick={handleCapture}
              >
                Capture &amp; analyze
              </button>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              style={{ display: "none" }}
              onChange={handleFileChange}
            />
          </div>
        </div>
      </section>

      {/* ---------------------------------------------------------- report */}
      <section className={shared.panel} ref={reportRef}>
        <div className={shared.panelHead}>
          <h2>Style DNA report</h2>
          <span className="eyebrow">{tag}</span>
        </div>
        <p className={shared.panelSub}>
          Dominant tone is isolated with a k-means color clustering pass over the sampled pixels, then converted to
          CIELAB to compute the Individual Typology Angle (ITA°) — the same metric dermatology and cosmetics science
          use to classify skin depth.
        </p>
        <div className={styles.dnaGrid}>
          <div className={styles.swatchHero} style={result ? { background: result.hex } : undefined} />
          <div>
            <h3 className={styles.dnaHeadline}>{result ? `${result.depth} · ${result.undertone} undertone` : "—"}</h3>
            <div className={styles.dnaHex}>
              {result ? `${result.hex.toUpperCase()}  ·  ${result.sampleCount} pixels sampled` : "—"}
            </div>
          </div>
        </div>
        <div className={styles.dnaStats}>
          <div className={styles.statTile}>
            <div className={styles.statLabel}>Depth category</div>
            <div className={styles.statValue}>{result?.depth ?? "—"}</div>
          </div>
          <div className={styles.statTile}>
            <div className={styles.statLabel}>ITA angle</div>
            <div className={styles.statValue}>
              {result ? result.ita.toFixed(1) : "—"}
              <small>°</small>
            </div>
          </div>
          <div className={styles.statTile}>
            <div className={styles.statLabel}>Undertone</div>
            <div className={styles.statValue}>{result?.undertone ?? "—"}</div>
          </div>
          <div className={`${styles.statTile} ${styles.statTileWide}`}>
            <div className={styles.statLabel}>Match confidence</div>
            <div className={styles.statValue}>
              {result?.confidence ?? "—"}
              <small>/100</small>
            </div>
            <div className={styles.confidenceBar}>
              <div className={styles.confidenceFill} style={{ width: `${result?.confidence ?? 0}%` }} />
            </div>
          </div>
        </div>
      </section>

      {/* ---------------------------------------------------------- preview */}
      <section className={shared.panel} ref={previewRef}>
        <div className={shared.panelHead}>
          <h2>Virtual makeup preview</h2>
          <span className="eyebrow">Step 3</span>
        </div>
        <p className={shared.panelSub}>
          Shades below are generated from your Style DNA, not a fixed catalog. Selecting one recomposites the
          overlay live on the canvas.
        </p>
        <div className={styles.previewGrid}>
          <div className={styles.previewCanvasWrap}>
            <canvas ref={previewCanvasRef} width={CAPTURE_SIZE} height={CAPTURE_SIZE} className={styles.previewCanvas} />
            <div className={styles.beforeAfter}>
              <button
                type="button"
                className={`${styles.beforeAfterBtn} ${showAfter ? styles.beforeAfterBtnActive : ""}`}
                onClick={() => setShowAfter(true)}
              >
                After
              </button>
              <button
                type="button"
                className={`${styles.beforeAfterBtn} ${!showAfter ? styles.beforeAfterBtnActive : ""}`}
                onClick={() => setShowAfter(false)}
              >
                Before
              </button>
            </div>
          </div>
          <div>
            <SwatchPicker
              label="Lip color"
              options={result?.makeup.lipstick ?? []}
              selected={selection.lip}
              onSelect={(v) => setSelection((s) => ({ ...s, lip: v }))}
            />
            <SwatchPicker
              label="Blush"
              options={result?.makeup.blush ?? []}
              selected={selection.blush}
              onSelect={(v) => setSelection((s) => ({ ...s, blush: v }))}
            />
            <SwatchPicker
              label="Eyeshadow"
              options={result?.makeup.eyeshadow ?? []}
              selected={selection.eye}
              onSelect={(v) => setSelection((s) => ({ ...s, eye: v }))}
            />
            <div className={styles.controlBlock}>
              <span className={styles.controlLabel}>Intensity</span>
              <input
                type="range"
                min={20}
                max={100}
                value={Math.round(intensity * 100)}
                onChange={(e) => setIntensity(Number(e.target.value) / 100)}
              />
            </div>
          </div>
        </div>
      </section>

      {/* ---------------------------------------------------------- recommend */}
      <section className={shared.panel} ref={recommendRef}>
        <div className={shared.panelHead}>
          <h2>Recommendations</h2>
          <span className="eyebrow">Step 4</span>
        </div>
        <p className={shared.panelSub}>
          Every swatch is calculated from your dominant hue with color-theory rotations — analogous, complementary
          and jewel-contrast schemes weighted by your undertone, not picked from a fixed lookbook.
        </p>
        <div className={styles.recCols}>
          <div>
            <h3>Wardrobe palette</h3>
            <div className={styles.paletteGrid}>
              {(result?.clothing ?? []).map((c) => (
                <PaletteCard key={c.label} swatch={c} />
              ))}
            </div>
          </div>
          <div>
            <h3>Makeup palette</h3>
            <div className={styles.paletteGrid}>
              {allMakeup.map((c, i) => (
                <PaletteCard key={`${c.label}-${i}`} swatch={c} />
              ))}
            </div>
          </div>
        </div>
        <div className={shared.btnRow}>
          <button type="button" className={`${shared.btn} ${shared.btnGhost}`} onClick={() => goToStep("capture")}>
            Scan your own photo
          </button>
        </div>
      </section>

      <canvas ref={captureCanvasRef} width={CAPTURE_SIZE} height={CAPTURE_SIZE} className={styles.hiddenCanvas} />
    </div>
  );
}

function SwatchPicker({
  label,
  options,
  selected,
  onSelect,
}: {
  label: string;
  options: Swatch[];
  selected: Swatch | null;
  onSelect: (swatch: Swatch | null) => void;
}) {
  return (
    <div className={styles.controlBlock}>
      <span className={styles.controlLabel}>{label}</span>
      <div className={styles.swatchRow}>
        <button
          type="button"
          className={`${styles.swatchBtn} ${styles.swatchBtnNone} ${selected === null ? styles.swatchBtnSelected : ""}`}
          onClick={() => onSelect(null)}
          aria-label={`No ${label.toLowerCase()}`}
        >
          —
        </button>
        {options.map((opt) => (
          <button
            key={opt.label}
            type="button"
            className={`${styles.swatchBtn} ${selected?.label === opt.label ? styles.swatchBtnSelected : ""}`}
            style={{ background: opt.css }}
            title={`${opt.label} · ${opt.hex}`}
            aria-label={opt.label}
            onClick={() => onSelect(opt)}
          />
        ))}
      </div>
    </div>
  );
}

function PaletteCard({ swatch }: { swatch: Swatch }) {
  return (
    <div className={styles.paletteCard}>
      <div className={styles.paletteSwatch} style={{ background: swatch.css }} />
      <div className={styles.paletteMeta}>
        <div className={styles.name}>{swatch.label}</div>
        <div className={styles.hex}>{swatch.hex.toUpperCase()}</div>
      </div>
    </div>
  );
}
