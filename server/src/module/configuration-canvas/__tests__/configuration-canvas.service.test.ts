import { configurationCanvasService } from '../configuration-canvas.service';
import prisma from '../../../db';

// ---------------------------------------------------------------------------
// Mocks — the service talks only to prisma + two collaborators (logger and the
// central configuration-history service). We mock all three.
// ---------------------------------------------------------------------------

jest.mock('../../../db', () => {
  const model = () => ({
    findFirst: jest.fn(),
    findMany: jest.fn(),
    create: jest.fn(),
    createMany: jest.fn(),
    update: jest.fn(),
    updateMany: jest.fn(),
    delete: jest.fn(),
    deleteMany: jest.fn(),
  });
  const db: any = {
    configurationCanvas: model(),
    configurationCanvasComment: model(),
    configurationCanvasApproval: model(),
    configurationCanvasApprovalEnvironment: model(),
    configurationCanvasTag: model(),
    configurationCanvasHistory: model(),
    environmentPolicy: model(),
    configurationCanvasSection: model(),
    configurationCanvasField: model(),
  };
  // Callback-style transaction: run the callback against the same mock ("tx").
  db.$transaction = jest.fn((cb: any) => cb(db));
  return { __esModule: true, default: db };
});

jest.mock('../../../module/logger/logger.service', () => ({
  loggerService: { info: jest.fn(), error: jest.fn(), warn: jest.fn() },
}));

jest.mock('../../../module/configuration-history/configuration-history.service', () => ({
  configurationHistoryService: {
    createHistoryEntry: jest.fn().mockResolvedValue({}),
    updateHistoryEntry: jest.fn().mockResolvedValue({}),
    findPendingApprovalForUser: jest.fn().mockResolvedValue(null),
  },
}));

const db = prisma as unknown as {
  configurationCanvas: Record<string, jest.Mock>;
  configurationCanvasComment: Record<string, jest.Mock>;
  configurationCanvasApproval: Record<string, jest.Mock>;
  configurationCanvasApprovalEnvironment: Record<string, jest.Mock>;
  configurationCanvasTag: Record<string, jest.Mock>;
  configurationCanvasHistory: Record<string, jest.Mock>;
  environmentPolicy: Record<string, jest.Mock>;
  configurationCanvasSection: Record<string, jest.Mock>;
  configurationCanvasField: Record<string, jest.Mock>;
  $transaction: jest.Mock;
};

const CUSTOMER = 'cust-1';
const CANVAS = 'canvas-1';

beforeEach(() => {
  jest.clearAllMocks();
});

// ===========================================================================
// Review comments — CRUD + threading + ownership scoping
// ===========================================================================

describe('configurationCanvasService — review comments', () => {
  it('addComment creates a comment scoped to the owning canvas', async () => {
    db.configurationCanvas.findFirst.mockResolvedValue({ id: CANVAS });
    db.configurationCanvasComment.create.mockResolvedValue({ id: 'c1', body: 'hi' });

    const result = await configurationCanvasService.addComment(CANVAS, CUSTOMER, 'user-1', {
      body: '  hi  ',
    });

    expect(db.configurationCanvas.findFirst).toHaveBeenCalledWith({
      where: { id: CANVAS, customerId: CUSTOMER },
      select: { id: true },
    });
    expect(db.configurationCanvasComment.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          canvasId: CANVAS,
          userId: 'user-1',
          body: 'hi', // trimmed
          parentId: null,
          historyId: null,
        }),
      }),
    );
    expect(result).toEqual({ id: 'c1', body: 'hi' });
  });

  it('addComment rejects an empty body', async () => {
    db.configurationCanvas.findFirst.mockResolvedValue({ id: CANVAS });
    await expect(
      configurationCanvasService.addComment(CANVAS, CUSTOMER, 'user-1', { body: '   ' }),
    ).rejects.toThrow('Comment body is required');
    expect(db.configurationCanvasComment.create).not.toHaveBeenCalled();
  });

  it('addComment inherits the parent version anchor for a reply', async () => {
    db.configurationCanvas.findFirst.mockResolvedValue({ id: CANVAS });
    db.configurationCanvasComment.findFirst.mockResolvedValue({ id: 'c1', historyId: 'hist-9' });
    db.configurationCanvasHistory.findFirst.mockResolvedValue({ id: 'hist-9' });
    db.configurationCanvasComment.create.mockResolvedValue({ id: 'c2' });

    await configurationCanvasService.addComment(CANVAS, CUSTOMER, 'user-2', {
      body: 'reply',
      parentId: 'c1',
    });

    expect(db.configurationCanvasComment.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ parentId: 'c1', historyId: 'hist-9' }),
      }),
    );
  });

  it('getComments returns a threaded tree (roots with nested replies)', async () => {
    db.configurationCanvas.findFirst.mockResolvedValue({ id: CANVAS });
    db.configurationCanvasComment.findMany.mockResolvedValue([
      { id: 'c1', parentId: null, historyId: null, body: 'root' },
      { id: 'c2', parentId: 'c1', historyId: null, body: 'reply-1' },
      { id: 'c3', parentId: 'c2', historyId: null, body: 'reply-2' },
      { id: 'c4', parentId: null, historyId: null, body: 'root-2' },
    ]);

    const roots = await configurationCanvasService.getComments(CANVAS, CUSTOMER);

    expect(roots).toHaveLength(2);
    const first = roots.find((r) => r.id === 'c1')!;
    expect(first.replies).toHaveLength(1);
    expect(first.replies[0].id).toBe('c2');
    expect(first.replies[0].replies[0].id).toBe('c3'); // nested reply
  });

  it('getComments filters threads by version anchor when historyId is given', async () => {
    db.configurationCanvas.findFirst.mockResolvedValue({ id: CANVAS });
    db.configurationCanvasComment.findMany.mockResolvedValue([
      { id: 'c1', parentId: null, historyId: 'hist-1', body: 'v1' },
      { id: 'c2', parentId: null, historyId: 'hist-2', body: 'v2' },
    ]);

    const roots = await configurationCanvasService.getComments(CANVAS, CUSTOMER, 'hist-2');
    expect(roots).toHaveLength(1);
    expect(roots[0].id).toBe('c2');
  });

  it('updateComment toggles resolved for the author', async () => {
    db.configurationCanvas.findFirst.mockResolvedValue({ id: CANVAS });
    db.configurationCanvasComment.findFirst.mockResolvedValue({ id: 'c1', userId: 'author' });
    db.configurationCanvasComment.update.mockResolvedValue({ id: 'c1', resolved: true });

    await configurationCanvasService.updateComment(CANVAS, 'c1', CUSTOMER, 'author', {
      resolved: true,
    });

    expect(db.configurationCanvasComment.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'c1' }, data: { resolved: true } }),
    );
  });

  it('updateComment lets an assigned approver resolve someone else’s comment', async () => {
    db.configurationCanvas.findFirst.mockResolvedValue({ id: CANVAS });
    db.configurationCanvasComment.findFirst.mockResolvedValue({ id: 'c1', userId: 'author' });
    db.configurationCanvasApproval.findFirst.mockResolvedValue({ id: 'ap-1' }); // reviewer
    db.configurationCanvasComment.update.mockResolvedValue({ id: 'c1', resolved: true });

    await configurationCanvasService.updateComment(CANVAS, 'c1', CUSTOMER, 'reviewer', {
      resolved: true,
    });

    expect(db.configurationCanvasComment.update).toHaveBeenCalled();
  });

  it('updateComment forbids a non-author, non-approver', async () => {
    db.configurationCanvas.findFirst.mockResolvedValue({ id: CANVAS });
    db.configurationCanvasComment.findFirst.mockResolvedValue({ id: 'c1', userId: 'author' });
    db.configurationCanvasApproval.findFirst.mockResolvedValue(null); // not a reviewer

    await expect(
      configurationCanvasService.updateComment(CANVAS, 'c1', CUSTOMER, 'stranger', {
        resolved: true,
      }),
    ).rejects.toThrow('not allowed');
    expect(db.configurationCanvasComment.update).not.toHaveBeenCalled();
  });

  it('deleteComment removes the author’s own comment', async () => {
    db.configurationCanvas.findFirst.mockResolvedValue({ id: CANVAS });
    db.configurationCanvasComment.findFirst.mockResolvedValue({ id: 'c1', userId: 'author' });
    db.configurationCanvasComment.delete.mockResolvedValue({ id: 'c1' });

    const ok = await configurationCanvasService.deleteComment(CANVAS, 'c1', CUSTOMER, 'author');
    expect(ok).toBe(true);
    expect(db.configurationCanvasComment.delete).toHaveBeenCalledWith({ where: { id: 'c1' } });
  });

  it('scopes every comment op by customer ownership (unknown canvas -> not found)', async () => {
    db.configurationCanvas.findFirst.mockResolvedValue(null);

    await expect(
      configurationCanvasService.getComments(CANVAS, 'other-customer'),
    ).rejects.toThrow('Configuration canvas not found');
    await expect(
      configurationCanvasService.addComment(CANVAS, 'other-customer', 'u', { body: 'x' }),
    ).rejects.toThrow('Configuration canvas not found');
    await expect(
      configurationCanvasService.deleteComment(CANVAS, 'c1', 'other-customer', 'u'),
    ).rejects.toThrow('Configuration canvas not found');
    expect(db.configurationCanvasComment.findMany).not.toHaveBeenCalled();
  });
});

// ===========================================================================
// Request changes — rejectCanvas -> CHANGES_REQUESTED, other rows survive
// ===========================================================================

describe('configurationCanvasService.rejectCanvas', () => {
  beforeEach(() => {
    // getApprovals() runs at the end and re-reads the canvas + approvals.
    db.configurationCanvas.findFirst.mockResolvedValue({
      id: CANVAS,
      customerId: CUSTOMER,
      status: 'PENDING_APPROVAL',
      version: 3,
      name: 'Prod indexes',
      toolType: 'edr',
    });
  });

  it('moves the canvas to CHANGES_REQUESTED without wiping other approvers’ rows', async () => {
    // The rejecting reviewer's own PENDING row.
    db.configurationCanvasApproval.findFirst.mockResolvedValue({ id: 'ap-2', status: 'PENDING' });
    // getApprovals() list after rejection — the other two rows still exist.
    db.configurationCanvasApproval.findMany.mockResolvedValue([
      { id: 'ap-1', status: 'APPROVED', approver: {}, environments: [] },
      { id: 'ap-2', status: 'REJECTED', approver: {}, environments: [] },
      { id: 'ap-3', status: 'PENDING', approver: {}, environments: [] },
    ]);

    const result = await configurationCanvasService.rejectCanvas(
      CANVAS,
      CUSTOMER,
      'reviewer-2',
      'Please fix retention',
    );

    // Only the rejecting reviewer's row was updated; NO deleteMany wiped the others.
    expect(db.configurationCanvasApproval.deleteMany).not.toHaveBeenCalled();
    expect(db.configurationCanvasApproval.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'ap-2' },
        data: expect.objectContaining({ status: 'REJECTED' }),
      }),
    );
    // Canvas moved to CHANGES_REQUESTED (not DRAFT).
    expect(db.configurationCanvas.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'CHANGES_REQUESTED' }),
      }),
    );
    // The surviving rows are reflected in the returned summary.
    expect(result.summary).toEqual({ total: 3, pending: 1, approved: 1, rejected: 1 });
  });

  it('requires a rejection reason', async () => {
    await expect(
      configurationCanvasService.rejectCanvas(CANVAS, CUSTOMER, 'reviewer-2', '   '),
    ).rejects.toThrow('Rejection reason is required');
  });
});

// ===========================================================================
// Policy-aware approval — minApprovers / requiredApproverRoles enforcement
// ===========================================================================

describe('configurationCanvasService.approveCanvas — policy enforcement', () => {
  const baseCanvas = {
    id: CANVAS,
    customerId: CUSTOMER,
    status: 'PENDING_APPROVAL',
    version: 1,
    name: 'Prod indexes',
    toolType: 'edr',
  };

  function primeApproval() {
    db.configurationCanvas.findFirst.mockResolvedValue(baseCanvas);
    db.configurationCanvasApproval.findFirst.mockResolvedValue({ id: 'ap-1', status: 'PENDING' });
    // resolveEnvironmentPolicy: canvas has a target environment tag.
    db.configurationCanvasApprovalEnvironment.findFirst.mockResolvedValue({ tagId: 'env-prod' });
  }

  it('does NOT finalize when approvedCount is below minApprovers', async () => {
    primeApproval();
    db.environmentPolicy.findFirst.mockResolvedValue({
      minApprovers: 2,
      requiredApproverRoles: [],
    });
    // Two assigned reviewers; only this one has approved.
    db.configurationCanvasApproval.findMany.mockResolvedValue([
      { id: 'ap-1', status: 'APPROVED', approver: { role: { name: 'sre' } }, environments: [] },
      { id: 'ap-2', status: 'PENDING', approver: { role: { name: 'sec' } }, environments: [] },
    ]);

    await configurationCanvasService.approveCanvas(CANVAS, CUSTOMER, 'reviewer-1');

    // Threshold (2) not met -> canvas is NOT promoted to APPROVED.
    expect(db.configurationCanvas.update).not.toHaveBeenCalled();
  });

  it('finalizes to APPROVED once minApprovers is satisfied', async () => {
    primeApproval();
    db.environmentPolicy.findFirst.mockResolvedValue({
      minApprovers: 1,
      requiredApproverRoles: [],
    });
    db.configurationCanvasApproval.findMany.mockResolvedValue([
      { id: 'ap-1', status: 'APPROVED', approver: { role: { name: 'sre' } }, environments: [] },
    ]);

    await configurationCanvasService.approveCanvas(CANVAS, CUSTOMER, 'reviewer-1');

    expect(db.configurationCanvas.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'APPROVED' }) }),
    );
  });

  it('blocks finalization until required approver roles are covered', async () => {
    primeApproval();
    db.environmentPolicy.findFirst.mockResolvedValue({
      minApprovers: 1,
      requiredApproverRoles: ['security-lead'],
    });
    // Approver's role does not cover the required 'security-lead'.
    db.configurationCanvasApproval.findMany.mockResolvedValue([
      { id: 'ap-1', status: 'APPROVED', approver: { role: { name: 'sre' } }, environments: [] },
    ]);

    await configurationCanvasService.approveCanvas(CANVAS, CUSTOMER, 'reviewer-1');
    expect(db.configurationCanvas.update).not.toHaveBeenCalled();
  });

  it('falls back to unanimous approval when no policy exists', async () => {
    primeApproval();
    db.configurationCanvasApprovalEnvironment.findFirst.mockResolvedValue(null);
    db.configurationCanvasTag.findFirst.mockResolvedValue(null); // no env -> null policy
    db.environmentPolicy.findFirst.mockResolvedValue(null);
    // All reviewers approved -> unanimous default finalizes.
    db.configurationCanvasApproval.findMany.mockResolvedValue([
      { id: 'ap-1', status: 'APPROVED', approver: { role: null }, environments: [] },
    ]);

    await configurationCanvasService.approveCanvas(CANVAS, CUSTOMER, 'reviewer-1');
    expect(db.configurationCanvas.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'APPROVED' }) }),
    );
  });
});

// ===========================================================================
// Re-approval on edit — a content edit to an already-approved (or deployed /
// failed) canvas must invalidate the prior sign-off: reset to DRAFT + clear
// approvals, so the approval bar is re-met before it can deploy again.
// ===========================================================================

describe('configurationCanvasService.update — re-approval on edit', () => {
  const CONTENT_EDIT = { sections: [{ name: 'Section', order: 0, fields: [] }] } as never;

  beforeEach(() => {
    db.configurationCanvasHistory.create.mockResolvedValue({ id: 'hist-1' });
  });

  it('resets an APPROVED canvas to DRAFT and clears approvals when its content is edited', async () => {
    db.configurationCanvas.findFirst.mockResolvedValue({
      id: CANVAS, version: 3, status: 'APPROVED', name: 'n', description: 'd', sections: [], tags: [],
    });

    await configurationCanvasService.update(CANVAS, CONTENT_EDIT, CUSTOMER, 'user-1');

    expect(db.configurationCanvas.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: CANVAS }, data: expect.objectContaining({ status: 'DRAFT' }) }),
    );
    expect(db.configurationCanvasApproval.deleteMany).toHaveBeenCalledWith({ where: { canvasId: CANVAS } });
  });

  it('does NOT change status or wipe approvals when a DRAFT canvas is edited', async () => {
    db.configurationCanvas.findFirst.mockResolvedValue({
      id: CANVAS, version: 1, status: 'DRAFT', name: 'n', description: 'd', sections: [], tags: [],
    });

    await configurationCanvasService.update(CANVAS, CONTENT_EDIT, CUSTOMER, 'user-1');

    // DRAFT is already editable — status stays undefined (unchanged) and no wipe.
    const updateArg = db.configurationCanvas.update.mock.calls[0][0];
    expect(updateArg.data.status).toBeUndefined();
    expect(db.configurationCanvasApproval.deleteMany).not.toHaveBeenCalled();
  });

  it('preserves the section id across the delete+recreate so a rename hits the same target', async () => {
    // A stable item id is what lets deploy handlers key rename-safe external-id
    // maps on the section — regenerating it on every edit created duplicates.
    const STABLE_ID = 'item-stable-123';
    db.configurationCanvas.findFirst.mockResolvedValue({
      id: CANVAS, version: 1, status: 'DRAFT', name: 'n', description: 'd', sections: [], tags: [],
    });
    db.configurationCanvasSection.create.mockResolvedValue({ id: STABLE_ID });

    const RENAME_EDIT = {
      sections: [{ id: STABLE_ID, name: 'Renamed Group', order: 0, fields: [] }],
    } as never;

    await configurationCanvasService.update(CANVAS, RENAME_EDIT, CUSTOMER, 'user-1');

    expect(db.configurationCanvasSection.deleteMany).toHaveBeenCalledWith({ where: { canvasId: CANVAS } });
    expect(db.configurationCanvasSection.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ id: STABLE_ID, name: 'Renamed Group' }),
      }),
    );
  });
});
