import { defaultEngineSettings, makeLayer } from './engine'
import { defaultTheme } from './setup'
import type { OverlayPack } from './packs'

export const TEST_PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg=='
export const TEST_PACK_CODE = `let api; export default {meta:{name:'Pack reactor',description:'A portable test widget',defaultSize:{w:320,h:160},params:{amount:{type:'number',default:3,min:1,max:10}}},init(host){api=host;api.on('follow',()=>{});},update(dt){},draw(ctx,w,h){ctx.fillStyle='#39e5ff';ctx.fillRect(0,0,w*api.params.amount/10,h);}};`
export function packFixture(): OverlayPack {
  const scenes = defaultEngineSettings().scenes
  scenes.live.push({ ...makeLayer('pack-widget', 'widget'), source: 'reactor', text: 'idea by @pixelpilot · TEST', width: 320, height: 160 })
  return { format: 'rapidcast-pack', version: 1, metadata: { name: 'Portable test', author: 'Test author', description: 'Test scenes and widget', createdAt: '2026-11-01T12:00:00.000Z', appVersion: '0.5.0' }, preview: TEST_PNG,
    theme: defaultTheme(), transition: 'swipe', definitions: [{ id: 'reactor', code: TEST_PACK_CODE, credit: 'idea by @pixelpilot · TEST' }], assets: [], scenes: { ...scenes, live: scenes.live.map(l => l.kind === 'widget' ? { ...l, params: { amount: 7 } } : l) } }
}
