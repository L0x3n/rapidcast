import { parse } from 'acorn'
import { record } from './events'
import { validParams, type WidgetMeta, type ParamSchema } from './widgets'

type Ast = Record<string, unknown> & { type: string; start: number; end: number }
const denied = new Set(['window', 'document', 'self', 'globalThis', 'global', 'process', 'require', 'module', 'exports',
  'fetch', 'XMLHttpRequest', 'WebSocket', 'WebTransport', 'EventSource', 'Worker', 'SharedWorker', 'BroadcastChannel',
  'navigator', 'location', 'origin', 'indexedDB', 'caches', 'importScripts', 'eval', 'Function', 'WebAssembly',
  'postMessage', 'onmessage', 'addEventListener', 'dispatchEvent', 'MessageChannel', 'MessagePort', 'close',
  'setTimeout', 'setInterval', 'queueMicrotask', 'requestAnimationFrame', 'Atomics', 'SharedArrayBuffer',
  'OffscreenCanvas', 'ImageBitmap', 'ImageData', 'Date', 'crypto'])
const deniedProperties = new Set(['constructor', '__proto__', 'prototype', 'canvas', 'getContext', 'getImageData', 'createImageData', 'putImageData'])
const constructors = new Set(['Error', 'Path2D', 'Map', 'Set', 'Float32Array', 'Uint8Array', 'Uint8ClampedArray'])
function ast(value: unknown): Ast { return record(value) as Ast }
function literal(node: Ast, depth = 0): unknown {
  if (depth > 8) throw new Error('Widget metadata is too deeply nested.')
  if (node.type === 'Literal') return node.value
  if (node.type === 'UnaryExpression' && node.operator === '-' && ast(node.argument).type === 'Literal' && typeof ast(node.argument).value === 'number') return -Number(ast(node.argument).value)
  if (node.type === 'ObjectExpression' && Array.isArray(node.properties)) {
    const result: Record<string, unknown> = Object.create(null) as Record<string, unknown>
    for (const raw of node.properties) {
      const property = ast(raw); const key = ast(property.key)
      const name = key.name ?? key.value
      if (property.type !== 'Property' || property.computed || property.kind !== 'init' || typeof name !== 'string' ||
          ['__proto__', 'constructor', 'prototype'].includes(name)) throw new Error('Use plain literal values in widget metadata.')
      result[name] = literal(ast(property.value), depth + 1)
    }
    return result
  }
  throw new Error('Widget metadata must contain only literal values, not executable code.')
}
export function validateWidgetCode(code: string): { meta: WidgetMeta; factoryBody: string } {
  if (typeof code !== 'string' || code.length < 40 || code.length > 40000) throw new Error('Use one widget ES module between 40 and 40000 characters.')
  let tree: Ast
  try { tree = ast(parse(code, { ecmaVersion: 'latest', sourceType: 'module' })) } catch { throw new Error('This widget has a JavaScript syntax error. Fix the module and try again.') }
  let exported: Ast | null = null
  const visit = (node: Ast): void => {
    if (['ImportDeclaration', 'ImportExpression', 'ExportNamedDeclaration', 'ExportAllDeclaration', 'MetaProperty', 'ThisExpression', 'WithStatement'].includes(node.type)) throw new Error('Widgets cannot import code, access global state or use this. Use the provided api and draw context.')
    if (node.type === 'Identifier' && (denied.has(String(node.name)) || String(node.name).startsWith('__rapidcast'))) throw new Error(`Widgets cannot use ${String(node.name)}. Use the provided widget API.`)
    if (node.type === 'MemberExpression') {
      const property = ast(node.property)
      if (deniedProperties.has(String(property.name ?? property.value)) || ast(node.object).name === 'Math' && (property.name === 'random' || property.value === 'random')) throw new Error('Use api.random and the supplied drawing context without accessing constructors or canvas internals.')
    }
    if (node.type === 'NewExpression' && !constructors.has(String(ast(node.callee).name))) throw new Error('This widget tries to create an unsupported object.')
    if ((node.type === 'FunctionExpression' || node.type === 'FunctionDeclaration' || node.type === 'ArrowFunctionExpression') && (node.async || node.generator)) throw new Error('Widget callbacks must run synchronously. Host images are available through api.image.')
    if (node.type === 'ExportDefaultDeclaration') { if (exported) throw new Error('Export exactly one widget.'); exported = node }
    for (const [key, child] of Object.entries(node)) {
      if (['start', 'end', 'loc'].includes(key)) continue
      if (Array.isArray(child)) for (const item of child) { if (record(item).type) visit(ast(item)) }
      else if (record(child).type) visit(ast(child))
    }
  }
  visit(tree)
  if (!exported) throw new Error('Export default { meta, init, update, draw } from the widget module.')
  const declaration = ast((exported as Ast).declaration)
  if (declaration.type !== 'ObjectExpression' || !Array.isArray(declaration.properties)) throw new Error('The default export must be a widget object literal.')
  const properties = declaration.properties.map(ast)
  for (const property of properties) if (property.type !== 'Property' || property.computed || property.kind !== 'init') throw new Error('Widget exports cannot use getters, spreads or computed properties.')
  const named = (name: string): Ast | undefined => properties.find(property => ast(property.key).name === name || ast(property.key).value === name)
  for (const name of ['init', 'update', 'draw']) if (!['FunctionExpression', 'ArrowFunctionExpression'].includes(ast(named(name)?.value).type)) throw new Error(`The widget needs a synchronous ${name} function.`)
  const metaValue = record(literal(ast(named('meta')?.value)))
  const size = record(metaValue.defaultSize); const schemas = record(metaValue.params)
  if (typeof metaValue.name !== 'string' || metaValue.name.length < 1 || metaValue.name.length > 60 || typeof metaValue.description !== 'string' || metaValue.description.length > 300 ||
      !Number.isInteger(size.w) || !Number.isInteger(size.h) || Number(size.w) < 32 || Number(size.h) < 32 || Number(size.w) > 1920 || Number(size.h) > 1080 || Object.keys(schemas).length > 16) throw new Error('Provide a short widget name/description and a size between 32×32 and 1920×1080.')
  const params: Record<string, ParamSchema> = {}
  for (const [key, raw] of Object.entries(schemas)) {
    const value = record(raw)
    if (!/^[a-zA-Z][a-zA-Z0-9]{0,30}$/.test(key) || !['number', 'string', 'color', 'boolean'].includes(String(value.type)) ||
        value.min !== undefined && (typeof value.min !== 'number' || !Number.isFinite(value.min)) || value.max !== undefined && (typeof value.max !== 'number' || !Number.isFinite(value.max))) throw new Error('Use simple named parameters with number, string, color or boolean types.')
    params[key] = value as unknown as ParamSchema
  }
  validParams(params, Object.fromEntries(Object.entries(params).map(([key, value]) => [key, value.default])))
  const meta: WidgetMeta = { name: metaValue.name, description: metaValue.description, defaultSize: { w: Number(size.w), h: Number(size.h) }, params }
  const start = (exported as Ast).start; const end = (exported as Ast).end
  return { meta, factoryBody: `${code.slice(0, start)}\nconst __rapidcastWidget = ${code.slice(declaration.start, declaration.end)};\n${code.slice(end)}\nreturn __rapidcastWidget;` }
}
