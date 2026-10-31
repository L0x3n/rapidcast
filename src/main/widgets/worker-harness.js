(function (factory) {
  'use strict';
  const send = postMessage.bind(globalThis);
  const listen = addEventListener.bind(globalThis);
  const clock = performance.now.bind(performance);
  const Canvas = OffscreenCanvas;
  const freeze = Object.freeze.bind(Object);
  const apply = Reflect.apply.bind(Reflect);
  const own = Object.defineProperty.bind(Object);
  const images = new Map();
  const handlers = new Map();
  let widget, canvas, context, proxy, reset, current = 0, previous = 0, randomState = 1, slow = 0, halted = false, triggers = 0;
  const forbidden = new Set(['canvas', 'constructor', '__proto__', 'prototype', 'getImageData', 'putImageData', 'createImageData']);
  const disable = error => {
    halted = true;
    send({ kind: 'disabled', reason: String(error && error.message || error || 'Widget failed.').slice(0, 180) });
  };
  for (const name of ['fetch', 'XMLHttpRequest', 'WebSocket', 'WebTransport', 'EventSource', 'Worker', 'SharedWorker', 'BroadcastChannel',
    'indexedDB', 'caches', 'importScripts', 'postMessage', 'onmessage', 'addEventListener', 'dispatchEvent', 'MessageChannel',
    'MessagePort', 'OffscreenCanvas', 'SharedArrayBuffer', 'Atomics', 'close']) {
    try { own(globalThis, name, { value: undefined, writable: false, configurable: false }); } catch { /* CSP is the independent network/eval boundary. */ }
  }
  listen('message', event => {
    if (halted) return;
    const data = event.data;
    try {
      if (data.kind === 'init') {
        if (widget) throw new Error('Widget was initialized twice.');
        const width = Math.max(32, Math.min(1920, Math.floor(data.width)));
        const height = Math.max(32, Math.min(1080, Math.floor(data.height)));
        canvas = new Canvas(width, height); context = canvas.getContext('2d', { alpha: true });
        if (!context) throw new Error('OffscreenCanvas could not start.');
        reset = context.reset.bind(context);
        proxy = new Proxy(context, {
          get(target, key) {
            if (forbidden.has(key)) return undefined;
            const value = Reflect.get(target, key, target);
            return typeof value === 'function' ? value.bind(target) : value;
          },
          set(target, key, value) {
            if (forbidden.has(key)) throw new Error('Canvas internals are private.');
            return Reflect.set(target, key, value, target);
          }
        });
        current = data.now; previous = current; randomState = data.seed >>> 0 || 1;
        for (const [key, image] of data.images || []) images.set(key, image);
        const api = freeze({
          params: freeze(data.params),
          on(type, handler) {
            if (!['chat', 'follow', 'sub', 'cheer', 'raid', 'redeem', 'streamOnline', 'streamOffline'].includes(type) || typeof handler !== 'function') throw new Error('Use a normalized event type and a handler function.');
            const listeners = handlers.get(type) || [];
            if (listeners.length >= 16) throw new Error('Too many event handlers.');
            listeners.push(handler); handlers.set(type, listeners);
          },
          now: () => current,
          random: () => { randomState ^= randomState << 13; randomState ^= randomState >>> 17; randomState ^= randomState << 5; return (randomState >>> 0) / 4294967296; },
          image: key => images.get(key) || null
        });
        widget = factory();
        apply(widget.init, undefined, [api]);
        send({ kind: 'ready' });
      } else if (data.kind === 'images') {
        for (const [key, image] of data.images) { images.get(key)?.close(); if (image) images.set(key, image); else images.delete(key); }
      } else if (data.kind === 'tick' && widget) {
        const started = clock(); current = data.now;
        for (const item of data.events) {
          const listeners = handlers.get(item.type) || [];
          if (listeners.length) triggers++;
          for (const handler of listeners) apply(handler, undefined, [freeze(item)]);
        }
        const dt = Math.max(0, Math.min(.1, (current - previous) / 1000)); previous = current;
        apply(widget.update, undefined, [dt]);
        if (data.draw) { reset(); apply(widget.draw, undefined, [proxy, canvas.width, canvas.height]); }
        const elapsed = clock() - started;
        slow = elapsed > 25 ? slow + 1 : 0;
        if (slow >= 3) throw new Error('Drawing was too slow three times. Reduce drawing work and restart.');
        if (data.draw) {
          const bitmap = canvas.transferToImageBitmap();
          send({ kind: 'frame', sequence: data.sequence, bitmap, elapsed, triggers }, [bitmap]);
        } else send({ kind: 'idle', sequence: data.sequence, elapsed, triggers });
      }
    } catch (error) { disable(error); }
  });
  listen('unhandledrejection', event => { event.preventDefault(); disable('A widget promise failed. Use synchronous callbacks and restart.'); });
  send({ kind: 'boot' });
})
