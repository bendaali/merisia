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

test('POST /api/auth/register creates a user and session', async () => {
  const agent = request(app);
  const { csrfToken, cookieHeader } = await bootstrapSession(agent);
  const email = uniqueEmail('register');

  const res = await agent
    .post('/api/auth/register')
    .set('Cookie', cookieHeader)
    .set('x-csrf-token', csrfToken)
    .send({ email, password: 'A-very-strong-password' });

  assert.equal(res.status, 201);
  assert.equal(res.body.ok, true);
  assert.equal(res.body.user.email, email);
  assert.ok(extractSessionCookie(res.headers['set-cookie']));
});

test('POST /api/auth/register rejects weak password', async () => {
  const agent = request(app);
  const { csrfToken, cookieHeader } = await bootstrapSession(agent);
  const res = await agent
    .post('/api/auth/register')
    .set('Cookie', cookieHeader)
    .set('x-csrf-token', csrfToken)
    .send({ email: uniqueEmail('weak'), password: 'short' });

  assert.equal(res.status, 400);
  assert.equal(res.body.ok, false);
});

test('POST /api/auth/register without CSRF token is rejected', async () => {
  const agent = request(app);
  const { cookieHeader } = await bootstrapSession(agent);
  const res = await agent
    .post('/api/auth/register')
    .set('Cookie', cookieHeader)
    .send({ email: uniqueEmail('nocsrf'), password: 'A-very-strong-password' });

  assert.equal(res.status, 403);
});

test('POST /api/auth/login authenticates an existing user', async () => {
  const agent = request(app);
  const { csrfToken, cookieHeader } = await bootstrapSession(agent);
  const email = uniqueEmail('login');
  const password = 'A-very-strong-password';

  await agent
    .post('/api/auth/register')
    .set('Cookie', cookieHeader)
    .set('x-csrf-token', csrfToken)
    .send({ email, password });

  const res = await agent
    .post('/api/auth/login')
    .set('Cookie', cookieHeader)
    .set('x-csrf-token', csrfToken)
    .send({ email, password });

  assert.equal(res.status, 200);
  assert.equal(res.body.ok, true);
  assert.equal(res.body.user.email, email);
  assert.ok(extractSessionCookie(res.headers['set-cookie']));
});

test('POST /api/auth/login rejects wrong password', async () => {
  const agent = request(app);
  const { csrfToken, cookieHeader } = await bootstrapSession(agent);
  const email = uniqueEmail('loginbad');

  await agent
    .post('/api/auth/register')
    .set('Cookie', cookieHeader)
    .set('x-csrf-token', csrfToken)
    .send({ email, password: 'A-very-strong-password' });

  const res = await agent
    .post('/api/auth/login')
    .set('Cookie', cookieHeader)
    .set('x-csrf-token', csrfToken)
    .send({ email, password: 'wrong-password-value' });

  assert.equal(res.status, 401);
});

test('GET /api/me returns the current user when authenticated', async () => {
  const agent = request(app);
  const { csrfToken, cookieHeader } = await bootstrapSession(agent);
  const email = uniqueEmail('me');

  const registerRes = await agent
    .post('/api/auth/register')
    .set('Cookie', cookieHeader)
    .set('x-csrf-token', csrfToken)
    .send({ email, password: 'A-very-strong-password' });

  const session = extractSessionCookie(registerRes.headers['set-cookie']);
  const res = await agent
    .get('/api/me')
    .set('Cookie', withSession(cookieHeader, session));

  assert.equal(res.status, 200);
  assert.equal(res.body.user.email, email);
});

test('GET /api/me without session returns 401', async () => {
  const agent = request(app);
  const res = await agent.get('/api/me');
  assert.equal(res.status, 401);
});

test('POST /api/auth/logout invalidates the session', async () => {
  const agent = request(app);
  const { csrfToken, cookieHeader } = await bootstrapSession(agent);
  const email = uniqueEmail('logout');

  const registerRes = await agent
    .post('/api/auth/register')
    .set('Cookie', cookieHeader)
    .set('x-csrf-token', csrfToken)
    .send({ email, password: 'A-very-strong-password' });

  const session = extractSessionCookie(registerRes.headers['set-cookie']);
  const sessionCookie = withSession(cookieHeader, session);

  const logoutRes = await agent
    .post('/api/auth/logout')
    .set('Cookie', sessionCookie)
    .set('x-csrf-token', csrfToken);
  assert.equal(logoutRes.status, 200);

  const meRes = await agent.get('/api/me').set('Cookie', sessionCookie);
  assert.equal(meRes.status, 401);
});
