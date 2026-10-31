import type { RapidCastApi } from '../shared/contracts'

declare global {
  interface Window { rapidcast: RapidCastApi }
}
