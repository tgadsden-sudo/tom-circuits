export type SourceTab = 'demo' | 'microphone' | 'external';

export const TAB_LABELS: Record<SourceTab, string> = {
  demo: 'Demo signals',
  microphone: 'Microphone',
  external: 'USB audio / Sabrent',
};
