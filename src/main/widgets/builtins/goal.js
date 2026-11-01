let api, follows = 0, pulse = 0;
export default {
  meta: { name: 'Goal bar', description: 'A follow goal that pulses when the room grows. Add your existing total as the starting value.', defaultSize: { w: 620, h: 150 }, params: {
    title: { type: 'string', default: 'BUILD THE CREW' }, goal: { type: 'number', default: 100, min: 1, max: 1000000 }, current: { type: 'number', default: 0, min: 0, max: 1000000 }, accent: { type: 'color', default: '#cbfa54' }, font: { type: 'string', default: 'Segoe UI' }
  } },
  init(host) { api = host; api.on('follow', () => { follows++; pulse = 1; }); }, update(dt) { pulse = Math.max(0, pulse - dt); },
  draw(ctx, w, h) {
    const total = api.params.current + follows; const fraction = Math.min(1, total / api.params.goal);
    ctx.fillStyle = '#0a1319ec'; ctx.beginPath(); ctx.roundRect(0, 0, w, h, 18); ctx.fill();
    ctx.fillStyle = '#e4eddb'; ctx.font = '900 20px ' + api.params.font; ctx.fillText(api.params.title, 25, 38);
    ctx.textAlign = 'right'; ctx.fillStyle = api.params.accent; ctx.fillText(total + ' / ' + api.params.goal, w - 25, 38);
    ctx.fillStyle = '#27362c'; ctx.beginPath(); ctx.roundRect(25, 63, w - 50, 30, 15); ctx.fill();
    const gradient = ctx.createLinearGradient(25, 0, w - 25, 0); gradient.addColorStop(0, '#5e9c21'); gradient.addColorStop(1, api.params.accent);
    ctx.fillStyle = gradient; ctx.shadowColor = api.params.accent; ctx.shadowBlur = 8 + pulse * 26; ctx.beginPath(); ctx.roundRect(25, 63, Math.max(1, (w - 50) * fraction), 30, 15); ctx.fill(); ctx.shadowBlur = 0;
    ctx.textAlign = 'left'; ctx.font = '14px monospace'; ctx.fillStyle = '#93a48f'; ctx.fillText(fraction >= 1 ? 'GOAL REACHED. THIS IS YOUR MOMENT.' : 'ONE MORE PERSON. ONE MORE POSSIBILITY.', 25, 125);
  }
};
