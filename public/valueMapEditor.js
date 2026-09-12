(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.ValueMapEditor = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  function isPlainObject(value) {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
  }

  function isVisualRuleCompatibleValueMap(valueMap) {
    return isPlainObject(valueMap)
      && Object.entries(valueMap).every(([key, value]) =>
        typeof value === 'string'
        && key === key.trim()
        && value === value.trim()
      );
  }

  function parseAdvancedValueMap(rawValueMap) {
    const text = String(rawValueMap || '').trim();
    if (!text) return { ok: true, valueMap: undefined };
    try {
      const valueMap = JSON.parse(text);
      if (!isPlainObject(valueMap)) {
        return { ok: false, error: 'Advanced Value Map JSON must be an object.' };
      }
      return { ok: true, valueMap };
    } catch (_) {
      return { ok: false, error: 'Advanced Value Map JSON must be valid JSON.' };
    }
  }

  function serializeVisualRulePairs(rulePairs) {
    let valueMap;
    for (const rule of rulePairs || []) {
      const sourceValue = String(rule && rule.sourceValue !== undefined ? rule.sourceValue : '');
      const targetValue = String(rule && rule.targetValue !== undefined ? rule.targetValue : '');
      if (!sourceValue.length && !targetValue.length) continue;
      if (!sourceValue.length) {
        return {
          ok: false,
          error: 'Visual rules require a KNX match value. Use Advanced Value Map JSON for empty-string keys.',
        };
      }
      if (sourceValue !== sourceValue.trim() || targetValue !== targetValue.trim()) {
        return {
          ok: false,
          error: 'Visual rules do not allow leading or trailing spaces. Use Advanced Value Map JSON for whitespace-sensitive values.',
        };
      }
      if (!valueMap) valueMap = {};
      valueMap[sourceValue] = targetValue;
    }
    return { ok: true, valueMap };
  }

  return {
    isVisualRuleCompatibleValueMap,
    parseAdvancedValueMap,
    serializeVisualRulePairs,
  };
});
