import { useEffect, useRef } from 'react'
import { Chart, LineController, LineElement, PointElement, LinearScale, Tooltip, Legend, type Plugin } from 'chart.js'
import type { StatsDataset } from '../../shared/stats'

Chart.register(LineController, LineElement, PointElement, LinearScale, Tooltip, Legend)
type Point = { x: number; y: number | null }
export function Timeline({ data, startedAt }: { data: StatsDataset; startedAt: number }): React.JSX.Element {
  const canvas = useRef<HTMLCanvasElement>(null)
  const chart = useRef<Chart<'line', Point[]> | null>(null)
  const current = useRef({ data, startedAt }); current.current = { data, startedAt }
  useEffect(() => {
    if (!canvas.current) return
    const markers: Plugin<'line'> = { id: 'widget-moments', afterDatasetsDraw(c) {
      const { ctx, chartArea, scales } = c; if (!scales.x) return
      ctx.save(); ctx.strokeStyle = '#ffad66'; ctx.lineWidth = 1; ctx.setLineDash([3, 5])
      for (const marker of current.current.data.markers) {
        const x = scales.x.getPixelForValue((marker.at - current.current.startedAt) / 60000)
        if (x < chartArea.left || x > chartArea.right) continue
        ctx.beginPath(); ctx.moveTo(x, chartArea.top); ctx.lineTo(x, chartArea.bottom); ctx.stroke()
      }
      ctx.restore()
    } }
    chart.current = new Chart(canvas.current, { type: 'line', plugins: [markers], data: { datasets: [] }, options: {
      responsive: true, maintainAspectRatio: false, animation: false, parsing: false, spanGaps: false,
      interaction: { mode: 'nearest', axis: 'x', intersect: false },
      scales: { x: { type: 'linear', min: 0, ticks: { color: '#9ba9ba', maxTicksLimit: 10 }, grid: { color: '#252e39' }, title: { display: true, text: 'Elapsed minutes', color: '#9ba9ba' } },
        y: { min: 0, ticks: { color: '#cbfa54', precision: 0 }, grid: { color: '#252e39' }, title: { display: true, text: 'Messages in minute', color: '#cbfa54' } },
        viewers: { min: 0, position: 'right', ticks: { color: '#75baff', precision: 0 }, grid: { drawOnChartArea: false }, title: { display: true, text: 'Twitch viewers (sampled)', color: '#75baff' } } },
      plugins: { legend: { labels: { color: '#dce4ee', usePointStyle: true, boxWidth: 8 } }, tooltip: { callbacks: {
        title: items => `Minute ${items[0]?.parsed.x?.toFixed(1) ?? '0'}`,
        afterBody: items => { const at = current.current.startedAt + (items[0]?.parsed.x ?? 0) * 60000; const names = current.current.data.markers.filter(m => Math.abs(m.at - at) < 60000).slice(0, 6).map(m => m.widgetName); return names.length ? ['Nearby widget triggers:', ...names] : [] }
      } } }
    } })
    return () => { chart.current?.destroy(); chart.current = null }
  }, [])
  useEffect(() => {
    const c = chart.current; if (!c) return
    c.data.datasets = [{ label: data.source === 'simulator' ? 'TEST messages / minute' : 'Messages / minute', data: data.points.map(p => ({ x: (p.at - startedAt) / 60000, y: p.messages })), borderColor: '#cbfa54', backgroundColor: '#cbfa54', borderWidth: 2, pointRadius: 2, pointHitRadius: 12, tension: .15 },
      ...(data.source === 'twitch' ? [{ label: 'Sampled Twitch viewers', yAxisID: 'viewers', data: data.viewerTimeline.map(p => ({ x: (p.at - startedAt) / 60000, y: p.value })), borderColor: '#75baff', backgroundColor: '#75baff', borderWidth: 2, pointRadius: 3, tension: 0 }] : [])]
    c.options.scales!.x!.max = Math.max(1, data.points.length)
    c.options.scales!.viewers!.display = data.source === 'twitch'; c.update('none')
  }, [data, startedAt])
  return <div className="stats-chart"><canvas ref={canvas} role="img" aria-label={`${data.source} chat activity and viewer timeline. Orange dotted lines mark visible widget triggers. Numeric totals and widget comparisons are available below.`} /></div>
}
