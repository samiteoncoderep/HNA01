/**
 * Condition-Intelligent Onboarding — PRD Feature 1.
 *
 * One question at a time, plain language, save-and-resume. The frontend renders
 * a single question per screen with a progress indicator ("Step N of M"); the
 * server tracks `onboarding_step` on the patient record for resume support.
 */

export interface OnboardingQuestion {
  id: string;
  step: number;
  prompt: string;
  helper?: string; // plain-language explanation / tooltip text
  field: string; // which patient field this answer maps to
  type: 'text' | 'textarea' | 'multiselect' | 'consent' | 'date' | 'json';
  options?: string[];
}

export const ONBOARDING_FLOW: OnboardingQuestion[] = [
  {
    id: 'goals',
    step: 1,
    prompt: 'To start, what would make the biggest difference in your life right now?',
    helper: 'There are no wrong answers — this just helps me understand what matters most to you.',
    field: 'care_goals',
    type: 'textarea',
  },
  {
    id: 'diagnosis',
    step: 2,
    prompt: 'Which of these apply to you?',
    helper: 'Select any that you have been told you have, or suspect. You can pick more than one.',
    field: 'diagnosis',
    type: 'multiselect',
    options: ['Fibromyalgia', 'Suspected fibromyalgia (not yet diagnosed)', 'ME/CFS', 'POTS', 'Long COVID', 'Other chronic pain'],
  },
  {
    id: 'symptoms',
    step: 3,
    prompt: 'Which symptoms affect you the most these days?',
    helper: 'This helps me tailor what I share with you.',
    field: 'data_tags.primarySymptoms',
    type: 'multiselect',
    options: ['Widespread pain', 'Fatigue', 'Sleep problems', 'Fibro fog', 'Headaches', 'Mood / anxiety', 'Stiffness'],
  },
  {
    id: 'dob',
    step: 4,
    prompt: 'What is your date of birth?',
    helper: 'We use this to verify your identity and personalize support. It is stored securely.',
    field: 'date_of_birth',
    type: 'date',
  },
  {
    id: 'insurance',
    step: 5,
    prompt: 'Who is your health insurance through?',
    helper: 'Just the plan name is fine for now (for example, "Aetna" or "Blue Cross"). We can fill in details later.',
    field: 'insurance_info.payer',
    type: 'text',
  },
  {
    id: 'comms',
    step: 6,
    prompt: 'How would you prefer we reach you?',
    helper: 'We will always respect this preference.',
    field: 'consent_flags.commsPreference',
    type: 'multiselect',
    options: ['In-app messages', 'Email', 'Text message'],
  },
  {
    id: 'consent-data',
    step: 7,
    prompt: 'May we use your information to improve your care and our support, in a way that protects your privacy?',
    helper:
      'This lets us remember your history so you never repeat yourself, and helps improve care for people like you. You can change this anytime.',
    field: 'consent_flags.zeroPartyData',
    type: 'consent',
  },
  {
    id: 'consent-tos',
    step: 8,
    prompt: 'Do you agree to our Terms of Service and Privacy Policy?',
    helper: 'Required to use the Care Navigator. We are HIPAA-compliant and never sell your identifiable health data.',
    field: 'consent_flags.tos',
    type: 'consent',
  },
];

export const ONBOARDING_TOTAL = ONBOARDING_FLOW.length;
