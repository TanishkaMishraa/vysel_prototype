"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import styles from "./SiteNav.module.css";

const LINKS = [
  { href: "/", label: "Home" },
  { href: "/lab", label: "Style Lab" },
];

export default function SiteNav() {
  const pathname = usePathname();

  return (
    <nav className={styles.sitenav}>
      <div className={styles.row}>
        <Link href="/" className={styles.wordmark}>
          AURA<span>FIT</span>
        </Link>
        <div className={styles.navLinks}>
          {LINKS.map((link) => {
            const active = pathname === link.href;
            return (
              <Link
                key={link.href}
                href={link.href}
                className={`${styles.navLink} ${active ? styles.navLinkActive : ""}`}
                aria-current={active ? "page" : undefined}
              >
                {link.label}
              </Link>
            );
          })}
        </div>
      </div>
    </nav>
  );
}
