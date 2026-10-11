import assert from "node:assert/strict";
import { COPYRIGHT_CONTENT, PRIVACY_CONTENT, TERMS_CONTENT } from "./legalContent.js";
import { contactCopy, isRightsHeading, legalSlug, summaryCards } from "./legalView.js";

function uniqueSlugs(data) {
  const slugs = data.sections.map((section, index) => legalSlug(section.heading, index));
  assert.equal(new Set(slugs).size, slugs.length, data.title);
}

for (const pack of [PRIVACY_CONTENT, TERMS_CONTENT, COPYRIGHT_CONTENT]) {
  uniqueSlugs(pack.tr);
  uniqueSlugs(pack.en);
}

const privacy = summaryCards("privacy", PRIVACY_CONTENT.tr, "tr");
assert.equal(privacy.length, 4);
assert.equal(privacy[0].label, "Ne topluyoruz");
assert.match(privacy[0].excerpt, /Hesap bilgileri/);
assert.equal(privacy[3].id, legalSlug("13. Bize Ulaşın", 0));

const rights = PRIVACY_CONTENT.tr.sections.find((section) => isRightsHeading(section.heading));
assert.ok(rights && rights.paragraphs.length >= 2);

const contact = contactCopy("privacy", "tr");
assert.match(contact.before, /Gizlilik talepleri/);
assert.equal(contactCopy("terms", "en").before, "Questions:");

console.log("legalView.selftest ok");
