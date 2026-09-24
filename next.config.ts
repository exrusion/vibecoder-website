import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async redirects() {
    return [
      {
        source: "/:path*",
        has: [{ type: "host", value: "www.vibekit.io" }],
        destination: "https://vibekit.io/:path*",
        permanent: true,
      },
    ];
  },
};

export default nextConfig;
