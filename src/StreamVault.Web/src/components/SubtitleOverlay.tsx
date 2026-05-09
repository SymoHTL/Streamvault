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

const TIMESTAMP = /(?:\d{1,2}:)?\d{1,2}:\d{2}[,.]\d{1,3}/g;

function parseTimestamp(ts: string): number {
  const clean = ts.replace(',', '.').trim();
  const parts = clean.split(':').map(Number);
  if (parts.some(Number.isNaN)) return 0;
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  return parts[0] || 0;
}

function decodeEntities(value: string): string {
  const textarea = document.createElement('textarea');
  textarea.innerHTML = value;
  return textarea.value;
}

function cleanText(value: string): string {
  return decodeEntities(value)
    .replace(/\{\\[^}]+\}/g, '')
    .replace(/\{[^}]+\}/g, '')
    .replace(/<[^>]+>/g, '')
    .replace(/\\[nN]/g, '\n')
    .replace(/\r/g, '')
    .trim();
}

function parseCueBlocks(text: string): SubtitleCue[] {
  const cues: SubtitleCue[] = [];
  const normalized = text.replace(/\r/g, '').replace(/^\uFEFF/, '');
  const blocks = normalized.split(/\n{2,}/);

  for (const rawBlock of blocks) {
    const lines = rawBlock
      .split('\n')
      .map(line => line.trimEnd())
      .filter(line => line.trim() && !line.startsWith('NOTE '));
    if (lines.length === 0) continue;
    if (lines[0].startsWith('WEBVTT') || lines[0] === 'STYLE' || lines[0] === 'REGION') continue;

    const timeLineIndex = lines.findIndex(line => line.includes('-->'));
    if (timeLineIndex < 0) continue;

    const matches = lines[timeLineIndex].match(TIMESTAMP);
    if (!matches || matches.length < 2) continue;

    const cueText = cleanText(lines.slice(timeLineIndex + 1).join('\n'));
    if (!cueText) continue;

    cues.push({
      start: parseTimestamp(matches[0]),
      end: parseTimestamp(matches[1]),
      text: cueText,
    });
  }

  return cues;
}

function parseAss(text: string): SubtitleCue[] {
  const cues: SubtitleCue[] = [];
  for (const line of text.replace(/\r/g, '').split('\n')) {
    if (!line.startsWith('Dialogue:')) continue;
    const fields = line.slice('Dialogue:'.length).split(',');
    if (fields.length < 10) continue;

    const start = parseTimestamp(fields[1]);
    const end = parseTimestamp(fields[2]);
    const cueText = cleanText(fields.slice(9).join(','));
    if (!cueText) continue;

    cues.push({ start, end, text: cueText });
  }
  return cues;
}

function parseSubtitles(text: string): SubtitleCue[] {
  if (/\[Script Info\]|\[Events\]|^Dialogue:/m.test(text)) return parseAss(text);
  return parseCueBlocks(text);
}

export default function SubtitleOverlay({ subtitleUrl, currentTime, size, color, background, font }: SubtitleOverlayProps) {
  const [cues, setCues] = useState<SubtitleCue[]>([]);
  const prevUrlRef = useRef<string | null>(null);

  useEffect(() => {
    if (!subtitleUrl) {
      prevUrlRef.current = null;
      return;
    }
    if (subtitleUrl === prevUrlRef.current) return;
    prevUrlRef.current = subtitleUrl;

    const controller = new AbortController();
    const token = localStorage.getItem('accessToken');
    const url = subtitleUrl.includes('?')
      ? `${subtitleUrl}&access_token=${encodeURIComponent(token || '')}`
      : `${subtitleUrl}?access_token=${encodeURIComponent(token || '')}`;

    fetch(url, { signal: controller.signal })
      .then(r => (r.ok ? r.text() : Promise.reject(new Error(`Subtitle HTTP ${r.status}`))))
      .then(text => setCues(parseSubtitles(text)))
      .catch(() => {
        if (!controller.signal.aborted) setCues([]);
      });

    return () => controller.abort();
  }, [subtitleUrl]);

  if (!subtitleUrl || cues.length === 0) return null;

  const activeCues = cues.filter(c => currentTime >= c.start && currentTime <= c.end);
  if (activeCues.length === 0) return null;

  const fontSize = size === 'small' ? '1rem' : size === 'large' ? '1.75rem' : size === 'xlarge' ? '2.25rem' : '1.375rem';

  return (
    <div className="absolute bottom-24 left-0 right-0 flex flex-col items-center gap-1 pointer-events-none z-10 px-8">
      {activeCues.map((cue, i) => (
        <span
          key={`${cue.start}-${i}`}
          style={{
            fontSize,
            color: color || '#ffffff',
            backgroundColor: background || 'rgba(0,0,0,0.78)',
            padding: '2px 10px',
            borderRadius: '4px',
            fontFamily: font || 'inherit',
            textAlign: 'center',
            lineHeight: 1.4,
            whiteSpace: 'pre-wrap',
            maxWidth: '86%',
            textShadow: '0 2px 6px rgba(0,0,0,0.85)',
          }}
        >
          {cue.text}
        </span>
      ))}
    </div>
  );
}
