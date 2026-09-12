'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  isVisualRuleCompatibleValueMap,
  parseAdvancedValueMap,
  serializeVisualRulePairs,
} = require('../public/valueMapEditor');

test('visual rules support plain trimmed string maps', () => {
  assert.equal(isVisualRuleCompatibleValueMap({ ON: 'PLAY', OFF: 'STOP' }), true);
  assert.equal(isVisualRuleCompatibleValueMap({ ' ON ': 'PLAY' }), false);
  assert.equal(isVisualRuleCompatibleValueMap({ ON: true }), false);
});

test('advanced JSON parser preserves typed payload maps and rejects invalid input', () => {
  assert.deepEqual(parseAdvancedValueMap('{"ON":true,"level":42,"off":null}'), {
    ok: true,
    valueMap: { ON: true, level: 42, off: null },
  });
  assert.deepEqual(parseAdvancedValueMap('{"ON":}'), {
    ok: false,
    error: 'Advanced Value Map JSON must be valid JSON.',
  });
  assert.deepEqual(parseAdvancedValueMap('["ON","PLAY"]'), {
    ok: false,
    error: 'Advanced Value Map JSON must be an object.',
  });
});

test('visual rule serializer rejects whitespace-sensitive inputs', () => {
  assert.deepEqual(serializeVisualRulePairs([
    { sourceValue: 'ON', targetValue: 'PLAY' },
    { sourceValue: 'OFF', targetValue: 'STOP' },
  ]), {
    ok: true,
    valueMap: { ON: 'PLAY', OFF: 'STOP' },
  });

  assert.deepEqual(serializeVisualRulePairs([
    { sourceValue: '  ON  ', targetValue: 'PLAY' },
  ]), {
    ok: false,
    error: 'Visual rules do not allow leading or trailing spaces. Use Advanced Value Map JSON for whitespace-sensitive values.',
  });
});
