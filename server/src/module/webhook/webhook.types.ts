/**
 * Webhook notification types for external service integration
 */

/**
 * Base webhook notification interface
 * This represents the standardized format for all webhook notifications
 * received by the system, regardless of their source
 */
export interface WebhookNotification {
  /**
   * Source of the notification (e.g., 'github', 'jenkins', 'aws')
   */
  source: string;
  
  /**
   * Type of event that triggered the notification
   * (e.g., 'push', 'deployment', 'build', 'status')
   */
  event: string;
  
  /**
   * Timestamp when the event occurred
   * ISO 8601 format
   */
  timestamp: string;
  
  /**
   * The main payload containing event-specific information
   */
  payload: WebhookPayload;
  
  /**
   * Optional metadata for additional information
   */
  metadata?: Record<string, any>;
}

/**
 * Webhook payload interface
 * Contains the actual notification data
 */
export interface WebhookPayload {
  /**
   * Repository information (name, url, etc.)
   */
  repository?: string | {
    full_name?: string;
    name?: string;
    id?: string;
    html_url?: string;
  };
  
  /**
   * Branch reference (e.g., 'main', 'develop')
   */
  branch?: string;
  
  /**
   * Commit hash
   */
  commit?: string;
  
  /**
   * Event status (e.g., 'success', 'failure', 'pending')
   */
  status?: string;
  
  /**
   * ID of the infrastructure this notification is related to
   */
  infrastructureId?: string;
  
  /**
   * URL to the build/deployment
   */
  buildUrl?: string;
  
  /**
   * Deployment ID if applicable
   */
  deploymentId?: string;
  
  /**
   * Any additional fields specific to the source
   */
  [key: string]: any;
}

/**
 * GitHub-specific webhook event types
 */
export enum GitHubEventType {
  PUSH = 'push',
  PULL_REQUEST = 'pull_request',
  DEPLOYMENT = 'deployment',
  DEPLOYMENT_STATUS = 'deployment_status',
  WORKFLOW_RUN = 'workflow_run'
}

/**
 * Response format for webhook processing
 */
export interface WebhookResponse {
  /**
   * Whether the webhook was processed successfully
   */
  success: boolean;
  
  /**
   * Response message
   */
  message: string;
  
  /**
   * Optional ID for tracking the webhook notification
   */
  id?: string;
}
