let api;
export default {
  meta: { name: 'Countdown', description: 'A big, readable countdown with a persistent start time and animated progress ring.', defaultSize: { w: 720, h: 380 }, params: {
    title: { type: 'string', default: 'STARTING SOON' }, duration: { type: 'number', default: 300, min: 1, max: 86400 }, accent: { type: 'color', default: '#cbfa54' }
  } },
  init(host) { api = host; }, update() {},
  draw(ctx, w, h) {
    const remaining = Math.max(0, api.params.duration - (api.now() - api.params._createdAt) / 1000);
    const value = Math.ceil(remaining); const minutes = Math.floor(value / 60); const seconds = String(value % 60).padStart(2, '0');
    ctx.fillStyle = '#0b1317ed'; ctx.beginPath(); ctx.roundRect(0, 0, w, h, 26); ctx.fill();
    ctx.textAlign = 'center'; ctx.fillStyle = '#d5e2ca'; ctx.font = '800 24px sans-serif'; ctx.fillText(api.params.title, w / 2, 73);
    ctx.fillStyle = api.params.accent; ctx.shadowColor = api.params.accent; ctx.shadowBlur = 22; ctx.font = '900 118px monospace'; ctx.fillText(minutes + ':' + seconds, w / 2, 220); ctx.shadowBlur = 0;
    ctx.fillStyle = '#30402e'; ctx.beginPath(); ctx.roundRect(60, h - 87, w - 120, 9, 5); ctx.fill();
    ctx.fillStyle = api.params.accent; ctx.beginPath(); ctx.roundRect(60, h - 87, Math.max(1, (w - 120) * remaining / api.params.duration), 9, 5); ctx.fill();
    ctx.fillStyle = '#acbda2'; ctx.font = '18px sans-serif'; ctx.fillText(remaining ? 'GET COMFORTABLE. IT IS ALMOST SHOWTIME.' : 'LET’S MAKE A MOMENT.', w / 2, h - 35, w - 60);
  }
};
