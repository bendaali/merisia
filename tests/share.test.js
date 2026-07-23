import test, { before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import {
  bootstrapSession,
  closeTestApp,
  extractSessionCookie,
  getTestApp,
  resetDatabase,
  uniqueEmail,
  withSession
} from './helpers.js';

let app;
let pool;

before(async () => {
  ({ app, pool } = await getTestApp());
});

beforeEach(async () => {
  await resetDatabase(pool);
});

after(async () => {
  await closeTestApp();
});

async function registerAndLogin(prefix) {
  const agent = request(app);
  const { csrfToken, cookieHeader } = await bootstrapSession(agent);
  const email = uniqueEmail(prefix);
  const res = await agent
    .post('/api/auth/register')
    .set('Cookie', cookieHeader)
    .set('x-csrf-token', csrfToken)
    .send({ email, password: 'A-very-strong-password' });
  assert.equal(res.status, 201);
  return {
    agent,
    csrfToken,
    cookie: withSession(cookieHeader, extractSessionCookie(res.headers['set-cookie']))
  };
}

async function createDesign(user, title) {
  const res = await user.agent
    .post('/api/designs')
    .set('Cookie', user.cookie)
    .set('x-csrf-token', user.csrfToken)
    .send({ title });
  assert.equal(res.status, 201);
  return res.body;
}

test('Owner can create a share link', async () => {
  const alice = await registerAndLogin('owner');
  const design = await createDesign(alice, 'Shared');

  const res = await alice.agent
    .post(`/api/designs/${design.id}/share`)
    .set('Cookie', alice.cookie)
    .set('x-csrf-token', alice.csrfToken)
    .send({ role: 'editor' });

  assert.equal(res.status, 201);
  assert.equal(res.body.role, 'editor');
  assert.ok(res.body.token);
});

test('Non-owner cannot create a share link', async () => {
  const alice = await registerAndLogin('alice');
  const bob = await registerAndLogin('bob');
  const design = await createDesign(alice, 'Locked');

  const res = await bob.agent
    .post(`/api/designs/${design.id}/share`)
    .set('Cookie', bob.cookie)
    .set('x-csrf-token', bob.csrfToken)
    .send({ role: 'editor' });
  assert.equal(res.status, 404);
});

test('Consuming a share link grants access and redirects to the editor', async () => {
  const alice = await registerAndLogin('alice');
  const bob = await registerAndLogin('bob');
  const design = await createDesign(alice, 'Editor invite');

  const linkRes = await alice.agent
    .post(`/api/designs/${design.id}/share`)
    .set('Cookie', alice.cookie)
    .set('x-csrf-token', alice.csrfToken)
    .send({ role: 'editor' });
  const token = linkRes.body.token;

  const consume = await bob.agent.get(`/share/${token}`).set('Cookie', bob.cookie);
  assert.equal(consume.status, 302);
  assert.equal(consume.headers.location, `/editor/${design.id}`);

  const visible = await bob.agent.get(`/api/designs/${design.id}`).set('Cookie', bob.cookie);
  assert.equal(visible.status, 200);
  assert.equal(visible.body.access_role, 'editor');
});

test('Viewer role cannot save the design', async () => {
  const alice = await registerAndLogin('alice');
  const bob = await registerAndLogin('bob');
  const design = await createDesign(alice, 'View only');

  const linkRes = await alice.agent
    .post(`/api/designs/${design.id}/share`)
    .set('Cookie', alice.cookie)
    .set('x-csrf-token', alice.csrfToken)
    .send({ role: 'viewer' });
  await bob.agent.get(`/share/${linkRes.body.token}`).set('Cookie', bob.cookie);

  const read = await bob.agent.get(`/api/designs/${design.id}`).set('Cookie', bob.cookie);
  assert.equal(read.status, 200);
  assert.equal(read.body.access_role, 'viewer');

  const save = await bob.agent
    .put(`/api/designs/${design.id}`)
    .set('Cookie', bob.cookie)
    .set('x-csrf-token', bob.csrfToken)
    .send({ diagram_json: { version: 3, entities: [{ id: 'hijack' }] } });
  assert.equal(save.status, 404);
});

test('Unauthenticated viewer link redirects to /guest/:token (public)', async () => {
  const alice = await registerAndLogin('alice');
  const design = await createDesign(alice, 'Public view');
  const linkRes = await alice.agent
    .post(`/api/designs/${design.id}/share`)
    .set('Cookie', alice.cookie)
    .set('x-csrf-token', alice.csrfToken)
    .send({ role: 'viewer' });

  const anon = request(app);
  const res = await anon.get(`/share/${linkRes.body.token}`);
  assert.equal(res.status, 302);
  assert.equal(res.headers.location, `/guest/${linkRes.body.token}`);

  const data = await anon.get(`/api/share/${linkRes.body.token}`);
  assert.equal(data.status, 200);
  assert.equal(data.body.access_role, 'guest');
  assert.equal(data.body.id, design.id);
});

test('Unauthenticated /share/:token redirects to /auth with next parameter', async () => {
  const alice = await registerAndLogin('alice');
  const design = await createDesign(alice, 'Anon visit');
  const linkRes = await alice.agent
    .post(`/api/designs/${design.id}/share`)
    .set('Cookie', alice.cookie)
    .set('x-csrf-token', alice.csrfToken)
    .send({ role: 'editor' });

  const anon = request(app);
  const res = await anon.get(`/share/${linkRes.body.token}`);
  assert.equal(res.status, 302);
  assert.match(res.headers.location, /^\/auth\?next=/);
});

test('Revoking a share link prevents future access', async () => {
  const alice = await registerAndLogin('alice');
  const carol = await registerAndLogin('carol');
  const design = await createDesign(alice, 'Revoke test');

  const linkRes = await alice.agent
    .post(`/api/designs/${design.id}/share`)
    .set('Cookie', alice.cookie)
    .set('x-csrf-token', alice.csrfToken)
    .send({ role: 'editor' });

  const revoke = await alice.agent
    .delete(`/api/designs/${design.id}/share`)
    .set('Cookie', alice.cookie)
    .set('x-csrf-token', alice.csrfToken)
    .send({});
  assert.equal(revoke.status, 204);

  const consume = await carol.agent.get(`/share/${linkRes.body.token}`).set('Cookie', carol.cookie);
  assert.equal(consume.status, 404);
});
