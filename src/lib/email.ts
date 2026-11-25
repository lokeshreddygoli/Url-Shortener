import { logger } from "@/lib/logger";

export interface SendEmailInput {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

export interface EmailTransport {
  send(input: SendEmailInput): Promise<void>;
}

class ConsoleEmailTransport implements EmailTransport {
  async send(input: SendEmailInput): Promise<void> {
    logger.info(
      {
        transport: "console",
        to: input.to,
        subject: input.subject,
        preview: input.text,
      },
      "Dev email dispatched"
    );
  }
}

export function getEmailTransport(): EmailTransport {
  return new ConsoleEmailTransport();
}
