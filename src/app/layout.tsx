import type { Metadata, Viewport } from 'next';
import localFont from 'next/font/local';
import './globals.css';

/**
 * Both typefaces are self-hosted variable fonts (latin subset).
 * That keeps the build reproducible without reaching Google at build time, and
 * removes a third-party connection at runtime.
 */
const fraunces = localFont({
  src: '../fonts/fraunces-latin-variable.woff2',
  weight: '300 700',
  style: 'normal',
  variable: '--font-serif',
  display: 'swap',
  fallback: ['Georgia', 'serif'],
});

const manrope = localFont({
  src: '../fonts/manrope-latin-variable.woff2',
  weight: '400 800',
  style: 'normal',
  variable: '--font-sans',
  display: 'swap',
  fallback: ['system-ui', 'sans-serif'],
});

export const metadata: Metadata = {
  title: { default: 'Residency First CRM', template: '%s · Residency First CRM' },
  description: 'EB-5 client and commission tracker for Residency First.',
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#FAF6F1',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${fraunces.variable} ${manrope.variable}`}>
      <body>{children}</body>
    </html>
  );
}
