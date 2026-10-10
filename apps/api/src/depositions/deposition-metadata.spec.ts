import type { DepositionFileKind } from '@onedep/shared';

import { calculateCompletion, createDefaultMetadata } from './deposition-metadata.js';

const user = {
  id: 1,
  name: 'Alice',
  email: 'alice@example.com',
  role: 'SUBMITTER' as const,
};

describe('投递完整性规则', () => {
  it('空白草稿会列出官方 X 射线投递所需的两类文件和元数据', () => {
    const completion = calculateCompletion(createDefaultMetadata(user), []);
    expect(completion.missing).toContain('坐标文件（mmCIF）');
    expect(completion.missing).toContain('结构因子文件（CIF 或 MTZ）');
    expect(completion.missing).toContain('大分子序列');
    expect(completion.percent).toBeLessThan(100);
  });

  it('完整草稿可以进入提交状态', () => {
    const metadata = createDefaultMetadata(user);
    metadata.entry.title = 'Crystal structure of the example protein';
    metadata.entry.keywords = 'protein, structure';
    metadata.contact.orcid = '0000-0002-1825-0097';
    metadata.contact.institution = 'Example University';
    metadata.contact.country = 'China';
    metadata.authors = ['Alice Example'];
    metadata.macromolecule.name = 'Example protein';
    metadata.macromolecule.chainIds = 'A';
    metadata.macromolecule.sequence = 'MPEPTIDE';
    metadata.macromolecule.sourceOrganism = 'Escherichia coli';
    metadata.assembly.oligomericState = 'Monomer';
    metadata.assembly.description = 'One protein chain';
    metadata.xray.crystallizationMethod = 'Hanging-drop vapor diffusion';
    metadata.xray.crystallizationTemperature = '293';
    metadata.xray.spaceGroup = 'P 21 21 21';
    metadata.release.termsAccepted = true;
    const files = (['COORDINATE', 'STRUCTURE_FACTOR'] as DepositionFileKind[]).map((kind) => ({ kind }));

    const completion = calculateCompletion(metadata, files);
    expect(completion.missing).toEqual([]);
    expect(completion.percent).toBe(100);
  });
});
