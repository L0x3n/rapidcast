import publicConfig from '../../config/public.json'

export function resolveTwitchClientId(override?: string): string | null {
  const clientId = (override?.trim() || publicConfig.twitchClientId).trim()
  if (!clientId) return null
  if (!/^[a-zA-Z0-9]{1,128}$/.test(clientId)) {
    throw new Error('Enter the Client ID from your Twitch application settings. Do not enter a token or URL.')
  }
  return clientId
}
