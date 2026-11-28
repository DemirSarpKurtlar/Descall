// node src/lib/trCase.selftest.mjs
import assert from "node:assert/strict";
import { trGenitive, trDative, trPossessiveNumber, nameVars } from "./trCase.js";

assert.equal(trGenitive("Ece"), "Ece'nin");
assert.equal(trGenitive("Bora"), "Bora'nın");
assert.equal(trGenitive("Kaan"), "Kaan'ın");
assert.equal(trGenitive("Mert"), "Mert'in");
assert.equal(trGenitive("Doğu"), "Doğu'nun");
assert.equal(trGenitive("Göktürk"), "Göktürk'ün");
assert.equal(trGenitive("Bora Aksoy"), "Bora Aksoy'un");
assert.equal(trGenitive("nisa_2207"), "nisa_2207'nin");
assert.equal(trGenitive("kral.oyuncu41"), "kral.oyuncu41'in");
assert.equal(trDative("Ece"), "Ece'ye");
assert.equal(trDative("Bora"), "Bora'ya");
assert.equal(trDative("Mert"), "Mert'e");
assert.equal(trDative("Kaan"), "Kaan'a");
assert.equal(trDative("Can"), "Can'a");
assert.equal(trPossessiveNumber(7), "7'si");
assert.equal(trPossessiveNumber(3), "3'ü");
assert.equal(trPossessiveNumber(6), "6'sı");
assert.equal(trPossessiveNumber(10), "10'u");
assert.deepEqual(nameVars("Ece", "en"), { name: "Ece", nameGen: "Ece", nameDat: "Ece" });
assert.deepEqual(nameVars("Bora", "tr", "user"), { user: "Bora", userGen: "Bora'nın", userDat: "Bora'ya" });
console.log("trCase selftest ok");
