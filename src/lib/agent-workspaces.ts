import { run } from '@/lib/db';

export interface DashboardWorkspaceSpec {
  id: string;
  name: string;
  slug: string;
  icon: string;
  description: string;
}

export const DASHBOARD_WORKSPACES: DashboardWorkspaceSpec[] = [
  {
    id: 'main-hub',
    name: 'Main Hub',
    slug: 'main-hub',
    icon: '🤖',
    description: 'Jarvis front door and coordination layer. This is a dashboard grouping, not the agent\'s actual OpenClaw filesystem workspace.',
  },
  {
    id: 'dev-lab',
    name: 'Dev Lab',
    slug: 'dev-lab',
    icon: '🛠️',
    description: 'Engineering specialist lane for development work. Dashboard grouping only.',
  },
  {
    id: 'social-studio',
    name: 'Social Studio',
    slug: 'social-studio',
    icon: '📣',
    description: 'Content and social media specialist lane. Dashboard grouping only.',
  },
  {
    id: 'markets-lab',
    name: 'Markets Lab',
    slug: 'markets-lab',
    icon: '📈',
    description: 'Prediction markets and trading research specialist lane. Dashboard grouping only.',
  },
];

export function classifyGatewayAgent(name: string): {
  role: string;
  workspaceId: string;
  isMaster: number;
  avatar: string;
  description: string;
} {
  const n = name.toLowerCase();

  if (n === 'main' || n.includes('jarvis') || n.includes('orchestr')) {
    return {
      role: 'front-door orchestrator',
      workspaceId: 'main-hub',
      isMaster: 1,
      avatar: '🤖',
      description: 'Primary front door and coordinator for Kenny. Delegates specialist work to dev, social, and markets.',
    };
  }

  if (n.includes('dev') || n.includes('forge') || n.includes('engineer')) {
    return {
      role: 'engineering specialist',
      workspaceId: 'dev-lab',
      isMaster: 0,
      avatar: '🛠️',
      description: 'Engineering specialist for software development, debugging, implementation, and repo work.',
    };
  }

  if (n.includes('social') || n.includes('pulse') || n.includes('content')) {
    return {
      role: 'social/content specialist',
      workspaceId: 'social-studio',
      isMaster: 0,
      avatar: '📣',
      description: 'Social media and content specialist for hooks, drafts, positioning, and content systems.',
    };
  }

  if (n.includes('market') || n.includes('ledger') || n.includes('trade') || n.includes('quant')) {
    return {
      role: 'markets research specialist',
      workspaceId: 'markets-lab',
      isMaster: 0,
      avatar: '📈',
      description: 'Markets research specialist for prediction markets, bot research, and disciplined analysis.',
    };
  }

  return {
    role: 'specialist agent',
    workspaceId: 'default',
    isMaster: 0,
    avatar: '🔗',
    description: `Imported from OpenClaw (${name})`,
  };
}

export function ensureDashboardWorkspaces(): void {
  for (const workspace of DASHBOARD_WORKSPACES) {
    run(
      `INSERT OR IGNORE INTO workspaces (id, name, slug, description, icon)
       VALUES (?, ?, ?, ?, ?)`,
      [workspace.id, workspace.name, workspace.slug, workspace.description, workspace.icon]
    );
  }

  run(
    `UPDATE workspaces
     SET name = 'Shared Ops',
         description = 'Legacy/default Mission Control grouping. Dashboard bucket only — not the same thing as an OpenClaw agent filesystem workspace.',
         icon = '🗂️',
         updated_at = datetime('now')
     WHERE id = 'default'`
  );
}
