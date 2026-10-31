import type { Transition } from '../../shared/widgets'
import { transitionProgress } from '../../shared/widgets'

export class SceneTransition {
  private image: OffscreenCanvas | null = null
  private started = 0
  private mode: Transition = 'cut'
  holding = false
  capture(canvas: HTMLCanvasElement, mode: Transition): void {
    this.image ??= new OffscreenCanvas(canvas.width, canvas.height)
    this.image.getContext('2d')?.drawImage(canvas, 0, 0)
    this.mode = mode; this.holding = true
  }
  begin(now: number): void { this.started = now; this.holding = false }
  draw(ctx: CanvasRenderingContext2D, now: number): void {
    if (!this.image) return
    if (this.holding) { ctx.clearRect(0, 0, this.image.width, this.image.height); ctx.drawImage(this.image, 0, 0); return }
    const progress = transitionProgress(this.started, now)
    if (progress >= 1 || this.mode === 'cut') return
    const ease = 1 - Math.pow(1 - progress, 3)
    ctx.save()
    if (this.mode === 'fade') { ctx.globalAlpha = 1 - ease; ctx.drawImage(this.image, 0, 0) }
    else ctx.drawImage(this.image, ease * this.image.width, 0)
    ctx.restore()
  }
  close(): void { if (this.image) { this.image.width = 0; this.image.height = 0 }; this.image = null; this.holding = false }
}
