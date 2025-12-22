import { json } from "@remix-run/node";
import { useLoaderData, Link } from "@remix-run/react";
import styles from "./styles.module.css";

export async function loader() {
  return json({
    title: "Music Poll"
  });
}

export default function MusicPoll() {
  const { title } = useLoaderData();

  return (
    <div className={styles.musicpollContainer}>
      <div className={styles.musicpollContent}>
        <img
          src="/rubify-branding.png"
          alt="Complex Presents Rubify"
          className={styles.brandingImage}
        />

        <div className={styles.headerSection}>
          <h1 className={styles.pageTitle}>🎵 {title}</h1>
          <p className={styles.pageDescription}>
            Vote for your favorite music to play in our store!
          </p>
        </div>

        {/* PollUnit Embed via iframe */}
        <iframe
          src="/pollunit-embed.html"
          style={{
            width: '100%',
            height: '700px',
            border: '1px solid #ddd',
            borderRadius: '15px',
            margin: '2rem 0',
            background: 'transparent'
          }}
          scrolling="no"
          title="Music Poll"
        />

        {/* Back Button */}
        <div className={styles.backToHomeContainer}>
          <Link to="/" className={styles.backToHomeBtn}>
            ← Back to Home
          </Link>
        </div>

        {/* AOO Logo */}
        <div className={styles.bottomAooLogo}>
          <img
            src="/aoo-logo.png"
            alt="AOO Logo"
            style={{ width: "60px", height: "auto", opacity: 0.3 }}
          />
        </div>
      </div>
    </div>
  );
}
