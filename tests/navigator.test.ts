import { describe, it, expect } from 'vitest';
import { runNavigator, PatientContext } from '../src/agent/navigator';
import { decideRoute } from '../src/agent/routing';

const ctx: PatientContext = {
  id: 'p1',
  name: 'Jordan Lee',
  diagnosis: ['fibromyalgia'],
  careGoals: 'fewer flares',
  lastInteractionAt: null,
};

describe('routing logic (Feature 3)', () => {
  it('routes insurance language to the Insurance agent', () => {
    const r = decideRoute('my prior auth was denied and I need to appeal');
    expect(r.routedTo).toBe('Insurance & Prior Authorization Agent');
  });

  it('routes specialist search to Specialist Matching', () => {
    const r = decideRoute('can you help me find a doctor who knows fibromyalgia');
    expect(r.routedTo).toBe('Specialist Matching Agent');
  });

  it('keeps general education with the navigator', () => {
    const r = decideRoute('what is fibromyalgia');
    expect(r.routedTo).toBeNull();
  });

  it('sends multi-issue requests to a human', () => {
    const r = decideRoute('my insurance denied my claim, I need a new rheumatologist, and I want to track my symptoms');
    expect(r.routedTo).toBe('Human HNaaS Specialist');
  });
});

describe('navigator core (Features 2 & 5)', () => {
  it('answers FM education questions from the knowledge base', () => {
    const out = runNavigator('what is fibromyalgia?', ctx);
    expect(out.reply.toLowerCase()).toContain('pain');
    expect(out.escalate).toBe(false);
  });

  it('escalates immediately on crisis language with urgency crisis', () => {
    const out = runNavigator('I want to die, I cant do this anymore', ctx);
    expect(out.escalate).toBe(true);
    expect(out.urgency).toBe('crisis');
    expect(out.reply).toContain('988');
  });

  it('escalates out-of-scope clinical red flags as urgent', () => {
    const out = runNavigator('I have severe chest pain right now', ctx);
    expect(out.escalate).toBe(true);
    expect(out.urgency).toBe('urgent');
  });

  it('escalates on explicit human request', () => {
    const out = runNavigator('I want to talk to a human please', ctx);
    expect(out.escalate).toBe(true);
    expect(out.route.routedTo).toBe('Human HNaaS Specialist');
  });

  it('extracts zero-party data tags (pain level)', () => {
    const out = runNavigator('my pain is 8 today and the fatigue is rough', ctx);
    expect(out.dataTags.reportedPainLevel).toBe(8);
  });

  it('asks a clarifying question when intent is unclear', () => {
    const out = runNavigator('hello', ctx);
    expect(out.route.needType).toBe('clarify');
    expect(out.reply.toLowerCase()).toContain('help');
  });
});
