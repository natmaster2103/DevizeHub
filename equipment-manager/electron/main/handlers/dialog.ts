import { dialog } from 'electron'
import type { ApiResponse, OpenFileResult } from '@shared/ipc'

export function makeDialogHandlers() {
  return {
    async openFile(args: { filters?: Array<{ name: string; extensions: string[] }> }): Promise<ApiResponse<OpenFileResult>> {
      const result = await dialog.showOpenDialog({
        properties: ['openFile'],
        filters: args?.filters ?? [],
      })
      return {
        ok: true,
        data: { canceled: result.canceled, filePath: result.filePaths[0] ?? null },
      }
    },
  }
}
