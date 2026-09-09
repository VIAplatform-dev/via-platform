// The questions a store's contact form asks.
//
// The form used to be three hardcoded inputs — Name, Email, Message — with no way to change them.
// That is fine for "get in touch" and wrong for everything else a vintage store actually collects:
// a sourcing request needs a size, a wholesale enquiry needs a company, a repair needs a photo
// reference. So the fields are content now, edited in the section like any other list.
//
// Stored the way every other repeated list is stored (see storefront-items.ts): one string in the
// block's props. Nothing here knows about the delimiter.

import { readItems, type Item, type ItemSchema } from "./storefront-items";

export const CONTACT_FIELD_SCHEMA: ItemSchema = { key: "fields", fields: ["label", "type", "required", "options"] };

export type ContactFieldType = "text" | "email" | "phone" | "long" | "choice";

export type ContactField = {
 label: string;
 type: ContactFieldType;
 required: boolean;
 /** Only used by "choice" — the options a visitor picks between. */
 options: string[];
};

/** What the seller picks between in the editor. Labels are the seller's words, not input types. */
export const CONTACT_FIELD_TYPES: { value: ContactFieldType; label: string }[] = [
 { value: "text", label: "Short answer" },
 { value: "email", label: "Email address" },
 { value: "phone", label: "Phone number" },
 { value: "long", label: "Long answer" },
 { value: "choice", label: "Pick from a list" },
];

/**
 * What a form asks when the seller hasn't changed anything — including every storefront saved before
 * this existed, which has no `fields` prop at all. Identical to the three inputs the form has always
 * rendered, so nothing already published changes shape.
 */
export const DEFAULT_CONTACT_FIELDS: ContactField[] = [
 { label: "Name", type: "text", required: false, options: [] },
 { label: "Email", type: "email", required: true, options: [] },
 { label: "Message", type: "long", required: true, options: [] },
];

const TYPES = new Set<string>(CONTACT_FIELD_TYPES.map((t) => t.value));

function toField(it: Item): ContactField | null {
 const label = (it.label || "").trim().slice(0, 80);
 if (!label) return null; // a row with no question isn't a question
 const raw = (it.type || "").trim().toLowerCase();
 const type = (TYPES.has(raw) ? raw : "text") as ContactFieldType;
 // The editor writes "yes"; be lenient about what else counts, since this string is also reachable
 // from VYA's assistant tools and from an imported site.
 const required = /^(yes|true|1|required)$/i.test((it.required || "").trim());
 const options = type === "choice"
  ? (it.options || "").split(",").map((s) => s.trim()).filter(Boolean).slice(0, 24)
  : [];
 return { label, type, required, options };
}

/** The fields a contact section asks for. Falls back to the standard three. */
export function readContactFields(props: Record<string, string> | undefined): ContactField[] {
 const out = readItems(props, CONTACT_FIELD_SCHEMA).map(toField).filter((f): f is ContactField => !!f);
 return out.length ? out.slice(0, 12) : DEFAULT_CONTACT_FIELDS;
}

/** A stable key for one field's answer. Position-based, so two fields may share a label. */
export const answerKey = (i: number) => `f${i}`;

/**
 * Turn a set of answers into the three things a conversation is made of.
 *
 * The inbox stores a name, an email and a message — that's the shape of a thread, and it shouldn't
 * change because a seller added a question. So: the first email field is the email, the first field
 * that reads like a name is the name, the first long answer is the message, and every other answer
 * is written into the message as a labelled line. The seller reads one note with everything in it
 * rather than losing the size and the phone number somewhere off-schema.
 */
export function splitSubmission(fields: ContactField[], values: Record<string, string>): { name: string; email: string; message: string } {
 const answered = fields.map((f, i) => ({ f, v: (values[answerKey(i)] || "").trim() }));
 const emailAt = answered.findIndex(({ f, v }) => f.type === "email" && v);
 const nameAt = answered.findIndex(({ f, v }) => v && /\bname\b/i.test(f.label));
 const bodyAt = answered.findIndex(({ f, v }) => f.type === "long" && v);
 const extras = answered
  .filter((_, i) => i !== emailAt && i !== nameAt && i !== bodyAt)
  .filter(({ v }) => v)
  .map(({ f, v }) => `${f.label}: ${v}`);
 const body = bodyAt >= 0 ? answered[bodyAt].v : "";
 // Extras go under the message so the note reads as a message with details attached, and a form
 // made only of short answers still produces a message rather than an empty one the API rejects.
 const message = [body, extras.join("\n")].filter(Boolean).join(body && extras.length ? "\n\n" : "");
 return {
  name: nameAt >= 0 ? answered[nameAt].v : "",
  email: emailAt >= 0 ? answered[emailAt].v : "",
  message,
 };
}

/** Whether the visitor has filled in enough to send. */
export function canSubmit(fields: ContactField[], values: Record<string, string>): boolean {
 if (fields.some((f, i) => f.required && !(values[answerKey(i)] || "").trim())) return false;
 // Something has to be said, whatever the seller marked required.
 return fields.some((_, i) => (values[answerKey(i)] || "").trim());
}

/**
 * Copy a template left for the seller to replace — "[YOUR EMAIL]", "[@YOURHANDLE]". Fine as a prompt
 * in the editor, broken as a `mailto:` on a published page, so the live site leaves it out.
 */
export const isPlaceholderCopy = (v: string | undefined) => !!v && /^\s*\[.*\]\s*$/.test(v);
