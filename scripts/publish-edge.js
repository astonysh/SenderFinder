#!/usr/bin/env node
// Edge Add-ons Update REST API (v1.1 authentication, /v1 endpoints).
// Credentials stay outside the package and git. POSTs are never automatically retried.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const base = 'https://api.addons.microsoftedge.microsoft.com';
const productId = process.env.EDGE_PRODUCT_ID || 'e29bfc9a-64dd-4a2d-83be-eee965037989';
const version = JSON.parse(fs.readFileSync(path.join(root, 'extension/manifest.json'), 'utf8')).version;
const args = process.argv.slice(2), command = args.shift();
const option = name => { const at = args.indexOf(name); if (at < 0) return null; const value = args[at + 1]; if (!value || value.startsWith('--')) throw Error(`Missing ${name} value`); return value; };
const file = path.resolve(root, option('--file') || `output/senderfinder-edge-${version}.zip`);
const stateFile = path.resolve(root, option('--state') || `output/edge-publish-${version}.json`);
const credentialsFile = path.resolve(root, process.env.EDGE_CREDENTIALS_FILE || 'data/edge-publish/credentials.json');
const notesFile = option('--notes-file');
const endpoint = `/v1/products/${productId}/submissions`;
const guid = /^[a-f\d]{8}-(?:[a-f\d]{4}-){3}[a-f\d]{12}$/i;
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const state = fs.existsSync(stateFile) ? JSON.parse(fs.readFileSync(stateFile, 'utf8')) : { productId, version };
if (state.productId !== productId) throw Error('State belongs to another product; choose a separate --state file.');
function save() { fs.mkdirSync(path.dirname(stateFile), { recursive: true }); fs.writeFileSync(stateFile, JSON.stringify(state, null, 2) + '\n', { mode: 0o600 }); }
let apiKey, clientId;
function credentials() {
  const local = fs.existsSync(credentialsFile) ? JSON.parse(fs.readFileSync(credentialsFile, 'utf8')) : {};
  apiKey = process.env.EDGE_API_KEY || local.apiKey;
  clientId = process.env.EDGE_CLIENT_ID || local.clientId;
  if (!apiKey || !clientId) throw Error('Configure EDGE_API_KEY and EDGE_CLIENT_ID, or the ignored local credentials file.');
  if (!guid.test(clientId) || /[\r\n]/.test(apiKey)) throw Error('Invalid API credentials format.');
}
function safe(value) { return String(value).replaceAll(apiKey || '\u0000', '[REDACTED]').slice(0, 5000); }
async function request(route, { method = 'GET', body, contentType } = {}) {
  if (!route.startsWith(endpoint)) throw Error('Unexpected API operation path.');
  const response = await fetch(base + route, {
    method, body, redirect: 'error', signal: AbortSignal.timeout(60000),
    headers: { Authorization: `ApiKey ${apiKey}`, 'X-ClientID': clientId, ...(contentType ? { 'Content-Type': contentType } : {}) },
  });
  const raw = await response.text();
  let data; try { data = JSON.parse(raw); } catch { data = raw; }
  if (!response.ok) throw Object.assign(Error(`HTTP ${response.status}: ${safe(typeof data === 'string' ? data : JSON.stringify(data))}`), { httpStatus: response.status });
  return { status: response.status, location: response.headers.get('location'), data };
}
function operation(location, kind) {
  if (!location) throw Error('API accepted the request without a Location header. Inspect Partner Center before retrying.');
  const id = location.split('/').filter(Boolean).at(-1);
  if (!guid.test(id)) throw Error('Unexpected operation ID. Inspect Partner Center before retrying.');
  if (/^https?:/.test(location) && new URL(location).origin !== base) throw Error('Refusing an operation on a different host.');
  return `${endpoint}${kind === 'upload' ? '/draft/package' : ''}/operations/${id}`;
}
async function upload() {
  const bytes = fs.readFileSync(file);
  if (bytes.readUInt32LE(0) !== 0x04034b50) throw Error('Package is not a ZIP archive.');
  const sha256 = crypto.createHash('sha256').update(bytes).digest('hex');
  if (state.uploadRequestedAt) {
    if (state.sha256 === sha256 && state.uploadOperation) { console.log('Existing upload operation retained; no second upload sent.'); return; }
    throw Error('An upload was already requested. Inspect saved state and Partner Center before starting another operation.');
  }
  Object.assign(state, { package: path.basename(file), sha256, uploadRequestedAt: new Date().toISOString() }); save();
  let response;
  try { response = await request(endpoint + '/draft/package', { method: 'POST', body: bytes, contentType: 'application/zip' }); }
  catch (error) {
    if (error.httpStatus === 401) { state.lastAuthenticationRejection = new Date().toISOString(); delete state.uploadRequestedAt; save(); }
    throw error;
  }
  if (response.status !== 202) throw Error(`Unexpected upload response: HTTP ${response.status}; inspect Partner Center.`);
  state.uploadOperation = operation(response.location, 'upload'); save();
  console.log('Package upload accepted. Operation saved to ' + path.relative(root, stateFile));
}
async function status(kind) {
  const route = state[kind + 'Operation'];
  if (!route) throw Error(`No ${kind} operation recorded. Check ${path.relative(root, stateFile)} and Partner Center.`);
  const response = await request(route);
  state[kind + 'Result'] = response.data; state.checkedAt = new Date().toISOString(); save();
  console.log(safe(JSON.stringify({ kind, ...response.data })));
  return response.data;
}
async function wait(kind) {
  for (let i = 0; i < 60; i++) {
    const data = await status(kind);
    if (data.status === 'Succeeded') return;
    if (data.status === 'Failed' || data.errorCode) throw Error(`${kind} failed: ${safe(JSON.stringify(data))}`);
    if (data.status !== 'InProgress') throw Error(`Unexpected ${kind} status; inspect saved state before continuing.`);
    await delay(5000);
  }
  throw Error('Operation is still pending. Resume with status; no request was resubmitted.');
}
async function submit() {
  if (state.uploadResult?.status !== 'Succeeded') throw Error('Wait for successful package verification before submitting.');
  if (state.publishRequestedAt && args.includes('--retry-failed') && state.publishResult?.status === 'Failed') {
    state.previousPublishOperations = [...(state.previousPublishOperations || []), { operation: state.publishOperation, result: state.publishResult }];
    delete state.publishRequestedAt; delete state.publishOperation; delete state.publishResult; save();
  }
  if (state.publishRequestedAt) {
    if (state.publishOperation) { console.log('Existing submission operation retained; no second submission sent.'); return; }
    throw Error('A submission was already requested; inspect Partner Center before retrying.');
  }
  if (!notesFile) throw Error('Provide --notes-file with reviewer instructions.');
  const notes = fs.readFileSync(path.resolve(root, notesFile), 'utf8').trim();
  if (!notes || notes.length >= 2000) throw Error('Certification notes must contain 1–1999 characters.');
  state.publishRequestedAt = new Date().toISOString(); save();
  const response = await request(endpoint, { method: 'POST', contentType: 'application/json', body: JSON.stringify({ notes }) });
  if (response.status !== 202) throw Error(`Unexpected submission response: HTTP ${response.status}; inspect Partner Center.`);
  state.publishOperation = operation(response.location, 'publish'); save();
  console.log('Submission request accepted; checking whether certification submission was created.');
}
try {
  if (!['upload', 'submit', 'publish', 'status', 'wait'].includes(command)) throw Error('Usage: npm run publish:edge -- upload|submit|publish|status|wait [--notes-file path] [--kind upload|publish] [--file path] [--state path]');
  if (!guid.test(productId)) throw Error('Invalid product ID.');
  if (['status', 'wait'].includes(command) && !['upload', 'publish'].includes(option('--kind') || 'upload')) throw Error('Kind must be upload or publish.');
  credentials();
  if (command === 'upload') await upload();
  if (command === 'submit') await submit();
  if (command === 'status') await status(option('--kind') || 'upload');
  if (command === 'wait') await wait(option('--kind') || 'upload');
  if (command === 'publish') { await upload(); await wait('upload'); await submit(); await wait('publish'); console.log('Certification submission created. Store review and public rollout are separate.'); }
} catch (error) { console.error(safe(error.message)); process.exitCode = 1; }
