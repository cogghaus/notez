import { describe, it, expect } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useRef, useState } from 'react';
import { useFocusTrap } from './useFocusTrap';

function Harness() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useFocusTrap(ref, open);
  return (
    <div>
      <button onClick={() => setOpen(true)}>opener</button>
      {open && (
        <div ref={ref} role="dialog" aria-label="Sheet">
          <button autoFocus>first</button>
          <button onClick={() => setOpen(false)}>last</button>
        </div>
      )}
    </div>
  );
}

describe('useFocusTrap', () => {
  it('cycles Tab inside the container, forwards and backwards', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByText('opener'));
    expect(screen.getByText('first')).toHaveFocus();

    await user.tab();
    expect(screen.getByText('last')).toHaveFocus();
    await user.tab();
    expect(screen.getByText('first')).toHaveFocus();
    await user.tab({ shift: true });
    expect(screen.getByText('last')).toHaveFocus();
  });

  it('returns focus to the element that opened it', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByText('opener'));
    await user.click(screen.getByText('last'));
    await waitFor(() => expect(screen.getByText('opener')).toHaveFocus());
  });
});
