// Gebruikersopslag in Upstash Redis (KV). Werkt met de Vercel/Upstash-integratie:
// die zet KV_REST_API_URL/KV_REST_API_TOKEN of UPSTASH_REDIS_REST_URL/_TOKEN als env vars.
const { Redis } = require("@upstash/redis");
let redis = null;

function kv() {
  if (redis) return redis;
  const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
  if (url && token) redis = new Redis({ url, token });
  return redis;
}

async function getUser(email) {
  const r = kv(); if (!r) return null;
  return await r.get("user:" + email.toLowerCase());
}
async function setUser(email, obj) {
  const r = kv(); if (!r) throw new Error("Gebruikersopslag (KV) is niet geconfigureerd");
  email = email.toLowerCase();
  await r.set("user:" + email, obj);
  await r.sadd("users", email);
}
async function delUser(email) {
  const r = kv(); if (!r) return;
  email = email.toLowerCase();
  await r.del("user:" + email);
  await r.srem("users", email);
}
async function listUsers() {
  const r = kv(); if (!r) return [];
  return (await r.smembers("users")) || [];
}

module.exports = { kv, getUser, setUser, delUser, listUsers };
