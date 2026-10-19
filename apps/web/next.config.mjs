/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Socket.IO's Engine.IO endpoint uses a trailing slash; avoid Next.js
  // redirecting the handshake to a path the backend does not serve.
  skipTrailingSlashRedirect: true,
  async rewrites() {
    const api = process.env.API_INTERNAL_URL || 'http://localhost:4000';
    return {
      beforeFiles: [
        { source: '/api/:path*', destination: `${api}/:path*` },
        { source: '/socket.io', destination: `${api}/socket.io/` },
        { source: '/socket.io/:path*', destination: `${api}/socket.io/:path*` }
      ]
    };
  },
  // Turbopack (default dev bundler) handles the CommonJS workspace packages without extra configuration.
  turbopack: {},
  webpack(config) {
    // Workspace packages (@previley-transformer/*) are CommonJS symlinks. Keeping their node_modules path stops
    // the dev server from treating them as app code and injecting React Refresh (ESM `import.meta`) into them.
    config.resolve.symlinks = false;
    return config;
  }
};

export default nextConfig;
