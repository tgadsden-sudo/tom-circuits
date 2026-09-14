import { describe, expect, it } from 'vitest';
import { classifyInputLabel, describeIdentity, pickPreferredExternal, UNVERIFIED_LABEL } from '../src/audio/devices';

describe('classifyInputLabel', () => {
  it('recognises likely USB/external adapters without depending on an exact product string', () => {
    for (const l of ['USB Audio Device', 'Sabrent USB Type-C Audio', 'AU-UCMA', 'External Microphone', 'C-Media USB Headphone Set', 'Line In (Scarlett 2i2)', 'Default - USB PnP Sound Device']) {
      expect(classifyInputLabel(l), l).toBe('external');
    }
  });
  it('recognises built-in microphones', () => {
    for (const l of ['MacBook Pro Microphone (Built-in)', 'iPhone Microphone', 'Internal Microphone', 'Microphone Array (Realtek Audio)']) {
      expect(classifyInputLabel(l), l).toBe('builtin');
    }
  });
  it('returns unknown for empty or unhelpful labels', () => {
    expect(classifyInputLabel('')).toBe('unknown');
    expect(classifyInputLabel(undefined)).toBe('unknown');
    expect(classifyInputLabel('Fake Default Audio Input')).toBe('unknown');
    expect(classifyInputLabel('Microphone')).toBe('unknown');
  });
});

describe('pickPreferredExternal', () => {
  it('prefers a Sabrent label, then any USB device, then other externals', () => {
    const list = [
      { deviceId: 'a', label: 'iPhone Microphone' },
      { deviceId: 'b', label: 'External Line In' },
      { deviceId: 'c', label: 'USB Audio Device' },
      { deviceId: 'd', label: 'Sabrent USB Audio' },
    ];
    expect(pickPreferredExternal(list)?.deviceId).toBe('d');
    expect(pickPreferredExternal(list.slice(0, 3))?.deviceId).toBe('c');
    expect(pickPreferredExternal(list.slice(0, 2))?.deviceId).toBe('b');
    expect(pickPreferredExternal(list.slice(0, 1))).toBeNull();
    expect(pickPreferredExternal([])).toBeNull();
  });
});

describe('describeIdentity', () => {
  it('never claims the adapter is connected without a recognisable label', () => {
    const r = describeIdentity('', '', 1);
    expect(r.identity).toBe('unverified');
    expect(r.label).toBe(UNVERIFIED_LABEL);
    expect(r.reason).toMatch(/only a default input/);
    const r2 = describeIdentity('Microphone', '', 3);
    expect(r2.identity).toBe('unverified');
    expect(r2.label).toBe(UNVERIFIED_LABEL);
  });
  it('recognises an external label from either the track or the device list', () => {
    expect(describeIdentity('USB Audio Device', '', 2).identity).toBe('recognised-external');
    expect(describeIdentity('', 'Sabrent USB Type-C Audio', 2).identity).toBe('recognised-external');
    expect(describeIdentity('USB Audio Device', '', 2).label).toBe('USB Audio Device');
  });
  it('flags a built-in microphone as not the adapter', () => {
    const r = describeIdentity('iPhone Microphone', '', 1);
    expect(r.identity).toBe('builtin');
    expect(r.label).toContain('not the adapter');
  });
});
