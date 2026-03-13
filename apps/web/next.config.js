/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ['@broker/crypto', '@broker/connectors', '@broker/shared-types'],
}

module.exports = nextConfig
