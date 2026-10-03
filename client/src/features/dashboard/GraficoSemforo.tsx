/**
 * Mini-gráfico de barras del semáforo — canvas propio (sin librerías).
 * Accesible: role="img" + aria-label con resumen textual, ejes etiquetados,
 * número sobre cada barra (la información jamás depende solo del color) y
 * tooltip simple al pasar el cursor. Los colores salen de los tokens semánticos.
 */
import { useEffect, useRef, useState } from 'react'
import { CATEGORIAS, cssVar, type ClaveColor } from './semforo'

interface Props {
  conteos: Record<ClaveColor, number>
}

interface Barras {
  x: number
  y: number
  w: number
  h: number
  clave: ClaveColor
}

const ALTO = 190
const PAD = { arriba: 26, abajo: 42, izq: 34, der: 12 }

export default function GraficoSemforo({ conteos }: Props) {
  const contenedorRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const barrasRef = useRef<Barras[]>([])
  const [tooltip, setTooltip] = useState<{ left: number; top: number; texto: string } | null>(null)

  const resumen = CATEGORIAS.map((c) => `${c.etiqueta} ${conteos[c.clave]}`).join(', ')
  const ariaLabel = `Gráfico de barras del semáforo NFPA 10. ${resumen}.`

  useEffect(() => {
    const canvas = canvasRef.current
    const cont = contenedorRef.current
    if (!canvas || !cont) return

    const dibujar = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      const ancho = cont.clientWidth || 320
      canvas.width = Math.round(ancho * dpr)
      canvas.height = Math.round(ALTO * dpr)
      canvas.style.width = `${ancho}px`
      canvas.style.height = `${ALTO}px`
      const ctx = canvas.getContext('2d')
      if (!ctx) return
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.clearRect(0, 0, ancho, ALTO)

      const colores: Record<ClaveColor, string> = {
        verde: cssVar('ok'),
        amarillo: cssVar('warn'),
        rojo: cssVar('err'),
        negro: cssVar('text'), // rechazado: negro en tema claro; en oscuro se refuerza con borde err
      }
      const texto = cssVar('text2')
      const grid = cssVar('border')
      const bordeErr = cssVar('err')

      const areaAncho = ancho - PAD.izq - PAD.der
      const areaAlto = ALTO - PAD.arriba - PAD.abajo
      const max = Math.max(1, ...CATEGORIAS.map((c) => conteos[c.clave]))
      const paso = Math.max(1, Math.ceil(max / 4))
      const top = paso * Math.ceil(max / paso)

      // eje Y + rejilla
      ctx.font = '11px ui-monospace, SFMono-Regular, Menlo, monospace'
      ctx.textBaseline = 'middle'
      ctx.textAlign = 'right'
      ctx.strokeStyle = grid
      ctx.fillStyle = texto
      ctx.lineWidth = 1
      for (let t = 0; t <= top; t += paso) {
        const y = PAD.arriba + areaAlto - (t / top) * areaAlto
        ctx.beginPath()
        ctx.moveTo(PAD.izq, y + 0.5)
        ctx.lineTo(ancho - PAD.der, y + 0.5)
        ctx.globalAlpha = t === 0 ? 1 : 0.45
        ctx.stroke()
        ctx.globalAlpha = 1
        ctx.fillText(String(t), PAD.izq - 6, y)
      }

      // barras
      const n = CATEGORIAS.length
      const slot = areaAncho / n
      const bw = Math.min(56, slot * 0.58)
      const barras: Barras[] = []
      CATEGORIAS.forEach((cat, i) => {
        const v = conteos[cat.clave]
        const h = (v / top) * areaAlto
        const x = PAD.izq + slot * i + (slot - bw) / 2
        const y = PAD.arriba + areaAlto - h
        barras.push({ x, y, w: bw, h, clave: cat.clave })
        ctx.fillStyle = colores[cat.clave]
        ctx.fillRect(x, y, bw, h)
        if (cat.clave === 'negro' && h > 0) {
          ctx.strokeStyle = bordeErr
          ctx.lineWidth = 2
          ctx.strokeRect(x + 1, y + 1, bw - 2, Math.max(h - 2, 0))
          // trama diagonal: "rechazado" reconocible sin depender del color
          ctx.save()
          ctx.beginPath()
          ctx.rect(x, y, bw, h)
          ctx.clip()
          ctx.strokeStyle = bordeErr
          ctx.globalAlpha = 0.55
          ctx.lineWidth = 1.5
          for (let d = -h; d < bw; d += 8) {
            ctx.beginPath()
            ctx.moveTo(x + d, y + h)
            ctx.lineTo(x + d + h, y)
            ctx.stroke()
          }
          ctx.restore()
        }
        // cantidad sobre la barra (texto, no solo color)
        ctx.fillStyle = cssVar('text')
        ctx.font = 'bold 13px ui-monospace, SFMono-Regular, Menlo, monospace'
        ctx.textAlign = 'center'
        ctx.fillText(String(v), x + bw / 2, Math.max(y - 10, PAD.arriba - 14))
        // etiqueta eje X
        ctx.fillStyle = texto
        ctx.font = '11px sans-serif'
        ctx.fillText(cat.etiqueta, x + bw / 2, ALTO - PAD.abajo + 14)
      })
      barrasRef.current = barras

      // rótulo del eje Y
      ctx.save()
      ctx.fillStyle = texto
      ctx.font = '11px sans-serif'
      ctx.translate(12, PAD.arriba + areaAlto / 2)
      ctx.rotate(-Math.PI / 2)
      ctx.textAlign = 'center'
      ctx.fillText('extintores', 0, 0)
      ctx.restore()
    }

    dibujar()
    const ro = new ResizeObserver(dibujar)
    ro.observe(cont)
    const mo = new MutationObserver(dibujar)
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })
    return () => {
      ro.disconnect()
      mo.disconnect()
    }
  }, [conteos])

  const onMove = (ev: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = canvasRef.current?.getBoundingClientRect()
    if (!rect) return
    const mx = ev.clientX - rect.left
    const my = ev.clientY - rect.top
    const hit = barrasRef.current.find((b) => mx >= b.x && mx <= b.x + b.w && my >= b.y - 6 && my <= b.y + b.h)
    if (hit) {
      const cat = CATEGORIAS.find((c) => c.clave === hit.clave)
      setTooltip({
        left: Math.min(mx + 10, rect.width - 120),
        top: hit.y - 8,
        texto: `${cat?.etiqueta}: ${conteos[hit.clave]} extintores`,
      })
    } else {
      setTooltip(null)
    }
  }

  return (
    <figure className="m-0" ref={contenedorRef}>
      <div className="relative">
        <canvas
          ref={canvasRef}
          role="img"
          aria-label={ariaLabel}
          onMouseMove={onMove}
          onMouseLeave={() => setTooltip(null)}
        />
        {tooltip && (
          <div
            aria-hidden="true"
            className="pointer-events-none absolute z-10 rounded-md border border-border bg-surface px-2 py-1 text-xs text-text shadow-lg"
            style={{ left: tooltip.left, top: tooltip.top }}
          >
            {tooltip.texto}
          </div>
        )}
      </div>
      <figcaption className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-text2">
        {CATEGORIAS.map((c) => (
          <span key={c.clave} className="inline-flex items-center gap-1.5">
            <span className={`h-2.5 w-2.5 rounded-sm ${c.clasePunto}`} aria-hidden="true" />
            {c.etiqueta} ({conteos[c.clave]})
          </span>
        ))}
      </figcaption>
    </figure>
  )
}
