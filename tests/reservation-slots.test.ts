import { describe, expect, it } from 'vitest';
import { generateSlots, fromMinutes, toMinutes } from '../src/modules/reservations/slots';

describe('reservation time slots', () => {
  it('generates fixed slots that finish before closing', () => {
    expect(generateSlots('11:00', '14:00', 60)).toEqual(['11:00', '12:00', '13:00']);
  });
  it('converts HH:mm values consistently', () => {
    expect(toMinutes('12:30')).toBe(750);
    expect(fromMinutes(750)).toBe('12:30');
  });
  it('returns no slots for an invalid duration', () => {
    expect(generateSlots('11:00', '22:00', 0)).toEqual([]);
  });
});
