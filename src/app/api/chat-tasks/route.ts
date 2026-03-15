import { NextRequest, NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';
import { queryOne, run } from '@/lib/db';
import { broadcast } from '@/lib/events';
import type { Agent, Task, TaskPriority, TaskStatus } from '@/lib/types';

export const dynamic = 'force-dynamic';

const WORKSPACE_BY_DEPARTMENT: Record<string, string> = {
  main: 'main-hub',
  dev: 'dev-lab',
  engineering: 'dev-lab',
  social: 'social-studio',
  media: 'social-studio',
  markets: 'markets-lab',
  research: 'markets-lab',
};

function normalizeDepartment(value?: string | null): string {
  return String(value || 'main').trim().toLowerCase();
}

function resolveWorkspaceId(input?: string | null): string {
  const key = normalizeDepartment(input);
  return WORKSPACE_BY_DEPARTMENT[key] || 'main-hub';
}

function resolveStatus(input?: string | null): TaskStatus {
  const allowed: TaskStatus[] = ['planning','inbox','assigned','in_progress','testing','review','verification','done','pending_dispatch'];
  return allowed.includes(input as TaskStatus) ? (input as TaskStatus) : 'in_progress';
}

function resolvePriority(input?: string | null): TaskPriority {
  const allowed: TaskPriority[] = ['low','normal','high','urgent'];
  return allowed.includes(input as TaskPriority) ? (input as TaskPriority) : 'normal';
}

function getAgentByGatewayId(gatewayAgentId: string): Agent | null {
  return queryOne<Agent>('SELECT * FROM agents WHERE gateway_agent_id = ?', [gatewayAgentId]) || null;
}

function getTask(taskId: string): Task | null {
  return queryOne<Task>(
    `SELECT t.*, aa.name as assigned_agent_name, aa.avatar_emoji as assigned_agent_emoji
     FROM tasks t
     LEFT JOIN agents aa ON t.assigned_agent_id = aa.id
     WHERE t.id = ?`,
    [taskId]
  ) || null;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    if (!body.title || typeof body.title !== 'string') {
      return NextResponse.json({ error: 'title is required' }, { status: 400 });
    }

    const workspaceId = body.workspace_id || resolveWorkspaceId(body.department);
    const assignedGatewayAgentId = body.assigned_gateway_agent_id || (workspaceId === 'main-hub' ? 'main' : null);
    const createdByGatewayAgentId = body.created_by_gateway_agent_id || 'main';

    const assignedAgent = assignedGatewayAgentId ? getAgentByGatewayId(assignedGatewayAgentId) : null;
    const createdByAgent = createdByGatewayAgentId ? getAgentByGatewayId(createdByGatewayAgentId) : null;

    const id = uuidv4();
    const now = new Date().toISOString();
    const status = resolveStatus(body.status);
    const priority = resolvePriority(body.priority);

    run(
      `INSERT INTO tasks (id, title, description, status, priority, assigned_agent_id, created_by_agent_id, workspace_id, business_id, due_date, workflow_template_id, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        body.title,
        body.description || null,
        status,
        priority,
        assignedAgent?.id || null,
        createdByAgent?.id || null,
        workspaceId,
        body.business_id || 'default',
        body.due_date || null,
        null,
        now,
        now,
      ]
    );

    const eventRecord = {
      id: uuidv4(),
      type: 'task_created',
      agent_id: createdByAgent?.id || assignedAgent?.id || null,
      task_id: id,
      message: body.event_message || `Jarvis created task: ${body.title}`,
      metadata: JSON.stringify({ source: 'chat-task-intake', department: body.department || null }),
      created_at: now,
    };

    run(
      `INSERT INTO events (id, type, agent_id, task_id, message, metadata, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        eventRecord.id,
        eventRecord.type,
        eventRecord.agent_id,
        eventRecord.task_id,
        eventRecord.message,
        eventRecord.metadata,
        eventRecord.created_at,
      ]
    );

    const task = getTask(id);
    if (task) {
      broadcast({ type: 'task_created', payload: task });
    }
    broadcast({ type: 'event_created', payload: eventRecord });

    return NextResponse.json({ task }, { status: 201 });
  } catch (error) {
    console.error('Failed to create chat task:', error);
    return NextResponse.json({ error: 'Failed to create chat task' }, { status: 500 });
  }
}
