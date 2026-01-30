import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";

type EmailEntry = {
  email: string;
  signupDate: string;
  source?: string;
};

type WaitlistData = {
  emails: EmailEntry[];
};

const DATA_DIR = path.join(process.cwd(), "app", "data");
const DATA_FILE = path.join(DATA_DIR, "waitlist.json");

function ensureDataFile(): WaitlistData {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }

    if (!fs.existsSync(DATA_FILE)) {
      const initialData: WaitlistData = { emails: [] };
      fs.writeFileSync(DATA_FILE, JSON.stringify(initialData, null, 2));
      return initialData;
    }

    const content = fs.readFileSync(DATA_FILE, "utf-8");
    const parsed = JSON.parse(content);

    if (!parsed || !Array.isArray(parsed.emails)) {
      const initialData: WaitlistData = { emails: [] };
      fs.writeFileSync(DATA_FILE, JSON.stringify(initialData, null, 2));
      return initialData;
    }

    return parsed;
  } catch (err) {
    console.error("[Waitlist] ensureDataFile error:", err);
    const initialData: WaitlistData = { emails: [] };
    try {
      if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
      }
      fs.writeFileSync(DATA_FILE, JSON.stringify(initialData, null, 2));
    } catch (writeErr) {
      console.error("[Waitlist] Failed to create file:", writeErr);
    }
    return initialData;
  }
}

function saveData(data: WaitlistData): void {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

function isValidEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { email, source } = body;

    if (!email || typeof email !== "string") {
      return NextResponse.json(
        { error: "Email is required" },
        { status: 400 }
      );
    }

    const normalizedEmail = email.trim().toLowerCase();

    if (!isValidEmail(normalizedEmail)) {
      return NextResponse.json(
        { error: "Please enter a valid email address" },
        { status: 400 }
      );
    }

    const data = ensureDataFile();

    const existingEmail = data.emails.find(
      (entry) => entry.email === normalizedEmail
    );

    if (existingEmail) {
      return NextResponse.json(
        { message: "You're already on the waitlist!" },
        { status: 200 }
      );
    }

    const newEntry: EmailEntry = {
      email: normalizedEmail,
      signupDate: new Date().toISOString(),
      source: source || "waitlist",
    };

    data.emails.push(newEntry);
    saveData(data);

    console.log(`[Waitlist] New signup: ${normalizedEmail} (total: ${data.emails.length})`);

    return NextResponse.json(
      { message: "You're on the list! We'll be in touch soon." },
      { status: 201 }
    );
  } catch (error) {
    console.error("[Waitlist] Error:", error);
    return NextResponse.json(
      { error: "Something went wrong. Please try again." },
      { status: 500 }
    );
  }
}

export async function GET() {
  try {
    const data = ensureDataFile();
    return NextResponse.json({
      count: data.emails.length,
      emails: data.emails,
    });
  } catch (error) {
    console.error("[Waitlist] Error fetching emails:", error);
    return NextResponse.json(
      { error: "Failed to fetch emails" },
      { status: 500 }
    );
  }
}
