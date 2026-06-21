/**
 * Specialist routing logic — PRD Feature 3.
 *
 * Maps an identified patient need to the correct specialist agent (or human
 * escalation). MVP uses keyword/intent scoring; the routing table mirrors the
 * PRD §5 Feature 3 routing matrix exactly.
 */

export type SpecialistAgent =
  | 'Insurance & Prior Authorization Agent'
  | 'Specialist Matching Agent'
  | 'Symptom & Treatment Tracking Agent'
  | 'Clinical Trial & Expanded Access Navigator'
  | 'Mental Health & Peer Support Agent'
  | 'Integrative & Holistic Medicine Matching Agent'
  | 'Opioid Taper Coordination Agent'
  | 'Human HNaaS Specialist';

export interface RouteDecision {
  needType: string;
  routedTo: SpecialistAgent | null; // null => stay with Care Navigator
  reason: string;
  confidence: number; // 0..1
}

interface Rule {
  needType: string;
  routedTo: SpecialistAgent;
  keywords: RegExp;
}

const RULES: Rule[] = [
  {
    needType: 'insurance / prior auth',
    routedTo: 'Insurance & Prior Authorization Agent',
    keywords: /\b(insurance|prior auth|authorization|denied|denial|appeal|claim|coverage|copay|deductible|out of pocket|billing)\b/i,
  },
  {
    needType: 'specialist search / referral',
    routedTo: 'Specialist Matching Agent',
    keywords: /\brheumatolog|\b(find a (doctor|specialist)|referral|new (doctor|specialist)|see a (doctor|specialist)|provider near|in[-\s]network|pain management)\b/i,
  },
  {
    needType: 'symptom tracking / check-in',
    routedTo: 'Symptom & Treatment Tracking Agent',
    keywords: /\b(track|log|check[-\s]?in|diary|journal|record my (pain|sleep|symptoms|mood)|monitor)\b/i,
  },
  {
    needType: 'clinical trial inquiry',
    routedTo: 'Clinical Trial & Expanded Access Navigator',
    keywords: /\b(clinical trial|study|research study|expanded access|experimental treatment)\b/i,
  },
  {
    needType: 'mental health / peer support',
    routedTo: 'Mental Health & Peer Support Agent',
    keywords: /\b(therapist|therapy|counsel|depress|anxiet|peer support|support group|lonely|mental health|cbt)\b/i,
  },
  {
    needType: 'integrative / holistic care',
    routedTo: 'Integrative & Holistic Medicine Matching Agent',
    keywords: /\b(acupunctur|naturopath|functional medicine|holistic|integrative|supplement|massage|physical therap)\b/i,
  },
  {
    needType: 'opioid taper support',
    routedTo: 'Opioid Taper Coordination Agent',
    keywords: /\b(opioid|taper|tapering|coming off|wean off|narcotic|tramadol|oxycodone|reduce my pain meds)\b/i,
  },
];

/**
 * Decide where a patient message should route.
 * Returns the best-matching specialist, or null to keep the Care Navigator.
 */
export function decideRoute(message: string): RouteDecision {
  const scored = RULES.map((rule) => {
    const matches = message.match(new RegExp(rule.keywords, 'gi'));
    const hits = matches ? matches.length : 0;
    return { rule, hits };
  }).filter((s) => s.hits > 0);

  if (scored.length === 0) {
    return {
      needType: 'general navigation / education',
      routedTo: null,
      reason: 'No specialist intent detected; Care Navigator handles directly.',
      confidence: 0.5,
    };
  }

  scored.sort((a, b) => b.hits - a.hits);

  // Multi-issue: more than one distinct specialist strongly matched => human.
  const distinct = new Set(scored.map((s) => s.rule.routedTo));
  if (distinct.size >= 3) {
    return {
      needType: 'complex / multi-issue',
      routedTo: 'Human HNaaS Specialist',
      reason: 'Multiple distinct specialist needs detected in one request.',
      confidence: 0.6,
    };
  }

  const top = scored[0];
  const second = scored[1];
  const ambiguous = second && second.hits === top.hits && second.rule.routedTo !== top.rule.routedTo;

  return {
    needType: top.rule.needType,
    routedTo: top.rule.routedTo,
    reason: ambiguous
      ? 'Top intent selected among close matches; a triage question may refine this.'
      : `Matched ${top.hits} keyword signal(s) for ${top.rule.needType}.`,
    confidence: ambiguous ? 0.55 : Math.min(0.95, 0.6 + top.hits * 0.1),
  };
}
