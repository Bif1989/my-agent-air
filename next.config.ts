import type { NextConfig } from "next";

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-DNS-Prefetch-Control", value: "off" },
  { key: "X-Permitted-Cross-Domain-Policies", value: "none" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Content-Security-Policy", value: "frame-ancestors 'none'; base-uri 'self'; form-action 'self'" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin-allow-popups" },
  { key: "Permissions-Policy", value: "camera=(), geolocation=(), microphone=(self), payment=(), usb=()" },
  { key: "Strict-Transport-Security", value: "max-age=31536000" },
];

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        source: "/:path*",
        headers: securityHeaders,
      },
    ];
  },
  async redirects() {
    return [
      {
        source: "/messages/:dealId",
        destination: "/deals/:dealId#chat",
        permanent: false,
      },
      {
        source: "/s/:token",
        destination: "/supplier-request/:token",
        permanent: false,
      },
    ];
  },
  async rewrites() {
    return [
      {
        source: "/admin/agents/:id",
        destination: "/admin-agent-detail",
      },
      {
        source: "/agents/:id",
        destination: "/agent-detail",
      },
      {
        source: "/deals/:id",
        destination: "/deal-detail",
      },
      {
        source: "/requests/:id/edit",
        destination: "/request-edit",
      },
      {
        source: "/requests/:id",
        destination: "/request-detail",
      },
      {
        source: "/supplier-request/:token",
        destination: "/supplier-invite",
      },
    ];
  },
};

export default nextConfig;
