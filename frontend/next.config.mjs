/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // `npm run export` sets STATIC_EXPORT=1 to emit a plain static site in
  // ./out, which the FastAPI backend serves on :8000 (single-origin, no CORS).
  // Normal `npm run build` / `next start` leave this off.
  ...(process.env.STATIC_EXPORT === "1" ? { output: "export" } : {}),
};

export default nextConfig;
