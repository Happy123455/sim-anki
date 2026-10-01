import { useMemo } from 'react';
import qrcode from 'qrcode-generator';

/** Crisp, theme-independent QR code (always dark-on-white so phone cameras read it). */
export default function QrCode({ text, size = 200, label = 'QR code' }) {
  const { path, count } = useMemo(() => {
    const qr = qrcode(0, 'M');
    qr.addData(text);
    qr.make();
    const n = qr.getModuleCount();
    let d = '';
    for (let r = 0; r < n; r++) {
      for (let c = 0; c < n; c++) {
        if (qr.isDark(r, c)) d += `M${c},${r}h1v1h-1z`;
      }
    }
    return { path: d, count: n };
  }, [text]);

  const quiet = 3;
  return (
    <svg
      role="img"
      aria-label={label}
      width={size}
      height={size}
      viewBox={`${-quiet} ${-quiet} ${count + quiet * 2} ${count + quiet * 2}`}
      shapeRendering="crispEdges"
      style={{ display: 'block', borderRadius: '12px', background: '#fff' }}
    >
      <rect x={-quiet} y={-quiet} width={count + quiet * 2} height={count + quiet * 2} fill="#fff" />
      <path d={path} fill="#111" />
    </svg>
  );
}
