import tempfile
import unittest
from pathlib import Path
from gemmi_adapter import coordinate, decoded


class PdbDescriptionsTest(unittest.TestCase):
    def test_names_follow_entities_not_chain_count(self):
        pdb = """HEADER    TEST
TITLE     STRUCTURE TITLE
COMPND    MOL_ID: 1;
COMPND   2 MOLECULE: A MULTILINE
COMPND   3 PROTEIN NAME;
COMPND   4 CHAIN: A, B;
COMPND   5 MOL_ID: 2;
COMPND   6 MOLECULE: SECOND PROTEIN;
COMPND   7 CHAIN: C;
SEQRES   1 A    1  ALA
SEQRES   1 B    1  ALA
SEQRES   1 C    1  GLY
HETNAM      CA CALCIUM ION
ATOM      1  CA  ALA A   1       0.000   0.000   0.000  1.00 20.00           C
TER
ATOM      2  CA  ALA B   1       1.000   0.000   0.000  1.00 20.00           C
TER
ATOM      3  CA  GLY C   1       2.000   0.000   0.000  1.00 20.00           C
TER
HETATM    4 CA    CA A   2       3.000   0.000   0.000  1.00 20.00          CA
END
"""
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / 'input.pdb'
            path.write_text(pdb, encoding='ascii')
            doc, _ = coordinate(path)
            block = doc.sole_block()
            names = [decoded(v) for v in block.find_values('_entity.pdbx_description')]
            self.assertCountEqual(names, ['A MULTILINE PROTEIN NAME', 'SECOND PROTEIN', 'CALCIUM ION'])
            self.assertEqual(decoded(block.find_value('_struct.title')), 'STRUCTURE TITLE')
            # Passing through CIF must preserve the source descriptions.
            cif = Path(directory) / 'input.cif'
            doc.write_file(str(cif))
            again, _ = coordinate(cif)
            self.assertEqual(list(again.sole_block().find_values('_entity.pdbx_description')), list(block.find_values('_entity.pdbx_description')))
            path.write_text('\n'.join(line for line in pdb.splitlines() if not line.startswith(('COMPND', 'HETNAM'))), encoding='ascii')
            unnamed, _ = coordinate(path)
            self.assertTrue(all(decoded(v) is None for v in unnamed.sole_block().find_values('_entity.pdbx_description')))


if __name__ == '__main__':
    unittest.main()
