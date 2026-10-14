import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import type { Task } from '../types';

// WAITING must never make a task invisible in Notez: list, board, form and item.

const list = vi.fn();
const stats = vi.fn();
const updateStatus = vi.fn();
const showToast = vi.fn();

vi.mock('../lib/api', () => ({
  tasksApi: {
    list: (...args: unknown[]) => list(...args),
    stats: () => stats(),
    updateStatus: (...args: unknown[]) => updateStatus(...args),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
  foldersApi: { list: () => Promise.resolve({ data: { folders: [] } }) },
  serviceAccountsApi: { listTasks: vi.fn() },
  tagsApi: { search: () => Promise.resolve({ data: { tags: [] } }), list: () => Promise.resolve({ data: { tags: [] } }) },
}));
vi.mock('./Toast', () => ({ useToast: () => ({ showToast }) }));
vi.mock('./ConfirmDialog', () => ({ useConfirm: () => vi.fn() }));
vi.mock('./TaskImportDialog', () => ({ default: () => null }));

import TaskList from './TaskList';
import KanbanBoard from './KanbanBoard';
import TaskForm from './TaskForm';
import TaskItem from './TaskItem';

function task(id: string, status: Task['status'], title = `Task ${id}`): Task {
  return {
    id, userId: 'u1', title, status, priority: 'MEDIUM',
    createdAt: '2026-10-13T00:00:00.000Z', updatedAt: '2026-10-13T00:00:00.000Z',
    tags: [], links: [],
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  stats.mockResolvedValue({
    data: { totalTasks: 3, pendingTasks: 1, inProgressTasks: 1, waitingTasks: 4, completedTasks: 0, overdueTasks: 0 },
  });
  updateStatus.mockResolvedValue({ data: {} });
});

describe('TaskList with WAITING', () => {
  it('asks for WAITING among the open statuses while "show completed" is off', async () => {
    list.mockResolvedValue({ data: { tasks: [task('w1', 'WAITING', 'Waiting on the notary')] } });

    render(<TaskList />);

    expect(await screen.findByText('Waiting on the notary')).toBeInTheDocument();
    expect(list).toHaveBeenCalledWith(expect.objectContaining({ status: ['PENDING', 'IN_PROGRESS', 'WAITING'] }));
  });

  it('shows a Waiting count in the stats strip', async () => {
    list.mockResolvedValue({ data: { tasks: [] } });

    render(<TaskList />);

    const label = await screen.findByText('Waiting');
    expect(label.previousElementSibling).toHaveTextContent('4');
  });
});

describe('KanbanBoard with WAITING', () => {
  beforeEach(() => {
    list.mockResolvedValue({
      data: { tasks: [task('p1', 'PENDING'), task('i1', 'IN_PROGRESS'), task('w1', 'WAITING')] },
    });
  });

  it('has a Waiting lane after In Progress, visible with completed hidden', async () => {
    render(<KanbanBoard />);

    const lanes = await screen.findAllByRole('region');
    const names = lanes.map((lane) => lane.getAttribute('aria-label'));
    expect(names).toEqual([
      'Pending column, 1 tasks',
      'In Progress column, 1 tasks',
      'Waiting column, 1 tasks',
    ]);
  });

  it('moves an In Progress task to Waiting with the right arrow key', async () => {
    render(<KanbanBoard />);

    const card = await screen.findByRole('button', { name: /^Task i1,/ });
    fireEvent.keyDown(card, { key: 'ArrowRight' });

    await waitFor(() => expect(updateStatus).toHaveBeenCalledWith('i1', 'WAITING'));
  });

  it('moves a Waiting task back to In Progress with the left arrow key', async () => {
    render(<KanbanBoard />);

    const card = await screen.findByRole('button', { name: /^Task w1,/ });
    fireEvent.keyDown(card, { key: 'ArrowLeft' });

    await waitFor(() => expect(updateStatus).toHaveBeenCalledWith('w1', 'IN_PROGRESS'));
  });
});

describe('TaskForm with WAITING', () => {
  it('offers Waiting as a status', () => {
    render(<TaskForm onClose={vi.fn()} onSuccess={vi.fn()} />);

    expect(screen.getByRole('option', { name: 'Waiting' })).toHaveValue('WAITING');
  });
});

describe('TaskItem with WAITING', () => {
  it('shows a distinct hourglass icon', () => {
    const { container } = render(<TaskItem task={task('w1', 'WAITING')} onStatusChange={vi.fn()} />);

    expect(container.querySelector('svg.lucide-hourglass')).not.toBeNull();
  });

  it('a click on a WAITING task moves it to IN_PROGRESS', () => {
    const onStatusChange = vi.fn();
    render(<TaskItem task={task('w1', 'WAITING')} onStatusChange={onStatusChange} />);

    fireEvent.click(screen.getByTitle('Status: WAITING'));

    expect(onStatusChange).toHaveBeenCalledWith('w1', 'IN_PROGRESS');
  });
});
