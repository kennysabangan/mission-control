import { NextRequest, NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';
import { queryOne, run } from '@/lib/db';
import { broadcast } from '@/lib/events';
import type { Task, TaskPriority, TaskStatus } from '@/lib/types';

export const dynamic = 'force-dynamic';

function resolveStatus(input?: string | null): TaskStatus | null {
  const allowed: TaskStatus[] = ['pending_dispatch','planning','inbox','assigned','in_progress','testing','review','verification','done'];
  return allowed.includes(input as TaskStatus) ? (input as TaskStatus) : null;
}

function resolvePriority(input?: string | null): TaskPriority | null {
  const allowed: TaskPriority[] = ['low','normal','high','urgent'];
  return allowed.includes(input as TaskPriority) ? (input as TaskPriority) : null;
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

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await request.json();
    const existing = getTask(id);
    if (!existing) return NextResponse.json({ error: 'Task not found' }, { status: 404 });

    const updates: string[] = [];
    const values: unknown[] = [];

    if (typeof body.title === 'string' && body.title.trim()) {
      updates.push('title = ?');
      values.push(body.title.trim());
    }
    if (body.description !== undefined) {
      updates.push('description = ?');
      values.push(body.description || null);
    }
    const status = resolveStatus(body.status);
    if (status) {
      updates.push('status = ?');
      values.push(status);
    }
    const priority = resolvePriority(body.priority);
    if (priority) {
      updates.push('priority = ?');
      values.push(priority);
    }
    if (typeof body.status_reason === 'string' || body.status_reason === null) {
      updates.push('status_reason = ?');
      values.push(body.status_reason || null);
    }

    if (updates.length === 0) {
      return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 });
    }

    updates.push('updated_at = ?');
    values.push(new Date().toISOString());
    values.push(id);

    run(`UPDATE tasks SET ${updates.join(', ')} WHERE id = ?`, values);

    const updated = getTask(id);

    if (body.event_message) {
      const eventRecord = {
        id: uuidv4(),
        type: updated?.status === 'done' ? 'task_completed' : 'task_status_changed',
        agent_id: null,
        task_id: id,
        message: body.event_message,
        metadata: JSON.stringify({ source: 'chat-task-update' }),
        created_at: new Date().toISOString(),
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

      broadcast({ type: 'event_created', payload: eventRecord });
    }

    if (updated) {
      broadcast({ type: 'task_updated', payload: updated });
    }

    return NextResponse.json({ task: updated });
  } catch (error) {
    console.error('Failed to update chat task:', error);
    return NextResponse.json({ error: 'Failed to update chat task' }, { status: 500 });
  }
}
