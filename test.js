// ==========================================================================
// Prompt Helper — Automated Unit Test Suite (Node.js Test Runner)
// ==========================================================================

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

// --- Core Helper Functions (Mirrored directly from app.js) ---

/**
 * Replaces {{variable_name}} tokens in a text with user-supplied values.
 * @param {string} text Input text containing variables
 * @param {Record<string, string>} variableValues Key-value mappings
 * @returns {string} Text with variables substituted
 */
function substituteVariables(text, variableValues = {}) {
  return text.replace(/\{\{([a-zA-Z0-9_]+)\}\}/g, (match, p1) => {
    return variableValues[p1] !== undefined ? variableValues[p1] : match;
  });
}

/**
 * Converts a snake_case variable name into a capitalized human-readable title.
 * @param {string} varName Variable name (e.g. "target_audience")
 * @returns {string} Humanized title (e.g. "Target Audience")
 */
function formatVariableLabel(varName) {
  if (!varName) return '';
  return varName
    .replace(/_/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase());
}

/**
 * Scans text for {{variable_name}} tokens and returns a unique array of variable names.
 * @param {string} text Input text with {{bracket}} placeholders
 * @returns {string[]} Array of unique variable keys
 */
function extractVariables(text) {
  const regex = /\{\{([a-zA-Z0-9_]+)\}\}/g;
  const matches = new Set();
  let match;
  while ((match = regex.exec(text)) !== null) {
    matches.add(match[1]);
  }
  return Array.from(matches);
}

/**
 * Compiles constructor inputs into a tailored, model-optimized prompt string.
 * @param {Object} params Configuration parameters
 * @returns {string} Fully compiled and variable-interpolated prompt text
 */
function assemblePromptText({
  currentPrompt = {},
  targetModel = 'gemini',
  selectedToneRule = null,
  variableValues = {},
  studioMode = 'form',
  rawText = ''
} = {}) {
  if (studioMode === 'raw') {
    return substituteVariables(rawText || currentPrompt.rawText || '', variableValues);
  }

  const { role, context, task, constraints, outputFormat, fewShot } = currentPrompt;
  const model = targetModel;

  // Combine custom constraints with selected tone preset rule
  let finalConstraints = constraints;
  if (selectedToneRule) {
    finalConstraints = (finalConstraints ? finalConstraints + '\n' : '') + selectedToneRule;
  }

  // Apply Model-Tailored Optimization
  if (model === 'claude') {
    // Anthropic Claude XML Tag Structuring
    let xml = ``;
    if (role) xml += `<role>\n${role}\n</role>\n\n`;
    if (context) xml += `<context>\n${context}\n</context>\n\n`;
    if (task) xml += `<instructions>\n${task}\n</instructions>\n\n`;
    if (finalConstraints) xml += `<constraints>\n${finalConstraints}\n</constraints>\n\n`;
    if (outputFormat) xml += `<output_format>\n${outputFormat}\n</output_format>\n\n`;
    if (fewShot) xml += `<examples>\n${fewShot}\n</examples>\n`;
    return substituteVariables(xml.trim(), variableValues);
  } 
  else if (model === 'deepseek') {
    // DeepSeek Chain-of-Thought Reasoning
    let cot = ``;
    if (role) cot += `[SYSTEM ROLE]\n${role}\n\n`;
    cot += `[REASONING PROCESS MANDATE]\nBefore producing the final output, think step-by-step. Analyze the requirements, verify edge cases, and ensure strict compliance with constraints.\n\n`;
    if (context) cot += `[CONTEXT]\n${context}\n\n`;
    if (task) cot += `[TASK]\n${task}\n\n`;
    if (finalConstraints) cot += `[CONSTRAINTS]\n${finalConstraints}\n\n`;
    if (outputFormat) cot += `[OUTPUT FORMAT]\n${outputFormat}\n\n`;
    if (fewShot) cot += `[FEW-SHOT EXAMPLES]\n${fewShot}\n`;
    return substituteVariables(cot.trim(), variableValues);
  } 
  else {
    // Gemini / GPT-4o Clean Markdown Format
    let md = ``;
    if (role) md += `# Persona & Role\nYou are a ${role}.\n\n`;
    if (context) md += `## Context\n${context}\n\n`;
    if (task) md += `## Task Instructions\n${task}\n\n`;
    if (finalConstraints) {
      md += `## Constraints & Rules\n`;
      const lines = finalConstraints.split('\n').filter(l => l.trim().length > 0);
      lines.forEach(l => { md += `- ${l.trim()}\n`; });
      md += `\n`;
    }
    if (outputFormat) md += `## Output Format\n${outputFormat}\n\n`;
    if (fewShot) md += `## Examples\n${fewShot}\n`;
    return substituteVariables(md.trim(), variableValues);
  }
}

/**
 * Evaluates prompt completeness across 5 key dimensions.
 */
function calculateHealthScore({
  currentPrompt = {},
  studioMode = 'form',
  rawText = '',
  variableValues = {},
  promptText = ''
} = {}) {
  let score = 100;
  const checks = [];

  // Check 1: Role Definition
  const hasRole = (currentPrompt.role && currentPrompt.role.trim().length > 0) || 
    (studioMode === 'raw' && (/role|persona|act as|you are/i).test(promptText));
  if (!hasRole) {
    score -= 20;
    checks.push({ id: 'role', passed: false });
  } else {
    checks.push({ id: 'role', passed: true });
  }

  // Check 2: Task Instructions
  const rawLen = (rawText || '').trim().length;
  const taskLen = (currentPrompt.task || '').trim().length;
  const hasTask = studioMode === 'raw' ? rawLen >= 30 : taskLen >= 10;
  if (!hasTask) {
    score -= 30;
    checks.push({ id: 'task', passed: false });
  } else {
    checks.push({ id: 'task', passed: true });
  }

  // Check 3: Rules & Constraints
  const hasConstraints = (currentPrompt.constraints && currentPrompt.constraints.trim().length > 0) ||
    (studioMode === 'raw' && (/constraint|rule|do not|avoid|must not/i).test(promptText));
  if (!hasConstraints) {
    score -= 20;
    checks.push({ id: 'constraints', passed: false });
  } else {
    checks.push({ id: 'constraints', passed: true });
  }

  // Check 4: Output Format
  const hasFormat = (currentPrompt.outputFormat && currentPrompt.outputFormat.trim().length > 0) ||
    (studioMode === 'raw' && (/format|markdown|json|bullet|table/i).test(promptText));
  if (!hasFormat) {
    score -= 15;
    checks.push({ id: 'outputFormat', passed: false });
  } else {
    checks.push({ id: 'outputFormat', passed: true });
  }

  // Check 5: Variable Safety / Blanks
  const fullText = studioMode === 'raw' ? rawText : (
    (currentPrompt.role || '') + " " + (currentPrompt.context || '') + " " + (currentPrompt.task || '') + " " + (currentPrompt.constraints || '')
  );
  const vars = extractVariables(fullText);
  const emptyVars = vars.filter(v => !variableValues[v] || variableValues[v].trim().length === 0);

  if (emptyVars.length > 0) {
    score -= 15;
    checks.push({ id: 'variables', passed: false, emptyCount: emptyVars.length });
  } else {
    checks.push({ id: 'variables', passed: true });
  }

  return { score: Math.max(score, 0), checks };
}

/**
 * Computes line-by-line LCS dynamic programming difference.
 */
function diffTexts(oldText, newText) {
  const oldLines = oldText.split('\n');
  const newLines = newText.split('\n');

  const n = oldLines.length;
  const m = newLines.length;
  const dp = Array.from({ length: n + 1 }, () => Array(m + 1).fill(0));

  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      if (oldLines[i - 1] === newLines[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
      }
    }
  }

  const result = [];
  let i = n, j = m;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && oldLines[i - 1] === newLines[j - 1]) {
      result.unshift({ type: 'diff-context', text: oldLines[i - 1] });
      i--;
      j--;
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      result.unshift({ type: 'diff-added', text: newLines[j - 1] });
      j--;
    } else if (i > 0 && (j === 0 || dp[i][j - 1] < dp[i - 1][j])) {
      result.unshift({ type: 'diff-removed', text: oldLines[i - 1] });
      i--;
    }
  }
  return result;
}

function countLineDiffs(text1, text2) {
  if (text1 === text2) return 0;
  const diffs = diffTexts(text1 || '', text2 || '');
  let changes = 0;
  diffs.forEach(d => {
    if (d.type === 'diff-added' || d.type === 'diff-removed') {
      changes++;
    }
  });
  return changes;
}

// ==========================================================================
// Test Suites
// ==========================================================================

describe('1. Prompt Assembly Engine (assemblePromptText)', () => {
  const samplePrompt = {
    role: 'Senior Staff Engineer',
    context: 'We are building a local-first PWA.',
    task: 'Refactor {{module}} to support offline synchronization.',
    constraints: 'No external libraries.\nStrict TypeScript.',
    outputFormat: 'Complete code with docstrings.',
    fewShot: 'Input: sync()\nOutput: done()'
  };

  const sampleVars = { module: 'storage_adapter' };

  it('formats correctly for Claude using XML tags', () => {
    const output = assemblePromptText({
      currentPrompt: samplePrompt,
      targetModel: 'claude',
      variableValues: sampleVars
    });

    assert.match(output, /<role>\s*Senior Staff Engineer\s*<\/role>/);
    assert.match(output, /<context>\s*We are building a local-first PWA\.\s*<\/context>/);
    assert.match(output, /<instructions>\s*Refactor storage_adapter to support offline synchronization\.\s*<\/instructions>/);
    assert.match(output, /<constraints>\s*No external libraries\.\nStrict TypeScript\.\s*<\/constraints>/);
    assert.match(output, /<output_format>\s*Complete code with docstrings\.\s*<\/output_format>/);
    assert.match(output, /<examples>\s*Input: sync\(\)\nOutput: done\(\)\s*<\/examples>/);
  });

  it('formats correctly for DeepSeek with Reasoning Mandate block', () => {
    const output = assemblePromptText({
      currentPrompt: samplePrompt,
      targetModel: 'deepseek',
      variableValues: sampleVars
    });

    assert.match(output, /\[SYSTEM ROLE\]\s*Senior Staff Engineer/);
    assert.match(output, /\[REASONING PROCESS MANDATE\]/);
    assert.match(output, /Before producing the final output, think step-by-step\./);
    assert.match(output, /\[TASK\]\s*Refactor storage_adapter to support offline synchronization\./);
    assert.match(output, /\[CONSTRAINTS\]\s*No external libraries\.\nStrict TypeScript\./);
  });

  it('formats correctly for Gemini / GPT-4 in Structured Markdown', () => {
    const output = assemblePromptText({
      currentPrompt: samplePrompt,
      targetModel: 'gemini',
      variableValues: sampleVars
    });

    assert.match(output, /# Persona & Role\nYou are a Senior Staff Engineer\./);
    assert.match(output, /## Context\nWe are building a local-first PWA\./);
    assert.match(output, /## Task Instructions\nRefactor storage_adapter to support offline synchronization\./);
    assert.match(output, /## Constraints & Rules\n- No external libraries\.\n- Strict TypeScript\./);
    assert.match(output, /## Output Format\nComplete code with docstrings\./);
    assert.match(output, /## Examples\nInput: sync\(\)\nOutput: done\(\)/);
  });

  it('appends active Tone & Style preset rule to constraints', () => {
    const output = assemblePromptText({
      currentPrompt: samplePrompt,
      targetModel: 'gemini',
      selectedToneRule: 'Use clear analogies and simple terms suitable for beginners.',
      variableValues: sampleVars
    });

    assert.match(output, /- Use clear analogies and simple terms suitable for beginners\./);
  });

  it('handles Raw Studio Mode directly', () => {
    const rawContent = 'Analyze {{dataset}} for anomalies with high precision.';
    const output = assemblePromptText({
      studioMode: 'raw',
      rawText: rawContent,
      variableValues: { dataset: 'sales_q3.csv' }
    });

    assert.equal(output, 'Analyze sales_q3.csv for anomalies with high precision.');
  });
});

describe('2. Variable Extraction & Substitution Engine', () => {
  it('extracts unique {{variables}} from complex text', () => {
    const text = 'Build {{service}} in {{lang}} for {{audience}}. Test {{service}} thoroughly.';
    const extracted = extractVariables(text);

    assert.deepEqual(extracted, ['service', 'lang', 'audience']);
  });

  it('humanizes snake_case variable names into clean titles', () => {
    assert.equal(formatVariableLabel('target_audience'), 'Target Audience');
    assert.equal(formatVariableLabel('api_key_secret'), 'Api Key Secret');
    assert.equal(formatVariableLabel('topic'), 'Topic');
    assert.equal(formatVariableLabel(''), '');
  });

  it('substitutes multiple variable instances accurately', () => {
    const template = 'Hello {{name}}! Welcome to {{city}}, {{name}}!';
    const substituted = substituteVariables(template, { name: 'Alice', city: 'Tokyo' });

    assert.equal(substituted, 'Hello Alice! Welcome to Tokyo, Alice!');
  });

  it('leaves unsupplied {{placeholders}} intact without throwing', () => {
    const template = 'Translate {{text}} to {{target_lang}} with style {{style}}.';
    const substituted = substituteVariables(template, { text: 'Good morning' });

    assert.equal(substituted, 'Translate Good morning to {{target_lang}} with style {{style}}.');
  });
});

describe('3. Prompt Health & Readiness Evaluator', () => {
  it('returns 100/100 and passes all 5 checks for a complete prompt', () => {
    const completePrompt = {
      role: 'Staff Python Architect',
      task: 'Write an asynchronous web scraper with rate-limiting.',
      constraints: 'Follow PEP 8.\nHandle network timeouts.',
      outputFormat: 'Self-contained Python code.'
    };

    const result = calculateHealthScore({
      currentPrompt: completePrompt,
      studioMode: 'form',
      variableValues: {}
    });

    assert.equal(result.score, 100);
    assert.equal(result.checks.every(c => c.passed), true);
  });

  it('deducts points accurately when role is missing', () => {
    const noRolePrompt = {
      role: '',
      task: 'Write an asynchronous web scraper with rate-limiting.',
      constraints: 'Follow PEP 8.',
      outputFormat: 'Python script.'
    };

    const result = calculateHealthScore({
      currentPrompt: noRolePrompt,
      studioMode: 'form'
    });

    assert.equal(result.score, 80);
    const roleCheck = result.checks.find(c => c.id === 'role');
    assert.equal(roleCheck.passed, false);
  });

  it('deducts points when task instructions are too brief (< 10 chars)', () => {
    const briefTaskPrompt = {
      role: 'Expert Advisor',
      task: 'Help me',
      constraints: 'Be brief.',
      outputFormat: 'Bullets.'
    };

    const result = calculateHealthScore({
      currentPrompt: briefTaskPrompt,
      studioMode: 'form'
    });

    assert.equal(result.score, 70); // -30 for task
    const taskCheck = result.checks.find(c => c.id === 'task');
    assert.equal(taskCheck.passed, false);
  });

  it('flags unfilled {{blank}} variables', () => {
    const varsPrompt = {
      role: 'Expert Advisor',
      task: 'Write an essay about {{topic}} for {{audience}}.',
      constraints: 'Under 500 words.',
      outputFormat: 'Markdown.'
    };

    const result = calculateHealthScore({
      currentPrompt: varsPrompt,
      studioMode: 'form',
      variableValues: { topic: 'Artificial Intelligence' } // audience missing
    });

    assert.equal(result.score, 85); // -15 for unfilled variables
    const varCheck = result.checks.find(c => c.id === 'variables');
    assert.equal(varCheck.passed, false);
    assert.equal(varCheck.emptyCount, 1);
  });
});

describe('4. Token & Reading Time Estimations', () => {
  it('accurately approximates token count (~4 chars per token)', () => {
    const text = 'Hello world! This is a test prompt.'; // 35 chars
    const tokens = Math.ceil(text.length / 4);
    assert.equal(tokens, 9);
  });

  it('accurately calculates words and reading time', () => {
    const wordsText = 'Word '.repeat(400).trim(); // 400 words
    const words = wordsText.split(/\s+/).length;
    const readTime = Math.ceil(words / 200);

    assert.equal(words, 400);
    assert.equal(readTime, 2); // 400 words @ 200 wpm = 2 min
  });
});

describe('5. Line Diff & History Deduplication Logic', () => {
  it('detects 0 diffs for identical text blocks', () => {
    const text = 'Line 1\nLine 2\nLine 3';
    assert.equal(countLineDiffs(text, text), 0);
  });

  it('accurately counts minor line edits (<= 2 lines)', () => {
    const oldText = 'Line 1\nLine 2\nLine 3';
    const newText = 'Line 1\nLine 2 (edited)\nLine 3';

    const diffCount = countLineDiffs(oldText, newText);
    // 1 line removed, 1 line added = 2 diff changes
    assert.equal(diffCount, 2);
  });

  it('produces structured LCS diff chunks (added, removed, context)', () => {
    const oldText = 'Apple\nBanana\nCherry';
    const newText = 'Apple\nBlueberry\nCherry\nDate';

    const diffs = diffTexts(oldText, newText);
    const types = diffs.map(d => d.type);

    assert.ok(types.includes('diff-context'));
    assert.ok(types.includes('diff-removed'));
    assert.ok(types.includes('diff-added'));
  });
});

describe('6. SafeStorage JSON & Corrupt Data Safety', () => {
  const mockStorageMap = new Map();
  const mockLocalStorage = {
    get length() { return mockStorageMap.size; },
    key(i) { return Array.from(mockStorageMap.keys())[i] || null; },
    getItem(k) { return mockStorageMap.has(k) ? mockStorageMap.get(k) : null; },
    setItem(k, v) { mockStorageMap.set(k, String(v)); },
    removeItem(k) { mockStorageMap.delete(k); }
  };

  const SafeStorage = {
    parseJson(raw, fallback) {
      if (!raw || typeof raw !== 'string') return fallback;
      try {
        return JSON.parse(raw);
      } catch {
        return fallback;
      }
    },
    getStorageUsage(storage = mockLocalStorage) {
      let totalBytes = 0;
      try {
        for (let i = 0; i < storage.length; i++) {
          const key = storage.key(i);
          if (key && key.startsWith('ph_')) {
            const val = storage.getItem(key) || '';
            totalBytes += (key.length + val.length) * 2;
          }
        }
      } catch {
        // Safe catch
      }
      return {
        bytes: totalBytes,
        kb: (totalBytes / 1024).toFixed(1) + ' KB'
      };
    },
    clearAllPromptHelperData(storage = mockLocalStorage) {
      try {
        const keysToRemove = [];
        for (let i = 0; i < storage.length; i++) {
          const key = storage.key(i);
          if (key && key.startsWith('ph_')) {
            keysToRemove.push(key);
          }
        }
        keysToRemove.forEach(k => storage.removeItem(k));
        return true;
      } catch {
        return false;
      }
    }
  };

  it('parses valid JSON successfully', () => {
    const valid = '{"role":"Architect","step":2}';
    const parsed = SafeStorage.parseJson(valid, {});
    assert.deepEqual(parsed, { role: 'Architect', step: 2 });
  });

  it('returns fallback gracefully for invalid or malformed JSON without crashing', () => {
    const corrupt = '{"role": "broken json...';
    const parsed = SafeStorage.parseJson(corrupt, { fallback: true });
    assert.deepEqual(parsed, { fallback: true });
  });

  it('returns fallback for null or empty input', () => {
    assert.deepEqual(SafeStorage.parseJson(null, 'default'), 'default');
    assert.deepEqual(SafeStorage.parseJson('', 'default'), 'default');
  });

  it('estimates storage usage and selectively purges only prompt_helper keys', () => {
    mockStorageMap.set('ph_vault', JSON.stringify([{ id: 'v1', task: 'Hello' }]));
    mockStorageMap.set('ph_history', JSON.stringify([{ id: 'h1', prompt: {} }]));
    mockStorageMap.set('unrelated_app_key', 'should_not_be_purged');

    const usage = SafeStorage.getStorageUsage();
    assert.ok(usage.bytes > 0);
    assert.match(usage.kb, /KB/);

    const success = SafeStorage.clearAllPromptHelperData();
    assert.equal(success, true);
    assert.equal(mockStorageMap.has('ph_vault'), false);
    assert.equal(mockStorageMap.has('ph_history'), false);
    assert.equal(mockStorageMap.has('unrelated_app_key'), true);
  });
});

describe('7. File Upload Sanitization & Security Hardening', () => {
  function validateImportFile(file) {
    if (!file) return { valid: false, error: "No file selected." };
    const filename = (file.name || '').toLowerCase();
    const parts = filename.split('.');
    const ext = parts.pop();
    const dangerousExts = ['exe', 'bat', 'cmd', 'sh', 'ps1', 'vbs', 'dll', 'bin', 'msi', 'scr', 'com', 'pif'];
    if (parts.some(p => dangerousExts.includes(p)) || dangerousExts.includes(ext)) {
      return { valid: false, error: "Executable files are blocked for security. Please import a .txt, .md, or .json prompt file." };
    }
    if (!['txt', 'md', 'json'].includes(ext)) {
      return { valid: false, error: "Unsupported format! Please drop a .txt, .md, or .json file." };
    }
    if (file.size > 10 * 1024 * 1024) {
      return { valid: false, error: "File is too large (>10MB). Please select a text/prompt file." };
    }
    const mime = (file.type || '').toLowerCase();
    const blockedMimePrefixes = ['image/', 'video/', 'audio/', 'application/x-msdownload', 'application/x-executable', 'application/x-sh'];
    if (blockedMimePrefixes.some(prefix => mime.startsWith(prefix))) {
      return { valid: false, error: "Binary or media file detected. Please upload a plain text prompt file." };
    }
    return { valid: true };
  }

  function sanitizeTextContent(text) {
    if (typeof text !== 'string') return '';
    if (text.includes('\0')) {
      let controlCount = 0;
      for (let i = 0; i < Math.min(text.length, 1000); i++) {
        const code = text.charCodeAt(i);
        if (code === 0 || (code < 32 && code !== 9 && code !== 10 && code !== 13)) {
          controlCount++;
        }
      }
      if (controlCount > 5) return null;
    }
    return text
      .replace(/\0/g, '')
      .replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '')
      .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');
  }

  function sanitizeImportedJson(parsed) {
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
    const rawTarget = (parsed.prompt && typeof parsed.prompt === 'object' && !Array.isArray(parsed.prompt))
      ? parsed.prompt
      : parsed;

    const hasStudioKeys = rawTarget.role !== undefined || rawTarget.context !== undefined || rawTarget.task !== undefined || rawTarget.constraints !== undefined;
    if (!hasStudioKeys) return null;

    const clean = {
      role: '',
      context: '',
      task: '',
      constraints: '',
      outputFormat: '',
      fewShot: '',
      variables: Object.create(null)
    };

    if (rawTarget.role) clean.role = sanitizeTextContent(String(rawTarget.role)) || '';
    if (rawTarget.context) clean.context = sanitizeTextContent(String(rawTarget.context)) || '';
    if (rawTarget.task) clean.task = sanitizeTextContent(String(rawTarget.task)) || '';

    if (Array.isArray(rawTarget.constraints)) {
      clean.constraints = rawTarget.constraints
        .map(c => sanitizeTextContent(String(c)) || '')
        .filter(c => c.length > 0)
        .join('\n');
    } else if (rawTarget.constraints) {
      clean.constraints = sanitizeTextContent(String(rawTarget.constraints)) || '';
    }

    if (rawTarget.outputFormat) clean.outputFormat = sanitizeTextContent(String(rawTarget.outputFormat)) || '';
    if (rawTarget.fewShot) clean.fewShot = sanitizeTextContent(String(rawTarget.fewShot)) || '';

    if (parsed.variables && typeof parsed.variables === 'object' && !Array.isArray(parsed.variables)) {
      for (const [k, v] of Object.entries(parsed.variables)) {
        if (k !== '__proto__' && k !== 'constructor' && k !== 'prototype' && typeof k === 'string') {
          clean.variables[k] = sanitizeTextContent(String(v || '')) || '';
        }
      }
    }

    return clean;
  }

  it('accepts valid .txt, .md, and .json files', () => {
    assert.equal(validateImportFile({ name: 'prompt.txt', size: 1024, type: 'text/plain' }).valid, true);
    assert.equal(validateImportFile({ name: 'guide.md', size: 2048, type: 'text/markdown' }).valid, true);
    assert.equal(validateImportFile({ name: 'package.json', size: 4096, type: 'application/json' }).valid, true);
  });

  it('blocks dangerous executable files and double-extensions', () => {
    const res1 = validateImportFile({ name: 'malicious.exe', size: 500, type: '' });
    assert.equal(res1.valid, false);

    const res2 = validateImportFile({ name: 'prompt.exe.txt', size: 500, type: 'text/plain' });
    assert.equal(res2.valid, false);

    const res3 = validateImportFile({ name: 'script.sh.md', size: 500, type: '' });
    assert.equal(res3.valid, false);
  });

  it('rejects files larger than 10MB', () => {
    const res = validateImportFile({ name: 'large.txt', size: 11 * 1024 * 1024, type: 'text/plain' });
    assert.equal(res.valid, false);
    assert.match(res.error, />10MB/);
  });

  it('sanitizes text content by removing null bytes and ANSI escape sequences', () => {
    const dirty = 'Hello\0 World\x1b[31m Red\x1b[0m Text';
    const clean = sanitizeTextContent(dirty);
    assert.equal(clean, 'Hello World Red Text');
  });

  it('detects and rejects binary files masked as text', () => {
    // String containing many null bytes
    const binary = '\0\0\0\0\x01\x02\x03\0\0\0MZ\x90\0\x03';
    const result = sanitizeTextContent(binary);
    assert.equal(result, null);
  });

  it('sanitizes JSON prompt packages and strips prototype pollution keys', () => {
    const maliciousJson = {
      __proto__: { isAdmin: true },
      constructor: { prototype: { hacked: true } },
      role: 'Senior QA Engineer\0',
      task: 'Audit codebase',
      constraints: ['Rule 1', 'Rule 2\x1b[31m'],
      variables: {
        __proto__: 'bad',
        topic: 'Security Auditing\0'
      }
    };

    const clean = sanitizeImportedJson(maliciousJson);
    assert.ok(clean);
    assert.equal(clean.role, 'Senior QA Engineer');
    assert.equal(clean.task, 'Audit codebase');
    assert.equal(clean.constraints, 'Rule 1\nRule 2');
    assert.equal(clean.variables.topic, 'Security Auditing');
    assert.equal(clean.variables.__proto__, undefined);
  });
});

// --- Suite 8: Prompt Compression & Token Optimizer Engine ---

describe('8. Prompt Compression & Token Optimizer Engine (compressPromptText)', () => {
  const FLUFF_RULES = [
    { regex: /\b(i would like you to please|please make sure to|please ensure that you|could you please help me (to )?|could you please|would you please|can you please)\b/gi, replacement: '' },
    { regex: /\b(i want you to please|i need you to please|i want to ask you to)\b/gi, replacement: '' },
    { regex: /\b(make sure to always|ensure to always|be sure to always)\b/gi, replacement: 'Always' },
    { regex: /\b(make sure (that )?you|be sure (that )?you)\b/gi, replacement: 'Ensure' },
    { regex: /\b(feel free to|don't hesitate to|please feel free to)\b/gi, replacement: '' },
    { regex: /\b(as an ai( model)?,? (you should|you must|please)?)\b/gi, replacement: '' },
    { regex: /\b(if (it is )?possible,?( please)?)\b/gi, replacement: '' },
    { regex: /\b(it would be (great|helpful|appreciated) if you could)\b/gi, replacement: '' },
    { regex: /\b(take your time to|do your best to|kindly)\b/gi, replacement: '' },
    { regex: /\b(as much as possible)\b/gi, replacement: '' }
  ];

  const PHRASE_RULES = [
    { regex: /\bin order to be able to\b/gi, replacement: 'to' },
    { regex: /\bin order to\b/gi, replacement: 'to' },
    { regex: /\bfor the purpose of\b/gi, replacement: 'for' },
    { regex: /\bdue to the fact that\b/gi, replacement: 'because' },
    { regex: /\bat this point in time\b/gi, replacement: 'now' },
    { regex: /\bat the present time\b/gi, replacement: 'currently' },
    { regex: /\bin the event that\b/gi, replacement: 'if' },
    { regex: /\bwith regard to\b/gi, replacement: 'regarding' },
    { regex: /\bin reference to\b/gi, replacement: 'regarding' },
    { regex: /\bin addition to\b/gi, replacement: 'besides' },
    { regex: /\bas a matter of fact\b/gi, replacement: 'in fact' },
    { regex: /\bin a timely manner\b/gi, replacement: 'promptly' },
    { regex: /\ba large number of\b/gi, replacement: 'many' },
    { regex: /\ba majority of\b/gi, replacement: 'most' },
    { regex: /\bhas the ability to\b/gi, replacement: 'can' },
    { regex: /\bis able to\b/gi, replacement: 'can' },
    { regex: /\butilize\b/gi, replacement: 'use' },
    { regex: /\butilizes\b/gi, replacement: 'uses' },
    { regex: /\butilizing\b/gi, replacement: 'using' },
    { regex: /\butilization\b/gi, replacement: 'use' },
    { regex: /\bprior to\b/gi, replacement: 'before' },
    { regex: /\bsubsequent to\b/gi, replacement: 'after' },
    { regex: /\bconduct an analysis of\b/gi, replacement: 'analyze' },
    { regex: /\bprovide a summary of\b/gi, replacement: 'summarize' },
    { regex: /\bcome up with\b/gi, replacement: 'create' },
    { regex: /\bgive an explanation of\b/gi, replacement: 'explain' },
    { regex: /\bperform an evaluation of\b/gi, replacement: 'evaluate' },
    { regex: /\bmake a decision\b/gi, replacement: 'decide' },
    { regex: /\btake into consideration\b/gi, replacement: 'consider' },
    { regex: /\bhave a discussion about\b/gi, replacement: 'discuss' },
    { regex: /\bit is (important|crucial|essential) to note that (you should )?/gi, replacement: 'Note: ' },
    { regex: /\bkeep in mind that (you must|you should )?/gi, replacement: 'Note: ' }
  ];

  function compressPromptText(text, options = {}) {
    const { stripFluff = true, simplifyPhrases = true, cleanWhitespace = true } = options;
    if (!text || typeof text !== 'string' || text.trim() === '') {
      return {
        originalText: text || '',
        compressedText: text || '',
        originalTokens: 0,
        compressedTokens: 0,
        tokensSaved: 0,
        percentSaved: 0,
        originalWords: 0,
        compressedWords: 0,
        wordsSaved: 0,
        hasChanges: false,
        ruleMatchesCount: 0
      };
    }

    const originalText = text;
    let safeText = text;

    const masks = [];
    const createMask = (val) => {
      masks.push(val);
      return `__PH_COMPRESS_MASK_${masks.length - 1}__`;
    };

    safeText = safeText.replace(/```[\s\S]*?```/g, createMask);
    safeText = safeText.replace(/`[^`\n]+`/g, createMask);
    safeText = safeText.replace(/\{\{[a-zA-Z0-9_]+\}\}/g, createMask);
    safeText = safeText.replace(/<\/?(role|context|instructions|constraints|output_format|examples)>/gi, createMask);
    safeText = safeText.replace(/\[(SYSTEM ROLE|REASONING PROCESS MANDATE|CONTEXT|TASK|CONSTRAINTS|OUTPUT FORMAT|FEW-SHOT EXAMPLES)\]/g, createMask);

    let ruleMatchesCount = 0;

    if (stripFluff) {
      FLUFF_RULES.forEach(({ regex, replacement }) => {
        const matches = safeText.match(regex);
        if (matches) ruleMatchesCount += matches.length;
        safeText = safeText.replace(regex, replacement);
      });
    }

    if (simplifyPhrases) {
      PHRASE_RULES.forEach(({ regex, replacement }) => {
        const matches = safeText.match(regex);
        if (matches) ruleMatchesCount += matches.length;
        safeText = safeText.replace(regex, replacement);
      });

      const passiveRegex = /(^|\n|\.\s+)([Yy]ou (should|must|need to|are instructed to|ought to) )([a-z]+)/g;
      safeText = safeText.replace(passiveRegex, (match, prefix, prefixVerb, aux, verb) => {
        ruleMatchesCount++;
        const capitalized = verb.charAt(0).toUpperCase() + verb.slice(1);
        return `${prefix}${capitalized}`;
      });
    }

    safeText = safeText.replace(/^[ \t]*,[ \t]*/gm, '');
    safeText = safeText.replace(/\.\s*,/g, '.');
    safeText = safeText.replace(/([ \t]+),/g, ',');

    if (cleanWhitespace) {
      safeText = safeText.replace(/[ \t]+/g, ' ');
      safeText = safeText.replace(/[ \t]+$/gm, '');
      safeText = safeText.replace(/\n{3,}/g, '\n\n');
    }

    // Step 6: Sentence-start capitalization normalization
    safeText = safeText.replace(/(^|[\n.!?]\s+)([a-z])/g, (match, prefix, char) => {
      return prefix + char.toUpperCase();
    });

    masks.forEach((val, idx) => {
      const maskKey = `__PH_COMPRESS_MASK_${idx}__`;
      safeText = safeText.split(maskKey).join(val);
    });

    const compressedText = safeText.trim();
    const originalTokens = Math.ceil(originalText.length / 4);
    const compressedTokens = Math.ceil(compressedText.length / 4);
    const tokensSaved = Math.max(0, originalTokens - compressedTokens);
    const percentSaved = originalTokens > 0 ? Math.round((tokensSaved / originalTokens) * 100) : 0;

    const originalWords = originalText.trim() ? originalText.trim().split(/\s+/).length : 0;
    const compressedWords = compressedText ? compressedText.split(/\s+/).length : 0;
    const wordsSaved = Math.max(0, originalWords - compressedWords);
    const hasChanges = compressedText !== originalText.trim() && (tokensSaved > 0 || wordsSaved > 0 || ruleMatchesCount > 0);

    return {
      originalText,
      compressedText,
      originalTokens,
      compressedTokens,
      tokensSaved,
      percentSaved,
      originalWords,
      compressedWords,
      wordsSaved,
      hasChanges,
      ruleMatchesCount
    };
  }

  it('strips conversational fluff and politeness preambles', () => {
    const input = 'Could you please help me to summarize this text? Please make sure to be concise.';
    const result = compressPromptText(input);
    assert.equal(result.hasChanges, true);
    assert.ok(result.tokensSaved > 0);
    assert.ok(!result.compressedText.includes('Could you please help me to'));
    assert.ok(!result.compressedText.includes('Please make sure to'));
  });

  it('simplifies wordy and verbose directives into direct phrases', () => {
    const input = 'In order to be able to conduct an analysis of {{module}}, utilize the logging adapter.';
    const result = compressPromptText(input);
    assert.equal(result.hasChanges, true);
    assert.ok(result.compressedText.includes('To analyze {{module}}, use the logging adapter.'));
  });

  it('normalizes passive instructions into active imperatives', () => {
    const input = 'You should analyze the attached logs. You must summarize any exceptions.';
    const result = compressPromptText(input);
    assert.equal(result.hasChanges, true);
    assert.ok(result.compressedText.includes('Analyze the attached logs. Summarize any exceptions.'));
  });

  it('strictly preserves dynamic {{variables}}, code blocks, and XML tags', () => {
    const input = '<role>\nSenior Developer\n</role>\n\nPlease make sure to analyze `console.log("hello")` and replace with {{new_variable}}.\n\n```js\nfunction test() {\n  return 42;\n}\n```';
    const result = compressPromptText(input);
    assert.ok(result.compressedText.includes('<role>\nSenior Developer\n</role>'));
    assert.ok(result.compressedText.includes('`console.log("hello")`'));
    assert.ok(result.compressedText.includes('{{new_variable}}'));
    assert.ok(result.compressedText.includes('function test() {\n  return 42;\n}'));
  });

  it('compacts excessive blank lines and whitespace', () => {
    const input = 'Line 1\n\n\n\n\nLine 2     with   spaces';
    const result = compressPromptText(input);
    assert.equal(result.compressedText, 'Line 1\n\nLine 2 with spaces');
  });

  it('returns hasChanges false and 0 savings for already-optimal prompts', () => {
    const input = 'Analyze the codebase. Output clean TypeScript.';
    const result = compressPromptText(input);
    assert.equal(result.hasChanges, false);
    assert.equal(result.tokensSaved, 0);
  });
});

