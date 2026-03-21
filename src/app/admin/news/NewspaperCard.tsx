interface NewspaperCardProps {
  title: string
  category: string
  sourcePaper?: string
  date?: string
}

export default function NewspaperCard({ title, category, sourcePaper, date }: NewspaperCardProps) {
  return (
    <div
      className="relative overflow-hidden w-full"
      style={{
        minHeight: '230px',
        backgroundColor: '#f5f0e8',
        backgroundImage: [
          // horizontal text-line rows (newsprint simulation)
          'repeating-linear-gradient(0deg, rgba(80,60,30,0.10) 0px, rgba(80,60,30,0.10) 1.5px, transparent 1.5px, transparent 9px)',
          // vertical column separators
          'repeating-linear-gradient(90deg, rgba(80,60,30,0.07) 0px, rgba(80,60,30,0.07) 1px, transparent 1px, transparent 148px)',
        ].join(', '),
      }}
    >
      {/* Central title band */}
      <div
        className="absolute inset-x-0 flex flex-col items-center justify-center gap-1.5 px-8 py-5 text-center"
        style={{
          top: '18%',
          minHeight: '60%',
          background: 'rgba(249,244,233,0.94)',
          borderTop: '1px solid rgba(80,60,30,0.22)',
          borderBottom: '1px solid rgba(80,60,30,0.22)',
        }}
      >
        {/* Category label */}
        <p
          style={{
            fontFamily: 'Georgia, "Times New Roman", serif',
            fontSize: 10,
            letterSpacing: '2.5px',
            color: '#8b1a1a',
            textTransform: 'uppercase',
            fontWeight: 700,
            marginBottom: 2,
          }}
        >
          {category || 'Legal News'}
        </p>

        {/* Thin decorative rule */}
        <div style={{ width: 72, height: 1, background: '#c0a882', marginBottom: 4 }} />

        {/* Article title */}
        <p
          style={{
            fontFamily: 'Georgia, "Times New Roman", serif',
            fontWeight: 700,
            fontSize: 20,
            lineHeight: 1.32,
            color: '#1a1008',
            display: '-webkit-box',
            WebkitLineClamp: 4,
            WebkitBoxOrient: 'vertical',
            overflow: 'hidden',
          } as React.CSSProperties}
        >
          {title}
        </p>
      </div>

      {/* Source + date strip at bottom */}
      {(sourcePaper || date) && (
        <div
          className="absolute bottom-0 inset-x-0 flex items-center justify-center gap-1.5 px-4 py-2"
          style={{
            background: 'rgba(245,240,232,0.88)',
            borderTop: '1px solid rgba(80,60,30,0.10)',
          }}
        >
          <span
            style={{
              fontFamily: 'Georgia, "Times New Roman", serif',
              fontSize: 10,
              color: 'rgba(80,60,30,0.50)',
              letterSpacing: '0.5px',
            }}
          >
            {[sourcePaper, date].filter(Boolean).join(' · ')}
          </span>
        </div>
      )}
    </div>
  )
}
