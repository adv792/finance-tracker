import { parseBAC } from './bac'
import { parseBCR } from './bcr'
import { parseDavibank } from './davibank'

export type ParsedTransaction = {
  amount: number
  currency: string
  description: string
  date: string
}

export function parseEmail(bank: string, content: string): ParsedTransaction | null {
  switch (bank) {
    case 'BAC':
      return parseBAC(content)
    case 'BCR':
      return parseBCR(content)
    case 'DAVIBANK':
      return parseDavibank(content)
    default:
      return null
  }
}
