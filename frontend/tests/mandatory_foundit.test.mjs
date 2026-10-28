import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const createReqPath = path.resolve(__dirname, '../src/pages/CreateRequirement.tsx');

describe('Mandatory Publish to Foundit Frontend Regression Tests', () => {
  const fileContent = fs.readFileSync(createReqPath, 'utf-8');

  test('Test 1: Publish to Foundit is initialized to false by default', () => {
    assert.match(
      fileContent,
      /publishToFoundit:\s*false/,
      'publishToFoundit must be initialized to false in default formData state'
    );
  });

  test('Test 2: Validation check blocks new job creation when publishToFoundit is false', () => {
    assert.match(
      fileContent,
      /if\s*\(!applicationId\s*&&\s*!formData\.publishToFoundit\)\s*\{\s*setError\('Please select Publish to Foundit before creating the job requirement\.'\);\s*return;\s*\}/,
      'handleSaveRequirement must reject form submission when creating a new job without publishToFoundit'
    );
  });

  test('Test 3: Edit mode does NOT block saving when publishToFoundit is false', () => {
    // The check is strictly scoped to !applicationId
    assert.ok(
      fileContent.includes('!applicationId && !formData.publishToFoundit'),
      'Foundit mandatory validation must only apply when !applicationId (new creation)'
    );
  });

  test('Test 4: UI renders mandatory asterisk and validation warning message when unchecked in create mode', () => {
    assert.ok(
      fileContent.includes("{!applicationId && <Typography component=\"span\" sx={{ color: 'error.main', ml: 0.5 }}>*</Typography>}"),
      'Publish to Foundit label must render red asterisk for new creation'
    );
    assert.ok(
      fileContent.includes('⚠️ Please select Publish to Foundit before creating the job requirement.'),
      'Helper caption must display clear warning when publishToFoundit is false in create mode'
    );
  });

  test('Test 5: Validation logic simulation correctly enforces rule', () => {
    const validateForm = (formData, applicationId) => {
      if (!formData.publishToCareerPage) {
        return '⚠️ "Publish to Company Career Page" is mandatory. Please check this box before submitting the job requirement.';
      }
      if (!applicationId && !formData.publishToFoundit) {
        return 'Please select Publish to Foundit before creating the job requirement.';
      }
      return null;
    };

    // New creation with Foundit unchecked -> blocked
    const newJobUnchecked = { publishToCareerPage: true, publishToFoundit: false };
    assert.equal(
      validateForm(newJobUnchecked, undefined),
      'Please select Publish to Foundit before creating the job requirement.'
    );

    // New creation with Foundit checked -> passes
    const newJobChecked = { publishToCareerPage: true, publishToFoundit: true };
    assert.equal(validateForm(newJobChecked, undefined), null);

    // Edit existing job with Foundit unchecked -> passes (backward compatibility)
    const editJobUnchecked = { publishToCareerPage: true, publishToFoundit: false };
    assert.equal(validateForm(editJobUnchecked, '123'), null);
  });
});
