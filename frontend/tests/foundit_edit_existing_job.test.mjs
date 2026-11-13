import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const createReqPath = path.resolve(__dirname, '../src/pages/CreateRequirement.tsx');

describe('Foundit Validation Failure Edit Button & Navigation Regression Tests', () => {
  const fileContent = fs.readFileSync(createReqPath, 'utf-8');

  test('Test 1: "Edit Job Details to Fix Error" captures postSaveActionJobId before clearing state', () => {
    assert.match(
      fileContent,
      /const\s+targetJobId\s*=\s*postSaveActionJobId;/,
      'Button handler must capture postSaveActionJobId in a local variable before clearing it'
    );
  });

  test('Test 2: "Edit Job Details to Fix Error" clears modal state via setPostSaveActionJobId(null)', () => {
    assert.match(
      fileContent,
      /setPostSaveActionJobId\(null\);/,
      'Button handler must clear modal open state by setting postSaveActionJobId to null'
    );
  });

  test('Test 3: "Edit Job Details to Fix Error" navigates to /applications/create/:jobId', () => {
    assert.match(
      fileContent,
      /if\s*\(\s*targetJobId\s*\)\s*\{\s*navigate\(`\/applications\/create\/\$\{targetJobId\}`\);\s*\}/,
      'Button handler must navigate to /applications/create/${targetJobId} so the form enters Edit mode'
    );
  });

  test('Test 4: In Edit mode (with applicationId), handleSaveRequirement executes PUT instead of POST', () => {
    assert.ok(
      fileContent.includes("if (applicationId) {"),
      'handleSaveRequirement must branch based on applicationId'
    );
    assert.ok(
      fileContent.includes("await api.put(`applications/${appId}/`, payload)"),
      'Existing job records must be updated via api.put'
    );
    assert.ok(
      fileContent.includes("navigate('/job-postings')"),
      'Navigation to job postings exists after saving edits'
    );
  });

  test('Test 5: Editing with publishToFoundit re-opens post-save validation modal for the same job ID', () => {
    assert.ok(
      fileContent.includes("if (formData.publishToFoundit && applicationId) {"),
      'Must check if publishToFoundit is enabled when editing an existing job'
    );
    assert.ok(
      fileContent.includes("setPostSaveActionJobId(Number(applicationId));"),
      'Must set postSaveActionJobId to the existing applicationId to allow re-validating against Foundit'
    );
  });
});
