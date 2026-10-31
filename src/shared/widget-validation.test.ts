import { describe, expect, it } from 'vitest'
import { validateWidgetCode } from './widget-validation'
import { validParams, transitionProgress, widgetGeneration } from './widgets'
import { makeLayer } from './engine'
import { builtinWidgets } from '../main/widgets/builtins'

const module = (draw = 'ctx.fillRect(0,0,w,h);'): string => `export default {meta:{name:'Test',description:'Canvas test',defaultSize:{w:320,h:160},params:{speed:{type:'number',default:1,min:0,max:5}}},init(api){},update(dt){},draw(ctx,w,h){${draw}}};`
describe('widget installation boundary', () => {
  it('validates all five real builtins and converts only the default export', () => {
    const definitions = builtinWidgets()
    expect(definitions).toHaveLength(5)
    for (const item of definitions) {
      const validated = validateWidgetCode(item.code)
      expect(validated.meta).toEqual(item.meta)
      expect(validated.factoryBody).not.toContain('export default')
      expect(validated.factoryBody).toContain('return __rapidcastWidget')
    }
  })
  it.each([
    'fetch("https://example.com")', 'new WebSocket("wss://example.com")', 'document.body', 'globalThis.location',
    'import("./payload.js")', 'eval("1")', 'ctx.constructor', 'ctx["canvas"]', 'Math.random()',
    'new OffscreenCanvas(1,1)', 'api.__proto__', 'this.value', 'setTimeout(()=>{},0)', 'new Function("return 1")'
  ])('rejects forbidden capability: %s', body => expect(() => validateWidgetCode(module(body))).toThrow())
  it('rejects executable metadata, async callbacks, imports and oversize source', () => {
    expect(() => validateWidgetCode(module().replace("name:'Test'", 'name:run()'))).toThrow('literal')
    expect(() => validateWidgetCode(module().replace('update(dt)', 'async update(dt)'))).toThrow('synchronously')
    expect(() => validateWidgetCode(`import x from 'x';${module()}`)).toThrow('import')
    expect(() => validateWidgetCode(module() + ' '.repeat(40000))).toThrow('40000')
  })
  it('permits a faulty synchronous draw so the runtime watchdog can contain it', () => {
    expect(validateWidgetCode(module('while(true){}')).meta.name).toBe('Test')
    expect(validateWidgetCode(module("throw new Error('crash')")).meta.name).toBe('Test')
  })
  it('validates parameters and rejects invalid persisted values', () => {
    const schema = validateWidgetCode(module()).meta.params
    expect(validParams(schema, {})).toEqual({ speed: 1 })
    expect(validParams(schema, { speed: 2, injected: 'discard' })).toEqual({ speed: 2 })
    for (const value of [-1, 6, Infinity, '1']) expect(() => validParams(schema, { speed: value })).toThrow('speed')
  })
  it('changes generation on code, dimensions, parameters and explicit restart', () => {
    const definition = builtinWidgets()[0]!
    const instance = { id: 'test', createdAt: 123, params: {}, disabled: false, reason: '' }
    const layer = makeLayer('test', 'widget')
    const first = widgetGeneration(definition, instance, layer)
    expect(widgetGeneration(definition, { ...instance, disabled: true }, layer)).toBe(first)
    expect(widgetGeneration(definition, { ...instance, createdAt: 124 }, layer)).not.toBe(first)
    expect(widgetGeneration(definition, { ...instance, params: { title: 'changed' } }, layer)).not.toBe(first)
    expect(widgetGeneration(definition, instance, { ...layer, width: 100 })).not.toBe(first)
    expect(widgetGeneration({ ...definition, version: 'next' }, instance, layer)).not.toBe(first)
  })
  it('clamps transition timing with a 450 ms duration', () => {
    expect(transitionProgress(100, 0)).toBe(0)
    expect(transitionProgress(100, 325)).toBe(.5)
    expect(transitionProgress(100, 1000)).toBe(1)
  })
})
