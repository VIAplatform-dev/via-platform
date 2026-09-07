import { test } from "node:test";
import assert from "node:assert/strict";
import { readContactFields, splitSubmission, canSubmit, answerKey, isPlaceholderCopy, DEFAULT_CONTACT_FIELDS } from "./contact-fields.ts";

test("a storefront saved before form fields existed still asks the three original questions", () => {
 assert.deepEqual(readContactFields(undefined), DEFAULT_CONTACT_FIELDS);
 assert.deepEqual(readContactFields({ heading: "Get in touch" }), DEFAULT_CONTACT_FIELDS);
 assert.deepEqual(readContactFields({ fields: "   " }), DEFAULT_CONTACT_FIELDS);
});

test("the seller's questions are read with their type, requiredness and options", () => {
 const f = readContactFields({ fields: "Name | text\nEmail | email | yes\nSize | choice |  | S, M, L\nMessage | long | yes" });
 assert.equal(f.length, 4);
 assert.deepEqual(f[2], { label: "Size", type: "choice", required: false, options: ["S", "M", "L"] });
 assert.equal(f[1].required, true);
 assert.equal(f[3].type, "long");
});

test("a question with no wording isn't a question, and an unknown type is a short answer", () => {
 const f = readContactFields({ fields: "Name | text\n | email | yes\nWhat | wingdings" });
 assert.deepEqual(f.map((x) => x.label), ["Name", "What"]);
 assert.equal(f[1].type, "text");
});

test("only a list question carries options", () => {
 assert.deepEqual(readContactFields({ fields: "Phone | phone | | S, M" })[0].options, []);
});

test("the inbox still gets a name, an email and a message however the form is arranged", () => {
 const fields = readContactFields({ fields: "Your name | text\nEmail | email | yes\nMessage | long | yes" });
 const got = splitSubmission(fields, { [answerKey(0)]: "Tess", [answerKey(1)]: "t@x.com", [answerKey(2)]: "Is this a 10?" });
 assert.deepEqual(got, { name: "Tess", email: "t@x.com", message: "Is this a 10?" });
});

test("questions the seller added arrive under the message instead of being lost", () => {
 const fields = readContactFields({ fields: "Name | text\nEmail | email\nSize | choice | | S, M\nMessage | long" });
 const { message } = splitSubmission(fields, { [answerKey(0)]: "Tess", [answerKey(1)]: "t@x.com", [answerKey(2)]: "M", [answerKey(3)]: "Do you have this in blue?" });
 assert.equal(message, "Do you have this in blue?\n\nSize: M");
});

test("a form with no long answer still produces a message, so the API doesn't reject it", () => {
 const fields = readContactFields({ fields: "Name | text\nWhat are you after | text" });
 const { message, name } = splitSubmission(fields, { [answerKey(0)]: "Tess", [answerKey(1)]: "A 90s slip" });
 assert.equal(name, "Tess");
 assert.equal(message, "What are you after: A 90s slip");
});

test("send is refused while a required question is blank, and while nothing is filled in", () => {
 const fields = readContactFields({ fields: "Name | text\nMessage | long | yes" });
 assert.equal(canSubmit(fields, {}), false);
 assert.equal(canSubmit(fields, { [answerKey(0)]: "Tess" }), false);
 assert.equal(canSubmit(fields, { [answerKey(1)]: "hello" }), true);
});

test("a bracketed prompt the template left behind is recognised as unfilled", () => {
 assert.equal(isPlaceholderCopy("[YOUR EMAIL]"), true);
 assert.equal(isPlaceholderCopy("hello@tesselizabeth.com"), false);
 assert.equal(isPlaceholderCopy(""), false);
});
