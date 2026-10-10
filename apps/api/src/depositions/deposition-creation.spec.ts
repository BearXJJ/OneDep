import { BadRequestException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';

import { parseCreationOptions } from './deposition-creation.js';

describe('投递创建参数', () => {
  it('为 X 射线投递申请 PDB 编号', () => {
    const result = parseCreationOptions({ methods: ['XRAY'] });

    expect(result).toEqual({
      methods: ['XRAY'],
      emSubtype: null,
      coordinates: null,
      emMapStatus: null,
      relatedEmdb: '',
      compositeMap: null,
      nmrDataPreviouslyDeposited: null,
      relatedBmrb: '',
      accessionCodes: ['PDB'],
    });
  });

  it('保留电子显微镜条件答案并申请 PDB 与 EMDB 编号', () => {
    const result = parseCreationOptions({
      methods: ['EM'],
      emSubtype: 'SINGLE_PARTICLE',
      coordinates: true,
      emMapStatus: 'NEW_MAP',
      compositeMap: false,
    });

    expect(result).toMatchObject({
      methods: ['EM'],
      emSubtype: 'SINGLE_PARTICLE',
      coordinates: true,
      emMapStatus: 'NEW_MAP',
      compositeMap: false,
      accessionCodes: ['PDB', 'EMDB'],
    });
  });

  it('拒绝不含坐标的 EM 与 NMR 联合投递', () => {
    expect(() =>
      parseCreationOptions({
        methods: ['EM', 'NMR'],
        emSubtype: 'HELICAL',
        coordinates: false,
      }),
    ).toThrow(BadRequestException);
  });

  it('电子晶体学单独投递只申请 PDB 编号', () => {
    const result = parseCreationOptions({ methods: ['EC'] });

    expect(result).toMatchObject({
      methods: ['EC'],
      emMapStatus: null,
      accessionCodes: ['PDB'],
    });
  });
});
