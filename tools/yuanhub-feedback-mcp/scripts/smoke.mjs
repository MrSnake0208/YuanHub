import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/client';
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';

const diagnostic = '/open-api/maayuan-diagnostics';
const feedback = '/open-api/feedback/queue';
const requests = [];
let revoked = false;

const api = createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');
  const path = url.pathname;
  requests.push({ path, method: req.method, token: req.headers.authorization });
  const json = (status, value) => {
    res.writeHead(status, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(value));
  };
  const readsDiagnostics = path.startsWith(diagnostic + '/');
  const token = readsDiagnostics ? 'Bearer diagnostic-fixture' : 'Bearer feedback-fixture';
  if (req.headers.authorization !== token || (readsDiagnostics && revoked)) {
    return json(401, { error: { code: 'token_invalid', message: 'Unauthorized' } });
  }
  if (path === feedback) return json(200, { data: { items: [{ id: 'ticket' }] } });
  if (path === diagnostic + '/issues' && url.searchParams.get('sort') === 'count') {
    return json(200, { data: { total: 1, items: [{ issue: { id: 'issue', event_count: 8, note: 'detail only' } }] } });
  }
  if (path === diagnostic + '/issues/issue') return json(200, { data: { events: [{ id: 'event' }] } });
  if (path === diagnostic + '/events/event') {
    return json(200, { data: { id: 'event', images: [{ asset_id: 'image', status: 'ready', expired: false }] } });
  }
  if (path === diagnostic + '/events/event/media/image') {
    res.writeHead(200, { 'Content-Type': 'image/jpeg' });
    return res.end(Buffer.from([0xff, 0xd8, 0xff, 0xd9]));
  }
  if (path === diagnostic + '/events/event/media/large') {
    res.writeHead(200, { 'Content-Type': 'image/jpeg', 'Transfer-Encoding': 'chunked' });
    return res.end(Buffer.alloc(65));
  }
  if (path === diagnostic + '/events/event/media/manifest') return json(200, { schema_version: 1 });
  return json(404, { error: { code: 'not_found' } });
});
await new Promise((resolve, reject) => api.once('error', reject).listen(0, '127.0.0.1', resolve));

async function withClient(credentials, run) {
  const client = new Client({ name: 'yuanhub-smoke', version: '1' });
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [fileURLToPath(new URL('../src/index.mjs', import.meta.url))],
    env: {
      YUANHUB_BASE_URL: 'http://127.0.0.1:' + api.address().port,
      YUANHUB_FEEDBACK_MCP_CONFIG_FILE: fileURLToPath(new URL('../node_modules/.missing-smoke-config.json', import.meta.url)),
      YUANHUB_MCP_MAX_ATTACHMENT_BYTES: '64',
      ...credentials,
    },
    stderr: 'pipe',
  });
  try {
    await client.connect(transport);
    await run(client);
  } finally {
    await client.close();
  }
}

const call = (client, name, args = {}) => client.callTool({ name, arguments: args });
const data = result => {
  assert.ok(!result.isError, result.content[0].text);
  return JSON.parse(result.content[0].text);
};
const errorCode = result => {
  assert.equal(result.isError, true);
  return JSON.parse(result.content[0].text).error.code;
};
try {
  await withClient({ YUANHUB_INTEGRATION_TOKEN: 'feedback-fixture', YUANHUB_DIAGNOSTICS_TOKEN: 'diagnostic-fixture' }, async client => {
    const { tools } = await client.listTools();
    assert.deepEqual(tools.map(tool => tool.name).sort(), [
      'diagnostics_get_event', 'diagnostics_get_image', 'diagnostics_get_issue', 'diagnostics_list_issues',
      'feedback_get', 'feedback_get_analysis', 'feedback_get_attachment', 'feedback_get_events', 'feedback_list', 'feedback_submit_analysis',
    ]);
    const page = data(await call(client, 'diagnostics_list_issues', { sort: 'count' }));
    assert.deepEqual(page.items, [{ id: 'issue', event_count: 8 }]);
    const issue = data(await call(client, 'diagnostics_get_issue', { id: page.items[0].id }));
    const event = data(await call(client, 'diagnostics_get_event', { event_id: issue.events[0].id }));
    const image = asset_id => call(client, 'diagnostics_get_image', { event_id: event.id, asset_id });
    assert.deepEqual((await image(event.images[0].asset_id)).content, [{ type: 'image', mimeType: 'image/jpeg', data: '/9j/2Q==' }]);
    assert.equal(errorCode(await image('large')), 'attachment_too_large');
    assert.equal(errorCode(await image('manifest')), 'expected_image');
    revoked = true;
    assert.equal(errorCode(await call(client, 'diagnostics_get_event', { event_id: event.id })), 'token_invalid');
    assert.equal(data(await call(client, 'feedback_list')).items[0].id, 'ticket');
    revoked = false;
  });
  await withClient({ YUANHUB_DIAGNOSTICS_TOKEN: 'diagnostic-fixture' }, async client => {
    const before = requests.length;
    assert.equal(errorCode(await call(client, 'feedback_list')), 'integration_token_not_configured');
    assert.equal(requests.length, before);
    assert.equal(data(await call(client, 'diagnostics_get_event', { event_id: 'event' })).id, 'event');
  });
  await withClient({ YUANHUB_INTEGRATION_TOKEN: 'feedback-fixture' }, async client => {
    const before = requests.length;
    assert.equal(errorCode(await call(client, 'diagnostics_list_issues')), 'diagnostics_token_not_configured');
    assert.equal(requests.length, before);
    assert.equal(data(await call(client, 'feedback_list')).items[0].id, 'ticket');
  });
  for (const { path, method, token } of requests) {
    assert.equal(method, 'GET');
    assert.equal(token, path === feedback ? 'Bearer feedback-fixture' : 'Bearer diagnostic-fixture');
  }
  console.log('通过：10 个工具、诊断读取与图片、附件大小限制、单独配置、凭据隔离及模拟撤销。');
} finally {
  await new Promise(resolve => api.close(resolve));
}
