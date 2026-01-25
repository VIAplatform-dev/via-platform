import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";

type EmailEntry = {
  email: string;
  signupDate: string;
  source?: string;
};

type EmailsData = {
  emails: EmailEntry[];
};

const DATA_DIR = path.join(process.cwd(), "app/data");
const DATA_FILE = path.join(DATA_DIR, "emails.json");

function ensureDataFile(): EmailsData {
  try {
    // Ensure directory exists
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }

    // Create file if it doesn't exist
    if (!fs.existsSync(DATA_FILE)) {
      const initialData: EmailsData = { emails: [] };
      fs.writeFileSync(DATA_FILE, JSON.stringify(initialData, null, 2));
      return initialData;
    }

    // Read and parse existing file
    const content = fs.readFileSync(DATA_FILE, "utf-8");
    const parsed = JSON.parse(content);

    // Validate structure
    if (!parsed || !Array.isArray(parsed.emails)) {
      const initialData: EmailsData = { emails: [] };
      fs.writeFileSync(DATA_FILE, JSON.stringify(initialData, null, 2));
      return initialData;
    }

    return parsed;
  } catch {
    // If all else fails, create fresh file
    const initialData: EmailsData = { emails: [] };
    try {
      if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
      }
      fs.writeFileSync(DATA_FILE, JSON.stringify(initialData, null, 2));
    } catch {
      // Silently fail if we can't write
    }
    return initialData;
  }
}

function saveData(data: EmailsData): void {
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

    // Validate email presence
    if (!email || typeof email !== "string") {
      return NextResponse.json(
        { error: "Email is required" },
        { status: 400 }
      );
    }

    const normalizedEmail = email.trim().toLowerCase();

    // Validate email format
    if (!isValidEmail(normalizedEmail)) {
      return NextResponse.json(
        { error: "Please enter a valid email address" },
        { status: 400 }
      );
    }

    // Load existing data
    const data = ensureDataFile();

    // Check for duplicates
    const existingEmail = data.emails.find(
      (entry) => entry.email === normalizedEmail
    );

    if (existingEmail) {
      return NextResponse.json(
        { message: "You're already on the list!" },
        { status: 200 }
      );
    }

    // Add new email
    const newEntry: EmailEntry = {
      email: normalizedEmail,
      signupDate: new Date().toISOString(),
      source: source || "website",
    };

    data.emails.push(newEntry);
    saveData(data);

    return NextResponse.json(
      { message: "Welcome to VIA! We'll keep you updated." },
      { status: 201 }
    );
  } catch (error) {
    console.error("Newsletter signup error:", error);
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
    console.error("Error fetching emails:", error);
    return NextResponse.json(
      { error: "Failed to fetch emails" },
      { status: 500 }
    );
  }
}
