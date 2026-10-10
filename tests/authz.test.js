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
  const session = extractSessionCookie(res.headers['set-cookie']);
  return {
    agent,
    csrfToken,
    cookie: withSession(cookieHeader, session)
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

test('GET /api/designs returns only the current user designs', async () => {
  const alice = await registerAndLogin('alice');
  const bob = await registerAndLogin('bob');

  await createDesign(alice, 'Alice design 1');
  await createDesign(alice, 'Alice design 2');
  await createDesign(bob, 'Bob design');

  const aliceList = await alice.agent.get('/api/designs').set('Cookie', alice.cookie);
  assert.equal(aliceList.status, 200);
  assert.equal(aliceList.body.length, 2);
  assert.ok(aliceList.body.every((d) => d.title.startsWith('Alice')));

  const bobList = await bob.agent.get('/api/designs').set('Cookie', bob.cookie);
  assert.equal(bobList.body.length, 1);
  assert.equal(bobList.body[0].title, 'Bob design');
});

test('GET /api/designs/:id from another user returns 404', async () => {
  const alice = await registerAndLogin('alice');
  const bob = await registerAndLogin('bob');
  const aliceDesign = await createDesign(alice, 'Private alice');

  const res = await bob.agent.get(`/api/designs/${aliceDesign.id}`).set('Cookie', bob.cookie);
  assert.equal(res.status, 404);
});

test('PUT /api/designs/:id from another user returns 404 and does not modify data', async () => {
  const alice = await registerAndLogin('alice');
  const bob = await registerAndLogin('bob');
  const design = await createDesign(alice, 'Original title');

  const res = await bob.agent
    .put(`/api/designs/${design.id}`)
    .set('Cookie', bob.cookie)
    .set('x-csrf-token', bob.csrfToken)
    .send({ diagram_json: { version: 3, entities: [{ id: 'pwned' }] } });
  assert.equal(res.status, 404);

  const check = await alice.agent.get(`/api/designs/${design.id}`).set('Cookie', alice.cookie);
  assert.equal(check.status, 200);
  assert.deepEqual(check.body.diagram_json.entities, []);
});

test('PATCH /api/designs/:id from another user returns 404', async () => {
  const alice = await registerAndLogin('alice');
  const bob = await registerAndLogin('bob');
  const design = await createDesign(alice, 'Alice title');

  const res = await bob.agent
    .patch(`/api/designs/${design.id}`)
    .set('Cookie', bob.cookie)
    .set('x-csrf-token', bob.csrfToken)
    .send({ title: 'Hijacked' });
  assert.equal(res.status, 404);

  const check = await alice.agent.get(`/api/designs/${design.id}`).set('Cookie', alice.cookie);
  assert.equal(check.body.title, 'Alice title');
});

test('DELETE /api/designs/:id from another user leaves the design intact', async () => {
  const alice = await registerAndLogin('alice');
  const bob = await registerAndLogin('bob');
  const design = await createDesign(alice, 'Keep me');

  const res = await bob.agent
    .delete(`/api/designs/${design.id}`)
    .set('Cookie', bob.cookie)
    .set('x-csrf-token', bob.csrfToken);
  assert.equal(res.status, 204);

  const check = await alice.agent.get(`/api/designs/${design.id}`).set('Cookie', alice.cookie);
  assert.equal(check.status, 200);
});

test('GET /api/designs/:id/xml from another user returns 404', async () => {
  const alice = await registerAndLogin('alice');
  const bob = await registerAndLogin('bob');
  const design = await createDesign(alice, 'Secret');

  const res = await bob.agent.get(`/api/designs/${design.id}/xml`).set('Cookie', bob.cookie);
  assert.equal(res.status, 404);
});

test('GET /api/folders is scoped to the current user', async () => {
  const alice = await registerAndLogin('alice');
  const bob = await registerAndLogin('bob');

  await alice.agent
    .post('/api/folders')
    .set('Cookie', alice.cookie)
    .set('x-csrf-token', alice.csrfToken)
    .send({ name: 'Alice folder' });

  const bobFolders = await bob.agent.get('/api/folders').set('Cookie', bob.cookie);
  assert.equal(bobFolders.body.length, 0);
});

test('Design ids are UUIDs and numeric ids return 404', async () => {
  const alice = await registerAndLogin('uuids');
  const design = await createDesign(alice, 'UUID test');
  const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
  assert.match(design.id, uuidRe);

  const numeric = await alice.agent.get('/api/designs/1').set('Cookie', alice.cookie);
  assert.equal(numeric.status, 404);
});

test('POST /api/designs with another user folder_id is rejected', async () => {
  const alice = await registerAndLogin('alice');
  const bob = await registerAndLogin('bob');

  const folder = await alice.agent
    .post('/api/folders')
    .set('Cookie', alice.cookie)
    .set('x-csrf-token', alice.csrfToken)
    .send({ name: 'Alice folder' });

  const res = await bob.agent
    .post('/api/designs')
    .set('Cookie', bob.cookie)
    .set('x-csrf-token', bob.csrfToken)
    .send({ title: 'Cross folder', folder_id: folder.body.id });
  assert.equal(res.status, 400);
});
