let api, supporters = [];
export default {
  meta: { name: 'Recent events ticker', description: 'Recent supporters on a moving ticker, or rolling credits for your ending scene.', defaultSize: { w: 1500, h: 96 }, params: {
    title: { type: 'string', default: 'THE PEOPLE WHO MAKE IT HAPPEN' }, accent: { type: 'color', default: '#cbfa54' }, credits: { type: 'boolean', default: false }, font: { type: 'string', default: 'Segoe UI' }
  } },
  init(host) {
    api = host;
    ['follow', 'sub', 'cheer', 'raid', 'redeem'].forEach(type => api.on(type, event => {
      const name = event.type === 'raid' ? event.from.name : event.user.name;
      const label = event.type === 'cheer' ? event.bits + ' BITS' : event.type.toUpperCase();
      supporters.push(name + ' · ' + label + (event.source === 'simulator' ? ' · TEST' : '')); supporters = supporters.slice(-30);
    }));
  }, update() {},
  draw(ctx, w, h) {
    ctx.fillStyle = '#0b1219e8'; ctx.beginPath(); ctx.roundRect(0, 0, w, h, 16); ctx.fill();
    ctx.fillStyle = api.params.accent; ctx.fillRect(0, 0, 5, h);
    if (api.params.credits) {
      ctx.textAlign = 'center'; ctx.font = '900 28px ' + api.params.font; ctx.fillText(api.params.title, w / 2, 55, w - 60);
      ctx.font = '600 25px sans-serif'; ctx.fillStyle = '#edf4e7'; const lineHeight = 48;
      const names = supporters.length ? supporters : ['THANK YOU FOR BEING HERE'];
      const travel = (api.now() / 40) % (names.length * lineHeight + h - 90);
      ctx.save(); ctx.beginPath(); ctx.rect(20, 80, w - 40, h - 95); ctx.clip();
      names.forEach((name, i) => ctx.fillText(name, w / 2, h + i * lineHeight - travel, w - 60)); ctx.restore();
    } else {
      ctx.font = '900 20px ' + api.params.font; ctx.fillText('RECENT ENERGY ↗', 24, 38);
      ctx.font = '600 20px sans-serif'; ctx.fillStyle = '#e5eddf';
      const line = supporters.length ? supporters.join('    ✦    ') : 'YOUR NEXT GREAT SUPPORTER COULD BE IN CHAT RIGHT NOW';
      const width = ctx.measureText(line).width + 120; const x = w - (api.now() / 25) % (width + w);
      ctx.fillText(line, x, 73);
    }
  }
};
