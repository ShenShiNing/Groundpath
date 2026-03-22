import nodemailer from 'nodemailer';
import type Mail from 'nodemailer/lib/mailer';
import type { EmailVerificationCodeType } from '@groundpath/shared/types';
import { emailConfig } from '@config/env';
import { emailTemplates } from '@core/email/templates/verification.template';

// Create transporter (reusable)
const transporter = nodemailer.createTransport({
  host: emailConfig.smtp.host,
  port: emailConfig.smtp.port,
  secure: emailConfig.smtp.secure,
  auth: {
    user: emailConfig.smtp.auth.user,
    pass: emailConfig.smtp.auth.pass,
  },
});

export interface SendVerificationCodeOptions {
  to: string;
  code: string;
  type: EmailVerificationCodeType;
}

export interface SendEmailOptions {
  to: string | string[];
  subject: string;
  text: string;
  html?: string;
}

/**
 * Email service for sending verification codes and other emails
 */
export const emailService = {
  async sendEmail({ to, subject, text, html }: SendEmailOptions): Promise<void> {
    const mailOptions: Mail.Options = {
      from: `"${emailConfig.from.name}" <${emailConfig.from.address}>`,
      to,
      subject,
      text,
      html,
    };

    await transporter.sendMail(mailOptions);
  },

  /**
   * Send a verification code email
   */
  async sendVerificationCode({ to, code, type }: SendVerificationCodeOptions): Promise<void> {
    const { codeExpiresInMinutes } = emailConfig.verification;
    await this.sendEmail({
      to,
      subject: emailTemplates.getSubject(type),
      text: emailTemplates.generateText({ code, type, expiresInMinutes: codeExpiresInMinutes }),
      html: emailTemplates.generateHtml({ code, type, expiresInMinutes: codeExpiresInMinutes }),
    });
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
