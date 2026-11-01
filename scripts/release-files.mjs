const topFiles = new Set(['package.json', 'package-lock.json', 'README.md', 'LICENSE', 'THIRD_PARTY_NOTICES.md'])
const privateNames = /(^|\/)(?:\.git|\.env[^/]*|\.bin|node_gyp_bins|twitch\.bin|ai-key\.bin|settings\.json|engine\.json|widgets\.json|setup\.json|stats\.json|pack-transaction\.json)(?:\/|$)/i
export function releasePathAllowed(input, modules) {
  const path = input.replaceAll('\\', '/').replace(/^\//, '')
  if (!path) return true
  if (path.includes(':') || path.split('/').includes('..') || privateNames.test(path)) return false
  if (topFiles.has(path)) return true
  if (path === 'config' || path === 'config/public.json') return true
  if (path === 'docs' || /^docs\/[a-zA-Z0-9_-]+\.md$/.test(path)) return true
  if (path === 'out' || /^out\/(main|preload|renderer|overlay)(\/|$)/.test(path)) return true
  if (path === 'node_modules') return true
  return modules.some(module => path === module || path.startsWith(`${module}/`) || module.startsWith(`${path}/`))
}
