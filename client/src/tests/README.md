# Frontend Testing Guide

## Overview

This document describes the testing infrastructure for the Veltrix React frontend.

## Test Stack

- **Vitest**: Fast Vite-native test framework
- **React Testing Library**: Component testing utilities
- **jsdom**: Browser environment simulation
- **@testing-library/user-event**: User interaction simulation
- **@testing-library/jest-dom**: Custom matchers for DOM assertions

## Running Tests

```bash
# Run all tests with coverage
pnpm test

# Run tests in watch mode (development)
pnpm test:watch

# Run tests with UI
pnpm test:ui

# Run tests once (no watch)
pnpm test:run

# Run tests in CI mode
pnpm test:ci
```

## Test Structure

```
client/src/
├── tests/
│   ├── setup.ts               # Global test setup
│   ├── test-utils.tsx         # Testing utilities
│   ├── stores/                # Store tests
│   │   └── activityStore.test.ts
│   ├── components/            # Component tests
│   └── hooks/                 # Hook tests
├── stores/                    # Store implementations
├── components/                # React components
└── hooks/                     # Custom hooks
```

## Writing Tests

### Store Tests

Test Zustand stores by directly calling store methods:

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { useActivityStore } from '../activityStore';

describe('ActivityStore', () => {
  beforeEach(() => {
    useActivityStore.setState({
      activities: [],
      unreadCount: 0,
    });
  });

  it('should add activity', () => {
    const activity = createMockActivity();
    
    useActivityStore.getState().addActivity(activity);
    
    const { activities } = useActivityStore.getState();
    expect(activities).toHaveLength(1);
  });
});
```

### Component Tests

Test React components with React Testing Library:

```typescript
import { describe, it, expect } from 'vitest';
import { renderWithProviders, screen, userEvent } from '@/tests/test-utils';
import { ActivityFeed } from './ActivityFeed';

describe('ActivityFeed', () => {
  it('should render activities', () => {
    const { } = renderWithProviders(<ActivityFeed />);
    
    expect(screen.getByText('Activity Feed')).toBeInTheDocument();
  });

  it('should filter by type', async () => {
    const user = userEvent.setup();
    renderWithProviders(<ActivityFeed />);
    
    const filterButton = screen.getByRole('button', { name: /filter/i });
    await user.click(filterButton);
    
    // Assertions
  });
});
```

### Hook Tests

Test custom hooks with `renderHook`:

```typescript
import { renderHook } from '@testing-library/react';
import { useActivities } from './hooks';

describe('useActivities', () => {
  it('should return filtered activities', () => {
    const { result } = renderHook(() => useActivities());
    
    expect(result.current.activities).toEqual([]);
  });
});
```

## Test Utilities

### renderWithProviders

Wraps components with necessary providers (Router, Query Client):

```typescript
renderWithProviders(<MyComponent />);
```

### Mock Data Factories

Create mock data for tests:

```typescript
import {
  createMockActivity,
  createMockNotification,
  createMockDeployment,
  createMockUser,
  createMockPresence,
} from '@/tests/test-utils';

const activity = createMockActivity({ type: 'deployment_started' });
const notification = createMockNotification({ priority: 'high' });
```

### Mock Socket

Create a mock socket.io client:

```typescript
import { createMockSocket } from '@/tests/test-utils';

const socket = createMockSocket();

// Trigger events in tests
socket.trigger('deployment:status', { status: 'completed' });
```

## Coverage

We aim for 70% code coverage:

- **Lines**: 70%
- **Functions**: 70%
- **Branches**: 70%
- **Statements**: 70%

Coverage reports are generated in the `coverage/` directory:

```bash
# View HTML coverage report
open coverage/index.html
```

## Best Practices

1. **Test User Behavior**: Focus on how users interact with components
2. **Avoid Implementation Details**: Test outcomes, not implementation
3. **Use Testing Library Queries**: Prefer accessible queries (getByRole, getByLabelText)
4. **Async Operations**: Use `findBy` queries and `waitFor` for async updates
5. **User Events**: Use `userEvent` instead of `fireEvent` for realistic interactions
6. **Mock Minimally**: Only mock external dependencies (APIs, sockets)
7. **Cleanup**: Use `beforeEach` to reset store state

## Testing Stores

Zustand stores can be tested directly without React:

```typescript
// Direct state access
const state = useActivityStore.getState();

// Direct state updates
useActivityStore.setState({ activities: [] });

// Call actions
state.addActivity(mockActivity);
```

## Testing Components with Stores

Components that use stores can be tested as-is:

```typescript
it('should update when store changes', () => {
  renderWithProviders(<ActivityFeed />);
  
  // Update store
  useActivityStore.getState().addActivity(mockActivity);
  
  // Component should reflect change
  expect(screen.getByText(mockActivity.message)).toBeInTheDocument();
});
```

## Debugging Tests

```bash
# Run specific test file
pnpm test activityStore.test.ts

# Run tests matching pattern
pnpm test --grep "should filter"

# Debug with UI
pnpm test:ui
```

## Common Patterns

### Testing Loading States

```typescript
it('should show loading spinner', () => {
  useActivityStore.setState({ isLoading: true });
  
  renderWithProviders(<ActivityFeed />);
  
  expect(screen.getByRole('progressbar')).toBeInTheDocument();
});
```

### Testing Error States

```typescript
it('should show error message', () => {
  renderWithProviders(<ActivityFeed />);
  
  // Trigger error
  useActivityStore.getState().setError('Failed to load');
  
  expect(screen.getByText(/failed to load/i)).toBeInTheDocument();
});
```

### Testing Async Actions

```typescript
it('should fetch activities', async () => {
  renderWithProviders(<ActivityFeed />);
  
  // Wait for async operation
  await waitFor(() => {
    expect(useActivityStore.getState().activities).toHaveLength(5);
  });
});
```

## Vitest UI

Vitest UI provides a visual interface for running tests:

```bash
pnpm test:ui
```

Features:
- Interactive test runner
- Real-time test results
- Code coverage visualization
- Test filtering and search
- File-based test organization

## CI/CD Integration

Tests run automatically in CI/CD:

```yaml
# GitHub Actions example
- name: Run frontend tests
  run: pnpm test:ci
```

## Future Enhancements

- [ ] Add E2E tests with Playwright
- [ ] Add visual regression testing
- [ ] Add accessibility testing with axe
- [ ] Add performance testing
- [ ] Integrate with Codecov
