import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  async redirects() {
    return [
      {
        source: '/join',
        destination: '/auth/signup',
        permanent: true,
      },
      {
        source: '/auth/signin',
        destination: '/auth/login',
        permanent: true,
      },
      {
        source: '/login',
        destination: '/auth/login',
        permanent: true,
      },
      {
        source: '/signup',
        destination: '/auth/signup',
        permanent: true,
      },
      {
        source: '/cohost/calendar/settings',
        destination: '/cohost/settings/calendar',
        permanent: true,
      }
    ]
  },
};

export default nextConfig;
