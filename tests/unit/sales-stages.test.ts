import { describe, expect, it } from 'vitest';
import { SALES_STAGES, SALES_STAGE_HEADING, STATUS_ORDER, stageNeedsAttorney } from '@/lib/pipeline';

describe('the sales board stages', () => {
  it('covers exactly the four stages where revenue is still being won', () => {
    expect(SALES_STAGES).toEqual(['PROSPECT', 'ENGAGED', 'FUNDED', 'I526E_FILED']);
  });

  it('follows the order of the underlying pipeline', () => {
    const positions = SALES_STAGES.map((stage) => STATUS_ORDER.indexOf(stage));
    expect(positions).toEqual([...positions].sort((a, b) => a - b));
  });

  it('names every column it shows', () => {
    for (const stage of SALES_STAGES) {
      expect(SALES_STAGE_HEADING[stage]?.length ?? 0).toBeGreaterThan(0);
    }
  });

  it('leaves the later lifecycle stages off the board', () => {
    // Those cases are history or accounts receivable, not live sales.
    expect(SALES_STAGES).not.toContain('I526E_APPROVED');
    expect(SALES_STAGES).not.toContain('I829_APPROVED');
    expect(SALES_STAGES).not.toContain('LOST');
  });
});

describe('stageNeedsAttorney', () => {
  it('asks for the attorney from Engaged onwards, as requested', () => {
    expect(stageNeedsAttorney('PROSPECT')).toBe(false);
    expect(stageNeedsAttorney('ENGAGED')).toBe(true);
    expect(stageNeedsAttorney('FUNDED')).toBe(true);
    expect(stageNeedsAttorney('I526E_FILED')).toBe(true);
  });

  it('does not ask for one on a dead deal', () => {
    expect(stageNeedsAttorney('LOST')).toBe(false);
  });
});
