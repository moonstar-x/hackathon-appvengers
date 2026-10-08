import { useQuery } from '@tanstack/react-query';
import type { ProgramDto } from '@club/shared';
import { request } from './client';
export function useProgram() {
  return useQuery({
    queryKey: ['program'],
    queryFn: () => request<ProgramDto>('/program'),
    staleTime: 60000,
  });
}
