import { McpServer } from '@modelcontextprotocol/server';
import { serveStdio } from '@modelcontextprotocol/server/stdio';
import * as z from 'zod/v4';
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const maxAttachmentBytes = parsePositiveInteger(
  process.env.YUANHUB_MCP_MAX_ATTACHMENT_BYTES,
  5 * 1024 * 1024,
);
const localConfigPath =
  process.env.YUANHUB_FEEDBACK_MCP_CONFIG_FILE?.trim() ||
  join(homedir(), '.config', 'yuanhub-feedback-mcp', 'config.json');

const diagnosticPath = 'open-api/maayuan-diagnostics';
const resourceId = z.string().min(1).refine(id => id !== '.' && id !== '..', 'Invalid resource ID');

class YuanHubApiError extends Error {
  constructor(status, code, message) {
    super(message);
    this.name = 'YuanHubApiError';
    this.status = status;
    this.code = code;
  }
}

function integrationToken(path) {
  if (path.startsWith(diagnosticPath + '/')) {
    const token = process.env.YUANHUB_DIAGNOSTICS_TOKEN?.trim() || readLocalConfig().diagnostics_token?.trim();
    if (!token) {
      throw new YuanHubApiError(401, 'diagnostics_token_not_configured', 'Configure YUANHUB_DIAGNOSTICS_TOKEN or diagnostics_token');
    }
    return token;
  }

  const value =
    process.env.YUANHUB_INTEGRATION_TOKEN?.trim() ||
    readLocalConfig().integration_token?.trim();
  if (!value) {
    throw new YuanHubApiError(
      401,
      'integration_token_not_configured',
      'YUANHUB_INTEGRATION_TOKEN is not configured for this MCP process',
    );
  }
  return value;
}

function backendBaseUrl() {
  return (
    process.env.YUANHUB_BASE_URL?.trim() ||
    readLocalConfig().base_url?.trim() ||
    'http://127.0.0.1:8080'
  ).replace(/\/$/, '');
}

function readLocalConfig() {
  try {
    const parsed = JSON.parse(readFileSync(localConfigPath, 'utf8'));
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch (error) {
    if (error?.code === 'ENOENT') return {};
    throw new YuanHubApiError(
      500,
      'integration_local_config_invalid',
      `Unable to read a valid JSON configuration from ${localConfigPath}`,
    );
  }
}

function parsePositiveInteger(raw, fallback) {
  if (!raw) return fallback;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new Error('YUANHUB_MCP_MAX_ATTACHMENT_BYTES must be a positive integer');
  }
  return parsed;
}

function apiUrl(path, params = undefined) {
  const url = new URL(path, `${backendBaseUrl()}/`);
  if (params) {
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== null && value !== '') {
        url.searchParams.set(key, String(value));
      }
    }
  }
  return url;
}

function authHeaders(path, extra = undefined) {
  return {
    Accept: 'application/json',
    Authorization: `Bearer ${integrationToken(path)}`,
    ...extra,
  };
}

async function requestJson(path, { method = 'GET', params, body } = {}) {
  const response = await fetch(apiUrl(path, params), {
    method,
    redirect: 'error',
    headers: authHeaders(path, body === undefined ? undefined : { 'Content-Type': 'application/json' }),
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  const text = await response.text();
  let payload = null;
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      throw new YuanHubApiError(response.status, 'invalid_backend_response', 'YuanHub returned invalid JSON');
    }
  }

  if (!response.ok) {
    const code = payload?.error?.code ?? `http_${response.status}`;
    const message = payload?.error?.message ?? payload?.message ?? response.statusText;
    throw new YuanHubApiError(response.status, code, message);
  }

  if (payload && typeof payload.status_code === 'number' && payload.status_code !== 200) {
    throw new YuanHubApiError(
      payload.status_code,
      'yuanhub_business_error',
      payload.message ?? 'YuanHub request failed',
    );
  }

  return payload?.data ?? payload;
}

async function requestAttachment(path, imageOnly = false) {
  const response = await fetch(apiUrl(path), {
    redirect: 'error',
    headers: authHeaders(path, { Accept: imageOnly ? 'image/*' : '*/*' }),
  });

  if (!response.ok) {
    let payload = null;
    try {
      payload = await response.json();
    } catch {
      // Keep the stable fallback below.
    }
    throw new YuanHubApiError(
      response.status,
      payload?.error?.code ?? `http_${response.status}`,
      payload?.error?.message ?? payload?.message ?? response.statusText,
    );
  }

  const declaredLength = Number.parseInt(response.headers.get('content-length') ?? '', 10);
  if (Number.isFinite(declaredLength) && declaredLength > maxAttachmentBytes) {
    await response.body?.cancel();
    throw new YuanHubApiError(
      413,
      'attachment_too_large',
      `Attachment is ${declaredLength} bytes; MCP limit is ${maxAttachmentBytes} bytes`,
    );
  }

  const mimeType = response.headers.get('content-type')?.split(';', 1)[0]?.trim().toLowerCase() ||
    'application/octet-stream';
  if (imageOnly && !mimeType.startsWith('image/')) {
    await response.body?.cancel();
    throw new YuanHubApiError(415, 'expected_image', 'The requested diagnostic asset is not an image');
  }

  const chunks = [];
  let size = 0;
  for await (const chunk of response.body ?? []) {
    size += chunk.byteLength;
    if (size > maxAttachmentBytes) {
      throw new YuanHubApiError(413, 'attachment_too_large', `Attachment exceeds the MCP limit of ${maxAttachmentBytes} bytes`);
    }
    chunks.push(chunk);
  }
  return { bytes: Buffer.concat(chunks, size), mimeType };
}

function imageResult(bytes, mimeType) {
  return { content: [{ type: 'image', data: bytes.toString('base64'), mimeType }] };
}

function jsonResult(value) {
  return {
    content: [{ type: 'text', text: JSON.stringify(value, null, 2) }],
  };
}

function toolError(error) {
  const code = error instanceof YuanHubApiError ? error.code : 'mcp_adapter_error';
  const status = error instanceof YuanHubApiError ? error.status : undefined;
  const message = error instanceof Error ? error.message : String(error);
  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify({ error: { code, status, message } }, null, 2),
      },
    ],
    isError: true,
  };
}

function registerJsonTool(server, name, config, handler) {
  server.registerTool(name, config, async (args) => {
    try {
      return jsonResult(await handler(args));
    } catch (error) {
      return toolError(error);
    }
  });
}

function createServer() {
  const server = new McpServer({
    name: 'yuanhub-feedback',
    version: '0.1.0',
  });

  registerJsonTool(
    server,
    'feedback_list',
    {
      title: 'List YuanHub feedback',
      description:
        'List feedback tickets visible to this integration token. This is read-only and does not mark tickets as read.',
      inputSchema: z.object({
        queue: z
          .enum(['UNASSIGNED', 'MINE', 'NEEDS_REPLY', 'DEV', 'RETURNED', 'CLOSED', 'ALL'])
          .default('UNASSIGNED'),
        page: z.number().int().min(1).default(1),
        page_size: z.number().int().min(1).max(100).default(20),
        work_area: z.string().min(1).optional(),
        type: z.string().min(1).optional(),
        q: z.string().min(1).optional(),
        sort_by: z.enum(['createdAt', 'updatedAt']).default('updatedAt'),
        sort_order: z.enum(['asc', 'desc']).default('desc'),
      }),
    },
    async (args) =>
      requestJson('open-api/feedback/queue', {
        params: args,
      }),
  );

  registerJsonTool(
    server,
    'feedback_get',
    {
      title: 'Get YuanHub feedback',
      description:
        'Read one feedback ticket with privacy-minimized messages and diagnostics. This does not advance the human team read cursor.',
      inputSchema: z.object({
        id: resourceId,
      }),
    },
    async ({ id }) => requestJson(`open-api/feedback/${encodeURIComponent(id)}`),
  );

  registerJsonTool(
    server,
    'feedback_get_events',
    {
      title: 'Get feedback workflow events',
      description:
        'Read privacy-minimized internal workflow events for one authorized feedback ticket.',
      inputSchema: z.object({
        id: resourceId,
      }),
    },
    async ({ id }) => requestJson(`open-api/feedback/${encodeURIComponent(id)}/events`),
  );

  server.registerTool(
    'feedback_get_attachment',
    {
      title: 'Get feedback attachment',
      description:
        'Read a private ordinary-file attachment that is actually linked to an authorized feedback ticket. Text/JSON is returned as text; other files are embedded as base64 MCP resources.',
      inputSchema: z.object({
        id: resourceId,
        media_id: resourceId,
      }),
    },
    async ({ id, media_id }) => {
      try {
        const { bytes, mimeType } = await requestAttachment(
          `open-api/feedback/${encodeURIComponent(id)}/attachments/${encodeURIComponent(media_id)}`,
        );
        const uri =
          `yuanhub-feedback://${encodeURIComponent(id)}/attachment/${encodeURIComponent(media_id)}`;
        if (mimeType.startsWith('image/')) {
          return imageResult(bytes, mimeType);
        }
        const isText =
          mimeType.startsWith('text/') ||
          mimeType === 'application/json' ||
          mimeType.endsWith('+json');
        const resource = isText
          ? {
              uri,
              mimeType,
              text: new TextDecoder().decode(bytes),
            }
          : {
              uri,
              mimeType,
              blob: bytes.toString('base64'),
            };
        return {
          content: [{ type: 'resource', resource }],
        };
      } catch (error) {
        return toolError(error);
      }
    },
  );

  registerJsonTool(
    server,
    'feedback_get_analysis',
    {
      title: 'Get latest feedback analysis',
      description:
        'Read the latest stored Agent review for a ticket, including whether it is stale against the current ticket update time.',
      inputSchema: z.object({
        id: resourceId,
      }),
    },
    async ({ id }) => requestJson(`open-api/feedback/${encodeURIComponent(id)}/analysis`),
  );

  registerJsonTool(
    server,
    'feedback_submit_analysis',
    {
      title: 'Submit feedback analysis',
      description:
        'Store a structured Agent review only. This does not change the feedback type, area, status, assignee, messages, merge state, or public state.',
      inputSchema: z.object({
        id: resourceId,
        ticket_updated_at: z.iso.datetime({ offset: true }),
        source: z.enum(['WEBCODEX', 'CODEX', 'OTHER']).default('WEBCODEX'),
        model: z.string().max(120).optional(),
        summary: z.string().min(1).max(4000),
        classification: z
          .object({
            suggested_type: z.string().min(1).optional(),
            suggested_area: z.string().min(1).optional(),
            severity: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL', 'UNKNOWN']).default('UNKNOWN'),
          })
          .default({ severity: 'UNKNOWN' }),
        suspected_modules: z.array(z.string().min(1).max(500)).max(20).default([]),
        suspected_files: z.array(z.string().min(1).max(500)).max(20).default([]),
        suggested_action: z.enum([
          'NEEDS_INFO',
          'CODE_INVESTIGATION',
          'LIKELY_USER_ERROR',
          'DUPLICATE_CANDIDATE',
          'READY_FOR_TRIAGE',
          'FIXED_LOCALLY',
          'NO_ACTION',
        ]),
        confidence: z.number().min(0).max(1).optional(),
        evidence: z.array(z.string().min(1).max(500)).max(20).default([]),
        implementation_result: z
          .object({
            status: z.string().max(200).optional(),
            commit: z.string().max(200).optional(),
            files: z.array(z.string().min(1).max(500)).max(20).default([]),
            validation: z.array(z.string().min(1).max(500)).max(20).default([]),
          })
          .optional(),
      }),
    },
    async ({ id, ...body }) =>
      requestJson(`open-api/feedback/${encodeURIComponent(id)}/analysis`, {
        method: 'PUT',
        body,
      }),
  );

  registerJsonTool(server, 'diagnostics_list_issues', {
    title: 'List MaaYuan diagnostic issues',
    description: 'Find diagnostic issue summaries. Use sort=count for the most frequent issues, then fetch an issue by ID.',
    annotations: { readOnlyHint: true },
    inputSchema: z.object({
      status: z.enum(['NEW', 'FIXED', 'IGNORED', 'ALL']).default('NEW'),
      sort: z.enum(['count', 'lastSeen', 'firstSeen']).default('lastSeen'),
      reason: z.string().min(1).optional(),
      q: z.string().max(100).optional(),
      page: z.number().int().min(1).default(1),
      page_size: z.number().int().min(1).max(100).default(20),
    }),
  }, async args => {
    const page = await requestJson(`${diagnosticPath}/issues`, { params: args });
    return {
      ...page,
      items: page.items.map(({ issue, subject_name }) => ({
        id: issue.id, subject: issue.subject, subject_name, reason: issue.reason, status: issue.status,
        event_count: issue.event_count, last_seen_at: issue.last_seen_at, latest_event_id: issue.latest_event_id,
        resource_versions: issue.resource_versions,
      })),
    };
  });

  registerJsonTool(server, 'diagnostics_get_issue', {
    title: 'Get MaaYuan diagnostic issue',
    description: 'Read one issue and its recent event IDs.',
    annotations: { readOnlyHint: true },
    inputSchema: z.object({ id: resourceId }),
  }, ({ id }) => requestJson(`${diagnosticPath}/issues/${encodeURIComponent(id)}`));

  registerJsonTool(server, 'diagnostics_get_event', {
    title: 'Get MaaYuan diagnostic event',
    description: 'Read an event summary, projected manifest and image metadata. Choose a ready, unexpired asset for a screenshot.',
    annotations: { readOnlyHint: true },
    inputSchema: z.object({ event_id: resourceId }),
  }, ({ event_id }) => requestJson(`${diagnosticPath}/events/${encodeURIComponent(event_id)}`));

  server.registerTool('diagnostics_get_image', {
    title: 'Get MaaYuan diagnostic screenshot',
    description: 'Read one screenshot listed on the specified event as an MCP image.',
    annotations: { readOnlyHint: true },
    inputSchema: z.object({ event_id: resourceId, asset_id: resourceId }),
  }, async ({ event_id, asset_id }) => {
    try {
      const path = `${diagnosticPath}/events/${encodeURIComponent(event_id)}/media/${encodeURIComponent(asset_id)}`;
      const { bytes, mimeType } = await requestAttachment(path, true);
      return imageResult(bytes, mimeType);
    } catch (error) {
      return toolError(error);
    }
  });

  return server;
}

void serveStdio(createServer);
console.error('YuanHub Feedback MCP running on stdio');
