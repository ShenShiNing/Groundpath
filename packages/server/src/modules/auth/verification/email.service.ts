import nodemailer from 'nodemailer';
import type Mail from 'nodemailer/lib/mailer';
import type { EmailVerificationCodeType } from '@knowledge-agent/shared/types';
import { EMAIL_CONFIG } from '@config/emailConfig';
import { emailTemplates } from '@shared/email/templates/verification';

// Create transporter (reusable)
const transporter = nodemailer.createTransport({
  host: EMAIL_CONFIG.smtp.host,
  port: EMAIL_CONFIG.smtp.port,
  secure: EMAIL_CONFIG.smtp.secure,
  auth: {
    user: EMAIL_CONFIG.smtp.auth.user,
    pass: EMAIL_CONFIG.smtp.auth.pass,
  },
});

export interface SendVerificationCodeOptions {
  to: string;
  code: string;
  type: EmailVerificationCodeType;
}

/**
 * Email service for sending verification codes and other emails
 */
export const emailService = {
  /**
   * Send a verification code email
   */
  async sendVerificationCode({ to, code, type }: SendVerificationCodeOptions): Promise<void> {
    const { codeExpiresInMinutes } = EMAIL_CONFIG.verification;

    const mailOptions: Mail.Options = {
      from: `"${EMAIL_CONFIG.from.name}" <${EMAIL_CONFIG.from.address}>`,
      to,
      subject: emailTemplates.getSubject(type),
      text: emailTemplates.generateText({ code, type, expiresInMinutes: codeExpiresInMinutes }),
      html: emailTemplates.generateHtml({ code, type, expiresInMinutes: codeExpiresInMinutes }),
    };

    await transporter.sendMail(mailOptions);
  },

  /**
   * Verify SMTP connection is working
   */
  async verifyConnection(): Promise<boolean> {
    try {
      await transporter.verify();
      return true;
    } catch {
      return false;
    }
  },
};
