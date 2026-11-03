"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { analyzeCanvas, drawDemoPortrait, CAPTURE_SIZE, type StyleDnaResult } from "@/lib/styleDna";
import shared from "./Shared.module.css";
import styles from "./Home.module.css";

/**
 * Runs the real Style DNA pipeline once, client-side, against a stylized
 * demo portrait, so the homepage shows genuine computed output at rest
 * instead of a static mock. The same pipeline runs again in the Lab
 * against your own capture.
 */
export default function SampleTeaser() {
  const [result, setResult] = useState<StyleDnaResult | null>(null);

  useEffect(() => {
    const canvas = document.createElement("canvas");
    canvas.width = CAPTURE_SIZE;
    canvas.height = CAPTURE_SIZE;
    drawDemoPortrait(canvas);
    setResult(analyzeCanvas(canvas));
  }, []);

  return (
    <div className={styles.teaserCard}>
      <div className={styles.teaserSwatch} style={result ? { background: result.hex } : undefined} />
      <div className={styles.teaserMeta}>
        <div className={styles.name}>{result ? `${result.depth} · ${result.undertone} undertone` : "Computing sample scan…"}</div>
        <div className={styles.sub}>{result ? `Sample scan · ${result.hex.toUpperCase()}` : "—"}</div>
      </div>
      <Link href="/lab" className={`${shared.btn} ${shared.btnGhost}`}>
        Run your own →
      </Link>
    </div>
  );
}
