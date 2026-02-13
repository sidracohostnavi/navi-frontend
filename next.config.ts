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
  async rewrites() {
    return [
      {
        source: '/',
        has: [
          { type: 'host', value: 'cohostnavi.com' },
        ],
        destination: '/cohost',
      },
      {
        source: '/',
        has: [
          { type: 'host', value: 'www.cohostnavi.com' },
        ],
        destination: '/cohost',
      },
    ];
  },
};

export default nextConfig;
