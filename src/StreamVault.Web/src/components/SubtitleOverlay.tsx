import { useState, useEffect, useRef } from 'react';

interface SubtitleOverlayProps {
  subtitleUrl: string | null;
  currentTime: number;
  size?: string;
  color?: string;
  background?: string;
  font?: string;
}

interface SubtitleCue {
  start: number;
  end: number;
  text: string;
}

function parseTimestamp(ts: string): number {
  // Handle HH:MM:SS,mmm or HH:MM:SS.mmm or MM:SS,mmm
  const clean = ts.replace(',', '.').trim();
  const parts = clean.split(':');
  if (parts.length === 3) {
    return parseFloat(parts[0]) * 3600 + parseFloat(parts[1]) * 60 + parseFloat(parts[2]);
  }
  if (parts.length === 2) {
    return parseFloat(parts[0]) * 60 + parseFloat(parts[1]);
  }
  return 0;
}

function parseSrt(text: string): SubtitleCue[] {
  const cues: SubtitleCue[] = [];
  const blocks = text.trim().split(/\n\s*\n/);
  for (const block of blocks) {
    const lines = block.trim().split('\n');
    if (lines.length < 3) continue;
    const timeLine = lines[1];
    const match = timeLine.match(/(\S+)\s*-->\s*(\S+)/);
    if (!match) continue;
    const start = parseTimestamp(match[1]);
    const end = parseTimestamp(match[2]);
    const text = lines.slice(2).join('\n')
      .replace(/<[^>]+>/g, '') // strip HTML tags
      .replace(/\{[^}]+\}/g, ''); // strip ASS tags
    cues.push({ start, end, text });
  }
  return cues;
}

function parseVtt(text: string): SubtitleCue[] {
  // VTT is similar to SRT but has a WEBVTT header
  const body = text.replace(/^WEBVTT[^\n]*\n/, '').trim();
  return parseSrt(body);
}

export default function SubtitleOverlay({ subtitleUrl, currentTime, size, color, background, font }: SubtitleOverlayProps) {
  const [cues, setCues] = useState<SubtitleCue[]>([]);
  const prevUrlRef = useRef<string | null>(null);

  useEffect(() => {
    if (!subtitleUrl || subtitleUrl === prevUrlRef.current) return;
    prevUrlRef.current = subtitleUrl;
    
    const token = localStorage.getItem('accessToken');
    const url = subtitleUrl.includes('?')
      ? `${subtitleUrl}&access_token=${encodeURIComponent(token || '')}`
      : `${subtitleUrl}?access_token=${encodeURIComponent(token || '')}`;

    fetch(url)
      .then(r => r.text())
      .then(text => {
        if (text.trimStart().startsWith('WEBVTT')) {
          setCues(parseVtt(text));
        } else {
          setCues(parseSrt(text));
        }
      })
      .catch(() => setCues([]));
  }, [subtitleUrl]);

  if (cues.length === 0) return null;

  const activeCues = cues.filter(c => currentTime >= c.start && currentTime <= c.end);
  if (activeCues.length === 0) return null;

  const fontSize = size === 'small' ? '1rem' : size === 'large' ? '1.75rem' : size === 'xlarge' ? '2.25rem' : '1.375rem';

  return (
    <div className="absolute bottom-20 left-0 right-0 flex flex-col items-center pointer-events-none z-10 px-8">
      {activeCues.map((cue, i) => (
        <span
          key={i}
          style={{
            fontSize,
            color: color || '#ffffff',
            backgroundColor: background || 'rgba(0,0,0,0.75)',
            padding: '2px 10px',
            borderRadius: '4px',
            fontFamily: font || 'inherit',
            textAlign: 'center',
            lineHeight: 1.4,
            whiteSpace: 'pre-wrap',
            maxWidth: '80%',
          }}
          dangerouslySetInnerHTML={{ __html: cue.text.replace(/\n/g, '<br/>') }}
        />
      ))}
    </div>
  );
}
