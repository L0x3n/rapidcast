import { app, type BrowserWindow } from 'electron'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { Storage } from './storage'

export async function runSmoke(window: BrowserWindow): Promise<void> {
  if (typeof fetch !== 'function' || typeof WebSocket !== 'function') throw new Error('The Electron host is missing fetch or WebSocket support.')
  const result: unknown = await window.webContents.executeJavaScript(`
    (async () => {
      const until = async predicate => {
        const deadline = Date.now() + 10000;
        while (!predicate()) {
          if (Date.now() > deadline) throw new Error('Studio did not become ready.');
          await new Promise(resolve => setTimeout(resolve, 30));
        }
      };
      await until(() => document.querySelector('[data-app-ready="true"]'));
      const setup = await window.rapidcast.getSetup();
      if (!setup.completed && !document.querySelector('[data-page="setup"]')) throw new Error('First launch did not open the setup guide.');
      for (const tab of ['studio', 'setup', 'stats', 'settings', 'live']) {
        document.querySelector('[data-tab="' + tab + '"]').click();
        await until(() => document.querySelector('[data-page="' + tab + '"]'));
      }
      await window.rapidcast.simulate('follow');
      await until(() => document.body.textContent.includes('PixelPilot followed'));
      await window.rapidcast.simulate('chat');
      await until(() => document.body.textContent.includes('Chat is ready.'));
      await window.rapidcast.selectScene('brb');
      await until(() => document.body.textContent.includes('BE RIGHT BACK.'));
      const snapshot = await window.rapidcast.getStudio();
      const info = await window.rapidcast.getAppInfo();
      const invalid = await window.rapidcast.saveClientId('https://invalid.example');
      await window.rapidcast.clearSimulations();
      await until(() => document.body.textContent.includes('No events yet'));
      await window.rapidcast.selectScene('starting');
      const engineBefore = await window.rapidcast.getEngine();
      const layerType = document.querySelector('select[aria-label="Layer type"]');
      layerType.value = 'color';
      layerType.dispatchEvent(new Event('change', { bubbles: true }));
      await new Promise(resolve => setTimeout(resolve, 50));
      document.querySelector('.layer-add button').click();
      await until(() => document.querySelector('.layer-editor'));
      const name = document.querySelector('.layer-editor .field-grid input');
      name.focus(); name.value = 'Smoke color layer'; name.blur();
      await new Promise(resolve => setTimeout(resolve, 50));
      document.querySelector('.layer-editor .button-row button').click();
      const layerDeadline = Date.now() + 5000;
      let layerApplied = false;
      while (Date.now() < layerDeadline) {
        const engine = await window.rapidcast.getEngine();
        if (engine.settings.scenes.starting.some(layer => layer.kind === 'color' && layer.name === 'Smoke color layer')) { layerApplied = true; break; }
        await new Promise(resolve => setTimeout(resolve, 30));
      }
      if (!layerApplied) throw new Error('The layer editor did not apply its changes.');
      await window.rapidcast.configureEngine(engineBefore.settings);
      return { name: info.name, nodeHidden: typeof require === 'undefined' && typeof process === 'undefined',
        events: snapshot.events.length, source: snapshot.events.every(e => e.source === 'simulator'),
        scene: snapshot.activeScene, rejectsInvalidClient: !invalid.ok };
    })()
  `)
  const renderer = app.getAppMetrics().find(metric => metric.pid === window.webContents.getOSProcessId())
  if (!result || typeof result !== 'object' || !('name' in result) || result.name !== 'RapidCast' ||
      !('nodeHidden' in result) || result.nodeHidden !== true || !renderer?.sandboxed ||
      !('events' in result) || result.events !== 2 || !('source' in result) || result.source !== true ||
      !('scene' in result) || result.scene !== 'brb' || !('rejectsInvalidClient' in result) || !result.rejectsInvalidClient) {
    throw new Error('The studio smoke check failed. Inspect the UI and IPC boundaries.')
  }
  if (await (await import('electron')).safeStorage.isAsyncEncryptionAvailable()) {
    const storage = new Storage(app.getPath('userData'))
    const tokens = { clientId: 'smoke', accessToken: 'fake-access-smoke', refreshToken: 'fake-refresh-smoke', scopes: [], expiresAt: Date.now() + 1000 }
    await storage.saveTokens(tokens)
    const restored = await storage.readTokens()
    const encrypted = await readFile(join(app.getPath('userData'), 'twitch.bin'))
    if (restored?.accessToken !== tokens.accessToken || encrypted.includes(tokens.accessToken)) throw new Error('Secure storage round-trip failed.')
    await storage.clearTokens()
  } else throw new Error('Secure storage is unavailable for the native smoke test.')
  console.log('RapidCast smoke passed: five tabs, simulator, scenes, layer editing, IPC validation, encrypted storage, renderer isolation, sandbox.')
}
