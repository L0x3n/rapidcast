import chat from './builtins/chat.js?raw'
import alerts from './builtins/alerts.js?raw'
import countdown from './builtins/countdown.js?raw'
import ticker from './builtins/ticker.js?raw'
import goal from './builtins/goal.js?raw'
import { createHash } from 'node:crypto'
import { validateWidgetCode } from '../../shared/widget-validation'
import type { WidgetDefinition } from '../../shared/widgets'

export function builtinWidgets(): WidgetDefinition[] {
  return Object.entries({ chat, alerts, countdown, ticker, goal }).map(([id, code]) => ({
    id: `builtin-${id}`, code, meta: validateWidgetCode(code).meta, builtin: true, version: createHash('sha256').update(code).digest('hex').slice(0, 16)
  }))
}
