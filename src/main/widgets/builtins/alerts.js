let api, queue = [], active = null, particles = [];
function receive(event) {
  if (api.now() - event.receivedAt > api.params.seconds * 1000) return;
  let title = '', detail = '';
  if (event.type === 'follow') { title = 'NEW FOLLOWER'; detail = event.user.name + ' joined the show'; }
  if (event.type === 'sub') { title = event.kind === 'gift' ? 'GIFT SUBS' : 'NEW SUBSCRIBER'; detail = event.user.name + (event.kind === 'gift' ? ' gifted ' + event.count + ' subs' : ' is part of the crew'); }
  if (event.type === 'cheer') { title = 'BIG ENERGY'; detail = event.user.name + ' cheered ' + event.bits + ' bits'; }
  if (event.type === 'raid') { title = 'RAID INCOMING'; detail = event.from.name + ' brought ' + event.viewers + ' friends'; }
  queue.push({ title, detail, test: event.source === 'simulator' }); queue = queue.slice(-8);
}
export default {
  meta: { name: 'Alert box', description: 'Loud neon alerts with code-drawn confetti for follows, subs, bits and raids.', defaultSize: { w: 760, h: 260 }, params: {
    accent: { type: 'color', default: '#cbfa54' }, font: { type: 'string', default: 'Segoe UI' }, seconds: { type: 'number', default: 5, min: 1, max: 15 }
  } },
  init(host) { api = host; ['follow', 'sub', 'cheer', 'raid'].forEach(type => api.on(type, receive)); },
  update(dt) {
    if (!active && queue.length) {
      active = { ...queue.shift(), started: api.now() };
      particles = Array.from({ length: 38 }, () => ({ x: api.random(), y: api.random() * .2, vx: (api.random() - .5) * .3, vy: .1 + api.random() * .4, angle: api.random() * 6.28 }));
    }
    if (active && api.now() - active.started > api.params.seconds * 1000) active = null;
    particles.forEach(p => { p.x += p.vx * dt; p.y += p.vy * dt; p.angle += dt * 3; });
  },
  draw(ctx, w, h) {
    if (!active) return;
    const age = (api.now() - active.started) / 1000; const end = api.params.seconds - age;
    const fade = Math.min(1, age * 5, end * 4); const offset = (1 - fade) * 45;
    ctx.globalAlpha = Math.max(0, fade); ctx.translate(0, offset);
    const glow = ctx.createLinearGradient(0, 0, w, h); glow.addColorStop(0, '#1c2d13f5'); glow.addColorStop(1, '#0c1517f5');
    ctx.fillStyle = glow; ctx.shadowColor = api.params.accent; ctx.shadowBlur = 24; ctx.beginPath(); ctx.roundRect(12, 40, w - 24, h - 60, 22); ctx.fill(); ctx.shadowBlur = 0;
    ctx.strokeStyle = api.params.accent; ctx.lineWidth = 3; ctx.stroke();
    ctx.fillStyle = api.params.accent; ctx.font = '900 22px monospace'; ctx.textAlign = 'center'; ctx.fillText((active.test ? 'TEST · ' : '') + active.title, w / 2, 96);
    ctx.fillStyle = '#ffffff'; ctx.font = '900 32px ' + api.params.font; ctx.fillText(active.detail, w / 2, 153, w - 75);
    ctx.fillStyle = '#c5d5bc'; ctx.font = '16px sans-serif'; ctx.fillText('YOU MAKE THIS SHOW.', w / 2, 188);
    particles.forEach((p, i) => { ctx.save(); ctx.translate(p.x * w, p.y * h); ctx.rotate(p.angle); ctx.fillStyle = i % 3 ? api.params.accent : '#ffffff'; ctx.fillRect(-3, -7, 6, 14); ctx.restore(); });
  }
};
