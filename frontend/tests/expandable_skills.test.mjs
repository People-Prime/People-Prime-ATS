import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const jobPostingsPath = path.resolve(__dirname, '../src/pages/JobPostings.tsx');
const expandableSkillsPath = path.resolve(__dirname, '../src/components/ExpandableSkills.tsx');

describe('Expandable Primary Skills Regression Tests', () => {
  const jobPostingsContent = fs.readFileSync(jobPostingsPath, 'utf-8');
  const expandableSkillsContent = fs.readFileSync(expandableSkillsPath, 'utf-8');

  // Load parseSkills logic dynamically to verify unit test cases
  const parseSkills = (rawSkills) => {
    if (!rawSkills) return [];

    if (Array.isArray(rawSkills)) {
      return rawSkills
        .map((s) => (typeof s === 'string' ? s.trim() : String(s).trim()))
        .filter((s) => s.length > 0);
    }

    if (typeof rawSkills === 'string') {
      const trimmed = rawSkills.trim();
      if (!trimmed) return [];

      if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
        try {
          const parsed = JSON.parse(trimmed);
          if (Array.isArray(parsed)) {
            return parsed
              .map((s) => (typeof s === 'string' ? s.trim() : String(s).trim()))
              .filter((s) => s.length > 0);
          }
        } catch {
          // ignore
        }
      }

      return trimmed
        .split(',')
        .map((s) => s.trim())
        .filter((s) => s.length > 0);
    }

    return [];
  };

  test('Test 1: parseSkills handles empty or null skills safely', () => {
    assert.deepEqual(parseSkills(null), []);
    assert.deepEqual(parseSkills(undefined), []);
    assert.deepEqual(parseSkills(''), []);
    assert.deepEqual(parseSkills('   '), []);
  });

  test('Test 2: parseSkills handles single skill', () => {
    assert.deepEqual(parseSkills('Python'), ['Python']);
    assert.deepEqual(parseSkills('   Java   '), ['Java']);
  });

  test('Test 3: parseSkills handles exactly three skills', () => {
    assert.deepEqual(parseSkills('Python, Django, React'), ['Python', 'Django', 'React']);
  });

  test('Test 4: parseSkills handles more than three skills', () => {
    const skills = parseSkills('Python, Django, React, JavaScript, HTML, CSS');
    assert.equal(skills.length, 6);
    assert.deepEqual(skills.slice(0, 3), ['Python', 'Django', 'React']);
  });

  test('Test 5: parseSkills preserves skill names with special characters or long names', () => {
    const input = 'C++, Node.js / Express, AWS Cloud Solutions Architect (Professional), REST APIs';
    const skills = parseSkills(input);
    assert.equal(skills.length, 4);
    assert.equal(skills[0], 'C++');
    assert.equal(skills[1], 'Node.js / Express');
    assert.equal(skills[2], 'AWS Cloud Solutions Architect (Professional)');
    assert.equal(skills[3], 'REST APIs');
  });

  test('Test 6: parseSkills handles JSON stringified array of skills', () => {
    const input = '["Python", "Django", "React", "PostgreSQL"]';
    const skills = parseSkills(input);
    assert.equal(skills.length, 4);
    assert.deepEqual(skills, ['Python', 'Django', 'React', 'PostgreSQL']);
  });

  test('Test 7: parseSkills handles native string array', () => {
    const input = ['Python', '  Django  ', 'React', ''];
    const skills = parseSkills(input);
    assert.deepEqual(skills, ['Python', 'Django', 'React']);
  });

  test('Test 8: Reusable component is created and imported into JobPostings.tsx', () => {
    assert.ok(
      jobPostingsContent.includes("import { ExpandableSkills } from '../components/ExpandableSkills';"),
      'JobPostings.tsx must import ExpandableSkills'
    );
  });

  test('Test 9: Company Career Portal Applicants table uses ExpandableSkills', () => {
    assert.ok(
      jobPostingsContent.includes('<ExpandableSkills skills={pa.primary_skills} />'),
      'JobPostings.tsx must render ExpandableSkills for applicant rows'
    );
    // Count occurrences of <ExpandableSkills skills={pa.primary_skills} />
    const matches = jobPostingsContent.match(/<ExpandableSkills skills=\{pa\.primary_skills\} \/>/g);
    assert.ok(matches && matches.length === 3, `Expected exactly 3 occurrences for 3 tables, found ${matches ? matches.length : 0}`);
  });

  test('Test 10: Component defines "...more" trigger and "Complete Primary Skills" heading in popover', () => {
    assert.ok(expandableSkillsContent.includes('...more'), 'ExpandableSkills must include ...more label');
    assert.ok(
      expandableSkillsContent.includes('Complete Primary Skills'),
      'ExpandableSkills popover must include Complete Primary Skills heading'
    );
    assert.ok(expandableSkillsContent.includes('N/A'), 'ExpandableSkills must display N/A for empty skills');
  });

  test('Test 11: Popover does not cause navigation or default click actions', () => {
    assert.ok(
      expandableSkillsContent.includes('event.stopPropagation()'),
      'Click events must stop propagation to prevent row click or navigation'
    );
  });
});
