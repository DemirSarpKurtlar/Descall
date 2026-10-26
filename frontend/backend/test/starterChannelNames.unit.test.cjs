"use strict";
const assert = require("assert");
const { starterChannelNames } = require("../lib/starterChannelNames");

assert.deepEqual(starterChannelNames(), { textCategory: "Text Channels", text: "general", voiceCategory: "Voice Channels", voice: "General" });
assert.deepEqual(starterChannelNames("tr"), { textCategory: "Metin kanalları", text: "genel", voiceCategory: "Ses kanalları", voice: "Lobi" });
assert.equal(starterChannelNames("tr-TR").voice, "Lobi");
assert.equal(starterChannelNames("EN").voice, "Lobby");
assert.equal(starterChannelNames("xx").voice, "General");
console.log("starterChannelNames ok");
