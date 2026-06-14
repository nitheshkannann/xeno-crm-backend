import nodemailer from 'nodemailer';

export class EmailService {
  private static transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'smtp.gmail.com',
    port: parseInt(process.env.SMTP_PORT || '587', 10),
    secure: process.env.SMTP_PORT === '465', // true for 465, false for other ports
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });

  /**
   * Sends an email, safely ignoring placeholder '@example.com' addresses.
   */
  public static async sendEmail(to: string, subject: string, html: string): Promise<boolean> {
    // Safety check: Do not send to placeholder demo emails
    if (to.endsWith('@example.com')) {
      console.log(`[EmailService] Ignored mock email to ${to}`);
      return false; // Indicating it was a simulated demo run
    }

    if (!process.env.SMTP_USER || !process.env.SMTP_PASS || process.env.SMTP_USER === 'your_email@gmail.com') {
      console.warn(`[EmailService] SMTP credentials not fully configured. Cannot send real email to ${to}`);
      return false;
    }

    try {
      const info = await this.transporter.sendMail({
        from: process.env.SMTP_FROM || '"XENO CRM" <noreply@xeno.local>',
        to,
        subject,
        html,
      });

      console.log(`[EmailService] Real email sent to ${to}: ${info.messageId}`);
      return true;
    } catch (error) {
      console.error(`[EmailService] Failed to send email to ${to}:`, error);
      throw error;
    }
  }
}
