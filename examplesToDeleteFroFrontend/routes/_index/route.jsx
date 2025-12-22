import { redirect } from "@remix-run/node";
import { Form, useLoaderData, Link } from "@remix-run/react";
import { login } from "../../shopify.server";
import styles from "./styles.module.css";

export const loader = async ({ request }) => {
  const url = new URL(request.url);

  if (url.searchParams.get("shop")) {
    throw redirect(`/app?${url.searchParams.toString()}`);
  }

  return { showForm: Boolean(login) };
};

export default function App() {
  const { showForm } = useLoaderData();

  return (
    <div className={styles.index}>
      <div className={styles.content}>
        <img
          src="/rubify-branding.png"
          alt="Complex Presents Rubify"
          className={styles.brandingImage}
        />
        
        <h1 className={styles.heading}>Welcome to the Jennie POP experience !</h1>
        <p className={styles.text}>
          Choose an option to get started
        </p>
        
        <div className={styles.navigationGrid}>
          <Link to="/kiosk" className={styles.navCard}>
            <div className={styles.navIcon}>
              <svg width="64" height="64" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M19 3H5C3.9 3 3 3.9 3 5V19C3 20.1 3.9 21 5 21H19C20.1 21 21 20.1 21 19V5C21 3.9 20.1 3 19 3ZM19 19H5V5H19V19Z" fill="currentColor"/>
                <path d="M7 7H17V9H7V7Z" fill="currentColor"/>
                <path d="M7 11H17V13H7V11Z" fill="currentColor"/>
                <path d="M7 15H14V17H7V15Z" fill="currentColor"/>
              </svg>
            </div>
            <h3 className={styles.navTitle}>Shopping List </h3>
            <p className={styles.navDescription}>Prepare your shopping list</p>
          </Link>

          <div className={`${styles.navCard} ${styles.navCardDisabled}`}>
            <div className={styles.navIcon}>
              <svg width="64" height="64" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M12 3V13.55C11.41 13.21 10.73 13 10 13C7.79 13 6 14.79 6 17S7.79 21 10 21 14 19.21 14 17V7H18V3H12Z" fill="currentColor"/>
              </svg>
            </div>
            <h3 className={styles.navTitle}>What music should the DJ Play?</h3>
            <p className={styles.navDescription}>Coming Soon</p>
          </div>
        </div> 

      </div>
    </div>
  );
}
