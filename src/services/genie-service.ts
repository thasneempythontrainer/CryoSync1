import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { apiClient } from './api'
import type { AgentContextMessage, GenieConversation } from '@/types'

export async function getConversations(): Promise<GenieConversation[]> {
  return apiClient.get<GenieConversation[]>('/genie/conversations')
}

export async function getConversation(id: string): Promise<GenieConversation | undefined> {
  return apiClient.get<GenieConversation | undefined>(`/genie/conversations/${id}`)
}

export async function createConversation(
  title: string,
  mode: 'agent' = 'agent'
): Promise<GenieConversation> {
  return apiClient.post<GenieConversation>('/genie/conversations', { title, mode })
}

export async function saveAgentContext(
  conversationId: string,
  context: AgentContextMessage[],
  title?: string
): Promise<GenieConversation> {
  return apiClient.put<GenieConversation>(`/genie/conversations/${conversationId}/agent`, {
    context,
    title,
  })
}

export async function deleteConversation(conversationId: string): Promise<unknown> {
  return apiClient.delete(`/genie/conversations/${conversationId}`)
}

export function useConversations() {
  return useQuery({
    queryKey: ['genie-conversations'],
    queryFn: getConversations,
  })
}

export function useConversation(id: string | undefined) {
  return useQuery({
    queryKey: ['genie-conversation', id],
    queryFn: () => getConversation(id!),
    enabled: !!id,
  })
}

export function useCreateConversation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ title, mode }: { title: string; mode: 'agent' }) =>
      createConversation(title, mode),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['genie-conversations'] })
    },
  })
}

export function useDeleteConversation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (conversationId: string) => deleteConversation(conversationId),
    onMutate: async (conversationId) => {
      await queryClient.cancelQueries({ queryKey: ['genie-conversations'] })
      const previous = queryClient.getQueryData<GenieConversation[]>(['genie-conversations'])
      queryClient.setQueryData<GenieConversation[]>(['genie-conversations'], (old) =>
        old ? old.filter((c) => c.id !== conversationId) : []
      )
      queryClient.removeQueries({ queryKey: ['genie-conversation', conversationId] })
      return { previous }
    },
    onError: (_error, _conversationId, context) => {
      if (context?.previous) {
        queryClient.setQueryData(['genie-conversations'], context.previous)
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['genie-conversations'] })
    },
  })
}
