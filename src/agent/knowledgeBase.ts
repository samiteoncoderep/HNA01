/**
 * Fibromyalgia knowledge base (MVP).
 *
 * PRD Feature 2 — Condition-Intelligent Dialogue. A curated, plain-language
 * corpus the rule-based navigator retrieves from. Each entry is scoped as
 * `general education` and explicitly NOT clinical advice, per the PRD constraint
 * that the agent may not diagnose or prescribe.
 *
 * In a production build this corpus would be embedded into pgvector/Pinecone
 * for semantic retrieval (PRD §4.1). Here we do lightweight keyword scoring so
 * the app runs with zero external dependencies.
 */

export interface KbEntry {
  id: string;
  topic: string;
  keywords: string[];
  answer: string;
  /** Whether the topic should append a "talk to a clinician" note. */
  clinicianNote?: boolean;
}

export const FM_KNOWLEDGE_BASE: KbEntry[] = [
  {
    id: 'what-is-fm',
    topic: 'What fibromyalgia is',
    keywords: ['what is', 'fibromyalgia', 'fibro', 'definition', 'explain', 'condition'],
    answer:
      'Fibromyalgia is a long-term condition involving widespread musculoskeletal pain, fatigue, sleep problems, and "fibro fog" (trouble concentrating). Current understanding is that it involves changes in how the central nervous system processes pain signals — the volume on pain is turned up, rather than there being damage in the muscles or joints themselves. It is real, common, and not "in your head."',
  },
  {
    id: 'diagnosis-criteria',
    topic: 'How fibromyalgia is diagnosed',
    keywords: ['diagnos', 'criteria', 'test', 'how do i know', 'confirm', 'tender points'],
    answer:
      'Fibromyalgia is diagnosed clinically — there is no single blood test or scan that confirms it. Clinicians typically use the ACR criteria, which look at how widespread your pain is (Widespread Pain Index) and the severity of symptoms like fatigue, sleep, and cognitive issues (Symptom Severity Scale), while ruling out other conditions. A diagnosis usually means symptoms have been present for at least 3 months.',
    clinicianNote: true,
  },
  {
    id: 'treatment-options',
    topic: 'Treatment options',
    keywords: ['treatment', 'treat', 'medication', 'medicine', 'drug', 'manage', 'help with pain', 'options'],
    answer:
      'Fibromyalgia care is usually a combination approach rather than a single fix. Common pillars include: (1) movement — gentle, graded exercise like walking, swimming, or tai chi; (2) sleep support; (3) FDA-approved medications such as duloxetine, milnacipran, and pregabalin; (4) cognitive behavioral therapy (CBT) for pain and stress; and (5) pacing strategies to avoid push-crash cycles. What works varies a lot from person to person.',
    clinicianNote: true,
  },
  {
    id: 'specialists',
    topic: 'Which specialists treat fibromyalgia',
    keywords: ['specialist', 'doctor', 'who treats', 'rheumatolog', 'pain management', 'referral', 'see a'],
    answer:
      'Several types of clinicians manage fibromyalgia: rheumatologists (often the diagnosing specialist), pain management physicians, physiatrists (physical medicine & rehab), and primary care doctors who are comfortable with chronic pain. Physical therapists, sleep specialists, and pain psychologists are also frequently part of the team. I can route you to our Specialist Matching support to find FM-experienced providers in your network.',
  },
  {
    id: 'disability-work',
    topic: 'Disability and work',
    keywords: ['disability', 'work', 'job', 'ssdi', 'fmla', 'accommodation', 'employer', 'unemploy'],
    answer:
      'Fibromyalgia can qualify for workplace accommodations (often under the ADA in the US) and, in some cases, disability benefits — though the process is documentation-heavy. Helpful steps include keeping a symptom and function log, getting your clinician to document functional limitations, and exploring accommodations like flexible hours or remote work before pursuing disability. Our Insurance & Prior Authorization support can help you navigate the paperwork.',
  },
  {
    id: 'flares',
    topic: 'Managing flares',
    keywords: ['flare', 'flare-up', 'worse', 'bad day', 'crash', 'pacing'],
    answer:
      'A flare is a temporary worsening of symptoms, often triggered by stress, overexertion, poor sleep, or weather changes. Pacing — breaking activity into smaller chunks with rest in between, and not "pushing through" on good days — is one of the most effective tools for reducing the frequency and severity of flares. Tracking your triggers over time helps you anticipate and soften them.',
  },
  {
    id: 'fibro-fog',
    topic: 'Fibro fog / cognitive symptoms',
    keywords: ['fog', 'brain fog', 'memory', 'concentrat', 'cognitive', 'focus'],
    answer:
      '"Fibro fog" refers to the trouble with memory, concentration, and word-finding that many people with fibromyalgia experience. It tends to track with poor sleep, pain, and fatigue, so improving those often helps. Practical aids — written notes, reminders, single-tasking, and tackling demanding tasks when your energy is highest — can reduce its impact day to day.',
  },
];

/** Crisis / distress detection — PRD Feature 2 & 5: immediate escalation. */
export const CRISIS_PATTERNS: RegExp[] = [
  /\b(suicid|kill myself|end my life|don'?t want to (be alive|live)|want to die)\b/i,
  /\b(self[-\s]?harm|hurt myself|harming myself)\b/i,
  /\b(overdose|take all my pills)\b/i,
  /\bno reason to (live|go on)\b/i,
];

export const CRISIS_RESOURCES =
  'If you are in immediate danger, please call 911. ' +
  'You can reach the 988 Suicide & Crisis Lifeline by calling or texting 988 (US), available 24/7. ' +
  "You are not alone, and a member of our care team is being notified right now to reach out to you.";

/** Out-of-scope clinical red flags that warrant clinical escalation, not FM education. */
export const OUT_OF_SCOPE_PATTERNS: { pattern: RegExp; label: string }[] = [
  { pattern: /\b(chest pain|can'?t breathe|shortness of breath|heart attack)\b/i, label: 'possible cardiac symptoms' },
  { pattern: /\b(stroke|face drooping|slurred speech|numb on one side)\b/i, label: 'possible stroke symptoms' },
  { pattern: /\b(severe bleeding|coughing up blood|blood in)\b/i, label: 'acute bleeding' },
];
