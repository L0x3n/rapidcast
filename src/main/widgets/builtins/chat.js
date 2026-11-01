let api, messages = [];
export default {
  meta: { name: 'Chat box', description: 'A bold, animated room for your audience. Host-provided emotes and avatars stay inside the canvas.', defaultSize: { w: 460, h: 640 }, params: {
    accent: { type: 'color', default: '#cbfa54' }, font: { type: 'string', default: 'Segoe UI' }, title: { type: 'string', default: 'THE ROOM' }, maxMessages: { type: 'number', default: 7, min: 1, max: 12 }
  } },
  init(host) { api = host; api.on('chat', event => { messages.push({ ...event, time: api.now() }); messages = messages.slice(-12); }); },
  update() {},
  draw(ctx, w, h) {
    ctx.fillStyle = '#0b1016df'; ctx.beginPath(); ctx.roundRect(0, 0, w, h, 22); ctx.fill();
    ctx.fillStyle = api.params.accent; ctx.fillRect(0, 0, 6, h);
    ctx.font = '900 22px ' + api.params.font; ctx.fillText(api.params.title, 25, 40);
    ctx.fillStyle = '#9aa9bc'; ctx.font = '13px monospace'; ctx.fillText('GOOD PEOPLE. GREAT MOMENTS.', 25, 65);
    const shown = messages.slice(-api.params.maxMessages); const row = Math.min(82, (h - 100) / Math.max(1, api.params.maxMessages));
    if (!shown.length) { ctx.fillStyle = '#91a0b2'; ctx.font = '18px sans-serif'; ctx.fillText('Chat, this stage is yours.', 25, 120); }
    shown.forEach((item, i) => {
      const y = 110 + i * row; const age = api.now() - item.time; const shift = Math.max(0, 14 - age / 20);
      ctx.globalAlpha = Math.min(1, age / 180); ctx.fillStyle = item.color || api.params.accent;
      const avatar = api.image('avatar:' + item.user.id);
      if (avatar) { ctx.save(); ctx.beginPath(); ctx.arc(38, y - 7, 14, 0, Math.PI * 2); ctx.clip(); ctx.drawImage(avatar, 24, y - 21, 28, 28); ctx.restore(); }
      ctx.font = '800 17px ' + api.params.font; ctx.fillText(item.user.name + (item.source === 'simulator' ? ' · TEST' : ''), avatar ? 62 : 25 + shift, y, w - 60);
      ctx.fillStyle = '#ecf0f5'; ctx.font = '16px sans-serif';
      let line = '', lineY = y + 26;
      for (const word of item.text.split(' ')) {
        if (ctx.measureText(line + word).width > w - 70) { ctx.fillText(line, 25 + shift, lineY); line = ''; lineY += 21; }
        if (lineY < y + row - 5) line += word + ' ';
      }
      ctx.fillText(line, 25 + shift, lineY, w - 65);
      let emoteX = w - 38;
      for (const emote of item.emotes.slice(0, 3)) { const image = api.image('emote:' + emote.id); if (image) { ctx.drawImage(image, emoteX, y - 18, 26, 26); emoteX -= 30; } }
    }); ctx.globalAlpha = 1;
  }
};
