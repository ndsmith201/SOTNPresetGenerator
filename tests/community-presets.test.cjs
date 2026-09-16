const assert = require('node:assert/strict');
const { test } = require('node:test');
const { presetSubmission } = require('../dist/community-presets');
const { writeLocations } = require('../dist/renderer/template-options');
const disabled = { type: 'word', value: '0x00000000', comment: 'Disabled template option (nop)' };

test('published presets omit all disabled placeholders without shifting retained write addresses', () => {
  const preset = { metadata: { name: 'Example' }, writes: [
    { ...disabled, address: '0x00158c98' }, disabled,
    { type: 'word', value: '0x12345678', reason: 'Keep this write' },
    { ...disabled, address: '0x2000' },
    { type: 'short', value: '0x1234' },
    disabled,
    { type: 'word', value: '0x0803924f', address: '0x3000', comment: 'j 0x800e493c' },
    { type: 'word', value: '0x00000000', comment: 'nop' },
    { type: 'word', value: '0x00000000' }, disabled
  ] };
  const original = structuredClone(preset);
  const output = presetSubmission(preset);
  const kept = preset.writes.map((write, index) => write.comment !== disabled.comment ? index : -1).filter(index => index >= 0);
  assert.equal(output.writes.length, kept.length);
  assert(output.writes.every(write => write.comment !== disabled.comment));
  assert.deepEqual(writeLocations(output.writes).map(location => location.address), kept.map(index => writeLocations(preset.writes)[index].address));
  assert.deepEqual(output.writes.slice(-3), preset.writes.slice(6, 9));
  assert.equal(output.writes[0].reason, 'Keep this write');
  assert.deepEqual(preset, original);
  assert.deepEqual(presetSubmission(output), output);
});

test('publication cleanup leaves presets without placeholders unchanged and handles empty results', () => {
  for (const preset of [{ metadata: {} }, { writes: [] }, { writes: [{ type: 'word', value: 0, comment: 'nop' }] }]) {
    assert.equal(presetSubmission(preset), preset);
  }
  assert.deepEqual(presetSubmission({ writes: [disabled, disabled] }), { writes: [] });
});
