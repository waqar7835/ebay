/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ["@ebay-order-management/shared"],
  // Basic browser-protection headers (security audit 2026-11-13): no embedding in other sites (clickjacking), no MIME
  // sniffing, no full URLs leaked to other sites. A full Content-Security-Policy is left for later (CLAUDE.md).
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        ],
      },
    ];
  },
};

module.exports = nextConfig;
