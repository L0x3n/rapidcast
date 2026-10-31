export interface AppInfo {
  name: string
  version: string
  platform: string
  secureStorageAvailable: boolean
  twitchClientConfigured: boolean
}

export interface RapidCastApi {
  getAppInfo(): Promise<AppInfo>
}

export const IPC = { appInfo: 'rapidcast:app-info' } as const
