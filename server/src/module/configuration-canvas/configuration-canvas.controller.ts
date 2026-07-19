/// <reference path="../../types/fastify.d.ts" />
import { FastifyRequest, FastifyReply } from 'fastify';
import { ConfigCanvasStatus } from '@prisma/client';
import { configurationCanvasService } from './configuration-canvas.service';
import {
  CreateConfigurationCanvasType,
  UpdateConfigurationCanvasType,
  ListConfigurationCanvasQueryType,
} from './configuration-canvas.schema';
import { loggerService } from '../logger/logger.service';

// Type definitions for route params
interface IdParams {
  id: string;
}

interface StatusUpdateBody {
  status: ConfigCanvasStatus;
  comment?: string;
}

interface DuplicateBody {
  name: string;
}

interface HistoryIdParams {
  id: string;
  historyId: string;
}

interface CompareQuery {
  historyId1: string;
  historyId2: string;
}

interface LabelBody {
  label: string;
}

interface SubmitForApprovalBody {
  approverIds: string[];
  environmentTagIds?: string[];
  comment?: string;
}

interface ApprovalActionBody {
  comment?: string;
}

interface RejectBody {
  reason: string;
}

interface CommentListQuery {
  historyId?: string;
}

interface AddCommentBody {
  body: string;
  historyId?: string;
  parentId?: string;
}

interface CommentIdParams {
  id: string;
  commentId: string;
}

interface UpdateCommentBody {
  body?: string;
  resolved?: boolean;
}

export const configurationCanvasController = {
  /**
   * Get all configuration canvases for the current customer
   */
  getAll: async (
    request: FastifyRequest<{ Querystring: ListConfigurationCanvasQueryType }>,
    reply: FastifyReply
  ) => {
    try {
      if (!request.user || !request.user.customerId) {
        return reply.status(401).send({ error: 'Authentication required' });
      }

      const result = await configurationCanvasService.getAll(
        request.user.customerId,
        request.query
      );
      reply.send(result);
    } catch (error) {
      loggerService.error('Error fetching configuration canvases:', error);
      reply.status(500).send({ error: 'Error fetching configuration canvases' });
    }
  },

  /**
   * Get a single configuration canvas by ID
   */
  getById: async (
    request: FastifyRequest<{ Params: IdParams }>,
    reply: FastifyReply
  ) => {
    try {
      if (!request.user || !request.user.customerId) {
        return reply.status(401).send({ error: 'Authentication required' });
      }

      const canvas = await configurationCanvasService.getById(
        request.params.id,
        request.user.customerId
      );
      reply.send(canvas);
    } catch (error) {
      loggerService.error('Error fetching configuration canvas:', error);
      if (error instanceof Error && error.message === 'Configuration canvas not found') {
        reply.status(404).send({ error: error.message });
      } else {
        reply.status(500).send({ error: 'Error fetching configuration canvas' });
      }
    }
  },

  /**
   * Create a new configuration canvas
   */
  create: async (
    request: FastifyRequest<{ Body: CreateConfigurationCanvasType }>,
    reply: FastifyReply
  ) => {
    try {
      if (!request.user || !request.user.customerId || !request.user.id) {
        return reply.status(401).send({ error: 'Authentication required' });
      }

      const canvas = await configurationCanvasService.create(
        request.body,
        request.user.customerId,
        request.user.id
      );
      reply.status(201).send(canvas);
    } catch (error) {
      loggerService.error('Error creating configuration canvas:', error);
      reply.status(500).send({ error: 'Error creating configuration canvas' });
    }
  },

  /**
   * Update an existing configuration canvas
   */
  update: async (
    request: FastifyRequest<{ Params: IdParams; Body: UpdateConfigurationCanvasType }>,
    reply: FastifyReply
  ) => {
    try {
      if (!request.user || !request.user.customerId || !request.user.id) {
        return reply.status(401).send({ error: 'Authentication required' });
      }

      const canvas = await configurationCanvasService.update(
        request.params.id,
        request.body,
        request.user.customerId,
        request.user.id
      );
      reply.send(canvas);
    } catch (error) {
      loggerService.error('Error updating configuration canvas:', error);
      if (error instanceof Error && error.message === 'Configuration canvas not found') {
        reply.status(404).send({ error: error.message });
      } else {
        reply.status(500).send({ error: 'Error updating configuration canvas' });
      }
    }
  },

  /**
   * Delete a configuration canvas
   */
  delete: async (
    request: FastifyRequest<{ Params: IdParams }>,
    reply: FastifyReply
  ) => {
    try {
      if (!request.user || !request.user.customerId || !request.user.id) {
        return reply.status(401).send({ error: 'Authentication required' });
      }

      await configurationCanvasService.delete(
        request.params.id,
        request.user.customerId,
        request.user.id
      );
      reply.send({ message: 'Configuration canvas deleted successfully' });
    } catch (error) {
      loggerService.error('Error deleting configuration canvas:', error);
      if (error instanceof Error) {
        if (error.message === 'Configuration canvas not found') {
          reply.status(404).send({ error: error.message });
        } else if (error.message.includes('Only draft or archived')) {
          reply.status(400).send({ error: error.message });
        } else {
          reply.status(500).send({ error: 'Error deleting configuration canvas' });
        }
      } else {
        reply.status(500).send({ error: 'Error deleting configuration canvas' });
      }
    }
  },

  /**
   * Update canvas status (for approval workflow)
   */
  updateStatus: async (
    request: FastifyRequest<{ Params: IdParams; Body: StatusUpdateBody }>,
    reply: FastifyReply
  ) => {
    try {
      if (!request.user || !request.user.customerId || !request.user.id) {
        return reply.status(401).send({ error: 'Authentication required' });
      }

      const { status, comment } = request.body;
      const canvas = await configurationCanvasService.updateStatus(
        request.params.id,
        status,
        request.user.customerId,
        request.user.id,
        comment
      );
      reply.send(canvas);
    } catch (error) {
      loggerService.error('Error updating canvas status:', error);
      if (error instanceof Error) {
        if (error.message === 'Configuration canvas not found') {
          reply.status(404).send({ error: error.message });
        } else if (error.message.includes('Invalid status transition')) {
          reply.status(400).send({ error: error.message });
        } else {
          reply.status(500).send({ error: 'Error updating canvas status' });
        }
      } else {
        reply.status(500).send({ error: 'Error updating canvas status' });
      }
    }
  },

  /**
   * Get canvas history/versions
   */
  getHistory: async (
    request: FastifyRequest<{ Params: IdParams; Querystring: { limit?: number } }>,
    reply: FastifyReply
  ) => {
    try {
      if (!request.user || !request.user.customerId) {
        return reply.status(401).send({ error: 'Authentication required' });
      }

      const history = await configurationCanvasService.getHistory(
        request.params.id,
        request.user.customerId,
        request.query.limit
      );
      reply.send(history);
    } catch (error) {
      loggerService.error('Error fetching canvas history:', error);
      if (error instanceof Error && error.message === 'Configuration canvas not found') {
        reply.status(404).send({ error: error.message });
      } else {
        reply.status(500).send({ error: 'Error fetching canvas history' });
      }
    }
  },

  /**
   * Duplicate a canvas
   */
  duplicate: async (
    request: FastifyRequest<{ Params: IdParams; Body: DuplicateBody }>,
    reply: FastifyReply
  ) => {
    try {
      if (!request.user || !request.user.customerId || !request.user.id) {
        return reply.status(401).send({ error: 'Authentication required' });
      }

      const canvas = await configurationCanvasService.duplicate(
        request.params.id,
        request.body.name,
        request.user.customerId,
        request.user.id
      );
      reply.status(201).send(canvas);
    } catch (error) {
      loggerService.error('Error duplicating canvas:', error);
      if (error instanceof Error && error.message === 'Configuration canvas not found') {
        reply.status(404).send({ error: error.message });
      } else {
        reply.status(500).send({ error: 'Error duplicating canvas' });
      }
    }
  },

  /**
   * Export canvas as JSON
   */
  exportJson: async (
    request: FastifyRequest<{ Params: IdParams }>,
    reply: FastifyReply
  ) => {
    try {
      if (!request.user || !request.user.customerId) {
        return reply.status(401).send({ error: 'Authentication required' });
      }

      const exportData = await configurationCanvasService.exportAsJson(
        request.params.id,
        request.user.customerId
      );

      reply
        .header('Content-Type', 'application/json')
        .header('Content-Disposition', `attachment; filename="${exportData.name}.json"`)
        .send(exportData);
    } catch (error) {
      loggerService.error('Error exporting canvas:', error);
      if (error instanceof Error && error.message === 'Configuration canvas not found') {
        reply.status(404).send({ error: error.message });
      } else {
        reply.status(500).send({ error: 'Error exporting canvas' });
      }
    }
  },

  /**
   * Get a specific version (history entry)
   */
  getVersion: async (
    request: FastifyRequest<{ Params: HistoryIdParams }>,
    reply: FastifyReply
  ) => {
    try {
      if (!request.user || !request.user.customerId) {
        return reply.status(401).send({ error: 'Authentication required' });
      }

      const version = await configurationCanvasService.getVersion(
        request.params.id,
        request.params.historyId,
        request.user.customerId
      );
      reply.send(version);
    } catch (error) {
      loggerService.error('Error fetching version:', error);
      if (error instanceof Error) {
        if (error.message === 'Configuration canvas not found' || error.message === 'Version not found') {
          reply.status(404).send({ error: error.message });
        } else {
          reply.status(500).send({ error: 'Error fetching version' });
        }
      } else {
        reply.status(500).send({ error: 'Error fetching version' });
      }
    }
  },

  /**
   * Restore canvas to a previous version
   */
  restoreVersion: async (
    request: FastifyRequest<{ Params: HistoryIdParams }>,
    reply: FastifyReply
  ) => {
    try {
      if (!request.user || !request.user.customerId || !request.user.id) {
        return reply.status(401).send({ error: 'Authentication required' });
      }

      const canvas = await configurationCanvasService.restoreVersion(
        request.params.id,
        request.params.historyId,
        request.user.customerId,
        request.user.id
      );
      reply.send(canvas);
    } catch (error) {
      loggerService.error('Error restoring version:', error);
      if (error instanceof Error) {
        if (error.message === 'Configuration canvas not found' || error.message === 'Version not found') {
          reply.status(404).send({ error: error.message });
        } else if (error.message.includes('Only draft canvases') || error.message.includes('does not contain')) {
          reply.status(400).send({ error: error.message });
        } else {
          reply.status(500).send({ error: 'Error restoring version' });
        }
      } else {
        reply.status(500).send({ error: 'Error restoring version' });
      }
    }
  },

  /**
   * Compare two versions
   */
  compareVersions: async (
    request: FastifyRequest<{ Params: IdParams; Querystring: CompareQuery }>,
    reply: FastifyReply
  ) => {
    try {
      if (!request.user || !request.user.customerId) {
        return reply.status(401).send({ error: 'Authentication required' });
      }

      const { historyId1, historyId2 } = request.query;
      if (!historyId1 || !historyId2) {
        return reply.status(400).send({ error: 'Both historyId1 and historyId2 are required' });
      }

      const comparison = await configurationCanvasService.compareVersions(
        request.params.id,
        historyId1,
        historyId2,
        request.user.customerId
      );
      reply.send(comparison);
    } catch (error) {
      loggerService.error('Error comparing versions:', error);
      if (error instanceof Error) {
        if (error.message === 'Configuration canvas not found' || error.message.includes('not found')) {
          reply.status(404).send({ error: error.message });
        } else {
          reply.status(500).send({ error: 'Error comparing versions' });
        }
      } else {
        reply.status(500).send({ error: 'Error comparing versions' });
      }
    }
  },

  /**
   * Add a label to a version
   */
  labelVersion: async (
    request: FastifyRequest<{ Params: HistoryIdParams; Body: LabelBody }>,
    reply: FastifyReply
  ) => {
    try {
      if (!request.user || !request.user.customerId || !request.user.id) {
        return reply.status(401).send({ error: 'Authentication required' });
      }

      const version = await configurationCanvasService.labelVersion(
        request.params.id,
        request.params.historyId,
        request.body.label,
        request.user.customerId,
        request.user.id
      );
      reply.send(version);
    } catch (error) {
      loggerService.error('Error labeling version:', error);
      if (error instanceof Error && error.message === 'Configuration canvas not found') {
        reply.status(404).send({ error: error.message });
      } else {
        reply.status(500).send({ error: 'Error labeling version' });
      }
    }
  },

  /**
   * Submit canvas for approval with designated approvers
   */
  submitForApproval: async (
    request: FastifyRequest<{ Params: IdParams; Body: SubmitForApprovalBody }>,
    reply: FastifyReply
  ) => {
    try {
      if (!request.user || !request.user.customerId || !request.user.id) {
        return reply.status(401).send({ error: 'Authentication required' });
      }

      const { approverIds, environmentTagIds, comment } = request.body;
      const canvas = await configurationCanvasService.submitForApproval(
        request.params.id,
        approverIds,
        environmentTagIds || [],
        request.user.customerId,
        request.user.id,
        comment
      );
      reply.send(canvas);
    } catch (error) {
      loggerService.error('Error submitting for approval:', error);
      if (error instanceof Error) {
        if (error.message === 'Configuration canvas not found') {
          reply.status(404).send({ error: error.message });
        } else if (
          error.message.includes('Only draft') ||
          error.message.includes('At least one approver')
        ) {
          reply.status(400).send({ error: error.message });
        } else {
          reply.status(500).send({ error: 'Error submitting for approval' });
        }
      } else {
        reply.status(500).send({ error: 'Error submitting for approval' });
      }
    }
  },

  /**
   * Get approval status for a canvas
   */
  getApprovals: async (
    request: FastifyRequest<{ Params: IdParams }>,
    reply: FastifyReply
  ) => {
    try {
      if (!request.user || !request.user.customerId) {
        return reply.status(401).send({ error: 'Authentication required' });
      }

      const approvals = await configurationCanvasService.getApprovals(
        request.params.id,
        request.user.customerId
      );
      reply.send(approvals);
    } catch (error) {
      loggerService.error('Error fetching approvals:', error);
      if (error instanceof Error && error.message === 'Configuration canvas not found') {
        reply.status(404).send({ error: error.message });
      } else {
        reply.status(500).send({ error: 'Error fetching approvals' });
      }
    }
  },

  /**
   * Approve a canvas (by current user as approver)
   */
  approveCanvas: async (
    request: FastifyRequest<{ Params: IdParams; Body: ApprovalActionBody }>,
    reply: FastifyReply
  ) => {
    try {
      if (!request.user || !request.user.customerId || !request.user.id) {
        return reply.status(401).send({ error: 'Authentication required' });
      }

      const result = await configurationCanvasService.approveCanvas(
        request.params.id,
        request.user.customerId,
        request.user.id,
        request.body.comment
      );
      reply.send(result);
    } catch (error) {
      loggerService.error('Error approving canvas:', error);
      if (error instanceof Error) {
        if (error.message === 'Configuration canvas not found') {
          reply.status(404).send({ error: error.message });
        } else if (
          error.message.includes('not pending') ||
          error.message.includes('not an assigned') ||
          error.message.includes('already responded')
        ) {
          reply.status(400).send({ error: error.message });
        } else {
          reply.status(500).send({ error: 'Error approving canvas' });
        }
      } else {
        reply.status(500).send({ error: 'Error approving canvas' });
      }
    }
  },

  /**
   * Reject a canvas (by current user as approver)
   */
  rejectCanvas: async (
    request: FastifyRequest<{ Params: IdParams; Body: RejectBody }>,
    reply: FastifyReply
  ) => {
    try {
      if (!request.user || !request.user.customerId || !request.user.id) {
        return reply.status(401).send({ error: 'Authentication required' });
      }

      const result = await configurationCanvasService.rejectCanvas(
        request.params.id,
        request.user.customerId,
        request.user.id,
        request.body.reason
      );
      reply.send(result);
    } catch (error) {
      loggerService.error('Error rejecting canvas:', error);
      if (error instanceof Error) {
        if (error.message === 'Configuration canvas not found') {
          reply.status(404).send({ error: error.message });
        } else if (
          error.message.includes('not pending') ||
          error.message.includes('not an assigned') ||
          error.message.includes('already responded') ||
          error.message.includes('Rejection reason')
        ) {
          reply.status(400).send({ error: error.message });
        } else {
          reply.status(500).send({ error: 'Error rejecting canvas' });
        }
      } else {
        reply.status(500).send({ error: 'Error rejecting canvas' });
      }
    }
  },

  // ==================== REVIEW COMMENTS ====================

  /**
   * Get threaded review comments for a canvas (optionally filtered by version)
   */
  getComments: async (
    request: FastifyRequest<{ Params: IdParams; Querystring: CommentListQuery }>,
    reply: FastifyReply
  ) => {
    try {
      if (!request.user || !request.user.customerId) {
        return reply.status(401).send({ error: 'Authentication required' });
      }

      const comments = await configurationCanvasService.getComments(
        request.params.id,
        request.user.customerId,
        request.query.historyId
      );
      reply.send(comments);
    } catch (error) {
      loggerService.error('Error fetching comments:', error);
      if (error instanceof Error && error.message === 'Configuration canvas not found') {
        reply.status(404).send({ error: error.message });
      } else {
        reply.status(500).send({ error: 'Error fetching comments' });
      }
    }
  },

  /**
   * Add a review comment
   */
  addComment: async (
    request: FastifyRequest<{ Params: IdParams; Body: AddCommentBody }>,
    reply: FastifyReply
  ) => {
    try {
      if (!request.user || !request.user.customerId || !request.user.id) {
        return reply.status(401).send({ error: 'Authentication required' });
      }

      const comment = await configurationCanvasService.addComment(
        request.params.id,
        request.user.customerId,
        request.user.id,
        request.body
      );
      reply.status(201).send(comment);
    } catch (error) {
      loggerService.error('Error adding comment:', error);
      if (error instanceof Error) {
        if (error.message === 'Configuration canvas not found') {
          reply.status(404).send({ error: error.message });
        } else if (
          error.message.includes('body is required') ||
          error.message.includes('Parent comment not found') ||
          error.message.includes('Version not found')
        ) {
          reply.status(400).send({ error: error.message });
        } else {
          reply.status(500).send({ error: 'Error adding comment' });
        }
      } else {
        reply.status(500).send({ error: 'Error adding comment' });
      }
    }
  },

  /**
   * Update a review comment (body and/or resolved)
   */
  updateComment: async (
    request: FastifyRequest<{ Params: CommentIdParams; Body: UpdateCommentBody }>,
    reply: FastifyReply
  ) => {
    try {
      if (!request.user || !request.user.customerId || !request.user.id) {
        return reply.status(401).send({ error: 'Authentication required' });
      }

      const comment = await configurationCanvasService.updateComment(
        request.params.id,
        request.params.commentId,
        request.user.customerId,
        request.user.id,
        request.body
      );
      reply.send(comment);
    } catch (error) {
      loggerService.error('Error updating comment:', error);
      if (error instanceof Error) {
        if (
          error.message === 'Configuration canvas not found' ||
          error.message === 'Comment not found'
        ) {
          reply.status(404).send({ error: error.message });
        } else if (error.message.includes('not allowed')) {
          reply.status(403).send({ error: error.message });
        } else if (error.message.includes('body is required')) {
          reply.status(400).send({ error: error.message });
        } else {
          reply.status(500).send({ error: 'Error updating comment' });
        }
      } else {
        reply.status(500).send({ error: 'Error updating comment' });
      }
    }
  },

  /**
   * Delete a review comment
   */
  deleteComment: async (
    request: FastifyRequest<{ Params: CommentIdParams }>,
    reply: FastifyReply
  ) => {
    try {
      if (!request.user || !request.user.customerId || !request.user.id) {
        return reply.status(401).send({ error: 'Authentication required' });
      }

      await configurationCanvasService.deleteComment(
        request.params.id,
        request.params.commentId,
        request.user.customerId,
        request.user.id
      );
      reply.send({ message: 'Comment deleted successfully' });
    } catch (error) {
      loggerService.error('Error deleting comment:', error);
      if (error instanceof Error) {
        if (
          error.message === 'Configuration canvas not found' ||
          error.message === 'Comment not found'
        ) {
          reply.status(404).send({ error: error.message });
        } else if (error.message.includes('not allowed')) {
          reply.status(403).send({ error: error.message });
        } else {
          reply.status(500).send({ error: 'Error deleting comment' });
        }
      } else {
        reply.status(500).send({ error: 'Error deleting comment' });
      }
    }
  },
};
