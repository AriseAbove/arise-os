/** @type {import('next').NextConfig} */
const nextConfig = {
  // Isolate the build output dir via env so a production build can run on its
  // own port without clobbering a concurrent `next dev` (which keeps `.next`).
  distDir: process.env.NEXT_DIST_DIR || '.next',
  // Stabilized out of `experimental` in Next 15 — same option, top-level key.
  serverExternalPackages: ['better-sqlite3', 'node-ical', 'nodemailer'],
};

export default nextConfig;
