export interface FormErrors {
  firstName?: string;
  lastName?: string;
  mobileNumber?: string;
  alternateMobileNumber?: string;
  emailAddress?: string;
  qualification?: string;
  yearsOfExperience?: string;
  expectedPay?: string;
  primarySkills?: string;
  currentCtc?: string;
  currentCompany?: string;
  state?: string;
  city?: string;
  resume?: string;
  termsAccepted?: string;
}

export interface FormDataState {
  firstName: string;
  lastName: string;
  mobileNumber: string;
  alternateMobileNumber: string;
  emailAddress: string;
  qualification: string;
  yearsOfExperience: string;
  expectedPay: string;
  primarySkills: string;
  currentCtc: string;
  currentCompany: string;
  state: string;
  city: string;
  resume: File | null;
  termsAccepted: boolean;
}

export const validateField = (name: keyof FormDataState, value: any): string => {
  switch (name) {
    case 'firstName':
      if (!value || !value.trim()) return 'First Name is required.';
      if (!/^[A-Za-z\s]+$/.test(value.trim())) return 'First Name must contain alphabets only.';
      return '';

    case 'lastName':
      if (!value || !value.trim()) return 'Last Name is required.';
      if (!/^[A-Za-z\s]+$/.test(value.trim())) return 'Last Name must contain alphabets only.';
      return '';

    case 'mobileNumber':
      if (!value || !value.trim()) return 'Mobile Number is required.';
      if (!/^\d{10}$/.test(value.trim())) return 'Mobile Number must be exactly 10 digits.';
      return '';

    case 'alternateMobileNumber':
      if (value && value.trim() !== '') {
        if (!/^\d{10}$/.test(value.trim())) return 'Alternate Mobile Number must be exactly 10 digits.';
      }
      return '';

    case 'emailAddress':
      if (!value || !value.trim()) return 'Email Address is required.';
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim())) return 'Enter a valid email address.';
      return '';

    case 'qualification':
      if (!value || !value.trim()) return 'Qualification is required.';
      return '';

    case 'yearsOfExperience':
      if (!value || String(value).trim() === '') return 'Years of Experience is required.';
      if (isNaN(Number(value)) || Number(value) < 0) return 'Years of Experience must be numeric.';
      return '';

    case 'expectedPay':
      if (!value || String(value).trim() === '') return 'Expected Pay is required.';
      if (isNaN(Number(value)) || Number(value) < 0) return 'Expected Pay must be numeric.';
      return '';

    case 'primarySkills':
      if (!value || !value.trim()) return 'Primary Skills are required.';
      return '';

    case 'currentCtc':
      if (!value || String(value).trim() === '') return 'Current CTC is required.';
      if (isNaN(Number(value)) || Number(value) < 0) return 'Current CTC must be numeric.';
      return '';

    case 'currentCompany':
      if (!value || !value.trim()) return 'Current Company is required.';
      return '';

    case 'state':
      if (!value || !value.trim()) return 'State is required.';
      return '';

    case 'city':
      if (!value || !value.trim()) return 'City is required.';
      return '';

    case 'resume':
      if (!value) return 'Resume is required.';
      return validateResumeFile(value);

    case 'termsAccepted':
      if (!value) return 'Please accept the Terms & Conditions.';
      return '';

    default:
      return '';
  }
};

export const validateResumeFile = (file: File): string => {
  const allowedExtensions = ['pdf', 'doc', 'docx'];
  const ext = file.name.split('.').pop()?.toLowerCase() || '';
  if (!allowedExtensions.includes(ext)) {
    return 'Invalid file type. Only PDF, DOC, and DOCX files are allowed.';
  }
  const maxSizeInBytes = 10 * 1024 * 1024; // 10 MB
  if (file.size > maxSizeInBytes) {
    return 'File size exceeds maximum limit of 10 MB.';
  }
  return '';
};

export const validateAllFields = (formData: FormDataState): FormErrors => {
  const errors: FormErrors = {};
  (Object.keys(formData) as Array<keyof FormDataState>).forEach(key => {
    const err = validateField(key, formData[key]);
    if (err) {
      errors[key as keyof FormErrors] = err;
    }
  });
  return errors;
};
