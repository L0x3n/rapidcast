import { ideaText } from './ai'
import type { StreamEvent, StreamUser } from './events'

export class SuggestionGate {
  private users = new Map<string, number>()
  private global = -Infinity
  accept(event: StreamEvent, cooldownSeconds: number, rewardId: string, now = Date.now()): { idea: string; user: StreamUser } | null {
    let idea = ''; let user: StreamUser
    if (event.type === 'chat' && !event.own && /^!widget(?:\s|$)/i.test(event.text)) { idea = event.text.replace(/^!widget\s*/i, ''); user = event.user }
    else if (event.type === 'redeem' && rewardId && event.rewardId === rewardId) { idea = event.input; user = event.user }
    else return null
    try { idea = ideaText(idea) } catch { return null }
    const id = `${event.source}:${user.id || user.login}`
    if (now < (this.users.get(id) ?? -Infinity) + cooldownSeconds * 1000 || now < this.global + 5000) return null
    this.users.set(id, now); this.global = now
    if (this.users.size > 2000) { const first = this.users.keys().next().value; if (first) this.users.delete(first) }
    return { idea, user }
  }
}
