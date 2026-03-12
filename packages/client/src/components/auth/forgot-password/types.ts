export type ResetStep = 'email' | 'code' | 'password';

export interface ResetState {
  email: string;
  verificationToken: string;
}

export const RESEND_COOLDOWN = 60;

export const RESET_STEPS: ResetStep[] = ['email', 'code', 'password'];

const STEP_TITLE_KEYS = {
  email: 'forgot.step.email.title',
  code: 'forgot.step.code.title',
  password: 'forgot.step.password.title',
} as const;

const STEP_DESCRIPTION_KEYS = {
  email: 'forgot.step.email.description',
  code: 'forgot.step.code.description',
  password: 'forgot.step.password.description',
} as const;

export function getStepTitle(step: ResetStep): (typeof STEP_TITLE_KEYS)[ResetStep] {
  return STEP_TITLE_KEYS[step];
}

export function getStepDescription(step: ResetStep): (typeof STEP_DESCRIPTION_KEYS)[ResetStep] {
  return STEP_DESCRIPTION_KEYS[step];
}
