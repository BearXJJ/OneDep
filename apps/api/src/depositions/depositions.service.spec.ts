import { describe, expect, it } from 'vitest';
import { DepositionsService } from './depositions.service.js';

type Merge = DepositionsService['merge'];
const service = Object.create(
  DepositionsService.prototype,
) as DepositionsService;

function previous(): Parameters<Merge>[0] {
  return {
    answers: {
      title: 'Edited title',
      molecules: [
        { recordId: 'old', name: 'Old protein' },
        { recordId: 'kept', name: 'Edited protein' },
      ],
    },
    origins: [
      { address: { field: 'title' }, source: 'user' },
      {
        address: {
          collection: 'molecules',
          recordId: 'old',
          field: 'recordId',
        },
        source: 'file',
      },
      {
        address: { collection: 'molecules', recordId: 'old', field: 'name' },
        source: 'user',
      },
      {
        address: {
          collection: 'molecules',
          recordId: 'kept',
          field: 'recordId',
        },
        source: 'file',
      },
      {
        address: { collection: 'molecules', recordId: 'kept', field: 'name' },
        source: 'user',
      },
    ],
  } as unknown as Parameters<Merge>[0];
}
const file = { id: 2, revision: 2 } as Parameters<Merge>[1];

describe('coordinate replacement', () => {
  it('replaces entity membership and removes obsolete origins while retaining edits on surviving entities', () => {
    const current = previous();
    const result = service['merge'](current, file, {
      records: ['kept', 'new'].map((id) => ({
        collection: 'molecules',
        recordId: id,
        sourceRowKey: id,
      })),
      values: [
        {
          address: { field: 'title' },
          value: 'File title',
          tag: '_struct.title',
        },
        {
          address: { collection: 'molecules', recordId: 'kept', field: 'name' },
          value: 'File protein',
          tag: '_entity.pdbx_description',
        },
        {
          address: { collection: 'molecules', recordId: 'new', field: 'name' },
          value: 'New protein',
          tag: '_entity.pdbx_description',
        },
      ],
    });
    expect(result.answers.molecules).toEqual([
      { recordId: 'kept', name: 'Edited protein' },
      { recordId: 'new', name: 'New protein' },
    ]);
    expect(
      result.origins.some((origin) => origin.address.recordId === 'old'),
    ).toBe(false);
    expect(result.answers.title).toBe('Edited title');
    expect(result.conflicts).toHaveLength(2);
    expect(current.answers).toHaveProperty('molecules.0.recordId', 'old');
  });

  it('clears a parsed collection when the replacement has no records in it', () => {
    const result = service['merge'](previous(), file, {
      records: [],
      values: [],
    });
    expect(result.answers.molecules).toEqual([]);
    expect(result.origins).toEqual([
      { address: { field: 'title' }, source: 'user' },
    ]);
  });
});
