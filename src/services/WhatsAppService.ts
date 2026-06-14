import twilio from 'twilio';

export class WhatsAppService {
  private static client = process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN
    ? twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN)
    : null;

  /**
   * Sends a WhatsApp message, safely ignoring placeholder '+10000000000' or similar fake numbers.
   */
  public static async sendMessage(toPhone: string, body: string): Promise<boolean> {
    // Safety check: Ignore clearly fake/demo numbers
    if (toPhone.startsWith('+100000') || toPhone === '+910000000000') {
      console.log(`[WhatsAppService] Ignored mock phone number ${toPhone}`);
      return false; // Indicating it was a simulated demo run
    }

    if (!this.client || !process.env.TWILIO_WHATSAPP_NUMBER || process.env.TWILIO_ACCOUNT_SID === 'your_twilio_sid') {
      console.warn(`[WhatsAppService] Twilio credentials not fully configured. Cannot send real WhatsApp to ${toPhone}`);
      return false;
    }

    try {
      // Twilio expects 'whatsapp:+1234567890' format for both from and to
      const fromNumber = process.env.TWILIO_WHATSAPP_NUMBER.startsWith('whatsapp:') 
        ? process.env.TWILIO_WHATSAPP_NUMBER 
        : `whatsapp:${process.env.TWILIO_WHATSAPP_NUMBER}`;
        
      // clean the phone number
      const cleanPhone = toPhone.replace(/[\s\-\(\)]/g, '');
      const toNumber = cleanPhone.startsWith('whatsapp:') ? cleanPhone : `whatsapp:${cleanPhone}`;

      const message = await this.client.messages.create({
        body,
        from: fromNumber,
        to: toNumber,
      });

      console.log(`[WhatsAppService] Real WhatsApp sent to ${toPhone}: SID ${message.sid}`);
      return true;
    } catch (error) {
      console.error(`[WhatsAppService] Failed to send WhatsApp to ${toPhone}:`, error);
      throw error;
    }
  }
}
