import Link from "next/link";
import styles from "./Shared.module.css";

export default function SiteFooter() {
  return (
    <footer className={styles.siteFooter}>
      <div className={styles.footerLinks}>
        <Link href="/">Home</Link>
        <Link href="/lab">Style Lab</Link>
        <a href="https://github.com/TanishkaMishraa/AuraFit" target="_blank" rel="noopener">
          GitHub
        </a>
      </div>
      <span className={styles.sageDot}>●</span> Capture, sampling, clustering and rendering all happen in this
      browser tab — no image data is transmitted or stored.
    </footer>
  );
}
