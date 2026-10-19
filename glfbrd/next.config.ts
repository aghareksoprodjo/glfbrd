import type { NextConfig } from "next";

const isProd = process.env.NODE_ENV === "production";

const nextConfig: NextConfig = {
  output: "export",
  images: {
    unoptimized: true,
  },
  // Apply basePath only in production (GitHub Pages), keeping localhost clean at http://localhost:3000
  basePath: isProd ? "/glfbrd" : "",
};

export default nextConfig;