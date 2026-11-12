import type { NextConfig } from 'next';

// In development the browser talks to Next only; these rewrites pass /api and /media to FastAPI so cookies stay
// first-party. In docker-compose nginx routes them before they reach Next.
const api = process.env.API_INTERNAL_URL ?? 'http://localhost:8000';

const config: NextConfig = {
  output: 'standalone',
  async rewrites() {
    return [
      { source: '/api/:path*', destination: `${api}/api/:path*` },
      { source: '/media/:path*', destination: `${api}/media/:path*` },
    ];
  },
};

export default config;
