import { useQuery } from '@tanstack/react-query';
import { compareLigas } from '@club/shared';
import type { ProgramDto } from '@club/shared';
import { request } from './client';
export function useProgram() {
  return useQuery({
    queryKey: ['program'],
    queryFn: () => request<ProgramDto>('/program'),
    staleTime: 60000,
    select: (data) => ({
      ...data,
      streaks: [...data.streaks].filter((s) => s.active).sort(compareLigas),
    }),
  });
}
