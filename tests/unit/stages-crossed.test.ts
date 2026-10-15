import { describe, expect, it } from 'vitest';
import { stagesCrossed } from '@/lib/status-rules';

describe('stagesCrossed', () => {
  it('returns just the next stage for a single step', () => {
    expect(stagesCrossed('PROSPECT', 'ENGAGED')).toEqual(['ENGAGED']);
  });

  it('returns every stage skipped over, so no commission trigger is missed', () => {
    // Dragging a card from Prospect straight to "I-526E filed" must still
    // release the on-funding commission and record the Funded conversion.
    expect(stagesCrossed('PROSPECT', 'I526E_FILED')).toEqual(['ENGAGED', 'FUNDED', 'I526E_FILED']);
  });

  it('handles a move from the very start of the pipeline', () => {
    expect(stagesCrossed(undefined, 'FUNDED')).toEqual(['FUNDED']);
  });

  it('never applies side effects for Lost', () => {
    expect(stagesCrossed('FUNDED', 'LOST')).toEqual([]);
  });

  it('applies only the destination when moving backwards', () => {
    expect(stagesCrossed('I526E_APPROVED', 'ENGAGED')).toEqual(['ENGAGED']);
  });

  it('treats a move out of Lost as landing on the destination only', () => {
    expect(stagesCrossed('LOST', 'ENGAGED')).toEqual(['ENGAGED']);
  });
});
