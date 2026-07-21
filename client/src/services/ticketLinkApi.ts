import { api } from '@/lib/apiClient'
import type {
  ConfigurationTicketLinkDTO,
  CreateTicketForCanvasRequest,
  LinkExistingTicketRequest,
} from '../../../shared/types/ticketing'

// ---------------------------------------------------------------------------
// Canvas <-> ticket link transport. Nested under /configuration-canvas/:id for
// create/list (a subresource of the canvas) and top-level for delete, exactly
// matching server/src/module/ticketing/ticketing.route.ts. Uses the shared
// axios `api` client (auth + X-Customer-ID interceptors already attached —
// see @/lib/apiClient) rather than hand-rolled fetch headers, the same
// transport features/mssp/api/msspApi.ts uses.
// ---------------------------------------------------------------------------

export type { ConfigurationTicketLinkDTO, CreateTicketForCanvasRequest, LinkExistingTicketRequest }

/** Best-effort extraction of a server-provided error message from an axios rejection. */
function getApiErrorMessage(error: unknown, fallback: string): string {
  const response = (error as { response?: { data?: { error?: string } } } | undefined)?.response
  return response?.data?.error || fallback
}

export const ticketLinkApi = {
  list: async (canvasId: string): Promise<ConfigurationTicketLinkDTO[]> => {
    try {
      const res = await api.get<ConfigurationTicketLinkDTO[]>(`/configuration-canvas/${canvasId}/tickets`)
      return res.data
    } catch (err) {
      throw new Error(getApiErrorMessage(err, 'Failed to load ticket links'))
    }
  },

  createTicket: async (
    canvasId: string,
    data: CreateTicketForCanvasRequest,
  ): Promise<ConfigurationTicketLinkDTO> => {
    try {
      const res = await api.post<ConfigurationTicketLinkDTO>(
        `/configuration-canvas/${canvasId}/tickets`,
        data,
      )
      return res.data
    } catch (err) {
      throw new Error(getApiErrorMessage(err, 'Failed to create ticket'))
    }
  },

  linkExisting: async (
    canvasId: string,
    data: LinkExistingTicketRequest,
  ): Promise<ConfigurationTicketLinkDTO> => {
    try {
      const res = await api.post<ConfigurationTicketLinkDTO>(
        `/configuration-canvas/${canvasId}/ticket-link`,
        data,
      )
      return res.data
    } catch (err) {
      throw new Error(getApiErrorMessage(err, 'Failed to link ticket'))
    }
  },

  unlink: async (linkId: string): Promise<{ message: string }> => {
    try {
      const res = await api.delete<{ message: string }>(`/ticket-links/${linkId}`)
      return res.data
    } catch (err) {
      throw new Error(getApiErrorMessage(err, 'Failed to remove ticket link'))
    }
  },
}

export default ticketLinkApi
