import { describe, expect, it } from 'vitest'
import { packCases, parsePack, portableLayer, validatePack } from './pack-validation'
import { makeLayer } from './engine'
import { packFixture, TEST_PNG } from './pack-fixture'

describe('strict portable pack format', () => {
  it('round-trips all four scenes, a theme, widget code, params and credits', () => {
    const pack = packFixture(); expect(parsePack(JSON.stringify(pack))).toEqual(pack)
    expect(packCases(pack)).toEqual([{ definition: pack.definitions[0], params: { amount: 7 }, width: 320, height: 160 }])
  })
  it('removes capture identities and private capture labels from portable layers', () => {
    const layer = { ...makeLayer('game-window', 'display'), source: 'window:private-id:0', name: 'A private app window', text: 'private details' }
    expect(portableLayer(layer, 'live', 2)).toMatchObject({ id: 'layer-live-2', name: 'Display / window placeholder', source: '', text: '', visible: false })
    expect(portableLayer(makeLayer('live-title', 'text'), 'live', 1).id).toBe('live-title')
  })
  it('rejects hidden host settings, credentials and unsupported versions', () => {
    const pack = packFixture()
    expect(() => validatePack({ ...pack, tokens: 'secret' })).toThrow('unsupported fields')
    expect(() => validatePack({ ...pack, version: 2 })).toThrow('version 1')
    expect(() => validatePack({ ...pack, metadata: { ...pack.metadata, endpoint: 'https://example.com' } })).toThrow('unsupported fields')
    expect(() => validatePack({ ...pack, theme: { ...pack.theme, apiKey: 'secret' } })).toThrow('unsupported fields')
  })
  it('rejects executable imports, missing references, duplicate IDs and arbitrary parameters', () => {
    const pack = packFixture(); const code = pack.definitions[0]!.code
    expect(() => validatePack({ ...pack, definitions: [{ ...pack.definitions[0], code: code.replace("ctx.fillStyle='#39e5ff';", "fetch('/x');") }] })).toThrow('fetch')
    const missing = packFixture(); missing.scenes.live.at(-1)!.source = 'missing'; expect(() => validatePack(missing)).toThrow('missing definition')
    const duplicate = packFixture(); duplicate.scenes.brb[0]!.id = duplicate.scenes.live[0]!.id; expect(() => validatePack(duplicate)).toThrow('layer')
    const params = packFixture(); params.scenes.live.at(-1)!.params = { amount: 11 }; expect(() => validatePack(params)).toThrow('amount')
    params.scenes.live.at(-1)!.params = { amount: 7, surprise: true }; expect(() => validatePack(params)).toThrow('unknown parameters')
  })
  it('rejects capture activation, paths, URLs, SVG and unreferenced content', () => {
    const pack = packFixture(); pack.scenes.live.push({ ...makeLayer('capture', 'camera'), source: 'default' }); expect(() => validatePack(pack)).toThrow('placeholders')
    for (const data of ['file:///private.png', 'https://example.com/a.png', 'data:image/svg+xml;base64,PHN2Zz4=']) expect(() => validatePack({ ...packFixture(), preview: data })).toThrow('PNG')
    expect(() => validatePack({ ...packFixture(), assets: [{ id: '../image', data: TEST_PNG }] })).toThrow('invalid ID')
    expect(() => validatePack({ ...packFixture(), assets: [{ id: 'unused', data: TEST_PNG }] })).toThrow('only definitions/images')
  })
  it('bounds input and unique test cases and includes hidden configurations in tests', () => {
    expect(() => parsePack(' '.repeat(16 * 1024 * 1024 + 1))).toThrow('16 MB')
    expect(() => parsePack('{')).toThrow('readable JSON')
    const pack = packFixture(); const layer = structuredClone(pack.scenes.live.at(-1)!); layer.id = 'second'; layer.visible = false; pack.scenes.brb.push(layer)
    expect(packCases(validatePack(pack))).toHaveLength(1)
    layer.params = { amount: 9 }; expect(packCases(validatePack(pack))).toHaveLength(2)
    layer.width = 400; expect(packCases(validatePack(pack))).toHaveLength(2)
  })
})
