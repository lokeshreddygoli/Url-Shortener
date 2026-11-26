import net from "node:net";
import tls from "node:tls";
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

function sanitizeHeader(value: string): string {
  return value.replace(/[\r\n]+/g, " ").trim();
}

function extractEmailAddress(value: string): string {
  const match = value.match(/<([^>]+)>/);
  return sanitizeHeader(match?.[1] ?? value);
}

function dotStuff(body: string): string {
  return body
    .replace(/\r?\n/g, "\r\n")
    .split("\r\n")
    .map((line) => (line.startsWith(".") ? `.${line}` : line))
    .join("\r\n");
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

export interface SmtpConfig {
  host: string;
  port: number;
  secure: boolean;
  user?: string;
  pass?: string;
  from: string;
}

class SmtpClientSession {
  private socket: net.Socket | tls.TLSSocket;
  private buffer = "";
  private waiters: Array<{
    resolve: (res: { code: number; lines: string[] }) => void;
    reject: (err: Error) => void;
  }> = [];

  constructor(socket: net.Socket | tls.TLSSocket) {
    this.socket = socket;
    this.attachListeners(socket);
  }

  private attachListeners(sock: net.Socket | tls.TLSSocket) {
    sock.setTimeout(10_000);
    sock.on("data", (chunk: Buffer) => {
      this.buffer += chunk.toString("utf8");
      this.flushLines();
    });
    sock.on("error", (err: Error) => {
      while (this.waiters.length > 0) {
        this.waiters.shift()?.reject(err);
      }
    });
    sock.on("timeout", () => {
      const err = new Error("SMTP socket timeout");
      sock.destroy(err);
    });
  }

  private flushLines() {
    const lines = this.buffer.split("\r\n");
    this.buffer = lines.pop() ?? "";
    const collected: string[] = [];

    for (const line of lines) {
      if (!line) continue;
      collected.push(line);
      // Last line of an SMTP reply has a space after the 3-digit status code
      if (/^\d{3} /.test(line)) {
        const code = Number(line.slice(0, 3));
        const waiter = this.waiters.shift();
        if (waiter) {
          waiter.resolve({ code, lines: collected.splice(0) });
        }
      }
    }
    if (collected.length > 0) {
      this.buffer = `${collected.join("\r\n")}\r\n${this.buffer}`;
    }
  }

  readReply(): Promise<{ code: number; lines: string[] }> {
    return new Promise((resolve, reject) => {
      this.waiters.push({ resolve, reject });
    });
  }

  async command(cmd: string, expectedCodes: number[]): Promise<{ code: number; lines: string[] }> {
    const replyPromise = this.readReply();
    this.socket.write(`${cmd}\r\n`);
    const reply = await replyPromise;
    if (!expectedCodes.includes(reply.code)) {
      throw new Error(`SMTP error on command "${cmd.split(" ")[0]}": ${reply.lines.join(" | ")}`);
    }
    return reply;
  }

  async upgradeTls(host: string): Promise<void> {
    const raw = this.socket;
    raw.removeAllListeners("data");
    raw.removeAllListeners("error");
    raw.removeAllListeners("timeout");

    const secureSocket = await new Promise<tls.TLSSocket>((resolve, reject) => {
      const sock = tls.connect(
        { socket: raw, servername: host },
        () => resolve(sock)
      );
      sock.once("error", reject);
    });
    this.socket = secureSocket;
    this.attachListeners(secureSocket);
  }

  writeRaw(payload: string): void {
    this.socket.write(payload);
  }

  close(): void {
    this.socket.end();
  }
}

export class SmtpEmailTransport implements EmailTransport {
  constructor(private readonly config: SmtpConfig) {
    if (!config.host.trim()) {
      throw new Error("SMTP_HOST must be configured when EMAIL_PROVIDER=smtp");
    }
  }

  async send(input: SendEmailInput): Promise<void> {
    const { host, port, secure, user, pass, from } = this.config;
    const socket = await new Promise<net.Socket | tls.TLSSocket>((resolve, reject) => {
      if (secure) {
        const s = tls.connect({ host, port, servername: host }, () => resolve(s));
        s.once("error", reject);
      } else {
        const s = net.createConnection({ host, port }, () => resolve(s));
        s.once("error", reject);
      }
    });

    const session = new SmtpClientSession(socket);
    try {
      const greeting = await session.readReply();
      if (greeting.code !== 220) {
        throw new Error(`Unexpected SMTP greeting: ${greeting.lines.join(" ")}`);
      }

      let ehlo = await session.command("EHLO shortly.local", [250]);
      const supportsStartTls = ehlo.lines.some((l) => l.toUpperCase().includes("STARTTLS"));

      if (!secure && supportsStartTls) {
        await session.command("STARTTLS", [220]);
        await session.upgradeTls(host);
        ehlo = await session.command("EHLO shortly.local", [250]);
      }

      if (user && pass) {
        const authBlob = Buffer.from(`\u0000${user}\u0000${pass}`, "utf8").toString("base64");
        await session.command(`AUTH PLAIN ${authBlob}`, [235]);
      }

      const mailFrom = extractEmailAddress(from);
      const rcptTo = extractEmailAddress(input.to);
      await session.command(`MAIL FROM:<${mailFrom}>`, [250]);
      await session.command(`RCPT TO:<${rcptTo}>`, [250, 251]);
      await session.command("DATA", [354]);

      const headers = [
        `From: ${sanitizeHeader(from)}`,
        `To: ${sanitizeHeader(input.to)}`,
        `Subject: ${sanitizeHeader(input.subject)}`,
        `Date: ${new Date().toUTCString()}`,
        `MIME-Version: 1.0`,
        input.html
          ? `Content-Type: text/html; charset=utf-8`
          : `Content-Type: text/plain; charset=utf-8`,
      ].join("\r\n");

      const body = input.html ?? input.text;
      const donePromise = session.readReply();
      session.writeRaw(`${headers}\r\n\r\n${dotStuff(body)}\r\n.\r\n`);
      const dataReply = await donePromise;
      if (dataReply.code !== 250) {
        throw new Error(`SMTP DATA rejected: ${dataReply.lines.join(" ")}`);
      }

      await session.command("QUIT", [221]).catch(() => undefined);
    } finally {
      session.close();
    }
  }
}

export function getEmailTransport(): EmailTransport {
  const provider = (process.env.EMAIL_PROVIDER || "console").toLowerCase();
  if (provider === "smtp") {
    const port = Number(process.env.SMTP_PORT || 587);
    const secure = process.env.SMTP_SECURE === "true" || port === 465;
    return new SmtpEmailTransport({
      host: process.env.SMTP_HOST || "",
      port,
      secure,
      user: process.env.SMTP_USER || undefined,
      pass: process.env.SMTP_PASS || undefined,
      from: process.env.EMAIL_FROM || "Shortly <no-reply@shortly.local>",
    });
  }
  return new ConsoleEmailTransport();
}
