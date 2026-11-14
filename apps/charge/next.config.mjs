import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  outputFileTracingRoot: resolve(here, "../.."),
  distDir: process.env.NEXT_DIST_DIR ?? ".next",
};

export default nextConfig;
