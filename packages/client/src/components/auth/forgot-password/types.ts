export type ResetStep = 'email' | 'code' | 'password';

export interface ResetState {
  email: string;
  verificationToken: string;
}

export const RESEND_COOLDOWN = 60;

export const RESET_STEPS: ResetStep[] = ['email', 'code', 'password'];

export function getStepTitle(step: ResetStep): string {
  switch (step) {
    case 'email':
      return 'forgot.step.email.title';
    case 'code':
      return 'forgot.step.code.title';
    case 'password':
      return 'forgot.step.password.title';
  }
}

export function getStepDescription(step: ResetStep): string {
  switch (step) {
    case 'email':
      return 'forgot.step.email.description';
    case 'code':
      return 'forgot.step.code.description';
    case 'password':
      return 'forgot.step.password.description';
  }
}
