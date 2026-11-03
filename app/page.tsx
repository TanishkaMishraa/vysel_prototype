import Link from "next/link";
import shared from "@/components/Shared.module.css";
import styles from "@/components/Home.module.css";
import SampleTeaser from "@/components/SampleTeaser";

const HOW_IT_WORKS = [
  { num: "01", title: "Capture", body: "Align to the guide oval, or upload a photo and drag/zoom it into place." },
  { num: "02", title: "Style DNA", body: "k-means clustering plus a CIELAB ITA° angle classify your depth and undertone." },
  { num: "03", title: "Preview", body: "Generated lip, blush and eyeshadow shades composite live on your photo." },
  { num: "04", title: "Recommend", body: "A color-theory engine builds a wardrobe and makeup palette from your hue." },
];

const FEATURES = [
  {
    title: "Clinical color science",
    body: "CIELAB conversion and the Individual Typology Angle — the metric dermatology and cosmetics science use to classify skin depth.",
  },
  {
    title: "Generated, not templated",
    body: "Every swatch is calculated from your hue via HSL rotation, not pulled from a fixed catalog.",
  },
  {
    title: "Runs in your browser",
    body: "Capture, clustering and rendering all happen client-side — nothing you scan is uploaded or stored.",
  },
  {
    title: "Built for real photos",
    body: "Drag-to-reposition and zoom alignment work with any uploaded photo, not just a perfect studio shot.",
  },
];

export default function HomePage() {
  return (
    <>
      <section className={styles.homeHero}>
        <span className="eyebrow">AuraFit — Style Intelligence</span>
        <h1>Beauty and styling, decoded from your own reflection.</h1>
        <p>
          AuraFit reads your skin&rsquo;s undertone and depth from a photo, then builds a Style&nbsp;DNA report, a
          live makeup preview, and a wardrobe palette — computed, not guessed from a quiz.
        </p>
        <div className={styles.homeCtaRow}>
          <Link href="/lab" className={`${shared.btn} ${shared.btnPrimary}`}>
            Open the Style Lab →
          </Link>
          <a href="#how-it-works" className={`${shared.btn} ${shared.btnGhost}`}>
            See how it works
          </a>
        </div>
        <SampleTeaser />
      </section>

      <section id="how-it-works" className={shared.panel}>
        <div className={shared.panelHead}>
          <h2>How it works</h2>
          <span className="eyebrow">Four steps</span>
        </div>
        <p className={shared.panelSub}>The same pipeline that runs in the Style Lab, in order.</p>
        <div className={styles.howSteps}>
          {HOW_IT_WORKS.map((step) => (
            <div className={styles.howStep} key={step.num}>
              <div className={styles.num}>{step.num}</div>
              <h4>{step.title}</h4>
              <p>{step.body}</p>
            </div>
          ))}
        </div>
      </section>

      <section className={shared.panel}>
        <div className={shared.panelHead}>
          <h2>What&rsquo;s actually running</h2>
          <span className="eyebrow">Not a mockup</span>
        </div>
        <div className={styles.featureGrid}>
          {FEATURES.map((f) => (
            <div className={styles.featureCard} key={f.title}>
              <h4>{f.title}</h4>
              <p>{f.body}</p>
            </div>
          ))}
        </div>
      </section>
    </>
  );
}
