import { BRAND_CONFIG } from '@groundpath/shared/constants';
import type { EmailVerificationCodeType } from '@groundpath/shared/types';

interface EmailTemplateParams {
  code: string;
  type: EmailVerificationCodeType;
  expiresInMinutes: number;
}

function getSubject(type: EmailVerificationCodeType): string {
  switch (type) {
    case 'register':
      return `Verify your email - ${BRAND_CONFIG.displayName.en}`;
    case 'reset_password':
      return `Reset your password - ${BRAND_CONFIG.displayName.en}`;
    case 'change_email':
      return `Verify your new email - ${BRAND_CONFIG.displayName.en}`;
    case 'login':
      return `Login verification code - ${BRAND_CONFIG.displayName.en}`;
    default:
      return `Verification code - ${BRAND_CONFIG.displayName.en}`;
  }
}

function getHeading(type: EmailVerificationCodeType): string {
  switch (type) {
    case 'register':
      return `Welcome to ${BRAND_CONFIG.displayName.en}!`;
    case 'reset_password':
      return 'Reset Your Password';
    case 'change_email':
      return 'Verify Your New Email';
    case 'login':
      return 'Login Verification';
    default:
      return 'Email Verification';
  }
}

function getMessage(type: EmailVerificationCodeType): string {
  switch (type) {
    case 'register':
      return 'Thank you for signing up! Please use the verification code below to complete your registration.';
    case 'reset_password':
      return 'We received a request to reset your password. Use the code below to proceed with resetting your password.';
    case 'change_email':
      return 'Please verify your new email address by entering the code below.';
    case 'login':
      return 'Use the code below to complete your login.';
    default:
      return 'Please use the verification code below.';
  }
}

function generateHtmlTemplate({ code, type, expiresInMinutes }: EmailTemplateParams): string {
  const heading = getHeading(type);
  const message = getMessage(type);

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${heading}</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f4f4f5;">
  <table role="presentation" style="width: 100%; border-collapse: collapse;">
    <tr>
      <td align="center" style="padding: 40px 0;">
        <table role="presentation" style="width: 100%; max-width: 600px; border-collapse: collapse; background-color: #ffffff; border-radius: 8px; box-shadow: 0 2px 8px rgba(0, 0, 0, 0.05);">
          <!-- Header -->
          <tr>
            <td style="padding: 32px 40px 24px; text-align: center; border-bottom: 1px solid #e4e4e7;">
              <h1 style="margin: 0; font-size: 24px; font-weight: 600; color: #18181b;">${heading}</h1>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding: 32px 40px;">
              <p style="margin: 0 0 24px; font-size: 16px; line-height: 1.6; color: #3f3f46;">
                ${message}
              </p>

              <!-- Code Box -->
              <div style="background-color: #f4f4f5; border-radius: 8px; padding: 24px; text-align: center; margin-bottom: 24px;">
                <p style="margin: 0 0 8px; font-size: 14px; color: #71717a; text-transform: uppercase; letter-spacing: 0.5px;">
                  Your verification code
                </p>
                <p style="margin: 0; font-size: 36px; font-weight: 700; color: #18181b; letter-spacing: 8px; font-family: 'SF Mono', Monaco, Consolas, monospace;">
                  ${code}
                </p>
              </div>

              <p style="margin: 0; font-size: 14px; color: #71717a; text-align: center;">
                This code will expire in <strong>${expiresInMinutes} minutes</strong>.
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding: 24px 40px; background-color: #fafafa; border-top: 1px solid #e4e4e7; border-radius: 0 0 8px 8px;">
              <p style="margin: 0 0 8px; font-size: 14px; color: #71717a; text-align: center;">
                If you didn't request this code, you can safely ignore this email.
              </p>
              <p style="margin: 0; font-size: 12px; color: #a1a1aa; text-align: center;">
                &copy; ${new Date().getFullYear()} ${BRAND_CONFIG.displayName.en}. All rights reserved.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
`.trim();
}

function generateTextTemplate({ code, type, expiresInMinutes }: EmailTemplateParams): string {
  const heading = getHeading(type);
  const message = getMessage(type);

  return `
${heading}

${message}

Your verification code: ${code}

This code will expire in ${expiresInMinutes} minutes.

If you didn't request this code, you can safely ignore this email.

© ${new Date().getFullYear()} ${BRAND_CONFIG.displayName.en}. All rights reserved.
`.trim();
}

export const emailTemplates = {
  getSubject,
  generateHtml: generateHtmlTemplate,
  generateText: generateTextTemplate,
};
