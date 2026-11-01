import { describe, expect, it, vi } from 'vitest'
import { AiClient } from './client'
import { widgetPipeline } from './pipeline'
import { defaultAiSettings } from '../../shared/ai'

const valid = `export default {meta:{name:'Test',description:'Test',defaultSize:{w:400,h:200},params:{}},init(api){},update(dt){},draw(ctx,w,h){ctx.fillRect(0,0,w,h);}};`
describe('generated widget gate', () => {
  it('repairs static and runtime failures before returning a tested preview', async () => {
    const client = new AiClient(); const completion = vi.spyOn(client, 'complete').mockResolvedValueOnce(valid.replace('ctx.fillRect(0,0,w,h);', 'fetch("/bad");')).mockResolvedValueOnce(valid).mockResolvedValueOnce(valid)
    const test = vi.fn().mockRejectedValueOnce(new Error('Widget exceeded its deadline')).mockResolvedValue({ id: 'candidate', url: 'http://localhost/test/candidate', frames: 90 })
    const stage = vi.fn()
    const result = await widgetPipeline(client, defaultAiSettings(), '', 'Neon pulse', '', test, new AbortController().signal, stage)
    expect(result.frames).toBe(90); expect(completion).toHaveBeenCalledTimes(3); expect(test).toHaveBeenCalledTimes(2)
    expect(stage.mock.calls.filter(call => call[0] === 'fixing')).toHaveLength(2)
    expect(completion.mock.calls[2]?.[2].at(-1)?.content).toContain('deadline')
  })
  it('never makes more than two repairs and never publishes a failing module', async () => {
    const client = new AiClient(); const completion = vi.spyOn(client, 'complete').mockResolvedValue('not JavaScript')
    const test = vi.fn()
    await expect(widgetPipeline(client, defaultAiSettings(), '', 'Neon', '', test, new AbortController().signal, vi.fn())).rejects.toThrow('two repairs')
    expect(completion).toHaveBeenCalledTimes(3); expect(test).not.toHaveBeenCalled()
  })
  it('does not use code repair retries for transport errors or cancellations', async () => {
    const client = new AiClient(); const completion = vi.spyOn(client, 'complete').mockRejectedValue(new Error('Authentication failed'))
    await expect(widgetPipeline(client, defaultAiSettings(), '', 'Neon', '', vi.fn(), new AbortController().signal, vi.fn())).rejects.toThrow('Authentication')
    expect(completion).toHaveBeenCalledOnce()
    const controller = new AbortController(); controller.abort()
    await expect(widgetPipeline(client, defaultAiSettings(), '', 'Neon', '', vi.fn(), controller.signal, vi.fn())).rejects.toThrow('cancelled')
    expect(completion).toHaveBeenCalledOnce()
  })
})
